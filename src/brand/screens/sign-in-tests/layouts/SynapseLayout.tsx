import { motion } from 'motion/react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useBrand } from '../../../store'
import type { FormField } from '../../testing/sign-in-form'
import { sentenceTokens, tokenValue, type SentenceContext } from '../../testing/sign-in-sentence'
import { activeNode, type EngineRun } from '../engine-run'
import { factMarks, type FactKey } from '../journey'
import { groupNamesOf } from '../sign-in-card'
import { stepMs } from '../use-engine-run'
import { RunStage, type StageView } from './RunStage'
import { StageThemeToggle, useStageTheme } from './synapse-theme'
import { OutcomeCard } from './synapse-card'
import { PeekCard, peekLines } from './synapse-peek'
import { Banner } from './synapse-banner'
import { canFlip, nextFlips, useWhatIf, type Flips } from './synapse-whatif'
import { CheckCell, FactCell, OutputCell, PersonCell, PolicyCell, RuleCell } from './synapse-cells'
import { CK, HEAD_Y, IN, OUT, POL, RU, WORLD_W, fibresOf, geometryOf } from './synapse-geometry'
import { beatOf, checkTone, waveOf, chosenOf, frameOpen, isLanded, outTone, polKind, polTone, readRows, routeOf, routeTone, ruleTone, type InputId, type PolKind, type Tone } from './synapse-model'
import { Ripple, Synapse, firstName, type Pulse } from './synapse-parts'
import type { RunLayoutProps } from './types'
import './synapse.css'

/* -----------------------------------------------------------------------------
   The run as SYNAPSE (run-layout.ts `synapse`): the decision, firing.

   The engine drawn as a network, left to right in layers, on a dimmed stage:
   the sign-in's facts are the input neurons; the application's policies are
   fed by the person, in the order they are read, and the first that covers
   fires; it opens onto its rules, whose checks are fed by the facts they
   read; a rule fires only when all its checks do, a failed check sends an
   inhibitory pulse; the first rule to fire drives its decision neuron, which
   blooms into the answer. Light runs the synapses as the engine works them
   (blue), and they settle to what they carried: green the route that
   decided, red what inhibited, grey what was never needed.

   Once landed, a fact can be flipped (Network, Device, Risk): the engine runs
   again on that variation, here only, and the network re-fires with it —
   "What if", and the way back to the sign-in.

   Drawn from `s` alone (engine-run.ts, journey.ts); a step's light lasts its
   `stepMs`. Geometry is the plan's (synapse-geometry.ts): nothing measured
   off a moving box.
   -------------------------------------------------------------------------- */

interface Input {
  id: InputId
  field: FormField
  label: string
  value: string
  unset: boolean
  /** On a what-if, what the sign-in itself states. */
  was: string | null
}

interface Ui {
  run: number
  see: boolean
  peek: { id: string; pin: boolean } | null
  flips: Flips
  /** Counts the flips (and the way back) this run: each one re-fires the network. */
  fired: number
}
const fresh = (run: number): Ui => ({ run, see: false, peek: null, flips: {}, fired: 0 })

const TOKEN_INPUT: Record<string, { id: InputId; field: FormField; label: string }> = {
  from: { id: 'from', field: 'address', label: 'Network' },
  device: { id: 'device', field: 'device', label: 'Device' },
  when: { id: 'when', field: 'when', label: 'Time' },
  risk: { id: 'risk', field: 'risk', label: 'Risk' },
}

const reasonWords = (reason: string): string => (/ is not in (it|this policy)$/.test(reason) ? 'Not in it' : reason)

/** The card's height before it is drawn (it is measured once it is). */
function cardEstimate(plan: EngineRun, finding: boolean): number {
  const o = plan.outcome
  let h = 32 + 18 + 30 + 56 + 36
  if (o.status === 'decided' && o.decision !== 'deny') h += 26
  if (o.decision === 'deny') h += 44
  if (o.status === 'depends') h += o.view.outcomes.length * 22 + 10
  if (finding) h += 48
  return h
}

