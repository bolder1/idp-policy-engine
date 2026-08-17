import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState } from 'react'

import { ProposedPanel } from '../components/ProposedPanel'
import { AnimatedNumber, AppGlyph, Badge, Button, OutcomeChip, ProposedBadge } from '../components/ui'
import { enabledRestrictions, type App, type Group, type Policy } from '../engine/model'
import { summarizeShort } from '../engine/summarize'
import { useStore } from '../state/store'

/* -----------------------------------------------------------------------------
   Coverage — the landing view.

   A policy binds exactly one app to one group, so the honest shape of this data
   is a matrix, not a list. That single reframe gives three things a flat table
   cannot:

     - Gaps are visible by default. An empty cell is an app a group can reach
       with no policy governing it. Entra had to add a Coverage tab and a Gap
       Analyzer workbook to answer this question; here it is the default view.
     - Overlap is visible. A user in three groups lights up three cells for one
       app, which is exactly the situation the weight algorithm resolves.
     - Creating a policy is clicking an empty cell, which pre-answers both
       mandatory fields from where you clicked.
   -------------------------------------------------------------------------- */

function outcomeOf(policy: Policy): 'allow' | 'challenge' | 'deny' {
  if (!policy.adaptive.enabled) return 'allow'
  return policy.adaptive.action
}

