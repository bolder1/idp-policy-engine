import type { Policy } from '../data'
import { PLACES } from '../places'
import type { SignInDevice, SignInPlace } from '../screens/sign-in-facts'
import { addDays } from '../screens/sign-in-tests/temp-access'
import { TEMP_ACCESS_MAX_DAYS } from '../screens/sign-in-tests/temp-access'
import type { SimEnv } from '../screens/simulate'
import { resolveSignIn } from '../screens/tenant-resolver'
import type { Trip } from './state'

/* -----------------------------------------------------------------------------
   Travel notice (spec goal 4, the differentiator): before a trip, check each of the person's apps with the real
   engine for that place and the trip's first day, on the laptop they use. The outlook keeps the deciding policy for
   the admin's request; the person's page never draws it (the reason is admin only). PURE.
   -------------------------------------------------------------------------- */

/** A trip lasts at most as long as Temporary access can, since an approval is one grant until its last day. */
export const TRIP_MAX_DAYS = TEMP_ACCESS_MAX_DAYS

export type TripIssue = { field: 'place' | 'start' | 'end'; text: string }

const iso = /^\d{4}-\d{2}-\d{2}$/

export function tripIssue(trip: Pick<Trip, 'placeId' | 'start' | 'end'>, today: string): TripIssue | null {
  if (!trip.placeId) return { field: 'place', text: 'Choose a place' }
  if (!iso.test(trip.start)) return { field: 'start', text: 'Choose a start date' }
  if (trip.start < today) return { field: 'start', text: 'The start date has passed' }
  if (!iso.test(trip.end)) return { field: 'end', text: 'Choose an end date' }
  if (trip.end < trip.start) return { field: 'end', text: 'End after the start' }
  if (trip.end > addDays(trip.start, TRIP_MAX_DAYS)) return { field: 'end', text: `A trip can last up to ${TRIP_MAX_DAYS} days` }
  /* An approval runs from the day it is given to the trip's end, and Temporary access lasts at most 30 days. */
  if (trip.end > addDays(today, TRIP_MAX_DAYS)) return { field: 'end', text: `Add a trip that ends within ${TRIP_MAX_DAYS} days` }
  return null
}

/** A catalogue place as the engine's location fact, stated by the person. */
export function placeFact(placeId: string): SignInPlace | null {
  const p = PLACES.find((x) => x.id === placeId)
  if (!p) return null
  return { country: p.country, state: p.state ?? null, city: p.kind === 'city' ? p.name : null, lat: p.lat, lon: p.lon, source: 'stated' }
}

/** The display name of a trip's place: "Singapore", "Pune, India". */
export function placeName(placeId: string): string {
  const p = PLACES.find((x) => x.id === placeId)
  if (!p) return placeId
  return p.kind === 'country' ? p.name : `${p.name}, ${p.country}`
}

/** The laptop the demo is on (seed.ts CURRENT_DEVICE_ID): a trip is checked as a sign-in from it. */
export const TRAVEL_DEVICE: SignInDevice = { source: 'stated', platform: 'macos', osVersion: '14.6', formFactor: 'Laptop', browser: { family: 'chrome', version: '131' } }

/* Away, she is on a hotel or phone network, never an office one: a public address no zone lists (TEST-NET-1). Without
   it, a zone that matches by address OR place cannot tell, and every office-only app reads "Can't tell yet". */
export const TRAVEL_NETWORK = { address: '192.0.2.10', source: 'stated' as const }

export type AppOutlook = 'works' | 'blocked' | 'unsure'

/* Home: the office network in Pune, on the same laptop. An app refused there is refused for reasons the trip did not
   cause (on the Design line, an app no policy covers is blocked everywhere), and approving travel could not fix it, so
   the trip leaves it out. The address sits in the seed's Corporate offices zone. */
export const HOME_NETWORK = { address: '203.0.113.10', source: 'stated' as const }
export const HOME_PLACE_ID = 'in-maharashtra-pune'

export function tripOutlook(trip: Trip, personId: string, appIds: readonly string[], policies: readonly Policy[], env: SimEnv): { appId: string; outlook: AppOutlook; policyId: string | null }[] {
  const when = { date: trip.start, timeZone: 'UTC', source: 'stated' as const }
  const away = placeFact(trip.placeId)
  const home = placeFact(HOME_PLACE_ID)
  return appIds.flatMap((appId): { appId: string; outlook: AppOutlook; policyId: string | null }[] => {
    const atHome = resolveSignIn(policies, { personId, appId, network: HOME_NETWORK, location: home, when, device: TRAVEL_DEVICE }, env)
    if (atHome.status === 'decided' && atHome.decision === 'deny') return []
    const r = resolveSignIn(policies, { personId, appId, network: TRAVEL_NETWORK, location: away, when, device: TRAVEL_DEVICE }, env)
    if (r.status !== 'decided' || r.decision === null) return [{ appId, outlook: 'unsure' as const, policyId: null }]
    return [r.decision === 'deny' ? { appId, outlook: 'blocked' as const, policyId: r.decidedBy?.policyId ?? null } : { appId, outlook: 'works' as const, policyId: null }]
  })
}
