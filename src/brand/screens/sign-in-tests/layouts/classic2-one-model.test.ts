import { describe, expect, it } from 'vitest'

import type { Policy } from '../../../data'
import { showcaseTenant } from '../../../fixtures'
import { runColumns, type ColumnSpec } from '../../board/try-sign-in'
import { envOf } from '../../tenant-resolver'
import { rowsRead } from '../../testing/rows-read'
import { factsOf, type SignInForm } from '../../testing/sign-in-form'
import { engineRun, type EngineRun } from '../engine-run'
import { ONE_POLICY_CARD } from '../phase'
import { emptyDraft, forRun, withDefaults } from '../sign-in-card'
import { briefOf, type BriefInput } from './brief-model'
import { arrivals, cardsAt, chainCardOf, onCard, outcomeView, ruleRowState, walkEnd, workingOn } from './classic2-model'
import {
  ONE_ALSO_RULE,
  ONE_KICKER,
  ONE_NO_POLICY,
  ONE_NO_RULE,
  ONE_READING,
  noSignInPolicy,
  oneAlso,
  oneGdFoot,
  oneHead,
  oneReasonWords,
  oneRowBadge,
  oneRowWord,
  oneWhy,
  outcomeMetaOne,
  outsideOf,
} from './classic2-one-model'

/* -----------------------------------------------------------------------------
   ONE POLICY, ONE CARD (phase.ts ONE_POLICY_CARD; owner, 20 Oct 2026: "only one
   policy per app, mostly. So we can merge the whole thing — the policy, and add
   their rules inside, so maybe one card"). The merged Policy card's words, over
   REAL runs of the showcase tenant: why the card is the policy it is, its head,
   its rows' outcomes and words, its foot, the Outcome's line under it, and the
   chain's cards with no rule card. The states a seed does not have (a monitoring
   or draft policy on the application, a second policy on one) are made by
   changing a copy of the tenant, never the engine.
   -------------------------------------------------------------------------- */

const TODAY = '2026-10-02'
const t = showcaseTenant()
const env = envOf(t)
const lib = { zones: t.zones, fingerprints: t.fingerprints }
const AS_IT_STANDS: ColumnSpec = { id: 'live', label: 'As the tenant stands', tip: 'Every policy as saved' }

function planOf(personName: string, appName: string, policies: readonly Policy[] = t.policies, patch: Partial<SignInForm> = {}): EngineRun {
  const person = t.directory.people.find((p) => p.name === personName)
  const app = t.apps.find((a) => a.name === appName)
  if (!person || !app) throw new Error(`no ${personName} or ${appName} in the showcase`)
  const rows = rowsRead(policies, null, app.id, lib)
  const base: SignInForm = { ...emptyDraft(TODAY, '09:30'), personId: person.id, appId: app.id }
  const form = { ...forRun(withDefaults(base, rows, [], TODAY, '09:30'), rows), ...patch } as SignInForm
  const { facts } = factsOf(form, t.zones)
  const res = runColumns([AS_IT_STANDS], policies, facts, env)[0].resolution
  return engineRun({ res, policies, form, facts, env, ctx: { people: t.directory.people, apps: t.apps, zones: t.zones, rows }, intro: 'none' })
}
const withStatus = (id: string, status: Policy['status']) => t.policies.map((p) => (p.id === id ? { ...p, status } : p))
const last = (plan: EngineRun) => plan.steps.length - 1
const GD = t.policies.find((p) => p.isSystem && p.type === 'App Access')!

/* The seeds the owner's own screens name (codemap, 20 Oct 2026). */
const AISHA = planOf('Aisha Khan', 'Google Workspace')
const HRMS = planOf('Sanjay Bhatt', 'HRMS')
const SALESFORCE = planOf('Maya Iyer', 'Salesforce')
/* Priya is outside Box access (Engineering and Design): the Global Default takes her sign-in. */
const OUTSIDE = planOf('Priya Sharma', 'Box')
/* Maya is in Engineering and Finance: rule 2 decides AWS, and a later rule also applies with another answer. */
const CONFLICT = planOf('Maya Iyer', 'AWS Console')
const DEPENDS = planOf('Arun Patel', 'GitHub Enterprise', t.policies, { device: { kind: 'none' } } as Partial<SignInForm>)

