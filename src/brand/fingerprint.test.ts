import { describe, expect, it } from 'vitest'

import {
  ATTRIBUTES,
  TIER_WEIGHT,
  byId,
  isRuleValue,
  scoreOf,
  seedProfiles,
  tierOf,
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
  reach: 'agent',
  registration: 'self',
  maxDevices: 3,
  roster: null,
  autoRegister: false,
  restrictionSet: true,
  usedIn: 0,
  ...over,
})

describe('the attribute master', () => {
  /* The master is curated, not transcribed, and the number is the whole point:
     one screen, no grouping, no filter. Let it drift past fifteen and the
     screen needs a filing scheme again — which is the thing that was taken out.
     This is the tripwire for that. */
  it('stays small enough not to need a filing scheme', () => {
    expect(ATTRIBUTES.length).toBeGreaterThanOrEqual(10)
    expect(ATTRIBUTES.length).toBeLessThanOrEqual(15)
  })

  /* Agentless is the default reach for a new profile, so a master where every
     attribute needed an agent would ship a picker with nothing pickable in it. */
  it('leaves most of the list readable without an agent', () => {
    const agentless = ATTRIBUTES.filter((a) => !a.needsAgent)
    expect(agentless.length).toBeGreaterThan(ATTRIBUTES.length / 2)
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
      /* A rule with one operator is a label, and a rule whose default is not in
         its own groups is a control that opens showing nothing selected. Both
         are easy to write and invisible until somebody opens the row. */
      if (a.config.kind === 'rule') {
        expect(a.config.operators.length).toBeGreaterThan(1)
        expect(a.config.groups.length).toBeGreaterThan(0)
        expect(a.config.operators).toContain(a.config.value.op)
        expect(a.config.groups.flatMap((g) => g.values)).toContain(a.config.value.value)
      }
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

  it('caps at 100, because a score is expressed on that scale', () => {
    const all = ATTRIBUTES.map((a) => a.id)
    expect(scoreOf(profile({ enabled: all }), all)).toBe(100)
  })
})

describe('weight tiers', () => {
  /* The profile picks from three where the sheet has four, so the mapping has
     to be total: every weight in the master must land on a tier, and every tier
     has to survive a round trip or a dropdown would silently rewrite a weight
     the moment it was opened. */
  it('lands every master weight on a tier', () => {
    for (const a of ATTRIBUTES) expect(['High', 'Medium', 'Low']).toContain(tierOf(a.weight))
  })

  it('round-trips a tier through its weight', () => {
    for (const tier of ['High', 'Medium', 'Low'] as const) {
      expect(tierOf(TIER_WEIGHT[tier])).toBe(tier)
    }
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

  /* Replaces the unreachable-band check, which went with the thresholds. The
     equivalent silent failure now is a stored rule that does not match the
     attribute's own vocabulary — an operator or a value that was renamed in the
     master and left behind in a seed. It renders as a select with nothing
     chosen, which reads as "not configured" rather than as a mistake. */
  it('store rule values the master still recognises', () => {
    for (const p of seedProfiles) {
      for (const [id, v] of Object.entries(p.config)) {
        if (!isRuleValue(v)) continue
        const c = byId(id)?.config
        expect(`${p.id}/${id}: ${c?.kind}`).toBe(`${p.id}/${id}: rule`)
        if (c?.kind !== 'rule') continue
        expect(c.operators).toContain(v.op)
        expect(c.groups.flatMap((g) => g.values)).toContain(v.value)
      }
    }
  })
})
