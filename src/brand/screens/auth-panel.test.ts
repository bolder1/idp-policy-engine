import { describe, expect, test } from 'vitest'

import { AUTH_METHODS } from '../methods'
import {
  LINK_SCREENS,
  backLabel,
  canServeAsDefault,
  clampVerify,
  familyRow,
  firstDefaultable,
  hasConfigPage,
  noBalanceWarning,
  pageKey,
  recoveryBlocker,
  resolveDefault,
  rowTarget,
  rulesUsingMethod,
  setupTargetFor,
  tokenButtonLabel,
  turnOffPlan,
} from './auth-panel'

/* The catalogue's second factors in one family — what the list counts a row by. */
const inside = (channel: string) =>
  AUTH_METHODS.filter((m) => m.use === 'second' && m.channel === channel)

const WITH_VARIANTS = ['SMS', 'Email', 'Authenticator App', 'miniOrange Authenticator', 'Hardware Token', 'Biometrics']
const OF_ONE = ['RSA Authenticator', 'Call Verification', 'Security Questions', 'Grid Pattern', 'Smart Cards']

describe('familyRow', () => {
  test('a family with variants opens the slider', () => {
    for (const channel of WITH_VARIANTS) {
      expect(familyRow(channel, inside(channel)), channel).toEqual({ opens: true })
    }
  })

  test('a family of one carries its only method on the row', () => {
    for (const channel of OF_ONE) {
      const row = familyRow(channel, inside(channel))
      expect(row.opens, channel).toBe(false)
      if (!row.opens) expect(row.method.channel, channel).toBe(channel)
    }
  })

  test('only the families of one that have settings say so', () => {
    const offering = OF_ONE.filter((channel) => {
      const row = familyRow(channel, inside(channel))
      return !row.opens && row.settings
    })
    expect(offering.sort()).toEqual(['Grid Pattern', 'Security Questions'])
  })

  test('RSA is set up from its row, because it is the one that ships unconfigured', () => {
    const row = familyRow('RSA Authenticator', inside('RSA Authenticator'))
    expect(row).toMatchObject({ opens: false, settings: false, method: { id: 'rsa', configured: false } })
  })

  test('a filter that leaves one method in a family narrows the row with it', () => {
    const row = familyRow('SMS', inside('SMS').slice(0, 1))
    /* SMS settings belong to the family, so they survive the narrowing. */
    expect(row).toMatchObject({ opens: false, settings: true })
  })
})

/* Biometrics became a family of two (owner, 21 Sep 2026): FIDO2 / Passkey,
   unchanged, and DigitalPersona. The family CONTAINS the old method rather than
   renaming it, because policies, the board and the person's own enrolment all
   name it by its id or its name. */
describe('Biometrics', () => {
  test('holds FIDO2 / Passkey and DigitalPersona, and opens like the other families of several', () => {
    expect(inside('Biometrics').map((m) => m.id)).toEqual(['fido2', 'digital-persona'])
    expect(rowTarget(familyRow('Biometrics', inside('Biometrics')))).toEqual({ kind: 'family' })
  })

  test('FIDO2 / Passkey keeps its id, name, state and settings', () => {
    const fido = AUTH_METHODS.find((m) => m.id === 'fido2')!
    expect(fido).toMatchObject({
      name: 'FIDO2 / Passkey',
      channel: 'Biometrics',
      tier: 'Phishing-resistant',
      configured: true,
      active: true,
      allowed: true,
    })
    /* Rules name methods by name, so a rule written for it still counts it. */
    expect(rulesUsingMethod(fido.name, [{ rules: [{ secondFactorMethods: ['FIDO2 / Passkey'] } as never] }])).toBe(1)
  })

  test('DigitalPersona ships off, with a switch rather than a Configure link', () => {
    const dp = AUTH_METHODS.find((m) => m.id === 'digital-persona')!
    expect(dp).toMatchObject({ name: 'DigitalPersona', use: 'second', configured: true, active: false, allowed: false })
  })

  test('a filter that leaves one of the two turns the row back into that method', () => {
    const [fido] = inside('Biometrics')
    expect(familyRow('Biometrics', [fido])).toMatchObject({ opens: false, settings: false, method: { id: 'fido2' } })
  })
})

