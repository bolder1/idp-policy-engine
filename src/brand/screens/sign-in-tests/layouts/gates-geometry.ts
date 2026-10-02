import type { EngineRun } from '../engine-run'

/* -----------------------------------------------------------------------------
   Where everything stands on the gates' ground (GatesLayout.tsx), from the plan
   alone: nothing is measured, so the token's walk is computed, not chased.

     sign-in   │ policy gates  │  rule turnstiles │ booths │ door
     ┌──────┐  │ ┌─ 1 ───────┐ │ ┌─ 1 ─────────┐  │        │
     │ Maya │ ●│ ┤ gate      │ │ ┤ turnstile   │  │        │
     └──────┘  │ ├─ 2 ───────┤ │ ├─ 2 ─────────┤ ─┼─ [OTP]─┼─ [door]
               │ ...         │ │ ...           │

   The token stands in the walkway in front of a bank while a lane is asked,
   sidesteps down the walkway to the next lane, and walks through the lane
   that lets it in. Every move is along one axis.
   -------------------------------------------------------------------------- */

export const SIGN_W = 196
export const POL_W = 256
export const RULE_W = 288
export const DOOR_W = 240
/** A booth's slot: its frame in the middle, its name under it. Booths stand shoulder to shoulder. */
export const BOOTH_W = 76
/** The walkway in front of a bank (and after the last). */
export const WALK = 52
/** The sign-in to the first gate: a little longer, so the first walk is seen. */
export const WALK_IN = 56
export const HEAD = 36
export const TALL = 96
export const SLIM = 44
/** Where the floor line crosses a tall lane, and a slim one. */
const MID_TALL = 58
const MID_SLIM = 22
/** The door glyph's middle, from the door card's top. */
export const DOOR_CY = 40

export interface Pt {
  x: number
  y: number
}

export interface GatesGeo {
  polX: number
  ruleX: number
  boothX: number[]
  doorX: number
  width: number
  polTops: number[]
  polHs: number[]
  ruleTops: number[]
  ruleHs: number[]
  /** The floor line the booths and the door stand on. */
  outY: number
  doorTop: number
  start: Pt
  doorIn: Pt
  doorFront: Pt
  hasRules: boolean
  bankBottom: number
}

const tops = (hs: number[]) => {
  const out: number[] = []
  let y = HEAD
  for (const h of hs) {
    out.push(y)
    y += h
  }
  return out
}

export const midOf = (top: number, h: number) => top + (h >= TALL ? MID_TALL : MID_SLIM)

/** The lane heights: a lane the token reaches (or one that also covers the person) is tall; the rest are slim. */
export function geoOf(plan: EngineRun, booths: number, alsoIds: ReadonlySet<string>, ruleAlso: ReadonlySet<string> = new Set()): GatesGeo {
  const polHs = plan.policies.map((p) => (p.scanned || p.decides || alsoIds.has(p.policyId) ? TALL : SLIM))
  const decider = plan.policies.find((p) => p.decides)
  const hasRules = !!decider && plan.rules.length > 0
  const ruleHs = hasRules ? plan.rules.map((r, j) => (r.visited || plan.landing === j || (plan.landing !== null && j > plan.landing && ruleAlso.has(r.id)) ? TALL : SLIM)) : []
  const polTops = tops(polHs)
  const ruleTops = tops(ruleHs)
  const polX = SIGN_W + WALK_IN
  const ruleX = polX + POL_W + WALK
  const afterBanks = (hasRules ? ruleX + RULE_W : polX + POL_W) + WALK
  const boothX = Array.from({ length: booths }, (_, i) => afterBanks - 10 + i * BOOTH_W)
  const doorX = afterBanks + (booths ? booths * BOOTH_W + 4 : 0)
  const d = plan.policies.findIndex((p) => p.decides)
  const dIdx = d >= 0 ? d : Math.max(0, plan.policies.length - 1)
  const lastVisited = plan.rules.reduce((n, r, i) => (r.visited ? i : n), -1)
  const L = plan.landing ?? lastVisited
  const outY = hasRules && L >= 0 ? midOf(ruleTops[L], ruleHs[L]) : polTops.length ? midOf(polTops[dIdx], polHs[dIdx]) : HEAD + MID_TALL
  const doorTop = Math.max(0, outY - DOOR_CY)
  const bankBottom = Math.max(HEAD + polHs.reduce((a, b) => a + b, 0), HEAD + ruleHs.reduce((a, b) => a + b, 0))
  const firstMid = polTops.length ? midOf(polTops[0], polHs[0]) : HEAD + MID_TALL
  return {
    polX,
    ruleX,
    boothX,
    doorX,
    width: doorX + DOOR_W,
    polTops,
    polHs,
    ruleTops,
    ruleHs,
    outY,
    doorTop,
    start: { x: SIGN_W + 8, y: firstMid },
    doorIn: { x: doorX + 14 + 22, y: doorTop + DOOR_CY },
    doorFront: { x: doorX - WALK / 2, y: doorTop + DOOR_CY },
    hasRules,
    bankBottom,
  }
}

