import type { EngineRun } from '../engine-run'

/* -----------------------------------------------------------------------------
   The board's geometry (CircuitLayout.tsx), from the plan alone — nothing is
   measured off a moving box, so the world is the landed run's size from the
   first frame and every trace is known before the current runs it.

     source        selector              rule circuits                 outcome
     ┌──────┐      │ ╱ ┌ 1 policy ┐      ┌ 1 rule ───────────────┐ │
     │ who  │━━━━━━┿━╱━┤          ├━━━━━━┿━━━━╱━━━━━━╱━━━━━━╱━━━━┿━┿━━ ┌ LED ┐
     │ app  │      │   └──────────┘      └───────────────────────┘ │    └─────┘
     │ facts│      ├─╱─┌ 2 policy ┐      ┌ 2 rule ───────────────┐ │
     └──────┘      │   └──────────┘      ┊                         ┊ │

   The policies hang off a vertical bus in the order the engine asks them;
   each taps it through its coverage switch. The rules column is set so the
   lane of rule 1 sits on the line of the policy that applies, and the
   outcome so its input sits on the line of the lane the walk stopped at —
   the closed circuit is one straight run across the board.
   -------------------------------------------------------------------------- */

export type Pt = readonly [number, number]

/** Room over the board: the what-if strip. */
export const BANNER_H = 44
/** The columns' quiet headers. */
export const HEAD_Y = BANNER_H
export const TOP = BANNER_H + 30

export const SRC_X = 0
export const SRC_W = 196
const GAP = 32
export const POL_X = SRC_X + SRC_W + GAP
export const POL_W = 292
/** The selector's bus, its switches, its cards. */
export const BUS_X = POL_X + 4
export const PSW_A = POL_X + 14
export const PSW_B = POL_X + 44
export const PCARD_X = POL_X + 52
export const PCARD_W = POL_W - 52
export const ROW_H = 62
export const ROW_STEP = ROW_H + 8
const ROW_MID = 31
/** Policy row 1's line is rule 1's trace when it applies. */
export const POL_TOP = TOP + 13

export const RUL_X = POL_X + POL_W + GAP
/** One switch's slot along a lane: the switch and its label under it. */
export const SW = 136
const LANE_IN = 6
export const LANE_TITLE = 10
export const LANE_TRACE = 44
const LANE_LABEL = 16
const LANE_GAP = 10
const LINE = 17
export const LANE_READ_H = LANE_TRACE + LANE_LABEL + 5 * LINE + 10
export const LANE_QUIET_H = LANE_TRACE + LANE_LABEL + LINE + 10
export const LANE_BARE_H = LANE_TRACE + 22
export const OUT_W = 238
const OUT_PAD = 34

export interface PolRow {
  i: number
  top: number
  mid: number
}

export interface SwitchGeo {
  r: number
  k: number
  /** The switch's two pads, on the lane's trace. */
  xa: number
  xb: number
  y: number
  /** Its label's box, under it. */
  slotX: number
  slotW: number
  labelY: number
}

export interface LaneGeo {
  r: number
  top: number
  h: number
  trace: number
  /** The engine reads it on the way: its switches carry their facts. */
  read: boolean
  switches: SwitchGeo[]
}

export interface Geo {
  W: number
  H: number
  src: { x: number; y: number; w: number; h: number; out: Pt }
  rows: PolRow[]
  rules: { x: number; w: number; feedX: number; collX: number; laneX: number; laneW: number; top: number; lanes: LaneGeo[] } | null
  out: { x: number; top: number; w: number; pad: Pt; h: number }
  /** Every trace by its id, as a polyline. */
  segs: Map<string, Pt[]>
}

/** The source card's height: who, to what, then each fact as a terminal. */
export function sourceHeight(facts: number): number {
  return 12 + 52 + 34 + 10 + facts * 62 + 8
}

/** The outcome's height, as it will land (generous: it only sets the world's least size). */
function outHeight(plan: EngineRun): number {
  const o = plan.outcome
  let h = 64 + 44 + 46
  if (o.status === 'decided' && o.decision === 'deny') h += 56
  else if (o.status === 'decided') h += 34
  if (o.status === 'depends') h += o.view.outcomes.length * 24 + 34
  return h
}

