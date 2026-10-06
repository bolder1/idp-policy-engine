import { describe, expect, it } from 'vitest'

import { logChange, recentChanges, seedChangeLog } from './change-log'
import { rule } from './data'
import { showcaseTenant } from './fixtures'

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
})
