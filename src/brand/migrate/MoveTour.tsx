import { motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, X } from 'lucide-react'
import { Button } from '../kit'
import { useBrand, type BrandScreen } from '../store'
import { GAP, measureSelector, place, type Rect } from '../tour/spotlight'
import '../tour/tour.css'

/* -----------------------------------------------------------------------------
   Where your policies went: the tour Done offers (owner, 4 Nov 2026). It walks the
   places a move filled, a page a stop, and lights the moved thing on each: the moved
   policies, a zone made from an old check, the new device profiles. It starts by itself
   once every moved policy is in the list (finale.tsx AutoAdd).

   The builder tour's card, scrim and ring (tour.css, `btr`) and its rules: non-modal,
   Escape from anywhere, never moving on by itself. Timers, not animation frames, so it
   still lights its stop while the pane is hidden.
   -------------------------------------------------------------------------- */

interface Stop {
  id: string
  screen: BrandScreen
  /** What to light; the page head when the first is not there. */
  sel: string
  heading: string
  body: string
}

/* Three stops, after every moved policy is in (owner, 6 Nov 2026: all policies, zones, device profiles; Templates
   stays hidden for now). */
const STOPS: Stop[] = [
  { id: 'policies', screen: { name: 'policies' }, sel: 'tr[data-from-old]', heading: 'All your policies', body: 'One per application, from your old policies. Open one to compare it with the old ones, approve it, then publish. Until then the old policy stays in effect.' },
  { id: 'zones', screen: { name: 'zones' }, sel: '[data-from-old]', heading: 'Zones', body: 'Old IP and location checks are zones now. Edit one here and every rule using it follows.' },
  { id: 'devices', screen: { name: 'fingerprint' }, sel: '.bpage__head', heading: 'Device profiles', body: 'Device limits are device profiles now. Check the device a person signs in from, its OS and health, in any rule.' },
]

const CARD = { w: 340, h: 220, lead: 80 }
const POLL_MS = 250

export function MoveTour() {
  const store = useBrand()
  const reduce = useReducedMotion() === true
  const open = store.moveTour
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const card = useRef<HTMLDivElement | null>(null)
  const stop = STOPS[i]
  const last = i === STOPS.length - 1
  const go = useRef(store.go)
  go.current = store.go

  useEffect(() => {
    if (open) setI(0)
  }, [open])

  const measure = useCallback(() => {
    const r = measureSelector(stop.sel) ?? measureSelector('.bpage__head') ?? measureSelector('.bbtop')
    setRect((prev) => (prev && r && Math.round(prev.top) === Math.round(r.top) && Math.round(prev.left) === Math.round(r.left) && Math.round(prev.width) === Math.round(r.width) ? prev : r))
  }, [stop.sel])

  useEffect(() => {
    if (!open) return
    go.current(stop.screen)
    const settle = window.setTimeout(() => {
      document.querySelector<HTMLElement>(stop.sel)?.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' })
      measure()
    }, 160)
    const poll = window.setInterval(measure, POLL_MS)
    window.addEventListener('resize', measure)
    return () => {
      window.clearTimeout(settle)
      window.clearInterval(poll)
      window.removeEventListener('resize', measure)
    }
  }, [open, stop, measure, reduce])

  const leave = useCallback(() => store.setMoveTour(false), [store])
  const keys = useRef({ leave, next: () => {}, back: () => {} })
  keys.current = { leave, next: () => (last ? leave() : setI((n) => n + 1)), back: () => setI((n) => Math.max(0, n - 1)) }
  useEffect(() => {
    if (!open) return
    card.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation()
        keys.current.leave()
      }
      if (e.key === 'ArrowRight') keys.current.next()
      if (e.key === 'ArrowLeft') keys.current.back()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, i])

  if (!open) return null
  /* Beside the lit element where a side has room, else under it (or over it, near the foot). */
  const p = place(rect, CARD)
  const pos =
    !rect || p.centred || p.side !== 'none'
      ? p
      : (() => {
          const below = rect.top + rect.height + GAP
          const fits = below + CARD.h <= window.innerHeight - GAP
          return { ...p, left: Math.max(GAP, Math.min(window.innerWidth - CARD.w - GAP, rect.left + rect.width - CARD.w)), top: fits ? below : Math.max(GAP, rect.top - GAP - CARD.h) }
        })()
  const spring = reduce ? { duration: 0 } : { type: 'spring' as const, stiffness: 320, damping: 34 }

  return (
    <div className="btr bmt">
      <p className="u-sr-only" aria-live="polite">{`Stop ${i + 1} of ${STOPS.length}. ${stop.heading}. ${stop.body}`}</p>
      <svg className="btr__scrim" aria-hidden>
        <defs>
          <mask id="bmt-hole">
            <rect x="0" y="0" width="100%" height="100%" fill="#fff" />
            {rect && <motion.rect initial={false} animate={{ x: rect.left, y: rect.top, width: rect.width, height: rect.height }} transition={spring} rx="12" fill="#000" />}
          </mask>
        </defs>
        <rect x="0" y="0" width="100%" height="100%" mask="url(#bmt-hole)" />
      </svg>
      {rect && <motion.span className="btr__ring" aria-hidden initial={false} animate={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }} transition={spring} />}
      <div className="btr__cardslot">
        <motion.div
          key={stop.id}
          ref={card}
          tabIndex={-1}
          role="dialog"
          aria-modal="false"
          aria-label={`Where your policies went, stop ${i + 1} of ${STOPS.length}`}
          className={`btr__card bmt__card ${p.centred ? 'is-centred' : ''}`}
          style={{ top: pos.top, left: pos.left }}
          initial={{ opacity: 0, y: reduce ? 0 : 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduce ? 0 : 0.2, ease: [0.2, 0, 0, 1] }}
        >
          <button type="button" className="btr__x" aria-label="Leave the tour" onClick={leave}>
            <X size={14} strokeWidth={2} />
          </button>
          <div className="btr__body">
            <span className="btr__count">
              Stop {i + 1} of {STOPS.length}
            </span>
            <h2>{stop.heading}</h2>
            <p>{stop.body}</p>
          </div>
          <footer className="btr__foot">
            <span className="btr__dots" aria-hidden />
            {i > 0 && (
              <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={keys.current.back}>
                Back
              </Button>
            )}
            <Button variant="primary" size="sm" iconRight={last ? undefined : ArrowRight} onClick={keys.current.next}>
              {last ? 'Done' : 'Next'}
            </Button>
          </footer>
        </motion.div>
      </div>
    </div>
  )
}
