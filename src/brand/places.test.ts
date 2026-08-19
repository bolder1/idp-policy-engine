import { describe, expect, it } from 'vitest'

import { PLACES, coveredBy, placeById, placeContext, searchPlaces } from './places'

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

  it('is resolvable by id', () => {
    for (const p of PLACES) expect(placeById(p.id)).toBe(p)
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
