import { describe, expect, it } from 'vitest'

import { rule } from '../data'
import { showcaseTenant } from '../fixtures'
import { AUTH_METHODS, type AuthMethod } from '../methods'
import { FACTOR_RANK, methodStrength, ruleFactor, type FactorStrength } from './factor-strength'

/* -----------------------------------------------------------------------------
   How strong a second factor is, as an attacker would rank it.

   Pinned by method, because the ranking is the claim: a push with number
   matching is standard, without it one tap approves a flood of prompts; an
   email code is below weak because the mailbox is where the password reset
   goes too.
   -------------------------------------------------------------------------- */

const byId = (id: string) => AUTH_METHODS.find((m) => m.id === id)!
const withNumberMatch = (on: boolean): AuthMethod => {
  const push = byId('mo-push')
  return { ...push, settings: push.settings?.map((s) => (s.id === 'number-match' && s.kind === 'toggle' ? { ...s, value: on } : s)) }
}

describe('methodStrength', () => {
  it.each<[string, FactorStrength]>([
    ['fido2', 'phishing-resistant'],
    ['passkey-primary', 'phishing-resistant'],
    ['digital-persona', 'phishing-resistant'],
    ['cac', 'phishing-resistant'],
    ['ms-push', 'standard'],
    ['mo-otp', 'standard'],
    ['mo-qr', 'standard'],
    ['google-auth', 'standard'],
    ['ms-auth', 'standard'],
    ['authy', 'standard'],
    ['rsa', 'standard'],
    ['display-token', 'standard'],
    ['yubikey', 'standard'],
    ['otp-sms', 'weak'],
    ['sms-link', 'weak'],
    ['otp-call', 'weak'],
    ['otp-email', 'below-weak'],
    ['email-link', 'below-weak'],
    ['otp-alt-email', 'below-weak'],
    ['otp-sms-email', 'below-weak'],
    ['kba', 'below-weak'],
    ['grid', 'below-weak'],
    ['magic-link', 'below-weak'],
  ])('ranks %s as %s', (id, want) => {
    expect(methodStrength(byId(id))).toBe(want)
  })

  it('ranks miniOrange Push by its number-matching setting', () => {
    expect(methodStrength(withNumberMatch(true))).toBe('standard')
    expect(methodStrength(withNumberMatch(false))).toBe('weak')
  })

  it('falls back by tier for a method the table does not name', () => {
    const invented: AuthMethod = { ...byId('google-auth'), id: 'invented-app', tier: 'Delivery-based' }
    expect(methodStrength(invented)).toBe('weak')
  })

  it('orders the ranks weakest first', () => {
    expect(FACTOR_RANK['below-weak']).toBeLessThan(FACTOR_RANK.weak)
    expect(FACTOR_RANK.weak).toBeLessThan(FACTOR_RANK.standard)
    expect(FACTOR_RANK.standard).toBeLessThan(FACTOR_RANK['phishing-resistant'])
  })
})

describe('ruleFactor', () => {
  const methods = showcaseTenant().methods
  const twoFactor = (over: Parameters<typeof rule>[0]) => rule({ decision: '2fa', ...over })

  it('has no second factor to rank unless the rule decides 2 factors', () => {
    expect(ruleFactor(rule({ name: 'In', decision: '1fa' }), methods)).toBeNull()
    expect(ruleFactor(rule({ name: 'Out', decision: 'deny' }), methods)).toBeNull()
  })

  it('takes the weakest of the methods a rule names', () => {
    expect(ruleFactor(twoFactor({ name: 'Key', secondFactor: 'specific', secondFactorMethods: ['FIDO2 / Passkey'] }), methods)).toBe('phishing-resistant')
    expect(
      ruleFactor(twoFactor({ name: 'Key or SMS', secondFactor: 'specific', secondFactorMethods: ['FIDO2 / Passkey', 'OTP over SMS'] }), methods),
    ).toBe('weak')
  })

  it('reads a push as standard on the showcase, where number matching is on', () => {
    expect(ruleFactor(twoFactor({ name: 'Push', secondFactor: 'specific', secondFactorMethods: ['miniOrange Push'] }), methods)).toBe('standard')
  })

  it('reads "any enabled method" as the weakest one on offer: below weak on the showcase, which has email codes on', () => {
    expect(ruleFactor(twoFactor({ name: 'Any', secondFactor: 'any' }), methods)).toBe('below-weak')
  })

  it('reads an empty or unknown method list as "any"', () => {
    expect(ruleFactor(twoFactor({ name: 'Nothing named', secondFactor: 'specific', secondFactorMethods: [] }), methods)).toBe('below-weak')
    expect(
      ruleFactor(twoFactor({ name: 'Key and a ghost', secondFactor: 'specific', secondFactorMethods: ['FIDO2 / Passkey', 'Carrier pigeon'] }), methods),
    ).toBe('below-weak')
  })

  it('reads a chain by its weakest step', () => {
    expect(ruleFactor(twoFactor({ name: 'Chain', secondFactor: 'chain', methodChain: ['FIDO2 / Passkey', 'Google Authenticator'] }), methods)).toBe('standard')
  })

  it('reads "preferred" as everything on offer plus the fallback', () => {
    const strongOnly = methods.map((m) => (m.use === 'second' && m.id !== 'fido2' ? { ...m, active: false } : m))
    expect(ruleFactor(twoFactor({ name: 'Preferred', secondFactor: 'preferred', preferredFallback: 'OTP over SMS' }), strongOnly)).toBe('weak')
    expect(ruleFactor(twoFactor({ name: 'Preferred', secondFactor: 'preferred' }), strongOnly)).toBe('phishing-resistant')
  })

  it('is below weak when no second factor can be delivered at all', () => {
    const none = methods.map((m) => ({ ...m, active: false }))
    expect(ruleFactor(twoFactor({ name: 'Any', secondFactor: 'any' }), none)).toBe('below-weak')
  })
})
