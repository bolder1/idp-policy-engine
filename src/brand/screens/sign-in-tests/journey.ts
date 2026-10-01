import type { NodeId } from './engine-run'

/* -----------------------------------------------------------------------------
   The engine run's canvas geometry (TESTING-V4 §8): where the wires between
   the measured boxes go. Pure; TryJourney.tsx measures the boxes and draws
   what this returns.

     Sign-in ─┬─ Which policy ─┬── Rules ───────────── Outcome
              ├─ [policy]      ├─ [1 In the office]
              └─ [policy]━━━━━━╋━[2 Compliant device]━━ [Allow with 2FA]
                               └─ [Nothing else matched]

   Boxes are measured against the stage by offsets, never by transformed
   rects: the sign-in node arrives by a layout animation and the check rows
   slide open, and a wire that followed a transform would wobble while they
   move. They are measured again after every step and whenever a column
   resizes, so a wire never aims at where a card USED to be (the old journey's
   bug: cards grew as it travelled, and its route was frozen at the start).
   -------------------------------------------------------------------------- */

export interface Box {
  x: number
  y: number
  w: number
  h: number
  /* Where a wire meets it, down from its top: a rule card's title line, the
     sign-in's person. A tall card is met at its name, not half way down its
     checks. Absent, the middle. */
  port?: number
}

export type Boxes = Partial<Record<NodeId, Box>>

const portY = (b: Box) => b.y + (b.port ?? b.h / 2)
const right = (b: Box) => b.x + b.w

export const boxesSig = (b: Boxes): string =>
  Object.entries(b)
    .map(([k, v]) => `${k}:${Math.round(v!.x)},${Math.round(v!.y)},${Math.round(v!.w)},${Math.round(v!.h)},${Math.round(v!.port ?? -1)}`)
    .join(';')

// --- A line ------------------------------------------------------------------------------

export interface Point {
  x: number
  y: number
}

/** A quadratic corner of radius r, as drawn: a quarter circle is 1.571 r; this curve is 1.623 r. */
const CORNER = 1.6232

/* An orthogonal line through `points` with its corners rounded, as an SVG
   path, and its length. A corner's radius is at most half of either leg, so
   two corners close together never overlap. */
export function roundedPath(points: readonly Point[], radius = 10): { d: string; length: number } {
  const pts = points.filter((p, i) => i === 0 || Math.abs(p.x - points[i - 1].x) > 0.01 || Math.abs(p.y - points[i - 1].y) > 0.01)
  if (pts.length === 0) return { d: '', length: 0 }
  const f = (n: number) => String(Math.round(n * 100) / 100)
  let d = `M${f(pts[0].x)} ${f(pts[0].y)}`
  let length = 0
  const legs: number[] = []
  for (let i = 1; i < pts.length; i++) legs.push(Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y))
  const radii: number[] = pts.map(() => 0)
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const c = pts[i + 1]
    const turns = Math.abs((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)) > 0.01
    radii[i] = turns ? Math.min(radius, legs[i - 1] / 2, legs[i] / 2) : 0
  }
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const leg = legs[i - 1]
    const ux = leg === 0 ? 0 : (b.x - a.x) / leg
    const uy = leg === 0 ? 0 : (b.y - a.y) / leg
    const r = radii[i]
    const straight = leg - radii[i - 1] - r
    if (r > 0) {
      const c = pts[i + 1]
      const out = legs[i]
      const vx = (c.x - b.x) / out
      const vy = (c.y - b.y) / out
      d += ` L${f(b.x - ux * r)} ${f(b.y - uy * r)} Q${f(b.x)} ${f(b.y)} ${f(b.x + vx * r)} ${f(b.y + vy * r)}`
      length += straight + CORNER * r
    } else {
      d += ` L${f(b.x)} ${f(b.y)}`
      length += straight
    }
  }
  return { d, length }
}

// --- The wires -----------------------------------------------------------------------------

export interface WireModel {
  policies: readonly { policyId: string; node: NodeId; decides: boolean }[]
  rules: readonly { id: string; node: NodeId }[]
  landing: NodeId | null
}

export interface Drawn {
  d: string
  length: number
}

