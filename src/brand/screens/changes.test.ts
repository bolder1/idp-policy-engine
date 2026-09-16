import { describe, expect, it } from 'vitest'

import { blankRule, fallbackRule, type Policy, type RuleWho } from '../data'
import { describeChanges } from './changes'

const policy = (fallback = fallbackRule('deny')): Policy => ({
  id: 'p1',
  name: 'Finance',
  type: 'App Access',
  appIds: ['a1'],
  audience: { everyone: true, groupIds: [], userIds: [] },
  rules: [blankRule('Live rule')],
  fallback,
  status: 'active',
  lastModified: 'Yesterday',
  modifiedBy: 'Admin',
})

describe('describeChanges and the last rule', () => {
  it('reports a changed decision on the last rule', () => {
    const saved = policy(fallbackRule('deny'))
    const draft = { ...saved, fallback: { ...saved.fallback!, decision: '1fa' as const } }
    expect(describeChanges(saved, draft)).toEqual(['“Nothing else matched” now 1 factor instead of Deny'])
  })

  it('says nothing when the last rule is unchanged', () => {
    const saved = policy()
    expect(describeChanges(saved, { ...saved })).toEqual([])
  })
})

describe('describeChanges and who', () => {
  const withRule = (p: Policy, who: RuleWho | undefined): Policy => {
    const r = { ...p.rules[0] }
    if (who) r.who = who
    else delete r.who
    return { ...p, rules: [r] }
  }

  it('names a group and a person added to a rule', () => {
    const saved = policy()
    const draft = withRule(saved, { groupIds: ['finance'], userIds: ['mehak'] })
    expect(describeChanges(saved, draft)).toEqual(['Finance added to Who on “Live rule”', 'Mehak Garg added to Who on “Live rule”'])
  })

  it('names exceptions, and says when a rule goes back to everyone', () => {
    const saved = withRule(policy(), { groupIds: ['finance'], userIds: [] })
    expect(describeChanges(saved, withRule(saved, { groupIds: ['finance'], userIds: [], exceptUserIds: ['priya'] }))).toEqual([
      'Priya Sharma added as an exception on “Live rule”',
    ])
    expect(describeChanges(saved, withRule(saved, undefined))).toEqual(['“Live rule” now applies to everyone'])
  })

  it('does not count who as a condition, and ignores a reorder', () => {
    const saved = withRule(policy(), { groupIds: ['finance', 'legal'], userIds: [] })
    expect(describeChanges(saved, withRule(saved, { groupIds: ['legal', 'finance'], userIds: [] }))).toEqual([])
    const lines = describeChanges(policy(), withRule(policy(), { groupIds: ['finance'], userIds: [] }))
    expect(lines.some((l) => l.includes('condition'))).toBe(false)
  })
})
