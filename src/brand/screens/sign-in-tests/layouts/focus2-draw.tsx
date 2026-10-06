import { motion } from 'motion/react'

import type { AccessDecision } from '../../../data'
import { DRAW_MS } from './focus2-draw-model'

/* The verdict's mark, drawn: Lucide's own ShieldCheck / KeyRound / Ban paths (lucide-react 's icon nodes, copied so
   they can be `motion.path`s — a Lucide component cannot take `pathLength`). Each outline draws 0 → 1 over 450 ms; the
   tick that sits inside the shield follows it. Used only for the landing flourish of Focus v2 (focus-outcome.tsx, the
   `v2.land` flag); every other landing, and every browse back to the card, draws the plain icon. */

const EASE = [0.2, 0, 0, 1] as const

const SHIELD = 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z'
const TICK = 'm9 12 2 2 4-4'
const KEY = 'M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z'
const SLASH = 'M4.929 4.929 19.07 19.071'

export function VerdictStroke({ decision, size = 24 }: { decision: AccessDecision; size?: number }) {
  const draw = { initial: { pathLength: 0 }, animate: { pathLength: 1 }, transition: { duration: DRAW_MS / 1000, ease: EASE } }
  const later = { initial: { pathLength: 0 }, animate: { pathLength: 1 }, transition: { duration: 0.25, delay: 0.3, ease: EASE } }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {decision === '1fa' && (
        <>
          <motion.path d={SHIELD} {...draw} />
          <motion.path d={TICK} {...later} />
        </>
      )}
      {decision === '2fa' && (
        <>
          <motion.path d={KEY} {...draw} />
          <motion.circle cx="16.5" cy="7.5" r=".5" fill="currentColor" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2, delay: 0.3 }} />
        </>
      )}
      {decision === 'deny' && (
        <>
          <motion.circle cx="12" cy="12" r="10" {...draw} />
          <motion.path d={SLASH} {...later} />
        </>
      )}
    </svg>
  )
}
