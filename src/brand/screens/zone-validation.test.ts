import { describe, expect, it } from 'vitest'

import { emptyLocation, locationEmpty, zones, type Zone, type ZoneLocation, type ZoneRange } from '../data'
import { PLACES } from '../places'
import {
  canSaveZone,
  classifyIp,
  describeZone,
  explainBadEntry,
  isValidAsn,
  validateZone,
} from './zone-validation'

/* -----------------------------------------------------------------------------
   The five worked examples in the spec are the acceptance criteria, so they are
   transcribed here verbatim rather than paraphrased — including the two the spec
   says must be caught (4 and 5) and the three that must stay silent.
   -------------------------------------------------------------------------- */

function zone(over: Partial<Zone> = {}): Zone {
  return {
    id: 'z',
    name: 'Test zone',
    kind: 'custom',
    ip: [],
    asn: [],
    location: emptyLocation(),
    usedIn: 0,
    ...over,
  }
}
const loc = (over: Partial<ZoneLocation> = {}): ZoneLocation => ({ ...emptyLocation(), ...over })
const pune: ZoneRange = { km: 25, lat: 18.5204, lon: 73.8567, label: 'Pune' }
const mumbai: ZoneRange = { km: 10, lat: 19.1, lon: 72.9, label: 'Mumbai' }
const idsOf = (z: Zone) => validateZone(z).map((i) => i.id)

describe('address classification', () => {
  it.each([
    ['203.0.113.45', 'ipv4'],
    ['203.0.113.0/24', 'ipv4-cidr'],
    ['2001:db8:85a3::8a2e:370:7334', 'ipv6'],
    ['2001:db8::/32', 'ipv6-cidr'],
    ['203.0.113.10 – 203.0.113.60', 'ipv4-range'],
    ['203.0.113.10-203.0.113.60', 'ipv4-range'],
  ])('accepts the spec example %s as %s', (v, kind) => {
    expect(classifyIp(v)).toBe(kind)
  })

  it.each([
    ['256.0.0.1'],
    ['203.0.113'],
    ['203.0.113.0/33'],
    ['2001:db8::/129'],
    ['not-an-address'],
    [''],
    ['203.0.113.10 – nonsense'],
    ['10.0.0.0/8/9'],
    ['1.1.1.1-2.2.2.2-junk'],
    ['10.0.0.9-10.0.0.1'],
  ])('rejects %s', (v) => {
    expect(classifyIp(v)).toBe('invalid')
  })

  it('accepts a range of one address', () => {
    expect(classifyIp('10.0.0.1-10.0.0.1')).toBe('ipv4-range')
  })

  it('says why a reversed range was refused', () => {
    expect(explainBadEntry('10.0.0.9-10.0.0.1')).toBe('Start is after end.')
    expect(explainBadEntry('10.0.0.9 – 10.0.0.1')).toBe('Start is after end.')
    expect(explainBadEntry('rubbish')).toBe('Not an address, CIDR block, range or ASN.')
  })

  it('accepts the ASNs the spec lists and rejects bare numbers', () => {
    for (const a of ['AS15169', 'AS16509', 'AS55836', 'AS9498']) expect(isValidAsn(a)).toBe(true)
    for (const a of ['15169', 'ASN15169', 'AS', 'AS12x']) expect(isValidAsn(a)).toBe(false)
  })
})

describe('the spec’s worked examples', () => {
  it('1 — address only: valid, and says the location is unconstrained', () => {
    const z = zone({ ip: ['203.0.113.0/24'] })
    expect(canSaveZone(z)).toBe(true)
    expect(idsOf(z)).toContain('any-location')
    expect(validateZone(z).every((i) => i.level === 'info')).toBe(true)
  })

  it('2 — location only: valid, and says the address is unconstrained', () => {
    const z = zone({ location: loc({ countries: ['India'] }) })
    expect(canSaveZone(z)).toBe(true)
    expect(idsOf(z)).toContain('any-address')
    expect(validateZone(z).every((i) => i.level === 'info')).toBe(true)
  })

  it('3 — ASN AND country: the case the AND genuinely narrows, no complaints', () => {
    const z = zone({ asn: ['AS55836'], location: loc({ countries: ['India'] }) })
    expect(canSaveZone(z)).toBe(true)
    // Neither section is empty, so neither "any" note applies, and an ASN is
    // not an exact address — nothing at all should be raised.
    expect(validateZone(z)).toHaveLength(0)
  })

  it('4 — exact address AND a location: warns, but does not block', () => {
    const z = zone({ ip: ['203.0.113.45'], location: loc({ countries: ['Germany'] }) })
    const issue = validateZone(z).find((i) => i.id === 'exact-vs-location')
    expect(issue).toBeDefined()
    expect(issue!.level).toBe('warning')
    expect(issue!.detail).toContain('203.0.113.45')
    // The spec calls this a warning, so the admin can still save it.
    expect(canSaveZone(z)).toBe(true)
  })

  it('5 — both sections empty: blocked from saving', () => {
    const z = zone()
    const issue = validateZone(z).find((i) => i.id === 'empty')
    expect(issue).toBeDefined()
    expect(issue!.level).toBe('error')
    expect(canSaveZone(z)).toBe(false)
  })
})

