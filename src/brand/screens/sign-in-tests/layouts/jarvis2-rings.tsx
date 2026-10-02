import { motion } from 'motion/react'
import { useId, type CSSProperties } from 'react'

import { arc, arcChars, lockAngle, polar, segments, textArc } from './jarvis2-geometry'
import type { Ring, RingSeg } from './jarvis2-model'

/* -----------------------------------------------------------------------------
   One run ring of the reactor (JarvisLayout.tsx): its segments, their labels
   along the arc, and the lock. The ring is its own square SVG on its own
   layer, turned by motion as a whole (a transform on an HTML box: the
   compositor turns it, nothing repaints), so it rotates like a combination
   lock to bring the segment in focus under the pointer at 12 o'clock — easing
   in with a slight overshoot, and the clamps snapping shut once it is the
   answer.

   Labels are set along the arc, reversed where the ring's resting angle puts
   them on the lower half, so none reads upside down at rest. Colour sits on
   classes (the meaning inks, jarvis.css), never on what motion moves.
   -------------------------------------------------------------------------- */

export interface RunRingProps {
  kind: 'pol' | 'rule' | 'chk'
  ring: Ring
  /** The band's radius, its width, the labels' radius. */
  r: number
  band: number
  lr: number
  /** The square's half-size: the ring's centre within it. */
  c: number
  /** Where the square's centre sits in the world. */
  cx: number
  cy: number
  gap?: number
  /** A run playing: it turns and draws; else it stands at rest at once. */
  play: boolean
  /** How long a turn takes, ms (the run's clock). */
  turnMs: number
  /** The segment lit from a row (one colour links them). */
  hot: ReadonlySet<string>
  onHot: (jv: string | null) => void
  onPress: (seg: RingSeg) => void
  /** Find's lap: the segments draw in behind the satellite, over this many ms (0: drawn). */
  drawMs?: number
  /** Jarvis's entrance (jarvis-mode/): the ring dials in to its lock from a turn away, after this many ms. */
  arrive?: number | null
}

const f = (n: number) => n.toFixed(1)

const ARRIVE_TURN = { pol: -150, rule: 120, chk: -90 } as const

export function RunRing({ kind, ring, r, band, lr, c, cx, cy, gap = 3.2, play, turnMs, hot, onHot, onPress, drawMs = 0, arrive = null }: RunRingProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const n = ring.segs.length
  const segs = segments(n, kind === 'chk' ? 8 : gap)
  const rest = lockAngle(ring.focus, n)
  const L = { CX: c, CY: c }
  const size = c * 2
  const start = segs[0]?.a0 ?? 0
  const dialIn = arrive !== null && !play
  const turn = play
    ? { duration: Math.max(0.32, Math.min(0.9, turnMs / 1000)), ease: [0.3, 1.32, 0.5, 1] as const }
    : dialIn
      ? { duration: 1.05, delay: arrive / 1000, ease: [0.25, 1.25, 0.45, 1] as const }
      : { duration: 0 }
  return (
    <motion.div
      className={`jv2-ring is-${kind}${ring.shown ? '' : ' is-hidden'}`}
      style={{ left: cx - c, top: cy - c, width: size, height: size }}
      initial={play ? { rotate: 0 } : { rotate: dialIn ? rest + ARRIVE_TURN[kind] : rest }}
      animate={{ rotate: rest }}
      transition={turn}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle className="jv2-ring__track" cx={c} cy={c} r={r} strokeWidth={band} />
        {ring.segs.map((s, i) => {
          const g = segs[i]
          if (!g) return null
          const d = arc(L, r, g.a0, g.a1)
          const lit = s.tone !== 'idle' && s.tone !== 'ghost' && s.tone !== 'off' && s.tone !== 'miss'
          const drawing = drawMs > 0 && play
          const style = drawing
            ? ({ '--jv2-draw-ms': `${Math.round((drawMs * (g.a1 - g.a0)) / 360)}ms`, '--jv2-draw-at': `${Math.round((drawMs * (g.a0 - start)) / 360)}ms` } as CSSProperties)
            : undefined
          const id = `${uid}-${kind}-${i}`
          const max = arcChars(lr, g.a0, g.a1)
          const text = s.label.length > max ? (max >= 3 ? `${s.label.slice(0, Math.max(1, max - 1)).trimEnd()}…` : s.label.split(' ')[0]) : s.label
          const isHot = hot.has(s.jv)
          return (
            <g
              key={s.key}
              className={`jv2-seg t-${s.tone}${s.dashed ? ' is-dashed' : ''}${isHot ? ' is-hot' : ''}${drawing ? ' is-drawing' : ''}${ring.focus === i ? ' is-focus' : ''}`}
              style={style}
              data-card
              onPointerEnter={() => onHot(s.jv)}
              onPointerLeave={() => onHot(null)}
              onClick={() => onPress(s)}
            >
              <title>{s.full}</title>
              {lit && <path className="jv2-seg__glow" d={d} strokeWidth={band + 8} pathLength={1} />}
              <path className="jv2-seg__band" d={d} strokeWidth={band} pathLength={1} />
              {!lit && <path className="jv2-seg__hollow" d={d} strokeWidth={Math.max(1, band - 3)} />}
              {s.dashed && <path className="jv2-seg__dash" d={d} />}
              <path className="jv2-seg__hit" d={d} strokeWidth={band + 14} />
              {[g.a0, g.a1].map((a) => {
                const [x, y] = polar(L, r, a)
                return <circle key={a} className="jv2-seg__cap" cx={f(x)} cy={f(y)} r={1.6} />
              })}
              <path id={id} d={textArc(L, lr, g.a0 + 1, g.a1 - 1, rest)} fill="none" />
              <text className="jv2-seg__label" dominantBaseline="middle">
                <textPath href={`#${id}`} startOffset="50%" textAnchor="middle">
                  {text}
                </textPath>
              </text>
            </g>
          )
        })}
        {ring.focus !== null && segs[ring.focus] && <Clamps kind={kind} seg={segs[ring.focus]} r={r} band={band} c={c} locked={ring.locked} tone={ring.segs[ring.focus]?.tone ?? 'idle'} play={play} />}
      </svg>
    </motion.div>
  )
}

