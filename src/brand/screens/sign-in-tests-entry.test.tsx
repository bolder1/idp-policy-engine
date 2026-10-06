/// <reference types="vite/client" />
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { Shell } from '../Shell'
import { BrandProvider } from '../store'
import { Policies } from './Policies'
import { SignInTests } from './SignInTests'
import { TestingSessionProvider } from './testing/session'
import shellSrc from '../Shell.tsx?raw'
import shellCss from '../shell.css?raw'
import policiesSrc from './Policies.tsx?raw'
import pageSrc from './SignInTests.tsx?raw'
import boardBarSrc from './board/BoardBar.tsx?raw'
import boardCss from './board/board.css?raw'

/* The way into Sign-in tests and the way back (V4 §11.4, owner 30 Sep 2026:
   "move Sign-in tests inside the All Policies tab, as a button; on click I go
   inside Sign-in tests"). The rail has no item for it; All Policies' bar has a
   secondary button before New policy, withheld exactly as the route is; and
   the page wears the builder's bar, whose "← Policies" is the way back. */

const text = (s: string) =>
  s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()

/** The buttons in All Policies' bar, right cluster, in order: label and class. */
function barRight(markup: string) {
  const at = markup.indexOf('class="bbar__right"')
  expect(at).toBeGreaterThan(-1)
  const cluster = markup.slice(at, markup.indexOf('</div></div>', at))
  return [...cluster.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)].map((m) => ({ attrs: m[1], inner: m[2], label: text(m[2]) }))
}

