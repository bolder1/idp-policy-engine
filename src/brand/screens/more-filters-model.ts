import { memberGroupIds, type AccessDecision, type Policy, type User } from '../data'

/* -----------------------------------------------------------------------------
   MORE FILTERS (owner, 19 Nov 2026: "a Jira style more filter … later a general filter for all the pages, plan it
   for the policy list first"). One dropdown manages every attribute; what is applied shows as chips beside it, with
   Clear all. Status keeps its own picker ("own picker").

   The model is page-agnostic: a page lists its attributes and owns the matcher. All Policies is the first page.
   -------------------------------------------------------------------------- */

export type PolicyFilterKey = 'app' | 'person' | 'group' | 'outcome' | 'changed'

export interface PolicyFilters {
  app: string[]
  /** User ids: policies that apply to this person. */
  person: string[]
  group: string[]
  outcome: AccessDecision[]
  /** Days; '' is any time. */
  changed: '' | '7' | '30' | '90'
  /** The attributes read "is not" (≠) rather than "is" (=), compact More filters only (23 Nov 2026,
   *  `moreFiltersCompact`). Absent, every attribute is "is", as before. */
  not?: PolicyFilterKey[]
}

/** The operator marks, as Jira writes them. */
export const OP_MARK = { is: '=', not: '≠' } as const
export const OP_LABEL = { is: 'is', not: 'is not' } as const
export type FilterOp = keyof typeof OP_MARK

export const opOf = (f: PolicyFilters, k: PolicyFilterKey): FilterOp => (f.not?.includes(k) ? 'not' : 'is')

/** The same filters with one attribute's operator set. */
export function withOp(f: PolicyFilters, k: PolicyFilterKey, op: FilterOp): PolicyFilters {
  const rest = (f.not ?? []).filter((x) => x !== k)
  const not = op === 'not' ? [...rest, k] : rest
  return { ...f, not: not.length ? not : undefined }
}

export const NO_FILTERS: PolicyFilters = { app: [], person: [], group: [], outcome: [], changed: '' }

export const FILTER_LABEL: Record<PolicyFilterKey, string> = {
  app: 'Application',
  person: 'User or email',
  group: 'Group',
  outcome: 'Rule outcome',
  changed: 'Last changed',
}

export const FILTER_ORDER: PolicyFilterKey[] = ['app', 'person', 'group', 'outcome', 'changed']

export const OUTCOMES: { value: AccessDecision; label: string }[] = [
  { value: '1fa', label: 'Allow' },
  { value: '2fa', label: 'Two-step' },
  { value: 'deny', label: 'Deny' },
]

export const CHANGED: { value: PolicyFilters['changed']; label: string }[] = [
  { value: '', label: 'Any time' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
]

export const isSet = (f: PolicyFilters, k: PolicyFilterKey): boolean => (k === 'changed' ? f.changed !== '' : f[k].length > 0)
export const anySet = (f: PolicyFilters): boolean => FILTER_ORDER.some((k) => isSet(f, k))

export interface SummaryPart {
  key: PolicyFilterKey
  label: string
  mark: string
  names: string
}

/** What the compact chip says, attribute by attribute ("Application ≠ Slack, Jira"): two names each, then how many
    more. */
export function filterSummary(f: PolicyFilters, nameOf: (k: PolicyFilterKey, v: string) => string): SummaryPart[] {
  return FILTER_ORDER.filter((k) => isSet(f, k)).map((k) => {
    const all = (k === 'changed' ? [f.changed] : (f[k] as string[])).map((v) => nameOf(k, v))
    const names = all.length > 2 ? `${all.slice(0, 2).join(', ')} +${all.length - 2} more` : all.join(', ')
    return { key: k, label: FILTER_LABEL[k], mark: OP_MARK[opOf(f, k)], names }
  })
}

export const summaryText = (parts: readonly SummaryPart[]): string => parts.map((p) => `${p.label} ${p.mark} ${p.names}`).join(' and ')

/** The groups and people a policy speaks for: its audience and every rule's Who. */
function reach(p: Policy) {
  const groups = new Set(p.audience.groupIds)
  const users = new Set(p.audience.userIds)
  for (const r of p.rules) {
    r.who?.groupIds.forEach((g) => groups.add(g))
    r.who?.userIds.forEach((u) => users.add(u))
  }
  return { everyone: p.isSystem === true || p.audience.everyone, groups, users }
}

/** Every attribute that is set must match (AND); values inside one attribute are alternatives (OR). An attribute set
    to "is not" keeps exactly the policies its "is" would hide, so = and ≠ on the same values split the list in two. */
export function policyMatches(
  p: Policy,
  f: PolicyFilters,
  ctx: { users: readonly User[]; lastChanged: (p: Policy) => number | undefined; now: number },
): boolean {
  /* Whether the policy passes attribute k, given whether it is a hit for k's values. */
  const keeps = (k: PolicyFilterKey, hit: boolean) => hit !== (opOf(f, k) === 'not')
  if (f.app.length && !keeps('app', p.isSystem === true || p.appIds.some((id) => f.app.includes(id)))) return false
  if (f.group.length || f.person.length) {
    const r = reach(p)
    if (f.group.length && !keeps('group', r.everyone || f.group.some((g) => r.groups.has(g)))) return false
    if (f.person.length) {
      const hit =
        r.everyone ||
        f.person.some((id) => {
          if (r.users.has(id)) return true
          const u = ctx.users.find((x) => x.id === id)
          return !!u && memberGroupIds(u).some((g) => r.groups.has(g))
        })
      if (!keeps('person', hit)) return false
    }
  }
  if (f.outcome.length && !keeps('outcome', p.rules.some((r) => r.enabled && f.outcome.includes(r.decision)))) return false
  if (f.changed) {
    const at = ctx.lastChanged(p)
    if (!keeps('changed', at !== undefined && ctx.now - at <= Number(f.changed) * 86_400_000)) return false
  }
  return true
}
