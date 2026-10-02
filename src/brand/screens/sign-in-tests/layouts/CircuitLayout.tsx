import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'

import { DECISION_WORDS } from '../../../decision-words'
import { useBrand } from '../../../store'
import { sentenceTokens, tokenValue, type SentenceContext } from '../../testing/sign-in-sentence'
import { activeNode, policyOpen, type EngineRun } from '../engine-run'
import { isQuiet, policyWhy } from '../journey'
import { groupNamesOf } from '../sign-in-card'
import { stepMs } from '../use-engine-run'
import { Banner, StageDock } from './circuit-banner'
import { CircuitBoard } from './circuit-board'
import { geometryOf } from './circuit-geometry'
import { factOf, flowOf, isLanded, pathToneOf } from './circuit-model'
import { NoteCtx, type NoteState } from './circuit-note-ctx'
import type { PolicyNote } from './circuit-rules'
import type { Fact } from './circuit-source'
import { canFlip, nextFlips, useWhatIf, type Flips, type InputId } from './circuit-whatif'
import { RunStage, type StageView } from './RunStage'
import { useStageTheme } from './circuit-theme'
import type { RunLayoutProps } from './types'
import './circuit.css'

/* -----------------------------------------------------------------------------
   The run as a CIRCUIT (run-layout.ts `circuit`): the decision as a lit
   circuit board.

   The sign-in is the power source: the person and the application, the facts
   the rules read as its terminals. The policies are a selector: one coverage
   switch per policy, tapped off a bus in the order the engine asks them; the
   current enters the first whose switch closes for this person. Its rules are
   circuits wired one after another: each a lane of switches in SERIES, one
   per check (every one must close for the current to pass), the last lane
   "Nothing else matched", always closed. The current reaches the outcome — an
   LED panel — through the first circuit that closes: first match wins.

   As the run plays, the current runs the traces (blue: the engine at work)
   step by step, each step's motion as long as the step (`stepMs`): down the
   bus, into each switch as it is tested, through the one that covers; along
   rule 1 until a switch stays open (a red spark, the circuit dies), down to
   rule 2, its switches closing one by one, into the LED, which lights in the
   answer's colour. Landed, the live path holds the answer's one tone and
   every dead circuit dims.

   Poke it: hover or press a switch for the check — the sign-in's fact, what
   the rule needs, part by part; press a policy or a rule for why it stands
   as it does; press a fact terminal to flip it (a what-if: the engine runs
   again here only, the switches re-settle, the current re-routes) and Back
   to the sign-in. Drawn from `s` alone; geometry is the plan's
   (circuit-geometry.ts), never measured off a moving box.
   -------------------------------------------------------------------------- */

interface Ui {
  run: number
  note: { id: string; pin: boolean } | null
  flips: Flips
  hot: InputId | null
  /** The current sent round the live path again (the dock, a what-if): its key. */
  pulse: string | null
}
const fresh = (run: number): Ui => ({ run, note: null, flips: {}, hot: null, pulse: null })

const TOKEN_FACT: Record<string, { id: InputId; label: string }> = {
  from: { id: 'from', label: 'Network' },
  device: { id: 'device', label: 'Device' },
  when: { id: 'when', label: 'Time' },
  risk: { id: 'risk', label: 'Risk' },
}

const firstName = (name: string): string => name.trim().split(/\s+/)[0] || name

const answerOf = (plan: EngineRun): string => {
  const o = plan.outcome
  if (o.status === 'decided' && o.decision) return DECISION_WORDS[o.decision]
  return o.status === 'depends' ? 'Depends' : 'No decision'
}

