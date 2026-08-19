import { describe, expect, it } from 'vitest'

import { parseEntries } from './zone-entries'

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
})
