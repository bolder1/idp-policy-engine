import type { AccessDecision } from '../../../data'
import type { EngineRule, EngineRun } from '../engine-run'

/* -----------------------------------------------------------------------------
   The sorting machine's geometry (MarbleLayout.tsx), pure: where every part
   of the machine stands for a plan, and where the marble is at each step of
   it — so the marble's path is computed, never measured, and every frame is
   read off the step on screen.

        [sign-in] ○──rail──┬──────┬──────┬──────┐      the policy funnels hang
                       \1 /   \2 /   \3 /   \4 /       under the rail, labels over it
                        ||
                ┃ ═══ plate 1 ═══════ ┃               the deciding policy's rules:
                ┃ ═══ plate 2 ═══════ ┃ ← chute       a failing plate tips the marble
                ┃ ═══ ✱ ═════════════ ┃               off its left end, a passing one
                  ┗━━━━ bins ━━━━━━━━━┛               rolls it off the right into the chute

   Units are px at zoom 1, in the machine's own box (0,0 = its top left).
   -------------------------------------------------------------------------- */

export interface Dims {
  /** The marble's radius. */
  R: number
  signW: number
  /** A funnel's width, and the room between two. */
  fw: number
  fgap: number
  labelH: number
  /** The top rail's height: the marble rolls on it. */
  railY: number
  hopH: number
  neckH: number
  neckW: number
  /** The least and most a plate is wide; the room each check's slot wants. */
  plateMin: number
  plateMax: number
  slotMin: number
  plateH: number
  plateHEmpty: number
  /** Room over each plate: the marble rolls on it. */
  gap: number
  /** The first plate's top. */
  top0: number
  gutter: number
  chute: number
  /** From the last plate's bottom to the bins' rail. */
  binTop: number
  binW: number
  binGap: number
  cupH: number
  binLabelH: number
  outW: number
  outGap: number
}

export const WIDE: Dims = {
  R: 15,
  signW: 224,
  fw: 228,
  fgap: 16,
  labelH: 72,
  railY: 110,
  hopH: 40,
  neckH: 14,
  neckW: 38,
  plateMin: 480,
  plateMax: 580,
  slotMin: 168,
  plateH: 60,
  plateHEmpty: 38,
  gap: 30,
  top0: 224,
  gutter: 40,
  chute: 44,
  binTop: 34,
  binW: 136,
  binGap: 14,
  cupH: 44,
  binLabelH: 20,
  outW: 300,
  outGap: 34,
}

/** A 1280 window: the machine about 1120 by 590, so fit keeps the words near their size. */
export const TIGHT: Dims = {
  ...WIDE,
  R: 14,
  signW: 208,
  fw: 204,
  fgap: 12,
  labelH: 66,
  railY: 100,
  hopH: 34,
  neckH: 12,
  neckW: 34,
  plateMin: 430,
  plateMax: 520,
  slotMin: 150,
  plateH: 58,
  plateHEmpty: 36,
  gap: 30,
  top0: 198,
  binTop: 30,
  cupH: 40,
  binLabelH: 18,
  outW: 290,
  outGap: 30,
}

export interface FunnelGeo {
  x: number
  w: number
  cx: number
  /** The hopper's two top corners (the lid's hinges) and its neck. */
  hingeL: number
  hingeR: number
}

export interface SlotGeo {
  x: number
  w: number
  cx: number
  /** Only its icon and mark: a check that passed or was never read on a plate that tipped — its room goes to the one that failed. */
  compact: boolean
}

export interface PlateGeo {
  x: number
  y: number
  w: number
  h: number
  slots: SlotGeo[]
}

export interface BinGeo {
  d: AccessDecision
  x: number
  w: number
  cx: number
}

