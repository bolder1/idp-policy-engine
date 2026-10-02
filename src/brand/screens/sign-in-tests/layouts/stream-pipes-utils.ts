import type { EngineRun } from '../engine-run'
import { G, type StreamGeo } from './stream-geometry'
import { pathD } from './stream-path'

/* The trickles' paths (stream-pipes.tsx draws them): a later policy or rule that also covers the person, and a Depends' routes. */

export interface Trickle {
  key: string
  d: string
  tone: 'notice' | 'quiet'
}

/* The trickles, from the landed plan. */
export function tricklesOf(plan: EngineRun, geo: StreamGeo): Trickle[] {
  const out: Trickle[] = []
  if (geo.d < 0) return out
  const ld = geo.pols[geo.d].lane
  const conflictPolicies = new Set((plan.conflicts?.findings ?? []).filter((f) => f.tone === 'conflict' && (f.kind === 'policy-conflict' || f.kind === 'same-group-policy')).map((f) => f.target.policyId))
  for (const pc of plan.conflicts?.policies ?? []) {
    const i = plan.policies.findIndex((p) => p.policyId === pc.policyId)
    if (i <= geo.d || !geo.pols[i]) continue
    const y = geo.pols[i].lane
    out.push({ key: `pol:${pc.policyId}`, d: pathD([{ x: G.T1, y: ld }, { x: G.T1, y }, { x: G.POL_X + 84, y }], G.RADIUS), tone: conflictPolicies.has(pc.policyId) ? 'notice' : 'quiet' })
  }
  if (geo.land >= 0) {
    const lr = geo.rules[geo.land].lane
    for (const rc of plan.conflicts?.rules ?? []) {
      const j = plan.rules.findIndex((r) => r.id === rc.ruleId)
      if (j <= geo.land || !geo.rules[j]) continue
      const y = geo.rules[j].lane
      out.push({ key: `rule:${rc.ruleId}`, d: pathD([{ x: G.T2, y: lr }, { x: G.T2, y }, { x: G.RULE_X + 84, y }], G.RADIUS), tone: rc.kind === 'conflict' ? 'notice' : 'quiet' })
    }
  }
  /* A Depends: each rule that could not be told, on to the pool it would fill. */
  if (plan.outcome.status === 'depends') {
    plan.rules.forEach((r, j) => {
      const slot = geo.rules[j]
      const pool = geo.pools.find((p) => p.kind === r.decision)
      if (!slot || !pool || (r.state !== 'unknown' && r.state !== 'possible')) return
      out.push({
        key: `dep:${r.id}`,
        d: pathD(
          [
            { x: G.T2, y: slot.lane },
            { x: G.RULE_X + G.RULE_W, y: slot.lane },
            { x: G.T3, y: slot.lane },
            { x: G.T3, y: pool.lane },
            { x: G.POOL_X + 6, y: pool.lane },
          ],
          G.RADIUS,
        ),
        tone: 'notice',
      })
    })
  }
  return out
}
