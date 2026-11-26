import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { showcaseTenantHrmsOn } from '../fixtures'
import { envOf } from '../screens/tenant-resolver'
import { BrandProvider } from '../store'
import shellSrc from '../Shell.tsx?raw'
import { approveTravel } from './admin-requests'
import { ApproveTravelBody } from './RequestsDrawer'
import type { UserRequest } from './state'
import { tripOutlook } from './trip'

/* The admin's Requests (plan Task 8): an approved trip is Temporary access, from anywhere, until the trip's last day. */

const t = showcaseTenantHrmsOn()
const trip = { id: 't1', placeId: 'sg', start: '2026-12-03', end: '2026-12-10' }
const req: UserRequest = { id: 'r1', kind: 'travel', personId: 'priya', at: 'Now', status: 'pending', tripId: 't1', policyIds: ['sc-hrms-office', 'gone-policy'] }
const person = { id: 'priya', name: 'Priya Sharma' }

describe('approveTravel', () => {
  const changed = approveTravel(t.policies, req, trip, person, 'Client visit', 'Jaspreet Toor')

  it('adds a first rule with the trip end to each policy', () => {
    const hrms = changed.find((p) => p.id === 'sc-hrms-office')!
    expect(hrms.rules[0].tempAccess).toEqual({ until: '2026-12-10', reason: 'Client visit', by: 'Jaspreet Toor' })
    expect(hrms.rules[0].who?.userIds).toEqual(['priya'])
  })

  it('skips a policy that no longer exists', () => {
    expect(changed.map((p) => p.id)).toEqual(['sc-hrms-office'])
  })

  it('the trip then works', () => {
    const after = t.policies.map((p) => changed.find((c) => c.id === p.id) ?? p)
    expect(tripOutlook(trip, 'priya', ['hrms'], after, envOf(t))[0].outlook).toBe('works')
  })
})

describe('the approve popup', () => {
  it('says anywhere', () => {
    const out = renderToStaticMarkup(
      <BrandProvider>
        <ApproveTravelBody person="Priya Sharma" trip={trip} reason="" onReason={() => {}} tried={false} />
      </BrandProvider>,
    )
    expect(out).toContain('Lets Priya Sharma in from anywhere until 10 Dec 2026')
  })

  it('refuses to approve when nothing is left to grant', () => {
    const gone = { ...req, policyIds: ['gone-policy'] }
    expect(approveTravel(t.policies, gone, trip, person, 'x', 'y')).toEqual([])
    const out = renderToStaticMarkup(
      <BrandProvider>
        <ApproveTravelBody person="Priya Sharma" trip={trip} reason="" onReason={() => {}} tried={false} nothingToGrant />
      </BrandProvider>,
    )
    expect(out).toContain('Nothing to grant: the policies that refused this trip no longer exist')
    expect(out).not.toContain('from anywhere')
  })

  it('drawer hidden off Design', () => {
    const code = shellSrc.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(code).toMatch(/USER_DASH\s*&&\s*<RequestsButton/)
    expect(code).toContain("shows('userDashboard')")
  })
})
