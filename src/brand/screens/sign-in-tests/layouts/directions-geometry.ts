/* -----------------------------------------------------------------------------
   The route map's ground plan (directions-map.tsx), from the plan's shape
   alone — so nothing moves as the run plays.

        Maya Iyer ●                         the start pin, the avenue down
                  │
     AWS for eng ─┼────────┬──────┬──────┬───  the policy taken: the route
                  │        ┃R1    ┃R2    ┃✱       turns right onto its street;
     AWS billing ─┤        ┃      ┃      ┃       each rule a gate off it
     AWS prod    ─┤      ┌─┴──────┴──────┴─┐
     Global Def  ─┘      │   AWS Console    │  the app: every gate leads in
                         └──────────────────┘
                              [arrival]

   Every policy is a road crossing the avenue, named on the left; only the
   one that covers the person is followed, to the right. Roads not taken go
   left and stay quiet.
   -------------------------------------------------------------------------- */

export interface Pt {
  x: number
  y: number
}

export interface MapGeo {
  W: number
  H: number
  start: Pt
  avenue: { x: number; y0: number; y1: number }
  /** Per plan.policies index: its junction on the avenue. */
  junctions: { y: number }[]
  /** Where the labels on the left end. */
  labelRight: number
  street: { y: number; x0: number; x1: number } | null
  /** Per plan.rules index: its gate's x on the street. */
  gates: number[]
  spacing: number
  campus: { y: number; h: number; x0: number; x1: number } | null
  /** The barrier across each side road, and the check chips beside it. */
  barrierY: number
  marksY: number
  /** The route taken, whole: start, the turn, the gate, the arrival. */
  route: Pt[]
  /** The arrival pin. */
  arrive: Pt | null
  card: { x: number; y: number; w: number }
}

export const CARD_W = 340
export const CARD_H = 196

/** `marks`: the most check chips any gate shows (they hang under the street, above the pin). */
export function mapGeo(W: number, n: number, d: number, m: number, landing: number | null, tight = false, marks = 4): MapGeo {
  /* The left column of road names narrows on a small map, so the gates keep their room. */
  const AV = W < 780 ? 232 : 272
  const startY = tight ? 40 : 46
  const gap = n > 6 ? 48 : tight || n > 3 ? 58 : 66
  const y0 = startY + (tight ? 86 : 94)
  const junctions = Array.from({ length: n }, (_, i) => ({ y: y0 + i * gap }))
  const lastY = n > 0 ? junctions[n - 1].y : startY + 40

  if (d < 0 || d >= n) {
    const route = [
      { x: AV, y: startY },
      { x: AV, y: lastY + 24 },
    ]
    const H = lastY + 60 + CARD_H + 40
    return {
      W,
      H,
      start: { x: AV, y: startY },
      avenue: { x: AV, y0: startY, y1: lastY + 24 },
      junctions,
      labelRight: AV - 34,
      street: null,
      gates: [],
      spacing: 0,
      campus: null,
      barrierY: 0,
      marksY: 0,
      route,
      arrive: null,
      card: { x: Math.min(W - CARD_W - 16, AV + 40), y: lastY + 50, w: CARD_W },
    }
  }

  const Yd = junctions[d].y
  const gx0 = AV + (W < 780 ? 92 : 104)
  const gxEnd = W - (W < 780 ? 96 : 112)
  const spacing = m > 1 ? Math.min(150, (gxEnd - gx0) / (m - 1)) : 0
  const gates = Array.from({ length: m }, (_, k) => Math.round(gx0 + k * spacing))
  /* The application sits just under the lowest check chip, clear of the pin that drops onto it. */
  const k = Math.max(1, Math.min(5, marks))
  const campusY = Yd + Math.max(tight ? 104 : 112, 96 + k * 20)
  const campusH = tight ? 48 : 54
  const x0 = gx0 - 54
  const x1 = Math.min(W - 18, Math.max(gates[m - 1] ?? gx0, gx0) + 96)
  const land = landing !== null && landing >= 0 && landing < m ? landing : null
  const gx = land !== null ? gates[land] : null
  const arrive = gx !== null ? { x: gx, y: campusY } : null
  const route: Pt[] = [
    { x: AV, y: startY },
    { x: AV, y: Yd },
  ]
  if (gx !== null) route.push({ x: gx, y: Yd }, { x: gx, y: campusY })
  const cardY = campusY + campusH + (tight ? 12 : 18)
  const cx = gx ?? (x0 + x1) / 2
  const card = { x: Math.round(Math.max(x0 - 40, Math.min(W - CARD_W - 12, cx - CARD_W / 2))), y: cardY, w: CARD_W }
  const H = Math.max(cardY + CARD_H + 24, lastY + 48)
  return {
    W,
    H,
    start: { x: AV, y: startY },
    avenue: { x: AV, y0: startY, y1: lastY + 24 },
    junctions,
    labelRight: AV - 34,
    street: { y: Yd, x0: AV, x1: x1 - 20 },
    gates,
    spacing,
    campus: { y: campusY, h: campusH, x0, x1 },
    barrierY: Yd + 34,
    marksY: Yd + 52,
    route,
    arrive,
    card,
  }
}

/* A polyline drawn with rounded corners, and the way to say how far along
   it a point of it is: segment `i` (from point i to i + 1), `t` px from its
   start. A corner's point is the middle of its arc. */
export interface RoutePath {
  d: string
  length: number
  along: (i: number, t: number) => number
}

export function routePath(points: readonly Pt[], R = 14): RoutePath {
  const n = points.length
  if (n < 2) return { d: n ? `M ${points[0].x} ${points[0].y}` : '', length: 0, along: () => 0 }
  const seg = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y))
  /* The corner's radius at each interior point. */
  const r = points.map((_, i) => (i === 0 || i === n - 1 ? 0 : Math.min(R, seg[i - 1] / 2, seg[i] / 2)))
  const arc = r.map((x) => (Math.PI * x) / 2)
  const unit = (i: number) => {
    const a = points[i]
    const b = points[i + 1]
    const l = seg[i] || 1
    return { x: (b.x - a.x) / l, y: (b.y - a.y) / l }
  }
  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < n; i++) {
    const p = points[i]
    const u = unit(i - 1)
    if (i === n - 1) {
      d += ` L ${p.x} ${p.y}`
      break
    }
    const v = unit(i)
    d += ` L ${p.x - u.x * r[i]} ${p.y - u.y * r[i]} Q ${p.x} ${p.y} ${p.x + v.x * r[i]} ${p.y + v.y * r[i]}`
  }
  /* Where each segment's straight part starts, along the path. */
  const base: number[] = []
  let acc = 0
  for (let i = 0; i < n - 1; i++) {
    base.push(acc)
    acc += seg[i] - r[i] - r[i + 1] + arc[i + 1]
  }
  const length = acc
  const along = (i: number, t: number) => {
    if (i < 0) return 0
    if (i >= n - 1) return length
    const tt = Math.max(0, Math.min(seg[i], t))
    /* In the arc it leaves by, or the one it comes to: the arc's middle. */
    if (tt < r[i]) return Math.max(0, base[i] - arc[i] / 2)
    if (tt > seg[i] - r[i + 1]) return base[i] + seg[i] - r[i] - r[i + 1] + arc[i + 1] / 2
    return base[i] + tt - r[i]
  }
  return { d, length, along }
}
