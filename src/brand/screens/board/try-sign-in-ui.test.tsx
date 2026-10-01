/// <reference types="vite/client" />
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { showcaseTenant } from '../../fixtures'
import { BrandProvider } from '../../store'
import { envOf } from '../tenant-resolver'
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
   tenant. Since 1 Oct 2026 test mode is Check access (PolicyCheck.tsx,
   pinned in policy-check-ui.test.tsx); what is here is what still holds of
   the model and the keys. The browser pass checks the rest. */

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

/* The board in test mode and a route into it — the test panel in the
   right-hand column (the sentence, the verdict, the tests as tabs), the trace
   on the chain, a route opening a tab — were pinned here until 1 Oct 2026,
   when test mode became Check access: the Sign-in tests page's canvas and
   panel inside the policy, with People and the Break-in test hidden (owner:
   "Now change the try a sign in inside policy builder with the current sign
   in tests we have … Hide people and break-in test as of now"). Those pins
   went with what they described; policy-check-ui.test.tsx pins the new join.
   What is still true of the board's test-mode model stays below. */

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
    /* Check access plays it as it opens (1 Oct): the engine finds the policy for GitHub, not Slack. */
    expect(text(out)).toContain('Finding the policy for GitHub Enterprise')
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
  it('treats Check access’s panels and their popovers as surfaces a rule shortcut never reaches', () => {
    /* `.sit-panel` (the page's panel, and a view in its chrome) since 1 Oct, in the old `.tpanel`'s place. */
    expect(builderSrc).toContain("const TEST_SURFACES = '.bb__insp, .sit-panel, .bx-apop'")
    expect(builderSrc).toContain('t.closest(TEST_SURFACES)')
  })

  it('goes through one housekeeping step for every door in, which leaves the panel as the door says', () => {
    /* Was: focus on the old panel's heading. Check access opens on its canvas alone, as the page does (1 Oct). */
    expect(builderSrc).toMatch(/const enterTest = \(panel: CheckPanel \| null = null\) => \{[\s\S]*?setTesting\(true\)\s+setCheckPanel\(panel\)/)
    expect(builderSrc).toContain('const startTest = () => enterTest()')
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
