import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { rule } from '../../data'
import { BrandProvider } from '../../store'
import { showcaseTenant } from '../../fixtures'
import { AUTH_METHODS, withRuleOptions } from '../../methods'
import { methodStrength, ruleFactor } from '../factor-strength'
import { METHOD_PREFIX, firstFactorPatch } from './first-factor'
import { WhatEditor } from './WhatEditor'
import kitCss from '../../kit.css?raw'

/* -----------------------------------------------------------------------------
   The Then section's own options (owner, 26 Oct 2026): miniOrange Push's two
   toggles and Magic link's two, on the RULE and not on the tenant's Settings tab,
   and Force MFA on each login as its own switch rather than a row inside
   Remember MFA.
   -------------------------------------------------------------------------- */

const noop = () => {}
const count = (html: string, needle: string) => html.split(needle).length - 1
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
    for (const o of PUSH_OPTIONS) expect(html.split(`bx-checkrow__label">${o}<`).length - 1, o).toBe(1)
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

/* Every option in the rule panel's Then section is a check with its sentence under it, as the device profile's enrolment
   rows are (owner, 27 Oct 2026: "add check and subheading as well, did for device profile, same for all the other
   options inside policy builder"): the tick, a bold label, one line. Not a switch with an info dot. */
describe('the options as checks with a sentence', () => {
  const everything = rule({
    name: 'Everything',
    decision: '2fa',
    firstFactor: 'Specific',
    firstFactorMethod: 'Magic link',
    secondFactor: 'specific',
    secondFactorMethods: ['miniOrange Push'],
    rememberMfa: true,
    rememberDays: 30,
  })
  const html = draw(everything)
  const ALL = [...PUSH_OPTIONS, ...MAGIC_OPTIONS, 'Remember MFA', 'Force MFA on each login', 'Allow end users to disable 2FA']

  it('draws all seven as checkboxes, none as a switch', () => {
    for (const o of ALL) expect(html, o).toContain(`bx-checkrow__label">${o}<`)
    expect(count(html, 'role="checkbox"')).toBe(ALL.length)
    expect(html).not.toContain('role="switch"')
  })

  it('says what each one does, in a line under its label, and keeps no info dot for it', () => {
    expect(count(html, 'class="bx-checkrow__hint"')).toBe(ALL.length)
    expect(html).toContain('The tap has to be confirmed with a fingerprint or face.')
    expect(html).toContain('The user picks the number shown, so no push is approved by reflex.')
    expect(html).toContain('When enabled, users can open the magic link from a different IP address than where it was requested.')
    expect(html).toContain('Ask for the second factor at every sign-in, even on a device that is remembered.')
    expect(html).not.toContain('bx-tipdot')
  })

  it('names each check by its label and describes it by its sentence, so the sentence is not part of the name', () => {
    const one = html.match(/<button[^>]*role="checkbox"[^>]*>/)?.[0] ?? ''
    expect(one).toMatch(/aria-labelledby="([^"]+)-label"/)
    expect(one).toMatch(/aria-describedby="([^"]+)-hint"/)
    expect(one.match(/aria-labelledby="([^"]+)-label"/)?.[1]).toBe(one.match(/aria-describedby="([^"]+)-hint"/)?.[1])
  })

  it('is lit when on, and the tick keeps its own column so the labels line up', () => {
    expect(html).toMatch(/class="bx-checkrow is-on"/)
    expect(kitCss).toMatch(/\.bx-checkrow\s*\{[^}]*grid-template-columns:\s*auto minmax\(0, 1fr\)/)
    expect(kitCss).toMatch(/\.bx-checkrow__hint\s*\{\s*grid-column:\s*1 \/ -1/)
  })
})

describe('Remember MFA and Force MFA', () => {
  const two = (over: Partial<Parameters<typeof rule>[0]> = {}) => rule({ name: 'Two', decision: '2fa', secondFactor: 'any', ...over })

  it('offer Force MFA whether or not a device is remembered', () => {
    for (const rememberMfa of [false, true]) expect(has(draw(two({ rememberMfa })), 'Force MFA on each login'), String(rememberMfa)).toBe(true)
  })

  it('draw Force MFA at the level of Remember MFA, not indented beneath it', () => {
    const html = draw(two({ rememberMfa: true, rememberDays: 30 }))
    /* Both are checks in the same column. The one indented row is the days field, and it holds nothing else. */
    expect(html).toContain('bx-checkrow__label">Remember MFA<')
    expect(html).toContain('bx-checkrow__label">Force MFA on each login<')
    const indented = html.match(/<div class="bb__prop[^"]*is-indent[^"]*">[\s\S]*?<\/span><\/div>/)?.[0] ?? ''
    expect(indented).toContain('Days to remember')
    expect(indented).not.toContain('Force MFA')
    expect(html.indexOf('Remember MFA')).toBeLessThan(html.indexOf('Days to remember'))
    expect(html.indexOf('Days to remember')).toBeLessThan(html.indexOf('Force MFA on each login'))
  })

  it('keep the days field under Remember MFA only', () => {
    const on = draw(two({ rememberMfa: true, rememberDays: 30 }))
    expect(on).toContain('Days to remember')
    expect(draw(two({ rememberMfa: false }))).not.toContain('Days to remember')
  })
})
