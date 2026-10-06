import { describe, expect, it } from 'vitest'

import { card, cond, rule, when, type Policy } from '../../data'
import { showcaseTenant } from '../../fixtures'
import { tracePolicy, traceRule } from '../simulate'
import { denyReasonOf } from '../sign-in-tests/deny-reason'
import { engineRun, readersOf } from '../sign-in-tests/engine-run'
import { askedFields, emptyDraft } from '../sign-in-tests/sign-in-card'
import { grantTempAccess } from '../sign-in-tests/temp-access'
import { envOf, resolveSignIn } from '../tenant-resolver'
import { rowsRead } from './rows-read'
import { sentenceTokens, tokenValue } from './sign-in-sentence'
import { factsOf, originPatch, type SignInForm } from './sign-in-form'

/* A temporary access grant ends on a date (6 Oct 2026, DENIAL-NEXT.md P0 item
   3). Two holes let an ended grant keep letting somebody in: the date reached
   the engine only beside a time, so clearing the time hid it; and a grant drew
   no When row, so the admin could not move the date to watch the grant end.
   Pinned here end to end — the form's facts, the resolver, the trace, the
   engine run and its refusal reason all have to agree on the same day.

   Leo Fernandes, a contractor, is refused on AWS from home on the showcase
   tenant (temp-access.test.ts); he is let in until 5 Oct 2026. */

const t = showcaseTenant()
const env = envOf(t)
const lib = { zones: t.zones, fingerprints: t.fingerprints }
const TODAY = '2026-09-28'
const END = '2026-10-05'

const leoOn = (date: string, time = '09:30'): SignInForm => ({ ...emptyDraft(date, time), personId: 'u-leo', appId: 'aws', ...originPatch('home') })

const refusedBy = resolveSignIn(t.policies, factsOf(leoOn(TODAY), t.zones).facts, env).decidedBy!.policyId
const granted: Policy[] = t.policies.map((p) =>
  p.id === refusedBy ? grantTempAccess(p, { id: 'u-leo', name: 'Leo Fernandes' }, { until: END, reason: 'On call this week', by: 'Jaspreet Toor' }) : p,
)
const grant = granted.find((p) => p.id === refusedBy)!

function judge(policies: readonly Policy[], f: SignInForm) {
  const { facts } = factsOf(f, t.zones)
  const res = resolveSignIn(policies, facts, env)
  const rows = rowsRead(policies, null, f.appId, lib)
  const run = engineRun({ res, policies, form: f, facts, env, ctx: { people: t.directory.people, apps: t.apps, zones: t.zones, rows } })
  return { facts, res, run, trace: tracePolicy(grant, facts, env) }
}

describe('a grant asks for the date', () => {
  it('brings the When row onto the application, without the time ruler', () => {
    const before = rowsRead(t.policies, null, 'aws', lib)
    const after = rowsRead(granted, null, 'aws', lib)
    expect(before.rows.has('when')).toBe(false)
    expect(after.rows.has('when')).toBe(true)
    expect(after.rows.has('time-track')).toBe(false)
    expect(askedFields(after)).toContain('when')
    expect(sentenceTokens(after)).toContain('when')
  })

  it('names the grant on the When row as what reads it', () => {
    expect(readersOf(t.policies, 'aws', lib).when).toBe('')
    expect(readersOf(granted, 'aws', lib).when).toBe(`Read by ${grant.name} · Rule 1`)
  })

  it('asks it inside the policy too, with the grant on the draft', () => {
    expect(rowsRead(t.policies, grant, 'aws', lib).rows.has('when')).toBe(true)
  })
})

describe('the grant, judged by the sign-in date', () => {
  it('lets the person in on a date up to and including the end date', () => {
    for (const date of [TODAY, END]) {
      const { res, run, trace } = judge(granted, leoOn(date))
      expect([res.decidedBy?.policyId, res.decision]).toEqual([refusedBy, '2fa'])
      expect(trace.steps[0].kind).toBe('hit')
      expect(run.rules[0].state).not.toBe('off')
      expect(run.outcome.decision).toBe('2fa')
    }
  })

  it('does not let them in after the end date: the grant is off, and the refusal is the one it stood in front of', () => {
    const was = judge(t.policies, leoOn('2026-10-06'))
    const { res, run, trace } = judge(granted, leoOn('2026-10-06'))
    expect([res.decidedBy?.policyId, res.decision]).toEqual([refusedBy, 'deny'])
    expect(trace.steps[0].kind).toBe('off')
    expect(run.rules[0]).toMatchObject({ id: grant.rules[0].id, state: 'off' })
    expect(run.outcome.decision).toBe('deny')
    /* The rule that refuses is the same rule, for the same reason, as before the grant. */
    expect(run.rules[run.landing!].id).toBe(was.run.rules[was.run.landing!].id)
    expect(denyReasonOf(run)).toBe(denyReasonOf(was.run))
  })

  it('still judges by the date when no time is set', () => {
    const before = judge(granted, leoOn(END, ''))
    const after = judge(granted, leoOn('2026-10-06', ''))
    expect(before.facts.when).toEqual({ date: END, timeZone: 'Asia/Kolkata', source: 'stated' })
    expect(before.res.decision).toBe('2fa')
    expect(after.res.decision).toBe('deny')
    expect(after.trace.steps[0].kind).toBe('off')
    expect(after.run.rules[0].state).toBe('off')
    /* And the When pill says the date that decided, not "Any time" in grey (sign-in-sentence.ts). */
    const ctx = { people: t.directory.people, apps: t.apps, zones: t.zones }
    expect(tokenValue('when', leoOn('2026-10-06', ''), ctx)).toMatchObject({ text: '6 Oct 2026', unset: false })
  })

  it('never ends a grant on a sign-in that states no date at all', () => {
    const f = leoOn('', '')
    expect(judge(granted, f).facts.when).toBeUndefined()
    expect(judge(granted, f).res.decision).toBe('2fa')
  })
})

describe('a date with no time is still no time of day', () => {
  const facts = factsOf({ ...leoOn(TODAY, '') }, t.zones).facts
  const office = rule({ name: 'Office hours', when: when(card(cond('time', 'between', ['09:00', '18:00']), cond('day', 'is', ['Mon']))), decision: '1fa' })
  const [window, day] = traceRule(office, 0, facts, null, env).conditions

  it('leaves a time window and a weekday undecided, asking for the time', () => {
    expect([window.status, window.missing]).toEqual(['unknown', ['time']])
    expect([day.status, day.missing]).toEqual(['unknown', ['time']])
  })
})
