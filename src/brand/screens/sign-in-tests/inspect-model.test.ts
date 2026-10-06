import { describe, expect, it } from 'vitest'

import { FALLBACK_NAME } from '../../data'
import { showcaseTenant } from '../../fixtures'
import { envOf, resolveSignIn } from '../tenant-resolver'
import { rowsRead } from '../testing/rows-read'
import { factsOf, originPatch } from '../testing/sign-in-form'
import { engineRun } from './engine-run'
import { FATE_WORDS, evidenceOf, fateOf, ruleList, ruleOf, sameTarget, targetLabel } from './inspect-model'
import { emptyDraft } from './sign-in-card'

/* Leo, a contractor, on AWS from home broadband: AWS for engineering teams refuses him at rule 1. */
const t = showcaseTenant()
const env = envOf(t)
const form = { ...emptyDraft('2026-09-28', '09:30'), personId: 'u-leo', appId: 'aws', ...originPatch('home') }
const { facts } = factsOf(form, t.zones)
const res = resolveSignIn(t.policies, facts, env)
const rows = rowsRead(t.policies, null, form.appId, { zones: t.zones, fingerprints: t.fingerprints })
const plan = engineRun({ res, policies: t.policies, form, facts, env, ctx: { people: t.directory.people, apps: t.apps, zones: t.zones, rows }, intro: 'none' })
const policy = t.policies.find((p) => p.id === plan.decider!.id)!

describe('the inspector model, on a refusal by rule 1', () => {
  it('says how each rule of the policy that decided fared, and the last row', () => {
    const list = ruleList(policy, plan)
    expect(list).toHaveLength(policy.rules.length + 1)
    expect(list[0]).toMatchObject({ n: 1, decision: 'deny', fate: 'decided' })
    expect(list.at(-1)).toMatchObject({ id: null, n: null, name: FALLBACK_NAME })
    /* Rules after the one that decided were never reached. */
    expect(list.slice(1, -1).every((r) => r.fate === 'not-reached' || r.fate === 'not-matched')).toBe(true)
    expect(Object.values(FATE_WORDS).every((w) => w.length > 3)).toBe(true)
  })

  it('knows nothing of a policy that did not decide: its rules were never read', () => {
    const other = t.policies.find((p) => p.id !== plan.decider!.id && !p.isSystem)!
    expect(fateOf(plan, other.id, other.rules[0]?.id ?? null)).toBeNull()
    expect(ruleList(other, plan).every((r) => r.fate === null)).toBe(true)
    expect(evidenceOf(plan, other.id, other.rules[0]?.id ?? null)).toEqual([])
  })

  it('gives each row the engine read, in the sign-in’s words, with its status', () => {
    const ev = evidenceOf(plan, policy.id, policy.rules[0].id)
    expect(ev.length).toBeGreaterThan(0)
    expect(ev.every((e) => e.word && e.line && ['pass', 'fail', 'unknown'].includes(e.status))).toBe(true)
    /* A rule that matched passed every row it read. */
    expect(ev.every((e) => e.status === 'pass')).toBe(true)
  })

  it('finds a rule by id, the last row as the policy’s own, and nothing for a rule edited away', () => {
    expect(ruleOf(policy, policy.rules[0].id)).toMatchObject({ n: 1, terminal: false })
    expect(ruleOf(policy, null)).toMatchObject({ n: null, terminal: true })
    expect(ruleOf(policy, 'gone')).toBeNull()
  })

  it('labels a target and compares two', () => {
    expect(targetLabel({ kind: 'policy', policyId: policy.id }, t.policies)).toBe(policy.name)
    expect(targetLabel({ kind: 'rule', policyId: policy.id, ruleId: policy.rules[0].id }, t.policies)).toBe(`Rule 1 · ${policy.rules[0].name}`)
    expect(targetLabel({ kind: 'rule', policyId: policy.id, ruleId: null }, t.policies)).toBe(FALLBACK_NAME)
    expect(targetLabel({ kind: 'policy', policyId: 'nope' }, t.policies)).toBe('Policy')
    expect(sameTarget({ kind: 'policy', policyId: 'a' }, { kind: 'policy', policyId: 'a' })).toBe(true)
    expect(sameTarget({ kind: 'rule', policyId: 'a', ruleId: 'r1' }, { kind: 'rule', policyId: 'a', ruleId: 'r2' })).toBe(false)
    expect(sameTarget({ kind: 'policy', policyId: 'a' }, { kind: 'rule', policyId: 'a', ruleId: null })).toBe(false)
  })
})
