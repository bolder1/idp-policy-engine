import { describe, expect, it } from 'vitest'

import { audienceOf, blankPolicy, conditionType, rule, type Policy } from '../data'
import { showcaseTenant } from '../fixtures'
import { buildTemplate } from './board/apply-template'
import { DECK, TYPED_DECK, applyFix, classifyAttempt, proposeAttemptFix, proposeFactorFix, proposeFix, ruleFromFix, runBreakIn, userOf, type FixSpec, type Round } from './gauntlet'
import { lookUpAddress } from './geo-fixture'
import { envOf } from './tenant-resolver'

/* -----------------------------------------------------------------------------
   The break-in test on typed sign-ins: counts, not a grade.

   What the chip deck could not say, pinned: whose sign-in it was (a hostile
   one let through is a breach; an ordinary one refused is somebody who cannot
   work), and how strong the second factor was. And the property that makes a
   suggested fix worth offering at all — every id it names is one the tenant
   has, so the rule it builds can fire.
   -------------------------------------------------------------------------- */

const t = showcaseTenant()
const env = envOf(t)
const stored = (id: string) => t.policies.find((p) => p.id === id)!
const open = (over: Partial<Policy> = {}): Policy => ({ ...blankPolicy('Open', ['salesforce']), status: 'active', ...over })
const threatIds = TYPED_DECK.filter((c) => c.kind === 'threat').map((c) => c.id)
const legitIds = TYPED_DECK.filter((c) => c.kind === 'legit').map((c) => c.id)

describe('classifyAttempt', () => {
  const threat = { kind: 'threat' as const }
  const legit = { kind: 'legit' as const }

  it('reads a weaker result by whose sign-in it was', () => {
    expect(classifyAttempt(threat, 'deny', '1fa', null)).toBe('got-through')
    expect(classifyAttempt(legit, '2fa', '1fa', null)).toBe('less-than-asked')
  })

  it('locks an ordinary person out whenever they are denied, whatever they asked for', () => {
    expect(classifyAttempt(legit, '2fa', 'deny', null)).toBe('locked-out')
    expect(classifyAttempt(legit, '1fa', 'deny', null)).toBe('locked-out')
    expect(classifyAttempt(legit, '1fa', '2fa', 'standard')).toBe('extra-prompts')
  })

  it('holds when an attacker is stopped harder than asked', () => {
    expect(classifyAttempt(threat, '2fa', 'deny', null)).toBe('held')
  })

  it('reads 2 factors below the card’s weakest acceptable factor as a weaker factor', () => {
    const relay = { kind: 'threat' as const, minFactor: 'phishing-resistant' as const }
    expect(classifyAttempt(relay, '2fa', '2fa', 'standard')).toBe('weaker-factor')
    expect(classifyAttempt(relay, '2fa', '2fa', 'phishing-resistant')).toBe('held')
    expect(classifyAttempt(relay, '2fa', '2fa', null)).toBe('weaker-factor')
    expect(classifyAttempt(threat, '2fa', '2fa', 'below-weak')).toBe('held')
  })
})

describe('the typed deck', () => {
  it('is the thirteen chip cards and two more, each once', () => {
    expect(TYPED_DECK).toHaveLength(15)
    expect(new Set(TYPED_DECK.map((c) => c.id)).size).toBe(15)
    expect(TYPED_DECK.map((c) => c.id)).toEqual(expect.arrayContaining(DECK.map((c) => c.id)))
    expect(TYPED_DECK.find((c) => c.id === 'push-bombing')).toMatchObject({ kind: 'threat', minFactor: 'standard', mitre: 'T1621' })
    expect(TYPED_DECK.find((c) => c.id === 'aitm-relay')).toMatchObject({ kind: 'threat', minFactor: 'phishing-resistant' })
  })

  it('keeps each chip card’s words and expectation', () => {
    for (const c of DECK) {
      const typed = TYPED_DECK.find((x) => x.id === c.id)!
      expect({ name: typed.name, kind: typed.kind, want: typed.want }, c.id).toEqual({ name: c.name, kind: c.kind, want: c.want })
    }
  })

  it('signs in from addresses the geo fixture knows, on a Monday in Kolkata', () => {
    for (const c of TYPED_DECK) {
      if (c.facts.network) expect(lookUpAddress(c.facts.network.address), c.id).toBeDefined()
      expect(c.facts.when).toMatchObject({ date: '2026-09-28', timeZone: 'Asia/Kolkata' })
      expect(c.facts.device?.source, c.id).toBe('stated')
    }
  })
})

