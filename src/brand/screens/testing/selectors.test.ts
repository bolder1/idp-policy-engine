import { describe, expect, it } from 'vitest'

import type { Policy } from '../../data'
import { showcaseTenant, showcaseTenantHrmsOn } from '../../fixtures'
import { envOf } from '../tenant-resolver'
import { formForPolicy, patchFor } from './prefill'
import { whichPolicyRows } from './which-policy'
import {
  answerSaid,
  assumeOptions,
  breakInStart,
  assumedPolicy,
  changedWords,
  decisionSig,
  filterSaved,
  liveSentence,
  needsOf,
  nextChange,
  noGlobalDefault,
  outcomeLines,
  pageRoute,
  personRows,
  ruleOf,
  sampleRows,
  savedRows,
  tryResult,
  whichSig,
  whoSaid,
} from './selectors'
import { SAMPLE_SIGN_INS } from './samples'
import { defaultForm, originPatch, typedAddressPatch, type SignInForm } from './sign-in-form'

/* Policy testing's answers on the showcase tenant — the spec's acceptance
   lines (B §8, with the final spec's changes), pinned on the functions the
   views print from.

   Those lines read HRMS deciding, so they run on the tenant once HRMS is
   turned on. The seed opens with HRMS Inactive (Phase 4): `off(HRMS)` below
   is the seed as it opens, and the Assume on scenes are what the page shows
   on it. */

const t = showcaseTenantHrmsOn()
const env = envOf(t)
const TODAY = '2026-09-28'
const HRMS = 'sc-hrms-office'
const base = defaultForm(t.directory.people, t.apps, TODAY)
const form = (patch: Partial<SignInForm> = {}): SignInForm => ({ ...base, ...patch })
const run = (f: SignInForm, policies: readonly Policy[] = t.policies) => tryResult(policies, f, env, t.zones)
const off = (id: string, policies: readonly Policy[] = t.policies) => policies.map((p) => (p.id === id ? { ...p, status: 'inactive' as const } : p))
const policyOf = (id: string) => t.policies.find((p) => p.id === id)!

