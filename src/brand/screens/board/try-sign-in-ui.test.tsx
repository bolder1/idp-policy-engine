/// <reference types="vite/client" />
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { showcaseTenant } from '../../fixtures'
import { BrandProvider } from '../../store'
import { envOf } from '../tenant-resolver'
import { TestingSessionProvider } from '../testing/session'
import { TestingSessionContext, initialSession, type TestingSession } from '../testing/session-state'
import { defaultBoardForm, factsOf, type SignInForm } from '../testing/sign-in-form'
import { DecidesPill } from '../testing/TracePills'
import { BoardBuilder } from './BoardBuilder'
import { WhichGate } from './RouteGate'
import { columnsFor, routeOf, runColumns } from './try-sign-in'
import css from './try-sign-in.css?raw'
import builderSrc from './BoardBuilder.tsx?raw'

/* Try a sign-in on the board (Policy testing V4, §2 and §2.4-bis), drawn
   without a browser: the board itself, in test mode, on the store's own
   tenant — the test panel in the right-hand column (the sentence, the
   verdict, the tests as tabs) and the trace on the chain. The pieces are
   pinned in their own files (sign-in-sentence-ui, trace-pills-ui,
   test-panel-ui); this is the join between them and the board. The browser
   pass checks the rest. */

/* The policy bar above the board portals its status menu to the document,
   which a server render has none of; it is not what these tests are about. */
vi.mock('./BoardBar', () => ({ BoardBar: () => null, BoardBarActions: () => null }))

const t = showcaseTenant()
const env = envOf(t)
const TODAY = '2026-09-28'
const text = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()

function routeFor(policyId: string, patch: Partial<SignInForm> = {}) {
  const p = t.policies.find((x) => x.id === policyId)!
  const form = { ...defaultBoardForm(p, t.directory.people, t.apps, TODAY), ...patch }
  const { facts } = factsOf(form, t.zones)
  const right = runColumns(columnsFor(p, p, form.appId), t.policies, facts, env).at(-1)!
  return routeOf(right, p, facts, env, t.policies)
}

const board = (node: ReactNode) =>
  renderToStaticMarkup(
    <BrandProvider>
      <TestingSessionProvider>{node}</TestingSessionProvider>
    </BrandProvider>,
  )

