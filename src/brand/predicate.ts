import type { Condition, ConditionCard, Predicate } from './data'

/* -----------------------------------------------------------------------------
   The predicate — a rule's WHEN, and everything that reads it.

   A rule's WHEN is a **disjunction of cards**. A card holds conditions that are
   all required; two cards are alternatives. That is disjunctive normal form,
   and it is the whole model:

       match  ⟺  cards.length === 0  ||  cards.some(k => k.conditions.every(pass))

   Two levels, forever. `(location AND ip) OR (user AND groups)` is two cards
   and needs no parentheses on screen, because the boxes *are* the parentheses.

   Why not a general tree. The linter in `diagnostics.ts` decides whether a rule
   can ever run, and every one of its interesting checks — subsumption,
   contradiction, duplication — is built on "an unbroken run of ANDs". Over an
   arbitrary tree those checks have to bail out silently on the mixed case,
   which is precisely the case grouping exists to enable: the linter would go
   quiet exactly where it is needed. A card IS an unbroken run of ANDs by
   construction, so `allAnd(rule)` becomes `cards.length === 1` and every check
   survives verbatim.

   Nothing becomes inexpressible. DNF is a normal form — every finite boolean
   formula has one. What is lost is *ways of writing* a predicate, never
   predicates.
   -------------------------------------------------------------------------- */

/** Identity of one condition, order-insensitive across its values. */
export const ckey = (c: Condition) => `${c.typeId}|${c.operator}|${[...c.values].sort().join(',')}`

/* The canonical identity of a whole predicate, and the product's single audit
   primitive. Conditions inside a card sort; cards sort among themselves. So it
   answers "is this the same rule" without answering "was it typed in the same
   order", which is the question four different call sites were each getting
   subtly wrong in their own way.

   It has to distinguish a pure REGROUPING — same leaves, different cards — or
   the stale-estimate check in diagnostics goes on reporting a number that was
   calculated for a different rule. Nesting the join characters is what does
   that: `a∧b ∨ c` and `a ∨ b∧c` share leaves and differ here. */
export function sig(p: Predicate): string {
  return p.cards
    .map((k) => k.conditions.map(ckey).sort().join('∧'))
    .sort()
    .join('∨')
}

/** Every condition in the predicate, cards flattened away. */
export function leaves(p: Predicate): Condition[] {
  return p.cards.flatMap((k) => k.conditions)
}

/** How many conditions the predicate holds. Counts leaves, never containers. */
export const leafCount = (p: Predicate) => leaves(p).length

/* Conservative rather than an identity test. `{ cards: [] }` is the catch-all
   by design, but a card that somehow lost its conditions matches everything
   too — and a rule that quietly matches everything is the one shape that makes
   every rule below it unreachable. The invariant says that card cannot exist;
   this is what keeps a broken invariant from turning into a silent outage. */
export function matchesEverything(p: Predicate): boolean {
  return p.cards.length === 0 || p.cards.some((k) => k.conditions.length === 0)
}

/** True when the predicate is a single AND-run — the shape the linter can reason about hardest. */
export const isSingleCard = (p: Predicate) => p.cards.length === 1

/** Cards holding a condition whose ckey appears in more than one card. */
export function duplicatedAcrossCards(p: Predicate): string[] {
  if (p.cards.length < 2) return []
  const seen = new Map<string, number>()
  for (const k of p.cards) {
    for (const key of new Set(k.conditions.map(ckey))) seen.set(key, (seen.get(key) ?? 0) + 1)
  }
  return [...seen.entries()].filter(([, n]) => n > 1).map(([key]) => key)
}

// --- The adapter -------------------------------------------------------------

/* The shape the model had before this pass: a flat array where each condition
   carried the joiner to the one before it, read strictly left to right with no
   precedence. Kept only so the seeds, the scenarios and the gauntlet's fix
   specs can be read in without being re-typed by hand. */
export interface LegacyCondition {
  id: string
  typeId: string
  operator: string
  values: string[]
  joiner?: 'AND' | 'OR'
}

let cardSeq = 0
const kid = () => `k${(cardSeq += 1)}`

/* A left-to-right fold with no precedence is a left-leaning binary tree, and
   distributing that tree over OR gives exactly one DNF. So this is total and
   faithful — the old evaluator WAS this fold, which is what makes the property
   test in predicate.test.ts a proof rather than a spot check.

   The trap, and the reason this is not the "obvious" implementation: do NOT
   read it with AND binding tighter. The seed at data.ts "Off-network finance
   access" is (zone ∧ time) ∨ device-type under the left fold and
   zone ∧ (time ∨ device-type) under precedence — a different rule, catching
   different sign-ins, in a policy that denies. */
export function flatToPredicate(flat: LegacyCondition[]): Predicate {
  if (flat.length === 0) return { cards: [] }

  // Accumulated disjunction; each element is one AND-run being built up.
  let runs: Condition[][] = [[strip(flat[0])]]

  for (let i = 1; i < flat.length; i++) {
    const next = strip(flat[i])
    if (flat[i].joiner === 'OR') {
      runs.push([next])
    } else {
      // AND binds to the whole accumulated disjunction, because the fold was
      // `acc && ok` on a boolean that already absorbed every earlier OR. So it
      // distributes across every run so far.
      runs = runs.map((r) => [...r, next])
    }
  }

  return { cards: runs.map((conditions) => ({ id: kid(), conditions })) }
}

const strip = (c: LegacyCondition): Condition => ({
  id: c.id,
  typeId: c.typeId,
  operator: c.operator,
  values: c.values,
})

// --- Blame and credit --------------------------------------------------------

/* Two questions the old evaluator answered by scanning a flat array, and both
   answers become wrong the moment there are alternatives.

   "The first thing that failed" is meaningless when three alternatives each
   failed for a different reason — the useful answer is which alternative came
   closest. And "All N conditions met" is simply false when one of two cards
   carried the match; the other card's conditions were not met and saying they
   were is the kind of quiet wrongness that stops people trusting the trace. */

/** The card that came closest to matching, and its first failing condition. Ties break to the earliest card. */
export function blame(
  p: Predicate,
  passed: (c: Condition) => boolean,
): { card: ConditionCard; condition: Condition; index: number } | null {
  let best: { card: ConditionCard; condition: Condition; index: number } | null = null
  let fewest = Infinity

  for (let index = 0; index < p.cards.length; index++) {
    const card = p.cards[index]
    const failing = card.conditions.filter((c) => !passed(c))
    if (failing.length === 0 || failing.length >= fewest) continue
    fewest = failing.length
    best = { card, condition: failing[0], index }
  }

  return best
}

/** The card that carried the match. */
export function credit(p: Predicate, passed: (c: Condition) => boolean): { card: ConditionCard; index: number } | null {
  for (let i = 0; i < p.cards.length; i++) {
    if (p.cards[i].conditions.every(passed)) return { card: p.cards[i], index: i }
  }
  return null
}

/** Card A, card B — cards are lettered because they have no evaluation order. Rules are numbered; the two must not be confusable. */
export const cardLetter = (i: number) => String.fromCharCode(65 + (i % 26)) + (i >= 26 ? String(Math.floor(i / 26)) : '')

/** Name a card the way the UI does: its label if the author gave it one, otherwise its letter. */
export const cardName = (card: ConditionCard, i: number) => card.label?.trim() || `card ${cardLetter(i)}`
