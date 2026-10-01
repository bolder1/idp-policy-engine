import { describe, expect, it } from 'vitest'

import { FALLBACK_NAME, blankPolicy, card, cond, rule, when, type Policy } from './data'
import { showcaseTenant } from './fixtures'
import { buildTemplate } from './screens/board/apply-template'
import { TYPED_DECK, runBreakIn } from './screens/gauntlet'
import {
  CHIP_DEVICES,
  SIM_USERS,
  chipFacts,
  evalCondition,
  tracePolicy,
  walk,
  type SignInDevice,
  type SignInFacts,
  type SignInPlace,
  type SimContext,
} from './screens/simulate'
import { envOf, resolveSignIn } from './screens/tenant-resolver'
import { devicePreset } from './screens/testing/device-presets'

/* -----------------------------------------------------------------------------
   The showcase tenant, asked the questions a presenter will ask of it.

   These are the acceptance scenes for a truthful evaluator: each one is a
   sign-in somebody could type into a playground, with the answer this model
   gives — under the owner decisions the Phase 0 spec takes (D1–D8), with list
   order standing in for the product's undocumented cross-policy weight, and
   ordered rules with first-match-wins as the prototype's proposed model of a
   policy. Scene 8 pins both readings of D1 for that reason.

   Before this, the evaluator knew four zone ids from the test estate and none
   of the showcase's, so the first scene — HR in the office on HRMS — was
   refused.

   Every scene reads the tenant as the store loads it (`showcaseTenant`) and an
   env built from it (`envOf`), so the zones are read from their own entries
   and a device is graded against each device profile row by row. Rules are
   found by name, never by id: ids come from a counter.
   -------------------------------------------------------------------------- */

const t = showcaseTenant()
const env = envOf(t)
const policy = (id: string) => t.policies.find((p) => p.id === id)!
const ruleNamed = (p: Policy, name: string) => p.rules.findIndex((r) => r.name === name)

/* HRMS opens Inactive (Phase 4), so the HRMS scenes ask what Try's Stored
   version column asks: the stored policy, as though it were on. */
const STORED = { substitute: { ...policy('sc-hrms-office'), status: 'active' as const } }

const at = (address: string, over: Partial<SignInFacts> = {}): SignInFacts => ({ network: { address, source: 'typed' }, ...over })
/* The Global Default reads the device since its baseline (30 Sep 2026): a
   corporate laptop in the operating countries is its rule 1, one factor. The
   scenes that land on it state one, so it decides rather than depends. */
const CORP_LAPTOP = devicePreset('win11-registered').facts
const place = (city: string, lat: number, lon: number, country = 'India', state: string | null = 'Maharashtra'): SignInPlace => ({
  country,
  state,
  city,
  lat,
  lon,
  source: 'stated',
})

describe('Scene 1: HR in the office', () => {
  const facts = at('203.0.113.25', { appId: 'hrms', personId: 'u-hr-1' })
  const r = resolveSignIn(t.policies, facts, env, STORED)

  it('is the Global Default today, on 1 factor, while HRMS is off', () => {
    const today = resolveSignIn(t.policies, { ...facts, device: CORP_LAPTOP }, env)
    expect(today.decidedBy?.policyId).toBe('global-default')
    expect(today.decision).toBe('1fa')
    expect(today.standings.find((s) => s.policyId === 'sc-hrms-office')).toMatchObject({ kind: 'inactive', reason: 'Inactive' })
  })

  it('is decided by the HRMS office policy, first rule, 2 factors, once it is on', () => {
    expect(r.status).toBe('decided')
    expect(r.decidedBy?.policyId).toBe('sc-hrms-office')
    expect(r.decision).toBe('2fa')
    expect(r.trace?.hitIndex).toBe(0)
    expect(r.trace?.steps[0].ruleName).toBe('In a corporate office')
  })

  it('reads both halves of the office zone: the address block, and Pune looked up inside the 25 km range', () => {
    const zone = r.trace!.steps[0].conditions[0]
    expect(zone.status).toBe('pass')
    expect(zone.zones?.[0]).toMatchObject({ zoneId: 'corp-offices', network: 'pass', location: 'pass' })
    expect(zone.detail).toContain('203.0.113.0/24')
    expect(zone.detail).toContain('Pune (looked up) is within 25 km of Pune')
  })

  it('watches nothing, by contract', () => {
    expect(r.watching).toEqual([])
  })
})

