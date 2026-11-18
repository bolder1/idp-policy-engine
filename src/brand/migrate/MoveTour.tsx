import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, X } from 'lucide-react'
import { Button } from '../kit'
import { useBrand, type BrandScreen } from '../store'
import type { Rect } from '../tour/spotlight'
import '../tour/tour.css'
import './move-tour.css'

/* -----------------------------------------------------------------------------
   Where your policies went: the tour Done offers (owner, 4 Nov 2026), redone 9 Nov 2026 ("make it smooth, next and
   back; fix the whole walkthrough").

   Each stop is a page and a thing on it: the migrated policies, the zones made from old checks, the device profiles.
   Moving between stops is one calm sequence: the light and the card fade, the page changes and settles, then the
   light grows round the new thing and the card glides in beside it. The card always sits inside the content area,
   under the lit thing (over it when there is no room below), never over the rail. Non-modal; Esc leaves; arrows step.
   Timers, not animation frames, so it still settles while the pane is hidden.
   -------------------------------------------------------------------------- */

interface Stop {
  id: string
  screen: BrandScreen
  /** What to light: every match, as one box. */
  sel: string
  /** Lit instead when nothing matches. */
  fallback: string
  heading: string
  body: string
}

const STOPS: Stop[] = [
  { id: 'policies', screen: { name: 'policies', sub: 'moved' }, sel: 'tr[data-from-old]', fallback: '.btable-wrap', heading: 'Your migrated policies', body: 'One per application, each under review. The old policy keeps deciding sign-ins until you publish its new one.' },
  { id: 'zones', screen: { name: 'zones' }, sel: '[data-from-old]', fallback: '.bpage > :nth-child(3)', heading: 'Zones', body: 'Old IP and location checks are zones now. Change one here and every rule using it follows.' },
  { id: 'devices', screen: { name: 'fingerprint' }, sel: '.bpage .blist, .bpage .btable-wrap, .bpage .bcards', fallback: '.bpage__head', heading: 'Device profiles', body: 'Device limits are device profiles now: the device, its OS and health, in any rule.' },
  /* The tour ends where the work is (owner, 10 Nov 2026: "this should end in the policy tab … start review"): back on
     Policies, the migration cards lit (18 Nov 2026: the flow as it is now, Review / Approve / Reject), and the last
     button starts the review rather than only closing. */
  { id: 'review', screen: { name: 'policies', sub: 'moved' }, sel: '.brc', fallback: '.bann, .btable-wrap', heading: 'Review, approve, publish', body: 'Review opens each policy beside its old one to approve or reject. Publish approved makes them active. Rejected ones go to support.' },
]

const CARD = { w: 360, h: 196 }
const PAD = 8
const EDGE = 16
/** The page changes, then settles, then the light comes: a beat each. */
const LEAVE_MS = 180
const SETTLE_MS = 420
const POLL_MS = 300
const EASE = [0.22, 1, 0.36, 1] as const

/** Every match of `sel` (visible ones, up to the window's foot) as one padded box. */
function measureAll(sel: string): Rect | null {
  const els = [...document.querySelectorAll<HTMLElement>(sel)].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0)
  if (!els.length) return null
  const top = Math.min(...els.map((r) => r.top))
  const left = Math.min(...els.map((r) => r.left))
  const right = Math.max(...els.map((r) => r.right))
  /* A long list is lit to the window's foot, leaving room for the card above it. */
  const bottom = Math.min(Math.max(...els.map((r) => r.bottom)), window.innerHeight - EDGE)
  return { top: top - PAD, left: left - PAD, width: right - left + PAD * 2, height: Math.max(0, bottom - top) + PAD * 2 }
}

/** Under the lit box, else over it, else inside its top; always within the content area. */
function cardAt(rect: Rect) {
  const main = document.querySelector('.bshell__main')?.getBoundingClientRect()
  const minL = (main?.left ?? 0) + EDGE
  const maxL = (main?.right ?? window.innerWidth) - CARD.w - EDGE
  const left = Math.max(minL, Math.min(maxL, rect.left))
  const below = rect.top + rect.height + 12
  if (below + CARD.h <= window.innerHeight - EDGE) return { top: below, left }
  const above = rect.top - 12 - CARD.h
  if (above >= EDGE + 52) return { top: above, left }
  return { top: Math.max(EDGE + 52, rect.top + 12), left: Math.max(minL, Math.min(maxL, rect.left + rect.width - CARD.w - 12)) }
}

