import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { timeline, type EngineRun, type Pace, type StepKind } from '../engine-run'

/* -----------------------------------------------------------------------------
   Focus v2's PRESENTER (run-layout.ts `focus2`): the engine's run turned into
   a story a person can read.

   What was wrong before. v1 drew the run at the host's step `s`, which is the
   ENGINE's clock: about 7 to 9 s for a whole run (engine-run.ts `CAP_MS`),
   shared out so that a policy with many checks reads FASTER rather than
   longer. Played, that meant each moment was on screen for 0.6 to 1.2 s —
   rule 1 opened, failed and receded in about a second, so the one line worth
   reading, "Who · Maya isn't in Contractors", was gone before the eye reached
   it. v1's only brake was a 1150 ms hold on the sign-in card; everything
   after it raced.

   So v2 draws at a PRESENTED step `p` of its own, on a second timeline built
   from the same plan: each beat gets a hold long enough to read, the last
   step before each beat boundary is held another 800 ms so the finding that
   ended it can be read, and the whole thing is capped at 16 s so a policy
   with ten rules does not become a lecture.

   Two rules this file exists to keep.

     p ≤ s, always. The presentation is the same run, slower — never a guess
     at one. Step `p + 1` is due at `at'[p + 1]` AND only once the engine has
     produced it. Both, never either: on a loaded machine the engine is the
     one that falls behind, and a picture showing a check the engine had not
     run would be a lie about the product.

     The clock waits; it does not bank time. While the engine is behind, the
     clock stops at the start of the step after `s` instead of running on, so
     the story does not leap three beats the moment the engine catches up.

   Everything here except `usePresenter` is pure, and the hook is a thin shell
   over it: a frame is `advance(state, …)`, and the picture is
   `presentedStep(state, …)`. That is what makes the pace testable at all —
   this repo has no DOM test environment, so a clock that lived inside a
   component could only ever be checked by eye.
   -------------------------------------------------------------------------- */

// --- The story's beats ------------------------------------------------------------------

/* Six kinds, against v1's four (focus-model.ts `MomentKind`). The owner's
   story for v2 goes deeper than the carousel's did, so the one `policies`
   moment splits in two — the policies passed over, then the one that covers,
   which opens on its rule list — and the deciding rule's THEN becomes a beat
   of its own instead of being spent on the outcome's step. */
export type BeatKind = 'sign' | 'policies' | 'covers' | 'rule' | 'then' | 'outcome'

export interface Beat {
  key: string
  kind: BeatKind
  /** The step it is reached at. */
  at: number
  /** Index into `plan.rules`, for a rule beat and for the Then. */
  rule?: number
  /* Three names, because the player has three places to put one: the segment
     itself, which is narrow; the line beside the rail, which names the beat
     on screen; and the Tip, which says which policy or rule it is. */
  /** On the segment: "Sign-in", "Policies", "Rule 1". */
  short: string
  /** Beside the rail: "Sign-in", "Policies", "Rule 2 of 3", "Outcome". */
  label: string
  /** In the Tip and the screen-reader label: "AWS for engineering teams", "Rule 2 · In the office". */
  name: string
  /** The first step it owns. */
  from: number
  /** The last step it owns, inclusive. */
  to: number
}

interface Draft {
  key: string
  kind: BeatKind
  at: number
  rule?: number
  short: string
  label: string
  name: string
}