describe('Scene 2: same city, not the office network', () => {
  const r = resolveSignIn(t.policies, at('192.0.2.10', { appId: 'hrms', personId: 'u-hr-2' }), env, STORED)

  it('is refused by the last row', () => {
    expect(r.decision).toBe('deny')
    expect(r.trace?.hitIndex).toBeNull()
    expect(r.trace?.lastRow?.ruleName).toBe(FALLBACK_NAME)
  })

  it('fails on the network half while the place is inside', () => {
    const zone = r.trace!.steps[0].conditions[0]
    expect(zone.status).toBe('fail')
    expect(zone.zones?.[0].network).toBe('fail')
    expect(zone.zones?.[0].location).toBe('pass')
  })
})

describe('Scene 2b: the office address, with other stated places', () => {
  const kavya = (p: SignInPlace) => resolveSignIn(t.policies, at('203.0.113.25', { appId: 'hrms', personId: 'u-hr-1', location: p }), env, STORED)

  it('lets Mumbai in by name, although it is about 125 km from Pune', () => {
    expect(kavya(place('Mumbai', 19.1, 72.9)).decision).toBe('2fa')
  })

  it('lets Hinjewadi in by distance, inside the 25 km range', () => {
    expect(kavya(place('Hinjewadi', 18.59, 73.74)).decision).toBe('2fa')
  })

  it('refuses Lonavala, about 58 km out: the location half fails', () => {
    const r = kavya(place('Lonavala', 18.75, 73.41))
    expect(r.decision).toBe('deny')
    expect(r.trace!.steps[0].conditions[0].zones?.[0].location).toBe('fail')
  })
})

describe('Scene 3: Sales on HRMS falls to the Global Default', () => {
  it('sends Aisha past the HRMS policy, which does not govern her, to the Global Default', () => {
    const r = resolveSignIn(t.policies, at('203.0.113.25', { appId: 'hrms', personId: 'u-sales-1', device: CORP_LAPTOP }), env, STORED)
    expect(r.decidedBy?.policyId).toBe('global-default')
    expect(r.decision).toBe('1fa')
    const hrms = r.standings.find((s) => s.policyId === 'sc-hrms-office')!
    expect(hrms.kind).toBe('not-in-audience')
    expect(hrms.reason).toBe('Not in audience: Human Resources, Finance')
  })

  it('does the same for Arun in Engineering, and never applies the HRMS policy’s Deny', () => {
    /* From home in Pune (not an office block, so HRMS would refuse him): the
       Global Default's rule 1 lets his corporate laptop in. Austin was the
       address here until the Global Default's baseline refused it. */
    const r = resolveSignIn(t.policies, at('192.0.2.10', { appId: 'hrms', personId: 'arun', device: CORP_LAPTOP }), env)
    expect(r.decidedBy?.policyId).toBe('global-default')
    expect(r.decision).toBe('1fa')
  })
})

describe('Scene 3b: a named person in the audience', () => {
  it('lets the corporate-devices policy govern Vikram Nair by name', () => {
    const r = resolveSignIn(t.policies, at('203.0.113.25', { appId: 'google-workspace', personId: 'u-exec-2' }), env)
    expect(r.decidedBy?.policyId).toBe('sc-corporate-devices')
    expect(r.standings.find((s) => s.policyId === 'sc-corporate-devices')?.tier).toBe('custom')
  })

  it('leaves Mehak, an executive it does not name, to the Global Default', () => {
    const r = resolveSignIn(t.policies, at('203.0.113.25', { appId: 'google-workspace', personId: 'mehak', device: CORP_LAPTOP }), env)
    expect(r.decidedBy?.policyId).toBe('global-default')
    expect(r.decision).toBe('1fa')
  })
})

