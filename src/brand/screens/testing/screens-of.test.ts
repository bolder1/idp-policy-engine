import { describe, expect, it } from 'vitest'

import type { Policy, Rule } from '../../data'
import { showcaseTenantHrmsOn } from '../../fixtures'
import type { AuthMethod } from '../../methods'
import { envOf, resolveSignIn } from '../tenant-resolver'
import type { EnrolKind } from '../../user-methods'
import { asksForCode, maskEmail, promptText, screensOf, stepLabel, type ScreensContext } from './screens-of'
import { defaultBoardForm, factsOf, typedAddressPatch, type SignInForm } from './sign-in-form'

/* The pages a person would see, for the showcase scenes (Spec A §8: "the Seg
   reads Password | Google Authenticator", the HRMS deny message exactly). */

/* These scenes read HRMS deciding, so they run on the tenant once it is
   turned on; the seed opens with HRMS Inactive (Phase 4). */
const t = showcaseTenantHrmsOn()
const env = envOf(t)
const TODAY = '2026-09-28'
const policy = (id: string) => t.policies.find((p) => p.id === id)!
const hrms = policy('sc-hrms-office')
const person = (id: string | null) => t.directory.people.find((u) => u.id === id) ?? null
const ctx = (form: SignInForm, over: Partial<ScreensContext> = {}): ScreensContext => ({
  policies: t.policies,
  methods: t.methods,
  defaultMethodId: undefined,
  person: person(form.personId),
  ...over,
})
const board = (p: Policy, patch: Partial<SignInForm> = {}) => ({ ...defaultBoardForm(p, t.directory.people, t.apps, TODAY), ...patch })
const pages = (form: SignInForm, over: Partial<ScreensContext> = {}) =>
  screensOf(resolveSignIn(t.policies, factsOf(form, t.zones).facts, env, over.substitute ? { substitute: over.substitute } : {}), ctx(form, over))

describe('HR in the office', () => {
  const [only, ...rest] = pages(board(hrms))

  it('is a password, then the code from Google Authenticator', () => {
    expect(rest).toEqual([])
    expect([only.decision, only.policyName, only.ruleName]).toEqual(['2fa', 'HRMS access from corporate offices', 'In a corporate office'])
    expect(only.steps.map(stepLabel)).toEqual(['Password', 'Google Authenticator'])
    expect(only.steps[0]).toEqual({ kind: 'password', username: 'kavya.m@mo.com' })
    expect(only.steps[1]).toMatchObject({ kind: 'second', name: 'Google Authenticator', prompt: 'authenticator', masked: 'k••••@mo.com', rememberDays: null })
  })
})

describe('refused', () => {
  it('shows the last row’s own message, word for word', () => {
    const [only] = pages(board(hrms, typedAddressPatch('192.0.2.50')))
    expect(only.steps).toEqual([{ kind: 'deny', message: 'HRMS opens only from a corporate office. Contact IT if you need access from elsewhere.' }])
    expect(only.ruleName).toBe('Nothing else matched')
  })
})

describe('somebody the policy is not for', () => {
  it('gets the Global Default’s password page', () => {
    const [only] = pages(board(hrms, { personId: 'u-sales-1' }))
    expect([only.policyName, only.ruleName]).toEqual(['Global Default Policy', 'Corporate device, where we operate'])
    expect(only.steps.map(stepLabel)).toEqual(['Password'])
  })
})

describe('a sign-in that could go two ways', () => {
  it('has one set of pages per decision, in rule order', () => {
    const compliance = policy('sc-device-compliance')
    const android14 = factsOf(board(compliance, { device: { kind: 'preset', id: 'android-14' } }), t.zones).facts.device!
    const form = board(compliance, { personId: 'priya', appId: 'outlook', device: { kind: 'custom', facts: { ...android14, integrity: undefined } } })
    expect(pages(form).map((s) => [s.decision, s.ruleName])).toEqual([
      ['1fa', 'Compliant device'],
      ['deny', 'Nothing else matched'],
    ])
  })
})

