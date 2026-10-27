import { describe, expect, it } from 'vitest'

import { EVERYONE, audienceOf, type App, type Policy, type PolicyStatus, type PolicyType, type Rule } from '../data'
import { settled, showcaseTenant } from '../fixtures'
import { REPLACE_MAKES_DRAFT, REPLACE_RUNS_CHECKS, ownerOf, policiesForApp } from './app-policies'
import {
  attachNote,
  compareUpdated,
  existingHint,
  removeCopy,
  removeToast,
  replaceCopy,
  replaceFacts,
  replaceOnApp,
  replaceTitle,
  replaceToast,
  replaceTone,
  REPLACE_TOAST_TONE,
  type PolicyWriter,
} from './applications-model'

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
  type Shown = { text: string; action?: { label: string; run: () => void }; tone?: string }
  const writer = (start: Policy[]) => {
    const live = new Map(start.map((p) => [p.id, p]))
    const toasts: Shown[] = []
    let writes = 0
    const store: PolicyWriter = {
      policyById: (id) => live.get(id),
      savePolicy: (p) => {
        writes += 1
        live.set(p.id, p)
      },
      showToast: (text, action, opts) => void toasts.push({ text, action, tone: opts?.tone }),
    }
    return { store, live, toasts, writes: () => writes, on: (appId: string) => policiesForApp(appId, [...live.values()]).map((p) => p.id) }
  }

  it('swaps the policies in one press and says so once, with an Undo that restores both', () => {
    const old = policy('Old', { appIds: ['gh'] })
    const next = policy('New', { appIds: ['jira'] })
    const { store, live, toasts } = writer([old, next])
    expect(replaceOnApp(store, 'Old', 'New', apps[0], apps)).toBe(true)
    expect(live.get('New')!.appIds).toEqual(['jira', 'gh'])
    expect(live.get('Old')).toMatchObject({ appIds: [], status: 'draft' })
    expect(toasts.map((x) => x.text)).toEqual(['New now decides sign-ins on GitHub. Old is now a draft.'])
    toasts[0].action!.run()
    expect(live.get('Old')).toBe(old)
    expect(live.get('New')).toBe(next)
  })

  it('undoes neither when either has changed since', () => {
    const { store, live, toasts } = writer([policy('Old', { appIds: ['gh', 'jira'] }), policy('New', { appIds: [] })])
    replaceOnApp(store, 'Old', 'New', apps[0], apps)
    /* Still on Jira: nothing happened to Old the admin needs telling, so the toast says only what decides now. */
    expect(toasts[0].text).toBe('New now decides sign-ins on GitHub.')
    const renamed = { ...live.get('New')!, name: 'Renamed' }
    store.savePolicy(renamed)
    toasts[0].action!.run()
    expect(live.get('New')).toBe(renamed)
    expect(live.get('Old')!.appIds).toEqual(['jira'])
    expect(toasts.at(-1)!.text).toBe("Can't undo. New or Old has changed since.")
  })

  it('writes nothing for a policy that no longer exists', () => {
    const { store, toasts, writes } = writer([policy('Old')])
    expect(replaceOnApp(store, 'Old', 'Gone', apps[0], apps)).toBe(false)
    expect(toasts).toEqual([])
    expect(writes()).toBe(0)
  })

  /* The blocker of the 24 Oct review: the press reads the truth, not the confirm's render. */
  it('refuses, writing nothing and saying nothing, when the policy coming off is no longer on the application', () => {
    const cases: [string, Policy[]][] = [
      ['moved off since', [policy('Old', { appIds: ['jira'] }), policy('New', { appIds: [] })]],
      ['deleted since', [policy('New', { appIds: [] })]],
      ['the tenant default', [{ ...policy('Old', { appIds: [] }), isSystem: true } as Policy, policy('New', { appIds: [] })]],
    ]
    for (const [why, start] of cases) {
      const { store, toasts, writes } = writer(start)
      expect(replaceOnApp(store, 'Old', 'New', apps[0], apps), why).toBe(false)
      expect([writes(), toasts.length], why).toEqual([0, 0])
    }
    /* Nor onto itself. */
    const same = writer([policy('Old')])
    expect(replaceOnApp(same.store, 'Old', 'Old', apps[0], apps)).toBe(false)
    expect(same.writes()).toBe(0)
  })

  it('never leaves two policies on one application: a second replace made after the first was undone is refused', () => {
    /* Replace A with B on GitHub; open Replace again (B coming off, C going on); the first toast's Undo puts A back and
       takes B off while that confirm is up; then its Replace is pressed. */
    const { store, toasts, on } = writer([policy('A'), policy('B', { appIds: ['jira'] }), policy('C', { appIds: [] })])
    expect(replaceOnApp(store, 'A', 'B', apps[0], apps)).toBe(true)
    expect(on('gh')).toEqual(['B'])
    toasts[0].action!.run()
    expect(on('gh')).toEqual(['A'])
    expect(replaceOnApp(store, 'B', 'C', apps[0], apps)).toBe(false)
    expect(on('gh')).toEqual(['A'])
    expect(toasts).toHaveLength(1)
    /* Asked about the policy that IS on it, the swap goes through, and GitHub still holds one. */
    expect(replaceOnApp(store, 'A', 'C', apps[0], apps)).toBe(true)
    expect(on('gh')).toEqual(['C'])
  })

  it('makes a second press of the same confirm a no-op, so the first toast and its Undo stand', () => {
    const old = policy('Old')
    const { store, toasts, on, live } = writer([old, policy('New', { appIds: [] })])
    expect(replaceOnApp(store, 'Old', 'New', apps[0], apps)).toBe(true)
    expect(replaceOnApp(store, 'Old', 'New', apps[0], apps)).toBe(false)
    expect(toasts).toHaveLength(1)
    expect(on('gh')).toEqual(['New'])
    toasts[0].action!.run()
    expect(live.get('Old')).toBe(old)
    expect(on('gh')).toEqual(['Old'])
  })

  /* Duplicate for {app} parks a draft copy on the application; Replace with that copy is how it is put in charge. */
  it('puts a draft already on the application in charge: nothing to attach, the old one comes off, and Undo puts it back', () => {
    const old = policy('Old')
    const copy = policy('Copy', { status: 'draft' })
    const { store, live, toasts, on } = writer([old, copy])
    expect(on('gh')).toEqual(['Old', 'Copy'])
    expect(replaceOnApp(store, 'Old', 'Copy', apps[0], apps)).toBe(true)
    expect(live.get('Copy')).toBe(copy)
    expect(on('gh')).toEqual(['Copy'])
    /* A draft decides nobody's sign-in, so it is not said to. */
    expect(toasts[0].text).toBe('Copy is now the policy on GitHub. Old is now a draft.')
    toasts[0].action!.run()
    expect(live.get('Old')).toBe(old)
    expect(on('gh')).toEqual(['Old', 'Copy'])
  })

  it('gives its toast one tone, and hands focus back once an Undo has put both back', () => {
    let undone = 0
    const { store, toasts } = writer([policy('Old'), policy('New', { appIds: [] })])
    replaceOnApp(store, 'Old', 'New', apps[0], apps, { decides: false, afterUndo: () => (undone += 1) })
    expect(toasts[0]).toMatchObject({ text: 'New is now the policy on GitHub. Old is now a draft.', tone: REPLACE_TOAST_TONE })
    expect(REPLACE_TOAST_TONE).toBe('success')
    expect(undone).toBe(0)
    toasts[0].action!.run()
    expect(undone).toBe(1)
    /* An Undo that cannot run moves nothing, focus included. */
    const later = writer([policy('Old'), policy('New', { appIds: [] })])
    replaceOnApp(later.store, 'Old', 'New', apps[0], apps, { afterUndo: () => (undone += 1) })
    later.store.savePolicy({ ...later.live.get('New')!, name: 'Renamed' })
    later.toasts[0].action!.run()
    expect(undone).toBe(1)
  })
})

