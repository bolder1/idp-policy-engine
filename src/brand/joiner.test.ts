import { describe, expect, it } from 'vitest'

import { card, cond, emptyGroup, when, type Condition, type Predicate } from './data'
import { cardJoin, isSingleAndRun, matchesEverything, predicatePasses, sig, topJoin } from './predicate'

/* -----------------------------------------------------------------------------
   The joiner.

   `Predicate.join` and `ConditionCard.join` were added so an author can choose
   AND or OR at each of the model's two levels. Both default to what the model
   meant before they existed, which is the property most of these tests are
   about: a rule written against the old shape has to keep its exact meaning,
   or every seeded policy in the estate quietly changes.
   -------------------------------------------------------------------------- */

/* Three conditions whose truth we control directly. The predicate layer does
   not evaluate values — `evalCond` in simulate.ts does — so a test about
   joining takes the leaf verdict as a given and checks only how they combine. */
const A = cond('zone', 'in zone', ['a'])
const B = cond('zone', 'in zone', ['b'])
const C = cond('zone', 'in zone', ['c'])

const only =
  (...pass: Condition[]) =>
  (c: Condition) =>
    pass.some((p) => p.id === c.id)

describe('the defaults are the old semantics', () => {
  it('reads an absent card joiner as and, and an absent top joiner as or', () => {
    const p = when(card(A, B), card(C))
    expect(cardJoin(p.cards[0])).toBe('and')
    expect(topJoin(p)).toBe('or')
  })

  it('signs a default predicate without any joiner marker', () => {
    /* The signature is what `impactOf` compares to decide a rule's estimate has
       gone stale, and what `proposeFix` compares to find an existing twin. If
       adding joiners had changed the signature of an untouched rule, every
       seeded rule would have read as edited on first load. */
    const plain = when(card(A, B), card(C))
    const spelled: Predicate = { join: 'or', cards: [{ ...card(A, B), join: 'and' }, { ...card(C), join: 'and' }] }
    expect(sig(spelled)).toBe(sig(plain))
  })

  it('gives a different signature once a joiner actually differs', () => {
    const asAnd: Predicate = { ...when(card(A, B), card(C)), join: 'and' }
    expect(sig(asAnd)).not.toBe(sig(when(card(A, B), card(C))))
  })

  /* The case the nesting characters were supposed to catch and did not.

     `sig` promises to tell a pure regrouping apart — same leaves, different
     cards — because the stale-estimate check in diagnostics and the twin
     lookup in the gauntlet both ask it that question. It joined an or-run with
     `∨` and joined the cards with `∨` as well, so one or-card holding A and B
     signed as `A∨B`, and two default cards holding A and B signed as `A∨B`
     too. Two different rules, one string.

     It survived because the AND pair below it — the shape everybody reaches
     for first — was distinguishable, so the promise looked kept. */
  it('tells one or-card apart from two cards holding the same leaves', () => {
    const oneOrCard: Predicate = { join: 'or', cards: [{ ...card(A, B), join: 'or' }] }
    const twoCards = when(card(A), card(B))
    expect(sig(oneOrCard)).not.toBe(sig(twoCards))
  })

  it('tells one and-card apart from two cards holding the same leaves', () => {
    expect(sig(when(card(A, B)))).not.toBe(sig(when(card(A), card(B))))
  })

  /* Regrouping is one drag on a canvas, so this is the difference between the
     save bar saying "unsaved changes" and the change list being able to name
     what changed. */
  it('signs a three-leaf run differently from the same leaves split in two', () => {
    expect(sig(when(card(A, B, C)))).not.toBe(sig(when(card(A, B), card(C))))
  })
})

describe('a card joins its own conditions', () => {
  it('requires every condition when the card is an and-run', () => {
    const p = when(card(A, B))
    expect(predicatePasses(p, only(A, B))).toBe(true)
    expect(predicatePasses(p, only(A))).toBe(false)
  })

  it('takes any one condition when the card is an or-run', () => {
    const p: Predicate = { cards: [{ ...card(A, B), join: 'or' }] }
    expect(predicatePasses(p, only(A))).toBe(true)
    expect(predicatePasses(p, only(B))).toBe(true)
    expect(predicatePasses(p, only(C))).toBe(false)
  })
})

describe('the predicate joins its cards', () => {
  it('takes any one card by default', () => {
    const p = when(card(A), card(B))
    expect(predicatePasses(p, only(B))).toBe(true)
  })

  it('requires every card when the top joiner is and', () => {
    const p: Predicate = { join: 'and', cards: [card(A), card(B)] }
    expect(predicatePasses(p, only(A))).toBe(false)
    expect(predicatePasses(p, only(A, B))).toBe(true)
  })

  it('handles and-of-ors — the shape the old model could not express', () => {
    /* Conjunctive normal form: (A or B) and (C). The predicate was a fixed
       disjunction of conjunctions, so this rule had no representation at all
       before the joiners existed. */
    const p: Predicate = { join: 'and', cards: [{ ...card(A, B), join: 'or' }, card(C)] }
    expect(predicatePasses(p, only(A, C))).toBe(true)
    expect(predicatePasses(p, only(B, C))).toBe(true)
    expect(predicatePasses(p, only(A, B))).toBe(false)
    expect(predicatePasses(p, only(C))).toBe(false)
  })
})

describe('matchesEverything follows the top joiner', () => {
  it('is true with no cards at all', () => {
    expect(matchesEverything(when())).toBe(true)
  })

  it('is true when any card is hollow and the cards are alternatives', () => {
    expect(matchesEverything({ cards: [card(A), emptyGroup()] })).toBe(true)
  })

  it('is false when a hollow card is ANDed with one that still constrains', () => {
    /* Joined by AND the other card still narrows the rule, so reporting it as a
       catch-all would mark reachable rules below it unreachable. */
    expect(matchesEverything({ join: 'and', cards: [card(A), emptyGroup()] })).toBe(false)
  })

  it('is true when every card is hollow, whatever the joiner', () => {
    expect(matchesEverything({ join: 'and', cards: [emptyGroup(), emptyGroup()] })).toBe(true)
  })
})

describe('isSingleAndRun guards the checks that need an unbroken run of ANDs', () => {
  it('accepts one and-run', () => {
    expect(isSingleAndRun(when(card(A, B)))).toBe(true)
  })

  it('rejects one or-run', () => {
    /* This is the case the old `cards.length === 1` shorthand got wrong: a
       single card used to imply a conjunction, and it no longer does. */
    expect(isSingleAndRun({ cards: [{ ...card(A, B), join: 'or' }] })).toBe(false)
  })

  it('rejects two cards', () => {
    expect(isSingleAndRun(when(card(A), card(B)))).toBe(false)
  })
})

describe('emptyGroup', () => {
  it('is a group, and is empty', () => {
    const g = emptyGroup()
    expect(g.conditions).toHaveLength(0)
    expect(g.grouped).toBe(true)
  })

  it('gets its own id each time', () => {
    expect(emptyGroup().id).not.toBe(emptyGroup().id)
  })
})