export default function SynapseLayout(props: RunLayoutProps) {
  const { plan: livePlan, s: liveS, running, animate, reduced, jumped, runKey, form, rows, asGroup } = props
  const { users, groups, apps, zones } = useBrand()
  const stage = useRef<StageView | null>(null)
  const [theme] = useStageTheme()
  const worldRef = useRef<HTMLDivElement | null>(null)

  // --- Per run: What they see, the peek, the facts flipped ---
  const [ui, setUi] = useState<Ui>(() => fresh(runKey))
  const now: Ui = ui.run === runKey ? ui : fresh(runKey)
  if (ui.run !== runKey) setUi(now)
  const setSee = useCallback((see: boolean) => setUi((u) => ({ ...(u.run === runKey ? u : fresh(runKey)), see })), [runKey])

  /* A what-if, once the run has landed: the engine run on the sign-in with a fact flipped, here only. */
  const liveLanded = isLanded(livePlan, liveS)
  const flipOpen = liveLanded && !livePlan.empty && !props.policies && props.columns.length <= 1
  const wi = useWhatIf(form, now.flips, flipOpen)
  const plan: EngineRun = wi?.plan ?? livePlan
  const s = wi ? plan.steps.length - 1 : liveS
  const shownForm = wi?.form ?? form
  const screens = wi?.screens ?? props.screens
  const landed = isLanded(plan, s)
  const play = animate && !jumped && !reduced && !wi
  /* The network re-firing on a flip (or on the way back): a wave through its layers, once each. */
  const waving = !play && !reduced && now.fired > 0
  const waveAt = `${runKey}:${now.fired}`
  const step = plan.steps[s]
  const dur = stepMs(plan, s)
  const route = routeTone(plan)

  // --- Who, to what, on what ---
  const person = users.find((u) => u.id === form.personId) ?? null
  const app = apps.find((a) => a.id === form.appId) ?? null
  const personName = asGroup ? `A member of ${asGroup}` : (person?.name ?? plan.conflicts?.personName ?? 'Someone')
  const first = asGroup ?? firstName(personName)
  const groupLine = asGroup ? (person ? `Tested as ${person.name}` : '') : person ? groupNamesOf(person, groups).join(' · ') : ''
  const inputs = useMemo<Input[]>(() => {
    const ctx: SentenceContext = { people: users, apps, zones, rows }
    const list: Input[] = [{ id: 'person', field: 'person', label: 'Person', value: '', unset: false, was: null }]
    sentenceTokens(rows).forEach((t) => {
      const m = TOKEN_INPUT[t]
      if (!m) return
      const v = tokenValue(t, shownForm, ctx)
      const was = shownForm === form ? null : tokenValue(t, form, ctx)
      const value = v.unset ? 'Not stated' : v.text
      const wasValue = was ? (was.unset ? 'Not stated' : was.text) : null
      list.push({ ...m, value, unset: v.unset, was: wasValue !== null && wasValue !== value ? wasValue : null })
    })
    return list
  }, [rows, form, shownForm, users, apps, zones])
  const inputIds = useMemo(() => inputs.map((i) => i.id), [inputs])

  // --- The network's shape ---
  const [cardH, setCardH] = useState<number | null>(null)
  const onCardH = useCallback((h: number) => setCardH((v) => (v !== null && Math.abs(v - h) < 2 ? v : h)), [])
  const geo = useMemo(() => geometryOf(plan, inputIds, cardH ?? cardEstimate(plan, false)), [plan, inputIds, cardH])
  const chosen = chosenOf(plan)
  /* A what-if keeps the sign-in's world height, so the network does not jump as its card changes. */
  const liveH = useRef(0)
  useEffect(() => {
    if (!wi && landed) liveH.current = geo.worldH
  }, [wi, landed, geo.worldH])
  const worldH = wi ? Math.max(geo.worldH, liveH.current) : geo.worldH
  const fibres = useMemo(() => fibresOf(plan, geo, chosen), [plan, geo, chosen])
  const routeSet = useMemo(() => routeOf(plan), [plan])
  const beat = useMemo(() => (play ? beatOf(plan, s) : { pulses: new Map<string, Tone>(), fires: new Map<string, Tone>() }), [play, plan, s])
  /* The re-fire on a flip: the whole firing again, layer by layer, in what each synapse carried. */
  const wave = useMemo(() => (waving && landed ? waveOf(plan) : null), [waving, landed, plan])

  // --- The camera: the words' size while it plays, following the engine; the whole network once it lands ---
  const fittedFor = useRef<number | null>(null)
  useLayoutEffect(() => {
    const v = stage.current
    if (!v) return
    if (running && animate && !landed) {
      fittedFor.current = null
      v.fit({ min: 1, max: 1, jump: true })
    } else {
      fittedFor.current = runKey
      v.fit({ max: 1, jump: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- on a new run, and as the layout mounts
  }, [runKey])
  useEffect(() => {
    if (!running || landed) return
    const id = activeNode(plan, s)
    const el = id === 'outcome' ? worldRef.current?.querySelector('.rl-synapse__cell.is-output') : id ? worldRef.current?.querySelector(`[data-node="${id}"]`) : null
    if (el) stage.current?.follow(el, { lazy: true, jump: reduced })
  }, [s, running, landed, plan, reduced])
  useEffect(() => {
    if (!landed || fittedFor.current === runKey) return
    fittedFor.current = runKey
    stage.current?.fit({ max: 1, jump: reduced || jumped || !animate })
  }, [landed, runKey, reduced, jumped, animate])
  /* The card is measured once drawn: if that changes the world, fit again — until What they see is opened (then it is the admin's view). */
  const sawSee = useRef<number | null>(null)
  if (now.see) sawSee.current = runKey
  const lastH = useRef<{ run: number; h: number } | null>(null)
  useEffect(() => {
    if (!landed || sawSee.current === runKey) return
    const was = lastH.current
    if (was && was.run === runKey && Math.abs(was.h - worldH) < 2) return
    lastH.current = { run: runKey, h: worldH }
    /* The landing's own fit covers the first height of a run. */
    if (was && was.run === runKey) stage.current?.fit({ max: 1, jump: true })
  }, [landed, worldH, runKey])

  /* A flip (or the way back) can grow the network: the whole of it back in view as it re-fires. */
  useEffect(() => {
    if (now.fired === 0) return
    /* Once the new card has been measured (a frame or two). */
    const t = window.setTimeout(() => stage.current?.fit({ max: 1, jump: reduced }), 80)
    return () => window.clearTimeout(t)
  }, [runKey, now.fired, reduced])

  // --- The neurons' tones at s ---
  const alsoIds = useMemo(() => new Set((plan.conflicts?.policies ?? []).map((p) => p.policyId)), [plan.conflicts])
  const conflictIds = useMemo(
    () => new Set((plan.conflicts?.findings ?? []).filter((f) => f.tone === 'conflict' && (f.kind === 'policy-conflict' || f.kind === 'same-group-policy')).map((f) => f.target.policyId)),
    [plan.conflicts],
  )
  const polKinds: PolKind[] = plan.policies.map((p) => polKind(p, s, landed, alsoIds))
  const open = frameOpen(plan, s)
  const tones = new Map<string, Tone>()
  plan.policies.forEach((p, i) => tones.set(`pol:${i}`, polTone(polKinds[i], landed, route, conflictIds.has(p.policyId))))
  plan.rules.forEach((r, ri) => {
    tones.set(`ru:${ri}`, open ? ruleTone(r, s, landed, route, plan.landing === ri) : 'hidden')
    readRows(r).forEach((_, k) => tones.set(`ck:${ri}:${k}`, open ? checkTone(r, k, s) : 'hidden'))
  })
  geo.outputs.forEach((id) => tones.set(`out:${id}`, outTone(id, plan, s, landed)))
  const reading = step && (step.kind === 'check' || step.kind === 'checked') && step.rule !== undefined && step.check !== undefined ? geo.checks.find((c) => c.r === step.rule && c.k === step.check)?.input : undefined
  inputs.forEach((x) => tones.set(`in:${x.id}`, !landed && reading === x.id ? 'work' : x.id === 'person' && polKinds.some((k) => k === 'scan' || k === 'found') ? 'work' : 'idle'))

  /* A synapse's tone: where its far end stands, and whether it carried the decision. */
  const fibreTone = (id: string, to: string): Tone => {
    const t = tones.get(to) ?? 'hidden'
    if (id.startsWith('p:')) return t === 'idle' ? 'idle' : t === 'off' ? 'off' : t
    if (id === 'open') return !open ? 'hidden' : step?.kind === 'expand' ? 'work' : landed ? route : 'ok'
    if (id === 'stem') return landed ? route : 'hidden'
    if (id.startsWith('o:')) {
      if (!open) return 'hidden'
      const ri = Number(id.slice(2))
      if (!landed) return step?.kind === 'deciding' && plan.landing === ri ? 'work' : 'idle'
      if (routeSet.has(id)) return route
      return plan.rules[ri]?.state === 'unknown' ? 'warn' : 'faint'
    }
    // c: and r: — a check's in and out.
    const [, rs, ks] = id.split(':')
    const ck = tones.get(`ck:${rs}:${ks}`) ?? 'hidden'
    if (ck === 'hidden') return 'hidden'
    if (ck === 'work') return id.startsWith('c:') ? 'work' : 'idle'
    if (landed && routeSet.has(id)) return ck === 'ok' ? route : ck
    if (ck === 'ok') return landed ? 'soft' : 'ok'
    return ck
  }

  const node = (id: string) => geo.nodes.get(id)
  const flip = (id: InputId) =>
    setUi((u) => {
      const base = u.run === runKey ? u : fresh(runKey)
      return { ...base, peek: null, see: false, flips: nextFlips(base.flips, id, form), fired: base.fired + 1 }
    })
  const back = () => setUi((u) => ({ ...u, flips: {}, peek: null, fired: u.fired + 1 }))
  const flipWords = (): string[] =>
    inputs
      .filter((x) => x.was !== null)
      .map((x) => (x.id === 'from' ? `from ${x.value}` : x.id === 'device' ? (x.unset ? 'device not stated' : `on ${x.value}`) : x.id === 'risk' ? `risk ${x.value}` : `${x.label} ${x.value}`))
  const flipNames = inputs.filter((x) => flipOpen && canFlip(x.id)).map((x) => x.label)
  const hint = landed && flipNames.length > 0 ? `What if? Press ${flipNames.length > 1 ? `${flipNames.slice(0, -1).join(', ')} or ${flipNames[flipNames.length - 1]}` : flipNames[0]} to try another value` : ''
  const onPeek = useCallback(
    (id: string, pin: boolean) =>
      setUi((u) => {
        const base = u.run === runKey ? u : fresh(runKey)
        if (pin && base.peek?.id === id && base.peek.pin) return { ...base, peek: null }
        if (!pin && base.peek?.pin) return base
        return { ...base, peek: { id, pin } }
      }),
    [runKey],
  )
  const onUnpeek = useCallback((id: string) => setUi((u) => (u.peek && u.peek.id === id && !u.peek.pin ? { ...u, peek: null } : u)), [])
  const closePeek = useCallback(() => setUi((u) => ({ ...u, peek: null })), [])
  useEffect(() => {
    if (!now.peek?.pin) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closePeek()
    const onDown = (e: PointerEvent) => {
      const el = e.target as Element | null
      if (!el?.closest('.rl-synapse__peek, [data-sy]')) closePeek()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [now.peek?.pin, closePeek])
  /* A neuron's place, by its press id. */
  /* A press id's neuron id. */
  const nidOf = (id: string): string => {
    if (id === 'sign-in') return 'in:person'
    if (id.startsWith('fact:')) return `in:${id.slice(5)}`
    if (id.startsWith('policy:')) return `pol:${plan.policies.findIndex((p) => p.node === id)}`
    if (id.startsWith('rule:')) return `ru:${plan.rules.findIndex((r) => r.node === id)}`
    if (id.startsWith('ck:')) {
      const [, rid, k] = id.split(':')
      return `ck:${plan.rules.findIndex((r) => r.id === rid)}:${k}`
    }
    return id
  }
  const boxOfSy = (id: string) => node(nidOf(id))
  /* The neuron looked at: its own synapses stay lit, the rest step back — what feeds it, and what it feeds. */
  const traced = useMemo(() => {
    if (!now.peek) return null
    const nid = nidOf(now.peek.id)
    const set = new Set(fibres.filter((f) => f.from === nid || f.to === nid || (f.to === 'frame' && nid.startsWith('ru:'))).map((f) => f.id))
    return set.size > 0 ? set : null
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nidOf reads the plan
  }, [now.peek, fibres, plan])
  const PEEK_W = 272
  const peekAt = (id: string) => {
    const b = boxOfSy(id)
    if (!b) return null
    /* Never over what it explains: a check's, a rule's and an outcome's open to the left (a check's rule stands to its right). */
    const left = id.startsWith('rule:') || id.startsWith('out:') || id.startsWith('ck:') || b.x + b.w + 14 + PEEK_W > WORLD_W + 24
    return { x: left ? b.x - 14 - PEEK_W : b.x + b.w + 14, y: Math.max(0, Math.min(b.y - 4, geo.worldH - 160)) }
  }

  // --- Words ---
  const deciderVia = plan.conflicts?.policies[0]?.deciderVia
  const via = deciderVia?.matches ? deciderVia : undefined
  const polWords = (p: (typeof plan.policies)[number], k: PolKind): string => {
    switch (k) {
      case 'scan':
        return 'Checking'
      case 'found':
        return `Covers ${first}`
      case 'covers':
        return p.isGlobalDefault ? 'Applies · none above covers' : `Covers ${first}${via?.say ? ` · ${via.say}` : ''}`
      case 'passed':
        return reasonWords(p.reason) || 'Not used'
      case 'also':
        return `Also covers ${first} · not used`
      case 'quiet':
        return p.reason && !/^not reached$/i.test(p.reason) ? p.reason : 'Not reached'
      default:
        return ''
    }
  }
  const marks = landed ? factMarks(plan) : {}
  const MARK_KEYS: Record<InputId, FactKey[]> = { person: [], from: ['network', 'place'], device: ['device'], when: ['time'], risk: ['risk'] }
  const markOf = (id: InputId) => MARK_KEYS[id].map((k) => marks[k]).find(Boolean) ?? null
  /* The neurons that carried the decision, ringed in its tone once it lands. */
  const routeCells = new Set<string>()
  if (landed) {
    const d = plan.policies.findIndex((p) => p.decides)
    if (d >= 0) routeCells.add(`pol:${d}`)
    if (plan.landing !== null) {
      routeCells.add(`ru:${plan.landing}`)
      geo.checks.filter((c) => c.r === plan.landing).forEach((c) => routeCells.add(`ck:${c.r}:${c.k}`))
    }
    routeCells.add(`out:${chosen}`)
  }
  /* On a re-fire each neuron takes its new tone as the wave reaches it (a CSS transition's delay). */
  const settleOf = (id: string): number | undefined => {
    if (!wave) return undefined
    const f = wave.fires.get(id)
    if (f) return f.delay
    if (id.startsWith('in:')) return 0
    if (id.startsWith('pol:')) return (wave.pulses.get(`p:${id.slice(4)}`)?.delay ?? 0) + 0.3
    if (id.startsWith('out:')) return Math.max(0, wave.end - 0.3)
    return wave.end * 0.5
  }
  const cell = (id: string, delay = 0) => {
    const tone = tones.get(id) ?? 'hidden'
    return { box: node(id)!, tone, play, delay, settle: settleOf(id), lit: routeCells.has(id) && tone === route, onPeek, onUnpeek }
  }
  const cells = (
    <>
      {inputs.map((x, i) =>
        !node(`in:${x.id}`) ? null : x.id === 'person' ? (
          <PersonCell key="person" {...cell('in:person')} name={personName} isGroup={asGroup !== null} groupLine={groupLine} appId={app?.id ?? null} appName={plan.appName} onPress={props.onPressPerson} />
        ) : (
          <FactCell key={x.id} {...cell(`in:${x.id}`, 0.08 * i)} id={x.id} label={x.label} value={x.value} was={x.was} mark={markOf(x.id)} canFlip={flipOpen && canFlip(x.id)} onFlip={() => flip(x.id)} />
        ),
      )}
      {plan.policies.map((p, i) => (
        <PolicyCell key={p.policyId} {...cell(`pol:${i}`, 0.1 + i * 0.05)} p={p} kind={polKinds[i]} words={polWords(p, polKinds[i])} conflict={conflictIds.has(p.policyId)} />
      ))}
      {open &&
        plan.rules.map((r, ri) => (
          <RuleCell key={r.id} {...cell(`ru:${ri}`, 0.05 * ri)} r={r} s={s} />
        ))}
      {open &&
        geo.checks.map((c) => {
          const r = plan.rules[c.r]
          const row = r?.checks[c.k]
          return r && row ? <CheckCell key={`${c.r}:${c.k}`} {...cell(`ck:${c.r}:${c.k}`)} c={row} r={r} k={c.k} ri={c.r} /> : null
        })}
      {geo.outputs.map((id, i) => (
        <OutputCell key={id} {...cell(`out:${id}`, 0.06 * i)} id={id} chosen={landed && id === chosen} />
      ))}
      {landed && (
        <OutcomeCard
          plan={plan}
          screens={screens}
          appId={form.appId}
          box={geo.card}
          from={{ x: (node(`out:${chosen}`)?.x ?? geo.card.x) + OUT.w / 2 - geo.card.x, y: (node(`out:${chosen}`)?.y ?? geo.card.y) + 21 - geo.card.y }}
          tone={route}
          see={now.see}
          onSee={setSee}
          onHeight={onCardH}
          onOpenRule={props.onOpenRule}
          onOpenPolicy={props.onOpenPolicy}
          expected={props.expected}
          weaker={props.weaker}
          changed={props.changed}
          whatIf={wi !== null}
          play={play || waving}
          delay={wave && !play ? wave.end : 0}
          key={`${wi?.key ?? 'live'}:${now.fired}`}
        />
      )}
    </>
  )

  return (
    <div className={`rl-synapse-root${landed ? ` is-landed is-route-${route}` : ' is-running'}${traced ? ' is-tracing' : ''}`} data-stage={theme}>
      <motion.div className="rl-synapse__stage" aria-hidden initial={play ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ duration: play ? 0.28 : 0 }} />
      <RunStage ref={stage} reduced={reduced} className="rl-synapse" dock={<StageThemeToggle />} pad={{ top: 64, left: 48, right: 48, bottom: 76 }} label={`Sign-in run: ${plan.appName}`}>
        <div key={runKey} ref={worldRef} className="rl-synapse__world" style={{ width: WORLD_W, height: worldH } as CSSProperties}>
          <div className="rl-synapse__strip" style={{ width: WORLD_W }}>
            <Banner base={livePlan} whatIf={wi?.plan ?? null} changes={flipWords()} hint={hint} play={!reduced} onBack={back} />
          </div>
          <Heads plan={plan} />
          <Frame plan={plan} open={open} landed={landed} box={geo.frame} play={play} />
          <svg className="rl-synapse__wires" width={WORLD_W} height={worldH} aria-hidden>
            {fibres.map((f) => {
              const tone = fibreTone(f.id, f.to)
              const p = beat.pulses.get(f.id)
              const w = wave?.pulses.get(f.id)
              const pulse: Pulse | null = p ? { tone: p, ms: dur * 0.9, key: `${runKey}:${s}` } : w ? { tone: w.tone, ms: 520, delay: w.delay, key: waveAt } : null
              const settle = wave ? (w ? w.delay + 0.4 : wave.end * 0.5) : undefined
              return <Synapse key={f.id} d={f.d} tone={tone} route={landed && routeSet.has(f.id)} traced={traced?.has(f.id) ?? false} play={play} fire={play || !!w} pulse={pulse} settle={settle} />
            })}
            {[...beat.fires.entries()].map(([id, tone]) => {
              const b = node(id)
              return b ? <Ripple key={`${id}:${s}`} k={`${id}:${s}`} x={b.x} y={b.y + b.h / 2} tone={tone} /> : null
            })}
            {wave &&
              [...wave.fires.entries()].map(([id, f]) => {
                const b = node(id)
                return b ? <Ripple key={`${id}:${waveAt}`} k={`${id}:${waveAt}`} x={b.x} y={b.y + b.h / 2} tone={f.tone} delay={f.delay} /> : null
              })}
          </svg>
          {cells}
          {now.peek &&
            (() => {
              const at = peekAt(now.peek.id)
              if (!at) return null
              const lines = peekLines(now.peek.id, { plan, first, personName, groupLine, landed, s, inputs, canFlip: (id) => flipOpen && canFlip(id) })
              return <PeekCard key={now.peek.id} lines={lines} x={at.x} y={at.y} w={PEEK_W} pinned={now.peek.pin} play={!reduced} onClose={closePeek} />
            })()}
        </div>
      </RunStage>
    </div>
  )
}

/* The deciding policy, opened: the glass its rules and their checks stand in. */
function Frame({ plan, open, landed, box, play }: { plan: EngineRun; open: boolean; landed: boolean; box: { x: number; y: number; w: number; h: number }; play: boolean }) {
  const d = plan.policies.find((p) => p.decides)
  return (
    <div className={`rl-synapse__frame${open ? ' is-open' : ''}`} style={{ left: box.x, top: box.y, width: box.w, height: box.h }} data-node={open ? 'which' : undefined}>
      <p className="rl-synapse__framehead">
        {open && d ? (
          <motion.span initial={play ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ duration: play ? 0.3 : 0 }}>
            <span className="rl-synapse__kicker">Rules in</span> <span className="rl-synapse__num">{d.order}</span> <strong title={d.name}>{d.name}</strong>
          </motion.span>
        ) : (
          <span className="rl-synapse__kicker">{landed ? 'No policy decides' : 'The rules open once a policy covers'}</span>
        )}
      </p>
    </div>
  )
}

/* The layers' headings, over each column: what each layer does, so no legend is needed. */
function Heads({ plan }: { plan: EngineRun }) {
  return (
    <>
      <p className="rl-synapse__head" style={{ left: IN.x, top: HEAD_Y, width: IN.w }}>Sign-in</p>
      <p className="rl-synapse__head" style={{ left: POL.x, top: HEAD_Y, width: POL.w }} title={`Policies on ${plan.appName}, the first that covers applies`}>
        Policies · first that covers
      </p>
      <p className="rl-synapse__head" style={{ left: CK.x, top: HEAD_Y, width: CK.w }}>Checks</p>
      <p className="rl-synapse__head" style={{ left: RU.x, top: HEAD_Y, width: RU.w }}>Rules · first match wins</p>
      <p className="rl-synapse__head" style={{ left: OUT.x, top: HEAD_Y, width: OUT.w }}>Outcome</p>
    </>
  )
}