describe('replaceToast', () => {
  it('says what decides now, once, and the old policy only when it became a draft', () => {
    expect(replaceToast('Slack access', 'Box', { decides: true, oldName: 'Box access', oldNowDraft: true })).toBe(
      'Slack access now decides sign-ins on Box. Box access is now a draft.',
    )
    expect(replaceToast('Box access', 'Outlook', { decides: true, oldName: 'Device compliance', oldNowDraft: false })).toBe(
      'Box access now decides sign-ins on Outlook.',
    )
    expect(replaceToast('HRMS access', 'Box', { decides: false, oldName: 'Box access', oldNowDraft: true })).toBe(
      'HRMS access is now the policy on Box. Box access is now a draft.',
    )
  })

  it('never counts the applications the confirm named, and names each policy at most once', () => {
    const said = replaceToast('New', 'GitHub', { decides: true, oldName: 'Old', oldNowDraft: true })
    expect(said).not.toMatch(/\d/)
    expect(said.split('New').length - 1).toBe(1)
    expect(said.split('Old').length - 1).toBe(1)
  })
})

describe('replaceOnApp, against the store', () => {
  const apps = [{ id: 'gh', name: 'GitHub' }, { id: 'jira', name: 'Jira' }] as App[]

  /* Option A (owner, 24 Oct 2026: "one confirm that swaps it live on this app, with Undo"). The writer settles every
     save as the store does (fixtures.ts `settled`), so the swap demotes the old policy onto its saved draft for real —
     and the Undo has to bring back what that threw away: its status, its PUBLISHED rules and the saved draft itself. */
  it('swaps live and leaves the application one policy; Undo restores both exactly, published rules and all', () => {
    const published = [rule(), rule()]
    const saved = [rule()]
    const old = policy('Old', { appIds: ['gh'], rules: published, pendingDraft: { rules: saved, savedAt: 'now', savedBy: 'You' } })
    const next = policy('New', { appIds: ['jira'] })
    const live = new Map([old, next].map((p) => [p.id, p]))
    const toasts: { text: string; action?: { label: string; run: () => void } }[] = []
    const store: PolicyWriter = {
      policyById: (id) => live.get(id),
      savePolicy: (p) => void live.set(p.id, settled(p)),
      showToast: (text, action) => void toasts.push({ text, action }),
    }
    const all = () => [...live.values()]

    expect(ownerOf('gh', all())?.id).toBe('Old')
    expect(replaceOnApp(store, 'Old', 'New', apps[0], apps)).toBe(true)
    /* One application, one policy (14 Oct 2026): the new one alone, never both, never none. */
    expect(policiesForApp('gh', all()).map((p) => p.id)).toEqual(['New'])
    expect(live.get('New')!.appIds).toEqual(['jira', 'gh'])
    expect(live.get('Old')).toMatchObject({ appIds: [], status: 'draft', rules: saved })
    expect(live.get('Old')!.pendingDraft).toBeUndefined()
    expect(toasts).toHaveLength(1)
    expect(toasts[0].action?.label).toBe('Undo')

    toasts[0].action!.run()
    expect(live.get('Old')).toBe(old)
    expect(live.get('New')).toBe(next)
    expect(live.get('Old')).toMatchObject({ status: 'active', appIds: ['gh'], rules: published })
    expect(live.get('Old')!.pendingDraft?.rules).toBe(saved)
    expect(policiesForApp('gh', all()).map((p) => p.id)).toEqual(['Old'])
  })
})

