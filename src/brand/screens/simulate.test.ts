import { describe, expect, it } from 'vitest'

import { EVERYONE, anySignIn, blankPolicy, card, cond, rule, when, type Policy, type Rule } from '../data'
import { showcaseTenant } from '../fixtures'
import {
  CHIP_DEVICES,
  SIM_USERS,
  chipFacts,
  condPhrase,
  decide,
  evalCond,
  evalCondition,
  evalRule,
  personOf,
  rawEnv,
  traceRule,
  tracePolicy,
  walk,
  type SignInFacts,
  type SimContext,
  type SimEnv,
} from './simulate'
import { envOf } from './tenant-resolver'

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

/* -----------------------------------------------------------------------------
   The typed path: three values, kept.

   Every condition's verdict survives into the trace, an undecided rule forks
   the walk into the outcomes it could produce, and a rule decided on either
   path reads the same sentence.
   -------------------------------------------------------------------------- */

const tenant = showcaseTenant()
const tenantEnv = envOf(tenant)
const monday = () => cond('day', 'is', ['Monday'])
const riskAbove = (n: number) => cond('device-risk', 'above', [String(n)])
const noDateNoRisk: SignInFacts = { personId: 'priya', when: { time: '10:00', timeZone: 'Asia/Kolkata', source: 'typed' } }
const policyOf = (rules: Rule[], fallback: Rule['decision'] = '1fa'): Policy => ({
  ...blankPolicy('Typed', ['salesforce']),
  status: 'active',
  rules,
  fallback: rule({ name: 'Nothing else matched', decision: fallback }),
})

