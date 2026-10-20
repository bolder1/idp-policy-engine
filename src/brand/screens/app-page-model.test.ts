import { describe, expect, it } from 'vitest'

import { basicIssues, defaultOidc, defaultSaml, setupOf } from '../app-setup'
import { blankPolicy, fallbackRule, rule, type Policy } from '../data'
import { showcaseTenant } from '../fixtures'
import { APP_EVENTS, SESSION_EVENTS, blankPostSignInPolicy, linkApp } from '../post-sign-in'
import {
  CLIENT_NOTE,
  TAB_LABEL,
  appTabs,
  denyNotice,
  draftChanges,
  draftOf,
  eventGroups,
  eventNames,
  firstIssue,
  isSetupTab,
  landingTab,
  linkChoices,
  linkIssue,
  newDraftChanged,
  shownIssues,
  unlinkCopy,
  type AppDraft,
  type NewDraft,
} from './app-page-model'

/* The application page's decisions, apart from drawing them: which tabs an
   application has, where a route lands, what the save footer reviews, and
   which of Basic's problems are said. */

const labels = (tabs: readonly string[]) => tabs.map((t) => TAB_LABEL[t as keyof typeof TAB_LABEL])

describe('the tabs', () => {
  it('are the live order, Metadata for SAML and Endpoints for OAuth, with no counts', () => {
    expect(labels(appTabs('SAML', 'saved'))).toEqual([
      'Basic',
      'Advanced',
      'Sign-in options',
      'Attributes',
      'Policies',
      'Post sign-in',
      'Users',
      'Groups',
      'Metadata',
    ])
    expect(appTabs('OIDC', 'saved').at(-1)).toBe('endpoints')
    for (const l of Object.values(TAB_LABEL)) expect(l).not.toMatch(/\d/)
  })

  it('leave out Post sign-in, Users and Groups until the application is stored', () => {
    expect(labels(appTabs('OIDC', 'new'))).toEqual(['Basic', 'Advanced', 'Sign-in options', 'Attributes', 'Policies', 'Endpoints'])
  })

  it('put Post sign-in right after Policies, and land a route on it', () => {
    const saved = appTabs('OIDC', 'saved')
    expect(saved.indexOf('post-sign-in')).toBe(saved.indexOf('policies') + 1)
    expect(landingTab('post-sign-in', saved)).toBe('post-sign-in')
    /* An application not stored yet has no such tab: Policies, the page's default. */
    expect(landingTab('post-sign-in', appTabs('OIDC', 'new'))).toBe('policies')
    expect(isSetupTab('post-sign-in')).toBe(false)
  })

  it('land a route on its own tab, and on Policies when this application has no such tab', () => {
    const saml = appTabs('SAML', 'saved')
    expect(landingTab('attributes', saml)).toBe('attributes')
    expect(landingTab('endpoints', saml)).toBe('policies')
    expect(landingTab(undefined, saml)).toBe('policies')
  })

  it('tell the setup tabs from the rest', () => {
    expect(appTabs('SAML', 'saved').filter(isSetupTab)).toEqual(['basic', 'advanced', 'sign-in', 'attributes'])
  })
})

describe('the draft', () => {
  it('opens clean on every showcase application, seed ones included', () => {
    for (const app of showcaseTenant().apps) expect(draftChanges(draftOf(app), draftOf(app)), app.id).toEqual([])
  })

  it('reviews one row per field, in the tabs’ order, the secret never printed', () => {
    const oidc = { ...defaultOidc('id'), redirectUrls: ['https://a.example/cb'] }
    const before: AppDraft = { description: '', secret: 'old-secret', setup: oidc }
    const after: AppDraft = {
      description: 'Expense reports',
      secret: 'new-secret',
      setup: { ...oidc, singleLogout: true, subject: 'username' },
    }
    const rows = draftChanges(before, after)
    expect(rows.map((r) => [r.group, r.label])).toEqual([
      ['Basic', 'Client secret'],
      ['Basic', 'Subject'],
      ['Basic', 'Description'],
      ['Sign-in options', 'Single logout enabled'],
    ])
    const secret = rows.find((r) => r.label === 'Client secret')!
    expect([secret.before, secret.after]).toEqual(['Current secret', 'New secret'])
    expect(JSON.stringify(rows)).not.toContain('new-secret')
    expect(rows.find((r) => r.label === 'Description')).toMatchObject({ before: 'None', after: 'Expense reports' })
  })

  it('reads a description that differs only by spaces as unchanged', () => {
    const d: AppDraft = { description: 'HR', secret: '', setup: defaultSaml() }
    expect(draftChanges(d, { ...d, description: ' HR ' })).toEqual([])
  })

  it('is clean on arrival as a new application, and dirty once anything moves', () => {
    const saml = defaultSaml()
    const start: NewDraft = { name: 'Salesforce 2', description: '', secret: '', setup: saml }
    expect(newDraftChanged(start, { ...start })).toBe(false)
    expect(newDraftChanged(start, { ...start, name: ' Salesforce 2 ' })).toBe(false)
    expect(newDraftChanged(start, { ...start, name: 'Sales CRM' })).toBe(true)
    expect(newDraftChanged(start, { ...start, setup: { ...saml, signAssertion: true } })).toBe(true)
  })
})