describe('Scene 4: the “Sign in from India only” template', () => {
  const template = t.scenarios.find((s) => s.id === 'st-india')!
  const indiaOnly: Policy = {
    ...blankPolicy('India only', ['salesforce']),
    status: 'active',
    rules: buildTemplate(template, t.directory.people, { zones: t.zones, fingerprints: t.fingerprints }).rules,
  }
  const outside = ruleNamed(indiaOnly, 'Outside India')

  it('lets a sign-in stated in Pune through to the last row', () => {
    const tr = tracePolicy(indiaOnly, { location: place('Pune', 18.5, 73.9) }, env)
    expect(tr.decision).toBe('1fa')
    expect(tr.hitIndex).toBeNull()
    expect(tr.steps[outside].match).toBe('no')
  })

  it('refuses a sign-in stated in Berlin by the rule', () => {
    const tr = tracePolicy(indiaOnly, { location: place('Berlin', 52.5, 13.4, 'Germany', 'Berlin') }, env)
    expect(tr.decision).toBe('deny')
    expect(tr.hitIndex).toBe(outside)
  })

  it('cannot say with no place and no address, and names both outcomes and the missing fact', () => {
    const tr = tracePolicy(indiaOnly, {}, env)
    expect(tr.settled).toBe(false)
    expect(new Set(tr.possible.map((o) => o.decision))).toEqual(new Set(['deny', '1fa']))
    expect(tr.unknowns[0].missing).toContain('location')
  })

  it('cannot say for a Tor exit either, because the lookup names no place', () => {
    const tr = tracePolicy(indiaOnly, at('192.0.2.66'), env)
    expect(tr.settled).toBe(false)
    expect(new Set(tr.possible.map((o) => o.decision))).toEqual(new Set(['deny', '1fa']))
    expect(tr.unknowns[0].detail).toContain('names no place')
  })
})

/* The device a scene signs in on. Stated, not assumed: a tester typed it. */
const handset = (over: Partial<SignInDevice> = {}): SignInDevice => ({
  source: 'stated',
  platform: 'android',
  osVersion: '12',
  formFactor: 'Mobile',
  integrity: { rooted: false, tampered: false, emulated: false },
  screenLock: 'pin',
  authenticatorVersion: '6.5',
  ...over,
})
const windows11 = (over: Partial<SignInDevice> = {}): SignInDevice => ({
  source: 'stated',
  platform: 'windows',
  osVersion: '10.0.22631',
  formFactor: 'Laptop',
  integrity: null,
  screenLock: null,
  authenticatorVersion: null,
  agentInstalled: true,
  agentVersion: '4.3',
  ...over,
})
const risk = (score: number): SignInFacts['risk'] => ({ score, source: 'stated' })
const fingerprintIn = (r: ReturnType<typeof resolveSignIn>, ruleIndex: number) =>
  r.trace!.steps[ruleIndex].conditions.find((c) => c.typeId === 'fingerprint')!

describe('Scene 5: a contractor on Android 12', () => {
  const r = resolveSignIn(t.policies, { appId: 'outlook', personId: 'devon', device: handset() }, env)
  const compliant = ruleNamed(policy('sc-device-compliance'), 'Compliant device')

  it('is refused by the device compliance policy’s last row', () => {
    expect(r.decidedBy?.policyId).toBe('sc-device-compliance')
    expect(r.status).toBe('decided')
    expect(r.decision).toBe('deny')
    expect(r.trace?.hitIndex).toBeNull()
    expect(r.trace?.lastRow?.ruleName).toBe(FALLBACK_NAME)
  })

  it('names the Android floor as the one check that failed', () => {
    const fp = fingerprintIn(r, compliant)
    expect(fp.status).toBe('fail')
    expect(fp.checks?.find((c) => c.id === 'os-android')).toMatchObject({ status: 'fail', actual: '12', required: '≥ 13' })
    const others = fp.checks!.filter((c) => c.id !== 'os-android')
    expect(others.length).toBeGreaterThan(0)
    for (const c of others) expect(['pass', 'not applicable'], c.id).toContain(c.status)
    expect(fp.detail).toBe('Compliant devices: Android OS version is 12, and it needs ≥ 13')
  })
})

