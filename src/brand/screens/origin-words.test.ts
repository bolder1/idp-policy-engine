import { describe, expect, it } from 'vitest'

import type { Zone } from '../data'
import { showcaseTenant } from '../fixtures'
import { originWord } from './origin-words'
import { PLACES } from './simulate'
import { envOf } from './tenant-resolver'

/* -----------------------------------------------------------------------------
   The sweep's five origins, said the way the admin has seen places said: a
   Try a sign-in origin, a zone, or where the address looks up to — never the
   chip grid's own names (owner, 26 Sep 2026).
   -------------------------------------------------------------------------- */

const t = showcaseTenant()
const env = envOf(t)
const withZone = (z: Zone) => ({ ...env, library: { ...env.library!, zones: [...env.library!.zones, z] } })
const zone = (id: string, name: string, ip: string[]): Zone => ({
  id,
  name,
  kind: 'allowed',
  ip,
  asn: [],
  location: { countries: [], states: [], cities: [], ranges: [] },
  usedIn: 0,
})

describe('originWord', () => {
  it('says the showcase origins as Try a sign-in and the looked-up place say them', () => {
    expect(PLACES.map((p) => originWord(p, env))).toEqual(['No IP address', 'Office network', 'Austin', 'Tor exit', 'Proxy in Germany'])
  })

  it('never says a chip name', () => {
    for (const p of PLACES) expect(PLACES).not.toContain(originWord(p, env))
  })

  it('prefers the Try origin to the zone it sits in', () => {
    /* The office chip is in Corporate offices, and in the office origin's block. */
    expect(t.zones.find((z) => z.id === 'corp-offices')?.ip).toContain('203.0.113.0/24')
    expect(originWord('Office Network', env)).toBe('Office network')
  })

  it('names the zone an origin is in when no Try origin holds it', () => {
    expect(originWord('Known proxy', withZone(zone('anon', 'Anonymisers', ['192.0.2.80/28'])))).toBe('Anonymisers')
    expect(originWord('Outside all zones', withZone(zone('us-home', 'US residential', ['192.0.2.128/26'])))).toBe('US residential')
  })

  it('reads the chip table’s zones by name where there is no library', () => {
    const legacy = { zoneName: (id: string) => ({ anon: 'Anonymous networks', eu: 'European Union' })[id] ?? id }
    expect(originWord('Known proxy', legacy)).toBe('Anonymous networks')
    expect(originWord('Outside all zones', legacy)).toBe('Austin')
  })

  it('says no commas, so a list of origins stays a list', () => {
    for (const p of PLACES) expect(originWord(p, env)).not.toContain(',')
  })
})