describe("Basic's problems", () => {
  const saml = defaultSaml()
  const empty: NewDraft = { name: '', description: '', secret: '', setup: saml }

  it('says the first in the form’s order', () => {
    expect(firstIssue(basicIssues(empty.setup, empty.name, [], ''))).toBe('Enter a display name.')
    expect(firstIssue({})).toBeNull()
  })

  it('says a missing answer only once Save was pressed, and a wrong one at once', () => {
    const typed: NewDraft = { ...empty, name: 'Salesforce', setup: { ...saml, acsUrl: 'http://sp.example/acs' } }
    const issues = basicIssues(typed.setup, typed.name, ['Salesforce'], '')
    expect(Object.keys(shownIssues(issues, typed, false)).sort()).toEqual(['acsUrl', 'name'])
    expect(Object.keys(shownIssues(issues, typed, true)).sort()).toEqual(['acsUrl', 'entityId', 'name'])
  })

  it('has nothing to say about a seed application', () => {
    for (const app of showcaseTenant().apps) {
      const d = draftOf(app)
      expect(basicIssues(setupOf(app), app.name, [], d.secret || 'x'), app.id).toEqual({})
    }
  })
})

describe('the Post sign-in tab', () => {
  /* The board's own rules: a Deny rule, and Allow for "Nothing else matched". */
  const denying = (name: string): Policy => ({
    ...blankPostSignInPolicy(name),
    rules: [rule({ name: 'Large export', action: 'deny' })],
    fallback: { ...fallbackRule(), action: 'allow' },
  })
  const a = { ...linkApp(denying('Exports'), 'salesforce', ['sf-report-export']), id: 'a' }
  const b = { ...linkApp(linkApp(blankPostSignInPolicy('Collaboration'), 'slack', ['sl-export']), 'github', ['gh-token']), id: 'b' }
  const c = { ...blankPostSignInPolicy('Unused'), id: 'c' }
  const signIn = { ...blankPolicy('Salesforce for everyone', ['salesforce']), id: 's' }

  it('offers the post sign-in policies not linked here, with where else they apply, and no sign-in policy', () => {
    const offered = linkChoices('salesforce', [a, b, c, signIn])
    expect(offered.map((o) => [o.policy.id, o.meta])).toEqual([
      ['b', 'Linked to 2 applications'],
      ['c', 'Not linked'],
    ])
    expect(linkChoices('slack', [a]).map((o) => o.meta)).toEqual(['Linked to 1 application'])
    for (const o of offered) expect(o.meta).not.toMatch(/\blog ?in\b/i)
  })

  it('lists an application’s own events under its name, then the session events', () => {
    const groups = eventGroups('salesforce', 'Salesforce')
    expect(groups.map((g) => g.title)).toEqual(['Salesforce events', 'Session events'])
    expect(groups[0].events.map((e) => e.id)).toEqual(APP_EVENTS.salesforce.map((e) => e.id))
    expect(groups[1].events).toEqual(SESSION_EVENTS)
    /* One the catalogue has no events for: the session events alone. */
    expect(eventGroups('hrms', 'HRMS').map((g) => g.title)).toEqual(['Session events'])
  })

  it('names a link’s events in the catalogue’s order, and drops an id it does not know', () => {
    expect(eventNames('salesforce', ['ip-change', 'no-such-event', 'sf-report-export'])).toEqual(['Report export', 'IP or location change'])
  })

  it('asks for at least one event, as a reason and never a disabled button', () => {
    expect(linkIssue([])).toBe('Choose at least one event.')
    expect(linkIssue(['ip-change'])).toBeNull()
  })

  it('says once that Deny cannot stop the events reported after, only when the policy can Deny', () => {
    expect(denyNotice(a, 'slack', ['sl-download', 'sl-export', 'ip-change'])).toBe("Deny can't stop events reported after: File download and Workspace export.")
    expect(denyNotice(a, 'slack', ['ip-change'])).toBeNull()
    expect(denyNotice(b, 'slack', ['sl-download'])).toBeNull()
    /* A disabled Deny rule denies nothing; Deny on the last row does. */
    const off = { ...a, rules: a.rules.map((r) => ({ ...r, enabled: false })) }
    expect(denyNotice(off, 'slack', ['sl-download'])).toBeNull()
    const last = { ...b, fallback: { ...fallbackRule(), action: 'deny' as const } }
    expect(denyNotice(last, 'slack', ['sl-download'])).toBe("Deny can't stop events reported after: File download.")
  })

  it('names the policy, its events and the application when it is unlinked', () => {
    expect(unlinkCopy('Exports', 'salesforce', 'Salesforce', ['sf-report-export', 'sf-api-query', 'ip-change'])).toBe(
      'Exports stops deciding Report export and 2 more on Salesforce.',
    )
  })
})

describe('the side panel', () => {
  it('is fixed copy that names the client ID and secret, and no App secret', () => {
    expect(CLIENT_NOTE.terms?.map((t) => t.term)).toEqual(['Client ID', 'Client secret'])
    const text = [CLIENT_NOTE.title, ...(CLIENT_NOTE.terms ?? []).flatMap((t) => [t.term, t.note])]
    for (const line of text) {
      expect(line).not.toMatch(/\d/)
      expect(line).not.toMatch(/app secret|\blog ?in\b/i)
    }
  })
})
