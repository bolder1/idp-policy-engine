import { describe, expect, it } from 'vitest'

import { showcaseTenantHrmsOn, type Tenant } from '../fixtures'
import { EMPTY_RISK_PROFILE, riskScale } from '../risk-signals'
import { envWith, simEnvOf } from './sim-env'
import type { SignInFacts } from './simulate'
import { envOf, resolveSignIn } from './tenant-resolver'

/* The store's env and the tenant's env are the same env.

   `envOf` builds one from a tenant value for the engine tests; `simEnvOf`
   builds one from the store's collections for the screens. If they drifted,
   every showcase result the tests pin would stop describing what the console
   shows. */

/* These scenes read HRMS deciding, so they run on the tenant once it is
   turned on; the seed opens with HRMS Inactive (Phase 4). */
const t = showcaseTenantHrmsOn()
const sourceOf = (x: Tenant) => ({
  ...x,
  users: x.directory.people,
  riskScale: riskScale(x.riskProfiles.find((p) => p.id === x.activeRiskProfileId) ?? EMPTY_RISK_PROFILE),
})
const env = simEnvOf(sourceOf(t))
const office: SignInFacts = { appId: 'hrms', personId: 'u-hr-1', network: { address: '203.0.113.24', source: 'stated' } }

describe('simEnvOf', () => {
  it('names what the tenant env names', () => {
    const ref = envOf(t)
    for (const [key, id] of [
      ['zoneName', 'corp-offices'],
      ['fingerprintName', 'fp-compliant'],
      ['groupName', 'hr'],
      ['userName', 'u-exec-2'],
      ['appName', 'hrms'],
    ] as const) {
      expect(env[key]?.(id)).toBe(ref[key]?.(id))
    }
    expect(env.riskScale).toEqual(ref.riskScale)
  })

  it('names a deleted object by its id, never as another one', () => {
    /* The gauntlet's own env used `groupById`, which falls back to the first
       group, so a who naming a deleted group read as Employees. */
    expect(env.groupName('gone')).toBe('gone')
    expect(env.userName?.('gone')).toBe('gone')
    expect(env.hasZone?.('gone')).toBe(false)
  })

  it('says "Does not cover HRMS", not "hrms"', () => {
    const r = resolveSignIn(t.policies, { ...office, appId: 'outlook' }, env)
    expect(r.standings.find((s) => s.policyId === 'sc-hrms-office')?.reason).toBe('Does not cover Microsoft Outlook')
  })

  it('decides the showcase sign-ins the way the tenant env does', () => {
    const ref = envOf(t)
    for (const personId of ['u-hr-1', 'u-hr-2', 'u-sales-1', 'priya']) {
      const a = resolveSignIn(t.policies, { ...office, personId }, env)
      const b = resolveSignIn(t.policies, { ...office, personId }, ref)
      expect([personId, a.decidedBy?.policyId, a.decision]).toEqual([personId, b.decidedBy?.policyId, b.decision])
    }
  })
})

describe('envWith', () => {
  it('reads a draft zone in place of the stored one', () => {
    const zones = t.zones.map((z) => (z.id === 'corp-offices' ? { ...z, name: 'Offices', ip: ['198.51.100.0/24'] } : z))
    const draft = envWith(env, { zones })
    expect(draft.zoneName('corp-offices')).toBe('Offices')
    expect(draft.library?.zones).toBe(zones)
    expect(draft.library?.fingerprints).toBe(env.library?.fingerprints)
    /* Kavya's office address is no longer in the zone's blocks. */
    expect(resolveSignIn(t.policies, office, env).decision).toBe('2fa')
    expect(resolveSignIn(t.policies, office, draft).decision).toBe('deny')
  })

  it('leaves the env it was given alone', () => {
    envWith(env, { zones: [], riskScale: { Low: 1, Medium: 2, High: 3 } })
    expect(env.hasZone?.('corp-offices')).toBe(true)
    expect(env.riskScale).not.toEqual({ Low: 1, Medium: 2, High: 3 })
  })

  it('treats a deleted zone as gone', () => {
    const draft = envWith(env, { zones: t.zones.filter((z) => z.id !== 'india') })
    expect(draft.hasZone?.('india')).toBe(false)
    expect(draft.hasZone?.('corp-offices')).toBe(true)
  })
})
