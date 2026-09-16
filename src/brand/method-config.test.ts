import { describe, expect, it } from 'vitest'

import { AUTH_METHODS, methodBlocker } from './methods'
import {
  SETUP_WITHOUT_FORM,
  configFor,
  fieldIssue,
  invalidFields,
  missingFields,
  setField,
  storeSecrets,
  type ConfigField,
} from './method-config'

/* -----------------------------------------------------------------------------
   `methodBlocker()` has always reported "Not configured yet" as the first thing
   to fix, and until now nothing in the product could fix it — the flag was
   readable and unreachable. These tests hold the two properties that make the
   configuration form worth trusting: every method that can be blocked on
   configuration has a form to unblock it, and a form only reports itself
   complete when the fields that actually gate the integration are filled.
   -------------------------------------------------------------------------- */

/* Scoped to SECOND FACTORS, which is what these invariants were always about.

   The catalogue gained the three ways a session can start — password, passkeys,
   magic link — and none of them has the things asserted below: no provider
   integration to configure, no enrolment ceremony to walk a person through, no
   delivery family, and no row on the MFA sheet. Password in particular is on
   for everyone and configured by nobody.

   Asserting over the whole array would have forced a form and a shape to be
   invented for each of them just to keep a test quiet, which is the test
   changing the product.

   Display Token is out for the same reason: its setup is adding and assigning
   tokens, not a form, so a schema for it would be invented to satisfy this. */
const FACTORS = AUTH_METHODS.filter(
  (m) => m.use === 'second' && !(SETUP_WITHOUT_FORM as readonly string[]).includes(m.id),
)

describe('every blockable method can be configured', () => {
  it('offers a form for every method in the catalogue', () => {
    const without = FACTORS.filter((m) => configFor(m.id) === null).map((m) => `${m.name} (${m.id})`)
    expect(without, 'these methods report "Not configured yet" with nowhere to go').toEqual([])
  })

  it('never ships a form with no fields', () => {
    for (const m of FACTORS) {
      const c = configFor(m.id)
      expect(c!.fields.length, `${m.name} has an empty configuration form`).toBeGreaterThan(0)
    }
  })

  it('explains what each form connects to', () => {
    for (const m of FACTORS) {
      expect(configFor(m.id)!.blurb.length, `${m.name} has no blurb`).toBeGreaterThan(20)
    }
  })

  it('gives every field a unique id within its form', () => {
    for (const m of FACTORS) {
      const ids = configFor(m.id)!.fields.map((f) => f.id)
      expect(new Set(ids).size, `${m.name} has duplicate field ids`).toBe(ids.length)
    }
  })

  it('bounds every number field so the guidance is the control', () => {
    for (const m of FACTORS) {
      for (const f of configFor(m.id)!.fields) {
        if (f.kind !== 'number') continue
        expect(f.min, `${m.name}.${f.id}`).toBeLessThan(f.max)
        expect(f.value, `${m.name}.${f.id} default is out of bounds`).toBeGreaterThanOrEqual(f.min)
        expect(f.value).toBeLessThanOrEqual(f.max)
      }
    }
  })

  it('never marks a select or radio default that is not one of its options', () => {
    for (const m of FACTORS) {
      for (const f of configFor(m.id)!.fields) {
        /* An empty select is allowed only where it says what to pick. */
        if (f.kind === 'select' && f.value === '') expect(f.placeholder, `${m.name}.${f.id}`).toBeTruthy()
        else if (f.kind === 'select') expect(f.options, `${m.name}.${f.id}`).toContain(f.value)
        if (f.kind === 'radio') expect(f.options.map((o) => o.value), `${m.name}.${f.id}`).toContain(f.value)
      }
    }
  })
})

describe('completeness', () => {
  /* RSA is unconfigured in the seed, so its client id and access key are
     genuinely blank — the honest starting state for a provider nobody has
     connected. Display Token was the subject until its validation-server form
     was removed (its setup is the tokens page); `otp-sms` is NOT a valid subject
     either way, because it is configured, so its form is correctly full and its
     key correctly held. */
  it('reports a form with blank required fields as incomplete', () => {
    const missing = missingFields(configFor('rsa')!.fields)
    expect(missing.map((f) => f.id)).toEqual(['client', 'secret'])
    expect(missing.every((f) => f.kind === 'text' || f.kind === 'secret')).toBe(true)
  })

  it('clears once the required fields are filled', () => {
    let fields = configFor('rsa')!.fields
    for (const f of missingFields(fields)) fields = setField(fields, f.id, 'filled')
    expect(missingFields(fields)).toEqual([])
  })

  it('treats whitespace as blank — a space is not a client id', () => {
    let fields = configFor('rsa')!.fields
    for (const f of missingFields(fields)) fields = setField(fields, f.id, '   ')
    expect(missingFields(fields).length).toBeGreaterThan(0)
  })

  it('does not require optional fields', () => {
    // FIDO2 ships complete: the relying party defaults to the tenant domain.
    expect(missingFields(configFor('fido2')!.fields)).toEqual([])
  })

  it('leaves every other field untouched when one changes', () => {
    const before = configFor('fido2')!.fields
    const after = setField(before, 'rpId', 'example.test')
    expect(after.find((f) => f.id === 'rpId')!.value).toBe('example.test')
    for (const f of after) {
      if (f.id === 'rpId') continue
      expect(f).toEqual(before.find((b) => b.id === f.id))
    }
  })

  it('keeps the field kind intact through an edit', () => {
    const fields = setField(configFor('otp-sms')!.fields, 'expiry', 12)
    const expiry = fields.find((f) => f.id === 'expiry') as Extract<ConfigField, { kind: 'number' }>
    expect(expiry.kind).toBe('number')
    expect(expiry.value).toBe(12)
  })
})

