import { coversEveryApp, memberGroupIds, type App, type Group, type Policy, type User } from '../data'
import { listNames } from '../rule-who'
import { alsoNamedIn, deciderForGroup, deciderForUser, groupsNamed, type AppStanding } from './app-standing'
import { STATUS_WORD } from './board/read-as-text'
import { directoryRows, type GroupFilter } from './sign-in-tests/library'
import { policiesUsing } from './usage'

/* -----------------------------------------------------------------------------
   The application page's Users and Groups tabs, and the user details drawer,
   as rows (spec 10 Oct 2026, §4 and §6).

   Pure, so what each row says, what the filters leave and how the sorts order
   them are pinned without drawing anything. Nothing here picks a policy: the
   Deciding policy is `deciderForUser` / `deciderForGroup` (app-standing.ts),
   the same pick Access checks makes, so a row and a check cannot disagree.

   "Named" is narrower than "covered". A policy for Everyone covers every
   person without naming any, so it is never in an "Also named in" tip — the
   tip would then sit on every row of every application with an Everyone
   policy and say nothing. A group or a person is named by a policy's audience,
   or by one of its rules (the Who, an exception, a Group condition, live or in
   a saved draft), which is `policiesUsing`'s reading (usage.ts).
   -------------------------------------------------------------------------- */

export interface Sort<K extends string> {
  key: K
  dir: 1 | -1
}

/** Does this policy name the group: in its audience, or in one of its rules. */
export function namesGroup(p: Policy, groupId: string): boolean {
  return p.audience.groupIds.includes(groupId) || policiesUsing('group', groupId, [p]).length > 0
}

/** Does it name this person: through one of their groups, or by name. */
export function namesUser(p: Policy, u: User): boolean {
  return memberGroupIds(u).some((g) => namesGroup(p, g)) || p.audience.userIds.includes(u.id) || policiesUsing('user', u.id, [p]).length > 0
}

/* The tip beside a Deciding policy: the app's other policies that name this
   person or group, each with its status, since a draft or a shadowed policy
   is exactly what an admin is looking for here. Null when there are none. */
export function alsoTip(also: readonly Policy[]): string | null {
  if (also.length === 0) return null
  return `Also named in ${listNames(
    also.map((p) => `${p.name} (${STATUS_WORD[p.status]})`),
    2,
  )}.`
}

/* A person's groups by name, "Engineering and Design". Read through
   `memberGroupIds`, never `groupById`, which falls back to the first group and
   so would name a group the person is not in; an id the directory no longer has
   reads "(deleted)". */
export function groupNamesOf(u: Pick<User, 'groupId' | 'alsoGroupIds'>, groups: readonly Pick<Group, 'id' | 'name'>[]): string[] {
  return memberGroupIds(u).map((id) => groups.find((g) => g.id === id)?.name ?? '(deleted)')
}

// --- Users ---------------------------------------------------------------------------

export interface AppUserRow {
  user: User
  /** "Engineering and Design", or "—" for nobody's group. */
  groups: string
  decider: Policy | null
  /** The app's other policies naming them, in list order. */
  also: Policy[]
}

/* Every person in the directory on this application — a person no policy on
   it names is still listed, with the policy that decides for them (the tenant
   default, most often): the tab answers "who signs in here, and under what",
   and everyone does. In the directory's order. */
export function appUserRows(appId: string, policies: readonly Policy[], users: readonly User[], groups: readonly Group[]): AppUserRow[] {
  return users.map((user) => {
    const decider = deciderForUser(policies, appId, user)
    const names = groupNamesOf(user, groups)
    return {
      user,
      groups: names.length === 0 ? '—' : listNames(names, 2),
      decider,
      also: alsoNamedIn(appId, policies, decider, (p) => namesUser(p, user)),
    }
  })
}

/** The Policy filter's value for the people nothing decides for (a tenant without a default). Not a policy id. */
export const NO_POLICY = '(none)'

export type PolicyFilter = 'all' | string

/* The Policy filter: All, then the policies that decide for somebody here — in
   the order the Policies tab numbers them — then the tenant default when it
   decides for somebody. A policy that decides for nobody in the directory is
   not a choice: picking it could only ever empty the table (the same reason
   library.ts `appFilterOptions` leaves one out). Read from every row, not the
   searched ones, so the choices hold still while somebody types. */
export function policyFilterOptions(standing: Pick<AppStanding, 'rows'>, rows: readonly Pick<AppUserRow, 'decider'>[]): { value: PolicyFilter; label: string }[] {
  const used = new Map<string, Policy>()
  let none = false
  for (const r of rows) {
    if (r.decider) used.set(r.decider.id, r.decider)
    else none = true
  }
  const ranked = standing.rows.filter((s) => used.has(s.policy.id)).map((s) => s.policy)
  const rest = [...used.values()].filter((p) => !ranked.some((r) => r.id === p.id))
  return [
    { value: 'all', label: 'All' },
    ...[...ranked, ...rest].map((p) => ({ value: p.id, label: p.name })),
    ...(none ? [{ value: NO_POLICY, label: 'No policy' }] : []),
  ]
}

export interface UserFilter {
  query: string
  group: GroupFilter
  policy: PolicyFilter
}