/** Every beat of the run, in order, each owning a run of steps: the outcome last. */
export function storyOf(plan: EngineRun): Beat[] {
  const last = plan.steps.length - 1
  /* No person or no application: the plan is one 'done' step and there is no
     story. One beat, so a rail still has something to draw and nothing
     divides by zero. */
  if (plan.empty || last < 0) return spans([{ key: 'sign', kind: 'sign', at: 0, short: 'Sign-in', label: 'Sign-in', name: 'The sign-in' }], Math.max(0, last))

  const raw: Draft[] = [{ key: 'sign', kind: 'sign', at: 0, short: 'Sign-in', label: 'Sign-in', name: 'The sign-in' }]
  if (plan.policies.length > 0) {
    /* The stack is drawn from the find step, but it only takes the story as
       the first policy is asked — the find step belongs to the sign-in's
       beat, where the card is still being read. */
    const firstScan = plan.policies.find((p) => p.scanAt !== null)?.scanAt
    const at = firstScan ?? Math.max(0, plan.at.which)
    raw.push({ key: 'policies', kind: 'policies', at: Math.max(1, at), short: 'Policies', label: 'Policies', name: plan.appName ? `Policies on ${plan.appName}` : 'Policies' })
  }
  /* The lock: `at.found` is the step the scan has stopped on the one that
     decides (-1 when none does), and the row settles and opens after it. */
  if (plan.at.found >= 0) raw.push({ key: 'covers', kind: 'covers', at: plan.at.found, short: 'Covers', label: 'Covering policy', name: plan.decider?.name ?? 'The policy that covers' })

  /* Rules come in only as the engine reaches them (owner, 3 Oct 2026:
     progressive, never waiting ahead), so a rule the walk never got to is no
     beat — even though the plan gives it a `startAt`, which it carries only
     so it can settle with the one that matched. */
  const ruled = plan.rules.map((r, i) => ({ r, i })).filter(({ r }) => (r.visited || r.state === 'off') && r.startAt >= 0)
  /* "Rule 2 of 3" counts the numbered rules in the story; the catch-all has
     no number of its own (`index` is null) and is not one of them. */
  const numbered = ruled.filter(({ r }) => r.index !== null).length
  for (const { r, i } of ruled) {
    raw.push({
      key: r.node,
      kind: 'rule',
      at: r.startAt,
      rule: i,
      short: r.index === null ? 'Last rule' : `Rule ${r.index + 1}`,
      label: r.index === null ? 'Last rule' : `Rule ${r.index + 1} of ${numbered}`,
      name: r.index === null ? r.name : `Rule ${r.index + 1} · ${r.name}`,
    })
  }

  /* The Then is the 'deciding' step — NOT `plan.at.decides`, which is the
     POLICY settling to "Decides" long before any rule is read. v1 spent this
     step on the outcome (focus-model.ts: `outAt = … ? plan.at.outcome :
     deciding`); here the Then owns it and the outcome always takes
     `at.outcome`, so the two never share a step. Where a conflict is named
     the step carries `notice`, and its 2000 ms hold lands on the Then, which
     is exactly the card the finding is about. */
  const deciding = plan.steps.findIndex((st) => st.kind === 'deciding')
  if (deciding >= 0 && plan.landing !== null) raw.push({ key: 'then', kind: 'then', at: deciding, rule: plan.landing, short: 'Then', label: 'Then', name: "The deciding rule's Then" })
  raw.push({ key: 'outcome', kind: 'outcome', at: plan.at.outcome >= 0 ? plan.at.outcome : last, short: 'Outcome', label: 'Outcome', name: 'The answer' })

  return spans(order(raw), last)
}

/* One beat to a step. Two beats on the same step would have to be held for no
   time at all between them, which shows up as a rail segment that never fills
   and a clock that can never pass it. The later beat wins the step, because
   the beat on screen is always the last one reached — except the sign-in,
   which always owns step 0. In a real plan nothing collides (found < expand <
   the first rule, and `at.outcome` is the step after 'deciding'); this is the
   net under a plan shape that has not been seen yet. */
function order(raw: readonly Draft[]): Draft[] {
  const kept: Draft[] = []
  for (const b of [...raw].sort((a, z) => a.at - z.at)) {
    const prev = kept[kept.length - 1]
    if (!prev || b.at > prev.at) {
      kept.push(b)
      continue
    }
    if (prev.kind !== 'sign') kept[kept.length - 1] = b
  }
  return kept
}

/** Each beat's run of steps: from the step it is reached at to the one before the next beat. */
function spans(drafts: readonly Draft[], last: number): Beat[] {
  return drafts.map((b, i) => {
    const next = drafts[i + 1]
    const from = Math.min(Math.max(0, b.at), Math.max(0, last))
    const to = Math.max(from, Math.min(next ? next.at - 1 : last, last))
    return { ...b, from, to }
  })
}

/** The beat a step belongs to: the last one reached by it. */
export function beatOfStep(beats: readonly Beat[], step: number): number {
  let at = 0
  beats.forEach((b, i) => {
    if (step >= b.at) at = i
  })
  return at
}

/** The same, on a built timeline. */
export function beatOn(tl: PresentedTimeline, step: number): number {
  let at = 0
  tl.beats.forEach((b, i) => {
    if (step >= b.beat.at) at = i
  })
  return at
}