/* The test that fails if a deck, or a fix it would offer, names something the
   showcase tenant does not have. */
describe('every id a deck names exists in the showcase tenant', () => {
  const zones = new Set(t.zones.map((z) => z.id))
  const profiles = new Set(t.fingerprints.map((p) => p.id))
  const groups = new Set(t.groups.map((g) => g.id))
  const people = new Set(t.directory.people.map((u) => u.id))
  const missingFrom = (spec: FixSpec): string[] => [
    ...spec.conditions.flatMap((c) => {
      const kind = conditionType(c.typeId).valueKind
      return c.values.filter((v) => (kind === 'zone' && !zones.has(v)) || (kind === 'fingerprint' && !profiles.has(v)))
    }),
    ...(spec.who?.groupIds ?? []).filter((g) => !groups.has(g)),
    ...(spec.who?.userIds ?? []).filter((u) => !people.has(u)),
  ]

  it('holds for every typed card: its person, and every zone, profile and group its fix names', () => {
    for (const c of TYPED_DECK) {
      expect(people.has(c.personId), `${c.id} person ${c.personId}`).toBe(true)
      if (c.fix) expect(missingFrom(c.fix), `${c.id} fix`).toEqual([])
    }
  })

  it('holds for the chip deck’s people', () => {
    for (const c of DECK) expect(people.has(c.userId), `${c.id} person ${c.userId}`).toBe(true)
  })

  it('holds for every fix the chip deck would offer here: one that names a missing id is withheld', () => {
    let offered = 0
    for (const c of DECK) {
      if (!c.fix) continue
      const round: Round = { challenge: c, user: userOf(c.userId), want: c.want, decision: '1fa', outcome: 'breach', hitIndex: null, hitName: null }
      const fix = proposeFix(round, open(), env)
      if (missingFrom(c.fix).length > 0) expect(fix, `${c.id} names ${missingFrom(c.fix).join(', ')}`).toBeNull()
      else {
        expect(fix, c.id).not.toBeNull()
        offered += 1
      }
    }
    /* Not vacuous: two of the chip deck's fixes name nothing but a group and
       a score, and are still offered. */
    expect(offered).toBe(2)
  })
})

describe('the typed fixes', () => {
  it('each close their own card on an empty policy that governs everyone', () => {
    for (const c of TYPED_DECK) {
      if (!c.fix) continue
      const before = runBreakIn(open(), env, { deck: [c] }).rounds[0]
      expect(before.outcome, `${c.id} leaks first`).not.toBe('held')
      const fixed = open({ rules: [ruleFromFix(c.fix, c.want)] })
      expect(runBreakIn(fixed, env, { deck: [c] }).rounds[0].outcome, `${c.id} closed by its own fix`).toBe('held')
    }
  })

  it('use catalogue attributes the pickers offer, with operators those attributes list', () => {
    for (const c of TYPED_DECK) {
      for (const x of c.fix?.conditions ?? []) {
        const type = conditionType(x.typeId)
        expect(type.id, `${c.id} ${x.typeId}`).toBe(x.typeId)
        expect(type.soon, `${c.id} ${x.typeId}`).toBeFalsy()
        expect(type.operators, `${c.id} ${x.typeId}`).toContain(x.operator)
      }
    }
  })

  it('never propose a group or user condition — people are a who', () => {
    for (const c of TYPED_DECK) for (const x of c.fix?.conditions ?? []) expect(['group', 'user'], c.id).not.toContain(x.typeId)
  })
})

