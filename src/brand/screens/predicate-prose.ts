import {
  conditionType,
  groups as seedGroups,
  users as seedUsers,
  zones as seedZones,
  type Audience,
  type Condition,
  type Group,
  type ConditionCard,
  type Predicate,
  type Rule,
  type User,
} from '../data'
import { seedProfiles } from '../fingerprint'
import { seedHooks } from '../hooks'
import { cardLetter } from '../predicate'

/* -----------------------------------------------------------------------------
   The rule, read back as English. One implementation.

   There were six. `builder-dialogs`, v1 (three separate places), `overview`, v5,
   v0 and the interview composer each re-implemented "condition, joiner,
   condition", and they had already diverged — labels kept in one and dropped in
   another, joiners uppercased here and lowercased there, and v1's was simply
   wrong for any rule that mixed AND with OR.

   That mattered more than tidiness, because `review-step` promises the reader
   in-product that the sentence and the rule "cannot disagree". Six renderers is
   six chances for that promise to be false, and grouping makes it worse: a
   renderer that flattens cards prints a rule that catches different people than
   the one that runs.
   -------------------------------------------------------------------------- */

/* Zone, fingerprint, hook, group and user conditions store an id, and the thing
   it points at can be renamed after the rule was written. The resolver is how a
   caller hands in the live directory; without one the seed is used, which is
   right for tests and for any caller with no store. */
export type RefKind = 'zone' | 'fingerprint' | 'hook' | 'group' | 'user'
export type NameLookup = (kind: RefKind, id: string) => string | undefined

export function seedName(kind: RefKind, id: string): string | undefined {
  if (kind === 'zone') return seedZones.find((z) => z.id === id)?.name
  if (kind === 'hook') return seedHooks.find((h) => h.id === id)?.name
  if (kind === 'group') return seedGroups.find((g) => g.id === id)?.name
  if (kind === 'user') return seedUsers.find((u) => u.id === id)?.name
  return seedProfiles.find((p) => p.id === id)?.name
}

const REF_KINDS = new Set<string>(['zone', 'fingerprint', 'hook', 'group', 'user'])

/* One condition as English.

   The type label is dropped wherever the object's own name already says which
   field it is — "not recognised by Corporate managed" reads as a sentence where
   "Device Fingerprint not recognised by Corporate managed" reads as a form
   field with its label left on. "is not India" alone does not say what is not
   India, so everything else keeps its label. */
export function conditionSentence(c: Condition, resolve?: NameLookup): string {
  const t = conditionType(c.typeId)
  const raw = c.values.filter((v) => v.trim() !== '')

  /* Values are joined with "or", not with a comma.

     A condition holds when ANY of its values match — the evaluator is
     `vals.some(...)` — and a comma-separated list reads as a conjunction: "in
     zone Office Network, Corporate ASN" sounds like both are required. "or"
     says what actually happens, and it stays correct under negation because the
     operator scopes the whole disjunction: "not in zone A or B" is not-(A or B),
     which is exactly neither.

     A real misreading rather than a stylistic one. It could not bite while both
     value pickers were single-select; the multi-select sheet is what made a
     two-value condition something an author can produce, and the sentence under
     it described a narrower rule than the one that would run. */
  let value: string
  if (REF_KINDS.has(t.valueKind)) {
    const kind = t.valueKind as RefKind
    value = raw.map((v) => resolve?.(kind, v) ?? seedName(kind, v) ?? v).join(' or ')
  } else if (t.valueKind === 'time' || t.valueKind === 'range') {
    value = raw.join('–')
  } else {
    value = raw.join(' or ')
  }

  // Said out loud rather than left blank: the linter calls this an error, and
  // the prose has to agree with the panel next to it.
  if (!value) value = '(no value set)'

  /* The zone's half, said out loud.

     "not in zone Office Network" and "not in zone Office Network, on the
     network only" are two different rules, and this sentence is what the
     change list and the card both print. Without it they read identically,
     which is the one thing a read-back must never do.

     Only when it is narrower than the zone as written — the default is the
     zone's own meaning, and a clause restating a default is noise. */
  if (t.valueKind === 'zone') return `${c.operator} ${value}${c.scope ? (c.scope === 'ip' ? ', on the network only' : ', by location only') : ''}`
  if (t.valueKind === 'fingerprint') return `${c.operator} ${value}`
  if (t.valueKind === 'hook') return `${value} ${c.operator}`
  return `${t.label} ${c.operator} ${value}`
}

/* One alternative, joined by whichever operator the author chose for it.

   Lowercase, because in a sentence it is punctuation between clauses rather
   than the operator chip the editor draws. The default stays `and`, so a card
   written before joiners existed reads exactly as it did. */