/** The run has landed at step `p`: the answer is on screen. */
export const landedAt = (plan: EngineRun, p: number): boolean => p >= plan.steps.length - 1 || (plan.at.outcome >= 0 && p >= plan.at.outcome)

// --- The presentation timeline ----------------------------------------------------------

/* The owner's table (SPEC.md §4), as written, and nothing derived from the
   engine's own pace: the engine spends what is left of its 9 s cap on the
   rows, so its numbers get SHORTER the more there is to read, which is the
   opposite of what a presentation wants.

   'fill' and 'collapse' keep the engine's own values, because the spec gives
   the sign-in as a whole moment (≥ 1600 ms) rather than two step values, and
   the moment minimum below is what actually holds that card.

   'compact' is 0: a rule folds as it recedes, inside the next beat's move,
   so it is not a beat of its own and needs no time. */
const PRESENT_MS: Record<StepKind, number> = {
  fill: 460,
  collapse: 280,
  find: 400,
  scan: 420,
  found: 520,
  decides: 420,
  expand: 300,
  rule: 320,
  check: 360,
  checked: 380,
  'rule-end': 360,
  compact: 0,
  deciding: 520,
  outcome: 1400,
  done: 0,
}

/** A conflict is named on its own step and held, whatever its kind says: the finding has to be read before the answer lands. */
export const NOTICE_MS = 2000
/** The last step before a beat boundary is held this much longer: it carries the finding that ended the beat. */
export const READ_HOLD = 800
/** The cap shrinks the read holds this far and no further. */
export const READ_HOLD_MIN = 400
/** Then it shrinks the rows this far and no further. */
export const CHECK_MIN = 280
export const CHECKED_MIN = 300
/** The whole presentation, at most. */
export const PRESENT_CAP_MS = 16000
/** The least a beat is held, so it can be read. The outcome has none: its build is 1400 ms and the answer then stays. */
export const BEAT_MIN: Record<BeatKind, number> = { sign: 1600, policies: 1200, covers: 1200, rule: 1200, then: 900, outcome: 0 }
/** A rule switched off says only that: its header and an "Off" chip. */
export const OFF_RULE_MIN = 700
/** A re-run started by an edit presents at this share: the admin has just watched the same run. */
export const EDIT_PRESENT_SHARE = 0.7
/** It is one when the engine ran it at this share of the full pace or less (`EDIT_SHARE` is 0.6, so an edit re-run is). */
export const EDIT_ENGINE_SHARE = 0.65

export interface BeatSpan {
  beat: Beat
  /** Presented ms from the first presented frame. */
  at: number
  /** Its hold: what its steps add up to. */
  dur: number
}

export interface PresentedTimeline {
  /** When each step is presented, ms from the start. */
  at: number[]
  /** How long each step is held. */
  dur: number[]
  total: number
  /** One span per beat, in the story's order: the rail. */
  beats: BeatSpan[]
  /** The cap bound, and something was shrunk for it. */
  shrunk: boolean
  /** Over the cap even with every read hold and row at its floor, by this much; 0 normally. */
  over: number
}

export interface PresentOptions {
  /** The pace the engine ran this plan at, when the host knows it. An edit re-run presents at 0.7 ×. */
  pace?: Pace
}

/**
 * The presented times, step by step: the owner's ms table, the +800 ms read
 * hold before each beat boundary, the per-beat minimums, and the 16 s cap.
 *
 * The order is base times, then the read holds, then the minimums, and the
 * cap last — and the cap is given a budget per beat as well as per step.
 * Both floors in the spec are then true at once, which no simpler order
 * manages: shrinking before the minimums leaves the minimums to put the time
 * straight back (the cap then achieves nothing), and shrinking after them
 * with per-step floors alone would take a beat that is only just readable
 * below its minimum to save 60 ms. So a step gives up at most its own room —
 * a read hold down to 400, a check to 280, a row's mark to 300 — and at most
 * the slack its own beat has over its minimum.
 *
 * A run long enough that even that cannot fit 16 s keeps every beat readable
 * and says so in `over`, rather than quietly making itself unreadable: a
 * policy with forty rules is a thing to report, not to flash past.
 */