export interface MachineGeo {
  d: Dims
  /** The machine's width, and where its parts end (the height without the answer). */
  W: number
  H: number
  railX0: number
  railX1: number
  funnels: FunnelGeo[]
  /** The deciding funnel's index, or -1. */
  decider: number
  plateX: number
  plateW: number
  plates: PlateGeo[]
  /** Where the marble meets the first plate; and, when the tower had to stand aside from the deciding funnel, the incline that carries the marble from its neck to above that entry. */
  entryX: number
  incline: { x1: number; y1: number; x2: number; y2: number } | null
  gutterX: number
  chuteX: number
  chuteCx: number
  binRailY: number
  bins: BinGeo[]
  binX0: number
  /** The answer beside the tower: it stands on `bottom` (level with the bins' floor, so its wire from the bin is short); `y` is the highest its top may reach. */
  out: { x: number; y: number; w: number; bottom: number; side: 'left' | 'right' }
  /** The tower's own box (plates, gutter, chute, bins). */
  tower: { x: number; y: number; w: number; h: number }
}

/** The plates tip this far, left end down, once a check fails: the marble rolls off. */
export const TILT = 2
const SIN = Math.sin((TILT * Math.PI) / 180)

/** The bins the deciding policy can drop a sign-in into, in a fixed order. */
export function binsOf(plan: EngineRun): AccessDecision[] {
  const set = new Set<AccessDecision>()
  for (const r of plan.rules) set.add(r.decision)
  if (plan.outcome.decision) set.add(plan.outcome.decision)
  for (const d of plan.outcome.possible) set.add(d)
  return (['1fa', '2fa', 'deny'] as const).filter((d) => set.has(d))
}

/** A slot that keeps only its icon and mark. */
export const SLOT_COMPACT = 48

/** On a plate that tipped, the failing check takes the room for its words; the rest keep their icon and mark. */
function compactSlots(r: EngineRule): boolean[] {
  const tipped = r.state === 'no-match' && r.failing !== null && r.checks.length > 1
  return r.checks.map((_, k) => tipped && k !== r.failing)
}

