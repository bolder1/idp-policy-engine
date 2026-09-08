import { describe, expect, it } from 'vitest'

import { card, cond, when, type AccessDecision, type Predicate, type Rule } from '../../data'
import type { NameLookup } from '../predicate-prose'
import { PARTS, nextPart, ruleAt, type Part } from './model'
import { PART_LABEL, partSummary } from './parts'

/* -----------------------------------------------------------------------------
   The part rides on the selection, and the card's three buttons report the
   rule honestly.

   Two properties worth pinning. The first is that `Condition` is a LABEL and
   `when` is an ID: the model field, its writer and its editor are all called
   `when`, and a fourth name for that one thing is the drift this board's
   comments spend their life undoing — but the screen has to say the word the
   person asking for it used.

   The second is that the card's condition count no longer includes the
   who-conditions. It used to count every leaf, which was right while the card
   had one number for the whole predicate; a card that reports its groups under
   `Who` and counts them again under `Condition` states the same fact twice and
   inflates the second telling.
   -------------------------------------------------------------------------- */

const NAMES: Record<string, string> = {
  'group:finance': 'Finance',
  'group:eng': 'Engineering',
  'user:priya': 'Priya Sharma',
}
const resolve: NameLookup = (kind, id) => NAMES[`${kind}:${id}`]

/* `partSummary` reads exactly two fields, so the fixture is two fields. A full
   `rule()` factory is not exported from `data.ts` and inventing one here would
   be a second definition of what a rule is. */
const asRule = (when: Predicate, decision: AccessDecision = '1fa') => ({ when, decision }) as Rule
const ruleWith = (p: Predicate): Rule => asRule(p)

describe('the parts themselves', () => {
  it('are two, in the order a rule is written', () => {
    /* `then` shares the Condition pane: "when this happens, do that" is one
       thought, and it had a pane of its own for exactly as long as it took to
       use one. */
    expect([...PARTS]).toEqual(['who', 'when'])
  })

  it('label the middle one Condition while its id stays when', () => {
    // The word the person asked for, over the field the model stores.
    expect(PART_LABEL.when).toBe('Condition')
    expect(PARTS[1]).toBe('when')
  })

  it('default to Who when a selection names no part', () => {
    expect(ruleAt('r1')).toEqual({ kind: 'rule', id: 'r1', part: 'who' })
    expect(ruleAt('r1', 'when')).toEqual({ kind: 'rule', id: 'r1', part: 'when' })
  })
})

describe('nextPart', () => {
  it('steps forward and back', () => {
    expect(nextPart('who', 1)).toBe('when')
    expect(nextPart('when', -1)).toBe('who')
  })

  it('wraps rather than clamping', () => {
    /* `[` and `]` are a route between parts on the keyboard, and a `]` that
       does nothing is a key that appears broken. */
    expect(nextPart('when', 1)).toBe('who')
    expect(nextPart('who', -1)).toBe('when')
  })

  it('returns to where it started after a full lap', () => {
    let p: Part = PARTS[0]
    for (let i = 0; i < PARTS.length; i++) p = nextPart(p, 1)
    expect(p).toBe(PARTS[0])
  })
})

describe('partSummary', () => {
  it('carries the outcome with the count, because they share a pane', () => {
    /* `then` stopped being a part of its own: the outcome is the second half of
       the sentence the condition starts, and one phrase says both. */
    const s = partSummary(asRule(when(), 'deny'), 'when', resolve)
    expect(s).toEqual({ text: 'Any sign-in → Deny', dim: true })
  })

  it('counts conditions, and does not count the who among them', () => {
    /* The assertion the split owes. Three leaves, one of which is the group —
       the card must say two, because the group is reported by the Who button
       directly beside it. */
    const r = ruleWith(
      when(card(cond('group', 'in', ['finance']), cond('day', 'is', ['Monday']), cond('time', 'between', ['09:00', '17:00']))),
    )
    expect(partSummary(r, 'when', resolve).text).toBe('2 conditions → Let in')
  })

  it('says any sign-in when the only condition is a who', () => {
    // A rule that names a group and nothing else tests no circumstances at all.
    const r = ruleWith(when(card(cond('group', 'in', ['finance']))))
    expect(partSummary(r, 'when', resolve)).toEqual({ text: 'Any sign-in → Let in', dim: true })
  })

  it('singularises one condition', () => {
    expect(partSummary(ruleWith(when(card(cond('day', 'is', ['Monday'])))), 'when', resolve).text).toBe(
      '1 condition → Let in',
    )
  })

  it('says Everyone, dimmed, when the rule names nobody', () => {
    expect(partSummary(ruleWith(when()), 'who', resolve)).toEqual({ text: 'Everyone', dim: true })
  })

  it('names the groups and people it does have', () => {
    const r = ruleWith(when(card(cond('group', 'in', ['finance']), cond('user', 'is', ['priya']))))
    const s = partSummary(r, 'who', resolve)
    expect(s.dim).toBe(false)
    expect(s.text).toContain('Finance')
  })

  it('marks an unresolvable id as deleted rather than printing a slug', () => {
    const r = ruleWith(when(card(cond('group', 'in', ['gone']))))
    expect(partSummary(r, 'who', resolve).text).toContain('deleted')
  })

  it('declines to summarise the who of an OR-shaped rule', () => {
    /* Two ways in means the who belongs to each alternative rather than to the
       rule, so no single phrase is true of it. The button stays and says so —
       a control that vanishes when a rule grows an OR is a card changing shape
       for a reason nobody can see. */
    const r = ruleWith(when(card(cond('group', 'in', ['finance'])), card(cond('day', 'is', ['Monday']))))
    expect(partSummary(r, 'who', resolve)).toEqual({ text: 'Per alternative', dim: true })
  })

  it('still counts the conditions of an OR-shaped rule across every alternative', () => {
    const r = ruleWith(when(card(cond('group', 'in', ['finance'])), card(cond('day', 'is', ['Monday']))))
    expect(partSummary(r, 'when', resolve).text).toBe('1 condition → Let in')
  })
})
