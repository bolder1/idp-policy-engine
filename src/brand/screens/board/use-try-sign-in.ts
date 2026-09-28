import { useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { Policy } from '../../data'
import { useBrand } from '../../store'
import type { SimEnv } from '../simulate'
import type { WatchedResult } from '../tenant-resolver'
import { boundariesOf, type Boundaries } from '../testing/boundaries'
import { hopMs } from '../testing/route-marker'
import { rowsRead, type RowsRead } from '../testing/rows-read'
import { screensOf, type SignInScreens } from '../testing/screens-of'
import { useTestingSession } from '../testing/session-state'
import { CHANGED_BY_WORDS, defaultBoardForm, factsOf, todayIn, type FormField, type FormIssue, type SignInForm } from '../testing/sign-in-form'
import {
  columnView,
  columnsFor,
  routeOf,
  runColumns,
  stageSentence,
  standingWatch,
  wouldChangeIf,
  type ChangeChip,
  type ColumnResult,
  type ColumnView,
  type RouteModel,
} from './try-sign-in'
import {
  FIRST_RUN,
  STEP_MS,
  canStepTo,
  firstTrack,
  landedSentence,
  markerStage,
  nextTrack,
  openRun,
  replayRun,
  runAfterPatch,
  travelStops,
} from './try-sign-in-run'

/* -----------------------------------------------------------------------------
   Try a sign-in's state on the board: the sign-in, its run, and where the
   marker is.

   The sign-in itself is the testing session's (`boardForms`, one per policy),
   so it outlasts the board: leave HRMS, come back, and Kavya from the office
   is still what is being tried. Everything else here is the run in front of
   the admin — whether the marker is travelling, which stage a step has put it
   on, what the status region last said — and goes with the board.

   Motion has three triggers and no others (route-marker.ts): opening test
   mode, an origin chip, and Replay. Each is a RUN, and the marker travels it
   from the start, one hop at a time. Everything else is an UPDATE — a typed
   address after its pause, a picker, a slider, an edit on the board — and the
   marker goes straight to where it now lands. An update that moves the answer
   is named on the Decision ("Changed by IP address"), because nothing moved
   on screen to say so. Those rules are try-sign-in-run.ts's, pure and pinned;
   this hook holds their state and runs their clock.
   -------------------------------------------------------------------------- */

export interface TrySignIn {
  form: SignInForm
  patch: (p: Partial<SignInForm>, field: FormField) => void
  /** A whole sign-in in place of this one, played as a run: a saved sign-in's Try in the panel. */
  load: (form: SignInForm) => void
  rows: RowsRead
  issues: FormIssue[]
  boundaries: Boundaries
  columns: ColumnView[]
  right: ColumnResult
  /* What monitoring policies would decide as the tenant stands, for the Which
     policy list — beside the Stored version only (`standingWatch`). */
  watching: readonly WatchedResult[]
  route: RouteModel
  chips: ChangeChip[]
  screens: SignInScreens[]
  /** The stage the marker stands on, and how it got there. */
  at: number
  ms: number
  fadeIn: boolean
  /** While a run travels, the last stage reached; null once landed. */
  reached: number | null
  /** Content may fade: not under reduced motion, not while a slider is held. */
  fade: boolean
  /** "IP address": what moved the answer last, or null since the run began. */
  changed: string | null
  /** The status region's words. */
  said: string
  replay: () => void
  canBack: boolean
  canNext: boolean
  back: () => void
  next: () => void
}

const NO_ROWS: RowsRead = { rows: new Set(), device: new Set() }

export function useTrySignIn({ on, saved, draft, env }: { on: boolean; saved: Policy; draft: Policy; env: SimEnv }): TrySignIn | null {
  const store = useBrand()
  const session = useTestingSession()
  const reduced = useReducedMotion() === true
  const today = useMemo(() => todayIn(), [])

  /* The policy's sign-in, or where it starts: somebody it is for, on its first
     application, from the office at 09:30 today (sign-in-form.ts). */
  const stored = session.boardForms[saved.id]
  const { users, apps, zones, fingerprints, policies, methods, defaultMethodId } = store
  const form = useMemo(() => stored ?? defaultBoardForm(saved, users, apps, today), [stored, saved, users, apps, today])

  const rows = useMemo(() => (on ? rowsRead(policies, draft, form.appId, { zones, fingerprints }) : NO_ROWS), [on, policies, draft, form.appId, zones, fingerprints])
  const { facts, issues } = useMemo(() => factsOf(form, zones), [form, zones])
  const cols = useMemo(() => (on ? runColumns(columnsFor(saved, draft, form.appId), policies, facts, env) : []), [on, saved, draft, form.appId, policies, facts, env])
  const right = cols.at(-1)
  const route = useMemo(() => (right ? routeOf(right, draft, facts, env, policies) : null), [right, draft, facts, env, policies])
  const boundaries = useMemo<Boundaries>(
    () => (right ? boundariesOf(form, rows, right.spec.substitute ? { substitute: right.spec.substitute } : {}, policies, env, zones) : {}),
    [right, form, rows, policies, env, zones],
  )
  const chips = useMemo(
    () => (right ? wouldChangeIf({ form, saved, draft, right, policies, env, zones, methods }) : []),
    [right, form, saved, draft, policies, env, zones, methods],
  )
  const screens = useMemo(
    () =>
      right
        ? screensOf(right.resolution, {
            policies,
            substitute: right.spec.substitute,
            methods,
            defaultMethodId,
            person: users.find((u) => u.id === form.personId) ?? null,
          })
        : [],
    [right, policies, methods, defaultMethodId, users, form.personId],
  )
  const columns = useMemo(
    () => cols.map((c) => columnView(c, draft.id, policies, (id) => apps.find((a) => a.id === id)?.name ?? id)),
    [cols, draft.id, policies, apps],
  )

  // --- The run ---------------------------------------------------------------------

  const [run, setRun] = useState(FIRST_RUN)
  const travels = run.travel && !reduced
  /* Opening test mode is a run, after the column it runs down has settled.
     Started while rendering, not in an effect, so the first frame of test mode
     already has the marker at the start rather than at the landing it is
     about to travel to. `false` to begin with, so a board opened straight
     into test mode starts one too. */
  const [wasOn, setWasOn] = useState(false)
  if (on !== wasOn) {
    setWasOn(on)
    if (on) setRun(openRun)
  }
  const replay = useCallback(() => setRun(replayRun), [])

  const patchBoard = session.patchBoard
  const patch = useCallback(
    (p: Partial<SignInForm>, field: FormField) => {
      patchBoard(saved.id, p, field)
      setRun((r) => runAfterPatch(r, p))
    },
    [patchBoard, saved.id],
  )

  /* A whole sign-in chosen at once is a run, like an origin chip: the marker
     travels it from the start, and nothing is "Changed by" in it. */
  const loadBoard = session.loadBoard
  const load = useCallback(
    (f: SignInForm) => {
      loadBoard(saved.id, f)
      setRun(replayRun)
    },
    [loadBoard, saved.id],
  )

  const landing = route?.landing ?? 0
  const latest = useRef({ route, landing })
  useEffect(() => {
    latest.current = { route, landing }
  })

  // --- What changed, and what to say ---------------------------------------------

  /* Kept against the last render, not in an effect, so "Changed by" arrives in
     the same frame as the answer it explains. */
  const [track, setTrack] = useState(() => firstTrack(form, draft, route, run.id))
  if (on) {
    const next = nextTrack(track, { form, draft, route, run: run.id, travels })
    if (next !== track) setTrack(next)
  }

  // --- The marker ----------------------------------------------------------------------

  /* While a run travels, the stage it has reached; the timers step it along and
     let go at the landing (`travelStops`). */
  const [travel, setTravel] = useState<{ run: number; at: number | null }>({ run: -1, at: null })
  useEffect(() => {
    if (!on || !travels) return
    const say = () => {
      const r = latest.current.route
      if (r) setTrack((t) => ({ ...t, said: landedSentence(r, run.id) }))
    }
    const stops = travelStops(latest.current.landing, run.delay)
    if (stops.length === 0) {
      setTravel({ run: run.id, at: null })
      say()
      return
    }
    setTravel({ run: run.id, at: 0 })
    const timers = stops.map((s) =>
      window.setTimeout(() => {
        setTravel({ run: run.id, at: s.at })
        if (s.at === null) say()
      }, s.ms),
    )
    return () => timers.forEach((t) => window.clearTimeout(t))
  }, [on, travels, run])

  const travelAt = on && travels ? (travel.run === run.id ? travel.at : 0) : null
  const [step, setStep] = useState<{ run: number; at: number } | null>(null)
  const at = markerStage(travelAt, step, run.id, landing)

  const moveTo = (to: number) => {
    if (!route || !canStepTo(to, landing, travelAt)) return
    setStep({ run: run.id, at: to })
    setTrack((t) => ({ ...t, motion: 'step', said: stageSentence(route, to, draft) }))
  }

  /* A slider held down updates the answer many times a second; nothing fades
     while it is, or every stage would flicker under the thumb. */
  const held = useRef(false)
  useEffect(() => {
    const down = () => {
      held.current = true
    }
    const up = () => {
      held.current = false
    }
    window.addEventListener('pointerdown', down, true)
    window.addEventListener('pointerup', up, true)
    window.addEventListener('pointercancel', up, true)
    return () => {
      window.removeEventListener('pointerdown', down, true)
      window.removeEventListener('pointerup', up, true)
      window.removeEventListener('pointercancel', up, true)
    }
  }, [])

  if (!on || !route || !right) return null
  const motionNow = track.run === run.id ? track.motion : 'travel'
  return {
    form,
    patch,
    load,
    rows,
    issues,
    boundaries,
    columns,
    right,
    watching: standingWatch(cols),
    route,
    chips,
    screens,
    at,
    ms: motionNow === 'travel' ? hopMs(landing) : motionNow === 'step' ? STEP_MS : 0,
    fadeIn: motionNow === 'update',
    reached: travelAt,
    fade: !reduced && !held.current,
    changed: track.run === run.id && track.changed ? CHANGED_BY_WORDS[track.changed] : null,
    said: track.said,
    replay,
    canBack: travelAt === null && at > 0,
    canNext: travelAt === null && at < landing,
    back: () => moveTo(at - 1),
    next: () => moveTo(at + 1),
  }
}
