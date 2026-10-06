import { describe, expect, it } from 'vitest'

import { FALLBACK_NAME, card, cond, when, type Rule } from '../../data'
import { DENY_ACTION_SUGGESTION, DENY_REASON_WORD, denyReasonOfRule, denyRef, type DenyReason } from './deny-reason'

const rule = (over: Partial<Rule>): Partial<Pick<Rule, 'name' | 'when' | 'who'>> => ({ name: 'A rule', ...over })

describe('denyReasonOfRule', () => {
  it('names the first condition that is not about who', () => {
    expect(denyReasonOfRule(rule({ when: when(card(cond('zone', 'not in zone', ['z1']))) }))).toBe('zone')
    expect(denyReasonOfRule(rule({ when: when(card(cond('fingerprint', 'does not match', ['f1']))) }))).toBe('device')
    expect(denyReasonOfRule(rule({ when: when(card(cond('device-risk', 'above', ['70']))) }))).toBe('risk')
    expect(denyReasonOfRule(rule({ when: when(card(cond('time', 'not between', ['09:00', '18:00']))) }))).toBe('time')
  })

  it('says group when only who is asked, rule when nothing is, and default-deny for the last row', () => {
    expect(denyReasonOfRule(rule({ when: when(), who: { groupIds: ['g1'], userIds: [] } }))).toBe('group')
    expect(denyReasonOfRule(rule({ when: when() }))).toBe('rule')
    expect(denyReasonOfRule({ name: FALLBACK_NAME })).toBe('default-deny')
  })
})

describe('denial reasons', () => {
  it('has plain words and a reference for every reason', () => {
    const all: DenyReason[] = ['zone', 'device', 'risk', 'time', 'group', 'default-deny', 'rule']
    for (const r of all) {
      expect(DENY_REASON_WORD[r].length).toBeGreaterThan(10)
      expect(denyRef(r)).toBe(`Ref: ${r}`)
      expect(DENY_ACTION_SUGGESTION[r].length).toBeGreaterThan(10)
      expect(DENY_ACTION_SUGGESTION[r]).not.toMatch(/log ?in|\bAI\b|assistant/i)
      expect(DENY_REASON_WORD[r]).not.toMatch(/log ?in|\bAI\b|assistant/i)
    }
  })
})
