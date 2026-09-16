import { describe, expect, it } from 'vitest'

import type { Policy, PolicyStatus, Rule } from '../data'
import { deleteImpact, policiesUsing, policiesUsingType } from './usage'

/* Only the fields the scan reads. */
const rule = (id: string, typeId: string, values: string[]): Rule =>
  ({
    id,
    name: id,
    enabled: true,
    decision: 'allow',
    when: { cards: [{ id: `${id}-c`, conditions: [{ id: `${id}-k`, typeId, operator: 'in', values }] }] },
  }) as unknown as Rule

const policy = (id: string, status: PolicyStatus, rules: Rule[], draftRules?: Rule[]): Policy =>
  ({
    id,
    name: id,
    status,
    rules,
    pendingDraft: draftRules ? { rules: draftRules, savedAt: '2026-09-15T00:00:00Z' } : undefined,
  }) as unknown as Policy

describe('policiesUsing', () => {
  it('finds live rules that name the object', () => {
    const p = policy('p1', 'active', [rule('r1', 'zone', ['z1']), rule('r2', 'zone', ['z2'])])
    const uses = policiesUsing('zone', 'z1', [p])
    expect(uses).toHaveLength(1)
    expect(uses[0].rules.map((r) => r.id)).toEqual(['r1'])
    expect(uses[0].draft).toBeUndefined()
  })

  it('counts a saved draft of a live policy, marked as a draft', () => {
    const p = policy('p1', 'active', [rule('r1', 'zone', ['z2'])], [rule('d1', 'zone', ['z1'])])
    const uses = policiesUsing('zone', 'z1', [p])
    expect(uses).toHaveLength(1)
    expect(uses[0].draft).toBe(true)
    expect(uses[0].rules.map((r) => r.id)).toEqual(['d1'])
  })

  it('prefers the live rules when both name it', () => {
    const p = policy('p1', 'active', [rule('r1', 'zone', ['z1'])], [rule('d1', 'zone', ['z1'])])
    const [use] = policiesUsing('zone', 'z1', [p])
    expect(use.draft).toBeUndefined()
    expect(use.rules.map((r) => r.id)).toEqual(['r1'])
  })

  it('reads the type alone for policiesUsingType, drafts included', () => {
    const p = policy('p1', 'active', [], [rule('d1', 'device-risk', ['high'])])
    expect(policiesUsingType('device-risk', [p])[0]?.draft).toBe(true)
  })
})

describe('deleteImpact', () => {
  it('refuses on a live rule of an active policy', () => {
    const p = policy('p1', 'active', [rule('r1', 'zone', ['z1'])])
    const impact = deleteImpact('zone', 'z1', [p])
    expect(impact.live).toHaveLength(1)
    expect(impact.later).toHaveLength(0)
  })

  it('lists drafts, inactive policies and saved drafts as later, agreeing with policiesUsing', () => {
    const policies = [
      policy('draft', 'draft', [rule('r1', 'zone', ['z1'])]),
      policy('off', 'inactive', [rule('r2', 'zone', ['z1'])]),
      policy('live-draft', 'active', [], [rule('d1', 'zone', ['z1'])]),
    ]
    const impact = deleteImpact('zone', 'z1', policies)
    expect(impact.live).toHaveLength(0)
    expect(impact.later.map((u) => u.policy.id)).toEqual(['draft', 'off', 'live-draft'])
    expect(impact.later.map((u) => u.policy.id)).toEqual(policiesUsing('zone', 'z1', policies).map((u) => u.policy.id))
  })
})