describe('Scene 5b: handsets that fail, or cannot be graded on, the other checks', () => {
  const compliant = ruleNamed(policy('sc-device-compliance'), 'Compliant device')

  it('fails an Android 14 phone with no Authenticator installed: an absent signal fails', () => {
    const r = resolveSignIn(t.policies, { appId: 'outlook', personId: 'devon', device: handset({ osVersion: '14', authenticatorVersion: null }) }, env)
    expect(r.decision).toBe('deny')
    expect(fingerprintIn(r, compliant).checks?.find((c) => c.id === 'mo-authenticator')).toMatchObject({ status: 'fail', actual: 'not installed' })
  })

  it('cannot say when the phone’s integrity was not stated, and names both outcomes', () => {
    const r = resolveSignIn(t.policies, { appId: 'outlook', personId: 'devon', device: handset({ osVersion: '14', integrity: undefined }) }, env)
    expect(r.status).toBe('depends')
    expect(r.decision).toBeNull()
    expect(new Set(r.possible.map((o) => o.decision))).toEqual(new Set(['1fa', 'deny']))
    const fp = fingerprintIn(r, compliant)
    expect(fp.status).toBe('unknown')
    expect(fp.missing).toContain('device.integrity')
  })
})

describe('Scene 6: a personal laptop on Google Workspace', () => {
  const r = resolveSignIn(
    t.policies,
    {
      appId: 'google-workspace',
      personId: 'u-sales-2',
      device: windows11({ agentInstalled: false, agentVersion: null, registeredToPerson: false, registeredCount: 0 }),
      risk: risk(12),
    },
    env,
  )

  it('is refused by the last row, because no rule’s corporate-device check can pass', () => {
    expect(r.decidedBy?.policyId).toBe('sc-corporate-devices')
    expect(r.decision).toBe('deny')
    expect(r.trace?.hitIndex).toBeNull()
  })

  it('fails on the Device Agent in every rule', () => {
    for (let i = 0; i < r.trace!.steps.length; i++) {
      expect(fingerprintIn(r, i).checks?.find((c) => c.id === 'agent')?.status, `rule ${i}`).toBe('fail')
    }
  })
})

describe('Scene 7: a third device when the limit is two', () => {
  const third = (over: Partial<SignInDevice>, score = 12) =>
    resolveSignIn(t.policies, { appId: 'google-workspace', personId: 'u-sales-3', device: windows11({ registeredToPerson: false, registeredCount: 2, ...over }), risk: risk(score) }, env)

  it('is refused, and the trace names the device limit rather than "not registered"', () => {
    const r = third({})
    expect(r.decision).toBe('deny')
    const fp = fingerprintIn(r, 0)
    expect(fp.checks?.find((c) => c.id === 'limit')).toMatchObject({ status: 'fail', required: 'at most 2' })
    expect(fp.detail).toContain('limit')
    expect(fp.detail).toBe('Corporate devices: 2 already registered, and the device limit is 2')
  })
})

describe('Scene 7b: the risk bands, on a registered corporate device', () => {
  const at = (score: number) =>
    resolveSignIn(t.policies, { appId: 'google-workspace', personId: 'u-sales-3', device: windows11({ registeredToPerson: true, registeredCount: 2 }), risk: risk(score) }, env)

  it.each([
    [12, '1fa', 0],
    [39, '1fa', 0],
    [40, '2fa', 1],
    [70, '2fa', 1],
    [71, 'deny', 2],
    [86, 'deny', 2],
  ] as const)('scores %i as %s, by rule %i', (score, decision, index) => {
    const r = at(score)
    expect(r.decision).toBe(decision)
    expect(r.trace?.hitIndex).toBe(index)
  })

  it('says beside every risk verdict that Windows collects no risk signals', () => {
    const r = at(48)
    const risky = r.trace!.steps.flatMap((s) => s.conditions).filter((c) => c.typeId === 'device-risk')
    expect(risky.length).toBeGreaterThan(0)
    for (const c of risky) expect(c.caveat).toBe('Risk signals are collected on Android and iOS only, so this score was stated, not measured.')
  })
})

