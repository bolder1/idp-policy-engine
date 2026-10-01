import { describe, expect, it } from 'vitest'

import { rule, type Policy, type Rule } from '../../data'
import { showcaseTenant, showcaseTenantHrmsOn, type Tenant } from '../../fixtures'
import { leaves } from '../../predicate'
import type { RuleTrace } from '../simulate'
import { envOf, evaluatedList, resolveSignIn, type TenantResolution } from '../tenant-resolver'
import { LAST_ROW } from '../testing/evidence'
import { rowsRead } from '../testing/rows-read'
import { factsOf, formOf, originPatch, type SignInForm } from '../testing/sign-in-form'
import type { SignInScreens } from '../testing/screens-of'
import { conditionRequirement, type PillCategory } from '../testing/trace-pills'
import {
  CAP_MS,
  CATEGORY_WORD,
  EDIT_SHARE,
  SCAN_MS,
  activeNode,
  askOf,
  checkPhase,
  engineRun,
  policyFound,
  policyOpen,
  policyPhase,
  readersOf,
  ruleFolded,
  rulePhase,
  suggestionsOf,
  timeline,
  type EngineRun,
  type Intro,
} from './engine-run'
import { askedFields, cardIssues, emptyDraft, forRun, withDefaults } from './sign-in-card'

/* The engine run's plan (engine-run.ts), on the showcase tenant the console
   opens on: what each column holds, the order the steps show it in, the words
   the engine line says, and — the point of the file — that the plan never
   disagrees with the resolver it is read from. */

const TODAY = '2026-09-28'

function form(_t: Tenant, patch: Partial<SignInForm>): SignInForm {
  return { ...emptyDraft(TODAY, '09:30'), ...patch }
}

function run(t: Tenant, f: SignInForm, intro: Intro = 'collapse'): { run: EngineRun; res: ReturnType<typeof resolveSignIn> } {
  const env = envOf(t)
  const { facts } = factsOf(f, t.zones)
  const res = resolveSignIn(t.policies, facts, env)
  const rows = rowsRead(t.policies, null, f.appId, { zones: t.zones, fingerprints: t.fingerprints })
  const ctx = { people: t.directory.people, apps: t.apps, zones: t.zones, rows }
  return { run: engineRun({ res, policies: t.policies, form: f, facts, env, ctx, intro }), res }
}

/* A run inside a policy: resolved with the policy's draft in place of its
   stored twin (`substitute`), drawn for that policy alone (`focus`), as the
   board will ask it. */
function runIn(t: Tenant, f: SignInForm, opts: { substitute?: Policy; focus?: string | null }): { run: EngineRun; res: TenantResolution } {
  const env = envOf(t)
  const { facts } = factsOf(f, t.zones)
  const res = resolveSignIn(t.policies, facts, env, opts.substitute ? { substitute: opts.substitute } : {})
  const rows = rowsRead(t.policies, opts.substitute ?? null, f.appId, { zones: t.zones, fingerprints: t.fingerprints })
  const ctx = { people: t.directory.people, apps: t.apps, zones: t.zones, rows }
  return { run: engineRun({ res, policies: t.policies, form: f, facts, env, ctx, substitute: opts.substitute, focus: opts.focus }), res }
}

const saved = (t: Tenant, id: string) => formOf(t.savedSignIns.find((s) => s.id === id)!.facts, t.zones)
const rowsOf = (r: EngineRun, i: number) => r.rules[i].checks.slice(0, r.rules[i].checked).map((c) => `${c.word}:${c.status}`)

describe('engineRun — finding the policy', () => {
  it('Kavya on HRMS: the HRMS policy is off, so the scan passes it and the Global Default decides', () => {
    const t = showcaseTenant()
    const { run: r } = run(t, form(t, { personId: 'u-hr-1', appId: 'hrms' }))
    expect(r.empty).toBe(false)
    expect(r.policies.map((p) => [p.name, p.kind, p.reason, p.scanned])).toEqual([
      ['HRMS access from corporate offices', 'waiting', 'Switched off', true],
      ['Global Default Policy', 'decides', '', true],
    ])
    expect(r.decider).toEqual({ id: 'global-default', name: 'Global Default Policy', isGlobalDefault: true })
    expect(r.steps.filter((s) => s.kind === 'scan').map((s) => s.text)).toEqual(['Checking HRMS access from corporate offices', 'Checking Global Default Policy'])
    expect(r.steps[r.at.decides].text).toBe('Global Default Policy decides')
    /* No tooltip that only says the row again: "Inactive" beside "Switched off", "Decides this sign-in" beside "Decides". */
    expect(r.policies.map((p) => p.tip)).toEqual(['', ''])
  })

  it('an app policy that decides stops the scan: the Global Default after it is never checked, and settles with its reason', () => {
    const t = showcaseTenant()
    const { run: r } = run(t, form(t, { personId: 'arun', appId: 'github' }))
    /* The Code review draft is on GitHub too (the troubleshooting estate, 30 Sep
       2026): waiting, never scanned, and it changes nothing here. */
    expect(r.policies.map((p) => [p.name, p.kind, p.scanned])).toEqual([
      ['Developer tools — office and device checks', 'decides', true],
      ['Code review for Finance', 'waiting', false],
      ['Global Default Policy', 'lost', false],
    ])
    const gd = r.policies.find((p) => p.name === 'Global Default Policy')!
    expect(gd.reason).toBe('Not reached')
    /* A tooltip where it says more than the row: why the Global Default was not reached. */
    expect(gd.tip).toBe('An app policy applies')
    expect(r.policies[0].tip).toBe('')
    expect(gd.scanAt).toBeNull()
    expect(gd.settleAt).toBe(r.at.decides)
  })

  it('the engine asks custom-group policies first, then the DEFAULT group, then the Global Default', () => {
    const t = showcaseTenantHrmsOn()
    const { run: r } = run(t, form(t, { personId: 'u-hr-1', appId: 'hrms' }))
    expect(r.policies[0]).toMatchObject({ name: 'HRMS access from corporate offices', decides: true })
    expect(r.policies.at(-1)).toMatchObject({ isGlobalDefault: true })
  })
})

describe('engineRun — the search (§12.4)', () => {
  it('each policy carries its place in the order the engine asks them', () => {
    const t = showcaseTenant()
    const { run: r } = run(t, form(t, { personId: 'u-hr-1', appId: 'hrms' }))
    expect(r.policies.map((p) => [p.order, p.name])).toEqual([
      [1, 'HRMS access from corporate offices'],
      [2, 'Global Default Policy'],
    ])
  })

  it('the scan finds the one that decides: a light travels around it, then it settles to Decides, then it opens', () => {
    const t = showcaseTenant()
    const { run: r } = run(t, form(t, { personId: 'u-hr-1', appId: 'hrms' }))
    const [hrms, gd] = r.policies
    expect(r.steps[r.at.found]).toMatchObject({ kind: 'found', policy: 1, text: 'Global Default Policy decides' })
    expect(r.at.found).toBe(gd.scanAt! + 1)
    expect(r.at.decides).toBe(r.at.found + 1)
    expect(r.at.expand).toBe(r.at.decides + 1)
    expect(gd.foundAt).toBe(r.at.found)
    expect(hrms.foundAt).toBeNull()
    /* Found: still being asked, the light on it — then settled at Decides. */
    expect(policyPhase(gd, r.at.found)).toBe('working')
    expect(policyFound(gd, r.at.found)).toBe(true)
    expect(policyFound(gd, r.at.decides)).toBe(false)
    expect(policyPhase(gd, r.at.decides)).toBe('settled')
    /* The one that did not decide settles as the next is asked — before the light. */
    expect(hrms.settleAt).toBe(gd.scanAt)
    expect(activeNode(r, r.at.found)).toBe(gd.node)
  })

  it('one light a run, on the one that decides; none when there is nothing to run', () => {
    const t = showcaseTenant()
    const { run: r } = run(t, form(t, { personId: 'arun', appId: 'github' }))
    expect(r.steps.filter((s) => s.kind === 'found')).toHaveLength(1)
    expect(r.policies.filter((p) => p.foundAt !== null).map((p) => p.decides)).toEqual([true])
    const empty = run(t, form(t, { personId: null, appId: null })).run
    expect(empty.at.found).toBe(-1)
  })

  it('a policy the person is not in names them: "Arun Patel is not in it"', () => {
    const t = showcaseTenantHrmsOn()
    const { run: r } = run(t, form(t, { personId: 'arun', appId: 'hrms' }))
    const hrms = r.policies.find((p) => p.name === 'HRMS access from corporate offices')!
    expect(hrms.reason).toBe('Arun Patel is not in it')
  })
})

