import { describe, expect, it } from 'vitest'

import { blankRule, cond, groups, policies, type Policy, type Rule } from './data'
import { SLOW_TIMEOUT_MS, canSaveHook, describeHook, seedHooks, validateHook, type Hook } from './hooks'
import { diagnose } from './screens/diagnostics'

const hook = (over: Partial<Hook> = {}): Hook => ({
  id: 'hk-t',
  name: 'Test hook',
  mode: 'sync',
  url: 'https://example.internal/check',
  method: 'POST',
  timeoutMs: 200,
  responsePath: 'ok',
  onFailure: 'fail-closed',
  ...over,
})

const gatedRule = (over: Partial<Rule> = {}): Rule => ({
  ...blankRule('Hook gated'),
  conditions: [cond('webhook', 'returns true', ['hk-t'])],
  ...over,
})

const policyWith = (r: Rule): Policy => ({ ...policies[1], isSystem: false, rules: [r] })

/* -----------------------------------------------------------------------------
   Problem 7 — external hooks.

   The tests worth writing here are not "does the form save". They are the two
   claims the feature exists to make: that a hook cannot be created without
   answering what happens when it fails, and that a failure mode contradicting
   the rule it gates is reported rather than left to be discovered during an
   outage.
   -------------------------------------------------------------------------- */

describe('validating a hook', () => {
  it('accepts the seeded catalogue', () => {
    for (const h of seedHooks) {
      expect(validateHook(h).filter((i) => i.level === 'error'), h.name).toHaveLength(0)
      expect(canSaveHook(h), h.name).toBe(true)
    }
  })

  it('refuses a hook with nothing to call', () => {
    expect(canSaveHook(hook({ url: '' }))).toBe(false)
  })

  it('refuses a hook with no name, because rules reference it by name', () => {
    expect(canSaveHook(hook({ name: '   ' }))).toBe(false)
  })

  /* The request carries the identity being evaluated and the answer decides
     access. Plain HTTP makes both readable and writable in transit, which is a
     different order of problem from a missing field. */
  it('refuses plain HTTP and merely warns about anything else unrecognised', () => {
    expect(canSaveHook(hook({ url: 'http://example.internal/check' }))).toBe(false)
    const odd = validateHook(hook({ url: 'example.internal/check' }))
    expect(odd.some((i) => i.level === 'warning' && i.title.includes('HTTPS'))).toBe(true)
    expect(canSaveHook(hook({ url: 'example.internal/check' }))).toBe(true)
  })

  it('refuses a synchronous hook with no response field or no timeout', () => {
    expect(canSaveHook(hook({ responsePath: '' }))).toBe(false)
    expect(canSaveHook(hook({ timeoutMs: 0 }))).toBe(false)
  })

  it('warns rather than refuses when the timeout is slow', () => {
    const slow = validateHook(hook({ timeoutMs: SLOW_TIMEOUT_MS + 1 }))
    expect(slow.some((i) => i.level === 'warning')).toBe(true)
    // A tenant that has measured its own endpoint is entitled to overrule a
    // default. Refusing here would only teach them to type one millisecond less.
    expect(canSaveHook(hook({ timeoutMs: SLOW_TIMEOUT_MS + 1 }))).toBe(true)
  })

  it('does not ask an attribute sync for a response path or a timeout', () => {
    const sync = hook({ mode: 'attribute-sync', responsePath: '', timeoutMs: 0, maxAgeHours: 24 })
    expect(canSaveHook(sync)).toBe(true)
  })

  it('warns when synced data has no freshness limit', () => {
    const stale = validateHook(hook({ mode: 'attribute-sync', responsePath: '', timeoutMs: 0 }))
    expect(stale.some((i) => i.title.includes('freshness'))).toBe(true)
  })

  it('describes itself without leaking the full URL into a list row', () => {
    expect(describeHook(hook())).toContain('example.internal')
    expect(describeHook(hook({ mode: 'attribute-sync', maxAgeHours: 12 }))).toContain('12h')
  })
})

describe('a rule gated on a hook', () => {
  it('reports a deny rule that stops denying when the hook is down', () => {
    const found = diagnose(policyWith(gatedRule({ decision: 'deny' })), groups, [hook({ onFailure: 'fail-open' })])
    expect(found.some((d) => d.id.startsWith('hookopen'))).toBe(true)
  })

  it('reports a non-deny rule whose users are locked out by an outage', () => {
    const found = diagnose(policyWith(gatedRule({ decision: '2fa' })), groups, [hook({ onFailure: 'fail-closed' })])
    expect(found.some((d) => d.id.startsWith('hookclosed'))).toBe(true)
  })

  /* The two warnings above are opposites, so exactly one should ever fire for a
     given pairing. Both firing would mean the check has become an opinion that
     every hook is wrong, which is the state at which people stop reading it. */
  it('never reports both directions at once', () => {
    for (const decision of ['deny', '2fa', '1fa'] as const) {
      for (const onFailure of ['fail-open', 'fail-closed'] as const) {
        const found = diagnose(policyWith(gatedRule({ decision })), groups, [hook({ onFailure })])
        const open = found.some((d) => d.id.startsWith('hookopen'))
        const closed = found.some((d) => d.id.startsWith('hookclosed'))
        expect(open && closed, `${decision} + ${onFailure}`).toBe(false)
      }
    }
  })

  it('reports a rule pointing at a hook that has been deleted', () => {
    const found = diagnose(policyWith(gatedRule()), groups, [])
    const gone = found.find((d) => d.id.startsWith('hookgone'))
    expect(gone?.severity).toBe('error')
  })

  it('charges the timeout to the rule, not just to the hook', () => {
    const found = diagnose(policyWith(gatedRule()), groups, [hook({ timeoutMs: 900 })])
    expect(found.some((d) => d.id.startsWith('hookslow'))).toBe(true)
  })

  it('says nothing about a rule that names no hook', () => {
    const plain = { ...blankRule('No hook'), conditions: [cond('country', 'is not', ['India'])] }
    const found = diagnose(policyWith(plain), groups, [hook()])
    expect(found.filter((d) => d.id.startsWith('hook'))).toHaveLength(0)
  })
})

describe('the seeded catalogue', () => {
  /* A capability that ships unexercised is a capability nobody in the demo ever
     sees fire. The seeded estate has to contain at least one hook-gated rule,
     and the hook it names has to exist. */
  it('contains a rule that actually calls a hook', () => {
    const gated = policies.flatMap((p) =>
      p.rules
        .filter((r) => r.conditions.some((c) => c.typeId === 'webhook'))
        .map((r) => ({ p, r })),
    )
    expect(gated.length).toBeGreaterThan(0)

    for (const { r } of gated) {
      for (const c of r.conditions.filter((x) => x.typeId === 'webhook')) {
        expect(seedHooks.some((h) => h.id === c.values[0]), `${r.name} names ${c.values[0]}`).toBe(true)
      }
    }
  })

  /* And the seeded pairing has to actually trip a check. A warning that only
     ever fires against a hand-built test fixture is a warning nobody in the
     room ever sees, which makes it indistinguishable from one that does not
     work. */
  it('trips the fail-open-on-deny check somewhere in the seeded estate', () => {
    const found = policies.flatMap((p) => diagnose(p, groups, seedHooks))
    expect(found.some((d) => d.id.startsWith('hookopen'))).toBe(true)
  })
})