export function cardSentence(conditions: Condition[], resolve?: NameLookup, join: 'and' | 'or' = 'and'): string {
  /* An empty card is reachable now — "Add group" makes the frame before it
     makes a condition — and it matches everything, which is the whole reason
     the linter calls it an error. Joining nothing gave an empty string, so the
     sentence read "(…) or ()" and described a narrower rule than the one that
     would actually run. */
  if (conditions.length === 0) return 'anything'
  return conditions.map((c) => conditionSentence(c, resolve)).join(join === 'or' ? ' or ' : ' and ')
}

const joinOf = (k: ConditionCard) => k.join ?? 'and'

/* The whole predicate.

   Brackets appear only when there is more than one card, because with one card
   they would be decoration around a thing that has no alternative. A named card
   leads with its name, so "Corp laptops: in zone HQ and device is Registered"
   tells the reader what the author thought the alternative WAS, which is the
   one thing the predicate itself cannot say. */
export function predicateSentence(p: Predicate, resolve?: NameLookup): string {
  if (p.cards.length === 0) return 'any sign-in that reaches this rule'

  const parts = p.cards.map((k) => {
    const body = cardSentence(k.conditions, resolve, joinOf(k))
    const named = k.label?.trim()
    return named ? `${named}: ${body}` : body
  })

  if (parts.length === 1) return parts[0]
  return parts.map((s) => `(${s})`).join(p.join === 'and' ? ' and ' : ' or ')
}

/* The same predicate as structured pieces, for surfaces that want to render the
   brackets and the `or` as elements rather than as text — so a clause can be
   hovered, lit, and linked back to the row that produced it. */
export interface ProseCard {
  id: string
  letter: string
  label?: string
  /** How this card's own clauses are joined. */
  join: 'and' | 'or'
  clauses: { id: string; text: string }[]
}

export function predicateParts(p: Predicate, resolve?: NameLookup): ProseCard[] {
  return p.cards.map((k, i) => ({
    id: k.id,
    letter: cardLetter(i),
    label: k.label?.trim() || undefined,
    join: joinOf(k),
    clauses: k.conditions.map((c) => ({ id: c.id, text: conditionSentence(c, resolve) })),
  }))
}

/** Who a policy governs, as one phrase. */
export function audienceSentence(a: Audience, groups: Group[] = seedGroups, directory: User[] = seedUsers): string {
  if (a.everyone) return 'everyone in the directory'
  const names = [
    ...a.groupIds.map((id) => groups.find((g) => g.id === id)?.name ?? id),
    ...a.userIds.map((id) => directory.find((u) => u.id === id)?.name ?? id),
  ]
  if (names.length === 0) return 'nobody'
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** What the rule does when it matches, in one sentence. */
export function decisionSentence(rule: Rule): string {
  if (rule.decision === 'deny') return 'Access is blocked. No alternative path.'

  if (rule.decision === '2fa') {
    if (rule.secondFactor === 'specific') {
      const named = rule.secondFactorMethods ?? []
      return named.length > 0
        ? `The user completes a second factor — ${named.join(' or ')} — before access is granted.`
        : 'The user completes a second factor before access is granted, but no method is chosen yet.'
    }
    if (rule.secondFactor === 'chain') {
      const steps = rule.methodChain ?? []
      return steps.length > 0
        ? `The user completes every step in order — ${steps.join(' → ')} — before access is granted.`
        : 'The user completes an ordered chain of factors before access is granted.'
    }
    if (rule.secondFactor === 'preferred') {
      return 'The user completes their preferred second factor before access is granted.'
    }
    return 'The user completes any enabled second factor before access is granted.'
  }

  if (rule.firstFactor === 'Any') return 'Access is granted after any single enabled factor. Nothing further is asked.'
  if (rule.firstFactor === 'Specific') {
    return `Access is granted after ${rule.firstFactorMethod ?? 'the chosen factor'} alone. Nothing further is asked.`
  }
  return 'Access is granted after the password alone. No second factor is requested.'
}

export interface RuleProse {
  /** Everything after "IF:" — the predicate, brackets and all. */
  iff: string
  /** Everything after "THEN: →" — what the decision does, in one sentence. */
  then: string
}

/** The rule as the two lines the review surfaces print under its name. */
export function ruleSentence(rule: Rule, resolve?: NameLookup): RuleProse {
  return { iff: predicateSentence(rule.when, resolve), then: decisionSentence(rule) }
}

/** A short predicate for a list row — "2 alternatives" rather than a paragraph. */
export function predicateSummary(p: Predicate): string {
  if (p.cards.length === 0) return 'Always matches'
  const n = p.cards.reduce((t, k) => t + k.conditions.length, 0)
  if (p.cards.length === 1) return `${n} condition${n === 1 ? '' : 's'}`
  return `${p.cards.length} ${p.join === 'and' ? 'groups' : 'alternatives'} · ${n} conditions`
}
