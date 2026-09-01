import { motion } from 'motion/react'
import { useMemo, useState } from 'react'

import { AppLogo } from '../logos/AppLogo'
import { enforces, type AccessDecision, type App, type Group, type Policy, type Rule } from '../data'
import { useBrand } from '../store'

/* -----------------------------------------------------------------------------
   Coverage.

   The policy list answers "what have we built". It cannot answer "what is
   unprotected", which is the question an admin actually loses sleep over — a
   list of nine policies looks reassuring whether it covers six app-group pairs
   or fifty.

   So: apps across, groups down, one cell per pair. A filled cell is governed
   and shows the outcome a sign-in would get. An empty cell is a group that can
   reach an app with nothing watching. Gaps are the default reading, not
   something you have to go and compute.

   The outcome in each cell is resolved the way the engine resolves it — the
   policies attached to that app, their rules walked top to bottom, first match
   wins. Inactive policies are not counted as cover, because they do not
   evaluate.
   -------------------------------------------------------------------------- */

interface Cell {
  policy: Policy
  /** The strictest rule that can apply to this pair. */
  rule: Rule
  /** How many rules can apply at all. */
  rules: number
  decision: AccessDecision
  /* True when nothing but the always-on global policy reaches this pair. It is
     a fallback, not cover — counting it would report 100% governed for a tenant
     that has written no policy at all, which is the exact false comfort this
     screen exists to remove. */
  fallback: boolean
}

const STRICTNESS: Record<AccessDecision, number> = { '1fa': 0, '2fa': 1, deny: 2 }

function match(p: Policy, app: App, group: Group): Cell | null {
  /* `enforces`, not `!== 'inactive'`. A monitor policy evaluates and records
     and stops there — counting it as cover would report a tenant as protected
     by a policy that has never refused anything. */
  if (!enforces(p)) return null
  if (!p.allApps && !p.appIds.includes(app.id)) return null

  // Every rule that could apply, not just the first. Which one wins depends on
  // conditions evaluated at sign-in, so the honest static answer is the range —
  // and the number an admin acts on is the strictest thing that can happen.
  /* The audience test moved up: it is the POLICY that governs a group now, so
     a policy either covers this column or it does not, and every one of its
     rules covers it equally. Named individuals do not appear on this matrix at
     all — see the footnote the table renders under it. */
  if (!p.audience.everyone && !p.audience.groupIds.includes(group.id)) return null
  const applicable = p.rules.filter((r) => r.enabled)
  if (applicable.length === 0) return null

  const worst = applicable.reduce((a, b) => (STRICTNESS[b.decision] > STRICTNESS[a.decision] ? b : a))
  return {
    policy: p,
    rule: worst,
    rules: applicable.length,
    decision: worst.decision,
    fallback: !!p.isSystem,
  }
}

function resolve(policies: Policy[], app: App, group: Group): Cell | null {
  for (const p of policies) {
    if (p.isSystem) continue
    const hit = match(p, app, group)
    if (hit) return hit
  }
  for (const p of policies) {
    if (!p.isSystem) continue
    const hit = match(p, app, group)
    if (hit) return hit
  }
  return null
}

const TONE: Record<AccessDecision, string> = { deny: 'deny', '2fa': 'mfa', '1fa': 'allow' }

/** The strictest outcome this pair can get, and how many rules can produce it. */
function cellLabel(c: Cell) {
  const word = c.decision === 'deny' ? 'Deny' : c.decision === '2fa' ? 'MFA' : 'Allow'
  return c.rules > 1 ? `${word} · ${c.rules}` : word
}