describe('engineRun — the outcome says who decided', () => {
  it('"Decided by {policy} · Rule 2 — {rule}", and the last row by name', () => {
    const t = showcaseTenant()
    expect(run(t, form(t, { personId: 'arun', appId: 'github', ...originPatch('home') })).run.outcome.by).toBe(
      'Decided by Developer tools — office and device checks · Rule 2 — Compliant device, working remotely',
    )
    const devon = run(t, saved(t, t.savedSignIns.find((s) => s.name === 'Devon Rao on Android 12')!.id)).run
    expect(devon.outcome.by).toBe('Decided by Device compliance for Outlook and Dropbox · Nothing else matched')
  })

  it('Depends names the policy alone; no person or application, nothing', () => {
    const t = showcaseTenant()
    const { run: r } = run(t, form(t, { personId: 'arun', appId: 'github', device: { kind: 'none' } }))
    expect(r.outcome.by).toBe('Decided by Developer tools — office and device checks')
    expect(run(t, form(t, { personId: null, appId: null })).run.outcome.by).toBe('')
  })

  it('what the person is asked for, or told, from the pages they get', () => {
    const screens = (steps: SignInScreens['steps'], decision: SignInScreens['decision'] = '2fa'): SignInScreens[] => [{ decision, policyName: 'P', ruleName: 'R', steps }]
    const method = { id: 'ga', name: 'Google Authenticator' } as unknown as NonNullable<Extract<SignInScreens['steps'][number], { kind: 'second' }>['method']>
    expect(askOf(screens([{ kind: 'password', username: 'a' }, { kind: 'second', method, name: 'Google Authenticator', prompt: 'authenticator', masked: '', rememberDays: null }]), '2fa')).toBe(
      'Asked for Google Authenticator',
    )
    expect(askOf(screens([{ kind: 'password', username: 'a' }], '1fa'), '1fa')).toBe('Asked for their password')
    expect(askOf(screens([{ kind: 'first-method', method: 'Passkey', prompt: 'passkey' }], '1fa'), '1fa')).toBe('Asked for Passkey')
    expect(askOf(screens([{ kind: 'deny', message: 'Your device is not allowed.' }], 'deny'), 'deny')).toBe('Blocked with “Your device is not allowed.”')
    expect(askOf(screens([{ kind: 'password', username: 'a' }, { kind: 'second', method: null, name: 'YubiKey', prompt: 'none', masked: '', rememberDays: null }]), '2fa')).toBe(
      'Asked for YubiKey, which nobody can be offered',
    )
    expect(askOf([], '1fa')).toBe('')
    expect(askOf(screens([{ kind: 'password', username: 'a' }], '1fa'), null)).toBe('')
  })
})

describe('engineRun — checking the rules', () => {
  it('Arun in the office on a registered laptop: rule 1 reads Who, Network and Device, and matches', () => {
    const t = showcaseTenant()
    const { run: r } = run(t, form(t, { personId: 'arun', appId: 'github' }))
    const r1 = r.rules[0]
    expect(r1).toMatchObject({ index: 0, state: 'match', visited: true, shortCircuit: true, failing: null })
    expect(r1.checks.map((c) => [c.word, c.requirement, c.value, c.status])).toEqual([
      ['Who', 'Engineering, DevOps', 'Arun Patel', 'pass'],
      ['Network', 'Corporate offices', 'Office network', 'pass'],
      ['Device', 'Compliant devices', 'Windows 11 laptop · registered', 'pass'],
    ])
    expect(r1.checks[1].say).toBe('Network · Office network is in Corporate offices')
    expect(r1.checks[2].say).toBe('Device · Windows 11 laptop · registered meets Compliant devices')
    expect(r.landing).toBe(0)
    expect(r.rules.slice(1).map((x) => [x.name, x.state])).toEqual([
      ['Compliant device, working remotely', 'not-reached'],
      ['Finance, on a compliant device', 'not-reached'],
      ['Nothing else matched', 'not-reached'],
    ])
    expect(r.summary).toBe('Checked 1 policy · 1 rule · 3 checks')
  })

  it('first match wins, literally: at home the Network row ends rule 1 — the Device row is never read — and rule 2 matches', () => {
    const t = showcaseTenant()
    const { run: r } = run(t, form(t, { personId: 'arun', appId: 'github', ...originPatch('home') }))
    expect(r.rules[0]).toMatchObject({ state: 'no-match', failing: 1, checked: 2 })
    expect(rowsOf(r, 0)).toEqual(['Who:pass', 'Network:fail'])
    expect(r.rules[0].checks[1].say).toBe('Network · Home broadband is not in Corporate offices')
    expect(r.rules[0].checks).toHaveLength(3)
    expect(r.rules[1]).toMatchObject({ state: 'match', checked: 2 })
    expect(r.landing).toBe(1)
    expect(r.outcome.ruleLine).toBe('Rule 2 · Compliant device, working remotely')
  })

  it('Tom on Windows 10: both rules end on the Device row, and the last row decides', () => {
    const t = showcaseTenant()
    const { run: r } = run(t, saved(t, 'ssi-tom-win10'))
    expect(rowsOf(r, 0)).toEqual(['Who:pass', 'Network:pass', 'Device:fail'])
    expect(rowsOf(r, 1)).toEqual(['Who:pass', 'Device:fail'])
    /* Finance's rule (TESTING-V4 §13) ends on Who: Tom is in DevOps. */
    expect(rowsOf(r, 2)).toEqual(['Who:fail'])
    expect(r.rules[3]).toMatchObject({ id: LAST_ROW, name: 'Nothing else matched', state: 'match', decision: 'deny' })
    expect(r.landing).toBe(3)
    expect(r.outcome).toMatchObject({ status: 'decided', decision: 'deny', ruleLine: 'Nothing else matched' })
  })

  it('a device profile is one row with its checks under it; risk bounds are one Risk row', () => {
    const t = showcaseTenant()
    const { run: r } = run(t, saved(t, 'ssi-emily-high'))
    const r2 = r.rules[1]
    expect(r2.checks.map((c) => c.word)).toEqual(['Who', 'Device', 'Risk'])
    expect(r2.checks[2]).toMatchObject({ requirement: 'Above 39 and below 71', value: '86', status: 'fail' })
    expect(r2.checks[2].say).toBe('Risk · 86 is not below 71')
    expect(r2.checks[1].subs.length).toBeGreaterThan(1)
    expect(r.rules[2]).toMatchObject({ state: 'match' })
    expect(r.rules[2].checks[2].requirement).toBe('Above 70')
  })

  it('a fact left Not stated on purpose is grey, offers Add, and the answer Depends', () => {
    const t = showcaseTenant()
    const { run: r, res } = run(t, form(t, { personId: 'arun', appId: 'github', device: { kind: 'none' } }))
    const device = r.rules[0].checks[2]
    expect(device).toMatchObject({ word: 'Device', value: 'Not stated', status: 'unknown', missing: 'device' })
    expect(device.say).toBe('Device · not stated')
    expect(r.rules[0].state).toBe('unknown')
    expect(res.status).toBe('depends')
    expect(r.outcome.status).toBe('depends')
    expect(r.steps[r.at.outcome].text).toBe('Depends')
  })

  it('when the answer Depends, the last row is only "If not": reached, never a match, and said so', () => {
    const t = showcaseTenant()
    const { run: r } = run(t, form(t, { personId: 'arun', appId: 'github', device: { kind: 'none' } }))
    expect(r.rules.map((x) => x.state)).toEqual(['unknown', 'unknown', 'no-match', 'possible'])
    const last = r.rules[3]
    expect(last).toMatchObject({ id: LAST_ROW, visited: true, decision: 'deny' })
    expect(r.steps[last.endAt].text).toBe('Nothing else matched · if not')
    expect(r.rules.some((x) => x.state === 'match')).toBe(false)
  })

  /* The Global Default's rule was the showcase's one rule with no conditions
     until its baseline (30 Sep 2026) gave it the operating countries and a
     device, so the tenant here keeps the old one-rule Global Default. */
  it('a rule with no conditions reads nothing and matches', () => {
    const seeded = showcaseTenant()
    const t: Tenant = {
      ...seeded,
      policies: seeded.policies.map((p) => (p.isSystem ? { ...p, rules: [rule({ name: 'Baseline access', decision: '1fa' })], fallback: undefined } : p)),
    }
    const { run: r } = run(t, form(t, { personId: 'u-hr-1', appId: 'hrms' }))
    expect(r.rules[0]).toMatchObject({ name: 'Baseline access', state: 'match', checked: 0, checks: [] })
    expect(r.summary).toBe('Checked 2 policies · 1 rule')
  })
})