export function machine(plan: EngineRun, d: Dims): MachineGeo {
  const n = plan.policies.length
  const funnels: FunnelGeo[] = plan.policies.map((_, i) => {
    const x = d.signW + 28 + i * (d.fw + d.fgap)
    return { x, w: d.fw, cx: x + d.fw / 2, hingeL: x + 12, hingeR: x + d.fw - 12 }
  })
  const railX0 = d.signW
  const railX1 = n > 0 ? funnels[n - 1].x + d.fw + 8 : d.signW + 120
  const decider = plan.policies.findIndex((p) => p.decides)

  /* The plates: as wide as their checks want, within bounds. */
  const most = Math.max(1, ...plan.rules.map((r) => r.checks.length))
  const plateW = Math.round(Math.min(d.plateMax, Math.max(d.plateMin, 24 + most * d.slotMin + (most - 1) * 6)))
  const towerW = d.gutter + plateW + d.chute
  /* The tower hangs under the funnel that decides, its first plate's entry under the neck — inside the least width that holds the rail, the tower and the answer beside it. */
  const anchor = decider >= 0 ? funnels[decider].cx : funnels[0]?.cx ?? d.signW + 60
  const span = Math.max(railX1, d.signW + 28 + towerW + d.outGap + d.outW)
  const want = anchor - 22 - d.gutter
  const towerX = Math.round(Math.max(d.signW + 28 - d.gutter, Math.min(want, span - towerW)))
  const plateX = towerX + d.gutter
  const entryX = plateX + 22

  let y = d.top0
  const plates: PlateGeo[] = plan.rules.map((r) => {
    const h = r.checks.length > 0 ? d.plateH : d.plateHEmpty
    const inner = plateW - 24
    const compact = compactSlots(r)
    const nWide = compact.filter((c) => !c).length || 1
    const room = inner - Math.max(0, r.checks.length - 1) * 6 - compact.filter(Boolean).length * SLOT_COMPACT
    let sx = plateX + 12
    const cap = r.checks.length === 1 ? 300 : Infinity
    const slots = compact.map((c) => {
      const sw = c ? SLOT_COMPACT : Math.floor(Math.min(cap, room / nWide))
      const s = { x: sx, w: sw, cx: sx + sw / 2, compact: c }
      sx += sw + 6
      return s
    })
    const p = { x: plateX, y, w: plateW, h, slots }
    y += h + d.gap
    return p
  })
  const lastBottom = plates.length > 0 ? plates[plates.length - 1].y + plates[plates.length - 1].h : d.top0
  const binRailY = lastBottom + d.binTop
  const kinds = binsOf(plan)
  const bw = Math.min(d.binW, Math.floor((plateW - Math.max(0, kinds.length - 1) * d.binGap) / Math.max(1, kinds.length)))
  const total = kinds.length * bw + Math.max(0, kinds.length - 1) * d.binGap
  const binX0 = Math.round(plateX + (plateW - total) / 2)
  const bins = kinds.map((k, i) => ({ d: k, x: binX0 + i * (bw + d.binGap), w: bw, cx: binX0 + i * (bw + d.binGap) + bw / 2 }))
  const chuteX = plateX + plateW + d.chute
  const chuteCx = plateX + plateW + d.chute / 2
  const towerBottom = binRailY + d.cupH + d.binLabelH

  /* The incline: from under the deciding funnel's neck, down to above the entry — only when the tower stands aside. */
  const neckBottom = d.railY + d.hopH + d.neckH
  const nx = decider >= 0 ? funnels[decider].cx : entryX
  const incline = decider >= 0 && Math.abs(nx - entryX) > 4 ? { x1: nx, y1: neckBottom + 12, x2: entryX + Math.sign(entryX - nx) * 6, y2: Math.max(neckBottom + 16, d.top0 - d.R * 2 - 8) } : null

  /* The answer beside the tower: on the side with the room, the right first. */
  const rightX = chuteX + d.outGap
  const leftX = towerX - d.outGap - d.outW
  const side: 'left' | 'right' = rightX + d.outW <= span + 4 || leftX < 0 ? 'right' : 'left'
  const out = { x: side === 'right' ? rightX : leftX, y: d.top0 - 6, w: d.outW, bottom: binRailY + d.cupH, side }
  const W = Math.ceil(Math.max(span, chuteX + 8, side === 'right' ? out.x + d.outW : 0))
  const H = Math.ceil(towerBottom + 20)
  return {
    d,
    W,
    H,
    railX0,
    railX1,
    funnels,
    decider,
    plateX,
    plateW,
    plates,
    entryX,
    incline,
    gutterX: towerX + 4,
    chuteX,
    chuteCx,
    binRailY,
    bins,
    binX0,
    out,
    tower: { x: towerX, y: d.top0 - 10, w: towerW, h: towerBottom - d.top0 + 10 },
  }
}

// --- Where the marble is -------------------------------------------------------------------------

export type Spot =
  | { k: 'start' }
  | { k: 'mouth'; i: number }
  | { k: 'sink'; i: number }
  | { k: 'neck'; i: number }
  | { k: 'above' }
  | { k: 'plate'; i: number; x: number }
  | { k: 'edge'; i: number }
  | { k: 'chute' }
  | { k: 'bin'; d: AccessDecision }
  | { k: 'hover' }

/** How a stretch of the path moves: rolled, fallen, or the two halves of a bounce. */
export type Move = 'roll' | 'fall' | 'up' | 'down'
export interface Pt {
  x: number
  y: number
  m: Move
}

/** The plate has tipped by step `s`: its failing check's mark has landed. */
export function tiltedAt(r: EngineRule | undefined, s: number): boolean {
  if (!r || r.state !== 'no-match') return false
  const at = r.failing !== null ? r.markAt[r.failing] : r.endAt
  return at !== undefined && s >= at
}

