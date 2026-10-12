import { coversEveryApp, enforces, memberGroupIds, type App, type Group, type Policy, type User } from '../data'
import { leaves } from '../predicate'
import { listNames } from '../rule-who'
import { policiesForApp, whyNotDeciding } from './app-policies'
import { deciderFor, tierOf, type Member } from './tenant-resolver'
import { policiesUsing } from './usage'

/* -----------------------------------------------------------------------------
   Where each policy on an application stands, read from the engine.

   The application page numbers its policies, says which never decide, and
   names the policy deciding for each person and group. Every one of those
   answers is `deciderFor` (tenant-resolver.ts) asked about a group, a person or
   everyone else — the same pick `governingPolicy` makes for a sign-in, so the
   page and Access checks cannot disagree about who decides. app-standing.test.ts
   pins the two together on the showcase tenant.

   It replaces app-people.ts, which read the audiences on their own and so
   called a policy "live" that the tiers had already shadowed: "AWS production
   for DevOps" is active and decides for nobody, because "AWS for engineering
   teams" names DevOps too and is higher in the list.
   -------------------------------------------------------------------------- */

/** Can decide a sign-in at all: on, and an app access policy. */
export const engineDecides = (p: Policy) => enforces(p) && p.type === 'App Access'

/* `decides`  the engine picks it for at least one of the groups, people or
              everyone it names
   `never`    on, and shadowed for every one of them
   the rest   why it is not in the race: its status, or its type */
export type RowState = 'decides' | 'never' | 'draft' | 'inactive' | 'monitor' | 'not-app-access'

/** Who a row is about: everyone else, one group, or one named person. */
export type Key = { kind: 'everyone' } | { kind: 'group'; id: string } | { kind: 'user'; id: string }

export interface StandRow {
  policy: Policy
  /** `groups` for a policy bound to groups or people, `everyone` for the DEFAULT group. */
  band: 'groups' | 'everyone'
  /** Earned: 1, 2, 3… over the rows that decide, in display order; null for the rest. */
  n: number | null
  state: RowState
  /** The keys this policy names whose decider is another policy. Empty unless it is on. */
  lostTo: { key: Key; to: Policy }[]
}

export interface AppStanding {
  /** The policies on the application: the groups band, then the everyone band, each in store order. */
  rows: StandRow[]
  /** The tenant default, found by `coversEveryApp`. */
  fallback: Policy | null
  /** What decides for somebody no policy on the app names. */
  everyoneElse: Policy | null
}

/* The stand-ins `deciderFor` reads. A group is a person whose only group is
   that one; everyone else is a person in no group at all. `memberGroupIds`
   reads '' as no group (data.ts). */
const EVERYONE_ELSE: Member = { id: '', groupId: '' }

/* A key as the person `deciderFor` asks about. A named person missing from the
   directory has no groups to resolve through, so they are not asked about. */
function memberOf(key: Key, users: readonly User[]): Member | null {
  if (key.kind === 'everyone') return EVERYONE_ELSE
  if (key.kind === 'group') return { id: '', groupId: key.id }
  return users.find((u) => u.id === key.id) ?? null
}

/* Who a live row names: its audience's groups and the directory people in it,
   or everyone for a DEFAULT-group policy. */
function keysOf(p: Policy, users: readonly User[]): Key[] {
  if (tierOf(p) !== 'custom') return [{ kind: 'everyone' }]
  return [
    ...p.audience.groupIds.map((id): Key => ({ kind: 'group', id })),
    ...p.audience.userIds.filter((id) => users.some((u) => u.id === id)).map((id): Key => ({ kind: 'user', id })),
  ]
}

/* Why a row is out of the race before anybody is asked about, or null when it
   is in it. The type first: a Session policy decides no sign-in whatever its
   status says. */
function offState(p: Policy): RowState | null {
  if (p.type !== 'App Access') return 'not-app-access'
  if (p.status === 'draft') return 'draft'
  if (p.status === 'inactive') return 'inactive'
  if (p.status === 'monitor') return 'monitor'
  return null
}

export function appStanding(appId: string, policies: readonly Policy[], users: readonly User[]): AppStanding {
  const own = policiesForApp(appId, policies)
  /* The documented tier, not the list: a policy for a group beats a policy for
     everyone wherever it sits, so the groups band reads first. */
  const ordered = [...own.filter((p) => tierOf(p) === 'custom'), ...own.filter((p) => tierOf(p) !== 'custom')]
  let n = 0
  const rows = ordered.map((p): StandRow => {
    const band = tierOf(p) === 'custom' ? 'groups' : 'everyone'
    const off = offState(p)
    if (off) return { policy: p, band, n: null, state: off, lostTo: [] }
    let decides = false
    const lostTo: StandRow['lostTo'] = []
    for (const key of keysOf(p, users)) {
      const m = memberOf(key, users)
      const d = m && deciderFor(policies, appId, m)
      if (d?.id === p.id) decides = true
      else if (d) lostTo.push({ key, to: d })
    }
    /* A live policy with no rules still decides, by its last row. */
    return { policy: p, band, n: decides ? ++n : null, state: decides ? 'decides' : 'never', lostTo }
  })
  return { rows, fallback: policies.find(coversEveryApp) ?? null, everyoneElse: deciderForGroup(policies, appId, null) }
}

