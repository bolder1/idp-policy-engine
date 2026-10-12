import { describe, expect, it } from 'vitest'

import { blankPolicy, type Policy, type User } from '../data'
import { showcaseTenant } from '../fixtures'
import {
  NO_POLICY,
  alsoTip,
  appGroupRows,
  appUserRows,
  filterUserRows,
  groupNamesOf,
  namesUser,
  policyFilterOptions,
  searchGroupRows,
  sortGroupRows,
  sortUserRows,
  userApps,
  withGroupOption,
} from './app-people-tabs-model'
import { appStanding } from './app-standing'

/* -----------------------------------------------------------------------------
   The application page's Users and Groups tabs, and the user drawer, as rows,
   on the showcase tenant's own collisions (showcase-seed.ts): Slack's group
   policy over its Everyone policy, AWS production for DevOps shadowed by AWS
   for engineering teams, and Tanmay Joshi in both Box policies' groups.
   -------------------------------------------------------------------------- */

const t = showcaseTenant()
const people = t.directory.people
const person = (id: string) => people.find((u) => u.id === id)!
const users = (appId: string, policies: readonly Policy[] = t.policies) => appUserRows(appId, policies, people, t.groups)
const userRow = (appId: string, id: string) => users(appId).find((r) => r.user.id === id)!
const groupRows = (appId: string, policies: readonly Policy[] = t.policies) => appGroupRows(appId, policies, people, t.groups)

describe('Users tab rows', () => {
  it('lists every person in the directory, whatever names them', () => {
    expect(users('slack').map((r) => r.user.id)).toEqual(people.map((u) => u.id))
  })

  it('names the policy the engine picks for each person', () => {
    expect(userRow('slack', 'u-leo').decider?.name).toBe('Slack for engineering and contractors')
    expect(userRow('slack', 'u-hr-1').decider?.name).toBe('Slack for everyone')
    expect(userRow('box', 'u-tanmay').decider?.name).toBe('Box for engineering')
  })

  it('says which other policies name a person, never an Everyone policy that only covers them', () => {
    expect(userRow('box', 'u-tanmay').also.map((p) => p.name)).toEqual(['Box for design'])
    expect(alsoTip(userRow('box', 'u-tanmay').also)).toBe('Also named in Box for design (Active).')
    /* Kavya is in Human Resources: Slack for everyone decides, and nothing else on Slack names her. */
    expect(userRow('slack', 'u-hr-1').also).toEqual([])
    /* Leo is decided by the engineering policy; Slack for everyone covers him but names nobody. */
    expect(userRow('slack', 'u-leo').also).toEqual([])
  })

  it('reads a person named only in a rule as named', () => {
    const fin4 = person('u-fin-4')
    const billing = t.policies.find((p) => p.name === 'AWS billing for Finance')!
    expect(namesUser(billing, fin4)).toBe(true)
    const noFinance: Policy = { ...billing, audience: { everyone: false, groupIds: [], userIds: [] } }
    expect(namesUser(noFinance, fin4)).toBe(true)
  })

  it('prints each group once by name, and a group since deleted as "(deleted)"', () => {
    expect(groupNamesOf(person('u-tanmay'), t.groups)).toEqual(['Engineering', 'Design'])
    expect(groupNamesOf({ groupId: 'gone', alsoGroupIds: ['design'] }, t.groups)).toEqual(['(deleted)', 'Design'])
    expect(userRow('box', 'u-tanmay').groups).toBe('Engineering and Design')
  })
})

describe('the Policy filter', () => {
  it('offers the deciders in the order the Policies tab numbers them, and nothing that decides for nobody', () => {
    const rows = users('slack')
    const options = policyFilterOptions(appStanding('slack', t.policies, people), rows)
    expect(options.map((o) => o.label)).toEqual(['All', 'Slack for engineering and contractors', 'Slack for everyone'])
  })

  it('offers the tenant default last, where it decides for somebody', () => {
    const rows = users('aws')
    const labels = policyFilterOptions(appStanding('aws', t.policies, people), rows).map((o) => o.label)
    expect(labels[0]).toBe('All')
    expect(labels).not.toContain('AWS production for DevOps')
    const fallback = t.policies.find((p) => p.isSystem)!
    expect(labels[labels.length - 1]).toBe(fallback.name)
  })

  it('offers No policy only when nothing decides for somebody', () => {
    const noDefault = t.policies.filter((p) => !p.isSystem)
    const rows = users('aws', noDefault)
    const options = policyFilterOptions(appStanding('aws', noDefault, people), rows)
    expect(options[options.length - 1]).toEqual({ value: NO_POLICY, label: 'No policy' })
    const none = filterUserRows(rows, t.groups, { query: '', group: 'all', policy: NO_POLICY })
    expect(none.length).toBeGreaterThan(0)
    expect(none.every((r) => r.decider === null)).toBe(true)
  })

  it('narrows by search, group and policy together', () => {
    const rows = users('slack')
    const eng = t.policies.find((p) => p.name === 'Slack for engineering and contractors')!
    const kept = filterUserRows(rows, t.groups, { query: '', group: 'contractors', policy: eng.id })
    expect(kept.length).toBeGreaterThan(0)
    expect(kept.every((r) => r.decider?.id === eng.id)).toBe(true)
    expect(filterUserRows(rows, t.groups, { query: 'leo.f@', group: 'all', policy: 'all' }).map((r) => r.user.id)).toEqual(['u-leo'])
  })
})

