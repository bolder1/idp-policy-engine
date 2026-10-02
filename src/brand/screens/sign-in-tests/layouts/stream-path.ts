import type { Pt } from './stream-geometry'

/* -----------------------------------------------------------------------------
   A route as the stream follows it (StreamLayout.tsx): the corner points of
   an orthogonal path, its corners rounded, resampled every pixel — so a
   particle at length L stands at `xs[L]`, `ys[L]`, and a milestone (a
   policy's lane on the trunk, a gate) is a length along it.
   -------------------------------------------------------------------------- */

export interface Sampled {
  xs: Float32Array
  ys: Float32Array
  /** The path's length in px (the arrays hold length + 1 points). */
  total: number
  /** The rounded path, for SVG. */
  d: string
}

const EMPTY: Sampled = { xs: new Float32Array([0]), ys: new Float32Array([0]), total: 0, d: '' }

export function samplePath(pts: readonly Pt[], radius = 10): Sampled {
  if (pts.length < 2) return pts.length === 1 ? { ...EMPTY, xs: new Float32Array([pts[0].x]), ys: new Float32Array([pts[0].y]) } : EMPTY
  /* The path as lines and quarter arcs. */
  type Piece = { kind: 'line'; a: Pt; b: Pt } | { kind: 'arc'; a: Pt; c: Pt; b: Pt }
  const pieces: Piece[] = []
  let cur = pts[0]
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i]
    const next = pts[i + 1]
    if (!next) {
      pieces.push({ kind: 'line', a: cur, b: p })
      d += ` L ${p.x} ${p.y}`
      break
    }
    const lin = Math.hypot(p.x - cur.x, p.y - cur.y)
    const lout = Math.hypot(next.x - p.x, next.y - p.y)
    const r = Math.max(0, Math.min(radius, lin / 2, lout / 2))
    const ux = lin > 0 ? (p.x - cur.x) / lin : 0
    const uy = lin > 0 ? (p.y - cur.y) / lin : 0
    const vx = lout > 0 ? (next.x - p.x) / lout : 0
    const vy = lout > 0 ? (next.y - p.y) / lout : 0
    const a = { x: p.x - ux * r, y: p.y - uy * r }
    const b = { x: p.x + vx * r, y: p.y + vy * r }
    pieces.push({ kind: 'line', a: cur, b: a })
    d += ` L ${a.x} ${a.y}`
    if (r > 0) {
      pieces.push({ kind: 'arc', a, c: p, b })
      d += ` Q ${p.x} ${p.y} ${b.x} ${b.y}`
    }
    cur = b
  }
  /* Dense points, then resampled at 1px. */
  const dx: number[] = []
  const dy: number[] = []
  for (const pc of pieces) {
    if (pc.kind === 'line') {
      const n = Math.max(1, Math.ceil(Math.hypot(pc.b.x - pc.a.x, pc.b.y - pc.a.y) / 4))
      for (let k = 0; k < n; k++) {
        dx.push(pc.a.x + ((pc.b.x - pc.a.x) * k) / n)
        dy.push(pc.a.y + ((pc.b.y - pc.a.y) * k) / n)
      }
    } else {
      for (let k = 0; k < 8; k++) {
        const t = k / 8
        const mt = 1 - t
        dx.push(mt * mt * pc.a.x + 2 * mt * t * pc.c.x + t * t * pc.b.x)
        dy.push(mt * mt * pc.a.y + 2 * mt * t * pc.c.y + t * t * pc.b.y)
      }
    }
  }
  const last = pts[pts.length - 1]
  dx.push(last.x)
  dy.push(last.y)
  const cum = [0]
  for (let i = 1; i < dx.length; i++) cum.push(cum[i - 1] + Math.hypot(dx[i] - dx[i - 1], dy[i] - dy[i - 1]))
  const total = Math.floor(cum[cum.length - 1])
  const xs = new Float32Array(total + 1)
  const ys = new Float32Array(total + 1)
  let j = 0
  for (let L = 0; L <= total; L++) {
    while (j < cum.length - 2 && cum[j + 1] < L) j++
    const seg = cum[j + 1] - cum[j]
    const t = seg > 0 ? (L - cum[j]) / seg : 0
    xs[L] = dx[j] + (dx[j + 1] - dx[j]) * t
    ys[L] = dy[j] + (dy[j + 1] - dy[j]) * t
  }
  return { xs, ys, total, d }
}

/** How far along the path a point is: the nearest sample (a milestone on the route). */
export function lengthAt(path: Sampled, p: Pt): number {
  let best = 0
  let bd = Infinity
  for (let L = 0; L <= path.total; L++) {
    const dd = (path.xs[L] - p.x) ** 2 + (path.ys[L] - p.y) ** 2
    if (dd < bd) {
      bd = dd
      best = L
    }
  }
  return best
}

/** A straight or bent stub's SVG path, rounded as the route is. */
export function pathD(pts: readonly Pt[], radius = 10): string {
  return samplePath(pts, radius).d
}
