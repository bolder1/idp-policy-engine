import { describe, expect, it } from 'vitest'

import { SEED_ENROLMENT, activateIn, enrolIssue, isEmail, isPhone, questionPlan, readyFor } from './user-methods'

describe('readyFor', () => {
  it('is ready when enrolled, when there is nothing to set up, or when a token is held', () => {
    expect(readyFor('otp-email', SEED_ENROLMENT)).toBe(true)
    expect(readyFor('otp-sms', SEED_ENROLMENT)).toBe(false)
    expect(readyFor('cac', SEED_ENROLMENT)).toBe(true)
    expect(readyFor('display-token', SEED_ENROLMENT)).toBe(false)
    expect(readyFor('display-token', SEED_ENROLMENT, 1)).toBe(true)
  })
})

describe('activateIn', () => {
  const e = { configured: ['otp-email', 'fido2'], active: 'otp-email', values: {} }

  it('switching one on makes it the one active method', () => {
    expect(activateIn(e, 'fido2', true, ['otp-email', 'fido2']).next.active).toBe('fido2')
  })

  it('switching off the active method hands over to another ready one', () => {
    const r = activateIn(e, 'otp-email', false, ['otp-email', 'fido2'])
    expect(r).toMatchObject({ handedTo: 'fido2', kept: false })
    expect(r.next.active).toBe('fido2')
  })

  it('never leaves nothing active once something is set up', () => {
    const r = activateIn(e, 'otp-email', false, ['otp-email'])
    expect(r).toMatchObject({ handedTo: null, kept: true })
    expect(r.next.active).toBe('otp-email')
  })
})

describe('what a person types', () => {
  it('checks email addresses and phone numbers', () => {
    expect(isEmail('priya@mo.com')).toBe(true)
    expect(isEmail('abc')).toBe(false)
    expect(isPhone('+91 98765 43210')).toBe(true)
    expect(isPhone('+1 (415) 555-0100')).toBe(true)
    expect(isPhone('12')).toBe(false)
    expect(isPhone('-------')).toBe(false)
  })

  it('blocks a bad email or phone with a message, and a blank one without', () => {
    expect(enrolIssue('email', { email: 'abc' })).toEqual({ field: 'email', message: 'Enter a valid email address.' })
    expect(enrolIssue('email', { email: '' })).toEqual({ field: 'email', message: '' })
    expect(enrolIssue('email', { email: 'priya@mo.com' })).toBeNull()
    expect(enrolIssue('phone', { phone: 'call me' })?.message).toBe('Enter a phone number with country code.')
    expect(enrolIssue('phone-and-email', { phone: '+1 415 555 0100', email: 'x' })?.field).toBe('email')
  })

  it('asks for as many security questions as the admin set, all different', () => {
    expect(questionPlan(3)).toEqual({ presets: 2, custom: 1 })
    expect(questionPlan(5)).toEqual({ presets: 4, custom: 1 })
    expect(questionPlan(10)).toEqual({ presets: 6, custom: 4 })

    const three = { q0: 'A?', a0: '1', q1: 'B?', a1: '2', q2: 'C?', a2: '3' }
    expect(enrolIssue('questions', three, 3)).toBeNull()
    expect(enrolIssue('questions', { ...three, q1: 'A?' }, 3)).toEqual({ field: 'q1', message: 'Pick different questions.' })
    expect(enrolIssue('questions', { ...three, q2: 'a?' }, 3)?.message).toBe('Pick different questions.')
    expect(enrolIssue('questions', three, 5)?.field).toBe('q3')
  })

  it('needs six digits from an authenticator app', () => {
    expect(enrolIssue('authenticator', { code: '12345' })).not.toBeNull()
    expect(enrolIssue('authenticator', { code: '123456' })).toBeNull()
    expect(enrolIssue('passkey', {})).toBeNull()
  })
})