describe('engineRun — the steps', () => {
  it('reads in order: collapse, find, a scan per policy, found, decides, rules, each row in two beats, deciding, the answer, done', () => {
    const t = showcaseTenant()
    const { run: r } = run(t, form(t, { personId: 'arun', appId: 'github', ...originPatch('home') }))
    expect(r.steps.map((s) => s.kind)).toEqual([
      'collapse', 'find', 'scan', 'found', 'decides', 'expand',
      /* Rule 1: its failing row's mark ends it (no rule-end of its own), then it folds. */
      'rule', 'check', 'checked', 'check', 'checked', 'compact',
      'rule', 'check', 'checked', 'check', 'checked', 'rule-end',
      'deciding', 'outcome', 'done',
    ])
    expect(r.steps.filter((s) => s.stage).map((s) => s.stage)).toEqual(['Finding the policy for GitHub Enterprise', 'Checking rules in Developer tools — office and device checks', 'Deciding'])
    expect(r.steps.at(-1)!.text).toBe(r.summary)
  })

  it('the engine line says each finding as its mark lands, in the sign-in\u2019s own words — never while a row only arrives', () => {
    const t = showcaseTenant()
    const { run: r } = run(t, form(t, { personId: 'arun', appId: 'github', ...originPatch('home') }))
    const said = r.steps.filter((s) => s.kind === 'rule' || s.kind === 'check' || s.kind === 'checked' || s.kind === 'rule-end' || s.kind === 'compact').map((s) => `${s.kind}: ${s.text}`)
    expect(said).toEqual([
      'rule: Rule 1 · In the office on a compliant device',
      'check: Rule 1 · In the office on a compliant device',
      'checked: Arun Patel is in Engineering',
      'check: Arun Patel is in Engineering',
      'checked: Home broadband is not in Corporate offices',
      /* The failing finding holds while the rule folds to it. */
      'compact: Home broadband is not in Corporate offices',
      'rule: Rule 2 · Compliant device, working remotely',
      'check: Rule 2 · Compliant device, working remotely',
      /* Said once a run: rule 2 asking Who again is not news. */
      'checked: Rule 2 · Compliant device, working remotely',
      'check: Rule 2 · Compliant device, working remotely',
      'checked: Windows 11 laptop meets Compliant devices',
      'rule-end: Rule 2 matches',
    ])
    /* The failing row's words, category first, are what the folded rule is named by. */
    expect(r.rules[0].miss).toBe('Network · Home broadband is not in Corporate offices')
    expect(r.rules[0].checks[1].line).toBe('Home broadband is not in Corporate offices')
    /* The finding that ends a rule holds a little longer than the rest. */
    expect(r.steps[r.rules[0].endAt]).toMatchObject({ kind: 'checked', hold: true })
  })

  it('findings in the sign-in\u2019s words: the group that let the person in, the device by its kind, the score', () => {
    const t = showcaseTenant()
    const devon = run(t, saved(t, 'ssi-devon-android')).run
    expect(devon.rules[0].checks.map((c) => c.line)).toEqual(['Android 12 phone does not meet Compliant devices'])
    const emily = run(t, saved(t, 'ssi-emily-high')).run
    expect(emily.rules.slice(0, 3).map((x) => x.checks.map((c) => c.line))).toEqual([
      ['Emily Carter is in Sales', 'Windows 11 laptop meets Corporate devices', 'Risk score 86 is not below 40'],
      ['Emily Carter is in Sales', 'Windows 11 laptop meets Corporate devices', 'Risk score 86 is not below 71'],
      ['Emily Carter is in Sales', 'Windows 11 laptop meets Corporate devices', 'Risk score 86 is above 70'],
    ])
    /* Each passing finding said once: rules 2 and 3 speak only of the risk. */
    const findings = emily.steps.filter((s) => s.kind === 'checked').map((s) => s.text)
    expect(findings.filter((x) => x === 'Emily Carter is in Sales')).toHaveLength(1)
    expect(findings.filter((x) => x.startsWith('Risk score'))).toHaveLength(3)
    const tom = run(t, saved(t, 'ssi-tom-win10')).run
    expect(tom.rules[0].checks.map((c) => c.line)).toEqual(['Tom Whelan is in DevOps', 'Branch office is in Corporate offices', 'Windows 10 laptop does not meet Compliant devices'])
  })

  it('a filled card starts with a beat of the card; Replay starts at the scan, with the stage said there', () => {
    const t = showcaseTenant()
    const f = form(t, { personId: 'arun', appId: 'github' })
    expect(run(t, f, 'fill').run.steps.slice(0, 3).map((s) => s.kind)).toEqual(['fill', 'collapse', 'find'])
    const replay = run(t, f, 'none').run
    expect(replay.steps[0]).toMatchObject({ kind: 'find', stage: 'Finding the policy for GitHub Enterprise' })
  })

  it('phases follow the step: skeleton, working, settled; a no-match card never shows the rows it did not read', () => {
    const t = showcaseTenant()
    const { run: r } = run(t, form(t, { personId: 'arun', appId: 'github', ...originPatch('home') }))
    const p = r.policies[0]
    expect(policyPhase(p, p.scanAt! - 1)).toBe('waiting')
    expect(policyPhase(p, p.scanAt!)).toBe('working')
    expect(policyPhase(p, r.at.decides)).toBe('settled')
    const r1 = r.rules[0]
    expect(rulePhase(r1, r1.startAt - 1)).toBe('waiting')
    expect(rulePhase(r1, r1.startAt)).toBe('working')
    expect(rulePhase(r1, r1.endAt)).toBe('settled')
    expect(r1.checkAt).toHaveLength(2)
    expect(r1.markAt).toEqual(r1.checkAt.map((s) => s + 1))
    /* A row arrives turning, and its mark lands on the next beat — before the next row arrives. */
    expect(checkPhase(r1, 0, r1.checkAt[0])).toBe('working')
    expect(checkPhase(r1, 0, r1.markAt[0])).toBe('settled')
    expect(checkPhase(r1, 0, r1.checkAt[1])).toBe('settled')
    expect(checkPhase(r1, 2, r.at.done)).toBe('hidden')
    const notReached = r.rules[2]
    expect(rulePhase(notReached, r.at.outcome)).toBe('settled')
  })
})

