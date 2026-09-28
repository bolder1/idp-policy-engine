import { describe, expect, it } from 'vitest'

import { EARTH_RADIUS_KM, KM_PER_MILE, PLACES, coveredBy, haversineKm, placeContext, rangeKm, sameName, searchPlaces, withinRange } from './places'

describe('the catalogue is well formed', () => {
  it('has a unique id for every place', () => {
    const ids = PLACES.map((p) => p.id)
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i)
    expect(dupes).toEqual([])
  })

  it('gives every city a state and every state a country', () => {
    for (const p of PLACES) {
      expect(p.country, `${p.name} has no country`).toBeTruthy()
      if (p.kind === 'city') expect(p.state, `${p.name} has no state`).toBeTruthy()
      if (p.kind === 'country') expect(p.country).toBe(p.name)
    }
  })

  it('keeps coordinates on the planet', () => {
    for (const p of PLACES) {
      expect(Math.abs(p.lat), `${p.name} latitude`).toBeLessThanOrEqual(90)
      expect(Math.abs(p.lon), `${p.name} longitude`).toBeLessThanOrEqual(180)
    }
  })

  it('covers all three kinds at a useful size', () => {
    const n = (k: string) => PLACES.filter((p) => p.kind === k).length
    expect(n('country')).toBeGreaterThanOrEqual(12)
    expect(n('state')).toBeGreaterThanOrEqual(30)
    expect(n('city')).toBeGreaterThanOrEqual(60)
  })
})

describe('search ranks rather than just filters', () => {
  it('puts an exact match first', () => {
    expect(searchPlaces('India')[0].name).toBe('India')
    expect(searchPlaces('Pune')[0].name).toBe('Pune')
  })

  it('prefers the broader place when a name is shared', () => {
    // Singapore is a country, a state and a city. Three letters is far more
    // often reaching for the country.
    const hits = searchPlaces('Singapore')
    expect(hits[0].kind).toBe('country')
    expect(hits.filter((h) => h.name === 'Singapore').map((h) => h.kind)).toContain('city')
  })

  it('finds a place by the name people actually type', () => {
    expect(searchPlaces('bangalore')[0].name).toBe('Bengaluru')
    expect(searchPlaces('bombay')[0].name).toBe('Mumbai')
    expect(searchPlaces('USA')[0].name).toBe('United States')
    expect(searchPlaces('uk')[0].name).toBe('United Kingdom')
  })

  it('surfaces a state above the cities inside it', () => {
    const hits = searchPlaces('Maharashtra')
    expect(hits[0].name).toBe('Maharashtra')
    expect(hits[0].kind).toBe('state')
    expect(hits.map((h) => h.name)).toContain('Pune')
  })

  it('ignores case and accents', () => {
    expect(searchPlaces('sao paulo').length).toBeGreaterThan(0)
    expect(searchPlaces('MUNICH')[0].name).toBe('Munich')
  })

  it('returns nothing for an empty or unmatched query', () => {
    expect(searchPlaces('')).toEqual([])
    expect(searchPlaces('   ')).toEqual([])
    expect(searchPlaces('zzzznowhere')).toEqual([])
  })

  it('respects the limit', () => {
    expect(searchPlaces('a', 5).length).toBeLessThanOrEqual(5)
  })

  /* A range's centre is a city: narrowed before the limit, so the cities are not
     what is left after the countries and states took the first places. */
  it('narrows to one kind before taking the limit', () => {
    const cities = searchPlaces('a', 12, 'city')
    expect(cities).toHaveLength(12)
    expect(cities.every((p) => p.kind === 'city')).toBe(true)
    expect(searchPlaces('pune', 12, 'city')[0]).toMatchObject({ id: 'in-maharashtra-pune', name: 'Pune' })
    // "Maharashtra" is a state, and as a city search it offers the cities in it.
    expect(searchPlaces('maharashtra', 12, 'city').map((p) => p.name)).toContain('Mumbai')
  })
})

describe('context reads like an address', () => {
  it('names what a result is', () => {
    expect(placeContext(PLACES.find((p) => p.name === 'India')!)).toBe('Country')
    expect(placeContext(PLACES.find((p) => p.name === 'Maharashtra')!)).toBe('State · India')
    expect(placeContext(PLACES.find((p) => p.name === 'Pune')!)).toBe('City · Maharashtra, India')
  })
})

