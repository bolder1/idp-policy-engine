import { motion, useReducedMotion } from 'motion/react'
import { useMemo, useState } from 'react'
import { Download, ScrollText } from 'lucide-react'

import { Button, Chip, DecisionChip, Modal } from '../kit'
import { FALLBACK_NAME, appsOf, type AccessDecision, type Policy, type Rule } from '../data'
import { EmptyState, NoMatches } from '../empty'
import { ruleLabel } from './predicate-prose'
import { whoPasses } from '../rule-who'
import { useBrand } from '../store'
import { AppLogo } from '../logos/AppLogo'
import { SIM_USERS } from './simulate'
import './builder-test.css'

/* -----------------------------------------------------------------------------
   The decision log: "what has this policy been doing while I wasn't watching".
   (The "what would this do to a named person" test dialog that shared this file
   had no caller and was removed on 16 Sep 2026; the board's Check tab answers
   that question now.)

   v0 shipped both as shape without substance — the test drawer's matcher was
   four hardcoded lines that ignored the rule's own conditions, and the log was
   six fixed rows that had nothing to do with the policy you were looking at.
   Both are recreated here and then actually run: the test walks the real rule
   list against a real context and names the condition that stopped each rule,
   and the log is generated from the policy's own rule names so the two screens
   cannot contradict each other.

   The honest limit, stated in the UI rather than buried here: the map from a
   context option to a condition value is a fixed table in this prototype, not
   the engine. The ORDER of evaluation, the first-match-wins stop, and the
   decision that results are all real.
   -------------------------------------------------------------------------- */

// --- The simulated world, the evaluator and the trace all live in simulate.ts,
// so this dialog, the Gauntlet and the Impact arena cannot disagree about what a
// policy would do. Everything below is presentation over that one result.

// --- Decision log ------------------------------------------------------------

/* The words DecisionChip prints, so a filter and the chips in the rows agree. */
type LogDecision = 'Allow' | 'Deny' | 'MFA'

const DECISION_OF: Record<AccessDecision, LogDecision> = { deny: 'Deny', '2fa': 'MFA', '1fa': 'Allow' }

interface LogRow {
  id: string
  hoursAgo: number
  time: string
  user: string
  appId: string
  appName: string
  matchedRule: string
  outcome: AccessDecision
  decision: LogDecision
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/* Seeded from the policy id so the log is stable across renders and across
   re-opens. A log that reshuffles every time you open it is a log nobody can
   point at in a review. */
function seeded(seed: string) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return () => {
    h ^= h << 13
    h ^= h >>> 17
    h ^= h << 5
    return ((h >>> 0) % 100000) / 100000
  }
}