describe('rowTarget', () => {
  const target = (channel: string) => rowTarget(familyRow(channel, inside(channel)))

  test('a family with variants opens onto the family', () => {
    for (const channel of WITH_VARIANTS) expect(target(channel), channel).toEqual({ kind: 'family' })
  })

  test('a family of one with settings opens onto them, so it needs no Settings button', () => {
    for (const channel of ['Security Questions', 'Grid Pattern']) {
      expect(target(channel), channel).toEqual({ kind: 'settings' })
    }
  })

  test('a family of one with nothing behind it goes nowhere, and ends in its switch', () => {
    for (const channel of ['Call Verification', 'Smart Cards']) {
      expect(target(channel), channel).toBeNull()
    }
  })

  test('RSA goes nowhere until it is set up, and then opens its configuration', () => {
    const [rsa] = inside('RSA Authenticator')
    expect(rowTarget(familyRow('RSA Authenticator', [rsa]))).toBeNull()
    const live = { ...rsa, configured: true }
    expect(rowTarget(familyRow('RSA Authenticator', [live]))).toEqual({ kind: 'setup', method: live })
  })

  test('only RSA has a configuration worth returning to', () => {
    expect(AUTH_METHODS.filter(hasConfigPage).map((m) => m.id)).toEqual(['rsa'])
  })
})

describe('pageKey', () => {
  test('a family and its settings page are different pages', () => {
    expect(pageKey({ kind: 'family', channel: 'Grid Pattern' })).not.toBe(
      pageKey({ kind: 'settings', channel: 'Grid Pattern' }),
    )
  })

  test('setup is keyed by method, so two setups in a row still swap', () => {
    expect(pageKey({ kind: 'setup', methodId: 'rsa' })).not.toBe(pageKey({ kind: 'setup', methodId: 'display-token' }))
  })
})

describe('Display Token setup', () => {
  const [display] = AUTH_METHODS.filter((m) => m.id === 'display-token')

  test('its Set up leaves for the Display tokens page; every other method opens its setup in the slider', () => {
    expect(setupTargetFor(display)).toEqual({ kind: 'screen', screen: { name: 'display-tokens' } })
    for (const m of AUTH_METHODS.filter((x) => x.id !== 'display-token')) {
      expect(setupTargetFor(m), m.id).toEqual({ kind: 'panel', page: { kind: 'setup', methodId: m.id } })
    }
  })

  test('the Assign hardware tokens setting lands on the Assignments tab', () => {
    expect(LINK_SCREENS['token-assign']).toEqual({ name: 'display-tokens', tab: 'assignments' })
  })

  test('the button says Set up until a token is assigned, then Manage tokens', () => {
    expect(tokenButtonLabel({ ...display, configured: false })).toBe('Set up')
    expect(tokenButtonLabel({ ...display, configured: true })).toBe('Manage tokens')
    expect(tokenButtonLabel({ id: 'yubikey', configured: true })).toBeNull()
  })

  test('it gains no Edit and no row target, because its button is the way in', () => {
    expect(hasConfigPage(display)).toBe(false)
    expect(rowTarget(familyRow('Hardware Token', [{ ...display, configured: true }]))).toEqual({ kind: 'settings' })
  })
})

describe('backLabel', () => {
  test('names the page underneath: a family or its settings', () => {
    expect(backLabel({ kind: 'family', channel: 'Hardware Token' })).toBe('Hardware Token')
    expect(backLabel({ kind: 'settings', channel: 'Grid Pattern' })).toBe('Grid Pattern')
  })

  test('shows no Back at the bottom of the stack or over a setup form', () => {
    expect(backLabel(null)).toBeNull()
    expect(backLabel({ kind: 'setup', methodId: 'rsa' })).toBeNull()
  })
})

/* --- The tenant default, and turning a method off -------------------------------- */

const byId = (id: string) => AUTH_METHODS.find((m) => m.id === id)!
const withMethod = (id: string, patch: Partial<(typeof AUTH_METHODS)[number]>) =>
  AUTH_METHODS.map((m) => (m.id === id ? { ...m, ...patch } : m))

