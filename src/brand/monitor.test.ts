import { describe, expect, it } from 'vitest'

import { enforces, evaluates, policies, type Policy, type PolicyStatus } from './data'

/* -----------------------------------------------------------------------------
   Report-only / monitor mode.

   The feature is one extra value in a union. The risk is entirely in what the
   rest of the console *assumed* that union contained: before this, thirteen
   places asked `status !== 'inactive'` and meant "enforces". Every one of them
   would have counted a monitor policy as protection, silently, and the tenant
   would have been told they were covered by a policy that has never refused
   anything.

   So the tests here are about the predicates rather than the state. They are
   the thing that has to stay true.
   -------------------------------------------------------------------------- */

const withStatus = (status: PolicyStatus): Policy => ({ ...policies[1], status })

describe('enforces / evaluates', () => {
  it('separates deciding from merely running', () => {
    const table: [PolicyStatus, boolean, boolean][] = [
      // status        enforces  evaluates
      ['active', true, true],
      ['always-on', true, true],
      ['monitor', false, true],
      ['inactive', false, false],
    ]
    for (const [status, wantEnforces, wantEvaluates] of table) {
      expect(enforces(withStatus(status)), `${status} enforces`).toBe(wantEnforces)
      expect(evaluates(withStatus(status)), `${status} evaluates`).toBe(wantEvaluates)
    }
  })

  /* The invariant that makes the pair safe to reason about. If anything ever
     enforces without evaluating, a policy is refusing sign-ins that the
     decision log has no record of. */
  it('never lets a policy enforce without evaluating', () => {
    for (const status of ['active', 'always-on', 'monitor', 'inactive'] as PolicyStatus[]) {
      const p = withStatus(status)
      if (enforces(p)) expect(evaluates(p), status).toBe(true)
    }
  })

  /* The specific regression this replaced. `!== 'inactive'` and `enforces`
     agreed for every state that existed before monitor, which is exactly why
     the old checks looked correct and were not. */
  it('disagrees with the check it replaced, and only on monitor', () => {
    for (const status of ['active', 'always-on', 'inactive'] as PolicyStatus[]) {
      expect(enforces(withStatus(status))).toBe(status !== 'inactive')
    }
    expect(enforces(withStatus('monitor'))).toBe(false)
    expect(withStatus('monitor').status !== 'inactive').toBe(true)
  })
})

describe('the seeded estate', () => {
  /* A state that exists only in the type is a state nobody in a demo ever sees,
     and one nobody exercises is one that quietly rots. */
  it('contains a policy in monitor', () => {
    expect(policies.some((p) => p.status === 'monitor')).toBe(true)
  })

  it('does not put the system catch-all into monitor', () => {
    // It is documented as always evaluating and always deciding. A monitor
    // catch-all would mean nothing at all governs a fall-through sign-in.
    const system = policies.find((p) => p.isSystem)!
    expect(enforces(system)).toBe(true)
  })
})
