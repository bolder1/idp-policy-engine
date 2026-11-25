import { describe, expect, it, vi } from 'vitest'

/* The Design line's rule, switched on for this file alone: every other change stays as tests see it (off), so the
   resolver here is the Design one (rollout.ts `noGlobalDefault`; owner, 25 Nov 2026: "remove global policy … Blocked"). */
vi.mock('./rollout', async (original) => ({ ...(await original<typeof import('./rollout')>()), shows: (change: string) => change === 'noGlobalDefault' }))

const { showcaseTenantHrmsOn } = await import('./fixtures')
const { envOf, resolveSignIn } = await import('./screens/tenant-resolver')
const { engineRun } = await import('./screens/sign-in-tests/engine-run')
const { NO_GLOBAL_DEFAULT, NO_POLICY_ID, NO_POLICY_LINE } = await import('./no-global-default')
const { rowsRead } = await import('./screens/testing/rows-read')
const { factsOf } = await import('./screens/testing/sign-in-form')
const { emptyDraft } = await import('./screens/sign-in-tests/sign-in-card')

/* The tenant as Design opens it: no system policy (store.tsx drops it). */
const full = showcaseTenantHrmsOn()
const t = { ...full, policies: full.policies.filter((p) => !p.isSystem) }
const env = envOf(t)
/* An application no policy covers, and someone to sign in to it. */
const uncovered = t.apps.find((a) => !t.policies.some((p) => p.appIds.includes(a.id)))!
const person = t.directory.people[0]!

describe('No Global Default on Design', () => {
  it('is on for this file', () => {
    expect(NO_GLOBAL_DEFAULT).toBe(true)
    expect(uncovered).toBeDefined()
  })

  it('blocks a sign-in to an application no policy covers, rather than leaving it incomplete', () => {
    const r = resolveSignIn(t.policies, { appId: uncovered.id, personId: person.id }, env)
    expect(r.status).toBe('decided')
    expect(r.decision).toBe('deny')
    expect(r.decidedBy?.policyId).toBe(NO_POLICY_ID)
    expect(r.missing).toEqual([])
  })

  it('says "No policy · Blocked" where the outcome is written', () => {
    const f = { ...emptyDraft('2026-11-25', '09:30'), personId: person.id, appId: uncovered.id }
    const { facts } = factsOf(f, t.zones)
    const res = resolveSignIn(t.policies, facts, env)
    const rows = rowsRead(t.policies, null, f.appId, { zones: t.zones, fingerprints: t.fingerprints })
    const run = engineRun({ res, policies: t.policies, form: f, facts, env, ctx: { people: t.directory.people, apps: t.apps, zones: t.zones, rows } })
    expect(run.outcome.view.line).toBe(NO_POLICY_LINE)
    expect(run.outcome.why).toBe(NO_POLICY_LINE)
    expect(run.outcome.decision).toBe('deny')
  })

  it('still asks for the app and the person before it decides anything', () => {
    const r = resolveSignIn(t.policies, { appId: uncovered.id }, env)
    expect(r.status).toBe('incomplete')
    expect(r.missing).toEqual(['person'])
  })

  it('leaves an application a policy covers to that policy', () => {
    const covered = t.policies.find((p) => p.status === 'active' && p.type === 'App Access' && p.appIds.length > 0)!
    const r = resolveSignIn(t.policies, { appId: covered.appIds[0], personId: person.id }, env)
    expect(r.decidedBy?.policyId).not.toBe(NO_POLICY_ID)
  })
})