describe('the flag', () => {
  it('is on, as a named flag', () => {
    expect(ONE_POLICY_CARD).toBe(true)
  })
})

describe('why the card is the policy it is (oneWhy)', () => {
  it("the application's own policy decides: the card is it, and no reason is said", () => {
    expect(oneWhy(AISHA)).toEqual({ kind: 'own', policyId: 'sc-corporate-devices', name: 'Access the app through corporate devices only' })
    expect(oneReasonWords(oneWhy(AISHA), AISHA.appName)).toBeNull()
  })

  it('an inactive policy on the application: the Global Default decides, and the line says the policy is inactive — never "No policy covers"', () => {
    const why = oneWhy(HRMS)
    expect(HRMS.decider?.isGlobalDefault).toBe(true)
    expect(why).toEqual({ kind: 'inactive', policyId: 'sc-hrms-office', name: 'HRMS access from corporate offices' })
    const w = oneReasonWords(why, HRMS.appName)
    expect(w && `${w.before}${w.name}${w.after}`).toBe('HRMS access from corporate offices · Inactive')
    expect(oneHead(HRMS, last(HRMS)).title).toBe(GD.name)
    expect(JSON.stringify(oneHead(HRMS, last(HRMS)))).not.toContain('No policy covers')
  })

  it('an application with no sign-in policy: "No sign-in policy on Salesforce"', () => {
    const why = oneWhy(SALESFORCE)
    expect(why).toEqual({ kind: 'no-policy', policyId: null, name: null })
    expect(oneReasonWords(why, 'Salesforce')).toEqual({ before: noSignInPolicy('Salesforce'), name: null, after: '' })
    expect(noSignInPolicy('Salesforce')).toBe('No sign-in policy on Salesforce')
  })

  it('a person outside the policy: "Outside Box access", the app tab\'s word', () => {
    const why = oneWhy(OUTSIDE)
    expect(why).toEqual({ kind: 'outside', policyId: 'sc-box-engineering', name: 'Box access' })
    const w = oneReasonWords(why, OUTSIDE.appName)
    expect(w && `${w.before}${w.name}${w.after}`).toBe(outsideOf('Box access'))
  })

  it('a monitoring or a draft policy on the application says its status word', () => {
    const watching = planOf('Sanjay Bhatt', 'HRMS', withStatus('sc-hrms-office', 'monitor'))
    expect(oneWhy(watching)).toMatchObject({ kind: 'monitoring', policyId: 'sc-hrms-office' })
    expect(oneReasonWords(oneWhy(watching), 'HRMS')?.after).toBe(' · Monitoring')
    const draft = planOf('Sanjay Bhatt', 'HRMS', withStatus('sc-hrms-office', 'draft'))
    expect(oneWhy(draft)).toMatchObject({ kind: 'draft', policyId: 'sc-hrms-office' })
    expect(oneReasonWords(oneWhy(draft), 'HRMS')?.after).toBe(' · Draft')
  })

  it('in the builder, the policy being built is "own" — even the Global Default — and the reason names it', () => {
    expect(oneWhy(SALESFORCE, GD.id)).toMatchObject({ kind: 'own', policyId: GD.id })
    expect(oneWhy(OUTSIDE, 'sc-box-engineering')).toMatchObject({ kind: 'outside', policyId: 'sc-box-engineering' })
    expect(oneWhy({ decider: null, policies: [] })).toEqual({ kind: 'none', policyId: null, name: null })
  })
})