/* The run opens level by level (§8.6): the policies, then the one that
   decides opening to hold its rules, each rule read and — when it did not
   match — folded to one line as the engine leaves it, then the answer. */
describe('engineRun — the hierarchy opens level by level', () => {
  const t = showcaseTenant()
  const { run: r } = run(t, form(t, { personId: 'arun', appId: 'github', ...originPatch('home') }))
  const [dev, global] = r.policies

  it('the policy that decides opens once it has lit, before its first rule; no other opens by itself', () => {
    expect(r.at.expand).toBe(r.at.decides + 1)
    expect(r.steps[r.at.expand]).toMatchObject({
      kind: 'expand',
      text: 'Checking rules in Developer tools — office and device checks',
      stage: 'Checking rules in Developer tools — office and device checks',
      policy: 0,
    })
    expect(dev.expandAt).toBe(r.at.expand)
    expect(policyOpen(dev, r.at.expand - 1)).toBe(false)
    expect(policyOpen(dev, r.at.expand)).toBe(true)
    expect(global.expandAt).toBeNull()
    expect(policyOpen(global, r.at.done)).toBe(false)
    expect(r.rules[0].startAt).toBe(r.at.expand + 1)
    expect(activeNode(r, r.at.expand)).toBe(dev.node)
  })

  it('a rule that did not match folds to one line naming the check that ended it, as the engine leaves it', () => {
    const [r1, r2] = r.rules
    expect(r1.compactAt).toBe(r1.endAt + 1)
    expect(r.steps[r1.compactAt!]).toMatchObject({ kind: 'compact', rule: 0, text: 'Home broadband is not in Corporate offices' })
    expect(r2.startAt).toBe(r1.compactAt! + 1)
    expect(ruleFolded(r1, r1.endAt)).toBe(false)
    expect(ruleFolded(r1, r1.compactAt!)).toBe(true)
    expect(r1.miss).toBe('Network · Home broadband is not in Corporate offices')
    expect(r1.miss).toBe(r1.checks[r1.failing!].say)
    expect(activeNode(r, r1.compactAt!)).toBe(r1.node)
  })

  it('the rule that matched never folds, and neither does one the engine never reached', () => {
    expect(r.rules[1]).toMatchObject({ state: 'match', compactAt: null, miss: '' })
    expect(r.rules[2]).toMatchObject({ state: 'not-reached', compactAt: null })
  })

  it('then the answer lands, last: the wire out to it, the answer, the summary', () => {
    expect(r.steps.slice(r.at.outcome - 1).map((s) => s.kind)).toEqual(['deciding', 'outcome', 'done'])
    /* While the wire draws, the line keeps what it said; the status region says the stage. */
    expect(r.steps[r.at.outcome - 1]).toMatchObject({ text: 'Rule 2 matches', stage: 'Deciding' })
    expect(r.steps[r.at.outcome].text).toBe('Allow with 2FA')
    expect(r.at.outcome).toBeGreaterThan(Math.max(...r.rules.map((x) => x.endAt)))
    /* The rules after the match settle with it — it matched, so they were not reached — and the wire draws alone. */
    expect(r.rules[2]).toMatchObject({ state: 'not-reached', startAt: r.rules[1].endAt, endAt: r.rules[1].endAt })
    expect(activeNode(r, r.at.outcome)).toBe('outcome')
    expect(activeNode(r, r.at.done)).toBeNull()
    expect(r.summary).toBe('Checked 1 policy · 2 rules · 4 checks')
  })

  it('Tom on Windows 10: both rules fold on their Device row, and the last row, which decides, stays open', () => {
    const { run: tom } = run(t, saved(t, 'ssi-tom-win10'))
    expect(tom.rules.slice(0, 2).every((x) => x.endAt === x.markAt.at(-1))).toBe(true)
    expect(tom.rules.slice(0, 2).map((x) => [x.state, x.compactAt === x.endAt + 1, x.miss])).toEqual([
      ['no-match', true, 'Device · Windows 10 laptop does not meet Compliant devices'],
      ['no-match', true, 'Device · Windows 10 laptop does not meet Compliant devices'],
    ])
    /* Finance's rule folds on Who. */
    expect(tom.rules[2]).toMatchObject({ state: 'no-match', miss: 'Who · Tom Whelan is not in Finance' })
    expect(tom.rules[3]).toMatchObject({ id: LAST_ROW, state: 'match', compactAt: null })
  })
})

