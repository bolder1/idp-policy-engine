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
  alwaysOn,
  asksReach,
  attrOf,
  attributesFor,
  categoriesFor,
  withAlwaysOn,
  blockedAttributes,
  blankProfile,
  countLabel,
  dayLabel,
  invalidVersion,
  nameIssue,
  profileChangeParts,
  profileIssue,
  profileReview,
  rosterFromCsv,
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
import { CHECK_BRAND } from './logos/check-brands'

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
  /* This asserted the requirements list stayed under ten, on the grounds that a
     list which needs scrolling needs grouping — and grouping was the thing the
     flat picker existed to avoid.

     The list is thirteen and it is grouped. That is not the tripwire failing,
     it is the premise changing: the catalogue grew a browser floor per family,
     two posture checks and two client versions, and at that size the filing IS
     the readable shape. What the test protects now is the property that made
     the old bound worth having — that the list is never a heap. Under ten, flat
     and unfiled; over it, filed, with every row in a category the picker
     actually offers.

     The ceiling stays, further out. Twenty is not a design claim, it is a
     tripwire: past it somebody should be asked whether a fourteenth family of
     requirement really belongs in one profile. */
  it('keeps each catalogue in a shape its picker can draw', () => {
    expect(OS_ATTRIBUTES.length).toBeGreaterThanOrEqual(4)
    expect(OS_ATTRIBUTES.length).toBeLessThanOrEqual(20)
    expect(DEVICE_ATTRIBUTES.length).toBeGreaterThan(20)
    expect(DEVICE_ATTRIBUTES.every((a: Attribute) => a.category)).toBe(true)
    // Filed now, and the picker's category filter is the reason it has to be:
    // an uncategorised row falls into "Everything else" and cannot be found.
    expect(OS_ATTRIBUTES.every((a: Attribute) => a.category)).toBe(true)
  })

  /* The bug a single shared `CATEGORIES` list produced, asserted from both ends.

     The picker counts a category's rows and labels an empty one "needs an
     agent". That sentence is true of Security on an agentless risk profile and
     nonsense for Behaviour on a requirements profile, which has no behaviour
     rows and never will — so a category offered for a catalogue it does not
     describe is not untidy, it is a false explanation in a dropdown.

     Both directions matter. Every row files under a category its own catalogue
     offers, and every category its catalogue offers has at least one row. */
  it('gives each catalogue a filing scheme that fits it exactly', () => {
    for (const mode of ['os', 'device'] as ProfileMode[]) {
      const cats = categoriesFor(mode)
      const ids = new Set(cats.map((c) => c.id))
      const used = new Set(attributesFor(mode).map((a) => a.category))

      for (const a of attributesFor(mode)) {
        expect(ids.has(a.category!)).toBe(true)
      }
      for (const c of cats) {
        expect(used.has(c.id)).toBe(true)
      }
      // Named once each, or the filter shows the same option twice.
      expect(cats.length).toBe(ids.size)
    }
  })

  /* `platformsNamed` says which operating systems a profile pins, and it used to
     find them by asking which rows compared a version. Ten rows do that now —
     four browsers and two miniOrange clients joined the four platforms — so the
     old reading would have called Chrome and the authenticator app platforms. */
  it('counts only operating systems as platforms', () => {
    const named = platformsNamed({
      ...({} as FingerprintProfile),
      mode: 'os',
      enabled: ['os-windows', 'browser-chrome', 'mo-authenticator'],
    })
    expect(named).toEqual(['Windows'])
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

  /* The DEVICES step is the device kind's alone, and this assertion is where
     that boundary is written down — it has moved twice.

     It holds two questions: what the collector can read, and how machines
     enrol. The first belongs to the device kind by construction, since nothing
     in the OS catalogue carries `needsAgent`. The second applies to both, which
     is why it was briefly asked of both — giving the OS kind a middle step of
     three rows and a caveat explaining why one of them was unavailable, which
     is a step that exists to be short.

     So enrolment is asked in the wizard only where it has a neighbour to depend
     on, and an OS profile answers it from the detail page's one Edit. The last
     step is named after what that kind actually holds, so the ladder reads
     "Requirements" on one and "Attributes" on the other. */
  it('gives the collector step to the kind that is asked one', () => {
    expect(stepsFor('os')).toEqual(['Profile', 'Checks'])
    expect(stepsFor('device')).toEqual(['Profile', 'Devices', 'Signals'])
    for (const m of MODES) {
      expect(stepsFor(m.id).at(-1)?.toLowerCase()).toBe(ITEM_NOUN[m.id].many)
      expect(stepsFor(m.id).includes('Devices')).toBe(asksReach(m.id))
    }
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
    expect(countLabel('os', 1)).toBe('1 check')
    expect(countLabel('os', 2)).toBe('2 checks')
    expect(countLabel('device', 1)).toBe('1 signal')
  })

  /* The create dialog and every other surface used to hold different strings
     for the same kind — "Attribute based" while being created, "Attribute
     match" ever after. One list, and this is the tripwire. */
  it('labels a kind the same way wherever it is named', () => {
    for (const m of MODES) expect(modeLabel({ mode: m.id as ProfileMode })).toBe(m.label)
  })
})

