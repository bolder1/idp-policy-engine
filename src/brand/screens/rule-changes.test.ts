import { describe, expect, it } from 'vitest'

import { blankRule, type Rule } from '../data'
import { showcaseTenant } from '../fixtures'
import type { NameLookup } from './predicate-prose'
import { changeCount, ruleChanges } from './rule-changes'

/* What you changed, rule by rule (spec D §5.5), on the showcase's HRMS
   policy: one rule, "In a corporate office", and a last row that denies. */

const t = showcaseTenant()
const HRMS = t.policies.find((p) => p.id === 'sc-hrms-office')!
const resolve: NameLookup = (kind, id) =>
  kind === 'zone'
    ? t.zones.find((z) => z.id === id)?.name
    : kind === 'group'
      ? t.groups.find((g) => g.id === id)?.name
      : kind === 'user'
        ? t.directory.people.find((u) => u.id === id)?.name
        : undefined
const office = HRMS.rules[0]
const denyHr: Rule = { ...blankRule('Deny Human Resources'), pristine: undefined, decision: 'deny', who: { groupIds: ['hr'], userIds: [] } }

describe('ruleChanges', () => {
  it('says nothing for no change', () => {
    expect(ruleChanges(HRMS, HRMS, resolve)).toEqual([])
  })

  it('reads a rule added at the top as one change, and moves nobody (A3)', () => {
    const changes = ruleChanges(HRMS, { ...HRMS, rules: [denyHr, office] }, resolve)
    expect(changes).toEqual([{ kind: 'added', name: 'Rule 1 · Deny Human Resources', value: 'For Human Resources, any sign-in → Deny' }])
    expect(changeCount(changes)).toBe('1 change')
  })

  it('names a second factor change by its methods (A7)', () => {
    const next = { ...office, secondFactorMethods: ['OTP over Email'] }
    expect(ruleChanges(HRMS, { ...HRMS, rules: [next] }, resolve)).toEqual([
      { kind: 'changed', name: 'Rule 1 · In a corporate office', value: 'Second factor: OTP over Email' },
    ])
  })

  it('says every way one rule changed, in order', () => {
    const next: Rule = { ...office, name: 'Office', decision: 'deny', enabled: false, who: { groupIds: ['hr'], userIds: [] } }
    expect(ruleChanges(HRMS, { ...HRMS, rules: [next] }, resolve)[0].value).toBe(
      'Renamed from In a corporate office · Decision: Deny · Who: Human Resources · Switched off',
    )
  })

  it('reports a swap as a move, and a removed rule by its name', () => {
    const a = { ...denyHr, id: 'a' }
    const b = { ...denyHr, id: 'b', name: 'Second' }
    const live = { rules: [a, b], fallback: HRMS.fallback }
    expect(ruleChanges(live, { rules: [b, a], fallback: HRMS.fallback }, resolve).map((c) => c.value)).toEqual([
      'Moved to position 1',
      'Moved to position 2',
    ])
    expect(ruleChanges(live, { rules: [a], fallback: HRMS.fallback }, resolve)).toEqual([
      { kind: 'removed', name: 'Second', value: 'For Human Resources, any sign-in → Deny' },
    ])
  })

  it('names the last row "Last row" (A2)', () => {
    const next = { ...HRMS, fallback: { ...HRMS.fallback!, decision: '1fa' as const } }
    expect(ruleChanges(HRMS, next, resolve)).toEqual([{ kind: 'changed', name: 'Last row', value: 'Decision: Allow on 1 factor' }])
  })
})