describe('runBreakIn', () => {
  it('counts an empty policy’s leaks by whose they are', () => {
    const r = runBreakIn(open(), env)
    expect(r.rounds).toHaveLength(15)
    expect(r.counts.gotThrough).toBe(threatIds.length)
    expect(r.counts.lessThanAsked).toBe(legitIds.filter((id) => TYPED_DECK.find((c) => c.id === id)!.want !== '1fa').length)
    expect(r.counts.held).toBe(2)
    expect(r.rounds.filter((x) => x.outcome === 'got-through').every((x) => x.challenge.kind === 'threat')).toBe(true)
    expect(r.rounds.filter((x) => x.outcome === 'less-than-asked').every((x) => x.challenge.kind === 'legit')).toBe(true)
  })

  it('reads a department-wide Deny as locking that department out, and skips everybody else by name', () => {
    const financeDeny = open({ audience: audienceOf(['finance']), rules: [rule({ name: 'Deny Finance', decision: 'deny' })] })
    const r = runBreakIn(financeDeny, env)
    expect(r.counts.lockedOut).toBeGreaterThan(0)
    expect(r.counts.gotThrough).toBe(0)
    expect(r.rounds.every((x) => x.challenge.personId === 'priya')).toBe(true)
    expect(r.counts.skipped).toBe(TYPED_DECK.filter((c) => c.personId !== 'priya').length)
    expect(r.skipped[0].audience).toBe('Finance')
  })

  it('will not score a card a missing fact could turn either way', () => {
    const template = t.scenarios.find((s) => s.id === 'st-office')!
    const officeOnly = open({ rules: buildTemplate(template, t.directory.people, { zones: t.zones, fingerprints: t.fingerprints }).rules })
    const roaming = runBreakIn(officeOnly, env).rounds.find((x) => x.challenge.id === 'roaming-unknown-origin')!
    expect(roaming.outcome).toBe('undecided')
    expect(new Set(roaming.outcomes)).toEqual(new Set(['locked-out', 'less-than-asked']))
    expect(runBreakIn(officeOnly, env).counts.undecided).toBeGreaterThan(0)
  })

  it('finds nothing getting through the HRMS office policy, and one person it locks out', () => {
    const r = runBreakIn(stored('sc-hrms-office'), env)
    expect(r.rounds.length).toBeGreaterThan(0)
    expect(r.counts.gotThrough).toBe(0)
    expect(r.counts.weakerFactor).toBe(0)
    expect(r.counts.lockedOut).toBe(1)
    /* Finance from home: HRMS refuses anywhere but an office. */
    expect(r.rounds.find((x) => x.outcome === 'locked-out')?.challenge.id).toBe('finance-home')
    expect(r.skipped[0].audience).toBe('Human Resources, Finance')
  })

  it('lets the tenant overrule a card, and recomputes', () => {
    const before = runBreakIn(open(), env)
    const after = runBreakIn(open(), env, { overrides: { 'tor-exec': '1fa' } })
    expect(after.counts.gotThrough).toBe(before.counts.gotThrough - 1)
    expect(after.rounds.find((x) => x.challenge.id === 'tor-exec')?.outcome).toBe('held')
  })

  it('reads device health on every device when asked to, so the office laptop is refused', () => {
    const tools = stored('sc-dev-tools')
    const office = (match?: { clientRows: 'handset' | 'every-device' }) =>
      runBreakIn(tools, env, { match }).rounds.find((x) => x.challenge.id === 'office-regular')!
    expect(office().outcome).toBe('held')
    expect(office({ clientRows: 'every-device' }).outcome).toBe('locked-out')
  })

  it('names the deciding rule’s second factor when it decides 2 factors', () => {
    const r = runBreakIn(stored('sc-hrms-office'), env).rounds.find((x) => x.challenge.id === 'first-login')!
    expect(r.decision).toBe('2fa')
    expect(r.factor).toBe('standard')
  })
})

