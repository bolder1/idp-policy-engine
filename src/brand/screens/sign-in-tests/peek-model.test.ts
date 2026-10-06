import { describe, expect, it } from 'vitest'

import { showcaseTenant } from '../../fixtures'
import { PEEK_FALLBACK, isPeek, sameTarget, targetLabel } from './inspect-model'
import { objectsOfRule, usedByPolicies } from './peek-model'

const t = showcaseTenant()
const RISK = 'risk-default'
const rules = t.policies.flatMap((p) => p.rules)

describe('the peeks’ model', () => {
  it('finds the zones, device profiles and hooks a rule names, once each', () => {
    const all = rules.flatMap((r) => objectsOfRule(r, RISK))
    expect(all.length).toBeGreaterThan(0)
    expect(new Set(all.map((o) => o.kind)).size).toBeGreaterThan(1)
    for (const r of rules) {
      const o = objectsOfRule(r, RISK)
      expect(new Set(o.map((x) => `${x.kind}:${x.id}`)).size).toBe(o.length)
    }
  })

  it('says which policies use an object', () => {
    const o = rules.flatMap((r) => objectsOfRule(r, RISK))[0]
    expect(usedByPolicies(t.policies, o, RISK).length).toBeGreaterThan(0)
    expect(usedByPolicies(t.policies, { kind: 'zone', id: 'nope' }, RISK)).toEqual([])
    /* A zone the default policy's own rules name lists the default — last, as the library's Used by counts it. */
    const sys = t.policies.find((p) => p.isSystem)!
    const z = sys.rules.flatMap((r) => objectsOfRule(r, RISK)).find((x) => x.kind === 'zone')
    if (z) expect(usedByPolicies(t.policies, z, RISK).at(-1)?.id).toBe(sys.id)
  })

  it('labels and compares peeks beside policies and rules', () => {
    expect(isPeek({ kind: 'zone', id: 'z' })).toBe(true)
    expect(isPeek({ kind: 'policy', policyId: 'p' })).toBe(false)
    expect(sameTarget({ kind: 'zone', id: 'a' }, { kind: 'zone', id: 'a' })).toBe(true)
    expect(sameTarget({ kind: 'zone', id: 'a' }, { kind: 'hook', id: 'a' })).toBe(false)
    expect(sameTarget({ kind: 'zone', id: 'a' }, { kind: 'policy', policyId: 'a' })).toBe(false)
    expect(targetLabel({ kind: 'zone', id: 'a' }, [], { zone: () => 'Corporate offices' })).toBe('Corporate offices')
    expect(targetLabel({ kind: 'hook', id: 'a' }, [])).toBe(PEEK_FALLBACK.hook)
  })
})
