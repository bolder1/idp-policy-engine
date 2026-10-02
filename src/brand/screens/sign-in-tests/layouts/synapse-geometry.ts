import type { EngineRun } from '../engine-run'
import { inputOf, outputsOf, readRows, type InputId, type OutId } from './synapse-model'

/* -----------------------------------------------------------------------------
   Where every neuron of the network stands (SynapseLayout.tsx), and the
   synapses' curves between them — from the plan alone, at zoom 1, so nothing
   is measured off a moving box and the world is the landed run's size from
   the first frame.

     inputs | policies | ┌ rules in <decider> ─────────┐ | outputs
     person ─fan─▶ pol  │  checks ──▶ rules             │ ─▶ out ○
     facts ═══bundle═══▶│  (fed by the facts)           │    card
                        └───────────────────────────────┘

   The facts sit under the policy stack, so their fibres run beneath it and
   rise into the checks; the person's Who fibres drop into the same lane.
   -------------------------------------------------------------------------- */

export const WORLD_W = 1280
export const IN = { x: 0, w: 184 }
export const POL = { x: 248, w: 200 }
export const FRAME = { x: 512, w: 488 }
export const CK = { x: 530, w: 194 }
export const RU = { x: 784, w: 200 }
export const OUT = { x: 1056, w: 192 }
export const CARD_W = 224

/** The strip over the network (the what-if banner, the hint), then the layers' headings. */
export const BANNER_H = 40
export const HEAD_Y = 50
export const Y0 = 82

export const PERSON_H = 92
export const FACT_H = 62
export const FACT_GAP = 10
export const POL_H = 64
export const POL_GAP = 8
export const FRAME_HEAD = 46
export const FRAME_PAD = 14
export const RULE_H = 64
export const CK_H = 62
export const CK_GAP = 6
export const BLOCK_GAP = 14
export const OUT_H = 42
export const OUT_GAP = 10
export const CARD_GAP = 22
/** Fibres in one bundle stand this far apart. */
const FIBRE = 4

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface Fibre {
  id: string
  from: string
  to: string
  d: string
}

export interface Geo {
  nodes: Map<string, Box>
  frame: Box
  card: Box
  worldH: number
  /** The rule blocks, by rule index: where the rule and its checks stand. */
  checks: { r: number; k: number; input: InputId }[]
  outputs: OutId[]
}

const mid = (b: Box) => b.y + b.h / 2

export function geometryOf(plan: EngineRun, inputs: readonly InputId[], cardH: number): Geo {
  const nodes = new Map<string, Box>()
  const have = new Set(inputs)

  // Policies, top-aligned with the person.
  plan.policies.forEach((_, i) => nodes.set(`pol:${i}`, { x: POL.x, y: Y0 + i * (POL_H + POL_GAP), w: POL.w, h: POL_H }))
  const polBottom = Y0 + Math.max(1, plan.policies.length) * (POL_H + POL_GAP) - POL_GAP

  // Inputs: the person, then the facts under the policy stack (a long stack: from its sixth row).
  nodes.set('in:person', { x: IN.x, y: Y0, w: IN.w, h: PERSON_H })
  const under = Y0 + Math.min(plan.policies.length, 6) * (POL_H + POL_GAP) + 18
  const factTop = Math.max(Y0 + PERSON_H + 30, under)
  inputs
    .filter((id) => id !== 'person')
    .forEach((id, i) => nodes.set(`in:${id}`, { x: IN.x, y: factTop + i * (FACT_H + FACT_GAP), w: IN.w, h: FACT_H }))

  // The frame: the deciding policy's rules, each a block as tall as its checks.
  const checks: Geo['checks'] = []
  let y = Y0 + FRAME_HEAD
  plan.rules.forEach((r, ri) => {
    const rows = readRows(r)
    const n = rows.length
    const stackH = n > 0 ? n * CK_H + (n - 1) * CK_GAP : 0
    const blockH = Math.max(RULE_H, stackH)
    nodes.set(`ru:${ri}`, { x: RU.x, y: y + (blockH - RULE_H) / 2, w: RU.w, h: RULE_H })
    const top = y + (blockH - stackH) / 2
    rows.forEach((c, k) => {
      nodes.set(`ck:${ri}:${k}`, { x: CK.x, y: top + k * (CK_H + CK_GAP), w: CK.w, h: CK_H })
      checks.push({ r: ri, k, input: inputOf(c, have) })
    })
    y += blockH + BLOCK_GAP
  })
  const frameH = Math.max(150, y - BLOCK_GAP + FRAME_PAD - Y0)
  const frame = { x: FRAME.x, y: Y0, w: FRAME.w, h: frameH }

  // The outputs, aligned with the first rule; the outcome card under them.
  const outputs = outputsOf(plan)
  outputs.forEach((id, i) => nodes.set(`out:${id}`, { x: OUT.x, y: Y0 + FRAME_HEAD + i * (OUT_H + OUT_GAP), w: OUT.w, h: OUT_H }))
  const outBottom = Y0 + FRAME_HEAD + outputs.length * (OUT_H + OUT_GAP) - OUT_GAP
  const card = { x: OUT.x, y: outBottom + CARD_GAP, w: CARD_W, h: cardH }

  const bottoms = [...nodes.values()].map((b) => b.y + b.h)
  const worldH = Math.ceil(Math.max(polBottom, frame.y + frame.h, card.y + card.h, ...bottoms) + 20)
  return { nodes, frame, card, worldH, checks, outputs }
}

