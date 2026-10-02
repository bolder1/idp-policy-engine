import { motion } from 'motion/react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { Droplets, Undo2 } from 'lucide-react'

import { Tip } from '../../../kit'
import { useBrand } from '../../../store'
import { activeNode, policyOpen } from '../engine-run'
import { isQuiet, policyWhy } from '../journey'
import { stepMs } from '../use-engine-run'
import { RunStage, type StageView } from './RunStage'
import { StageThemeToggle } from './stream-theme'
import { useStageTheme } from './stream-theme-state'
import { PolicyChannel, type ChannelCtx } from './stream-channels'
import { StreamFlow } from './stream-flow'
import { BOX_R, G, geometryOf, liveGeo, mainRoute, tidy } from './stream-geometry'
import { flowPlan, toneOf } from './stream-model'
import { samplePath } from './stream-path'
import { Pipes, Trickles } from './stream-pipes'
import { tricklesOf } from './stream-pipes-utils'
import { PeekCtx, type PeekState } from './stream-peek-ctx'
import { Pool } from './stream-pools'
import { RuleGate } from './stream-rules'
import { Source } from './stream-source'
import { chipGroups, factTokens, sourceH } from './stream-source-utils'
import { anyFlip, flipWords, useWhatIf, type Flips } from './stream-whatif'
import type { RunLayoutProps } from './types'
import './stream.css'

/* -----------------------------------------------------------------------------
   The run as a STREAM (run-layout.ts `stream`): access as a flow. The
   sign-in streams from the person (the SOURCE, left) towards the outcomes
   (the POOLS, right), and the policy engine shapes where it can go:

     • down the POLICY channels, in the engine's order — a policy that does
       not cover the person is a channel with its gate shut (the stream
       glances off, its reason on the gate); the first that covers opens and
       the stream pours into it;
     • inside it, down the RULE gates — each tests the stream with its
       checks (sensors on the gate, ✓ / ✕); a gate that fails a check stays
       shut and the stream diverts to the next; the first that opens lets it
       through; "Nothing else matched" is the last gate, always open;
     • into the POOL of its outcome, which fills: the answer, whole.

   Blue while the engine works; the route turns green for an allow (any
   number of factors), red for a deny, amber only while it can't be told;
   the channels never reached stay grey. Settled, the source, the open
   channel with its open gate, and the filled pool stand on one line — the
   stream a still, solid ribbon (stream-flow.tsx stops its loop).

   Poke it: hover, focus or press a gate or a channel for its reason (the
   fact against the requirement); press a pool for what it would take; drag
   the source's handle onto another network or device — or press the chip —
   and the stream re-routes for that what-if, marked, with a way back
   (stream-whatif.ts). Pour again replays the flow in the dock.

   Everything is drawn from `s` (the plan's step) through the pure helpers;
   the geometry is fixed rows (stream-geometry.ts), so nothing is measured
   and the world never changes size under the eye.
   -------------------------------------------------------------------------- */

const firstName = (name: string): string => name.trim().split(/\s+/)[0] || name
const POUR_MS = 1900

