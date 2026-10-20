import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'

import { BrandProvider } from '../store'
import { apps, blankPolicy, fallbackRule, rule, type Policy } from '../data'
import { showcaseTenant } from '../fixtures'
import { blankPostSignInPolicy, linkApp, linkedTo } from '../post-sign-in'
import { ApplicationPage } from './ApplicationPage'
import { LinkPolicyDrawer } from './AppPostSignIn'
import tabSrc from './AppPostSignIn.tsx?raw'
import { eventNames } from './app-page-model'
import { TestingSessionProvider } from './testing/session'

/* -----------------------------------------------------------------------------
   An application's Post sign-in tab and its Link policy slider, drawn once as
   static markup (spec POST-SIGN-IN-POLICIES.md §Screens 3). The tab on the
   showcase tenant: the policies linked there, or the empty state. The slider
   on a tenant made here, so each case is the case it names: the pick that
   leaves out what is linked already, and the events with one another policy
   holds. Nothing is pressed; what the tab and slider say is pinned in
   app-page-model.test.ts, and the writes in post-sign-in.test.ts.
   -------------------------------------------------------------------------- */

const render = (node: ReactNode) =>
  renderToStaticMarkup(
    <BrandProvider>
      <TestingSessionProvider>{node}</TestingSessionProvider>
    </BrandProvider>,
  )