/** Where the marble is meant to be once step `s` has played, for every step. */
export function spotsOf(plan: EngineRun, g: MachineGeo): Spot[] {
  const out: Spot[] = []
  let cur: Spot = { k: 'start' }
  const landing = plan.landing
  plan.steps.forEach((st) => {
    let next: Spot | null = null
    const r = st.rule !== undefined ? plan.rules[st.rule] : undefined
    const plate = st.rule !== undefined ? g.plates[st.rule] : undefined
    switch (st.kind) {
      case 'scan':
        if (st.policy !== undefined && g.funnels[st.policy]) next = { k: 'mouth', i: st.policy }
        break
      case 'found':
        if (st.policy !== undefined && g.funnels[st.policy]) next = { k: 'sink', i: st.policy }
        break
      case 'decides':
        if (st.policy !== undefined && g.funnels[st.policy]) next = { k: 'neck', i: st.policy }
        break
      case 'expand':
        /* Out of the funnel, down its pipe, onto the first plate. */
        if (g.plates.length > 0) next = { k: 'plate', i: 0, x: g.entryX }
        break
      case 'rule':
        if (plate) next = { k: 'plate', i: st.rule as number, x: g.entryX }
        break
      case 'check':
      case 'checked':
        if (plate && st.check !== undefined) {
          const slot = plate.slots[st.check]
          if (slot) {
            const status = r?.checks[st.check]?.status
            if (st.kind === 'check') next = { k: 'plate', i: st.rule as number, x: Math.max(g.entryX, slot.cx) }
            else if (status === 'fail' && r?.state === 'no-match') next = { k: 'plate', i: st.rule as number, x: Math.max(g.entryX, slot.cx - 12) }
            else if (status === 'pass') {
              /* The mark has landed: on towards the next check (or the plate's end). */
              const nextSlot = plate.slots[st.check + 1]
              next = { k: 'plate', i: st.rule as number, x: nextSlot ? nextSlot.x - 3 : Math.min(g.plateX + g.plateW - 26, slot.x + slot.w - 4) }
            }
          }
        }
        break
      case 'rule-end':
        if (plate && r?.state === 'match') next = { k: 'plate', i: st.rule as number, x: g.plateX + g.plateW - 26 }
        break
      case 'compact':
        if (plate) next = { k: 'edge', i: st.rule as number }
        break
      case 'deciding':
        if (landing !== null && g.plates[landing]) next = { k: 'chute' }
        break
      case 'outcome': {
        const o = plan.outcome
        if (cur.k !== 'chute' && cur.k !== 'hover') break
        if (o.status === 'decided' && o.decision && g.bins.some((b) => b.d === o.decision)) next = { k: 'bin', d: o.decision }
        else if (o.status === 'depends') next = { k: 'hover' }
        break
      }
      default:
        break
    }
    if (next) cur = next
    out.push(cur)
  })
  return out
}

/** The marble's centre at a spot, as it stands at step `s` (a tipped plate is lower at its left). */
export function posOf(plan: EngineRun, g: MachineGeo, sp: Spot, s: number): { x: number; y: number } {
  const { R, railY, hopH, neckH } = g.d
  switch (sp.k) {
    case 'start':
      return { x: g.railX0 + 12 + R, y: railY - R }
    case 'mouth':
      return { x: g.funnels[sp.i]?.cx ?? g.railX0, y: railY - R }
    case 'sink':
      return { x: g.funnels[sp.i]?.cx ?? g.railX0, y: railY + Math.round(hopH * 0.35) }
    case 'neck':
      return { x: g.funnels[sp.i]?.cx ?? g.railX0, y: railY + hopH + neckH - R }
    case 'above':
      return g.incline ? { x: g.entryX, y: g.incline.y2 - R } : { x: g.entryX, y: g.d.top0 - R - 26 }
    case 'plate':
      return { x: sp.x, y: plateTop(plan, g, sp.i, sp.x, s) - R }
    case 'edge': {
      const p = g.plates[sp.i]
      return { x: g.plateX - R - 6, y: (p?.y ?? g.d.top0) + 10 }
    }
    case 'chute':
      return { x: g.chuteCx, y: g.binRailY - R }
    case 'bin': {
      const b = g.bins.find((x) => x.d === sp.d)
      return { x: b?.cx ?? g.chuteCx, y: g.binRailY + g.d.cupH - R - 3 }
    }
    case 'hover': {
      const xs = g.bins.map((b) => b.cx)
      const mid = xs.length > 0 ? (Math.min(...xs) + Math.max(...xs)) / 2 : g.chuteCx
      return { x: mid, y: g.binRailY - R - 2 }
    }
  }
}

