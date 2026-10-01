import { describe, expect, it } from 'vitest'

import { showcaseTenant, showcaseTenantHrmsOn, type Tenant } from '../../fixtures'
import { envOf, resolveSignIn } from '../tenant-resolver'
import { LAST_ROW } from '../testing/evidence'
import { rowsRead } from '../testing/rows-read'
import { factsOf, formOf, originPatch, type SignInForm } from '../testing/sign-in-form'
import {
  CAP_MS,
  EDIT_SHARE,
  checkPhase,
  engineRun,
  policyPhase,
  readersOf,
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
  })

  it('an app policy that decides stops the scan: the Global Default after it is never checked, and settles with its reason', () => {
    const t = showcaseTenant()
    const { run: r } = run(t, form(t, { personId: 'arun', appId: 'github' }))
    expect(r.policies.map((p) => [p.name, p.kind, p.scanned])).toEqual([
      ['Developer tools — office and device checks', 'decides', true],
      ['Global Default Policy', 'lost', false],
    ])
    expect(r.policies[1].reason).toBe('Not reached')
    expect(r.policies[1].tip).toBe('An app policy applies')
    expect(r.policies[1].scanAt).toBeNull()
    expect(r.policies[1].settleAt).toBe(r.at.decides)
  })

  it('the engine asks custom-group policies first, then the DEFAULT group, then the Global Default', () => {
    const t = showcaseTenantHrmsOn()
    const { run: r } = run(t, form(t, { personId: 'u-hr-1', appId: 'hrms' }))
    expect(r.policies[0]).toMatchObject({ name: 'HRMS access from corporate offices', decides: true })
    expect(r.policies.at(-1)).toMatchObject({ isGlobalDefault: true })
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
    expect(r.rules[2]).toMatchObject({ id: LAST_ROW, name: 'Nothing else matched', state: 'match', decision: 'deny' })
    expect(r.landing).toBe(2)
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

  it('a rule with no conditions reads nothing and matches', () => {
    const t = showcaseTenant()
    const { run: r } = run(t, form(t, { personId: 'u-hr-1', appId: 'hrms' }))
    expect(r.rules[0]).toMatchObject({ name: 'Baseline access', state: 'match', checked: 0, checks: [] })
    expect(r.summary).toBe('Checked 2 policies · 1 rule')
  })
})

describe('engineRun — the steps', () => {
  it('reads in order: collapse, find, a scan per policy, decides, rules, each rule and its checks, deciding, the answer, done', () => {
    const t = showcaseTenant()
    const { run: r } = run(t, form(t, { personId: 'arun', appId: 'github', ...originPatch('home') }))
    expect(r.steps.map((s) => s.kind)).toEqual([
      'collapse', 'find', 'scan', 'decides', 'rules',
      'rule', 'check', 'check', 'rule-end',
      'rule', 'check', 'check', 'rule-end',
      'deciding', 'outcome', 'done',
    ])
    expect(r.steps.filter((s) => s.stage).map((s) => s.stage)).toEqual(['Finding the policy for GitHub Enterprise', 'Checking rules in Developer tools — office and device checks', 'Deciding'])
    expect(r.steps.at(-1)!.text).toBe(r.summary)
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
    expect(checkPhase(r1, 0, r1.checkAt[0])).toBe('working')
    expect(checkPhase(r1, 0, r1.checkAt[1])).toBe('settled')
    expect(checkPhase(r1, 2, r.at.done)).toBe('hidden')
    const notReached = r.rules[2]
    expect(rulePhase(notReached, r.at.outcome)).toBe('settled')
  })
})

describe('timeline — the pace', () => {
  const t = showcaseTenant()
  const all = t.savedSignIns.map((s) => run(t, formOf(s.facts, t.zones)).run)

  it('a first run takes about 2.5 to 4.2 s, however many rows it has', () => {
    for (const r of all) {
      const tl = timeline(r.steps.filter((s) => s.kind !== 'fill'), 'full')
      expect(tl.total, r.appName).toBeGreaterThanOrEqual(2500)
      expect(tl.total, r.appName).toBeLessThanOrEqual(CAP_MS + 200)
    }
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
})

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

  it(`agrees on all ${forms.length} sign-ins`, () => {
    let depends = 0
    for (const f of forms) {
      const { run: r, res } = run(t, f)
      const label = `${f.personId} on ${f.appId}`
      expect(r.decider?.id ?? null, label).toBe(res.decidedBy?.policyId ?? null)
      expect(r.outcome.status, label).toBe(res.status)
      expect(r.outcome.possible, label).toEqual(res.possible.map((o) => o.decision))
      if (res.status === 'depends') depends++
      const decides = r.policies.filter((p) => p.decides)
      expect(decides.map((p) => p.policyId), label).toEqual(res.decidedBy ? [res.decidedBy.policyId] : [])
      if (decides.length) expect(r.policies.filter((p) => p.scanned).at(-1)?.decides, label).toBe(true)
      const trace = res.trace
      if (!trace || !res.decidedBy) continue
      const decider = t.policies.find((p) => p.id === res.decidedBy!.policyId)!
      const expected = trace.hitIndex !== null ? decider.rules[trace.hitIndex].id : trace.lastRow ? LAST_ROW : null
      expect(r.landing === null ? null : r.rules[r.landing].id, label).toBe(expected)
      for (const rule of r.rules) {
        if (!rule.visited || rule.index === null) continue
        const step = trace.steps.find((s) => s.ruleId === rule.id)!
        const said = step.match === 'yes' ? 'match' : step.match === 'no' ? 'no-match' : 'unknown'
        expect(rule.state, `${label} ${rule.name}`).toBe(said)
        expect(rule.checkAt, `${label} ${rule.name}`).toHaveLength(rule.checked)
        rule.checkAt.forEach((s) => expect(s > rule.startAt && s < rule.endAt).toBe(true))
      }
    }
    expect(depends).toBeGreaterThan(0)
  })
})

describe('the card: what it asks, and what it starts from', () => {
  const t = showcaseTenant()
  const lib = { zones: t.zones, fingerprints: t.fingerprints }

  it('asks only what the rules on the application read, and says which rules read it', () => {
    expect(askedFields(rowsRead(t.policies, null, 'github', lib))).toEqual(['from', 'place', 'device'])
    expect(askedFields(rowsRead(t.policies, null, 'google-workspace', lib))).toEqual(['from', 'device', 'risk'])
    const read = readersOf(t.policies, 'github', lib)
    expect(read.device).toBe('Read by Developer tools — office and device checks · Rules 1, 2')
    expect(read.from).toBe('Read by Developer tools — office and device checks · Rule 1')
    expect(read.risk).toBe('')
    expect(readersOf(t.policies, 'hrms', lib).from).toBe('Read by HRMS access from corporate offices · Rule 1')
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
    expect(forRun(f, rows)).toMatchObject({ device: { kind: 'none' }, risk: '' })
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
