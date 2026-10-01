import { ipSectionEmpty, locationEmpty, nameTaken, type Zone } from '../data'

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
    /* Exactly one slash: `10.0.0.0/8/9` is not a block. */
    const parts = v.split('/')
    if (parts.length !== 2) return 'invalid'
    const [addr, prefix] = parts
    if (!/^\d{1,3}$/.test(prefix)) return 'invalid'
    const p = Number(prefix)
    if (IPV4.test(addr)) return p <= 32 ? 'ipv4-cidr' : 'invalid'
    if (IPV6.test(addr)) return p <= 128 ? 'ipv6-cidr' : 'invalid'
    return 'invalid'
  }

  if (v.includes('-')) {
    /* Exactly two ends, both IPv4, and the start no later than the end. */
    const parts = v.split('-').map((x) => x.trim())
    if (parts.length !== 2) return 'invalid'
    const [a, b] = parts
    if (!IPV4.test(a) || !IPV4.test(b)) return 'invalid'
    return ipv4Number(a) <= ipv4Number(b) ? 'ipv4-range' : 'invalid'
  }

  if (IPV4.test(v)) return 'ipv4'
  if (IPV6.test(v)) return 'ipv6'
  return 'invalid'
}

/** An IPv4 address as one unsigned number. Assumes `v` already passed `IPV4`. */
export const ipv4Number = (v: string) => v.split('.').reduce((n, o) => n * 256 + Number(o), 0)

/* --- Matching an address against an entry -----------------------------------

   Everything above answers "is this entry well formed". What follows answers
   the question the evaluator asks of a zone: is THIS address inside THIS entry.
   It is plain arithmetic on the entry the admin typed — no lookup, no
   database — so it is the one part of zone membership the prototype can state
   as exactly as the engine would. */

const IPV4_TAIL = new RegExp(`^(.*:)(${octet}(\\.${octet}){3})$`)

/* An IPv6 address as one 128-bit number, or null when it is not one.

   One `::` is expanded to however many zero groups make eight. An embedded
   IPv4 tail (`::ffff:192.0.2.1`) is read as the last 32 bits, which is how the
   standard writes a mapped address. A zone index (`%eth0`) is refused rather
   than stripped: no zone entry can carry one, so an address holding one cannot
   be compared honestly. */
export function parseIpv6(raw: string): bigint | null {
  let v = raw.trim().toLowerCase()
  if (!v || v.includes('%')) return null
  let tail: bigint | null = null
  const t = IPV4_TAIL.exec(v)
  if (t) {
    tail = BigInt(ipv4Number(t[2]))
    /* The IPv4 tail stands in for two 16-bit groups. `::1.2.3.4` leaves `::`
       behind, and a trailing `::` has to survive for the expansion below. */
    v = t[1].endsWith('::') ? t[1] : t[1].slice(0, -1)
  }
  const want = tail === null ? 8 : 6
  const halves = v.split('::')
  if (halves.length > 2) return null
  const groupsOf = (s: string) => (s === '' ? [] : s.split(':'))
  const head = groupsOf(halves[0])
  const rest = halves.length === 2 ? groupsOf(halves[1]) : []
  let groups: string[]
  if (halves.length === 2) {
    const fill = want - head.length - rest.length
    /* `::` stands for at least one zero group. */
    if (fill < 1) return null
    groups = [...head, ...Array<string>(fill).fill('0'), ...rest]
  } else {
    groups = head
  }
  if (groups.length !== want) return null
  let n = 0n
  for (const g of groups) {
    if (!/^[\da-f]{1,4}$/.test(g)) return null
    n = (n << 16n) | BigInt(parseInt(g, 16))
  }
  return tail === null ? n : (n << 32n) | tail
}

/* An address, parsed once into its family. IPv4-mapped IPv6 (`::ffff:a.b.c.d`)
   is also carried as IPv4, so it can be compared with an IPv4 entry — and only
   with one: against an IPv6 entry it is compared as the IPv6 address it is. */
type ParsedAddress = { family: 4; v4: number } | { family: 6; v6: bigint; v4: number | null }

function parseAddress(raw: string): ParsedAddress | null {
  const v = raw.trim()
  if (IPV4.test(v)) return { family: 4, v4: ipv4Number(v) }
  const v6 = parseIpv6(v)
  if (v6 === null) return null
  /* ::ffff:0:0/96 — the top 96 bits are eighty zeros and sixteen ones. */
  const mapped = v6 >> 32n === 0xffffn
  return { family: 6, v6, v4: mapped ? Number(v6 & 0xffffffffn) : null }
}

/** Is this address a well-formed IPv4 or IPv6 address? */
export const isAddress = (raw: string) => parseAddress(raw) !== null

/* Is `address` inside the zone entry `entry`?

     true   inside
     false  outside, including an address of the other family
     null   the entry is not a valid entry, or the address is not an address —
            a question that cannot be asked, which is not the same as "no"

   The entry is normalised the way `classifyIp` normalises it, so an en-dash
   range typed from the spec matches the same addresses a hyphen range does. */