export function presentTimeline(plan: EngineRun, beats: readonly Beat[] = storyOf(plan), opts: PresentOptions = {}): PresentedTimeline {
  const steps = plan.steps
  const dur = steps.map((st) => (st.notice ? NOTICE_MS : (PRESENT_MS[st.kind] ?? 0)))

  /* The read hold, on the last step of every beat but the last: that step is
     where the beat's finding lands, and in the engine's own pace it is gone
     in 260 ms. The last beat needs none — the outcome's build is its hold,
     and the answer then stays on screen. */
  const holds: number[] = []
  for (let i = 0; i < beats.length - 1; i++) {
    const at = beats[i].to
    if (at < 0 || at >= dur.length) continue
    dur[at] += READ_HOLD
    holds.push(at)
  }

  /* A beat the engine raced through is held long enough to read. The deficit
     goes on the beat's LAST step, where its result is already on screen, so
     the extra time is spent reading the finding rather than waiting for it. */
  for (const b of beats) {
    const least = minOf(b, plan)
    const held = spanMs(dur, b)
    if (held < least && b.to >= 0 && b.to < dur.length) dur[b.to] += least - held
  }

  let shrunk = false
  if (sum(dur) > PRESENT_CAP_MS) {
    /* The read holds first. */
    shrunk = shrink(dur, plan, beats, sum(dur) - PRESENT_CAP_MS, holds.map((at) => ({ at, room: READ_HOLD - READ_HOLD_MIN })))
  }
  if (sum(dur) > PRESENT_CAP_MS) {
    /* Then the rows, the other thing there can be a great many of. A notice
       step is never shrunk: it is the owner's held beat, and the finding on
       it is the one the admin most needs to read. */
    const rows: Room[] = []
    steps.forEach((st, i) => {
      if (st.notice) return
      if (st.kind === 'check') rows.push({ at: i, room: PRESENT_MS.check - CHECK_MIN })
      else if (st.kind === 'checked') rows.push({ at: i, room: PRESENT_MS.checked - CHECKED_MIN })
    })
    shrunk = shrink(dur, plan, beats, sum(dur) - PRESENT_CAP_MS, rows) || shrunk
  }

  /* An edit re-run, whole, at 0.7 ×. Read off the engine's own pace rather
     than guessed: `timeline(steps,'edit')` is 0.6 of the full pace, which is
     inside the spec's 0.65 test, and 'instant' is not a presentation at all. */
  const share = presentShare(plan, opts.pace ?? 'full')
  if (share !== 1) for (let i = 0; i < dur.length; i++) dur[i] = Math.floor(dur[i] * share)

  const at: number[] = []
  let t = 0
  for (const d of dur) {
    at.push(t)
    t += d
  }
  return {
    at,
    dur,
    total: t,
    beats: beats.map((beat) => ({ beat, at: at[Math.min(beat.from, at.length - 1)] ?? 0, dur: spanMs(dur, beat) })),
    shrunk,
    over: Math.max(0, t - PRESENT_CAP_MS),
  }
}

interface Room {
  at: number
  room: number
}

/* Take `need` ms off the given steps, never past the room each one has and
   never past the slack its beat has over its own minimum. The first pass is
   proportional, so a run with forty rows loses a little everywhere rather
   than everything at the front; the second hands out what the flooring left,
   a ms at a time, so the cut is exactly what was asked for and comes out the
   same on every machine. Says whether it took anything. */
function shrink(dur: number[], plan: EngineRun, beats: readonly Beat[], need: number, rooms: readonly Room[]): boolean {
  if (need <= 0) return false
  /* What each beat can give at all, shared out among its own steps. */
  const slack = new Map<number, number>()
  beats.forEach((b, i) => slack.set(i, Math.max(0, spanMs(dur, b) - minOf(b, plan))))
  const room = rooms.map((r) => {
    const i = beatOfStep(beats, r.at)
    const left = slack.get(i) ?? 0
    const take = Math.max(0, Math.min(r.room, left))
    slack.set(i, left - take)
    return take
  })
  const all = room.reduce((n, k) => n + k, 0)
  if (all <= 0) return false
  const want = Math.min(need, all)
  const take = room.map((r) => Math.min(r, Math.floor((want * r) / all)))
  let left = want - take.reduce((n, k) => n + k, 0)
  while (left > 0) {
    let moved = false
    for (let i = 0; i < take.length && left > 0; i++) {
      if (take[i] >= room[i]) continue
      take[i]++
      left--
      moved = true
    }
    if (!moved) break
  }
  rooms.forEach((r, i) => {
    dur[r.at] -= take[i]
  })
  return take.some((k) => k > 0)
}