describe('Try a sign-in', () => {
  it('opens on Kavya Menon, HRMS, from the office today: Allow with 2FA by the office rule', () => {
    expect(base).toMatchObject({ personId: 'u-hr-1', appId: 'hrms', address: '203.0.113.24', origin: 'office', date: TODAY, time: '09:30' })
    expect(base.device).toEqual({ kind: 'none' })
    expect(base.risk).toBe('')
    const r = run(base)
    expect(r.shown.decision).toBe('2fa')
    expect(r.shown.decidedBy?.policyName).toBe('HRMS access from corporate offices')
    expect(ruleOf(r.shown, policyOf(HRMS))?.name).toBe('In a corporate office')
    expect(liveSentence(r.shown, t.policies)).toBe('Allow with 2FA. HRMS access from corporate offices, In a corporate office.')
  })

  it('reads the office rule as a Network line and a Place line, both passing', () => {
    const r = run(base)
    const route = pageRoute(r.shown, policyOf(HRMS), r.facts, env)
    const lines = route.rules[0].evidence.lines
    expect(lines.map((l) => [l.label, l.actual, l.status])).toEqual([
      ['Who', 'Kavya Menon', 'pass'],
      ['Network', '203.0.113.24', 'pass'],
      ['Place', 'Pune (looked up)', 'pass'],
    ])
    expect(route.rules[0].evidence.word).toBe('Matched')
    expect(route.lastRow.word).toBe('Not reached')
    /* Which policy, Who, the rule it matched, the Decision. */
    expect(route.stops).toEqual(['policy', 'who', `rule:${route.rules[0].rule.id}`, 'decision'])
    expect(route.open).toEqual([`rule:${route.rules[0].rule.id}`])
    expect(route.unknown).toBe(false)
    expect(whoSaid(policyOf(HRMS), r.facts, env)).toBe('Human Resources · in audience')
  })

  it('denies from home: the Network line fails, the Place line passes, and IP address is named', () => {
    const f = form(typedAddressPatch('192.0.2.10'))
    const r = run(f)
    expect(r.shown.decision).toBe('deny')
    expect(ruleOf(r.shown, policyOf(HRMS))?.name).toBe('Nothing else matched')
    const route = pageRoute(r.shown, policyOf(HRMS), r.facts, env)
    expect(route.rules[0].evidence.lines.map((l) => [l.label, l.status])).toEqual([
      ['Who', 'pass'],
      ['Network', 'fail'],
      ['Place', 'pass'],
    ])
    expect(route.stops.at(-2)).toBe('last-row')
    const track = nextChange({ run: 1, sig: decisionSig(run(base).shown), form: base, changed: null }, { run: 1, sig: decisionSig(r.shown), form: f })
    expect(changedWords(track.changed)).toBe('Changed by IP address')
  })

  it("can't tell a half-typed address, and says what would settle it", () => {
    const r = run(form(typedAddressPatch('203.0.113')))
    expect(r.issues).toEqual([{ field: 'address', message: 'Enter an IPv4 or IPv6 address' }])
    expect(r.shown.status).toBe('depends')
    expect(outcomeLines(r.shown)).toEqual([
      { decision: '2fa', when: 'if “In a corporate office” matches' },
      { decision: 'deny', when: 'if no rule matches' },
    ])
    expect(needsOf(r.shown)).toEqual([
      { word: 'IP address', field: 'address' },
      { word: 'Place', field: 'place' },
    ])
    expect(answerSaid(r.shown)).toBe("Can't tell · Allow with 2FA or Deny")
    expect(liveSentence(r.shown, t.policies)).toBe("Can't tell. Needs IP address, Place.")
    expect(pageRoute(r.shown, policyOf(HRMS), r.facts, env).unknown).toBe(true)
  })

  it('sends Aisha Khan to the Global Default, with HRMS struck through for its audience', () => {
    const r = run(form({ personId: 'u-sales-1' }))
    expect(r.shown.decision).toBe('1fa')
    expect(r.shown.decidedBy?.policyName).toBe('Global Default Policy')
    const rows = whichPolicyRows(r.shown, t.policies, 'hrms')
    const hrms = rows.on.find((x) => x.policyId === HRMS)!
    expect(hrms.struck).toBe(true)
    expect(hrms.reason).toBe('Not in audience: Human Resources, Finance')
    expect(whoSaid(policyOf(r.shown.decidedBy!.policyId), r.facts, env)).toBe('Everyone')
  })

  it('assumes an inactive policy on, and says what decides today', () => {
    const policies = off(HRMS)
    expect(policies).toEqual(showcaseTenant().policies)
    expect(run(base, policies).shown).toMatchObject({ decision: '1fa', decidedBy: { policyName: 'Global Default Policy' } })
    expect(assumeOptions(policies, 'hrms')).toEqual([{ value: HRMS, label: 'HRMS access from corporate offices', meta: 'Inactive' }])
    const r = run(form({ assumeOn: HRMS }), policies)
    expect(r.shown.decision).toBe('2fa')
    expect(r.today.decision).toBe('1fa')
    expect(r.substitute?.id).toBe(HRMS)
  })

  it('offers nothing to assume where every policy on the application is on', () => {
    expect(assumeOptions(t.policies, 'hrms')).toEqual([])
    expect(assumedPolicy(t.policies, { assumeOn: HRMS, appId: 'hrms' })).toBeUndefined()
  })

  it('ends an assumption when the application moves off the assumed policy', () => {
    const policies = off(HRMS)
    const f = form({ assumeOn: HRMS })
    expect(patchFor(f, { appId: 'outlook' }, policies)).toEqual({ appId: 'outlook', assumeOn: null })
    expect(patchFor(f, { appId: 'hrms' }, policies)).toEqual({ appId: 'hrms' })
    expect(patchFor(f, { personId: 'u-hr-2' }, policies)).toEqual({ personId: 'u-hr-2' })
  })
})

describe('a policy row’s Try a sign-in', () => {
  it('fills in the policy’s application and somebody it is for, and keeps the rest', () => {
    const start = form({ ...originPatch('home'), personId: 'u-sales-1', appId: 'dropbox' })
    const f = formForPolicy(policyOf(HRMS), t.directory.people, start, t.policies)
    /* The first person in its first group, as the board picks. */
    expect(f).toMatchObject({ appId: 'hrms', personId: 'u-hr-1', address: '192.0.2.10', assumeOn: null })
    /* Somebody it is already for stays. */
    expect(formForPolicy(policyOf(HRMS), t.directory.people, form({ personId: 'u-hr-2' }), t.policies).personId).toBe('u-hr-2')
  })

  it('assumes an off policy on, so the answer is its own', () => {
    const policies = off(HRMS)
    const f = formForPolicy(policies.find((p) => p.id === HRMS)!, t.directory.people, form(), policies)
    expect(f.assumeOn).toBe(HRMS)
    expect(run(f, policies).shown.decision).toBe('2fa')
  })

  it('keeps the person and application for the Global Default', () => {
    const gd = t.policies.find((p) => p.isSystem)!
    const start = form({ personId: 'u-sales-1', appId: 'outlook' })
    expect(formForPolicy(gd, t.directory.people, start, t.policies)).toMatchObject({ personId: 'u-sales-1', appId: 'outlook' })
  })
})