/* The typed deck's repairs: a rule for a round let through with less than it
   asked, a stronger second factor for a round held on a weak one, and nothing
   for a round that came back stricter — closing that would mean loosening. */
describe('proposeAttemptFix', () => {
  it('closes every typed card that names a fix, on an open policy that governs everyone', () => {
    let offered = 0
    for (const c of TYPED_DECK) {
      if (!c.fix) continue
      const policy = open()
      const round = runBreakIn(policy, env, { deck: [c] }).rounds[0]
      const fix = proposeAttemptFix(round, policy, env)
      expect(fix, c.id).not.toBeNull()
      const fixed = { ...policy, rules: applyFix(policy.rules, fix!) }
      expect(runBreakIn(fixed, env, { deck: [c] }).rounds[0].outcome, `${c.id} closed`).toBe('held')
      offered += 1
    }
    expect(offered).toBe(TYPED_DECK.filter((c) => c.fix).length)
  })

  it('offers nothing for a lockout, extra prompts or a held round', () => {
    const r = runBreakIn(stored('sc-hrms-office'), env)
    const lock = r.rounds.find((x) => x.outcome === 'locked-out')!
    expect(lock.challenge.fix).toBeDefined()
    expect(proposeAttemptFix(lock, stored('sc-hrms-office'), env)).toBeNull()
    for (const held of r.rounds.filter((x) => x.outcome === 'held')) expect(proposeAttemptFix(held, stored('sc-hrms-office'), env)).toBeNull()
  })

  it('withholds a fix that names a zone the tenant does not have', () => {
    const card = TYPED_DECK.find((c) => c.id === 'proxy-finance')!
    const round = runBreakIn(open(), env, { deck: [card] }).rounds[0]
    expect(proposeAttemptFix(round, open(), env)).not.toBeNull()
    const noIndia = envOf({ ...t, zones: t.zones.filter((z) => z.id !== 'india') })
    expect(proposeAttemptFix(round, open(), noIndia)).toBeNull()
  })
})

describe('proposeFactorFix', () => {
  it('asks the relay’s deciding rule on Developer tools for FIDO2 / Passkey', () => {
    const tools = stored('sc-dev-tools')
    const relay = runBreakIn(tools, env).rounds.find((x) => x.challenge.id === 'aitm-relay')!
    expect(relay.outcome).toBe('weaker-factor')
    expect(proposeFactorFix(relay, tools, t.methods)).toEqual({ ruleIndex: 1, methods: ['FIDO2 / Passkey'] })
  })

  it('offers nothing when no method the tenant has on is strong enough', () => {
    const tools = stored('sc-dev-tools')
    const relay = runBreakIn(tools, env).rounds.find((x) => x.challenge.id === 'aitm-relay')!
    expect(proposeFactorFix(relay, tools, t.methods.filter((m) => m.name !== 'FIDO2 / Passkey'))).toBeNull()
  })

  it('offers nothing for a round that is not a weaker factor', () => {
    const r = runBreakIn(stored('sc-hrms-office'), env)
    for (const x of r.rounds) expect(proposeFactorFix(x, stored('sc-hrms-office'), t.methods)).toBeNull()
  })
})

describe('an accepted weaker factor', () => {
  it('is held, and the rest of the deck is read as before', () => {
    const tools = stored('sc-dev-tools')
    const before = runBreakIn(tools, env)
    const after = runBreakIn(tools, env, { factorOk: new Set(['aitm-relay']) })
    expect(before.counts.weakerFactor).toBe(1)
    expect(after.counts.weakerFactor).toBe(0)
    expect(after.rounds.find((x) => x.challenge.id === 'aitm-relay')?.outcome).toBe('held')
    expect({ ...after.counts, held: 0, weakerFactor: 0 }).toEqual({ ...before.counts, held: 0, weakerFactor: 0 })
  })
})
