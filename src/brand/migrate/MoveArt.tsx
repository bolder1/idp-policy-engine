import { motion, useReducedMotion } from 'motion/react'
import { ChevronRight, Layers, ShieldCheck } from 'lucide-react'

/* -----------------------------------------------------------------------------
   The move, said simply (owner, 4 Nov 2026: "a simplified version ... a generic one").
   Two tiles: the old builder in grey, the new one in the brand's orange. Between them a
   track with a card gliding along it and three chevrons lighting in turn; the new tile
   breathes as each card arrives. `pace` is the time left: the same picture, quicker as
   the day nears. Motion props only; reduced motion draws it still.
   -------------------------------------------------------------------------- */

export type CranePace = 'calm' | 'busy' | 'rush'

const TRIP: Record<CranePace, number> = { calm: 2.6, busy: 1.8, rush: 1.1 }

export function MoveArt({ pace = 'calm' }: { pace?: CranePace }) {
  const still = useReducedMotion()
  const trip = TRIP[pace]
  return (
    <div className={`bmart is-${pace}`} role="img" aria-label="Old policies moving to the new policy builder">
      <span className="bmart__tile is-old">
        <Layers size={26} strokeWidth={1.8} aria-hidden />
      </span>
      <span className="bmart__track" aria-hidden>
        <span className="bmart__rail" />
        <span className="bmart__chevrons">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              initial={false}
              animate={still ? { opacity: 0.6 } : { opacity: [0.2, 1, 0.2] }}
              transition={still ? undefined : { duration: trip, delay: (i * trip) / 3, repeat: Infinity, ease: 'easeInOut' }}
            >
              <ChevronRight size={18} strokeWidth={2.4} />
            </motion.span>
          ))}
        </span>
        {!still && (
          <motion.span
            className="bmart__card"
            initial={false}
            animate={{ left: ['0%', '100%'], opacity: [0, 1, 1, 0] }}
            transition={{ duration: trip, repeat: Infinity, ease: [0.45, 0, 0.2, 1], times: [0, 0.15, 0.85, 1] }}
          />
        )}
      </span>
      <span className="bmart__tile is-new">
        {!still && (
          <motion.span
            className="bmart__ring"
            initial={false}
            animate={{ scale: [1, 1.35], opacity: [0.5, 0] }}
            transition={{ duration: trip, repeat: Infinity, ease: 'easeOut' }}
          />
        )}
        <ShieldCheck size={26} strokeWidth={1.8} aria-hidden />
      </span>
    </div>
  )
}
