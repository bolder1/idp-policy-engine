import { useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { appsOf, type Policy } from '../../data'
import { useBrand } from '../../store'
import type { SimEnv } from '../simulate'
import type { WatchedResult } from '../tenant-resolver'
import { boundariesOf, type Boundaries } from '../testing/boundaries'
import { hopMs } from '../testing/route-marker'
import { rowsRead, type RowsRead } from '../testing/rows-read'
import { screensOf, type SignInScreens } from '../testing/screens-of'
import { useTestingSession } from '../testing/session-state'
import { CHANGED_BY_WORDS, defaultBoardForm, factsOf, todayIn, type FormField, type FormIssue, type SignInForm } from '../testing/sign-in-form'
import { columnView, columnsFor, routeOf, runColumns, standingWatch, type ColumnResult, type ColumnView, type RouteModel } from './try-sign-in'
import { FIRST_RUN, firstTrack, landedSentence, landingMs, nextTrack, openRun, replayRun, runAfterPatch, travelStops } from './try-sign-in-run'

/* -----------------------------------------------------------------------------
   Try a sign-in's state on the board: the sign-in, its run, and where the
   marker is.

   The sign-in itself is the testing session's (`boardForms`, one per policy),
   so it outlasts the board: leave HRMS, come back, and Kavya from the office
   is still what is being tried. Everything else here is the run in front of
   the admin — whether the marker is travelling, the stage it has reached,
   what the status region last said — and goes with the board.

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
  screens: SignInScreens[]
  /** The stage the marker stands on — or, while it travels, is on its way to — and how it gets there. */
  at: number
  ms: number
  fadeIn: boolean
  /** While a run travels, the last stage the marker has arrived at; null once it has landed. */
  reached: number | null
  /** Content may fade: not under reduced motion, not while a slider is held. */
  fade: boolean
  /** "IP address": what moved the answer last, or null since the run began. */
  changed: string | null
  /** The status region's words. */
  said: string
  replay: () => void
}

const NO_ROWS: RowsRead = { rows: new Set(), device: new Set() }

export function useTrySignIn({ on, saved, draft, env }: { on: boolean; saved: Policy; draft: Policy; env: SimEnv }): TrySignIn | null {
  const store = useBrand()
  const session = useTestingSession()
  const reduced = useReducedMotion() === true
  const today = useMemo(() => todayIn(), [])

  /* The policy's sign-in, or where it starts: somebody it is for, on its first
     application, from the office at 09:30 today (sign-in-form.ts).

     Scoped to the draft's applications, always. The session keeps the sign-in
     past the board (`boardForms`), and the applications can change under it —
     on the start node's pane, or while test mode was closed — so a sign-in to
     an application this policy no longer protects is moved onto its first
     one. Without that the sentence went on naming Jira beside a spine that
     said "Does not cover Jira" (review, 29 Sep 2026). The Global Default, and
     a draft with no applications (tried "as if on" any), keep what was
     chosen. */
  const stored = session.boardForms[saved.id]
  const { users, apps, zones, fingerprints, policies, methods, defaultMethodId } = store
  const form = useMemo(() => {
    const f = stored ?? defaultBoardForm(draft, users, apps, today)
    if (draft.isSystem || draft.appIds.length === 0 || (f.appId !== null && draft.appIds.includes(f.appId))) return f
    const first = appsOf(draft, apps)[0]
    return first ? { ...f, appId: first.id } : f
  }, [stored, draft, users, apps, today])
  /* And the session keeps the move, so the application does not come back
     from under a later edit. The same sign-in either way: nothing is "Changed
     by" in it, and nothing replays. */
  const keepBoard = session.loadBoard
  useEffect(() => {
    if (stored && stored.appId !== form.appId) keepBoard(saved.id, form)
  }, [stored, form, saved.id, keepBoard])

  const rows = useMemo(() => (on ? rowsRead(policies, draft, form.appId, { zones, fingerprints }) : NO_ROWS), [on, policies, draft, form.appId, zones, fingerprints])
  const { facts, issues } = useMemo(() => factsOf(form, zones), [form, zones])
  const cols = useMemo(() => (on ? runColumns(columnsFor(saved, draft, form.appId), policies, facts, env) : []), [on, saved, draft, form.appId, policies, facts, env])
  const right = cols.at(-1)
  const route = useMemo(() => (right ? routeOf(right, draft, facts, env, policies) : null), [right, draft, facts, env, policies])
  const boundaries = useMemo<Boundaries>(
    () => (right ? boundariesOf(form, rows, right.spec.substitute ? { substitute: right.spec.substitute } : {}, policies, env, zones) : {}),
    [right, form, rows, policies, env, zones],
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
  /* Kept by identity, so what reads it — Which policy's list — can sit out a hop. */
  const watching = useMemo(() => standingWatch(cols), [cols])
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

  /* While a run travels, the stage the marker is leaving for and the one it
     has arrived at; the timers step both along and let go at the landing
     (`travelStops`). */
  const [travel, setTravel] = useState<{ run: number; at: number | null; reached: number | null }>({ run: -1, at: null, reached: null })
  useEffect(() => {
    if (!on || !travels) return
    const say = () => {
      const r = latest.current.route
      if (r) setTrack((t) => ({ ...t, said: landedSentence(r, run.id) }))
    }
    const hops = latest.current.landing
    const stops = travelStops(hops, run.delay)
    if (stops.length === 0) {
      setTravel({ run: run.id, at: null, reached: null })
      say()
      return
    }
    setTravel({ run: run.id, at: 0, reached: 0 })
    const timers = stops.map((s) => window.setTimeout(() => setTravel({ run: run.id, at: s.at, reached: s.reached }), s.ms))
    timers.push(
      window.setTimeout(() => {
        setTravel({ run: run.id, at: null, reached: null })
        say()
      }, landingMs(hops, run.delay)),
    )
    return () => timers.forEach((t) => window.clearTimeout(t))
  }, [on, travels, run])

  /* Before the effect has started this run's clock, the run stands at the
     start: the first frame of a run already has the marker there. */
  const current = travel.run === run.id
  const travelling = on && travels
  const reached = travelling ? (current ? travel.reached : 0) : null
  /* Never past where the route now lands: an update mid-run can shorten it. */
  const at = travelling ? (current ? Math.min(travel.at ?? landing, landing) : 0) : landing

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
    watching,
    route,
    screens,
    at,
    ms: motionNow === 'travel' ? hopMs(landing) : 0,
    fadeIn: motionNow === 'update',
    reached,
    fade: !reduced && !held.current,
    changed: track.run === run.id && track.changed ? CHANGED_BY_WORDS[track.changed] : null,
    said: track.said,
    replay,
  }
}