describe('Check a person', () => {
  it('gives Kavya one row per application, in the catalogue’s order', () => {
    const rows = personRows(t.policies, t.apps, base, env, t.zones)
    expect(rows.map((r) => r.appId)).toEqual(t.apps.map((a) => a.id))
    const at = (id: string) => rows.find((r) => r.appId === id)!
    expect(at('hrms')).toMatchObject({ policyName: 'HRMS access from corporate offices', ruleName: 'In a corporate office' })
    expect(at('hrms').res.decision).toBe('2fa')
    for (const id of ['outlook', 'dropbox']) {
      expect(at(id).res.status).toBe('depends')
      expect(answerSaid(at(id).res)).toBe("Can't tell · Allow on 1 factor or Deny")
    }
    for (const r of rows.filter((x) => !['hrms', 'outlook', 'dropbox', 'google-workspace', 'github'].includes(x.appId))) {
      expect([r.policyName, r.ruleName, r.res.decision]).toEqual(['Global Default Policy', 'Baseline access', '1fa'])
    }
  })

  it('settles Outlook and Dropbox on an Android 14 phone', () => {
    const rows = personRows(t.policies, t.apps, form({ device: { kind: 'preset', id: 'android-14' } }), env, t.zones)
    for (const id of ['outlook', 'dropbox']) {
      const r = rows.find((x) => x.appId === id)!
      expect([r.res.decision, r.ruleName]).toEqual(['1fa', 'Compliant device'])
    }
  })

  it('says what decides today beside an assumed answer that differs', () => {
    const policies = off(HRMS)
    const f = form({ assumeOn: HRMS })
    const rows = personRows(policies, t.apps, f, env, t.zones, run(f, policies).substitute)
    const hrms = rows.find((r) => r.appId === 'hrms')!
    expect(hrms.res.decision).toBe('2fa')
    expect(hrms.today?.decision).toBe('1fa')
    expect(rows.find((r) => r.appId === 'salesforce')?.today).toBeNull()
  })
})

describe('Saved sign-ins', () => {
  it('passes all six seeded rows', () => {
    const rows = savedRows(t.savedSignIns, t.policies, env)
    expect(rows).toHaveLength(6)
    expect(rows.every((r) => r.result === 'pass')).toBe(true)
    /* Within a result, the strongest promise first. */
    expect(rows.map((r) => r.saved.level)).toEqual(['protected', 'protected', 'must-pass', 'must-pass', 'note', 'note'])
  })

  it('puts the failures first with HRMS turned off, Must pass before Note', () => {
    const rows = savedRows(t.savedSignIns, off(HRMS), env)
    expect(rows.slice(0, 2).map((r) => [r.saved.name, r.result])).toEqual([
      ['Kavya Menon in the office', 'fail'],
      ['Neha Kapoor at home', 'fail'],
    ])
    expect(rows.slice(2).every((r) => r.result === 'pass')).toBe(true)
  })

  it('judges each on the assumed answer, and says what decides today where that differs', () => {
    const policies = off(HRMS)
    const substitute = assumedPolicy(policies, { assumeOn: HRMS, appId: 'hrms' })
    expect(substitute?.id).toBe(HRMS)
    const rows = savedRows(t.savedSignIns, policies, env, substitute)
    expect(rows.every((r) => r.result === 'pass')).toBe(true)
    const kavya = rows.find((r) => r.saved.id === 'ssi-kavya-office')!
    expect(kavya.res.decision).toBe('2fa')
    expect(kavya.today).toMatchObject({ decision: '1fa', decidedBy: { policyName: 'Global Default Policy' } })
    expect(rows.find((r) => r.saved.id === 'ssi-vikram-laptop')?.today).toBeNull()
  })

  it("never passes a sign-in it can't tell", () => {
    const blind = { ...t.savedSignIns[0], id: 'x', facts: { ...t.savedSignIns[0].facts, network: undefined } }
    const [row] = savedRows([blind], t.policies, env)
    expect(row.res.status).toBe('depends')
    expect(row.result).toBe('unknown')
  })

  it('filters by name and level', () => {
    const rows = savedRows(t.savedSignIns, t.policies, env)
    expect(filterSaved(rows, 'hrms', 'all').map((r) => r.saved.id).sort()).toEqual(['ssi-aisha-hrms', 'ssi-ravi-hrms'])
    expect(filterSaved(rows, '', 'protected').map((r) => r.saved.id).sort()).toEqual(['ssi-ravi-hrms', 'ssi-vikram-laptop'])
    expect(filterSaved(rows, 'nobody', 'all')).toEqual([])
  })
})

