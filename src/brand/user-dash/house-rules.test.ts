import { describe, expect, it } from 'vitest'

import css from './user-dash.css?raw'

/* House rules over the proposed User Dashboard (plan Task 9; CLAUDE.md design and copy rules). */

const sources = import.meta.glob('./*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const screens = Object.entries(sources).filter(([path]) => !path.endsWith('.test.tsx'))
/* Visible words only: strip comments, then keep string literals and JSX text. */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('user-dash copy', () => {
  it('has screens to check', () => {
    expect(screens.length).toBeGreaterThan(8)
  })

  for (const [path, src] of screens) {
    it(`${path} uses plain end-user words`, () => {
      const code = strip(src)
      for (const banned of [/\bthe user\b/,/\btenant\b/i, /\bSAML\b/, /\bOIDC\b/, /\blog ?in\b/i, /\bAI\b/, /\bassistant\b/i]) {
        expect(code, `${path}: ${banned}`).not.toMatch(banned)
      }
    })
  }
})

describe('user-dash styles', () => {
  const rules = strip(css)
  const selectors = [...rules.matchAll(/(^|})\s*([^{}@]+)\{/g)].map((m) => m[2].trim()).filter((s) => !/^(from|to|\d)/.test(s))

  it('every selector is scoped to the feature', () => {
    for (const sel of selectors) {
      for (const part of sel.split(',')) expect(part.trim(), part).toMatch(/^\.(bud|bshell__icon\.bud-)/)
    }
  })

  it('tokens only: no raw colours', () => {
    expect(rules).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(rules).not.toMatch(/\brgba?\(/i)
  })

  it('nothing under the 12px floor', () => {
    expect(rules).not.toContain('--fs-xs')
    for (const m of rules.matchAll(/font-size:\s*(\d+)px/g)) expect(Number(m[1])).toBeGreaterThanOrEqual(12)
  })
})
