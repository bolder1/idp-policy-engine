import { describe, expect, it } from 'vitest'

import { memberGroupIds, type User } from '../data'
import { showcaseTenant } from '../fixtures'
import { appsChangedByMembership, appsNaming } from './app-standing'
import {
  assignLabel,
  filterMembers,
  groupAppRows,
  groupNamesOf,
  membersOf,
  membershipAfter,
  namedInTip,
  notBuilt,
  rolesOf,
  splitName,
  stampShort,
  unassignLabel,
  whoSaid,
} from './directory-model'

/* -----------------------------------------------------------------------------
   The User list's and the Groups pages' words and rows (directory-model.ts),
   on the showcase tenant where a row reads the engine.
   -------------------------------------------------------------------------- */

const t = showcaseTenant()
const people = t.directory.people
const person = (id: string) => people.find((u) => u.id === id)!
const ids = (users: readonly User[]) => users.map((u) => u.id)

describe('names and words', () => {
  it('splits a name at its first space, as the live Assignment table does', () => {
    expect(splitName('Priya Sharma')).toEqual({ first: 'Priya', last: 'Sharma' })
    expect(splitName('Mary Ann de la Cruz')).toEqual({ first: 'Mary', last: 'Ann de la Cruz' })
    expect(splitName('Cher')).toEqual({ first: 'Cher', last: '' })
    expect(splitName('  Leo   Fernandes ')).toEqual({ first: 'Leo', last: 'Fernandes' })
  })

  it('names every group somebody is in, and a group that has gone as "(deleted)"', () => {
    expect(groupNamesOf(person('u-tanmay'), t.groups)).toBe('Engineering and Design')
    expect(groupNamesOf({ groupId: 'finance', alsoGroupIds: ['gone'] }, t.groups)).toBe('Finance and (deleted)')
    expect(groupNamesOf({ groupId: '' }, t.groups)).toBe('')
  })

  it('says who in a name, two names, or a count', () => {
    expect(whoSaid(['Priya Sharma'])).toBe('Priya Sharma')
    expect(whoSaid(['Priya Sharma', 'Ravi Kumar'])).toBe('Priya Sharma and Ravi Kumar')
    expect(whoSaid(['A', 'B', 'C', 'D'])).toBe('4 users')
  })

  it('counts on the buttons, and only once somebody is picked', () => {
    expect(unassignLabel(1)).toBe('Unassign 1 user')
    expect(unassignLabel(3)).toBe('Unassign 3 users')
    expect(assignLabel(0)).toBe('Assign users')
    expect(assignLabel(1)).toBe('Assign 1 user')
    expect(assignLabel(2)).toBe('Assign 2 users')
  })

  it('drops the seconds from a console stamp', () => {
    expect(stampShort('Aug 14, 2026, 14:25:51')).toBe('Aug 14, 2026, 14:25')
  })

  it('says not built in the house wording', () => {
    expect(notBuilt('Adding groups', true)).toBe('Adding groups is coming soon.')
    expect(notBuilt('Adding groups', false)).toBe('Adding groups is not built in this prototype.')
    expect(notBuilt('Group custom fields', true, true)).toBe('Group custom fields are coming soon.')
  })
})

describe('the directory', () => {
  it('counts a group from the people in it, through every group they are in', () => {
    const design = ids(membersOf(people, 'design'))
    expect(design).toEqual(expect.arrayContaining(['u-des-1', 'u-des-2', 'u-tanmay']))
    expect(design).toHaveLength(people.filter((u) => memberGroupIds(u).includes('design')).length)
  })

  it('files roles A to Z with their people', () => {
    const roles = rolesOf(people)
    expect(roles.map((r) => r.role)).toEqual([...roles.map((r) => r.role)].sort((a, b) => a.localeCompare(b)))
    expect(roles.find((r) => r.role === 'Admin')?.users.map((u) => u.id)).toContain('jaspreet')
    expect(roles.reduce((n, r) => n + r.users.length, 0)).toBe(people.length)
  })

  it('filters members by any text a row shows', () => {
    const design = membersOf(people, 'design')
    expect(ids(filterMembers(design, 'tanmay.j@'))).toEqual(['u-tanmay'])
    expect(ids(filterMembers(design, 'BELL'))).toEqual(['u-des-2'])
    expect(filterMembers(design, '   ')).toHaveLength(design.length)
  })
})

describe('membershipAfter', () => {
  it('adds a group as another group, and as the first group of somebody in none', () => {
    const [a] = membershipAfter(people, ['u-des-1'], 'engineering', true).filter((u) => u.id === 'u-des-1')
    expect(a.groupId).toBe('design')
    expect(a.alsoGroupIds).toEqual(['engineering'])
    const nobody: User = { ...person('u-des-1'), groupId: '' }
    expect(membershipAfter([nobody], [nobody.id], 'finance', true)[0].groupId).toBe('finance')
  })

  it('moves the next group up when somebody leaves their first, and leaves them in none after their last', () => {
    const [leo] = membershipAfter(people, ['u-leo'], 'engineering', false).filter((u) => u.id === 'u-leo')
    expect(leo.groupId).toBe('contractors')
    expect(leo.alsoGroupIds).toBeUndefined()
    const [ishita] = membershipAfter(people, ['u-des-1'], 'design', false).filter((u) => u.id === 'u-des-1')
    expect(memberGroupIds(ishita)).toEqual([])
  })

  it('keeps the same record for anybody it does not change', () => {
    const after = membershipAfter(people, ['u-des-1', 'u-tanmay'], 'design', true)
    expect(after.find((u) => u.id === 'u-tanmay')).toBe(person('u-tanmay'))
    expect(after.find((u) => u.id === 'jaspreet')).toBe(person('jaspreet'))
  })

  it('tells which applications a change moves, through the engine', () => {
    /* A designer put in Engineering: Box for engineering is higher than Box
       for design, and Slack has a policy for Engineering above Everyone's. */
    const into = appsChangedByMembership(t.apps, t.policies, people, membershipAfter(people, ['u-des-1'], 'engineering', true))
    expect(into.map((a) => a.id)).toEqual(expect.arrayContaining(['box', 'slack']))
    /* Somebody already in the group moves nothing. */
    expect(appsChangedByMembership(t.apps, t.policies, people, membershipAfter(people, ['u-tanmay'], 'engineering', true))).toEqual([])
  })
})

describe('a group on its applications', () => {
  it('lists DevOps on AWS, decided by the engineering policy, and says the DevOps one is also named there', () => {
    const rows = groupAppRows('devops', appsNaming('devops', t.apps, t.policies), t.policies)
    const aws = rows.find((r) => r.app.id === 'aws')!
    expect(aws.decider?.name).toBe('AWS for engineering teams')
    /* A sentence, as the application's Users and Groups tabs say it (`alsoTip`). */
    expect(aws.tip).toBe('Also named in AWS production for DevOps (Active).')
  })

  it('names a draft that names the group without deciding for it', () => {
    const github = groupAppRows('finance', appsNaming('finance', t.apps, t.policies), t.policies).find((r) => r.app.id === 'github')!
    expect(github.decider?.name).not.toBe('Code review for Finance')
    expect(github.tip).toContain('Code review for Finance (Draft)')
  })

  it('has no tip where only the decider names the group', () => {
    const box = groupAppRows('design', appsNaming('design', t.apps, t.policies), t.policies).find((r) => r.app.id === 'box')!
    expect(box.decider?.name).toBe('Box for design')
    expect(box.tip).toBeNull()
    expect(namedInTip('box', 'design', t.policies, box.decider)).toBeNull()
  })
})
