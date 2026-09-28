import { describe, expect, it } from 'vitest'

import { showcaseTenantHrmsOn } from '../../fixtures'
import { envOf } from '../tenant-resolver'
import {
  SAVED_SHOW,
  boardPagesAllowed,
  boardViewsKept,
  firstBoardPage,
  pageShown,
  saveSignInPressed,
  savedOnPolicy,
  savedTip,
  tabOf,
  type BoardTestPage,
} from './board-views'
import { savedRows } from './selectors'

/* Version 3: Policy testing inside the board's test panel. Which page shows,
   which saved sign-ins the board opens on, and what the narrow table keeps in
   a tooltip — on the showcase tenant. */

/* These scenes read HRMS deciding, so they run on the tenant once it is
   turned on; the seed opens with HRMS Inactive (Phase 4). */
const t = showcaseTenantHrmsOn()
const env = envOf(t)
const policy = (id: string) => t.policies.find((p) => p.id === id)!
const ALL = { views: true, breakIn: true }

describe('the panel’s pages', () => {
  it('puts the Break-in test under Saved sign-ins, and every other page under its own tab', () => {
    expect((['try', 'person', 'saved', 'break-in'] as BoardTestPage[]).map(tabOf)).toEqual(['try', 'person', 'saved', 'saved'])
  })

  it('opens on Try a sign-in, or on the Break-in test when the route names it', () => {
    expect(firstBoardPage(undefined, ALL)).toBe('try')
    expect(firstBoardPage('break-in', ALL)).toBe('break-in')
  })

  it('is Try a sign-in alone where the panel has no views, whatever was asked', () => {
    const none = { views: false, breakIn: true }
    for (const p of ['try', 'person', 'saved', 'break-in'] as BoardTestPage[]) expect(pageShown(p, none)).toBe('try')
    expect(firstBoardPage('break-in', none)).toBe('try')
  })

  it('stops at Saved sign-ins where the edition has no Break-in test', () => {
    const noBreakIn = { views: true, breakIn: false }
    expect(pageShown('break-in', noBreakIn)).toBe('saved')
    expect(firstBoardPage('break-in', noBreakIn)).toBe('saved')
    expect(pageShown('person', noBreakIn)).toBe('person')
  })
})

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

  it('so a route naming the Break-in test lands on Saved sign-ins there', () => {
    const can = boardPagesAllowed(true, true, global)
    expect(firstBoardPage('break-in', can)).toBe('saved')
  })
})

describe('Save sign-in in the panel', () => {
  it('opens and shuts its form on Try', () => {
    expect(saveSignInPressed('try', false)).toEqual({ page: 'try', saving: true })
    expect(saveSignInPressed('try', true)).toEqual({ page: 'try', saving: false })
  })

  it('goes to Try with the form open from every other page', () => {
    for (const p of ['person', 'saved', 'break-in'] as BoardTestPage[]) {
      expect(saveSignInPressed(p, false)).toEqual({ page: 'try', saving: true })
      expect(saveSignInPressed(p, true)).toEqual({ page: 'try', saving: true })
    }
  })
})

describe('what the pages keep across a rule and back', () => {
  it('starts empty, and new each time', () => {
    const a = boardViewsKept()
    expect(a).toEqual({ saved: { current: null }, breakIn: { current: null } })
    expect(boardViewsKept().saved).not.toBe(a.saved)
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
    expect(savedOnPolicy(rows, policy('sc-device-compliance'), 'policy').map((r) => r.saved.id)).toEqual(['ssi-devon-android'])
  })

  it('keeps the order the rows came in, and shows every one on All', () => {
    const shown = savedOnPolicy(rows, policy('sc-hrms-office'), 'policy')
    expect(shown.map((r) => r.saved.id)).toEqual(rows.filter((r) => r.saved.facts.appId === 'hrms').map((r) => r.saved.id))
    expect(savedOnPolicy(rows, policy('sc-hrms-office'), 'all')).toHaveLength(6)
  })

  it('shows every one for the Global Default, which is on every application', () => {
    const global = t.policies.find((p) => p.isSystem)!
    expect(savedOnPolicy(rows, global, 'policy')).toHaveLength(6)
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
