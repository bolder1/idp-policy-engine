import { describe, expect, it } from 'vitest'

import type { App, Policy, PolicyStatus, PolicyType, Rule } from '../data'
import { showcaseTenant } from '../fixtures'
import { attachNote, compareUpdated, existingHint, removeCopy, removeToast } from './applications-model'

let n = 0
const rule = (enabled = true): Rule =>
  ({ id: `r${++n}`, name: 'r', enabled, decision: '1fa', when: { cards: [] } }) as unknown as Rule

const policy = (
  name: string,
  over: { status?: PolicyStatus; appIds?: string[]; rules?: Rule[]; type?: PolicyType; pendingDraft?: Policy['pendingDraft'] } = {},
): Policy =>
  ({
    id: name,
    name,
    type: over.type ?? 'App Access',
    status: over.status ?? 'active',
    appIds: over.appIds ?? ['gh'],
    rules: over.rules ?? [rule()],
    ...(over.pendingDraft ? { pendingDraft: over.pendingDraft } : {}),
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
    expect(removeCopy(p, gh).policy).toBe('Notice period stays on 1 other application.')
  })

  it('says it becomes a draft only when this was its last application', () => {
    const p = policy('Solo', { appIds: ['gh'] })
    expect(removeCopy(p, gh).policy).toBe('Solo becomes a draft. Its rules are kept.')
  })

  it('does not say a draft becomes a draft', () => {
    const p = policy('Solo', { appIds: ['gh'], status: 'draft' })
    expect(removeCopy(p, gh).policy).toBe('Solo is left with no applications. It stays a draft.')
  })

  it('says a saved draft replaces the published rules when the last application goes', () => {
    /* The store settles a published policy with no applications onto its
       saved draft (fixtures.ts `settled`), so "its rules are kept" would be
       wrong about which rules. */
    const p = policy('Solo', { appIds: ['gh'], pendingDraft: { rules: [rule()], savedAt: 'now', savedBy: 'You' } })
    expect(removeCopy(p, gh).policy).toBe('Solo becomes a draft. Its saved draft replaces the published rules.')
  })

  it('keeps no sentence about sign-ins: the dialog lists who moves instead', () => {
    expect(Object.keys(removeCopy(policy('Solo'), gh))).toEqual(['policy'])
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
  it('keeps draft, inactive, monitoring and another type apart', () => {
    expect(attachNote(policy('P'), 'GitHub')).toBe('Takes effect on the next sign-in to GitHub.')
    expect(attachNote(policy('P', { status: 'draft' }), 'GitHub')).toBe('P is a draft, so nothing changes for users yet.')
    expect(attachNote(policy('P', { status: 'inactive' }), 'GitHub')).toBe('P is inactive, so nothing changes for users yet.')
    expect(attachNote(policy('P', { status: 'monitor' }), 'GitHub')).toBe('P is monitoring, so nothing changes for users yet.')
    expect(attachNote(policy('P', { type: 'Session' }), 'GitHub')).toBe('P is not an app access policy, so nothing changes for users.')
  })

  it('says a live policy with no rule turned on takes effect: it decides by its last row', () => {
    expect(attachNote(policy('P', { rules: [rule(false)] }), 'GitHub')).toBe('Takes effect on the next sign-in to GitHub.')
    expect(attachNote(policy('P', { rules: [] }), 'GitHub')).toBe('Takes effect on the next sign-in to GitHub.')
  })

  /* With the lists, the note is the app page's answer: Add existing there
     reads "Never decides" for the same pick. */
  describe('on the showcase, asked of the engine', () => {
    const t = showcaseTenant()
    const byName = (name: string) => t.policies.find((p) => p.name === name)!
    const github = t.apps.find((a) => a.id === 'github')!
    const on = { appId: 'github', policies: t.policies, users: t.directory.people, apps: t.apps }

    it('says AWS production for DevOps never decides on GitHub: Developer tools decides for DevOps there', () => {
      expect(attachNote(byName('AWS production for DevOps'), github.name, on)).toBe(
        `AWS production for DevOps never decides on ${github.name}, so nothing changes for users.`,
      )
    })

    it('still says a pick that decides takes effect, and keeps the status reasons', () => {
      expect(attachNote(byName('Slack for everyone'), github.name, on)).toBe(`Takes effect on the next sign-in to ${github.name}.`)
      expect(attachNote(byName('Code review for Finance'), github.name, on)).toBe(
        'Code review for Finance is a draft, so nothing changes for users yet.',
      )
    })
  })
})

describe('existingHint', () => {
  it('gives the reason that is true of the tenant', () => {
    expect(existingHint(2, 5)).toBe('Adds this application. The policy keeps its others.')
    expect(existingHint(0, 0)).toBe('No other policies yet.')
    expect(existingHint(0, 3)).toBe('Every policy is already on this application.')
  })
})
