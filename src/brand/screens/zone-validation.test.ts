import { describe, expect, it } from 'vitest'

import { emptyLocation, zones, type Zone, type ZoneLocation } from '../data'
import { canSaveZone, classifyIp, describeZone, isValidAsn, validateZone } from './zone-validation'

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
  ])('rejects %s', (v) => {
    expect(classifyIp(v)).toBe('invalid')
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

  it('fires when the location is only a radius', () => {
    const z = zone({
      ip: ['203.0.113.45'],
      location: loc({ radius: { km: 25, lat: 18.5204, lon: 73.8567 } }),
    })
    expect(idsOf(z)).toContain('exact-vs-location')
  })
})

describe('a radius alone is a real boundary', () => {
  it('does not count as an empty zone', () => {
    const z = zone({ location: loc({ radius: { km: 25, lat: 18.5204, lon: 73.8567 } }) })
    expect(canSaveZone(z)).toBe(true)
    expect(idsOf(z)).not.toContain('empty')
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
})

describe('describeZone', () => {
  it('spells out the AND, with "any" on the empty side', () => {
    expect(describeZone(zone({ ip: ['203.0.113.0/24'] }))).toBe('1 address  AND  Any location')
    expect(describeZone(zone({ location: loc({ countries: ['India'] }) }))).toBe(
      'Any address  AND  India',
    )
  })

  it('counts addresses and ASNs separately', () => {
    const z = zone({ ip: ['10.0.0.0/8', '10.1.0.0/16'], asn: ['AS64512'] })
    expect(describeZone(z)).toContain('2 addresses + 1 ASN')
  })
})
