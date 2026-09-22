import { describe, expect, it } from 'vitest'

import { DEFAULT_RANGE_KM, card, cond, emptyLocation, newId, when, type Policy, type Zone, type ZoneRange } from '../data'
import { PLACES } from '../places'
import {
  REVIEW_LIST_MAX,
  centredOn,
  hasEntry,
  locationEntries,
  normaliseEntry,
  parseEntries,
  rangeAt,
  takenZoneIds,
  withRange,
  zoneChanges,
  zoneReviewRows,
} from './zone-entries'

function zone(over: Partial<Zone> = {}): Zone {
  return { id: 'z', name: 'Office', kind: 'custom', ip: [], asn: [], location: emptyLocation(), usedIn: 0, ...over }
}

/* The one field takes addresses, CIDRs, ranges and ASNs together, and filing
   any of them under the wrong heading is invisible in the UI: an ASN listed as
   an address still renders, still saves, and simply never matches. */

describe('one field, both kinds of thing', () => {
  it('files an ASN as an ASN and an address as an address', () => {
    const r = parseEntries('203.0.113.0/24 AS15169 10.0.0.1', [], [])
    expect(r.ip).toEqual(['203.0.113.0/24', '10.0.0.1'])
    expect(r.asn).toEqual(['AS15169'])
    expect(r.bad).toEqual([])
  })

  it('accepts every separator someone actually pastes', () => {
    // Commas from a spreadsheet, newlines from a config file, spaces from a chat.
    const r = parseEntries('10.0.0.1,10.0.0.2;10.0.0.3\n10.0.0.4  10.0.0.5', [], [])
    expect(r.ip).toHaveLength(5)
    expect(r.bad).toEqual([])
  })

  it('normalises ASN case', () => {
    expect(parseEntries('as15169', [], []).asn).toEqual(['AS15169'])
  })

  it('keeps the classifier honest across the kinds it knows', () => {
    const r = parseEntries('192.168.0.0/16 2001:db8::/32 10.0.0.1-10.0.0.9 ::1', [], [])
    expect(r.bad).toEqual([])
    expect(r.ip).toHaveLength(4)
  })
})

describe('nothing is silently swallowed', () => {
  it('returns what did not parse rather than dropping it', () => {
    const r = parseEntries('10.0.0.1 notanip AS15169 999.1.1.1', [], [])
    expect(r.ip).toEqual(['10.0.0.1'])
    expect(r.asn).toEqual(['AS15169'])
    // The two that failed come back so the field can show them for correction.
    expect(r.bad).toEqual(['notanip', '999.1.1.1'])
  })

  it('adds the good ones even when some are bad', () => {
    // Partial success beats all-or-nothing: rejecting the whole paste over one
    // typo means retyping nineteen good values.
    const r = parseEntries('10.0.0.1 rubbish', [], [])
    expect(r.ip).toEqual(['10.0.0.1'])
  })
})

describe('adding to what is already there', () => {
  it('appends without disturbing the existing entries', () => {
    const r = parseEntries('10.0.0.2', ['10.0.0.1'], ['AS15169'])
    expect(r.ip).toEqual(['10.0.0.1', '10.0.0.2'])
    expect(r.asn).toEqual(['AS15169'])
  })

  it('does not duplicate a value already in the zone', () => {
    const r = parseEntries('10.0.0.1 AS15169', ['10.0.0.1'], ['AS15169'])
    expect(r.ip).toEqual(['10.0.0.1'])
    expect(r.asn).toEqual(['AS15169'])
  })

  it('deduplicates within a single paste', () => {
    const r = parseEntries('10.0.0.1 10.0.0.1 AS15169 as15169', [], [])
    expect(r.ip).toEqual(['10.0.0.1'])
    expect(r.asn).toEqual(['AS15169'])
  })

  it('treats an empty or blank paste as a no-op', () => {
    for (const t of ['', '   ', ',,;\n']) {
      const r = parseEntries(t, ['10.0.0.1'], [])
      expect(r.ip).toEqual(['10.0.0.1'])
      expect(r.asn).toEqual([])
      expect(r.bad).toEqual([])
    }
  })

  it('treats IPv6 case as the same entry', () => {
    const r = parseEntries('2001:DB8::/32', ['2001:db8::/32'], [])
    expect(r.ip).toEqual(['2001:db8::/32'])
    expect(r.bad).toEqual([])
  })
})