/* The lock: two brackets on the segment's ends. Open and pulsing cyan while
   the engine examines it; snapped shut, in its meaning colour, once it is the
   answer. */
function Clamps({ kind, seg, r, band, c, locked, tone, play }: { kind: string; seg: { a0: number; a1: number }; r: number; band: number; c: number; locked: boolean; tone: string; play: boolean }) {
  const L = { CX: c, CY: c }
  const h = band / 2 + (kind === 'chk' ? 5 : 7)
  const lip = kind === 'chk' ? 3 : 4.5
  const show = locked || tone === 'work'
  if (!show) return null
  const paths = [
    [seg.a0 + 0.4, 1],
    [seg.a1 - 0.4, -1],
  ].map(([a, d]) => {
    const [x0, y0] = polar(L, r - h, a)
    const [x1, y1] = polar(L, r + h, a)
    const [x2, y2] = polar(L, r + h, a + d * lip)
    const [x3, y3] = polar(L, r - h, a + d * lip)
    return `M${f(x2)} ${f(y2)}L${f(x1)} ${f(y1)}L${f(x0)} ${f(y0)}L${f(x3)} ${f(y3)}`
  })
  return (
    <g className={`jv2-clamps t-${tone}${locked ? ' is-locked' : ' is-open'}${locked && play ? ' is-snap' : ''}`} style={{ '--jv2-c': `${c}px` } as CSSProperties}>
      {paths.map((d, i) => (
        <path key={i} className={`jv2-clamp is-${i === 0 ? 'a' : 'b'}`} d={d} />
      ))}
    </g>
  )
}

/* Find's satellite: a bright point that rides the outer ring once, ahead of
   the sweep, the policies drawing in behind it (Orbit's). Its own layer,
   turned by CSS over the lap. */
export function Satellite({ c, cx, cy, r, ms, from }: { c: number; cx: number; cy: number; r: number; ms: number; from: number }) {
  return (
    <div className="jv2-sat" style={{ left: cx - c, top: cy - c, width: c * 2, height: c * 2, '--jv2-sat-ms': `${ms}ms`, '--jv2-sat-from': `${from}deg` } as CSSProperties} aria-hidden>
      <svg width={c * 2} height={c * 2} viewBox={`0 0 ${c * 2} ${c * 2}`}>
        <path className="jv2-sat__tail" d={arc({ CX: c, CY: c }, r, -34, 0)} />
        <circle className="jv2-sat__halo" cx={c} cy={c - r} r={9} />
        <circle className="jv2-sat__dot" cx={c} cy={c - r} r={4} />
      </svg>
    </div>
  )
}
