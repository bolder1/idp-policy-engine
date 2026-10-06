import { describe, expect, it } from 'vitest'

import { showcaseTenant } from '../../fixtures'
import type { PolicyLine } from '../predicate-prose'
import { compareFacts, draftDiff, factsOf, type Library } from './inspect-facts'
import { objectsOfRule, peekNames, policiesForPerson, usedByPolicies } from './peek-model'

const t = showcaseTenant()
const lib: Library = { ...t, users: t.directory.people, groups: t.groups }
const aws = t.policies.find((p) => p.id === 'sc-aws-eng') ?? t.policies.find((p) => p.appIds.includes('aws'))!

describe('the inspector’s facts', () => {
  it('tables a policy, each of its rules and its last row, and nothing for one edited away', () => {
    expect(factsOf({ kind: 'policy', policyId: aws.id }, lib)?.map(([k]) => k)).toEqual(['Status', 'Applications', 'Audience', 'Rules'])
    const r1 = factsOf({ kind: 'rule', policyId: aws.id, ruleId: aws.rules[0].id }, lib, () => 'said')!
    expect(Object.fromEntries(r1)).toMatchObject({ Policy: aws.name, Position: `Rule 1 of ${aws.rules.length}`, Says: 'said' })
    expect(Object.fromEntries(factsOf({ kind: 'rule', policyId: aws.id, ruleId: null }, lib)!).Position).toBe('Last row')
    expect(factsOf({ kind: 'rule', policyId: aws.id, ruleId: 'gone' }, lib)).toBeNull()
    expect(factsOf({ kind: 'policy', policyId: 'gone' }, lib)).toBeNull()
  })

  it('tables every kind of peek the tenant has', () => {
    const z = t.zones[0]
    expect(factsOf({ kind: 'zone', id: z.id }, lib)?.[0]).toEqual(['Kind', expect.any(String)])
    expect(factsOf({ kind: 'device', id: t.fingerprints[0].id }, lib)?.length).toBe(4)
    expect(factsOf({ kind: 'risk', id: t.activeRiskProfileId }, lib)?.find(([k]) => k === 'In use')?.[1]).toBe('Yes')
    const leo = t.directory.people.find((u) => u.id === 'u-leo')!
    expect(Object.fromEntries(factsOf({ kind: 'person', id: leo.id }, lib)!).Type).toBe('Contractor')
    expect(factsOf({ kind: 'app', id: 'aws' }, lib)?.[0][0]).toBe('Protocol')
    expect(factsOf({ kind: 'hook', id: 'none' }, lib)).toBeNull()
  })

  it('sets two side by side, every label once, and marks where they differ', () => {
    const rows = compareFacts([['A', '1'], ['B', '2']], [['B', '3'], ['C', '4']])
    expect(rows).toEqual([
      { label: 'A', a: '1', b: '', same: false },
      { label: 'B', a: '2', b: '3', same: false },
      { label: 'C', a: '', b: '4', same: false },
    ])
    expect(compareFacts([['A', '1']], [['A', '1']])[0].same).toBe(true)
  })

  it('says what a draft adds and drops, sentence by sentence', () => {
    const line = (text: string): PolicyLine => ({ key: text, ruleId: null, n: null, text })
    expect(draftDiff([line('a'), line('b')], [line('b'), line('c')])).toEqual({ added: ['c'], removed: ['a'] })
    expect(draftDiff([line('a')], [line('a')])).toEqual({ added: [], removed: [] })
  })
})

describe('what a peek is in', () => {
  it('a person: the policies written for them', () => {
    const leo = t.directory.people.find((u) => u.id === 'u-leo')!
    const mine = policiesForPerson(t.policies, leo)
    expect(mine.length).toBeGreaterThan(0)
    expect(mine.every((p) => !p.isSystem)).toBe(true)
    expect(usedByPolicies(t.policies, { kind: 'person', id: leo.id }, t.activeRiskProfileId, t.directory.people)).toEqual(mine)
  })

  it('an application: the policies on it and the default', () => {
    const on = usedByPolicies(t.policies, { kind: 'app', id: 'aws' }, t.activeRiskProfileId)
    expect(on.some((p) => p.isSystem)).toBe(true)
    expect(on.some((p) => p.id === aws.id)).toBe(true)
  })

  it('names each kind from the library, and says nothing of an id it does not know', () => {
    const names = peekNames({ ...lib })
    const z = t.zones[0]
    expect(names.zone(z.id)).toBe(z.name)
    expect(names.app('aws')).toBeTruthy()
    expect(names.hook('nope')).toBeUndefined()
    expect(objectsOfRule(aws.rules[0], t.activeRiskProfileId).every((o) => names[o.kind](o.id))).toBe(true)
  })
})
