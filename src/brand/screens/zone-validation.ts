import { ipSectionEmpty, locationEmpty, type Zone } from '../data'

/* -----------------------------------------------------------------------------
   Network zone validation.

   The model is two optional sections, both of which must hold, where an empty section
   means MATCH ANY. That single rule produces both of the failure modes the spec
   calls out, and they are opposites:

     · Both sections empty  → matches everything, defines no boundary. Blocked.
     · An exact address ANDed with a location → either adds nothing or empties
       the zone, because an address already determines its own country. Warned.

   The second one needs no geo-IP database, which matters: the prototype has no
   way to resolve 203.0.113.45 to a country, and guessing would be worse than
   saying nothing. The warning is structural — "an exact address already fixes
   its geography, so intersecting it with a location cannot help" is true of
   every exact address without knowing where any of them are.
   -------------------------------------------------------------------------- */

export type IpKind = 'ipv4' | 'ipv6' | 'ipv4-cidr' | 'ipv6-cidr' | 'ipv4-range' | 'invalid'

const octet = '(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)'
const IPV4 = new RegExp(`^${octet}(\\.${octet}){3}$`)
/** Permissive but not anything-goes: hex groups, one optional :: elision. */
const IPV6 = /^(([\da-f]{1,4}:){7}[\da-f]{1,4}|([\da-f]{1,4}:){1,7}:|([\da-f]{1,4}:){1,6}:[\da-f]{1,4}|([\da-f]{1,4}:){1,5}(:[\da-f]{1,4}){1,2}|([\da-f]{1,4}:){1,4}(:[\da-f]{1,4}){1,3}|([\da-f]{1,4}:){1,3}(:[\da-f]{1,4}){1,4}|([\da-f]{1,4}:){1,2}(:[\da-f]{1,4}){1,5}|[\da-f]{1,4}:(:[\da-f]{1,4}){1,6}|:((:[\da-f]{1,4}){1,7}|:))$/i

export function classifyIp(raw: string): IpKind {
  // The spec writes ranges with an en-dash; humans type a hyphen.
  const v = raw.trim().replace(/\s*[–—]\s*/g, '-')
  if (!v) return 'invalid'

  if (v.includes('/')) {
    const [addr, prefix] = v.split('/')
    if (!/^\d{1,3}$/.test(prefix)) return 'invalid'
    const p = Number(prefix)
    if (IPV4.test(addr)) return p <= 32 ? 'ipv4-cidr' : 'invalid'
    if (IPV6.test(addr)) return p <= 128 ? 'ipv6-cidr' : 'invalid'
    return 'invalid'
  }

  if (v.includes('-')) {
    const [a, b] = v.split('-').map((x) => x.trim())
    return IPV4.test(a) && IPV4.test(b) ? 'ipv4-range' : 'invalid'
  }

  if (IPV4.test(v)) return 'ipv4'
  if (IPV6.test(v)) return 'ipv6'
  return 'invalid'
}

/** A single host — the case that already fixes its own geography. */
export const isExactAddress = (v: string) => {
  const k = classifyIp(v)
  return k === 'ipv4' || k === 'ipv6'
}

const ASN = /^AS\d{1,10}$/i
export const isValidAsn = (v: string) => ASN.test(v.trim())

export type ZoneIssueLevel = 'error' | 'warning' | 'info'

export interface ZoneIssue {
  id: string
  level: ZoneIssueLevel
  title: string
  detail: string
  section?: 'ip' | 'asn' | 'location'
  /** The offending values, so the UI can point at them. */
  values?: string[]
}

