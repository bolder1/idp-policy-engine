import { animate as animateValue, motion, useMotionValue } from 'motion/react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { ChevronLeft, ChevronRight, LayoutGrid } from 'lucide-react'

import { useBrand } from '../../../store'
import { RunStage, type StageView } from './RunStage'
import { ASSISTANT_DOCK_PAD, AssistantDock, DockButton, DockSep } from './assistant/AssistantDock'
import type { Answer, Target } from './assistant/intents'
import { useNarrator, type Narrator } from './assistant/voice'
import { FocusStageToggle } from './focus-theme'
import { useFocusStage } from './focus-stage'
import type { RunLayoutProps } from './types'
import { cardWidth, focusPlaces, liftPlaces, overviewPlaces, type Place } from './focus-geometry'
import { firstName, landedAt, momentAt, momentKeyOf, momentsOf, tallestOf, toneOf, type Moment } from './focus-model'
import { sentenceTokens, tokenValue } from '../../testing/sign-in-sentence'
import { LitCtx, NoteCtx, type NoteState } from './focus-shared'
import { beatsOf } from './focus-voice'
import { useFocusNarration } from './focus-speech'
import { Subtitle } from './focus-subtitle'
import { FocusCaption } from './focus-caption'
import { PoliciesMoment, SignInMoment } from './focus-cards'
import { RuleMoment } from './focus-rule'
import { OutcomeGhost, OutcomeMoment } from './focus-outcome'
import { Ribbon } from './focus-ribbon'
import './focus.css'

/* -----------------------------------------------------------------------------
   The run as FOCUS (run-layout.ts `focus`): one moment at a time, the whole
   run in reach.

          ┌────┐  ┌──────┐  ┌────────────────┐  ┌──────┐
          │sign│  │policy│  │   RULE 2  ✓    │  │ out- │
          │ -in│  │      │  │ Who   ✓        │  │ come │
          └────┘  └──────┘  │ Device ✓       │  └──────┘
                            └────────────────┘
          [Sign-in]─[Policy 1 applies ✓]─[Rule 1 ✕]─[Rule 2 ✓]─[Outcome]

   A spatial carousel of large cards: the moment the engine is at is one big
   card in focus; the ones before recede to the left, the ones to come wait
   to the right — smaller, lower, faded, turned towards the front (geometry
   in focus-geometry.ts, the moments in focus-model.ts). As the clock moves
   the next card glides into focus and its content plays in: the policies
   asked in order until the first that covers the person lights, each rule's
   checks landing ✓ or ✕, the answer. Under it the RIBBON: the whole run as
   chips, each in its meaning colour, the one in focus raised.

   Poke it: press a chip or a receded card, drag or swipe the row, ← and →;
   press a row in the card in focus for its why; Overview (in the dock) lays
   every card out side by side, the outcome biggest; Walk through steps the
   landed run from the sign-in to the answer again, each moment said.

   VOICE and ASSISTANT (owner, 2 Oct 2026): each moment's one line
   (focus-voice.ts) is said as it settles on screen and shown as the
   subtitle under the card in focus (it reads muted too). The assistant dock
   (assistant/AssistantDock.tsx) is the bottom bar: ask, the chips, the
   thread of answers as captions — and an answer DRIVES THE CAROUSEL: its
   target comes into focus and draws lit ("Why not rule 1?" → rule 1, its
   failing check lit; "Show every check" → Overview). Its row 2 holds the
   view's controls: zoom, fit, ‹ ›, Overview, the stage, Read again, Voice.
   The ribbon sits just above it.

   The world is the view's size (the carousel IS the camera), so the stage
   fits it at zoom 1 and words keep their size. Nothing motion moves carries
   a CSS transform or transition: each card's slot is motion's; the card in
   it takes the colour transitions.
   -------------------------------------------------------------------------- */

/* The ribbon's row at the foot of the world, just above the dock; the subtitle's under the card in focus. */
const RIBBON_H = 52
const SUB_H = 46
const TOP_PAD = 64
const SPRING = { type: 'spring' as const, stiffness: 190, damping: 26, mass: 1 }
const NONE = { duration: 0 }

