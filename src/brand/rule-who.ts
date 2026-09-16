import type { Condition, Predicate, Rule, RuleWho } from './data'
import { leaves, matchesEverything, sig } from './predicate'

/* -----------------------------------------------------------------------------
   Who a rule applies to.

   A rule has two parts that answer two different questions. `who` says which
   people the rule is for; the WHEN cards say what has to be true of the
   sign-in. They used to share one place — `group in […]` and `user is […]` were
   conditions inside a card — and that is what made a rule with two ways in
   grow a "who has more than one place to be" panel. They are separate now:

   - `who` is ANDed with the whole WHEN, whatever shape the cards have.
   - Groups and people are a union. Exceptions subtract.
   - Absent means everyone the policy governs. The policy audience is still
     checked once, before any rule.

   Everything that reads a rule's identity or reach goes through here —
   `ruleSig`, `ruleMatchesEveryone`, `whoContains` — so the linter, the
   simulator, the change list and the gauntlet cannot each decide on their own
   what a rule with a who means.
   -------------------------------------------------------------------------- */

export type WhoKind = 'group' | 'user'
export type WhoList = 'groupIds' | 'userIds' | 'exceptGroupIds' | 'exceptUserIds'

/** The person a who is tested against. `SimUser` and `User` both fit. */
export interface WhoPerson {
  id: string
  groupId: string
}

/** Somebody to ask which group a person is in, when a caller has a directory. */
export type WhoDirectory = readonly WhoPerson[]

const dedupe = (ids: readonly string[] | undefined): string[] => {
  const out: string[] = []
  for (const id of ids ?? []) {
    const v = id.trim()
    if (v && !out.includes(v)) out.push(v)
  }
  return out
}

/* The one place a stored who is shaped.

   De-duplicated, blanks dropped, authoring order kept (the picker shows what
   was chosen in the order it was chosen). The two exception lists are omitted
   when empty and the whole value is `undefined` when every list is — because a
   rule that went from "Finance" back to everyone must serialise exactly like a
   rule that never had a who, or the save bar lights on a no-op. */
export function normaliseWho(who?: RuleWho): RuleWho | undefined {
  if (!who) return undefined
  const groupIds = dedupe(who.groupIds)
  const userIds = dedupe(who.userIds)
  const exceptGroupIds = dedupe(who.exceptGroupIds)
  const exceptUserIds = dedupe(who.exceptUserIds)
  if (groupIds.length + userIds.length + exceptGroupIds.length + exceptUserIds.length === 0) return undefined
  return {
    groupIds,
    userIds,
    ...(exceptGroupIds.length > 0 ? { exceptGroupIds } : null),
    ...(exceptUserIds.length > 0 ? { exceptUserIds } : null),
  }
}

/** Does this who narrow anything? `false` means everyone the policy governs. */
export const hasWho = (who?: RuleWho): boolean => normaliseWho(who) !== undefined

/** Does the rule name its people, rather than leaving everyone in? Exceptions alone do not. */
const includesSome = (w: RuleWho) => w.groupIds.length > 0 || w.userIds.length > 0

/* Is this person covered?

   Included when nothing is included (everyone), or by group, or by name — a
   union. Then removed when their group or their name is an exception. */
export function whoPasses(who: RuleWho | undefined, user: WhoPerson): boolean {
  const w = normaliseWho(who)
  if (!w) return true
  const included = !includesSome(w) || w.groupIds.includes(user.groupId) || w.userIds.includes(user.id)
  if (!included) return false
  if (w.exceptGroupIds?.includes(user.groupId)) return false
  if (w.exceptUserIds?.includes(user.id)) return false
  return true
}

/* The canonical key: every list sorted, so the same people chosen in another
   order are the same rule. Empty for everyone, which is what keeps `ruleSig`
   byte-identical to `sig(when)` for every rule that has no who. */
export function whoKey(who?: RuleWho): string {
  const w = normaliseWho(who)
  if (!w) return ''
  const s = (ids?: string[]) => [...(ids ?? [])].sort().join(',')
  return `g:${s(w.groupIds)}|u:${s(w.userIds)}|xg:${s(w.exceptGroupIds)}|xu:${s(w.exceptUserIds)}`
}

/* Does `outer` cover everyone `inner` covers?

   Sound rather than complete: `true` only when it holds for any directory,
   because the linter reads it to call a rule unreachable. A person is in one
   group, so a named person's group is only known when a directory is passed;
   without one, anything that depends on it answers `false`. */
