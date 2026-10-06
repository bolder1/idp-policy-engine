import { describe, expect, it } from 'vitest'

import { showcaseTenant } from '../../../fixtures'
import { runColumns, type ColumnSpec } from '../../board/try-sign-in'
import { envOf } from '../../tenant-resolver'
import { rowsRead } from '../../testing/rows-read'
import { screensOf } from '../../testing/screens-of'
import { factsOf, originPatch, type SignInForm } from '../../testing/sign-in-form'
import { audienceViaOf } from '../conflicts'
import { engineRun, type EngineRun } from '../engine-run'
import { emptyDraft, forRun, withDefaults } from '../sign-in-card'
import { answerLineOf, citeOfTarget, decidingLine, evidenceOf, howStepOf, howStepsOf, rowLitOf, spokenOf, type EvidenceInput } from './brief-evidence'
import { briefOf, type BriefModel } from './brief-model'

/* -----------------------------------------------------------------------------
   The brief's evidence (brief-evidence.ts `evidenceOf`) over REAL runs of the
   showcase tenant, built as the page builds them: the model the panel's
   "How it was decided" draws from. It says the plan's own words, the
   person's name as stored (never lower-cased), a mark only as the engine
   found it (never ✓ beside a failing check), the deny message verbatim, each
   answer a Depends could be, and a run of every person on every application
   never throws.
   -------------------------------------------------------------------------- */

const TODAY = '2026-10-02'
const t = showcaseTenant()
const env = envOf(t)
const lib = { zones: t.zones, fingerprints: t.fingerprints }
const AS_IT_STANDS: ColumnSpec = { id: 'live', label: 'As the tenant stands', tip: 'Every policy as saved' }

interface Run {
  plan: EngineRun
  model: BriefModel
  inp: EvidenceInput
}

function runOf(personName: string, appName: string, opts: { origin?: 'home' | 'tor'; patch?: Partial<SignInForm>; policies?: typeof t.policies } = {}): Run {
  const person = t.directory.people.find((p) => p.name === personName)
  const app = t.apps.find((a) => a.name === appName)
  if (!person || !app) throw new Error(`no ${personName} or ${appName} in the showcase`)
  return runFor(person, app, opts)
}

function runFor(person: (typeof t.directory.people)[number], app: (typeof t.apps)[number], opts: { origin?: 'home' | 'tor'; patch?: Partial<SignInForm>; policies?: typeof t.policies } = {}): Run {
  const policies = opts.policies ?? t.policies
  const rows = rowsRead(policies, null, app.id, lib)
  const base: SignInForm = { ...emptyDraft(TODAY, '09:30'), ...(opts.origin ? originPatch(opts.origin) : {}), personId: person.id, appId: app.id }
  const form = { ...forRun(withDefaults(base, rows, [], TODAY, '09:30'), rows), ...(opts.patch ?? {}) } as SignInForm
  const { facts } = factsOf(form, t.zones)
  const res = runColumns([AS_IT_STANDS], policies, facts, env)[0].resolution
  const ctx = { people: t.directory.people, apps: t.apps, zones: t.zones, rows }
  const plan = engineRun({ res, policies, form, facts, env, ctx, intro: 'none' })
  const screens = screensOf(res, { policies, methods: t.methods, defaultMethodId: undefined, person })
  const decider = plan.decider ? policies.find((p) => p.id === plan.decider!.id) : undefined
  const via = decider ? audienceViaOf(decider, person, env) : null
  const groups = [person.groupId, ...(person.alsoGroupIds ?? [])].filter(Boolean).map((id) => t.groups.find((g) => g.id === id)?.name ?? id)
  const first = person.name.split(' ')[0]
  const model = briefOf(plan, { person: person.name, first, app: app.name, via, second: '', name: person.name, groups, appId: app.id, facts: [] })
  return { plan, model, inp: { first, asGroup: null, name: person.name, groups, via, appName: app.name, screens } }
}

const ev = (r: Run) => evidenceOf(r.plan, r.model, r.inp)

const C = runOf('Maya Iyer', 'AWS Console')
const PRI = runOf('Priya Sharma', 'AWS Console')
const GD = runOf('Ravi Menon', 'AWS Console')
const DENY = runOf('Devon Rao', 'AWS Console', { origin: 'home' })
const DEP = runOf('Arun Patel', 'GitHub Enterprise', { patch: { device: { kind: 'none' } } as Partial<SignInForm> })
const OFF = runOf('Priya Sharma', 'HRMS')
/* A policy of six rules: AWS for engineering teams with its first rule (Contractors away from the office) copied three times ahead. */
const SIX = runOf('Maya Iyer', 'AWS Console', {
  policies: t.policies.map((p) => (p.name === 'AWS for engineering teams' ? { ...p, rules: [...[1, 2, 3].map((k) => ({ ...p.rules[0], id: `${p.rules[0].id}-copy${k}`, name: `${p.rules[0].name} ${k}` })), ...p.rules] } : p)),
})

