import { describe, expect, it } from 'vitest'

import { audienceOf, type Policy } from '../data'
import { showcaseTenantHrmsOn } from '../fixtures'
import type { SignInFacts } from './sign-in-facts'
import { envOf, resolveSignIn } from './tenant-resolver'
import { differingWatch, watchingSentence, watchingWords } from './watching-words'

/* What a monitoring policy says it would do, on the showcase's HRMS set to
   Monitoring (Spec C §5.2, the final spec's Assumption 1). */

/* These scenes read HRMS deciding, so they run on the tenant once it is
   turned on; the seed opens with HRMS Inactive (Phase 4). */
const t = showcaseTenantHrmsOn()
const env = envOf(t)
const hrms = t.policies.find((p) => p.id === 'sc-hrms-office')!
const monitoring = (over: Partial<Policy> = {}) => t.policies.map((p) => (p.id === hrms.id ? { ...p, status: 'monitor' as const, ...over } : p))
const kavya = (over: Partial<SignInFacts> = {}): SignInFacts => ({ personId: 'u-hr-1', appId: 'hrms', network: { address: '203.0.113.24', source: 'stated' }, ...over })

describe('a monitor that would decide', () => {
  const res = resolveSignIn(monitoring(), kavya(), env)
  const [w] = res.watching

  it('says what it would decide, as a would-badge', () => {
    expect(watchingWords(w)).toEqual({ would: 'Would allow with 2FA', reach: [], yields: null })
    expect(watchingSentence(w)).toBe('Monitoring: HRMS access from corporate offices would allow with 2FA')
  })

  it('earns a line under the decision, because the Global Default decides differently', () => {
    expect(res.decision).toBe('1fa')
    expect(differingWatch(res).map((x) => x.policyId)).toEqual([hrms.id])
  })

  it('earns none where it would agree', () => {
    const agree = resolveSignIn(monitoring({ rules: hrms.rules.map((r) => ({ ...r, decision: '1fa' as const })) }), kavya(), env)
    expect(differingWatch(agree)).toEqual([])
  })
})

describe("a monitor that can't tell", () => {
  it('says so in grey, strictest first', () => {
    const [w] = resolveSignIn(monitoring(), kavya({ network: undefined }), env).watching
    expect(watchingWords(w)).toEqual({ would: null, reach: ['deny', '2fa'], yields: null })
    expect(watchingSentence(w)).toBe("Monitoring: HRMS access from corporate offices can't tell (deny or allow with 2FA)")
  })
})

describe('a monitor that would still yield', () => {
  it('names the policy that applies first when it is on', () => {
    /* HRMS for everyone (the DEFAULT group) beside an active custom-group copy. */
    const copy: Policy = { ...hrms, id: 'hrms-custom', name: 'HRMS for HR' }
    const policies = [...monitoring({ audience: { ...audienceOf([]), everyone: true } }), copy]
    const res = resolveSignIn(policies, kavya(), env)
    const w = res.watching.find((x) => x.policyId === hrms.id)!
    expect(watchingWords(w).yields).toBe('When on: HRMS for HR applies first')
    expect(differingWatch(res)).toEqual([])
  })
})
