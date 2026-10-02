import type { AccessDecision } from '../../../data'
import type { EngineRule, EngineRun } from '../engine-run'

/* -----------------------------------------------------------------------------
   Where everything stands in the stream (StreamLayout.tsx), from the plan
   alone — fixed rows, so the world is the landed run's size from the first
   frame and nothing is measured. A cascade read top-left to bottom-right:

     source ─┐  1 ║ policy (gate shut: the stream glances off)
             ├─ 2 ║ policy that covers ═══╗ rules box
             │                            ╠═ 1 ║ rule (✕ on a sensor)
             │                            ╚═ 2 ║ rule that matches ═══ pool (fills)

   The stream falls down a trunk past each shut gate and pours right through
   the first one that opens. The policy that applies, its first rule and the
   source's port share a lane; the rule that matched and the pool it fills
   share another, so a clean run is one straight line.
   -------------------------------------------------------------------------- */

export const G = {
  SRC_W: 216,
  /** The source's port, down from its top: the name row. */
  SRC_PORT: 34,
  T1: 244,
  POL_X: 272,
  POL_W: 256,
  BOX_X: 548,
  T2: 568,
  RULE_X: 588,
  RULE_W: 340,
  T3: 968,
  POOL_X: 996,
  POOL_W: 252,
  /** A channel (policy or rule) and the gap under it. */
  CARD_H: 64,
  STEP: 72,
  /** The groove, down from a channel's top: where the stream runs through it. */
  LANE: 52,
  /** A pool's inlet, down from its top. */
  POOL_LANE: 32,
  /** A column's quiet header, over its first card. */
  HEAD_H: 28,
  /** The rules box's header, inside it. */
  BOX_HEAD: 36,
  BOX_PAD: 12,
  CHECK_H: 46,
  THEN_H: 36,
  POOL_OPEN_H: 204,
  POOL_DEPENDS_ROW: 22,
  RADIUS: 10,
} as const

export const BOX_R = G.RULE_X + G.RULE_W + G.BOX_PAD
export const WORLD_W = G.POOL_X + G.POOL_W

export type PoolKind = AccessDecision | 'depends'
export const POOL_ORDER: readonly AccessDecision[] = ['1fa', '2fa', 'deny']

export interface Pt {
  x: number
  y: number
}

export interface Slot {
  top: number
  h: number
  /** The lane's y in the world. */
  lane: number
}

export interface PoolSlot extends Slot {
  kind: PoolKind
  chosen: boolean
}

export interface StreamGeo {
  width: number
  height: number
  src: { top: number; port: Pt }
  srcHead: number
  pols: Slot[]
  polHead: number
  /** The policy whose channel the stream pours into (the one that decides), or -1. */
  d: number
  box: { top: number; bottom: number } | null
  rules: Slot[]
  /** The rule the walk stopped at, or -1. */
  land: number
  pools: PoolSlot[]
  poolHead: number
  /** Index in `pools` of the one on the line, or -1. */
  chosen: number
}

/** How tall the rule the walk stopped at stands, open: its checks, then its THEN. */
export function openRuleH(r: Pick<EngineRule, 'checks'>): number {
  return G.CARD_H + r.checks.length * G.CHECK_H + G.THEN_H + 6
}

/** The pool on the line, open: the answer whole. */
export function openPoolH(plan: Pick<EngineRun, 'outcome'>): number {
  const o = plan.outcome
  if (o.status === 'depends') return G.CARD_H + 112
  return G.POOL_OPEN_H
}

/* The pools here: always the three outcomes (the chosen one fills); a
   Depends stands its own card on the line, the three under it. */
export function poolKinds(plan: Pick<EngineRun, 'outcome'>): { kinds: PoolKind[]; chosen: number } {
  const o = plan.outcome
  if (o.status === 'depends') return { kinds: ['depends', ...POOL_ORDER], chosen: 0 }
  const kinds: PoolKind[] = [...POOL_ORDER]
  const chosen = o.status === 'decided' && o.decision ? kinds.indexOf(o.decision) : -1
  return { kinds, chosen }
}