export function whoContains(outer?: RuleWho, inner?: RuleWho, directory?: WhoDirectory): boolean {
  const o = normaliseWho(outer)
  if (!o) return true
  const i = normaliseWho(inner) ?? { groupIds: [], userIds: [] }
  const groupOf = (id: string) => directory?.find((u) => u.id === id)?.groupId

  const iExG = i.exceptGroupIds ?? []
  const iExU = i.exceptUserIds ?? []
  const excludedByInner = (id: string) => {
    if (iExU.includes(id)) return true
    const g = groupOf(id)
    return g !== undefined && iExG.includes(g)
  }
  const liveGroups = i.groupIds.filter((g) => !iExG.includes(g))
  const liveUsers = i.userIds.filter((id) => !excludedByInner(id))
  const innerIsEveryone = !includesSome(i)

  /* 1. Everyone inner covers is included by outer. */
  if (includesSome(o)) {
    if (innerIsEveryone) return false
    if (!liveGroups.every((g) => o.groupIds.includes(g))) return false
    for (const id of liveUsers) {
      if (o.userIds.includes(id)) continue
      const g = groupOf(id)
      if (g !== undefined && o.groupIds.includes(g)) continue
      return false
    }
  }

  /* 2. Nobody inner covers is one of outer's exceptions. */
  for (const x of o.exceptGroupIds ?? []) {
    if (iExG.includes(x)) continue
    if (innerIsEveryone || liveGroups.includes(x)) return false
    for (const id of liveUsers) {
      const g = groupOf(id)
      if (g === undefined || g === x) return false
    }
  }
  for (const y of o.exceptUserIds ?? []) {
    if (iExU.includes(y)) continue
    if (innerIsEveryone || liveUsers.includes(y)) return false
    const g = groupOf(y)
    if (liveGroups.length > 0 && (g === undefined || liveGroups.includes(g))) return false
  }
  return true
}

/* Does this who cover nobody at all?

   Only when it names people and every one of them is also an exception. A who
   that includes nothing is everyone, and "everyone except X" is not provably
   empty. */
export function whoCoversNobody(who?: RuleWho, directory?: WhoDirectory): boolean {
  const w = normaliseWho(who)
  if (!w || !includesSome(w)) return false
  const exG = w.exceptGroupIds ?? []
  const exU = w.exceptUserIds ?? []
  const groupOf = (id: string) => directory?.find((u) => u.id === id)?.groupId
  const groupsGone = w.groupIds.every((g) => exG.includes(g))
  const usersGone = w.userIds.every((id) => {
    if (exU.includes(id)) return true
    const g = groupOf(id)
    return g !== undefined && exG.includes(g)
  })
  return groupsGone && usersGone
}

/* Both at once: the people `a` covers who `b` also covers.

   `undefined` is everyone, `null` is nobody — a who cannot store "nobody", so a
   caller that gets `null` has to decide what to do with a rule that applies to
   no one. Never wider than either side: without a directory, a person named
   on one side and covered only by a group on the other is dropped. */
export function intersectWho(a?: RuleWho, b?: RuleWho, directory?: WhoDirectory): RuleWho | undefined | null {
  const x = normaliseWho(a)
  const y = normaliseWho(b)
  if (!x) return y
  if (!y) return x
  const groupOf = (id: string) => directory?.find((u) => u.id === id)?.groupId
  const exceptGroupIds = dedupe([...(x.exceptGroupIds ?? []), ...(y.exceptGroupIds ?? [])])
  const exceptUserIds = dedupe([...(x.exceptUserIds ?? []), ...(y.exceptUserIds ?? [])])

  let groupIds: string[]
  let userIds: string[]
  if (!includesSome(x)) {
    groupIds = y.groupIds
    userIds = y.userIds
  } else if (!includesSome(y)) {
    groupIds = x.groupIds
    userIds = x.userIds
  } else {
    groupIds = x.groupIds.filter((g) => y.groupIds.includes(g))
    const inGroups = (id: string, gs: string[]) => {
      const g = groupOf(id)
      return g !== undefined && gs.includes(g)
    }
    userIds = dedupe([
      ...x.userIds.filter((id) => y.userIds.includes(id) || inGroups(id, y.groupIds)),
      ...y.userIds.filter((id) => inGroups(id, x.groupIds)),
    ])
    if (groupIds.length === 0 && userIds.length === 0) return null
  }

  /* An included id that is also an exception adds nobody; dropping it keeps
     the stored value honest. If that empties an include list that was not
     empty, the result is nobody — not everyone. */
  const hadIncludes = groupIds.length > 0 || userIds.length > 0
  groupIds = groupIds.filter((g) => !exceptGroupIds.includes(g))
  userIds = userIds.filter((id) => !exceptUserIds.includes(id))
  if (hadIncludes && groupIds.length === 0 && userIds.length === 0) return null

  const next = normaliseWho({ groupIds, userIds, exceptGroupIds, exceptUserIds })
  if (next && whoCoversNobody(next, directory)) return null
  return next
}

