import { motion } from 'motion/react'
import { useEffect, useMemo, useRef } from 'react'

import { Face } from '../../../faces'
import { routeOf, type Pt } from './gates-geometry'

export type GatesTone = 'positive' | 'negative' | 'notice' | 'neutral'

/* The person, walking. Positioned by motion's x/y alone (the house transform
   trap: no CSS transform or transition on it); each move goes the walkway's
   way (routeOf), lasting the step that makes it, stopping a beat in each
   booth it passes (`holds`). */
export function GatesToken({
  pt,
  runKey,
  ms,
  name,
  tone = 'neutral',
  inside = false,
  holds = [],
}: {
  pt: Pt
  runKey: number
  ms: number
  name: string
  tone?: GatesTone
  inside?: boolean
  /** Points on the way it pauses at: the booths. */
  holds?: readonly Pt[]
}) {
  const from = useRef<Pt>(pt)
  const walk = useMemo(() => {
    const pts = routeOf(from.current, pt)
    /* A booth on the way is a stop: it is walked into, held, and left. */
    const way: { p: Pt; w: number }[] = [{ p: pts[0], w: 0 }]
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]
      const b = pts[i]
      const on = holds
        .filter((h) => Math.abs(h.y - a.y) < 0.5 && Math.abs(a.y - b.y) < 0.5 && (h.x - a.x) * (h.x - b.x) < 0)
        .sort((m, n) => Math.abs(m.x - a.x) - Math.abs(n.x - a.x))
      let last = a
      for (const h of on) {
        way.push({ p: h, w: Math.abs(h.x - last.x) })
        way.push({ p: h, w: 70 })
        last = h
      }
      way.push({ p: b, w: Math.abs(b.x - last.x) + Math.abs(b.y - last.y) })
    }
    const total = way.reduce((n, x) => n + x.w, 0) || 1
    let acc = 0
    const times = way.map((x) => {
      acc += x.w
      return acc / total
    })
    return { xs: way.map((x) => x.p.x), ys: way.map((x) => x.p.y), times }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a new walk only when the stop changes
  }, [pt.x, pt.y, runKey])
  useEffect(() => {
    from.current = pt
  })
  const first = name.trim().split(/\s+/)[0] || name
  /* The walk never goes back: a replay starts afresh where it began, at once. */
  const still = ms <= 0 || walk.xs.length < 2 || pt.x < walk.xs[0] - 1
  return (
    <motion.div
      className={`rl-gates__token is-${tone}${inside ? ' is-inside' : ''}`}
      aria-hidden
      initial={false}
      animate={still ? { x: pt.x, y: pt.y } : { x: walk.xs, y: walk.ys }}
      transition={still ? { duration: 0 } : { duration: (ms * 0.94) / 1000, times: walk.times, ease: 'easeInOut' }}
    >
      <span className="rl-gates__tokenface">{name ? <Face kind="user" name={name} size="sm" decorative /> : null}</span>
      {first && <span className="rl-gates__tokenname">{first}</span>}
    </motion.div>
  )
}