/* The Replace confirm's facts (replace-dialog.tsx). Asked of the engine on the showcase, where Box has Box access. */
describe('replaceFacts', () => {
  const t = showcaseTenant()
  const byName = (name: string) => t.policies.find((p) => p.name === name)!
  const box = t.apps.find((a) => a.id === 'box')!
  const tenant = { policies: t.policies, apps: t.apps, users: t.directory.people, groups: t.groups }
  const boxAccess = byName('Box access')
  const with_ = (p: Policy) => ({ ...tenant, policies: [...t.policies.filter((x) => x.id !== p.id), p] })

  it('reads from the policy coming off to the one going on, and names the applications each keeps', () => {
    const slack = byName('Slack access')
    const f = replaceFacts(boxAccess, slack, box, tenant)
    /* Box access is on Box alone, so it becomes a draft; Slack access is on Slack, which keeps it. */
    expect(f.off).toEqual({ kind: 'draft', rulesGo: false })
    expect(f.alsoOn.map((a) => a.id)).toEqual(['slack'])
    expect(f.until).toBeNull()
    /* Slack access is for everyone, so everybody Box access decided for lands on it: nobody is left over. */
    expect(f.rest).toEqual([])
    expect([f.moves, f.drops]).toEqual([true, false])
  })

  /* Review, 24 Oct 2026: a policy that decides for SOME of the people the old one did leaves the rest to the next
     policy, and the card said nothing about them. Read as RemoveDialog reads its targets. */
  it('says where everybody the new policy does not name goes, by the policy they land on', () => {
    const forEveryone = { ...boxAccess, audience: EVERYONE }
    const engineersOnly = { ...byName('Slack access'), audience: audienceOf(['engineering']) }
    const both = { ...tenant, policies: t.policies.map((x) => (x.id === forEveryone.id ? forEveryone : x.id === engineersOnly.id ? engineersOnly : x)) }
    const f = replaceFacts(forEveryone, engineersOnly, box, both)
    expect(f.until).toBeNull()
    expect(f.rest.map((p) => p.isSystem)).toEqual([true])
    expect([f.moves, f.drops]).toEqual([true, false])
    /* Box access names Engineering and Design; AWS access names Engineering, not Design, so Design falls through. */
    expect(replaceFacts(boxAccess, byName('AWS access'), box, tenant).rest.map((p) => p.isSystem)).toEqual([true])
    /* Nothing is left over when the new one decides for nobody: `until` already says where everybody goes. */
    expect(replaceFacts(boxAccess, byName('HRMS access from corporate offices'), box, tenant).rest).toEqual([])
  })

  it('says a policy stands in front of the new one only when one does', () => {
    /* Live and naming nobody the directory has: shadowed by nothing, so what decides is the fall-through, not a
       policy that "decides first". */
    const nobody = { ...byName('Slack access'), audience: audienceOf([]) }
    const f = replaceFacts(boxAccess, nobody, box, with_(nobody))
    expect(f.until).toMatchObject({ state: 'never', ahead: false })
    expect(f.until?.next?.isSystem).toBe(true)
  })

  it('says the old policy stays on its other applications, by the applications themselves', () => {
    const shared = { ...boxAccess, appIds: ['box', 'slack', 'github'] }
    const f = replaceFacts(shared, byName('AWS access'), box, with_(shared))
    expect(f.off).toMatchObject({ kind: 'stays', count: 2 })
    /* In the catalogue's order, as `appsOf` gives every list of a policy's applications. */
    expect(f.off.kind === 'stays' && f.off.apps.map((a) => a.id)).toEqual(t.apps.filter((a) => a.id === 'slack' || a.id === 'github').map((a) => a.id))
  })

  it("takes removeCopy's branches, so the confirm and the remove dialog cannot disagree about the old policy", () => {
    const cases: Policy[] = [
      { ...boxAccess, appIds: ['box', 'slack'] },
      { ...boxAccess, status: 'draft' },
      { ...boxAccess, pendingDraft: { rules: [rule()], savedAt: 'now', savedBy: 'You' } },
      { ...boxAccess },
    ]
    const said = cases.map((p) => {
      const off = replaceFacts(p, byName('Slack access'), box, with_(p)).off
      return off.kind === 'stays' ? 'stays' : off.kind === 'left' ? 'left' : off.rulesGo ? 'rules go' : 'draft'
    })
    expect(said).toEqual(['stays', 'left', 'rules go', 'draft'])
    expect(cases.map((p) => removeCopy(p, box).policy)).toEqual([
      'Box access stays on 1 other application.',
      'Box access is left with no applications. It stays a draft.',
      'Box access becomes a draft. Its saved draft replaces the published rules.',
      'Box access becomes a draft. Its rules are kept.',
    ])
  })

  it('says why a policy going on decides nothing, and that the Global Default decides meanwhile', () => {
    const hrms = byName('HRMS access from corporate offices')
    const f = replaceFacts(boxAccess, hrms, box, tenant)
    expect(f.until?.state).toBe('inactive')
    expect(f.until?.next?.isSystem).toBe(true)
    /* Box access decided on Box and an inactive policy will not: the swap drops Box's own protection. */
    expect([f.moves, f.drops]).toEqual([true, true])
    for (const status of ['draft', 'monitor'] as const) {
      const p = { ...byName('Slack access'), status }
      expect(replaceFacts(boxAccess, p, box, with_(p)).until?.state).toBe(status)
    }
  })

  it('moves nobody when neither policy decides here', () => {
    const off = { ...boxAccess, status: 'inactive' as const }
    const p = { ...byName('Slack access'), status: 'draft' as const }
    const f = replaceFacts(off, p, box, { ...tenant, policies: t.policies.map((x) => (x.id === off.id ? off : x.id === p.id ? p : x)) })
    expect([f.moves, f.drops]).toEqual([false, false])
  })
})

describe('the Replace confirm', () => {
  it('is titled by the application alone, never by a policy name', () => {
    expect(replaceTitle({ name: 'Box' })).toBe('Replace on Box?')
  })

  it('is red only when the swap leaves the application with nothing of its own deciding', () => {
    expect(replaceTone({ moves: true, drops: true })).toEqual({ tone: 'warning', destructive: true })
    expect(replaceTone({ moves: true, drops: false })).toEqual({ tone: 'warning', destructive: false })
    expect(replaceTone({ moves: false, drops: false })).toEqual({ tone: 'info', destructive: false })
  })

  it('is the live swap, with no draft copy and no Before saving page (owner, 24 Oct 2026, option A)', () => {
    expect(REPLACE_MAKES_DRAFT).toBe(false)
    expect(REPLACE_RUNS_CHECKS).toBe(false)
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