/** The decider for a group's members on this app; `null` for everyone else. */
export function deciderForGroup(policies: readonly Policy[], appId: string, groupId: string | null): Policy | null {
  return deciderFor(policies, appId, groupId ? { id: '', groupId } : EVERYONE_ELSE)
}

/** The decider for one directory person on this app, through every group they are in. */
export function deciderForUser(policies: readonly Policy[], appId: string, user: User): Policy | null {
  return deciderFor(policies, appId, user)
}

export type Move = { key: Key; from: Policy | null; to: Policy | null }

const sameMove = (a: Pick<Move, 'from' | 'to'>, b: Pick<Move, 'from' | 'to'>) => a.from?.id === b.from?.id && a.to?.id === b.to?.id

/* Who moves, and to which policy, when the list changes from `before` to
   `after` on this application. Asked of everyone else, every group, and the
   people the app's policies name in either list; only the keys whose decider
   is a different policy come back. By id, so a policy saved with a field
   changed is still the same decider.

   Then every directory person, because a person in two groups is not either
   group's stand-in: take "Box for engineering" off Box and Engineering goes to
   the Global Default, but Tanmay Joshi, in Design too, goes to "Box for
   design". A person comes back only when no row already says their move —
   none of their groups' rows, or Everyone's for a person whose groups are not
   asked about — so somebody in one group never repeats that group's row. */
export function deciderChanges(
  appId: string,
  before: readonly Policy[],
  after: readonly Policy[],
  users: readonly User[],
  groups: readonly Group[],
): Move[] {
  const named: string[] = []
  for (const p of [...policiesForApp(appId, before), ...policiesForApp(appId, after)]) {
    for (const id of p.audience.userIds) if (!named.includes(id)) named.push(id)
  }
  const keys: Key[] = [
    { kind: 'everyone' },
    ...groups.map((g): Key => ({ kind: 'group', id: g.id })),
    ...named.filter((id) => users.some((u) => u.id === id)).map((id): Key => ({ kind: 'user', id })),
  ]
  const out: Move[] = []
  for (const key of keys) {
    const m = memberOf(key, users)
    if (!m) continue
    const from = deciderFor(before, appId, m)
    const to = deciderFor(after, appId, m)
    if (from?.id !== to?.id) out.push({ key, from, to })
  }
  const asked = new Set(groups.map((g) => g.id))
  for (const u of users) {
    if (named.includes(u.id)) continue
    const move = { from: deciderFor(before, appId, u), to: deciderFor(after, appId, u) }
    if (move.from?.id === move.to?.id) continue
    const mine = memberGroupIds(u).filter((id) => asked.has(id))
    const said = out.some(
      (m) => sameMove(m, move) && (mine.length === 0 ? m.key.kind === 'everyone' : m.key.kind === 'group' && mine.includes(m.key.id)),
    )
    if (!said) out.push({ key: { kind: 'user', id: u.id }, ...move })
  }
  return out
}

/* The moves a dialog lists. A group no policy on the app names — in either
   list — is decided exactly as everyone else is, so its row repeats the
   Everyone row word for word: take "Slack for everyone" off Slack and eight
   groups would each say "→ Global Default Policy". Those rows go; a group the
   app's Groups tab lists (`groupsNamed`) keeps its row, so the two agree.
   Pass the list after the change too when it can name a group the list
   before does not, as an add can. */
export function visibleMoves(changes: readonly Move[], appId: string, before: readonly Policy[], after: readonly Policy[] = []): Move[] {
  const everyone = changes.find((m) => m.key.kind === 'everyone')
  if (!everyone) return [...changes]
  const named = new Set([...groupsNamed(appId, before), ...groupsNamed(appId, after)])
  return changes.filter((m) => m.key.kind !== 'group' || named.has(m.key.id) || !sameMove(m, everyone))
}

/* The policies a policy takes sign-ins from: the `from` of every move to it,
   once each, in the order the moves come — people in two groups included, so
   "takes over from" names a policy only such a person leaves. */
export function takenFrom(changes: readonly Move[], policyId: string): Policy[] {
  const out: Policy[] = []
  for (const c of changes) if (c.to?.id === policyId && c.from && !out.some((p) => p.id === c.from!.id)) out.push(c.from)
  return out
}

/* Every group the app's policies name: their audiences, then any group a rule
   names — in its Who, its exceptions included, or in a Group condition — live
   or in a saved draft. The rule half is `policiesUsing`'s reading of a group
   (usage.ts), asked of the ids the rules hold, so the Groups tab lists exactly
   the groups a delete of that group would report. In first-seen order; an id
   no longer in the directory is kept, for the caller to name "(deleted)". */
