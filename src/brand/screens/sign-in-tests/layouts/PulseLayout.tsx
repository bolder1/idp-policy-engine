import { animate as tween, useMotionValue } from 'motion/react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'

import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Tip } from '../../../kit'
import { useBrand } from '../../../store'
import { useSimEnv } from '../../sim-env'
import { audienceViaOf } from '../conflicts'
import { isQuiet, policyWhy } from '../journey'
import { stepMs } from '../use-engine-run'
import { RunStage, type StageView } from './RunStage'
import { PulseStageToggle } from './pulse-theme'
import { usePulseStage } from './pulse-theme-state'
import type { RunLayoutProps } from './types'
import { lerpPlaced, place, SIGN_W } from './pulse-geometry'
import { buildTrack, CARD_W } from './pulse-model'
import { firstName, toneOf } from './pulse-words'
import { rowsOf } from './pulse-size'
import { Trace } from './pulse-trace'
import { PulseWorld } from './pulse-world'
import { Rail, type StopView } from './pulse-rail'
import './pulse.css'
import './pulse-cards.css'
import './pulse-out.css'
import './pulse-rail.css'

/* -----------------------------------------------------------------------------
   The run as PULSE (run-layout.ts `pulse`): a heartbeat you can scrub.

     ┌ Maya ┐   ┌ 1 AWS for eng… ✓ ┐          ┌ 2 Engineers on… ✓ ┐
     │      │        │                              │
     │      │━━━━━━━━╱╲━━━━━━ ━ ━ ━ ━━━━━━╲╱━━━━━━╱╲━━━━━━ ━ ━ ━━━━━━╱╲━━┃ Allow on 1 factor ┃
     └──────┘          ⚠ 2 AWS billing…      ✕ 1 Contractors…            ┃ Decided by …     ┃
              ──── Policies on AWS Console 4 ────── Rules in AWS for eng… 4 ──── Outcome ──
                                                              ▲ playhead

   One line, left to right in the order the engine did things. It is flat
   while waiting and draws itself forward with the clock (a blue scan bar and
   dot at its tip while the engine works); it SPIKES where a policy covers the
   person and where a rule matches (green), dips where a check fails (red),
   blips amber for a can't-tell or something that also applies, and runs
   dashed and grey through what was never read. A small card is pinned to
   each beat; the answer is the biggest card, at the line's end.

   Under it, the rail: three sections (Policies · Rules · Outcome) and a
   playhead to drag (or step with the arrow keys, or ‹ › in the dock): the
   card it stands on grows and opens its detail, and the line after it fades.
   "Findings only" folds the beats that found nothing.

   Everything is drawn from `s` (the clock's step): the tip's target is the
   end of what step `s` draws, reached in that step's time (`stepMs`).
   -------------------------------------------------------------------------- */

const FOLD_GLIDE = { duration: 0.45, ease: [0.4, 0, 0.2, 1] as const }

