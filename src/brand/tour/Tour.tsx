import { motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Swords, X } from 'lucide-react'

import { Button } from '../kit'
import { TourHero } from './TourHero'
import { STOPS, markTourSeen, type Stop } from './tour-stops'

/* -----------------------------------------------------------------------------
   The builder tour.

   A spotlight that travels, and a card that follows it. Three decisions worth
   knowing about:

   · **The lit element stays interactive.** The tour dims the page but does not
     block it. If somebody ignores the card and clicks the real When step, that
     is a person learning the product, and fighting them would be the opposite
     of the point.

   · **It never auto-advances.** A tour that moves on its own is a video, and a
     video cannot be re-read.

   · **Leaving leaves you where you are.** The tour drives the builder as it
     goes — switching steps, opening panels — and it does not put any of it back
     on exit. You end up on the screen the last stop was describing.

   --- On focus, deliberately ------------------------------------------------

   This is a NON-MODAL dialog and it does not trap focus. That is the whole
   point of the first decision above: the tour is a companion to a screen you
   can still use, and trapping focus would make it a modal that merely looks
   permeable — worse than either honest option, because a keyboard user would be
   held in a card the pointer is free to leave.

   Not trapping has a cost, and these are what pay it:

   · `aria-modal="false"`, so assistive technology is told the truth rather than
     inferring a barrier that is not there.
   · A live region announces each stop, so tabbing away and back does not mean
     losing the thread.
   · The lit element is `aria-describedby` the card while it is lit, so the
     explanation reaches somebody who arrives at the control by Tab rather than
     by reading the card.
   · Escape closes from anywhere on the page, not only from inside the card.
   -------------------------------------------------------------------------- */

interface Placement {
  centred: boolean
  top: number
  left: number
  /** Which edge of the card the anchor is on, so the beak grows from it. */
  side: 'left' | 'right' | 'none'
  /** Distance from the card's top to the beak. */
  caret: number
}

interface Rect {
  top: number
  left: number
  width: number
  height: number
}

const PAD = 8
const CARD_W = 372
const GAP = 18
/* Stable, because the lit element points at it from outside the card. */
const COPY_ID = 'btr-copy'

