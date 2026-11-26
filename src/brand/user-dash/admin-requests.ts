import type { Policy } from '../data'
import { grantTempAccess } from '../screens/sign-in-tests/temp-access'
import type { Trip, UserRequest } from './state'

/* -----------------------------------------------------------------------------
   The admin's side of Travel notice (spec goal 5). Approving a trip is the built Temporary access, unchanged (owner,
   26 Nov 2026): one grant in each policy that refused the trip, from now, from anywhere, until the trip's last day.
   A policy deleted since the person asked is skipped. PURE.
   -------------------------------------------------------------------------- */

export function approveTravel(policies: readonly Policy[], req: UserRequest, trip: Trip, person: { id: string; name: string }, reason: string, by: string): Policy[] {
  const ids = [...new Set(req.policyIds ?? [])]
  return ids.flatMap((id) => {
    const policy = policies.find((p) => p.id === id)
    return policy ? [grantTempAccess(policy, person, { until: trip.end, reason, by })] : []
  })
}
