import { describe, expect, it } from 'vitest'

import { blankRule, card, cond, policies, when, type Predicate, type Rule } from '../../data'
import { PARTS, nextPart, patchRule, ruleAt, type Part } from './model'
import { PART_LABEL } from './parts'

/* -----------------------------------------------------------------------------
   The part rides on the selection.

   The property worth pinning is that `Condition` is a LABEL and
   `when` is an ID: the model field, its writer and its editor are all called
   `when`, and a fourth name for that one thing is the drift this board's
   comments spend their life undoing — but the screen has to say the word the
   person asking for it used.
   -------------------------------------------------------------------------- */

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

describe('patchRule', () => {
  const day = () => cond('day', 'is', ['Monday'])
  const shapes: [string, Predicate][] = [
    ['no conditions', when()],
    ['one card', when(card(day(), cond('time', 'between', ['09:00', '17:00'])))],
    ['two ways in', when(card(day()), card(cond('time', 'between', ['09:00', '17:00'])))],
    ['a group joined by or', { join: 'or', cards: [{ ...card(day()), grouped: true }, card(cond('device-risk', 'above', ['70']))] }],
  ]

  it('writes the who and leaves the conditions alone, whatever shape they have', () => {
    for (const [name, w] of shapes) {
      const r: Rule = { ...blankRule(name), when: w }
      const next = patchRule(r, { who: { groupIds: ['finance', 'finance'], userIds: ['priya'] } })
      expect(next.when, name).toBe(r.when)
      expect(next.who, name).toEqual({ groupIds: ['finance'], userIds: ['priya'] })
      const cleared = patchRule(next, { who: undefined })
      expect(cleared.when, name).toBe(r.when)
    }
  })

  it('takes a rule back to everyone as the same JSON as a rule that never had a who', () => {
    const r = blankRule('R')
    const round = patchRule(patchRule(r, { who: { groupIds: ['finance'], userIds: [] } }), { who: undefined })
    expect(JSON.stringify(round)).toBe(JSON.stringify(r))
    // Empty lists are everyone too.
    expect(JSON.stringify(patchRule(r, { who: { groupIds: [], userIds: [] } }))).toBe(JSON.stringify(r))
  })

  it('removing every choice and adding it back is not a change', () => {
    /* The seeded rules carry `who` before other fields. Deleting the key and
       re-adding it would move it to the end: the same rule, a different
       string, and the save bar lit on a no-op. */
    const seeded = policies.flatMap((p) => p.rules).filter((r) => r.who)
    expect(seeded.length).toBeGreaterThan(0)
    for (const r of seeded) {
      const back = patchRule(patchRule(r, { who: undefined }), { who: r.who })
      expect(JSON.stringify(back), r.name).toBe(JSON.stringify(r))
    }
  })

  it('passes any other patch straight through', () => {
    const r: Rule = { ...blankRule('R'), who: { groupIds: ['finance'], userIds: [] } }
    const next = patchRule(r, { name: 'Renamed' })
    expect(next.name).toBe('Renamed')
    expect(next.who).toBe(r.who)
    expect(next.when).toBe(r.when)
  })
})