describe('redundancy is detectable', () => {
  const pune = PLACES.find((p) => p.name === 'Pune')!
  const maha = PLACES.find((p) => p.name === 'Maharashtra')!

  it('spots a city already covered by its country', () => {
    expect(coveredBy(pune, { countries: ['India'], states: [], cities: [] })).toBe('India')
  })

  it('spots a city already covered by its state', () => {
    expect(coveredBy(pune, { countries: [], states: ['Maharashtra'], cities: [] })).toBe('Maharashtra')
  })

  it('spots a state already covered by its country', () => {
    expect(coveredBy(maha, { countries: ['India'], states: [], cities: [] })).toBe('India')
  })

  it('says nothing when the place adds something', () => {
    expect(coveredBy(pune, { countries: ['Germany'], states: [], cities: [] })).toBeNull()
    expect(coveredBy(pune, { countries: [], states: [], cities: [] })).toBeNull()
  })

  it('never reports a country as covered by itself', () => {
    const india = PLACES.find((p) => p.name === 'India')!
    expect(coveredBy(india, { countries: ['India'], states: [], cities: [] })).toBeNull()
  })
})

describe('distance, as a zone range measures it', () => {
  const at = (id: string) => PLACES.find((p) => p.id === id)!

  it('puts Pune about 125 km from Mumbai, either way round', () => {
    const d = haversineKm(at('in-maharashtra-pune'), at('in-maharashtra-mumbai'))
    expect(d).toBeGreaterThan(124)
    expect(d).toBeLessThan(126)
    expect(haversineKm(at('in-maharashtra-mumbai'), at('in-maharashtra-pune'))).toBeCloseTo(d, 9)
  })

  it('is zero from a place to itself', () => {
    expect(haversineKm(at('in-maharashtra-pune'), at('in-maharashtra-pune'))).toBe(0)
  })

  it('holds a point at the edge of a range, and not one a metre past it', () => {
    /* Due north, where a kilometre is a fixed slice of latitude. */
    const pune = { lat: 18.5, lon: 73.9, label: 'Pune', km: 25 }
    const north = (km: number) => ({ lat: pune.lat + km / ((EARTH_RADIUS_KM * Math.PI) / 180), lon: pune.lon })
    for (const km of [1, 5, 10, 20, 24, 25]) expect(withinRange(north(km), { ...pune, km })).toBe(true)
    expect(withinRange(north(25.001), pune)).toBe(false)
  })

  it('reads a range in miles as miles, and a range with no unit as kilometres', () => {
    const base = { lat: 18.5, lon: 73.9, label: 'Pune' }
    expect(rangeKm({ ...base, km: 25 })).toBe(25)
    expect(rangeKm({ ...base, km: 25, unit: 'km' })).toBe(25)
    expect(rangeKm({ ...base, km: 10, unit: 'mi' })).toBeCloseTo(16.09344, 9)
    expect(KM_PER_MILE).toBe(1.609344)
  })
})

describe('two names for one place', () => {
  it('knows a city by its alias, in either direction', () => {
    expect(sameName('city', 'Bangalore', 'Bengaluru')).toBe(true)
    expect(sameName('city', 'bengaluru', 'BLR')).toBe(true)
    expect(sameName('city', 'Bombay', 'Pune')).toBe(false)
  })

  it('ignores case and accents', () => {
    expect(sameName('state', 'ile-de-france', 'Île-de-France')).toBe(true)
    expect(sameName('country', 'india', 'India')).toBe(true)
  })

  it('is scoped to one kind, so a state alias does not answer for a city', () => {
    expect(sameName('state', 'UP', 'Uttar Pradesh')).toBe(true)
    expect(sameName('city', 'UP', 'Uttar Pradesh')).toBe(false)
  })

  it('does not guess at names the catalogue does not hold', () => {
    expect(sameName('city', 'Lonavala', 'Lonavala')).toBe(true)
    expect(sameName('city', 'Lonavala', 'Pune')).toBe(false)
  })
})