describe('the tenant default', () => {
  test('starts on OTP over Email', () => {
    expect(firstDefaultable(AUTH_METHODS)).toBe('otp-email')
    expect(resolveDefault(undefined, AUTH_METHODS)).toBe('otp-email')
  })

  test('a method with nothing left to send cannot be the default', () => {
    const smsOn = withMethod('otp-sms', { active: true, allowed: true })
    expect(canServeAsDefault(smsOn.find((m) => m.id === 'otp-sms')!)).toBe(false)
    expect(firstDefaultable(withMethod('otp-email', { active: false }), undefined)).not.toBe('otp-sms')
  })

  test('turning off the default leaves nothing in the seed to take over', () => {
    expect(firstDefaultable(AUTH_METHODS, 'otp-email')).toBeNull()
  })

  test('a chosen default that can no longer run moves on; an explicit none stays none', () => {
    const emailLinkOn = withMethod('email-link', { active: true, allowed: true })
    const emailOff = emailLinkOn.map((m) => (m.id === 'otp-email' ? { ...m, active: false } : m))
    expect(resolveDefault('otp-email', emailOff)).toBe('email-link')
    expect(resolveDefault('otp-email', emailLinkOn)).toBe('otp-email')
    expect(resolveDefault(null, emailLinkOn)).toBeNull()
  })
})

describe('turnOffPlan', () => {
  const rule = (r: Record<string, unknown>) => ({ rules: [r as never] })

  test('counts rules that name the method in any of the four fields', () => {
    const policies = [
      rule({ secondFactorMethods: ['FIDO2 / Passkey'] }),
      rule({ methodChain: ['OTP over Email', 'FIDO2 / Passkey'] }),
      rule({ firstFactorMethod: 'Password' }),
    ]
    expect(rulesUsingMethod('FIDO2 / Passkey', policies)).toBe(2)
  })

  test('asks first when rules use it', () => {
    const fido = AUTH_METHODS.find((m) => m.id === 'fido2')!
    const plan = turnOffPlan(AUTH_METHODS, 'fido2', 'otp-email', [rule({ secondFactorMethods: [fido.name] })])
    expect(plan).toEqual({ rules: 1, wasDefault: false, replacement: null, confirm: true })
  })

  test('asks first when it is the default and nothing can take over, and not when something can', () => {
    expect(turnOffPlan(AUTH_METHODS, 'otp-email', 'otp-email', []).confirm).toBe(true)
    const withLink = withMethod('email-link', { active: true, allowed: true })
    expect(turnOffPlan(withLink, 'otp-email', 'otp-email', [])).toEqual({
      rules: 0,
      wasDefault: true,
      replacement: 'email-link',
      confirm: false,
    })
  })

  test('turns a method nobody uses off without asking', () => {
    expect(turnOffPlan(AUTH_METHODS, byId('kba').id, 'otp-email', []).confirm).toBe(false)
  })
})

describe('noBalanceWarning', () => {
  test('warns only when the balance is used up', () => {
    expect(noBalanceWarning(byId('otp-sms'))).toBe("No SMS transactions left. Codes won't send.")
    expect(noBalanceWarning(byId('otp-call'))).toBe("No call transactions left. Codes won't send.")
    expect(noBalanceWarning(byId('otp-email'))).toBeNull()
    expect(noBalanceWarning(byId('kba'))).toBeNull()
  })
})

describe('recoveryBlocker', () => {
  test('each option needs the methods it sends through', () => {
    expect(recoveryBlocker('kba', true, false)).toBeNull()
    expect(recoveryBlocker('email', true, false)).toMatch(/Alternate Email/)
    expect(recoveryBlocker('both', true, false)).toMatch(/Alternate Email/)
    expect(recoveryBlocker('both', false, true)).toMatch(/Security Questions/)
    expect(recoveryBlocker('kba', false, true)).toMatch(/Security Questions/)
    expect(recoveryBlocker('both', true, true)).toBeNull()
  })
})

describe('clampVerify', () => {
  test('keeps verify at or below the number of questions configured', () => {
    expect(clampVerify(2, 3, [1, 2, 3, 4, 5])).toBe(2)
    expect(clampVerify(5, 3, [1, 2, 3, 4, 5])).toBe(3)
    expect(clampVerify(4, 3, [1, 2, 5])).toBe(2)
  })
})
