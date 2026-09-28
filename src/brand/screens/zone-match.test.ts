import { describe, expect, it } from 'vitest'

import { emptyLocation, type Zone } from '../data'
import { showcaseZones } from '../showcase-seed'
import type { SignInFacts, SignInPlace } from './sign-in-facts'
import { placeOfSignIn, zoneHalves, zoneMember } from './zone-match'

/* -----------------------------------------------------------------------------
   Zone membership, read from the zone's own entries.

   The showcase office zone is the one worth pinning: two address blocks AND a
   location half (two cities and a 25 km range around Pune). A home connection
   in Pune is in the city and not on the network — the case that proves the
   network half is read at all.
   -------------------------------------------------------------------------- */

const offices = showcaseZones.find((z) => z.id === 'corp-offices')!
const india = showcaseZones.find((z) => z.id === 'india')!
const at = (address: string, extra: Partial<SignInFacts> = {}): SignInFacts => ({ network: { address, source: 'typed' }, ...extra })
const stated = (city: string, lat: number, lon: number, country = 'India'): SignInPlace => ({ country, city, lat, lon, source: 'stated' })
const zone = (over: Partial<Zone>): Zone => ({ id: 'z', name: 'Z', kind: 'custom', ip: [], asn: [], location: emptyLocation(), usedIn: 0, ...over })

describe('the office zone', () => {
  it('holds an office address that looks up to Pune, on both halves', () => {
    const m = zoneMember(offices, at('203.0.113.25'), 'both')
    expect(m).toMatchObject({ zoneId: 'corp-offices', zoneName: 'Corporate offices', status: 'pass', network: 'pass', location: 'pass' })
    expect(m.halves.networkEntry).toBe('203.0.113.0/24')
    expect(m.halves.locationEntry).toBe('Pune')
    expect(m.halves.place?.source).toBe('looked-up')
  })

  it('refuses a home connection in the same city: in the place, not on the network', () => {
    const m = zoneMember(offices, at('192.0.2.10'), 'both')
    expect(m).toMatchObject({ status: 'fail', network: 'fail', location: 'pass' })
    expect(m.missing).toEqual([])
  })

  it('reads a stated place over the looked-up one', () => {
    /* Mumbai is a listed city, although it is 125 km from the Pune range. */
    expect(zoneMember(offices, at('203.0.113.25', { location: stated('Mumbai', 19.1, 72.9) }), 'both').status).toBe('pass')
    /* Hinjewadi is not a listed city, and is about 20 km from Pune. */
    expect(zoneMember(offices, at('203.0.113.25', { location: stated('Hinjewadi', 18.59, 73.74) }), 'both').status).toBe('pass')
    /* Lonavala is about 58 km out. */
    const far = zoneMember(offices, at('203.0.113.25', { location: stated('Lonavala', 18.75, 73.41) }), 'both')
    expect(far).toMatchObject({ status: 'fail', network: 'pass', location: 'fail' })
  })

  it('knows a city by its alias', () => {
    const z = zone({ location: { ...emptyLocation(), cities: ['Bangalore'] } })
    expect(zoneMember(z, at('198.51.100.20'), 'both').status).toBe('pass')
  })

  it('is undecided with nothing to go on, and says what would settle it', () => {
    const m = zoneMember(offices, {}, 'both')
    expect(m).toMatchObject({ status: 'unknown', network: 'unknown', location: 'unknown' })
    expect(m.missing).toEqual(['address', 'location'])
  })

  it('is a definite miss for an anonymiser, because its address is not an office one', () => {
    expect(zoneMember(offices, at('192.0.2.66'), 'both')).toMatchObject({ status: 'fail', network: 'fail', location: 'unknown' })
  })

  it('does not read an address that is not one as a miss', () => {
    const m = zoneMember(offices, at('203.0.113.999'), 'both')
    expect(m.network).toBe('unknown')
    expect(m.missing).toContain('address')
  })
})