function useRoom(el: HTMLElement | null): { w: number; h: number } {
  const [room, setRoom] = useState({ w: 1280, h: 660 })
  useLayoutEffect(() => {
    const ground = el?.closest<HTMLElement>('.rstage')
    if (!ground) return
    const read = () => {
      const w = Math.round(Math.min(1480, Math.max(900, ground.clientWidth - 96)))
      const h = Math.round(Math.min(860, Math.max(420, ground.clientHeight - TOP_PAD - ASSISTANT_DOCK_PAD - 4)))
      setRoom((r) => (r.w === w && r.h === h ? r : { w, h }))
    }
    read()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(read)
    ro.observe(ground)
    return () => ro.disconnect()
  }, [el])
  return room
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
    () =>
      beatsOf(
        plan,
        moments,
        { person: asGroup ? `Anyone in ${asGroup}` : (person?.name ?? plan.conflicts?.personName ?? 'Someone'), first: asGroup ? 'them' : first, app: plan.appName || 'the application', from: fromText },
        props.screens,
      ),
    [plan, moments, asGroup, person, first, fromText, props.screens],
  )
  useFocusNarration({ narrator, plan, beats, s, landed, runKey, quiet: jumped })
  const script = useMemo(() => beats.map((b) => b.line), [beats])
  const narratorRef = useRef<Narrator>(narrator)
  useLayoutEffect(() => {
    narratorRef.current = narrator
  })

  // --- The assistant: the answer on show, and the phrase pointed at in it ---
  const [zoom, setZoom] = useState(1)
  const [answerOn, setAnswerOn] = useState<Answer | null>(null)
  const [cite, setCite] = useState<Target | null>(null)
  const lit: Target | null = cite ?? answerOn?.focus ?? null

  /* The cards on the row: every moment reached, and the outcome waiting at the end. */
  const shown = useMemo(() => moments.filter((m) => m.kind === 'outcome' || landed || s >= m.at), [moments, landed, s])
  const live = Math.min(shown.length - 1, momentAt(moments, s, landed))

  // --- Who holds the focus: the clock, or the admin ---
  const [user, setUser] = useState<number | null>(null)
  const [overview, setOverview] = useState(false)
  const [poked, setPoked] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [seen, setSeen] = useState({ runKey, landed })
  if (seen.runKey !== runKey || seen.landed !== landed) {
    /* A new run: the clock has the focus. The run lands: the answer takes it. */
    setSeen({ runKey, landed })
    setUser(null)
    setNote(null)
    if (seen.runKey !== runKey) {
      setOverview(false)
      setPoked(false)
      setAnswerOn(null)
      setCite(null)
    }
  }
  const focus = Math.max(0, Math.min(shown.length - 1, user ?? live))
  const held = user !== null && !landed

  // --- Where the cards stand ---
  const cw = cardWidth(room.w)
  const bandH = room.h - RIBBON_H - SUB_H - 6
  const [heights, setHeights] = useState<Record<string, number>>({})
  /* The answer, once landed, is the one wide card: its words beside What they see. */
  const wide = landed && props.screens.length > 0 && form.appId !== null
  const facts = sentenceTokens(props.rows).filter((t) => t !== 'person' && t !== 'app').length
  const planned = useMemo(() => tallestOf(plan, moments, facts, props.screens.length > 0), [plan, moments, facts, props.screens.length])
  const tallest = Math.min(bandH, Math.max(planned, ...shown.map((m) => heights[m.key] ?? 0)))
  /* The cards and the subtitle under them in the middle of the room above the ribbon; the ribbon at the foot, just above the dock. */
  const top = Math.round(Math.max(4, (room.h - RIBBON_H - SUB_H - tallest) / 2))
  const ribbonTop = room.h - RIBBON_H
  const widths = useMemo(() => shown.map((m) => (m.kind === 'outcome' && wide ? Math.round(cw * 1.52) : cw)), [shown, wide, cw])
  const places: Place[] = useMemo(
    () => (overview ? overviewPlaces(shown.length, room.w, widths, top, shown.map((m) => heights[m.key] ?? 260), bandH) : focusPlaces(shown.length, focus, room.w, widths, top)),
    [overview, shown, room.w, widths, top, heights, bandH, focus],
  )
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
  const instant = reduced || (jumped && !poked)
  const glide = instant ? NONE : SPRING

  /* Each card's height, by its layout box (never its transformed one). */
  const slots = useRef(new Map<string, HTMLDivElement>())
  useLayoutEffect(() => {
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      setHeights((h) => {
        let next = h
        slots.current.forEach((el, key) => {
          const v = el.offsetHeight
          if (v > 0 && h[key] !== v) next = next === h ? { ...h, [key]: v } : { ...next, [key]: v }
        })
        return next
      })
    })
    slots.current.forEach((el) => ro.observe(el))
    return () => ro.disconnect()
  }, [shown.length, runKey])

  const notes = useMemo<NoteState>(() => ({ open: note, toggle: (id) => setNote((n) => (n === id ? null : id)), inert: false }), [note])
  const recededNotes = useMemo<NoteState>(() => ({ open: null, toggle: () => {}, inert: true }), [])

  // --- The camera: the world is the view, fitted at zoom 1 ---
  useLayoutEffect(() => {
    stage.current?.fit({ max: 1, jump: true })
  }, [runKey, room.w, room.h])
  useEffect(() => {
    if (landed) stage.current?.fit({ max: 1, jump: reduced || jumped || !animate })
  }, [landed, reduced, jumped, animate])

  // --- Poking it: a chip, a receded card, ← →, a drag, Walk through ---
  const reachedCount = shown.filter((m) => landed || s >= m.at).length
  const [walking, setWalking] = useState(false)
  const pick = useCallback(
    (i: number) => {
      setPoked(true)
      setOverview(false)
      setWalking(false)
      setNote(null)
      /* Back on the moment the engine is at, while it plays: follow it again. */
      setUser(!landed && i === live ? null : i)
    },
    [landed, live],
  )
  const stepBy = useCallback((d: number) => pick(Math.max(0, Math.min(reachedCount - 1, focus + d))), [pick, reachedCount, focus])
  const walk = useCallback(() => {
    setPoked(true)
    setOverview(false)
    setNote(null)
    setWalking((w) => {
      if (!w) setUser(0)
      else narratorRef.current.cancel()
      return !w
    })
  }, [])
  /* Walk through: the landed run again, a moment at a time, each moment's line said (a press: the voice may speak again) —
     the next card comes when the line has been said and the card has had its beat. The view only; the plan stays where it is. */
  useEffect(() => {
    if (!walking) return
    let gone = false
    const u = user ?? 0
    const b = beats.find((x) => x.key === shown[u]?.key)
    const n = narratorRef.current
    const said = b && !n.muted ? n.say(b.line, { gesture: true }) : Promise.resolve()
    const beat = new Promise<void>((r) => window.setTimeout(r, 1500))
    void Promise.all([said, beat]).then(() => {
      if (gone) return
      if (u >= shown.length - 1) setWalking(false)
      else setUser(Math.min(shown.length - 1, u + 1))
    })
    return () => {
      gone = true
    }
  }, [walking, user, shown, beats])

  /* An answer (or a phrase in it) brings what it is about into focus: its card, or Overview for every check. */
  const bring = useCallback(
    (t: Target | null | undefined, a?: Answer | null) => {
      if (a?.id === 'checks') {
        setPoked(true)
        setWalking(false)
        setNote(null)
        setOverview(true)
        return
      }
      if (!t) return
      const key = momentKeyOf(t, moments, plan)
      const i = key ? shown.findIndex((m) => m.key === key) : -1
      if (i >= 0) pick(i)
    },
    [moments, plan, shown, pick],
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
  if (walking && (!landed || seen.runKey !== runKey)) setWalking(false)

  const rootRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const root = rootRef.current
      const t = e.target instanceof HTMLElement ? e.target : null
      /* Inside the view, or on the engine pill floating over it (the run's Replay and pencil, focused after a run). */
      if (!root || (t && t !== document.body && !root.contains(t) && !t.closest('.tj-engine'))) return
      if (t?.closest('input, textarea, select, [contenteditable="true"], [role="menu"], [role="listbox"]')) return
      if (e.altKey || e.ctrlKey || e.metaKey) return
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        stepBy(e.key === 'ArrowRight' ? 1 : -1)
      } else if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault()
        pick(e.key === 'Home' ? 0 : reachedCount - 1)
      } else if (e.key === 'Escape') {
        if (note) setNote(null)
        else if (overview) setOverview(false)
        /* The answer read, the field left: Escape folds the thread as the dock's own Escape does. */ else root.querySelector<HTMLButtonElement>('.rl-focus__dock .ad__threadhead button')?.click()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [stepBy, pick, reachedCount, note, overview])

  /* A drag or a swipe across the row: the row follows the hand, and a long enough throw moves the focus. */
  const dragX = useMotionValue(0)
  const drag = useRef<{ id: number; x0: number; y0: number; on: boolean } | null>(null)
  const swallow = useRef(false)
  const [dragging, setDragging] = useState(false)
  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    /* A press on the row (not on a control) gives it the keyboard, so ← → move the focus from there. */
    if (e.target instanceof HTMLElement && !e.target.closest('button, a, input, [tabindex]:not([tabindex="-1"])')) e.currentTarget.focus({ preventScroll: true })
    if (e.button !== 0 || overview) return
    drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, on: false }
  }
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    const dx = e.clientX - d.x0
    if (!d.on) {
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(e.clientY - d.y0)) return
      d.on = true
      e.currentTarget.setPointerCapture(e.pointerId)
      setDragging(true)
    }
    const z = stage.current?.zoom() || 1
    dragX.set(dx / z)
  }
  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    drag.current = null
    if (!d.on) return
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    setDragging(false)
    swallow.current = true
    window.setTimeout(() => {
      swallow.current = false
    }, 0)
    const dx = e.clientX - d.x0
    const n = Math.abs(dx) < 60 ? 0 : Math.max(1, Math.round(Math.abs(dx) / 240))
    if (n > 0) stepBy(dx < 0 ? n : -n)
    animateValue(dragX, 0, reduced ? { duration: 0 } : SPRING)
  }

  /* The subtitle: the line of the moment in focus, once what it says is on screen, under that card. */
  const inFocus = overview ? undefined : shown[focus]
  const beat = inFocus ? beats.find((b) => b.key === inFocus.key && (landed || s >= b.at)) : undefined
  const fp = placed[focus]
  const sayingIt = !!beat && narrator.speaking !== null && (narrator.speaking.endsWith(beat.line) || narrator.speaking.endsWith(beat.short))
  const sub =
    beat && fp && inFocus && !asking
      ? {
          line: beat.line,
          tone: inFocus.kind === 'outcome' ? tone : 'neutral',
          speaking: sayingIt,
          left: fp.x,
          /* Under its card; a card tall enough to reach the ribbon keeps it just above the ribbon (its lines, about 7.4px a character at 14px). */
          top: Math.min(room.h - RIBBON_H - 6 - 20 * Math.max(1, Math.ceil((beat.line.length * 7.4) / Math.max(120, (widths[focus] ?? cw) - 8))), fp.y + (heights[inFocus.key] ?? tallest) + 12),
          width: widths[focus] ?? cw,
        }
      : null
  /* The line heard is shown once: under its card when that card is in focus, on the answer in the open thread
     when it is that answer, else on the dock's voice line. */
  const sayingAnswer = !!answerOn && narrator.speaking !== null && narrator.speaking === answerOn.say.trim()
  const dockNarrator = useMemo<Narrator>(() => (sayingIt || sayingAnswer ? { ...narrator, speaking: null } : narrator), [narrator, sayingIt, sayingAnswer])

  const card = (m: Moment, inert: boolean, isFocus: boolean) => {
    if (m.kind === 'sign') return <SignInMoment props={props} landed={landed} />
    if (m.kind === 'policies') return <PoliciesMoment plan={plan} s={s} first={first} landed={landed} animate={animate} focused={isFocus} />
    if (m.kind === 'rule') {
      const r = plan.rules[m.rule ?? -1]
      return r ? <RuleMoment plan={plan} r={r} s={s} landed={landed} animate={animate} focused={isFocus} first={first} /> : null
    }
    const deciding = plan.steps[s]?.kind === 'deciding'
    return landed ? <OutcomeMoment props={props} tone={tone} animate={animate || (!instant && isFocus)} inert={inert} /> : <OutcomeGhost deciding={deciding && !landed} />
  }

  return (
    <div ref={rootRef} className="rl-focus-root" data-stage={theme}>
      <div className="rl-focus__backdrop" aria-hidden />
      <RunStage
        ref={stage}
        reduced={reduced}
        className="rl-focus"
        label={`Sign-in run: ${plan.appName}`}
        pad={{ top: TOP_PAD, bottom: ASSISTANT_DOCK_PAD }}
        externalDock
        onZoom={setZoom}
        overlay={
          <AssistantDock
            run={props}
            narrator={dockNarrator}
            script={script}
            stage={stage}
            zoom={zoom}
            theme={theme}
            className="rl-focus__dock"
            controls={
              <>
                <DockButton label="Previous moment" disabled={overview || focus <= 0} onClick={() => stepBy(-1)}>
                  <ChevronLeft size={15} strokeWidth={2} />
                </DockButton>
                <DockButton label="Next moment" disabled={overview || focus >= reachedCount - 1} onClick={() => stepBy(1)}>
                  <ChevronRight size={15} strokeWidth={2} />
                </DockButton>
                <DockButton label="Overview" tip={overview ? 'Back to focus' : 'Overview'} pressed={overview} onClick={() => { setPoked(true); setWalking(false); setOverview((v) => !v) }}>
                  <LayoutGrid size={14} strokeWidth={2} />
                </DockButton>
                <DockSep />
                <FocusStageToggle />
              </>
            }
            renderAnswer={(a, ctx) => (
              <FocusCaption answer={a} animate={ctx.animate} onCite={ctx.onCite} lit={ctx.latest ? lit : null} speaking={ctx.latest && sayingAnswer && a === answerOn} onStop={() => narrator.cancel()} />
            )}
            onAnswer={onAnswer}
            onCite={onCite}
          />
        }
      >
        <LitCtx.Provider value={lit}>
        <div key={runKey} ref={setWorldEl} className={`rl-focus__world${overview ? ' is-overview' : ''}${asking ? ' is-asking' : ''}`} style={{ width: room.w, height: room.h } as CSSProperties}>
          <div
            className={`rl-focus__band${dragging ? ' is-dragging' : ''}`}
            style={{ height: bandH }}
            data-card
            role="region"
            tabIndex={-1}
            aria-roledescription="carousel"
            aria-label="Moments of the run"
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
            <motion.div className="rl-focus__track" style={{ x: dragX }}>
            {shown.map((m, i) => {
              const p = placed[i]
              if (!p) return null
              const isFocus = !overview && i === focus
              const inert = !isFocus
              return (
                <motion.div
                  key={m.key}
                  ref={(el: HTMLDivElement | null) => {
                    if (el) slots.current.set(m.key, el)
                    else slots.current.delete(m.key)
                  }}
                  className={`rl-focus__slot${isFocus ? ' is-focus' : ''}${p.hidden ? ' is-hidden' : ''}`}
                  style={{ width: widths[i], zIndex: p.z, originX: 0.5, originY: 0, transformPerspective: 1400 }}
                  initial={animate ? { x: p.x + 90, y: p.y + 24, scale: p.scale * 0.92, opacity: 0, rotateY: p.rotateY } : false}
                  animate={{ x: p.x, y: p.y, scale: p.scale, opacity: p.opacity, rotateY: p.rotateY }}
                  transition={glide}
                  aria-hidden={p.hidden || undefined}
                >
                  <NoteCtx.Provider value={inert ? recededNotes : notes}>
                    <div className="rl-focus__content" inert={inert || undefined}>
                      {card(m, inert, isFocus)}
                    </div>
                  </NoteCtx.Provider>
                  {inert && !p.hidden && (landed || s >= m.at) && (
                    <button type="button" className="rl-focus__pick" aria-label={`Show ${m.kind === 'rule' ? `rule ${(plan.rules[m.rule ?? -1]?.index ?? -1) + 1 || 'last'}` : m.kind}`} onClick={() => pick(i)} />
                  )}
                </motion.div>
              )
            })}
            {sub && <Subtitle {...sub} animate={!reduced} onStop={() => narrator.cancel()} />}
            </motion.div>
          </div>
          <Ribbon
            top={ribbonTop}
            moments={shown}
            plan={plan}
            s={s}
            focus={overview ? -1 : focus}
            landed={landed}
            tone={tone}
            held={held}
            animate={!reduced}
            walking={walking}
            onPick={pick}
            onLive={() => setUser(null)}
            onWalk={walk}
          />
        </div>
        </LitCtx.Provider>
      </RunStage>
    </div>
  )
}

