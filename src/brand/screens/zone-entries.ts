import { DEFAULT_RANGE_KM, rangeText, type Policy, type Zone, type ZoneLocation, type ZoneRange } from '../data'
import { PLACES, coveredBy, type Place } from '../places'
import { leaves } from '../predicate'
import type { ReviewLine } from '../review-rows'
import { lookUpAddress } from './geo-fixture'
import { classifyIp, isValidAsn, type IpKind } from './zone-validation'

/** Ids a new zone must not take: every zone's, and every zone id a policy rule
    still names, live or in a saved draft. Deleting a zone does not unlink its
    rules, so reusing a deleted zone's id would quietly point them at the new one. */
export function takenZoneIds(zones: Zone[], policies: Policy[]): Set<string> {
  const out = new Set(zones.map((z) => z.id))
  for (const p of policies) {
    for (const r of [...p.rules, ...(p.pendingDraft?.rules ?? [])]) {
      for (const c of leaves(r.when)) if (c.typeId === 'zone') for (const v of c.values) out.add(v)
    }
  }
  return out
}

const IPV4_TEXT = '\\d{1,3}(?:\\.\\d{1,3}){3}'
/* A range typed with spaces or a dash other than a hyphen: `10.0.0.1 - 10.0.0.9`,
   `10.0.0.1 – 10.0.0.9`. Only between two IPv4 addresses on one line, so a
   pasted list of single addresses is never joined into a range. */
const SPACED_RANGE = new RegExp(`(${IPV4_TEXT})[ \\t]*[-–—][ \\t]*(${IPV4_TEXT})`, 'g')

/** One entry as it is stored: an ASN in upper case, IPv6 in lower case, and a
    range written `a-b` with no spaces. Anything else is returned trimmed. */
export function normaliseEntry(raw: string): string {
  const v = raw.trim()
  if (isValidAsn(v)) return v.toUpperCase()
  const range = v.replace(SPACED_RANGE, '$1-$2')
  if (range !== v) return range
  if (v.includes(':')) return v.toLowerCase()
  return v
}

/** Whether `value` is already in the list, compared in stored form. */
export const hasEntry = (list: string[], value: string) => {
  const key = normaliseEntry(value)
  return list.some((x) => normaliseEntry(x) === key)
}

/* Paste-many, parsed.

   One field takes addresses, CIDR blocks, ranges and ASNs, split on commas,
   semicolons, spaces and line breaks. Its own module so the tests can import it
   without the screen. */
export function parseEntries(
  text: string,
  existingIp: string[],
  existingAsn: string[],
): { ip: string[]; asn: string[]; bad: string[] } {
  const ip = [...existingIp]
  const asn = [...existingAsn]
  const bad: string[] = []

  for (const v of text
    .replace(SPACED_RANGE, '$1-$2')
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)) {
    const value = normaliseEntry(v)
    if (isValidAsn(value)) {
      if (!hasEntry(asn, value)) asn.push(value)
    } else if (classifyIp(value) !== 'invalid') {
      if (!hasEntry(ip, value)) ip.push(value)
    } else {
      bad.push(v)
    }
  }
  return { ip, asn, bad }
}

/* --- What a row holds, said inside it -----------------------------------------

   Owner, 1 Oct 2026, on the IP networks list: "add the tag here for different
   IP types, like IPv4 or 6 or whatever we have". So each row names its kind at
   the right of the field, the way a Locations row says "City", and the name
   follows the text as it is typed: "10.0.0.1" is IPv4, "10.0.0.1/24" becomes
   an IPv4 network one keystroke later.

   Only the kinds the field accepts, read the way a commit reads them (one
   token, through `parseEntries`), so the tag can never promise an entry the
   field would refuse. Ranges are IPv4 only because the classifier takes no
   IPv6 range. A row that does not read as ONE entry — empty, half typed, a
   pasted list, a typo — says nothing new: an unreadable row already has the
   page's own red edge and reason, and a second voice there would only argue. */

export type EntryKind = 'IPv4' | 'IPv4 network' | 'IPv4 range' | 'IPv6' | 'IPv6 network' | 'ASN'

const KIND_OF: Record<Exclude<IpKind, 'invalid'>, EntryKind> = {
  ipv4: 'IPv4',
  'ipv4-cidr': 'IPv4 network',
  'ipv4-range': 'IPv4 range',
  ipv6: 'IPv6',
  'ipv6-cidr': 'IPv6 network',
}

/* Remembered by text: the tag is asked for on every row at every keystroke,
   and a 500-row paste should not re-read 500 entries to type one character.
   Bounded, as the geo lookup's cache is. */
const KINDS = new Map<string, EntryKind | null>()

/** The kind of the one entry `text` holds, or null when it holds none, several, or one that does not read. */
export function entryKind(text: string): EntryKind | null {
  const known = KINDS.get(text)
  if (known !== undefined) return known
  const r = parseEntries(text, [], [])
  let kind: EntryKind | null = null
  if (r.bad.length === 0 && r.ip.length + r.asn.length === 1) {
    if (r.asn.length === 1) kind = 'ASN'
    else {
      const k = classifyIp(r.ip[0])
      kind = k === 'invalid' ? null : KIND_OF[k]
    }
  }
  if (KINDS.size >= 1024) KINDS.clear()
  KINDS.set(text, kind)
  return kind
}

