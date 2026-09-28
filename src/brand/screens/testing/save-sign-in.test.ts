import { describe, expect, it } from 'vitest'

import type { AccessDecision } from '../../data'
import { showcaseTenantHrmsOn } from '../../fixtures'
import { envOf, resolveSignIn } from '../tenant-resolver'
import { INCOMPLETE, currentDraft, defaultSaveDraft, saveIssue, savedSignInOf } from './save-sign-in'
import { defaultForm, factsOf, type SignInForm } from './sign-in-form'

/* The save form's starting answers and its checks (Spec B §3.5, check 15:
   "Kavya Menon on HRMS", Expected Allow with 2FA, Level Note). */

/* These scenes read HRMS deciding, so they run on the tenant once it is
   turned on; the seed opens with HRMS Inactive (Phase 4). */
const t = showcaseTenantHrmsOn()
const env = envOf(t)
const form = defaultForm(t.directory.people, t.apps, '2026-09-28')
const draft = (f: SignInForm = form, shown: AccessDecision | null = '2fa', saved: readonly { name: string }[] = t.savedSignIns) =>
  defaultSaveDraft(f, shown, t.directory.people, t.apps, saved)

describe('where the save form starts', () => {
  it('names the person and the application, expects what is shown, and blocks nothing', () => {
    expect(draft()).toEqual({ name: 'Kavya Menon on HRMS', expected: '2fa', level: 'note' })
  })

  it('makes the name unique against the saved ones', () => {
    expect(draft(form, '2fa', [...t.savedSignIns, { name: 'Kavya Menon on HRMS' }]).name).toBe('Kavya Menon on HRMS 2')
  })

  it("expects nothing for a sign-in that can't be told", () => {
    expect(draft(form, null).expected).toBeNull()
  })
})

describe('while the sign-in changes under the open form', () => {
  it('follows the screen until the admin answers, then keeps their answer', () => {
    /* Opened on Kavya (2FA), then the person changed to Aisha, whom HRMS is not for. */
    const aisha: SignInForm = { ...form, personId: 'u-sales-1' }
    const aishaShown = resolveSignIn(t.policies, factsOf(aisha, t.zones).facts, env).decision
    expect(aishaShown).toBe('1fa')
    expect(currentDraft(draft(aisha, aishaShown), {})).toEqual({ name: 'Aisha Khan on HRMS 2', expected: '1fa', level: 'note' })
    expect(currentDraft(draft(aisha, aishaShown), { name: 'Front desk', level: 'must-pass' })).toEqual({
      name: 'Front desk',
      expected: aishaShown,
      level: 'must-pass',
    })
  })
})

describe('when Save is off', () => {
  it('says what is missing, one thing at a time', () => {
    expect(saveIssue({ ...form, appId: null }, draft(), t.savedSignIns)).toBe(INCOMPLETE)
    expect(saveIssue(form, { ...draft(), name: '  ' }, t.savedSignIns)).toBe('Enter a name')
    expect(saveIssue(form, { ...draft(), name: 'kavya menon in the office' }, t.savedSignIns)).toBe('A saved sign-in with this name already exists')
    expect(saveIssue(form, draft(form, null), t.savedSignIns)).toBe('Choose the expected decision')
    expect(saveIssue(form, draft(), t.savedSignIns)).toBeNull()
  })
})

describe('what is saved', () => {
  it('is the facts, which get the decision it was saved expecting', () => {
    const s = savedSignInOf(form, draft(), t.zones, 'Jaspreet Toor', '2026-09-26T09:30:00+05:30')
    expect(s).toMatchObject({ name: 'Kavya Menon on HRMS', expected: '2fa', level: 'note', savedBy: 'Jaspreet Toor' })
    expect(s.facts).toMatchObject({ personId: 'u-hr-1', appId: 'hrms', network: { address: '203.0.113.24', source: 'stated' } })
    const r = resolveSignIn(t.policies, s.facts, env)
    expect([r.status, r.decision]).toEqual(['decided', s.expected])
  })

  it('refuses a draft that has not passed its checks', () => {
    expect(() => savedSignInOf(form, draft(form, null), t.zones, 'Jaspreet Toor', '')).toThrow()
  })
})
