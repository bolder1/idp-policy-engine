import { describe, expect, it } from 'vitest'

import { PLACES } from '../places'
import { GEO_FIXTURE, lookUpAddress, placeOf } from './geo-fixture'
import { CHIP_NETWORK, PLACE_FACTS } from './simulate'
import { ipInEntry } from './zone-validation'

/* -----------------------------------------------------------------------------
   The geo fixture is a fixture. These tests are what keep it one: every block
   is a documentation block nobody on the internet can hold, every ASN is a
   documentation ASN, every place is a catalogue place, and no two rows can
   claim the same address.
   -------------------------------------------------------------------------- */

const DOC_BLOCKS = ['192.0.2.0/24', '198.51.100.0/24', '203.0.113.0/24', '2001:db8::/32']
const base = (block: string) => block.split('/')[0]

describe('the fixture', () => {
  it('uses only RFC 5737 and RFC 3849 documentation blocks', () => {
    for (const r of GEO_FIXTURE) {
      expect(DOC_BLOCKS.some((d) => ipInEntry(base(r.block), d) === true), r.block).toBe(true)
    }
  })

  it('uses only RFC 5398 documentation ASNs', () => {
    for (const r of GEO_FIXTURE) {
      const n = Number(r.asn.replace(/^AS/, ''))
      expect(n >= 64496 && n <= 64511, `${r.block} ${r.asn}`).toBe(true)
    }
  })

  it('names only places the catalogue has, and only cities', () => {
    for (const r of GEO_FIXTURE) {
      if (r.place === null) continue
      const p = PLACES.find((x) => x.id === r.place)
      expect(p, r.place).toBeDefined()
      expect(p?.kind, r.place).toBe('city')
    }
  })

  it('pins the ids it names', () => {
    expect(GEO_FIXTURE.map((r) => r.place)).toEqual([
      'in-maharashtra-pune',
      'in-karnataka-bengaluru',
      'in-maharashtra-pune',
      null,
      'de-hesse-frankfurt',
      'us-texas-austin',
      'gb-england-london',
      'in-maharashtra-pune',
      'us-texas-austin',
    ])
  })

  it('never lets two rows claim one address', () => {
    for (const a of GEO_FIXTURE) {
      for (const b of GEO_FIXTURE) {
        if (a === b) continue
        expect(ipInEntry(base(a.block), b.block) === true, `${a.block} inside ${b.block}`).toBe(false)
      }
    }
  })

  it('marks the rows that name no place as anonymisers', () => {
    for (const r of GEO_FIXTURE) if (r.place === null) expect(r.anonymiser, r.block).toBeDefined()
  })
})

describe('looking an address up', () => {
  it('places an office address in Pune, and says it was looked up', () => {
    const got = lookUpAddress('203.0.113.25')!
    expect(got.asn).toBe('AS64500')
    expect(got.location).toEqual({ country: 'India', state: 'Maharashtra', city: 'Pune', lat: 18.5, lon: 73.9, source: 'looked-up' })
  })

  it('places a home address in the same city on another network', () => {
    const got = lookUpAddress('192.0.2.10')!
    expect(got.asn).toBe('AS64502')
    expect(got.location?.city).toBe('Pune')
  })

  it('names no place for a Tor exit, which is not the same as finding no row', () => {
    expect(lookUpAddress('192.0.2.66')).toMatchObject({ location: null, asn: 'AS64510' })
    expect(lookUpAddress('8.8.8.8')).toBeUndefined()
  })

  it('places the proxy in Frankfurt and the residential blocks abroad', () => {
    expect(lookUpAddress('192.0.2.82')?.location).toMatchObject({ country: 'Germany', state: 'Hesse', city: 'Frankfurt' })
    expect(lookUpAddress('192.0.2.130')?.location).toMatchObject({ country: 'United States', city: 'Austin' })
    expect(lookUpAddress('192.0.2.200')?.location).toMatchObject({ country: 'United Kingdom', city: 'London' })
  })

  it('reads IPv6 as well', () => {
    expect(lookUpAddress('2001:db8:1::42')?.location?.city).toBe('Pune')
    expect(lookUpAddress('2001:db8:2::42')?.location?.city).toBe('Austin')
    expect(lookUpAddress('2001:db8:3::42')).toBeUndefined()
  })

  it('turns a catalogue id into a place at every level', () => {
    expect(placeOf('in', 'stated')).toMatchObject({ country: 'India', state: null, city: null })
    expect(placeOf('in-maharashtra', 'stated')).toMatchObject({ country: 'India', state: 'Maharashtra', city: null })
    expect(placeOf('nowhere', 'stated')).toBeUndefined()
  })
})

describe('the chip origins', () => {
  /* The chip place is COPIED from the legacy chip table so the zone, country
     and city answers for one chip cannot disagree in one trace. This is the
     test that keeps the copy honest. */
  it('say the same country, state and city as the legacy chip table', () => {
    for (const [chip, origin] of Object.entries(CHIP_NETWORK)) {
      const legacy = PLACE_FACTS[chip]
      expect(legacy, chip).toBeDefined()
      if (origin.location === undefined) {
        expect(legacy.zonesIn, chip).toBeNull()
        continue
      }
      expect(origin.location?.country ?? null, chip).toBe(legacy.country)
      expect(origin.location?.state ?? null, chip).toBe(legacy.state)
      expect(origin.location?.city ?? null, chip).toBe(legacy.city)
    }
  })

  it('use addresses the fixture places consistently with the chip', () => {
    for (const [chip, origin] of Object.entries(CHIP_NETWORK)) {
      if (origin.address === undefined) continue
      const looked = lookUpAddress(origin.address)
      expect(looked, chip).toBeDefined()
      expect(looked?.location?.country ?? null, chip).toBe(origin.location?.country ?? null)
    }
  })

  it('take their coordinates from the catalogue city', () => {
    expect(CHIP_NETWORK['Office Network'].location).toMatchObject({ lat: 18.5, lon: 73.9 })
    expect(CHIP_NETWORK['Outside all zones'].location).toMatchObject({ lat: 30.3, lon: -97.7 })
  })
})