describe('ranges typed with spaces', () => {
  it.each([['203.0.113.10 - 203.0.113.60'], ['203.0.113.10 – 203.0.113.60'], ['203.0.113.10—203.0.113.60']])(
    'adds %s as one range, stored without spaces',
    (text) => {
      const r = parseEntries(text, [], [])
      expect(r.ip).toEqual(['203.0.113.10-203.0.113.60'])
      expect(r.bad).toEqual([])
    },
  )

  it('never joins addresses on separate lines into a range', () => {
    const r = parseEntries('10.0.0.1\n-\n10.0.0.2', [], [])
    expect(r.ip).toEqual(['10.0.0.1', '10.0.0.2'])
    expect(r.bad).toEqual(['-'])
  })

  it('keeps malformed and reversed ranges out', () => {
    const r = parseEntries('10.0.0.0/8/9 1.1.1.1-2.2.2.2-junk 10.0.0.9-10.0.0.1', [], [])
    expect(r.ip).toEqual([])
    expect(r.bad).toHaveLength(3)
  })
})

describe('normaliseEntry', () => {
  it('stores ASNs upper case, IPv6 lower case and ranges without spaces', () => {
    expect(normaliseEntry(' as16509 ')).toBe('AS16509')
    expect(normaliseEntry('2001:DB8::1')).toBe('2001:db8::1')
    expect(normaliseEntry('10.0.0.1 – 10.0.0.9')).toBe('10.0.0.1-10.0.0.9')
    expect(normaliseEntry('10.0.0.0/8')).toBe('10.0.0.0/8')
  })

  it('finds an entry already in the list whatever its case', () => {
    expect(hasEntry(['AS16509'], 'as16509')).toBe(true)
    expect(hasEntry(['2001:db8::/32'], '2001:DB8::/32')).toBe(true)
    expect(hasEntry(['10.0.0.1'], '10.0.0.2')).toBe(false)
  })
})

describe('zone ids', () => {
  it('never repeats an id after a delete', () => {
    const ids = ['z-temp', 'z-test']
    // Delete Temp, then create Test again: the id must not be Test's.
    const after = ids.filter((id) => id !== 'z-temp')
    const next = newId('z', after, 'Test')
    expect(after).not.toContain(next)
  })

  /* Deleting a zone leaves the rules that name it pointing at nothing, for the
     checks to flag. A new zone with the same name must not take that id. */
  it('keeps the id of a deleted zone that a rule or a saved draft still names', () => {
    const rule = (id: string) => ({ when: when(card(cond('zone', 'in zone', [id]))) })
    const policy = {
      rules: [rule('z-test')],
      pendingDraft: { rules: [rule('z-draft')] },
    } as unknown as Policy
    const taken = takenZoneIds([zone({ id: 'z-office' })], [policy])
    expect([...taken].sort()).toEqual(['z-draft', 'z-office', 'z-test'])
    expect(newId('z', taken, 'Test')).toBe('z-test-2')
  })
})