describe('Display Token', () => {
  it('has no validation-server form, and Yubikey keeps its own', () => {
    expect(configFor('display-token')).toBeNull()
    expect(configFor('yubikey')!.fields.map((f) => f.id)).toContain('server')
  })
})

describe('the seed is coherent with the blocker ladder', () => {
  /* The sound direction is one way only.

     "Configured" cannot be true while a credential the integration needs is
     blank — that would be the console claiming a gateway is wired up when it
     has no API key. The converse is not a defect: a TOTP app has nothing to
     connect, so its form is complete from the first render and "not configured
     yet" simply means nobody has opened it and saved. Asserting the converse
     was my mistake, and it failed on exactly those methods. */
  it('never marks a method configured while a required value is blank', () => {
    for (const m of FACTORS) {
      if (!m.configured) continue
      expect(
        missingFields(configFor(m.id)!.fields).map((f) => f.label),
        `${m.name} is marked configured but its form is missing required values`,
      ).toEqual([])
    }
  })

  it('never leaves a blank required field on a method the console calls ready', () => {
    for (const m of FACTORS) {
      if (missingFields(configFor(m.id)!.fields).length === 0) continue
      expect(m.configured, `${m.name} has blank required fields but is marked configured`).toBe(false)
      expect(methodBlocker(m), `${m.name}`).toBe('Not configured yet')
    }
  })

  it('holds a stored secret rather than demanding it again', () => {
    /* A live gateway's key is saved and not readable back. Rendering it as an
       empty required field would report a working integration as broken, and
       the natural fix — retyping a key you may not have — is how one gets taken
       down while being inspected. */
    const live = configFor('otp-sms')!.fields.find((f) => f.id === 'key')
    expect(live?.kind).toBe('secret')
    expect(live && live.kind === 'secret' && live.stored).toBe(true)
    expect(missingFields(configFor('otp-sms')!.fields)).toEqual([])
  })
})

describe('the live state and what a saved form holds', () => {
  it('builds from the configured state it is given, not only the catalogue', () => {
    /* RSA set up this session is configured in the store; its form must not reopen with its required fields blank. */
    expect(missingFields(configFor('rsa')!.fields).length).toBe(2)
    expect(missingFields(configFor('rsa', true)!.fields)).toEqual([])
  })

  it('has no "Select" option that could be saved as a value', () => {
    for (const f of configFor('rsa')!.fields) {
      if (f.kind === 'select') expect(f.options, f.id).not.toContain('Select')
    }
  })

  it('rejects a base URL that is not https', () => {
    const server = (value: string) => ({ kind: 'text' as const, id: 'server', label: 'Default Base URL', value })
    expect(fieldIssue(server('abc'))).toBe('Enter a URL starting with https://')
    expect(fieldIssue(server('http://rsa.acme.com'))).toBe('Enter a URL starting with https://')
    expect(fieldIssue(server('https://rsa-server:5555'))).toBeNull()
    expect(fieldIssue(server('https://api.yubico.com/wsapi/2.0/verify'))).toBeNull()
    expect(fieldIssue(server(''))).toBeNull()
    let fields = configFor('rsa', true)!.fields
    fields = setField(fields, 'server', 'abc')
    expect(invalidFields(fields).map((f) => f.id)).toEqual(['server'])
  })

  it('holds a typed secret once saved, so the form reopens with it stored', () => {
    let fields = configFor('rsa')!.fields
    fields = setField(fields, 'client', 'acme')
    fields = setField(fields, 'secret', 'key-123')
    const saved = storeSecrets(fields)
    const secret = saved.find((f) => f.id === 'secret')
    expect(secret).toMatchObject({ kind: 'secret', value: '', stored: true })
    expect(missingFields(saved)).toEqual([])
  })
})
