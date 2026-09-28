import { describe, expect, it } from 'vitest'

import { EVERYONE, audienceOf, blankPolicy, fallbackRule, rule, type Policy } from '../data'
import { showcaseTenantHrmsOn } from '../fixtures'
import type { SignInFacts } from './simulate'
import { envOf, governingPolicy, resolveSignIn, tierOf } from './tenant-resolver'

/* -----------------------------------------------------------------------------
   Which policy governs a sign-in, across the tenant.

   The documented parts of the product's rule are what these pin: a custom-group
   policy beats a DEFAULT-group one, and only one policy applies per app and
   group. List order stands in for the undocumented weight within a tier, and a
   test says so by moving a policy up the list and watching nothing change
   across tiers.
   -------------------------------------------------------------------------- */

/* These scenes read HRMS deciding, so they run on the tenant once it is
   turned on; the seed opens with HRMS Inactive (Phase 4). */
const t = showcaseTenantHrmsOn()
const env = envOf(t)
const office = (personId: string, appId = 'hrms'): SignInFacts => ({ appId, personId, network: { address: '203.0.113.25', source: 'typed' } })
const hrmsOffice = t.policies.find((p) => p.id === 'sc-hrms-office')!

const live = (over: Partial<Policy> & Pick<Policy, 'id' | 'name'>): Policy => ({
  ...blankPolicy(over.name, ['hrms']),
  status: 'active',
  ...over,
})

describe('tiers', () => {
  it('ranks the system policy, the DEFAULT group and named audiences', () => {
    expect(tierOf(t.policies.find((p) => p.isSystem)!)).toBe('global-default')
    expect(tierOf(t.policies.find((p) => p.id === 'sc-device-compliance')!)).toBe('default-group')
    expect(tierOf(hrmsOffice)).toBe('custom')
    expect(tierOf(live({ id: 'x', name: 'People', audience: audienceOf([], ['u-hr-1']) }))).toBe('custom')
  })
})

describe('a custom group beats the DEFAULT group', () => {
  const everyoneOnHrms = live({ id: 'p-everyone-hrms', name: 'Everyone on HRMS', audience: EVERYONE, rules: [rule({ name: 'All', decision: '2fa' })] })
  /* Above the custom policy in the list, so list order alone would pick it. */
  const policies = [t.policies[0], everyoneOnHrms, ...t.policies.slice(1)]

  it('lets the HR policy decide for Kavya however high the DEFAULT-group policy sits', () => {
    const r = resolveSignIn(policies, office('u-hr-1'), env)
    expect(r.decidedBy?.policyId).toBe('sc-hrms-office')
    const yielded = r.standings.find((s) => s.policyId === everyoneOnHrms.id)!
    expect(yielded.kind).toBe('default-group-yields')
    expect(yielded.reason).toBe('DEFAULT group, a custom-group policy applies')
  })

  it('lets the DEFAULT-group policy decide for somebody no custom policy governs', () => {
    const r = resolveSignIn(policies, office('u-sales-1'), env)
    expect(r.decidedBy?.policyId).toBe(everyoneOnHrms.id)
    expect(r.decision).toBe('2fa')
    expect(r.standings.find((s) => s.policyId === 'global-default')?.kind).toBe('not-reached')
  })
})

describe('one policy per app and group', () => {
  it('lets the earlier of two HR policies on HRMS apply, and says why the later one does not', () => {
    const second = live({ id: 'p-hr-2', name: 'HR on HRMS, again', audience: audienceOf(['hr']), rules: [rule({ name: 'All', decision: 'deny' })] })
    const r = resolveSignIn([...t.policies, second], office('u-hr-1'), env)
    expect(r.decidedBy?.policyId).toBe('sc-hrms-office')
    const later = r.standings.find((s) => s.policyId === second.id)!
    expect(later.kind).toBe('same-app-and-group')
    expect(later.reason).toBe('Same app and group as HRMS access from corporate offices; the earlier policy in the list applies')
  })
})

describe('policies that do not run', () => {
  const withHrms = (p: Policy) => t.policies.map((x) => (x.id === p.id ? p : x))

  it('passes over an inactive policy to the Global Default', () => {
    const r = resolveSignIn(withHrms({ ...hrmsOffice, status: 'inactive' }), office('u-hr-1'), env)
    expect(r.decidedBy?.policyId).toBe('global-default')
    expect(r.standings.find((s) => s.policyId === hrmsOffice.id)).toMatchObject({ kind: 'inactive', reason: 'Inactive' })
  })

  it('passes over a draft, and calls it one', () => {
    const r = resolveSignIn(withHrms({ ...hrmsOffice, status: 'draft' }), office('u-hr-1'), env)
    expect(r.decidedBy?.policyId).toBe('global-default')
    expect(r.standings.find((s) => s.policyId === hrmsOffice.id)).toMatchObject({ kind: 'draft', reason: 'Draft' })
  })

  it('passes over a policy that is not about app access', () => {
    const session = live({ id: 'p-session', name: 'Session length', type: 'Session', audience: audienceOf(['hr']) })
    const r = resolveSignIn([...t.policies, session], office('u-hr-1'), env)
    expect(r.standings.find((s) => s.policyId === session.id)).toMatchObject({ kind: 'not-app-access', reason: 'Not an app access policy' })
  })

  it('names the app a policy does not cover', () => {
    const r = resolveSignIn(t.policies, office('u-hr-1'), env)
    expect(r.standings.find((s) => s.policyId === 'sc-dev-tools')).toMatchObject({ kind: 'other-app', reason: 'Does not cover HRMS' })
  })

  it('evaluates a substitute as though it were live, in place of the stored policy', () => {
    const draft = { ...hrmsOffice, status: 'draft' as const, rules: [rule({ name: 'Everyone in HR', decision: 'deny' })] }
    const r = resolveSignIn(withHrms({ ...hrmsOffice, status: 'draft' }), office('u-hr-1'), env, { substitute: draft })
    expect(r.decidedBy?.policyId).toBe(hrmsOffice.id)
    expect(r.decision).toBe('deny')
    expect(r.trace?.steps[0].ruleName).toBe('Everyone in HR')
  })
})

