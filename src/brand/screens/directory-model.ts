import { memberGroupIds, type App, type Group, type Policy, type User } from '../data'
import { listNames } from '../rule-who'
import { groupNamesOf as groupNameList, namesGroup } from './app-people-tabs-model'
import { alsoNamedIn, deciderForGroup } from './app-standing'
import { STATUS_WORD } from './board/read-as-text'

/* -----------------------------------------------------------------------------
   The User list's and the Groups pages' words and rows, kept out of the
   components so they can be tested without rendering (UsersPage.tsx,
   GroupsPage.tsx).

   Nothing here decides a sign-in. Who decides for a group on an application is
   `deciderForGroup` (app-standing.ts), the engine's own pick, and what a
   change of membership moves is `appsChangedByMembership` there, asked about
   the directory as it would be — `membershipAfter` below.
   -------------------------------------------------------------------------- */

/* --- People -------------------------------------------------------------------- */

/* First name and last name, as the live Assignment table splits them: the text
   before the first space, and the rest. A one-word name has no last name. */
export function splitName(name: string): { first: string; last: string } {
  const clean = name.trim().replace(/\s+/g, ' ')
  const at = clean.indexOf(' ')
  return at < 0 ? { first: clean, last: '' } : { first: clean.slice(0, at), last: clean.slice(at + 1) }
}

/* Every group somebody is in, by name, shortened past two: the application
   Users tab's list (app-people-tabs-model.ts), so a stale id reads "(deleted)"
   on both pages alike. */
export function groupNamesOf(u: Pick<User, 'groupId' | 'alsoGroupIds'>, groups: readonly Pick<Group, 'id' | 'name'>[]): string {
  return listNames(groupNameList(u, groups), 2)
}

/** The directory people in a group, in directory order: its members, counted from the people rather than the stated `memberCount`. */
export const membersOf = (users: readonly User[], groupId: string): User[] => users.filter((u) => memberGroupIds(u).includes(groupId))

/** The roles somebody in the directory holds, A to Z, each with its people in directory order. */
export function rolesOf(users: readonly User[]): { role: string; users: User[] }[] {
  const m = new Map<string, User[]>()
  for (const u of users) m.set(u.role, [...(m.get(u.role) ?? []), u])
  return [...m.entries()].map(([role, people]) => ({ role, users: people })).sort((a, b) => a.role.localeCompare(b.role))
}

/* The live Assignment search, "Filter data by text or value": any of what a
   row shows — the email, the name, and so the first and last names in it. */
export function filterMembers(members: readonly User[], query: string): User[] {
  const q = query.trim().toLowerCase()
  if (!q) return [...members]
  return members.filter((u) => `${u.email} ${u.name}`.toLowerCase().includes(q))
}

/* --- Membership ------------------------------------------------------------------

   The directory as `store.setMembership` would leave it, worked out before
   anything is written, so the page can ask whether to confirm. The same two
   moves as the store's: joining makes it a person's first group when they
   have none and one of their others when they have one; leaving their first
   group moves the next one up, or leaves them in none (''). Only the groups
   a person is in matter to who decides (tenant-resolver.ts `governs`), so
   the prediction and the write cannot disagree about which sign-ins change. */

function joined(u: User, groupId: string): User {
  if (memberGroupIds(u).includes(groupId)) return u
  if (!u.groupId) return { ...u, groupId }
  return { ...u, alsoGroupIds: [...(u.alsoGroupIds ?? []), groupId] }
}

function left(u: User, groupId: string): User {
  if (!memberGroupIds(u).includes(groupId)) return u
  const { alsoGroupIds = [], ...rest } = u
  const others = alsoGroupIds.filter((id) => id !== groupId)
  const first = u.groupId === groupId ? (others.shift() ?? '') : u.groupId
  return others.length > 0 ? { ...rest, groupId: first, alsoGroupIds: others } : { ...rest, groupId: first }
}

/** The directory with these people put in the group (`member`) or taken out of it. Everybody else is the same record. */
export function membershipAfter(users: readonly User[], userIds: readonly string[], groupId: string, member: boolean): User[] {
  return users.map((u) => (userIds.includes(u.id) ? (member ? joined(u, groupId) : left(u, groupId)) : u))
}

/* --- Words ------------------------------------------------------------------------- */

/* Who a membership change is about, for a toast or a dialog title: the name,
   two names, or how many. "Priya Sharma", "Priya Sharma and Ravi Kumar",
   "4 users". */
export function whoSaid(names: readonly string[]): string {
  if (names.length <= 2) return listNames([...names], 2)
  return `${names.length} users`
}

/** The selection's button: "Unassign 1 user", "Unassign 3 users". */
export const unassignLabel = (n: number) => (n === 1 ? 'Unassign 1 user' : `Unassign ${n} users`)

/** The Assign users footer: "Assign users" until somebody is picked, then how many. */
export const assignLabel = (n: number) => (n === 0 ? 'Assign users' : n === 1 ? 'Assign 1 user' : `Assign ${n} users`)

/* A console stamp without its seconds, as the Apps list prints Last updated —
   "Aug 14, 2026, 14:25"; the full stamp goes on hover. */
export const stampShort = (stamp: string) => stamp.replace(/:\d\d$/, '')

/* What not built says, in the house wording (Applications.tsx): coming soon in
   the showcase, not built otherwise. `are` for a plural subject. */
export function notBuilt(what: string, showcase: boolean, are = false): string {
  return `${what} ${are ? 'are' : 'is'} ${showcase ? 'coming soon' : 'not built in this prototype'}.`
}

/* --- A group on its applications ---------------------------------------------------- */

/* The policies on an application that name the group but are not what decides
   for it, by name with their status: "Named in Code review for Finance
   (Draft)." "Also named in" when the decider names the group too. Null when
   no other policy names it. A policy names a group in its audience or a rule
   (`namesGroup`, the application tabs' reading, which is how app-standing.ts
   `groupsNamed` finds a group on an application), and the tip is a sentence,
   as the application tabs' is. */
export function namedInTip(appId: string, groupId: string, policies: readonly Policy[], decider: Policy | null): string | null {
  const others = alsoNamedIn(appId, policies, decider, (p) => namesGroup(p, groupId))
  if (others.length === 0) return null
  const lead = decider && namesGroup(decider, groupId) ? 'Also named in' : 'Named in'
  return `${lead} ${listNames(
    others.map((p) => `${p.name} (${STATUS_WORD[p.status]})`),
    2,
  )}.`
}

/** One row of a group's Applications tab: the application, what decides for the group's members there, and the tip beside it. */
export interface GroupAppRow {
  app: App
  decider: Policy | null
  tip: string | null
}

export function groupAppRows(groupId: string, apps: readonly App[], policies: readonly Policy[]): GroupAppRow[] {
  return apps.map((app) => {
    const decider = deciderForGroup(policies, app.id, groupId)
    return { app, decider, tip: namedInTip(app.id, groupId, policies, decider) }
  })
}
