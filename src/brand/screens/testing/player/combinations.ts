import type { AccessDecision } from '../../../data'
import { AUTH_METHODS, RULE_METHODS, type AuthMethod } from '../../../methods'
import { enrolShapeFor } from '../../../user-methods'
import { maskEmail, type ScreenStep, type SignInScreens } from '../screens-of'
import { playOf, type End, type Play } from './script'

/* -----------------------------------------------------------------------------
   Every sign-in screens-of.ts can hand the player, as data: each first factor
   it names × each second factor it can ask for (every method in the
   catalogue, one it does not know, one nobody can be offered) × remembering
   the device or not × each decision. The player's tests walk all of them;
   one film per row of this list must play and end where its decision says.
   -------------------------------------------------------------------------- */

export const PERSON = { name: 'Kavya Menon', email: 'kavya.m@mo.com' }

export interface Combination {
  key: string
  screens: SignInScreens
  /** What the film must end on. */
  end: End
  /** What each step plays as, for the matrix. */
  plays: string[]
}

type FirstStep = Extract<ScreenStep, { kind: 'password' | 'first-method' }>

/** The first factors a rule can give: the password, and every method its picker names in place of one. */
export function firstFactors(): { key: string; step: FirstStep }[] {
  const named = [...new Set(['Passkeys', 'Magic link', ...RULE_METHODS, 'Duo Push'])]
  return [
    { key: 'password', step: { kind: 'password', username: PERSON.email } },
    ...named.map((method) => ({
      key: `first:${method}`,
      step: { kind: 'first-method', method, prompt: /passkey/i.test(method) ? 'passkey' : /magic link/i.test(method) ? 'link' : 'other' } as FirstStep,
    })),
  ]
}

/** A second method the catalogue does not hold: it plays as what it asks for. */
export const NEW_METHOD: AuthMethod = { id: 'new-method', use: 'second', name: 'Duo Push', tier: 'App-based', channel: 'Duo', description: '', configured: true, active: true, allowed: true }

/** The second factors: every one in the catalogue, one it does not know, and one nobody can be offered. */
export function secondFactors(rememberDays: number | null): { key: string; step: Extract<ScreenStep, { kind: 'second' }> }[] {
  const masked = maskEmail(PERSON.email)
  const of = (m: AuthMethod) => ({ kind: 'second' as const, method: m, name: m.name, prompt: enrolShapeFor(m.id).kind, masked, rememberDays })
  return [
    ...AUTH_METHODS.filter((m) => m.use === 'second').map((m) => ({ key: m.id, step: of(m) })),
    { key: 'new-method:push-app', step: { ...of(NEW_METHOD), prompt: 'push-app' as const } },
    { key: 'new-method:none', step: { ...of({ ...NEW_METHOD, name: 'Hand scanner' }), prompt: 'none' as const } },
    { key: 'unavailable', step: { kind: 'second', method: null, name: 'Duo Push', prompt: 'none', masked, rememberDays } },
  ]
}

const screens = (decision: AccessDecision, steps: ScreenStep[]): SignInScreens => ({ decision, policyName: 'Policy', ruleName: 'Rule', steps, person: PERSON })

const playName = (s: ScreenStep): string => {
  switch (s.kind) {
    case 'password':
      return 'password'
    case 'first-method': {
      if (s.prompt !== 'other') return s.prompt === 'link' ? 'magic-link' : 'passkey'
      const m = AUTH_METHODS.find((x) => x.name === s.method)
      return `first ${m ? playOf(m, enrolShapeFor(m.id).kind) : 'generic'}`
    }
    case 'second':
      return playOf(s.method, s.prompt) satisfies Play
    case 'deny':
      return 'deny'
  }
}

/** Every combination, keyed "decision/first/second/remember". */
export function combinations(): Combination[] {
  const out: Combination[] = []
  for (const first of firstFactors()) {
    out.push({ key: `1fa/${first.key}`, screens: screens('1fa', [first.step]), end: 'signed-in', plays: [playName(first.step), 'signed-in'] })
    for (const days of [null, 7] as const) {
      for (const second of secondFactors(days)) {
        const stuck = second.step.method === null
        out.push({
          key: `2fa/${first.key}/${second.key}${days ? '/remember' : ''}`,
          screens: screens('2fa', [first.step, second.step]),
          end: stuck ? 'stuck' : 'signed-in',
          plays: [playName(first.step), playName(second.step), stuck ? 'not-available' : 'signed-in'],
        })
      }
    }
  }
  out.push({ key: 'deny/verbatim', screens: screens('deny', [{ kind: 'deny', message: 'HRMS opens only from a corporate office. Contact IT if you need access from elsewhere.' }]), end: 'denied', plays: ['username', 'denied'] })
  out.push({
    key: 'deny/longest',
    screens: screens('deny', [{ kind: 'deny', message: 'x'.repeat(40).replace(/x/g, 'Blocked ').slice(0, 200) }]),
    end: 'denied',
    plays: ['username', 'denied'],
  })
  return out
}
