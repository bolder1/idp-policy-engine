import type { Policy, Zone, ZoneLocation } from '../data'
import { leaves } from '../predicate'
import { classifyIp, isValidAsn } from './zone-validation'

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

/* --- What changed, for the save bar ------------------------------------------ */

/** A location entry as one string: "India", "Maharashtra", "25 km of Pune HQ". */
export function locationEntries(l: ZoneLocation): string[] {
  const out = [...l.countries, ...l.states, ...l.cities]
  if (l.radius) out.push(`${l.radius.km} km of ${l.radius.label ?? `${l.radius.lat}, ${l.radius.lon}`}`)
  return out
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

/* The two locations compared entry by entry, with each entry's kind in its key.

   By name alone, a state swapped for the city of the same name — Berlin,
   Hamburg, Singapore — compared equal: the draft had changed what the zone
   matches, and the save bar never opened to commit it. A name that is both
   added and removed is labelled with its kind, or the review would read
   "added Berlin, removed Berlin". */
function locationDiff(before: ZoneLocation, after: ZoneLocation): { added: string[]; removed: string[] } {
  const keys = (l: ZoneLocation) => [
    ...l.countries.map((v) => `country:${v}`),
    ...l.states.map((v) => `state:${v}`),
    ...l.cities.map((v) => `city:${v}`),
    ...locationEntries({ countries: [], states: [], cities: [], radius: l.radius }).map((v) => `radius:${v}`),
  ]
  const kb = keys(before)
  const ka = keys(after)
  const added = minus(ka, kb)
  const removed = minus(kb, ka)
  const kind = (k: string) => k.slice(0, k.indexOf(':'))
  const name = (k: string) => k.slice(k.indexOf(':') + 1)
  const shown = (list: string[], other: string[]) => {
    const clash = new Set(other.map(name))
    return list.map((k) => (clash.has(name(k)) ? `${name(k)} (${kind(k)})` : name(k)))
  }
  return { added: shown(added, removed), removed: shown(removed, added) }
}

export interface ZoneReviewRow {
  label: string
  before: string
  after: string
}

/** Values listed in one review cell before the rest are counted. */
export const REVIEW_LIST_MAX = 10

const listed = (values: string[]) =>
  values.length <= REVIEW_LIST_MAX
    ? values.join(', ')
    : `${values.slice(0, REVIEW_LIST_MAX).join(', ')} and ${values.length - REVIEW_LIST_MAX} more`

/* The draft against the saved zone, one row per kind of change. An edited entry
   reads as one removed and one added, which is what it is to a rule. */
export function zoneReviewRows(before: Zone, after: Zone): ZoneReviewRow[] {
  const rows: ZoneReviewRow[] = []
  if (before.name !== after.name) rows.push({ label: 'Name', before: before.name, after: after.name })

  const nb = netEntries(before)
  const na = netEntries(after)
  const netAdded = minus(na, nb)
  const netRemoved = minus(nb, na)
  if (netAdded.length) rows.push({ label: 'IP networks: added', before: '', after: listed(netAdded) })
  if (netRemoved.length) rows.push({ label: 'IP networks: removed', before: listed(netRemoved), after: '' })

  const loc = locationDiff(before.location, after.location)
  if (loc.added.length) rows.push({ label: 'Locations: added', before: '', after: listed(loc.added) })
  if (loc.removed.length) rows.push({ label: 'Locations: removed', before: listed(loc.removed), after: '' })

  return rows
}
