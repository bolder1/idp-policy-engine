import { describe, expect, it } from 'vitest'

import { blankPolicy, type Policy } from '../data'
import { showcaseTenant } from '../fixtures'
import { runGuard } from '../screens/guard'
import { envOf } from '../screens/tenant-resolver'
import { presetOf } from '../screens/testing/device-presets'
import { whatChangesSaid } from '../screens/what-changes'
import {
  checkRowView,
  checksFor,
  checksView,
  describedPolicy,
  keptChecks,
  runChecks,
  whatChangesFor,
  withChecks,
  type CheckContext,
} from './describe-checks'
import { EXAMPLES, applyChoice, compose, dictionaryOf, emptyAnswers, openChoices, readText, type DescribeTenant } from './describe-model'

/* -----------------------------------------------------------------------------
   Describe it's checks, on the showcase tenant (describe spec, §8.2).

   Each text is read the way the panel reads it, composed onto a new draft
   that sits where `addPolicy` puts one — first in the list — and checked
   there. The people, the sign-ins and the decisions are pinned as data: the
   scenes in §9 are these rows.
   -------------------------------------------------------------------------- */

const T = showcaseTenant()
const TODAY = '2026-09-28'
const person = (name: string) => T.directory.people.find((u) => u.name === name)!.id

/* A text, read, its questions answered by phrase, and composed onto a new
   draft at the top of the list. */
function described(text: string, picks: Record<string, string> = {}) {
  const blank = blankPolicy('Untitled policy 1', [])
  const policies: Policy[] = [blank, ...T.policies]
  const tenant: DescribeTenant = { ...T, users: T.directory.people, policies }
  const env = envOf({ ...T, policies })
  const dict = dictionaryOf(tenant)
  let r = readText(text, dict)
  for (const c of openChoices(r)) if (picks[c.span.phrase]) r = applyChoice(r, c.id, picks[c.span.phrase], dict)
  const c = compose(r.answers, tenant)
  const draft = describedPolicy({ ...blank, rules: c.rules, fallback: c.fallback ?? blank.fallback }, r.answers)
  const ctx: CheckContext = { draft, sources: c.sources, tenant, env, adminId: 'jaspreet', today: TODAY }
  const checks = checksFor(r.answers, ctx)
  const runs = runChecks(checks, draft, policies, env)
  return { answers: r.answers, draft, tenant, env, policies, checks, runs, ctx }
}
const example = (label: string) => described(EXAMPLES.find((e) => e.label === label)!.text)

/* A check's sign-in as data: who, from where, on what, at what risk. */
const signIn = (c: { facts: ReturnType<typeof described>['checks'][number]['facts'] }) => ({
  person: c.facts.personId,
  app: c.facts.appId,
  address: c.facts.network?.address,
  place: c.facts.location?.city ?? null,
  device: c.facts.device ? presetOf(c.facts.device) : null,
  risk: c.facts.risk?.score ?? null,
})