describe('a location-only zone', () => {
  it('holds a place in the country, and refuses one outside it', () => {
    expect(zoneMember(india, { location: stated('Pune', 18.5, 73.9) }, 'both')).toMatchObject({ status: 'pass', network: 'any' })
    expect(zoneMember(india, { location: stated('Berlin', 52.5, 13.4, 'Germany') }, 'both').status).toBe('fail')
  })

  it('cannot place a Tor exit, so it is undecided rather than outside', () => {
    const m = zoneMember(india, at('192.0.2.66'), 'both')
    expect(m.status).toBe('unknown')
    expect(m.missing).toEqual(['location'])
    expect(placeOfSignIn(at('192.0.2.66'))).toBeNull()
  })

  it('is undecided for an address the fixture has no row for', () => {
    expect(zoneMember(india, at('8.8.8.8'), 'both')).toMatchObject({ status: 'unknown', missing: ['location'] })
  })

  it('places the proxy by country, which is enough to say it is outside India', () => {
    expect(zoneMember(india, at('192.0.2.82'), 'both').status).toBe('fail')
  })
})

describe('the half a condition asks about', () => {
  it('reads one half alone, and reports the other as not asked', () => {
    expect(zoneMember(offices, at('192.0.2.10'), 'ip')).toMatchObject({ status: 'fail', network: 'fail', location: 'not asked' })
    expect(zoneMember(offices, at('192.0.2.10'), 'location')).toMatchObject({ status: 'pass', network: 'not asked', location: 'pass' })
  })

  it('never satisfies a half the zone does not have', () => {
    /* A stale scope: the zones screen does not offer one on a one-half zone. */
    expect(zoneMember(india, { location: stated('Pune', 18.5, 73.9) }, 'ip').status).toBe('fail')
    const net = zone({ ip: ['203.0.113.0/24'] })
    expect(zoneMember(net, at('203.0.113.9'), 'location').status).toBe('fail')
    expect(zoneMember(net, at('203.0.113.9'), 'both').status).toBe('pass')
  })
})

describe('the network half', () => {
  it('matches an ASN looked up from the address, or stated', () => {
    const z = zone({ asn: ['as64500'] })
    expect(zoneHalves(z, at('203.0.113.9')).network).toBe('pass')
    expect(zoneHalves(z, at('192.0.2.10')).network).toBe('fail')
    expect(zoneHalves(z, { network: { address: '8.8.8.8', asn: 'AS64500', source: 'typed' } }).network).toBe('pass')
  })

  it('fails an ASN entry for a network stated to have none, and leaves it open when nothing was said', () => {
    const z = zone({ asn: ['AS64500'] })
    expect(zoneHalves(z, { network: { address: '8.8.8.8', asn: null, source: 'typed' } }).network).toBe('fail')
    expect(zoneHalves(z, at('8.8.8.8'))).toMatchObject({ network: 'unknown', missing: ['asn'] })
    expect(zoneHalves(z, {})).toMatchObject({ network: 'unknown', missing: ['asn'] })
  })

  it('passes when any entry holds the address, including an IPv6 block', () => {
    const z = zone({ ip: ['10.0.0.0/8', '2001:db8:1::/48'] })
    expect(zoneHalves(z, at('2001:db8:1::5')).network).toBe('pass')
    expect(zoneHalves(z, at('2001:db8:2::5')).network).toBe('fail')
  })

  it('cannot be satisfied by an entry the zone page would refuse', () => {
    expect(zoneHalves(zone({ ip: ['not a block'] }), at('203.0.113.9')).network).toBe('fail')
  })
})

describe('ranges', () => {
  it('measures in the unit the range was typed in', () => {
    const around = (km: number, unit?: 'km' | 'mi') =>
      zone({ location: { ...emptyLocation(), ranges: [{ km, lat: 18.5, lon: 73.9, label: 'Pune', unit }] } })
    const hinjewadi = { location: stated('Hinjewadi', 18.59, 73.74) }
    /* About 19.6 km: outside 10 miles (16.1 km), inside 15 miles (24.1 km). */
    expect(zoneHalves(around(10, 'mi'), hinjewadi).location).toBe('fail')
    expect(zoneHalves(around(15, 'mi'), hinjewadi).location).toBe('pass')
    expect(zoneHalves(around(20), hinjewadi).location).toBe('pass')
  })

  it('needs coordinates, and says so', () => {
    const z = zone({ location: { ...emptyLocation(), ranges: [{ km: 25, lat: 18.5, lon: 73.9, label: 'Pune' }] } })
    const got = zoneHalves(z, { location: { country: 'India', city: 'Pune', lat: null, lon: null, source: 'stated' } })
    expect(got).toMatchObject({ location: 'unknown', missing: ['location.coordinates'] })
  })
})
