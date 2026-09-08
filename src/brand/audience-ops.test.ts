import { describe, expect, it } from 'vitest'

import { card, cond, when } from './data'
import { leaves } from './predicate'
import { restConditions, setWho, setWhoOperator, whoEditable, whoIds, whoOperator } from './audience-ops'

/* -----------------------------------------------------------------------------
   "Who" is a VIEW of two conditions, not a second field.

   The form asks it as its own step, which is what somebody wants when they sit
   down to write a rule. The model stores it where every other reader can see
   it — the linter, the simulator, the change list, the read-back — because an
   audience held beside the conditions is a gate none of them know about, and
   that is exactly why `Rule.appliesTo` was removed.
   -------------------------------------------------------------------------- */

describe('reading who out of a predicate', () => {
  it('finds the ids a rule names, and nothing when it names none', () => {
    const p = when(card(cond('group', 'in', ['finance', 'eng']), cond('day', 'is', ['Monday'])))
    expect(whoIds(p, 'group')).toEqual(['finance', 'eng'])
    expect(whoIds(p, 'user')).toEqual([])
  })

  it('separates who from circumstance, so the two steps cannot show the same row', () => {
    const p = when(card(cond('group', 'in', ['finance']), cond('user', 'is', ['priya']), cond('day', 'is', ['Monday'])))
    expect(restConditions(p).map((c) => c.typeId)).toEqual(['day'])
  })
})

describe('writing who back', () => {
  it('adds one condition for a kind that had none', () => {
    const p = setWho(when(card(cond('day', 'is', ['Monday']))), 'group', ['finance'])
    expect(leaves(p).map((c) => `${c.typeId} ${c.operator} ${c.values}`)).toEqual(['day is Monday', 'group in finance'])
  })

  /* `group in [a]` AND `group in [b]` requires membership of BOTH, which is not
     what a list of groups means to anybody choosing one. */
  it('never grows a second condition for the same kind', () => {
    let p = setWho(when(card(cond('day', 'is', ['Monday']))), 'group', ['finance'])
    p = setWho(p, 'group', ['finance', 'eng'])
    expect(leaves(p).filter((c) => c.typeId === 'group')).toHaveLength(1)
    expect(whoIds(p, 'group')).toEqual(['finance', 'eng'])
  })

  /* An unset condition is a first-class diagnosable state and the linter
     reports it — so a rule that simply does not narrow by group must not look
     like one that meant to and did not finish. */
  it('removes the condition when the last id goes, rather than leaving it empty', () => {
    let p = setWho(when(card(cond('day', 'is', ['Monday']))), 'group', ['finance'])
    p = setWho(p, 'group', [])
    expect(leaves(p).map((c) => c.typeId)).toEqual(['day'])
    expect(leaves(p).some((c) => c.values.length === 0)).toBe(false)
  })

  it('is a no-op when there was nothing and nothing is asked for', () => {
    const p = when(card(cond('day', 'is', ['Monday'])))
    expect(JSON.stringify(setWho(p, 'user', []))).toBe(JSON.stringify(p))
  })

  it('starts the run on a catch-all rule that has no conditions yet', () => {
    const p = setWho({ cards: [] }, 'group', ['finance'])
    expect(leaves(p).map((c) => c.typeId)).toEqual(['group'])
  })

  it('keeps the operator so a narrowing can be an exclusion', () => {
    let p = setWho(when(card(cond('day', 'is', ['Monday']))), 'group', ['contractors'])
    p = setWhoOperator(p, 'group', 'not in')
    expect(whoOperator(p, 'group')).toBe('not in')
    p = setWho(p, 'group', ['contractors', 'interns'])
    expect(whoOperator(p, 'group')).toBe('not in')
  })
})

describe('when the step refuses to edit', () => {
  /* In an OR of two alternatives, "who" would have to appear in both to mean
     "these people, whichever way in they take". Putting it in one card instead
     makes it a THIRD alternative — a rule that fires for anyone in Finance
     regardless of everything else. The step says so rather than guessing. */
  it('declines a predicate with two alternatives', () => {
    expect(whoEditable(when(card(cond('day', 'is', ['Monday'])), card(cond('zone', 'in zone', ['Saturday']))))).toBe(false)
  })

  it('declines a single card whose conditions are alternatives', () => {
    expect(whoEditable({ cards: [{ ...card(cond('day', 'is', ['Monday'])), join: 'or' }] })).toBe(false)
  })

  it('accepts an AND-run and the catch-all', () => {
    expect(whoEditable(when(card(cond('day', 'is', ['Monday']))))).toBe(true)
    expect(whoEditable({ cards: [] })).toBe(true)
  })
})
