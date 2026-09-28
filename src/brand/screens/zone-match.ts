import { ipSectionEmpty, locationEmpty, type Zone, type ZoneRange, type ZoneScope } from '../data'
import { sameName, withinRange } from '../places'
import { allOf, anyOf, type CondState } from '../predicate'
import { lookUpAddress } from './geo-fixture'
import type { FactKey, SignInFacts, SignInPlace } from './sign-in-facts'
import { ipInEntry, isAddress, isValidAsn } from './zone-validation'

/* -----------------------------------------------------------------------------
   Is a sign-in inside a zone — read from the zone's own entries.

   The chip evaluator answered this from a table that named four zone ids, so
   every zone it had not been told about came back as "no zone at all", however
   plainly the sign-in sat inside it. A Finance user in the office was refused
   HRMS because the office zone was called `corp-offices` and not `office`.

   This reads the zone. The network half is arithmetic on its addresses and a
   comparison of its ASNs; the location half compares the sign-in's place with
   its countries, states and cities by name (aliases included, so "Bangalore"
   is "Bengaluru") and measures the distance to each range. Both halves are
   three-valued: a fact nobody gave leaves an entry undecided, never passed.

     OR   within a half, entries are alternatives — any passes, it passes
     AND  across halves, both must hold — either fails, it fails
     ANY  an empty half places no constraint, so beside a constrained half it
          counts as a pass (the zones screen draws it as "Any network")

   `Zone.kind` is never read. Allowed, blocked and custom are what a zone is
   FOR; whether a sign-in is in it does not depend on that.

   What stays a fixture, said plainly: a place is looked up from an address
   through `geo-fixture.ts` when no place was stated, and that table covers a
   handful of documentation blocks, not the internet. An address outside it has
   no looked-up place, so a location half it needs comes back undecided.
   -------------------------------------------------------------------------- */

/** One named zone's standing, before the condition's own negation. */
export interface ZonePart {
  zoneId: string
  zoneName: string
  /** This zone's membership, before negation. */
  status: CondState
  /** 'any' = the half is empty; 'not asked' = the condition scoped it away. */
  network: CondState | 'any' | 'not asked'
  location: CondState | 'any' | 'not asked'
}

export interface ZoneHalves {
  network: CondState | 'any'
  location: CondState | 'any'
  /** Facts that would settle an undecided half, in the order first needed. */
  missing: FactKey[]
  /** The entry that put the sign-in inside the network half, when one did. */
  networkEntry?: string
  /** The entry that put the sign-in inside the location half, when one did. */
  locationEntry?: string
  /** When that entry was a range, the range itself, so a trace can say how far. */
  locationRange?: ZoneRange
  /** The place the location half was read against, and where it came from. */
  place: SignInPlace | null | undefined
}

/* The place a sign-in is at: stated, or looked up from its address.

     undefined  nothing stated and nothing to look up (or no fixture row)
     null       looked up, and the lookup names no place */
export function placeOfSignIn(facts: SignInFacts): SignInPlace | null | undefined {
  if (facts.location !== undefined) return facts.location
  if (!facts.network) return undefined
  return lookUpAddress(facts.network.address)?.location
}

/* The ASN a sign-in arrived on: stated, or looked up. A stated `null` is a
   statement that there is none to match, which is a fail, not a question. */
function asnOf(facts: SignInFacts): string | null | undefined {
  if (!facts.network) return undefined
  if (facts.network.asn !== undefined) return facts.network.asn
  return lookUpAddress(facts.network.address)?.asn
}

const push = (into: FactKey[], k: FactKey) => {
  if (!into.includes(k)) into.push(k)
}

