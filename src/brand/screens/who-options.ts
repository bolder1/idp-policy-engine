import type { Group, RuleWho, User } from '../data'
import { normaliseWho } from '../rule-who'
import { GROUP_PREFIX, GROUPS_HEADING, USERS_HEADING, groupNamesOf, membersLine, type IdentityOption, type IdentityValue } from './sign-in-tests/sign-in-card'

/* -----------------------------------------------------------------------------
   A rule's Who, in the Access checks Identity field's own terms (owner, 19 Oct
   2026: "Who selection is awful — use the Access checks identity way").

   The field (sign-in-tests/identity-combo.tsx) holds values — a person's id, or
   `group:<id>` — in the order picked; a rule holds a `RuleWho`. These are the
   two directions, and the options the list draws. Unlike Access checks, every
   group is listed, members or not: a rule can name a group nobody is in yet,
   while a sign-in needs somebody to sign in as. The field itself is
   who-combo.tsx.
   -------------------------------------------------------------------------- */

/* Every group (square face, its member count) and every person (round face, their groups on the second line — or
   their email when they have none). Search reads a group's name, and a person's name and email. */
export function whoOptions(users: readonly User[], groups: readonly Group[]): IdentityOption[] {
  const people = users.map(
    (u): IdentityOption => ({
      value: u.id,
      kind: 'user',
      name: u.name,
      meta: groupNamesOf(u, groups).join(', ') || u.email,
      heading: USERS_HEADING,
      hay: `${u.name} ${u.email}`.toLowerCase(),
    }),
  )
  const teams = groups.map(
    (g): IdentityOption => ({
      value: `${GROUP_PREFIX}${g.id}`,
      kind: 'group',
      name: g.name,
      meta: membersLine(g.memberCount),
      heading: GROUPS_HEADING,
      hay: g.name.toLowerCase(),
    }),
  )
  return [...people, ...teams]
}

/** A rule's who as the field's values: its groups, then its people. Everyone is no values. */
export const valuesOfWho = (who: RuleWho | undefined): IdentityValue[] => [...(who?.groupIds ?? []).map((id) => `${GROUP_PREFIX}${id}`), ...(who?.userIds ?? [])]

/* The field's values as a rule's who, normalised — undefined for none (Everyone). The exceptions a who already had are
   kept: the field names who the rule is for, not who it leaves out. */
export function whoOfValues(values: readonly IdentityValue[], keep?: RuleWho): RuleWho | undefined {
  const groupIds = values.filter((v) => v.startsWith(GROUP_PREFIX)).map((v) => v.slice(GROUP_PREFIX.length))
  const userIds = values.filter((v) => !v.startsWith(GROUP_PREFIX))
  return normaliseWho({ groupIds, userIds, exceptGroupIds: keep?.exceptGroupIds, exceptUserIds: keep?.exceptUserIds })
}