describe('possible outcomes', () => {
  const p = policyOf([
    rule({ name: 'Weekday', when: when(card(monday())), decision: 'deny' }),
    rule({ name: 'Small hours', when: when(card(cond('time', 'between', ['00:00', '01:00']))), decision: '2fa' }),
    rule({ name: 'Risky', when: when(card(riskAbove(50))), decision: '2fa' }),
    rule({ name: 'Switched off', enabled: false, decision: 'deny' }),
    rule({ name: 'Everyone else', decision: '1fa' }),
  ])
  const tr = tracePolicy(p, noDateNoRisk, rawEnv)

  it('forks at each undecided rule, in rule order, and says what each outcome assumed', () => {
    expect(tr.possible).toEqual([
      { decision: 'deny', ruleIndex: 0, ruleName: 'Weekday', assumes: [{ ruleIndex: 0, matches: true }] },
      { decision: '2fa', ruleIndex: 2, ruleName: 'Risky', assumes: [{ ruleIndex: 0, matches: false }, { ruleIndex: 2, matches: true }] },
      { decision: '1fa', ruleIndex: 4, ruleName: 'Everyone else', assumes: [{ ruleIndex: 0, matches: false }, { ruleIndex: 2, matches: false }] },
    ])
    expect(tr.settled).toBe(false)
  })

  it('keeps the definite reading beside it: undecided counts as no match, as `decide` has it', () => {
    expect(tr.hitIndex).toBe(4)
    expect(tr.decision).toBe('1fa')
    expect(tr.steps.map((s) => s.kind)).toEqual(['miss', 'miss', 'miss', 'off', 'hit'])
    expect(tr.steps.map((s) => s.match)).toEqual(['unknown', 'no', 'unknown', 'yes', 'yes'])
    expect(tr.lastRow).toBeNull()
  })

  it('lists the undecided conditions once each, with the facts that would settle them', () => {
    expect(tr.unknowns.map((u) => u.typeId)).toEqual(['day', 'device-risk'])
    expect(tr.unknowns.map((u) => u.missing)).toEqual([['date'], ['risk']])
  })

  it('is settled when every reading lands on the same decision, however many rules are undecided', () => {
    const allDeny = policyOf(
      [rule({ name: 'Weekday', when: when(card(monday())), decision: 'deny' }), rule({ name: 'Risky', when: when(card(riskAbove(50))), decision: 'deny' })],
      'deny',
    )
    const t2 = tracePolicy(allDeny, noDateNoRisk, rawEnv)
    expect(t2.possible).toHaveLength(3)
    expect(t2.settled).toBe(true)
    expect(t2.decision).toBe('deny')
    expect(t2.lastRow?.ruleName).toBe('Nothing else matched')
  })

  it('drops a repeated outcome, so each (decision, rule) is listed once', () => {
    const keys = tr.possible.map((o) => `${o.decision}|${o.ruleIndex}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('has no outcome at all for a person the policy does not govern', () => {
    const scoped = { ...policyOf([rule({ name: 'All', decision: 'deny' })]), audience: { everyone: false, groupIds: ['hr'], userIds: [] } }
    const out = tracePolicy(scoped, { personId: 'priya' }, tenantEnv)
    expect(out).toMatchObject({ outOfAudience: true, decision: null, possible: [], steps: [] })
  })

  it('reads a named audience as unknown without a person, and says so', () => {
    const scoped = { ...policyOf([rule({ name: 'All', decision: 'deny' })]), audience: { everyone: false, groupIds: ['hr'], userIds: [] } }
    expect(tracePolicy(scoped, {}, tenantEnv).audienceKnown).toBe(false)
  })
})

describe('one sentence for one rule, on either path', () => {
  const office: SignInFacts = { personId: 'priya', network: { address: '203.0.113.25', source: 'typed' }, risk: { score: 48, source: 'stated' } }
  const monday9: SignInFacts['when'] = { date: '2026-09-28', time: '09:00', timeZone: 'Asia/Kolkata', source: 'typed' }
  const sunday9: SignInFacts['when'] = { date: '2026-09-27', time: '09:00', timeZone: 'Asia/Kolkata', source: 'typed' }
  const rules: Rule[] = [
    rule({ name: 'Two ways', when: when(card(cond('zone', 'in zone', ['corp-offices']), cond('device-risk', 'below', ['40'])), card(monday())), decision: '2fa' }),
    rule({ name: 'One run', when: when(card(cond('zone', 'in zone', ['corp-offices']), riskAbove(40))), decision: '2fa' }),
    rule({ name: 'Not for Priya', who: { groupIds: ['hr'], userIds: [] }, when: when(card(monday())), decision: 'deny' }),
    rule({ name: 'Catch all', decision: '1fa' }),
  ]

  it.each([
    ['on a Monday', monday9],
    ['on a Sunday', sunday9],
  ])('matches evalRule word for word %s', (_label, whenFacts) => {
    const facts = { ...office, when: whenFacts }
    const person = personOf('priya', tenantEnv)
    for (const [i, r] of rules.entries()) {
      const typed = traceRule(r, i, facts, person, tenantEnv)
      expect(typed.match, r.name).not.toBe('unknown')
      const chip = evalRule(r, ctx({ facts }), tenantEnv)
      expect(typed.reason, r.name).toBe(chip.reason)
      expect(typed.match === 'yes', r.name).toBe(chip.match)
      expect(typed.card, r.name).toBe(chip.card)
    }
  })

  it('keeps every condition of a rule whose who missed', () => {
    const typed = traceRule(rules[2], 2, { ...office, when: monday9 }, personOf('priya', tenantEnv), tenantEnv)
    expect(typed).toMatchObject({ who: 'out', match: 'no', whoReason: 'Not Human Resources', reason: 'Not Human Resources' })
    expect(typed.conditions.map((c) => c.status)).toEqual(['pass'])
  })

  it('cannot read a who without a person', () => {
    const typed = traceRule(rules[2], 2, { ...office, when: monday9 }, null, tenantEnv)
    expect(typed.who).toBe('unknown')
    expect(typed.match).toBe('unknown')
  })
})

describe('the bridge between chips and facts', () => {
  it('leaves every caller with no library and no facts on the chip table', () => {
    expect(evalCond(cond('zone', 'in zone', ['office']), ctx(), rawEnv)).toEqual({ state: 'pass', detail: 'this login is in Office Network' })
  })

  it('hands the bridge each condition’s card, so walk and tracePolicy read a weekday in the same zone', () => {
    /* 01:00 Monday in Kolkata is 15:30 Sunday in New York. The weekday names no
       zone of its own, so it takes the time window's; without the card the
       bridge read it in the tenant's zone, called it Monday, and `walk` denied
       what `tracePolicy` let through. */
    const d = monday()
    const nyDay = rule({ name: 'Monday in New York', when: when(card(d, cond('time', 'between', ['00:00', '23:59'], undefined, { tz: 'America/New_York' }))), decision: 'deny' })
    const p = policyOf([nyDay])
    const facts: SignInFacts = { personId: 'priya', when: { date: '2026-09-28', time: '01:00', timeZone: 'Asia/Kolkata', source: 'typed' } }
    const walked = walk(p, ctx({ facts }), tenantEnv)
    expect(walked.decision).toBe('1fa')
    expect(walked.decision).toBe(tracePolicy(p, facts, tenantEnv).decision)
    expect(evalRule(nyDay, ctx({ facts }), tenantEnv).reason).toBe(traceRule(nyDay, 0, facts, SIM_USERS[0], tenantEnv).reason)
  })

  it('answers the fact-shaped conditions from explicit facts, in the typed sentence', () => {
    const facts: SignInFacts = { risk: { score: 71, source: 'stated' } }
    expect(evalCond(riskAbove(70), ctx({ risk: 'Low', facts }), rawEnv)).toEqual({ state: 'pass', detail: 'the device risk score is 71 (stated)' })
  })

  it('reads a chip zone from the tenant zones once the env carries them, in the chip own words', () => {
    const c = cond('zone', 'in zone', ['corp-offices'])
    expect(evalCond(c, ctx(), rawEnv).state).toBe('fail')
    expect(evalCond(c, ctx(), tenantEnv)).toEqual({ state: 'pass', detail: 'this login is in Office Network' })
    expect(evalCond(c, ctx({ place: 'Outside all zones' }), tenantEnv)).toEqual({ state: 'fail', detail: 'this login is in no zone at all' })
    expect(evalCond(cond('zone', 'in zone', ['india']), ctx({ place: 'Known proxy' }), tenantEnv).state).toBe('fail')
  })

  it('keeps "Any location" undecided, and a deleted zone deleted', () => {
    expect(evalCond(cond('zone', 'in zone', ['corp-offices']), ctx({ place: 'Any location' }), tenantEnv).state).toBe('unknown')
    expect(evalCond(cond('zone', 'in zone', ['office']), ctx(), tenantEnv)).toEqual({ state: 'unknown', detail: 'this rule names a zone that no longer exists' })
  })

  it('leaves a zone the chip cannot place undecided rather than outside', () => {
    const r = evalCond(cond('zone', 'not in zone', ['india']), ctx({ place: 'Tor exit node' }), tenantEnv)
    expect(r.state).toBe('unknown')
    expect(r.detail).toContain('names no place')
  })

  it('agrees with the typed path on every chip origin, for a zone-only rule', () => {
    const r = rule({ name: 'Office', when: when(card(cond('zone', 'in zone', ['corp-offices']))), decision: '2fa' })
    for (const place of ['Office Network', 'Outside all zones', 'Tor exit node', 'Known proxy']) {
      const c = ctx({ place })
      const typed = traceRule(r, 0, chipFacts(c, tenantEnv), personOf(c.user.id, tenantEnv), tenantEnv)
      expect(typed.match === 'yes', place).toBe(evalRule(r, c, tenantEnv).match)
    }
  })
})

describe('evalCondition', () => {
  it('compares a risk score strictly, and says when a platform collects none', () => {
    const at = (score: number, platform?: 'windows' | 'android') =>
      evalCondition(riskAbove(70), { risk: { score, source: 'stated' }, ...(platform ? { device: { source: 'stated', platform } } : null) }, rawEnv)
    expect(at(70).status).toBe('fail')
    expect(at(71).status).toBe('pass')
    expect(at(71, 'windows').caveat).toBe('Risk signals are collected on Android and iOS only, so this score was stated, not measured.')
    expect(at(71, 'android').caveat).toBeUndefined()
    expect(evalCondition(riskAbove(70), {}, rawEnv)).toMatchObject({ status: 'unknown', missing: ['risk'] })
  })

  it('needs the tenant zones to read a zone', () => {
    expect(evalCondition(cond('zone', 'in zone', ['corp-offices']), { network: { address: '203.0.113.9', source: 'typed' } }, rawEnv).status).toBe('unknown')
  })

  it('grades a device profile row by row, and leaves it undecided on the rows nobody stated, never a match', () => {
    const r = evalCondition(cond('fingerprint', 'matches', ['fp-compliant']), { device: { source: 'stated', platform: 'android', osVersion: '14' } }, tenantEnv)
    expect(r.status).toBe('unknown')
    expect(r.checks?.find((c) => c.id === 'os-android')?.status).toBe('pass')
    expect(r.missing).toEqual(['device.integrity', 'device.screenLock', 'device.authenticatorVersion'])
    expect(r.detail).toBe('Compliant devices: device integrity, the screen lock and the Authenticator version were not stated, so this is undecided')
    const negated = evalCondition(cond('fingerprint', 'does not match', ['fp-compliant']), { device: { source: 'stated', platform: 'android', osVersion: '12' } }, tenantEnv)
    expect(negated.status).toBe('pass')
    const gone = evalCondition(cond('fingerprint', 'matches', ['fp-byod']), {}, tenantEnv)
    expect(gone.detail).toBe('this rule names a device profile that no longer exists')
  })

  it('reads a chip device against the tenant profiles once the env carries them, in the typed sentence', () => {
    const c = cond('fingerprint', 'matches', ['fp-compliant'])
    expect(evalCond(c, ctx({ device: 'Known > 90 days' }), tenantEnv)).toEqual({
      state: 'fail',
      detail: 'Compliant devices: Windows OS version is 10.0.19045 (assumed), and it needs ≥ 11',
    })
    /* A device does not depend on the origin, so "Any location" grades it too. */
    expect(evalCond(c, ctx({ device: 'Known < 90 days', place: 'Any location' }), tenantEnv).state).toBe('pass')
    /* With no library, the chip table's recognised reading stands, as before. */
    expect(evalCond(cond('fingerprint', 'matches', ['fp-corp']), ctx({ device: 'Known > 90 days' }), rawEnv).state).toBe('pass')
  })

  it('says of every device chip, word for word, what the typed path says of its facts', () => {
    const everyDevice = { ...tenantEnv, deviceMatch: { clientRows: 'every-device' as const } }
    for (const device of Object.keys(CHIP_DEVICES))
      for (const e of [tenantEnv, everyDevice])
        for (const c of [
          cond('fingerprint', 'matches', ['fp-compliant']),
          cond('fingerprint', 'does not match', ['fp-corp-devices']),
          cond('fingerprint', 'matches', ['fp-corp-devices', 'fp-compliant']),
        ]) {
          const x = ctx({ device })
          const typed = evalCondition(c, chipFacts(x, e), e)
          expect(evalCond(c, x, e), `${device} / ${c.operator} ${c.values.join(', ')}`).toEqual({ state: typed.status, detail: typed.detail })
        }
  })

  it('reads a person from the tenant directory, with the tenant name for the group', () => {
    expect(personOf('u-hr-1', tenantEnv)).toMatchObject({ name: 'Kavya Menon', groupName: 'Human Resources' })
    expect(personOf('priya', rawEnv)?.groupName).toBe('Finance')
    expect(personOf('nobody', tenantEnv)).toBeNull()
    const dept = cond('user-attr', 'is', ['Human Resources'], undefined, { key: 'department' })
    expect(evalCondition(dept, { personId: 'u-hr-1' }, tenantEnv).status).toBe('pass')
    expect(evalCondition(dept, {}, tenantEnv)).toMatchObject({ status: 'unknown', missing: ['person'] })
  })

  it('says a chip device was assumed wherever a verdict rests on it', () => {
    /* "Known < 90 days" names no platform; the chip adapter chose an iPhone. */
    expect(evalCond(cond('fingerprint', 'matches', ['fp-compliant']), ctx({ device: 'Known < 90 days' }), tenantEnv).detail).toBe(
      'the device (iOS 17.5 mobile, assumed) passes every check in Compliant devices that applies to it',
    )
    const corporate = evalCond(cond('fingerprint', 'matches', ['fp-corp-devices']), ctx({ device: 'Known < 90 days' }), tenantEnv)
    expect(corporate.detail).toBe('Corporate devices: the Device Agent runs on Windows only, and this is iOS (assumed)')
    /* A device the tester stated carries no mark; its source is in `actual`. */
    const stated = evalCondition(cond('fingerprint', 'matches', ['fp-compliant']), { device: { ...CHIP_DEVICES['Known > 90 days'], source: 'stated' } }, tenantEnv)
    expect(stated.detail).toBe('Compliant devices: Windows OS version is 10.0.19045, and it needs ≥ 11')
    expect(stated.actual).toBe('Windows 10.0.19045 laptop (stated)')
  })

  it('says a chip clock shifted into another zone was read on standard time', () => {
    const berlin = cond('time', 'between', ['05:00', '06:00'], undefined, { tz: 'Europe/Berlin' })
    expect(evalCond(berlin, ctx({ nowMinutes: 600 }), rawEnv).detail).toBe('it is 05:30 in Europe/Berlin (standard time)')
    expect(evalCond(cond('time', 'between', ['09:00', '11:00'], undefined, { tz: 'Asia/Kolkata' }), ctx({ nowMinutes: 600 }), rawEnv).detail).toBe(
      'it is 10:00 in Asia/Kolkata',
    )
  })

  it('refuses a date the calendar does not have, rather than rolling it into the next month', () => {
    for (const date of ['2026-02-30', '2026-04-31', '2026-02-29'])
      for (const c of [monday(), cond('time', 'between', ['09:00', '11:00'])]) {
        const r = evalCondition(c, { when: { date, time: '10:00', timeZone: 'Asia/Kolkata', source: 'typed' } }, rawEnv)
        expect(r.status, `${date} / ${c.typeId}`).toBe('unknown')
        expect(r.detail).toBe(`${date} 10:00 in Asia/Kolkata is not a time this model can read`)
      }
    /* A leap day that exists is read. */
    expect(evalCondition(cond('day', 'is', ['Tuesday']), { when: { date: '2028-02-29', time: '10:00', timeZone: 'Asia/Kolkata', source: 'typed' } }, rawEnv).status).toBe(
      'pass',
    )
  })

  it('reads a time in a spring-forward gap an hour later, as a clock that skipped the hour shows it', () => {
    /* New York skips 02:00–03:00 on 8 March 2026; 02:30 never happens there. */
    const gap: SignInFacts = { when: { date: '2026-03-08', time: '02:30', timeZone: 'America/New_York', source: 'typed' } }
    const ny = (from: string, to: string) => cond('time', 'between', [from, to], undefined, { tz: 'America/New_York' })
    const later = evalCondition(ny('03:00', '03:59'), gap, rawEnv)
    expect(later.status).toBe('pass')
    expect(later.actual).toBe('03:30 in America/New_York')
    expect(evalCondition(ny('01:00', '01:59'), gap, rawEnv).status).toBe('fail')
    /* Either side of the gap reads as written. */
    for (const [time, want] of [['01:30', '01:30'], ['03:30', '03:30']])
      expect(evalCondition(ny('00:00', '23:59'), { when: { ...gap.when!, time } }, rawEnv).actual).toBe(`${want} in America/New_York`)
    /* In the autumn overlap 01:30 happens twice; the first, on summer time, is read. */
    const overlap = evalCondition(cond('time', 'between', ['11:00', '11:00'], undefined, { tz: 'Asia/Kolkata' }), {
      when: { date: '2026-11-01', time: '01:30', timeZone: 'America/New_York', source: 'typed' },
    }, rawEnv)
    expect(overlap.actual).toBe('11:00 in Asia/Kolkata')
  })

  it('never passes a band name, which is not a sign-in fact', () => {
    expect(evalCondition(cond('ml-risk', 'is', ['Low']), { risk: { score: 5, source: 'stated' } }, rawEnv).status).toBe('unknown')
  })

  it('matches a legacy city condition by alias, as a zone does', () => {
    const bengaluru: SignInFacts = { location: { country: 'India', state: 'Karnataka', city: 'Bengaluru', lat: 12.97, lon: 77.59, source: 'stated' } }
    expect(evalCondition(cond('city', 'is', ['Bangalore']), bengaluru, rawEnv).status).toBe('pass')
  })
})
