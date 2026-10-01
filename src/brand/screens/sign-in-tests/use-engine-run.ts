import { useCallback, useEffect, useRef, useState } from 'react'

import { timeline, type EngineRun, type StepKind, type Timeline } from './engine-run'

/* -----------------------------------------------------------------------------
   The engine run's clock (TESTING-V4 §8.3, §11.1): what plays a plan, step by
   step, for whoever draws it — the Sign-in tests page's Try tab and, inside a
   policy, the board's test mode. Moved out of TryJourney.tsx unchanged; the
   caller says which run is waiting and what to do as it is taken up, and the
   clock says what is on screen.

   The clock keeps to the plan's own times: each step is due at the run's
   start plus its planned start, so the time a render takes is never added on
   to the next step, and the run lands when the plan says (the cap is 9 s).

   The settled plan is what a revisit shows: the caller keeps which run it has
   played, so a tab switch and back never plays the same run twice.
   -------------------------------------------------------------------------- */

interface Playing {
  id: number
  plan: EngineRun
  tl: Timeline
  replay: boolean
  /** When it started (`performance.now()`): every step is due at `t0 + tl.at[step]`. */
  t0: number
  /** The clock has been set again from the first frame that was on screen. */
  aligned?: boolean
}

/* The timeline each plan is being played on, by the plan: the canvas reads
   a step's own length from it (a policy's sweep, the light around the one
   that decides, both as long as their step at the pace it plays at — an
   edit's re-run is quicker) without the caller handing it over. A plan the
   clock has not played is read at full pace. */
const PLAYED = new WeakMap<EngineRun, Timeline>()

/** How long step `s` of `plan` holds as it is being played, in ms; full pace when it is not. */
export function stepMs(plan: EngineRun, s: number): number {
  let tl = PLAYED.get(plan)
  if (!tl) {
    tl = timeline(plan.steps, 'full')
    PLAYED.set(plan, tl)
  }
  return tl.dur[s] ?? 0
}

/* A sentence said again when it is the same as the last — Replay under
   reduced motion, a re-run that lands where the last did: the region is
   emptied first and filled on the next frame, so it changes, and is read. */
export function sayAfresh(say: (text: string) => void, text: string) {
  say('')
  window.requestAnimationFrame(() => say(text))
}

export interface EngineClockInput {
  /** The settled plan of the sign-in on screen: what shows when nothing plays. */
  live: EngineRun
  /** The run waiting to play — its plan, memoised by the caller from how it begins — or null. */
  pending: EngineRun | null
  /** The waiting run's id, handed back to `onStart`. */
  runId: number
  /** The waiting run is a Replay: said so, once, as its first stage starts. */
  replay: boolean
  /** A run started by editing the sign-in plays quicker. */
  pace: 'full' | 'edit'
  reduced: boolean
  /** The status region: the stages as they start, the answer as it lands. Injected — the page and the board each have their own. */
  say: (text: string) => void
  /** The answer in one sentence, said as the run lands (`liveSentence`). */
  sentence: () => string
  /** The waiting run has been taken up — played, or under reduced motion settled at once: mark it played. */
  onStart: (runId: number) => void
}

export interface EngineClock {
  /** The plan on screen: the one playing, the one about to (its first frame), or the settled one. */
  shown: EngineRun
  /** The step on screen. */
  s: number
  /** A run is playing — or about to, on this very frame. */
  running: boolean
  /** The step's kind. */
  kind: StepKind | undefined
  /** The clock is playing a run (not only waiting to). */
  playing: boolean
  /** Skip (or Edit) landed the run: what glides takes its place at once, for a moment. */
  jumped: boolean
  /** Where the engine line's hairline fills to by the end of this step, and how long that takes. */
  progress: { to: number; ms: number } | null
  /** What the engine line says: the step's words, or the summary once done. */
  text: string
  /** Land the run where it is, at once (Skip; Edit sign-in mid-run). Nothing when nothing plays. */
  land: () => void
  /* What the admin opened or closed by hand, and Show all checks: both start
     again with every run. */
  toggled: Record<string, boolean>
  onToggle: (policyId: string, open: boolean) => void
  showAll: boolean
  onShowAll: () => void
}

