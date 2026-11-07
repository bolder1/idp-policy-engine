import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useBrand } from '../store'
import './move-policies.css'

/* The move, in the top bar, while it runs in the background (owner, 3 Nov 2026: "both the top pill and the toast").
   A ring that fills and the count; a press goes back to the move. Gone when nothing moves: the toast says it ended. */
export function MoveJobPill() {
  const { moveJob, go, screen } = useBrand()
  const reduce = useReducedMotion()
  const on = moveJob?.status === 'running' && screen.name !== 'move-policies'
  const R = 7
  const C = 2 * Math.PI * R
  return (
    <AnimatePresence>
      {on && moveJob && (
        <motion.button
          type="button"
          className="bmvpill"
          onClick={() => go({ name: 'move-policies' })}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
          aria-label="Moving policies. Open"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
            <circle cx="9" cy="9" r={R} className="bmvpill__track" />
            {/* No count while it runs (owner, 5 Nov 2026): the ring just turns. */}
            <motion.circle cx="9" cy="9" r={R} className="bmvpill__fill" strokeDasharray={`${C * 0.3} ${C}`} animate={reduce ? undefined : { rotate: 360 }} transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }} />
          </svg>
          Moving policies
        </motion.button>
      )}
    </AnimatePresence>
  )
}
