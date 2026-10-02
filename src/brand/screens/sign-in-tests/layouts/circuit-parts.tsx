import { animate, motion } from 'motion/react'
import { useLayoutEffect, useRef } from 'react'

import { roundedPath, type Pt } from './circuit-geometry'
import type { SwitchState, Tone } from './circuit-model'

/* -----------------------------------------------------------------------------
   The board's SVG pieces (CircuitLayout.tsx): a switch on a trace, the
   current's front running a trace, the spark where a circuit stays open.
   Every colour is the stage's (circuit.css): these only set classes. Motion
   moves attributes (x2/y2, r, opacity, dash offset), never a CSS transform.
   -------------------------------------------------------------------------- */

const EASE = [0.4, 0, 0.2, 1] as const

/** Where a lever's free end stands: closed on the far pad, open raised, half-way for can't tell. */
function leverEnd(xa: number, xb: number, y: number, state: SwitchState): Pt {
  const L = xb - xa
  const at = (deg: number): Pt => [xa + L * Math.cos((deg * Math.PI) / 180), y - L * Math.sin((deg * Math.PI) / 180)]
  switch (state) {
    case 'closed':
    case 'closing':
    case 'also':
      return [xb, y]
    case 'unknown':
      return at(13)
    case 'testing':
      return at(24)
    default:
      return at(32)
  }
}

export function SwitchMark({ xa, xb, y, state, live, play, spark }: { xa: number; xb: number; y: number; state: SwitchState; live: Tone | null; play: boolean; spark: boolean }) {
  const [ex, ey] = leverEnd(xa, xb, y, state)
  const cx = (xa + xb) / 2
  const cls = `rl-circuit__sw is-${state}${live ? ` is-live is-${live}` : ''}`
  return (
    <g className={cls} aria-hidden>
      {state === 'testing' && (
        <motion.circle
          className="rl-circuit__swhalo"
          cx={cx}
          cy={y}
          initial={{ r: 10, opacity: 0.2 }}
          animate={play ? { r: [10, 15, 10], opacity: [0.2, 0.55, 0.2] } : { r: 13, opacity: 0.4 }}
          transition={play ? { duration: 0.9, repeat: Infinity, ease: 'easeInOut' } : { duration: 0 }}
        />
      )}
      <line className="rl-circuit__swgap" x1={xa} y1={y} x2={xb} y2={y} />
      <motion.line
        className="rl-circuit__lever"
        x1={xa}
        y1={y}
        initial={false}
        animate={
          state === 'testing' && play
            ? { x2: [leverEnd(xa, xb, y, 'open')[0], ex, leverEnd(xa, xb, y, 'unknown')[0], ex], y2: [leverEnd(xa, xb, y, 'open')[1], ey, leverEnd(xa, xb, y, 'unknown')[1], ey] }
            : { x2: ex, y2: ey }
        }
        transition={
          state === 'testing' && play
            ? { duration: 0.7, repeat: Infinity, ease: 'easeInOut' }
            : play
              ? { type: 'spring', stiffness: 520, damping: 22, mass: 0.6 }
              : { duration: 0 }
        }
      />
      <circle className="rl-circuit__pad" cx={xa} cy={y} r={3.6} />
      <circle className="rl-circuit__pad is-far" cx={xb} cy={y} r={3.6} />
      {spark && <Spark x={xb - 3} y={y - 4} play={play} />}
    </g>
  )
}

/* The circuit stays open: a red flash at the gap, once, then the mark. */
export function Spark({ x, y, play }: { x: number; y: number; play: boolean }) {
  if (!play) return null
  const rays = [0, 60, 120, 180, 240, 300]
  return (
    <g className="rl-circuit__spark">
      <motion.circle cx={x} cy={y} initial={{ r: 2, opacity: 0.95 }} animate={{ r: 15, opacity: 0 }} transition={{ duration: 0.6, ease: [0.2, 0, 0, 1] }} />
      {rays.map((deg) => {
        const a = (deg * Math.PI) / 180
        return (
          <motion.line
            key={deg}
            x1={x + Math.cos(a) * 4}
            y1={y + Math.sin(a) * 4}
            initial={{ x2: x + Math.cos(a) * 5, y2: y + Math.sin(a) * 5, opacity: 1 }}
            animate={{ x2: x + Math.cos(a) * 12, y2: y + Math.sin(a) * 12, opacity: 0 }}
            transition={{ duration: 0.45, ease: [0.2, 0, 0, 1] }}
          />
        )
      })}
    </g>
  )
}

/* The current's front: the trace lighting from its start to its end over
   the step's length, a bright head running ahead of it. */
export function Front({ pts, ms, className = '', delay = 0 }: { pts: readonly Pt[]; ms: number; className?: string; delay?: number }) {
  const path = useRef<SVGPathElement | null>(null)
  const head = useRef<SVGCircleElement | null>(null)
  const d = roundedPath(pts)
  useLayoutEffect(() => {
    const p = path.current
    const h = head.current
    if (!p || !h || typeof p.getTotalLength !== 'function') return
    const len = p.getTotalLength()
    if (!len) return
    const paint = (v: number) => {
      p.style.strokeDasharray = `${len} ${len}`
      p.style.strokeDashoffset = String(len * (1 - v))
      const pt = p.getPointAtLength(len * v)
      h.setAttribute('cx', String(pt.x))
      h.setAttribute('cy', String(pt.y))
      h.style.opacity = v >= 1 ? '0' : '1'
    }
    paint(0)
    const ctl = animate(0, 1, { duration: Math.max(0.12, ms / 1000), delay: delay / 1000, ease: EASE, onUpdate: paint })
    return () => ctl.stop()
  }, [d, ms, delay])
  if (!d) return null
  return (
    <g className={`rl-circuit__front ${className}`} aria-hidden>
      <path ref={path} d={d} className="rl-circuit__frontpath" />
      <circle ref={head} r={4.2} cx={pts[0]?.[0] ?? 0} cy={pts[0]?.[1] ?? 0} className="rl-circuit__head" />
    </g>
  )
}