/** A plate's top under a point along it: lower to the left once it has tipped. */
export function plateTop(plan: EngineRun, g: MachineGeo, i: number, x: number, s: number): number {
  const p = g.plates[i]
  if (!p) return g.d.top0
  if (!tiltedAt(plan.rules[i], s)) return p.y
  const cx = p.x + p.w / 2
  return p.y - (x - cx) * SIN
}

function rank(sp: Spot): number {
  switch (sp.k) {
    case 'start':
      return 0
    case 'mouth':
      return 1
    case 'sink':
      return 2
    case 'neck':
      return 3
    case 'above':
      return 4
    case 'plate':
    case 'edge':
      return 5
    case 'chute':
      return 6
    default:
      return 7
  }
}

function same(a: Spot, b: Spot): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/* The path from one spot to the next, as step `s` plays it: the points the
   marble passes through after `from`, each with how it moves there. Going
   forward only — anything else is a jump, and the caller snaps. */
export function route(plan: EngineRun, g: MachineGeo, from: Spot, to: Spot, s: number): Pt[] {
  if (same(from, to)) return []
  const { R } = g.d
  const at = (sp: Spot, m: Move): Pt => ({ ...posOf(plan, g, sp, s), m })
  const bounce = (p: { x: number; y: number }, dx = 0, h = 7): Pt[] => [
    { x: p.x + dx, y: p.y - h, m: 'up' },
    { x: p.x + dx * 2, y: p.y, m: 'down' },
  ]
  if (rank(to) < rank(from)) return []

  switch (to.k) {
    case 'start':
      return []
    case 'mouth':
      if (from.k === 'start' || from.k === 'mouth') return [at(to, 'roll')]
      return []
    case 'sink':
      if (from.k === 'mouth' && from.i === to.i) return [at(to, 'fall')]
      return [...route(plan, g, from, { k: 'mouth', i: to.i }, s), at(to, 'fall')]
    case 'neck':
      if (from.k === 'sink' && from.i === to.i) return [at(to, 'fall')]
      return [...route(plan, g, from, { k: 'sink', i: to.i }, s), at(to, 'fall')]
    case 'above': {
      const fi = from.k === 'neck' || from.k === 'sink' || from.k === 'mouth' ? from.i : g.decider
      const pre = from.k === 'neck' ? [] : fi >= 0 ? route(plan, g, from, { k: 'neck', i: fi }, s) : []
      const inc = g.incline
      /* Out of the neck onto the incline, down it, off its end. */
      const run: Pt[] = inc ? [{ x: inc.x1, y: inc.y1 - R, m: 'fall' }, { x: inc.x2, y: inc.y2 - R, m: 'roll' }] : []
      return [...pre, ...run, at(to, 'fall')]
    }
    case 'plate': {
      const entry = { x: g.entryX, y: plateTop(plan, g, to.i, g.entryX, s) - R }
      const rollOn = (p: { x: number; y: number }): Pt[] => (Math.abs(to.x - p.x) > 1 ? [at(to, 'roll')] : [])
      /* Down the gutter beside the plates, kicked back onto the plate below by its lip. */
      const dropTo = (i: number): Pt[] => {
        if (!g.plates[i]) return []
        const ey = plateTop(plan, g, i, g.entryX, s) - R
        const b = bounce({ x: g.entryX, y: ey })
        return [{ x: g.plateX - R - 6, y: ey - 18, m: 'fall' }, { x: g.entryX, y: ey, m: 'fall' }, ...b, ...rollOn(b[1])]
      }
      if (from.k === 'plate' && from.i === to.i) return [at(to, 'roll')]
      if (from.k === 'above') {
        if (to.i === 0) {
          const b = bounce(entry)
          return [{ ...entry, m: 'fall' }, ...b, ...rollOn(b[1])]
        }
        return [...route(plan, g, from, { k: 'edge', i: -1 }, s), ...dropTo(to.i)]
      }
      if (from.k === 'plate' && from.i < to.i) return [...route(plan, g, from, { k: 'edge', i: from.i }, s), ...dropTo(to.i)]
      if (from.k === 'edge' && from.i < to.i) return dropTo(to.i)
      if (rank(from) < 4) return [...route(plan, g, from, { k: 'above' }, s), ...route(plan, g, { k: 'above' }, to, s)]
      return []
    }
    case 'edge': {
      if (to.i < 0) {
        /* From the pipe straight down the gutter (a plate before it was never landed on). */
        return [{ x: g.plateX - R - 6, y: g.d.top0 - R - 10, m: 'fall' }]
      }
      const left = g.plateX + 6
      const pre: Pt[] = from.k === 'plate' && from.i === to.i ? [{ x: left, y: plateTop(plan, g, to.i, left, s) - R, m: 'roll' }] : []
      return [...pre, at(to, 'fall')]
    }
    case 'chute': {
      const L = plan.landing
      if (L === null || !g.plates[L]) return []
      const right = g.plateX + g.plateW - 6
      let pre: Pt[] = []
      if (!(from.k === 'plate' && from.i === L)) pre = route(plan, g, from, { k: 'plate', i: L, x: g.entryX }, s)
      const p = g.plates[L]
      return [...pre, { x: right, y: plateTop(plan, g, L, right, s) - R, m: 'roll' }, { x: g.chuteCx, y: p.y + 8, m: 'fall' }, { ...at(to, 'fall') }, ...bounce(at(to, 'fall'), 0, 5)]
    }
    case 'bin': {
      const pre = from.k === 'chute' ? [] : route(plan, g, from, { k: 'chute' }, s)
      const b = g.bins.find((x) => x.d === to.d)
      if (!b) return pre
      const rest = at(to, 'fall')
      return [...pre, { x: b.cx, y: g.binRailY - R, m: 'roll' }, rest, ...bounce(rest, 0, 5)]
    }
    case 'hover': {
      const pre = from.k === 'chute' ? [] : route(plan, g, from, { k: 'chute' }, s)
      return [...pre, at(to, 'roll')]
    }
  }
}

