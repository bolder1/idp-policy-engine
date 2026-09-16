import { describe, expect, it } from 'vitest'

import { EVERYONE, anySignIn, card, cond, when, type Policy, type Rule } from '../data'
import { SIM_USERS, condPhrase, decide, evalCond, evalRule, rawEnv, walk, type SimContext, type SimEnv } from './simulate'

/* -----------------------------------------------------------------------------
   A zone or device profile the tenant has deleted never matches in a rehearsal.

   The linter reports the rule as broken (PE134, PE135). If the rehearsal still
   graded the condition against the hand-mapped place and device facts, the
   Check tab would show a sign-in decided by a rule that names nothing.
   -------------------------------------------------------------------------- */

const ctx = (over: Partial<SimContext> = {}): SimContext => ({
  user: SIM_USERS[0],
  place: 'Office Network',
  device: 'Managed (MDM)',
  authState: 'Normal returning user',
  risk: 'Low',
  nowMinutes: 600,
  ...over,
})

const live: SimEnv = {
  ...rawEnv,
  hasZone: (id) => id === 'eu',
  hasFingerprint: (id) => id === 'fp-byod',
}

const ruleOf = (c: ReturnType<typeof cond>) => ({ id: 'r', name: 'R', enabled: true, when: when(card(c)), decision: 'deny' }) as Rule

describe('a deleted zone', () => {
  it('is unknown, not a pass, from inside the zone it used to name', () => {
    expect(evalCond(cond('zone', 'in zone', ['office']), ctx(), rawEnv).state).toBe('pass')
    expect(evalCond(cond('zone', 'in zone', ['office']), ctx(), live).state).toBe('unknown')
  })

  it('is unknown under not in zone too — negation does not turn it into a match', () => {
    const c = cond('zone', 'not in zone', ['office'])
    expect(evalCond(c, ctx({ place: 'Outside all zones' }), live).state).toBe('unknown')
    expect(evalRule(ruleOf(c), ctx({ place: 'Outside all zones' }), live).match).toBe(false)
  })

  it('makes the whole condition unknown when any of its values is gone', () => {
    expect(evalCond(cond('zone', 'in zone', ['eu', 'office']), ctx(), live).state).toBe('unknown')
  })

  it('still evaluates a zone that exists', () => {
    expect(evalCond(cond('zone', 'in zone', ['eu']), ctx({ place: 'Known proxy' }), live).state).toBe('pass')
  })

  it('reads as (deleted) in the trace', () => {
    expect(condPhrase(cond('zone', 'in zone', ['office']), live)).toBe('Network zone in zone (deleted)')
  })
})

describe('a deleted device profile', () => {
  it('is unknown, not a pass, on a recognised device', () => {
    const c = cond('fingerprint', 'matches', ['fp-corp'])
    expect(evalCond(c, ctx(), rawEnv).state).toBe('pass')
    expect(evalCond(c, ctx(), live).state).toBe('unknown')
    expect(evalRule(ruleOf(c), ctx(), live).match).toBe(false)
  })

  it('still evaluates a profile that exists', () => {
    expect(evalCond(cond('fingerprint', 'matches', ['fp-byod']), ctx(), live).state).toBe('pass')
  })
})

/* -----------------------------------------------------------------------------
   Who is read before any card.

   A person the rule is not for misses without a condition being evaluated,
   and the trace says who the rule was for.
   -------------------------------------------------------------------------- */

const named: SimEnv = { ...rawEnv, groupName: (id) => ({ finance: 'Finance', contractors: 'Contractors' })[id] ?? id }
const priya = SIM_USERS.find((u) => u.id === 'priya')!
const devon = SIM_USERS.find((u) => u.id === 'devon')!
const withWho = (who: Rule['who'], w: Rule['when'] = anySignIn()): Rule =>
  ({ id: 'r', name: 'R', enabled: true, who, when: w, decision: 'deny' }) as Rule

describe('a rule with a who', () => {
  it('misses a person it is not for, before reading a card, and says who it was for', () => {
    const r = withWho({ groupIds: ['finance'], userIds: ['mehak'] }, when(card(cond('zone', 'in zone', ['office']))))
    const v = evalRule(r, ctx({ user: devon }), named)
    expect(v).toEqual({ match: false, reason: 'Not Finance or Mehak Garg', card: null })
  })

  it('matches a person it is for when the conditions hold', () => {
    const r = withWho({ groupIds: ['finance'], userIds: [] }, when(card(cond('zone', 'in zone', ['office']))))
    expect(evalRule(r, ctx({ user: priya }), named).match).toBe(true)
    expect(evalRule(r, ctx({ user: priya, place: 'Outside all zones' }), named).match).toBe(false)
  })

  it('does not call a who with no conditions a catch-all in the trace', () => {
    const v = evalRule(withWho({ groupIds: ['finance'], userIds: [] }), ctx({ user: priya }), named)
    expect(v.match).toBe(true)
    expect(v.reason).not.toContain('everything')
  })

  it('names the exception that took a person out', () => {
    expect(evalRule(withWho({ groupIds: [], userIds: [], exceptGroupIds: ['contractors'] }), ctx({ user: devon }), named).reason).toBe(
      'Contractors is an exception',
    )
    expect(evalRule(withWho({ groupIds: [], userIds: [], exceptUserIds: ['devon'] }), ctx({ user: devon }), named).reason).toBe(
      'Devon Rao is an exception',
    )
  })

  it('says a person is not included before it says they are an exception', () => {
    const r = withWho({ groupIds: ['finance'], userIds: [], exceptUserIds: ['devon'], exceptGroupIds: ['contractors'] })
    expect(evalRule(r, ctx({ user: devon }), named).reason).toBe('Not Finance')
  })

  it('falls through to the rule below for everyone else, in the walk and the sweep alike', () => {
    const p: Policy = {
      id: 'p', name: 'P', type: 'App Access', appIds: [], status: 'active', lastModified: '', modifiedBy: '', audience: EVERYONE,
      rules: [withWho({ groupIds: ['contractors'], userIds: [] }), { ...withWho(undefined), id: 'r2', decision: '1fa' }],
    }
    expect(walk(p, ctx({ user: devon }), named).decision).toBe('deny')
    expect(walk(p, ctx({ user: priya }), named).steps[0]).toMatchObject({ kind: 'miss', reason: 'Not Contractors' })
    expect(decide(p, ctx({ user: priya }), named).decision).toBe('1fa')
  })
})
