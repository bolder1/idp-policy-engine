import { describe, expect, it } from 'vitest'

import { blankRule, fallbackRule, type Rule } from '../../data'
import { GAP_TEXT, gapText, gapsOf, policyGaps } from './rule-gaps'

const cond = (id: string, values: string[]) => ({ id, typeId: 'zone', operator: 'in', values })
const withWhen = (r: Rule, cards: { id: string; conditions: ReturnType<typeof cond>[] }[]): Rule => ({ ...r, when: { ...r.when, cards } })

describe('rule gaps: what a rule leaves empty', () => {
  it('a new rule whose Then nobody answered cannot be saved, even with a condition set', () => {
    const r = withWhen({ ...blankRule(), outcomeOpen: true }, [{ id: 'k1', conditions: [cond('c1', ['office'])] }])
    expect(gapsOf(r).map((g) => g.field)).toEqual(['outcome'])
  })

  it('a condition with no value is a gap, under that condition', () => {
    const r = withWhen({ ...blankRule(), pristine: undefined, decision: 'deny' }, [{ id: 'k1', conditions: [cond('c1', []), cond('c2', ['  '])] }])
    const gaps = gapsOf(r)
    expect(gaps.filter((g) => g.field === 'condition').map((g) => g.part)).toEqual(['c1', 'c2'])
    expect(gapText(gaps, r.id, 'condition', 'c2')).toBe(GAP_TEXT.condition)
  })

  it('an empty group is a gap', () => {
    const r = withWhen({ ...blankRule(), decision: 'deny' }, [{ id: 'k1', conditions: [] }])
    expect(gapsOf(r)).toEqual([{ at: r.id, field: 'group', part: 'k1', text: GAP_TEXT.group }])
  })

  it('Allow with a specific first factor and no method, or specific second-factor methods with none chosen', () => {
    const r: Rule = { ...blankRule(), pristine: undefined, decision: '2fa', firstFactor: 'Specific', firstFactorMethod: undefined, secondFactor: 'specific', secondFactorMethods: [] }
    expect(gapsOf(r).map((g) => g.field)).toEqual(['first-factor', 'methods'])
  })

  it('Deny asks for no factor, and a blank name is a gap', () => {
    const r: Rule = { ...blankRule(), name: '  ', decision: 'deny', firstFactor: 'Specific', firstFactorMethod: undefined }
    expect(gapsOf(r).map((g) => g.field)).toEqual(['name'])
  })

  it('a complete rule and the default last row have none', () => {
    const r = withWhen({ ...blankRule(), pristine: undefined, decision: '1fa' }, [{ id: 'k1', conditions: [cond('c1', ['office'])] }])
    expect(gapsOf(r)).toEqual([])
    expect(policyGaps({ rules: [r], fallback: fallbackRule() })).toEqual([])
  })

  it('a Sign-in hours window needs both ends, a number compared above or below is a number, a risk score is 0 to 100', () => {
    const at = (c: { id: string; typeId: string; operator: string; values: string[] }) =>
      gapsOf({ ...blankRule(), decision: 'deny', when: { ...blankRule().when, cards: [{ id: 'k', conditions: [c] }] } }).map((g) => g.text)
    expect(at({ id: 't', typeId: 'time', operator: 'between', values: ['', '17:00'] })).toEqual(['Choose both times.'])
    expect(at({ id: 't', typeId: 'time', operator: 'between', values: [] })).toEqual(['Choose both times.'])
    expect(at({ id: 't', typeId: 'time', operator: 'between', values: ['09:00', '17:00'] })).toEqual([])
    expect(at({ id: 'a', typeId: 'user-attr', operator: 'above', values: ['thirty'] })).toEqual(['Enter a number.'])
    expect(at({ id: 'a', typeId: 'user-attr', operator: 'is', values: ['thirty'] })).toEqual([])
    expect(at({ id: 'r', typeId: 'device-risk', operator: 'above', values: ['140'] })).toEqual(['Enter a score from 0 to 100.'])
    expect(at({ id: 'r', typeId: 'device-risk', operator: 'above', values: ['60'] })).toEqual([])
  })

  it("a Deny's email alerts need an event, and an address that is one", () => {
    const deny: Rule = { ...blankRule(), decision: 'deny', denyAlertAdmins: true }
    expect(gapsOf(deny).map((g) => g.field)).toEqual(['alerts'])
    expect(gapsOf({ ...deny, denyAlertOn: ['failed'], denyAlertEmail: 'ops corp' }).map((g) => g.field)).toEqual(['alert-email'])
    expect(gapsOf({ ...deny, denyAlertOn: ['failed'], denyAlertEmail: 'ops@corp.com' })).toEqual([])
  })

  it('a Who whose every group is also an exception covers nobody', () => {
    const r: Rule = { ...blankRule(), decision: 'deny', who: { groupIds: ['g1'], userIds: [], exceptGroupIds: ['g1'] } }
    expect(gapsOf(r).map((g) => g.field)).toEqual(['who'])
  })

  it('a post sign-in rule is asked its name, who and conditions, never the sign-in Then', () => {
    const r = withWhen({ ...blankRule(), outcomeOpen: true }, [{ id: 'k1', conditions: [cond('c1', [])] }])
    expect(gapsOf(r, r.id, false, true).map((g) => g.field)).toEqual(['condition'])
  })

  it('lists gaps top to bottom, the default last', () => {
    const a = { ...blankRule('A'), id: 'a', outcomeOpen: true as const }
    const b = { ...blankRule('B'), id: 'b', outcomeOpen: true as const }
    const fb: Rule = { ...fallbackRule(), decision: '2fa', secondFactor: 'specific', secondFactorMethods: [] }
    expect(policyGaps({ rules: [a, b], fallback: fb }).map((g) => g.at)).toEqual(['a', 'b', 'fallback'])
  })
})