function minOf(b: Beat, plan: EngineRun): number {
  if (b.kind !== 'rule') return BEAT_MIN[b.kind]
  const r = b.rule === undefined ? undefined : plan.rules[b.rule]
  return r?.state === 'off' ? OFF_RULE_MIN : BEAT_MIN.rule
}

function presentShare(plan: EngineRun, pace: Pace): number {
  if (pace === 'full') return 1
  const full = timeline(plan.steps, 'full').total
  const ran = timeline(plan.steps, pace).total
  if (full <= 0 || ran <= 0) return 1
  return ran / full <= EDIT_ENGINE_SHARE ? EDIT_PRESENT_SHARE : 1
}

const sum = (ns: readonly number[]): number => ns.reduce((n, k) => n + k, 0)

function spanMs(dur: readonly number[], beat: Beat): number {
  let held = 0
  for (let i = Math.max(0, beat.from); i <= Math.min(beat.to, dur.length - 1); i++) held += dur[i]
  return held
}

// --- Driving the story ------------------------------------------------------------------

/** What the presenter is, whole. Pure: a frame is `advance`, the picture is `presentedStep`. */
export interface PaceState {
  /** The run it belongs to (the host's `runKey`): a new one starts the story again. */
  key: number
  /** Presented ms credited so far — the clock the timeline is read against, not wall time. */
  elapsed: number
  /** Skipped: `p = s` and the engine is followed live from here on. */
  following: boolean
}

export const startState = (key: number): PaceState => ({ key, elapsed: 0, following: false })

export interface FrameInput {
  /** Presented ms to credit: the frame's own length. */
  dt: number
  /** The engine's step. */
  s: number
  tl: PresentedTimeline
  paused: boolean
}

/**
 * One frame. The clock only ever moves forward, and never past its ceiling:
 * the start of the step after the engine's.
 */
export function advance(st: PaceState, { dt, s, tl, paused }: FrameInput): PaceState {
  if (st.following || dt <= 0) return st
  if (paused) return st
  const elapsed = Math.max(st.elapsed, Math.min(st.elapsed + dt, ceiling(s, tl)))
  return elapsed === st.elapsed ? st : { ...st, elapsed }
}

/* Why the ceiling is the START of step s + 1 and not somewhere short of it:
   while the engine is behind, the presenter has already held step `s` for
   its whole presented duration, so when the engine produces the next step it
   is due at once. Stopping short would hold it twice; running past would let
   the picture leap several steps the moment the engine caught up. */
function ceiling(s: number, tl: PresentedTimeline): number {
  return s + 1 < tl.at.length ? tl.at[s + 1] : tl.total
}

export interface ShowInput {
  s: number
  tl: PresentedTimeline
}

/**
 * The step to draw at. Three things clamp it, and the first of them is the
 * one the whole file is for: the picture never runs ahead of the engine.
 */
export function presentedStep(st: PaceState, { s, tl }: ShowInput): number {
  const last = Math.max(0, tl.at.length - 1)
  if (st.following) return Math.min(Math.max(0, s), last)
  let due = 0
  for (let i = 0; i < tl.at.length; i++) {
    if (tl.at[i] <= st.elapsed) due = i
  }
  return Math.max(0, Math.min(s, due, last))
}

/** Skip: the answer as soon as the engine has it, and the engine followed live from here on. */
export const skipped = (st: PaceState): PaceState => (st.following ? st : { ...st, following: true })

/** The story again from the sign-in. Never a new engine run — only Run runs. */
export const replayed = (st: PaceState): PaceState => ({ key: st.key, elapsed: 0, following: false })

/**
 * A press on a rail segment or on a card: the story goes to that beat. Only
 * to a beat it has already reached, which is what keeps a press from
 * spoiling an answer the admin has not been shown yet — once the presented
 * run has landed, that is all of them.
 */
export function jumped(st: PaceState, tl: PresentedTimeline, beat: number, reached: number): PaceState {
  if (st.following) return st
  const to = Math.max(0, Math.min(beat, reached, Math.max(0, tl.beats.length - 1)))
  const at = tl.beats[to]?.at
  if (at === undefined) return st
  return { ...st, elapsed: at }
}