describe('the rows each example gets', () => {
  it('HRMS from the office: pass in the office, stop at home, the edge in London, and somebody it leaves out (scene 2)', () => {
    const { checks, runs, draft, tenant, policies } = example('HRMS from the office')
    expect(checks.map((c) => c.kind)).toEqual(['pass', 'stop', 'edge', 'not-named'])
    expect(checks.map(signIn)).toEqual([
      { person: 'u-hr-1', app: 'hrms', address: '203.0.113.24', place: null, device: 'win11-registered', risk: 12 },
      { person: 'u-hr-1', app: 'hrms', address: '192.0.2.10', place: null, device: 'win11-registered', risk: 12 },
      { person: 'u-hr-1', app: 'hrms', address: '203.0.113.24', place: 'London', device: 'win11-registered', risk: 12 },
      { person: person('Sanjay Bhatt'), app: 'hrms', address: '203.0.113.24', place: null, device: 'win11-registered', risk: 12 },
    ])
    expect(checks.map((c) => c.expected)).toEqual(['2fa', 'deny', 'deny', '1fa'])
    expect(runs.map((r) => r.verdict)).toEqual(['match', 'match', 'match', 'match'])
    const rows = runs.map((r) => checkRowView(r, draft, tenant, policies))
    expect(rows.map((v) => [v.word, v.line, v.detail])).toEqual([
      ['Should pass', 'Kavya Menon · HRMS · Office network · Windows 11 laptop · registered', 'Untitled policy 1 · Rule 1 · In Corporate offices'],
      ['Should stop', 'Kavya Menon · HRMS · Home broadband · Windows 11 laptop · registered', 'Untitled policy 1 · Nothing else matched'],
      ['Edge', 'Kavya Menon · HRMS · Office network · London · Windows 11 laptop · registered', 'Untitled policy 1 · Nothing else matched'],
      ['Not named', 'Sanjay Bhatt · HRMS · Office network · Windows 11 laptop · registered', 'Global Default Policy · Baseline access'],
    ])
    expect(rows[0].title).toBe('From your text: “only from a corporate office”')
    expect(rows[3].title).toBeUndefined()
    expect(rows[0].label).toBe('Should pass, Kavya Menon · HRMS · Office network · Windows 11 laptop · registered, Allow with 2FA')
  })

  it('Corporate devices by risk: the low band, a device that is not corporate, and the medium band’s first value (scene 4)', () => {
    const { checks, runs } = example('Corporate devices by risk')
    expect(checks.map((c) => c.kind)).toEqual(['pass', 'stop', 'edge', 'not-named'])
    expect(checks.map(signIn).map((s) => [s.person, s.device, s.risk])).toEqual([
      ['u-sales-1', 'win11-registered', 12],
      ['u-sales-1', 'android-12', 12],
      ['u-sales-1', 'win11-registered', 40],
      [person('Sanjay Bhatt'), 'win11-registered', 12],
    ])
    expect(checks.map((c) => c.expected)).toEqual(['1fa', 'deny', '2fa', '1fa'])
    expect(runs.every((r) => r.verdict === 'match')).toBe(true)
  })

  it('Compliant devices: everyone, so the admin is checked too, and kept while they get in (scene 5)', () => {
    const { checks, runs } = example('Compliant devices')
    expect(checks.map((c) => c.kind)).toEqual(['pass', 'stop', 'you'])
    expect(checks.map(signIn).map((s) => [s.person, s.device])).toEqual([
      ['priya', 'android-14'],
      ['priya', 'android-12'],
      ['jaspreet', 'android-14'],
    ])
    expect(checks.map((c) => c.expected)).toEqual(['1fa', 'deny', '1fa'])
    expect(keptChecks(runs).map((c) => c.kind)).toEqual(['pass', 'stop', 'you'])
  })

  it('Developer tools: the edge lands on the second rule, elsewhere (scene 6)', () => {
    const { checks, runs } = example('Developer tools')
    expect(checks.map((c) => c.kind)).toEqual(['pass', 'stop', 'edge', 'not-named'])
    const edge = runs.find((r) => r.check.kind === 'edge')!
    expect(signIn(edge.check)).toMatchObject({ person: 'arun', address: '203.0.113.24', place: 'London' })
    expect(edge.result.decision).toBe('2fa')
    expect(edge.result.trace?.hitIndex).toBe(1)
  })

  it('resolves every Should pass, Should stop and Edge to its Expected, with the draft first in the list', () => {
    for (const ex of EXAMPLES) {
      const { runs } = described(ex.text)
      const own = runs.filter((r) => r.check.kind === 'pass' || r.check.kind === 'stop' || r.check.kind === 'edge')
      expect(own.length, ex.label).toBeGreaterThan(1)
      for (const r of own) expect([ex.label, r.check.kind, r.verdict]).toEqual([ex.label, r.check.kind, 'match'])
    }
  })
})

describe('the tenant around the draft', () => {
  it('names the Developer tools policy for the contractors’ Not named, and lets the admin in with 2FA (scene 7)', () => {
    const { runs } = described('Contractors reach GitHub and Jira only from the office on a company laptop; everyone else needs Google Authenticator.', {
      'company laptop': 'fp-corp-devices',
    })
    expect(runs.map((r) => r.check.kind)).toEqual(['pass', 'stop', 'edge', 'you', 'not-named'])
    const notNamed = runs.find((r) => r.check.kind === 'not-named')!
    expect(notNamed.check.facts.personId).toBe('arun')
    expect(notNamed.result.decidedBy?.policyId).toBe('sc-dev-tools')
    const you = runs.find((r) => r.check.kind === 'you')!
    expect([you.result.decision, you.verdict]).toEqual(['2fa', 'match'])
    expect(runs.find((r) => r.check.kind === 'stop')!.check.expected).toBe('deny')
  })

  it('shows Workday newly asked for 2FA and denied, and nobody newly allowed (scene 3)', () => {
    const { draft, policies, env } = described('HR and Finance reach Workday only from a corporate office, with Google Authenticator.')
    const line = whatChangesFor(draft, policies, env)
    expect(whatChangesSaid(line)).toBe('Of 360 modelled sign-ins: Now allowed 0 · Now on 1 factor 0 · Now asked for 2FA 18 · Now denied 72')
  })

  it('says What changes exactly as Before turning on will, for the same draft', () => {
    const { draft, policies, env } = described('HR and Finance reach Workday only from a corporate office, with Google Authenticator.')
    const guard = runGuard({
      kind: 'turn-on',
      before: null,
      after: { ...draft, status: 'active' },
      changedFrom: null,
      policies,
      env,
      apps: T.apps,
      savedSignIns: [],
      adminId: 'jaspreet',
      breakIn: null,
    })
    expect(whatChangesFor(draft, policies, env)).toEqual(guard.whatChanges)
  })
})

