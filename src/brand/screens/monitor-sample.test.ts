import { describe, expect, it } from 'vitest'

import type { Policy } from '../data'
import { showcaseTenant } from '../fixtures'
import { lookUpAddress } from './geo-fixture'
import { MONITOR_ORIGINS, MONITOR_ROWS, changeOf, monitorPool, monitorRows, monitorSamples, planLine, planOf, planParts } from './monitor-sample'
import { envOf, type TenantResolution } from './tenant-resolver'

/* Modelled sign-ins for a monitoring policy (spec C §5.3), and the plan line
   Before turning on's "While monitoring" row prints (final spec D.9, A6b). */

const t = showcaseTenant()
const env = envOf(t)
const HRMS_ID = 'sc-hrms-office'
const monitoring = t.policies.map((p): Policy => (p.id === HRMS_ID ? { ...p, status: 'monitor' } : p))
const hrms = monitoring.find((p) => p.id === HRMS_ID)!
const MONDAY = new Date(Date.UTC(2026, 8, 28))

describe('the pool', () => {
  it('takes the audience round-robin, then two from outside it', () => {
    const pool = monitorPool(hrms, env).map((u) => u.name)
    expect(pool.slice(0, 4)).toEqual(['Kavya Menon', 'Priya Sharma', 'Neha Kapoor', 'Rohan Kulkarni'])
    expect(pool).toHaveLength(6)
    const outsiders = monitorPool(hrms, env).slice(4)
    expect(outsiders.every((u) => u.groupId !== 'hr' && u.groupId !== 'finance')).toBe(true)
  })
})

describe('the samples', () => {
  const samples = monitorSamples(hrms, env, MONDAY)

  it('are twelve, every address in the sample table', () => {
    expect(samples).toHaveLength(MONITOR_ROWS)
    for (const o of MONITOR_ORIGINS) expect(lookUpAddress(o.address)).toBeDefined()
  })

  it('are the same for the same day', () => {
    expect(monitorSamples(hrms, env, MONDAY)).toEqual(samples)
    expect(samples[0]).toMatchObject({ day: 'Sun', time: '09:30', personName: 'Kavya Menon', appName: 'HRMS', place: 'Pune, India', address: '203.0.113.24' })
    expect(samples[0].facts.when).toMatchObject({ date: '2026-09-27', time: '09:30' })
  })

  it('are none for a policy with no application', () => {
    expect(monitorSamples({ ...hrms, appIds: [] }, env, MONDAY)).toEqual([])
  })
})

describe('the plan line', () => {
  it('reads HRMS turned on from monitoring exactly (A6b)', () => {
    const rows = monitorRows(hrms, monitoring, env, monitorSamples(hrms, env, MONDAY))
    /* Since the Global Default's baseline (30 Sep 2026) today is no longer one
       factor for all twelve: a phone at home already gets OTP over Email, and
       Austin and the proxy are already refused. So HRMS moves fewer — the
       office laptops to 2FA, the four home and London sign-ins to Deny — and
       Bengaluru (2FA either way) and the refusals stand still. */
    expect(planLine(planOf(rows))).toBe('If turned on: 0 to allow on 1 factor, 2 to allow with 2FA, 4 to deny, 6 unchanged.')
    /* Today the Global Default decides every one of them. */
    expect(rows.every((r) => r.today.decidedBy?.isGlobalDefault)).toBe(true)
  })

  it('adds the can’t-tell count only when there is one', () => {
    expect(planParts({ to1fa: 1, to2fa: 0, toDeny: 0, unchanged: 0, cantTell: 0 }).cantTell).toBeNull()
    expect(planLine({ to1fa: 1, to2fa: 2, toDeny: 3, unchanged: 4, cantTell: 2 })).toBe(
      "If turned on: 1 to allow on 1 factor, 2 to allow with 2FA, 3 to deny, 4 unchanged, 2 can't tell.",
    )
  })

  it('buckets a sign-in nothing decides today by what it would get once on', () => {
    const res = (r: Partial<TenantResolution>): TenantResolution =>
      ({ status: 'decided', decision: null, possible: [], standings: [], watching: [], missing: [], appId: 'a', personId: 'p', decidedBy: null, trace: null, ...r }) as TenantResolution
    const either = res({ status: 'depends', possible: [{ decision: 'deny', ruleIndex: null, ruleName: '', assumes: [] }, { decision: '1fa', ruleIndex: 0, ruleName: '', assumes: [] }] })
    expect(changeOf(res({ status: 'incomplete' }), res({ decision: 'deny' }))).toBe('to-deny')
    expect(changeOf(res({ decision: '1fa' }), res({ decision: '1fa' }))).toBe('unchanged')
    expect(changeOf(res({ decision: '1fa' }), either)).toBe('cant-tell')
    /* Somebody it would still not decide: nothing decides them either way. */
    expect(changeOf(res({ status: 'incomplete' }), res({ status: 'incomplete' }))).toBe('unchanged')
    expect(changeOf(res({ status: 'incomplete' }), either)).toBe('cant-tell')
    /* Settled once on, but today could already be that: whether it moves can't be told. */
    expect(changeOf(either, res({ decision: 'deny' }))).toBe('cant-tell')
  })
})
