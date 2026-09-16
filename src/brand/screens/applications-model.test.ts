import { describe, expect, it } from 'vitest'

import type { App, Policy, PolicyStatus, Rule } from '../data'
import { attachNote, compareUpdated, existingHint, nextDecider, removeCopy, removeToast } from './applications-model'

let n = 0
const rule = (enabled = true): Rule =>
  ({ id: `r${++n}`, name: 'r', enabled, decision: '1fa', when: { cards: [] } }) as unknown as Rule

const policy = (name: string, over: { status?: PolicyStatus; appIds?: string[]; rules?: Rule[] } = {}): Policy =>
  ({
    id: name,
    name,
    type: 'App Access',
    status: over.status ?? 'active',
    appIds: over.appIds ?? ['gh'],
    rules: over.rules ?? [rule()],
  }) as unknown as Policy

const app = (name: string, lastUpdated: string) => ({ id: name.toLowerCase(), name, lastUpdated }) as App
const gh = { id: 'gh', name: 'GitHub' }

describe('compareUpdated', () => {
  it('sorts by the timestamp, not by list order, and breaks ties by name', () => {
    const list = [
      app('Salesforce', 'Aug 14, 2026, 14:25:51'),
      app('Workday', 'Aug 02, 2026, 09:10:00'),
      app('Jira', 'Jun 09, 2026, 11:00:00'),
      app('Box', 'Aug 02, 2026, 09:10:00'),
    ]
    expect([...list].sort(compareUpdated).map((a) => a.name)).toEqual(['Jira', 'Box', 'Workday', 'Salesforce'])
  })
})

describe('removeCopy', () => {
  it('says the policy stays on its other applications when it has some', () => {
    const p = policy('Notice period', { appIds: ['gh', 'aws'] })
    expect(removeCopy(p, gh, [p]).policy).toBe('Notice period stays on 1 other application.')
  })

  it('says it becomes a draft only when this was its last application', () => {
    const p = policy('Solo', { appIds: ['gh'] })
    expect(removeCopy(p, gh, [p]).policy).toBe('Solo becomes a draft. Its rules are kept.')
  })

  it('does not say a draft becomes a draft', () => {
    const p = policy('Solo', { appIds: ['gh'], status: 'draft' })
    expect(removeCopy(p, gh, [p]).policy).toBe('Solo is left with no applications. It stays a draft.')
  })

  it('names the next deciding policy below', () => {
    const a = policy('A')
    const off = policy('Off', { status: 'inactive' })
    const b = policy('B')
    expect(nextDecider(a, [a, off, b])?.name).toBe('B')
    expect(removeCopy(a, gh, [a, off, b]).signIns).toBe('Sign-ins it was deciding fall to B.')
  })

  it('does not claim the tenant default is all that is left when a policy above still decides', () => {
    const above = policy('Above')
    const last = policy('Last')
    expect(removeCopy(last, gh, [above, last]).signIns).toBe(
      'Sign-ins it was deciding fall to the tenant default. 1 other policy stays on GitHub.',
    )
  })

  it('says the tenant default is all that is left only when nothing else decides', () => {
    const only = policy('Only')
    expect(removeCopy(only, gh, [only, policy('Draft', { status: 'draft' })]).signIns).toBe(
      'GitHub is left with the tenant default only.',
    )
  })

  it('says sign-ins do not change when the policy decides nothing', () => {
    const d = policy('Draft', { status: 'draft' })
    expect(removeCopy(d, gh, [d]).signIns).toBe("It decides nothing on GitHub today, so sign-ins don't change.")
  })
})

describe('removeToast', () => {
  it('uses a noun with the count', () => {
    expect(removeToast('P', 'GitHub', 0)).toBe('P removed from GitHub. It is now a draft.')
    expect(removeToast('P', 'GitHub', 1)).toBe('P removed from GitHub. Still on 1 application.')
    expect(removeToast('P', 'GitHub', 3)).toBe('P removed from GitHub. Still on 3 applications.')
    expect(removeToast('P', 'GitHub', 0, true)).toBe('P removed from GitHub. It has no applications now.')
  })
})

describe('attachNote', () => {
  it('keeps draft, inactive and no-rules apart', () => {
    expect(attachNote(policy('P'), 'GitHub')).toBe('Takes effect on the next sign-in to GitHub.')
    expect(attachNote(policy('P', { status: 'draft' }), 'GitHub')).toBe('P is a draft, so nothing changes for users yet.')
    expect(attachNote(policy('P', { status: 'inactive' }), 'GitHub')).toBe('P is inactive, so nothing changes for users yet.')
    expect(attachNote(policy('P', { rules: [rule(false)] }), 'GitHub')).toBe(
      'P has no rules turned on, so nothing changes for users yet.',
    )
  })
})

describe('existingHint', () => {
  it('gives the reason that is true of the tenant', () => {
    expect(existingHint(2, 5)).toBe('Adds this application. The policy keeps its others.')
    expect(existingHint(0, 0)).toBe('No other policies yet.')
    expect(existingHint(0, 3)).toBe('Every policy is already on this application.')
  })
})