describe('where it deliberately differs from `decidesFor`', () => {
  it('lets a live policy with every rule off still decide, by its last row', () => {
    const allOff = { ...hrmsOffice, rules: hrmsOffice.rules.map((r) => ({ ...r, enabled: false })), fallback: fallbackRule('deny') }
    const r = resolveSignIn(t.policies.map((p) => (p.id === allOff.id ? allOff : p)), office('u-hr-1'), env)
    expect(r.decidedBy?.policyId).toBe(hrmsOffice.id)
    expect(r.decision).toBe('deny')
    expect(r.trace?.steps[0].kind).toBe('off')
  })
})

describe('what it will not resolve', () => {
  it('is incomplete without a person, and still says what it can', () => {
    const r = resolveSignIn(t.policies, { appId: 'hrms' }, env)
    expect(r.status).toBe('incomplete')
    expect(r.missing).toEqual(['person'])
    expect(r.decidedBy).toBeNull()
    expect(r.standings.find((s) => s.policyId === 'sc-dev-tools')?.kind).toBe('other-app')
  })

  it('is incomplete without an app', () => {
    expect(resolveSignIn(t.policies, { personId: 'u-hr-1' }, env).missing).toEqual(['app'])
  })

  it('is incomplete for a person the directory does not hold', () => {
    expect(resolveSignIn(t.policies, office('nobody-here'), env).missing).toEqual(['person'])
  })

  it('is incomplete when nothing governs and there is no Global Default', () => {
    const r = resolveSignIn(t.policies.filter((p) => !p.isSystem), office('u-sales-1'), env)
    expect(r.status).toBe('incomplete')
    expect(r.missing).toEqual(['a global default policy'])
    expect(r.standings).toHaveLength(t.policies.length - 1)
  })
})

describe('the shape later phases build on', () => {
  it('lists every policy once, in list order, when the sign-in is complete', () => {
    const r = resolveSignIn(t.policies, office('u-hr-1'), env)
    expect(r.standings.map((s) => s.policyId)).toEqual(t.policies.map((p) => p.id))
  })

  it('watches nothing when no policy is monitoring', () => {
    for (const who of ['u-hr-1', 'u-sales-1', 'arun']) expect(resolveSignIn(t.policies, office(who), env).watching).toEqual([])
    expect(resolveSignIn(t.policies, {}, env).watching).toEqual([])
  })

  it('reports "depends" rather than a decision when the deciding policy could go either way', () => {
    const r = resolveSignIn(t.policies, { appId: 'hrms', personId: 'u-hr-1' }, env)
    expect(r.status).toBe('depends')
    expect(r.decision).toBeNull()
    expect(new Set(r.possible.map((o) => o.decision))).toEqual(new Set(['2fa', 'deny']))
  })

  it('picks the policy without tracing it, for callers that only need which one', () => {
    expect(governingPolicy(t.policies, office('u-sales-1'), env).decider?.id).toBe('global-default')
  })
})

