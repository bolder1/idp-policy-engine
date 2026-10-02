/* -----------------------------------------------------------------------------
   The main display's geometry (MissionLayout.tsx): the room's fixed measures,
   and the flight arc — one quadratic curve from the launch pad to the orbit,
   split at any point so the flown part can be drawn as the poll goes on.
   -------------------------------------------------------------------------- */

/** The room's widest and narrowest; it takes the stage's width between them. */
export const WORLD_MAX = 1280
export const WORLD_MIN = 1000
/** The main display's height. */
export const DISPLAY_H = 198
/** The launch pad's and the orbit's column widths inside the display. */
export const SIDE_W = 230

export interface Pt {
  x: number
  y: number
}

export interface Arc {
  p0: Pt
  c: Pt
  p1: Pt
}

/** The arc for a display `w` wide: pad at the left, orbit at the right, its apex near the top. */
export function arcFor(w: number): Arc {
  const y = DISPLAY_H - 52
  return { p0: { x: SIDE_W + 4, y }, c: { x: w / 2, y: -76 }, p1: { x: w - SIDE_W - 10, y } }
}

export function pointAt(a: Arc, t: number): Pt {
  const u = 1 - t
  return { x: u * u * a.p0.x + 2 * u * t * a.c.x + t * t * a.p1.x, y: u * u * a.p0.y + 2 * u * t * a.c.y + t * t * a.p1.y }
}

/** The tangent's angle at t, in degrees. */
export function angleAt(a: Arc, t: number): number {
  const dx = 2 * (1 - t) * (a.c.x - a.p0.x) + 2 * t * (a.p1.x - a.c.x)
  const dy = 2 * (1 - t) * (a.c.y - a.p0.y) + 2 * t * (a.p1.y - a.c.y)
  return (Math.atan2(dy, dx) * 180) / Math.PI
}

const f = (n: number) => n.toFixed(1)

/** The whole arc as a path. */
export function arcPath(a: Arc): string {
  return `M ${f(a.p0.x)} ${f(a.p0.y)} Q ${f(a.c.x)} ${f(a.c.y)} ${f(a.p1.x)} ${f(a.p1.y)}`
}

/** The arc from the pad to t (de Casteljau). */
export function arcTo(a: Arc, t: number): string {
  const k = Math.max(0, Math.min(1, t))
  const c1 = { x: a.p0.x + (a.c.x - a.p0.x) * k, y: a.p0.y + (a.c.y - a.p0.y) * k }
  const e = pointAt(a, k)
  return `M ${f(a.p0.x)} ${f(a.p0.y)} Q ${f(c1.x)} ${f(c1.y)} ${f(e.x)} ${f(e.y)}`
}

/** The arc from t to the orbit. */
export function arcFrom(a: Arc, t: number): string {
  const k = Math.max(0, Math.min(1, t))
  const s = pointAt(a, k)
  const c2 = { x: a.c.x + (a.p1.x - a.c.x) * k, y: a.c.y + (a.p1.y - a.c.y) * k }
  return `M ${f(s.x)} ${f(s.y)} Q ${f(c2.x)} ${f(c2.y)} ${f(a.p1.x)} ${f(a.p1.y)}`
}

/** The world's width for a stage `w` wide (its side margins taken off). */
export function worldWidth(stageW: number): number {
  if (!stageW || stageW <= 0) return WORLD_MAX
  return Math.round(Math.max(WORLD_MIN, Math.min(WORLD_MAX, stageW - 96)))
}
