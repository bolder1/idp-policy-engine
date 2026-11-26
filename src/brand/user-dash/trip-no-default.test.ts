import { describe, expect, it, vi } from 'vitest'

/* The Design line's rule, on for this file alone (rollout.ts `noGlobalDefault`): an app no policy covers is blocked
   for every sign-in, at home as much as abroad. A trip must not list those as "won't work there" — the trip is not
   why, and approving travel could never fix them. Found in the browser walk, 26 Nov 2026. */
vi.mock('../rollout', async (original) => ({ ...(await original<typeof import('../rollout')>()), shows: (change: string) => change === 'noGlobalDefault' }))

const { showcaseTenantHrmsOn } = await import('../fixtures')
const { searchPlaces } = await import('../places')
const { envOf } = await import('../screens/tenant-resolver')
const { tripOutlook } = await import('./trip')

const full = showcaseTenantHrmsOn()
const t = { ...full, policies: full.policies.filter((p) => !p.isSystem) }
const env = envOf(t)
const SG = searchPlaces('Singapore', 1, 'country')[0]!.id
const trip = { id: 't', placeId: SG, start: '2026-12-03', end: '2026-12-10' }

describe('a trip on the Design line (no global default)', () => {
  const uncovered = t.apps.filter((a) => !t.policies.some((p) => p.appIds.includes(a.id))).map((a) => a.id)
  const out = tripOutlook(trip, 'priya', t.apps.map((a) => a.id), t.policies, env)

  it('leaves out an app that is blocked at home too', () => {
    expect(uncovered.length).toBeGreaterThan(0)
    for (const id of uncovered) expect(out.find((o) => o.appId === id)).toBeUndefined()
  })

  it('still flags HRMS, which works at the office and not abroad', () => {
    expect(out.find((o) => o.appId === 'hrms')?.outlook).toBe('blocked')
  })
})