export const polFront = (g: GatesGeo, i: number): Pt => ({ x: g.polX - WALK / 2, y: midOf(g.polTops[i], g.polHs[i]) })
export const polExit = (g: GatesGeo, i: number): Pt => ({ x: g.polX + POL_W + WALK / 2, y: midOf(g.polTops[i], g.polHs[i]) })
export const ruleFront = (g: GatesGeo, j: number): Pt => ({ x: g.ruleX - WALK / 2, y: midOf(g.ruleTops[j], g.ruleHs[j]) })
export const ruleExit = (g: GatesGeo, j: number): Pt => ({ x: g.ruleX + RULE_W + WALK / 2, y: midOf(g.ruleTops[j], g.ruleHs[j]) })

/** The step the answer starts drawing out at (the `deciding` beat), or -1. */
export const decidingAt = (plan: EngineRun): number => plan.steps.findIndex((st) => st.kind === 'deciding')

export const isLanded = (plan: EngineRun, v: number): boolean => v >= plan.steps.length - 1 || (plan.at.outcome >= 0 && v >= plan.at.outcome)

export const isAllow = (plan: EngineRun): boolean => plan.outcome.status === 'decided' && !!plan.outcome.decision && plan.outcome.decision !== 'deny'

/** Where the token stands at step `v`: the one place the walk has reached. */
export function stopAt(plan: EngineRun, v: number, g: GatesGeo): Pt {
  if (plan.policies.length === 0) return g.start
  if (isLanded(plan, v)) return isAllow(plan) ? g.doorIn : g.doorFront
  const d = plan.policies.findIndex((p) => p.decides)
  const decider = d >= 0 ? plan.policies[d] : undefined
  const dec = decidingAt(plan)
  if (dec >= 0 && v >= dec) {
    if (g.hasRules) {
      const L = plan.landing ?? plan.rules.reduce((n, r, i) => (r.visited ? i : n), 0)
      return ruleExit(g, Math.max(0, L))
    }
    return d >= 0 ? polExit(g, d) : g.doorFront
  }
  if (decider && decider.expandAt !== null && v >= decider.expandAt) {
    let r = -1
    plan.rules.forEach((x, j) => {
      if (x.visited && x.startAt >= 0 && x.startAt <= v && g.ruleHs[j] >= TALL) r = j
    })
    return r >= 0 && g.hasRules ? ruleFront(g, r) : polExit(g, d)
  }
  let i = -1
  plan.policies.forEach((p, k) => {
    if (p.scanAt !== null && p.scanAt <= v) i = k
  })
  return i >= 0 ? polFront(g, i) : g.start
}

const same = (a: Pt, b: Pt) => Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5

/** The way from one stop to the next: along one axis, or down the walkway first, then across. */
export function routeOf(a: Pt, b: Pt): Pt[] {
  if (same(a, b)) return [a]
  if (Math.abs(a.x - b.x) < 0.5 || Math.abs(a.y - b.y) < 0.5) return [a, b]
  return [a, { x: a.x, y: b.y }, b]
}

/** Every stop of the walk up to step `v`, in order, once each: the trail. */
export function stopsTo(plan: EngineRun, v: number, g: GatesGeo): Pt[] {
  const out: Pt[] = [g.start]
  for (let k = 0; k <= v && k < plan.steps.length; k++) {
    const p = stopAt(plan, k, g)
    const last = out[out.length - 1]
    if (!same(last, p)) out.push(...routeOf(last, p).slice(1))
  }
  return out
}
