/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest'

import rebrand from './rebrand.css?raw'
import dark from './dark-theme.css?raw'
import { ROLLOUT } from './rollout'

/* The console in dark (26 Nov 2026, dark-theme.css).

   Dark was broken for one reason: rebrand.css restates the console's tokens with light values at the same weight as
   tokens.css's dark block, and loads later, so every token it named stayed light in dark. dark-theme.css answers each
   one. The first test keeps it that way: a colour token added to the rebrand later, with no dark answer, would put a
   light patch back on the night page, and nothing else would notice until someone switched the theme.

   The second keeps the sheet Design only. Stylesheets load for every line (main.tsx), and only Design can be dark
   (theme-mode.ts), so a rule here is safe exactly when it is scoped to the dark theme. */

const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

/** The custom properties declared in the first block whose selector list includes `selector`. */
function tokensOf(css: string, selector: RegExp): Set<string> {
  for (const m of strip(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (selector.test(m[1])) return new Set([...m[2].matchAll(/(--[\w-]+)\s*:/g)].map((x) => x[1]))
  }
  return new Set()
}

/* Sizes, weights, radii and spacing: the rebrand restates these too, and they do not change with the theme. */
const NOT_COLOUR = /^--(fs-|pill-|radius-|ctl-radius|ctl-height-|table-(head-fs|head-fw|header-h|row-h|cell-x))/

describe('the console in dark', () => {
  const rebrandTokens = [...tokensOf(rebrand, /^\s*:root\[data-brand='rebrand'\]\s*$/)].filter((t) => !NOT_COLOUR.test(t))
  const darkTokens = tokensOf(dark, /:root\[data-theme='dark'\]\[data-brand='rebrand'\]/)

  it('finds the two token blocks', () => {
    // A selector that matched nothing would make the next test vacuous.
    expect(rebrandTokens.length).toBeGreaterThan(60)
    expect(darkTokens.size).toBeGreaterThan(60)
  })

  it('answers every colour token the rebrand restates', () => {
    expect(rebrandTokens.filter((t) => !darkTokens.has(t))).toEqual([])
  })

  it('scopes every rule to the dark theme', () => {
    const unscoped = [...strip(dark).matchAll(/([^{}]+)\{[^{}]*\}/g)]
      .flatMap((m) => m[1].split(','))
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith(":root[data-theme='dark']"))
    expect(unscoped).toEqual([])
  })

  it('ships to Design only', () => {
    expect(ROLLOUT.darkSweep).toEqual(['design'])
  })
})
