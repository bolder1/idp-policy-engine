import { describe, expect, it } from 'vitest'

import { showcaseTenantHrmsOn } from '../../fixtures'
import { envOf } from '../tenant-resolver'
import { SAVED_SHOW, boardPagesAllowed, savedOnPolicy, savedTip } from './board-views'
import { savedRows } from './selectors'

/* Policy testing on the board: whether it offers the Break-in test, which
   saved sign-ins it opens on, and what a narrow row keeps in its tooltip — on
   the showcase tenant. Which page a panel showed went with the panel (V4
   §2.5); the test panel's tabs are test-dock.test.ts's. */

/* These scenes read HRMS deciding, so they run on the tenant once it is
   turned on; the seed opens with HRMS Inactive (Phase 4). */
const t = showcaseTenantHrmsOn()
const env = envOf(t)
const policy = (id: string) => t.policies.find((p) => p.id === id)!

describe('what a board offers', () => {
  const global = t.policies.find((p) => p.isSystem)!

  it('offers the Break-in test on a policy it runs on, in Version 3, where the edition has it', () => {
    expect(boardPagesAllowed(true, true, policy('sc-hrms-office'))).toEqual({ views: true, breakIn: true })
    expect(boardPagesAllowed(true, false, policy('sc-hrms-office'))).toEqual({ views: true, breakIn: false })
    expect(boardPagesAllowed(false, true, policy('sc-hrms-office'))).toEqual({ views: false, breakIn: false })
  })

  it('does not offer it on the Global Default or a draft with no application, as the page’s picker does not', () => {
    expect(boardPagesAllowed(true, true, global).breakIn).toBe(false)
    expect(boardPagesAllowed(true, true, { ...policy('sc-hrms-office'), appIds: [] }).breakIn).toBe(false)
    /* The draft's first application brings it. */
    expect(boardPagesAllowed(true, true, { ...policy('sc-hrms-office'), appIds: ['hrms'] }).breakIn).toBe(true)
  })
})

describe('Saved sign-ins on the board', () => {
  const rows = savedRows(t.savedSignIns, t.policies, env)

  it('offers this policy’s applications first, and all of them', () => {
    expect(SAVED_SHOW.map((o) => o.label)).toEqual(['This policy’s apps', 'All'])
  })

  it('opens on the sign-ins to this policy’s applications', () => {
    const hrms = savedOnPolicy(rows, policy('sc-hrms-office'), 'policy').map((r) => r.saved.id)
    expect(hrms.sort()).toEqual(['ssi-aisha-hrms', 'ssi-kavya-office', 'ssi-neha-home', 'ssi-ravi-hrms'])
    /* Both of its applications, Outlook and Dropbox (the seed's V4 additions). */
    expect(savedOnPolicy(rows, policy('sc-device-compliance'), 'policy').map((r) => r.saved.id).sort()).toEqual([
      'ssi-devon-android',
      'ssi-ivy-android',
      'ssi-priya-mac',
      'ssi-sanjay-iphone',
    ])
  })

  it('keeps the order the rows came in, and shows every one on All', () => {
    const shown = savedOnPolicy(rows, policy('sc-hrms-office'), 'policy')
    expect(shown.map((r) => r.saved.id)).toEqual(rows.filter((r) => r.saved.facts.appId === 'hrms').map((r) => r.saved.id))
    expect(savedOnPolicy(rows, policy('sc-hrms-office'), 'all')).toHaveLength(t.savedSignIns.length)
  })

  it('shows every one for the Global Default, which is on every application', () => {
    const global = t.policies.find((p) => p.isSystem)!
    expect(savedOnPolicy(rows, global, 'policy')).toHaveLength(t.savedSignIns.length)
  })

  it('says the level, what came back and who decided it in the name’s tooltip', () => {
    const kavya = rows.find((r) => r.saved.id === 'ssi-kavya-office')!
    expect(savedTip(kavya, '203.0.113.24 · Pune (looked up)')).toBe(
      '203.0.113.24 · Pune (looked up) · Level: Must pass · Actual: Allow with 2FA · Decided by: HRMS access from corporate offices',
    )
  })

  it('adds what decides today when a version on the board answers differently', () => {
    const off = t.policies.map((p) => (p.id === 'sc-hrms-office' ? { ...p, status: 'inactive' as const } : p))
    const [kavya] = savedRows([t.savedSignIns.find((s) => s.id === 'ssi-kavya-office')!], off, env, policy('sc-hrms-office'))
    expect(savedTip(kavya, 'x')).toBe('x · Level: Must pass · Actual: Allow with 2FA · Today: Allow on 1 factor · Decided by: HRMS access from corporate offices')
  })

  it('says Can’t tell in the tooltip, never a pass, where the answer is not known', () => {
    const blind = { ...t.savedSignIns[0], id: 'x', facts: { ...t.savedSignIns[0].facts, network: undefined } }
    const [row] = savedRows([blind], t.policies, env)
    expect(savedTip(row, 's')).toMatch(/^s · Level: Must pass · Actual: Can't tell · /)
  })
})