describe('the exact-address warning is precise', () => {
  it('does not fire for a CIDR block, which does not fix its own geography', () => {
    const z = zone({ ip: ['203.0.113.0/24'], location: loc({ countries: ['Germany'] }) })
    expect(idsOf(z)).not.toContain('exact-vs-location')
  })

  it('does not fire for a range', () => {
    const z = zone({ ip: ['203.0.113.10 – 203.0.113.60'], location: loc({ countries: ['India'] }) })
    expect(idsOf(z)).not.toContain('exact-vs-location')
  })

  it('does not fire for an exact address with no location — that is example 1', () => {
    expect(idsOf(zone({ ip: ['203.0.113.45'] }))).not.toContain('exact-vs-location')
  })

  it('fires on an exact IPv6 address too', () => {
    const z = zone({ ip: ['2001:db8:85a3::8a2e:370:7334'], location: loc({ cities: ['Pune'] }) })
    expect(idsOf(z)).toContain('exact-vs-location')
  })

  it('fires when the location is only a range', () => {
    const z = zone({ ip: ['203.0.113.45'], location: loc({ ranges: [pune] }) })
    expect(idsOf(z)).toContain('exact-vs-location')
  })
})

describe('a range alone is a real boundary', () => {
  it('does not count as an empty zone', () => {
    const l = loc({ ranges: [pune] })
    expect(locationEmpty(l)).toBe(false)
    const z = zone({ location: l })
    expect(canSaveZone(z)).toBe(true)
    expect(idsOf(z)).not.toContain('empty')
    expect(idsOf(z)).toContain('any-address')
  })

  it('an empty list of ranges is still an empty location', () => {
    expect(locationEmpty(loc({ ranges: [] }))).toBe(true)
  })
})

describe('save gating', () => {
  it('blocks an unnamed zone', () => {
    expect(canSaveZone(zone({ name: '  ', ip: ['203.0.113.0/24'] }))).toBe(false)
  })

  it('blocks a malformed address and names the offender', () => {
    const z = zone({ ip: ['203.0.113.0/24', '999.1.1.1'] })
    const issue = validateZone(z).find((i) => i.id === 'badip')
    expect(issue?.values).toEqual(['999.1.1.1'])
    expect(canSaveZone(z)).toBe(false)
  })

  it('blocks a malformed ASN', () => {
    expect(canSaveZone(zone({ asn: ['AS55836', '55836'] }))).toBe(false)
  })

  it('blocks a name another zone already has, whatever its case or spacing', () => {
    const z = zone({ name: ' office network ', ip: ['203.0.113.0/24'] })
    expect(idsOf(z)).not.toContain('dupname')
    expect(validateZone(z, ['Office Network']).map((i) => i.id)).toContain('dupname')
    expect(canSaveZone(z, ['Office Network'])).toBe(false)
    expect(canSaveZone(z, ['Office'])).toBe(true)
  })

  it('a warning alone never blocks — only errors do', () => {
    const z = zone({ ip: ['203.0.113.45'], location: loc({ countries: ['Germany'] }) })
    expect(validateZone(z).some((i) => i.level === 'warning')).toBe(true)
    expect(canSaveZone(z)).toBe(true)
  })
})

describe('every seeded zone is valid', () => {
  it('saves cleanly, so the shipped library is not itself broken', () => {
    for (const z of zones) {
      const errors = validateZone(z).filter((i) => i.level === 'error')
      expect(errors, `${z.name}: ${JSON.stringify(errors.map((e) => e.title))}`).toHaveLength(0)
    }
  })

  /* It carried India and Maharashtra beside the range, and the location half is
     ORed, so it matched all of India — not what "Pune HQ · 25km" says. */
  it('Pune HQ is the range around Pune and nothing wider', () => {
    const hq = zones.find((z) => z.id === 'pune-hq')!
    expect(hq.location.countries).toEqual([])
    expect(hq.location.states).toEqual([])
    expect(hq.location.cities).toEqual([])
    expect(hq.location.ranges).toHaveLength(1)
    expect(hq.location.ranges[0]).toMatchObject({ km: 25, label: 'Pune' })
    const place = PLACES.find((p) => p.id === hq.location.ranges[0].placeId)
    expect(place).toMatchObject({ kind: 'city', name: 'Pune' })
  })
})

describe('describeZone', () => {
  it('lists both facets, with "any" on the empty side', () => {
    expect(describeZone(zone({ ip: ['203.0.113.0/24'] }))).toBe('1 network · Any location')
    expect(describeZone(zone({ location: loc({ countries: ['India'] }) }))).toBe(
      'Any network · India',
    )
  })

  it('words each range as a distance from its city, one part each', () => {
    expect(describeZone(zone({ location: loc({ ranges: [pune] }) }))).toBe('Any network · Within 25 km of Pune')
    expect(describeZone(zone({ location: loc({ countries: ['Japan'], ranges: [pune, mumbai] }) }))).toBe(
      'Any network · Japan · Within 25 km of Pune · Within 10 km of Mumbai',
    )
  })

  it('counts addresses and ASNs separately', () => {
    const z = zone({ ip: ['10.0.0.0/8', '10.1.0.0/16'], asn: ['AS64512'] })
    expect(describeZone(z)).toContain('2 networks + 1 ASN')
  })
})
