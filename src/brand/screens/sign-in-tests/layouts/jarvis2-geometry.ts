/* -----------------------------------------------------------------------------
   Jarvis v3, the REACTOR (JarvisLayout.tsx): where everything sits, derived
   from the canvas size so the HUD lays out at zoom 1 at 1376 × 800 (a 1440 ×
   900 page) and 1216 × 700 (1280 × 800) alike — never fitted by shrinking.

   Angles are degrees clockwise from 12 o'clock. The reactor's rings are
   centred on (CX, CY); four wedge panels dock onto the ring at the diagonals
   (ref 4's "System diagnostics"), each drawn as the top-left one mirrored
   through the centre. Pure: no DOM.
   -------------------------------------------------------------------------- */

export const MIN_W = 1100
export const MIN_H = 640

export type WedgeId = 'who' | 'policies' | 'decision' | 'rules'

export interface WedgeSpec {
  /** The outer edge's y in the wedge's own (unmirrored) frame. */
  y0: number
  /** The near edge by the 3/9 o'clock line: its height above the centre (negative below), in its own frame. */
  Y1: number
  sx: 1 | -1
  sy: 1 | -1
}

export interface Box {
  left: number
  top: number
  width: number
  height: number
}

export interface Geo {
  W: number
  H: number
  /** The rings' scale. */
  K: number
  /** The 1280-wide page: tighter rows, the same type sizes. */
  compact: boolean
  CX: number
  CY: number
  /** The compass arc's radius. */
  RC: number
  /** Where the wedges dock. */
  RW: number
  R: { tick: number; pol: number; rule: number; chk: number; core: number; polLbl: number; ruleLbl: number; chkLbl: number }
  /** Band widths of the three run rings. */
  BAND: { pol: number; rule: number; chk: number }
  readTop: number
  readH: number
  deck: { say: number; chips: number; ask: number }
  wedgeTop: number
  wedgeBottom: number
  wedges: Record<WedgeId, WedgeSpec>
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
/** The gap between the two wedges of a column. */
const GAP = 13
const DEG = Math.PI / 180

/* How far each wedge reaches toward the 3/9 o'clock line: the left column
   splits between WHO and POLICIES, the right between DECISION and RULES,
   each where its content needs (`split`, px below the wedges' top). */
export interface Split {
  /** WHO's height, top edge to its foot. */
  who: number
  /** DECISION's height. */
  decision: number
}

export function geometry(w: number, h: number, split?: Partial<Split>): Geo {
  const W = Math.max(MIN_W, Math.round(w))
  const H = Math.max(MIN_H, Math.round(h))
  const K = clamp(H / 800 + 0.025, 0.88, 1)
  const compact = H < 760
  const readTop = 54
  const readH = compact ? 40 : 44
  const RC = 252 * K
  const CX = W / 2
  const CY = readTop + readH + RC + 4
  const RW = 238 * K
  const tick = 219 * K
  const pol = 183 * K
  const rule = 150 * K
  const chk = 119 * K
  const core = 92 * K
  const R = { tick, pol, rule, chk, core, polLbl: pol + 18, ruleLbl: rule + 16, chkLbl: chk + 13 }
  const deck = compact ? { say: H - 118, chips: H - 92, ask: H - 54 } : { say: H - 150, chips: H - 122, ask: H - 78 }
  const wedgeTop = 58
  const wedgeBottom = H - (compact ? 126 : 160)
  /* The splits: the mock's (WHO to 4 px below the centre, DECISION to 46 above), moved by what each holds, within the ring's reach. */
  const whoFoot = clamp(wedgeTop + (split?.who ?? CY + 4 - wedgeTop), CY - 96, Math.min(CY + 110, wedgeBottom - 150))
  const decFoot = clamp(wedgeTop + (split?.decision ?? CY - 46 - wedgeTop), CY - 110, Math.min(CY + 80, wedgeBottom - 170))
  const wedges: Record<WedgeId, WedgeSpec> = {
    who: { y0: wedgeTop, Y1: CY - whoFoot, sx: 1, sy: 1 },
    policies: { y0: 2 * CY - wedgeBottom, Y1: whoFoot + GAP - CY, sx: 1, sy: -1 },
    decision: { y0: wedgeTop, Y1: CY - decFoot, sx: -1, sy: 1 },
    rules: { y0: 2 * CY - wedgeBottom, Y1: decFoot + GAP - CY, sx: -1, sy: -1 },
  }
  return { W, H, K, compact, CX, CY, RC, RW, R, BAND: { pol: 16, rule: 12, chk: 7 }, readTop, readH, deck, wedgeTop, wedgeBottom, wedges }
}

/** A point at radius r, angle a. */
export function polar(g: Pick<Geo, 'CX' | 'CY'>, r: number, a: number): [number, number] {
  return [g.CX + r * Math.sin(a * DEG), g.CY - r * Math.cos(a * DEG)]
}

/** An angle (clockwise from 12) of a point. */
export function angleOf(g: Pick<Geo, 'CX' | 'CY'>, x: number, y: number): number {
  return ((Math.atan2(x - g.CX, g.CY - y) * 180) / Math.PI + 360) % 360
}

const f = (n: number) => n.toFixed(1)

/** An arc at radius r from a0 to a1 (drawn in that direction). */
export function arc(g: Pick<Geo, 'CX' | 'CY'>, r: number, a0: number, a1: number): string {
  const [x0, y0] = polar(g, r, a0)
  const [x1, y1] = polar(g, r, a1)
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0
  const sweep = a1 > a0 ? 1 : 0
  return `M${f(x0)} ${f(y0)}A${f(r)} ${f(r)} 0 ${large} ${sweep} ${f(x1)} ${f(y1)}`
}

/* An arc text can ride upright: reversed when its middle, turned by `rest`
   (the ring's angle at rest), falls on the lower half — so no label ever
   reads upside down once its ring has come to rest. */
export function textArc(g: Pick<Geo, 'CX' | 'CY'>, r: number, a0: number, a1: number, rest = 0): string {
  const m = ((((a0 + a1) / 2 + rest) % 360) + 360) % 360
  return m > 90 && m < 270 ? arc(g, r, a1, a0) : arc(g, r, a0, a1)
}

export interface Seg {
  a0: number
  a1: number
  mid: number
}

/* A ring of n segments, segment i CENTRED on i × span, so turning the ring by
   −i × span brings segment i under the pointer at 12 o'clock: the lock. */
export function segments(n: number, gap = 3.2): Seg[] {
  if (n <= 0) return []
  const span = 360 / n
  const g = n === 1 ? 0 : gap
  return Array.from({ length: n }, (_, i) => {
    const mid = i * span
    return n === 1 ? { a0: -179.9, a1: 179.9, mid: 0 } : { a0: mid - span / 2 + g / 2, a1: mid + span / 2 - g / 2, mid }
  })
}

/** The turn that brings segment i of n under the pointer. */
export const lockAngle = (i: number | null, n: number): number => (i === null || n <= 0 ? 0 : -(i * 360) / n)

/** How many 12px mono capitals an arc of r and (a1 − a0) degrees holds, with room at its ends. */
export const arcChars = (r: number, a0: number, a1: number): number => Math.max(0, Math.floor((r * (a1 - a0) * DEG - 16) / 8.4))

/* A wedge panel docked to the reactor, drawn as the top-left one and mirrored
   through the centre: a top edge, a near-radial diagonal down to the ring,
   the concave dock along the ring, then the edge by the 3/9 o'clock line,
   chamfered outer corners. */
export function wedgePath(g: Geo, id: WedgeId, ch = 18): string {
  const w = g.wedges[id]
  const { CX, CY, RW, K } = g
  const DXT = 230 * K
  const DX1 = 150 * K
  const map = (x: number, y: number): [number, number] => [CX + w.sx * (x - CX), CY + w.sy * (y - CY)]
  const x0 = 16
  const xT = CX - DXT
  const x1 = CX - DX1
  const y1 = CY - w.Y1
  const yA = CY - Math.sqrt(RW * RW - DX1 * DX1)
  const xB = CX - Math.sqrt(Math.max(0, RW * RW - w.Y1 * w.Y1))
  const fwd = ([[x0 + ch, w.y0], [xT, w.y0], [x1, yA]] as const).map(([x, y]) => map(x, y))
  const end = map(xB, y1)
  const sweep = w.sx * w.sy > 0 ? 0 : 1
  const rest = ([[x0 + ch, y1], [x0, y1 - ch], [x0, w.y0 + ch]] as const).map(([x, y]) => map(x, y))
  const L = (p: [number, number]) => `L${f(p[0])} ${f(p[1])}`
  return `M${f(fwd[0][0])} ${f(fwd[0][1])}${fwd.slice(1).map(L).join('')}A${f(RW)} ${f(RW)} 0 0 ${sweep} ${f(end[0])} ${f(end[1])}${rest.map(L).join('')}Z`
}

/** A wedge's outer edges, top and foot, in real coordinates. */
export function wedgeSpan(g: Geo, id: WedgeId): { top: number; bottom: number } {
  const w = g.wedges[id]
  return w.sy > 0 ? { top: w.y0, bottom: g.CY - w.Y1 } : { top: g.CY + w.Y1, bottom: 2 * g.CY - w.y0 }
}

/** A wedge's content box (real coordinates): inside its outer edges, clear of the ring. */
export function wedgeBox(g: Geo, id: WedgeId): Box {
  const w = g.wedges[id]
  const { top, bottom } = wedgeSpan(g, id)
  const near = g.CX - w.sx * (g.RW + 10)
  const left = w.sx > 0 ? 34 : near
  const right = w.sx > 0 ? near : g.W - 34
  return { left, top: top + 14, width: right - left, height: bottom - top - 26 }
}

/** Each wedge's docking rail: the arc of the ring it sits on, in degrees (a0 < a1). */
export function rails(g: Geo): Record<WedgeId, [number, number]> {
  const out = {} as Record<WedgeId, [number, number]>
  const { CX, CY, RW, K } = g
  const DX1 = 150 * K
  for (const id of Object.keys(g.wedges) as WedgeId[]) {
    const w = g.wedges[id]
    const yA = Math.sqrt(RW * RW - DX1 * DX1)
    const xB = Math.sqrt(Math.max(0, RW * RW - w.Y1 * w.Y1))
    let a = angleOf(g, CX - w.sx * DX1, CY - w.sy * yA)
    let b = angleOf(g, CX - w.sx * xB, CY - w.sy * w.Y1)
    if (Math.abs(a - b) > 180) {
      if (a < b) a += 360
      else b += 360
    }
    out[id] = a < b ? [a + 1, b - 1] : [b + 1, a - 1]
  }
  return out
}

/** The compass's four readouts: their centres' x, on the run's four stages. */
export function readoutXs(g: Geo, width = 92): number[] {
  /* A wider gap in the middle: the pointer sits in it. */
  return [0, 1, 2, 3].map((i) => g.CX + (i - 1.5) * (width + 6) + (i < 2 ? -10 : 10))
}