export function useEngineRun({ live, pending, runId, replay, pace, reduced, say, sentence, onStart }: EngineClockInput): EngineClock {
  const [playing, setPlaying] = useState<Playing | null>(null)
  const [step, setStep] = useState(0)
  const shown = playing?.plan ?? pending ?? live
  /* Under reduced motion a waiting run shows its settled step from its very
     first frame — never its first step for the frame before it is taken up.
     It is still running for that frame, so the caller sees it land. */
  const s = playing ? step : pending && !reduced ? 0 : shown.at.done
  const running = playing !== null || pending !== null
  const kind = shown.steps[s]?.kind

  const [toggled, setToggled] = useState<Record<string, boolean>>({})
  const [showAll, setShowAll] = useState(false)
  const onToggle = useCallback((policyId: string, open: boolean) => setToggled((t) => ({ ...t, [policyId]: open })), [])
  const onShowAll = useCallback(() => setShowAll((v) => !v), [])

  /* A newer run: play it (or, under reduced motion, settle at once, and say
     its answer — "Replay. …" for a Replay, and afresh, so an answer the same
     as the last is still heard). */
  useEffect(() => {
    if (!pending) return
    const id = runId
    onStart(id)
    setToggled({})
    setShowAll(false)
    if (reduced) {
      const said = sentence()
      sayAfresh(say, replay ? `Replay. ${said}` : said)
      return
    }
    const tl = timeline(pending.steps, pace === 'edit' ? 'edit' : 'full')
    PLAYED.set(pending, tl)
    setPlaying({ id, plan: pending, tl, replay, t0: performance.now() })
    setStep(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a waiting run, once
  }, [pending])

  /* The run's clock starts from its first frame on screen, not from the
     render that asked for it: the first frame of a run draws a new canvas,
     and on a slow machine it can take a good part of the fold to arrive —
     every step would then be that much early, and the fold half over before
     it was seen. Two frames on, the clock is set again. */
  const playId = playing?.id
  useEffect(() => {
    if (playId === undefined) return
    let b = 0
    const a = window.requestAnimationFrame(() => {
      b = window.requestAnimationFrame(() => setPlaying((p) => (p && p.id === playId && !p.aligned ? { ...p, t0: performance.now(), aligned: true } : p)))
    })
    return () => {
      window.cancelAnimationFrame(a)
      window.cancelAnimationFrame(b)
    }
  }, [playId])

  /* The clock: each step is due at its planned time from the run's start —
     not its length after the last step's render, which drifted a run a
     second or more past its plan. A stage is said aloud as it starts; the
     answer once, at the end. Unmounting mid-run clears the step's timer, and
     with it the run. */
  /* A step that names a conflict (`notice`) is never cut short: come late —
     a slow frame before it — it still holds its whole length, and the steps
     after it move on by as much. Reset with every run. */
  const late = useRef(0)
  useEffect(() => {
    if (!playing) return
    const steps = playing.plan.steps
    const at = steps[step]
    if (step === 0) late.current = 0
    if (at?.stage) say(playing.replay && steps.findIndex((x) => x.stage) === step ? `Replay. ${at.stage}` : at.stage)
    if (step >= steps.length - 1) {
      say(sentence())
      setPlaying(null)
      return
    }
    let due = playing.t0 + late.current + playing.tl.at[step + 1] - performance.now()
    const hold = playing.tl.dur[step] ?? 0
    if (at?.notice && due < hold) {
      late.current += hold - due
      due = hold
    }
    const t = window.setTimeout(() => setStep(step + 1), Math.max(0, due))
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the run and its step, and only those, move the clock
  }, [playing, step])

  /* Skip lands the run where it is: the answer's place is taken at once, not
     glided to (`jumped`), or its wire is drawn kinked for a moment. */
  const [jumped, setJumped] = useState(false)
  useEffect(() => {
    if (!jumped) return
    const t = window.setTimeout(() => setJumped(false), 400)
    return () => window.clearTimeout(t)
  }, [jumped])
  const land = () => {
    if (!playing) return
    setJumped(true)
    setStep(playing.plan.steps.length - 1)
  }

  const at = shown.at
  const text = s >= at.done ? shown.summary : (shown.steps[s]?.text ?? '')
  const tl = playing?.tl
  /* The hairline fills to this step's end by when it is due — what is left of
     it, if the step came late. */
  const progress =
    playing && tl && tl.total > 0
      ? { to: Math.min(1, (tl.at[s] + tl.dur[s]) / tl.total), ms: Math.max(0, playing.t0 + late.current + tl.at[s] + tl.dur[s] - performance.now()) }
      : null

  return { shown, s, running, kind, playing: playing !== null, jumped, progress, text, land, toggled, onToggle, showAll, onShowAll }
}
