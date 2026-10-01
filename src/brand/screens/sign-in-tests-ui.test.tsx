/// <reference types="vite/client" />
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { BrandProvider } from '../store'
import { SignInTests, type SignInTestsTab } from './SignInTests'
import { TestingSessionProvider } from './testing/session'
import shellSrc from '../Shell.tsx?raw'
import mainSrc from '../../main.tsx?raw'
import pageSrc from './SignInTests.tsx?raw'
import pageCss from './sign-in-tests/sign-in-tests.css?raw'

/* The tenant's Sign-in tests page (Policy testing V4, §3): the head, the four
   line tabs, and each tab's body mounted in the page's one tab panel. The
   bodies are pinned in their own tests (journey-ui, library-ui); this is the
   frame and the wires between them. */

const page = (tab: SignInTestsTab) =>
  renderToStaticMarkup(
    <BrandProvider>
      <TestingSessionProvider>
        <SignInTests tab={tab} />
      </TestingSessionProvider>
    </BrandProvider>,
  )
const text = (s: string) =>
  s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()

describe('Sign-in tests — the page', () => {
  const out = page('try')

  it('heads the page with its name and caption, in sentence case', () => {
    expect(out).toContain('<h1>Sign-in tests</h1>')
    expect(out).toContain('Checked before any policy is saved or turned on.')
  })

  it('has four line tabs, in order, with no counts', () => {
    const list = out.slice(out.indexOf('role="tablist"'), out.indexOf('role="tabpanel"'))
    expect(out).toContain('class="bx-tabs bx-tabs--line sit__tabs"')
    const labels = [...list.matchAll(/role="tab"[^>]*>([\s\S]*?)<\/button>/g)].map((m) => text(m[1]))
    expect(labels).toEqual(['Try a sign-in', 'Saved sign-ins', 'People', 'Runs'])
    labels.forEach((l) => expect(l).not.toMatch(/\d/))
  })

  it('opens on the tab the route names, and holds its body in one labelled tab panel under the tabs', () => {
    expect(out).toContain('data-tab="try"')
    expect(out).toMatch(/role="tabpanel" aria-label="Try a sign-in"/)
    const panel = out.match(/<div id="([^"]+)" role="tabpanel"/)
    expect(panel).not.toBeNull()
    expect(out).toContain(`aria-controls="${panel![1]}"`)
  })

  it('sits in the rail right after All Policies, and lights Policies', () => {
    const all = shellSrc.indexOf("{ label: 'All Policies', screen: { name: 'policies' } }")
    const tests = shellSrc.indexOf("{ label: 'Sign-in tests', screen: { name: 'sign-in-tests' } }")
    const templates = shellSrc.indexOf("{ label: 'Templates'")
    expect(all).toBeGreaterThan(-1)
    expect(tests).toBeGreaterThan(all)
    expect(tests).toBeLessThan(templates)
    const screens = shellSrc.slice(shellSrc.indexOf('const POLICY_SCREENS = ['), shellSrc.indexOf(']', shellSrc.indexOf('const POLICY_SCREENS = [')))
    expect(screens).toContain("'sign-in-tests'")
  })
})

describe('Sign-in tests — each tab’s body', () => {
  it('Try a sign-in: the sentence and the journey canvas', () => {
    const out = page('try')
    expect(out).toContain('id="sit-try-person"')
    expect(out).toContain('aria-label="Sign-in journey"')
    expect(out).toContain('aria-label="Replay"')
  })

  it('Saved sign-ins: the library table, with New sign-in the page’s one orange button', () => {
    const out = page('saved')
    expect(out).toContain('data-tab="saved"')
    expect(out).toContain('class="sitl')
    expect(text(out)).toContain('New sign-in')
    expect(text(out)).toContain('Run all')
    expect(out.match(/bx-btn--brand/g) ?? []).toHaveLength(1)
  })

  it('People: the directory against every application', () => {
    const out = page('people')
    expect(out).toContain('sitl-people')
    expect(out).toContain('sitl-sticky')
  })

  it('Runs: the run list and the chosen run', () => {
    const out = page('runs')
    expect(out).toContain('sitl-runs')
    expect(out).toContain('sitl-runlist')
    expect(out).toContain('sitl-rundetail')
  })

  it('no orange button on Try, People or Runs', () => {
    for (const t of ['try', 'people', 'runs'] as const) expect(page(t)).not.toContain('bx-btn--brand')
  })
})

describe('Sign-in tests — the wires', () => {
  it('every road into Try is a run: load, never patch', () => {
    expect(pageSrc).toContain('session.load(form)')
    expect(pageSrc).toContain('session.load(defaultForm(')
    expect(pageSrc).not.toContain('session.patch(')
  })

  it('New sign-in opens Try with Save sign-in open; nothing else does', () => {
    expect(pageSrc).toContain("show('try', { save: true })")
    expect(pageSrc).toContain('<TryJourney openSave={askSave} />')
  })

  it('a tab switch writes the route without a revisit', () => {
    expect(pageSrc).toContain("go({ name: 'sign-in-tests', tab: t })")
  })

  it('the page’s sheets load eagerly, before the console theme', () => {
    const theme = mainSrc.indexOf("import './brand/console-theme.css'")
    for (const s of ['journey.css', 'library.css', 'sign-in-tests.css']) {
      const at = mainSrc.indexOf(`import './brand/screens/sign-in-tests/${s}'`)
      expect(at, s).toBeGreaterThan(-1)
      expect(at, s).toBeLessThan(theme)
    }
  })

  it('the page’s sheet is tokens only', () => {
    expect(pageCss).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(pageCss).not.toMatch(/rgba?\(/)
    expect(pageCss).not.toMatch(/transform|transition/)
    expect(pageCss).not.toMatch(/dashed|dotted/)
  })

  it('house words', () => {
    const words = text(page('try') + page('saved') + page('people') + page('runs'))
    expect(words).not.toMatch(/\b(AI|assistant|log ?in|gauntlet|blast radius|rehearse)\b/i)
    expect(pageSrc).not.toMatch(/Sparkles|Wand/)
  })
})