describe('the steps, in the engine’s order', () => {
  it('names the deciding policy and the group it covers the person through', () => {
    const e = ev(C)
    expect(e.decider?.line).toBe('AWS for engineering teams covers Maya, through Engineering.')
    expect(e.who.groups.find((g) => g.counts)?.name).toBe('Engineering')
    expect(e.skipped.map((r) => r.line)).toEqual(['Rule 1 is skipped — Maya isn’t in Contractors.'])
    expect(e.deciding?.line).toMatch(/^Rule 2 matches: /)
    expect(e.outcome.line).toBe('So Maya is asked for Password.')
  })
  it('says the policies before the decider by the person’s name as stored, never lower-cased', () => {
    const e = ev(PRI)
    expect(e.beforeLine).toBe('AWS for engineering teams doesn’t cover Priya.')
    for (const p of e.policies) expect(p.line).not.toMatch(/priya/)
    expect(e.decider?.line).toBe('AWS billing for Finance covers Priya, through Finance.')
    expect(e.outcome.line).toBe('So Priya is asked for Password, then Google Authenticator.')
  })
  it('marks a check only as the engine found it: never ✓ beside a failing value', () => {
    for (const r of [C, PRI, GD, DENY, DEP, OFF, SIX]) {
      const e = ev(r)
      const rule = r.plan.rules.find((x) => e.deciding && x.id === e.deciding.ruleId)
      for (const [k, x] of e.checks.entries()) {
        const st = rule?.checks[k]?.status
        if (x.mark === 'pass') expect(st).toBe('pass')
        if (st === 'fail') expect(x.mark).toBe('fail')
      }
    }
  })
  it('quotes the deny message verbatim', () => {
    const msg = DENY.inp.screens.find((s) => s.decision === 'deny')?.steps.find((s) => s.kind === 'deny')
    expect(msg && msg.kind === 'deny').toBe(true)
    if (msg && msg.kind === 'deny') expect(ev(DENY).outcome.line).toBe(`So Devon is denied and sees “${msg.message}”`)
  })
  it('lists each answer a Depends could be, every rule that can’t tell, and the fact to add', () => {
    const e = ev(DEP)
    expect(e.outcome.kind).toBe('depends')
    expect(e.outcome.line).toMatch(/^So it depends on the device: /)
    expect(e.outcome.outcomes.length).toBeGreaterThan(1)
    expect(e.outcome.missing).toContain('device')
    expect(e.rules.filter((x) => x.state === 'unknown').length).toBe(2)
    expect(e.checks.find((x) => x.missing)?.line).toBe('The device isn’t stated.')
    expect(decidingLine(e)).toBe('Rules 1 and 2 can’t tell — the device isn’t stated.')
    expect(decidingLine(ev(C))).toBe(ev(C).deciding?.line)
  })
  it('names the Global Default when no policy of the application covers the person', () => {
    const e = ev(GD)
    expect(e.decider?.isGlobalDefault).toBe(true)
    expect(e.beforeLine).toBe('No AWS Console policy covers Ravi.')
    expect(e.before.length).toBeGreaterThan(0)
  })
  it('says a switched-off policy, and what it would decide', () => {
    const off = ev(OFF).policies.filter((p) => p.state === 'off')
    expect(off.length).toBeGreaterThan(0)
    expect(off[0].line).toMatch(/ is switched off| isn’t turned on yet/)
  })
  it('reads a policy of six rules right: four rules skipped, rule 5 matches', () => {
    const e = ev(SIX)
    expect(e.skipped).toHaveLength(4)
    expect(e.deciding?.number).toBe(5)
  })
  it('orders the policy stack as the engine asks, one decides, the rest after it never reached', () => {
    const e = ev(C)
    expect(e.policies.map((p) => p.order)).toEqual([...e.policies.map((p) => p.order)].sort((a, b) => a - b))
    expect(e.policies.filter((p) => p.state === 'decides')).toHaveLength(1)
    const after = e.policies.slice(e.policies.findIndex((p) => p.state === 'decides') + 1)
    for (const p of after) expect(['also-covers', 'not-reached', 'off', 'watching']).toContain(p.state)
    expect(e.policies.find((p) => p.name === 'AWS billing for Finance')?.state).toBe('also-covers')
  })
  it('never throws, and always says the outcome, for every person on every application', () => {
    let runs = 0
    for (const app of t.apps)
      for (const person of t.directory.people.slice(0, 12)) {
        const r = runFor(person, app)
        if (r.plan.empty) continue
        runs++
        const e = ev(r)
        expect(e.outcome.line.length, `${person.name} on ${app.name}`).toBeGreaterThan(0)
        for (const p of e.policies) expect(p.line).not.toContain(person.name.toLowerCase())
      }
    expect(runs).toBeGreaterThan(10)
  })
})