describe('the head (oneHead): "Policy", the policy, the row that decided', () => {
  it('names the rule that decided, its number once — no "Rule 1 of 3", no "Policy 1 of 2 applies"', () => {
    const h = oneHead(AISHA, last(AISHA))
    expect(h).toMatchObject({ kicker: ONE_KICKER, title: 'Access the app through corporate devices only', reading: false })
    /* `name` (20 Oct 2026): the admin's own words that end the line, so the run's motion sharpens them in, never scrambled. */
    expect(h.meta).toEqual({ tone: 'ok', mark: 'check', text: 'Rule 1 · Low risk — password', name: 'Low risk — password' })
    expect(JSON.stringify(h)).not.toMatch(/of \d|applies/)
  })

  it('turns the spinner and says "Reading rules" until the walk is over', () => {
    const at = arrivals(AISHA, true).policy
    expect(at).toBe(AISHA.at.found)
    const h = oneHead(AISHA, at)
    expect(h.reading).toBe(true)
    expect(h.meta).toEqual({ tone: 'work', mark: 'spin', text: ONE_READING })
    expect(oneHead(AISHA, walkEnd(AISHA)).reading).toBe(false)
  })

  it('says "No rule matched" when the last row decides, and what could not be told when it depends', () => {
    const noRule = { ...AISHA, landing: AISHA.rules.findIndex((r) => r.index === null) }
    expect(oneHead(noRule, last(AISHA)).meta).toEqual({ tone: 'plain', mark: 'dash', text: ONE_NO_RULE })
    expect(DEPENDS.outcome.status).toBe('depends')
    expect(oneHead(DEPENDS, last(DEPENDS)).meta).toMatchObject({ tone: 'warn', mark: 'help' })
    expect(oneHead(DEPENDS, last(DEPENDS)).meta?.text).toMatch(/^Can’t tell · .+ not stated$/)
    expect(oneHead({ ...AISHA, decider: null }, last(AISHA))).toEqual({ kicker: ONE_KICKER, title: ONE_NO_POLICY, meta: null, reading: false })
  })
})

describe('the foot: the Global Default, and another policy only where the data has one', () => {
  it('the Global Default under the application\'s own policy, never when it is the card', () => {
    expect(oneGdFoot(AISHA, GD, oneWhy(AISHA))).toEqual({ policyId: GD.id, name: GD.name, words: 'Not reached', conflict: false })
    expect(oneGdFoot(HRMS, GD, oneWhy(HRMS))).toBeNull()
    expect(oneGdFoot(SALESFORCE, GD, oneWhy(SALESFORCE, GD.id))).toBeNull()
    expect(oneGdFoot(AISHA, null, oneWhy(AISHA))).toBeNull()
  })

  it('no other line on a one-policy application', () => {
    for (const plan of [AISHA, HRMS, SALESFORCE, OUTSIDE, CONFLICT]) expect(oneAlso(plan, oneWhy(plan)), plan.appName).toBeNull()
  })

  it('a second policy on the application that also covers the person, with another answer, is one amber line', () => {
    const box = t.policies.find((p) => p.id === 'sc-box-engineering')!
    const twin: Policy = { ...box, id: 'zz-box-twin', name: 'Box for engineers, strict', rules: box.rules.map((r) => ({ ...r, decision: 'deny' as const })) }
    const at = t.policies.indexOf(box) + 1
    const plan = planOf('Maya Iyer', 'Box', [...t.policies.slice(0, at), twin, ...t.policies.slice(at)])
    expect(oneWhy(plan).kind).toBe('own')
    expect(oneAlso(plan, oneWhy(plan))).toEqual({ policyId: 'zz-box-twin', name: 'Box for engineers, strict', words: 'Also covers · not used', conflict: true })
  })

  it('a draft beside the application\'s policy says its status', () => {
    const extra: Policy = { ...t.policies.find((p) => p.id === 'sc-corporate-devices')!, id: 'zz-gw-draft', name: 'Untitled policy', status: 'draft' }
    const plan = planOf('Aisha Khan', 'Google Workspace', [...t.policies, extra])
    expect(oneAlso(plan, oneWhy(plan))).toMatchObject({ policyId: 'zz-gw-draft', words: 'Draft', conflict: false })
  })
})