/* --- Where this session is ------------------------------------------------------

   THIS IP IS MOCKED. A browser cannot see its own public address without a
   server, so this is a documentation-range placeholder for what the real
   console would fill from the request. Both Quick adds read it: IP networks
   offers the address, Locations the place it is in (owner, 1 Oct 2026: "add an
   option for add my current location"). */
export const CURRENT_IP = '203.0.113.42'

/** The catalogue place an address is looked up to — the same lookup zone
    matching and the sign-in facts use (`geo-fixture.ts`) — or null when the
    lookup has no row for it, or a row that names no place. */
export function placeAtAddress(address: string): Place | null {
  const id = lookUpAddress(address)?.row.place
  return id ? (PLACES.find((p) => p.id === id) ?? null) : null
}

/** The location list a place of each kind is stored in. */
export type PlaceList = 'countries' | 'states' | 'cities'

export const LIST_OF: Record<Place['kind'], PlaceList> = { country: 'countries', state: 'states', city: 'cities' }

/** Why a place cannot go in, or null when it can. */
export type Refusal = { kind: 'added' } | { kind: 'covered'; by: string } | null

/* A place already in the zone, or inside one that is, would change nothing.
   Asked by the place search of every hit, and by Locations' Quick add. */
export function placeRefusal(p: Place, l: ZoneLocation): Refusal {
  if (l[LIST_OF[p.kind]].includes(p.name)) return { kind: 'added' }
  /* A city with a distance is still that city. */
  if (p.kind === 'city' && l.ranges.some((r) => centredOn(r, p))) return { kind: 'added' }
  const by = coveredBy(p, l)
  return by ? { kind: 'covered', by } : null
}

/** Locations' Quick add: the location with the place this session is in, put
    in as Add location puts a place — a city at range 0, at the end of its list
    — or null when the lookup names none, or it is in already, or covered. */
export function withCurrentPlace(l: ZoneLocation, here: Place | null = placeAtAddress(CURRENT_IP)): ZoneLocation | null {
  if (!here || placeRefusal(here, l)) return null
  const list = LIST_OF[here.kind]
  return { ...l, [list]: [...l[list], here.name] }
}

/* --- Renaming a stored zone -----------------------------------------------------

   Owner, 1 Oct 2026: "we already have a save button for the basic details, so
   no need to have it in the review". On a zone that is stored, the rename's ✓
   saves the name at once. What it writes is the zone AS STORED with only the
   new name — never the page's draft, which may hold edits nobody has reviewed
   yet. A new zone is not stored, so its name stays in the draft. */

/** The zone a rename writes, or null when there is nothing to write. */
export function withStoredName(stored: Zone | undefined, name: string): Zone | null {
  if (!stored || stored.name === name) return null
  return { ...stored, name }
}

/* --- Ranges ------------------------------------------------------------------- */

/** A range around a catalogue city, at `km`. */
export const rangeAt = (p: Place, km: number): ZoneRange => ({ km, lat: p.lat, lon: p.lon, label: p.name, placeId: p.id })

/** Whether `p` is the city this range is drawn around: by catalogue id, or by
    name for a range that has none. */
export const centredOn = (r: ZoneRange, p: Place) => (r.placeId ? r.placeId === p.id : r.label === p.name)

/** A range around `p`: a new one at the default distance, or `moving` moved to
    `p` where it stood, with its distance kept. The city it already centres on,
    picked again, moves nothing: the stored centre can be finer than the
    catalogue's, and swapping one for the other would be a change no one made.
    No sweep either way: a circle can cross a border, so a country does not make
    one redundant.

    The distance is the number AND its unit (2 Oct 2026): the move kept the
    number and dropped the unit, so 10 miles round Pune, moved to Chennai,
    came out as 10 km. The row being searched shows the range it will keep,
    so the two have to agree. */
export function withRange(l: ZoneLocation, p: Place, moving: ZoneRange | null): ZoneLocation {
  if (moving) {
    if (centredOn(moving, p)) return l
    const moved = (r: ZoneRange): ZoneRange => (r.unit ? { ...rangeAt(p, r.km), unit: r.unit } : rangeAt(p, r.km))
    return { ...l, ranges: l.ranges.map((r) => (r === moving ? moved(r) : r)) }
  }
  return { ...l, ranges: [...l.ranges, rangeAt(p, DEFAULT_RANGE_KM)] }
}

/* --- What changed, for the save bar ------------------------------------------ */

/** A location entry as one string: "India", "Maharashtra", "Within 25 km of Pune". */
export function locationEntries(l: ZoneLocation): string[] {
  return [...l.countries, ...l.states, ...l.cities, ...l.ranges.map(rangeText)]
}

const netEntries = (z: Zone) => [...z.ip, ...z.asn]
/* A Set, because a zone's list has no ceiling and this runs on every render of the page. */
const minus = (a: string[], b: string[]) => {
  const drop = new Set(b)
  return a.filter((v) => !drop.has(v))
}