// --- The synapses ------------------------------------------------------------------------------

/** A smooth S between two ports, left to right. */
function s(x0: number, y0: number, x1: number, y1: number): string {
  const k = Math.max(18, (x1 - x0) * 0.5)
  return `M ${x0} ${y0} C ${x0 + k} ${y0} ${x1 - k} ${y1} ${x1} ${y1}`
}

/** Every synapse's curve, from the geometry. Ids: p:<i>, open, c:<r>:<k>, r:<r>:<k>, o:<r>, stem. */
export function fibresOf(plan: EngineRun, g: Geo, chosen: OutId): Fibre[] {
  const out: Fibre[] = []
  const person = g.nodes.get('in:person')
  const deciderIdx = plan.policies.findIndex((p) => p.decides)

  // The person → each policy: its fan.
  if (person) {
    plan.policies.forEach((_, i) => {
      const b = g.nodes.get(`pol:${i}`)
      if (b) out.push({ id: `p:${i}`, from: 'in:person', to: `pol:${i}`, d: s(person.x + person.w, mid(person), b.x, mid(b)) })
    })
  }
  // The policy that decides → its rules.
  const dec = g.nodes.get(`pol:${deciderIdx}`)
  if (dec) out.push({ id: 'open', from: `pol:${deciderIdx}`, to: 'frame', d: s(dec.x + dec.w, mid(dec), g.frame.x, g.frame.y + FRAME_HEAD / 2 - 2) })

  // Each input → the checks that read it: a bundle of fibres under the policy stack, rising into the checks.
  const byInput = new Map<InputId, { r: number; k: number }[]>()
  g.checks.forEach((c) => byInput.set(c.input, [...(byInput.get(c.input) ?? []), c]))
  const turnX = POL.x + POL.w + 22
  const laneOf = (id: InputId, src: Box): number => {
    if (id !== 'person') return mid(src)
    const firstFact = [...g.nodes.entries()].find(([k]) => k.startsWith('in:') && k !== 'in:person')?.[1]
    const polBottom = Math.max(...plan.policies.map((_, i) => (g.nodes.get(`pol:${i}`)?.y ?? 0) + POL_H), mid(src))
    return firstFact ? Math.min(firstFact.y - 12, polBottom + 10) : polBottom + 14
  }
  byInput.forEach((list, id) => {
    const src = g.nodes.get(`in:${id}`)
    if (!src) return
    const lane = laneOf(id, src)
    list.forEach((c, j) => {
      const b = g.nodes.get(`ck:${c.r}:${c.k}`)
      if (!b) return
      const o = (j - (list.length - 1) / 2) * FIBRE
      const x0 = src.x + src.w
      const y0 = mid(src) + o
      const ly = lane + o
      const tx = turnX + j * FIBRE
      let d: string
      if (id === 'person') {
        const dx = IN.w + 18 + j * FIBRE
        d = `M ${x0} ${y0} H ${dx - 8} Q ${dx} ${y0} ${dx} ${y0 + 8} V ${ly - 8} Q ${dx} ${ly} ${dx + 8} ${ly} H ${tx}`
      } else d = `M ${x0} ${y0} H ${tx}`
      const y1 = mid(b)
      d += ` C ${tx + 34} ${ly} ${b.x - 30} ${y1} ${b.x} ${y1}`
      out.push({ id: `c:${c.r}:${c.k}`, from: `in:${id}`, to: `ck:${c.r}:${c.k}`, d })
    })
  })

  // Each check → its rule.
  g.checks.forEach((c) => {
    const a = g.nodes.get(`ck:${c.r}:${c.k}`)
    const b = g.nodes.get(`ru:${c.r}`)
    if (a && b) out.push({ id: `r:${c.r}:${c.k}`, from: `ck:${c.r}:${c.k}`, to: `ru:${c.r}`, d: s(a.x + a.w, mid(a), b.x, mid(b)) })
  })

  // Each rule → the decision it gives; the chosen output → the card.
  plan.rules.forEach((r, ri) => {
    const a = g.nodes.get(`ru:${ri}`)
    const b = g.nodes.get(`out:${r.decision}`)
    if (a && b) out.push({ id: `o:${ri}`, from: `ru:${ri}`, to: `out:${r.decision}`, d: s(a.x + a.w, mid(a), b.x, mid(b)) })
  })
  const ch = g.nodes.get(`out:${chosen}`)
  if (ch) {
    const x0 = ch.x + ch.w
    const x1 = g.card.x + g.card.w - 14
    const y0 = mid(ch)
    out.push({ id: 'stem', from: `out:${chosen}`, to: 'card', d: `M ${x0} ${y0} H ${x1 - 8} Q ${x1} ${y0} ${x1} ${y0 + 8} V ${g.card.y}` })
  }
  return out
}
