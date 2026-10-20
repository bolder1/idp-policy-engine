import { describe, expect, it } from 'vitest'

import { fallbackRule, rule } from './data'
import {
  APP_EVENTS,
  POST_ACTIONS,
  SESSION_EVENTS,
  actionsFor,
  actionsUsed,
  blankPostSignInPolicy,
  conditionsFor,
  denyCannotStop,
  eventsFor,
  isPostSignIn,
  linkApp,
  linkedTo,
  postSignInRefuses,
  settledPostSignIn,
  takenEvents,
  turnOnIssue,
  unlinkApp,
} from './post-sign-in'

describe('the catalogue', () => {
  it('offers the five actions the owner named, in his order', () => {
    expect(POST_ACTIONS.map((a) => a.label)).toEqual(['Allow', 'Deny', 'Step up', 'Terminate session', 'Block device'])
  })

  it('gives every application the session events, after its own', () => {
    const sf = eventsFor('salesforce')
    expect(sf.slice(0, APP_EVENTS.salesforce.length).map((e) => e.id)).toEqual(APP_EVENTS.salesforce.map((e) => e.id))
    expect(sf.slice(-SESSION_EVENTS.length)).toEqual(SESSION_EVENTS)
    expect(eventsFor('hrms')).toEqual(SESSION_EVENTS)
  })

  it('finds an application through its numbered copy and the registry aliases', () => {
    expect(eventsFor('salesforce-2')).toEqual(eventsFor('salesforce'))
    expect(eventsFor('outlook')[0].id).toBe(APP_EVENTS.m365[0].id)
    expect(eventsFor('google-workspace')[0].id).toBe(APP_EVENTS.google[0].id)
  })

  it('never offers Deny on an event reported after it happened', () => {
    expect(actionsFor({ arrival: 'after' })).not.toContain('deny')
    expect(actionsFor({ arrival: 'before' })).toContain('deny')
    expect(actionsFor({ arrival: 'session' })).toHaveLength(5)
  })

  it('offers an event-detail condition only on events that carry the detail', () => {
    const report = APP_EVENTS.salesforce.find((e) => e.id === 'sf-report-export')!
    expect(conditionsFor(report).map((c) => c.id)).toContain('records')
    expect(conditionsFor(SESSION_EVENTS[0]).map((c) => c.id)).not.toContain('records')
  })

  it('has unique event ids within each application', () => {
    for (const key of Object.keys(APP_EVENTS)) {
      const ids = eventsFor(key).map((e) => e.id)
      expect(new Set(ids).size, key).toBe(ids.length)
    }
  })
})

describe('a post sign-in policy, independent of applications, in the board’s rules', () => {
  const base = blankPostSignInPolicy('Untitled post sign-in policy')
  const deny = rule({ name: 'Large export', action: 'deny' })
  const withLast = (p: typeof base, action?: (typeof POST_ACTIONS)[number]['value']) => ({ ...p, fallback: { ...fallbackRule('1fa'), ...(action ? { action } : {}) } })

  it('starts as a draft, typed Session, linked to nothing, its last row waiting on an action', () => {
    expect(isPostSignIn(base)).toBe(true)
    expect(base.status).toBe('draft')
    expect(base.appIds).toEqual([])
    expect(turnOnIssue(base)).toBe('Choose an action for Nothing else matched.')
  })

  it('is complete when every enabled rule and the last row have an action, linked or not', () => {
    expect(turnOnIssue(withLast({ ...base, rules: [deny] }, 'allow'))).toBeNull()
    expect(turnOnIssue(withLast({ ...base, rules: [deny, rule({ name: 'Two' })] }, 'allow'))).toBe('Choose an action for rule 2.')
    expect(turnOnIssue(withLast({ ...base, rules: [deny, { ...rule({ name: 'Off' }), enabled: false }] }, 'allow'))).toBeNull()
  })

  it('refuses to go on, and is stored as a draft, while incomplete', () => {
    expect(postSignInRefuses(base, 'active')).toBe(true)
    expect(postSignInRefuses(base, 'draft')).toBe(false)
    expect(settledPostSignIn({ ...base, status: 'active' }).status).toBe('draft')
    expect(settledPostSignIn({ ...withLast(base, 'allow'), status: 'active' }).status).toBe('active')
  })

  it('names the actions its enabled rules and last row use', () => {
    expect(actionsUsed(withLast({ ...base, rules: [deny, { ...rule({ name: 'Off', action: 'terminate' }), enabled: false }] }, 'allow'))).toEqual(['deny', 'allow'])
  })

  it('links applications from outside, each with its events in catalogue order, and mirrors appIds', () => {
    const sfIds = APP_EVENTS.salesforce.map((e) => e.id)
    const one = linkApp(base, 'salesforce', [sfIds[2], sfIds[0]])
    expect(one.session?.links).toEqual([{ appId: 'salesforce', eventIds: [sfIds[0], sfIds[2]] }])
    const two = linkApp(one, 'slack', ['sl-download'])
    expect(two.appIds).toEqual(['salesforce', 'slack'])
    expect(linkApp(two, 'salesforce', [sfIds[1]]).session?.links[0]).toEqual({ appId: 'salesforce', eventIds: [sfIds[1]] })
    expect(unlinkApp(two, 'salesforce').appIds).toEqual(['slack'])
  })

  it('lets one policy hold an event of an application, and says which holds it', () => {
    const a = { ...linkApp(base, 'salesforce', ['sf-report-export']), id: 'a' }
    const b = { ...linkApp(blankPostSignInPolicy('B'), 'salesforce', ['sf-api-query']), id: 'b' }
    expect(linkedTo('salesforce', [a, b]).map((l) => l.policy.id)).toEqual(['a', 'b'])
    const taken = takenEvents('salesforce', [a, b], 'b')
    expect(taken.get('sf-report-export')?.id).toBe('a')
    expect(taken.has('sf-api-query')).toBe(false)
  })

  it('names the linked events its Deny cannot stop, the ones reported after', () => {
    const denying = withLast({ ...base, rules: [deny] }, 'allow')
    expect(denyCannotStop(denying, 'slack', ['sl-download', 'ip-change']).map((e) => e.id)).toEqual(['sl-download'])
    expect(denyCannotStop(withLast(base, 'allow'), 'slack', ['sl-download'])).toEqual([])
  })
})