export function ipInEntry(address: string, entry: string): boolean | null {
  const e = entry.trim().replace(/\s*[–—]\s*/g, '-')
  const kind = classifyIp(e)
  if (kind === 'invalid') return null
  const a = parseAddress(address)
  if (!a) return null

  if (kind === 'ipv4' || kind === 'ipv4-cidr' || kind === 'ipv4-range') {
    const v4: number | null = a.v4
    if (v4 === null) return false
    if (kind === 'ipv4') return v4 === ipv4Number(e)
    if (kind === 'ipv4-range') {
      const [lo, hi] = e.split('-').map((x) => ipv4Number(x.trim()))
      return v4 >= lo && v4 <= hi
    }
    const [net, prefix] = e.split('/')
    const p = Number(prefix)
    /* `>>> 32` is `>>> 0` in JavaScript, so /0 is said out loud rather than
       left to a shift that would compare the whole address. */
    if (p === 0) return true
    const s = 32 - p
    return v4 >>> s === ipv4Number(net) >>> s
  }

  if (a.family !== 6) return false
  if (kind === 'ipv6') return a.v6 === parseIpv6(e)
  const [net, prefix] = e.split('/')
  const base = parseIpv6(net)
  if (base === null) return null
  const s = BigInt(128 - Number(prefix))
  return a.v6 >> s === base >> s
}

/** Why an entry was refused, in the words shown under the field. */
export function explainBadEntry(raw: string): string {
  const v = raw.trim().replace(/\s*[–—]\s*/g, '-')
  const parts = v.split('-').map((x) => x.trim())
  if (parts.length === 2 && IPV4.test(parts[0]) && IPV4.test(parts[1]) && ipv4Number(parts[0]) > ipv4Number(parts[1]))
    return 'Start is after end.'
  return 'Not an address, CIDR block, range or ASN.'
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

export function validateZone(z: Zone, otherNames: Iterable<string> = []): ZoneIssue[] {
  const out: ZoneIssue[] = []
  const noIp = ipSectionEmpty(z)
  const noLoc = locationEmpty(z.location)

  if (!z.name.trim()) {
    out.push({
      id: 'name',
      level: 'error',
      title: 'No name',
      detail: 'Rules show zones by name. Enter a zone name.',
    })
  } else if (nameTaken(z.name, otherNames)) {
    /* Rule pickers and Used by list zones by name only, so two zones with one
       name cannot be told apart. */
    out.push({
      id: 'dupname',
      level: 'error',
      title: 'Name already used',
      detail: 'Another zone has this name. Rules show zones by name.',
    })
  }

  /* Example 5 — both sections empty. Every section matching "any" means the
     zone matches all traffic from everywhere, which is not a boundary. */
  if (noIp && noLoc) {
    out.push({
      id: 'empty',
      level: 'error',
      title: 'Matches everything',
      detail: 'An empty section matches any value. Add an IP network or a location.',
    })
  }

  const badIp = z.ip.filter((v) => classifyIp(v) === 'invalid')
  if (badIp.length > 0) {
    out.push({
      id: 'badip',
      level: 'error',
      section: 'ip',
      title: `${badIp.length} entr${badIp.length === 1 ? 'y is' : 'ies are'} not valid`,
      detail: 'Use an IPv4 or IPv6 address, a CIDR block, or an IPv4 range such as 203.0.113.10-203.0.113.60.',
      values: badIp,
    })
  }

  const badAsn = z.asn.filter((v) => !isValidAsn(v))
  if (badAsn.length > 0) {
    out.push({
      id: 'badasn',
      level: 'error',
      section: 'asn',
      title: `${badAsn.length} ASN${badAsn.length === 1 ? ' is' : 's are'} not valid`,
      detail: 'An ASN is AS followed by digits, such as AS15169.',
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
      title: 'Exact address with a location',
      detail: `${exact.length > 3 ? `${exact.slice(0, 3).join(', ')} and ${exact.length - 3} more` : exact.join(', ')} already ${exact.length === 1 ? 'has' : 'have'} a fixed location, so the location changes nothing or matches nothing. Use a CIDR block or an ASN.`,
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
      detail: 'No IP networks, so any network in these locations matches.',
    })
  }
  if (!noIp && noLoc) {
    out.push({
      id: 'any-location',
      level: 'info',
      section: 'location',
      title: 'Any location',
      detail: 'No locations, so these networks match from any location.',
    })
  }

  return out
}

/** Saving is blocked only by errors; warnings are the admin's call. */
export const canSaveZone = (z: Zone, otherNames: Iterable<string> = []) =>
  !validateZone(z, otherNames).some((i) => i.level === 'error')

/* `describeZone` stood here: the one-line summary under a zone page's name,
   "2 networks · Bengaluru, Mumbai · Within 25 km of Pune". The page shows the
   heading alone now (owner, 1 Oct 2026: "hide this, not needed, only heading
   is enough"), and nothing else read the line. */
