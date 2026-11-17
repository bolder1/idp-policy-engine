import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { X, type LucideIcon } from 'lucide-react'
import './bulk-bar.css'

/* -----------------------------------------------------------------------------
   The selection bar, for every list (owner, 9 Nov 2026: "they like this; polish it, they want to use it globally").
   It rises from the foot of the window while rows are picked, so the table never jumps: the count, the actions for the
   picked rows, and a close that clears the pick. Esc clears too. An action that cannot apply to this pick stays visible
   but greyed, with its reason as a tip. Dark, so it reads as a tool over the page rather than part of it.
   -------------------------------------------------------------------------- */

export interface BulkAction {
  label: string
  icon?: LucideIcon
  onClick: () => void
  /** Why it cannot apply to this pick; greys it out. */
  disabledReason?: string
}

export function BulkBar({ count, noun = 'selected', actions, onClear, label = 'Selected rows' }: { count: number; noun?: string; actions: BulkAction[]; onClear: () => void; label?: string }) {
  const reduce = useReducedMotion() === true
  useEffect(() => {
    if (count === 0) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) onClear()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [count, onClear])
  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="bbulk__dock">
      <AnimatePresence>
        {count > 0 && (
          <motion.div
            key="bar"
            className="bbulk"
            role="toolbar"
            aria-label={label}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          >
            <span className="bbulk__count" aria-live="polite">
              <b>{count}</b> {noun}
            </span>
            <span className="bbulk__sep" aria-hidden />
            {actions.map((a) => (
              <button
                key={a.label}
                type="button"
                className="bbulk__act"
                disabled={!!a.disabledReason}
                title={a.disabledReason}
                onClick={a.onClick}
              >
                {a.icon && <a.icon size={15} strokeWidth={2} aria-hidden />}
                {a.label}
              </button>
            ))}
            <span className="bbulk__sep" aria-hidden />
            <button type="button" className="bbulk__x" aria-label="Clear selection" title="Clear selection (Esc)" onClick={onClear}>
              <X size={16} strokeWidth={2} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body,
  )
}
