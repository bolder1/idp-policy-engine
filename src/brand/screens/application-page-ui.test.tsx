import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'

import { BrandProvider } from '../store'
import { apps } from '../data'
import { showcaseTenant } from '../fixtures'
import { AddExistingPolicy } from './AddExistingPolicy'
import { ApplicationPage, NewApplicationPage } from './ApplicationPage'
import { TestingSessionProvider } from './testing/session'
import { AppActivity } from './app-activity'
import { GLANCE_ROWS } from './app-policy-model'
import { AppPolicyFocusOverride } from './app-policy-focus'
import { APP_POLICY_GLANCE, PolicyChain } from './app-policy-view'
import { appStanding } from './app-standing'
import activitySrc from './app-activity.tsx?raw'
import viewSrc from './app-policy-view.tsx?raw'

/* -----------------------------------------------------------------------------
   An application's page and its Add existing policy drawer, drawn once as
   static markup on the showcase tenant: the head, the tabs, the Policies list
   in the engine's order, the setup forms, the values the service provider is
   given, and the same page for an application not stored yet. Where each
   policy stands is pinned in app-standing.test.ts, and the page's decisions in
   app-page-model.test.ts; nothing here presses anything.
   -------------------------------------------------------------------------- */

/* The tab is drawn at a glance here (the layout of 20 Oct 2026); the policy-alone layout (21 Oct) has its own tests below. */
const renderIn = (focus: boolean, node: ReactNode) =>
  renderToStaticMarkup(
    <BrandProvider>
      <TestingSessionProvider>
        <AppPolicyFocusOverride.Provider value={focus}>{node}</AppPolicyFocusOverride.Provider>
      </TestingSessionProvider>
    </BrandProvider>,
  )
const render = (node: ReactNode) => renderIn(false, node)
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
const count = (html: string, needle: string) => html.split(needle).length - 1
/* The view's orange CONTROLS, which is what "one orange button per view" counts. A split button (kit `SplitButton`)
   is one object drawn in two halves — the action, and the chevron holding the rest of what can be done to it — and
   both halves wear the action's fill, so the chevron is not a second orange button and is not counted as one. */
