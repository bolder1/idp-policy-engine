import { describe, expect, it } from 'vitest'

import { showcaseTenant, showcaseTenantHrmsOn, tenantAt, type Tenant } from '../../fixtures'
import { envOf, resolveSignIn } from '../tenant-resolver'
import { SAMPLE_SIGN_INS, samplesIn } from './samples'
import { formOf, factsOf } from './sign-in-form'

/* The nine samples on the showcase tenant: every person and application is
   there, and each answers live — so a change to a showcase policy that moved
   one would fail here first.

   Pinned twice. First on the tenant the store opens on, which is what the
   Samples view shows: HRMS is Inactive there (Phase 4), so the four HRMS
   scenes all fall to the Global Default. Then on the tenant once HRMS is
   turned on, where each answers as spec B §3.8 reads them. */

const t = showcaseTenant()
const on = showcaseTenantHrmsOn()
const byId = (id: string) => SAMPLE_SIGN_INS.find((s) => s.id === id)!
const answerOn = (tenant: Tenant) => (id: string) => {
  const r = resolveSignIn(tenant.policies, byId(id).facts, envOf(tenant))
  const rule = r.trace && r.trace.hitIndex !== null ? tenant.policies.find((p) => p.id === r.decidedBy?.policyId)?.rules[r.trace.hitIndex]?.name : 'Nothing else matched'
  return { status: r.status, decision: r.decision, policy: r.decidedBy?.policyName, rule, possible: r.possible.map((o) => o.decision) }
}
const answer = answerOn(t)

describe('the samples', () => {
  it('are all on the showcase tenant, nine of them', () => {
    expect(samplesIn(t.directory.people, t.apps).map((s) => s.id)).toEqual(SAMPLE_SIGN_INS.map((s) => s.id))
    expect(SAMPLE_SIGN_INS).toHaveLength(9)
  })

  it('hides a sample whose person or application the tenant lacks', () => {
    const legacy = tenantAt('medium')
    const shown = samplesIn(legacy.directory.people, legacy.apps)
    expect(shown.length).toBeLessThan(SAMPLE_SIGN_INS.length)
    for (const s of shown) {
      expect(legacy.directory.people.some((u) => u.id === s.facts.personId)).toBe(true)
      expect(legacy.apps.some((a) => a.id === s.facts.appId)).toBe(true)
    }
  })

  /* What the Samples view shows on a clean load. The HRMS scenes do not
     answer apart until HRMS is on: all four read the Global Default, and none
     is Can't tell. */
  it('answer on the tenant as it opens, with HRMS Inactive', () => {
    for (const id of ['hr-office', 'hr-home', 'sales-hrms', 'no-address']) {
      expect(answer(id)).toMatchObject({ status: 'decided', decision: '1fa', policy: 'Global Default Policy', rule: 'Baseline access' })
    }
    expect(answer('android-12')).toMatchObject({ decision: 'deny', policy: 'Device compliance for Outlook and Dropbox', rule: 'Nothing else matched' })
    expect(answer('personal-laptop')).toMatchObject({ decision: 'deny', policy: 'Access the app through corporate devices only', rule: 'Nothing else matched' })
    expect(answer('third-device')).toMatchObject({ decision: 'deny', policy: 'Access the app through corporate devices only', rule: 'Nothing else matched' })
    expect(answer('medium-risk')).toMatchObject({ decision: '2fa', policy: 'Access the app through corporate devices only', rule: 'Medium risk — password and OTP' })
    expect(answer('dev-office')).toMatchObject({ decision: '1fa', policy: 'Developer tools — office and device checks', rule: 'In the office on a compliant device' })
  })

  it('answer as the spec says once HRMS is on', () => {
    const a = answerOn(on)
    expect(a('hr-office')).toMatchObject({ decision: '2fa', policy: 'HRMS access from corporate offices', rule: 'In a corporate office' })
    expect(a('hr-home')).toMatchObject({ decision: 'deny', policy: 'HRMS access from corporate offices', rule: 'Nothing else matched' })
    expect(a('sales-hrms')).toMatchObject({ decision: '1fa', policy: 'Global Default Policy', rule: 'Baseline access' })
    expect(a('no-address')).toMatchObject({ status: 'depends', decision: null, possible: ['2fa', 'deny'] })
    for (const id of ['android-12', 'personal-laptop', 'third-device', 'medium-risk', 'dev-office']) expect(a(id)).toEqual(answer(id))
  })

  it('load into Try as the same sign-in', () => {
    /* The way into Try is `formOf`, and back out is `factsOf`: a sample loaded
       and run again must get the answer its row showed — with HRMS off and on. */
    for (const tenant of [t, on]) {
      for (const s of SAMPLE_SIGN_INS) {
        const again = factsOf(formOf(s.facts, tenant.zones), tenant.zones).facts
        const shown = resolveSignIn(tenant.policies, s.facts, envOf(tenant))
        expect(resolveSignIn(tenant.policies, again, envOf(tenant))).toMatchObject({ status: shown.status, decision: shown.decision })
      }
    }
  })

  it('light the Office network chip for the office samples', () => {
    expect(formOf(byId('hr-office').facts, t.zones).origin).toBe('office')
    expect(formOf(byId('sales-hrms').facts, t.zones).origin).toBe('office')
  })
})