function buildLog(policy: Policy, appPool: { id: string; name: string }[]): LogRow[] {
  const rnd = seeded(policy.id)
  const now = Date.now()
  const live = policy.rules.filter((r) => r.enabled)
  /* Two nulls in the pool are the fall-through cases. Cycling rather than
     sampling guarantees every rule name in the policy shows up at least once,
     which is the point — the log has to be readable as evidence about THIS
     policy. */
  const pool: (Rule | null)[] = [...live, null, null]

  const rows: LogRow[] = []
  for (let i = 0; i < 16; i++) {
    const rule = pool[i % pool.length]
    /* A fall-through row is decided by the policy's own last rule, under its
       one name — not an invented "Default rule" that always allows. */
    const outcome = rule ? rule.decision : (policy.fallback?.decision ?? '1fa')
    /* Somebody the rule is for. A contractors-only rule matched for Priya in
       Finance is a row the engine could never write. */
    const admitted = rule ? SIM_USERS.filter((u) => whoPasses(rule.who, u)) : SIM_USERS
    const people = admitted.length > 0 ? admitted : SIM_USERS
    const person = people[Math.floor(rnd() * people.length)]
    const app = appPool[Math.floor(rnd() * appPool.length)]
    // Ten inside the day, six spread across the rest of the week, so the range
    // filter changes the count instead of decorating the toolbar.
    const hoursAgo = i < 10 ? rnd() * 23 : 24 + rnd() * 140
    const at = new Date(now - hoursAgo * 3600000)
    const hhmmss = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}:${String(at.getSeconds()).padStart(2, '0')}`

    rows.push({
      id: `${policy.id}-${i}`,
      hoursAgo,
      time: hoursAgo < 24 ? hhmmss : `${WEEKDAYS[at.getDay()]} ${hhmmss.slice(0, 5)}`,
      user: person.email,
      appId: app.id,
      appName: app.name,
      matchedRule: rule ? ruleLabel(rule) : FALLBACK_NAME,
      outcome,
      decision: DECISION_OF[outcome],
    })
  }

  return rows.sort((a, b) => a.hoursAgo - b.hoursAgo)
}

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

export function DecisionLogDialog({
  open,
  policy,
  onClose,
}: {
  open: boolean
  policy: Policy
  onClose: () => void
}) {
  const store = useBrand()
  const reduce = useReducedMotion()
  const [decision, setDecision] = useState<'all' | LogDecision>('all')
  const [range, setRange] = useState<'24h' | '7d'>('24h')

  const appPool = useMemo(() => {
    const named = policy.isSystem ? store.apps : appsOf(policy, store.apps)
    return named.length > 0 ? named : store.apps.slice(0, 3)
  }, [policy, store])

  /* A draft has never been published, and an inactive policy decides nothing,
     so neither has evaluated a sign-in. The log says so rather than inventing
     a day of them. A tenant with no applications has had no sign-ins either,
     and there is no app to put on a row. */
  const quiet = policy.status === 'draft' || policy.status === 'inactive' || appPool.length === 0
  const quietLine =
    policy.status === 'draft'
      ? 'This policy is a draft.'
      : policy.status === 'inactive'
        ? 'This policy is turned off.'
        : 'No applications use this policy yet.'

  const all = useMemo(() => (quiet ? [] : buildLog(policy, appPool)), [quiet, policy, appPool])

  const rows = all.filter(
    (r) => r.hoursAgo < (range === '24h' ? 24 : 168) && (decision === 'all' || r.decision === decision),
  )

  function exportCsv() {
    const header = ['Time', 'User', 'App', 'Matched rule', 'Decision']
    const body = rows.map((r) => [r.time, r.user, r.appName, r.matchedRule, r.decision])
    const csv = [header, ...body].map((line) => line.map(csvCell).join(',')).join('\r\n')

    const slug = policy.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${slug}-decision-log-${range}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    // Revoking in the same tick cancels the save while it is still in flight in
    // Firefox and Safari — the object URL has to outlive the click.
    window.setTimeout(() => URL.revokeObjectURL(url), 2000)
    store.showToast(`Exported ${rows.length} evaluation${rows.length === 1 ? '' : 's'}`)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Decision log"
      width={980}
      footer={
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      }
    >
      {quiet ? (
        <EmptyState
          compact
          icon={ScrollText}
          title="No logins yet"
          blurb={quietLine}
        />
      ) : (
      <div className="bdl">
        <div className="bdl__bar">
          <div className="bdl__seg" role="tablist" aria-label="Filter by decision">
            {(['all', 'Allow', 'Deny', 'MFA'] as const).map((d) => (
              <button
                key={d}
                type="button"
                role="tab"
                aria-selected={decision === d}
                className={`bdl__segbtn ${decision === d ? 'is-on' : ''}`}
                onClick={() => setDecision(d)}
              >
                {decision === d && !reduce && (
                  <motion.span
                    layoutId="bdl-seg"
                    className="bdl__segbg"
                    transition={{ type: 'spring', stiffness: 600, damping: 44 }}
                  />
                )}
                <span className="bdl__seglabel">
                  {d === 'all' ? 'All decisions' : d}
                </span>
              </button>
            ))}
          </div>

          <div className="bdl__range">
            <Chip active={range === '24h'} onClick={() => setRange('24h')}>
              Last 24h
            </Chip>
            <Chip active={range === '7d'} onClick={() => setRange('7d')}>
              Last 7 days
            </Chip>
          </div>

          <div className="bdl__export">
            <Button variant="neutral" size="sm" disabled={rows.length === 0} onClick={exportCsv}>
              <Download size={13} strokeWidth={2} aria-hidden /> Export CSV
            </Button>
          </div>
        </div>

        {/* No "Showing N evaluations" line: the rows are the count. */}
        {rows.length === 0 ? (
          <NoMatches
            noun="evaluations"
            filtered
            compact
            onClear={() => {
              setDecision('all')
              setRange('7d')
            }}
          />
        ) : (
        <div className="bdl__scroll">
          <table className="bdl__table">
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">User</th>
                <th scope="col">App</th>
                <th scope="col">Matched rule</th>
                <th scope="col">Decision</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <motion.tr
                  key={r.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: reduce ? 0 : 0.16, delay: reduce ? 0 : Math.min(i * 0.012, 0.12) }}
                >
                  <td className="bdl__time u-mono">{r.time}</td>
                  <td className="bdl__user">{r.user}</td>
                  <td>
                    <span className="bdl__app">
                      <AppLogo appId={r.appId} name={r.appName} size={16} />
                      {r.appName}
                    </span>
                  </td>
                  <td className="bdl__rule">{r.matchedRule}</td>
                  <td>
                    <DecisionChip decision={r.outcome} size="sm" />
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </div>
      )}
    </Modal>
  )
}
