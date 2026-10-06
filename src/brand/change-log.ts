import type { Group, Policy, User } from './data'
import { describeChanges } from './screens/changes'

/* -----------------------------------------------------------------------------
   The change log: who changed which policy, when, and what (docs/specs/
   DENIAL-NEXT.md, P1 item 4 "What changed" and the audit stamp). The store
   writes one entry on every save that changes a policy beyond its stamp
   (`logChange`); Why reads the recent ones for the policy that refused
   (`recentChanges`), and Sign-in activity lists them all. The prototype has no
   history of its own, so a showcase tenant starts with a few seeded entries
   (`seedChangeLog`) — dummy data, and labelled as such where it is shown.
   PURE.
   -------------------------------------------------------------------------- */

export interface ChangeEntry {
  id: string
  policyId: string
  policyName: string
  /** ISO 8601. */
  at: string
  /** The account's name: "Jaspreet Toor". */
  by: string
  /** What changed, in the review dialog's words (`describeChanges`): "Added “Contractors away from the office”". */
  lines: string[]
}

const DAY = 86_400_000

let seq = 0
const nextId = () => `chg-${(seq += 1)}`

/** The log with an entry first for `after`'s changes from `before`, or the log as it was when nothing changed. */
export function logChange(
  log: readonly ChangeEntry[],
  before: Policy,
  after: Policy,
  by: string,
  at: Date,
  groups?: Group[],
  directory?: User[],
): ChangeEntry[] {
  const lines = describeChanges(before, after, groups, directory)
  if (before.status !== after.status) lines.push(statusLine(after.status))
  return lines.length === 0 ? [...log] : [{ id: nextId(), policyId: after.id, policyName: after.name, at: at.toISOString(), by, lines }, ...log]
}

const statusLine = (status: Policy['status']): string =>
  status === 'active' || status === 'always-on' ? 'Switched on' : status === 'inactive' ? 'Switched off' : status === 'monitor' ? 'Switched to monitoring' : 'Back to draft'

/** The changes to one policy within `days` of `now`, newest first, at most `max`. */
export function recentChanges(log: readonly ChangeEntry[], policyId: string, now: Date, days = 14, max = 2): ChangeEntry[] {
  const since = now.getTime() - days * DAY
  return log
    .filter((c) => c.policyId === policyId && new Date(c.at).getTime() >= since)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, max)
}

/** The showcase tenant's history, as it would read if people had been editing: dated back from `now`, names from the policies it finds. */
export function seedChangeLog(policies: readonly Policy[], now: Date, by = 'Jaspreet Toor'): ChangeEntry[] {
  const seeds: { policyId: string; daysAgo: number; lines: string[] }[] = [
    { policyId: 'sc-aws-engineering', daysAgo: 2, lines: ['Added “Contractors away from the office”', 'Moved it to the top of the policy'] },
    { policyId: 'sc-slack-engineering', daysAgo: 5, lines: ['Deny message changed on “Contractors need an office”'] },
    { policyId: 'sc-device-compliance', daysAgo: 9, lines: ['Switched on'] },
    { policyId: 'sc-dev-tools', daysAgo: 12, lines: ['Authentication settings changed on “Engineers on a compliant device”'] },
  ]
  return seeds.flatMap((s) => {
    const p = policies.find((x) => x.id === s.policyId)
    return p ? [{ id: nextId(), policyId: p.id, policyName: p.name, at: new Date(now.getTime() - s.daysAgo * DAY).toISOString(), by, lines: s.lines }] : []
  })
}