describe('timeline — the pace', () => {
  const t = showcaseTenant()
  const all = t.savedSignIns.map((s) => run(t, formOf(s.facts, t.zones)).run)

  /* The page's runs begin with the engine (intro 'none': the bar is the form, nothing folds). */
  const played = (r: EngineRun) => timeline(r.steps.filter((s) => s.kind !== 'fill' && s.kind !== 'collapse'), 'full')

  /* Owner, 30 Sep: "the loading is very fast, so the user can't trace the
     whole process with their eyes" — about 2 s to find the policy, 1 to 1.4 s
     a rule, about 1 s for the answer: 4.5 s for one short rule, 9 at most. */
  it('a first run takes about 4.5 to 9 s, however many rows it has — slow enough to follow with the eye', () => {
    /* The intro steps lead the plan: the played timeline is the plan less them. */
    const lead = (r: EngineRun) => r.steps.filter((s) => s.kind === 'fill' || s.kind === 'collapse').length
    for (const r of all) {
      const tl = played(r)
      expect(tl.total, r.appName).toBeGreaterThanOrEqual(4400)
      expect(tl.total, r.appName).toBeLessThanOrEqual(CAP_MS)
      expect(tl.dur[r.at.outcome - lead(r)], r.appName).toBeGreaterThanOrEqual(900)
    }
    /* A rule reads its rows one at a time: each row arrives, then its mark lands, a beat to read. */
    const rule = all.flatMap((r) => r.rules.filter((x) => x.visited && x.checked > 0).map((x) => ({ r, x })))
    for (const { r, x } of rule) {
      const tl = played(r)
      const off = lead(r)
      x.markAt.forEach((m, k) => expect(tl.dur[m - off] + tl.dur[x.checkAt[k] - off], `${r.appName} ${x.name}`).toBeGreaterThanOrEqual(300))
    }
  })

  /* Finding the policy reads as a search (§12.4; owner, 30 Sep): from the
     card arriving to the one that decides opening, about 2 s — however many
     policies are on the application — the scan stepping row by row, each
     between its least and its most, the light's lap and the settle keeping
     their length. */
  it('finding the policy takes about 1.7 to 2.5 s, with one policy or three', () => {
    const stage = (r: EngineRun) => {
      const tl = timeline(r.steps, 'full')
      return tl.at[r.at.expand] - tl.at[r.at.which]
    }
    const one = run(t, form(t, { personId: 'arun', appId: 'github' })).run
    const two = run(t, form(t, { personId: 'u-hr-1', appId: 'hrms' })).run
    expect(one.policies.filter((p) => p.scanned)).toHaveLength(1)
    expect(two.policies.filter((p) => p.scanned)).toHaveLength(2)
    for (const r of [one, two, ...all]) {
      if (r.at.expand < 0) continue
      const n = r.policies.filter((p) => p.scanned).length
      if (n > 3) continue
      expect(stage(r), `${r.appName}: ${n}`).toBeGreaterThanOrEqual(1700)
      expect(stage(r), `${r.appName}: ${n}`).toBeLessThanOrEqual(2500)
    }
    /* The scans share one budget, each held between its least and its most. */
    const scans = (r: EngineRun) => {
      const tl = timeline(r.steps, 'full')
      return r.steps.flatMap((s, i) => (s.kind === 'scan' ? [tl.dur[i]] : []))
    }
    expect(scans(one)).toEqual([SCAN_MS.max])
    expect(scans(two)).toEqual([SCAN_MS.budget / 2, SCAN_MS.budget / 2])
    /* The rules' rows never eat into the search: a policy with many checks reads its rows faster, not its policies. */
    const longest = [...all].sort((a, b) => b.steps.length - a.steps.length)[0]
    const tl = timeline(longest.steps, 'full')
    const found = longest.steps.findIndex((s) => s.kind === 'found')
    if (found >= 0) expect(tl.dur[found]).toBe(tl.dur[one.at.found])
  })

  it('a run from an edit plays at 60 %, reduced motion at once', () => {
    const r = all[0]
    const full = timeline(r.steps, 'full')
    const edit = timeline(r.steps, 'edit')
    expect(Math.abs(edit.total - full.total * EDIT_SHARE)).toBeLessThan(r.steps.length)
    expect(timeline(r.steps, 'instant')).toMatchObject({ total: 0 })
  })

  it('every step starts where the one before it ends', () => {
    const tl = timeline(all[0].steps, 'full')
    tl.at.forEach((a, i) => i > 0 && expect(a).toBe(tl.at[i - 1] + tl.dur[i - 1]))
  })

  /* The canvas plays each step at its planned start (TryJourney's clock is
     absolute), so the plan's total IS the run: the showcase's longest run —
     the saved sign-in with the most rows, and the most that any person on any
     application reads — stays inside the cap with its card's collapse. */
  it('the longest run on the showcase stays inside the cap', () => {
    const everyone = t.directory.people.flatMap((u) => t.apps.map((a) => run(t, form(t, { personId: u.id, appId: a.id, device: { kind: 'preset', id: 'win11-unregistered' }, risk: '86' })).run))
    const totals = [...all, ...everyone].map((r) => played(r).total)
    const longest = Math.max(...totals)
    expect(longest).toBeLessThanOrEqual(CAP_MS)
    expect(CAP_MS).toBeGreaterThanOrEqual(7000)
    expect(CAP_MS).toBeLessThanOrEqual(9000)
  })
})

/* The plan is read off the resolver, and must never say anything else: the
   same policy decides, the walk stops on the same rule, the answer Depends
   exactly when the resolver's does, and a rule the engine settles by its
   first failing row settles to what the trace says it is. Over every saved
   sign-in, and every person on every application in three sign-ins — in the
   office on a registered laptop at low risk, at home on an unregistered one at
   high risk, and with the device left unstated. */
/* The check the evaluator failed first, in the order it reads them — the
   who, then every condition in `leaves()` order — as its category. */
const firstFailing = (rule: Rule, step: RuleTrace): PillCategory | null => {
  if (step.who === 'out') return 'who'
  const byId = new Map(leaves(rule.when).map((c) => [c.id, c]))
  const c = step.conditions.find((x) => x.status === 'fail')
  const cond = c ? byId.get(c.conditionId) : undefined
  return cond ? conditionRequirement(cond, () => undefined).category : null
}

/* The plan says what the resolver said, and nothing else: the same policy
   decides, the walk stops on the same rule, each rule the engine read settles
   to its trace, a rule that did not match folds on the check the evaluator
   failed first, only the one that decides opens, and the answer lands last.
   `list` is the policies as the resolver evaluated them (the substitute in
   place of its twin): the rules are looked up there. */
function expectAgrees(r: EngineRun, res: TenantResolution, list: readonly Policy[], label: string): { depends: number; folded: number } {
  let depends = 0
  let folded = 0
  expect(r.decider?.id ?? null, label).toBe(res.decidedBy?.policyId ?? null)
  expect(r.outcome.status, label).toBe(res.status)
  expect(r.outcome.possible, label).toEqual(res.possible.map((o) => o.decision))
  if (res.status === 'depends') depends++
  const decides = r.policies.filter((p) => p.decides)
  expect(decides.map((p) => p.policyId), label).toEqual(res.decidedBy ? [res.decidedBy.policyId] : [])
  if (decides.length) expect(r.policies.filter((p) => p.scanned).at(-1)?.decides, label).toBe(true)
  const trace = res.trace
  if (!trace || !res.decidedBy) return { depends, folded }
  const decider = list.find((p) => p.id === res.decidedBy!.policyId)!
  const expected = trace.hitIndex !== null ? decider.rules[trace.hitIndex].id : trace.lastRow ? LAST_ROW : null
  expect(r.landing === null ? null : r.rules[r.landing].id, label).toBe(expected)
  /* Every rule of the policy as evaluated, in its order, then the last row. */
  expect(r.rules.map((x) => x.id), label).toEqual([...decider.rules.map((x) => x.id), LAST_ROW])
  /* The conflicts (§13.1) are measured from the same answer: the same decider, the same landing rule. */
  expect(r.conflicts?.policyId, label).toBe(res.decidedBy.policyId)
  expect(r.conflicts?.landing?.index ?? null, label).toBe(trace.hitIndex)
  for (const rule of r.rules) {
    if (!rule.visited || rule.index === null) continue
    const step = trace.steps.find((s) => s.ruleId === rule.id)!
    const said = step.match === 'yes' ? 'match' : step.match === 'no' ? 'no-match' : 'unknown'
    expect(rule.state, `${label} ${rule.name}`).toBe(said)
    expect(rule.name, `${label} ${rule.name}`).toBe(decider.rules[rule.index].name)
    expect(rule.checkAt, `${label} ${rule.name}`).toHaveLength(rule.checked)
    rule.checkAt.forEach((s) => expect(s > rule.startAt && s < rule.endAt).toBe(true))
    /* Each read row in two beats, its mark on the step after it arrives, the rule settled no earlier than its last mark. */
    expect(rule.markAt, `${label} ${rule.name}`).toEqual(rule.checkAt.map((s) => s + 1))
    if (rule.markAt.length > 0) expect(rule.endAt, `${label} ${rule.name}`).toBeGreaterThanOrEqual(rule.markAt.at(-1)!)
    /* A rule that did not match folds as the engine leaves it, and its one
       line names the check the evaluator failed first. */
    if (rule.state === 'no-match') {
      folded++
      const row = rule.checks[rule.failing ?? -1]
      expect(row, `${label} ${rule.name}`).toBeDefined()
      expect(rule.compactAt, `${label} ${rule.name}`).toBe(rule.endAt + 1)
      expect(row.category, `${label} ${rule.name}`).toBe(firstFailing(decider.rules[rule.index], step))
      expect(rule.miss, `${label} ${rule.name}`).toBe(row.say)
      expect(rule.miss.startsWith(`${CATEGORY_WORD[row.category]} · `), `${label} ${rule.name}`).toBe(true)
    } else {
      expect(rule.compactAt, `${label} ${rule.name}`).toBeNull()
    }
  }
  /* Only the policy that decides opens, after it lights and before its first rule. */
  const opens = r.policies.filter((p) => p.expandAt !== null)
  expect(opens.map((p) => p.policyId), label).toEqual([res.decidedBy.policyId])
  expect(opens[0].expandAt, label).toBe(r.at.expand)
  expect(r.at.expand, label).toBeGreaterThan(r.at.decides)
  /* Nothing is drawn as a match that did not match: a rule only when its
     trace says yes, the last row only when the answer is decided by it —
     when it Depends, the last row is "If not". */
  const last = r.rules.at(-1)!
  if (last.state === 'match') expect(res.status, label).toBe('decided')
  if (res.status === 'depends' && trace.hitIndex === null && trace.lastRow !== null) expect(last.state, label).toBe('possible')
  /* The answer lands last. */
  expect(r.steps.slice(-2).map((s) => s.kind), label).toEqual(['outcome', 'done'])
  return { depends, folded }
}