describe('the rows: each says what it does', () => {
  const rowOf = (plan: EngineRun, i: number) => ruleRowState(plan.rules[i], last(plan), true)
  it('the row that decided wears its outcome in its tone; the rest grey; none for a rule switched off or not set up', () => {
    const hit = AISHA.landing ?? -1
    expect(oneRowBadge(AISHA.rules[hit], null, rowOf(AISHA, hit), true)).toEqual({ decision: AISHA.rules[hit].decision, muted: false })
    const later = AISHA.rules.findIndex((r) => r.state === 'not-reached')
    expect(oneRowBadge(AISHA.rules[later], null, rowOf(AISHA, later), true)).toMatchObject({ muted: true })
    expect(oneRowBadge(AISHA.rules[hit], null, { tone: 'off' }, true)).toBeNull()
    expect(oneRowBadge(AISHA.rules[hit], { pristine: true }, rowOf(AISHA, hit), true)).toBeNull()
  })

  it('a later rule that also applies with another answer: "Also matches · not used", its badge in its tone', () => {
    const also = CONFLICT.rules.findIndex((r) => !!r.alsoChecks)
    expect(also).toBeGreaterThan(0)
    expect(oneRowWord(CONFLICT.rules[also], rowOf(CONFLICT, also), true, false)).toEqual({ word: ONE_ALSO_RULE, also: true, lead: ONE_ALSO_RULE })
    expect(oneRowBadge(CONFLICT.rules[also], null, rowOf(CONFLICT, also), true)).toMatchObject({ muted: false })
    /* Before the walk is over it is only a rule not reached yet. */
    expect(oneRowWord(CONFLICT.rules[also], rowOf(CONFLICT, also), false, false)).toBeNull()
  })

  it('the row that decided says how the person got in — not for a group\'s own run', () => {
    const hit = CONFLICT.landing ?? -1
    const r = CONFLICT.rules[hit]
    expect(r.via?.say).toMatch(/^via /)
    /* `lead` (20 Oct 2026): the machine's part of the word, resolved by the run's motion; the group's name after it is sharpened in. */
    expect(oneRowWord(r, rowOf(CONFLICT, hit), true, false)).toEqual({ word: `Matches · ${r.via?.say}`, also: false, lead: 'Matches' })
    expect(oneRowWord(r, rowOf(CONFLICT, hit), true, true)).toEqual({ word: 'Matches', also: false, lead: 'Matches' })
    /* A row that did not decide keeps its own word. */
    expect(oneRowWord(CONFLICT.rules[0], rowOf(CONFLICT, 0), true, false)).toBeNull()
  })
})

describe('the Outcome under the merged card: what the person goes through', () => {
  it('the factors for an allow, the message for a deny, the answers it could be when it depends', () => {
    expect(outcomeMetaOne({ tone: 'allow', decision: '1fa', factors: ['Password'], message: null, outcomes: [] })).toEqual({ tone: 'plain', mark: null, text: 'Password' })
    expect(outcomeMetaOne({ tone: 'mfa', decision: '2fa', factors: ['Password', 'Google Authenticator'], message: null, outcomes: [] })?.text).toBe('Password, then Google Authenticator')
    expect(outcomeMetaOne({ tone: 'deny', decision: 'deny', factors: [], message: 'Use a company laptop', outcomes: [] })).toEqual({ tone: 'plain', mark: null, text: '“Use a company laptop”', tip: 'Use a company laptop' })
    expect(outcomeMetaOne({ tone: 'deny', decision: 'deny', factors: [], message: null, outcomes: [] })).toBeNull()
    expect(outcomeMetaOne({ tone: 'depends', decision: null, factors: [], message: null, outcomes: [{ label: 'If rule 1 matches', decision: '2fa' }, { label: 'If not', decision: 'deny' }] })?.text).toBe('Allow with 2FA or Deny')
    /* Nothing decided: the outcome's own line. */
    expect(outcomeMetaOne({ tone: 'none', decision: null, factors: [], message: null, outcomes: [] })).toBeUndefined()
    expect(outcomeMetaOne(outcomeView(AISHA, []))).toBeUndefined()
  })
})