export function MoveTour() {
  const store = useBrand()
  const reduce = useReducedMotion() === true
  const open = store.moveTour
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  /* False while moving between stops: the light and the card are away. */
  const [shown, setShown] = useState(false)
  const card = useRef<HTMLDivElement | null>(null)
  const stop = STOPS[i]
  const last = i === STOPS.length - 1
  const go = useRef(store.go)
  go.current = store.go

  useEffect(() => {
    if (open) setI(0)
  }, [open])

  const measure = useCallback(() => {
    const r = measureAll(stop.sel) ?? measureAll(stop.fallback)
    setRect((prev) => (prev && r && Math.round(prev.top) === Math.round(r.top) && Math.round(prev.left) === Math.round(r.left) && Math.round(prev.width) === Math.round(r.width) && Math.round(prev.height) === Math.round(r.height) ? prev : r))
  }, [stop])

  /* One stop's arrival: away, page, settle, scroll, light. */
  useEffect(() => {
    if (!open) return
    setShown(false)
    const timers: number[] = []
    let poll = 0
    timers.push(
      window.setTimeout(() => go.current(stop.screen), reduce ? 0 : LEAVE_MS),
      window.setTimeout(
        () => {
          const el = document.querySelector<HTMLElement>(stop.sel) ?? document.querySelector<HTMLElement>(stop.fallback)
          el?.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' })
        },
        reduce ? 60 : LEAVE_MS + SETTLE_MS * 0.5,
      ),
      window.setTimeout(
        () => {
          measure()
          setShown(true)
          poll = window.setInterval(measure, POLL_MS)
        },
        reduce ? 120 : LEAVE_MS + SETTLE_MS + 260,
      ),
    )
    window.addEventListener('resize', measure)
    return () => {
      timers.forEach((t) => window.clearTimeout(t))
      window.clearInterval(poll)
      window.removeEventListener('resize', measure)
    }
  }, [open, stop, measure, reduce])

  const leave = useCallback(() => store.setMoveTour(false), [store])

  /* The tour belongs to its stop's page: going anywhere else (a policy into the builder, a rail item) ends it. */
  const here = store.screen.name
  const arrived = useRef(false)
  useEffect(() => {
    arrived.current = false
  }, [open, i])
  useEffect(() => {
    if (!open) return
    if (here === stop.screen.name) arrived.current = true
    else if (arrived.current) leave()
  }, [open, here, stop, leave])

  /* The first migrated draft, where Start review opens (the review banner's own start, finale.tsx). */
  const firstDraft = store.policies.find((p) => p.movedFrom?.length && p.status === 'draft' && p.appIds.length > 0)
  const startReview = useCallback(() => {
    leave()
    if (firstDraft) go.current({ name: 'board', policyId: firstDraft.id })
  }, [leave, firstDraft])
  const next = useCallback(() => (last ? startReview() : setI((n) => n + 1)), [last, startReview])
  const back = useCallback(() => setI((n) => Math.max(0, n - 1)), [])
  const keys = useRef({ leave, next, back })
  keys.current = { leave, next, back }
  useEffect(() => {
    if (!open) return
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
  }, [open])
  useEffect(() => {
    if (shown) card.current?.focus({ preventScroll: true })
  }, [shown, i])

  if (!open) return null
  const lit = shown && rect
  const pos = rect ? cardAt(rect) : { top: 0, left: 0 }
  const glide = reduce ? { duration: 0 } : { duration: 0.45, ease: EASE }

  return (
    <div className="btr bmt">
      <p className="u-sr-only" aria-live="polite">{shown ? `Stop ${i + 1} of ${STOPS.length}. ${stop.heading}. ${stop.body}` : ''}</p>
      <svg className="btr__scrim" aria-hidden>
        <defs>
          <mask id="bmt-hole">
            <rect x="0" y="0" width="100%" height="100%" fill="#fff" />
            <AnimatePresence>
              {lit && (
                <motion.rect
                  key={stop.id}
                  initial={reduce ? false : { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, width: 0, height: 0, opacity: 0 }}
                  animate={{ x: rect.left, y: rect.top, width: rect.width, height: rect.height, opacity: 1 }}
                  exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.15 } }}
                  transition={glide}
                  rx="12"
                  fill="#000"
                />
              )}
            </AnimatePresence>
          </mask>
        </defs>
        <rect x="0" y="0" width="100%" height="100%" mask="url(#bmt-hole)" />
      </svg>
      <AnimatePresence>
        {lit && (
          <motion.span
            key={`ring-${stop.id}`}
            className="btr__ring"
            aria-hidden
            initial={reduce ? false : { top: rect.top + 6, left: rect.left + 6, width: rect.width - 12, height: rect.height - 12, opacity: 0 }}
            animate={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height, opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.15 } }}
            transition={glide}
          />
        )}
      </AnimatePresence>
      <div className="btr__cardslot">
        <AnimatePresence>
          {lit && (
            <motion.div
              key={`card-${stop.id}`}
              ref={card}
              tabIndex={-1}
              role="dialog"
              aria-modal="false"
              aria-label={`Where your policies went, stop ${i + 1} of ${STOPS.length}`}
              className="btr__card bmt__card"
              initial={reduce ? { opacity: 0, top: pos.top, left: pos.left } : { opacity: 0, top: pos.top + 10, left: pos.left }}
              animate={{ opacity: 1, top: pos.top, left: pos.left }}
              exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.15 } }}
              transition={reduce ? { duration: 0 } : { duration: 0.35, ease: EASE, delay: 0.12 }}
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
                <span className="bmt__dots" aria-hidden>
                  {STOPS.map((s, n) => (
                    <i key={s.id} className={n === i ? 'is-on' : n < i ? 'is-done' : ''} />
                  ))}
                </span>
                {i > 0 && (
                  <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={back}>
                    Back
                  </Button>
                )}
                <Button variant="primary" size="sm" iconRight={last ? undefined : ArrowRight} onClick={next}>
                  {last ? (firstDraft ? 'Start review' : 'Done') : 'Next'}
                </Button>
              </footer>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