/* The plan is read off the resolver, and must never say anything else: the
   same policy decides, the walk stops on the same rule, the answer Depends
   exactly when the resolver's does, and a rule the engine settles by its
   first failing row settles to what the trace says it is. Over every saved
   sign-in, and every person on every application in three sign-ins — in the
   office on a registered laptop at low risk, at home on an unregistered one at
   high risk, and with the device left unstated. */
describe('engineRun — parity with resolveSignIn on the showcase tenant', () => {
  const t = showcaseTenant()
  const variants: Partial<SignInForm>[] = [
    {},
    { ...originPatch('home'), device: { kind: 'preset', id: 'win11-unregistered' }, risk: '86' },
    { ...originPatch('branch'), device: { kind: 'none' }, risk: '55' },
  ]
  const forms: SignInForm[] = [
    ...t.savedSignIns.map((s) => formOf(s.facts, t.zones)),
    ...t.directory.people.flatMap((u) => t.apps.flatMap((a) => variants.map((v) => form(t, { personId: u.id, appId: a.id, ...v })))),
  ]
  /* The inside-a-policy sweeps: every saved sign-in, and every person in
     the first two sign-ins (the third adds no path the two do not take) — for
     a policy standing in, on the applications it covers (on any other it
     cannot decide, and its standing is the stored one's); the Global
     Default, which covers them all and stands in for itself, on every
     application in the first sign-in. */
  const saved: SignInForm[] = t.savedSignIns.map((s) => formOf(s.facts, t.zones))
  const everyone = (vs: readonly Partial<SignInForm>[], apps: readonly string[]) =>
    t.directory.people.flatMap((u) => apps.flatMap((appId) => vs.map((v) => form(t, { personId: u.id, appId, ...v }))))
  const standingIn = (p: Policy): SignInForm[] =>
    p.isSystem ? [...saved, ...everyone(variants.slice(0, 1), t.apps.map((a) => a.id))] : [...saved, ...everyone(variants.slice(0, 2), p.appIds)]
  /* A focus changes what is drawn, never the answer or the order the engine
     asks in: every saved sign-in and every person on every application, in
     the office, each resolved once. */
  const focused: SignInForm[] = [...saved, ...everyone(variants.slice(0, 1), t.apps.map((a) => a.id))]
  const whole = new Map(focused.map((f) => [f, run(t, f)]))

  it(`agrees on all ${forms.length} sign-ins`, () => {
    let depends = 0
    let folded = 0
    for (const f of forms) {
      const { run: r, res } = run(t, f)
      const n = expectAgrees(r, res, t.policies, `${f.personId} on ${f.appId}`)
      depends += n.depends
      folded += n.folded
    }
    expect(depends).toBeGreaterThan(0)
    expect(folded).toBeGreaterThan(0)
  }, 30_000)

  /* Inside a policy, the plan is drawn from the resolution with the draft
     standing in — and the draft is looked up in the list as evaluated, so its
     rules are the ones drawn. A policy standing in unchanged counts as on
     whatever its status (HRMS, off, decides for its audience). */
  it(`agrees with every policy standing in, unchanged, on the sign-ins it can decide`, () => {
    let decidedBySub = 0
    let asked = 0
    for (const sub of t.policies) {
      const list = evaluatedList(t.policies, sub)
      for (const f of standingIn(sub)) {
        const { run: r, res } = runIn(t, f, { substitute: sub })
        expectAgrees(r, res, list, `${sub.id} standing in: ${f.personId} on ${f.appId}`)
        if (res.decidedBy?.policyId === sub.id) decidedBySub++
        asked++
      }
    }
    expect(decidedBySub).toBeGreaterThan(0)
    expect(asked).toBeGreaterThan(1000)
  }, 30_000)

  /* A policy's own trace: it and the one that decides, and no other — with
     the same decider, walk and answer as the whole tenant's. */
  it(`draws every policy as the focus, and only it and the one that decides, on ${focused.length} sign-ins each`, () => {
    let apart = 0
    for (const f of focused) {
      const { run: all, res } = whole.get(f)!
      const facts = factsOf(f, t.zones).facts
      const rows = rowsRead(t.policies, null, f.appId, { zones: t.zones, fingerprints: t.fingerprints })
      const base = { res, policies: t.policies, form: f, facts, env: envOf(t), ctx: { people: t.directory.people, apps: t.apps, zones: t.zones, rows } }
      for (const p of t.policies) {
        const label = `${p.id} in focus: ${f.personId} on ${f.appId}`
        const r = engineRun({ ...base, focus: p.id })
        expectAgrees(r, res, t.policies, label)
        expect(r.rules.map((x) => [x.id, x.state]), label).toEqual(all.rules.map((x) => [x.id, x.state]))
        const ids = r.policies.map((x) => x.policyId)
        expect(new Set(ids), label).toEqual(new Set([p.id, ...(res.decidedBy ? [res.decidedBy.policyId] : [])]))
        /* In the order the whole tenant's run asks them. */
        const order = all.policies.map((x) => x.policyId).filter((id) => ids.includes(id))
        if (order.length === ids.length) expect(ids, label).toEqual(order)
        else apart++
      }
    }
    /* Some focus policies are not on the application at all, and are drawn with why. */
    expect(apart).toBeGreaterThan(0)
  }, 30_000)
})

/* TESTING-V4 §13: the plan carries what else would apply to the person, and
   each rule's who says which of the person's groups let them in. It adds no
   step: the run plays exactly as it did. */