describe('Scene 8: developer tools, office and device checks', () => {
  const arun = (address: string, e = env) =>
    resolveSignIn(t.policies, { appId: 'github', personId: 'arun', network: { address, source: 'typed' }, device: { ...CHIP_DEVICES['Managed (MDM)'], source: 'stated' } }, e)

  it('lets Arun in on one factor from the office on a Windows 11 laptop, by the first rule', () => {
    const r = arun('203.0.113.10')
    expect(r.decidedBy?.policyId).toBe('sc-dev-tools')
    expect(r.decision).toBe('1fa')
    expect(r.trace?.hitIndex).toBe(0)
  })

  it('asks for a push from outside the office, by the second rule', () => {
    const r = arun('192.0.2.130')
    expect(r.decision).toBe('2fa')
    expect(r.trace?.hitIndex).toBe(1)
  })

  it('refuses the office laptop when every device is asked the handset checks (spec D1, the other reading)', () => {
    const r = arun('203.0.113.10', { ...env, deviceMatch: { clientRows: 'every-device' } })
    expect(r.decision).toBe('deny')
    expect(fingerprintIn(r, 0).checks?.find((c) => c.id === 'integrity')?.status).toBe('fail')
  })
})

describe('Scene 9: the chip surfaces, on the showcase (zone rows)', () => {
  const ctx = (userId: string, placeChip: string, device = 'Managed (MDM)', risk = 'Low'): SimContext => ({
    user: SIM_USERS.find((u) => u.id === userId)!,
    place: placeChip,
    device,
    authState: 'Normal returning user',
    risk,
    nowMinutes: 600,
  })

  it('lets Priya in from the office network, where the chip table used to refuse her', () => {
    const w = walk(policy('sc-hrms-office'), ctx('priya', 'Office Network'), env)
    expect(w.decision).toBe('2fa')
    expect(w.hitIndex).toBe(0)
    expect(w.steps[0].reason).toBe('All 1 condition met')
  })

  it('refuses her from outside every zone, by the last row', () => {
    const w = walk(policy('sc-hrms-office'), ctx('priya', 'Outside all zones'), env)
    expect(w.decision).toBe('deny')
    expect(w.hitIndex).toBeNull()
    expect(w.steps[0].reason).toContain('this login is in no zone at all')
  })

  it('agrees with the typed path for every chip origin, on a policy that reads only zones', () => {
    for (const placeChip of ['Office Network', 'Outside all zones', 'Tor exit node', 'Known proxy']) {
      const c = ctx('priya', placeChip)
      const p = policy('sc-hrms-office')
      expect(tracePolicy(p, chipFacts(c, env), env).decision, placeChip).toBe(walk(p, c, env).decision)
    }
  })

  it('lets Arun into the developer tools from the office on a managed laptop, by the first rule', () => {
    const w = walk(policy('sc-dev-tools'), ctx('arun', 'Office Network'), env)
    expect(w.decision).toBe('1fa')
    expect(w.hitIndex).toBe(0)
  })
})

describe('Scene 9: the chip surfaces, on the showcase (device rows)', () => {
  const ctx = (userId: string, device: string, risk = 'Low', place = 'Office Network'): SimContext => ({
    user: SIM_USERS.find((u) => u.id === userId)!,
    place,
    device,
    authState: 'Normal returning user',
    risk,
    nowMinutes: 600,
  })
  const both = (id: string, c: SimContext) => {
    const w = walk(policy(id), c, env)
    expect(tracePolicy(policy(id), chipFacts(c, env), env).decision, `${id} / ${c.device} / ${c.risk}`).toBe(w.decision)
    return w
  }

  it('refuses a Windows 10 laptop the compliance policy’s Windows 11 floor, in the typed sentence', () => {
    const w = both('sc-device-compliance', ctx('priya', 'Known > 90 days'))
    expect(w.decision).toBe('deny')
    expect(w.steps[0].reason).toContain('Windows OS version is 10.0.19045 (assumed), and it needs ≥ 11')
  })

  it('lets a current, locked, untampered iPhone through it on one factor', () => {
    expect(both('sc-device-compliance', ctx('priya', 'Known < 90 days')).decision).toBe('1fa')
  })

  it('reads the corporate-devices bands on a managed laptop: Low, Medium, High', () => {
    const at = (band: string) => both('sc-corporate-devices', ctx('priya', 'Managed (MDM)', band))
    expect([at('Low'), at('Medium'), at('High')].map((w) => [w.decision, w.hitIndex])).toEqual([
      ['1fa', 0],
      ['2fa', 1],
      ['deny', 2],
    ])
  })

  it('agrees with the typed path on every device chip, whatever the origin', () => {
    for (const device of Object.keys(CHIP_DEVICES))
      for (const place of ['Any location', 'Office Network', 'Outside all zones'])
        for (const id of ['sc-device-compliance', 'sc-corporate-devices', 'sc-dev-tools']) both(id, ctx(id === 'sc-dev-tools' ? 'arun' : 'priya', device, 'Medium', place))
  })
})

