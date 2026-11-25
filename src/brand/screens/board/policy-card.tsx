import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import type { Policy } from '../../data'
import { PolicyHero } from '../sign-in-tests/InspectPanel'
import { portalRoot } from '../status-options'
import './policy-card.css'

/* -----------------------------------------------------------------------------
   The policy's details card, on the builder bar's name (owner, 25 Nov 2026: "I don't think we need this any more, go
   inside directly, and the policy card should move inside with the top bar, where on hover on the name we can see the
   card details; make it experience interactive and the card in a good layout"; rollout.ts `directOpen`).

   Policy details' overview card (InspectPanel.tsx `PolicyHero`): what it is, its applications, its audience and its
   last change. The status is beside the name already, so the card leaves it out. It opens a beat after the pointer
   rests on the name, at once on keyboard focus, and stays while the pointer travels onto it, so its applications and
   audience lists can be read under the pointer as they are in Policies. Escape, a press away or leaving both puts it
   away. It drops in from the name and lifts away (Motion; it owns the card's transform). Reduced motion: it fades.

   Portalled and fixed under the name, because the bar's crumbs clip what overflows them (view-edit.css).
   -------------------------------------------------------------------------- */

/* Long enough that sweeping across the bar does not open it, short enough to feel like a reply. */
const OPEN_MS = 280
/* Time to cross the gap from the name to the card without it closing. */
const CLOSE_MS = 180
/* Layers the card's own pieces open, portalled outside it: a press in one is still a press in the card. */
const OWN_LAYERS = '[role="dialog"], [role="tooltip"], .bx-tip, .bx-apop'

export function PolicyCard({ policy, children }: { policy: Policy; children: ReactNode }) {
  const reduce = useReducedMotion()
  const id = useId()
  const anchor = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)
  const [at, setAt] = useState<{ top: number; left: number } | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const quietFocus = useRef(false)

  const later = (next: boolean, ms: number) => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setOpen(next), ms)
  }
  const stay = () => window.clearTimeout(timer.current)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  /* Placed under the name's left edge each time it opens, so a renamed or wrapped title still lines up. */
  useLayoutEffect(() => {
    if (!open || !anchor.current) return
    const r = anchor.current.getBoundingClientRect()
    setAt({ top: r.bottom + 8, left: Math.max(8, r.left - 8) })
  }, [open])

  useEffect(() => {
    if (!open) return
    /* Captured, and stopped: this Escape puts the card away and is not also the board's (deselect, leave Check access). */
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setOpen(false)
      if (document.getElementById(id)?.contains(document.activeElement)) {
        /* Focus handed back to the name, which must not open the card again by receiving it. */
        quietFocus.current = true
        anchor.current?.focus({ preventScroll: true })
      }
    }
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null
      if (t && (anchor.current?.contains(t) || document.getElementById(id)?.contains(t))) return
      /* Its own lists open in layers of their own (AppsPeek's applications, the audience's names): still the card. */
      if (t?.closest?.(OWN_LAYERS)) return
      setOpen(false)
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [open, id])

  /* From the keyboard: Enter, Space or Down opens it and moves in, so its applications and audience can be reached with
     Tab; leaving the card for anywhere but the name puts it away. */
  /* Each press asks once; the card is usually open already, since focusing the name opened it. */
  const [moveIn, setMoveIn] = useState(0)
  const enter = () => {
    stay()
    setOpen(true)
    setMoveIn((n) => n + 1)
  }
  /* Once the card is in the page and placed: after the commit, not on a frame, so it also holds where frames are paused. */
  const movedFor = useRef(0)
  useEffect(() => {
    if (moveIn === movedFor.current || !open || !at) return
    movedFor.current = moveIn
    document.getElementById(id)?.focus({ preventScroll: true })
  }, [moveIn, open, at, id])
  const leftCard = (to: EventTarget | null) => {
    const n = to as Node | null
    if (n && (anchor.current?.contains(n) || document.getElementById(id)?.contains(n))) return
    if (n instanceof Element && n.closest(OWN_LAYERS)) return
    later(false, CLOSE_MS)
  }

  return (
    <>
      <span
        ref={anchor}
        className={`bpc-name${open ? ' is-open' : ''}`}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={`${policy.name}, details`}
        onMouseEnter={() => later(true, OPEN_MS)}
        onMouseLeave={() => later(false, CLOSE_MS)}
        onFocus={() => {
          if (quietFocus.current) {
            quietFocus.current = false
            return
          }
          stay()
          setOpen(true)
        }}
        onBlur={(e) => leftCard(e.relatedTarget)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
            e.preventDefault()
            enter()
          }
        }}
      >
        {children}
      </span>
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {open && at && (
              <motion.div
                key="policy-card"
                id={id}
                className="bpc-card"
                role="group"
                tabIndex={-1}
                aria-label={`${policy.name}, details`}
                onBlur={(e) => leftCard(e.relatedTarget)}
                style={{ top: at.top, left: at.left }}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.98 }}
                transition={reduce ? { duration: 0.12 } : { type: 'spring', stiffness: 460, damping: 32, mass: 0.7 }}
                onMouseEnter={stay}
                onMouseLeave={() => later(false, CLOSE_MS)}
              >
                <PolicyHero policy={policy} status={false} />
              </motion.div>
            )}
          </AnimatePresence>,
          portalRoot(),
        )}
    </>
  )
}