describe('what changed, for the save bar', () => {
  it('names each changed part once', () => {
    const before = zone({ ip: ['10.0.0.1'] })
    const after = zone({ name: 'HQ', ip: ['10.0.0.2'], location: { ...emptyLocation(), countries: ['India'] } })
    expect(zoneChanges(before, after)).toEqual(['Name', 'IP networks', 'Locations'])
    expect(zoneChanges(before, before)).toEqual([])
  })

  it('builds review rows from the saved zone and the draft', () => {
    const before = zone({ ip: ['10.0.0.1'], location: { ...emptyLocation(), countries: ['India'] } })
    const after = zone({ name: 'HQ', ip: ['10.0.0.0/8'], location: emptyLocation() })
    expect(zoneReviewRows(before, after)).toEqual([
      { label: 'Name', before: 'Office', after: 'HQ', kind: 'changed' },
      { label: 'IP networks: added', before: '', after: '10.0.0.0/8', group: 'IP networks', kind: 'added' },
      { label: 'IP networks: removed', before: '10.0.0.1', after: '', group: 'IP networks', kind: 'removed' },
      { label: 'Locations: removed', before: 'India', after: '', group: 'Locations', kind: 'removed' },
    ])
  })

  /* The dialog files rows under the page's sections and marks each one. The
     name leads under General; a list row names no single item, since it holds
     every added (or removed) entry at once; nothing here is a consequence. */
  it('files each row under its section and marks what it does', () => {
    const before = zone({ ip: ['10.0.0.1'] })
    const after = zone({ name: 'HQ', ip: ['10.0.0.1', '10.0.0.2', '10.0.0.3'] })
    const rows = zoneReviewRows(before, after)
    const [name, net] = rows
    expect(rows).toHaveLength(2)
    expect(name.group).toBeUndefined()
    expect(name.kind).toBe('changed')
    expect(net).toMatchObject({ group: 'IP networks', kind: 'added', after: '10.0.0.2, 10.0.0.3', count: 2 })
    expect(net.item).toBeUndefined()
    expect(rows.some((r) => r.effect)).toBe(false)
  })

  /* A new zone is reviewed against itself with no name, so its name is added
     rather than changed. */
  it('marks the name of a new zone as added', () => {
    const [name] = zoneReviewRows(zone({ name: '' }), zone({ name: 'HQ' }))
    expect(name).toEqual({ label: 'Name', before: '', after: 'HQ', kind: 'added' })
  })

  it('counts the rest of a long paste rather than listing it', () => {
    const ip = Array.from({ length: REVIEW_LIST_MAX + 3 }, (_, i) => `10.0.0.${i + 1}`)
    const [row] = zoneReviewRows(zone(), zone({ ip }))
    expect(row.after).toMatch(/and 3 more$/)
    // The heading counts every entry, listed or not.
    expect(row.count).toBe(REVIEW_LIST_MAX + 3)
  })

  /* A state and a city can share a name. Swapping one for the other changes what
     the zone matches, so it has to open the save bar and read as two entries. */
  it('tells a state from the city of the same name', () => {
    const before = zone({ location: { ...emptyLocation(), states: ['Berlin'] } })
    const after = zone({ location: { ...emptyLocation(), cities: ['Berlin'] } })
    expect(zoneChanges(before, after)).toEqual(['Locations'])
    expect(zoneReviewRows(before, after)).toEqual([
      { label: 'Locations: added', before: '', after: 'Berlin (city)', group: 'Locations', kind: 'added' },
      { label: 'Locations: removed', before: 'Berlin (state)', after: '', group: 'Locations', kind: 'removed' },
    ])
  })

})

/* A range is a centre and a distance: "25 km around Pune". A zone holds as many
   as it needs, and each is one location entry, worded as the list and the
   review word it. */
