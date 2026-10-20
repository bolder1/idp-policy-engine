import { describe, expect, it } from 'vitest'

import { logChange, recentChanges, seedChangeLog } from './change-log'
import { rule } from './data'
import { showcaseTenant } from './fixtures'
import { describeChanges } from './screens/changes'

const NOW = new Date('2026-10-05T10:00:00Z')

describe('the change log', () => {
  const t = showcaseTenant()
  const policy = t.policies.find((p) => p.id === 'sc-aws-engineering')!

  it('writes an entry first for a save that changed something, with the review dialog’s words', () => {
    const added = rule({ name: 'Temporary access: Leo' })
    const after = { ...policy, rules: [added, ...policy.rules] }
    const log = logChange([], policy, after, 'Jaspreet Toor', NOW)
    expect(log).toHaveLength(1)
    expect(log[0]).toMatchObject({ policyId: policy.id, policyName: policy.name, by: 'Jaspreet Toor', at: NOW.toISOString() })
    expect(log[0].lines).toContain('Added “Temporary access: Leo”')
  })

  it('writes nothing when nothing changed, and keeps the older entries after a new one', () => {
    expect(logChange([], policy, policy, 'A', NOW)).toEqual([])
    const first = logChange([], policy, { ...policy, name: 'Renamed' }, 'A', NOW)
    const second = logChange(first, policy, { ...policy, rules: policy.rules.slice(1) }, 'A', new Date(NOW.getTime() + 1000))
    expect(second).toHaveLength(2)
    expect(second[1]).toBe(first[0])
  })

  it('says a status change in words', () => {
    const log = logChange([], { ...policy, status: 'active' }, { ...policy, status: 'inactive' }, 'A', NOW)
    expect(log[0].lines).toContain('Switched off')
  })

  it('reads the recent changes to one policy, newest first, within the window and the cap', () => {
    const seeded = seedChangeLog(t.policies, NOW)
    expect(seeded.length).toBeGreaterThan(0)
    expect(seeded.every((e) => e.by === 'Jaspreet Toor')).toBe(true)
    const aws = recentChanges(seeded, 'sc-aws-engineering', NOW)
    expect(aws.map((e) => e.policyId)).toEqual(['sc-aws-engineering'])
    expect(recentChanges(seeded, 'sc-aws-engineering', NOW, 1)).toEqual([])
    expect(recentChanges(seeded, 'nope', NOW)).toEqual([])
    const many = [0, 1, 2].map((i) => ({ ...aws[0], id: `x${i}`, at: new Date(NOW.getTime() - i * 3_600_000).toISOString() }))
    expect(recentChanges(many, 'sc-aws-engineering', NOW, 14, 2).map((e) => e.id)).toEqual(['x0', 'x1'])
  })

  /* Spec APP-POLICY-TAB.md, E1: Box's Policies tab lists its own change, two
     days ago as its stamp says, in the words a save would have written. */
  it('seeds Box’s change two days back, in the review dialog’s own words', () => {
    const box = t.policies.find((p) => p.id === 'sc-box-engineering')!
    const design = box.rules[1]
    expect(box.lastModified).toBe('2 days ago')
    const seeded = seedChangeLog(t.policies, NOW).filter((e) => e.policyId === box.id)
    expect(seeded).toHaveLength(1)
    expect(seeded[0]).toMatchObject({ policyName: 'Box access', by: 'Jaspreet Toor', at: new Date(NOW.getTime() - 2 * 86_400_000).toISOString() })
    const added = describeChanges({ ...box, rules: [box.rules[0]] }, box, t.groups, t.directory.people)
    const factor = describeChanges({ ...box, rules: [box.rules[0], { ...design, secondFactorMethods: ['OTP over Email'] }] }, box, t.groups, t.directory.people)
    expect(seeded[0].lines).toEqual([...added, ...factor])
    expect(seeded[0].lines).toEqual(['Added “Designers, where we operate”', 'Authentication settings changed on “Designers, where we operate”'])
  })
})
