import type { EngineRun } from '../engine-run'
import { BOX_R, G, type Pt, type StreamGeo } from './stream-geometry'
import { pathD } from './stream-path'

/* -----------------------------------------------------------------------------
   The plumbing (StreamLayout.tsx): every channel the stream COULD take, dry
   and quiet under the cards — the trunks down the policies, the rules and the
   pools, a stub to each gate. Over the cards, once the run has landed, the
   trickles: a later policy or rule that also covers the person (amber for a
   conflict, grey when it is only worth knowing) and, for a Depends, the
   amber routes it could take — none of them reaching a pool on the line.
   -------------------------------------------------------------------------- */

export function Pipes({ geo, rulesShown, polShown }: { geo: StreamGeo; rulesShown: boolean; polShown: boolean }) {
  const paths: { d: string; k: string }[] = []
  const line = (k: string, pts: Pt[]) => paths.push({ k, d: pathD(pts, G.RADIUS) })
  const port = geo.src.port
  if (geo.pols.length > 0) {
    const first = geo.pols[0].lane
    const last = geo.pols[geo.pols.length - 1].lane
    line('src', [port, { x: G.T1, y: port.y }])
    if (polShown) {
      if (last > first) line('t1', [{ x: G.T1, y: first }, { x: G.T1, y: last }])
      geo.pols.forEach((p, i) => line(`p${i}`, [{ x: G.T1, y: p.lane }, { x: G.POL_X, y: p.lane }]))
    }
  }
  if (rulesShown && geo.rules.length > 0 && geo.d >= 0) {
    const ld = geo.pols[geo.d].lane
    line('dout', [{ x: G.POL_X + G.POL_W, y: ld }, { x: G.T2, y: ld }])
    const first = geo.rules[0].lane
    const last = geo.rules[geo.rules.length - 1].lane
    if (last > first) line('t2', [{ x: G.T2, y: first }, { x: G.T2, y: last }])
    geo.rules.forEach((r, j) => {
      line(`r${j}`, [{ x: G.T2, y: r.lane }, { x: G.RULE_X, y: r.lane }])
      line(`o${j}`, [{ x: G.RULE_X + G.RULE_W, y: r.lane }, { x: BOX_R, y: r.lane }])
    })
  }
  if (geo.pools.length > 0) {
    const lanes = geo.pools.map((p) => p.lane)
    const top = Math.min(...lanes)
    const bottom = Math.max(...lanes)
    if (bottom > top) line('t3', [{ x: G.T3, y: top }, { x: G.T3, y: bottom }])
    geo.pools.forEach((p, k) => line(`q${k}`, [{ x: G.T3, y: p.lane }, { x: G.POOL_X, y: p.lane }]))
  }
  return (
    <svg className="rl-stream__pipes" width={geo.width} height={geo.height} aria-hidden>
      {paths.map((p) => (
        <path key={p.k} d={p.d} />
      ))}
    </svg>
  )
}

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

export function Trickles({ geo, items }: { geo: StreamGeo; items: readonly Trickle[] }) {
  if (items.length === 0) return null
  return (
    <svg className="rl-stream__trickles" width={geo.width} height={geo.height} aria-hidden>
      {items.map((t) => (
        <path key={t.key} d={t.d} className={`is-${t.tone}`} />
      ))}
    </svg>
  )
}