/* -----------------------------------------------------------------------------
   The signals a profile cannot switch off.
   -------------------------------------------------------------------------- */

describe('always-on attributes', () => {
  /* Only the device kind has any. An OS-and-version profile is a set of
     conditions somebody states outright, and a condition nobody wrote is not a
     stricter rule — it is a rule that does not say what it does. */
  it('belong to the device kind only', () => {
    expect(alwaysOn('os')).toEqual([])
    expect(alwaysOn('device').length).toBeGreaterThan(0)
  })

  /* They are what the REQUEST carries, so an agentless profile must be able to
     collect every one of them. An unswitchable attribute that needs an agent
     would be a profile nobody can make work and nobody can fix. */
  it('never need an agent, or they could not be unswitchable', () => {
    const needy = alwaysOn('device').filter((a) => a.needsAgent)
    expect(needy.map((a) => a.id)).toEqual([])
    const offered = offeredAttributes('device', 'agentless')
    for (const a of alwaysOn('device')) expect(offered).toContain(a)
  })

  /* The picker ticks these whether or not they are stored, so a seed that omits
     one reads on screen as enabled and in the model as not — and `scoreOf`
     believes the model. */
  it('are enabled on every profile of their kind', () => {
    for (const p of seedProfiles) {
      const missing = alwaysOn(p.mode)
        .map((a) => a.id)
        .filter((id) => !p.enabled.includes(id))
      expect(`${p.id}: ${missing.join(',')}`).toBe(`${p.id}: `)
    }
  })

  it('lead the list, and are never duplicated into it', () => {
    const next = withAlwaysOn('device', ['mac', 'browser'])
    expect(next.slice(0, alwaysOn('device').length)).toEqual(alwaysOn('device').map((a) => a.id))
    expect(new Set(next).size).toBe(next.length)
    expect(next).toContain('mac')
  })
})

/* The brand marks are keyed by check id, so an id that drifts would quietly
   swap a logo for the generic glyph. Every key names a real check, and every
   brand-named requirement has a mark. */
describe('check brand marks', () => {
  it('keys only real check ids', () => {
    const ids = new Set(ALL_ATTRIBUTES.map((a) => a.id))
    expect(Object.keys(CHECK_BRAND).filter((id) => !ids.has(id))).toEqual([])
  })

  it('gives every OS, browser and client version check a brand', () => {
    const versions = OS_ATTRIBUTES.filter((a) => a.config?.kind === 'version').map((a) => a.id)
    expect(versions.filter((id) => !(id in CHECK_BRAND))).toEqual([])
  })

  it('leaves the checks that are not about a brand alone', () => {
    expect(['device-type', 'integrity', 'screen-lock'].filter((id) => id in CHECK_BRAND)).toEqual([])
  })
})

/* What stops a profile from saving. The create drawer, the save bar and the
   leave dialog all read this one answer, so each rule is pinned here. */
describe('what stops a profile from saving', () => {
  const seed = (id: string) => {
    const p = seedProfiles.find((x) => x.id === id)
    if (!p) throw new Error(`no seed ${id}`)
    return p
  }

  it('lets every seeded profile save as it is', () => {
    for (const p of seedProfiles) {
      const others = seedProfiles.filter((x) => x.id !== p.id).map((x) => x.name)
      expect([p.id, profileIssue(p, others)]).toEqual([p.id, null])
    }
  })

  it('refuses a blank name and a name another profile has, ignoring case and spaces', () => {
    expect(nameIssue('   ', [])).toBe('Enter a profile name.')
    expect(nameIssue(' corporate MANAGED ', ['Corporate managed'])).toBe('A profile with this name already exists.')
    expect(nameIssue('Corporate managed (copy)', ['Corporate managed'])).toBeNull()
  })

  it('refuses a health profile with no checks, but not a trusted device holding only its always-on signals', () => {
    expect(profileIssue({ ...seed('fp-corp'), enabled: [], config: {} }, [])).toBe('Add at least one check.')
    expect(profileIssue(profile({ enabled: withAlwaysOn('device', []) }), [])).toBeNull()
  })

  it('refuses a typed version that is blank or not a version', () => {
    const browsers = seed('fp-browser-current')
    const withChrome = (value: string) => ({
      ...browsers,
      config: { ...browsers.config, 'browser-chrome': { op: 'gte', value } },
    })
    expect(invalidVersion(withChrome('131.0.6778.86'))).toBeUndefined()
    expect(invalidVersion(withChrome(''))?.id).toBe('browser-chrome')
    expect(profileIssue(withChrome('latest!!'), [])).toBe('Enter a version for Chrome.')
    expect(profileIssue(withChrome(' 131 '), [])).toBeNull()
  })

  it('refuses a pre-approved profile with no roster, or one that does not read MAC', () => {
    const kiosk = seed('fp-kiosk')
    expect(profileIssue({ ...kiosk, roster: null }, [])).toBe('Upload a device roster.')
    expect(profileIssue({ ...kiosk, enabled: kiosk.enabled.filter((id) => id !== 'mac') }, [])).toBe(
      'Add MAC address to match the roster.',
    )
  })
})

