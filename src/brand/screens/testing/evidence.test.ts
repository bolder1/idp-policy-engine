import { describe, expect, it } from 'vitest'

import { card, cond, rule, when, type Policy } from '../../data'
import { showcaseTenantHrmsOn } from '../../fixtures'
import { tracePolicy } from '../simulate'
import { envOf, resolveSignIn } from '../tenant-resolver'
import { CONDITION_WORDS, LAST_ROW, evidenceOf, lineText, placeActual, type CardEvidence, type EvidenceLine } from './evidence'
import { defaultBoardForm, factsOf, originPatch, typedAddressPatch, type SignInForm } from './sign-in-form'

/* The evidence lines, on the showcase tenant, for the scenes the testing specs
   quote word for word (Spec A §8, Spec B §8 as the final spec corrects them).
   What is pinned is the text a card prints, so a change to the trace's words
   shows up here as a scene that reads differently. */

/* These scenes read HRMS deciding, so they run on the tenant once it is
   turned on; the seed opens with HRMS Inactive (Phase 4). */
const t = showcaseTenantHrmsOn()
const env = envOf(t)
const TODAY = '2026-09-28'
const policy = (id: string) => t.policies.find((p) => p.id === id)!
const hrms = policy('sc-hrms-office')
const devices = policy('sc-corporate-devices')
const compliance = policy('sc-device-compliance')
const board = (p: Policy, patch: Partial<SignInForm> = {}) => ({ ...defaultBoardForm(p, t.directory.people, t.apps, TODAY), ...patch })

/** The deciding policy's cards for a form, as "label | text | word" per line. */
function cards(p: Policy, form: SignInForm): Record<string, CardEvidence> {
  const { facts } = factsOf(form, t.zones)
  const res = resolveSignIn(t.policies, facts, env)
  return evidenceOf(p, res.decidedBy?.policyId === p.id ? res.trace : null, facts, env)
}
const said = (l: EvidenceLine) => `${l.label} | ${lineText(l)} | ${CONDITION_WORDS[l.status]}`
const first = (p: Policy) => p.rules[0].id

describe('HR in the office, the default run', () => {
  const ev = cards(hrms, board(hrms))

  it('matches rule 1 with a Who, a Network and a Place line', () => {
    expect(ev[first(hrms)].word).toBe('Matched')
    expect(ev[first(hrms)].lines.map(said)).toEqual([
      'Who | Kavya Menon · Human Resources, Finance | Passes',
      'Network | 203.0.113.24 · in 203.0.113.0/24, 198.51.100.0/24 | Passes',
      'Place | Pune (looked up) · within 25 km of Pune, or Bengaluru, Mumbai | Passes',
    ])
  })

  it('never reaches the last row', () => {
    expect(ev[LAST_ROW]).toEqual({ word: 'Not reached', state: 'not-reached', lines: [] })
  })
})

describe('an address typed from home', () => {
  it('fails the network half and passes the place, so the last row decides', () => {
    const ev = cards(hrms, board(hrms, typedAddressPatch('192.0.2.50')))
    expect(ev[first(hrms)].word).toBe('No match')
    expect(ev[first(hrms)].lines.slice(1).map(said)).toEqual([
      'Network | 192.0.2.50 · in 203.0.113.0/24, 198.51.100.0/24 | Fails',
      'Place | Pune (looked up) · within 25 km of Pune, or Bengaluru, Mumbai | Passes',
    ])
    expect(ev[LAST_ROW].word).toBe('Matched')
  })

  it("reads an address that is not one as Can't tell, naming the row that settles it", () => {
    const ev = cards(hrms, board(hrms, typedAddressPatch('192.0.2.999')))
    const [, network, place] = ev[first(hrms)].lines
    expect(ev[first(hrms)].word).toBe("Can't tell")
    expect([network.status, network.tip]).toEqual(['unknown', 'Needs: IP address'])
    expect([place.status, place.tip]).toEqual(['unknown', 'Needs: Place'])
    /* Whether the last row is reached cannot be told either. */
    expect(ev[LAST_ROW].word).toBe("Can't tell")
  })

  it('says an anonymiser has no place, and still fails on the network', () => {
    const ev = cards(hrms, board(hrms, originPatch('tor')))
    expect(ev[first(hrms)].word).toBe('No match')
    expect(ev[first(hrms)].lines.slice(1).map(said)).toEqual([
      'Network | 192.0.2.66 · in 203.0.113.0/24, 198.51.100.0/24 | Fails',
      "Place | No place · within 25 km of Pune, or Bengaluru, Mumbai | Can't tell",
    ])
  })

  it('names a point on the distance ruler by where it was measured from', () => {
    const ev = cards(hrms, board(hrms, { place: { kind: 'distance', zoneId: 'corp-offices', rangeIndex: 0, km: 30 } }))
    expect(said(ev[first(hrms)].lines[2])).toBe('Place | 30 km from Pune · within 25 km of Pune, or Bengaluru, Mumbai | Fails')
  })
})

