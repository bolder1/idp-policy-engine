import type { Audience, RuleWho, User } from './data'

/* -----------------------------------------------------------------------------
   The policy audience, and how a rule's who sits inside it.

   This module used to be a view over `group` and `user` conditions inside a
   rule's WHEN. That view is gone with the conditions: who a rule applies to is
   `Rule.who` now, a field of its own, and `rule-who.ts` owns reading, writing
   and comparing it. What stays here is the one question that joins the two
   levels — which of a rule's chosen groups and people the policy does not
   govern at all.
   -------------------------------------------------------------------------- */

/** The two kinds a who names. Everything else a rule reads is circumstance. */
export const WHO_TYPES = ['group', 'user'] as const

/* The chosen groups and people this POLICY does not govern.

   The policy audience is checked before any rule, so a rule naming Contractors
   inside a policy that governs Finance can never apply to them. The picker
   marks those rows and the linter reports them (PE151), both from this one
   implementation.

   `everyone` reports nothing, because it governs everyone. And a named person
   whose GROUP is governed is not outside — that is the case that would
   otherwise put a warning on every deliberate exception somebody named. */
export function outsideAudience(
  a: Audience,
  groupIds: string[],
  userIds: string[],
  directory: User[],
): { groups: string[]; users: string[] } {
  if (a.everyone) return { groups: [], users: [] }
  return {
    groups: groupIds.filter((id) => !a.groupIds.includes(id)),
    users: userIds.filter((id) => {
      if (a.userIds.includes(id)) return false
      const u = directory.find((x) => x.id === id)
      return u ? !a.groupIds.includes(u.groupId) : false
    }),
  }
}

/* The same question for a rule's who.

   Only the INCLUDED lists. An exception outside the audience excludes somebody
   the policy never governed, which changes nothing and is not worth a flag. */
export const outsideAudienceOf = (a: Audience, who: RuleWho | undefined, directory: User[]) =>
  outsideAudience(a, who?.groupIds ?? [], who?.userIds ?? [], directory)