/* The seed both new-profile flows start from: the name-first page and the
   wizard's draft. */
describe('a blank profile', () => {
  it('holds the always-on signals, runs on the defaults, and leaves the id to the caller', () => {
    const p = blankProfile('Laptops', 'device')
    expect(p.id).toBe('')
    expect(p.enabled).toEqual(alwaysOn('device').map((a) => a.id))
    expect([p.reach, p.registration, p.maxDevices, p.roster, p.autoRegister, p.restrictionSet]).toEqual([
      'agentless',
      'self',
      3,
      null,
      false,
      false,
    ])
    expect(blankProfile('Laptops', 'os').enabled).toEqual([])
  })

  it('is valid as a trusted device once named, and needs a check as a health profile', () => {
    expect(profileIssue(blankProfile('Laptops', 'device'), [])).toBeNull()
    expect(profileIssue(blankProfile('Laptops', 'os'), [])).toBe('Add at least one check.')
    expect(profileIssue(blankProfile('Laptops', 'device'), ['laptops'])).toBe('A profile with this name already exists.')
  })
})

describe('a roster read from a CSV', () => {
  const now = new Date(2026, 8, 15)

  it('counts one device per line and skips a header', () => {
    const csv = 'device,email,mac\r\nKiosk 1,a@acme.com,00:1A:2B:3C:4D:5E\n\nKiosk 2,b@acme.com,00-1A-2B-3C-4D-5F\n'
    expect(rosterFromCsv('floor.csv', csv, now)).toEqual({ fileName: 'floor.csv', rows: 2, uploadedAt: '15 Sep 2026' })
  })

  it('keeps a first line that is already a device', () => {
    expect(rosterFromCsv('a.csv', 'Kiosk 1,a@acme.com,00:1A:2B:3C:4D:5E', now).rows).toBe(1)
    expect(rosterFromCsv('empty.csv', '\n\n', now).rows).toBe(0)
    expect(dayLabel(new Date(2026, 0, 3))).toBe('3 Jan 2026')
  })
})

describe('what changed, for the save bar and Review changes', () => {
  const corp = seedProfiles.find((p) => p.id === 'fp-corp') as FingerprintProfile

  it('has nothing to say about an unchanged profile', () => {
    expect(profileReview(corp, corp)).toEqual([])
    expect(profileChangeParts(corp, corp)).toEqual([])
  })

  it('names each change with its saved and new value', () => {
    const next: FingerprintProfile = {
      ...corp,
      name: 'Corporate laptops',
      enabled: ['device-type', 'browser-chrome'],
      config: { 'device-type': 'Laptop', 'browser-chrome': { op: 'gte', value: '120' } },
    }
    expect(profileReview(corp, next)).toEqual([
      { label: 'Name', before: 'Corporate managed', after: 'Corporate laptops' },
      { label: 'Checks: added Chrome version', before: '', after: '≥ 120' },
      { label: 'Checks: removed Windows OS version', before: '≥ 10', after: '' },
    ])
    expect(profileChangeParts(corp, next)).toEqual(['Name', '1 check added', '1 check removed'])

    const tuned = { ...corp, config: { ...corp.config, 'os-windows': { op: 'gte', value: '11' } } }
    expect(profileReview(corp, tuned)).toEqual([{ label: 'Windows OS version', before: '≥ 10', after: '≥ 11' }])
    expect(profileChangeParts(corp, tuned)).toEqual(['Values changed'])
  })

  /* The profile page counts a draft as unsaved only when this has a row, so a
     stored difference the page never shows is not a change. */
  it('has nothing to say when a stored value differs but what the page shows does not', () => {
    const kiosk = seedProfiles.find((p) => p.id === 'fp-kiosk') as FingerprintProfile
    expect(profileReview(kiosk, { ...kiosk, weights: { ...kiosk.weights, mac: 35 } })).toEqual([])
    expect(profileReview(corp, { ...corp, config: { ...corp.config, 'os-windows': { value: '10', op: 'gte' } } })).toEqual([])
  })

  it('reviews a trusted device by weight and enrolment', () => {
    const kiosk = seedProfiles.find((p) => p.id === 'fp-kiosk') as FingerprintProfile
    const next: FingerprintProfile = { ...kiosk, weights: { mac: 10 }, autoRegister: true, roster: null }
    expect(profileReview(kiosk, next)).toEqual([
      { label: 'Register silently on first sign-in', before: 'Off', after: 'On' },
      { label: 'Approved device roster', before: 'kiosks-floor-3.csv, 24 devices', after: '' },
      { label: 'MAC address weight', before: 'High weight', after: 'Low weight' },
    ])
    expect(profileChangeParts(kiosk, next)).toEqual(['How devices enrol', 'Weights changed'])
  })
})
