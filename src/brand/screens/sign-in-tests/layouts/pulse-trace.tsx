import { useEffect, useId, useLayoutEffect, useMemo, useRef } from 'react'
import type { MotionValue } from 'motion/react'

import { poly, shapeOf, tracePoints, yAt, type Placed, type Pt } from './pulse-geometry'
import type { Seg } from './pulse-model'
import type { Tone } from './pulse-words'

/* -----------------------------------------------------------------------------
   Pulse's trace (PulseLayout.tsx): the one line, drawn as the monitor draws
   it. The whole trace is known from the plan; a clip reveals it up to the
   tip, which the layout moves with the clock — so a beat appears exactly as
   the engine finds it. Ahead of the tip, a faint flat line: waiting.

   The tip moves through a motion value, and only these SVG attributes follow
   it (no React render per frame): the clip's width, the faint line's start,
   the cursor's dot riding the trace. Behind the playhead (once landed) the
   trace is whole; after it, faded.
   -------------------------------------------------------------------------- */

interface Piece {
  d: string
  cls: string
}

/* The line in pieces: the ink runs merged (so their joins are round), the
   dashed runs of what was never read, and each beat's colour over its bump. */
function piecesOf(segs: readonly Seg[], p: Placed, base: number, tone: Tone, landed: boolean): Piece[] {
  const out: Piece[] = []
  let ink: Pt[] = []
  const flushInk = () => {
    if (ink.length > 1) out.push({ d: poly(ink, base), cls: 'rl-pulse__ln is-ink' })
    ink = []
  }
  const overlays: Piece[] = []
  segs.forEach((g, i) => {
    const w = p.x1[i] - p.x0[i]
    const lead: Pt[] = p.from[i] < p.x0[i] ? [[p.from[i], 0], [p.x0[i], 0]] : []
    if (g.tone === 'off' && !p.gone[i]) {
      if (lead.length) ink.push(...lead)
      if (ink.length) ink.push([p.x0[i], 0])
      flushInk()
      out.push({ d: poly([[p.x0[i], 0], [p.x1[i], 0]], base), cls: 'rl-pulse__ln is-off' })
      return
    }
    if (lead.length) ink.push(...lead)
    if (w <= 0) return
    const { pts, bump } = shapeOf(p.gone[i] ? 'flat' : g.shape, p.x0[i], w)
    ink.push(...pts)
    if (!p.gone[i] && bump[1] > bump[0]) {
      const t = g.tone === 'path' ? (landed ? `is-${tone}` : tone === 'positive' ? 'is-pass' : 'is-ink') : `is-${g.tone}`
      overlays.push({ d: poly(pts.slice(bump[0], bump[1] + 1), base), cls: `rl-pulse__ln is-beat ${t}` })
    }
  })
  flushInk()
  return [...out, ...overlays]
}

export function Trace({
  segs,
  placed,
  base,
  width,
  height,
  tip,
  play,
  tone,
  landed,
  working,
}: {
  segs: readonly Seg[]
  placed: Placed
  base: number
  width: number
  height: number
  tip: MotionValue<number>
  /** The playhead, once landed; null while the run plays. */
  play: number | null
  tone: Tone
  landed: boolean
  /** The engine is working: the cursor shows. */
  working: boolean
}) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const pieces = useMemo(() => piecesOf(segs, placed, base, tone, landed), [segs, placed, base, tone, landed])
  const pts = useMemo(() => tracePoints(segs, placed), [segs, placed])
  const drawn = useRef<SVGRectElement | null>(null)
  const after = useRef<SVGRectElement | null>(null)
  const ahead = useRef<SVGRectElement | null>(null)
  const dot = useRef<SVGGElement | null>(null)
  const bar = useRef<SVGGElement | null>(null)
  const playRef = useRef(play)
  playRef.current = play

  const paint = useRef<(v: number) => void>(() => {})
  paint.current = (v: number) => {
    const x = Math.max(0, Math.min(width, v))
    const pl = playRef.current
    const cut = pl === null ? x : Math.min(x, pl)
    drawn.current?.setAttribute('width', String(Math.max(0, cut)))
    if (after.current) {
      after.current.setAttribute('x', String(cut))
      after.current.setAttribute('width', String(Math.max(0, x - cut)))
    }
    if (ahead.current) {
      ahead.current.setAttribute('x', String(x))
      ahead.current.setAttribute('width', String(Math.max(0, width - x)))
    }
    const y = base + yAt(pts, x)
    dot.current?.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`)
    bar.current?.setAttribute('transform', `translate(${x.toFixed(1)} 0)`)
  }
  useLayoutEffect(() => {
    paint.current(tip.get())
  })
  useEffect(() => tip.on('change', (v) => paint.current(v)), [tip])

  return (
    <svg className="rl-pulse__trace" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <defs>
        <clipPath id={`${id}-d`}>
          <rect ref={drawn} x={0} y={0} width={0} height={height} />
        </clipPath>
        <clipPath id={`${id}-a`}>
          <rect ref={after} x={0} y={0} width={0} height={height} />
        </clipPath>
        <clipPath id={`${id}-w`}>
          <rect ref={ahead} x={0} y={0} width={width} height={height} />
        </clipPath>
      </defs>
      {/* Ahead of the tip: the flat line, waiting. */}
      <g clipPath={`url(#${id}-w)`}>
        <line className="rl-pulse__ln is-wait" x1={0} x2={width} y1={base} y2={base} />
      </g>
      <g clipPath={`url(#${id}-d)`}>
        {pieces.map((pc, i) => (
          <path key={i} d={pc.d} className={pc.cls} />
        ))}
      </g>
      <g clipPath={`url(#${id}-a)`} className="rl-pulse__after">
        {pieces.map((pc, i) => (
          <path key={i} d={pc.d} className={pc.cls} />
        ))}
      </g>
      {/* The cursor: a scan bar across the band and the dot riding the line — blue, only while the engine works. */}
      <g ref={bar} className={`rl-pulse__bar${working ? ' is-on' : ''}`}>
        <rect className="rl-pulse__barhalo" x={-12} y={base - 104} width={24} height={168} rx={12} />
        <line className="rl-pulse__barline" x1={0} x2={0} y1={base - 104} y2={base + 64} />
      </g>
      <g ref={dot} className={`rl-pulse__dot${working ? ' is-on' : ''}`}>
        <circle className="rl-pulse__dothalo" r={10} />
        <circle className="rl-pulse__dotcore" r={4} />
      </g>
    </svg>
  )
}
