import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { A11Y } from './a11y'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { X, type LucideIcon } from 'lucide-react'
import { SearchBox } from '../kit'
import { appRoot } from '../dialog-chrome'

/* -----------------------------------------------------------------------------
   The Dashboard's popups (Add widgets, Layouts), in the policy template
   store's own clothes (owner, 19 Nov 2026: "a marketplace kind of thing … not
   inline, so it doesn't hamper the dashboard … the experience we have for our
   templates"): create/TemplateSheet.tsx draws the same scrim, the same sheet
   rising on a spring, the same band with its icon, title and search, and the
   same grid of cards. The classes are that popup's (create.css `.bmarket`),
   so the two cannot drift apart; `.bdash-market` only drops its rail.

   It sits over the dashboard rather than beside it, so opening it changes no
   widget's size and redraws no chart.
   -------------------------------------------------------------------------- */

export function Market({
  open,
  title,
  by,
  icon: Icon,
  query,
  onQuery,
  placeholder,
  closeLabel = 'Close',
  onClose,
  children,
}: {
  open: boolean
  title: string
  /** A line under the title. */
  by?: string
  icon: LucideIcon
  query: string
  onQuery: (q: string) => void
  placeholder: string
  closeLabel?: string
  onClose: () => void
  children: ReactNode
}) {
  const still = useReducedMotion() === true
  const sheet = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose

  /* Focus comes into the sheet as it opens and goes back where it was as it closes; Escape closes it. */
  useEffect(() => {
    if (!open) return
    const before = document.activeElement as HTMLElement | null
    /* On the next frame: focusing lays the sheet out at once, and the first frame is the sheet's to draw. */
    const frame = requestAnimationFrame(() => sheet.current?.focus({ preventScroll: true }))
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      close.current()
    }
    window.addEventListener('keydown', key, true)
    /* dashboardA11y: the sheet is modal, so the page behind it is too: Tab and a screen reader stay inside it. */
    const held: HTMLElement[] = []
    const hold = requestAnimationFrame(() => {
      const overlay = sheet.current?.closest('.bmarket')
      if (!A11Y || !overlay?.parentElement) return
      for (const el of Array.from(overlay.parentElement.children)) {
        /* Announcers stay live, so a toast said while the sheet is open is still read. */
        if (el === overlay || !(el instanceof HTMLElement) || el.inert || el.matches('.u-sr-only, [aria-live], [role=status], [role=alert]')) continue
        el.inert = true
        held.push(el)
      }
    })
    return () => {
      cancelAnimationFrame(frame)
      cancelAnimationFrame(hold)
      for (const el of held) el.inert = false
      window.removeEventListener('keydown', key, true)
      before?.focus?.({ preventScroll: true })
    }
  }, [open])

  const tree = (
    <AnimatePresence>
      {open && (
        <motion.div
          className="bmarket bdash-market"
          role="dialog"
          aria-modal="true"
          aria-label={title}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: still ? 0 : 0.16 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose()
          }}
        >
          <motion.div
            ref={sheet}
            tabIndex={-1}
            style={{ outline: 'none' }}
            className="bmarket__sheet"
            initial={still ? false : { y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={still ? { opacity: 0, transition: { duration: 0 } } : { y: 16, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
          >
            <header className="bmarket__hero">
              <button type="button" className="bmarket__x" onClick={onClose} aria-label={closeLabel}>
                <X size={18} strokeWidth={1.9} />
              </button>
              <span className="bmarket__mark" aria-hidden>
                <Icon size={17} strokeWidth={1.8} />
              </span>
              <h2>{title}</h2>
              {by && <p className="bmarket__by">{by}</p>}
              <div className="bmarket__searchbox">
                <SearchBox block placeholder={placeholder} label={placeholder} value={query} onChange={onQuery} />
              </div>
            </header>
            <div className="bmarket__work bdash-market__work">
              <div className="bmarket__body">{children}</div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
  return typeof document === 'undefined' ? tree : createPortal(tree, appRoot())
}