describe('engineRun — a person in two groups (§13.1)', () => {
  const t = showcaseTenant()
  const f = saved(t, 'ssi-maya-github')

  it('Maya on GitHub: rule 1 decides via Engineering, and the plan carries the Finance conflict', () => {
    const { run: r, res } = run(t, f)
    expect(res.decision).toBe('1fa')
    expect(r.landing).toBe(0)
    expect(r.rules.map((x) => [x.index, x.via?.say ?? null])).toEqual([
      [0, 'via Engineering'],
      [1, 'via Engineering'],
      [2, 'via Finance'],
      [null, null],
    ])
    expect(r.rules[0].checks[0].line).toBe('Maya Iyer is in Engineering')
    expect(r.conflicts?.conflicts.map((c) => [c.number, c.via.label, c.ask.words])).toEqual([[3, 'Finance', 'Allow with 2FA']])
    expect(r.conflicts?.line).toBe("Maya Iyer is in Engineering and Finance — Engineering's rule applies first")
  })

  it('on the Finance rule, the Who finding names the group that let her in', () => {
    /* On Windows 10 every rule fails on the device, so each is read — the Finance rule too — and the last row decides. */
    const { run: r } = run(t, { ...f, device: { kind: 'preset', id: 'win10' } })
    expect(r.rules[2].checks.map((c) => c.line)).toEqual(['Maya Iyer is in Finance', 'Windows 10 laptop does not meet Compliant devices'])
    expect(r.conflicts?.rules).toEqual([])
  })

  it('adds no step: the plan with the conflicts is the plan without them', () => {
    const { run: r } = run(t, f)
    expect(r.steps.filter((s) => s.kind === 'rule').map((s) => s.text)).toEqual(['Rule 1 · In the office on a compliant device'])
  })

  it('an empty run has no conflicts', () => {
    const { run: r } = run(t, form(t, { appId: 'github' }))
    expect(r.empty).toBe(true)
    expect(r.conflicts).toBeUndefined()
    expect(r.asEachGroup).toBeUndefined()
  })

  /* The per-group comparison (conflicts.ts `asEachGroup`) rides on the plan
     for a person in two or more groups, and only then. */
  it('carries the answer as each of her groups, and none for a person in one group', () => {
    const { run: r } = run(t, f)
    expect(r.asEachGroup?.rows.map((x) => [x.label, x.words])).toEqual([
      ['As Engineering', 'Allow on 1 factor'],
      ['As Finance', 'Allow with 2FA'],
      ['As Maya (both)', 'Allow on 1 factor'],
    ])
    expect(r.asEachGroup?.why).toBe("Engineering's rule comes first")
    expect(run(t, saved(t, 'ssi-arun-office')).run.asEachGroup).toBeUndefined()
  })

  /* Leo Fernandes IS in Engineering: "Engineering except Contractors" leaves
     him out because he is in Contractors too. The failing row says the
     exception, never "not in Engineering". */
  it('a who that fails on an exception is said by the exception', () => {
    const { run: r } = run(t, saved(t, 'ssi-leo-slack'))
    expect(r.rules[0]).toMatchObject({ state: 'no-match', miss: 'Who · Leo Fernandes is in Contractors, an exception' })
    expect(r.rules[0].checks[0].line).toBe('Leo Fernandes is in Contractors, an exception')
    expect(r.rules[1].checks[0].line).toBe('Leo Fernandes is in Contractors')
    /* Somebody simply outside the who is still said by the groups it names. */
    expect(run(t, saved(t, 'ssi-leo-aws')).run.rules[0].checks[0].line).toBe('Leo Fernandes is in Contractors')
  })

  /* The troubleshooting cases' other rule conflicts are named as the engine
     decides, the same notice beat as Maya's. */
  it('names a Deny that came first, and a name in a later rule, in the notice beat', () => {
    const leo = run(t, saved(t, 'ssi-leo-aws')).run
    expect(leo.steps.find((s) => s.notice)?.text).toBe('Rule 2 also applies to Leo Fernandes · via Engineering')
    expect(leo.conflicts?.findings[0]).toMatchObject({ kind: 'deny-first', caution: 'It would let in people rule 1 refuses today' })
    const thomas = run(t, saved(t, 'ssi-thomas-aws')).run
    expect(thomas.steps.find((s) => s.notice)?.text).toBe('Rule 2 also applies to Thomas Byrne · by name')
    expect(thomas.asEachGroup).toBeUndefined()
  })
})