export function validateZone(z: Zone): ZoneIssue[] {
  const out: ZoneIssue[] = []
  const noIp = ipSectionEmpty(z)
  const noLoc = locationEmpty(z.location)

  if (!z.name.trim()) {
    out.push({
      id: 'name',
      level: 'error',
      title: 'The zone needs a name',
      detail: 'Rules reference zones by name, so an unnamed zone cannot be used in a condition.',
    })
  }

  /* Example 5 — both sections empty. Every section matching "any" means the
     zone matches all traffic from everywhere, which is not a boundary. */
  if (noIp && noLoc) {
    out.push({
      id: 'empty',
      level: 'error',
      title: 'This zone would match everything',
      detail:
        'Both sections are empty, and an empty section means “any”. A zone with no addresses and no location draws no boundary at all — fill in at least one section.',
    })
  }

  const badIp = z.ip.filter((v) => classifyIp(v) === 'invalid')
  if (badIp.length > 0) {
    out.push({
      id: 'badip',
      level: 'error',
      section: 'ip',
      title: `${badIp.length} entr${badIp.length === 1 ? 'y is' : 'ies are'} not a valid address`,
      detail: 'Accepted: a single IPv4 or IPv6 address, a CIDR block, or an IPv4 range like 203.0.113.10 – 203.0.113.60.',
      values: badIp,
    })
  }

  const badAsn = z.asn.filter((v) => !isValidAsn(v))
  if (badAsn.length > 0) {
    out.push({
      id: 'badasn',
      level: 'error',
      section: 'asn',
      title: `${badAsn.length} ASN${badAsn.length === 1 ? ' is' : 's are'} malformed`,
      detail: 'An ASN is “AS” followed by digits — for example AS15169.',
      values: badAsn,
    })
  }

  /* Example 4 — an exact address ANDed with a location. Reported without
     claiming to know where the address is, because the objection holds for any
     exact address: it already determines its own country, so intersecting it
     with a location either changes nothing or empties the zone. */
  const exact = z.ip.filter(isExactAddress)
  if (exact.length > 0 && !noLoc) {
    out.push({
      id: 'exact-vs-location',
      level: 'warning',
      section: 'location',
      title: 'An exact address combined with a location',
      detail: `${exact.join(', ')} already geolocates to one place. Because the two sections are ANDed, adding a location either changes nothing — if it agrees — or makes the zone match nothing at all. Use a CIDR block or an ASN if you meant to narrow a network by geography.`,
      values: exact,
    })
  }

  /* Not a defect, but the thing most likely to be misread: half a zone left
     empty is the permissive half, and it is worth saying so out loud. */
  if (noIp && !noLoc) {
    out.push({
      id: 'any-address',
      level: 'info',
      section: 'ip',
      title: 'Any network',
      detail: 'No addresses or ASNs, so this zone matches the location from any network.',
    })
  }
  if (!noIp && noLoc) {
    out.push({
      id: 'any-location',
      level: 'info',
      section: 'location',
      title: 'Any location',
      detail: 'No location, so this zone matches those networks wherever they geolocate.',
    })
  }

  return out
}

/** Saving is blocked only by errors; warnings are the admin's call. */
export const canSaveZone = (z: Zone) => !validateZone(z).some((i) => i.level === 'error')

/** One line describing what the zone actually covers. */
export function describeZone(z: Zone): string {
  const parts: string[] = []
  const net: string[] = []
  /* Counted as networks, which is what the half is called on screen. One entry
     here can be a single host, a /16 or a whole range, so "networks" is also
     the more honest collective for a count that treats them as one unit. */
  if (z.ip.length) net.push(`${z.ip.length} network${z.ip.length === 1 ? '' : 's'}`)
  if (z.asn.length) net.push(`${z.asn.length} ASN${z.asn.length === 1 ? '' : 's'}`)
  parts.push(net.length ? net.join(' + ') : 'Any network')

  const l = z.location
  const geo: string[] = []
  if (l.countries.length) geo.push(l.countries.join(', '))
  if (l.states.length) geo.push(l.states.join(', '))
  if (l.cities.length) geo.push(l.cities.join(', '))
  if (l.radius) geo.push(`${l.radius.km}km of ${l.radius.label ?? `${l.radius.lat}, ${l.radius.lon}`}`)
  parts.push(geo.length ? geo.join(' · ') : 'Any location')

  /* Joined as a list, not a conjunction.

     This read "1 address AND Any location", which described the engine rather
     than the zone: the AND is how the two halves combine internally, and
     spelling it out made every summary look like a boolean expression an admin
     had authored. The two facets are simply what the zone contains. */
  return parts.join(' · ')
}