export function geometryOf(plan: EngineRun, facts: number): Geo {
  const segs = new Map<string, Pt[]>()
  const src = { x: SRC_X, y: TOP, w: SRC_W, h: sourceHeight(facts), out: [SRC_X + SRC_W, POL_TOP + ROW_MID] as Pt }

  const rows: PolRow[] = plan.policies.map((_, i) => ({ i, top: POL_TOP + i * ROW_STEP, mid: POL_TOP + i * ROW_STEP + ROW_MID }))
  if (rows.length > 0) {
    segs.set('src', [src.out, [BUS_X, rows[0].mid]])
    rows.forEach((r, i) => {
      if (i > 0) segs.set(`bus:${i}`, [[BUS_X, rows[i - 1].mid], [BUS_X, r.mid]])
      segs.set(`pin:${i}`, [[BUS_X, r.mid], [PSW_A, r.mid]])
      segs.set(`pthru:${i}`, [[PSW_B, r.mid], [PCARD_X, r.mid]])
    })
  }

  const d = plan.policies.findIndex((p) => p.decides)
  const checks = Math.max(3, ...plan.rules.map((r) => r.checks.length))
  const laneW = LANE_IN * 2 + checks * SW
  const rulesW = 16 + laneW + 16
  let rules: Geo['rules'] = null
  if (d >= 0 && plan.rules.length > 0) {
    const top = rows[d].mid - LANE_TRACE
    const laneX = RUL_X + 16
    const feedX = RUL_X + 4
    const collX = RUL_X + rulesW - 4
    let y = top
    const lanes: LaneGeo[] = plan.rules.map((r, ri) => {
      const read = r.visited && r.checks.length > 0
      const h = r.checks.length === 0 ? LANE_BARE_H : read ? LANE_READ_H : LANE_QUIET_H
      const trace = y + LANE_TRACE
      const switches: SwitchGeo[] = r.checks.map((_, k) => {
        const slotX = laneX + LANE_IN + k * SW
        const cx = slotX + SW / 2
        return { r: ri, k, xa: cx - 15, xb: cx + 15, y: trace, slotX: slotX + 2, slotW: SW - 4, labelY: trace + LANE_LABEL }
      })
      const lane = { r: ri, top: y, h, trace, read, switches }
      y += h + LANE_GAP
      return lane
    })
    lanes.forEach((l, ri) => {
      if (ri > 0) {
        segs.set(`feed:${ri}`, [[feedX, lanes[ri - 1].trace], [feedX, l.trace]])
        segs.set(`lin:${ri}`, [[feedX, l.trace], [laneX, l.trace]])
      }
      let x = laneX
      l.switches.forEach((sw) => {
        segs.set(`w:${ri}:${sw.k}`, [[x, l.trace], [sw.xa, l.trace]])
        x = sw.xb
      })
      segs.set(`w:${ri}:end`, [[x, l.trace], [collX, l.trace]])
    })
    if (lanes.length > 1) segs.set('coll', [[collX, lanes[0].trace], [collX, lanes[lanes.length - 1].trace]])
    segs.set('pout', [[PCARD_X + PCARD_W, rows[d].mid], [laneX, lanes[0].trace]])
    rules = { x: RUL_X, w: rulesW, feedX, collX, laneX, laneW, top, lanes }
  }

  const outX = (rules ? RUL_X + rulesW : RUL_X + 16 + laneW + 16) + GAP
  const landingLane = rules && plan.landing !== null ? rules.lanes[Math.min(plan.landing, rules.lanes.length - 1)] : null
  const padY = landingLane ? landingLane.trace : POL_TOP + ROW_MID
  /* Its input on the closed lane's line; the panel rises so it never hangs below the board. */
  const outH = outHeight(plan)
  const floor = rules ? rules.lanes[rules.lanes.length - 1].top + rules.lanes[rules.lanes.length - 1].h : TOP + outH
  const outTop = Math.max(TOP, Math.min(padY - OUT_PAD, floor - outH, padY - 24))
  const out = { x: outX, top: outTop, w: OUT_W, pad: [outX, padY] as Pt, h: outH }
  if (landingLane && rules) segs.set('out', [[rules.collX, padY], [outX, padY]])

  const bottoms = [src.y + src.h, rows.length ? rows[rows.length - 1].top + ROW_H : TOP, rules ? rules.lanes[rules.lanes.length - 1].top + rules.lanes[rules.lanes.length - 1].h : TOP, out.top + out.h]
  return { W: outX + OUT_W, H: Math.max(...bottoms) + 16, src, rows, rules, out, segs }
}

/* A polyline as a path with rounded corners (orthogonal traces, a PCB's bends). */
export function roundedPath(pts: readonly Pt[], radius = 8): string {
  if (pts.length === 0) return ''
  let d = `M ${pts[0][0]} ${pts[0][1]}`
  for (let i = 1; i < pts.length; i++) {
    const [x, y] = pts[i]
    const next = pts[i + 1]
    if (!next) {
      d += ` L ${x} ${y}`
      break
    }
    const [px, py] = pts[i - 1]
    const l1 = Math.hypot(x - px, y - py)
    const l2 = Math.hypot(next[0] - x, next[1] - y)
    const r = Math.min(radius, l1 / 2, l2 / 2)
    if (r < 0.5 || l1 === 0 || l2 === 0) {
      d += ` L ${x} ${y}`
      continue
    }
    const ax = x - ((x - px) / l1) * r
    const ay = y - ((y - py) / l1) * r
    const bx = x + ((next[0] - x) / l2) * r
    const by = y + ((next[1] - y) / l2) * r
    d += ` L ${ax} ${ay} Q ${x} ${y} ${bx} ${by}`
  }
  return d
}

/** Several polylines run end to end, as one (the front of a step, the live path). */
export function joined(parts: readonly (readonly Pt[] | undefined)[]): Pt[] {
  const out: Pt[] = []
  for (const p of parts) {
    if (!p) continue
    for (const pt of p) {
      const last = out[out.length - 1]
      if (last && last[0] === pt[0] && last[1] === pt[1]) continue
      out.push(pt)
    }
  }
  return out
}