export function Coverage() {
  const store = useStore()
  const { apps, groups, policies, go, createPolicy } = store
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [transposed, setTransposed] = useState(false)
  const [hover, setHover] = useState<{ app: string; group: string } | null>(null)

  const stats = useMemo(() => {
    const pairs = apps.length * groups.length
    const covered = policies.length
    const denies = policies.filter((p) => outcomeOf(p) === 'deny').length
    const challenges = policies.filter((p) => outcomeOf(p) === 'challenge').length
    const criticalUncovered = apps.filter(
      (a) => a.sensitivity === 'critical' && !policies.some((p) => p.appId === a.id),
    ).length
    // A critical app reachable by a group with no policy on that pair.
    const criticalGaps = apps
      .filter((a) => a.sensitivity === 'critical')
      .reduce(
        (n, a) => n + groups.filter((g) => !policies.some((p) => p.appId === a.id && p.groupId === g.id)).length,
        0,
      )
    return { pairs, covered, denies, challenges, criticalUncovered, criticalGaps }
  }, [apps, groups, policies])

  const rows = transposed ? groups : apps
  const cols = transposed ? apps : groups

  function cellFor(rowId: string, colId: string) {
    const appId = transposed ? colId : rowId
    const groupId = transposed ? rowId : colId
    return { appId, groupId, policy: store.policyFor(appId, groupId) }
  }

  function openCell(appId: string, groupId: string, existing?: Policy) {
    if (existing) {
      go({ name: 'builder', policyId: existing.id })
    } else {
      const draft = createPolicy(appId, groupId)
      go({ name: 'builder', policyId: draft.id })
    }
  }

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <h1 className="page__title">Policies</h1>
          <p className="page__sub">
            A policy binds one application to one user group. Every cell below is one of those
            pairs — filled means governed, empty means nothing is watching it.
          </p>
        </div>
        <div className="page__actions">
          <div className="viewswitch">
            <button
              type="button"
              className={view === 'grid' ? 'is-active' : ''}
              onClick={() => setView('grid')}
            >
              Coverage
            </button>
            <button
              type="button"
              className={view === 'list' ? 'is-active' : ''}
              onClick={() => setView('list')}
            >
              List
            </button>
          </div>
          <Button onClick={() => setTransposed((t) => !t)}>Flip axes</Button>
          <Button variant="primary" onClick={() => go({ name: 'simulate' })}>
            Simulate a sign-in
          </Button>
        </div>
      </header>

      <div className="statrow">
        <Stat label="Pairs governed" value={stats.covered} of={stats.pairs} />
        <Stat label="Challenge" value={stats.challenges} accent="challenge" />
        <Stat label="Deny" value={stats.denies} accent="deny" />
        <Stat
          label="Critical-app gaps"
          value={stats.criticalGaps}
          warn={stats.criticalGaps > 0}
          hint="Critical apps with no policy for a group that can reach them"
        />
      </div>

      <AnimatePresence mode="wait">
        {view === 'grid' ? (
          <motion.div
            key="grid"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
          >
            <div className="matrix-wrap">
              <table
                className="matrix"
                style={{ ['--cols' as string]: cols.length }}
                onMouseLeave={() => setHover(null)}
              >
                <thead>
                  <tr>
                    <th className="matrix__corner">
                      <span>{transposed ? 'Groups' : 'Apps'}</span>
                      <span className="matrix__corner-x">{transposed ? 'Apps' : 'Groups'}</span>
                    </th>
                    {cols.map((c) => (
                      <th
                        key={c.id}
                        className={`matrix__colhead ${
                          hover && (transposed ? hover.app : hover.group) === c.id ? 'is-lit' : ''
                        }`}
                      >
                        {transposed ? (
                          <span className="matrix__apphead">
                            <AppGlyph glyph={(c as App).glyph} tint={(c as App).tint} size={16} />
                            {c.name}
                          </span>
                        ) : (
                          <span className={(c as Group).isDefault ? 'is-default-group' : ''}>
                            {c.name}
                            {(c as Group).isDefault && <em title="Fallback group — outranked by every custom group">fallback</em>}
                          </span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, ri) => (
                    <tr
                      key={r.id}
                      className={
                        hover && (transposed ? hover.group : hover.app) === r.id ? 'is-lit' : ''
                      }
                    >
                      <th className="matrix__rowhead">
                        {transposed ? (
                          <span className={(r as Group).isDefault ? 'is-default-group' : ''}>
                            {r.name}
                            {(r as Group).isDefault && <em>fallback</em>}
                          </span>
                        ) : (
                          <span className="matrix__apphead">
                            <AppGlyph glyph={(r as App).glyph} tint={(r as App).tint} size={18} />
                            <span className="matrix__appname">
                              {r.name}
                              {(r as App).sensitivity !== 'standard' && (
                                <em className={`sens sens--${(r as App).sensitivity}`}>
                                  {(r as App).sensitivity}
                                </em>
                              )}
                            </span>
                          </span>
                        )}
                      </th>

                      {cols.map((c, ci) => {
                        const { appId, groupId, policy } = cellFor(r.id, c.id)
                        const idx = ri * cols.length + ci
                        const desc = policy
                          ? `${store.appById(appId).name} × ${store.groupById(groupId).name} — ${summarizeShort(policy, store.groupById(groupId))}`
                          : `${store.appById(appId).name} × ${store.groupById(groupId).name} — no policy. Create one.`
                        return (
                          <td key={c.id} className="matrix__td">
                            <motion.button
                              type="button"
                              className={`cell ${policy ? `cell--${outcomeOf(policy)}` : 'cell--empty'} ${
                                policy?.status === 'shadow' ? 'cell--shadow' : ''
                              } ${policy?.status === 'inactive' ? 'cell--inactive' : ''}`}
                              // Stagger only on first mount, capped — staggering on
                              // every re-render is the fastest way to make an admin
                              // console feel sluggish.
                              initial={{ opacity: 0, scale: 0.94 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{
                                delay: Math.min(idx, 8) * 0.02,
                                type: 'spring',
                                stiffness: 520,
                                damping: 34,
                              }}
                              onMouseEnter={() => setHover({ app: appId, group: groupId })}
                              onFocus={() => setHover({ app: appId, group: groupId })}
                              onClick={() => openCell(appId, groupId, policy)}
                              aria-label={desc}
                              title={
                                policy
                                  ? summarizeShort(policy, store.groupById(groupId))
                                  : `No policy — ${store.groupById(groupId).name} reaching ${store.appById(appId).name} is ungoverned`
                              }
                            >
                              {policy ? (
                                <>
                                  <motion.span
                                    layoutId={`outcome-${policy.id}`}
                                    className={`cell__dot cell__dot--${outcomeOf(policy)}`}
                                  />
                                  <span className="cell__meta">
                                    {policy.adaptive.enabled
                                      ? `${enabledRestrictions(policy.adaptive).length}c`
                                      : policy.mfa.enabled
                                        ? 'MFA'
                                        : '1FA'}
                                  </span>
                                </>
                              ) : (
                                <span className="cell__plus">+</span>
                              )}
                            </motion.button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="matrix-legend">
              <span><i className="cell__dot cell__dot--allow" /> Allow</span>
              <span><i className="cell__dot cell__dot--challenge" /> Challenge</span>
              <span><i className="cell__dot cell__dot--deny" /> Deny</span>
              <span className="matrix-legend__gap"><i /> No policy</span>
              <span className="matrix-legend__note">
                Cell label shows condition count, or the sign-in strength when no adaptive
                conditions are set.
              </span>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="list"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
          >
            <PolicyList />
          </motion.div>
        )}
      </AnimatePresence>

      <ProposedPanel />
    </div>
  )
}

function Stat({
  label,
  value,
  of,
  accent,
  warn,
  hint,
}: {
  label: string
  value: number
  of?: number
  accent?: 'challenge' | 'deny'
  warn?: boolean
  hint?: string
}) {
  return (
    <div className={`stat ${warn ? 'stat--warn' : ''}`} title={hint}>
      <span className="stat__label">{label}</span>
      <span className={`stat__value ${accent ? `stat__value--${accent}` : ''}`}>
        <AnimatedNumber value={value} />
        {of !== undefined && <em> / {of}</em>}
      </span>
    </div>
  )
}

function PolicyList() {
  const { policies, appById, groupById, go } = useStore()
  const sorted = [...policies].sort((a, b) => appById(a.appId).name.localeCompare(appById(b.appId).name))

  return (
    <table className="ptable">
      <thead>
        <tr>
          <th>Policy</th>
          <th>Application</th>
          <th>Group</th>
          <th>Sign-in</th>
          <th>Conditions</th>
          <th>Outcome</th>
          <th>Status</th>
          <th>Modified</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((p) => {
          const app = appById(p.appId)
          const group = groupById(p.groupId)
          const conditions = p.adaptive.enabled ? enabledRestrictions(p.adaptive) : []
          return (
            <tr key={p.id} onClick={() => go({ name: 'builder', policyId: p.id })}>
              <td className="ptable__name">{p.name}</td>
              <td>
                <span className="matrix__apphead">
                  <AppGlyph glyph={app.glyph} tint={app.tint} size={16} />
                  {app.name}
                </span>
              </td>
              <td>
                {group.name}
                {group.isDefault && <Badge>fallback</Badge>}
              </td>
              <td>{p.mfa.enabled ? 'Password + MFA' : p.firstFactor === 'magic-link' ? 'Magic Link' : 'Password'}</td>
              <td>
                {conditions.length === 0 ? (
                  <span className="muted">None</span>
                ) : (
                  <span>
                    {conditions.length} · joined by{' '}
                    <strong>{p.adaptive.conjunction === 'all' ? 'AND' : 'OR'}</strong>
                  </span>
                )}
              </td>
              <td><OutcomeChip action={outcomeOf(p)} size="sm" /></td>
              <td>
                {p.status === 'shadow' ? (
                  <ProposedBadge what="Shadow mode" />
                ) : (
                  <span className={`status status--${p.status}`}>{p.status}</span>
                )}
              </td>
              <td className="muted">{p.lastModified}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