describe('Sign-in tests — out of the rail', () => {
  it('has no rail item, so the Policies submenu goes All Policies → Templates', () => {
    expect(shellSrc).not.toContain("label: 'Sign-in tests'")
    const all = shellSrc.indexOf("{ label: 'All Policies', screen: { name: 'policies' } }")
    const templates = shellSrc.indexOf("{ label: 'Templates'")
    expect(all).toBeGreaterThan(-1)
    expect(shellSrc.slice(all, templates)).not.toContain("name: 'sign-in-tests'")
  })

  it('lights All Policies (UNDER_ITEM) and the Policies parent (POLICY_SCREENS) while it is open', () => {
    expect(shellSrc).toContain("policies: [...BUILDER_SCREENS, 'policy-details', 'sign-in-tests', 'sign-in-activity']")
    const at = shellSrc.indexOf('const POLICY_SCREENS = [')
    expect(shellSrc.slice(at, shellSrc.indexOf(']', at))).toContain("'sign-in-tests'")
  })

  it('renders a rail whose Policies submenu has no Sign-in tests row', () => {
    const out = renderToStaticMarkup(
      <BrandProvider>
        <Shell>
          <div />
        </Shell>
      </BrandProvider>,
    )
    const sub = [...out.matchAll(/class="bshell__subitem[^"]*"[^>]*>([\s\S]*?)<\/button>/g)].map((m) => text(m[1]))
    expect(sub[0]).toBe('All Policies')
    expect(sub).not.toContain('Sign-in tests')
    expect(sub).toContain('Templates')
  })
})

describe('Sign-in tests — the button on All Policies', () => {
  const out = renderToStaticMarkup(
    <BrandProvider>
      <Policies />
    </BrandProvider>,
  )

  it('sits in the bar’s right cluster, just before New policy, which stays last', () => {
    const labels = barRight(out).map((b) => b.label)
    expect(labels.slice(-2)).toEqual(['Check access', 'New policy'])
  })

  it('is secondary with a plain sign-in icon, never disabled, and the page keeps one orange button', () => {
    const btn = barRight(out).find((b) => b.label === 'Check access')!
    expect(btn.attrs).toContain('class="bx-btn bx-btn--neutral bx-btn--md')
    expect(btn.attrs).not.toContain('disabled')
    expect(btn.inner).toContain('lucide-log-in')
    expect(btn.inner).not.toMatch(/lucide-(sparkles|wand)/)
    expect(out.match(/bx-btn--brand/g) ?? []).toHaveLength(1)
  })

  it('opens the Sign-in tests page, and is gated exactly as the route is', () => {
    expect(policiesSrc).toContain("screenOffered({ name: 'sign-in-tests' }, store.features) && (")
    expect(policiesSrc).toContain("onClick={() => store.go({ name: 'sign-in-tests' })}")
  })

  it('is not there when the edition has no policy testing', async () => {
    /* The showcase pin turns policy testing on (store.tsx); without it the
       store's edition is Lite, which withholds the page. */
    vi.resetModules()
    vi.doMock('../showcase', () => ({ SHOWCASE: false }))
    try {
      const store = await import('../store')
      const page = await import('./Policies')
      const edition = await import('../edition')
      expect(edition.featuresOf('lite').policyTesting).toBe(false)
      const lite = renderToStaticMarkup(
        <store.BrandProvider>
          <page.Policies />
        </store.BrandProvider>,
      )
      expect(barRight(lite).map((b) => b.label)).toEqual(['New policy'])
      expect(text(lite)).not.toContain('Sign-in tests')
    } finally {
      vi.doUnmock('../showcase')
      vi.resetModules()
    }
  })
})

describe('Sign-in tests — the way back', () => {
  const out = renderToStaticMarkup(
    <BrandProvider>
      <TestingSessionProvider>
        <SignInTests tab="try" />
      </TestingSessionProvider>
    </BrandProvider>,
  )

  /* The page wears the builder's bar (V4 §14.1): its back arrow and
     "Policies" crumb, then the page's name where a policy's stands — the
     builder's markup and classes (BoardBar.tsx `BoardBarPlain`), so the way
     back looks and works exactly as it does from a policy. */
  it('is the builder bar’s “← Policies ›”, before the page’s name', () => {
    const bar = out.slice(out.indexOf('<header class="bbtop">'), out.indexOf('</header>'))
    const crumbs = bar.match(/<nav class="bbtop__crumbs" aria-label="Where this page sits">([\s\S]*?)<\/nav>/)
    expect(crumbs).not.toBeNull()
    const buttons = [...crumbs![1].matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)]
    expect(buttons.map((b) => b[1])).toEqual([' type="button" class="bbtop__back" aria-label="Back to policies"', ' type="button" class="bbtop__crumb"'])
    expect(buttons[0][2]).toContain('lucide-arrow-left')
    expect(text(buttons[1][2])).toBe('Policies')
    expect(crumbs![1].indexOf('bbtop__crumb')).toBeLessThan(crumbs![1].indexOf('<h1 class="bbtop__title"'))
    expect(out).not.toContain('bpage__crumbs')
    expect(out).not.toContain('Checked before any policy is saved or turned on.')
  })

  it('both go to the Policies list', () => {
    expect(boardBarSrc).toMatch(/export function BoardBarPlain[\s\S]*?const back = \(\) => store\.go\(\{ name: 'policies' \}\)[\s\S]*?className="bbtop__back" aria-label="Back to policies" onClick=\{back\}[\s\S]*?className="bbtop__crumb" onClick=\{back\}/)
  })

  it('is drawn by the builder’s own bar rules, in tokens', () => {
    const rule = (sel: string) => {
      const at = boardCss.indexOf(`${sel} {`)
      expect(at, sel).toBeGreaterThan(-1)
      return boardCss.slice(at, boardCss.indexOf('}', at))
    }
    expect(rule('.bbtop')).toContain('height: 48px;')
    expect(rule('.bbtop__back')).toContain('width: 26px; height: 26px;')
    expect(rule('.bbtop__crumb')).toContain('font-family: inherit; font-size: var(--fs-md); color: var(--text-secondary);')
  })

  /* The page head's crumb stays for a page opened from another's bar that
     does not wear the builder's layout — the locked-off tables still use it. */
  it('keeps the page head’s crumb for the tables, drawn like the board bar’s back link', () => {
    expect(pageSrc).toContain("<PageHead title={ACCESS_CHECKS} crumb={{ label: 'Policies', onClick: () => go({ name: 'policies' }) }} />")
    const rule = (sel: string) => {
      const at = shellCss.indexOf(`${sel} {`)
      expect(at, sel).toBeGreaterThan(-1)
      return shellCss.slice(at, shellCss.indexOf('}', at))
    }
    expect(rule('.bpage__crumb-arrow')).toContain('width: 26px; height: 26px;')
    expect(rule('.bpage__crumb')).toContain('font-size: var(--fs-md); color: var(--text-secondary)')
    const cssBlock = shellCss.slice(shellCss.indexOf('.bpage__crumbs {'), shellCss.indexOf('/* --- Narrow'))
    expect(cssBlock).not.toMatch(/#[0-9a-f]{3,8}|rgba?\(/i)
    expect(cssBlock).not.toMatch(/transform|transition|opacity/)
  })
})