export function groupsNamed(appId: string, policies: readonly Policy[]): string[] {
  const own = policiesForApp(appId, policies)
  const out: string[] = []
  const add = (id: string) => {
    if (id && !out.includes(id)) out.push(id)
  }
  for (const p of own) p.audience.groupIds.forEach(add)
  const held: string[] = []
  for (const p of own) {
    for (const r of [...p.rules, ...(p.pendingDraft?.rules ?? [])]) {
      held.push(...(r.who?.groupIds ?? []), ...(r.who?.exceptGroupIds ?? []))
      for (const c of leaves(r.when)) if (c.typeId === 'group') held.push(...c.values)
    }
  }
  for (const id of held) if (!out.includes(id) && policiesUsing('group', id, own).length > 0) add(id)
  return out
}

/** The applications whose policies name this group, in catalogue order. */
export function appsNaming(groupId: string, apps: readonly App[], policies: readonly Policy[]): App[] {
  return apps.filter((a) => groupsNamed(a.id, policies).includes(groupId))
}

/* The applications where somebody's sign-in can change when the directory goes
   from `before` to `after` — what assigning people to a group, or taking them
   out, changes. Only the people whose groups changed are asked about.

   Two ways it changes. Their decider moves; or it stays, and one of its
   enabled rules names a group they joined or left — in its Who, its
   exceptions, or a Group condition (`policiesUsing`, usage.ts, the reading
   `groupsNamed` uses). Take Leo Fernandes out of Contractors and "Slack for
   engineering and contractors" still decides for him, but its "Engineers,
   where we operate" rule excepts Contractors: he goes from a device check and
   an OTP to a password. A saved draft's rules do not count: they run on no
   sign-in. */
export function appsChangedByMembership(
  apps: readonly App[],
  policies: readonly Policy[],
  before: readonly User[],
  after: readonly User[],
): App[] {
  const moved: { b: User; a: User; changed: string[] }[] = []
  for (const a of after) {
    const b = before.find((u) => u.id === a.id)
    if (!b) continue
    const was = memberGroupIds(b)
    const now = memberGroupIds(a)
    const changed = [...was.filter((id) => !now.includes(id)), ...now.filter((id) => !was.includes(id))]
    if (changed.length > 0) moved.push({ b, a, changed })
  }
  if (moved.length === 0) return []
  return apps.filter((app) =>
    moved.some(({ b, a, changed }) => {
      const from = deciderFor(policies, app.id, b)
      const to = deciderFor(policies, app.id, a)
      if (from?.id !== to?.id) return true
      return !!from && changed.some((id) => rulesName(from, id))
    }),
  )
}

/* Whether an enabled live rule of this policy names the group. */
const rulesName = (p: Policy, groupId: string) =>
  policiesUsing('group', groupId, [p]).some((use) => !use.draft && use.rules.some((r) => r.enabled))

/** The app's other policies `covers` says name this person or group: everything but the decider, any status. */
export function alsoNamedIn(appId: string, policies: readonly Policy[], decider: Policy | null, covers: (p: Policy) => boolean): Policy[] {
  return policiesForApp(appId, policies).filter((p) => p.id !== decider?.id && covers(p))
}

/** A key by name: "Everyone", a group's or a person's, or "(deleted)". */
export function keyName(key: Key, groups: readonly Group[], users: readonly User[]): string {
  if (key.kind === 'everyone') return 'Everyone'
  const found = key.kind === 'group' ? groups.find((g) => g.id === key.id) : users.find((u) => u.id === key.id)
  return found?.name ?? '(deleted)'
}

/* The tip beside a row's name, or null when the row needs none.

   Shadowed keys first, one sentence per policy that wins them: "DevOps uses
   AWS for engineering teams." A row that decides for some of the groups it
   names says the same of the rest. Otherwise the reason it is out of the race.
   A live row that decides for everyone it names has no tip, whatever its rule
   count — its meta says "No rules". */
export function rowTip(row: StandRow, groups: readonly Group[], users: readonly User[]): string | null {
  if (row.lostTo.length > 0) {
    const winners: Policy[] = []
    for (const l of row.lostTo) if (!winners.some((w) => w.id === l.to.id)) winners.push(l.to)
    return winners
      .map((w) => {
        const names = row.lostTo.filter((l) => l.to.id === w.id).map((l) => keyName(l.key, groups, users))
        return `${listNames(names, 2)} ${names.length === 1 ? 'uses' : 'use'} ${w.name}.`
      })
      .join(' ')
  }
  if (row.state === 'not-app-access') return 'Not an app access policy.'
  if (row.state === 'draft' || row.state === 'inactive' || row.state === 'monitor') return whyNotDeciding(row.policy)
  return null
}

/* Who a policy is for, in a few words: "Everyone", "Finance and Sales",
   "Finance, Sales and 2 more". An id the directory no longer has reads
   "(deleted)" rather than vanishing, so a shortened list still says so. */
export function whoLabel(p: Policy, groups: readonly Group[], users: readonly User[]): string {
  if (p.audience.everyone) return 'Everyone'
  const names = [
    ...p.audience.groupIds.map((id) => groups.find((g) => g.id === id)?.name ?? '(deleted)'),
    ...p.audience.userIds.map((id) => users.find((u) => u.id === id)?.name ?? '(deleted)'),
  ]
  return names.length === 0 ? 'Nobody chosen' : listNames(names, 2)
}
