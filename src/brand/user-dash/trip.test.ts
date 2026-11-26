import { describe, expect, it } from 'vitest'

import { showcaseTenantHrmsOn } from '../fixtures'
import { searchPlaces } from '../places'
import { envOf } from '../screens/tenant-resolver'
import { placeFact, tripIssue, tripOutlook } from './trip'

/* Travel (plan Task 7): a trip is checked with the real engine, app by app, for that place and its first day. */

const t = showcaseTenantHrmsOn()
const env = envOf(t)
const country = (name: string) => searchPlaces(name, 1, 'country')[0]!.id
const SG = country('Singapore')
const IN_PUNE = searchPlaces('Pune', 1, 'city')[0]!.id
const TODAY = '2026-11-26'

describe('tripIssue', () => {
  it('asks for a place and dates', () => {
    expect(tripIssue({ placeId: '', start: '2026-12-03', end: '2026-12-10' }, TODAY)?.field).toBe('place')
    expect(tripIssue({ placeId: SG, start: '', end: '2026-12-10' }, TODAY)?.text).toBe('Choose a start date')
  })

  it('refuses a start in the past and an end before the start', () => {
    expect(tripIssue({ placeId: SG, start: '2026-11-20', end: '2026-12-10' }, TODAY)?.text).toBe('The start date has passed')
    expect(tripIssue({ placeId: SG, start: '2026-12-10', end: '2026-12-03' }, TODAY)?.text).toBe('End after the start')
  })

  it('refuses a trip over 30 days', () => {
    expect(tripIssue({ placeId: SG, start: '2026-12-01', end: '2027-01-01' }, TODAY)?.text).toBe('A trip can last up to 30 days')
    expect(tripIssue({ placeId: SG, start: '2026-11-27', end: '2026-12-26' }, TODAY)).toBeNull()
  })

  /* An approval runs from the day it is given, so a far-off trip would outlast Temporary access's 30 days. */
  it('refuses a trip that ends more than 30 days from today', () => {
    expect(tripIssue({ placeId: SG, start: '2027-02-01', end: '2027-02-05' }, TODAY)?.text).toBe('Add a trip that ends within 30 days')
  })
})

describe('placeFact', () => {
  it('states the place by its names and position', () => {
    const f = placeFact(IN_PUNE)!
    expect(f.city).toBe('Pune')
    expect(f.country).toBe('India')
    expect(f.source).toBe('stated')
  })
})

describe('tripOutlook', () => {
  const apps = t.apps.map((a) => a.id)
  const trip = (placeId: string) => ({ id: 't', placeId, start: '2026-12-03', end: '2026-12-10' })

  it('finds an app that will not work in Singapore, and keeps the policy for the admin', () => {
    const out = tripOutlook(trip(SG), 'priya', apps, t.policies, env)
    const blocked = out.filter((o) => o.outlook === 'blocked')
    expect(blocked.length).toBeGreaterThan(0)
    expect(blocked.every((o) => o.policyId !== null)).toBe(true)
  })

  /* HRMS opens only on the office network (its zone's address half), so any trip, even one to Pune, is off it. */
  it('HRMS needs the office network, wherever the trip goes', () => {
    expect(tripOutlook(trip(SG), 'priya', ['hrms'], t.policies, env)[0].outlook).toBe('blocked')
    expect(tripOutlook(trip(IN_PUNE), 'priya', ['hrms'], t.policies, env)[0].outlook).toBe('blocked')
  })

  it('an app with no place rule still works abroad', () => {
    expect(tripOutlook(trip(SG), 'priya', apps, t.policies, env).some((o) => o.outlook === 'works')).toBe(true)
  })
})
