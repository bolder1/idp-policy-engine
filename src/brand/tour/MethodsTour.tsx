import { motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react'

import { Button } from '../kit'
import { GAP, measureSelector, place, type Placement, type Rect } from './spotlight'
import { MOVED_STOPS, SEL, type MovedTask, type MovedView } from './methods-tour'

/* -----------------------------------------------------------------------------
   What moved — the Authentication methods tour (methods-tour.ts has the stops
   and why the tour is offered the way it is).

   The builder tour's card, scrim and ring (tour.css, `btr`), and its rules
   (Tour.tsx): non-modal and no focus trap, Escape from anywhere, a live region
   per stop, the lit element described by the card, never moving on by itself.
   What is its own:

   · **The reader does each thing.** The part to click — the switch, the row,
     the tab, the gear — pulses until it is clicked; the card only ever says
     Next (owner, 7 Oct 2026: "no need to add the action button in the cards;
     add a highlight on the click part — the user either clicks or goes
     next"). Clicked, the card says what that did and the light moves to what
     it opened.
   · **It puts the page where the stop needs it.** The list with nothing open,
     a family's drawer, a settings page, or the Recovery tab — opened by the
     same click a reader would make, so Back and a skipped task both land on a
     page the stop can point at.
   · **It looks again every quarter second**, for the rect (drawers slide in,
     rows scroll) and for whether the task is done.

   Timers, not animation frames: a hidden pane stops `requestAnimationFrame`,
   and a tour that never lights its first stop there is the hidden-pane trap.
   -------------------------------------------------------------------------- */

/* Shorter than the builder's card: no hero band, one sentence. */
const CARD = { w: 360, h: 300, lead: 96 }
const COPY_ID = 'bmv-copy'
const POLL_MS = 250

const click = (sel: string) => document.querySelector<HTMLElement>(sel)?.click()
const switchState = (sel: string) => document.querySelector(sel)?.getAttribute('aria-checked') ?? null
const isDone = (t: MovedTask, before: string | null) => (t.kind === 'switch' ? switchState(t.hint) !== before : !!document.querySelector(t.doneWhen))

/* Beside the lit element where a side has room (spotlight.ts), and otherwise under it — or over it, at the
   foot of the screen. This page lights whole rows and its head, wider than the room either side of them,
   and `place` then parks the card on the row's start: over the very name it is lighting. Here, not in
   spotlight.ts: the board's and the trail's anchors always have a side, and their placement stays theirs. */
type Around = Placement & { vert: 'below' | 'above' | null }
function placeAround(rect: Rect | null): Around {
  const p = place(rect, CARD)
  if (!rect || p.centred || p.side !== 'none') return { ...p, vert: null }
  const below = rect.top + rect.height + GAP
  const fits = below + CARD.h <= window.innerHeight - GAP
  const left = Math.max(GAP, Math.min(window.innerWidth - CARD.w - GAP, rect.left + 24))
  return { centred: false, side: 'none', caret: 0, left, top: fits ? below : Math.max(GAP, rect.top - GAP - CARD.h), vert: fits ? 'below' : 'above' }
}

const sameRect = (a: Rect | null, b: Rect | null) =>
  a === b ||
  (!!a && !!b && Math.round(a.top) === Math.round(b.top) && Math.round(a.left) === Math.round(b.left) && Math.round(a.width) === Math.round(b.width) && Math.round(a.height) === Math.round(b.height))

export function MethodsTour({
  open,
  onClose,
  onTab,
  onClear,
}: {
  open: boolean
  onClose: () => void
  /** Puts the page on a tab (and shuts any drawer, as a tab change does). */
  onTab: (tab: 'methods' | 'recovery') => void
  /** Shuts any drawer, leaving the tab as it is. */
  onClear: () => void
}) {
  const reduce = useReducedMotion() === true
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  /* The part to click, pulsing until it is clicked. */
  const [hint, setHint] = useState<Rect | null>(null)
  const [done, setDone] = useState(false)
  const card = useRef<HTMLDivElement | null>(null)
  /* A switch's state as the stop found it, so a flip either way counts. */
  const before = useRef<string | null>(null)
  const stop = MOVED_STOPS[i]
  const last = i === MOVED_STOPS.length - 1

  useEffect(() => {
    if (open) setI(0)
  }, [open])

  /* Held in a ref: the host passes inline arrows, and the stop effect must run per stop, not per render. */
  const host = useRef({ onTab, onClear })
  host.current = { onTab, onClear }

  /* The page as the stop needs it: a press the reader would make, only where the page is not there yet. */
  const enter = useCallback((view: MovedView) => {
    const { onTab: tab, onClear: clear } = host.current
    if (view === 'recovery') return tab('recovery')
    tab('methods')
    if (view === 'list') return clear()
    const [drawer, opener] = view === 'sms' ? [SEL.smsDrawer, SEL.smsOpen] : [SEL.gridDrawer, SEL.gridGear]
    /* Already open — and a family back on its Methods pane, for whoever stepped Back from its Settings. */
    if (document.querySelector(drawer)) return view === 'sms' ? click(SEL.methodsTab) : undefined
    clear()
    window.setTimeout(() => click(opener), 40)
  }, [])

  /* What is lit: the stop's anchor — or, once a task has opened something, what it opened, so the light
     never sits on a row a drawer now covers. Read through a ref, so the light can move without the stop
     starting over. */
  const lit = stop.task?.kind === 'click' && done ? stop.task.lights : `[data-tour="${stop.anchor}"]`
  const cue = stop.task && !done ? stop.task.hint : null
  const litRef = useRef({ lit, cue })
  litRef.current = { lit, cue }
  const measure = useCallback(() => {
    const next = measureSelector(litRef.current.lit)
    setRect((prev) => (sameRect(prev, next) ? prev : next))
    const at = litRef.current.cue ? measureSelector(litRef.current.cue, 3) : null
    setHint((prev) => (sameRect(prev, at) ? prev : at))
  }, [])
  useEffect(() => {
    if (open) measure()
  }, [open, lit, cue, measure])

  /* Each stop: the page put right, its anchor brought into view, then a look every quarter second. */
  useEffect(() => {
    if (!open) return
    setDone(false)
    enter(stop.view)
    const settle = window.setTimeout(() => {
      before.current = stop.task?.kind === 'switch' ? switchState(stop.task.hint) : null
      document.querySelector<HTMLElement>(`[data-tour="${stop.anchor}"]`)?.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' })
      measure()
    }, 120)
    const poll = window.setInterval(() => {
      measure()
      if (stop.task) setDone(isDone(stop.task, before.current))
    }, POLL_MS)
    window.addEventListener('resize', measure)
    return () => {
      window.clearTimeout(settle)
      window.clearInterval(poll)
      window.removeEventListener('resize', measure)
    }
  }, [open, stop, enter, measure, reduce])

  /* The card explains the lit element: said on the element too, for whoever reaches it by Tab. */
  useEffect(() => {
    if (!open) return
    const el = document.querySelector<HTMLElement>(`[data-tour="${stop.anchor}"]`)
    if (!el) return
    const had = el.getAttribute('aria-describedby')
    el.setAttribute('aria-describedby', COPY_ID)
    return () => {
      if (had) el.setAttribute('aria-describedby', had)
      else el.removeAttribute('aria-describedby')
    }
  }, [open, stop.anchor, rect])

  const leave = useCallback(() => onClose(), [onClose])
  /* On, whether the reader clicked the part or not: the next stop opens what it needs. */
  const act = useCallback(() => (last ? leave() : setI((n) => n + 1)), [last, leave])
  const back = useCallback(() => setI((n) => Math.max(0, n - 1)), [])

  const keys = useRef({ act, back, leave })
  keys.current = { act, back, leave }
  useEffect(() => {
    if (!open) return
    card.current?.focus()
    /* Capture, so one Escape closes the tour and not the drawer it opened as well; arrows are left alone
       while somebody is typing (the search box stays usable under the tour). */
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation()
        keys.current.leave()
        return
      }
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
      if (e.key === 'ArrowRight') keys.current.act()
      if (e.key === 'ArrowLeft') keys.current.back()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open])

  if (!open) return null
  const pos = placeAround(rect)
  const spring = reduce ? { duration: 0 } : { type: 'spring' as const, stiffness: 320, damping: 34 }

  return (
    <div className="btr bmv">
      <p className="u-sr-only" aria-live="polite">
        {`What moved, stop ${i + 1} of ${MOVED_STOPS.length}. ${stop.heading}. ${stop.was ? `Was in ${stop.was}. ` : ''}${stop.body}${stop.task && done ? ` ${stop.task.done}` : ''}`}
      </p>

      <svg className="btr__scrim" aria-hidden>
        <defs>
          <mask id="bmv-hole">
            <rect x="0" y="0" width="100%" height="100%" fill="#fff" />
            {rect && <motion.rect initial={false} animate={{ x: rect.left, y: rect.top, width: rect.width, height: rect.height }} transition={spring} rx="12" fill="#000" />}
          </mask>
        </defs>
        <rect x="0" y="0" width="100%" height="100%" mask="url(#bmv-hole)" />
      </svg>

      {rect && (
        <motion.span
          className="btr__ring"
          aria-hidden
          initial={false}
          animate={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
          transition={spring}
        />
      )}

      {/* The click part: a ring that breathes, on opacity alone, and holds still under reduced motion. */}
      {hint && (
        <motion.span
          key={`hint-${stop.id}`}
          className="bmv__hint"
          aria-hidden
          style={{ top: hint.top, left: hint.left, width: hint.width, height: hint.height }}
          initial={{ opacity: 0 }}
          animate={reduce ? { opacity: 1 } : { opacity: [1, 0.3, 1] }}
          transition={reduce ? { duration: 0 } : { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}

      <div className="btr__cardslot">
        <motion.div
          key={stop.id}
          ref={card}
          tabIndex={-1}
          role="dialog"
          aria-modal="false"
          aria-label={`What moved, stop ${i + 1} of ${MOVED_STOPS.length}`}
          className={`btr__card bmv__card ${pos.centred ? 'is-centred' : ''} ${pos.side !== 'none' ? `is-${pos.side}` : ''} ${pos.vert ? `is-${pos.vert}` : ''}`}
          /* Positioned from the numbers (spotlight.ts): motion owns `transform` here. */
          style={{ top: pos.top, left: pos.left }}
          initial={{ opacity: 0, y: reduce ? 0 : 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduce ? 0 : 0.2, ease: [0.2, 0, 0, 1] }}
        >
          {pos.side !== 'none' && <span className="btr__beak" aria-hidden style={{ top: pos.caret }} />}
          {pos.vert && <span className="btr__beak" aria-hidden />}

          <button type="button" className="btr__x" aria-label="Leave the tour" onClick={leave}>
            <X size={14} strokeWidth={2} />
          </button>

          <div className="btr__body" id={COPY_ID}>
            <span className="btr__count">
              Stop {i + 1} of {MOVED_STOPS.length}
            </span>
            <h2>{stop.heading}</h2>
            {stop.was && <p className="bmv__was">Was in {stop.was}</p>}
            <p>{stop.body}</p>
            {stop.task && done && (
              <p className="bmv__done">
                <Check size={14} strokeWidth={2.4} aria-hidden />
                {stop.task.done}
              </p>
            )}
          </div>

          {/* Two buttons at most (owner, 23 Oct 2026). Skip went: it did what
              the × does. Back is not drawn on the first stop rather than drawn
              disabled, so the card never offers a press that does nothing. */}
          <footer className="btr__foot">
            <span className="btr__dots" aria-hidden />
            {i > 0 && (
              <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={back}>
                Back
              </Button>
            )}
            <Button variant="primary" size="sm" iconRight={last ? undefined : ArrowRight} onClick={act}>
              {last ? 'Done' : 'Next'}
            </Button>
          </footer>
        </motion.div>
      </div>
    </div>
  )
}
