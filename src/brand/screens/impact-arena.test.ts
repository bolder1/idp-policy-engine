import { describe, expect, it } from 'vitest'

import { audienceOf, blankPolicy, card, cond, fallbackRule, rule, when, type Policy } from '../data'
import { showcaseTenant } from '../fixtures'
import { ANON_SITUATIONS, SITUATIONS, SWEEP_AXES, SWEEP_INERT_AXES, compare, sweep } from './impact-arena'
import { PLACE_FACTS, SIM_USERS, rawEnv } from './simulate'
import { envOf } from './tenant-resolver'

/* -----------------------------------------------------------------------------
   The impact sweep, on the things it used to count wrong.

   People a policy does not govern were counted under its own last row — a
   Finance-only policy with a Deny at the bottom "denied" every contractor in
   the tenant. A cohort that moved both ways was reported as stricter. And a
   change of second factor from an authenticator app to an email code moved
   nothing, because only the decision was compared.
   -------------------------------------------------------------------------- */

const t = showcaseTenant()
const env = envOf(t)
const noon = 570

const financeOnly = (over: Partial<Policy> = {}): Policy => ({
  ...blankPolicy('Finance from the office', ['salesforce']),
  id: 'p-finance-office',
  status: 'active',
  audience: audienceOf(['finance']),
  rules: [rule({ name: 'From an office', when: when(card(cond('zone', 'in zone', ['corp-offices']))), decision: '2fa' })],
  fallback: fallbackRule('deny'),
  ...over,
})

const perPerson = SITUATIONS.length / SIM_USERS.length

describe('people the policy does not govern', () => {
  const s = sweep(financeOnly(), env, noon)
  const governed = (i: number) => SITUATIONS[i].userId === 'priya'

  it('marks every situation of the three people outside Finance', () => {
    expect(s.outsideCount).toBe(3 * perPerson)
    expect(s.outsideCount).toBe(1080)
    expect(SITUATIONS.every((x) => s.outside[x.index] === !governed(x.index))).toBe(true)
  })

  /* Situation by situation, since the Global Default's baseline (30 Sep 2026)
     is no longer one factor for all: a password on a corporate laptop in
     India or the UK, 2FA on anything else there, Deny elsewhere. Its Deny is
     its own last row, never this policy's. */
  it('gives them the Global Default’s decision, not this policy’s Deny', () => {
    const outsiders = SITUATIONS.filter((x) => !governed(x.index))
    const gd = sweep(t.policies.find((p) => p.isSystem)!, env, noon)
    expect(outsiders.map((x) => s.decisions[x.index])).toEqual(outsiders.map((x) => gd.decisions[x.index]))
    expect(new Set(outsiders.map((x) => s.decisions[x.index]))).toEqual(new Set(['1fa', '2fa', 'deny']))
    expect(SITUATIONS.filter((x) => !governed(x.index)).every((x) => s.winners[x.index] === null)).toBe(true)
  })

  it('counts only governed situations as falling through', () => {
    /* Priya's 360: the office origin (72) is claimed by the rule, the rest fall to the last row. */
    expect(s.reach[0]).toBe(perPerson / 5)
    expect(s.fellThrough).toBe(perPerson - perPerson / 5)
    expect(s.fellThrough + s.reach[0] + s.outsideCount).toBe(s.total)
  })

  it('keeps the old stand-in with no tenant policies to consult, and still does not count it as falling through', () => {
    const raw = sweep(financeOnly(), rawEnv, noon)
    expect(raw.outsideCount).toBe(1080)
    expect(SITUATIONS.filter((x) => !governed(x.index)).every((x) => raw.decisions[x.index] === 'deny')).toBe(true)
    /* The chip table does not know `corp-offices`, so all of Priya's 360 fall through there — and nobody else's. */
    expect(raw.fellThrough).toBe(perPerson)
  })

  it('reads a person outside both versions as unmoved', () => {
    const before = sweep(financeOnly(), env, noon)
    const tampered = { ...before, decisions: before.decisions.map((d, i) => (before.outside[i] ? 'deny' : d)) }
    const m = compare(before, tampered)
    expect(m.changed).toBe(0)
  })
})

