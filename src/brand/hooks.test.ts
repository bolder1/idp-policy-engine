import { describe, expect, it } from 'vitest'

import { CONDITION_CATALOGUE, EVERYONE, blankRule, card, cond, groups, policies, when, type Policy, type Rule } from './data'
import { SLOW_TIMEOUT_MS, canSaveHook, describeHook, seedHooks, validateHook, type Hook } from './hooks'
import { leaves } from './predicate'
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
  when: when(card(cond('webhook', 'returns true', ['hk-t']))),
  ...over,
})

/* Audience is stated rather than inherited from the seed. Every check under
   test here is about the hook, so the policy has to govern somebody for the
   rule findings to be the only ones in the list — and pinning it means a later
   edit to the seed's audience cannot quietly change what these tests exercise. */
const policyWith = (r: Rule): Policy => ({
  ...policies[1],
  isSystem: false,
  audience: EVERYONE,
  rules: [r],
})

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
    const plain = { ...blankRule('No hook'), when: when(card(cond('day', 'is', ['Monday']))) }
    const found = diagnose(policyWith(plain), groups, [hook()])
    expect(found.filter((d) => d.id.startsWith('hook'))).toHaveLength(0)
  })
})

/* --- What used to be here, and why it is not ---------------------------------

   Two tests stood here. One asserted the seeded estate contains at least one
   hook-gated rule; the other asserted that the seeded pairing actually trips
   the fail-open-on-deny warning — both on the argument that a capability which
   ships unexercised is a capability nobody ever sees fire.

   The argument still holds. What changed is that the capability does not ship:
   `webhook` is gone from the condition catalogue, so no rule in this product
   can name a hook, and no seed can be written that would satisfy either test.
   Weakening them to `toHaveLength(0)` would have turned two tests that said
   "this works" into two that say "nothing happens", which is the same as
   deleting them but harder to notice.

   So they are replaced by the fact that replaced them. The four `hook*`
   diagnostics above still have their tests — they run against hand-built rules,
   they are correct, and they are what a `webhook` condition would need on the
   day one is reintroduced. They are simply unreachable from the seed now, and
   that is the thing worth pinning. */
describe('the seeded catalogue', () => {
  it('cannot gate a rule on a hook, because no condition can name one', () => {
    const gated = policies.flatMap((p) =>
      p.rules.filter((r) => leaves(r.when).some((c) => c.typeId === 'webhook')),
    )
    expect(gated).toEqual([])
    expect(CONDITION_CATALOGUE.some((c) => c.id === 'webhook')).toBe(false)
  })

  /* The library outlives the condition. The Hooks screen still runs and hooks
     are still validated and still linted for a missing `onFailure` — they are
     just objects no rule can reference. That is a real regression and this is
     the test that says so out loud rather than letting the silence read as an
     oversight. */
  it('still ships hooks, which nothing can now consult', () => {
    expect(seedHooks.length).toBeGreaterThan(0)
    const found = policies.flatMap((p) => diagnose(p, groups, seedHooks))
    expect(found.filter((d) => d.id.startsWith('hook'))).toEqual([])
  })
})
