import { describe, expect, it } from 'vitest'

import { card, cond, when, type Condition, type Predicate } from './data'
import { allOf, anyOf, cardState, notState, predicatePasses, predicateState, type CondState } from './predicate'

/* -----------------------------------------------------------------------------
   The predicate, read three-valued.

   The truth tables are the whole contract: a known answer is never hidden by an
   unknown one it does not depend on, and an unknown one is never promoted to a
   pass. The last block holds the two readings together — wherever the
   three-valued answer is decided, it is the answer the two-valued reader gives.
   -------------------------------------------------------------------------- */

const S: CondState[] = ['pass', 'fail', 'unknown']

describe('Kleene truth tables', () => {
  it.each([
    ['pass', 'pass', 'pass'],
    ['pass', 'fail', 'fail'],
    ['pass', 'unknown', 'unknown'],
    ['fail', 'fail', 'fail'],
    ['fail', 'unknown', 'fail'],
    ['unknown', 'unknown', 'unknown'],
  ] as const)('%s AND %s is %s', (a, b, want) => {
    expect(allOf([a, b])).toBe(want)
    expect(allOf([b, a])).toBe(want)
  })

  it.each([
    ['pass', 'pass', 'pass'],
    ['pass', 'fail', 'pass'],
    ['pass', 'unknown', 'pass'],
    ['fail', 'fail', 'fail'],
    ['fail', 'unknown', 'unknown'],
    ['unknown', 'unknown', 'unknown'],
  ] as const)('%s OR %s is %s', (a, b, want) => {
    expect(anyOf([a, b])).toBe(want)
    expect(anyOf([b, a])).toBe(want)
  })

  it('negates pass and fail, and leaves unknown alone', () => {
    expect(notState('pass')).toBe('fail')
    expect(notState('fail')).toBe('pass')
    expect(notState('unknown')).toBe('unknown')
  })

  it('treats an empty AND as pass and an empty OR as fail, the identities', () => {
    expect(allOf([])).toBe('pass')
    expect(anyOf([])).toBe('fail')
  })
})

describe('cards and predicates', () => {
  const a = cond('day', 'is', ['Monday'])
  const b = cond('day', 'is', ['Tuesday'])
  const c = cond('day', 'is', ['Friday'])
  const states = (m: Record<string, CondState>) => (x: Condition) => m[x.id]

  it('reads an AND card and an OR card by their own joiner', () => {
    const and = card(a, b)
    const or = { ...card(a, b), join: 'or' as const }
    expect(cardState(and, states({ [a.id]: 'pass', [b.id]: 'unknown' }))).toBe('unknown')
    expect(cardState(and, states({ [a.id]: 'fail', [b.id]: 'unknown' }))).toBe('fail')
    expect(cardState(or, states({ [a.id]: 'pass', [b.id]: 'unknown' }))).toBe('pass')
    expect(cardState(or, states({ [a.id]: 'fail', [b.id]: 'unknown' }))).toBe('unknown')
  })

  it('reads the cards as alternatives by default, and together when joined by AND', () => {
    const alt = when(card(a), card(b))
    const both: Predicate = { ...when(card(a), card(b)), join: 'and' }
    expect(predicateState(alt, states({ [a.id]: 'unknown', [b.id]: 'pass' }))).toBe('pass')
    expect(predicateState(both, states({ [a.id]: 'unknown', [b.id]: 'pass' }))).toBe('unknown')
    expect(predicateState(both, states({ [a.id]: 'unknown', [b.id]: 'fail' }))).toBe('fail')
  })

  it('matches everything when empty', () => {
    expect(predicateState({ cards: [] }, () => 'fail')).toBe('pass')
  })

  it('agrees with the two-valued reader wherever it is decided', () => {
    const shapes: Predicate[] = [
      when(card(a, b), card(c)),
      { ...when(card(a, b), card(c)), join: 'and' },
      when({ ...card(a, b), join: 'or' }, card(c)),
      { ...when({ ...card(a, b), join: 'or' }, card(c)), join: 'and' },
    ]
    for (const p of shapes) {
      for (const x of S) for (const y of S) for (const z of S) {
        const m = states({ [a.id]: x, [b.id]: y, [c.id]: z })
        const three = predicateState(p, m)
        if (three === 'unknown') {
          /* Undecided is never a pass to the two-valued reader. */
          expect(predicatePasses(p, (k) => m(k) === 'pass')).toBe(false)
          continue
        }
        expect(predicatePasses(p, (k) => m(k) === 'pass'), `${x} ${y} ${z}`).toBe(three === 'pass')
      }
    }
  })
})