export function Tour({
  open,
  onClose,
  onStep,
  onPanel,
  onFinish,
}: {
  open: boolean
  onClose: () => void
  onStep: (s: NonNullable<Stop['step']>) => void
  onPanel: (p: Stop['panel']) => void
  /** The last stop hands over to the thing it just described. */
  onFinish: () => void
}) {
  const reduce = useReducedMotion()
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const card = useRef<HTMLDivElement | null>(null)

  const stop = STOPS[i]
  const last = i === STOPS.length - 1

  useEffect(() => {
    if (open) setI(0)
  }, [open])

  /* The host passes these as inline arrows, so their identity changes on every
     render. Held in a ref, the drive effect below can depend on the stop alone —
     otherwise it re-runs on every render, which drives the builder, which
     re-renders, which drives it again. */
  const drive = useRef({ onStep, onPanel })
  drive.current = { onStep, onPanel }

  /* Drive the builder into the state the stop describes, before measuring — the
     anchor for the conditions stop does not exist until the trail is on When. */
  useEffect(() => {
    if (!open) return
    if (stop.step) drive.current.onStep(stop.step)
    drive.current.onPanel(stop.panel)
  }, [open, stop])

  const measure = useCallback(() => {
    if (!stop.anchor) return setRect(null)
    const el = document.querySelector<HTMLElement>(`[data-tour="${stop.anchor}"]`)
    if (!el) return setRect(null)
    const r = el.getBoundingClientRect()
    setRect({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 })
  }, [stop.anchor])

  /* The card explains the lit element, so say so on the element itself. Anybody
     who reaches the trail by Tab rather than by reading the card still gets the
     sentence — and it is removed again the moment the stop moves on, so no
     control is left describing itself with a card that is gone. */
  useEffect(() => {
    if (!open || !stop.anchor) return
    const el = document.querySelector<HTMLElement>(`[data-tour="${stop.anchor}"]`)
    if (!el) return
    const had = el.getAttribute('aria-describedby')
    el.setAttribute('aria-describedby', COPY_ID)
    return () => {
      if (had) el.setAttribute('aria-describedby', had)
      else el.removeAttribute('aria-describedby')
    }
  }, [open, stop.anchor])

  /* Measured after the builder has re-rendered for this stop, not during — a
     rect taken in the same frame as a step switch is the previous step's. */
  useLayoutEffect(() => {
    if (!open) return
    const id = requestAnimationFrame(measure)
    window.addEventListener('resize', measure)
    return () => {
      cancelAnimationFrame(id)
      window.removeEventListener('resize', measure)
    }
  }, [open, measure, i])

  const next = useCallback(() => {
    if (last) {
      markTourSeen()
      onClose()
      onFinish()
      return
    }
    setI((n) => n + 1)
  }, [last, onClose, onFinish])

  const back = useCallback(() => setI((n) => Math.max(0, n - 1)), [])

  const leave = useCallback(() => {
    markTourSeen()
    onClose()
  }, [onClose])

  /* Same treatment for the key handler: bound once per opening rather than once
     per render, so a keypress cannot land on a listener that is about to be
     replaced. */
  const keys = useRef({ next, back, leave })
  keys.current = { next, back, leave }

  useEffect(() => {
    if (!open) return
    card.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        keys.current.leave()
      }
      if (e.key === 'ArrowRight') keys.current.next()
      if (e.key === 'ArrowLeft') keys.current.back()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!open) return null

  const pos = place(rect)

  return (
    <div className="btr">
      {/* Not trapping focus means somebody can tab away and come back, so each
          stop announces itself rather than relying on the card holding focus. */}
      <p className="u-sr-only" aria-live="polite">
        {`Tour stop ${i + 1} of ${STOPS.length}. ${stop.heading}. ${stop.body}`}
      </p>

      {/* The dim, with a hole in it. Pointer-events off so the lit element —
          and everything else — stays clickable underneath. */}
      <svg className="btr__scrim" aria-hidden>
        <defs>
          <mask id="btr-hole">
            <rect x="0" y="0" width="100%" height="100%" fill="#fff" />
            {rect && (
              <motion.rect
                initial={false}
                animate={{ x: rect.left, y: rect.top, width: rect.width, height: rect.height }}
                transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 34 }}
                rx="12"
                fill="#000"
              />
            )}
          </mask>
        </defs>
        <rect x="0" y="0" width="100%" height="100%" mask="url(#btr-hole)" />
      </svg>

      {rect && (
        <motion.span
          className="btr__ring"
          aria-hidden
          initial={false}
          animate={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
          transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 34 }}
        />
      )}

      {/* Keyed, not wrapped in AnimatePresence.

          `mode="wait"` gates the incoming stop on the outgoing one finishing its
          exit — and an exit does not finish in a backgrounded tab, so switching
          away mid-tour and coming back left the tour frozen on a stop that Next
          had already moved past. React swaps the card; motion animates the one
          that arrives. The 200ms of cross-fade this gives up is worth less than
          a walkthrough that cannot deadlock. */}
      <div className="btr__cardslot">
        <motion.div
          key={stop.id}
          ref={card}
          tabIndex={-1}
          role="dialog"
          aria-modal="false"
          aria-label={`Builder tour, stop ${i + 1} of ${STOPS.length}`}
          className={`btr__card ${pos.centred ? 'is-centred' : ''} ${pos.side !== 'none' ? `is-${pos.side}` : ''}`}
          style={pos.centred ? undefined : { top: pos.top, left: pos.left }}
          initial={{ opacity: 0, y: reduce ? 0 : 10, scale: reduce ? 1 : 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: reduce ? 0 : 0.2, ease: [0.2, 0, 0, 1] }}
        >
          {/* The beak. Every anchored coach mark worth copying has one — without
              it a floating card near a lit box is two things near each other,
              and the reader has to infer the relationship the tour is asserting. */}
          {pos.side !== 'none' && <span className="btr__beak" aria-hidden style={{ top: pos.caret }} />}

          <button type="button" className="btr__x" aria-label="Leave the tour" onClick={leave}>
            <X size={14} strokeWidth={2} />
          </button>

          <TourHero id={stop.id} />

          <div className="btr__body" id={COPY_ID}>
            <span className="btr__count">
              Stop {i + 1} of {STOPS.length}
            </span>
            <h2>{stop.heading}</h2>
            <p>{stop.body}</p>
          </div>

          <footer className="btr__foot">
            <span className="btr__dots" aria-hidden>
              {STOPS.map((s, n) => (
                <i key={s.id} className={n === i ? 'is-on' : n < i ? 'is-done' : ''} />
              ))}
            </span>
            <button type="button" className="btr__skip" onClick={leave}>
              Skip
            </button>
            <Button variant="ghost" size="sm" icon={ArrowLeft} disabled={i === 0} onClick={back}>
              Back
            </Button>
            <Button variant="primary" size="sm" icon={last ? Swords : undefined} iconRight={last ? undefined : ArrowRight} onClick={next}>
              {last ? (stop.finish ?? 'Finish') : 'Next'}
            </Button>
          </footer>
        </motion.div>
      </div>
    </div>
  )
}

/* Beside the anchor where there is room, below it where there is not, centred
   when there is no anchor at all. Clamped so the card is never half off-screen
   on a laptop. */
function place(rect: Rect | null): Placement {
  if (!rect || typeof window === 'undefined') return { centred: true, top: 0, left: 0, side: 'none', caret: 0 }

  const vw = window.innerWidth
  const vh = window.innerHeight
  const roomRight = vw - (rect.left + rect.width)
  const roomLeft = rect.left

  let left: number
  let side: Placement['side']
  if (roomRight >= CARD_W + GAP) {
    left = rect.left + rect.width + GAP
    side = 'left'
  } else if (roomLeft >= CARD_W + GAP) {
    left = rect.left - CARD_W - GAP
    side = 'right'
  } else {
    left = Math.max(GAP, Math.min(vw - CARD_W - GAP, rect.left))
    side = 'none'
  }

  // Vertically centred on the anchor, then clamped into the viewport.
  const top = Math.max(GAP, Math.min(vh - 372, rect.top + rect.height / 2 - 150))

  /* Where the beak sits on the card's edge: level with the anchor's middle,
     which is not the card's middle once the clamp above has moved the card.
     Kept off the rounded corners, because a beak growing out of a radius reads
     as a rendering fault rather than as a pointer. */
  const caret = Math.max(22, Math.min(330, rect.top + rect.height / 2 - top))
  return { centred: false, top, left, side, caret }
}