describe('the board in test mode', () => {
  const out = board(<BoardBuilder policyId="sc-hrms-office" openTest />)
  const at = out.indexOf('<aside class="bb__insp tpanel')
  const panel = out.slice(at, out.indexOf('</aside>', at))

  it('puts the sign-in in one panel in the right-hand column, not over the canvas', () => {
    expect(panel).toMatch(/^<aside class="bb__insp tpanel" aria-labelledby="[^"]+"/)
    expect(panel).toContain('Try a sign-in</h2>')
    expect(panel).toContain('role="group" aria-label="Sign-in" class="tsent is-panel"')
    for (const id of ['bb-try-person', 'bb-try-app', 'bb-try-address']) expect(panel).toContain(`id="${id}"`)
    /* The floating bar and the bottom dock are gone, and so is the old panel's furniture. */
    expect(out).not.toContain('bb__tbar')
    expect(out).not.toContain('tdock')
    expect(out).not.toContain('--bb-tbar-h')
    expect(out).not.toContain('Back one stage')
    expect(out).not.toContain('aria-label="Board test"')
    /* One aside: the panel, with no rule editor beside it. */
    expect(out.match(/<aside/g)).toHaveLength(1)
  })

  it('keeps the ordinary two tracks while testing: the column is never closed', () => {
    expect(out).toMatch(/class="bb is-testing +"/)
    expect(out).not.toContain('is-insp-closed')
    /* The panel's default width, and the grip that moves it in its own range. */
    expect(out).toContain('--bb-insp:460px')
    expect(out).toMatch(/role="separator" aria-orientation="vertical" aria-label="Resize Try a sign-in" aria-valuenow="460" aria-valuemin="420" aria-valuemax="640"/)
  })

  it('keeps the run’s own buttons, in order, in the panel’s header', () => {
    const header = panel.slice(0, panel.indexOf('tpanel__signin'))
    const end = ['Replay', 'Save sign-in', 'Open Sign-in tests', 'Close Try a sign-in']
    expect([...header.matchAll(/aria-label="([^"]+)"/g)].map((m) => m[1]).filter((l) => end.includes(l))).toEqual(end)
  })

  it('puts the verdict and the one why-line under the sentence', () => {
    /* HRMS opens Inactive on the showcase: Today beside the Stored version. */
    expect(panel).toContain('class="tsent-verdict is-panel is-two" role="img" aria-label="Today Allow on 1 factor, Stored version Allow with 2FA"')
    expect(panel).toContain('<span class="tsent-verdict__cap">Stored version</span>')
    expect(panel).toContain('<p class="tpanel__why" title="Rule 1 · In a corporate office">')
    expect(panel.indexOf('tpanel__verdict')).toBeGreaterThan(panel.indexOf('tsent is-panel'))
  })

  it('draws the trace on the chain: who signs in, the check pills and the outcome', () => {
    const said = text(out)
    expect(said).toContain('Kavya Menon')
    expect(said).toContain('In this policy')
    expect(said).toContain('This policy decides')
    expect(out).toContain('class="bb-checks"')
    expect(out).toContain('aria-label="Decision"')
    /* The old gates, evidence rows and Decision card are gone. */
    expect(out).not.toContain('bb__evidence')
    expect(out).not.toContain('is-decision')
    expect(out).not.toMatch(/aria-label="Who:/)
  })

  it('names the tests as line tabs with no counts, under the verdict', () => {
    const tabs = [...panel.matchAll(/role="tab"[^>]*>([\s\S]*?)<\/button>/g)].map((m) => text(m[1]))
    expect(tabs).toEqual(['Saved sign-ins', 'People', 'Past sign-ins', 'Break-in test'])
    expect(panel).toContain('bx-tabs--line tpanel__tabs')
    expect(panel.indexOf('role="tablist"')).toBeGreaterThan(panel.indexOf('tpanel__why'))
  })

  it('keeps the status region outside the panel, so it outlives it', () => {
    expect(out).toContain('<p role="status" class="u-sr-only">')
    expect(panel).not.toContain('<p role="status"')
  })
})

describe('a route into test mode', () => {
  it('opens the panel on the tab it names: People for a person', () => {
    const out = board(<BoardBuilder policyId="sc-hrms-office" openTest openPage="person" />)
    expect(out).toContain('role="tabpanel" aria-label="People"')
  })

  it('opens Saved sign-ins with this policy’s own sign-ins', () => {
    const out = board(<BoardBuilder policyId="sc-dev-tools" openTest openPage="saved" />)
    expect(out).toContain('role="tabpanel" aria-label="Saved sign-ins"')
    expect(out).toContain('Run all')
  })

  it('opens the Break-in test as a tab of its own on a policy it runs on', () => {
    const out = board(<BoardBuilder policyId="sc-hrms-office" openTest openPage="break-in" />)
    expect(out).toContain('role="tabpanel" aria-label="Break-in test"')
    expect(text(out)).toContain('HRMS access from corporate offices · Stored version')
  })

  it('lays the Break-in test out as the panel’s two-line rows, not the table', () => {
    const out = board(<BoardBuilder policyId="sc-hrms-office" openTest openPage="break-in" />)
    const view = out.slice(out.indexOf('class="bbi is-panel"'))
    expect(out).toContain('class="bbi is-panel"')
    /* No column header: each row says what it expected and which rule, under its name. */
    expect(view).not.toContain('bbi__cols')
    expect(view).toContain('class="bbi__line is-panel"')
    expect(text(view)).toMatch(/Expected Allow with 2FA · Last row/)
    /* What it got is a decision badge, as the Saved tab’s Now is. */
    expect(view).toMatch(/class="bbi__got"><span class="bx-badge/)
    /* The tab already says Break-in test: the heading is kept for the section, not shown. */
    expect(view).toMatch(/<h2 id="[^"]+" class="u-sr-only">Break-in test<\/h2>/)
  })

  it('opens on Saved sign-ins for Try a sign-in with nothing remembered', () => {
    const out = board(<BoardBuilder policyId="sc-hrms-office" openTest openPage="try" />)
    expect(out).toContain('role="tabpanel" aria-label="Saved sign-ins"')
  })
})

describe('a sign-in to an application the policy no longer protects', () => {
  /* The session keeps the board's sign-in past the board, and the policy's
     applications can change under it (the start node's pane, or with test
     mode closed). The sentence and the start node follow the policy onto its
     first application, rather than trying Slack on a policy that does not
     cover Slack. */
  const dev = t.policies.find((p) => p.id === 'sc-dev-tools')!
  const stale = { ...defaultBoardForm(dev, t.directory.people, t.apps, TODAY), appId: 'slack' }
  const noop = () => {}
  const session: TestingSession = {
    ...initialSession(stale),
    boardForms: { [dev.id]: stale },
    patch: noop,
    patchBoard: noop,
    loadBoard: noop,
    load: noop,
    replay: noop,
    setView: noop,
    openBreakIn: noop,
    closeBreakIn: noop,
  }
  const out = renderToStaticMarkup(
    <BrandProvider>
      <TestingSessionContext.Provider value={session}>
        <BoardBuilder policyId={dev.id} openTest />
      </TestingSessionContext.Provider>
    </BrandProvider>,
  )

  it('tries it on the policy’s first application instead', () => {
    expect(dev.appIds).not.toContain('slack')
    expect(out).toContain('aria-label="Arun Patel signs in to GitHub Enterprise. Edit applications"')
    expect(text(out)).not.toContain('Slack')
  })
})

describe('Which policy, when another policy decides', () => {
  const outside = t.directory.people.find((p) => {
    const a = t.policies.find((x) => x.id === 'sc-hrms-office')!.audience
    return !a.groupIds.includes(p.groupId) && !a.userIds.includes(p.id)
  })!
  const route = routeFor('sc-hrms-office', { personId: outside.id })

  it('names the policy that decides and why this one does not, behind the list’s disclosure', () => {
    const out = renderToStaticMarkup(
      <BrandProvider>
        <WhichGate
          view={route.policy}
          appName="HRMS"
          marked={false}
          hidden={false}
          fade={false}
          onToggle={() => {}}
          content={<DecidesPill decides={false} policyName={route.policy.value} reason="Not in this policy" />}
        >
          <span>list</span>
        </WhichGate>
      </BrandProvider>,
    )
    expect(route.policy.decides).toBe(false)
    expect(text(out)).toContain(`Decided by ${route.policy.value} , Not in this policy`)
    /* The row is named by what it shows — who decided and why — and then what it opens. */
    expect(out).not.toContain('aria-label="Which policy: every policy on HRMS"')
    expect(out).toMatch(/class="bb__gate__row is-button has-content" aria-expanded="true" aria-controls="[^"]+">/)
    expect(text(out)).toContain('. Every policy on HRMS')
    expect(out).toContain('has-content')
  })
})

describe('the board’s keys in test mode', () => {
  it('treats the test panel and the sentence’s popovers as surfaces a rule shortcut never reaches', () => {
    expect(builderSrc).toContain("const TEST_SURFACES = '.bb__insp, .tpanel, .bx-apop'")
    expect(builderSrc).toContain('t.closest(TEST_SURFACES)')
  })

  it('puts focus on the panel’s heading when test mode opens and when the rule editor hands back', () => {
    /* Every door into test mode goes through one housekeeping step, which ends on the heading. */
    expect(builderSrc).toMatch(/const enterTest = \(force = false\) => \{[\s\S]*?focusSoon\(\(\) => testHeading\.current, force\)/)
    expect(builderSrc).toContain('const startTest = () => enterTest()')
    expect(builderSrc).toMatch(/if \(!testOn\) enterTest\(true\)/)
    expect(builderSrc).toMatch(/const backToTest = \(\) => \{[\s\S]*?focusSoon\(\(\) => testHeading\.current\)/)
  })

  it('lets T close test mode from the panel it opened, and never hides the column there', () => {
    /* T is tested before the rule bindings stand down in the panel. */
    expect(builderSrc.indexOf("e.key.toLowerCase() === 't'")).toBeLessThan(builderSrc.indexOf("if (owned && e.key !== 'Escape') return"))
    expect(builderSrc).toMatch(/e\.preventDefault\(\)\s*\/\*[\s\S]*?\*\/\s*if \(testOn\) return\s*if \(at >= 0/)
    expect(builderSrc).toContain("...(hasSubject && !testOn ? ([{ id: 'panel'")
  })
})

describe('the stylesheet', () => {
  it('leaves every transform to motion, and colour to the tokens', () => {
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(rules).not.toMatch(/\btransform\s*:/)
    expect(rules).not.toMatch(/\btransition\s*:/)
    expect(rules).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(rules).not.toMatch(/rgba?\(/)
    /* Can't tell is tertiary, never the muted grey. */
    expect(rules).not.toContain('--text-muted')
  })

  it('keeps the board’s own two tracks while testing, with no row or bar offset of its own', () => {
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(rules).not.toMatch(/\.bb\.is-testing\s*\{[^}]*grid-template-(columns|rows)/)
    expect(rules).not.toContain('tdock')
    expect(rules).not.toContain('tbar')
  })
})
