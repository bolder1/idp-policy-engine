import { describe, expect, it } from 'vitest'

import {
  ATTRIBUTES,
  MATCH_ATTRIBUTES,
  RISK_ATTRIBUTES,
  attributesFor,
  VERSION_OPS,
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
  it('keeps the match catalogue small enough not to need a filing scheme', () => {
    /* The ceiling is what this test is for, and it now applies to ONE of the two
       lists. Attribute match offers five — a form factor and a version per
       platform — and the moment that list needs scrolling it needs grouping,
       which is the thing the flat picker exists to avoid.

       The risk catalogue is deliberately the opposite: thirty-eight weak signals
       that only mean something summed, filed into five categories with a rail to
       navigate them. Holding it to the same bound would be holding it to the
       wrong screen's constraint. */
    expect(MATCH_ATTRIBUTES.length).toBeGreaterThanOrEqual(4)
    expect(MATCH_ATTRIBUTES.length).toBeLessThanOrEqual(10)
    expect(RISK_ATTRIBUTES.length).toBeGreaterThan(20)
    expect(RISK_ATTRIBUTES.every((a) => a.category)).toBe(true)
  })

  it('offers each mode its own catalogue', () => {
    expect(attributesFor('match')).toBe(MATCH_ATTRIBUTES)
    expect(attributesFor('risk')).toBe(RISK_ATTRIBUTES)
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
    const p = profile({ enabled: ['os-windows'] })
    // device-type is changed but not enabled, so it contributes nothing.
    expect(scoreOf(p, ['os-windows', 'device-type'])).toBe(byId('os-windows')!.weight)
  })

  it('respects a per-profile weight override', () => {
    const p = profile({ enabled: ['os-windows'], weights: { 'os-windows': 7 } })
    expect(scoreOf(p, ['os-windows'])).toBe(7)
  })

  it('caps at 100, because a score is expressed on that scale', () => {
    const all = ATTRIBUTES.map((a) => a.id)
    /* The master's own weights no longer reach 100 — five attributes come to 85
       — so the cap has to be provoked rather than assumed. Overriding one
       weight past the ceiling is the case that matters anyway: the arithmetic
       is per-profile, and nothing stops somebody setting a weight of 200. */
    expect(scoreOf(profile({ enabled: all }), all)).toBeLessThanOrEqual(100)
    const heavy = profile({ enabled: all, weights: { 'os-windows': 200 } })
    expect(scoreOf(heavy, all)).toBe(100)
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
        /* Two kinds carry an operator now. `rule` picks its value from the
           attribute's own list, so both halves are checkable; `version` takes
           a typed string, so only the operator can be — the whole point of the
           field is that the value is not enumerated. */
        expect(`${p.id}/${id}: ${c?.kind}`).toMatch(/: (rule|version)$/)
        if (c?.kind === 'rule') {
          expect(c.operators).toContain(v.op)
          expect(c.groups.flatMap((g) => g.values)).toContain(v.value)
        }
        if (c?.kind === 'version') {
          /* By id, not by label — the operator is stored as `gte` and shown as
             ≥, so a seed holding the old wordy string would render as the
             fallback and look deliberate. */
          expect(VERSION_OPS.map((o) => o.id)).toContain(v.op)
          expect(v.value.trim()).not.toBe('')
        }
      }
    }
  })
})