describe('the Break-in test’s first policy', () => {
  it('is the policy deciding Try’s sign-in: HRMS for Kavya in the office', () => {
    expect(breakInStart(t.policies, base, env, t.zones)).toBe(HRMS)
  })

  it('is the assumed policy when Try assumes one on', () => {
    const policies = off('sc-dev-tools')
    expect(breakInStart(policies, form({ assumeOn: 'sc-dev-tools', appId: 'github' }), env, t.zones)).toBe('sc-dev-tools')
  })

  it('is the first there is when the Global Default decides', () => {
    const tools = policyOf('sc-dev-tools')
    const policies = [tools, ...t.policies.filter((p) => p.id !== tools.id)]
    const aisha = form({ personId: 'u-sales-1' })
    expect(run(aisha, policies).today.decidedBy?.isGlobalDefault).toBe(true)
    expect(breakInStart(policies, aisha, env, t.zones)).toBe('sc-dev-tools')
  })
})

describe('Sample sign-ins', () => {
  it('answers each sample live, with its person and application by name', () => {
    const rows = sampleRows(SAMPLE_SIGN_INS, t.policies, env)
    expect(rows.find((r) => r.sample.id === 'medium-risk')).toMatchObject({ personName: 'Emily Carter', appName: 'Google Workspace' })
    expect(answerSaid(rows.find((r) => r.sample.id === 'no-address')!.res)).toBe("Can't tell · Allow with 2FA or Deny")
  })
})

describe('the answer without a global default', () => {
  it('says so, rather than a person or an application', () => {
    const policies = t.policies.filter((p) => !p.isSystem).map((p) => (p.id === HRMS ? { ...p, status: 'inactive' as const } : p))
    const r = run(form({ personId: 'u-sales-1' }), policies)
    expect(noGlobalDefault(r.shown)).toBe(true)
    expect(liveSentence(r.shown, policies)).toBe("Can't tell. No global default policy.")
  })
})

describe('Changed by', () => {
  it('names nothing after a run', () => {
    const s = decisionSig(run(base).shown)
    const first = nextChange({ run: 1, sig: s, form: base, changed: 'address' }, { run: 2, sig: s, form: base })
    expect(first.changed).toBeNull()
  })

  it('names the field only until the next commit: an edit that leaves the answer clears it', () => {
    /* 192.0.2.10 moves Kavya to Deny, and names the address… */
    const home = form(typedAddressPatch('192.0.2.10'))
    const deny = decisionSig(run(home).shown)
    const named = nextChange({ run: 1, sig: decisionSig(run(base).shown), form: base, changed: null }, { run: 1, sig: deny, form: home })
    expect(changedWords(named.changed)).toBe('Changed by IP address')
    /* …a render with nothing new keeps it… */
    expect(nextChange(named, { run: 1, sig: deny, form: home })).toBe(named)
    /* …and a device change that is still Deny does not credit the address with it. */
    const device = { ...home, device: { kind: 'preset' as const, id: 'android-14' as const } }
    expect(decisionSig(run(device).shown)).toBe(deny)
    expect(nextChange(named, { run: 1, sig: deny, form: device }).changed).toBeNull()
  })
})

describe('the Which policy stage', () => {
  it('changes with who decides and where the others stand, not with the time', () => {
    const s = whichSig(run(base).shown)
    expect(whichSig(run(form({ time: '10:00' })).shown)).toBe(s)
    expect(whichSig(run(form({ personId: 'u-sales-1' })).shown)).not.toBe(s)
  })
})