/* A rule's identity: who it is for, and its WHEN.

   Two rules with the same cards and different people are different rules, and
   PE101 must not call them duplicates. A rule with no who signs exactly as its
   WHEN always did, so no stored signature in the estate moves. */
export function ruleSig(r: Pick<Rule, 'who' | 'when'>): string {
  const k = whoKey(r.who)
  return k ? `${k}⟹${sig(r.when)}` : sig(r.when)
}

/** The rule matches every sign-in that reaches it: no who, and a WHEN that is always true. */
export const ruleMatchesEveryone = (r: Pick<Rule, 'who' | 'when'>): boolean =>
  !hasWho(r.who) && matchesEverything(r.when)

/* Set one list and hand back the rule with its who normalised.

   The field is DELETED when the result is everyone, not left as empty lists,
   so clearing the last person returns the rule to exactly what it was. */
export function setWhoIds(r: Rule, list: WhoList, ids: string[]): Rule {
  const base: RuleWho = r.who ?? { groupIds: [], userIds: [] }
  return withWho(r, { ...base, [list]: ids })
}

/* Replace a rule's who, normalised, deleting the field for everyone.

   A rule that already holds the key keeps it where it is. A rule without one
   gets it immediately before `when`, which is where `rule()` in data.ts puts a
   seeded who — so clearing a seeded rule's people and choosing them again
   rebuilds the same string, rather than moving the key to the end and leaving
   the save bar lit on a rule that means exactly what it did. */
export function withWho(r: Rule, who?: RuleWho): Rule {
  const next = normaliseWho(who)
  if (next && 'who' in r) return { ...r, who: next }
  if (next) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(r)) {
      if (k === 'when') out.who = next
      out[k] = v
    }
    if (!('who' in out)) out.who = next
    return out as unknown as Rule
  }
  if (!('who' in r)) return r
  const rest = { ...r }
  delete rest.who
  return rest
}

// --- Legacy ------------------------------------------------------------------

/** A `group` or `user` condition in a card: how who used to be written. */
export const isLegacyWho = (c: Condition): boolean => c.typeId === 'group' || c.typeId === 'user'

/** Every legacy who condition in a predicate. After migration there are none. */
export const legacyWhoConditions = (p: Predicate): Condition[] => leaves(p).filter(isLegacyWho)

// --- Words -------------------------------------------------------------------

const listNames = (names: string[], max: number): string => {
  if (names.length <= 1) return names[0] ?? ''
  if (names.length <= max) return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  const shown = Math.max(1, max - 1)
  return `${names.slice(0, shown).join(', ')} and ${names.length - shown} more`
}

/* Who, in a few words.

   'Everyone' · 'Finance and Mehak Rao' · 'Finance, Legal and 2 more' ·
   'Everyone except Contractors' · 'Finance except Priya Sharma'.

   `max` is how many names print before the rest become a count; prose that
   has room passes `Infinity`. A name the resolver cannot find prints its id. */
export function whoSummary(
  who: RuleWho | undefined,
  name: (kind: WhoKind, id: string) => string | undefined,
  max = 3,
): string {
  const w = normaliseWho(who)
  if (!w) return 'Everyone'
  const named = (kind: WhoKind) => (id: string) => name(kind, id) ?? id
  const inc = [...w.groupIds.map(named('group')), ...w.userIds.map(named('user'))]
  const exc = [...(w.exceptGroupIds ?? []).map(named('group')), ...(w.exceptUserIds ?? []).map(named('user'))]
  const head = inc.length === 0 ? 'Everyone' : listNames(inc, max)
  return exc.length > 0 ? `${head} except ${listNames(exc, max)}` : head
}
