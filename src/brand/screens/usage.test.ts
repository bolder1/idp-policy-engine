import { describe, expect, it } from 'vitest'

import type { Policy, PolicyStatus, Rule } from '../data'
import { deleteConfirmed, deleteImpact, policiesUsing, policiesUsingType } from './usage'

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
  /* `live` used to mean "refused". Since 21 Sep 2026 it means "moved to draft
     by the delete", so what matters is that a live policy lands here and not
     in `stuck`, which is the only list that still refuses. */
  it('puts an active policy whose live rules name it in live, to be moved to draft', () => {
    const p = policy('p1', 'active', [rule('r1', 'zone', ['z1'])])
    const impact = deleteImpact('zone', 'z1', [p])
    expect(impact.live.map((u) => u.policy.id)).toEqual(['p1'])
    expect(impact.later).toHaveLength(0)
    expect(impact.stuck).toHaveLength(0)
  })

  it('puts an enforcing SYSTEM policy in stuck, never in live', () => {
    /* `setPolicyStatus` will not move a system policy, so demoting it would
       silently do nothing and leave a live rule naming a deleted object. */
    const sys = { ...policy('global-default', 'always-on', [rule('r1', 'zone', ['z1'])]), isSystem: true } as Policy
    const impact = deleteImpact('zone', 'z1', [sys])
    expect(impact.stuck.map((u) => u.policy.id)).toEqual(['global-default'])
    expect(impact.live).toHaveLength(0)
  })

  it('does not treat a system policy as stuck when only its saved draft names the object', () => {
    const sys = {
      ...policy('global-default', 'always-on', [rule('r1', 'zone', ['z2'])], [rule('d1', 'zone', ['z1'])]),
      isSystem: true,
    } as Policy
    const impact = deleteImpact('zone', 'z1', [sys])
    expect(impact.stuck).toHaveLength(0)
    expect(impact.later.map((u) => u.policy.id)).toEqual(['global-default'])
  })

  it('splits one delete across all three lists at once', () => {
    const policies = [
      policy('live', 'active', [rule('r1', 'zone', ['z1'])]),
      policy('off', 'inactive', [rule('r2', 'zone', ['z1'])]),
      { ...policy('sys', 'always-on', [rule('r3', 'zone', ['z1'])]), isSystem: true } as Policy,
      policy('unrelated', 'active', [rule('r4', 'zone', ['z9'])]),
    ]
    const impact = deleteImpact('zone', 'z1', policies)
    expect(impact.live.map((u) => u.policy.id)).toEqual(['live'])
    expect(impact.later.map((u) => u.policy.id)).toEqual(['off'])
    expect(impact.stuck.map((u) => u.policy.id)).toEqual(['sys'])
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

describe('deleteConfirmed', () => {
  it('arms on the word DELETE, not on the name', () => {
    expect(deleteConfirmed('DELETE')).toBe(true)
    expect(deleteConfirmed('Corporate managed')).toBe(false)
    expect(deleteConfirmed('DELET')).toBe(false)
    expect(deleteConfirmed('')).toBe(false)
  })

  it('forgives the case and the ends of the field', () => {
    expect(deleteConfirmed('delete')).toBe(true)
    expect(deleteConfirmed('  Delete  ')).toBe(true)
    expect(deleteConfirmed('de lete')).toBe(false)
  })
})
