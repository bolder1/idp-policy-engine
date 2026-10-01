import { describe, expect, it } from 'vitest'

import { showcaseTenant } from '../../fixtures'
import { envOf } from '../tenant-resolver'
import { defaultBoardForm, factsOf, type SignInForm } from '../testing/sign-in-form'
import { audienceOf, notDecidingReason, panelTabForRoute, whyLine } from './test-mode'
import { columnView, columnsFor, routeOf, runColumns } from './try-sign-in'

/* Test mode's words and choices on the board (Policy testing V4, §2): which
   tab the test panel opens on for a route, what the start node's audience
   pill says, and the one line under the panel's verdict — on the showcase
   tenant, through the same model the board draws. */

const t = showcaseTenant()
const env = envOf(t)
const TODAY = '2026-09-28'
const byId = (id: string) => t.policies.find((p) => p.id === id)!

function run(policyId: string, patch: Partial<SignInForm> = {}) {
  const p = byId(policyId)
  const form = { ...defaultBoardForm(p, t.directory.people, t.apps, TODAY), ...patch }
  const { facts } = factsOf(form, t.zones)
  const cols = runColumns(columnsFor(p, p, form.appId), t.policies, facts, env)
  const right = cols.at(-1)!
  const route = routeOf(right, p, facts, env, t.policies)
  const columns = cols.map((c) => columnView(c, p.id, t.policies, (id) => t.apps.find((a) => a.id === id)?.name ?? id))
  const reason = route.policy.decides ? undefined : notDecidingReason(right.resolution, p.id, route.who)
  return { route, right, columns, reason, why: whyLine({ right: columns.at(-1), decision: route.decision, decides: route.policy.decides, reason }) }
}

describe('the tab the test panel opens on for a route', () => {
  it('is the viewer’s last tab for Try a sign-in, or with no route at all', () => {
    expect(panelTabForRoute('try', 'past')).toBe('past')
    expect(panelTabForRoute(undefined, 'people')).toBe('people')
  })

  it('is People for a person, Saved sign-ins for saved, the Break-in test for break-in', () => {
    expect(panelTabForRoute('person', 'past')).toBe('people')
    expect(panelTabForRoute('saved', 'past')).toBe('saved')
    expect(panelTabForRoute('break-in', 'saved')).toBe('break-in')
  })
})

describe('the start node’s audience pill', () => {
  it('reads in, out or everyone off the Who gate, and nothing without a person', () => {
    expect(audienceOf({ value: 'Kavya', word: 'In audience', state: 'pass' })).toBe('in')
    expect(audienceOf({ value: 'Kavya', word: 'Everyone', state: 'pass' })).toBe('everyone')
    expect(audienceOf({ value: 'Devon', word: 'Not in audience', state: 'fail' })).toBe('out')
    expect(audienceOf({ value: 'Choose a person', word: 'Can’t tell', state: 'unknown' })).toBeNull()
  })

  it('says HRMS is for Kavya on the board it opens on', () => {
    expect(audienceOf(run('sc-hrms-office').route.who)).toBe('in')
  })
})

describe('the line under the verdict', () => {
  it('names the rule when this policy decides, never the answer the verdict already shows', () => {
    /* HRMS opens Inactive on the showcase: the right-hand column is its Stored version. */
    const r = run('sc-hrms-office')
    expect(r.route.policy.decides).toBe(true)
    expect(r.why).toBe('Rule 1 · In a corporate office')
    expect(r.why).not.toMatch(/Allow|Deny/)
  })

  it('names who decides instead, and why, for somebody outside this policy', () => {
    const outside = t.directory.people.find((p) => !byId('sc-hrms-office').audience.groupIds.includes(p.groupId) && !byId('sc-hrms-office').audience.userIds.includes(p.id))!
    const r = run('sc-hrms-office', { personId: outside.id })
    expect(r.route.policy.decides).toBe(false)
    expect(r.reason).toBe('Not in this policy')
    expect(r.why).toMatch(/^Decided by .+ · Not in this policy$/)
  })

  it('says what is missing when nobody is chosen', () => {
    const r = run('sc-hrms-office', { personId: null })
    expect(r.right.resolution.status).toBe('incomplete')
    expect(r.why).toBe('Choose a person')
  })

  it('says what would settle it when it depends', () => {
    const android: Partial<SignInForm> = { device: { kind: 'custom', facts: { source: 'stated', platform: 'android', osVersion: '14', formFactor: 'Mobile', screenLock: 'pin', authenticatorVersion: '6.5.0' } } }
    const r = run('sc-device-compliance', android)
    expect(r.route.decision.status).toBe('depends')
    expect(r.why).toBe('Needs: Device')
  })

  it('is one line, always', () => {
    for (const id of ['sc-hrms-office', 'sc-dev-tools', 'sc-device-compliance', 'global-default']) {
      if (!t.policies.some((p) => p.id === id)) continue
      expect(run(id).why).not.toContain('\n')
    }
  })
})