describe('engineRun — inside a policy: its draft and its own trace', () => {
  const t = showcaseTenant()
  const hrms = t.policies.find((p) => p.id === 'sc-hrms-office')!
  const dev = t.policies.find((p) => p.id === 'sc-dev-tools')!

  it('HRMS, switched off, standing in: it decides for its audience, drawn with its own rule', () => {
    const f = form(t, { personId: 'u-hr-1', appId: 'hrms' })
    const { run: r, res } = runIn(t, f, { substitute: hrms, focus: hrms.id })
    expect(res.decidedBy?.policyId).toBe(hrms.id)
    expect(r.policies.map((p) => [p.policyId, p.kind, p.reason])).toEqual([[hrms.id, 'decides', '']])
    /* Rule ids come from a counter, so they are read from the policy. */
    expect(r.rules.map((x) => [x.id, x.name, x.state])).toEqual([
      [hrms.rules[0].id, 'In a corporate office', 'match'],
      [LAST_ROW, 'Nothing else matched', 'not-reached'],
    ])
    expect(r.rules[0].checks.map((c) => c.word)).toContain('Network')
    expect(r.outcome.ruleLine).toBe('Rule 1 · In a corporate office')
    expectAgrees(r, res, evaluatedList(t.policies, hrms), 'hrms')
  })

  it('HRMS as it is saved, in focus: switched off, one line, and the Global Default decides', () => {
    const { run: r } = runIn(t, form(t, { personId: 'u-hr-1', appId: 'hrms' }), { focus: hrms.id })
    expect(r.policies.map((p) => [p.policyId, p.kind, p.reason])).toEqual([
      [hrms.id, 'waiting', 'Switched off'],
      ['global-default', 'decides', ''],
    ])
  })

  it('a person outside the audience: the Global Default decides, and the policy names them', () => {
    const { run: r } = runIn(t, form(t, { personId: 'arun', appId: 'hrms' }), { substitute: hrms, focus: hrms.id })
    expect(r.decider?.id).toBe('global-default')
    expect(r.policies.map((p) => [p.policyId, p.decides, p.reason])).toEqual([
      [hrms.id, false, 'Arun Patel is not in this policy'],
      ['global-default', true, ''],
    ])
    /* Its tooltip is the resolver's sentence: whose audience it is. */
    expect(r.policies[0].tip).toMatch(/^Not in audience: /)
  })

  it('a policy not on the application is still drawn, with why', () => {
    const { run: r } = runIn(t, form(t, { personId: 'arun', appId: 'hrms' }), { focus: dev.id })
    expect(r.policies.find((p) => p.policyId === dev.id)).toMatchObject({ kind: 'elsewhere', reason: 'Does not cover HRMS' })
    expect(r.policies.filter((p) => p.decides).map((p) => p.policyId)).toEqual(['global-default'])
  })

  /* The draft is drawn, not the saved rules. An edit: rule 1 no longer asks
     for the office, and a new first rule leaves Arun out. At home, the saved
     policy's rule 1 fails on the network and rule 2 matches; the edited one's
     new rule fails on Who, and its rule 2 — the old rule 1, without the
     office — matches. */
  it('an edited Developer tools: the edits are drawn, and agree with the resolver', () => {
    const [r1, r2] = dev.rules
    const card = r1.when.cards[0]
    const edited: Policy = {
      ...dev,
      rules: [
        { ...r2, id: 'r-new', name: 'Sales only', decision: 'deny', who: { groupIds: ['sales'], userIds: [] }, when: { ...r2.when, cards: [] } },
        { ...r1, name: 'Compliant device, anywhere', when: { ...r1.when, cards: [{ ...card, conditions: card.conditions.filter((c) => c.typeId !== 'zone') }] } },
        r2,
      ],
    }
    const f = form(t, { personId: 'arun', appId: 'github', ...originPatch('home') })
    const stored = run(t, f).run
    expect(stored.rules.map((x) => [x.id, x.state])).toEqual([
      [dev.rules[0].id, 'no-match'],
      [dev.rules[1].id, 'match'],
      [dev.rules[2].id, 'not-reached'],
      [LAST_ROW, 'not-reached'],
    ])
    const { run: r, res } = runIn(t, f, { substitute: edited, focus: dev.id })
    expect(r.rules.map((x) => [x.id, x.name, x.state])).toEqual([
      ['r-new', 'Sales only', 'no-match'],
      [dev.rules[0].id, 'Compliant device, anywhere', 'match'],
      [dev.rules[1].id, 'Compliant device, working remotely', 'not-reached'],
      [LAST_ROW, 'Nothing else matched', 'not-reached'],
    ])
    expect(r.rules[0].miss).toBe('Who · Arun Patel is not in Sales')
    expect(r.rules[1].checks.map((c) => c.word)).toEqual(['Who', 'Device'])
    expect(r.outcome).toMatchObject({ decision: '1fa', ruleLine: 'Rule 2 · Compliant device, anywhere' })
    expect(r.policies.map((p) => [p.policyId, p.decides])).toEqual([[dev.id, true]])
    expectAgrees(r, res, evaluatedList(t.policies, edited), 'edited')
    /* Drawn against the stored list instead, the draft's result would name the saved rules. */
    expect(engineRun({ ...inputOf(t, f), res }).rules[0].id).toBe(dev.rules[0].id)
  })

  it('what the card asks is read from the draft', () => {
    const lib = { zones: t.zones, fingerprints: t.fingerprints }
    const [r1] = dev.rules
    const card = r1.when.cards[0]
    const noOffice: Policy = { ...dev, rules: [{ ...r1, when: { ...r1.when, cards: [{ ...card, conditions: card.conditions.filter((c) => c.typeId !== 'zone') }] } }, dev.rules[1]] }
    /* The Global Default reads the place (rules 1 and 2) and the device (rule
       1) on every application since its baseline (30 Sep 2026), so it leads
       each line; the draft's own readers follow it. */
    expect(readersOf(t.policies, 'github', lib).from).toBe('Read by Global Default Policy · Rules 1, 2; Developer tools — office and device checks · Rule 1')
    expect(readersOf(t.policies, 'github', lib, noOffice).from).toBe('Read by Global Default Policy · Rules 1, 2')
    /* "+1": the Code review draft on GitHub reads the device too (30 Sep 2026). */
    expect(readersOf(t.policies, 'github', lib, noOffice).device).toBe('Read by Global Default Policy · Rule 1; Developer tools — office and device checks · Rules 1, 2 +1')
    /* The draft's two rules, not the stored three. */
    expect(readersOf(t.policies, 'github', lib).device).toBe('Read by Global Default Policy · Rule 1; Developer tools — office and device checks · Rules 1, 2, 3 +1')
  })

  it('the suggestions can prefer the sign-ins a policy decides', () => {
    const env = envOf(t)
    const judge = (s: (typeof t.savedSignIns)[number]) => resolveSignIn(t.policies, s.facts, env)
    const mine = suggestionsOf(t.savedSignIns, judge, (res) => res.decidedBy?.policyId === dev.id)
    const decidedBy = mine.map((s) => judge(s).decidedBy?.policyId)
    expect(decidedBy.filter((id) => id === dev.id).length).toBeGreaterThan(0)
    /* The default is unchanged. */
    expect(suggestionsOf(t.savedSignIns, judge).map((s) => s.id)).toEqual(['ssi-vikram-laptop', 'ssi-sofia-london', 'ssi-devon-android'])
  })
})

/* The engine's input for a sign-in on the tenant as it stands. */
function inputOf(t: Tenant, f: SignInForm) {
  const env = envOf(t)
  const { facts } = factsOf(f, t.zones)
  const rows = rowsRead(t.policies, null, f.appId, { zones: t.zones, fingerprints: t.fingerprints })
  return { res: resolveSignIn(t.policies, facts, env), policies: t.policies, form: f, facts, env, ctx: { people: t.directory.people, apps: t.apps, zones: t.zones, rows } }
}

describe('the card: what it asks, and what it starts from', () => {
  const t = showcaseTenant()
  const lib = { zones: t.zones, fingerprints: t.fingerprints }

  it('asks only what the rules on the application read, and says which rules read it', () => {
    expect(askedFields(rowsRead(t.policies, null, 'github', lib))).toEqual(['from', 'place', 'device'])
    /* Google Workspace asks the place too: the Global Default's operating
       countries (30 Sep 2026). */
    expect(askedFields(rowsRead(t.policies, null, 'google-workspace', lib))).toEqual(['from', 'place', 'device', 'risk'])
    const read = readersOf(t.policies, 'github', lib)
    /* "+1": the Code review draft on GitHub reads the device too (30 Sep 2026). */
    expect(read.device).toBe('Read by Global Default Policy · Rule 1; Developer tools — office and device checks · Rules 1, 2, 3 +1')
    expect(read.from).toBe('Read by Global Default Policy · Rules 1, 2; Developer tools — office and device checks · Rule 1')
    expect(read.risk).toBe('')
    expect(readersOf(t.policies, 'hrms', lib).from).toBe('Read by Global Default Policy · Rules 1, 2; HRMS access from corporate offices · Rule 1')
  })

  it('fills an asked field with its default, never one emptied by hand', () => {
    const rows = rowsRead(t.policies, null, 'google-workspace', lib)
    const blank = { ...emptyDraft(TODAY, '10:15'), device: { kind: 'none' as const }, risk: '' }
    expect(withDefaults(blank, rows, [], TODAY, '10:15')).toMatchObject({ device: { kind: 'preset', id: 'win11-registered' }, risk: '12' })
    expect(withDefaults(blank, rows, ['device'], TODAY, '10:15')).toMatchObject({ device: { kind: 'none' }, risk: '12' })
  })

  it('a run is of the asked facts only, and a missing person or application is said under its field', () => {
    const rows = rowsRead(t.policies, null, 'hrms', lib)
    const f = { ...emptyDraft(TODAY, '09:30'), personId: 'u-hr-1', appId: 'hrms' }
    /* HRMS asks the device since the Global Default's baseline (30 Sep 2026)
       reads it, so the draft's device is kept; nothing reads a risk score. */
    expect(forRun(f, rows)).toMatchObject({ device: { kind: 'preset', id: 'win11-registered' }, risk: '' })
    expect(cardIssues(emptyDraft(TODAY, '09:30'), rows, t.zones).map((i) => [i.field, i.message])).toEqual([
      ['person', 'Choose a person'],
      ['app', 'Choose an application'],
    ])
  })

  it('suggests three saved sign-ins that take different paths, app policies first', () => {
    const env = envOf(t)
    const picks = suggestionsOf(t.savedSignIns, (s) => resolveSignIn(t.policies, s.facts, env))
    expect(picks.map((s) => s.id)).toEqual(['ssi-vikram-laptop', 'ssi-sofia-london', 'ssi-devon-android'])
  })
})