export function geometryOf(plan: EngineRun, srcH: number): StreamGeo {
  const { CARD_H, STEP, LANE } = G
  const np = plan.policies.length
  const decider = plan.policies.findIndex((p) => p.decides)
  const d = decider >= 0 ? decider : Math.max(0, np - 1)
  /* Relative to the lane of the policy on the line (0), then shifted so nothing stands above 0. */
  const pols: Slot[] = plan.policies.map((_, i) => {
    const top = -LANE + (i - d) * STEP
    return { top, h: CARD_H, lane: top + LANE }
  })
  const firstLane = np > 0 ? pols[0].lane : 0
  const src = { top: firstLane - G.SRC_PORT, port: { x: G.SRC_W, y: firstLane } }

  const nr = plan.rules.length
  const land = nr === 0 || !plan.decider ? -1 : Math.min(nr - 1, Math.max(0, plan.landing ?? nr - 1))
  const rules: Slot[] = []
  let y = -LANE
  plan.rules.forEach((r, j) => {
    const h = j === land ? openRuleH(r) : CARD_H
    rules.push({ top: y, h, lane: y + LANE })
    y += h + (STEP - CARD_H)
  })
  const box = nr > 0 && plan.decider ? { top: -LANE - G.BOX_HEAD, bottom: y - (STEP - CARD_H) + G.BOX_PAD } : null
  const lr = land >= 0 ? rules[land].lane : 0

  const { kinds, chosen } = poolKinds(plan)
  const pools: PoolSlot[] = []
  const at = chosen >= 0 ? chosen : 0
  const chosenTop = lr - G.POOL_LANE
  const chosenH = chosen >= 0 ? openPoolH(plan) : CARD_H
  kinds.forEach((kind, k) => {
    const h = k === chosen ? chosenH : CARD_H
    let top: number
    if (k < at) top = chosenTop - (at - k) * STEP
    else if (k === at) top = chosenTop
    else top = chosenTop + (at === chosen ? chosenH : CARD_H) + (STEP - CARD_H) + (k - at - 1) * STEP
    pools.push({ kind, top, h, lane: top + G.POOL_LANE, chosen: k === chosen })
  })

  const tops = [src.top - G.HEAD_H, ...pols.map((p) => p.top - G.HEAD_H), ...(box ? [box.top] : []), ...pools.map((p) => p.top - G.HEAD_H)]
  const minY = Math.min(...tops)
  const sh = -minY
  const move = (s: Slot): Slot => ({ ...s, top: s.top + sh, lane: s.lane + sh })
  const P = pols.map(move)
  const R = rules.map(move)
  const Q = pools.map((p) => ({ ...p, top: p.top + sh, lane: p.lane + sh }))
  const S = { top: src.top + sh, port: { x: src.port.x, y: src.port.y + sh } }
  const B = box ? { top: box.top + sh, bottom: box.bottom + sh } : null
  const bottoms = [S.top + srcH, ...P.map((p) => p.top + p.h), ...(B ? [B.bottom] : []), ...Q.map((p) => p.top + p.h)]
  return {
    width: WORLD_W,
    height: Math.ceil(Math.max(...bottoms) + 4),
    src: S,
    srcHead: S.top - G.HEAD_H,
    pols: P,
    polHead: (P[0]?.top ?? S.top) - G.HEAD_H,
    d: decider,
    box: B,
    rules: R,
    land,
    pools: Q,
    poolHead: (Q[0]?.top ?? 0) - G.HEAD_H,
    chosen,
  }
}

/* The route the stream takes, as corner points: source → policy trunk → the
   channel that covers → rules trunk → the gate that opens → pools trunk →
   the pool on the line. With nothing deciding, it stops at the last policy. */
export function mainRoute(geo: StreamGeo): Pt[] {
  const pts: Pt[] = [geo.src.port, { x: G.T1, y: geo.src.port.y }]
  if (geo.pols.length === 0) return pts
  const pd = geo.pols[geo.d >= 0 ? geo.d : geo.pols.length - 1]
  pts.push({ x: G.T1, y: pd.lane })
  if (geo.d < 0) {
    pts.push({ x: G.POL_X, y: pd.lane })
    return pts
  }
  pts.push({ x: G.POL_X + G.POL_W, y: pd.lane })
  if (geo.land < 0) return pts
  const lr = geo.rules[geo.land].lane
  pts.push({ x: G.T2, y: pd.lane }, { x: G.T2, y: lr }, { x: G.RULE_X + G.RULE_W, y: lr })
  const pool = geo.chosen >= 0 ? geo.pools[geo.chosen] : null
  if (!pool) return pts
  pts.push({ x: G.T3, y: lr }, { x: G.T3, y: pool.lane }, { x: G.POOL_X + 6, y: pool.lane })
  return pts
}

/** The same route's points with the straight runs merged and zero-length legs dropped. */
export function tidy(pts: readonly Pt[]): Pt[] {
  const out: Pt[] = []
  for (const p of pts) {
    const a = out[out.length - 1]
    if (a && Math.abs(a.x - p.x) < 0.5 && Math.abs(a.y - p.y) < 0.5) continue
    const b = out[out.length - 2]
    if (a && b && ((Math.abs(b.x - a.x) < 0.5 && Math.abs(a.x - p.x) < 0.5) || (Math.abs(b.y - a.y) < 0.5 && Math.abs(a.y - p.y) < 0.5))) {
      out[out.length - 1] = p
      continue
    }
    out.push(p)
  }
  return out
}

/* The geometry as it stands at a step: the rule the walk stops at stays one
   row tall until the engine reaches it (then opens, the rules under it
   gliding down), and the pool on the line stays one row until the answer
   lands (then fills out, the pools under it gliding down). The world keeps
   the landed size throughout. */
export function liveGeo(geo: StreamGeo, plan: Pick<EngineRun, 'rules'>, s: number, landed: boolean): StreamGeo {
  let rules = geo.rules
  let box = geo.box
  const lr = geo.land >= 0 ? plan.rules[geo.land] : undefined
  if (lr && geo.rules[geo.land] && !landed && (lr.startAt < 0 || s < lr.startAt)) {
    const dy = geo.rules[geo.land].h - G.CARD_H
    rules = geo.rules.map((r, j) => (j < geo.land ? r : j === geo.land ? { ...r, h: G.CARD_H } : { ...r, top: r.top - dy, lane: r.lane - dy }))
    box = box ? { ...box, bottom: box.bottom - dy } : box
  }
  let pools = geo.pools
  if (!landed && geo.chosen >= 0) {
    const dy = geo.pools[geo.chosen].h - G.CARD_H
    pools = geo.pools.map((p, k) => (k < geo.chosen ? p : k === geo.chosen ? { ...p, h: G.CARD_H } : { ...p, top: p.top - dy, lane: p.lane - dy }))
  }
  return rules === geo.rules && pools === geo.pools ? geo : { ...geo, rules, box, pools }
}