describe('Scene 10: the day of the week, and daylight saving', () => {
  const monday = (tz?: string) => {
    const c = cond('day', 'is', ['Monday'], undefined, tz ? { tz } : undefined)
    return { c, k: card(c) }
  }
  const lateSunday: SignInFacts = { when: { date: '2026-09-28', time: '01:00', timeZone: 'Asia/Kolkata', source: 'typed' } }

  it('reads 01:00 Monday in Kolkata as Sunday afternoon in New York', () => {
    const { c, k } = monday('America/New_York')
    const r = evalCondition(c, lateSunday, env, k)
    expect(r.status).toBe('fail')
    expect(r.actual).toBe('Sunday in America/New_York')
  })

  it('reads it as Monday in the tenant’s own zone', () => {
    const { c, k } = monday()
    expect(evalCondition(c, lateSunday, env, k).status).toBe('pass')
  })

  it('takes the weekday’s zone from a time window in the same card', () => {
    const d = cond('day', 'is', ['Monday'])
    const w = cond('time', 'between', ['00:00', '23:59'], undefined, { tz: 'America/New_York' })
    expect(evalCondition(d, lateSunday, env, card(d, w)).status).toBe('fail')
  })

  it('follows summer time with a date, and says standard time is used without one', () => {
    const c = cond('time', 'between', ['08:00', '09:00'], undefined, { tz: 'Europe/Berlin' })
    const july: SignInFacts = { when: { date: '2026-07-15', time: '12:00', timeZone: 'Asia/Kolkata', source: 'typed' } }
    const dated = evalCondition(c, july, env)
    expect(dated.status).toBe('pass')
    expect(dated.actual).toBe('08:30 in Europe/Berlin')
    expect(dated.caveat).toBeUndefined()

    const undated = evalCondition(c, { when: { time: '12:00', timeZone: 'Asia/Kolkata', source: 'typed' } }, env)
    expect(undated.status).toBe('fail')
    expect(undated.caveat).toBe('No date was given, so standard time is used.')
  })

  it('is undecided with no date, and says the date would settle it', () => {
    const { c, k } = monday()
    const r = evalCondition(c, { when: { time: '10:00', timeZone: 'Asia/Kolkata', source: 'typed' } }, env, k)
    expect(r.status).toBe('unknown')
    expect(r.missing).toEqual(['date'])
  })

  it('decides a rule on the weekday inside a policy', () => {
    const p: Policy = {
      ...blankPolicy('Weekdays', ['salesforce']),
      status: 'active',
      rules: [rule({ name: 'Monday in New York', when: when(card(monday('America/New_York').c)), decision: 'deny' })],
    }
    expect(tracePolicy(p, lateSunday, env).decision).toBe('1fa')
  })
})

describe('Scene 11: a second factor that is weaker than the attack', () => {
  const stepUp = (methods: string[]): Policy => ({
    ...blankPolicy('Step up', ['salesforce']),
    status: 'active',
    rules: [rule({ name: 'Every sign-in', decision: '2fa', secondFactor: 'specific', secondFactorMethods: methods })],
  })
  const round = (methods: string[], id: string) => runBreakIn(stepUp(methods), env, { deck: TYPED_DECK }).rounds.find((r) => r.challenge.id === id)!

  it('reads 2 factors by SMS as a weaker factor against a relayed sign-in', () => {
    expect(round(['OTP over SMS'], 'aitm-relay').outcome).toBe('weaker-factor')
  })

  it('holds the relay with a passkey', () => {
    expect(round(['FIDO2 / Passkey'], 'aitm-relay').outcome).toBe('held')
  })

  it('holds repeated push prompts with number matching on, and still not the relay', () => {
    expect(round(['miniOrange Push'], 'push-bombing').outcome).toBe('held')
    expect(round(['miniOrange Push'], 'aitm-relay').outcome).toBe('weaker-factor')
  })
})
