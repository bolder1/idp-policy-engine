/// <reference types="vite/client" />
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import kitCss from './kit.css?raw'
import mainSrc from '../main.tsx?raw'
import authSrc from './screens/AuthMethods.tsx?raw'
import { ToggleStyleSwitch } from './screens/page-bar'
import {
  DEFAULT_TOGGLE_STYLE,
  TOGGLE_STYLE_KEY,
  TOGGLE_STYLES,
  chooseToggleStyle,
  parseToggleStyle,
  readToggleStyle,
} from './toggle-style'

/* The toggle style switch: a pending decision (owner, 1 Oct 2026: "give a few
   options: one is the blue one, the green one, one grayscale, and you can find
   some more better options; we will select and then choose one"). These pin the
   six options, that each one is really drawn, and that nothing changes until
   one is chosen. They go with the switch once the owner picks. */

const IDS = ['blue', 'green', 'grayscale', 'navy', 'outlined', 'glyph']

/** Every rule in kit.css keyed on one style, one rule per line. */
const rulesFor = (id: string) =>
  kitCss
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith(`html[data-toggle-style='${id}']`))

afterEach(() => {
  vi.unstubAllGlobals()
  chooseToggleStyle(DEFAULT_TOGGLE_STYLE)
})

describe('the toggle style', () => {
  it('offers exactly the six styles, today’s blue first', () => {
    expect(TOGGLE_STYLES.map((s) => s.value)).toEqual(IDS)
    expect(DEFAULT_TOGGLE_STYLE).toBe('blue')
    // Sentence case, one word each.
    for (const s of TOGGLE_STYLES) expect(s.label).toMatch(/^[A-Z][a-z]+$/)
  })

  it('draws every style with its own block on the document root in kit.css, from tokens only', () => {
    for (const id of IDS) {
      const rules = rulesFor(id)
      expect(rules.length, id).toBeGreaterThan(0)
      for (const r of rules) {
        expect(r, `${id}: a literal colour`).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i)
        expect(r, `${id}: never the rebrand's blue-or-slate accent`).not.toMatch(/var\(--accent\b/)
        expect(r, `${id}: never the brand fill, orange in the rebrand`).not.toMatch(/--int-brand-bg|var\(--brand\b/)
      }
    }
    // The icons go on ::before: ::after is the switch's touch hit area.
    expect(rulesFor('glyph').some((r) => r.includes('::before'))).toBe(true)
    expect(rulesFor('glyph').some((r) => r.includes('::after'))).toBe(false)
  })

  it('gives the four colours an off state that passes 3:1: a grey edge and a darker grey knob', () => {
    // Today's off was a 1.3:1 grey pill with a white knob at 1.3:1 against it.
    const shared = kitCss
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('html:is([data-toggle-style='))
    expect(shared.length).toBeGreaterThan(0)
    for (const r of shared) {
      for (const id of ['blue', 'green', 'grayscale', 'navy']) expect(r, id).toContain(`[data-toggle-style='${id}']`)
      // Outlined and Icons draw their own off state.
      expect(r).not.toMatch(/'outlined'|'glyph'/)
      expect(r, 'a literal colour').not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i)
    }
    const off = shared.find((r) => /\.bx-toggle:not\(\.is-on\) \{/.test(r))
    expect(off).toContain('border-color: var(--text-placeholder)')
    const knob = shared.find((r) => /\.bx-toggle:not\(\.is-on\) \.bx-toggle__knob \{/.test(r))
    expect(knob).toContain('background: var(--text-tertiary)')
  })

  it('stays blue, today’s look, until one is chosen', () => {
    for (const value of [null, undefined, '', 'Green', 'orange', 'true', 1]) {
      expect(parseToggleStyle(value), String(value)).toBe('blue')
    }
    for (const id of IDS) expect(parseToggleStyle(id)).toBe(id)
    // No storage to read (tests, a private window): blue.
    expect(readToggleStyle()).toBe('blue')
  })

  it('offers the six on the switch, with blue chosen before anyone picks', () => {
    const html = renderToStaticMarkup(<ToggleStyleSwitch />)
    expect(html).toContain('Toggle style')
    expect(html).toContain('aria-label="Toggle style"')
    for (const s of TOGGLE_STYLES) expect(html).toContain(`>${s.label}</button>`)
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1)
    expect(html).toMatch(/aria-pressed="true"[^>]*>Blue</)
  })

  it('puts the chosen style on <html> and remembers it', () => {
    const attrs: Record<string, string> = {}
    const stored: Record<string, string> = {}
    vi.stubGlobal('document', { documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v) } })
    vi.stubGlobal('window', { localStorage: { setItem: (k: string, v: string) => (stored[k] = v), getItem: (k: string) => stored[k] ?? null } })
    chooseToggleStyle('outlined')
    expect(attrs['data-toggle-style']).toBe('outlined')
    expect(stored[TOGGLE_STYLE_KEY]).toBe('outlined')
    expect(readToggleStyle()).toBe('outlined')
  })

  it('still chooses where storage is blocked', () => {
    vi.stubGlobal('window', {
      localStorage: {
        setItem: () => {
          throw new Error('blocked')
        },
      },
    })
    expect(() => chooseToggleStyle('green')).not.toThrow()
  })

  it('is shown in the showcase build on Authentication methods, to the admin only, and applied at start on every page', () => {
    // The switch is not behind the showcase flag; the width switch beside it is.
    expect(authSrc).toContain('<ToggleStyleSwitch />')
    // Admin only: a person's Two-step verification page has no switches.
    expect(authSrc).toContain('{!isUser && <ToggleStyleSwitch />}')
    expect(authSrc).not.toMatch(/!SHOWCASE && \(\s*<div className="bpage__preview">/)
    expect(mainSrc).toContain('markToggleStyle(readToggleStyle())')
  })
})
