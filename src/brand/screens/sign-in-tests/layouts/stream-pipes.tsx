import { BOX_R, G, type Pt, type StreamGeo } from './stream-geometry'
import { pathD } from './stream-path'
import type { Trickle } from './stream-pipes-utils'

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