/* The rows a search and the two filters leave. The search and the group are
   the People table's own (library.ts `directoryRows`: name, groups and email),
   so the same words find the same people on both pages. */
export function filterUserRows(rows: readonly AppUserRow[], groups: readonly Pick<Group, 'id' | 'name'>[], f: UserFilter): AppUserRow[] {
  const kept = new Set(
    directoryRows(
      rows.map((r) => r.user),
      groups,
      f.query,
      f.group,
    ).map((r) => r.person.id),
  )
  return rows.filter(
    (r) => kept.has(r.user.id) && (f.policy === 'all' || (f.policy === NO_POLICY ? r.decider === null : r.decider?.id === f.policy)),
  )
}

export type UserSortKey = 'user' | 'groups' | 'policy'

/** By email (the User column's link), else by the column, then by email. */
export function sortUserRows(rows: readonly AppUserRow[], sort: Sort<UserSortKey>): AppUserRow[] {
  const byEmail = (a: AppUserRow, b: AppUserRow) => a.user.email.localeCompare(b.user.email)
  const cmp: Record<UserSortKey, (a: AppUserRow, b: AppUserRow) => number> = {
    user: byEmail,
    groups: (a, b) => a.groups.localeCompare(b.groups) || byEmail(a, b),
    policy: (a, b) => (a.decider?.name ?? '').localeCompare(b.decider?.name ?? '') || byEmail(a, b),
  }
  return [...rows].sort((a, b) => cmp[sort.key](a, b) * sort.dir)
}

/* A group the route filters by that the Group filter does not offer — one with
   nobody in it, or one since deleted — is offered anyway, so the closed filter
   still says what it is narrowing to. */
export function withGroupOption(
  options: { value: GroupFilter; label: string }[],
  group: GroupFilter,
  groups: readonly Pick<Group, 'id' | 'name'>[],
): { value: GroupFilter; label: string }[] {
  if (group === 'all' || options.some((o) => o.value === group)) return options
  return [...options, { value: group, label: groups.find((g) => g.id === group)?.name ?? '(deleted)' }]
}

// --- Groups ----------------------------------------------------------------------------

export interface AppGroupRow {
  /** Null for the Everyone row: the DEFAULT group, which every person is in. */
  id: string | null
  name: string
  /** False for an id a policy names that the directory no longer has. */
  known: boolean
  /** Directory members (`memberGroupIds`), not the stated `memberCount` the Who picker shows. */
  users: number
  decider: Policy | null
  also: Policy[]
}

/* Everyone first — the live DEFAULT group, with what decides for somebody no
   group policy here names — then every group the app's policies name, by name.
   Everyone is a row inside the paged data rather than a note above it, so the
   pager's count is the rows it pages. */
export function appGroupRows(appId: string, policies: readonly Policy[], users: readonly User[], groups: readonly Group[]): AppGroupRow[] {
  const named = groupsNamed(appId, policies)
    .map((id): AppGroupRow => {
      const g = groups.find((x) => x.id === id)
      const decider = deciderForGroup(policies, appId, id)
      return {
        id,
        name: g?.name ?? '(deleted)',
        known: !!g,
        users: users.filter((u) => memberGroupIds(u).includes(id)).length,
        decider,
        also: alsoNamedIn(appId, policies, decider, (p) => namesGroup(p, id)),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
  const everyone: AppGroupRow = { id: null, name: 'Everyone', known: true, users: users.length, decider: deciderForGroup(policies, appId, null), also: [] }
  return [everyone, ...named]
}

/** By name; Everyone is kept while the search is empty or matches "everyone". */
export function searchGroupRows(rows: readonly AppGroupRow[], query: string): AppGroupRow[] {
  const q = query.trim().toLowerCase()
  return q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : [...rows]
}

export type GroupSortKey = 'group' | 'users'

/** Everyone stays first whichever way the rest are sorted. */
export function sortGroupRows(rows: readonly AppGroupRow[], sort: Sort<GroupSortKey>): AppGroupRow[] {
  const byName = (a: AppGroupRow, b: AppGroupRow) => a.name.localeCompare(b.name)
  const cmp: Record<GroupSortKey, (a: AppGroupRow, b: AppGroupRow) => number> = {
    group: byName,
    users: (a, b) => a.users - b.users || byName(a, b),
  }
  return [...rows.filter((r) => r.id === null), ...rows.filter((r) => r.id !== null).sort((a, b) => cmp[sort.key](a, b) * sort.dir)]
}

// --- One person, every application -------------------------------------------------------

export interface UserApps {
  /** The applications where a policy of the tenant's own decides for them, in catalogue order. */
  own: { app: App; policy: Policy }[]
  /** The tenant default, which decides everywhere else. */
  fallback: Policy | null
}

/* What the user drawer lists: each application whose decider for this person
   is not the tenant default, then one line for the rest. The default is not
   listed per application — on most it is, and a list of twelve rows saying the
   same policy hides the two that differ. */
export function userApps(user: User, apps: readonly App[], policies: readonly Policy[]): UserApps {
  const own = apps.flatMap((app) => {
    const policy = deciderForUser(policies, app.id, user)
    return policy && !policy.isSystem ? [{ app, policy }] : []
  })
  return { own, fallback: policies.find(coversEveryApp) ?? null }
}
