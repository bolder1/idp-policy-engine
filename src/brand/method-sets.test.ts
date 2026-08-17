import { describe, expect, it } from 'vitest'

import { methodSets } from './data'
import { AUTH_METHODS, DEFAULT_METHOD_ID, METHOD_TIERS, methodBlocker, methodById, methodByName } from './methods'

/* -----------------------------------------------------------------------------
   Sets reference methods by NAME, which is a string join with no compiler
   behind it. Renaming a method in the catalogue therefore breaks every set
   pointing at it — silently, because an unresolved name simply contributes
   nothing. That happened once already when the catalogue was rebuilt from the
   console: two sets kept referring to "WebAuthn / FIDO2 + Passkeys" after it
   became "FIDO2 / Passkey", and the UI showed a set that quietly held less
   than it claimed. These tests make that a build failure instead.
   -------------------------------------------------------------------------- */

describe('method sets resolve against the catalogue', () => {
  it('every name in every set is a real method', () => {
    for (const set of methodSets) {
      for (const name of set.methods) {
        expect(methodByName(name), `"${name}" in set "${set.name}" does not exist`).toBeDefined()
      }
    }
  })

  it('no set references a delivery variant instead of a method', () => {
    // "OTP over Email" is a method; "Email Link" is a method; but a set must
    // never point at something that is not in AUTH_METHODS at all.
    const names = new Set(AUTH_METHODS.map((m) => m.name))
    for (const set of methodSets) {
      for (const n of set.methods) expect(names.has(n), `${set.name} → ${n}`).toBe(true)
    }
  })

  it('no set is empty — an empty set cannot be satisfied by anyone', () => {
    for (const set of methodSets) expect(set.methods.length, set.name).toBeGreaterThan(0)
  })

  it('set ids and names are unique', () => {
    expect(new Set(methodSets.map((s) => s.id)).size).toBe(methodSets.length)
    expect(new Set(methodSets.map((s) => s.name)).size).toBe(methodSets.length)
  })
})

describe('the catalogue itself is coherent', () => {
  it('has unique ids and names', () => {
    expect(new Set(AUTH_METHODS.map((m) => m.id)).size).toBe(AUTH_METHODS.length)
    expect(new Set(AUTH_METHODS.map((m) => m.name)).size).toBe(AUTH_METHODS.length)
  })

  it('carries all 21 methods the console lists', () => {
    expect(AUTH_METHODS).toHaveLength(21)
  })

  it('every method belongs to a declared tier', () => {
    const tiers = new Set(METHOD_TIERS.map((t) => t.name))
    for (const m of AUTH_METHODS) expect(tiers.has(m.tier), `${m.name} → ${m.tier}`).toBe(true)
  })

  it('every tier has at least one method, so no empty heading renders', () => {
    for (const t of METHOD_TIERS) {
      expect(AUTH_METHODS.filter((m) => m.tier === t.name).length, t.name).toBeGreaterThan(0)
    }
  })

  it('the default method exists and can actually be a default', () => {
    const d = methodById(DEFAULT_METHOD_ID)
    expect(d).toBeDefined()
    // A default is applied before the user has enrolled in anything, so it can
    // only be a method that needs no prior enrolment.
    expect(d!.canBeDefault, `${d!.name} is the default but is not marked canBeDefault`).toBe(true)
    expect(methodBlocker(d!), `the default is unusable: ${methodBlocker(d!)}`).toBeNull()
  })
})

describe('methodBlocker reports the first thing to fix', () => {
  const base = AUTH_METHODS[0]

  it('configuration comes first — activating an unconfigured method does nothing', () => {
    expect(methodBlocker({ ...base, configured: false, active: true, allowed: true })).toBe(
      'Not configured yet',
    )
  })

  it('then activation', () => {
    expect(methodBlocker({ ...base, configured: true, active: false, allowed: true })).toBe(
      'Switched off for this tenant',
    )
  })

  it('then whether users are offered it', () => {
    expect(methodBlocker({ ...base, configured: true, active: true, allowed: false })).toBe(
      'Not offered to end users',
    )
  })

  it('and nothing at all when the method is usable', () => {
    expect(methodBlocker({ ...base, configured: true, active: true, allowed: true })).toBeNull()
  })
})

describe('the tenant is in a sane starting state', () => {
  it('ships at least one usable phishing-resistant method', () => {
    const usable = AUTH_METHODS.filter((m) => !methodBlocker(m) && m.tier === 'Phishing-resistant')
    expect(usable.length, 'no phishing-resistant method is available out of the box').toBeGreaterThan(0)
  })

  it('never marks a method active while it is unconfigured', () => {
    for (const m of AUTH_METHODS) {
      if (m.active) expect(m.configured, `${m.name} is active but unconfigured`).toBe(true)
    }
  })

  it('surfaces methods that are offered to users but switched off', () => {
    /* The console keeps "Allowed 2FA Methods" and the per-method Active state on
       two different pages, so they drift — a method can sit in the end-user
       picker while being off tenant-wide, and nothing says so. That state is
       kept in the seed precisely because it is real, and the consolidated page
       has to report it rather than quietly normalising it away. */
    const drifted = AUTH_METHODS.filter((m) => m.allowed && !m.active)
    expect(drifted.length, 'the seed should demonstrate this drift').toBeGreaterThan(0)
    for (const m of drifted) {
      expect(methodBlocker(m), `${m.name} drifts but reports no blocker`).toBe(
        'Switched off for this tenant',
      )
    }
  })
})
