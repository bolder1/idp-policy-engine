import { describe, expect, it } from 'vitest'

import type { Policy, Rule } from '../data'
import { canRedo, canUndo, commit, historyOf, HISTORY_LIMIT, redo, undo } from './history'

/* -----------------------------------------------------------------------------
   Undo is the one control an administrator reaches for when they have already
   made a mistake, which means it is the one control that cannot afford to be
   approximately right. These tests hold the three properties that make it
   trustworthy: it goes back exactly one edit, redo is destroyed by a new edit
   rather than left to reapply something the user has moved past, and a no-op
   never occupies a slot in the stack.
   -------------------------------------------------------------------------- */

let seq = 0
function rule(name: string): Rule {
  seq += 1
  return {
    id: `r${seq}`,
    name,
    enabled: true,
    appliesTo: ['all'],
    conditions: [],
    decision: '2fa',
    firstFactor: 'Password',
    secondFactor: 'any',
    rememberMfa: false,
    allowDisable2fa: false,
    matchEstimate: 10,
  }
}

const policy = (rules: Rule[]): Policy => ({
  id: 'p',
  name: 'Test',
  type: 'App Access',
  appIds: ['salesforce'],
  status: 'active',
  lastModified: 'now',
  modifiedBy: 'test',
  rules,
})

describe('history', () => {
  it('starts with nowhere to go', () => {
    const h = historyOf(policy([]))
    expect(canUndo(h)).toBe(false)
    expect(canRedo(h)).toBe(false)
    // Undoing or redoing an empty stack is a no-op, not a crash.
    expect(undo(h)).toBe(h)
    expect(redo(h)).toBe(h)
  })

  it('goes back exactly one edit at a time', () => {
    const a = policy([])
    const b = policy([rule('one')])
    const c = policy([rule('one'), rule('two')])

    let h = commit(commit(historyOf(a), b), c)
    expect(h.present).toBe(c)

    h = undo(h)
    expect(h.present).toBe(b)
    h = undo(h)
    expect(h.present).toBe(a)
    expect(canUndo(h)).toBe(false)
  })

  it('redoes what it undid, in order', () => {
    const a = policy([])
    const b = policy([rule('one')])
    let h = undo(commit(historyOf(a), b))
    expect(h.present).toBe(a)
    expect(canRedo(h)).toBe(true)
    h = redo(h)
    expect(h.present).toBe(b)
    expect(canRedo(h)).toBe(false)
  })

  it('drops the redo stack once a new edit lands', () => {
    /* The alternative — keeping it — lets a user undo twice, type something,
       then redo their way into a state that never existed. */
    const a = policy([])
    const b = policy([rule('one')])
    const c = policy([rule('different')])

    const h = commit(undo(commit(historyOf(a), b)), c)
    expect(h.present).toBe(c)
    expect(canRedo(h)).toBe(false)
    // The undone edit is still reachable backwards.
    expect(undo(h).present).toBe(a)
  })

  it('ignores a commit that changes nothing', () => {
    const a = policy([rule('one')])
    const same = JSON.parse(JSON.stringify(a)) as Policy
    const h = commit(historyOf(a), same)
    expect(h.past).toHaveLength(0)
    expect(canUndo(h)).toBe(false)
  })

  it('bounds the stack without losing the current state', () => {
    let h = historyOf(policy([]))
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) h = commit(h, policy([rule(`r${i}`)]))
    expect(h.past).toHaveLength(HISTORY_LIMIT)
    // The oldest states fell off the back; the newest is still present.
    expect(h.present.rules[0].name).toBe(`r${HISTORY_LIMIT + 19}`)
  })
})