export default function PulseLayout(props: RunLayoutProps) {
  const { plan, s, running, animate, reduced, jumped, runKey, form, asGroup } = props
  const [theme] = usePulseStage()
  const { users, policies: tenant } = useBrand()
  const env = useSimEnv()
  const stage = useRef<StageView | null>(null)
  const worldRef = useRef<HTMLDivElement | null>(null)

  const person = users.find((u) => u.id === form.personId) ?? null
  const first = asGroup ?? (person ? firstName(person.name) : plan.conflicts?.personName ? firstName(plan.conflicts.personName) : 'them')
  const tone = toneOf(plan)
  const at = plan.at
  const last = s >= plan.steps.length - 1
  const landed = last || (at.outcome >= 0 && s >= at.outcome)
  /* The trace has been drawn to its end: the playhead is the admin's. */
  const settled = !running || last

  /* What else covers the person, or also applies: the amber beats. */
  const alsoPolicies = useMemo(() => new Set((plan.conflicts?.policies ?? []).map((p) => p.policyId)), [plan.conflicts])
  const alsoRules = useMemo(() => new Set((plan.conflicts?.rules ?? []).map((r) => r.ruleId)), [plan.conflicts])
  const track = useMemo(() => buildTrack(plan, alsoPolicies, alsoRules, first), [plan, alsoPolicies, alsoRules, first])

  /* "Findings only": the beats that found nothing folded away, eased. */
  const [fold, setFold] = useState(false)
  const [foldK, setFoldK] = useState(0)
  const full = useMemo(() => place(track, false, CARD_W.outcome), [track])
  const folded = useMemo(() => place(track, true, CARD_W.outcome), [track])
  const placed = useMemo(() => lerpPlaced(full, folded, foldK), [full, folded, foldK])
  const rows = useMemo(() => rowsOf(plan, track, 150), [plan, track])

  /* Each step's end on the line: where the tip is bound while it runs. */
  const stepEnd = useMemo(() => {
    let end = SIGN_W
    return track.span.map(([a, b]) => {
      if (b > a) end = placed.x1[b - 1]
      return end
    })
  }, [track, placed])
  /* The step that draws each seg: a beat's mark lands then. */
  const segStep = useMemo(() => {
    const out: number[] = []
    track.span.forEach(([a, b], si) => {
      for (let i = a; i < b; i++) out[i] = si
    })
    return out
  }, [track])

  // --- The tip, with the clock ---

  const tip = useMotionValue(landed && !running ? placed.width : SIGN_W)
  const tipFor = useRef(runKey)
  useEffect(() => {
    const end = landed ? placed.x1[placed.x1.length - 1] ?? placed.width : (stepEnd[s] ?? SIGN_W)
    if (tipFor.current !== runKey) {
      tipFor.current = runKey
      if (running && animate) tip.set(SIGN_W)
    }
    if (!running || !animate || jumped || reduced) {
      tip.set(landed ? placed.width : end)
      return
    }
    const ctl = tween(tip, end, { duration: Math.max(0.05, stepMs(plan, s) / 1000), ease: 'linear' })
    return () => ctl.stop()
  }, [s, runKey, running, animate, jumped, reduced, landed, stepEnd, placed, plan, tip])

  // --- The playhead ---

  const nav = useMemo(() => track.stops.filter((st) => !(placed.gone[st.seg] ?? false)), [track, placed.gone])
  const [pick, setPick] = useState<string | null>(null)
  const [pickFor, setPickFor] = useState(runKey)
  if (pickFor !== runKey) {
    setPickFor(runKey)
    setPick(null)
  }
  const focusId = settled ? (pick && nav.some((x) => x.id === pick) ? pick : 'outcome') : null
  const focusIndex = Math.max(0, nav.findIndex((x) => x.id === focusId))
  const focusStop = nav.find((x) => x.id === focusId) ?? null
  const playX = focusStop ? (placed.card[focusStop.id]?.pin ?? null) : null
  /* Each stop on the rail: where, in what colour, and its one line (the slider says it). */
  const stopViews = useMemo<StopView[]>(
    () =>
      nav.map((st) => {
        const g = track.segs[st.seg]
        const t = g?.tone === 'path' ? tone : g?.tone === 'pass' ? 'positive' : g?.tone === 'fail' ? 'negative' : g?.tone === 'notice' ? 'notice' : 'neutral'
        return { stop: st, x: placed.card[st.id]?.pin ?? 0, tone: t, label: st.id === 'outcome' ? 'The answer' : g?.hint || st.id, at: segStep[st.seg] ?? 0 }
      }),
    [nav, track, placed, tone, segStep],
  )
  const toWorldX = useCallback((clientX: number) => {
    const w = worldRef.current
    const z = stage.current?.zoom() ?? 1
    if (!w) return null
    return (clientX - w.getBoundingClientRect().left) / z
  }, [])
  const step = useCallback(
    (by: number) => {
      const i = Math.max(0, Math.min(nav.length - 1, focusIndex + by))
      const st = nav[i]
      if (st) setPick(st.id)
    },
    [nav, focusIndex],
  )
  /* The card the playhead stands on, kept in view. */
  useEffect(() => {
    if (!settled || !focusId) return
    const id = window.requestAnimationFrame(() => {
      const el = worldRef.current?.querySelector(`[data-node="${focusId === 'outcome' ? 'outcome' : focusId}"]`)
      stage.current?.follow(el, { lazy: true, jump: reduced })
    })
    return () => window.cancelAnimationFrame(id)
  }, [focusId, settled, reduced])

  // --- Findings only ---

  const foldGlide = useRef<{ stop: () => void } | null>(null)
  const toggleFold = useCallback(() => {
    const next = !fold
    setFold(next)
    foldGlide.current?.stop()
    if (reduced) {
      setFoldK(next ? 1 : 0)
      window.requestAnimationFrame(() => stage.current?.fit({ max: 1, jump: true }))
      return
    }
    foldGlide.current = tween(foldK, next ? 1 : 0, {
      ...FOLD_GLIDE,
      onUpdate: (k) => setFoldK(k),
      onComplete: () => {
        foldGlide.current = null
        stage.current?.fit({ max: 1 })
      },
    })
  }, [fold, foldK, reduced])
  useEffect(() => () => foldGlide.current?.stop(), [])

  // --- What the cards say about the run around them ---

  const deciderVia = useMemo(() => {
    const d = plan.policies.find((p) => p.decides)
    const pol = d ? (props.policies ?? tenant).find((p) => p.id === d.policyId) : undefined
    if (!d || !pol || d.isGlobalDefault || asGroup) return plan.conflicts?.policies[0]?.deciderVia?.say ?? ''
    try {
      const v = audienceViaOf(pol, person, env)
      return v.matches ? v.say : ''
    } catch {
      return ''
    }
  }, [plan, props.policies, tenant, person, env, asGroup])
  const findings = useMemo(() => (plan.conflicts?.findings ?? []).filter((f) => !isQuiet(f)), [plan.conflicts])
  const ruleWhy = useMemo(() => policyWhy(plan), [plan])

  // --- The camera ---

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
  const anchor = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!running || landed) return
    stage.current?.follow(anchor.current, { lazy: true, jump: reduced, x: 0.6 })
  }, [s, running, landed, reduced])
  useEffect(() => {
    if (!landed || fittedFor.current === runKey) return
    fittedFor.current = runKey
    stage.current?.fit({ max: 1, jump: reduced || jumped || !animate })
  }, [landed, runKey, reduced, jumped, animate])

  const onPick = useCallback((id: string) => setPick(id), [])

  const dock = (
    <>
      <PulseStageToggle />
      <span className="bb__float__sep" />
      <Tip text="Previous finding" placement="top">
        <button type="button" className="bb__act" aria-label="Previous finding" disabled={!settled || focusIndex <= 0} onClick={() => step(-1)}>
          <ChevronLeft size={15} strokeWidth={2} aria-hidden />
        </button>
      </Tip>
      <Tip text="Next finding" placement="top">
        <button type="button" className="bb__act" aria-label="Next finding" disabled={!settled || focusIndex >= nav.length - 1} onClick={() => step(1)}>
          <ChevronRight size={15} strokeWidth={2} aria-hidden />
        </button>
      </Tip>
      <Tip text={fold ? 'Show every beat' : 'Fold the beats that found nothing'} placement="top">
        <button type="button" className={`bb__act rl-pulse__dockbtn${fold ? ' is-on' : ''}`} aria-pressed={fold} disabled={!settled} onClick={toggleFold}>
          Findings only
        </button>
      </Tip>
    </>
  )

  return (
    <div className="rl-pulse-root" data-stage={theme}>
      <div className="rl-pulse__ground" aria-hidden />
      <RunStage ref={stage} reduced={reduced} className="rl-pulse" label={`Sign-in run: ${plan.appName}`} dock={dock}>
        <div key={runKey} ref={worldRef} className="rl-pulse__world" style={{ width: placed.width, height: rows.height } as CSSProperties}>
          <div ref={anchor} className="rl-pulse__anchor" style={{ left: (stepEnd[s] ?? SIGN_W) - 80, top: rows.base - 110, width: 160, height: 220 }} aria-hidden />
          <Trace segs={track.segs} placed={placed} base={rows.base} width={placed.width} height={rows.height} tip={tip} play={focusId === 'outcome' ? null : playX} tone={tone} landed={landed} working={running && !last} />
          <Rail plan={plan} track={track} placed={placed} top={rows.rail} base={rows.base} s={s} landed={settled} tip={tip} stops={stopViews} focusIndex={focusIndex} onFocus={(i) => nav[i] && setPick(nav[i].id)} toWorldX={toWorldX} reduced={reduced} />
          <PulseWorld
            props={props}
            track={track}
            placed={placed}
            rows={rows}
            s={s}
            landed={landed}
            tone={tone}
            first={first}
            focusId={focusId}
            onPick={onPick}
            segStep={segStep}
            deciderVia={deciderVia}
            findings={findings}
            ruleWhy={ruleWhy}
          />
        </div>
      </RunStage>
    </div>
  )
}
