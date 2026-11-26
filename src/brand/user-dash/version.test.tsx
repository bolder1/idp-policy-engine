import { afterEach, describe, expect, it, vi } from 'vitest'

import { ROLLOUT } from '../rollout'
import { navFor, readVersion } from './version'

/* -----------------------------------------------------------------------------
   The User Dashboard's Today / Proposed switch (spec 2026-11-26-user-dashboard-design.md, goal 6). Today is the live
   site's two places, untouched; Proposed is Apps and My account. Design only.
   -------------------------------------------------------------------------- */

afterEach(() => vi.unstubAllGlobals())

describe('the User Dashboard switch', () => {
  it('today keeps the live nav', () => {
    expect(navFor('today').map((n) => n.label)).toEqual(['Dashboard', 'Setup 2FA'])
  })

  it('proposed shows Apps and My account', () => {
    const nav = navFor('proposed')
    expect(nav.map((n) => n.label)).toEqual(['Apps', 'My account'])
    expect(nav[1].screen).toEqual({ name: 'account', page: 'overview' })
  })

  it('rollout is design only', () => {
    expect(ROLLOUT.userDashboard).toEqual(['design'])
  })

  it('reads the pick safely', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked') } })
    expect(readVersion()).toBe('today')
  })

  it('reads a stored proposed pick', () => {
    vi.stubGlobal('localStorage', { getItem: (k: string) => (k === 'idp.userDash' ? 'proposed' : null) })
    expect(readVersion()).toBe('proposed')
  })
})
