import type { Policy } from '../../data'
import { hopMs } from '../testing/route-marker'
import { changedBy, type FormField, type SignInForm } from '../testing/sign-in-form'
import { decisionSig, runSentence, updateSentence, type DecisionView, type RouteModel } from './try-sign-in'

/* -----------------------------------------------------------------------------
   Try a sign-in's run on the board, as bookkeeping: which run is on screen,
   the stops its marker travels, where the marker stands, what last moved the
   answer, and what the status region says.

   The board's Try a sign-in hook held these in React state and fed them the
   clock, until Check access (PolicyCheck.tsx) took test mode's place on
   1 Oct 2026. Every decision it made with them is here, pure, so the rules
   of the run can be pinned without a browser:

     a run      opening test mode, an origin chip, Replay — the three
                triggers, and the only ones. It travels from the start, and
                clears whatever "Changed by" said about the run before it
     an update  everything else: a typed address, a picker, a slider, an edit
                on the board. No travel. Named on the Decision ("Changed by
                IP address") only when it moved the answer, because nothing
                moved on screen to say so
     the words  once per run, when the marker lands — or at once, where it
                does not travel; and once per update that moved the answer
   -------------------------------------------------------------------------- */

/* How long travel waits on opening test mode before its first hop: the panel
   fades in beside the chain for this long, and the chain itself is already
   where it will stay (Board.tsx refits in the commit that opens test mode). */
export const ENTRY_DELAY = 240
/* How long a replay waits before its first hop: the marker's move back from
   where the last run landed to the start, which is one hop (`hopMs` is never
   more than 180 ms). */
export const RETURN_MS = 180

export interface Run {
  id: number
  travel: boolean
  /** How long travel waits before its first hop. */
  delay: number
}

export const FIRST_RUN: Run = { id: 0, travel: false, delay: 0 }

/** Opening test mode: a run, after the panel beside the chain has come in. */
export const openRun = (r: Run): Run => ({ id: r.id + 1, travel: true, delay: ENTRY_DELAY })
/** Replay: the same sign-in, travelled again from the start once the marker is back there. */
export const replayRun = (r: Run): Run => ({ id: r.id + 1, travel: true, delay: RETURN_MS })
/* An origin chip is the one edit that plays a run: a chip is a whole sign-in
   chosen at once, where a typed address is one fact changed. Any other patch
   leaves the run as it is — the same object, so nothing re-renders for it. */
export const runAfterPatch = (r: Run, p: Partial<SignInForm>): Run => (p.origin ? replayRun(r) : r)

// --- The marker ----------------------------------------------------------------------

export interface TravelStop {
  /** From the run's start. */
  ms: number
  /** The stage the marker leaves for; null for the last hop, where the route's own landing takes over. */
  at: number | null
  /** The stage it leaves, which is the last one it has ARRIVED at. */
  reached: number
}

/* The run's departures, one per hop, `hopMs` apart after the run's delay: at
   each the marker leaves for the next stage, and the stage it leaves is the
   one it has arrived at. So what a stage reveals — its pills, a card's ring,
   the gate's words — waits for the marker to be there, never for it to set
   off (review, 29 Sep 2026: the ring lit a hop early). The landing is one hop
   after the last departure (`landingMs`): the outcome and the status sentence
   arrive with the marker.

   Letting go at the last hop rather than naming the landing means an update
   that lands the sign-in somewhere else mid-run is followed, not overwritten
   by the timer. A route of no hops does not travel. */
export function travelStops(hops: number, delay: number): TravelStop[] {
  const hop = hopMs(hops)
  return Array.from({ length: Math.max(0, hops) }, (_, i) => ({ ms: delay + i * hop, at: i + 1 >= hops ? null : i + 1, reached: i }))
}

/** When the marker lands, from the run's start: one hop after its last departure. */
export const landingMs = (hops: number, delay: number): number => delay + Math.max(0, hops) * hopMs(hops)

// --- Keeping the answer in view ------------------------------------------------------

