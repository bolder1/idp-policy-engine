import { FALLBACK_NAME, type AccessDecision, type App, type Policy } from '../../data'
import { DECISION_WORDS } from '../../decision-words'
import { DENY_REASON_WORD, denyReasonOfRule, type DenyReason } from '../testing/deny-reason'
import { pastReport } from '../testing/test-dock'
import type { SignInFacts, SimEnv } from '../simulate'

/* -----------------------------------------------------------------------------
   Sign-in activity (the design repo's "investigate a failed sign-in"): the
   week's sign-ins across every application, each with its answer and, on a
   refusal, why — admin and help desk only (owner, 5 Oct 2026). The same
   modelled week as Past sign-ins (test-dock.ts `pastReport`), a sample and not
   a log, run against the tenant's policies as they stand. PURE.
   -------------------------------------------------------------------------- */

export type ActivityResult = 'allowed' | 'blocked' | 'unclear'

export interface ActivityRow {
  id: string
  /** "Mon 09:30". */
  when: string
  who: string
  appId: string
  app: string
  /** "Office network", "London, United Kingdom", or the address. */
  from: string
  facts: SignInFacts
  result: ActivityResult
  decision: AccessDecision | null
  policyName: string | null
  /** "Rule 2 · In the office", "Nothing else matched", or ''. */
  ruleLine: string
  /** Why it was refused; null unless it was. */
  reason: DenyReason | null
}

const EVERYONE = { everyone: true, groupIds: [] as string[], userIds: [] as string[] }

/** The week's sign-ins on `apps`, newest first within each application. */
export function signInActivity(policies: readonly Policy[], env: SimEnv, today: Date, apps: readonly Pick<App, 'id' | 'name'>[]): ActivityRow[] {
  const rows: ActivityRow[] = []
  for (const app of apps) {
    const report = pastReport({ id: '', appIds: [app.id], audience: EVERYONE }, policies, env, undefined, today, [app.id])
    for (const r of report.rows) {
      const res = r.today
      const decided = res.status === 'decided' && res.decision !== null
      const policy = res.decidedBy ? policies.find((p) => p.id === res.decidedBy!.policyId) : undefined
      const hit = res.trace?.hitIndex ?? null
      const rule = policy && hit !== null ? policy.rules[hit] : undefined
      const ruleLine = decided ? (rule && hit !== null ? `Rule ${hit + 1} · ${rule.name}` : FALLBACK_NAME) : ''
      const blocked = decided && res.decision === 'deny'
      rows.push({
        id: `${app.id}:${r.id}`,
        when: r.when,
        who: r.sample.personName,
        appId: app.id,
        app: r.sample.appName,
        from: r.from,
        facts: r.sample.facts,
        result: blocked ? 'blocked' : decided ? 'allowed' : 'unclear',
        decision: decided ? res.decision : null,
        policyName: res.decidedBy?.policyName ?? null,
        ruleLine,
        reason: blocked ? denyReasonOfRule(rule ?? { name: FALLBACK_NAME }) : null,
      })
    }
  }
  return rows
}

export interface ActivityFilter {
  q: string
  result: 'all' | ActivityResult
  reason: 'all' | DenyReason
  appId: 'all' | string
}

export const NO_FILTER: ActivityFilter = { q: '', result: 'all', reason: 'all', appId: 'all' }

/** The rows that pass every filter; `q` matches the person, application, place and policy. */
export function filterActivity(rows: readonly ActivityRow[], f: ActivityFilter): ActivityRow[] {
  const needle = f.q.trim().toLowerCase()
  return rows.filter(
    (r) =>
      (f.result === 'all' || r.result === f.result) &&
      (f.reason === 'all' || r.reason === f.reason) &&
      (f.appId === 'all' || r.appId === f.appId) &&
      (!needle || `${r.who} ${r.app} ${r.from} ${r.policyName ?? ''}`.toLowerCase().includes(needle)),
  )
}

/** The reasons present in the rows, the most common first: the filter's options, and nothing else. */
export function reasonsIn(rows: readonly ActivityRow[]): DenyReason[] {
  const n = new Map<DenyReason, number>()
  for (const r of rows) if (r.reason) n.set(r.reason, (n.get(r.reason) ?? 0) + 1)
  return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k)
}

/** Why the refusals were refused: each reason and how many rows it accounts for, most first. The reasons report. */
export function reasonCounts(rows: readonly ActivityRow[]): { reason: DenyReason; count: number }[] {
  const n = new Map<DenyReason, number>()
  for (const r of rows) if (r.reason) n.set(r.reason, (n.get(r.reason) ?? 0) + 1)
  return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([reason, count]) => ({ reason, count }))
}

/** One CSV field: quoted when it holds a comma, a quote or a line break. */
export const csvField = (v: string): string => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

const csvOf = (head: readonly string[], rows: readonly (readonly string[])[]): string => [head, ...rows].map((r) => r.map(csvField).join(',')).join('\r\n')

/** The sign-ins as a CSV, for the audit trail: what the table shows, plus the policy and rule. */
export function activityCsv(rows: readonly ActivityRow[]): string {
  return csvOf(
    ['When', 'Person', 'Application', 'From', 'Result', 'Reason', 'Policy', 'Rule'],
    rows.map((r) => [r.when, r.who, r.app, r.from, r.decision ? DECISION_WORDS[r.decision] : 'Can’t tell', r.reason ? DENY_REASON_WORD[r.reason] : '', r.policyName ?? '', r.ruleLine]),
  )
}

/** The change log as a CSV: who changed which policy, when, and what. */
export function changesCsv(entries: readonly { at: string; policyName: string; by: string; lines: readonly string[] }[]): string {
  return csvOf(['When', 'Policy', 'By', 'What changed'], entries.map((c) => [c.at, c.policyName, c.by, c.lines.join(' · ')]))
}

/** One sign-in as plain text, for a ticket. */
export function activitySummaryOf(r: ActivityRow): string {
  const out = [`Sign-in: ${r.who} → ${r.app} · ${r.when} · from ${r.from}`, `Answer: ${r.decision ? DECISION_WORDS[r.decision] : r.result === 'unclear' ? 'Can’t tell' : '—'}`]
  if (r.policyName) out.push(`Decided by: ${r.policyName}${r.ruleLine ? ` · ${r.ruleLine}` : ''}`)
  if (r.reason) out.push(`Reason: ${DENY_REASON_WORD[r.reason]}`)
  return out.join('\n')
}