/** How far through the beat on screen the clock is, 0 to 1: what the rail's segment fills over. */
export function fillOf(st: PaceState, tl: PresentedTimeline, beat: number): number {
  const span = tl.beats[beat]
  if (!span) return 0
  if (st.following || span.dur <= 0) return 1
  return Math.max(0, Math.min(1, (st.elapsed - span.at) / span.dur))
}

/** The last beat the story has reached: the rail's pressable range. */
export const reachedBeat = (tl: PresentedTimeline, p: number, landed: boolean): number => (landed ? Math.max(0, tl.beats.length - 1) : beatOn(tl, p))

// --- The hook ---------------------------------------------------------------------------

export interface PresenterInput {
  plan: EngineRun
  /** The host's step. */
  s: number
  /** Changes on every new run: the story starts again (types.ts `runKey`). */
  runKey: number
  reduced: boolean
  /** Skip landed it, or a revisit drew it settled: there is nothing to present. */
  jumped: boolean
  /** Frozen: the pointer is reading the card, or the admin has gone to a beat by hand. */
  paused: boolean
  /** The pace the engine ran at, when the host knows it. */
  pace?: Pace
}

/** What the rail's segment animates over. It changes only as the beat does, so the fill is not a re-render a frame. */
export interface BeatClock {
  /** The beat it belongs to. */
  beat: number
  /** Its hold, ms. */
  dur: number
  /** How far in the clock already was when this beat took the screen (0 on a beat played from its start). */
  from: number
  /** Nothing is running: a hold, a hover, or the engine behind. */
  held: boolean
  /** Changes on a new run and on a Play again: the rail's own animation starts over on it. */
  key: string
}

export interface Presenter {
  /** The step to draw at. Everything that read the host's `s` reads this. */
  p: number
  /** The story is still being told: the picture is behind the engine, or the answer is not on screen yet. */
  presenting: boolean
  /** The presented landing. */
  landed: boolean
  /** The beat on screen. */
  beat: number
  /** The last beat reached: a press may go this far and no further. */
  reached: number
  /** The rail. */
  beats: readonly BeatSpan[]
  timeline: PresentedTimeline
  clock: BeatClock
  /** The fill, read live rather than rendered: for an aria label, or a player that animates it itself. */
  fillNow: () => number
  skip: () => void
  jumpTo: (beat: number) => void
  playAgain: () => void
}

/* The fill is deliberately not state. A rail that filled by re-rendering
   would re-render the whole view sixty times a second, against a 60 fps
   budget with the Configure panel open; so the clock lives in a ref, and
   state is committed only when something drawn actually changes — the step,
   the beat, whether it is waiting. The rail animates its own fill from
   `clock`, which changes once a beat. */