const orange = (html: string) => count(html, 'bx-btn--brand') - [...html.matchAll(/class="[^"]*bx-btn--brand[^"]*bx-menu__trigger--icon/g)].length
const tabsOf = (html: string) => [...html.matchAll(/role="tab"[^>]*>(.*?)<\/button>/g)].map((m) => text(m[1]).trim())
const selected = (html: string) => text(html.match(/role="tab"[^>]*aria-selected="true"[^>]*>(.*?)<\/button>/)?.[1] ?? '').trim()

describe('an application page', () => {
  const out = render(<ApplicationPage appId="slack" />)

  it('heads it as a detail page: the way back, the name with its pencil, the type, Documentation', () => {
    const t = text(out)
    expect(t).toContain('All applications')
    expect(out).toMatch(/<h1[^>]*>Slack<\/h1>/)
    expect(out).toContain('aria-label="Rename"')
    expect(t).toContain('Desktop')
    expect(t).toContain('Documentation')
  })

  it('has the live tabs with ours between, no counts, and opens on Policies', () => {
    expect(tabsOf(out)).toEqual(['Basic', 'Advanced', 'Sign-in options', 'Attributes', 'Policies', 'Post sign-in', 'Users', 'Groups', 'Metadata'])
    expect(selected(out)).toBe('Policies')
    expect(out).toContain('aria-label="Policies"')
  })

  it('ends an OAuth application’s tabs with Endpoints, chosen by protocol', () => {
    expect(tabsOf(render(<ApplicationPage appId="github" />)).at(-1)).toBe('Endpoints')
  })

  it('lands a tab this application does not have on Policies', () => {
    expect(selected(render(<ApplicationPage appId="slack" tab="endpoints" />))).toBe('Policies')
  })

  it('numbers the policies the way the engine ranks them, the tenant default under them', () => {
    const t = text(out)
    /* One application has one policy: Slack access, then the default under it. */
    const all = t.indexOf('Slack access')
    expect(all).toBeGreaterThan(-1)
    expect(t).toContain('Global Default Policy')
    expect(t.indexOf('Global Default Policy')).toBeGreaterThan(all)
  })

  it('has no second policy to add once it has its one, and no explaining sentence over the list', () => {
    /* One application has at most one sign-in policy: Edit policy is the view's one orange control, and nothing adds another. */
    expect(orange(out)).toBe(1)
    expect(text(out)).not.toContain('Create new policy')
    expect(text(out)).not.toContain('Add existing policy')
    expect(text(out)).not.toContain('Checked top to bottom')
  })

  it('has one orange button, Create new policy, where the application has no policy yet', () => {
    const none = render(<ApplicationPage appId="salesforce" />)
    expect(count(none, 'bx-btn--brand')).toBe(1)
    expect(text(none)).toContain('Create new policy')
  })
})

/* The Policies tab (spec APP-POLICY-TAB.md §8.3): the policy read in the page — its head with two buttons, the chain
   down to the Global Default, the application's sign-ins and the policy's changes — and, with no policy, what the
   application gets now. Static markup: nothing here opens a row or a menu. */
describe('the Policies tab', () => {
  const box = render(<ApplicationPage appId="box" />)
  const t = text(box)
  /* The head's own buttons: its actions slot, which ends before the fact line's links can be counted with it. */
  const acts = (html: string) => html.slice(html.indexOf('apol__acts'), html.indexOf('</div>', html.indexOf('apol__acts')))
  const buttonsIn = (html: string) => [...html.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map((m) => text(m[1]).trim())

  it('heads the policy with a primary, a secondary and a ⋯ trail, and nothing else orange in the view', () => {
    expect(box).toMatch(/<h2[^>]*>Box access<\/h2>/)
    /* Edit policy is the one orange button, Replace policy the secondary, and the ⋯ holds the rest, which static
       markup never opens (owner, 23 Oct 2026: "a primary, a secondary and a 3 dot button trail"). */
    expect(buttonsIn(acts(box))).toEqual(['Edit policy', 'Replace policy', ''])
    expect(acts(box)).toContain('aria-label="More for this policy"')
    expect(orange(box)).toBe(1)
    expect(orange(acts(box))).toBe(1)
  })

  it('says the status in a plain chip, with every switch in the head\'s one menu', () => {
    /* The pill was the trigger until 22 Oct 2026, when the owner gave up on making a tinted tag read as pressable
       ("make it a chip only now, no action, and move the action to the main action button"). So: a chip that is
       not a button, and the switches it used to hold are items of the head\'s menu, which static markup does not
       open — hence none of their words appear below. */
    expect(box).toContain('class="apol__status"')
    expect(box).not.toContain('aria-label="Status: Active. Change status"')
    const all = buttonsIn(box)
    for (const word of ['Turn off', 'Monitor', 'Turn on', 'Remove', 'Remove from Box', 'Show in builder', 'Delete draft']) expect(all).not.toContain(word)
    expect(t).not.toContain('Show in builder')
  })

  it('says what it covers and links the groups to the Users tab, read only', () => {
    expect(t).toContain('Who it covers')
    // One chip per group, face then name, then the count (20 Oct 2026: no commas or middle dot between them).
    expect(t).toMatch(/Engineering\s*\S*\s*Design\s*\d+ people/)
    expect(box).toMatch(/class="bx-chip[^"]*is-clickable[^"]*"><button[^>]*class="bx-chip__main"><span class="bx-face is-group/)
    // When it changed is said once, in Changes, not again in the fact line.
    expect(t).not.toMatch(/Changed \d+ days? ago/)
    expect(t).not.toContain('Change in policy')
  })

  it('lists the chain to the Global Default: the rules, Nothing else matched, then outside the policy', () => {
    const rules = t.indexOf('Engineers, where we operate')
    const last = t.indexOf('Nothing else matched')
    const outside = t.indexOf('Outside Box access')
    const gd = t.lastIndexOf('Global Default Policy')
    expect(rules).toBeGreaterThan(-1)
    expect(last).toBeGreaterThan(rules)
    expect(outside).toBeGreaterThan(last)
    expect(gd).toBeGreaterThan(outside)
    /* The policy's own rules are the builder's read-only canvas (19 Oct 2026). At a glance (20 Oct 2026) the Global
       Default is the rules panel's foot strip, after the canvas's last card, and Sample sits in Sign-in activity's
       head, since the canvas shows no modelled figure; the order and the words hold in both layouts. */
    expect(box).toContain('insp__canvas')
    expect(t).toContain('Sample')
  })

  it('makes every row that opens a real button that says it is closed and names what it opens', () => {
    if (APP_POLICY_GLANCE) {
      /* At a glance the Global Default's row became the rules panel's foot strip (20 Oct 2026): one button, closed,
         naming the sheet it opens. A class of its own, so the chain's row grid never reaches it; no chain rows remain. */
      const strips = [...box.matchAll(/<button[^>]*class="apol__gdstrip[^"]*"[^>]*>/g)].map((m) => m[0])
      expect(strips).toHaveLength(1)
      expect(strips[0]).toContain('aria-expanded="false"')
      expect(strips[0]).toContain('aria-controls="apol-gdsheet"')
      expect(box).not.toMatch(/<button[^>]*class="apol__row/)
      return
    }
    const rows = [...box.matchAll(/<button[^>]*class="apol__row[^"]*"[^>]*>/g)].map((m) => m[0])
    /* The rules are on the canvas now; the Global Default, which decides for everyone Box access does not cover, keeps its row. */
    expect(rows).toHaveLength(1)
    for (const r of rows) {
      expect(r).toContain('aria-expanded="false"')
      expect(r).toMatch(/aria-controls="apol-row-[^"]+"/)
    }
  })

  it('draws no frozen picture of the builder', () => {
    expect(box).not.toContain('insp__frozen')
    expect(box).not.toContain('bento')
  })

  it('has Sign-in activity tied to the rules, and the policy’s changes beside it', () => {
    expect(t).toContain('Sign-in activity')
    expect(box).toContain('aria-label="Find a person in Box sign-ins"')
    /* Changes left the tab, 19 Oct 2026. */
    expect(box).not.toContain('apol-changes')
    expect(t).toContain('Designers, where we operate')
    expect(box).not.toMatch(/Show all \d/)
  })

  it('says why an inactive policy decides nothing, with Turn on', () => {
    /* The state line is the kit's Note (owner, 16 Oct 2026): the state its heading, the sentence under it. */
    const out = render(<ApplicationPage appId="hrms" />)
    const at = out.indexOf('class="apol__state"')
    expect(at).toBeGreaterThan(-1)
    const state = out.slice(at, out.indexOf('</button>', at))
    expect(state).toMatch(/<div class="bx-note" role="note" aria-labelledby="[^"]+">/)
    expect(state).toMatch(/<h3 id="[^"]+" class="bx-note__title">Inactive<\/h3>/)
    expect(text(state)).toContain('Inactive It decides no sign-ins. Turn on')
    expect(state).not.toContain('bx-callout')
  })

  it('says a shared policy is shared, in the fact line', () => {
    const outlook = text(render(<ApplicationPage appId="outlook" />))
    expect(outlook).toContain('Other applications')
  })

  it('shows what an application with no policy gets: the Global Default’s own rules, and one orange button', () => {
    const none = render(<ApplicationPage appId="salesforce" />)
    const n = text(none)
    expect(n).toContain('No policy on Salesforce')
    const gd = showcaseTenant().policies.find((p) => p.isSystem)!
    for (const r of gd.rules) expect(n).toContain(r.name)
    expect(n).toContain('Nothing else matched')
    expect(n).not.toContain('Edit rule')
    expect(n).not.toContain('Outside')
    expect(count(none, 'bx-btn--brand')).toBe(1)
    /* A primary, a secondary and a ⋯ (owner, 23 Oct 2026): Create new policy leads. */
    expect(buttonsIn(acts(none))[0]).toBe('Create new policy')
  })

  it('keeps counts off the tabs', () => {
    for (const label of tabsOf(box)) expect(label).not.toMatch(/\d/)
  })

  /* Review, 15 Oct 2026. */
  it('tells its same-worded buttons apart: each View all says where it goes', () => {
    expect(t).toContain('View all sign-ins on Box')
  })

  it('fills Access checks in from the tab and plays nothing: a prefill, never a load or a patch of the run', () => {
    const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(code(viewSrc)).toContain('session.prefill(appCheckForm(app.id, session, policies, todayIn(), nowIn()))')
    expect(code(viewSrc)).not.toContain('session.patch(')
    expect(code(viewSrc)).not.toContain('session.load(')
    expect(code(activitySrc)).toContain('session.prefill(checkFormFor(app.id, policy, users, apps, todayIn(), personId))')
    /* A past sign-in's Open in Check access plays it, as the Sign-in activity page's does. */
    expect(code(activitySrc).match(/session\.load\(/g)).toHaveLength(1)
    expect(code(activitySrc)).toContain('session.load(formOf(r.facts, zones))')
  })

  it('goes back from either View all to the application it came from', () => {
    const code = activitySrc.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(code).toContain("go({ name: 'sign-in-activity', appId: app.id, from: { appId: app.id } })")
    expect(code).toContain("go({ name: 'sign-in-activity', view: 'changes', q: policy.name, from: { appId } })")
  })
})

/* The Policies tab at a glance (app-policy-view.tsx `APP_POLICY_GLANCE`, 20 Oct 2026): the rules and Sign-in activity as
   two panels of one fixed height, the sign-ins paged, a sign-in picked rather than opened in place. Static markup, so
   these pin what is drawn on arrival — the browser check covers the presses. */
describe.runIf(APP_POLICY_GLANCE)('the Policies tab at a glance', () => {
  const box = render(<ApplicationPage appId="box" />)
  const aws = render(<ApplicationPage appId="aws" />)
  const rulesOf = (html: string) => html.slice(html.indexOf('id="apol-rules"'), html.indexOf('id="apol-activity"'))
  const tags = (html: string, cls: string) => [...html.matchAll(new RegExp(`<button[^>]*class="${cls}[^"]*"[^>]*>`, 'g'))].map((m) => m[0])

  it('draws two fixed frames, their height from the one page size', () => {
    /* The frame is what keeps both panels one height whatever opens inside them, and GLANCE_ROWS is its only source. */
    for (const html of [box, aws]) {
      expect(html).toContain('class="apol__pair is-glance"')
      expect(count(html, 'apol__frame')).toBe(2)
      expect(html).toContain(`style="--apol-rows:${GLANCE_ROWS}"`)
      expect(html).toContain('insp__canvas is-framed')
    }
  })

  it('has no way to grow: no Show more, no row opened in place, one page of rows and one stop for the table', () => {
    /* The owner's ask (19 Oct 2026): expanding moved everything. Rows are picked now, a page at a time. */
    const t = text(aws)
    expect(t).not.toContain('Show more')
    expect(t).not.toContain('Show fewer')
    expect(aws).not.toContain('sia__toggle')
    expect(aws).not.toContain('sia__detail')
    const picks = tags(aws, 'apol__pick')
    expect(picks.length).toBeGreaterThanOrEqual(1)
    expect(picks.length).toBeLessThanOrEqual(GLANCE_ROWS)
    for (const p of picks) expect(p).toContain('aria-pressed="false"')
    expect(picks.filter((p) => p.includes('tabindex="0"'))).toHaveLength(1)
  })

  it('reads each sign-in in the Sign-in activity page’s order, the row’s menu last', () => {
    /* Owner, 20 Oct 2026: "fix the order of each item in the row": When, Person, From, Result, Rule, as the page. */
    const at = aws.indexOf('apol__gtable')
    const head = aws.slice(at, aws.indexOf('</thead>', at))
    expect([...head.matchAll(/<th[^>]*>(.*?)<\/th>/g)].map((m) => text(m[1]).trim())).toEqual(['When', 'Person', 'From', 'Result', 'Rule', 'Actions'])
    expect(head).toMatch(/<th scope="col" class="[^"]*apol__c-menu"><span class="u-sr-only">Actions<\/span><\/th>/)
    /* The person is the row's keyboard stop, in the second cell; the place third, the outcome fourth, the menu last. */
    const from = aws.indexOf('<tr data-row=')
    const row = aws.slice(from, aws.indexOf('</tr>', from))
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[0])
    expect(cells).toHaveLength(6)
    expect(text(cells[0]).trim()).toMatch(/^\w{3} \d{1,2} \w{3}, \d{2}:\d{2}$/)
    expect(cells[1]).toContain('class="apol__pick"')
    expect(cells[2]).toContain('apol__from')
    expect(cells[3]).toMatch(/bx-decision-badge|Can/)
    expect(cells[5]).toContain('bx-rowmenu')
  })

  it('ends every sign-in in its own menu, named for the row, and only the stop’s in the tab order', () => {
    /* Owner, 20 Oct 2026: "add it to each list item on hover; use it as icon menu button". */
    /* The sign-ins' table alone: the page has other kebabs. */
    const table = aws.slice(aws.indexOf('apol__gtable'), aws.indexOf('</table>', aws.indexOf('apol__gtable')))
    const picks = tags(table, 'apol__pick')
    const menus = tags(table, 'bx-rowmenu')
    expect(picks.length).toBeGreaterThanOrEqual(1)
    expect(menus).toHaveLength(picks.length)
    for (const m of menus) {
      expect(m).toContain('aria-haspopup="menu"')
      expect(m).toMatch(/aria-label="Actions for [^",]+, \w{3} \d{1,2} \w{3}, \d{2}:\d{2}"/)
    }
    /* One stop for the table, then its row's menu: the two tabindex="0" share a row, every other kebab is out. */
    expect(menus.filter((m) => m.includes('tabindex="0"'))).toHaveLength(1)
    expect(menus.filter((m) => m.includes('tabindex="-1"'))).toHaveLength(menus.length - 1)
    const rows = [...table.matchAll(/<tr data-row=[\s\S]*?<\/tr>/g)].map((m) => m[0])
    const stopRows = rows.filter((r) => /class="apol__pick"[^>]*tabindex="0"/.test(r))
    expect(stopRows).toHaveLength(1)
    expect(stopRows[0]).toMatch(/class="bx-rowmenu[^"]*"[^>]*tabindex="0"/)
  })

  it('keeps the foot to the pick and the pager: its ways on are in each row’s menu', () => {
    const code = activitySrc.replace(/\/\*[\s\S]*?\*\//g, '')
    const glance = code.slice(code.indexOf('export function GlanceActivity'), code.indexOf('export function AppChanges'))
    const foot = glance.slice(glance.indexOf('apol__actfoot'))
    expect(foot).not.toContain('CopyText')
    expect(foot).not.toContain('openInChecks')
    expect(foot).toContain('Clear selection')
    expect(foot).toContain('<ListPager')
    /* The menu's two items: Check access's own name, and Copy details with the toast that says it was copied. */
    expect(glance).toContain('label: `Open in ${ACCESS_CHECK}`')
    expect(glance).toContain("label: 'Copy details'")
    expect(glance).toContain("showToast(ok ? 'Copied'")
    expect(text(aws)).not.toContain('Open in Check access')
    expect(aws).not.toContain('sia__copy')
  })

  it('pages the sign-ins with the console’s pager, named', () => {
    expect(aws).toContain('aria-label="Sign-in pages"')
    expect(text(aws)).toMatch(/\d+–\d+ of \d+/)
  })

  it('narrows the sign-ins by rule', () => {
    expect(aws).toContain('aria-label="Filter by rule"')
    expect(text(aws)).toContain('All rules')
  })

  it('says each card’s outcome where its state pill was', () => {
    /* At a glance: Allow, 2FA or Deny on every card, not "Complete" or the last row's "Always on". Counted on the
       canvas alone (the Global Default's strip below it has a badge of its own), card for card against the policy. */
    const rules = rulesOf(aws)
    const canvas = rules.slice(0, rules.indexOf('apol__rulesfoot'))
    const own = showcaseTenant().policies.find((p) => p.id === 'sc-aws-engineering')!
    /* NO outcome badge on these cards since 22 Oct 2026 (owner: "the user can open and see the result, so I
       don't want to showcase that twice"), and no state pill either ("remove this as well"). The head is the
       number and the name; the decision is read by opening the rule. */
    expect(own.rules.length).toBeGreaterThanOrEqual(2)
    expect(count(canvas, 'class="bb__said"')).toBe(0)
    /* This is the GLANCE layout (FOCUS off), which the owner does not use. With no outcome badge to stand in its
       place, the builder's own state pill is what its heads carry again. On the layout he does use, the pill is
       hidden in applications.css; nothing here asserts on that, because hiding is not removing. */
    expect(rules).toContain('>Complete<')
  })

  it('gives each card one keyboard stop, its title, which says what it opens', () => {
    /* One tab stop per card; the fold mark is the pointer's, and the reorder number is out of the order (`locked`). */
    const rules = rulesOf(aws)
    const titles = tags(rules, 'bb__titlebtn')
    expect(titles.length).toBeGreaterThanOrEqual(7)
    for (const b of titles) expect(b).toContain('aria-controls="bb-')
    for (const b of [...tags(rules, 'bb__act bb__fold__btn'), ...tags(rules, 'bb__idx')]) expect(b).toContain('tabindex="-1"')
  })

  it('moves Sample to Sign-in activity’s head, the panel whose rows are the sample', () => {
    const at = aws.indexOf('id="apol-activity"')
    expect(text(aws.slice(at, aws.indexOf('class="apol__bar"', at)))).toContain('Sample')
    expect(text(rulesOf(aws))).not.toContain('Sample')
  })

  it('draws an application with no policy in the same frame, with no Global Default foot and the rail under it', () => {
    /* The same canvas as a policy's tab (owner, 23 Oct 2026: remove sign-in activity, use the current canvas for the
       Global Default as well): wide, with nothing beside it, and no Global Default foot. */
    const none = render(<ApplicationPage appId="salesforce" />)
    expect(none).toContain('class="apol__focus"')
    expect(none).not.toContain('apol__pair')
    expect(none).not.toContain('id="apol-activity"')
    expect(none).not.toContain('apol__gdstrip')
    expect(none).not.toContain('apol__foot')
  })
})

/* The 19 Oct layout the glance replaces is kept behind `APP_POLICY_GLANCE` (flags are kept, not dead), so its own
   contracts stay pinned whichever way the flag stands: the chain's Global Default row, the sign-ins that open in place,
   and Show more. Drawn straight from its parts, as the tab draws them with the flag off. */
describe('the Policies tab with the glance off', () => {
  const tenant = showcaseTenant()
  const box = tenant.apps.find((a) => a.id === 'box')!
  const st = appStanding('box', tenant.policies, tenant.directory.people)
  const shown = st.rows.find((r) => r.state === 'decides') ?? st.rows[0]
  const chain = render(
    <PolicyChain
      app={box}
      policy={shown.policy}
      globalDefault={st.fallback}
      everyoneElse={st.everyoneElse}
      open={null}
      onToggle={() => {}}
      itemRef={() => {}}
      editable
      everyoneElseCount={21}
    />,
  )
  const activity = render(<AppActivity app={box} policy={shown.policy} globalDefault={st.fallback} onRule={() => {}} reduced={false} />)

  it('makes the Global Default’s row a real button that says it is closed and names what it opens', () => {
    const rows = [...chain.matchAll(/<button[^>]*class="apol__row[^"]*"[^>]*>/g)].map((m) => m[0])
    /* The rules are on the canvas; the Global Default, which decides for everyone Box access does not cover, keeps its row. */
    expect(rows).toHaveLength(1)
    for (const r of rows) {
      expect(r).toContain('aria-expanded="false"')
      expect(r).toMatch(/aria-controls="apol-row-[^"]+"/)
    }
    expect(chain).toContain('insp__canvas')
    expect(chain).not.toContain('is-framed')
  })

  it('opens each sign-in in place from its own toggle, five at a time with Show more', () => {
    const toggles = [...activity.matchAll(/<button[^>]*class="sia__toggle"[^>]*>/g)].map((m) => m[0])
    expect(toggles.length).toBeGreaterThanOrEqual(1)
    expect(toggles.length).toBeLessThanOrEqual(5)
    for (const b of toggles) expect(b).toContain('aria-expanded="false"')
    if (toggles.length === 5) expect(text(activity)).toContain('Show more')
    expect(activity).toContain('aria-label="Find a person in Box sign-ins"')
    expect(text(activity)).toContain('View all sign-ins on Box')
    expect(activity).not.toContain('apol__gtable')
  })
})

describe('an application page on Basic', () => {
  it('asks an OAuth application the live Basic, its client secret masked, and names it Client secret', () => {
    const out = render(<ApplicationPage appId="github" tab="basic" />)
    const t = text(out)
    for (const label of ['Redirect URL', 'Client ID', 'Client secret', 'Subject', 'Description', 'Add redirect URL']) expect(t).toContain(label)
    expect(t).not.toContain('App secret')
    expect(out).toContain('type="password"')
    expect(out).toContain('aria-label="Show client secret"')
    expect(out).toContain('aria-label="Copy client secret"')
    expect(out).toContain('aria-label="Copy client ID"')
    expect(count(t, 'Regenerate')).toBe(2)
    /* The static note beside it, and the Email address the console says everywhere. */
    expect(t).toContain('Client ID and secret')
    expect(t).toContain('Email address')
  })

  it('asks a SAML application for its identifiers, and for no secret or name', () => {
    const t = text(render(<ApplicationPage appId="slack" tab="basic" />))
    for (const label of ['SP entity ID or issuer', 'ACS URL', 'Audience URI', 'Single logout URL']) expect(t).toContain(label)
    expect(t).not.toContain('Client secret')
    /* The head's pencil renames a stored application. */
    expect(t).not.toContain('Display name')
  })

  it('opens clean: a seed application shows no save footer and no unsaved pill', () => {
    const out = render(<ApplicationPage appId="slack" tab="basic" />)
    expect(out).not.toContain('bx-savebar')
    expect(text(out)).not.toContain('Unsaved changes')
  })

  it('draws the live defaults as switches and pickers on Advanced, with a tip only where a wrong choice is likely', () => {
    const out = render(<ApplicationPage appId="slack" tab="advanced" />)
    const t = text(out)
    expect(count(out, 'role="switch"')).toBe(6)
    for (const label of ['Signature algorithm', 'RSA-SHA256', 'Relay state', 'SAML authentication validity period', 'PasswordProtectedTransport']) {
      expect(t).toContain(label)
    }
    /* None picked, so no value box for it. */
    expect(t).not.toContain('Relay state value')
    expect(out).toContain('aria-label="About Relay state"')
    expect(out).not.toContain('aria-label="About Sign response"')
  })

  it('says sign-in on Sign-in options, never login', () => {
    const t = text(render(<ApplicationPage appId="github" tab="sign-in" />))
    for (const label of ['Show on end user dashboard', 'Force authentication', 'Allowed logout URIs', 'Single logout enabled']) expect(t).toContain(label)
    expect(t).not.toMatch(/\blog ?in\b/i)
  })

  it('maps attributes on Attributes, the Name ID format by its readable end', () => {
    const t = text(render(<ApplicationPage appId="slack" tab="attributes" />))
    for (const label of ['Name ID', 'Name ID format', 'unspecified', 'Add name format', 'Enable multi-valued attributes', 'Add attribute']) {
      expect(t).toContain(label)
    }
    expect(t).not.toContain('urn:oasis')
  })

  it('gives the service provider its values with Copy, and the certificate as a download', () => {
    const out = render(<ApplicationPage appId="slack" tab="metadata" />)
    const t = text(out)
    for (const label of ['IdP entity ID', 'SAML sign-in URL', 'SAML sign-out URL', 'Metadata URL', 'Download certificate']) expect(t).toContain(label)
    expect(out).toContain('aria-label="Copy Metadata URL"')
    expect(count(out, 'bx-btn--brand')).toBe(0)
    expect(text(render(<ApplicationPage appId="github" tab="endpoints" />))).toContain('Authorization endpoint')
  })
})

describe('an application that is not there', () => {
  it('says so, with the way back and no head', () => {
    const out = render(<ApplicationPage appId="no-such-app" />)
    expect(text(out)).toContain('Application not found')
    expect(text(out)).toContain('Back to applications')
    expect(out).not.toContain('<h1')
  })
})

describe('an application not stored yet', () => {
  const out = render(<NewApplicationPage catalogId="salesforce" />)

  it('is the same page: the way back to the catalogue, the Display name as the heading, the protocol', () => {
    const t = text(out)
    expect(t).toContain('Choose application')
    /* The tenant has Salesforce, so the name is freed. */
    expect(out).toMatch(/<h1[^>]*>Salesforce 2<\/h1>/)
    expect(t).toContain('SAML')
    expect(t).toContain('Documentation')
    expect(out).not.toContain('aria-label="Rename"')
  })

  it('has the tabs less Post sign-in, Users and Groups, and opens on Basic with the Display name first', () => {
    expect(tabsOf(out)).toEqual(['Basic', 'Advanced', 'Sign-in options', 'Attributes', 'Policies', 'Metadata'])
    expect(selected(out)).toBe('Basic')
    const t = text(out)
    expect(t.indexOf('Display name')).toBeGreaterThan(-1)
    expect(t.indexOf('Display name')).toBeLessThan(t.indexOf('SP entity ID or issuer'))
    expect(out).toContain('value="Salesforce 2"')
  })

  it('has the live footer — Cancel, Next, Save — with Save the one orange button, and nothing disabled', () => {
    const foot = out.slice(out.indexOf('bdpw__foot'))
    const t = text(foot)
    expect(t.indexOf('Cancel')).toBeLessThan(t.indexOf('Next'))
    expect(t.indexOf('Next')).toBeLessThan(t.indexOf('Save'))
    /* No Back on the first tab. */
    expect(t).not.toMatch(/\bBack\b/)
    expect(count(out, 'bx-btn--brand')).toBe(1)
    expect(foot).not.toContain('disabled')
    /* Nothing is said under a field before Save is pressed. */
    expect(out).not.toContain('bmc__error')
  })

  it('makes an OAuth application its client ID and secret, and ends on Endpoints', () => {
    const oauth = render(<NewApplicationPage catalogId="oauth" />)
    expect(tabsOf(oauth).at(-1)).toBe('Endpoints')
    expect(text(oauth)).toContain('Client secret')
    expect(text(oauth)).toContain('OAuth/OpenID')
    expect(oauth).toMatch(/value="[0-9a-f]{32}"/)
  })

  it('says an entry the catalogue does not have is not found, with the way back', () => {
    const missing = render(<NewApplicationPage catalogId="no-such-entry" />)
    expect(text(missing)).toContain('Application not found')
    expect(text(missing)).toContain('Choose application')
    expect(missing).not.toContain('<h1')
  })
})

describe('Add existing policy', () => {
  const slack = apps.find((a) => a.id === 'slack')!
  const out = render(<AddExistingPolicy open app={slack} onClose={() => {}} onAdd={() => true} onCopy={() => true} />)

  it('is a list of the policies, nothing picked, and Add waiting for a pick', () => {
    const t = text(out)
    expect(t).toContain('Add existing policy')
    expect(t).toContain('On other applications')
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*>Add this policy<\/button>/)
    expect(t).not.toContain('Add a copy')
    expect(out).not.toContain('bapr__stack')
  })
})

/* The Policies tab on the policy alone (21 Oct 2026): the rules wide, the facts beside them, Sign-in activity a button
   that opens it in a panel. */
describe('the Policies tab on the policy alone', () => {
  const box = renderIn(true, <ApplicationPage appId="box" />)

  it('heads the policy with Edit policy, Replace policy and a ⋯ holding the rest, still the view’s one orange control', () => {
    const acts = box.slice(box.indexOf('apol__acts'), box.indexOf('</div>', box.indexOf('apol__acts')))
    /* Sign-in activity and Check access are inside the ⋯ menu; Replace policy is the secondary beside Edit. */
    expect([...acts.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map((m) => text(m[1]).trim())).toEqual(['Edit policy', 'Replace policy', ''])
    expect(acts).toContain('aria-label="More for this policy"')
    expect(orange(box)).toBe(1)
  })

  it('draws the rules wide straight under the policy name and buttons, and the activity table not at all until the button is pressed', () => {
    expect(box).toContain('class="apol__focus"')
    expect(box).not.toContain('insp__hero')
    expect(box).not.toContain('aria-label="Find a person in Box sign')
    expect(box).not.toContain('apol__pair')
  })
})