describe('the chain with no rule card', () => {
  it('arrives with the policy\'s name as the engine finds it; no rule card at any step', () => {
    const at = arrivals(AISHA, true)
    expect(at.rule).toBe(Number.POSITIVE_INFINITY)
    expect(at.policy).toBe(AISHA.at.found)
    expect(at.outcome).toBe(AISHA.at.outcome)
    for (let s = 0; s <= last(AISHA); s++) expect(cardsAt(AISHA, s, true)).not.toContain('rule')
    expect(cardsAt(AISHA, last(AISHA), true)).toEqual(['sign-in', 'policy', 'outcome'])
    /* Off, as it was. */
    expect(cardsAt(AISHA, last(AISHA))).toEqual(['sign-in', 'policy', 'rule', 'outcome'])
  })

  it('is at work on the Policy card until the walk is over, and the fold follows it', () => {
    const at = arrivals(AISHA, true).policy
    expect(workingOn(AISHA, at, true)).toBe('policy')
    expect(workingOn(AISHA, walkEnd(AISHA) - 1, true)).toBe('policy')
    expect(workingOn(AISHA, walkEnd(AISHA), true)).toBeNull()
    expect(onCard(AISHA, at, true)).toBe('policy')
    expect(onCard(AISHA, last(AISHA), true)).toBe('outcome')
  })

  it('points a rule or a check at the Policy card', () => {
    expect(chainCardOf('rule:r1', true)).toBe('policy')
    expect(chainCardOf('check:r1:device', true)).toBe('policy')
    expect(chainCardOf('rule:r1')).toBe('rule')
    expect(chainCardOf('policy:p', true)).toBe('policy')
  })
})

describe('the brief, said as the merged card says it', () => {
  const said = (plan: EngineRun, extra: Partial<BriefInput> = {}) =>
    briefOf(plan, { person: 'Someone', first: 'Them', app: plan.appName, via: null, second: '', ...extra })
      .parts.map((p) => p.text)
      .join('')
  it('the application\'s own policy applies, and the rule says how the person got in', () => {
    const s = said(CONFLICT, { person: 'Maya Iyer', first: 'Maya', one: { why: oneWhy(CONFLICT) } })
    expect(s).toMatch(/: the AWS access policy applies, and rule.2 matches through the .+ because /)
    expect(said(AISHA, { person: 'Aisha Khan', first: 'Aisha', one: { why: oneWhy(AISHA) } })).toContain(': the Access the app through corporate devices only policy applies, and rule')
  })

  it('why the Global Default applies: no policy, inactive, outside', () => {
    expect(said(SALESFORCE, { one: { why: oneWhy(SALESFORCE) } })).toContain(': the Salesforce app has no sign-in policy, so the Global Default Policy applies')
    expect(said(HRMS, { one: { why: oneWhy(HRMS) } })).toContain(': the HRMS access from corporate offices policy is inactive, so the Global Default Policy applies')
    expect(said(OUTSIDE, { first: 'Priya', one: { why: oneWhy(OUTSIDE) } })).toContain(': Priya is outside the Box access policy, so the Global Default Policy applies')
  })

  it('without it, the sentence as it was', () => {
    const before = said(HRMS)
    expect(before).not.toContain('inactive')
    expect(said(AISHA)).toBe(said(AISHA, { one: undefined }))
  })
})
