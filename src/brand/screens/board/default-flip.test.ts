import { describe, expect, it } from 'vitest'

import { blankPolicy, fallbackRule, rule, type Policy } from '../../data'
import { hasUnsavedChanges } from '../../policy-draft'
import { adminFallback, defaultFlip, withFlip } from './default-flip'

/* The default's turn (default-flip.ts). The rollout gate is passed in, so both sides are read here: tests run with no
   line signed in, where `defaultFlips` is off. */

const one = rule({ name: 'Office', decision: '1fa' })
const empty = (): Policy => blankPolicy('Test')
const withRule = (p: Policy): Policy => ({ ...p, rules: [one] })

describe('the default turns with the first rule', () => {
  it('turns an untouched Allow to Deny at the first rule, marked as the builder’s', () => {
    const before = empty()
    const after = withRule(before)
    expect(defaultFlip(before, after, true)).toBe('to-deny')
    expect(withFlip(after, 'to-deny').fallback).toMatchObject({ decision: 'deny', setBy: 'auto' })
  })

  it('turns it back to Allow when the last rule goes, leaving the default exactly as it was', () => {
    const start = empty()
    const denied = withFlip(withRule(start), 'to-deny')
    const cleared = { ...denied, rules: [] }
    expect(defaultFlip(denied, cleared, true)).toBe('to-allow')
    expect(JSON.stringify(withFlip(cleared, 'to-allow').fallback)).toBe(JSON.stringify(start.fallback))
  })

  it('never turns a default the admin chose', () => {
    const chosen = { ...empty(), fallback: adminFallback(fallbackRule(), { decision: 'deny' }, true) }
    expect(chosen.fallback?.setBy).toBe('admin')
    expect(defaultFlip(chosen, withRule(chosen), true)).toBeNull()
    const keptAllow = { ...withRule(empty()), fallback: { ...fallbackRule(), setBy: 'admin' as const } }
    expect(defaultFlip(keptAllow, { ...keptAllow, rules: [] }, true)).toBeNull()
  })

  it('leaves a default an edit wrote itself, the Global Default, and a post sign-in policy', () => {
    const before = empty()
    expect(defaultFlip(before, { ...withRule(before), fallback: fallbackRule('2fa') }, true)).toBeNull()
    expect(defaultFlip({ ...before, isSystem: true }, { ...withRule(before), isSystem: true }, true)).toBeNull()
    expect(defaultFlip({ ...before, type: 'Session' }, { ...withRule(before), type: 'Session' }, true)).toBeNull()
  })

  it('does nothing between two rule counts above zero, or with the gate off', () => {
    const two = withFlip(withRule(empty()), 'to-deny')
    expect(defaultFlip(two, { ...two, rules: [one, one] }, true)).toBeNull()
    expect(defaultFlip(empty(), withRule(empty()), false)).toBeNull()
  })

  it('never counts the marker alone as an unsaved change', () => {
    const p = empty()
    expect(hasUnsavedChanges(p, { rules: p.rules, fallback: { ...fallbackRule(), ...p.fallback, setBy: 'admin' } })).toBe(false)
    expect(hasUnsavedChanges(p, { rules: p.rules, fallback: { ...fallbackRule(), ...p.fallback, decision: 'deny' } })).toBe(true)
  })

  it('marks a hand edit as the admin’s only when it changes something', () => {
    const fb = fallbackRule()
    expect(adminFallback(fb, { decision: '1fa' }, true).setBy).toBeUndefined()
    expect(adminFallback(fb, { decision: 'deny' }, true).setBy).toBe('admin')
    expect(adminFallback(fb, { decision: 'deny' }, false).setBy).toBeUndefined()
  })
})