const decode = (s: string) => s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&')
const text = (html: string) => decode(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '))
const count = (html: string, needle: string) => html.split(needle).length - 1
const selected = (html: string) => text(html.match(/role="tab"[^>]*aria-selected="true"[^>]*>(.*?)<\/button>/)?.[1] ?? '').trim()
const tabsOf = (html: string) => [...html.matchAll(/role="tab"[^>]*>(.*?)<\/button>/g)].map((m) => text(m[1]).trim())
/* "login", "log in", "logged in", "logs in", "logging in", "log-in". */
const LOGIN = /\blog(?:s|ged|ging)?[ -]?ins?\b/i

/* The slider's event rows: each checkbox button's attributes and words. */
const eventRows = (html: string) =>
  [...html.matchAll(/<button type="button" role="checkbox"([^>]*)>([\s\S]*?)<\/button>/g)].map((m) => ({ attrs: m[1], text: text(m[2]).trim() }))

describe('the Post sign-in tab', () => {
  const tenant = showcaseTenant()
  const seeded = tenant.apps.find((a) => linkedTo(a.id, tenant.policies).length > 0)
  const bare = tenant.apps.find((a) => linkedTo(a.id, tenant.policies).length === 0)
  /* The seed's live policy (showcase-seed.ts), linked to Salesforce and Workday. */
  const dataExport = tenant.policies.find((p) => p.id === 'ps-data-export')

  it('opens when the route names it, right after Policies, with no counts', () => {
    const out = render(<ApplicationPage appId={tenant.apps[0].id} tab="post-sign-in" />)
    expect(selected(out)).toBe('Post sign-in')
    const tabs = tabsOf(out)
    expect(tabs.indexOf('Post sign-in')).toBe(tabs.indexOf('Policies') + 1)
    expect(out).toContain('aria-label="Post sign-in"')
    expect(text(out)).not.toMatch(/Post sign-in \d/)
  })

  it.runIf(!!seeded)('lists each policy linked here once, with its events here and its status, unnumbered', () => {
    const app = seeded!
    const out = render(<ApplicationPage appId={app.id} tab="post-sign-in" />)
    const t = text(out)
    for (const { policy, eventIds } of linkedTo(app.id, tenant.policies)) {
      expect(count(out, `data-policy-id="${policy.id}"`), policy.name).toBe(1)
      expect(t).toContain(eventNames(app.id, eventIds)[0])
      expect(out).toContain(`aria-label="Actions for ${policy.name}"`)
    }
    expect(out).toContain('bx-status')
    /* Not ranked, and never the sign-in list: no position, no tenant default. */
    expect(out).not.toMatch(/bapr__n(?![a-z])/)
    expect(t).not.toContain('Global Default Policy')
    /* Link policy, the view's one orange button. */
    expect(t).toContain('Link policy')
    expect(count(out, 'bx-btn--brand')).toBe(1)
    expect(t).not.toMatch(LOGIN)
  })

  it.runIf(!!dataExport)('shows one policy on each application it is linked to, with that application’s events', () => {
    /* Salesforce: its three in-app events and two session events, two named and the rest counted. */
    const sf = text(render(<ApplicationPage appId="salesforce" tab="post-sign-in" />))
    expect(sf).toContain('Data export protection')
    expect(sf).toContain('Events: Report export and 4 more')
    expect(sf).toContain('Active')
    /* Workday: the same policy, its own two events, named both. */
    const wd = text(render(<ApplicationPage appId="workday" tab="post-sign-in" />))
    expect(wd).toContain('Data export protection')
    expect(wd).toContain('Events: Change bank details and Export worker data')
    /* Never a policy linked elsewhere only. */
    expect(wd).not.toContain('Collaboration tools')
  })

  it.runIf(!!bare)('says nothing is linked, with Link policy the one orange button', () => {
    const out = render(<ApplicationPage appId={bare!.id} tab="post-sign-in" />)
    const t = text(out)
    expect(t).toContain('No post sign-in policies on this application')
    expect(t).toContain('Link policy')
    expect(count(out, 'bx-btn--brand')).toBe(1)
    expect(t).not.toMatch(LOGIN)
  })

  it('opens every policy in the board — the one builder — with this application as the way back', () => {
    /* Rendered markup cannot press; the source is where the routes are. */
    expect(tabSrc).toContain("store.go({ name: 'board', policyId, from: { appId: app.id } })")
    expect(tabSrc).not.toContain("name: 'post-sign-in'")
  })
})

describe('Link policy', () => {
  const salesforce = apps.find((a) => a.id === 'salesforce')!
  const slack = apps.find((a) => a.id === 'slack')!
  /* The board's own rules: a Deny rule, and Allow on "Nothing else matched". */
  const denying = (name: string): Policy => ({
    ...blankPostSignInPolicy(name),
    rules: [rule({ name: 'Large export', action: 'deny' })],
    fallback: { ...fallbackRule(), action: 'allow' },
  })

  /* Two linked to Salesforce, one elsewhere, one linked nowhere, and a sign-in policy. */
  const holder: Policy = { ...linkApp(denying('Data export protection'), 'salesforce', ['sf-report-export']), id: 'holder', status: 'active' }
  const mine: Policy = { ...linkApp(denying('Finance session'), 'salesforce', ['sf-api-query']), id: 'mine' }
  const elsewhere: Policy = { ...linkApp(blankPostSignInPolicy('Collaboration tools'), 'slack', ['sl-export']), id: 'elsewhere' }
  const unused: Policy = { ...blankPostSignInPolicy('Unused policy'), id: 'unused' }
  const signIn: Policy = { ...blankPolicy('Salesforce for everyone', ['salesforce']), id: 'sign-in' }
  const policies = [holder, mine, elsewhere, unused, signIn]

  const drawer = (props: { app?: typeof salesforce; editId?: string | null; list?: Policy[] }) =>
    render(
      <LinkPolicyDrawer
        open
        app={props.app ?? salesforce}
        policies={props.list ?? policies}
        editId={props.editId ?? null}
        onClose={() => {}}
        onLink={() => true}
        onCreate={() => {}}
      />,
    )

  it('opens on Choose policy: Create new policy first, then the ones not linked here, with where else they apply', () => {
    const out = drawer({})
    const t = text(out)
    expect(t).toContain('Link policy')
    expect(t).toContain('Salesforce')
    expect(t.indexOf('Create new policy')).toBeGreaterThan(-1)
    expect(t.indexOf('Create new policy')).toBeLessThan(t.indexOf('Collaboration tools'))
    expect(t).toContain('Linked to 1 application')
    expect(t).toContain('Not linked')
    /* Linked here already (edited from their rows), and a sign-in policy: never offered. */
    for (const name of ['Data export protection', 'Finance session', 'Salesforce for everyone']) expect(t).not.toContain(name)
    /* Next is pressing a row: no orange button on this page, and nothing disabled. */
    expect(count(out, 'bx-btn--brand')).toBe(0)
    expect(out).not.toContain('disabled=""')
    expect(t).not.toMatch(LOGIN)
  })

  it('edits a linked policy’s events with its own ticked, and one another policy holds named and not pickable', () => {
    const out = drawer({ editId: 'mine' })
    const t = text(out)
    /* Nothing under it: no way back to Choose policy. */
    expect(t).not.toContain('Choose policy')
    expect(t).toContain('Finance session')
    expect(t.indexOf('Salesforce events')).toBeGreaterThan(-1)
    expect(t.indexOf('Salesforce events')).toBeLessThan(t.indexOf('Session events'))

    const rows = eventRows(out)
    const report = rows.find((r) => r.text.startsWith('Report export'))!
    expect(report.attrs).toContain('disabled=""')
    expect(report.attrs).toContain('aria-checked="false"')
    expect(report.text).toContain('Linked to Data export protection')
    const api = rows.find((r) => r.text.startsWith('API query'))!
    expect(api.attrs).toContain('aria-checked="true"')
    expect(api.attrs).not.toContain('disabled')
    /* Only that one is held: every other event can be picked. */
    expect(rows.filter((r) => r.attrs.includes('disabled'))).toHaveLength(1)

    /* One orange button, never disabled; nothing said before it is pressed. */
    expect(count(out, 'bx-btn--brand')).toBe(1)
    expect(out).not.toMatch(/<button[^>]*disabled=""[^>]*class="bx-btn/)
    expect(t).not.toContain('Choose at least one event.')
    expect(t).not.toMatch(LOGIN)
  })

  it('tags an application’s own events with how they arrive, and leaves the session events untagged', () => {
    const rows = eventRows(drawer({ editId: 'mine' }))
    /* Salesforce asks first, for every one of its own events. */
    expect(rows.find((r) => r.text.startsWith('Report export'))!.text).toContain('Checked before')
    /* The session events: their group's heading says it. */
    const ip = rows.find((r) => r.text.startsWith('IP or location change'))!
    expect(ip.text).not.toMatch(/Checked before|Reported after|Session$/)
    /* Slack reports after. */
    const guard: Policy = { ...linkApp(blankPostSignInPolicy('Slack watch'), 'slack', ['sl-download']), id: 'watch' }
    const slackRows = eventRows(drawer({ app: slack, editId: 'watch', list: [guard] }))
    expect(slackRows.find((r) => r.text.startsWith('File download'))!.text).toContain('Reported after')
  })

  it('says once that Deny cannot stop the ticked events reported after, only when the policy can Deny', () => {
    const guard: Policy = { ...linkApp(denying('Slack guard'), 'slack', ['sl-download', 'sl-export', 'ip-change']), id: 'guard' }
    const t = text(drawer({ app: slack, editId: 'guard', list: [guard] }))
    expect(t).toContain("Deny can't stop events reported after: File download and Workspace export.")
    expect(count(t, "Deny can't stop")).toBe(1)
    /* A policy that cannot Deny has nothing to say. */
    const allowing: Policy = { ...linkApp(blankPostSignInPolicy('Slack watch'), 'slack', ['sl-download']), id: 'watch' }
    expect(text(drawer({ app: slack, editId: 'watch', list: [allowing] }))).not.toContain("Deny can't stop")
  })

  it('says a policy deleted since is gone, and offers nothing to link', () => {
    const out = drawer({ editId: 'no-such-policy' })
    expect(text(out)).toContain('That policy no longer exists.')
    expect(count(out, 'bx-btn--brand')).toBe(0)
    expect(eventRows(out)).toHaveLength(0)
  })
})
