import { motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { AppWindow, Plus, Users } from 'lucide-react'

import { Button, DecisionChip } from '../kit'
import { EmptyState } from '../empty'
import { AppLogo } from '../logos/AppLogo'
import { coversEveryApp, enforces, type AccessDecision, type App, type Group, type Policy, type Rule, type User } from '../data'
import { whoPasses } from '../rule-who'
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
   wins. Draft and inactive policies are not counted as cover, because they do
   not evaluate.
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

/* Four steps, not three, and `warn` sits ABOVE a bare allow.

   It grants exactly the same access, so on the axis of "who gets in" it is
   `1fa`. That is not the axis this number measures. What it measures is how
   much a rule DOES about a sign-in, because that is what says whether a change
   loosened something — and a rule that stops recording has loosened, even
   though nobody's access widened. */
const STRICTNESS: Record<AccessDecision, number> = { '1fa': 0, '2fa': 1, deny: 2 }

/* Can this rule apply to anyone in the group?

   Its Who decides, not its conditions. Yes when the group is covered — by
   everyone, by the group itself, or by "everyone except" another group — or
   when a person it names is a member. A rule for Finance does not paint the
   Legal row. */
function reachesGroup(r: Rule, group: Group, directory: User[]): boolean {
  if (whoPasses(r.who, { id: '', groupId: group.id })) return true
  return (r.who?.userIds ?? []).some((id) => {
    const u = directory.find((x) => x.id === id)
    return !!u && u.groupId === group.id && whoPasses(r.who, u)
  })
}

function match(p: Policy, app: App, group: Group, directory: User[]): Cell | null {
  /* `enforces`, not `!== 'inactive'`: a draft decides nothing either. */
  if (!enforces(p)) return null
  /* `includes`, so one policy legitimately fills several columns of this grid.
     That used to be the argument AGAINST a list — a policy drawn three times
     looked like three decisions. It is one decision shown where it lands, and
     the grid is the surface that makes multi-app policies legible rather than
     the one they break. */
  if (!coversEveryApp(p) && !p.appIds.includes(app.id)) return null

  // Every rule that could apply, not just the first. Which one wins depends on
  // conditions evaluated at sign-in, so the honest static answer is the range —
  // and the number an admin acts on is the strictest thing that can happen.
  /* The audience test moved up: it is the POLICY that governs a group now, so
     a policy either covers this column or it does not, and every one of its
     rules covers it equally. Named individuals do not appear on this matrix at
     all — see the footnote the table renders under it. Within the policy, a
     rule's own Who narrows it again. */
  if (!p.audience.everyone && !p.audience.groupIds.includes(group.id)) return null
  const applicable = p.rules.filter((r) => r.enabled && reachesGroup(r, group, directory))
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

function resolve(policies: Policy[], app: App, group: Group, directory: User[]): Cell | null {
  for (const p of policies) {
    if (p.isSystem) continue
    const hit = match(p, app, group, directory)
    if (hit) return hit
  }
  for (const p of policies) {
    if (!p.isSystem) continue
    const hit = match(p, app, group, directory)
    if (hit) return hit
  }
  return null
}

/* The tooltip on a cell. The rule count lives here rather than in the cell,
   which carries the outcome only. */
function cellTitle(c: Cell | null) {
  if (!c) return 'No policy covers this pair. Click to create one.'
  if (c.fallback) return `Only the ${c.policy.name} covers this pair.`
  const rules = `${c.rules} rule${c.rules === 1 ? '' : 's'}`
  return `${c.policy.name}: ${rules} can apply. Strictest: ${c.rule.name}.`
}

export function Coverage({ onNew }: {
  /* Opening the naming form is the LIST's job, not this grid's.

     An uncovered cell used to navigate to a create SCREEN, which no longer
     exists — the form opens in place now, and the state that opens it lives on
     the screen that renders both this and the button. Passed down rather than
     duplicated here, so there is one form and one place it is opened from. */
  onNew: () => void
}) {
  const store = useBrand()
  const [flipped, setFlipped] = useState(false)
  const [hover, setHover] = useState<{ a: number; g: number } | null>(null)

  const grid = useMemo(() => {
    const rows = store.groups.map((g) => ({
      group: g,
      cells: store.apps.map((a) => resolve(store.policies, a, g, store.users)),
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
  }, [store.policies, store.apps, store.groups, store.users])

  const gaps = grid.total - grid.governed

  // Apps across and groups down, or the transpose. Same data either way; which
  // one reads better depends on whether you are auditing an app or a team.
  const colHeads = flipped ? store.groups.map((g) => g.name) : store.apps.map((a) => a.name)
  const rowHeads = flipped ? store.apps : store.groups

  const cellAt = (r: number, c: number) => (flipped ? grid.rows[c].cells[r] : grid.rows[r].cells[c])

  function open(cell: Cell | null) {
    if (cell) store.go({ name: 'board', policyId: cell.policy.id })
    else onNew()
  }

  /* A grid needs both axes. With no applications or no groups there is no pair
     to show, and an empty table would read as a glitch. */
  if (store.apps.length === 0 || store.groups.length === 0) {
    const noApps = store.apps.length === 0
    return (
      <EmptyState
        icon={noApps ? AppWindow : Users}
        title={noApps ? 'No applications yet' : 'No groups yet'}
        blurb={noApps ? 'Coverage shows each application against each group.' : 'Coverage shows each group against each application.'}
        action={
          noApps ? (
            <Button variant="secondary" onClick={() => store.go({ name: 'applications' })}>
              Go to applications
            </Button>
          ) : undefined
        }
      />
    )
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }}>
      <div className="bcov__stats">
        <Stat label="Pairs governed" value={grid.governed} of={grid.total} />
        <Stat label="MFA required" value={grid.mfa} tone="mfa" />
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
                        className={`bcov__cell ${!cell ? 'is-empty' : cell.fallback ? 'is-fallback' : ''}`}
                        onMouseEnter={() => setHover({ a: c, g: r })}
                        onMouseLeave={() => setHover(null)}
                        onClick={() => open(cell)}
                        title={cellTitle(cell)}
                        aria-label={cellTitle(cell)}
                      >
                        {!cell ? (
                          <Plus size={14} strokeWidth={2} aria-hidden />
                        ) : cell.fallback ? (
                          <span className="bcov__tag">Default</span>
                        ) : (
                          <DecisionChip decision={cell.decision} size="sm" />
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
          <span>
            <DecisionChip decision="1fa" size="sm" />
            <DecisionChip decision="2fa" size="sm" />
            <DecisionChip decision="deny" size="sm" />
          </span>
          <span>
            <span className="bcov__tag">Default</span>
            Default policy only
          </span>
          <span>
            <Plus size={14} strokeWidth={2} aria-hidden />
            No policy
          </span>
        </div>
        <p className="bcov__note">
          Each cell shows the strictest outcome a rule can give that pair. Draft and inactive
          policies and the default policy don't count as cover.
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
