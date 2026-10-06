/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest'

import kitCss from './kit.css?raw'
import rebrandCss from './rebrand.css?raw'
import mainSrc from '../main.tsx?raw'
import authSrc from './screens/AuthMethods.tsx?raw'
import pageBarSrc from './screens/page-bar.tsx?raw'
import indexHtml from '../../index.html?raw'

/* The switch has one look: Blue, chosen by the owner on 5 Oct 2026. */

const lines = kitCss.split('\n')
const rules = (sel: string) => lines.filter((l) => l.includes(sel)).join('\n')
const toggleRules = lines.filter((l) => /^\.bx-toggle/.test(l.trim())).join('\n')

describe('toggle: the single blue family', () => {
  it('has no style switch or attribute anywhere', () => {
    for (const src of [kitCss, rebrandCss, mainSrc, authSrc, pageBarSrc, indexHtml]) {
      expect(src).not.toContain('data-toggle-style')
      expect(src).not.toContain('toggle-style')
    }
    expect(kitCss).not.toContain('[data-toggle-style')
    expect(authSrc).not.toContain('Toggle style')
    expect(authSrc).not.toContain('ToggleStyleSwitch')
  })

  it('off is white with the placeholder edge and a tertiary knob', () => {
    expect(kitCss).toMatch(/background: var\(--surface-raised\);\s*border: 1px solid var\(--text-placeholder\);/)
    expect(kitCss).toMatch(/\.bx-toggle:not\(\.is-on\) \.bx-toggle__knob \{ background: var\(--text-tertiary\); box-shadow: none; \}/)
  })

  it('on is the blue', () => {
    expect(rules('.bx-toggle.is-on {')).toContain('var(--blue')
  })

  it('disabled off is the grey pill, not faded', () => {
    expect(kitCss).toMatch(/\.bx-toggle:disabled:not\(\.is-on\) \{ background: var\(--border-default\); border-color: var\(--border-default\); opacity: 1; \}/)
  })

  it('the rebrand does not restyle the switch', () => {
    expect(rebrandCss).not.toMatch(/\.bx-toggle/)
  })

  it('uses no literal colours', () => {
    expect(toggleRules).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/)
  })
})