describe('the second method', () => {
  const form = board(hrms)
  /* Rule 1 as it is — 2FA with Google Authenticator — but for `r`. */
  const as = (r: Partial<Rule>) => pages(form, { substitute: { ...hrms, rules: [{ ...hrms.rules[0], ...r }] } })[0].steps[1]

  it('says a named method nobody can be offered is not available, under its own name', () => {
    expect(as({ secondFactor: 'specific', secondFactorMethods: ['No such method'] })).toMatchObject({ method: null, name: 'No such method', prompt: 'none' })
  })

  it('offers the tenant default for any method, else the first that can be offered', () => {
    const email = t.methods.find((m) => m.id === 'otp-email')!
    expect(as({ secondFactor: 'any', secondFactorMethods: undefined })).toMatchObject({ name: email.name, prompt: 'email' })
    const off: AuthMethod[] = t.methods.map((m) => (m.id === 'otp-email' ? { ...m, active: false } : m))
    const p: Policy = { ...hrms, rules: [{ ...hrms.rules[0], secondFactor: 'any', secondFactorMethods: undefined }] }
    const second = pages(form, { substitute: p, methods: off })[0].steps[1]
    expect(second).toMatchObject({ kind: 'second' })
    expect(second.kind === 'second' ? second.method?.id : null).not.toBe('otp-email')
  })

  it('offers to remember the device for the rule’s days, unless it asks every time', () => {
    expect(as({ rememberMfa: true })).toMatchObject({ rememberDays: 30 })
    expect(as({ rememberMfa: true, rememberDays: 7 })).toMatchObject({ rememberDays: 7 })
    expect(as({ rememberMfa: true, forceMfaEachLogin: true })).toMatchObject({ rememberDays: null })
  })

  it('opens on a passkey when the rule names one as the first factor', () => {
    const p: Policy = { ...hrms, rules: [{ ...hrms.rules[0], firstFactor: 'Specific', firstFactorMethod: 'Passkeys' }] }
    expect(pages(form, { substitute: p })[0].steps[0]).toEqual({ kind: 'first-method', method: 'Passkeys', prompt: 'passkey' })
  })
})

describe('what each page asks', () => {
  const method = t.methods[0]
  const step = (prompt: EnrolKind, name = 'Google Authenticator') =>
    promptText({ kind: 'second', method, name, prompt, masked: 'k••••@mo.com', rememberDays: null })

  it('says each second factor the way a sign-in page does', () => {
    expect(step('authenticator')).toBe('Enter the code from Google Authenticator')
    expect(step('push-app', 'miniOrange Push')).toBe('Approve the request in miniOrange Push')
    expect(step('email')).toBe('Enter the code sent to k••••@mo.com')
    expect(step('phone')).toBe('Enter the code sent to your phone')
    expect(step('phone-and-email')).toBe('Enter the code sent to your phone and k••••@mo.com')
    expect(step('questions')).toBe('Answer your security questions')
    expect(step('token')).toBe('Enter the code from your token')
    /* A method the catalogue does not know: a sentence a sign-in page says, never its bare name. */
    expect(step('none', 'Hand scanner')).toBe('Continue with Hand scanner')
  })

  it('says a method nobody can be offered is not available', () => {
    expect(promptText({ kind: 'second', method: null, name: 'Duo Push', prompt: 'none', masked: '', rememberDays: null })).toBe('Duo Push is not available')
  })

  it('asks for a code only where the person types one', () => {
    const [only] = pages(board(hrms))
    expect(only.steps.map(asksForCode)).toEqual([false, true])
  })
})

describe('an incomplete sign-in', () => {
  it('has no pages', () => {
    expect(pages(board(hrms, { personId: null }))).toEqual([])
  })
})

describe('a masked address', () => {
  it('keeps the first character and the domain', () => {
    expect(maskEmail('kavya.m@mo.com')).toBe('k••••@mo.com')
    expect(maskEmail('')).toBe('')
  })
})