/** Short names for the save bar: "Name", "IP networks", "Locations". */
export function zoneChanges(before: Zone, after: Zone): string[] {
  const parts: string[] = []
  if (before.name !== after.name) parts.push('Name')
  const nb = netEntries(before)
  const na = netEntries(after)
  if (minus(na, nb).length > 0 || minus(nb, na).length > 0) parts.push('IP networks')
  const loc = locationDiff(before.location, after.location)
  if (loc.added.length > 0 || loc.removed.length > 0) parts.push('Locations')
  return parts
}

/* One location entry for the diff: what makes it a different entry (`key`),
   what it is called (`text`), and what tells two of one name apart (`aside`). */
interface LocEntry {
  key: string
  text: string
  aside: string
}

/* A range is keyed by its centre and its distance, not by its words: a centre
   moved under the same label, or the same centre at another distance, changes
   what the zone matches, and the save bar has to open for it. */
const rangeEntry = (r: ZoneRange): LocEntry => ({
  key: `range:${r.lat},${r.lon}:${r.km}`,
  text: rangeText(r),
  aside: `${r.lat}, ${r.lon}`,
})

/* The two locations compared entry by entry, with each entry's kind in its key.

   By name alone, a state swapped for the city of the same name — Berlin,
   Hamburg, Singapore — compared equal: the draft had changed what the zone
   matches, and the save bar never opened to commit it. A name that is both
   added and removed is labelled with its kind (a range with its centre), or
   the review would read "added Berlin, removed Berlin". */
function locationDiff(before: ZoneLocation, after: ZoneLocation): { added: string[]; removed: string[] } {
  const entries = (l: ZoneLocation): LocEntry[] => [
    ...l.countries.map((v) => ({ key: `country:${v}`, text: v, aside: 'country' })),
    ...l.states.map((v) => ({ key: `state:${v}`, text: v, aside: 'state' })),
    ...l.cities.map((v) => ({ key: `city:${v}`, text: v, aside: 'city' })),
    ...l.ranges.map(rangeEntry),
  ]
  const eb = entries(before)
  const ea = entries(after)
  const missing = (a: LocEntry[], b: LocEntry[]) => {
    const drop = new Set(b.map((e) => e.key))
    return a.filter((e) => !drop.has(e.key))
  }
  const added = missing(ea, eb)
  const removed = missing(eb, ea)
  const shown = (list: LocEntry[], other: LocEntry[]) => {
    const clash = new Set(other.map((e) => e.text))
    return list.map((e) => (clash.has(e.text) ? `${e.text} (${e.aside})` : e.text))
  }
  return { added: shown(added, removed), removed: shown(removed, added) }
}

/* A zone's review row is the shared review line. The sections are the page's
   own — IP networks, Locations — and the name leads under Basic details
   (GENERAL_GROUP; it was "General" until 1 Oct 2026). Each list
   row holds every added (or removed) entry joined, so it names no single item,
   and says how many it holds (`count`) when that is more than one. */
export type ZoneReviewRow = ReviewLine

/** Values listed in one review cell before the rest are counted. */
export const REVIEW_LIST_MAX = 10

const listed = (values: string[]) =>
  values.length <= REVIEW_LIST_MAX
    ? values.join(', ')
    : `${values.slice(0, REVIEW_LIST_MAX).join(', ')} and ${values.length - REVIEW_LIST_MAX} more`

const many = (values: string[]) => (values.length > 1 ? { count: values.length } : {})

/* The draft against the saved zone, one row per kind of change. An edited entry
   reads as one removed and one added, which is what it is to a rule. */
export function zoneReviewRows(before: Zone, after: Zone): ZoneReviewRow[] {
  const rows: ZoneReviewRow[] = []
  /* A new zone is reviewed against itself with no name (ZonesFinal), so its
     name is added; a saved zone's name can only change. Said outright, so a
     name cleared in the draft does not read as removed. */
  if (before.name !== after.name) {
    rows.push({ label: 'Name', before: before.name, after: after.name, kind: before.name === '' ? 'added' : 'changed' })
  }

  const nb = netEntries(before)
  const na = netEntries(after)
  const netAdded = minus(na, nb)
  const netRemoved = minus(nb, na)
  if (netAdded.length) {
    rows.push({ label: 'IP networks: added', before: '', after: listed(netAdded), group: 'IP networks', kind: 'added', ...many(netAdded) })
  }
  if (netRemoved.length) {
    rows.push({ label: 'IP networks: removed', before: listed(netRemoved), after: '', group: 'IP networks', kind: 'removed', ...many(netRemoved) })
  }

  const loc = locationDiff(before.location, after.location)
  if (loc.added.length) {
    rows.push({ label: 'Locations: added', before: '', after: listed(loc.added), group: 'Locations', kind: 'added', ...many(loc.added) })
  }
  if (loc.removed.length) {
    rows.push({ label: 'Locations: removed', before: listed(loc.removed), after: '', group: 'Locations', kind: 'removed', ...many(loc.removed) })
  }

  return rows
}