describe('sorting users', () => {
  it('sorts by email by default, and back the other way', () => {
    const rows = users('slack')
    const up = sortUserRows(rows, { key: 'user', dir: 1 }).map((r) => r.user.email)
    expect(up).toEqual([...up].sort((a, b) => a.localeCompare(b)))
    expect(sortUserRows(rows, { key: 'user', dir: -1 }).map((r) => r.user.email)).toEqual([...up].reverse())
  })

  it('sorts by deciding policy, then email', () => {
    const sorted = sortUserRows(users('slack'), { key: 'policy', dir: 1 })
    const names = sorted.map((r) => r.decider?.name ?? '')
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
  })
})

describe('Groups tab rows', () => {
  it('puts Everyone first, then the groups the policies name, by name', () => {
    const rows = groupRows('slack')
    expect(rows[0]).toMatchObject({ id: null, name: 'Everyone', users: people.length })
    expect(rows[0].decider?.name).toBe('Slack for everyone')
    expect(rows.slice(1).map((r) => r.name)).toEqual(['Contractors', 'Engineering'])
  })

  it('counts directory members, a person in two groups in each', () => {
    const eng = groupRows('box').find((r) => r.id === 'engineering')!
    const design = groupRows('box').find((r) => r.id === 'design')!
    expect(eng.users).toBe(people.filter((u) => u.groupId === 'engineering' || u.alsoGroupIds?.includes('engineering')).length)
    expect(design.users).toBe(people.filter((u) => u.groupId === 'design' || u.alsoGroupIds?.includes('design')).length)
  })

  it('names the shadowing policy for DevOps on AWS, and the shadowed one in the tip', () => {
    const devops = groupRows('aws').find((r) => r.id === 'devops')!
    expect(devops.decider?.name).toBe('AWS for engineering teams')
    expect(alsoTip(devops.also)).toBe('Also named in AWS production for DevOps (Active).')
  })

  it('lists a group a policy names that the directory has lost, as "(deleted)"', () => {
    const lost: Policy = { ...blankPolicy('Slack for a lost group', ['slack']), id: 'p-lost', status: 'active', audience: { everyone: false, groupIds: ['gone'], userIds: [] } }
    const row = groupRows('slack', [lost, ...t.policies]).find((r) => r.id === 'gone')!
    expect(row).toMatchObject({ name: '(deleted)', known: false, users: 0 })
  })

  it('keeps Everyone while the search matches it, and first whichever way the rest sort', () => {
    const rows = groupRows('slack')
    expect(searchGroupRows(rows, 'every').map((r) => r.name)).toEqual(['Everyone'])
    expect(searchGroupRows(rows, 'eng').map((r) => r.name)).toEqual(['Engineering'])
    expect(sortGroupRows(rows, { key: 'group', dir: -1 }).map((r) => r.name)).toEqual(['Everyone', 'Engineering', 'Contractors'])
    const byUsers = sortGroupRows(rows, { key: 'users', dir: 1 })
    expect(byUsers[0].name).toBe('Everyone')
    expect(byUsers.slice(1).map((r) => r.users)).toEqual(
      byUsers
        .slice(1)
        .map((r) => r.users)
        .sort((a, b) => a - b),
    )
  })
})

describe('the Group filter', () => {
  it('offers a routed group nobody is in, so the filter still says what it narrows to', () => {
    const base = [{ value: 'all', label: 'All' }]
    expect(withGroupOption(base, 'executives', t.groups)).toEqual([...base, { value: 'executives', label: 'Executives' }])
    expect(withGroupOption(base, 'gone', t.groups)).toEqual([...base, { value: 'gone', label: '(deleted)' }])
    expect(withGroupOption(base, 'all', t.groups)).toBe(base)
  })
})

describe('the user drawer', () => {
  it('lists the applications where a policy of the tenant’s own decides, and the default once', () => {
    const tanmay: User = person('u-tanmay')
    const { own, fallback } = userApps(tanmay, t.apps, t.policies)
    expect(fallback?.isSystem).toBe(true)
    expect(own.every((r) => !r.policy.isSystem)).toBe(true)
    expect(own.find((r) => r.app.id === 'box')?.policy.name).toBe('Box for engineering')
    expect(own.find((r) => r.app.id === 'slack')?.policy.name).toBe('Slack for engineering and contractors')
    /* In catalogue order. */
    expect(own.map((r) => r.app.id)).toEqual(t.apps.filter((a) => own.some((r) => r.app.id === a.id)).map((a) => a.id))
  })
})
