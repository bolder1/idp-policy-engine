import { describe, expect, it } from 'vitest'

import { AUTH_METHODS } from './methods'
import { FAMILIES, allSettings } from './mfa-settings'
import {
  FAMILY_OF_CHANNEL,
  MFA_METHOD_ID,
  familyForChannel,
  familySettingsFor,
  methodSettingsFor,
  mfaMethodFor,
  settingKey,
  siblingsOf,
  SUPERSEDED_CONFIG,
  SUPERSEDED_LEGACY,
} from './mfa-join'
import { configFor } from './method-config'

/* The join is the kind of code that fails silently: a lookup that misses returns
   undefined and the setting just does not render, which looks like "this method
   has no settings" rather than like a bug. These tests are the alarm. */

describe('the key survives every collision the data contains', () => {
  it('separates the same setting id under two families', () => {
    // otpSettings() is invoked for SMS and again for Email, so this id is real
    // in both places. Keyed by id alone they would share one value.
    expect(settingKey('family', 'sms', 'otp-length')).not.toBe(
      settingKey('family', 'email', 'otp-length'),
    )
  })

  it('separates a family from a method that shares its id', () => {
    // 'kba', 'grid' and 'rsa' are each used as both a family id and a method id.
    for (const id of ['kba', 'grid', 'rsa']) {
      expect(settingKey('family', id, 'x')).not.toBe(settingKey('method', id, 'x'))
    }
  })

  it('gives every setting in the sheet a distinct key', () => {
    const keys = allSettings().map((s) =>
      s.methodId ? settingKey('method', s.methodId, s.setting.id) : settingKey('family', s.familyId, s.setting.id),
    )
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('every catalogue method reaches the sheet', () => {
  it('maps all 11 channels to a real family', () => {
    for (const m of AUTH_METHODS) {
      expect(FAMILY_OF_CHANNEL[m.channel], `no family for channel ${m.channel}`).toBeDefined()
      expect(familyForChannel(m.channel), `family missing for ${m.channel}`).toBeDefined()
    }
  })

  it('maps all 21 methods to a real MfaMethod', () => {
    for (const m of AUTH_METHODS) {
      expect(mfaMethodFor(m.id), `${m.name} (${m.id}) does not reach the sheet`).toBeDefined()
    }
  })

  it('has no alias pointing at nothing', () => {
    // A stale alias is worse than none: it silently overrides a working match.
    const real = new Set(FAMILIES.flatMap((f) => f.methods.map((x) => x.id)))
    for (const [v5, target] of Object.entries(MFA_METHOD_ID)) {
      expect(real.has(target), `alias ${v5} -> ${target} points at no MfaMethod`).toBe(true)
      expect(AUTH_METHODS.some((m) => m.id === v5), `alias ${v5} is not a catalogue id`).toBe(true)
    }
    for (const channel of Object.keys(FAMILY_OF_CHANNEL)) {
      expect(AUTH_METHODS.some((m) => m.channel === channel), `${channel} is not a channel`).toBe(true)
    }
  })
})

describe('siblings are read off the catalogue, not the sheet', () => {
  it('never names a method that has no row', () => {
    // The sheet carries Vasco OTP and Digital Persona; the catalogue does not.
    const rows = new Set(AUTH_METHODS.map((m) => m.name))
    for (const m of AUTH_METHODS) {
      for (const s of siblingsOf(m)) {
        expect(rows.has(s.name), `${m.name} names an unreachable sibling: ${s.name}`).toBe(true)
      }
    }
  })

  it('excludes the method itself', () => {
    for (const m of AUTH_METHODS) {
      expect(siblingsOf(m).some((s) => s.id === m.id)).toBe(false)
    }
  })

  it('claims siblings only where a family setting actually exists', () => {
    // If a family has shared settings, the drawer says so and names the others.
    // SMS is the case that matters: three methods, one OTP length between them.
    const sms = AUTH_METHODS.find((m) => m.id === 'otp-sms')!
    // Contains, not equals — this asserts the shared pair reaches SMS, and an
    // exact list would fail every time the family legitimately gains a setting.
    expect(familySettingsFor(sms.channel).map((s) => s.id)).toEqual(
      expect.arrayContaining(['otp-length', 'otp-validity']),
    )
    expect(siblingsOf(sms).map((s) => s.id).sort()).toEqual(['otp-sms-email', 'sms-link'])
  })
})

describe('nothing is shown twice and nothing is lost', () => {
  it('suppresses only ids that actually exist', () => {
    for (const [id, ids] of Object.entries(SUPERSEDED_CONFIG)) {
      const fields = configFor(id)?.fields ?? []
      for (const f of ids) {
        expect(fields.some((x) => x.id === f), `${id}: no config field '${f}' to suppress`).toBe(true)
      }
    }
    for (const [id, ids] of Object.entries(SUPERSEDED_LEGACY)) {
      const own = AUTH_METHODS.find((m) => m.id === id)?.settings ?? []
      for (const s of ids) {
        expect(own.some((x) => x.id === s), `${id}: no legacy setting '${s}' to suppress`).toBe(true)
      }
    }
  })

  it('replaces every suppressed setting rather than deleting it', () => {
    // The rule for the suppression tables: the sheet must offer an equivalent.
    // Count, not identity — the labels are reworded between the two models.
    for (const id of Object.keys(SUPERSEDED_CONFIG)) {
      const m = AUTH_METHODS.find((x) => x.id === id)!
      const replacements = familySettingsFor(m.channel).length + methodSettingsFor(id).length
      expect(replacements, `${id} suppresses config fields but gains nothing`).toBeGreaterThan(0)
    }
    for (const id of Object.keys(SUPERSEDED_LEGACY)) {
      const m = AUTH_METHODS.find((x) => x.id === id)!
      const replacements = familySettingsFor(m.channel).length + methodSettingsFor(id).length
      expect(replacements, `${id} suppresses its own settings but gains nothing`).toBeGreaterThan(0)
    }
  })

  it('leaves no duplicate label in a single drawer', () => {
    // The actual thing the tables exist to prevent: one panel showing the same
    // control twice because two models both describe it.
    for (const m of AUTH_METHODS) {
      const config = (configFor(m.id)?.fields ?? [])
        .filter((f) => !(SUPERSEDED_CONFIG[m.id] ?? []).includes(f.id))
        .map((f) => f.label)
      const legacy = (m.settings ?? [])
        .filter((s) => !(SUPERSEDED_LEGACY[m.id] ?? []).includes(s.id))
        .map((s) => s.label)
      const sheet = [...familySettingsFor(m.channel), ...methodSettingsFor(m.id)].map((s) => s.label)
      const all = [...config, ...legacy, ...sheet].map((l) => l.toLowerCase())
      const dupes = all.filter((l, i) => all.indexOf(l) !== i)
      expect(dupes, `${m.name} shows a control twice: ${dupes.join(', ')}`).toEqual([])
    }
  })
})

/* Read off the shipping console's "MFA Enrollment for Users → Advanced Options"
   on 2026-08-18, which is the authority for these. The spreadsheet was short on
   both families, so these assertions exist to stop the model drifting back to
   it. */
describe('the model matches the shipping console', () => {
  const settingsOf = (channel: string) => familySettingsFor(channel)
  const find = (channel: string, id: string) => settingsOf(channel).find((s) => s.id === id)

  it('offers the five grid sizes the product ships, not three', () => {
    const s = find('Grid Pattern', 'grid-size')
    expect(s?.field.kind).toBe('choice')
    expect(s?.field.kind === 'choice' && s.field.options).toEqual(['4x4', '5x5', '6x6', '7x7', '8x8'])
  })

  it('starts pattern length at 4, where the product starts it', () => {
    const s = find('Grid Pattern', 'grid-length')
    expect(s?.field.kind === 'number' && s.field.min).toBe(4)
    expect(s?.field.kind === 'number' && s.field.max).toBe(8)
  })

  it('models the clickable grid, which the sheet omitted entirely', () => {
    const s = find('Grid Pattern', 'grid-click')
    expect(s, 'Grid Pattern Clickable is in the console and must be modelled').toBeDefined()
    expect(s?.field.kind === 'choice' && s.field.options).toEqual(['Enabled', 'Disabled'])
  })

  it('pairs the setup-instructions switch with the app it writes them for', () => {
    // The console has both; a switch that sends instructions without saying
    // which app they are for cannot actually produce them.
    expect(find('Authenticator App', 'qr-email')).toBeDefined()
    const t = find('Authenticator App', 'auth-type')
    expect(t?.field.kind === 'choice' && t.field.options).toEqual([
      'Google Authenticator',
      'Microsoft Authenticator',
      'Authy Authenticator',
      'miniOrange Authenticator',
    ])
  })

  it('still shows no control twice anywhere', () => {
    // grid-click now exists in both models; the suppression table must cover it.
    const grid = AUTH_METHODS.find((m) => m.id === 'grid')!
    expect(SUPERSEDED_LEGACY.grid).toContain('grid-click')
    expect((grid.settings ?? []).some((s) => s.id === 'grid-click')).toBe(true)
  })
})
