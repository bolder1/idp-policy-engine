import { motion } from 'motion/react'

import { CX, CY, R, RING_BOTTOM, arcPath, polar } from './jarvis-geometry'

/* -----------------------------------------------------------------------------
   The far rings (JarvisLayout.tsx): the HUD's back layer, round the core on
   its open side (lower left, clear of the identity and the conditions above
   it) — a dashed track, a protractor arc with its data ticks. Faint, never
   meaning anything but structure; while the engine works the ticks drift
   back and forth like a readout (CSS, paused the moment the run lands), and
   the whole layer leans against the HUD as the pointer moves
   (jarvis-parallax.ts writes its `translate`).
   -------------------------------------------------------------------------- */

const A0 = 196
const A1 = 318
const TICK_R = R + 80
const TICKS = Array.from({ length: Math.floor((A1 - A0) / 4) + 1 }, (_, i) => A0 + i * 4)

export function JarvisFar({ idle, play }: { idle: boolean; play: boolean }) {
  const W = CX + R + 120
  const H = RING_BOTTOM + 40
  return (
    <motion.svg
      className={`rl-jarvis__far${idle ? ' is-idle' : ''}`}
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      aria-hidden
      initial={play ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      transition={{ duration: play ? 0.9 : 0, delay: play ? 0.35 : 0 }}
    >
      <path className="rl-jarvis__fartrack" d={arcPath(186, 330, R + 50)} />
      <path className="rl-jarvis__farline" d={arcPath(A0 - 4, A1 + 4, TICK_R)} />
      <g className="rl-jarvis__farticks" style={{ transformOrigin: `${CX}px ${CY}px` }}>
        {TICKS.map((deg) => {
          const major = (deg - A0) % 24 === 0
          const p0 = polar(deg, TICK_R + 2)
          const p1 = polar(deg, TICK_R + (major ? 11 : 6))
          return (
            <line
              key={deg}
              className={major ? 'is-major' : undefined}
              x1={p0.x.toFixed(1)}
              y1={p0.y.toFixed(1)}
              x2={p1.x.toFixed(1)}
              y2={p1.y.toFixed(1)}
            />
          )
        })}
      </g>
      <path className="rl-jarvis__fartrack is-inner" d={arcPath(200, 300, R + 34)} />
    </motion.svg>
  )
}
