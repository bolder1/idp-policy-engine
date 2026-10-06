import { describe, expect, it } from 'vitest'

import { LAST_ROW } from '../testing/evidence'
import type { PillCategory } from '../testing/trace-pills'
import { DENY_REASON_WORD, denyReasonOf, denyRef, type DenyReason } from './deny-reason'
import type { EngineRun } from './engine-run'

const rule = (id: string, cats: PillCategory[]) => ({ id, checks: cats.map((category) => ({ category })) })

function runOf(decision: 'deny' | '1fa' | '2fa' | null, status: 'decided' | 'depends', rules: ReturnType<typeof rule>[], landing: number | null) {
  return { outcome: { status, decision }, rules, landing } as unknown as Pick<EngineRun, 'outcome' | 'rules' | 'landing'>
}

describe('denyReasonOf', () => {
  it('names the first condition that is not about who', () => {
    expect(denyReasonOf(runOf('deny', 'decided', [rule('r1', ['who', 'network'])], 0))).toBe('zone')
    expect(denyReasonOf(runOf('deny', 'decided', [rule('r1', ['who', 'device', 'risk'])], 0))).toBe('device')
    expect(denyReasonOf(runOf('deny', 'decided', [rule('r1', ['risk'])], 0))).toBe('risk')
    expect(denyReasonOf(runOf('deny', 'decided', [rule('r1', ['place'])], 0))).toBe('zone')
    expect(denyReasonOf(runOf('deny', 'decided', [rule('r1', ['time'])], 0))).toBe('time')
  })

  it('says group when the rule asks only who', () => {
    expect(denyReasonOf(runOf('deny', 'decided', [rule('r1', ['who'])], 0))).toBe('group')
  })

  it('says rule when nothing readable names the cause', () => {
    expect(denyReasonOf(runOf('deny', 'decided', [rule('r1', ['other'])], 0))).toBe('rule')
    expect(denyReasonOf(runOf('deny', 'decided', [rule('r1', [])], 0))).toBe('rule')
  })

  it('says default-deny for Nothing else matched', () => {
    expect(denyReasonOf(runOf('deny', 'decided', [rule('r1', ['network']), rule(LAST_ROW, [])], 1))).toBe('default-deny')
  })

  it('is null when the sign-in was not refused', () => {
    expect(denyReasonOf(runOf('2fa', 'decided', [rule('r1', ['network'])], 0))).toBeNull()
    expect(denyReasonOf(runOf(null, 'depends', [rule('r1', ['network'])], 0))).toBeNull()
    expect(denyReasonOf(runOf('deny', 'decided', [rule('r1', ['network'])], null))).toBeNull()
  })

  it('has a plain word and a reference for every reason', () => {
    const all: DenyReason[] = ['zone', 'device', 'risk', 'time', 'group', 'default-deny', 'rule']
    for (const r of all) {
      expect(DENY_REASON_WORD[r].length).toBeGreaterThan(10)
      expect(denyRef(r)).toBe(`Ref: ${r}`)
      expect(DENY_REASON_WORD[r]).not.toMatch(/log ?in|\bAI\b|assistant/i)
    }
  })
})
