/// <reference types="vite/client" />
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { showcaseTenant } from '../fixtures'
import { BrandProvider } from '../store'
import { BREAK_IN_TIP } from './break-in-model'
import { BreakInView } from './break-in-view'
import breakInCss from './break-in.css?raw'
import breakInViewSrc from './break-in-view.tsx?raw'
import { envOf } from './tenant-resolver'
import { BreakInPage } from './testing/BreakInPage'
import { SavedView } from './testing/SavedView'
import { TestingSessionProvider } from './testing/session'

/* The Break-in test drawn once without a browser, on the showcase tenant: the
   counts and rows it prints, that nothing in it is a grade or a second orange
   button, and that Saved sign-ins offers it. The browser pass checks the
   motion and the layout at 1,120 px. */

const t = showcaseTenant()
const env = envOf(t)
const stored = (id: string) => t.policies.find((p) => p.id === id)!
const html = (node: ReactNode) =>
  renderToStaticMarkup(
    <BrandProvider>
      <TestingSessionProvider>{node}</TestingSessionProvider>
    </BrandProvider>,
  )
const text = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
const noop = () => {}

describe('the Break-in test', () => {
  const out = html(<BreakInView policy={stored('sc-hrms-office')} policies={t.policies} env={env} caption="Live" onOpenInBoard={noop} />)
  const said = text(out)

  it('counts HRMS as four cells that filter, with no grade (A11)', () => {
    expect(out).toContain('role="group" aria-label="Counts"')
    const cells = [...out.matchAll(/aria-label="([^"]+, \d+)"/g)].map((m) => m[1])
    expect(cells).toEqual(['Got through, 0', 'Weaker factor, 0', 'Locked out, 1', 'Extra prompts, 0'])
    expect((out.match(/aria-pressed="false"/g) ?? []).length).toBe(4)
    expect(said).not.toMatch(/\bGrade\b|\bExposure\b/)
    expect(out).not.toContain('bb__gradebig')
  })

  it('lists the lockout, then Held, and says who was skipped', () => {
    expect(said).toContain('Locked out Finance working from home Allow with 2FA Deny Last row')
    expect(said.indexOf('Locked out Finance')).toBeLessThan(said.indexOf('Held'))
    expect(said).toContain('10 skipped: outside Human Resources, Finance')
    expect(out).toContain('aria-label="Finance working from home. Locked out. Expected Allow with 2FA, got Deny."')
  })

  it('says what the counts are in one line, beside the title', () => {
    expect(said).toContain('Break-in test')
    /* The tip's words are drawn on hover, in a portal; the mark is here. */
    expect(out).toContain('aria-label="About the break-in test"')
    expect(BREAK_IN_TIP).toBe('Scripted sign-ins against these rules; not breach likelihood.')
    expect(said).toContain('Live')
  })

  it('draws nothing orange', () => {
    expect(out).not.toContain('bx-btn--brand')
  })

  /* framer pairs rows by layoutId, and every policy runs the same fifteen
     cards: an id without the policy slid each row from its place in the last
     policy's list when the Picker changed it (D.4: a first run only fades). */
  it('pairs a row for its motion within one policy only', () => {
    expect(breakInViewSrc).toContain('layoutId={rowLayoutId(baseId, policy.id, row.id)}')
  })
})

describe('where it lives', () => {
  it('Saved sign-ins offers it as a secondary button at the end of the bar', () => {
    const out = html(<SavedView onTry={noop} onEmpty={noop} />)
    expect(out).toMatch(/tst__barend[\s\S]*?bx-btn--neutral[^>]*>(?:<svg[\s\S]*?<\/svg>)?Break-in test/)
  })

  it('opens on a pushed page with Back to Saved sign-ins and the policy to test', () => {
    const out = html(<BreakInPage onBack={noop} />)
    const said = text(out)
    expect(said.startsWith('Saved sign-ins')).toBe(true)
    expect(out).toContain('Policy to test')
    /* Kavya in the office is decided by HRMS, so the page opens on it. */
    expect(said).toContain('HRMS access from corporate offices')
    expect(said).toContain('Locked out Finance working from home')
  })
})

describe('the stylesheet', () => {
  const rules = [...breakInCss.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]*)\{([^{}]*)\}/g)]

  it('never moves a motion element with CSS: no transform, translate, scale or transition', () => {
    expect(rules.length).toBeGreaterThan(20)
    for (const [, selector, body] of rules) expect(`${selector.trim()}: ${/(transform|translate|scale|transition)\s*:/.test(body)}`).toBe(`${selector.trim()}: false`)
  })

  it('takes every colour from a variable', () => {
    expect(breakInCss.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/)
  })

  it('marks what moved with the accent, never the brand orange', () => {
    expect(breakInCss).toMatch(/\.bbi__cell\.is-pressed \{[^}]*var\(--accent\)/)
    expect(breakInCss).not.toMatch(/--brand|--orange/)
  })
})
