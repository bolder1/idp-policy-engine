import { describe, expect, it } from 'vitest'

import { POLICY_STATUSES, enforces, evaluates, policies, type Policy } from './data'

/* -----------------------------------------------------------------------------
   Monitoring checks sign-ins and enforces nothing.

   The two predicates exist to disagree on exactly one status, and only on it.
   `enforces` is what Coverage, the list's Active filter, the footer count and
   the resolver's candidates ask: does this decide a sign-in. `evaluates` asks
   whether it runs at all. A monitoring policy runs and decides nothing, so a
   reader that asked the wrong one of the two would count it as protection —
   the trap a report-only flag on an Active policy would have set, and the
   reason Monitoring is a status of its own.
   -------------------------------------------------------------------------- */

const withStatus = (status: Policy['status']): Policy => ({ ...policies[1], status })

describe('the monitoring status', () => {
  it('enforces nothing', () => {
    expect(enforces(withStatus('monitor'))).toBe(false)
  })

  it('still runs against every sign-in', () => {
    expect(evaluates(withStatus('monitor'))).toBe(true)
  })

  it('is the only status where running and enforcing disagree', () => {
    for (const status of POLICY_STATUSES) {
      if (status === 'monitor') continue
      expect(evaluates(withStatus(status)), status).toBe(enforces(withStatus(status)))
    }
  })

  it('is listed between Active and Inactive, by how much it enforces', () => {
    expect(POLICY_STATUSES).toEqual(['draft', 'active', 'monitor', 'inactive', 'always-on'])
  })
})
