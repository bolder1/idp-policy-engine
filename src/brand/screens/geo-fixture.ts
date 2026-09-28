import { PLACES } from '../places'
import type { FactSource, SignInPlace } from './sign-in-facts'
import { ipInEntry } from './zone-validation'

/* -----------------------------------------------------------------------------
   A FIXTURE, not geo-IP.

   The prototype has no geolocation database and must not pretend to. What it
   has is this table: a handful of documentation address blocks, each pinned to
   a place and a network operator so a typed address has somewhere to land.
   A trace that uses it says the place was LOOKED UP, and a test pins that every
   block here is one nobody on the internet can hold:

     RFC 5737   192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24   (IPv4 examples)
     RFC 3849   2001:db8::/32                                   (IPv6 examples)
     RFC 5398   AS64496–AS64511                                 (ASN examples)

   So no real person's address resolves to a real city here, and no real
   operator is named. Coordinates come from the place catalogue by id, so no
   number in this file is invented either.

   The rows are the situations the showcase needs told apart: an office
   network, the same city from home (the address that proves a zone's network
   half matters), an anonymiser the lookup cannot place, a commercial proxy it
   places in Frankfurt, and two ordinary residential origins abroad. (The chip
   adapter's "Known proxy" says only Germany, with no city; that reading is the
   adapter's, in sign-in-facts.ts, not this fixture's.)
   -------------------------------------------------------------------------- */

export interface GeoFixtureRow {
  block: string
  /** A `places.ts` city id, or null when the lookup names no place. */
  place: string | null
  asn: string
  anonymiser?: 'tor' | 'proxy'
  note: string
}

/* Most specific first; the first row whose block holds the address wins, and a
   test pins that no two rows overlap, so the order is a reading aid rather than
   a tie-break anybody depends on. */
export const GEO_FIXTURE: GeoFixtureRow[] = [
  { block: '203.0.113.0/24', place: 'in-maharashtra-pune', asn: 'AS64500', note: 'Corporate office network, Pune' },
  { block: '198.51.100.0/24', place: 'in-karnataka-bengaluru', asn: 'AS64501', note: 'Corporate office network, Bengaluru' },
  { block: '192.0.2.0/26', place: 'in-maharashtra-pune', asn: 'AS64502', note: 'Home broadband, Pune (same city, not an office block)' },
  { block: '192.0.2.64/28', place: null, asn: 'AS64510', anonymiser: 'tor', note: 'Tor exit: the lookup names no place' },
  { block: '192.0.2.80/28', place: 'de-hesse-frankfurt', asn: 'AS64511', anonymiser: 'proxy', note: 'Commercial VPN or proxy' },
  { block: '192.0.2.128/26', place: 'us-texas-austin', asn: 'AS64503', note: 'Residential, Austin' },
  { block: '192.0.2.192/26', place: 'gb-england-london', asn: 'AS64504', note: 'Residential, London' },
  { block: '2001:db8:1::/48', place: 'in-maharashtra-pune', asn: 'AS64502', note: 'Home broadband IPv6, Pune' },
  { block: '2001:db8:2::/48', place: 'us-texas-austin', asn: 'AS64503', note: 'Residential IPv6, Austin' },
]

/* A catalogue city as a sign-in place. Undefined for an id the catalogue does
   not hold, which a test rules out for every row above. */
export function placeOf(id: string, source: FactSource): SignInPlace | undefined {
  const p = PLACES.find((x) => x.id === id)
  if (!p) return undefined
  return {
    country: p.country,
    state: p.kind === 'country' ? null : p.kind === 'state' ? p.name : (p.state ?? null),
    city: p.kind === 'city' ? p.name : null,
    lat: p.lat,
    lon: p.lon,
    source,
  }
}

/* The fixture row an address falls in, as the facts a lookup would return.

     undefined             no row holds the address — nothing was looked up
     { location: null }    a row holds it and names no place (an anonymiser)
     { location: place }   a row holds it, and this is where it says it is */
export function lookUpAddress(address: string): { location: SignInPlace | null; asn: string; row: GeoFixtureRow } | undefined {
  const row = rowFor(address)
  if (!row) return undefined
  return { location: row.place === null ? null : (placeOf(row.place, 'looked-up') ?? null), asn: row.asn, row }
}

/* The row lookup, remembered by address. The impact sweep asks about the same
   five chip addresses thousands of times per run, and each question parses the
   address against every block; the answer never changes, because the table is
   a constant. Bounded, so a tester typing addresses all afternoon cannot grow
   it without limit. Only the ROW is kept — the place is rebuilt per call, so no
   caller can mutate another's answer. */
const ROWS = new Map<string, GeoFixtureRow | null>()
function rowFor(address: string): GeoFixtureRow | undefined {
  const known = ROWS.get(address)
  if (known !== undefined) return known ?? undefined
  const row = GEO_FIXTURE.find((r) => ipInEntry(address, r.block) === true) ?? null
  if (ROWS.size >= 256) ROWS.clear()
  ROWS.set(address, row)
  return row ?? undefined
}
