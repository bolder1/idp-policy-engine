import { lookUpAddress } from './geo-fixture'
import { CHIP_NETWORK, type SignInFacts } from './sign-in-facts'
import { PLACE_FACTS, type SimEnv } from './simulate'
import { ORIGIN_PRESETS } from './testing/sign-in-form'
import { zoneMember } from './zone-match'

/* -----------------------------------------------------------------------------
   Where a modelled sign-in came from, in words the admin has seen.

   The tenant sweep (impact-arena.ts) runs on the chip grid, whose five origins
   are named for the model — "Any location", "Office Network", "Outside all
   zones", "Tor exit node", "Known proxy" — and What changes printed those
   names beside the people who moved (owner, 26 Sep 2026). They are the
   prototype's words, not the console's. An admin knows two sets of names for
   where a sign-in comes from: the origins Try a sign-in offers (Office
   network, Branch office, Home broadband, Tor exit) and the zones on the Zones
   page. So an origin is said as the first of:

     1. no address at all                  "No IP address"
     2. an address in a Try origin's block  that origin's label
     3. inside a zone                       that zone's name, the first in list order
     4. neither                             the looked-up place: "Austin", or
                                            "Proxy in Germany" for a proxy

   Read from the chip's own address and place (sign-in-facts.ts
   `CHIP_NETWORK`), which is what the sweep decided on, so the word never names
   somewhere the answer was not worked out for. No commas in a word: What
   changes lists a person's origins with them.
   -------------------------------------------------------------------------- */

export type OriginEnv = Partial<Pick<SimEnv, 'library' | 'zoneName'>>

export function originWord(chip: string, env: OriginEnv = {}): string {
  const origin = CHIP_NETWORK[chip]
  if (!origin?.address) return 'No IP address'
  const row = lookUpAddress(origin.address)?.row
  const preset = row && ORIGIN_PRESETS.find((p) => lookUpAddress(p.address)?.row === row)
  if (preset) return preset.label

  const zone = zonesOf(chip, env)[0]
  if (zone) return zone

  const place = origin.location?.city ?? origin.location?.country ?? null
  if (row?.anonymiser === 'proxy') return place ? `Proxy in ${place}` : 'Proxy'
  return place ?? origin.address
}

/* The zones an origin is in: the tenant's own, read as a condition naming the
   whole zone would read them, or — with no library, as on the legacy estate —
   the chip table's list, named by the env. */
function zonesOf(chip: string, env: OriginEnv): string[] {
  if (env.library) {
    const o = CHIP_NETWORK[chip]
    const facts: SignInFacts = {
      ...(o?.address ? { network: { address: o.address, source: 'assumed' as const } } : null),
      ...(o?.location !== undefined ? { location: o.location } : null),
    }
    return env.library.zones.filter((z) => zoneMember(z, facts, 'both').status === 'pass').map((z) => z.name)
  }
  const ids = PLACE_FACTS[chip]?.zonesIn ?? []
  return env.zoneName ? ids.map(env.zoneName) : []
}