/** Both halves of one zone against one sign-in, each three-valued or 'any'. */
export function zoneHalves(zone: Zone, facts: SignInFacts): ZoneHalves {
  const netMissing: FactKey[] = []
  const locMissing: FactKey[] = []
  let networkEntry: string | undefined
  let locationEntry: string | undefined
  let locationRange: ZoneRange | undefined

  /* --- Network ------------------------------------------------------------ */
  let network: CondState | 'any' = 'any'
  if (!ipSectionEmpty(zone)) {
    const states: CondState[] = []
    const address = facts.network?.address
    /* A typed address that is not an address is not a fact. It is undecided
       rather than a miss, so a typo cannot read as "outside the office". */
    const usable = address !== undefined && isAddress(address)
    for (const entry of zone.ip) {
      if (!usable) {
        states.push('unknown')
        push(netMissing, 'address')
        continue
      }
      const hit = ipInEntry(address, entry)
      /* An entry the zone page would refuse cannot hold anyone. */
      if (hit === true) networkEntry ??= entry
      states.push(hit === true ? 'pass' : 'fail')
    }
    const asn = asnOf(facts)
    for (const entry of zone.asn) {
      if (!isValidAsn(entry)) {
        states.push('fail')
        continue
      }
      if (asn === undefined) {
        states.push('unknown')
        push(netMissing, 'asn')
        continue
      }
      const hit = asn !== null && asn.trim().toUpperCase() === entry.trim().toUpperCase()
      if (hit) networkEntry ??= entry
      states.push(hit ? 'pass' : 'fail')
    }
    network = anyOf(states)
  }

  /* --- Location ----------------------------------------------------------- */
  const place = placeOfSignIn(facts)
  let location: CondState | 'any' = 'any'
  if (!locationEmpty(zone.location)) {
    const l = zone.location
    const states: CondState[] = []
    if (place === undefined || place === null) {
      /* No place at all — not stated, no fixture row, or an anonymiser the
         lookup cannot place. Every entry is undecided for the same reason. */
      states.push('unknown')
      push(locMissing, 'location')
    } else {
      const byName = (kind: 'country' | 'state' | 'city', entries: string[], have: string | null | undefined, key: FactKey) => {
        for (const entry of entries) {
          if (have === null || have === undefined) {
            states.push('unknown')
            push(locMissing, key)
            continue
          }
          const hit = sameName(kind, entry, have)
          if (hit) locationEntry ??= entry
          states.push(hit ? 'pass' : 'fail')
        }
      }
      byName('country', l.countries, place.country, 'location')
      byName('state', l.states, place.state, 'location')
      byName('city', l.cities, place.city, 'location.city')
      for (const r of l.ranges) {
        if (place.lat === null || place.lon === null) {
          states.push('unknown')
          push(locMissing, 'location.coordinates')
          continue
        }
        /* Inclusive: a sign-in exactly at the edge is inside the range. */
        const hit = withinRange({ lat: place.lat, lon: place.lon }, r)
        if (hit && locationEntry === undefined) {
          locationEntry = r.label
          locationRange = r
        }
        states.push(hit ? 'pass' : 'fail')
      }
    }
    location = anyOf(states)
  }

  /* Only the facts that would settle a half that is still undecided. */
  const missing: FactKey[] = []
  if (network === 'unknown') for (const k of netMissing) push(missing, k)
  if (location === 'unknown') for (const k of locMissing) push(missing, k)
  return { network, location, missing, networkEntry, locationEntry, locationRange, place }
}

/* One zone, on the half (or both halves) a condition asked about.

   Both halves: the AND, with an empty half counting as a pass beside the
   other. One half: that half alone, and the other reports 'not asked'.

   One half asked of a zone that has NONE of it — "in zone Office network, by
   location" when the zone lists no location — is a fail, not a pass. The
   zones screen never offers that choice for a one-half zone, so only a stale
   condition reaches it; and the chip evaluator, `zone-scope.test.ts` and this
   agree on the reading: a rule that asked about the map is not satisfied by a
   zone that says nothing about the map. Read as "any", every sign-in anywhere
   would be inside it, which is the opposite of what narrowing was for. */
export function zoneMember(zone: Zone, facts: SignInFacts, scope: 'both' | ZoneScope): ZonePart & { missing: FactKey[]; halves: ZoneHalves } {
  const h = zoneHalves(zone, facts)
  const asked = (half: CondState | 'any'): CondState => (half === 'any' ? 'fail' : half)
  const beside = (half: CondState | 'any'): CondState => (half === 'any' ? 'pass' : half)

  let status: CondState
  let network: ZonePart['network'] = h.network
  let location: ZonePart['location'] = h.location
  if (scope === 'ip') {
    status = asked(h.network)
    location = 'not asked'
  } else if (scope === 'location') {
    status = asked(h.location)
    network = 'not asked'
  } else {
    status = allOf([beside(h.network), beside(h.location)])
  }

  const missing: FactKey[] = []
  if (status === 'unknown') {
    if (network === 'unknown') for (const k of h.missing.filter((k) => k === 'address' || k === 'asn')) push(missing, k)
    if (location === 'unknown') for (const k of h.missing.filter((k) => k.startsWith('location'))) push(missing, k)
  }
  return { zoneId: zone.id, zoneName: zone.name, status, network, location, missing, halves: h }
}
