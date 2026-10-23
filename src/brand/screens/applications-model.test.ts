import { describe, expect, it } from 'vitest'

import type { App, Policy, PolicyStatus, PolicyType, Rule } from '../data'
import { showcaseTenant } from '../fixtures'
import { attachNote, compareUpdated, existingHint, removeCopy, removeToast, replaceCopy, replaceOnApp, replaceToast, type PolicyWriter } from './applications-model'

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

/* Replace policy (APP-POLICY-TAB.md §5): one write, one toast, one Undo that puts both policies back — the store keeps
   one toast, so a toast per write left only the removal's, whose Undo put two policies on the application. */
describe('replaceOnApp', () => {
  const apps = [{ id: 'gh', name: 'GitHub' }, { id: 'jira', name: 'Jira' }] as App[]
  const writer = (start: Policy[]) => {
    const live = new Map(start.map((p) => [p.id, p]))
    const toasts: { text: string; action?: { label: string; run: () => void } }[] = []
    const store: PolicyWriter = {
      policyById: (id) => live.get(id),
      savePolicy: (p) => void live.set(p.id, p),
      showToast: (text, action) => void toasts.push({ text, action }),
    }
    return { store, live, toasts }
  }

  it('swaps the policies in one press and says so once, with an Undo that restores both', () => {
    const old = policy('Old', { appIds: ['gh'] })
    const next = policy('New', { appIds: ['jira'] })
    const { store, live, toasts } = writer([old, next])
    expect(replaceOnApp(store, 'Old', 'New', apps[0], apps)).toBe(true)
    expect(live.get('New')!.appIds).toEqual(['jira', 'gh'])
    expect(live.get('Old')).toMatchObject({ appIds: [], status: 'draft' })
    expect(toasts.map((x) => x.text)).toEqual(['Replaced Old with New on GitHub. Old is now a draft.'])
    toasts[0].action!.run()
    expect(live.get('Old')).toBe(old)
    expect(live.get('New')).toBe(next)
  })

  it('undoes neither when either has changed since', () => {
    const { store, live, toasts } = writer([policy('Old', { appIds: ['gh', 'jira'] }), policy('New', { appIds: [] })])
    replaceOnApp(store, 'Old', 'New', apps[0], apps)
    expect(toasts[0].text).toBe('Replaced Old with New on GitHub. Old is still on 1 application.')
    const renamed = { ...live.get('New')!, name: 'Renamed' }
    store.savePolicy(renamed)
    toasts[0].action!.run()
    expect(live.get('New')).toBe(renamed)
    expect(live.get('Old')!.appIds).toEqual(['jira'])
    expect(toasts.at(-1)!.text).toBe("Can't undo. New or Old has changed since.")
  })

  it('writes nothing for a policy that no longer exists', () => {
    const { store, toasts } = writer([policy('Old')])
    expect(replaceOnApp(store, 'Old', 'Gone', apps[0], apps)).toBe(false)
    expect(toasts).toEqual([])
    expect(replaceToast('A', 'B', 'GitHub', 0, true)).toBe('Replaced A with B on GitHub. A has no applications now.')
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
    /* One app has one policy in the showcase; the second ones are built from the merged policies. */
    const devops: Policy = { ...byName('AWS access'), id: 'p-aws-prod', name: 'AWS production for DevOps', audience: { everyone: false, groupIds: ['devops'], userIds: [] } }
    const draft: Policy = { ...byName('Developer tools — office and device checks'), id: 'p-code-review', name: 'Code review for Finance', status: 'draft' }
    const github = t.apps.find((a) => a.id === 'github')!
    const on = { appId: 'github', policies: t.policies, users: t.directory.people, apps: t.apps }

    it('says AWS production for DevOps never decides on GitHub: Developer tools decides for DevOps there', () => {
      expect(attachNote(devops, github.name, { ...on, policies: [...t.policies, devops] })).toBe(
        `AWS production for DevOps never decides on ${github.name}, so nothing changes for users.`,
      )
    })

    it('still says a pick that decides takes effect, and keeps the status reasons', () => {
      expect(attachNote(byName('Slack access'), github.name, on)).toBe(`Takes effect on the next sign-in to ${github.name}.`)
      expect(attachNote(draft, github.name, { ...on, policies: [...t.policies, draft] })).toBe(
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

describe('replaceCopy', () => {
  /* Replace writes a removal and an add in one press. The add always had a
     sentence (`attachNote`); the removal had none until the toast, by which
     time both writes had already happened. These pin the two things that were
     lost silently: the old policy's published rules, and the application's
     protection. */

  it("says what becomes of the policy coming off, in the remove dialog's words", () => {
    /* Reused, not restated: a second copy of this sentence would drift from
       the one the remove dialog shows for the same write. */
    const off = policy('Box access', { appIds: ['gh', 'aws'] })
    expect(replaceCopy(off, policy('Box contractors'), gh).policy).toBe(removeCopy(off, gh).policy)
  })

  it('warns that a saved draft replaces the published rules when this was the last application', () => {
    const off = policy('Solo', { appIds: ['gh'], pendingDraft: { rules: [rule()], savedAt: 'now', savedBy: 'You' } })
    expect(replaceCopy(off, policy('New'), gh).policy).toBe('Solo becomes a draft. Its saved draft replaces the published rules.')
  })

  it('says the application falls back when the replacement does not decide and the one coming off did', () => {
    const off = policy('AWS access')
    const on = policy('Code review', { status: 'draft' })
    expect(replaceCopy(off, on, gh, 'Global Default Policy').protection).toBe(
      'AWS access decides sign-ins to GitHub today. Code review does not, so GitHub falls back to Global Default Policy.',
    )
  })

  it('says nothing about protection when the replacement decides too', () => {
    expect(replaceCopy(policy('AWS access'), policy('AWS contractors'), gh).protection).toBeNull()
  })

  it('says nothing about protection when the one coming off was not deciding either', () => {
    /* Nothing was protecting the application, so nothing is being lost. */
    expect(replaceCopy(policy('Old', { status: 'inactive' }), policy('New', { status: 'draft' }), gh).protection).toBeNull()
  })
})
