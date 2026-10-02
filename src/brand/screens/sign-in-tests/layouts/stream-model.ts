import type { EngineRun } from '../engine-run'
import { G, type Pt, type StreamGeo } from './stream-geometry'
import { lengthAt, type Sampled } from './stream-path'

/* -----------------------------------------------------------------------------
   Where the stream has reached at each step of the plan (StreamLayout.tsx),
   as a length along the main route — never back — and the gate being tested
   at that step. Drawn from `s` alone: the clock advances the plan, this only
   reads it.

     find            the stream leaves the source, reaches the trunk
     scan i          down the trunk to policy i's gate; it glances off a shut one
     found/decides   the gate that covers opens: it pours through the channel
     expand          on to the rules' trunk
     rule j …        down to rule j's gate, pressing on it while its sensors read
     rule-end        the gate that matches opens: through it
     compact         a shut rule gate: the stream diverts down to the next
     deciding        on to the pool
     outcome, done   in the pool
   -------------------------------------------------------------------------- */

export type Tone = 'positive' | 'negative' | 'notice' | 'neutral'

/* The landed route's one colour: an allow green on any number of factors, a deny red, a Depends amber. */
export function toneOf(plan: Pick<EngineRun, 'outcome'>): Tone {
  const o = plan.outcome
  if (o.status === 'decided' && o.decision) return o.decision === 'deny' ? 'negative' : 'positive'
  return o.status === 'depends' ? 'notice' : 'neutral'
}

export interface Probe {
  pts: Pt[]
  kind: 'glance' | 'press'
}

export interface FlowPlan {
  /** The reach at each step, never less than the step before. */
  reach: number[]
  /** The gate tested at each step, or null. */
  probe: (Probe | null)[]
}

export function flowPlan(plan: EngineRun, geo: StreamGeo, route: Sampled): FlowPlan {
  const total = route.total
  const at = (p: Pt) => Math.min(total, lengthAt(route, p))
  const polLane = geo.pols.map((p) => at({ x: G.T1, y: p.lane }))
  const trunkTop = at({ x: G.T1, y: geo.src.port.y })
  const pd = geo.d >= 0 ? geo.pols[geo.d] : null
  const dOut = pd ? at({ x: G.POL_X + G.POL_W, y: pd.lane }) : total
  const ruleLane = geo.rules.map((r, j) => (j <= geo.land ? at({ x: G.T2, y: r.lane }) : total))
  const landOut = geo.land >= 0 ? at({ x: G.RULE_X + G.RULE_W, y: geo.rules[geo.land].lane }) : total
  const last = plan.steps.length - 1
  const landRule = geo.land >= 0 ? plan.rules[geo.land] : undefined

  const reach: number[] = []
  const probe: (Probe | null)[] = []
  let r = 0
  plan.steps.forEach((step, s) => {
    let want = r
    let pr: Probe | null = null
    const polStub = (i: number): Probe | null => {
      const slot = geo.pols[i]
      return slot ? { pts: [{ x: G.T1, y: slot.lane }, { x: G.POL_X - 3, y: slot.lane }], kind: i === geo.d ? 'press' : 'glance' } : null
    }
    const ruleStub = (j: number): Probe | null => {
      const slot = geo.rules[j]
      return slot ? { pts: [{ x: G.T2, y: slot.lane }, { x: G.RULE_X - 3, y: slot.lane }], kind: 'press' } : null
    }
    switch (step.kind) {
      case 'find':
        want = trunkTop
        break
      case 'scan': {
        const i = step.policy ?? 0
        want = polLane[Math.min(i, polLane.length - 1)] ?? trunkTop
        pr = polStub(i)
        break
      }
      case 'found':
      case 'decides':
        want = dOut
        break
      case 'expand':
        want = ruleLane[0] ?? dOut
        break
      case 'rule':
      case 'check':
      case 'checked': {
        const j = step.rule ?? 0
        want = ruleLane[Math.min(j, Math.max(0, geo.land))] ?? r
        pr = ruleStub(j)
        break
      }
      case 'rule-end': {
        const j = step.rule ?? 0
        want = j === geo.land ? landOut : (ruleLane[j] ?? r)
        break
      }
      case 'compact': {
        const j = step.rule ?? 0
        want = j + 1 <= geo.land ? (ruleLane[j + 1] ?? r) : (ruleLane[j] ?? r)
        break
      }
      case 'deciding':
      case 'outcome':
      case 'done':
        want = total
        break
      default:
        break
    }
    /* The rule that decides has settled: its gate is open. */
    if (landRule && landRule.startAt >= 0 && s >= landRule.endAt && step.kind !== 'deciding' && step.kind !== 'outcome' && step.kind !== 'done') want = Math.max(want, landOut)
    if (s === last) want = total
    r = Math.max(r, want)
    reach.push(r)
    probe.push(pr)
  })
  return { reach, probe }
}
