import { describe, expect, it } from 'vitest'

import {
  ALL_ATTRIBUTES,
  CATALOGUE,
  DEVICE_ATTRIBUTES,
  ITEM_NOUN,
  MODES,
  OS_ATTRIBUTES,
  REACHES,
  TIER_WEIGHT,
  VERSION_OPS,
  asksReach,
  attrOf,
  attributesFor,
  blockedAttributes,
  countLabel,
  describeProfile,
  isRuleValue,
  modeLabel,
  offeredAttributes,
  platformsNamed,
  pruneValues,
  rosterNeedsMac,
  scoreOf,
  seedProfiles,
  stepsFor,
  tierOf,
  valueLabel,
  withReach,
  type Attribute,
  type FingerprintProfile,
  type ProfileMode,
} from './fingerprint'

/* The attribute master is a transcription of somebody else's spreadsheet, and a
   transcription drifts silently: a weight typo or a lost category reads as a
   deliberate choice six months later. These assertions are the receipt. */

const profile = (over: Partial<FingerprintProfile> = {}): FingerprintProfile => ({
  id: 't',
  name: 'Test',
  mode: 'device',
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
    expect(OS_ATTRIBUTES.length).toBeGreaterThanOrEqual(4)
    expect(OS_ATTRIBUTES.length).toBeLessThanOrEqual(10)
    expect(DEVICE_ATTRIBUTES.length).toBeGreaterThan(20)
    expect(DEVICE_ATTRIBUTES.every((a: Attribute) => a.category)).toBe(true)
  })

  it('offers each kind its own catalogue', () => {
    expect(attributesFor('os')).toBe(OS_ATTRIBUTES)
    expect(attributesFor('device')).toBe(DEVICE_ATTRIBUTES)
  })

  /* A kind with no catalogue, or a catalogue with no card, is the failure the
     `Record` shape exists to make impossible. This asserts the third leg: that
     the two lists which have to agree — the cards a person picks from, and the
     catalogues those cards resolve to — actually do. */
  it('gives every kind a card and a catalogue', () => {
    expect(MODES.map((m) => m.id).sort()).toEqual(Object.keys(CATALOGUE).sort())
    expect(new Set(MODES.map((m) => m.tint)).size).toBe(MODES.length)
  })

  /* `device-type` is the one id in both catalogues, and the merged lookup that
     `attrOf` replaced always answered with the OS copy. That is invisible until
     something renders a device row's configuration, which the overview and the
     wizard's last step now both do. */
  it('resolves the shared id by kind, not by merge order', () => {
    expect(attrOf('os', 'device-type')?.config?.kind).toBe('choice')
    expect(attrOf('device', 'device-type')?.config).toBeUndefined()
    expect(attrOf('os', 'tpm')).toBeUndefined()
    expect(attrOf('device', 'os-windows')).toBeUndefined()
  })

  /* Agentless is the default reach for a new profile, so a master where every
     attribute needed an agent would ship a picker with nothing pickable in it. */
  it('leaves most of the list readable without an agent', () => {
    const agentless = ALL_ATTRIBUTES.filter((a: Attribute) => !a.needsAgent)
    expect(agentless.length).toBeGreaterThan(ALL_ATTRIBUTES.length / 2)
  })

  /* Per catalogue, not across the merge. `ATTRIBUTES` de-duplicated on the way
     in, so this assertion passed for years while one of the two `device-type`
     rows was unreachable — the list it checked had already thrown the
     collision away. */
  it('has unique ids within each catalogue, and no blank names', () => {
    for (const [mode, list] of Object.entries(CATALOGUE)) {
      expect(`${mode}: ${new Set(list.map((a) => a.id)).size}`).toBe(`${mode}: ${list.length}`)
    }
    expect(ALL_ATTRIBUTES.filter((a: Attribute) => !a.name.trim() || !a.purpose.trim())).toEqual([])
  })

  it('keeps every weight on the sheet 5-30 scale', () => {
    // 30 unique identifiers, 20 hardware specs, 10 browser/network, 5 config.
    for (const a of ALL_ATTRIBUTES) {
      expect(`${a.id}: ${[5, 10, 20, 30].includes(a.weight)}`).toBe(`${a.id}: true`)
    }
  })

  it('only offers configuration where there is something to configure', () => {
    for (const a of ALL_ATTRIBUTES) {
      if (!a.config) continue
      if (a.config.kind === 'choice') expect(a.config.options.length).toBeGreaterThan(1)
      if (a.config.kind === 'tolerance') expect(a.config.max).toBeGreaterThan(a.config.min)
      /* A rule with one operator is a label, and a rule whose default is not in
         its own groups is a control that opens showing nothing selected. Both
         are easy to write and invisible until somebody opens the row. */
      if (a.config.kind === 'rule') {
        const cfg = a.config
        expect(cfg.operators.length).toBeGreaterThan(1)
        expect(cfg.groups.length).toBeGreaterThan(0)
        expect(cfg.operators).toContain(cfg.value.op)
        expect(cfg.groups.flatMap((g) => g.values)).toContain(cfg.value.value)
      }
    }
  })
})

