import { AnimatePresence, motion, type Transition } from 'motion/react'
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { ChevronLeft, ChevronRight, LayoutGrid, Pause, Play } from 'lucide-react'

import { Tip } from '../../../kit'

import { useBrand } from '../../../store'
import type { EngineRun } from '../engine-run'
import { RunStage, type StageView } from './RunStage'
import { ASSISTANT_DOCK_PAD, AssistantDock, DockButton, DockSep } from './assistant/AssistantDock'
import type { Action, Answer, Target } from './assistant/intents'
import { useNarrator, type Narrator } from './assistant/voice'
import { SignInRow } from './shared/SignInRow'
import { FocusStageToggle } from './focus-theme'
import { useFocusStage } from './focus-stage'
import type { RunLayoutProps } from './types'
import { COMPACT_ROOM, FAR_COMPACT, PERSPECTIVE, blendPlaces, cardWidth, depthOf, focusPlaces, liftPlaces, overviewPlaces, shiftPlaces, stepPx, type Place } from './focus-geometry'
import { firstName, landedAt, momentAt, momentKeyOf, momentsOf, stateKeyOf, tallestOf, toneOf, type Moment, type Tone } from './focus-model'
import { sentenceTokens, tokenValue } from '../../testing/sign-in-sentence'
import { LitCtx, NoteCtx, type NoteState } from './focus-shared'
import { beatsOf, fixPossessive } from './focus-voice'
import { useFocusNarration } from './focus-speech'
import { Subtitle } from './focus-subtitle'
import { FocusCaption } from './focus-caption'
import { PoliciesMoment, SignInMoment } from './focus-cards'
import { RuleMoment } from './focus-rule'
import { OutcomeGhost, OutcomeMoment } from './focus-outcome'
import { FarFace, type FarNames } from './focus-far'
import './focus.css'

/* -----------------------------------------------------------------------------
   The run as FOCUS (run-layout.ts `focus`): one moment at a time, the whole
   run in reach (owner, 3 Oct 2026: the same sign-in row and assistant as
   Brief and Jarvis; the minimap he tried on the left was removed the same
   day, so the carousel has the canvas's whole width).

                 [Maya Iyer → AWS Console | Office network | ✎ | ↻ Replay]

        ┌──────┐   ┌────────────────────┐   ┌──────┐
        │policy│   │   RULE 2  ✓        │   │ out- │
        │      │   │ Who    ✓           │   │ come │
        └──────┘   │ Device ✓           │   └──────┘
                   └────────────────────┘
                     Rule 2 matches.             ← the subtitle, under its card
               [ Ask about this sign-in…                 ]
               [ − 100% + ⤢ | ▶ Walk through ‹ 4 / 7 › ▦ | ◐ 🔈 ]

   TOP: the shared SignInRow (shared/SignInRow.tsx). MIDDLE: the carousel —
   the moment the engine is at is one big card in focus (its full face); the
   ones before recede to the left, the ones to come wait to the right, each
   showing its FAR FACE (focus-far.tsx): what that moment found, readable at
   a distance. The landed answer never leaves the stage: stepped back from,
   it recedes with the rest, or peeks at the right edge (focus-geometry.ts).
   BOTTOM: the shared AssistantDock — its answers drive the carousel; row 2
   holds Focus's own controls: Walk through (Pause / Resume), ‹ 4 / 7 ›,
   Overview; then the stage toggle.

   Poke it: a receded card (it lifts as the pointer reaches it), a drag (the
   row turns as it passes the middle), a sideways swipe, ← → Home End; a row
   in the card in focus for its why; Esc lets go of what is open. The row is
   one Tab stop; Tab goes on into the card in focus, then to the dock.

   The world is the view's size (the carousel IS the camera), so the stage
   fits it at zoom 1 and words keep their size. Nothing motion moves carries
   a CSS transform or transition: each card's slot is motion's; the card in
   it takes the colour transitions.
   -------------------------------------------------------------------------- */

/* The subtitle's room under the card in focus; the sign-in row's room on top. */
const SUB_H = 46
const TOP_PAD = 64
/* The carousel's room either side, inside the canvas. */
const SIDE_PAD = 16
/* Walk through: each moment held for its line + this, voice on; or this long, muted. */
const WALK_PAD = 250
const WALK_MUTED = 1400
/* The sign-in is held in focus at least this long from its first painted frame: its 220 ms entry, then 900 ms whole. */
const SIGN_HOLD = 1150
/* A newcomer stands behind the card leaving the focus this long. */
const ENTRY_MS = 260
/* A far face's height, for Overview's grid. */
const FAR_H = 152
const FAR_H_COMPACT = 178
/* A sideways swipe: this much travel steps one moment, then a pause for the trackpad's momentum. */
const SWIPE_PX = 80
const SWIPE_LOCK = 320
const FLICK = 0.45
const SPRING = { type: 'spring' as const, stiffness: 190, damping: 26, mass: 1 }
const NONE = { duration: 0 }
const EASE = [0.2, 0, 0, 1] as const

/* The room the carousel has: `ready` once read off the canvas (never fit the camera to the guess). */
function useRoom(el: HTMLElement | null): { w: number; h: number; ready: boolean } {
  const [room, setRoom] = useState({ w: 1080, h: 660, ready: false })
  useLayoutEffect(() => {
    const ground = el?.closest<HTMLElement>('.rstage')
    if (!ground) return
    const read = () => {
      const w = Math.round(Math.min(1480, Math.max(560, ground.clientWidth - 2 * SIDE_PAD)))
      const h = Math.round(Math.min(860, Math.max(420, ground.clientHeight - TOP_PAD - ASSISTANT_DOCK_PAD - 4)))
      setRoom((r) => (r.w === w && r.h === h && r.ready ? r : { w, h, ready: true }))
    }
    read()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(read)
    ro.observe(ground)
    return () => ro.disconnect()
  }, [el])
  return room
}

type WalkState = 'idle' | 'walking' | 'paused'

/* Walk through, in the dock's row 2: a text button (blue while it walks; never orange). Walking it reads Pause, paused
   Resume — and wears no tip, so nothing sits over the ask field. It waits, still focusable, while the run plays. */
