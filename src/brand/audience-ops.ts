import { cond, type Audience, type Condition, type Predicate, type User } from './data'
import { cardJoin } from './predicate'
import * as ops from './when-ops'

/* -----------------------------------------------------------------------------
   Who a rule is about, as the conditions it already was.

   A rule's WHEN can hold `group in […]` and `user is […]` like any other
   condition, and that is how a policy narrows inside itself. This module is a
   VIEW of those two conditions — read them out, write them back — so the form
   can ask "who is this for?" as its own step without the model growing a second
   place to say it.

   That distinction is the whole point, and it is not a technicality.
   `Rule.appliesTo` existed once and was removed on the argument recorded in
   `data.ts`: a per-rule audience let a policy build "rule 1 covers Finance,
   rule 2 covers everyone", which READS as a scoped policy and is not one, and
   it gated sign-ins somewhere the linter and the simulator could not see. Every
   check in `diagnostics.ts` is written over conditions; every branch of
   `evalCond` is written over conditions. An audience that is conditions is
   subsomable, contradictable, duplicable and traceable for free — an audience
   that is a field beside them is a second gate nothing else knows about.

   So: a separate STEP in the form, not a separate FACT on the rule.
   -------------------------------------------------------------------------- */

/** The two attributes that answer "who". Everything else is circumstance. */
export const WHO_TYPES = ['group', 'user'] as const
export type WhoType = (typeof WHO_TYPES)[number]

export const isWho = (c: Condition) => (WHO_TYPES as readonly string[]).includes(c.typeId)

/* Can the who-step edit this predicate safely?

   Only when the rule is ONE unbroken run of ANDs. In that shape "who" is an
   extra requirement and adding it means what somebody expects: these people,
   AND these circumstances.

   In any other shape it does not. Two alternatives joined by OR would need the
   audience repeated in both to mean "these people, whichever way in they take",
   and adding it to one card instead makes it a THIRD alternative — a rule that
   fires for anyone in Finance regardless of everything else. Rather than guess,
   the step says so and points at the conditions, which can express it exactly.

   `cards.length === 0` is the catch-all, and adding the first who-condition to
   it is well defined: it starts the run. */
export const whoEditable = (p: Predicate) =>
  p.cards.length === 0 || (p.cards.length === 1 && cardJoin(p.cards[0]) === 'and')

/** The ids a rule names for one of the two who-attributes. */
export function whoIds(p: Predicate, kind: WhoType): string[] {
  const c = p.cards.flatMap((k) => k.conditions).find((x) => x.typeId === kind)
  return c ? c.values.filter(Boolean) : []
}

/** The who-conditions themselves, for a surface that wants to draw them. */
export const whoConditions = (p: Predicate) => p.cards.flatMap((k) => k.conditions).filter(isWho)

/** Every OTHER condition — what the second step edits. */
export const restConditions = (p: Predicate) => p.cards.flatMap((k) => k.conditions).filter((c) => !isWho(c))

/* Set the ids for one who-attribute.

   One condition per attribute, never two: `group in [a]` AND `group in [b]`
   requires membership of both, which is not what a list of groups means to
   anybody choosing one. An empty list REMOVES the condition rather than leaving
   `group in []` — an unset condition is a first-class diagnosable state and the
   linter reports it, so a rule that simply does not narrow by group must not
   look like one that meant to and did not finish.

   Everything goes through `when-ops`, which is the only writer: it is what
   keeps the branch-emptying rule and the delete-at-default discipline in one
   place rather than in each caller. */
export function setWho(p: Predicate, kind: WhoType, ids: string[], operator = kind === 'group' ? 'in' : 'is'): Predicate {
  const existing = p.cards.flatMap((k) => k.conditions).find((c) => c.typeId === kind)
  const wanted = ids.filter(Boolean)

  if (existing && wanted.length === 0) return ops.removeCondition(p, existing.id)
  if (existing) return ops.patchCondition(p, existing.id, { values: wanted })
  if (wanted.length === 0) return p

  /* Into the run that is already there, or the first one. `addCondition` with
     `'new'` starts a branch; with a branch id it appends. */
  const target = p.cards[0]?.id
  return ops.addCondition(p, target ?? 'new', cond(kind, operator, wanted))
}

/** The operator a who-condition currently uses — `in`/`not in`, `is`/`is not`. */
export function whoOperator(p: Predicate, kind: WhoType): string {
  const c = p.cards.flatMap((k) => k.conditions).find((x) => x.typeId === kind)
  return c?.operator ?? (kind === 'group' ? 'in' : 'is')
}

/** Flip a who-condition between its affirmative and its negation. */
export function setWhoOperator(p: Predicate, kind: WhoType, operator: string): Predicate {
  const c = p.cards.flatMap((k) => k.conditions).find((x) => x.typeId === kind)
  return c ? ops.patchCondition(p, c.id, { operator }) : p
}

/* The chosen groups and people this POLICY does not govern.

   Nothing catches this today. The scope diagnostics are policy-level and the
   reach finding reads the stored `matchEstimate` rather than the who, so a
   list that cheerfully offers all five groups will let somebody build a
   permanently dead rule — one naming Contractors inside a policy that governs
   Finance — and say nothing at all.

   So it is badged in the picker, where the decision is being made. Kept pure
   and kept here so that a future diagnostic and the badge read one
   implementation rather than growing two that disagree.

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