describe('scoring', () => {
  /* On `mac` and `tpm`, not on `os-windows`.

     These were written against `os-windows` on a device-mode fixture, and only
     passed because the lookup they used searched a merged list — a device
     profile scoring an attribute its own catalogue does not contain. The test
     was asserting the bug. */
  it('only counts attributes that are switched on', () => {
    const p = profile({ enabled: ['mac'] })
    // tpm is changed but not enabled, so it contributes nothing.
    expect(scoreOf(p, ['mac', 'tpm'])).toBe(attrOf('device', 'mac')!.weight)
  })

  it('respects a per-profile weight override', () => {
    const p = profile({ enabled: ['mac'], weights: { mac: 7 } })
    expect(scoreOf(p, ['mac'])).toBe(7)
  })

  it('caps at 100, because a score is expressed on that scale', () => {
    const all = DEVICE_ATTRIBUTES.map((a: Attribute) => a.id)
    /* The master's own weights no longer reach 100 — five attributes come to 85
       — so the cap has to be provoked rather than assumed. Overriding one
       weight past the ceiling is the case that matters anyway: the arithmetic
       is per-profile, and nothing stops somebody setting a weight of 200. */
    expect(scoreOf(profile({ enabled: all }), all)).toBeLessThanOrEqual(100)
    const heavy = profile({ enabled: all, weights: { mac: 200 } })
    expect(scoreOf(heavy, all)).toBe(100)
  })
})

describe('weight tiers', () => {
  /* The profile picks from three where the sheet has four, so the mapping has
     to be total: every weight in the master must land on a tier, and every tier
     has to survive a round trip or a dropdown would silently rewrite a weight
     the moment it was opened. */
  it('lands every master weight on a tier', () => {
    for (const a of ALL_ATTRIBUTES) expect(['High', 'Medium', 'Low']).toContain(tierOf(a.weight))
  })

  it('round-trips a tier through its weight', () => {
    for (const tier of ['High', 'Medium', 'Low'] as const) {
      expect(tierOf(TIER_WEIGHT[tier])).toBe(tier)
    }
  })
})