describe('somebody the policy is not for', () => {
  it('reads every card of the policy they never met as Not reached', () => {
    const ev = cards(hrms, board(hrms, { personId: 'u-sales-1' }))
    expect(Object.values(ev).map((c) => c.word)).toEqual(['Not reached', 'Not reached'])
    expect(Object.values(ev).every((c) => c.lines.length === 0)).toBe(true)
  })

  it('fails the Who line with the reason as its tip', () => {
    /* Asked of the policy directly, as a trace can be: the audience admits
       Finance, the rule's who does not. */
    const narrow: Policy = { ...hrms, rules: [{ ...hrms.rules[0], who: { groupIds: ['hr'], userIds: [] } }] }
    const facts = factsOf(board(hrms, { personId: 'u-fin-2' }), t.zones).facts
    const who = evidenceOf(narrow, tracePolicy(narrow, facts, env), facts, env)[first(hrms)].lines[0]
    expect([who.label, who.required, who.status, who.tip]).toEqual(['Who', 'Human Resources', 'fail', 'Not Human Resources'])
  })
})

describe('a rule switched off', () => {
  it('says so and asks nothing', () => {
    const off: Policy = { ...hrms, rules: [{ ...hrms.rules[0], enabled: false }] }
    const facts = factsOf(board(hrms), t.zones).facts
    const ev = evidenceOf(off, resolveSignIn(t.policies, facts, env, { substitute: off }).trace, facts, env)
    expect(ev[first(hrms)]).toEqual({ word: 'Switched off', state: 'off', lines: [] })
    expect(ev[LAST_ROW].word).toBe('Matched')
  })
})

describe('device profiles', () => {
  const priya = (device: SignInForm['device']) => board(compliance, { personId: 'priya', appId: 'outlook', device })

  it('sums a profile and lists only the check that failed', () => {
    const ev = cards(compliance, priya({ kind: 'preset', id: 'android-12' }))
    expect(ev[first(compliance)].word).toBe('No match')
    expect(ev[first(compliance)].lines.map(said)).toEqual([
      'Device profile | Compliant devices · 3 of 4 checks pass | Fails',
      'Android OS version | 12 · ≥ 13 | Fails',
    ])
  })

  it("lists a check nobody stated as Can't tell, needing the device", () => {
    const android14 = factsOf(priya({ kind: 'preset', id: 'android-14' }), t.zones).facts.device!
    const ev = cards(compliance, priya({ kind: 'custom', facts: { ...android14, integrity: undefined } }))
    const lines = ev[first(compliance)].lines
    expect(ev[first(compliance)].word).toBe("Can't tell")
    expect(lines.map(said)).toEqual([
      "Device profile | Compliant devices · 3 of 4 checks pass | Can't tell",
      "Device integrity | not stated · Not rooted, jailbroken or tampered | Can't tell",
    ])
    expect(lines[1].tip).toBe('Needs: Device')
    expect(ev[LAST_ROW].word).toBe("Can't tell")
  })

  it('keeps a device risk condition one line, with its caveat on a laptop', () => {
    const emily = board(devices, { personId: 'u-sales-3', risk: '48' })
    const lines = cards(devices, emily)[devices.rules[0].id].lines
    const risk = lines.find((l) => l.label === 'Device risk score')!
    expect(said(risk)).toBe('Device risk score | 48 · below 40 | Fails')
    expect(risk.tip).toMatch(/^Risk signals are collected on Android and iOS only/)
  })
})

describe('a negated zone', () => {
  it('stays one line in the catalogue label', () => {
    const outside: Policy = {
      ...hrms,
      rules: [rule({ name: 'Outside the office', when: when(card(cond('zone', 'not in zone', ['corp-offices']))), decision: 'deny' })],
    }
    const facts = factsOf(board(hrms), t.zones).facts
    const ev = evidenceOf(outside, tracePolicy(outside, facts, env), facts, env)
    const lines = ev[outside.rules[0].id].lines
    expect(lines).toHaveLength(1)
    expect([lines[0].label, lines[0].status]).toEqual(['Network zone', 'fail'])
  })
})

describe('the place, as the Place row says it', () => {
  it('says looked up, no place, not in the table and not stated apart', () => {
    expect(placeActual({ network: { address: '203.0.113.24', source: 'stated' } })).toBe('Pune (looked up)')
    expect(placeActual({ network: { address: '192.0.2.66', source: 'stated' } })).toBe('No place')
    expect(placeActual({ network: { address: '10.0.0.1', source: 'typed' } })).toBe('Not in the sample table')
    expect(placeActual({})).toBe('Not stated')
  })
})