export default function StreamLayout(props: RunLayoutProps) {
  const { plan: livePlan, s: liveS, running, animate, reduced, jumped, runKey, form, rows, asGroup } = props
  const { users } = useBrand()
  const [theme] = useStageTheme()
  const stage = useRef<StageView | null>(null)
  const worldRef = useRef<HTMLDivElement | null>(null)

  /* A new run: the what-if goes, the notes shut, the re-pours reset. */
  const [flips, setFlips] = useState<Flips>({})
  const [pourN, setPourN] = useState(0)
  const [peek, setPeek] = useState<PeekState['open']>(null)
  const [seenKey, setSeenKey] = useState(runKey)
  const [pouredKey, setPouredKey] = useState(-1)
  if (seenKey !== runKey) {
    setSeenKey(runKey)
    setFlips({})
    setPourN(0)
    setPeek(null)
  }
  if (animate && pouredKey !== runKey) setPouredKey(runKey)

  const liveLast = liveS >= livePlan.steps.length - 1
  const liveLanded = liveLast || (livePlan.at.outcome >= 0 && liveS >= livePlan.at.outcome)
  const whatIf = useWhatIf(form, flips, liveLanded && !running && !livePlan.empty)
  const plan = whatIf?.plan ?? livePlan
  const s = whatIf ? plan.steps.length - 1 : liveS
  const viewForm = whatIf?.form ?? form
  const screens = whatIf?.screens ?? props.screens
  const at = plan.at
  const step = plan.steps[s]
  const landed = s >= plan.steps.length - 1 || (at.outcome >= 0 && s >= at.outcome)
  const tone = toneOf(plan)

  /* Motion: the run playing, its stream draining once it lands, a what-if's re-route, a re-pour. */
  const flowAnimate = !reduced && !jumped && (animate || pouredKey === runKey || whatIf !== null || pourN > 0)
  const cardAnimate = !reduced && (animate || whatIf !== null)

  const groups = chipGroups(rows)
  const factCount = factTokens(rows).length
  const srcH = sourceH(factCount, groups)
  const geo = useMemo(() => geometryOf(plan, srcH), [plan, srcH])
  const route = useMemo(() => samplePath(tidy(mainRoute(geo)), G.RADIUS), [geo])
  const flow = useMemo(() => flowPlan(plan, geo, route), [plan, geo, route])
  const trickles = useMemo(() => (landed ? tricklesOf(plan, geo) : []), [landed, plan, geo])
  const now = useMemo(() => liveGeo(geo, plan, s, landed), [geo, plan, s, landed])

  const person = users.find((u) => u.id === viewForm.personId) ?? null
  const first = asGroup ?? (person ? firstName(person.name) : plan.conflicts?.personName ? firstName(plan.conflicts.personName) : 'them')
  const decider = geo.d >= 0 ? plan.policies[geo.d] : undefined
  const polShown = s >= Math.max(0, at.which)
  const rulesShown = decider !== undefined && policyOpen(decider, s) && geo.box !== null
  const deciding = step?.kind === 'deciding' && !landed

  const findings = useMemo(() => (plan.conflicts?.findings ?? []).filter((f) => !isQuiet(f)), [plan.conflicts])
  const chanCtx = useMemo<ChannelCtx>(() => {
    const dv = plan.conflicts?.policies[0]?.deciderVia
    return { appName: plan.appName, first, deciderName: plan.decider?.name ?? '', deciderVia: dv?.matches ? dv.say : '', ruleWhy: policyWhy(plan), findings }
  }, [plan, first, findings])
  const covers = useMemo(() => new Map((plan.conflicts?.policies ?? []).map((p) => [p.policyId, p])), [plan.conflicts])
  const conflictIds = useMemo(
    () => new Set((plan.conflicts?.findings ?? []).filter((f) => f.tone === 'conflict' && (f.kind === 'policy-conflict' || f.kind === 'same-group-policy')).map((f) => f.target.policyId)),
    [plan.conflicts],
  )
  const clashes = useMemo(() => new Map((plan.conflicts?.rules ?? []).map((r) => [r.ruleId, r])), [plan.conflicts])
  const landRule = geo.land >= 0 ? plan.rules[geo.land] : undefined
  const matchedFirst = landRule && landRule.index !== null && plan.landing !== null ? `rule ${landRule.index + 1} matched first` : 'the walk stopped before it'

  /* The stream: how far it has reached, and how fast it gets there. */
  const live = !whatIf && !landed
  const reach = live ? (flow.reach[s] ?? 0) : route.total
  const reachMs = live ? stepMs(plan, s) : POUR_MS
  const probe = live ? (flow.probe[s] ?? null) : null
  const mode = landed ? 'landed' : s >= at.which && at.which >= 0 ? 'work' : 'idle'
  const pour = `${runKey}|${whatIf?.key ?? ''}|${pourN}`
  const drawKey = `${runKey}|${whatIf?.key ?? ''}`

  // --- The peek: one note at a time ---

  const peekFrom = useRef<HTMLElement | null>(null)
  const show = useCallback((id: string) => setPeek((p) => (p?.pinned ? p : { id, pinned: false })), [])
  const hide = useCallback((id: string) => setPeek((p) => (p && p.id === id && !p.pinned ? null : p)), [])
  const toggle = useCallback((id: string, from: HTMLElement) => {
    peekFrom.current = from
    setPeek((p) => (p?.id === id && p.pinned ? null : { id, pinned: true }))
  }, [])
  const peeks = useMemo<PeekState>(() => ({ open: peek, show, hide, toggle }), [peek, show, hide, toggle])
  useEffect(() => {
    if (!peek) return
    const id = window.requestAnimationFrame(() => {
      if (peek.pinned) stage.current?.follow(worldRef.current?.querySelector('.rl-stream__note'), { lazy: true, jump: reduced })
    })
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setPeek(null)
      peekFrom.current?.focus()
    }
    const onDown = (e: globalThis.PointerEvent) => {
      const t = e.target as Element | null
      if (t?.closest('.rl-stream__note, .rl-stream__peek')) return
      setPeek(null)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      window.cancelAnimationFrame(id)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [peek, reduced])

  // --- The what-if: drag the source's handle onto a chip ---

  const [drag, setDrag] = useState<{ x: number; y: number; over: string | null } | null>(null)
  const applyChip = useCallback(
    (key: string) => {
      const [g, id] = key.split(':') as ['from' | 'device' | 'risk', string]
      setFlips((f) => ({ ...f, [g]: id }))
    },
    [],
  )
  const onHandleDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!liveLanded || e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const world = worldRef.current
    if (!world) return
    const toWorld = (cx: number, cy: number) => {
      const r = world.getBoundingClientRect()
      const z = r.width / Math.max(1, geo.width)
      return { x: (cx - r.left) / z, y: (cy - r.top) / z }
    }
    const overAt = (cx: number, cy: number) => document.elementFromPoint(cx, cy)?.closest('[data-whatif]')?.getAttribute('data-whatif') ?? null
    setDrag({ ...toWorld(e.clientX, e.clientY), over: null })
    const move = (ev: globalThis.PointerEvent) => setDrag({ ...toWorld(ev.clientX, ev.clientY), over: overAt(ev.clientX, ev.clientY) })
    const up = (ev: globalThis.PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      const key = overAt(ev.clientX, ev.clientY)
      setDrag(null)
      if (key) applyChip(key)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  // --- The camera ---

  const fittedFor = useRef<string | null>(null)
  useLayoutEffect(() => {
    fittedFor.current = landed ? drawKey : null
    stage.current?.fit({ max: 1, jump: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- on a new run, and as the layout mounts
  }, [runKey])
  useEffect(() => {
    if (!running || landed || whatIf) return
    const node = activeNode(plan, s)
    if (!node) return
    const el = worldRef.current?.querySelector(`[data-node="${node}"]`)
    stage.current?.follow(el, { lazy: true, jump: reduced })
  }, [s, running, landed, plan, reduced, whatIf])
  useEffect(() => {
    if (!landed || fittedFor.current === drawKey) return
    fittedFor.current = drawKey
    stage.current?.fit({ max: 1, jump: reduced || jumped || (!animate && !whatIf) })
  }, [landed, drawKey, reduced, jumped, animate, whatIf])

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
      const first = last === ''
      last = size
      if (first || !settledNow.current) return
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => stage.current?.fit({ max: 1, jump: true }))
    })
    ro.observe(ground)
    return () => {
      ro.disconnect()
      window.cancelAnimationFrame(frame)
    }
  }, [])

  // --- Drawing ---

  const ruleCount = plan.rules.filter((r) => r.index !== null).length
  const dock = (
    <>
      <StageThemeToggle />
      <Tip text="Pour again" placement="top">
        <button type="button" className="bb__act" aria-label="Pour the stream again" disabled={!liveLanded || running} onClick={() => setPourN((n) => n + 1)}>
          <Droplets size={14} strokeWidth={2} aria-hidden />
        </button>
      </Tip>
    </>
  )

  return (
    <div className="rl-stream-root" data-stage={theme}>
      <div className="rl-stream__backdrop" aria-hidden />
      <RunStage ref={stage} reduced={reduced} className="rl-stream" dock={dock} label={`Sign-in run: ${plan.appName}`}>
        <PeekCtx.Provider value={peeks}>
          <div ref={worldRef} className="rl-stream__world" style={{ width: geo.width, height: geo.height } as CSSProperties}>
            {(['work', 'positive', 'negative', 'notice', 'neutral'] as const).map((k) => (
              <span key={k} className={`rl-stream__ink is-${k}`} aria-hidden />
            ))}
            <Pipes key={`pipes:${drawKey}`} geo={now} polShown={polShown} rulesShown={rulesShown} />

            {/* Headers: quiet, sentence case. A what-if takes the source's. */}
            {whatIf && anyFlip(flips) ? (
              <div className="rl-stream__whatif" style={{ top: geo.srcHead - 6, width: G.SRC_W + 40 }} data-card>
                <span className="rl-stream__whatiftag">What if</span>
                <span className="rl-stream__whatifwords" title={flipWords(flips)}>
                  {flipWords(flips)}
                </span>
                <button type="button" className="rl-stream__back" onClick={() => setFlips({})}>
                  <Undo2 size={12} strokeWidth={2.2} aria-hidden />
                  Back to the run
                </button>
              </div>
            ) : (
              <h3 className="rl-stream__colhead" style={{ left: 0, top: geo.srcHead, width: G.SRC_W }}>
                Sign-in
              </h3>
            )}
            {geo.pols.length > 0 && (
              <h3 className="rl-stream__colhead" style={{ left: G.POL_X, top: geo.polHead, width: G.POL_W }} title={`Policies on ${plan.appName}`}>
                Policies on {plan.appName}
              </h3>
            )}
            <h3 className="rl-stream__colhead" style={{ left: G.POOL_X, top: geo.poolHead, width: G.POOL_W }}>
              Outcome
            </h3>

            <div className="rl-stream__srcwrap" style={{ top: geo.src.top }}>
              <Source
                form={viewForm}
                baseForm={form}
                rows={rows}
                asGroup={asGroup}
                landed={liveLanded && !running}
                depends={landed && plan.outcome.status === 'depends'}
                flips={flips}
                over={drag?.over ?? null}
                dragging={drag !== null}
                onPressPerson={props.onPressPerson}
                onFlip={setFlips}
                onHandleDown={onHandleDown}
              />
            </div>

            {/* The policies' channels, and where the engine is finding the one that applies. */}
            <div className="rl-stream__which" data-node="which" style={{ left: G.POL_X, top: geo.pols[0]?.top ?? 0, width: G.POL_W, height: Math.max(0, (geo.pols.at(-1)?.top ?? 0) + G.CARD_H - (geo.pols[0]?.top ?? 0)) }} aria-hidden />
            {plan.policies.map((p, i) => (
              <PolicyChannel
                key={`${drawKey}:${p.policyId}`}
                p={p}
                slot={geo.pols[i]}
                s={s}
                shown={polShown}
                landed={landed}
                tone={tone}
                animate={cardAnimate}
                after={geo.d >= 0 && i > geo.d}
                cover={landed && geo.d >= 0 && i > geo.d ? covers.get(p.policyId) : undefined}
                conflict={conflictIds.has(p.policyId)}
                ctx={chanCtx}
              />
            ))}

            {/* Inside the channel that applies: its rules' gates. */}
            {geo.box && rulesShown && (
              <motion.div
                key={`box:${drawKey}`}
                className={`rl-stream__box${landed ? ` is-${tone}` : ''}`}
                style={{ left: G.BOX_X, width: BOX_R - G.BOX_X }}
                initial={cardAnimate ? { opacity: 0, top: geo.box.top, height: (now.box ?? geo.box).bottom - geo.box.top } : false}
                animate={{ opacity: 1, top: geo.box.top, height: (now.box ?? geo.box).bottom - geo.box.top }}
                transition={{ duration: cardAnimate ? 0.42 : 0, ease: [0.4, 0, 0.2, 1] }}
              >
                <h3 className="rl-stream__boxhead" title={plan.decider ? `Rules in ${plan.decider.name}` : 'Rules'}>
                  Rules in {plan.decider?.name ?? 'the policy'}
                  {ruleCount > 0 && <span className="rl-stream__count">{ruleCount}</span>}
                </h3>
              </motion.div>
            )}
            {rulesShown &&
              plan.rules.map((r, j) => (
                <RuleGate
                  key={`${drawKey}:${r.id}`}
                  r={r}
                  slot={now.rules[j]}
                  s={s}
                  open={j === geo.land}
                  shown={rulesShown}
                  landed={landed}
                  tone={tone}
                  animate={cardAnimate}
                  first={first}
                  matchedFirst={matchedFirst}
                  clash={landed && j > geo.land ? clashes.get(r.id) : undefined}
                />
              ))}

            {now.pools.map((q) => (
              <Pool
                key={`${drawKey}:${pourN}:${q.kind}`}
                slot={q}
                plan={plan}
                props={props}
                screens={screens}
                appId={viewForm.appId}
                landed={landed}
                working={deciding}
                tone={tone}
                animate={cardAnimate || (!reduced && pourN > 0)}
              />
            ))}

            <StreamFlow key={`flow:${drawKey}`} width={geo.width} height={geo.height} route={route} reach={reach} reachMs={reachMs} probe={probe} mode={mode} tone={tone} animate={flowAnimate} pour={pour} theme={theme} />
            <Trickles geo={geo} items={trickles} />
            {drag && (
              <svg className="rl-stream__dragwire" width={geo.width} height={geo.height} aria-hidden>
                <path d={`M ${geo.src.port.x} ${geo.src.port.y} L ${drag.x} ${drag.y}`} />
                <circle cx={drag.x} cy={drag.y} r={6} />
              </svg>
            )}
          </div>
        </PeekCtx.Provider>
      </RunStage>
    </div>
  )
}
