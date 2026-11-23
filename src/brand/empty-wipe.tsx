import { useEffect } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Check } from 'lucide-react'

import { setEmptyTenant } from './empty-tenant'

/* -----------------------------------------------------------------------------
   The profile menu's Show empty states / Hide empty states: a REVIEW TOOL, not product (empty-tenant.ts says how to remove it).

   A card over the console names what is cleared, and each row's bar drains in turn (fills, on the way back) and ends
   in a tick; then the tab reloads on the tenant it asked for. With reduced motion the rows are drawn done at once.
   -------------------------------------------------------------------------- */

const PARTS = ['Policies', 'Zones', 'Device profiles', 'External hooks', 'Applications', 'Users', 'Groups', 'Sign-in activity']

const STEP = 0.12
const RUN = 0.45

export function EmptyWipe({ empty }: { empty: boolean }) {
  const still = !!useReducedMotion()
  const total = still ? 300 : (STEP * (PARTS.length - 1) + RUN) * 1000 + 450
  useEffect(() => {
    const t = window.setTimeout(() => setEmptyTenant(empty), total)
    return () => window.clearTimeout(t)
  }, [empty, total])

  return (
    <div className="bwipe" role="status" aria-live="polite">
      <motion.div className="bwipe__scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: still ? 0 : 0.2 }} />
      <motion.div
        className="bwipe__card"
        initial={{ opacity: 0, y: still ? 0 : 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: still ? 0 : 0.22, ease: 'easeOut' }}
      >
        <h2 className="bwipe__title">{empty ? 'Going empty' : 'Bringing back data'}</h2>
        <ul className="bwipe__list">
          {PARTS.map((p, i) => {
            const delay = still ? 0 : i * STEP
            return (
              <li key={p} className="bwipe__row">
                <span className="bwipe__name">{p}</span>
                <span className="bwipe__track" aria-hidden>
                  <motion.span
                    className="bwipe__bar"
                    style={{ originX: 0 }}
                    initial={{ scaleX: empty ? 1 : 0 }}
                    animate={{ scaleX: empty ? 0 : 1 }}
                    transition={{ duration: still ? 0 : RUN, delay, ease: 'easeInOut' }}
                  />
                </span>
                <motion.span
                  className="bwipe__done"
                  aria-hidden
                  initial={{ opacity: 0, scale: still ? 1 : 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: still ? 0 : 0.18, delay: still ? 0 : delay + RUN }}
                >
                  <Check size={14} strokeWidth={2.2} />
                </motion.span>
              </li>
            )
          })}
        </ul>
      </motion.div>
    </div>
  )
}