// --- Timing --------------------------------------------------------------------------------------

/** When, inside its step, the marble moves: a scan rolls up to the funnel and waits there while it is asked; a check rolls to its slot and waits for the mark. */
export function windowOf(plan: EngineRun, s: number): [number, number] {
  switch (plan.steps[s]?.kind) {
    case 'scan':
      return [0, 0.62]
    case 'found':
      return [0.3, 1]
    case 'check':
      return [0, 0.8]
    case 'checked':
      return [0.4, 1]
    case 'expand':
      return [0, 0.85]
    case 'outcome':
      return [0, 0.62]
    case 'deciding':
      return plan.steps[s]?.notice ? [0, 0.4] : [0, 1]
    default:
      return [0, 1]
  }
}

function cost(a: { x: number; y: number }, b: Pt): number {
  const dist = Math.hypot(b.x - a.x, b.y - a.y)
  if (b.m === 'up' || b.m === 'down') return 9
  if (b.m === 'fall') return 7 * Math.sqrt(dist) + 4
  return dist * 0.9 + 6
}

const EASE: Record<Move, [number, number, number, number]> = {
  roll: [0.4, 0, 0.3, 1],
  fall: [0.55, 0, 0.95, 0.55],
  up: [0.15, 0.6, 0.4, 1],
  down: [0.6, 0, 0.85, 0.45],
}

