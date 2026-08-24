import { describe, expect, it } from 'vitest'

import {
  ATTRIBUTES,
  CATEGORIES,
  DEFAULT_BANDS,
  bandOf,
  byId,
  ceilingOf,
  scoreOf,
  seedProfiles,
  unreachableBands,
  type FingerprintProfile,
} from './fingerprint'

/* The attribute master is a transcription of somebody else's spreadsheet, and a
   transcription drifts silently: a weight typo or a lost category reads as a
   deliberate choice six months later. These assertions are the receipt. */

const profile = (over: Partial<FingerprintProfile> = {}): FingerprintProfile => ({
  id: 't',
  name: 'Test',
  mode: 'risk',
  enabled: [],
  config: {},
  weights: {},
  tolerance: 0,
  onMismatch: 'challenge',
  bands: { ...DEFAULT_BANDS },
  reach: 'agent',
  registration: 'self',
  maxDevices: 3,
  roster: null,
  mobileRestriction: true,
  autoRegister: false,
  usedIn: 0,
  ...over,
})

describe('the attribute master', () => {
  it('carries every category the sheet defines, and nothing orphaned', () => {
    const declared = new Set(CATEGORIES.map((c) => c.id))
    const used = new Set(ATTRIBUTES.map((a) => a.category))
    expect([...used].filter((c) => !declared.has(c))).toEqual([])
    expect([...declared].filter((c) => !used.has(c))).toEqual([])
  })

  it('has unique ids and no blank names', () => {
    expect(new Set(ATTRIBUTES.map((a) => a.id)).size).toBe(ATTRIBUTES.length)
    expect(ATTRIBUTES.filter((a) => !a.name.trim() || !a.purpose.trim())).toEqual([])
  })

  it('keeps every weight on the sheet 5-30 scale', () => {
    // 30 unique identifiers, 20 hardware specs, 10 browser/network, 5 config.
    for (const a of ATTRIBUTES) {
      expect(`${a.id}: ${[5, 10, 20, 30].includes(a.weight)}`).toBe(`${a.id}: true`)
    }
  })

  it('only offers configuration where there is something to configure', () => {
    for (const a of ATTRIBUTES) {
      if (!a.config) continue
      if (a.config.kind === 'choice') expect(a.config.options.length).toBeGreaterThan(1)
      if (a.config.kind === 'tolerance') expect(a.config.max).toBeGreaterThan(a.config.min)
    }
  })
})

describe('scoring', () => {
  it('only counts attributes that are switched on', () => {
    const p = profile({ enabled: ['tpm'] })
    // bios is changed but not enabled, so it contributes nothing.
    expect(scoreOf(p, ['tpm', 'bios'])).toBe(byId('tpm')!.weight)
  })

  it('respects a per-profile weight override', () => {
    const p = profile({ enabled: ['tpm'], weights: { tpm: 7 } })
    expect(scoreOf(p, ['tpm'])).toBe(7)
  })

  it('caps at 100, because the bands are expressed on that scale', () => {
    const all = ATTRIBUTES.map((a) => a.id)
    expect(scoreOf(profile({ enabled: all }), all)).toBe(100)
  })

  it('puts the sheet band boundaries on the right side of the line', () => {
    const p = profile()
    expect(bandOf(p, 0)).toBe('allow')
    expect(bandOf(p, 30)).toBe('allow')
    expect(bandOf(p, 31)).toBe('challenge')
    expect(bandOf(p, 70)).toBe('challenge')
    expect(bandOf(p, 71)).toBe('deny')
  })
})

describe('reachability', () => {
  /* The one mistake this editor can make silently: a profile whose attributes
     cannot add up to the threshold that is supposed to catch them. It reads as
     configured and enforces nothing. */
  it('names the bands a profile can never reach', () => {
    // One 5-point attribute cannot clear an allow ceiling of 30.
    const weak = profile({ enabled: ['battery'] })
    expect(ceilingOf(weak)).toBe(5)
    expect(unreachableBands(weak)).toEqual(['challenge', 'deny'])

    // Enough to challenge, never enough to deny.
    const mid = profile({ enabled: ['tpm', 'bios'] })
    expect(ceilingOf(mid)).toBe(60)
    expect(unreachableBands(mid)).toEqual(['deny'])
  })

  it('reports nothing unreachable when the ceiling clears every band', () => {
    const strong = profile({ enabled: ['tpm', 'bios', 'motherboard'] })
    expect(ceilingOf(strong)).toBe(90)
    expect(unreachableBands(strong)).toEqual([])
  })
})

describe('the seeded profiles', () => {
  it('only enable attributes that exist in the master', () => {
    for (const p of seedProfiles) {
      const missing = p.enabled.filter((id) => !byId(id))
      expect(`${p.id}: ${missing.join(',')}`).toBe(`${p.id}: `)
    }
  })

  it('only configure attributes that accept configuration', () => {
    for (const p of seedProfiles) {
      for (const id of Object.keys(p.config)) {
        expect(`${p.id}/${id}: ${Boolean(byId(id)?.config)}`).toBe(`${p.id}/${id}: true`)
      }
    }
  })

  it('leaves no risk profile with an unreachable band', () => {
    for (const p of seedProfiles.filter((x) => x.mode === 'risk')) {
      expect(`${p.id}: ${unreachableBands(p).join(',')}`).toBe(`${p.id}: `)
    }
  })
})