describe('what a row can and cannot say', () => {
  it('reads a sign-in missing a fact the rule reads as Can’t tell, never a match', () => {
    const { checks, draft, policies, env, tenant } = example('HRMS from the office')
    const pass = checks[0]
    const { network: _n, ...unstated } = pass.facts
    const [run] = runChecks([{ ...pass, facts: unstated }], draft, policies, env)
    expect(run.verdict).toBe('cant-tell')
    const row = checkRowView(run, draft, tenant, policies)
    expect(row.decision).toBeNull()
    expect(row.needs).toContain('IP address')
    expect(row.detail.startsWith('Expected Allow with 2FA · ')).toBe(true)
    expect(row.label).toContain("Can't tell, needs IP address")
  })

  it('leads with the expectation when the tenant decides otherwise', () => {
    const { checks, draft, policies, env, tenant } = example('HRMS from the office')
    const [run] = runChecks([{ ...checks[0], expected: 'deny' }], draft, policies, env)
    expect(run.verdict).toBe('differs')
    expect(checkRowView(run, draft, tenant, policies).detail).toBe('Expected Deny · Untitled policy 1 · Rule 1 · In Corporate offices')
  })

  it('keeps a You row only while it lets the admin in', () => {
    const { runs } = example('Compliant devices')
    const you = runs.find((r) => r.check.kind === 'you')!
    const locked = { ...you, result: { ...you.result, decision: 'deny' as const }, check: { ...you.check, expected: 'deny' as const } }
    expect(keptChecks([locked]).map((c) => c.kind)).toEqual([])
    expect(keptChecks([{ ...you, verdict: 'cant-tell' as const }])).toEqual([])
  })

  /* A choice still open writes no rule (§3.6, §4.7), and the last row is then
     whatever the draft had before the panel opened — not anything the text
     said. Only one outcome for everyone, folded into the last row, is a Should
     pass with no rule behind it. */
  it('writes no Should pass while a choice is open: the order (scene 12), a Who (scene 11), a device', () => {
    for (const text of [
      'Engineering and DevOps reach GitHub and Jira on a compliant device with miniOrange Push; in the office, password only.',
      'Nadia Haddad needs a passkey on Jira',
      'Everyone uses Salesforce on a company laptop with Google Authenticator.',
    ]) {
      const { answers, checks, draft, ctx } = described(text)
      expect([text, draft.rules]).toEqual([text, []])
      expect([text, checks.some((c) => c.kind === 'pass')]).toEqual([text, false])
      expect([text, (withChecks(draft, answers, ctx).checks ?? []).some((c) => c.kind === 'pass')]).toEqual([text, false])
    }
    /* Picked, the rule is written and its Should pass comes back, for the person it names. */
    const order = described('Engineering and DevOps reach GitHub and Jira on a compliant device with miniOrange Push; in the office, password only.', {
      'in the office, password only': '1',
    }).checks.find((c) => c.kind === 'pass')!
    expect([order.facts.personId, order.expected]).toEqual(['arun', '1fa'])
    const nadia = described('Nadia Haddad needs a passkey on Jira', { 'Nadia Haddad': 'user:u-dev-2' }).checks.find((c) => c.kind === 'pass')!
    expect([nadia.facts.personId, nadia.expected]).toEqual(['u-dev-2', '2fa'])
  })

  it('checks one outcome for everyone on the last row, with the outcome the text gave it', () => {
    const { checks, runs } = described('Everyone uses Salesforce with Google Authenticator.')
    const pass = checks.find((c) => c.kind === 'pass')!
    expect([pass.expected, pass.phrase]).toEqual(['2fa', 'Google Authenticator'])
    expect(runs.find((r) => r.check.kind === 'pass')!.verdict).toBe('match')
  })

  it('has nothing to check until an application is chosen', () => {
    const { ctx } = example('HRMS from the office')
    const none = emptyAnswers()
    expect(checksFor(none, ctx)).toEqual([])
    expect(checksView(none, ctx)).toBeNull()
    expect(withChecks(ctx.draft, none, ctx).checks).toBeUndefined()
  })

  it('writes onto the draft what the panel shows, and the What changes line with it', () => {
    const { answers, ctx } = example('Corporate devices by risk')
    const view = checksView(answers, ctx)!
    expect(view.rows.map((r) => r.word)).toEqual(['Should pass', 'Should stop', 'Edge', 'Not named'])
    expect(view.whatChanges).toBe('Of 360 modelled sign-ins: Now allowed 0 · Now on 1 factor 0 · Now asked for 2FA 0 · Now denied 0')
    const kept = withChecks(ctx.draft, answers, ctx).checks!
    expect(kept.map((c) => c.id)).toEqual(['pass', 'stop', 'edge', 'not-named'])
    expect(kept[0].phrase).toBe('password at low risk')
  })
})