export interface EngineWires {
  /** The sign-in to every policy on the application: neutral. */
  fan: { policyId: string; d: string }[]
  /** The sign-in to the policy that decides: the lit part of the fan. */
  toDecider: Drawn | null
  /** The spine down the rules, from the deciding policy: neutral. */
  trunk: string | null
  /** The spine into each rule card: neutral. */
  stubs: { ruleId: string; d: string }[]
  /** The lit way from the deciding policy down the spine into each card, by rule id. */
  toRule: Record<string, Drawn>
  /** The card it stopped at, out to the outcome. */
  out: Drawn | null
}

const NONE: EngineWires = { fan: [], toDecider: null, trunk: null, stubs: [], toRule: {}, out: null }

/* Every elbow turns half way across the gutter between two columns, so the
   lines of one fan share a vertical and read as one branching line. */
export function engineWires(boxes: Boxes, m: WireModel): EngineWires {
  const signIn = boxes['sign-in']
  if (!signIn) return NONE
  const rows = m.policies.map((p) => ({ p, box: boxes[p.node] })).filter((r): r is { p: WireModel['policies'][number]; box: Box } => r.box !== undefined)
  if (rows.length === 0) return NONE

  const xFan = (right(signIn) + Math.min(...rows.map((r) => r.box.x))) / 2
  const fanTo = (box: Box) =>
    roundedPath([
      { x: right(signIn), y: portY(signIn) },
      { x: xFan, y: portY(signIn) },
      { x: xFan, y: portY(box) },
      { x: box.x, y: portY(box) },
    ])
  const fan = rows.map((r) => ({ policyId: r.p.policyId, d: fanTo(r.box).d }))
  const decider = rows.find((r) => r.p.decides)?.box
  const toDecider = decider ? fanTo(decider) : null

  const cards = m.rules.map((r) => ({ r, box: boxes[r.node] })).filter((c): c is { r: WireModel['rules'][number]; box: Box } => c.box !== undefined)
  if (!decider || cards.length === 0) return { ...NONE, fan, toDecider }

  const spine = (Math.max(...rows.map((r) => right(r.box))) + Math.min(...cards.map((c) => c.box.x))) / 2
  const dy = portY(decider)
  const ys = cards.map((c) => portY(c.box))
  const top = Math.min(dy, ...ys)
  const bottom = Math.max(dy, ...ys)
  const trunk = roundedPath([
    { x: right(decider), y: dy },
    { x: spine, y: dy },
    ...(top < dy ? [{ x: spine, y: top }] : []),
    ...(bottom > dy ? [{ x: spine, y: bottom }] : []),
  ]).d
  const stubs = cards.map((c) => ({ ruleId: c.r.id, d: `M${spine} ${portY(c.box)} L${c.box.x} ${portY(c.box)}` }))
  const toRule: Record<string, Drawn> = {}
  for (const c of cards) {
    toRule[c.r.id] = roundedPath([
      { x: right(decider), y: dy },
      { x: spine, y: dy },
      { x: spine, y: portY(c.box) },
      { x: c.box.x, y: portY(c.box) },
    ])
  }

  const outcome = boxes.outcome
  const land = cards.find((c) => c.r.node === m.landing)?.box
  let out: Drawn | null = null
  if (land && outcome) {
    const xOut = (Math.max(...cards.map((c) => right(c.box))) + outcome.x) / 2
    out = roundedPath([
      { x: right(land), y: portY(land) },
      { x: xOut, y: portY(land) },
      { x: xOut, y: portY(outcome) },
      { x: outcome.x, y: portY(outcome) },
    ])
  }
  return { fan, toDecider, trunk, stubs, toRule, out }
}

/* How far down its column the outcome hangs, so it sits level with the card
   the walk stopped at and the last wire runs straight — but never so far that
   it would reach below the rules. */
export function outcomePad(boxes: Boxes, landing: NodeId | null, columnTop: number, rulesBottom: number): number {
  const land = landing ? boxes[landing] : undefined
  const outcome = boxes.outcome
  if (!land || !outcome) return 0
  const want = land.y - columnTop
  const room = rulesBottom - columnTop - outcome.h
  return Math.max(0, Math.round(Math.min(want, Math.max(0, room))))
}