describe('a monitoring policy', () => {
  /* Checks every sign-in, decides none. It is never a candidate, so the policy
     below it decides as though it were off; and it is reported, as if it alone
     were turned on, in `watching`. */
  const monitoring = { ...hrmsOffice, status: 'monitor' as const }
  const withMonitoring = t.policies.map((p) => (p.id === hrmsOffice.id ? monitoring : p))

  it('decides nothing: the Global Default decides for Kavya in the office', () => {
    const r = resolveSignIn(withMonitoring, office('u-hr-1'), env)
    expect(r.decidedBy?.policyId).toBe('global-default')
    expect(r.decision).toBe('1fa')
  })

  it('says what it would decide in its standing, not that it lost', () => {
    const r = resolveSignIn(withMonitoring, office('u-hr-1'), env)
    expect(r.standings.find((s) => s.policyId === hrmsOffice.id)).toMatchObject({
      kind: 'monitoring',
      reason: 'Monitoring: would allow with 2FA',
    })
  })

  it('reports its own would-be result, and that on it would be the one deciding', () => {
    const [w, ...rest] = resolveSignIn(withMonitoring, office('u-hr-1'), env).watching
    expect(rest).toEqual([])
    expect(w).toMatchObject({ policyId: hrmsOffice.id, decision: '2fa', status: 'decided', wouldDecide: true, yieldsTo: null })
    expect(w.trace.policyId).toBe(hrmsOffice.id)
  })

  it('watches nobody outside its audience', () => {
    const r = resolveSignIn(withMonitoring, office('u-sales-1'), env)
    expect(r.standings.find((s) => s.policyId === hrmsOffice.id)?.kind).toBe('not-in-audience')
    expect(r.watching).toEqual([])
  })

  it('says it cannot tell when the facts reach more than one decision', () => {
    const r = resolveSignIn(withMonitoring, { appId: 'hrms', personId: 'u-hr-1' }, env)
    const [w] = r.watching
    expect(w).toMatchObject({ decision: null, status: 'depends' })
    expect(new Set(w.possible.map((o) => o.decision))).toEqual(new Set(['2fa', 'deny']))
    /* Strictest first, though the office rule's 2FA comes before the last
       row's Deny in the policy (final spec C.5). */
    expect(r.standings.find((s) => s.policyId === hrmsOffice.id)?.reason).toBe("Monitoring: can't tell (deny or allow with 2FA)")
  })

  it('names who would still decide when, turned on, it would not', () => {
    /* A DEFAULT-group policy on HRMS, monitoring beside the Active custom-group
       one: on, it would yield to the custom group, so turning it on changes
       nothing for Kavya. */
    const everyone = live({ id: 'p-everyone-hrms', name: 'Everyone on HRMS', audience: EVERYONE, status: 'monitor', rules: [rule({ name: 'All', decision: 'deny' })] })
    const r = resolveSignIn([...t.policies, everyone], office('u-hr-1'), env)
    expect(r.decidedBy?.policyId).toBe(hrmsOffice.id)
    expect(r.watching).toHaveLength(1)
    expect(r.watching[0]).toMatchObject({
      policyId: everyone.id,
      decision: 'deny',
      wouldDecide: false,
      yieldsTo: { policyId: hrmsOffice.id, policyName: hrmsOffice.name, isGlobalDefault: false },
    })
  })

  it('assesses two monitoring policies each as if only it were on', () => {
    const everyone = live({ id: 'p-everyone-hrms', name: 'Everyone on HRMS', audience: EVERYONE, status: 'monitor', rules: [rule({ name: 'All', decision: 'deny' })] })
    const r = resolveSignIn([...withMonitoring, everyone], office('u-hr-1'), env)
    expect(r.decidedBy?.policyId).toBe('global-default')
    expect(r.watching.map((w) => [w.policyId, w.wouldDecide])).toEqual([
      [hrmsOffice.id, true],
      /* On alone, beside HRMS still monitoring, it would decide for Kavya. */
      [everyone.id, true],
    ])
  })

  it('decides when it is the substitute, and is then not watched', () => {
    const r = resolveSignIn(withMonitoring, office('u-hr-1'), env, { substitute: monitoring })
    expect(r.decidedBy?.policyId).toBe(hrmsOffice.id)
    expect(r.decision).toBe('2fa')
    expect(r.standings.find((s) => s.policyId === hrmsOffice.id)?.kind).toBe('decides')
    expect(r.watching).toEqual([])
  })

  it('keeps a draft substitute live while another policy is watched', () => {
    /* The nested "what if it were on" pass must still read the draft as live,
       or a draft under test would vanish from the question it is the subject of. */
    const everyone = live({ id: 'p-everyone-hrms', name: 'Everyone on HRMS', audience: EVERYONE, status: 'monitor', rules: [rule({ name: 'All', decision: 'deny' })] })
    const draft = { ...hrmsOffice, status: 'draft' as const }
    const r = resolveSignIn([...t.policies.map((p) => (p.id === draft.id ? draft : p)), everyone], office('u-hr-1'), env, { substitute: draft })
    expect(r.decidedBy?.policyId).toBe(hrmsOffice.id)
    expect(r.watching[0]).toMatchObject({ policyId: everyone.id, wouldDecide: false, yieldsTo: { policyId: hrmsOffice.id } })
  })

  it('watches nothing while the sign-in is incomplete', () => {
    expect(resolveSignIn(withMonitoring, { appId: 'hrms' }, env).watching).toEqual([])
    const noDefault = resolveSignIn(withMonitoring.filter((p) => !p.isSystem), office('u-hr-1'), env)
    expect(noDefault.status).toBe('incomplete')
    expect(noDefault.watching).toEqual([])
    expect(noDefault.standings.find((s) => s.policyId === hrmsOffice.id)).toMatchObject({ kind: 'monitoring', reason: 'Monitoring' })
  })

  it('still lists every policy once, in list order', () => {
    const r = resolveSignIn(withMonitoring, office('u-hr-1'), env)
    expect(r.standings.map((s) => s.policyId)).toEqual(withMonitoring.map((p) => p.id))
  })
})