describe('the seeded profiles', () => {
  /* Against the profile's OWN catalogue, which is the assertion that would have
     caught `fp-byod`: it was a device-mode profile holding `os-android` and
     `os-ios`, and it passed for as long as this checked the merged list. */
  it('only enable attributes their own kind offers', () => {
    for (const p of seedProfiles) {
      const missing = p.enabled.filter((id) => !attrOf(p.mode, id))
      expect(`${p.id}: ${missing.join(',')}`).toBe(`${p.id}: `)
    }
  })

  it('only configure attributes that accept configuration', () => {
    for (const p of seedProfiles) {
      for (const id of Object.keys(p.config)) {
        expect(`${p.id}/${id}: ${Boolean(attrOf(p.mode, id)?.config)}`).toBe(`${p.id}/${id}: true`)
      }
    }
  })

  /* Every value has a row to belong to. A stored setting for an attribute the
     profile does not enable is one nobody can see, review or correct — and it
     comes back the moment somebody re-ticks the row. */
  it('store no value for an attribute they do not enable', () => {
    for (const p of seedProfiles) {
      const orphans = [...Object.keys(p.config), ...Object.keys(p.weights)].filter(
        (id) => !p.enabled.includes(id),
      )
      expect(`${p.id}: ${orphans.join(',')}`).toBe(`${p.id}: `)
    }
  })

  /* An agentless profile naming a signal only an agent can read is not
     misconfigured — it is inert. The value never arrives, so it never
     mismatches, and the profile reads as stronger than it is. */
  it('name nothing an agent would be needed for unless they have one', () => {
    for (const p of seedProfiles) {
      const unreadable = p.enabled.filter(
        (id) => attrOf(p.mode, id)?.needsAgent && p.reach !== 'agent',
      )
      expect(`${p.id}: ${unreadable.join(',')}`).toBe(`${p.id}: `)
    }
  })

  /* A roster is matched on MAC address. `fp-kiosk` shipped holding 24 machines
     and watching only the form factor, so the roster matched nothing and no
     surface said so. */
  it('read MAC wherever a roster decides who may in', () => {
    for (const p of seedProfiles) {
      expect(`${p.id}: ${rosterNeedsMac(p)}`).toBe(`${p.id}: false`)
      if (p.registration === 'pre-approved') expect(p.maxDevices).toBeNull()
    }
  })

  /* One of each, so every branch of the screen is reachable by opening
     something rather than only by creating it. */
  it('demonstrate both kinds and both reaches', () => {
    expect(new Set(seedProfiles.map((p) => p.mode))).toEqual(new Set(['os', 'device']))
    const devices = seedProfiles.filter((p) => p.mode === 'device')
    expect(new Set(devices.map((p) => p.reach))).toEqual(new Set(['agentless', 'agent']))
    expect(seedProfiles.some((p) => !p.restrictionSet)).toBe(true)
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
        const c = attrOf(p.mode, id)?.config
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


/* -----------------------------------------------------------------------------
   The agent question, and why only one kind is asked it.
   -------------------------------------------------------------------------- */

describe('what a kind can collect', () => {
  /* The reason the OS wizard is two steps and the device wizard is three, as an
     assertion rather than as a hardcoded number. Nothing in the OS catalogue
     needs an agent, so asking would be asking a question with no consequence
     attached to either answer. */
  it('never asks the OS kind, because the answer would change nothing', () => {
    expect(blockedAttributes('os', 'agentless')).toEqual([])
    expect(offeredAttributes('os', null)).toEqual(OS_ATTRIBUTES)
    expect(asksReach('os')).toBe(false)
    expect(asksReach('device')).toBe(true)
  })

  /* Both kinds take three steps, and the middle one is why this is a separate
     assertion from `asksReach`.

     It was `stepsFor('os')).toHaveLength(2)`, which tied the step count to the
     collector question — so "this kind is not asked about agents" and "this
     kind has fewer steps" were one fact. They are not: the middle step is the
     DEVICES step, and how a machine enrols is a question both kinds have to
     answer. What still depends on `asksReach` is whether the collector cards
     render inside it. */
  it('takes three steps either way, and names the last after what it holds', () => {
    expect(stepsFor('os')).toEqual(['Profile', 'Devices', 'Requirements'])
    expect(stepsFor('device')).toEqual(['Profile', 'Devices', 'Attributes'])
    for (const m of MODES) {
      expect(stepsFor(m.id).at(-1)?.toLowerCase()).toBe(ITEM_NOUN[m.id].many)
    }
  })

  it('partitions the device catalogue at every reach', () => {
    for (const reach of ['agentless', 'agent', null] as const) {
      const offered = offeredAttributes('device', reach)
      const blocked = blockedAttributes('device', reach)
      expect(offered.length + blocked.length).toBe(DEVICE_ATTRIBUTES.length)
      expect(offered.filter((a) => blocked.includes(a))).toEqual([])
    }
    expect(blockedAttributes('device', 'agent')).toEqual([])
    expect(blockedAttributes('device', null)).toEqual(blockedAttributes('device', 'agentless'))
  })

  it('gives every reach a card', () => {
    expect(REACHES.map((r) => r.id).sort()).toEqual(['agent', 'agentless'])
  })
})

describe('withReach — the one writer', () => {
  const agentProfile = profile({
    reach: 'agent',
    enabled: ['mac', 'browser'],
    config: { browser: 'Family only' },
    weights: { mac: 30 },
    registration: 'pre-approved',
    maxDevices: null,
  })

  it('drops what can no longer arrive, and its settings with it', () => {
    const next = withReach(agentProfile, 'agentless')
    expect(next.enabled).toEqual(['browser'])
    /* The half the inline version missed: it filtered `enabled` and left the
       weight behind, so re-adding MAC restored a tier nobody re-approved. */
    expect(next.weights).toEqual({})
    expect(next.config).toEqual({ browser: 'Family only' })
  })

  it('forces the registration branch agentless cannot support', () => {
    const next = withReach(agentProfile, 'agentless')
    expect(next.registration).toBe('self')
    expect(next.roster).toBeNull()
    expect(next.maxDevices).toBe(3)
  })

  it('adds nothing on the way up — an agent makes rows available, not chosen', () => {
    const back = withReach(withReach(agentProfile, 'agentless'), 'agent')
    expect(back.enabled).toEqual(['browser'])
  })
})

describe('pruneValues', () => {
  it('drops values with no row to belong to, and keeps the rest', () => {
    const p = profile({
      enabled: ['browser'],
      config: { browser: 'Family only', ip: 'Subnet' },
      weights: { browser: 30, mac: 30 },
    })
    const next = pruneValues(p)
    expect(next.config).toEqual({ browser: 'Family only' })
    expect(next.weights).toEqual({ browser: 30 })
  })
})

describe('what the page says about a profile', () => {
  /* Every kind of config prints, and the untouched case prints the master's own
     default rather than nothing — an attribute nobody has touched IS at its
     default, and a blank would say it was unset. */
  it('states a stored value as text, for every kind of control', () => {
    expect(valueLabel(attrOf('os', 'os-windows')!, { op: 'gte', value: '11' })).toBe('≥ 11')
    expect(valueLabel(attrOf('os', 'os-windows')!, undefined)).toBe('≥ 10')
    expect(valueLabel(attrOf('os', 'device-type')!, 'Mobile')).toBe('Mobile')
    expect(valueLabel(attrOf('device', 'time')!, 5)).toBe('5 hours')
    expect(valueLabel(attrOf('device', 'mac')!, undefined)).toBe('')
  })

  /* The sharpest thing the overview says. An OS profile holding only a form
     factor checks no platform at all — a Mac signing in satisfies every
     condition on it — and the old subtitle printed that as "1 attribute". */
  it('names the platforms an OS profile checks, and none when there are none', () => {
    expect(platformsNamed(profile({ mode: 'os', enabled: ['device-type', 'os-windows'] }))).toEqual([
      'Windows',
    ])
    expect(platformsNamed(profile({ mode: 'os', enabled: ['os-android', 'os-ios'] }))).toEqual([
      'Android',
      'iOS',
    ])
    expect(platformsNamed(profile({ mode: 'os', enabled: ['device-type'] }))).toEqual([])
    expect(platformsNamed(profile({ mode: 'device', enabled: ['mac'] }))).toEqual([])
  })

  it('counts in the noun the kind actually uses', () => {
    expect(countLabel('os', 1)).toBe('1 requirement')
    expect(countLabel('os', 2)).toBe('2 requirements')
    expect(countLabel('device', 1)).toBe('1 attribute')
  })

  it('names the reach only where it is asked, and enrolment only once answered', () => {
    const os = describeProfile(
      profile({ mode: 'os', enabled: ['os-windows'], restrictionSet: false }),
    )
    expect(os).toBe('OS and version · 1 requirement')

    const dev = describeProfile(profile({ mode: 'device', reach: 'agentless', enabled: ['browser'] }))
    expect(dev).toBe(
      'Device attributes · Agentless · 1 attribute · Users register their own devices',
    )
  })

  /* The create dialog and every other surface used to hold different strings
     for the same kind — "Attribute based" while being created, "Attribute
     match" ever after. One list, and this is the tripwire. */
  it('labels a kind the same way wherever it is named', () => {
    for (const m of MODES) expect(modeLabel({ mode: m.id as ProfileMode })).toBe(m.label)
  })
})