describe('how it was decided, in the panel', () => {
  it('reads the steps in the engine’s order: the policy, each rule passed over, the rule that matched, the outcome', () => {
    const steps = howStepsOf(ev(C))
    expect(steps.map((x) => x.text)).toEqual([
      'AWS for engineering teams covers Maya, through Engineering.',
      'Rule 1 is skipped — Maya isn’t in Contractors.',
      expect.stringMatching(/^Rule 2 matches: /),
      'So Maya is asked for Password.',
    ])
    expect(steps.map((x) => x.mark)).toEqual(['pass', 'fail', 'pass', 'pass'])
    expect(steps[0].link).toMatchObject({ kind: 'policy', label: 'Open policy' })
    expect(steps[2].link).toMatchObject({ kind: 'rule', label: 'Open rule 2' })
  })
  it('says the policies before the decider in one line, by the name as stored', () => {
    const steps = howStepsOf(ev(PRI))
    expect(steps[0]).toMatchObject({ key: 'before', text: 'AWS for engineering teams doesn’t cover Priya.', mark: 'fail' })
    expect(steps[1].text).toBe('AWS billing for Finance covers Priya, through Finance.')
    expect(answerLineOf(ev(PRI).outcome)).toBe('Allow with 2FA · Password → Google Authenticator')
  })
  it('ends a Deny in red with its message, a Depends in amber with the fact to add', () => {
    expect(howStepsOf(ev(DENY)).at(-1)?.mark).toBe('fail')
    const dep = howStepsOf(ev(DEP))
    expect(dep.at(-1)).toMatchObject({ mark: 'unknown', link: { kind: 'add', field: 'device' } })
    expect(dep.filter((x) => x.icon === 'rule' && /can’t tell/.test(x.text))).toHaveLength(2)
  })
  it('names the Global Default, with no policy to open', () => {
    const steps = howStepsOf(ev(GD))
    expect(steps[0].text).toBe('No AWS Console policy covers Ravi.')
    expect(steps[1]).toMatchObject({ key: 'decider', link: null })
    expect(steps[1].text).toMatch(/^So the .+ decides\.$/)
  })
  it('lists every rule passed over in a six-rule policy', () => {
    expect(howStepsOf(ev(SIX)).filter((x) => x.icon === 'rule' && x.mark === 'fail')).toHaveLength(4)
  })
  it('shows a part of the sentence on the step that proves it', () => {
    const steps = howStepsOf(ev(PRI))
    expect(howStepOf(steps, 'policy')).toBe('decider')
    expect(howStepOf(steps, 'who')).toBe('decider')
    expect(howStepOf(steps, 'check')).toBe(steps.find((x) => x.link?.kind === 'rule')?.key)
    expect(howStepOf(steps, 'outcome')).toBe('outcome')
    expect(howStepOf(steps, null)).toBeNull()
  })
  it('never puts ✓ on a step of a rule that failed', () => {
    for (const r of [C, PRI, GD, DENY, DEP, OFF, SIX]) for (const x of howStepsOf(ev(r))) if (/is skipped/.test(x.text)) expect(x.mark).toBe('fail')
  })
})

describe('the links between the dock, the row and the brief', () => {
  it('maps a dock citation to its part', () => {
    expect(citeOfTarget('person')).toBe('who')
    expect(citeOfTarget('policy:p1')).toBe('policy')
    expect(citeOfTarget('rule:r1')).toBe('rule')
    expect(citeOfTarget('check:r1:device')).toBe('check')
    expect(citeOfTarget('screens')).toBe('outcome')
    expect(citeOfTarget(null)).toBeNull()
  })
  it('lights the person, or the fact the deciding check read, in the sign-in row', () => {
    expect(rowLitOf('who', C.plan, C.model.decisive)).toBe('person')
    expect(rowLitOf('check', C.plan, C.model.decisive)).toBe('device')
    expect(rowLitOf('outcome', C.plan, C.model.decisive)).toBeNull()
  })
  it('says the sentence plainly for the narrator', () => {
    expect(spokenOf(C.model)).toMatch(/^Maya Iyer gets into AWS Console on one factor: .+\.( .+)?$/)
  })
})