describe('cohorts', () => {
  it('splits a cohort that moved both ways into two entries with true counts', () => {
    const everyone = (rules: Policy['rules']): Policy => ({ ...financeOnly(), audience: { everyone: true, groupIds: [], userIds: [] }, rules, fallback: fallbackRule('2fa') })
    const before = sweep(everyone([]), rawEnv, noon)
    const after = sweep(
      everyone([
        rule({ name: 'High risk', when: when(card(cond('device-risk', 'above', ['70']))), decision: 'deny' }),
        rule({ name: 'Low risk', when: when(card(cond('device-risk', 'below', ['40']))), decision: '1fa' }),
      ]),
      rawEnv,
      noon,
    )
    const m = compare(before, after)
    const financeAnywhere = m.cohorts.filter((c) => c.label === 'Finance · Any location')
    expect(financeAnywhere.map((c) => c.move).sort()).toEqual(['looser', 'stricter'])
    /* 6 devices × 4 auth states, for one risk band each way. */
    expect(financeAnywhere.every((c) => c.n === 24)).toBe(true)
  })
})

describe('a change of second factor', () => {
  it('counts a move from an authenticator app to an email code as looser, without drawing a lane change', () => {
    const on = (method: string): Policy => ({
      ...financeOnly(),
      audience: { everyone: true, groupIds: [], userIds: [] },
      rules: [rule({ name: 'Everyone', decision: '2fa', secondFactor: 'specific', secondFactorMethods: [method] })],
    })
    const m = compare(sweep(on('Google Authenticator'), env, noon), sweep(on('OTP over Email'), env, noon))
    expect(m.factorOnly).toBe(SITUATIONS.length)
    expect(m.looser).toBe(SITUATIONS.length)
    expect(m.changed).toBe(SITUATIONS.length)
    expect(m.flows.some((f) => f.from === '2fa' && f.to === '2fa')).toBe(false)
    expect(m.flows).toEqual([])
  })

  it('counts the reverse as stricter', () => {
    const on = (method: string): Policy => ({
      ...financeOnly(),
      audience: { everyone: true, groupIds: [], userIds: [] },
      rules: [rule({ name: 'Everyone', decision: '2fa', secondFactor: 'specific', secondFactorMethods: [method] })],
    })
    const m = compare(sweep(on('OTP over Email'), env, noon), sweep(on('FIDO2 / Passkey'), env, noon))
    expect(m.stricter).toBe(SITUATIONS.length)
    expect(m.looser).toBe(0)
  })
})

describe('badges and axes', () => {
  it('finds anonymised traffic by origin, the same situations the chip table put in `anon`', () => {
    const legacy = SITUATIONS.filter((s) => (PLACE_FACTS[s.place]?.zonesIn ?? []).includes('anon')).map((s) => s.index)
    expect(ANON_SITUATIONS).toEqual(legacy)
    expect(ANON_SITUATIONS.length).toBeGreaterThan(0)
  })

  it('names the auth-state axis as inert, and it is: no result on the showcase depends on it', () => {
    expect(SWEEP_INERT_AXES).toEqual(['Auth state'])
    expect(SWEEP_AXES.map((a) => a.name)).toContain('Auth state')
    const key = (i: number) => {
      const s = SITUATIONS[i]
      return `${s.userId}|${s.place}|${s.device}|${s.risk}`
    }
    for (const p of t.policies) {
      const s = sweep(p, env, noon)
      const seen = new Map<string, string>()
      for (const x of SITUATIONS) {
        const k = key(x.index)
        const d = s.decisions[x.index]
        if (seen.has(k)) expect(seen.get(k), `${p.id} ${k}`).toBe(d)
        else seen.set(k, d)
      }
    }
  })
})