export function usePresenter(input: PresenterInput): Presenter {
  const { plan, s, runKey, reduced, jumped: landedAlready, paused, pace } = input
  const beats = useMemo(() => storyOf(plan), [plan])
  const tl = useMemo(() => presentTimeline(plan, beats, { pace }), [plan, beats, pace])

  /* Nothing to present: the host settles at once under reduced motion, and a
     revisit or a Skip is already landed. Derived, not stored, so turning
     reduced motion on mid-run lands the story rather than leaving it half
     told. */
  const live = !reduced && !landedAlready && !plan.empty

  const st = useRef<PaceState>(startState(runKey))
  /* Committed only when something drawn changes; it is also what brings the
     frame loop back after it has stopped itself (a Play again, a jump). */
  const [tick, commit] = useState(0)
  const view = useRef({ p: 0, beat: 0, from: 0 })
  /* Counted so the rail knows a Play again from a new run: `runKey` cannot
     say it, because Play again is the same run told again. */
  const plays = useRef(0)
  /* The frame loop reads the newest props through a ref, so a new `s` does
     not tear the loop down and build it again twenty times a run. */
  const now = useRef({ s, tl, live })
  now.current = { s, tl, live }

  /* A new run (Run, Replay, a view change — all of them arrive as a new
     `runKey`, types.ts) starts the story from the sign-in. Done while
     rendering, not in an effect, so the first painted frame of a new run is
     already its first beat and never the last one's answer. */
  if (st.current.key !== runKey) {
    st.current = startState(runKey)
    view.current = { p: 0, beat: 0, from: 0 }
    /* Set, not bumped: a ref written while rendering must come out the same
       if React renders twice. */
    plays.current = 0
  }

  /* The state as the view sees it: under reduced motion, a revisit or a
     settled plan the clock is ignored and the engine followed, which is why
     `following` is derived here rather than written into the state. */
  const stateNow = useCallback((): PaceState => (now.current.live ? st.current : { ...st.current, following: true }), [])

  const read = useCallback((): { p: number; beat: number } => {
    const { s: at, tl: on } = now.current
    const p = presentedStep(stateNow(), { s: at, tl: on })
    return { p, beat: beatOn(on, p) }
  }, [stateNow])

  const settle = useCallback(
    (fresh = false) => {
      const { p, beat } = read()
      const v = view.current
      if (!fresh && v.p === p && v.beat === beat) return
      /* Where the segment's fill starts: 0 for a beat played from its start,
         and wherever the clock stands for one jumped into or stepped to. */
      const from = !fresh && v.beat === beat ? v.from : fillOf(st.current, now.current.tl, beat)
      view.current = { p, beat, from }
      commit((n) => n + 1)
    },
    [read],
  )

  /* The frame loop. It runs while there is a story to tell and nothing is
     holding it; a long gap is capped so a tab that slept does not hand the
     clock a whole second and leap four beats. When the pane is hidden,
     requestAnimationFrame stops and so does the story — that is the host's
     documented behaviour, not something to work around here. */
  useEffect(() => {
    if (!live || paused) return
    if (typeof window === 'undefined') return
    let raf = 0
    let last = clock()
    const frame = () => {
      const t = clock()
      const dt = Math.min(FRAME_CAP, t - last)
      last = t
      const next = advance(st.current, { dt, s: now.current.s, tl: now.current.tl, paused: false })
      if (next !== st.current) st.current = next
      settle()
      /* The story is told: stop asking for frames rather than idling one a
         frame for as long as the view is open, which would show up in the
         owner's own frame-time measurement. A press commits, so the loop is
         built again for a Play again or a jump. */
      if (st.current.following || (st.current.elapsed >= now.current.tl.total && view.current.p >= now.current.tl.at.length - 1)) return
      raf = window.requestAnimationFrame(frame)
    }
    raf = window.requestAnimationFrame(frame)
    return () => window.cancelAnimationFrame(raf)
  }, [live, paused, settle, tick])

  /* The engine moved on, or a new plan arrived: what is drawn may change without a frame of the clock. */
  useEffect(() => {
    settle()
  }, [s, tl, live, settle])

  const act = useCallback(
    (fn: (state: PaceState) => PaceState) => {
      const next = fn(st.current)
      st.current = next
      settle(true)
    },
    [settle],
  )

  const fillNow = useCallback(() => {
    const state = stateNow()
    return fillOf(state, now.current.tl, beatOn(now.current.tl, presentedStep(state, now.current)))
  }, [stateNow])
  const skip = useCallback(() => act(skipped), [act])
  const jumpTo = useCallback(
    (to: number) =>
      act((state) => {
        const at = presentedStep(state, now.current)
        return jumped(state, now.current.tl, to, reachedBeat(now.current.tl, at, landedAt(plan, at)))
      }),
    [act, plan],
  )
  const playAgain = useCallback(() => {
    plays.current += 1
    act(replayed)
  }, [act])

  const { p, beat } = read()
  const landed = landedAt(plan, p)
  const span = tl.beats[beat]
  return {
    p,
    /* Still telling it: the picture is behind the engine, or the answer is
       not on screen yet. The layout widens the host's `running` with this, so
       Replay and the dock's landed suggestions never arrive before the
       picture does. */
    presenting: live && (p < s || !landed),
    landed,
    beat,
    reached: reachedBeat(tl, p, landed),
    beats: tl.beats,
    timeline: tl,
    clock: { beat, dur: span?.dur ?? 0, from: view.current.from, held: !live || paused || p >= s, key: `${runKey}:${plays.current}` },
    fillNow,
    skip,
    jumpTo,
    playAgain,
  }
}

/* A frame longer than this is a tab that was not being drawn, not a slow
   machine: credit it as one frame and let the clock carry on. */
const FRAME_CAP = 64

const clock = (): number => (typeof performance === 'undefined' ? Date.now() : performance.now())
