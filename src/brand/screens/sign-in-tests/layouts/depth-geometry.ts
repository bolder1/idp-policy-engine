/* -----------------------------------------------------------------------------
   The plates' projection (DepthLayout.tsx), pure: a policy is a flat slab
   lying in depth, seen from above at a fixed pitch and turned about the
   vertical by `yaw` (the Tilt). Every shape is drawn in 2D from that one
   projection — crisp lines, no blurry 3D text — so a tilt, a hole opening
   and the unfold are just new points.

        u →   (the plate's width)       screen x = cx + u·cos − v·sin
        v ↓   (the plate's depth)       screen y = cy + (u·sin + v·cos)·PITCH

   Corners are listed back-left, back-right, front-right, front-left, so the
   unfold can morph them onto the board's top-left, top-right, bottom-right,
   bottom-left.
   -------------------------------------------------------------------------- */

export type Pt = readonly [number, number]

/** The plate, in its own plane (px). */
export const PLATE_W = 150
export const PLATE_D = 96
/** How flat the view is: 1 straight down, 0 edge on. */
export const PITCH = 0.5
/** A slab's edge, and the Global Default's (the base of the stack). */
export const THICK = 6
export const THICK_BASE = 11
/** The hole the token falls through, at full size. */
export const HOLE_R = 24
/** The Tilt's range and rest (degrees). */
export const YAW_MIN = 8
export const YAW_MAX = 58
export const YAW_REST = 32

const rad = (deg: number) => (deg * Math.PI) / 180

export function proj(cx: number, cy: number, yawDeg: number, u: number, v: number): Pt {
  const a = rad(yawDeg)
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [cx + u * c - v * s, cy + (u * s + v * c) * PITCH]
}

/** The four corners on screen. */
export function corners(cx: number, cy: number, yawDeg: number): [Pt, Pt, Pt, Pt] {
  const w = PLATE_W / 2
  const d = PLATE_D / 2
  return [proj(cx, cy, yawDeg, -w, -d), proj(cx, cy, yawDeg, w, -d), proj(cx, cy, yawDeg, w, d), proj(cx, cy, yawDeg, -w, d)]
}

/** How far a plate reaches above and below its centre, at the steepest tilt: room the stack keeps. */
export const REACH_Y = Math.ceil(((PLATE_W / 2) * Math.sin(rad(57)) + (PLATE_D / 2) * Math.cos(rad(57))) * PITCH)

const f = (n: number) => Math.round(n * 10) / 10
const poly = (pts: readonly Pt[]) => `M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join(' L')} Z`

function ring(cx: number, cy: number, yawDeg: number, r: number, from = 0, to = Math.PI * 2, n = 28): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i <= n; i++) {
    const t = from + ((to - from) * i) / n
    out.push(proj(cx, cy, yawDeg, r * Math.cos(t), r * Math.sin(t)))
  }
  return out
}

/** The top face, with the hole cut through it (evenodd) once it opens. */
export function topPath(cx: number, cy: number, yawDeg: number, hole: number): string {
  const outer = poly(corners(cx, cy, yawDeg))
  if (hole < 0.6) return outer
  return `${outer} ${poly(ring(cx, cy, yawDeg, hole).slice(0, -1))}`
}

/** The outline alone: the working ring, the light around the one found, the slot a plate lifted out of. */
export function rimPath(cx: number, cy: number, yawDeg: number): string {
  return poly(corners(cx, cy, yawDeg))
}

/* The slab's edges that face the viewer: each edge whose outward normal
   points toward the front (down the screen), dropped by the thickness. */
export function sidesPath(cx: number, cy: number, yawDeg: number, thick: number): string {
  const p = corners(cx, cy, yawDeg)
  const a = rad(yawDeg)
  const normals: Pt[] = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ]
  const parts: string[] = []
  for (let i = 0; i < 4; i++) {
    const [nu, nv] = normals[i]
    if (nu * Math.sin(a) + nv * Math.cos(a) <= 0.001) continue
    const p0 = p[i]
    const p1 = p[(i + 1) % 4]
    parts.push(poly([p0, p1, [p1[0], p1[1] + thick], [p0[0], p0[1] + thick]]))
  }
  return parts.join(' ')
}

/* Inside the hole, the far wall: the back half of its rim and the same arc a
   slab's thickness lower — what makes it read as cut through, not painted on. */
export function wallPath(cx: number, cy: number, yawDeg: number, hole: number, thick: number): string {
  if (hole < 0.6) return ''
  const a = rad(yawDeg)
  const back = ring(cx, cy, yawDeg, hole, Math.PI - a, 2 * Math.PI - a, 16)
  const low = back.map(([x, y]) => [x, y + Math.min(thick, hole * 0.4)] as Pt).reverse()
  return poly([...back, ...low])
}

/** The hole's rim, as a line. */
export function holeRimPath(cx: number, cy: number, yawDeg: number, hole: number): string {
  if (hole < 0.6) return ''
  return poly(ring(cx, cy, yawDeg, hole).slice(0, -1))
}

/** A hairline from the plate's rightmost corner to its label, so a label is tied to its plate at any tilt. */
export function leaderPath(cx: number, cy: number, yawDeg: number, toX: number): string {
  const p = corners(cx, cy, yawDeg)
  const right = p.reduce((m, q) => (q[0] > m[0] ? q : m), p[0])
  return `M${f(right[0] + 4)} ${f(right[1])} L${f(toX)} ${f(cy)}`
}

/** A shape between two four-corner shapes, with a lift in the middle of the move: the unfold. */
export function morph(from: readonly Pt[], to: readonly Pt[], k: number, lift: number): Pt[] {
  const up = Math.sin(Math.PI * k) * lift
  return from.map((p, i) => [p[0] + (to[i][0] - p[0]) * k, p[1] + (to[i][1] - p[1]) * k - up] as Pt)
}

export const polyPath = poly

/** Room between plates: generous for a few, closer for many, never under a label's one line. */
export function spacingOf(n: number): number {
  if (n <= 5) return 48
  return Math.max(30, Math.round(220 / (n - 1)))
}