/* When the board shows its Decision gate again (Board.tsx, the reveal), as a
   key: it changes on a landing, on a new answer or a new "Changed by", and on
   each turn of the Which policy disclosure. A turn moves the gate by the
   list's height and says nothing new, so a key of the answer alone left the
   gate under the view dock for as long as the answer held — across re-runs
   too (28 Sep 2026). Null while the marker travels: its landing reveals. A
   render that changes none of these — a hover — keeps the key, and the view
   stays where the reader left it. */
export function revealKey(landed: boolean, changed: string | null, decision: DecisionView, whichTurns: number): string | null {
  if (!landed) return null
  return `${whichTurns}|${changed ?? ''}|${JSON.stringify(decision, (k, v) => (k === 'trace' ? undefined : v))}`
}

/* Whether a change of that key was the admin's own turn of the list and
   nothing else. Then the reveal keeps the Which policy row they pressed in the
   stage (`revealY`'s `keep`): at a laptop's height the list and the gate do
   not both fit, and the row, the focus on it and the list they opened win.
   A landing, a new answer or a new "Changed by" reveals the gate in full. */
export function revealKeepsWhich(prev: string | null, next: string): boolean {
  if (prev === null) return false
  const split = (k: string) => [k.slice(0, k.indexOf('|')), k.slice(k.indexOf('|') + 1)]
  const [turnsBefore, saidBefore] = split(prev)
  const [turns, said] = split(next)
  return turns !== turnsBefore && said === saidBefore
}

// --- What changed, and what to say ---------------------------------------------------

export type Motion = 'travel' | 'update'

/** What the last render showed, to tell this one's cause from. */
export interface Track {
  form: SignInForm
  draft: Policy
  /** The answer, as `decisionSig` writes it. */
  sig: string
  run: number
  /** What moved the answer last in this run, or null since it began. */
  changed: FormField | 'edits' | null
  motion: Motion
  /** The status region's words. */
  said: string
}

export function firstTrack(form: SignInForm, draft: Policy, route: RouteModel | null, run: number): Track {
  return { form, draft, sig: route ? decisionSig(route.decision) : '', run, changed: null, motion: 'travel', said: '' }
}

/* The run's sentence, as the status region says it when the marker lands. The
   trailing space alternates by run, so Replay on the same answer is said again
   rather than read by a screen reader as no change. */
export const landedSentence = (route: RouteModel, run: number): string => `${runSentence(route.decision)}${run % 2 ? ' ' : ''}`

/* The track after this render: what caused it — a new run, the sign-in, the
   board — and whether the answer moved. The same object when nothing it
   follows changed, so the hook can set it during render and settle.

     a new run   nothing is "Changed by" in it. It is said at once where it
                 does not travel (reduced motion); a travelling one is said
                 when it lands, by the hook's timer
     an update   named, and said, only when the answer moved; one that left
                 the answer alone keeps what was said and named before */
export function nextTrack(track: Track, now: { form: SignInForm; draft: Policy; route: RouteModel | null; run: number; travels: boolean }): Track {
  const sig = now.route ? decisionSig(now.route.decision) : ''
  if (track.form === now.form && track.draft === now.draft && track.sig === sig && track.run === now.run) return track
  const fresh = track.run !== now.run
  const cause: FormField | 'edits' | null = track.form !== now.form ? changedBy(track.form, now.form) : track.draft !== now.draft ? 'edits' : null
  const moved = !fresh && track.sig !== sig && cause !== null
  const landedNow = fresh && !now.travels && now.route ? landedSentence(now.route, now.run) : null
  return {
    form: now.form,
    draft: now.draft,
    sig,
    run: now.run,
    changed: fresh ? null : moved ? cause : track.changed,
    motion: fresh ? 'travel' : cause ? 'update' : track.motion,
    said: landedNow ?? (fresh ? '' : moved && now.route ? updateSentence(now.route.decision, cause) : track.said),
  }
}