export interface Keys {
  x: number[]
  y: number[]
  /** The marble's spin, turned by how far it rolls. */
  r: number[]
  times: number[]
  ease: [number, number, number, number][]
  /** How long, in units of the cost: what a replay paces itself by. */
  cost: number
}

/** A path as motion keyframes, from `from`, inside `[a, b]` of the step. */
export function keysOf(from: { x: number; y: number }, pts: Pt[], r0: number, win: [number, number] = [0, 1], R = 15): Keys {
  const [a, b] = win
  const costs: number[] = []
  let prev = from
  for (const p of pts) {
    costs.push(cost(prev, p))
    prev = p
  }
  const total = costs.reduce((x, y) => x + y, 0) || 1
  const k: Keys = { x: [from.x], y: [from.y], r: [r0], times: [0], ease: [], cost: total }
  if (a > 0) {
    k.x.push(from.x)
    k.y.push(from.y)
    k.r.push(r0)
    k.times.push(a)
    k.ease.push([0, 0, 1, 1])
  }
  let t = a
  let rot = r0
  prev = from
  pts.forEach((p, i) => {
    t += ((b - a) * costs[i]) / total
    rot += p.m === 'roll' || p.m === 'fall' ? ((p.x - prev.x) / R) * (180 / Math.PI) : 0
    k.x.push(p.x)
    k.y.push(p.y)
    k.r.push(rot)
    k.times.push(Math.min(1, t))
    k.ease.push(EASE[p.m])
    prev = p
  })
  if (b < 1 && pts.length > 0) {
    k.x.push(prev.x)
    k.y.push(prev.y)
    k.r.push(rot)
    k.times.push(1)
    k.ease.push([0, 0, 1, 1])
  }
  k.times[k.times.length - 1] = 1
  return k
}

/** A path through points as an SVG `d`, its corners rounded (radius `r`, less where the legs are short): the trace reads as one way, not a row of brackets. */
export function smoothD(pts: readonly { x: number; y: number }[], r = 14): string {
  const p: { x: number; y: number }[] = []
  for (const q of pts) {
    const last = p[p.length - 1]
    if (!last || Math.hypot(q.x - last.x, q.y - last.y) >= 1.5) p.push({ x: Math.round(q.x), y: Math.round(q.y) })
  }
  if (p.length === 0) return ''
  let d = `M${p[0].x} ${p[0].y}`
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1]
    const b = p[i]
    const c = p[i + 1]
    if (!c) {
      d += ` L${b.x} ${b.y}`
      break
    }
    const l1 = Math.hypot(b.x - a.x, b.y - a.y)
    const l2 = Math.hypot(c.x - b.x, c.y - b.y)
    const k = Math.min(r, l1 / 2, l2 / 2)
    if (k < 1) {
      d += ` L${b.x} ${b.y}`
      continue
    }
    const ax = b.x - ((b.x - a.x) / l1) * k
    const ay = b.y - ((b.y - a.y) / l1) * k
    const cx = b.x + ((c.x - b.x) / l2) * k
    const cy = b.y + ((c.y - b.y) / l2) * k
    d += ` L${ax.toFixed(1)} ${ay.toFixed(1)} Q${b.x} ${b.y} ${cx.toFixed(1)} ${cy.toFixed(1)}`
  }
  return d
}

/** The whole way the marble came, step by step from the start: for the trace, and for Drop again. */
export function wholePath(plan: EngineRun, g: MachineGeo, spots: Spot[], upTo: number): Pt[] {
  const pts: Pt[] = [{ ...posOf(plan, g, { k: 'start' }, 0), m: 'roll' }]
  let from: Spot = { k: 'start' }
  for (let s = 0; s <= upTo && s < spots.length; s++) {
    const to = spots[s]
    pts.push(...route(plan, g, from, to, s))
    from = to
  }
  return pts
}