function WalkThrough({ state, wait, onPress, btnRef }: { state: WalkState; wait: string | null; onPress: () => void; btnRef: (el: HTMLButtonElement | null) => void }) {
  const on = state !== 'idle'
  const button = (
    <button
      ref={btnRef}
      type="button"
      className={`ad-btn rl-focus__walk${on ? ' is-on' : ''}`}
      aria-pressed={on}
      aria-disabled={wait ? true : undefined}
      onClick={() => {
        if (!wait) onPress()
      }}
    >
      {state === 'walking' ? <Pause size={13} strokeWidth={2.2} aria-hidden /> : <Play size={13} strokeWidth={2.2} aria-hidden />}
      <span>{state === 'walking' ? 'Pause' : state === 'paused' ? 'Resume' : 'Walk through'}</span>
    </button>
  )
  if (on) return <span className="bx-tip">{button}</span>
  return (
    <Tip text={wait ?? 'Walk through the run from the sign-in (Space)'} placement="top">
      {button}
    </Tip>
  )
}

/* A receded card's button, by what the card is. */
function pickLabel(m: Moment, plan: RunLayoutProps['plan']): string {
  if (m.kind === 'sign') return 'Show the sign-in'
  if (m.kind === 'policies') return 'Show the policies'
  if (m.kind === 'outcome') return 'Show the outcome'
  const r = plan.rules[m.rule ?? -1]
  return r && r.index !== null ? `Show rule ${r.index + 1}` : 'Show the last rule'
}

/* The moment, named for the row's label: "Rule 2, Contractors in the office". */
function momentName(m: Moment | undefined, plan: EngineRun, person: string, landed: boolean): string {
  if (!m) return ''
  if (m.kind === 'sign') return `Sign-in, ${person}`
  if (m.kind === 'policies') return plan.decider ? `Policies, ${plan.decider.name}` : 'Policies'
  if (m.kind === 'outcome') {
    const o = plan.outcome
    if (!landed) return 'Outcome, deciding'
    return `Outcome, ${o.status === 'decided' && o.decision ? (o.decision === 'deny' ? 'Deny' : 'Allow') : o.status === 'depends' ? 'Depends' : 'no policy decides'}`
  }
  const r = plan.rules[m.rule ?? -1]
  return r ? `${r.index === null ? 'Last rule' : `Rule ${r.index + 1}`}, ${r.name}` : 'Rule'
}

/* The card in focus, its full face: memoised on what makes it look different, so a step of the clock re-renders only
   the card it changes. Callbacks come through a ref, so a new one never re-renders it. */
interface FullProps {
  m: Moment
  stateKey: string
  extra: string
  props: RunLayoutProps
  plan: EngineRun
  s: number
  landed: boolean
  animate: boolean
  focused: boolean
  inert: boolean
  first: string
  tone: Tone
  wide: boolean
  denyMessage: string
  pulse: boolean
  calls: { current: { openRule: ((ruleIndex: number) => void) | null; closest: (ruleIndex: number) => void } }
}
const FullFace = memo(
  function FullFace({ m, props, plan, s, landed, animate, focused, inert, first, tone, wide, denyMessage, pulse, calls }: FullProps) {
    if (m.kind === 'sign') return <SignInMoment props={props} landed={landed} />
    if (m.kind === 'policies') return <PoliciesMoment plan={plan} s={s} first={first} landed={landed} animate={animate} focused={focused} />
    if (m.kind === 'rule') {
      const ri = m.rule ?? -1
      const r = plan.rules[ri]
      const open = calls.current.openRule
      return r ? <RuleMoment plan={plan} r={r} s={s} landed={landed} animate={animate} focused={focused} first={first} denyMessage={denyMessage} pulse={pulse} onOpen={open ? () => calls.current.openRule?.(ri) : undefined} /> : null
    }
    const deciding = plan.steps[s]?.kind === 'deciding'
    return landed ? <OutcomeMoment props={props} tone={tone} animate={animate} inert={inert} onClosest={(i) => calls.current.closest(i)} /> : <OutcomeGhost deciding={deciding} wide={wide} />
  },
  (a, b) =>
    a.stateKey === b.stateKey &&
    a.extra === b.extra &&
    a.m === b.m &&
    a.plan === b.plan &&
    a.animate === b.animate &&
    a.focused === b.focused &&
    a.inert === b.inert &&
    a.first === b.first &&
    a.tone === b.tone &&
    a.wide === b.wide &&
    a.denyMessage === b.denyMessage &&
    a.pulse === b.pulse,
)

const TABBABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
function tabbables(root: Element | null | undefined): HTMLElement[] {
  if (!root) return []
  return [...root.querySelectorAll<HTMLElement>(TABBABLE)].filter((el) => el.tabIndex >= 0 && !el.closest('[inert]') && el.getClientRects().length > 0)
}