export function Coverage() {
  const store = useBrand()
  const [flipped, setFlipped] = useState(false)
  const [hover, setHover] = useState<{ a: number; g: number } | null>(null)

  const grid = useMemo(() => {
    const rows = store.groups.map((g) => ({
      group: g,
      cells: store.apps.map((a) => resolve(store.policies, a, g)),
    }))
    const all = rows.flatMap((r) => r.cells)
    const real = all.filter((c) => c && !c.fallback)
    return {
      rows,
      total: all.length,
      governed: real.length,
      mfa: real.filter((c) => c?.decision === '2fa').length,
      deny: real.filter((c) => c?.decision === 'deny').length,
    }
  }, [store.policies, store.apps, store.groups])

  const gaps = grid.total - grid.governed

  // Apps across and groups down, or the transpose. Same data either way; which
  // one reads better depends on whether you are auditing an app or a team.
  const colHeads = flipped ? store.groups.map((g) => g.name) : store.apps.map((a) => a.name)
  const rowHeads = flipped ? store.apps : store.groups

  const cellAt = (r: number, c: number) => (flipped ? grid.rows[c].cells[r] : grid.rows[r].cells[c])

  function open(cell: Cell | null) {
    if (cell) store.go({ name: 'builder', policyId: cell.policy.id })
    else store.go({ name: 'create' })
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }}>
      <div className="bcov__stats">
        <Stat label="Pairs governed" value={grid.governed} of={grid.total} />
        <Stat label="Step-up required" value={grid.mfa} tone="mfa" />
        <Stat label="Denied" value={grid.deny} tone="deny" />
        <Stat label="Uncovered pairs" value={gaps} warn={gaps > 0} />
      </div>

      <div className="bcov__wrap">
        <table className="bcov" style={{ ['--cols' as string]: colHeads.length }}>
          <thead>
            <tr>
              <th className="bcov__corner">
                <span>{flipped ? 'Apps' : 'Groups'}</span>
                <em>{flipped ? 'Groups' : 'Apps'}</em>
              </th>
              {colHeads.map((name, i) => (
                <th key={name} className={`bcov__colhead ${hover?.a === i ? 'is-hot' : ''}`}>
                  <span>
                    {!flipped && <AppLogo appId={store.apps[i].id} name={name} size={16} />}
                    {name}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowHeads.map((row, r) => (
              <tr key={row.id}>
                <th className={`bcov__rowhead ${hover?.g === r ? 'is-hot' : ''}`}>
                  <span>{row.name}</span>
                  {'memberCount' in row && <em>{row.memberCount.toLocaleString()} people</em>}
                </th>
                {colHeads.map((_, c) => {
                  const cell = cellAt(r, c)
                  return (
                    <td key={c}>
                      <button
                        type="button"
                        className={`bcov__cell ${
                          !cell ? 'is-empty' : cell.fallback ? 'is-fallback' : `is-${TONE[cell.decision]}`
                        }`}
                        onMouseEnter={() => setHover({ a: c, g: r })}
                        onMouseLeave={() => setHover(null)}
                        onClick={() => open(cell)}
                        title={
                          !cell
                            ? 'No policy governs this pair — click to create one'
                            : cell.fallback
                              ? `Only ${cell.policy.name} reaches this pair — no policy of your own does`
                              : `${cell.policy.name} — ${cell.rules} rule${cell.rules === 1 ? '' : 's'} can apply, strictest is "${cell.rule.name}"`
                        }
                      >
                        {cell ? (
                          <>
                            <i aria-hidden />
                            {cell.fallback ? 'Default' : cellLabel(cell)}
                          </>
                        ) : (
                          <span className="bcov__plus" aria-hidden>
                            +
                          </span>
                        )}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bcov__foot">
        <div className="bcov__legend">
          <span className="is-allow">
            <i aria-hidden />
            Allow
          </span>
          <span className="is-mfa">
            <i aria-hidden />
            Step-up
          </span>
          <span className="is-deny">
            <i aria-hidden />
            Deny
          </span>
          <span className="is-fallback">
            <i aria-hidden />
            Global default only
          </span>
          <span className="is-empty">
            <i aria-hidden />
            No policy
          </span>
        </div>
        <p className="bcov__note">
          A cell shows the strictest outcome the pair can get and how many rules can apply — which
          one actually wins depends on the conditions at sign-in. Inactive policies and the
          always-on global default are not
          counted as cover — the default reaches everything, so counting it would report full
          coverage for a tenant that has written no policy at all.
        </p>
      </div>

      <button type="button" className="bcov__flip" onClick={() => setFlipped((f) => !f)}>
        Flip axes
      </button>
    </motion.div>
  )
}

function Stat({
  label,
  value,
  of,
  tone,
  warn,
}: {
  label: string
  value: number
  of?: number
  tone?: string
  warn?: boolean
}) {
  return (
    <div className={`bcov__stat ${warn ? 'is-warn' : ''}`}>
      <span className="bcov__statlabel">{label}</span>
      <span className={`bcov__statvalue ${tone ? `is-${tone}` : ''}`}>
        {value}
        {of !== undefined && <em> / {of}</em>}
      </span>
    </div>
  )
}
