import { animate as animateValue, motion, useMotionValue, useMotionValueEvent } from 'motion/react'
import { useEffect, useState } from 'react'

import { angleAt, arcFor, arcFrom, arcPath, arcTo, pointAt } from './mission-geometry'
import type { Tone } from './mission-intents'

/* -----------------------------------------------------------------------------
   The flight arc on the main display (MissionLayout.tsx): the planned
   trajectory faint and dotted from the launch pad to the orbit; the part flown
   so far drawn over it — the console blue while it is being flown, the call's
   tone once landed; the craft at its head. Its place along the arc is a motion
   value eased to where the poll has got (mission-model.ts `flightAt`), over the
   step's own length, so it moves as the engine works and never runs its own
   clock. One SVG; nothing in it has a CSS transform or transition.
   -------------------------------------------------------------------------- */

export interface ArcProps {
  width: number
  height: number
  /** Where the flight should be, 0–1. */
  to: number
  /** How long the move there takes (the step's length), ms. */
  ms: number
  play: boolean
  landed: boolean
  tone: Tone
  /** The route is being shown: the flown arc glows. */
  lit: boolean
}

export function FlightArc({ width, height, to, ms, play, landed, tone, lit }: ArcProps) {
  const a = arcFor(width)
  const k = useMotionValue(play ? 0 : to)
  const [at, setAt] = useState(k.get())
  useMotionValueEvent(k, 'change', (v) => setAt(v))
  useEffect(() => {
    if (!play) {
      k.set(to)
      setAt(to)
      return
    }
    const c = animateValue(k, to, { duration: Math.max(0.25, (ms * 0.92) / 1000), ease: landed ? [0.25, 0.1, 0.25, 1] : [0.4, 0, 0.2, 1] })
    return () => c.stop()
  }, [to, ms, play, landed, k])

  const head = pointAt(a, at)
  const deg = angleAt(a, at)
  const toneCls = landed ? `is-${tone}` : 'is-working'
  const scrub = landed && tone === 'negative'
  const hold = landed && tone === 'notice'
  const orbit = landed && tone === 'positive' && at > 0.985
  const end = a.p1
  return (
    <svg className={`rl-mission__arc ${toneCls}${lit ? ' is-lit' : ''}`} width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      {/* The plan: where the flight would go. */}
      <motion.path className="rl-mission__arcplan" d={arcPath(a)} initial={play ? { pathLength: 0, opacity: 0 } : false} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: play ? 0.7 : 0, ease: [0.2, 0, 0, 1] }} />
      {/* Ahead of a hold, the rest of the way is waiting on a fact: dashed amber. */}
      {hold && <path className="rl-mission__arcahead" d={arcFrom(a, at)} />}
      {/* The flown part: a soft halo of its own colour under it (the light stage's glow), then the line. */}
      {at > 0.002 && <path className="rl-mission__archalo" d={arcTo(a, at)} />}
      {at > 0.002 && <path className={`rl-mission__arcflown${hold ? ' is-dashed' : ''}`} d={arcTo(a, at)} />}
      {/* The pad's mark and the orbit's ring. */}
      <circle className="rl-mission__padmark" cx={a.p0.x} cy={a.p0.y} r={4} />
      <circle className={`rl-mission__orbitring${orbit ? ' is-in' : ''}`} cx={end.x} cy={end.y} r={orbit ? 13 : 10} />
      {orbit && play && <motion.circle className="rl-mission__orbitping" cx={end.x} cy={end.y} initial={{ r: 12, opacity: 0.8 }} animate={{ r: 34, opacity: 0 }} transition={{ duration: 1, ease: [0.2, 0, 0.4, 1] }} />}
      {/* A scrub: the flight stops short, a cross where it stopped. */}
      {scrub && (
        <g className="rl-mission__scrubmark">
          <motion.circle cx={head.x} cy={head.y} r={11} initial={play ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ duration: play ? 0.3 : 0, delay: play ? 0.4 : 0 }} />
          <path d={`M ${head.x - 4} ${head.y - 4} L ${head.x + 4} ${head.y + 4} M ${head.x + 4} ${head.y - 4} L ${head.x - 4} ${head.y + 4}`} />
        </g>
      )}
      {/* The craft: a small chevron along the tangent. */}
      {!scrub && !orbit && at > 0.002 && (
        <g className="rl-mission__craft">
          <circle className="rl-mission__crafthalo" cx={head.x} cy={head.y} r={9} />
          <path d={chevron(head.x, head.y, deg)} />
        </g>
      )}
    </svg>
  )
}

function chevron(x: number, y: number, deg: number): string {
  const r = (deg * Math.PI) / 180
  const pt = (dx: number, dy: number) => {
    const px = x + dx * Math.cos(r) - dy * Math.sin(r)
    const py = y + dx * Math.sin(r) + dy * Math.cos(r)
    return `${px.toFixed(1)} ${py.toFixed(1)}`
  }
  return `M ${pt(6, 0)} L ${pt(-4, -4.5)} L ${pt(-2, 0)} L ${pt(-4, 4.5)} Z`
}