export default function FocusLayout(props: RunLayoutProps) {
  const { plan, s, animate, reduced, jumped, runKey, form, asGroup, running } = props
  const [theme] = useFocusStage()
  const { users, apps, zones } = useBrand()
  const stage = useRef<StageView | null>(null)
  const [worldEl, setWorldEl] = useState<HTMLDivElement | null>(null)
  const room = useRoom(worldEl)

  const moments = useMemo(() => momentsOf(plan), [plan])
  const landed = landedAt(plan, s)
  const tone = toneOf(plan)
  const person = users.find((u) => u.id === form.personId) ?? null
  const first = asGroup ?? (person ? firstName(person.name) : plan.conflicts?.personName ? firstName(plan.conflicts.personName) : 'them')
  const personName = asGroup ? `Anyone in ${asGroup}` : (person?.name ?? plan.conflicts?.personName ?? 'Someone')
  const app = apps.find((a) => a.id === form.appId) ?? null
  const names = useMemo<FarNames>(() => ({ person: personName, first, group: !!asGroup, appId: app?.id ?? null, appName: app?.name ?? plan.appName ?? 'the application' }), [personName, first, asGroup, app, plan.appName])

  // --- The sign-in held: it keeps the focus at least SIGN_HOLD from its first painted frame ---
  const holdable = !reduced && !jumped && (animate || running)
  const [hold, setHold] = useState({ key: runKey, on: holdable })
  if (hold.key !== runKey) setHold({ key: runKey, on: holdable })
  useEffect(() => {
    if (!hold.on) return
    const key = hold.key
    const done = () => setHold((h) => (h.key === key ? { ...h, on: false } : h))
    let t = 0
    let r2 = 0
    const r1 = window.requestAnimationFrame(() => {
      r2 = window.requestAnimationFrame(() => {
        t = window.setTimeout(done, SIGN_HOLD)
      })
    })
    /* A pane that paints no frames still lets go. */
    const safety = window.setTimeout(done, SIGN_HOLD + 700)
    return () => {
      window.cancelAnimationFrame(r1)
      window.cancelAnimationFrame(r2)
      window.clearTimeout(t)
      window.clearTimeout(safety)
    }
  }, [hold.on, hold.key])

  /* The cards on the row: every moment reached — the outcome too, only once the run reaches it (owner, 3 Oct 2026:
     "while playing, don't showcase the outcome always; it should be like the other cards, progressive disclosure"). */
  const shown = useMemo(() => moments.filter((m) => landed || s >= m.at), [moments, landed, s])
  const holding = hold.on && !landed && !reduced && !jumped
  const live = holding ? 0 : Math.min(shown.length - 1, momentAt(moments, s, landed))

  // --- The assistant: the answer on show, and the phrase pointed at in it ---
  const [zoom, setZoom] = useState(1)
  const [answerOn, setAnswerOn] = useState<Answer | null>(null)
  const [cite, setCite] = useState<Target | null>(null)
  /* Pinned by a press of the view's own: What they see (the outcome's), lit as an answer's target is. */
  const [pin, setPin] = useState<Target | null>(null)
  const lit: Target | null = cite ?? pin ?? answerOn?.focus ?? null

  // --- Who holds the focus: the clock, or the admin ---
  const [user, setUser] = useState<number | null>(null)
  const [overview, setOverview] = useState(false)
  /* The card in focus when Overview opened: it wears the ring there. */
  const [ovFrom, setOvFrom] = useState(0)
  const [ovAnim, setOvAnim] = useState(false)
  const [poked, setPoked] = useState(false)
  /* Skipped to the end: no motion, until the admin pokes it. */
  const instant = reduced || (jumped && !poked)
  const [note, setNote] = useState<string | null>(null)
  const [walk, setWalk] = useState({ on: false, paused: false, id: 0 })
  const [seen, setSeen] = useState({ runKey, landed })
  const [landedMs, setLandedMs] = useState(0)
  if (seen.runKey !== runKey || seen.landed !== landed) {
    /* A new run: the clock has the focus. The run lands: the answer takes it (depth carries the rest: no dim). */
    setSeen({ runKey, landed })
    setUser(null)
    setNote(null)
    setPin(null)
    if (walk.on) setWalk((w) => ({ ...w, on: false, paused: false }))
    if (landed && seen.runKey === runKey && !instant) setLandedMs(performance.now())
    if (seen.runKey !== runKey) {
      setOverview(false)
      setPoked(false)
      setAnswerOn(null)
      setCite(null)
    }
  }
  const focus = Math.max(0, Math.min(shown.length - 1, user ?? live))
  const reachedCount = shown.length

  // --- Where the cards stand ---
  const compact = room.w < COMPACT_ROOM
  const cw = cardWidth(room.w)
  const farW = compact ? FAR_COMPACT : cw
  const bandH = room.h - SUB_H - 6
  const [heights, setHeights] = useState<Record<string, number>>({})
  /* The answer is the one wide card, its words beside What they see — wide from the moment it is reached, so the
     verdict lands in the same box. */
  const outWide = props.screens.length > 0 && form.appId !== null
  const facts = sentenceTokens(props.rows).filter((t) => t !== 'person' && t !== 'app').length
  const planned = useMemo(() => tallestOf(plan, moments, facts, outWide), [plan, moments, facts, outWide])
  /* The top line is set on a new run, a landing, a new room or Overview — never as a note or a finding opens: a card
     grows downwards and moves nothing else. */
  const [measured, setMeasured] = useState(0)
  const tallest = Math.min(bandH, Math.max(planned, measured))
  const top = Math.round(Math.max(4, (room.h - SUB_H - tallest) / 2))
  const fullWs = useMemo(() => shown.map((m) => (m.kind === 'outcome' && outWide ? Math.round(cw * 1.52) : cw)), [shown, outWide, cw])
  const widthsAt = useCallback((fi: number) => fullWs.map((w, i) => (i === fi ? w : farW)), [fullWs, farW])
  const keep = landed ? shown.length - 1 : -1
  const placesAt = useCallback((fi: number) => focusPlaces(shown.length, fi, room.w, widthsAt(fi), top, keep), [shown.length, room.w, widthsAt, top, keep])

  // --- A drag: the focus follows the hand, fractionally ---
  const [dragF, setDragF] = useState<number | null>(null)
  const dragging = dragF !== null
  const STEP = stepPx(cw)
  const faceAt = dragging ? Math.max(0, Math.min(reachedCount - 1, Math.round(dragF))) : focus

  const places: Place[] = useMemo(() => {
    if (overview) return overviewPlaces(shown.length, room.w, farW, 4, shown.map(() => (compact ? FAR_H_COMPACT : FAR_H)), bandH)
    if (dragF === null) return placesAt(focus)
    const max = Math.max(0, reachedCount - 1)
    if (dragF <= 0) return shiftPlaces(placesAt(0), -dragF * STEP)
    if (dragF >= max) return shiftPlaces(placesAt(max), -(dragF - max) * STEP)
    const a = Math.floor(dragF)
    const b = Math.min(max, a + 1)
    return blendPlaces(placesAt(a), placesAt(b), dragF - a, widthsAt(faceAt))
  }, [overview, shown, room.w, farW, compact, bandH, dragF, placesAt, focus, reachedCount, STEP, widthsAt, faceAt])

  /* The assistant's thread, while it is open over the lower canvas: its panel's top in world space (null: folded).
     The dock is outside the zoomed world and never moved by motion, so its box is read as it stands. */
  const [threadTop, setThreadTop] = useState<number | null>(null)
  useLayoutEffect(() => {
    const world = worldEl
    const dock = world?.closest<HTMLElement>('.rstage')?.querySelector<HTMLElement>('.rl-focus__dock')
    const panel = dock?.querySelector<HTMLElement>('.ad__panel')
    if (!world || !dock || !panel) return
    let raf = 0
    const read = () => {
      window.cancelAnimationFrame(raf)
      raf = window.requestAnimationFrame(() => {
        if (!dock.classList.contains('is-open')) {
          setThreadTop(null)
          return
        }
        const z = stage.current?.zoom() || 1
        const y = Math.round((panel.getBoundingClientRect().top - world.getBoundingClientRect().top) / z)
        setThreadTop((v) => (v !== null && Math.abs(v - y) < 6 ? v : y))
      })
    }
    read()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(read) : null
    ro?.observe(panel)
    const mo = typeof MutationObserver !== 'undefined' ? new MutationObserver(read) : null
    mo?.observe(dock, { attributes: true, attributeFilter: ['class'] })
    return () => {
      window.cancelAnimationFrame(raf)
      ro?.disconnect()
      mo?.disconnect()
    }
  }, [worldEl])
  const asking = threadTop !== null
  /* Asking: the cards rise above the thread, so the one the answer is about is never under it. */
  const placed = useMemo(
    () => (threadTop !== null ? liftPlaces(places, shown.map((m) => heights[m.key] ?? tallest), threadTop - 14) : places),
    [threadTop, places, shown, heights, tallest],
  )

  /* Each card's height, by its layout box (never its transformed one): the card, not the slot (which also holds the subtitle). */
  const faces = useRef(new Map<string, HTMLDivElement>())
  useLayoutEffect(() => {
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      setHeights((h) => {
        let next = h
        faces.current.forEach((el, key) => {
          const v = el.offsetHeight
          if (v > 0 && h[key] !== v) next = next === h ? { ...h, [key]: v } : { ...next, [key]: v }
        })
        return next
      })
    })
    faces.current.forEach((el) => ro.observe(el))
    return () => ro.disconnect()
  }, [shown.length, runKey])
  useLayoutEffect(() => {
    const el = worldEl?.querySelector<HTMLElement>('.rl-focus__slot.is-focus .rl-focus__faces')
    setMeasured(el ? el.offsetHeight : 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on a new run, a landing, a new room or Overview
  }, [runKey, landed, room.w, room.h, overview, worldEl])

  const notes = useMemo<NoteState>(() => ({ open: note, toggle: (id) => setNote((n) => (n === id ? null : id)), inert: false }), [note])
  const recededNotes = useMemo<NoteState>(() => ({ open: null, toggle: () => {}, inert: true }), [])

  // --- The camera: the world is the view, fitted at zoom 1 — jumped, never glided, as the room settles after Run ---
  useLayoutEffect(() => {
    if (room.ready) stage.current?.fit({ max: 1, jump: true })
  }, [runKey, room.w, room.h, room.ready])
  useEffect(() => {
    if (landed) stage.current?.fit({ max: 1, jump: true })
  }, [landed])

  // --- The voice: each moment's line, said as it settles; the subtitle under the card in focus ---
  const narrator = useNarrator({ runKey, running, jumped, reduced })
  const fromText = useMemo(() => {
    try {
      const v = tokenValue('from', form, { people: users, apps, zones, rows: props.rows })
      return v.unset ? null : (v.text.split(' · ')[0] ?? null)
    } catch {
      return null
    }
  }, [form, users, apps, zones, props.rows])
  const beats = useMemo(
    () => beatsOf(plan, moments, { person: personName, first: asGroup ? 'them' : first, app: plan.appName || 'the application', from: fromText }, props.screens),
    [plan, moments, asGroup, personName, first, fromText, props.screens],
  )
  const order = useMemo(() => moments.map((m) => m.key), [moments])
  useFocusNarration({ narrator, plan, beats, s, landed, runKey, quiet: jumped, order, focusKey: shown[focus]?.key ?? null })
  const narratorRef = useRef<Narrator>(narrator)
  useLayoutEffect(() => {
    narratorRef.current = narrator
  })

  // --- Poking it: a receded card, ← →, a drag, a swipe, Walk through ---
  const walkOn = useRef(false)
  useLayoutEffect(() => {
    walkOn.current = walk.on
  })
  /* Esc, a new run, Overview or an answer stops a walk (and its voice). */
  const stopWalk = useCallback(() => {
    if (!walkOn.current) return
    walkOn.current = false
    narratorRef.current.cancel()
    setWalk((w) => ({ ...w, on: false, paused: false }))
  }, [])
  /* Bring card `i` to the front. `go`: a step of the admin's own (‹ ›, a press, a drag, a swipe) — a walk moves there
     and carries on from it; otherwise (an answer) a walk stops. */
  const pick = useCallback(
    (i: number, go = false) => {
      setPoked(true)
      setOverview(false)
      setNote(null)
      setPin(null)
      if (go && walkOn.current) narratorRef.current.cancel()
      else stopWalk()
      /* Back on the moment the engine is at, while it plays: follow it again. */
      setUser(!landed && i === live ? null : i)
    },
    [landed, live, stopWalk],
  )
  const stepBy = useCallback((d: number) => pick(Math.max(0, Math.min(reachedCount - 1, focus + d)), true), [pick, reachedCount, focus])
  const startWalk = useCallback(() => {
    narratorRef.current.cancel()
    walkOn.current = true
    setPoked(true)
    setOverview(false)
    setNote(null)
    setPin(null)
    setUser(0)
    setWalk((w) => ({ on: true, paused: false, id: w.id + 1 }))
  }, [])
  const walkState: WalkState = !walk.on ? 'idle' : walk.paused ? 'paused' : 'walking'
  const walkBtn = useRef<HTMLButtonElement | null>(null)
  const refocusWalk = useRef(false)
  const pressWalk = useCallback(() => {
    refocusWalk.current = document.activeElement === walkBtn.current
    if (!walkOn.current) startWalk()
    else
      setWalk((w) => {
        if (!w.paused) narratorRef.current.cancel()
        return { ...w, paused: !w.paused, id: w.id + 1 }
      })
  }, [startWalk])
  useLayoutEffect(() => {
    if (!refocusWalk.current) return
    refocusWalk.current = false
    walkBtn.current?.focus({ preventScroll: true })
  }, [walkState])
  /* The landed run again, a moment at a time: each line said whole and then a beat (voice on), or held muted; then
     the next; it ends on the outcome. The view only: the plan and the clock stay where they are. */
  useEffect(() => {
    if (!walk.on || walk.paused) return
    let gone = false
    const u = user ?? 0
    const b = beats.find((x) => x.key === shown[u]?.key)
    const n = narratorRef.current
    const voiced = !!b && !n.muted && n.available
    const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms))
    /* A voice that never says it has ended (a stalled engine) still lets the walk go on, after about the line's length. */
    const said = voiced && b ? Promise.race([n.say(b.line, { gesture: true }).catch(() => {}), wait(500 + b.line.length * 70)]).then(() => wait(WALK_PAD)) : wait(WALK_MUTED)
    void said.then(() => {
      if (gone) return
      if (u >= shown.length - 1) setWalk((w) => ({ ...w, on: false, paused: false }))
      else setUser(Math.min(shown.length - 1, u + 1))
    })
    return () => {
      gone = true
    }
  }, [walk.on, walk.paused, walk.id, user, shown, beats])
  if (walk.on && !landed) setWalk((w) => ({ ...w, on: false, paused: false }))

  /* An answer (or a phrase in it) brings what it is about into focus: its card, or Overview for every check. */
  const openOverview = useCallback(
    (on: boolean) => {
      setPoked(true)
      stopWalk()
      setNote(null)
      if (on) setOvFrom(focus)
      setOverview(on)
      setOvAnim(true)
    },
    [stopWalk, focus],
  )
  useEffect(() => {
    if (!ovAnim) return
    const t = window.setTimeout(() => setOvAnim(false), 700)
    return () => window.clearTimeout(t)
  }, [ovAnim, overview])
  const bring = useCallback(
    (t: Target | null | undefined, a?: Answer | null) => {
      if (a?.kind === 'checks') {
        openOverview(true)
        return
      }
      if (!t) return
      const key = momentKeyOf(t, moments, plan)
      const i = key ? shown.findIndex((m) => m.key === key) : -1
      if (i >= 0) pick(i)
    },
    [moments, plan, shown, pick, openOverview],
  )
  const onAnswer = useCallback(
    (a: Answer | null) => {
      setAnswerOn(a)
      setCite(null)
      if (a) bring(a.focus, a)
    },
    [bring],
  )
  const onCite = useCallback(
    (t: Target | null) => {
      setCite(t)
      if (t) bring(t)
      else if (answerOn) bring(answerOn.focus, answerOn)
    },
    [bring, answerOn],
  )
  /* The dock's presses that are the view's own: What they see (the outcome's), every check (Overview). */
  const onAction = useCallback(
    (a: Action): boolean => {
      if (a.kind === 'checks') {
        openOverview(true)
        return true
      }
      if (a.kind === 'see') {
        const i = shown.findIndex((m) => m.kind === 'outcome')
        if (i >= 0 && landed) {
          pick(i)
          setPin('screens')
        }
        return true
      }
      return false
    },
    [shown, landed, pick, openOverview],
  )

  /* The card in focus's own presses, through a ref so its memo holds: open a rule, bring the closest rule. */
  const calls = useRef<FullProps['calls']['current']>({ openRule: null, closest: () => {} })
  useLayoutEffect(() => {
    const d = plan.decider
    calls.current = {
      openRule: d
        ? (ri: number) => {
            const r = plan.rules[ri]
            if (!r) return
            if (r.index === null) props.onOpenPolicy(d.id)
            else props.onOpenRule(d.id, r.id)
          }
        : null,
      closest: (ri: number) => {
        const i = shown.findIndex((m) => m.kind === 'rule' && m.rule === ri)
        if (i >= 0) pick(i, true)
      },
    }
  })

  const rootRef = useRef<HTMLDivElement | null>(null)
  const bandRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const root = rootRef.current
      const t = e.target instanceof HTMLElement ? e.target : null
      /* Inside the view (the row, the cards, the dock), or nowhere in particular. */
      if (!root || e.defaultPrevented || (t && t !== document.body && !root.contains(t))) return
      /* Tab in reading order: the sign-in row, the carousel (one stop), the card in focus, then the dock. */
      if (e.key === 'Tab' && t && root.contains(t)) {
        const band = bandRef.current
        const list = [...tabbables(root.querySelector('.sir')), ...(band ? [band] : []), ...tabbables(band?.querySelector('.rl-focus__slot.is-focus')), ...(overview ? tabbables(band).filter((x) => x.classList.contains('rl-focus__pick')) : []), ...tabbables(root.querySelector('.rl-focus__dock'))]
        const at = list.indexOf(t)
        const next = at < 0 ? -1 : at + (e.shiftKey ? -1 : 1)
        if (at >= 0 && next >= 0 && next < list.length) {
          e.preventDefault()
          list[next].focus()
        }
        return
      }
      if (t?.closest('input, textarea, select, [contenteditable="true"], [role="menu"], [role="listbox"]')) return
      if (e.altKey || e.ctrlKey || e.metaKey) return
      if (e.key === ' ' && t === bandRef.current) {
        e.preventDefault()
        if (landed && !plan.empty) pressWalk()
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (overview) return
        e.preventDefault()
        stepBy(e.key === 'ArrowRight' ? 1 : -1)
      } else if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault()
        pick(e.key === 'Home' ? 0 : reachedCount - 1, true)
      } else if (e.key === 'Escape') {
        /* One thing let go at a time: the walk (and any note opened on it), the note, Overview, what is pinned, then the open chat. */
        if (walkOn.current) {
          stopWalk()
          setNote(null)
        } else if (note) setNote(null)
        else if (overview) openOverview(false)
        else if (pin) setPin(null)
        else root.querySelector<HTMLButtonElement>('.rl-focus__dock.is-open [data-ad-fold]')?.click()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [stepBy, pick, reachedCount, note, overview, pin, stopWalk, openOverview, landed, plan.empty, pressWalk])

  /* A sideways swipe over the row (a trackpad's two fingers, or Shift + the wheel): each SWIPE_PX of travel steps one
     moment, then waits out the momentum. The wheel alone and Ctrl/⌘ + the wheel stay the stage's (pan, zoom); zoomed
     in, the wheel pans. */
  const go = useRef({ stepBy, overview })
  useLayoutEffect(() => {
    go.current = { stepBy, overview }
  })
  useEffect(() => {
    const band = bandRef.current
    if (!band) return
    let acc = 0
    let lock = 0
    let last = 0
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey || go.current.overview) return
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.shiftKey ? e.deltaY : 0
      if (!d) return
      if ((stage.current?.zoom() ?? 1) > 1.01) return
      const now = performance.now()
      if (now - last > 200) acc = 0
      last = now
      if (now < lock) {
        acc = 0
        return
      }
      acc += d * (e.deltaMode === 1 ? 16 : 1)
      if (Math.abs(acc) < SWIPE_PX) return
      e.preventDefault()
      go.current.stepBy(acc > 0 ? 1 : -1)
      acc = 0
      lock = now + SWIPE_LOCK
    }
    band.addEventListener('wheel', onWheel, { passive: false })
    return () => band.removeEventListener('wheel', onWheel)
  }, [runKey])

  /* A drag across the row: the focus follows the hand — the cards turn and grow as they pass the middle; past an end
     the row gives a third as much and springs back. Let go: a flick moves one moment, else the nearest card. */
  const drag = useRef<{ id: number; x0: number; y0: number; on: boolean; from: number; vx: number; lx: number; lt: number } | null>(null)
  const swallow = useRef(false)
  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    /* A press on the row (not on a control) gives it the keyboard, so ← → move the focus from there. */
    if (e.target instanceof HTMLElement && !e.target.closest('button, a, input, [tabindex]:not([tabindex="-1"])')) e.currentTarget.focus({ preventScroll: true })
    if (e.button !== 0 || overview) return
    drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, on: false, from: focus, vx: 0, lx: e.clientX, lt: e.timeStamp }
  }
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    const dx = e.clientX - d.x0
    if (!d.on) {
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(e.clientY - d.y0)) return
      d.on = true
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        /* A pointer the page made up: no capture, the drag still follows it. */
      }
      setHover(null)
    }
    const dt = Math.max(1, e.timeStamp - d.lt)
    d.vx = 0.6 * ((e.clientX - d.lx) / dt) + 0.4 * d.vx
    d.lx = e.clientX
    d.lt = e.timeStamp
    const z = stage.current?.zoom() || 1
    const raw = d.from - dx / z / STEP
    const max = Math.max(0, reachedCount - 1)
    setDragF(raw < 0 ? raw * 0.3 : raw > max ? max + (raw - max) * 0.3 : raw)
  }
  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    drag.current = null
    if (!d.on) return
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* Never captured. */
    }
    swallow.current = true
    window.setTimeout(() => {
      swallow.current = false
    }, 0)
    const dx = e.clientX - d.x0
    const max = Math.max(0, reachedCount - 1)
    const z = stage.current?.zoom() || 1
    const raw = d.from - dx / z / STEP
    let to = Math.round(Math.max(0, Math.min(max, raw)))
    /* Quick 'n short: exactly one moment that way. Speed alone never skips more than one. */
    const recent = e.timeStamp - d.lt < 90
    if (recent && Math.abs(d.vx) > FLICK && Math.abs(dx) > 12 && to === d.from) to = Math.max(0, Math.min(max, d.from + (dx < 0 ? 1 : -1)))
    setDragF(null)
    if (to !== focus || user === null) pick(to, true)
  }

  /* A receded card lifts as the pointer (or the keyboard) reaches it: less turned, a little up, a little larger. */
  const [hover, setHover] = useState<number | null>(null)

  /* Newcomers: when each card first came, to bring it in from the right (behind the card leaving the focus). */
  const born = useRef(new Map<string, number>())
  const reachedAt = useRef(new Map<string, { hidden: boolean; at: number }>())
  const bornKey = useRef(runKey)
  if (bornKey.current !== runKey) {
    bornKey.current = runKey
    born.current = new Map()
    reachedAt.current = new Map()
  }
  const nowMs = performance.now()
  for (const m of shown) if (!born.current.has(m.key)) born.current.set(m.key, nowMs)
  const [, setTick] = useState(0)
  useEffect(() => {
    const t = window.setTimeout(() => setTick((n) => n + 1), ENTRY_MS + 20)
    return () => window.clearTimeout(t)
  }, [shown.length])
  const isNew = (key: string) => nowMs - (born.current.get(key) ?? 0) < ENTRY_MS
  /* A card coming back into reach (the row slid, the answer landed): it shows once it is most of the way in, never
     sliding in from past the edge at strength. When each last came into reach, by key. */
  const placedHidden = placed.map((p) => !!p?.hidden)
  shown.forEach((m, i) => {
    const was = reachedAt.current.get(m.key)
    const hidden = placedHidden[i] ?? false
    if (!was) reachedAt.current.set(m.key, { hidden, at: 0 })
    else if (was.hidden !== hidden) reachedAt.current.set(m.key, { hidden, at: hidden ? 0 : nowMs })
  })
  const comingBack = (key: string) => {
    const r = reachedAt.current.get(key)
    return !!r && !r.hidden && r.at > 0 && nowMs - r.at < 450
  }

  /* The subtitle: the line of the moment in focus, once what it says is on screen, under that card. */
  const inFocus = overview ? undefined : shown[focus]
  const beat = inFocus ? beats.find((b) => b.key === inFocus.key && (landed || s >= b.at)) : undefined
  const speaking = narrator.speaking
  const sayingIt = !!beat && speaking !== null && (speaking.endsWith(beat.line) || speaking.endsWith(beat.short))
  /* The run's own line being said, whichever: the caption under the card is its only caption. */
  const sayingBeat = speaking !== null && beats.some((b) => speaking.endsWith(b.line) || speaking.endsWith(b.short) || speaking.startsWith(b.short))
  /* Typed word by word only while the run plays a new line; browsing, the whole line crossfades. */
  const typedLines = useRef(new Set<string>())
  const typing = !!beat && !instant && user === null && !walk.on && !typedLines.current.has(beat.line)
  useLayoutEffect(() => {
    if (beat) typedLines.current.add(beat.line)
  })
  const sub = beat && inFocus && !asking ? { line: beat.line, tone: inFocus.kind === 'outcome' ? tone : 'neutral', speaking: sayingIt, typing } : null
  /* The line heard is shown once: under its card, on the answer in the open thread when it is that answer — never
     again on the dock's voice line. The assistant's lines say a policy's name without 's. */
  const sayingAnswer = !!answerOn && speaking !== null && speaking === fixPossessive(answerOn.say.trim())
  const dockNarrator = useMemo<Narrator>(
    () => ({ ...narrator, speaking: sayingBeat || sayingAnswer ? null : narrator.speaking, say: (line, opts) => narrator.say(fixPossessive(line), opts) }),
    [narrator, sayingBeat, sayingAnswer],
  )

  /* The deciding rule's Then says it once, as the verdict is reached. */
  const decidingNow = !landed && !instant && plan.steps[s]?.kind === 'deciding'
  const landingKey = plan.landing !== null ? plan.rules[plan.landing]?.node : undefined
  const denyMessage = useMemo(() => {
    for (const sc of props.screens) {
      const st = sc.steps.find((x) => x.kind === 'deny')
      if (st && st.kind === 'deny') return st.message
    }
    return ''
  }, [props.screens])
  const extra = `${props.screens.length}|${props.expected ?? ''}|${props.weaker ?? ''}|${props.changed ?? ''}|${props.columns.length}|${props.breakIn ? 1 : 0}|${form.appId ?? ''}`
  const recentLanding = landed && performance.now() - landedMs < 1500

  /* The cards either side not drawn whole (slivers and hidden), for the edge hints: "‹ 3 earlier", "2 later ›" (the
     kept answer's peek is in view, so not counted). */
  const earlier = overview ? 0 : placed.filter((p, i) => i < focus && (p.hidden || p.sliver)).length
  const later = overview ? 0 : placed.filter((p, i) => i > focus && (p.hidden || p.sliver) && !(i === keep && p.peek)).length
  const peekRight = !overview && placed.some((p, i) => i > focus && p.peek)
  /* The hints stand at the edge, just under the receded row on their side. */
  const hintTop = (side: -1 | 1) => {
    const h = (k: number) => heights[shown[k]?.key ?? ''] ?? (compact ? FAR_H_COMPACT : FAR_H)
    const ys = placed.map((p, i) => ({ p, i })).filter(({ p, i }) => !p.hidden && !p.peek && Math.sign(i - focus) === side).map(({ p, i }) => p.y + h(i) * p.scale)
    return Math.round((ys.length > 0 ? Math.max(...ys) : top + 140) + 24)
  }
  const bandLabel = `Moments of the run, ${focus + 1} of ${shown.length}: ${momentName(shown[focus], plan, personName, landed)}`

  const slotTransition = (i: number, m: Moment, hidden: boolean): Transition => {
    if (dragging || instant) return NONE
    if (ovAnim) return { type: 'spring', stiffness: 260, damping: 30, delay: i * 0.025 }
    let t: Transition = SPRING
    if (isNew(m.key) && animate) {
      t = i === 0 && m.kind === 'sign' ? { ...SPRING, scale: { duration: 0.22, ease: EASE }, opacity: { duration: 0.22, ease: EASE } } : { ...SPRING, opacity: { delay: 0.11, duration: 0.18, ease: EASE } }
    }
    /* A card going out of reach fades before it slides past the edge: never a hard-clipped sliver. */
    if (hidden) t = { ...t, opacity: { duration: 0.16, ease: EASE } }
    else if (comingBack(m.key) && !isNew(m.key)) t = { ...t, opacity: { delay: 0.24, duration: 0.2, ease: EASE } }
    return t
  }

  return (
    <div ref={rootRef} className="rl-focus-root" data-stage={theme}>
      <div className="rl-focus__backdrop" aria-hidden />
      <RunStage
        ref={stage}
        reduced={reduced}
        className="rl-focus"
        label={`Sign-in run: ${plan.appName}`}
        pad={{ top: TOP_PAD, bottom: ASSISTANT_DOCK_PAD, left: SIDE_PAD, right: SIDE_PAD }}
        externalDock
        onZoom={setZoom}
        overlay={
          <>
            <SignInRow run={props} look={theme} lit={lit === 'person' ? 'person' : null} previewing={answerOn?.previewing ?? null} />
            <AssistantDock
              run={props}
              narrator={dockNarrator}
              stage={stage}
              zoom={zoom}
              theme={theme}
              className="rl-focus__dock"
              controls={
                <>
                  <WalkThrough
                    state={walkState}
                    wait={running || !landed ? 'The run is playing' : plan.empty ? 'Run a sign-in first' : null}
                    onPress={pressWalk}
                    btnRef={(el) => {
                      walkBtn.current = el
                    }}
                  />
                  <DockSep />
                  <DockButton label="Previous moment" tip="Previous moment (←, Home)" disabled={overview || focus <= 0} onClick={() => stepBy(-1)}>
                    <ChevronLeft size={15} strokeWidth={2} />
                  </DockButton>
                  {landed && !plan.empty && (
                    <span className="rl-focus__pos" aria-hidden>
                      {focus + 1} / {shown.length}
                    </span>
                  )}
                  <DockButton label="Next moment" tip="Next moment (→, End)" disabled={overview || focus >= reachedCount - 1} onClick={() => stepBy(1)}>
                    <ChevronRight size={15} strokeWidth={2} />
                  </DockButton>
                  <DockButton label="Overview" tip={overview ? 'Back to focus' : 'Overview'} pressed={overview} onClick={() => openOverview(!overview)}>
                    <LayoutGrid size={14} strokeWidth={2} />
                  </DockButton>
                </>
              }
              trailing={<FocusStageToggle />}
              renderAnswer={(a, ctx) => (
                <FocusCaption answer={a} animate={ctx.animate} onCite={ctx.onCite} lit={ctx.latest ? lit : null} speaking={ctx.latest && sayingAnswer && a === answerOn} onStop={() => narrator.cancel()} />
              )}
              onAnswer={onAnswer}
              onCite={onCite}
              onAction={onAction}
            />
          </>
        }
      >
        <LitCtx.Provider value={lit}>
          <div key={runKey} ref={setWorldEl} className={`rl-focus__world${overview ? ' is-overview' : ''}${asking ? ' is-asking' : ''}`} style={{ width: room.w, height: room.h, '--ov-k': overview ? (placed[0]?.scale ?? 1) : 1 } as CSSProperties}>
            <div
              ref={bandRef}
              className={`rl-focus__band${dragging ? ' is-dragging' : ''}`}
              style={{ height: room.h }}
              data-card
              role="region"
              tabIndex={0}
              aria-roledescription="carousel"
              aria-label={bandLabel}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              onClickCapture={(e) => {
                if (!swallow.current) return
                e.preventDefault()
                e.stopPropagation()
              }}
            >
              <div className="rl-focus__track">
                {shown.map((m, i) => {
                  const p0 = placed[i]
                  if (!p0) return null
                  const isFocus = !overview && i === focus
                  const far = overview || i !== faceAt
                  const inert = !isFocus
                  const fresh = isNew(m.key) && animate && !instant
                  /* Lifted under the pointer; dimmed a step while the answer lands. */
                  let p = p0
                  if (hover === i && !isFocus && !dragging && !instant && !overview && !p0.hidden) p = { ...p, rotateY: p.rotateY * 0.6, y: p.y - 6, scale: p.scale + 0.02, opacity: 1 }
                  const depth = overview ? 0 : depthOf(p)
                  const w = p.w ?? (far ? farW : fullWs[i])
                  const z = fresh && isFocus && i > 0 ? 18 : p.z
                  const first0 = i === 0 && m.kind === 'sign'
                  const initial = fresh
                    ? first0
                      ? { x: p.x, y: p.y, scale: p.scale * 0.96, opacity: 0.6 }
                      : { x: p.x + Math.round(w * 0.4), y: p.y + 16, scale: p.scale * 0.92, opacity: 0 }
                    : false
                  const sk = stateKeyOf(m, plan, s, landed)
                  return (
                    <motion.div
                      key={m.key}
                      className={`rl-focus__slot${isFocus ? ' is-focus' : ''}${p.rotateY > 0 ? ' is-left' : p.rotateY < 0 ? ' is-right' : ''}${p.hidden ? ' is-hidden' : ''}${p.peek ? ' is-peek' : ''}${p.sliver ? ' is-sliver' : ''}${overview && i === ovFrom ? ' is-from' : ''}${hover === i && !isFocus ? ' is-hover' : ''}`}
                      data-depth={depth}
                      style={{ width: w, zIndex: z, originX: 0.5, originY: 0 }}
                      initial={initial}
                      animate={{ x: p.x, y: p.y, scale: p.scale, opacity: p.opacity }}
                      transition={slotTransition(i, m, p.hidden)}
                      aria-hidden={p.hidden || undefined}
                    >
                      {/* The turn, about the card's own centre: each card is its own window, seen square-on from in front of
                          it, so a turned card narrows towards its far edge and never tilts or spills into its neighbour. */}
                      <motion.div
                        className="rl-focus__turn"
                        style={{ originX: 0.5, originY: 0.5, transformPerspective: PERSPECTIVE }}
                        initial={fresh && !first0 ? { rotateY: -12 } : false}
                        animate={{ rotateY: p.rotateY }}
                        transition={dragging || instant ? NONE : ovAnim ? { duration: 0.14, ease: EASE } : SPRING}
                      >
                        <div
                          className="rl-focus__faces"
                          ref={(el: HTMLDivElement | null) => {
                            if (el) faces.current.set(m.key, el)
                            else faces.current.delete(m.key)
                          }}
                        >
                          <AnimatePresence mode="popLayout" initial={false}>
                            <motion.div key={far ? 'far' : 'full'} className="rl-focus__face" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: instant ? 0 : 0.14, ease: EASE }}>
                              <NoteCtx.Provider value={inert ? recededNotes : notes}>
                                <div className="rl-focus__content" inert={inert || undefined}>
                                  {far ? (
                                    <FarFace m={m} plan={plan} s={s} landed={landed} tone={tone} names={names} compact={compact} num={overview ? i + 1 : undefined} pulse={decidingNow && m.key === landingKey} stateKey={sk} />
                                  ) : (
                                    <FullFace
                                      m={m}
                                      stateKey={sk}
                                      extra={extra}
                                      props={props}
                                      plan={plan}
                                      s={s}
                                      landed={landed}
                                      animate={!instant && (m.kind === 'outcome' ? recentLanding || !landed : animate && user === null && !landed)}
                                      focused={isFocus}
                                      inert={inert}
                                      first={first}
                                      tone={tone}
                                      wide={outWide}
                                      denyMessage={denyMessage}
                                      pulse={decidingNow && m.key === landingKey}
                                      calls={calls}
                                    />
                                  )}
                                </div>
                              </NoteCtx.Provider>
                            </motion.div>
                          </AnimatePresence>
                        </div>
                        {inert && !p.hidden && (
                          <button
                            type="button"
                            className="rl-focus__pick"
                            tabIndex={overview ? 0 : -1}
                            aria-label={pickLabel(m, plan)}
                            onPointerEnter={() => {
                              if (!drag.current?.on) setHover(i)
                            }}
                            onPointerLeave={() => setHover((h) => (h === i ? null : h))}
                            onFocus={(e) => {
                              if (e.currentTarget.matches(':focus-visible')) setHover(i)
                            }}
                            onBlur={() => setHover((h) => (h === i ? null : h))}
                            onClick={(e) => {
                              setHover(null)
                              pick(i, true)
                              /* From the keyboard, this button goes as its card comes to the front: the row keeps the keys (← →, Tab on into the card). */
                              if (e.detail === 0) bandRef.current?.focus({ preventScroll: true })
                            }}
                          />
                        )}
                      </motion.div>
                      {isFocus && sub && <Subtitle {...sub} fade={!instant} onStop={() => narrator.cancel()} />}
                    </motion.div>
                  )
                })}
              </div>
            </div>
            {earlier > 0 && (
              <button type="button" className="rl-focus__edge is-left" tabIndex={-1} style={{ top: hintTop(-1) }} onClick={() => stepBy(-1)}>
                <ChevronLeft size={12} strokeWidth={2.2} aria-hidden />
                {earlier} earlier
              </button>
            )}
            {later > 0 && (
              <button type="button" className={`rl-focus__edge is-right${peekRight ? ' is-by-peek' : ''}`} tabIndex={-1} style={{ top: hintTop(1) }} onClick={() => stepBy(1)}>
                {later} later
                <ChevronRight size={12} strokeWidth={2.2} aria-hidden />
              </button>
            )}
          </div>
        </LitCtx.Provider>
      </RunStage>
    </div>
  )
}