describe('ranges', () => {
  const pune: ZoneRange = { km: 25, lat: 18.5204, lon: 73.8567, label: 'Pune', placeId: 'in-maharashtra-pune' }
  const mumbai: ZoneRange = { km: 10, lat: 19.1, lon: 72.9, label: 'Mumbai', placeId: 'in-maharashtra-mumbai' }
  const at = (...ranges: ZoneRange[]) => zone({ location: { ...emptyLocation(), ranges } })

  it('words a range as a distance from its city', () => {
    expect(locationEntries({ ...emptyLocation(), ranges: [pune] })).toEqual(['Within 25 km of Pune'])
  })

  it('holds several ranges in one zone, after the places', () => {
    const l = { ...emptyLocation(), countries: ['Japan'], ranges: [pune, mumbai] }
    expect(locationEntries(l)).toEqual(['Japan', 'Within 25 km of Pune', 'Within 10 km of Mumbai'])
  })

  it('lists a range added, and one removed', () => {
    expect(zoneChanges(at(pune), at(pune, mumbai))).toEqual(['Locations'])
    expect(zoneReviewRows(at(pune), at(pune, mumbai))).toEqual([
      { label: 'Locations: added', before: '', after: 'Within 10 km of Mumbai', group: 'Locations', kind: 'added' },
    ])
    expect(zoneReviewRows(at(pune, mumbai), at(mumbai))).toEqual([
      { label: 'Locations: removed', before: 'Within 25 km of Pune', after: '', group: 'Locations', kind: 'removed' },
    ])
    expect(zoneReviewRows(at(), at(pune, mumbai))).toEqual([
      {
        label: 'Locations: added',
        before: '',
        after: 'Within 25 km of Pune, Within 10 km of Mumbai',
        group: 'Locations',
        kind: 'added',
        count: 2,
      },
    ])
  })

  it('reads a new distance as the old range removed and the new one added', () => {
    const wider = { ...pune, km: 50 }
    expect(zoneChanges(at(pune), at(wider))).toEqual(['Locations'])
    expect(zoneReviewRows(at(pune), at(wider))).toEqual([
      { label: 'Locations: added', before: '', after: 'Within 50 km of Pune', group: 'Locations', kind: 'added' },
      { label: 'Locations: removed', before: 'Within 25 km of Pune', after: '', group: 'Locations', kind: 'removed' },
    ])
  })

  it('reads a new centre as a change', () => {
    const moved = { ...pune, lat: 19.1, lon: 72.9, label: 'Mumbai', placeId: 'in-maharashtra-mumbai' }
    expect(zoneChanges(at(pune), at(moved))).toEqual(['Locations'])
    expect(zoneReviewRows(at(pune), at(moved))).toEqual([
      { label: 'Locations: added', before: '', after: 'Within 25 km of Mumbai', group: 'Locations', kind: 'added' },
      { label: 'Locations: removed', before: 'Within 25 km of Pune', after: '', group: 'Locations', kind: 'removed' },
    ])
  })

  /* Keyed by centre and distance, not by its words: a centre moved under the
     same name still changes what the zone matches, and says where each one is. */
  it('reads a centre moved under the same name as a change', () => {
    const moved = { ...pune, lat: 18.5, lon: 73.9 }
    expect(zoneChanges(at(pune), at(moved))).toEqual(['Locations'])
    expect(zoneReviewRows(at(pune), at(moved))).toEqual([
      { label: 'Locations: added', before: '', after: 'Within 25 km of Pune (18.5, 73.9)', group: 'Locations', kind: 'added' },
      {
        label: 'Locations: removed',
        before: 'Within 25 km of Pune (18.5204, 73.8567)',
        after: '',
        group: 'Locations',
        kind: 'removed',
      },
    ])
  })

  it('is no change when nothing moved', () => {
    expect(zoneChanges(at(pune, mumbai), at({ ...pune }, { ...mumbai }))).toEqual([])
    expect(zoneReviewRows(at(pune, mumbai), at({ ...pune }, { ...mumbai }))).toEqual([])
  })
})

/* What Add range and a range's change-centre search put in the zone. */
describe('withRange', () => {
  const city = (id: string) => {
    const p = PLACES.find((x) => x.id === id)
    if (!p) throw new Error(`no catalogue place ${id}`)
    return p
  }
  const pune = city('in-maharashtra-pune')
  const mumbai = city('in-maharashtra-mumbai')
  /* Pune HQ's centre, finer than the catalogue's one-decimal centroid. */
  const seed: ZoneRange = { km: 50, lat: 18.5204, lon: 73.8567, label: 'Pune', placeId: pune.id }

  it('adds a new range at the default distance, after the ones there', () => {
    const l = withRange({ ...emptyLocation(), ranges: [seed] }, mumbai, null)
    expect(l.ranges).toEqual([seed, rangeAt(mumbai, DEFAULT_RANGE_KM)])
  })

  it('moves a range to a new centre where it stood, keeping its distance', () => {
    const other = rangeAt(city('in-maharashtra-nagpur'), 10)
    const l = withRange({ ...emptyLocation(), ranges: [seed, other] }, mumbai, seed)
    expect(l.ranges).toEqual([rangeAt(mumbai, 50), other])
  })

  /* Re-picking the city it is drawn around must not swap the stored centre for
     the catalogue's: that opened the save bar on a change no one made. */
  it('leaves a range alone when its own city is picked again', () => {
    const before = { ...emptyLocation(), ranges: [seed] }
    const after = withRange(before, pune, seed)
    expect(after).toBe(before)
    expect(zoneChanges(zone({ location: before }), zone({ location: after }))).toEqual([])
  })

  it('knows a range with no catalogue id by its city name', () => {
    const named: ZoneRange = { km: 25, lat: 18.52, lon: 73.86, label: 'Pune' }
    const before = { ...emptyLocation(), ranges: [named] }
    expect(centredOn(named, pune)).toBe(true)
    expect(withRange(before, pune, named)).toBe(before)
  })
})
