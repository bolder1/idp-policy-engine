import { describe, expect, it } from 'vitest'

import { ruleExpired } from '../../data'
import { showcaseTenant } from '../../fixtures'
import { envOf, resolveSignIn } from '../tenant-resolver'
import { factsOf, originPatch } from '../testing/sign-in-form'
import { emptyDraft } from './sign-in-card'
import { TEMP_ACCESS_MAX_DAYS, addDays, dateSaid, grantTempAccess, tempAccessIssue } from './temp-access'

const TODAY = '2026-09-28'

describe('tempAccessIssue', () => {
  it('asks for a date in range and a reason, and says which field', () => {
    expect(tempAccessIssue('', TODAY, 'x')?.field).toBe('until')
    expect(tempAccessIssue('2026-09-27', TODAY, 'x')).toEqual({ field: 'until', text: 'The end date has passed' })
    expect(tempAccessIssue(addDays(TODAY, TEMP_ACCESS_MAX_DAYS + 1), TODAY, 'x')?.text).toContain('30 days')
    expect(tempAccessIssue('2026-10-05', TODAY, '  ')).toEqual({ field: 'reason', text: 'Enter a reason' })
    expect(tempAccessIssue('2026-10-05', TODAY, 'On call')).toBeNull()
    expect(tempAccessIssue(addDays(TODAY, TEMP_ACCESS_MAX_DAYS), TODAY, 'x')).toBeNull()
  })

  it('does arithmetic and wording on days', () => {
    expect(addDays('2026-09-28', 7)).toBe('2026-10-05')
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02')
    expect(dateSaid('2026-10-05')).toBe('5 Oct 2026')
  })
})

describe('temporary access, end to end on the showcase tenant', () => {
  const t = showcaseTenant()
  const env = envOf(t)
  const sign = (policies: typeof t.policies, date: string, time = '09:30') => {
    const f = { ...emptyDraft(date, time), personId: 'u-leo', appId: 'aws', ...originPatch('home') }
    return resolveSignIn(policies, factsOf(f, t.zones).facts, env)
  }

  it('lets a refused contractor in until the date, then switches itself off', () => {
    const before = sign(t.policies, TODAY)
    expect([before.status, before.decision]).toEqual(['decided', 'deny'])
    const policyId = before.decidedBy!.policyId
    const granted = t.policies.map((p) => (p.id === policyId ? grantTempAccess(p, { id: 'u-leo', name: 'Leo Fernandes' }, { until: '2026-10-05', reason: 'On call this week', by: 'Jaspreet Toor' }) : p))

    expect(sign(granted, TODAY).decision).toBe('2fa')
    expect(sign(granted, '2026-10-05').decision).toBe('2fa')
    expect(sign(granted, '2026-10-06').decision).toBe('deny')
    /* The grant is the first rule and says what it is. */
    const first = granted.find((p) => p.id === policyId)!.rules[0]
    expect(first.name).toBe('Temporary access: Leo Fernandes, until 5 Oct 2026')
    expect(first.who).toEqual({ groupIds: [], userIds: ['u-leo'] })
    expect([ruleExpired(first, '2026-10-05'), ruleExpired(first, '2026-10-06'), ruleExpired(first, undefined)]).toEqual([false, true, false])
  })

  /* 6 Oct 2026: the date reached the engine only beside a time, so with the
     time cleared an ended grant still let Leo in. The date is the grant's. */
  it('ends on the date with the time cleared too', () => {
    const policyId = sign(t.policies, TODAY).decidedBy!.policyId
    const granted = t.policies.map((p) => (p.id === policyId ? grantTempAccess(p, { id: 'u-leo', name: 'Leo Fernandes' }, { until: '2026-10-05', reason: 'On call this week', by: 'Jaspreet Toor' }) : p))
    expect(sign(granted, '2026-10-05', '').decision).toBe('2fa')
    expect(sign(granted, '2026-10-06', '').decision).toBe('deny')
    expect(sign(granted, '2026-10-06', '').trace?.steps[0].kind).toBe('off')
  })

  it('is for that one person: somebody else is still refused', () => {
    const policyId = sign(t.policies, TODAY).decidedBy!.policyId
    const granted = t.policies.map((p) => (p.id === policyId ? grantTempAccess(p, { id: 'u-leo', name: 'Leo Fernandes' }, { until: '2026-10-05', reason: 'x', by: 'A' }) : p))
    const other = resolveSignIn(granted, factsOf({ ...emptyDraft(TODAY, '09:30'), personId: 'u-tom', appId: 'aws', ...originPatch('home') }, t.zones).facts, env)
    expect(other.decidedBy?.policyId === policyId && other.decision === '2fa' && other.trace?.hitIndex === 0).toBe(false)
  })
})