export default function CircuitLayout(props: RunLayoutProps) {
  const { plan: livePlan, s: liveS, running, animate, reduced, jumped, runKey, form, rows, asGroup } = props
  const [theme, setTheme] = useStageTheme()
  const { users, groups, apps, zones } = useBrand()
  const stage = useRef<StageView | null>(null)
  const worldRef = useRef<HTMLDivElement | null>(null)

  // --- Per run: the note open, the facts flipped, the fact pointed at ---
  const [ui, setUi] = useState<Ui>(() => fresh(runKey))
  const now: Ui = ui.run === runKey ? ui : fresh(runKey)
  if (ui.run !== runKey) setUi(now)
  const patch = useCallback((f: (u: Ui) => Partial<Ui>) => setUi((u) => {
    const base = u.run === runKey ? u : fresh(runKey)
    return { ...base, ...f(base) }
  }), [runKey])

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
  const tone = pathToneOf(plan)

  // --- Who, to what, on what ---
  const person = users.find((u) => u.id === form.personId) ?? null
  const app = apps.find((a) => a.id === form.appId) ?? null
  const name = asGroup ? `A member of ${asGroup}` : (person?.name ?? plan.conflicts?.personName ?? 'Choose a person')
  const first = asGroup ?? firstName(person?.name ?? plan.conflicts?.personName ?? 'them')
  const groupLine = asGroup ? (person ? `Tested as ${person.name}` : '') : person ? groupNamesOf(person, groups).join(', ') : ''
  const facts = useMemo<Fact[]>(() => {
    const ctx: SentenceContext = { people: users, apps, zones, rows }
    const out: Fact[] = []
    sentenceTokens(rows).forEach((t) => {
      const m = TOKEN_FACT[t]
      if (!m) return
      const v = tokenValue(t, shownForm, ctx)
      const value = v.unset ? 'Not stated' : v.text
      const w = shownForm === form ? null : tokenValue(t, form, ctx)
      const was = w ? (w.unset ? 'Not stated' : w.text) : null
      out.push({ ...m, value, unset: v.unset, was: was !== null && was !== value ? was : null, flippable: flipOpen && canFlip(m.id) })
    })
    return out
  }, [rows, form, shownForm, users, apps, zones, flipOpen])

  // --- The board: its shape, where the current goes ---
  const geo = useMemo(() => geometryOf(plan, facts.length), [plan, facts.length])
  const flow = useMemo(() => flowOf(plan), [plan])
  const decider = plan.policies.find((p) => p.decides)
  const rulesShown = !!decider && !!geo.rules && (landed || policyOpen(decider, s))
  const ms = stepMs(plan, s)

  /* What each policy's note says about the run around it. */
  const notes = useMemo(() => {
    const said = (plan.conflicts?.findings ?? []).filter((f) => !isQuiet(f))
    const dv = plan.conflicts?.policies[0]?.deciderVia
    const covers = new Map((plan.conflicts?.policies ?? []).map((p) => [p.policyId, p]))
    const map = new Map<string, PolicyNote>()
    plan.policies.forEach((p) => {
      const own = said.filter((f) => f.target.policyId === p.policyId && f.target.ruleId === null)
      const pc = covers.get(p.policyId)
      const would = pc
        ? pc.status === 'decided' && pc.decision
          ? `On its own: ${DECISION_WORDS[pc.decision]}${pc.ruleNumber !== null ? ` · rule ${pc.ruleNumber}` : ''}`
          : pc.possible.length > 0
            ? `On its own: ${pc.possible.map((d) => DECISION_WORDS[d]).join(' or ')}`
            : ''
        : ''
      map.set(p.policyId, {
        appName: plan.appName,
        deciderName: plan.decider?.name ?? '',
        deciderVia: dv?.matches ? dv.say : '',
        ruleWhy: policyWhy(plan),
        cover: pc ? { via: pc.via, notUsed: pc.notUsed, fix: pc.fix, would } : undefined,
        findings: own.map((f) => f.line || f.title),
        fix: own.find((f) => f.fix)?.fix,
      })
    })
    return map
  }, [plan])
  const conflictIds = useMemo(
    () => new Set((plan.conflicts?.findings ?? []).filter((f) => f.tone === 'conflict' && (f.kind === 'policy-conflict' || f.kind === 'same-group-policy')).map((f) => f.target.policyId)),
    [plan.conflicts],
  )
  const alsoIds = useMemo(() => new Set((plan.conflicts?.policies ?? []).map((p) => p.policyId)), [plan.conflicts])
  const clashes = useMemo(() => new Map((plan.conflicts?.rules ?? []).map((r) => [r.ruleId, r])), [plan.conflicts])

  /* The fact the engine reads now: the person's groups while a policy is asked, a check's fact while it is read. */
  const step = plan.steps[s]
  const reading: InputId | null = landed || !running ? null : step?.kind === 'scan' || step?.kind === 'found' ? 'person' : null
  const readingCheck = !landed && running && (step?.kind === 'check' || step?.kind === 'checked') && step.rule !== undefined && step.check !== undefined ? plan.rules[step.rule]?.checks[step.check] : undefined
  const readingNow: InputId | null = readingCheck ? factOf(readingCheck) : reading

  // --- Notes: one open at a time; a hover peeks, a press pins ---
  const noteFrom = useRef<HTMLElement | null>(null)
  const noteState = useMemo<NoteState>(
    () => ({
      open: now.note,
      peek: (id) => patch((u) => (u.note?.pin ? {} : { note: id ? { id, pin: false } : null })),
      pin: (id, from) => {
        noteFrom.current = from
        patch((u) => ({ note: u.note?.id === id && u.note.pin ? null : { id, pin: true } }))
      },
    }),
    [now.note, patch],
  )
  const outNote = now.note && (now.note.id === 'see' || now.note.id === 'findings') ? now.note.id : null
  useEffect(() => {
    if (!now.note?.pin) return
    const id = window.requestAnimationFrame(() => {
      const el = now.note?.id === 'see' ? worldRef.current?.querySelector('.rl-circuit__see') : worldRef.current?.querySelector('.rl-circuit__note')
      stage.current?.follow(el, { lazy: true, jump: reduced })
    })
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      patch(() => ({ note: null }))
      noteFrom.current?.focus()
    }
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null
      if (t?.closest('.rl-circuit__note, .rl-circuit__see, [aria-expanded="true"]')) return
      patch(() => ({ note: null }))
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      window.cancelAnimationFrame(id)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [now.note, patch, reduced])

  // --- Flips: a what-if, and the way back ---
  const flip = (id: InputId) => patch((u) => ({ note: null, flips: nextFlips(u.flips, id, form), pulse: reduced ? null : `flip:${Date.now()}` }))
  const back = () => patch(() => ({ flips: {}, note: null, pulse: reduced ? null : `back:${Date.now()}` }))
  const sendPulse = () => patch(() => ({ pulse: reduced ? null : `pulse:${Date.now()}` }))
  const pulseMs = 1500
  useEffect(() => {
    if (!now.pulse) return
    const t = window.setTimeout(() => patch((u) => (u.pulse === now.pulse ? { pulse: null } : {})), pulseMs + 400)
    return () => window.clearTimeout(t)
  }, [now.pulse, patch])
  const changes = facts
    .filter((f) => f.was !== null)
    .map((f) => (f.id === 'from' ? `from ${f.value}` : f.id === 'device' ? (f.unset ? 'device not stated' : `on ${f.value}`) : f.id === 'risk' ? `risk ${f.value}` : `${f.label} ${f.value}`))
  const whereOf = (p: EngineRun): string => {
    const r = p.landing !== null ? p.rules[p.landing] : undefined
    if (!r || p.outcome.status !== 'decided') return ''
    const rule = r.index === null ? 'Nothing else matched' : `Rule ${r.index + 1}`
    return p.decider && p.decider.id !== livePlan.decider?.id ? `${p.decider.name} · ${rule}` : rule
  }
  const flipNames = facts.filter((f) => f.flippable).map((f) => f.label)

  // --- The camera: the words' size while it plays, following the engine; the whole board once it lands ---
  const fittedFor = useRef<number | null>(null)
  useLayoutEffect(() => {
    const v = stage.current
    if (!v) return
    if (running && animate && !landed) {
      fittedFor.current = null
      v.fit({ min: 1, max: 1, jump: true })
      v.follow(worldRef.current?.querySelector('[data-node="sign-in"]'), { lazy: true, jump: true })
    } else {
      fittedFor.current = runKey
      v.fit({ max: 1, jump: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- on a new run, and as the layout mounts
  }, [runKey])
  useEffect(() => {
    if (!running || landed) return
    const id = activeNode(plan, s)
    const el = id ? worldRef.current?.querySelector(`[data-node="${id}"]`) : null
    if (el) stage.current?.follow(el, { lazy: true, jump: reduced })
  }, [s, running, landed, plan, reduced])
  useEffect(() => {
    if (!landed || fittedFor.current === runKey) return
    fittedFor.current = runKey
    stage.current?.fit({ max: 1, jump: reduced || jumped || !animate })
  }, [landed, runKey, reduced, jumped, animate])
  /* A what-if can change the board's shape (another policy, other rules): fitted again. */
  const shapeKey = `${geo.W}x${Math.round(geo.H)}`
  const lastShape = useRef(shapeKey)
  useEffect(() => {
    if (lastShape.current === shapeKey) return
    lastShape.current = shapeKey
    if (landed) stage.current?.fit({ max: 1, jump: reduced })
  }, [shapeKey, landed, reduced])
  /* The canvas changed size (the panel opened or shut, the window): a landed run is fitted again. */
  const settledNow = useRef(!running)
  settledNow.current = !running
  useEffect(() => {
    const ground = worldRef.current?.closest('.rstage')
    if (!ground || typeof ResizeObserver === 'undefined') return
    let last = ''
    let frame = 0
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect
      if (!r) return
      const size = `${Math.round(r.width)}x${Math.round(r.height)}`
      if (size === last) return
      const firstSize = last === ''
      last = size
      if (firstSize || !settledNow.current) return
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => stage.current?.fit({ max: 1, jump: true }))
    })
    ro.observe(ground)
    return () => {
      ro.disconnect()
      window.cancelAnimationFrame(frame)
    }
  }, [])

  if (plan.empty) {
    return (
      <div className="rl-circuit-root" data-stage={theme}>
        <div className="rl-circuit__ground" aria-hidden />
        <RunStage reduced={reduced} className="rl-circuit" dock={<StageDock theme={theme} onTheme={setTheme} landed={false} onPulse={sendPulse} />}>
          <div data-card style={{ width: 720 }}>
            {props.answer}
          </div>
        </RunStage>
      </div>
    )
  }

  return (
    <div className={`rl-circuit-root${landed ? ` is-landed is-tone-${tone}` : ' is-running'}`} data-stage={theme}>
      <div className="rl-circuit__ground" aria-hidden />
      <RunStage ref={stage} reduced={reduced} className="rl-circuit" dock={<StageDock theme={theme} onTheme={setTheme} landed={landed} onPulse={sendPulse} />} label={`Sign-in run: ${plan.appName}`}>
        <NoteCtx.Provider value={noteState}>
          <div key={runKey} ref={worldRef} className="rl-circuit__world" style={{ width: geo.W, height: geo.H } as CSSProperties}>
            <Banner
              landed={landed}
              whatIf={wi !== null}
              changes={changes}
              answer={answerOf(plan)}
              where={whereOf(plan)}
              tone={tone}
              base={answerOf(livePlan)}
              same={wi !== null && answerOf(plan) === answerOf(livePlan) && whereOf(plan) === whereOf(livePlan)}
              hint={flipNames.length > 0 ? `Press ${flipNames.length > 1 ? `${flipNames.slice(0, -1).join(', ')} or ${flipNames[flipNames.length - 1]}` : flipNames[0]} on the sign-in to try another value` : ''}
              play={!reduced}
              onBack={back}
            />
            <CircuitBoard
              props={props}
              plan={plan}
              s={s}
              geo={geo}
              flow={flow}
              tone={tone}
              landed={landed}
              play={play}
              soft={!reduced && (wi !== null || now.pulse !== null)}
              ms={ms}
              rulesShown={rulesShown}
              name={name}
              first={first}
              groupLine={groupLine}
              appId={app?.id ?? form.appId}
              appName={app?.name ?? plan.appName}
              facts={facts}
              reading={readingNow}
              hot={now.hot}
              onHot={(id) => patch(() => ({ hot: id }))}
              onFlip={flip}
              notes={notes}
              conflictIds={conflictIds}
              alsoIds={alsoIds}
              clashes={clashes}
              screens={screens}
              outNote={outNote}
              onOutNote={noteState.pin}
              pulse={now.pulse}
              pulseMs={pulseMs}
            />
          </div>
        </NoteCtx.Provider>
      </RunStage>
    </div>
  )
}
