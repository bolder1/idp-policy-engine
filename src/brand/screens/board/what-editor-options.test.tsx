import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { rule } from '../../data'
import { BrandProvider } from '../../store'
import { showcaseTenant } from '../../fixtures'
import { AUTH_METHODS, withRuleOptions } from '../../methods'
import { methodStrength, ruleFactor } from '../factor-strength'
import { METHOD_PREFIX, firstFactorPatch } from './first-factor'
import { WhatEditor } from './WhatEditor'

/* -----------------------------------------------------------------------------
   The Then section's own options (owner, 26 Oct 2026): miniOrange Push's two
   toggles and Magic link's two, on the RULE and not on the tenant's Settings tab,
   and Force MFA on each login as its own switch rather than a row inside
   Remember MFA.
   -------------------------------------------------------------------------- */

const noop = () => {}
const draw = (r: ReturnType<typeof rule>) =>
  renderToStaticMarkup(
    <BrandProvider>
      <WhatEditor rule={r} onPatch={noop} />
    </BrandProvider>,
  )

const PUSH_OPTIONS = ['Require biometric to approve', 'Number matching']
const MAGIC_OPTIONS = ['Enable sign-in from other IPs', 'Enable sign-in from other devices']
const has = (html: string, text: string) => html.includes(`>${text}`) || html.includes(`${text}<`)

describe('miniOrange Push options on the rule', () => {
  const push = (over: Partial<Parameters<typeof rule>[0]> = {}) =>
    rule({ name: 'Push', decision: '2fa', secondFactor: 'specific', secondFactorMethods: ['miniOrange Push'], ...over })

  it('show once the rule names miniOrange Push', () => {
    const html = draw(push())
    for (const o of PUSH_OPTIONS) expect(has(html, o), o).toBe(true)
  })

  it('show for a chain that holds it', () => {
    const html = draw(rule({ name: 'Chain', decision: '2fa', secondFactor: 'chain', methodChain: ['FIDO2 / Passkey', 'miniOrange Push'] }))
    for (const o of PUSH_OPTIONS) expect(has(html, o), o).toBe(true)
  })

  /* Owner, 26 Oct 2026, after choosing Push as the FIRST factor and seeing nothing: the options belong under whichever
     picker names Push, and a rule with no second step still has them. */
  it('show under the First factor when Push is the first factor, with no second step', () => {
    const html = draw(rule({ name: 'Tap', decision: '1fa', firstFactor: 'Specific', firstFactorMethod: 'miniOrange Push' }))
    for (const o of PUSH_OPTIONS) expect(has(html, o), o).toBe(true)
  })

  it('draw the pair once when both factors name Push, under the First factor', () => {
    const html = draw(
      rule({ name: 'Both', decision: '2fa', firstFactor: 'Specific', firstFactorMethod: 'miniOrange Push', secondFactor: 'specific', secondFactorMethods: ['miniOrange Push'] }),
    )
    for (const o of PUSH_OPTIONS) expect(html.split(`aria-label="${o}"`).length - 1, o).toBe(1)
    expect(html.indexOf('Number matching')).toBeLessThan(html.indexOf('Second factor'))
  })

  it('stay away while the rule names someone else, or nobody', () => {
    for (const r of [
      rule({ name: 'Key', decision: '2fa', secondFactor: 'specific', secondFactorMethods: ['FIDO2 / Passkey'] }),
      rule({ name: 'Any', decision: '2fa', secondFactor: 'any' }),
      rule({ name: 'Single', decision: '1fa' }),
    ]) {
      const html = draw(r)
      for (const o of PUSH_OPTIONS) expect(has(html, o), `${r.name}: ${o}`).toBe(false)
    }
  })

  it('open both on, as the tenant setting did', () => {
    const html = draw(push())
    expect(html.match(/aria-checked="true"/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
  })
})

describe('what the push options change', () => {
  const push = AUTH_METHODS.find((m) => m.id === 'mo-push')!

  it('leaves a method alone when the rule has no say', () => {
    expect(withRuleOptions(push, {})).toBe(push)
    expect(withRuleOptions(AUTH_METHODS.find((m) => m.id === 'fido2')!, { pushNumberMatching: false })).toBe(AUTH_METHODS.find((m) => m.id === 'fido2'))
  })

  it('reads number matching off the rule, and that decides the rank', () => {
    expect(methodStrength(withRuleOptions(push, { pushNumberMatching: true }))).toBe('standard')
    expect(methodStrength(withRuleOptions(push, { pushNumberMatching: false }))).toBe('weak')
  })

  it('ranks a rule by its own push options', () => {
    const methods = showcaseTenant().methods
    const base = { name: 'Push', decision: '2fa' as const, secondFactor: 'specific' as const, secondFactorMethods: ['miniOrange Push'] }
    expect(ruleFactor(rule(base), methods)).toBe('standard')
    expect(ruleFactor(rule({ ...base, pushNumberMatching: false }), methods)).toBe('weak')
  })
})

describe('Magic link as a first factor', () => {
  const magic = (over: Partial<Parameters<typeof rule>[0]> = {}) =>
    rule({ name: 'Magic', decision: '1fa', firstFactor: 'Specific', firstFactorMethod: 'Magic link', ...over })

  it('shows its two options', () => {
    const html = draw(magic())
    for (const o of MAGIC_OPTIONS) expect(has(html, o), o).toBe(true)
  })

  it('shows none of them for any other first factor', () => {
    for (const r of [rule({ name: 'Pw', decision: '1fa', firstFactor: 'Password' }), rule({ name: 'Any', decision: '1fa', firstFactor: 'Any' })]) {
      const html = draw(r)
      for (const o of MAGIC_OPTIONS) expect(has(html, o), `${r.name}: ${o}`).toBe(false)
    }
  })

  it('starts the two blank whenever the first factor changes', () => {
    expect(firstFactorPatch(`${METHOD_PREFIX}Magic link`)).toMatchObject({ firstFactor: 'Specific', firstFactorMethod: 'Magic link' })
    for (const v of ['Password', 'Any', `${METHOD_PREFIX}SMS / OTP`]) {
      const p = firstFactorPatch(v)
      expect('magicLinkOtherIps' in p && p.magicLinkOtherIps === undefined, v).toBe(true)
      expect('magicLinkOtherDevices' in p && p.magicLinkOtherDevices === undefined, v).toBe(true)
    }
  })
})

describe('Remember MFA and Force MFA', () => {
  const two = (over: Partial<Parameters<typeof rule>[0]> = {}) => rule({ name: 'Two', decision: '2fa', secondFactor: 'any', ...over })

  it('offer Force MFA whether or not a device is remembered', () => {
    for (const rememberMfa of [false, true]) expect(has(draw(two({ rememberMfa })), 'Force MFA on each login'), String(rememberMfa)).toBe(true)
  })

  it('draw Force MFA at the level of Remember MFA, not indented beneath it', () => {
    const html = draw(two({ rememberMfa: true, rememberDays: 30 }))
    const classOf = (label: string) => html.match(new RegExp(`<div class="(bb__prop[^"]*)"><span>${label}</span>`))?.[1]
    expect(classOf('Force MFA on each login')).toBeDefined()
    expect(classOf('Force MFA on each login')).not.toContain('is-indent')
    expect(classOf('Remember MFA')).not.toContain('is-indent')
  })

  it('keep the days field under Remember MFA only', () => {
    const on = draw(two({ rememberMfa: true, rememberDays: 30 }))
    expect(on).toContain('Days to remember')
    expect(draw(two({ rememberMfa: false }))).not.toContain('Days to remember')
  })
})
