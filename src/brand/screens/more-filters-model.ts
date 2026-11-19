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

/** Every attribute that is set must match (AND); values inside one attribute are alternatives (OR). */
export function policyMatches(
  p: Policy,
  f: PolicyFilters,
  ctx: { users: readonly User[]; lastChanged: (p: Policy) => number | undefined; now: number },
): boolean {
  if (f.app.length && !p.isSystem && !p.appIds.some((id) => f.app.includes(id))) return false
  if (f.group.length || f.person.length) {
    const r = reach(p)
    if (f.group.length && !r.everyone && !f.group.some((g) => r.groups.has(g))) return false
    if (f.person.length && !r.everyone) {
      const hit = f.person.some((id) => {
        if (r.users.has(id)) return true
        const u = ctx.users.find((x) => x.id === id)
        return !!u && memberGroupIds(u).some((g) => r.groups.has(g))
      })
      if (!hit) return false
    }
  }
  if (f.outcome.length && !p.rules.some((r) => r.enabled && f.outcome.includes(r.decision))) return false
  if (f.changed) {
    const at = ctx.lastChanged(p)
    if (at === undefined || ctx.now - at > Number(f.changed) * 86_400_000) return false
  }
  return true
}
