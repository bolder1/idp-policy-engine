/// <reference types="vite/client" />
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { CantTell, DecisionBadge } from '../../decision-badge'
import { showcaseTenantHrmsOn } from '../../fixtures'
import { BrandProvider } from '../../store'
import { NumberStepper } from '../../kit'
import { envOf, resolveSignIn } from '../tenant-resolver'
import { WatchingBadge } from '../watching-line'
import { boundariesOf } from './boundaries'
import { RouteMarker } from './RouteMarker'
import { pageRows, rowsRead } from './rows-read'
import { SaveSignInForm } from './SaveSignInForm'
import { screensOf } from './screens-of'
import { SignInFields } from './SignInFields'
import { SignInScreen } from './SignInScreen'
import { defaultBoardForm, factsOf, originPatch, typedAddressPatch, type SignInForm } from './sign-in-form'
import { WhatTheySee } from './WhatTheySee'
import { WhichPolicy } from './WhichPolicy'
import testingCss from './testing.css?raw'

/* The shared testing components, drawn once each without a browser: that they
   render on the store's own tenant, and that what they print is what the
   helpers they draw from say. The helpers are pinned in their own tests; this
   is the join between the two. Nothing here is mounted on a page yet — the
   board's Try a sign-in and Policy testing do that.

   The scenes read HRMS deciding, so they draw on the tenant once HRMS is
   turned on; the seed opens with it Inactive (Phase 4). */

const t = showcaseTenantHrmsOn()
const env = envOf(t)
const TODAY = '2026-09-28'
const hrms = t.policies.find((p) => p.id === 'sc-hrms-office')!
const form = (patch: Partial<SignInForm> = {}): SignInForm => ({ ...defaultBoardForm(hrms, t.directory.people, t.apps, TODAY), ...patch })
const html = (node: ReactNode) => renderToStaticMarkup(<BrandProvider>{node}</BrandProvider>)
const text = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
const resolve = (f: SignInForm, policies = t.policies) => resolveSignIn(policies, factsOf(f, t.zones).facts, env)

describe("the decision and Can't tell", () => {
  it("prints the three words as badges, and Can't tell as grey text with what it could be", () => {
    expect(text(html(<DecisionBadge decision="2fa" />))).toBe('Allow with 2FA')
    const cant = html(<CantTell outcomes={['1fa', 'deny']} />)
    expect(cant).toContain('bx-canttell')
    expect(cant).not.toContain('bx-badge')
    expect(text(cant)).toBe("Can't tell Allow on 1 factor or Deny")
  })
})

describe('the sign-in rows', () => {
  it('draws the board rows the HRMS rules read, with the ruler at 25 km', () => {
    const f = form()
    const read = rowsRead(t.policies, hrms, f.appId, { zones: t.zones, fingerprints: t.fingerprints })
    const b = boundariesOf(f, read, {}, t.policies, env, t.zones)
    const out = text(html(<SignInFields form={f} onPatch={() => {}} rows={read} issues={[]} boundaries={b} audience={hrms.audience} />))
    for (const label of ['Person', 'Application', 'From', 'IP address', 'Place', 'Distance']) expect(out).toContain(label)
    expect(out).not.toContain('Device risk score')
    expect(out).toContain('From IP address · Pune, India')
    expect(out).toContain('looked up')
    expect(out).toContain('0 km from Pune')
    expect(out).toContain('25 km')
  })

  it('never shows a distance the sign-in does not have', () => {
    const draw = (f: SignInForm) => {
      const read = rowsRead(t.policies, hrms, f.appId, { zones: t.zones, fingerprints: t.fingerprints })
      return html(<SignInFields form={f} onPatch={() => {}} rows={read} issues={[]} boundaries={boundariesOf(f, read, {}, t.policies, env, t.zones)} />)
    }
    /* An anonymiser: no place, so no distance — and no band announced. */
    const tor = draw(form(originPatch('tor')))
    expect(tor).toContain(`aria-valuetext="Can&#x27;t tell"`)
    expect(tor).toContain('tfields__value is-unknown')
    expect(tor).toContain('tfields__range is-unplaced')
    expect(text(tor)).not.toContain('0 km from Pune')
    /* Bengaluru: past the ruler, and in the zone by name. */
    const branch = draw(form(originPatch('branch')))
    expect(text(branch)).toMatch(/7\d\d km from Pune/)
    expect(branch).toMatch(/aria-valuetext="7\d\d km from Pune"/)
  })

  it('shows an unstated device count as Not stated, not 0', () => {
    /* The count's stepper, as the detail row draws it for a device nobody described. */
    const unstated = html(<NumberStepper label="Devices already registered" value={null} placeholder="Not stated" min={0} max={10} width="fill" onChange={() => {}} />)
    expect(unstated).toContain('value=""')
    expect(unstated).toContain('placeholder="Not stated"')
    expect(unstated).toContain('aria-valuetext="Not stated"')
    expect(unstated).not.toContain('aria-valuenow')
    expect(html(<NumberStepper label="Devices already registered" value={0} min={0} max={10} onChange={() => {}} />)).toContain('value="0"')
  })

  it('draws every row on the page, with the address error beside the field', () => {
    const f = form(typedAddressPatch('192.0.2.999'))
    const read = pageRows(rowsRead(t.policies, null, f.appId, { zones: t.zones, fingerprints: t.fingerprints }))
    const out = html(
      <SignInFields form={f} onPatch={() => {}} rows={read} issues={factsOf(f, t.zones).issues} layout="stacked" assumeOptions={[]} idPrefix="page" />,
    )
    expect(out).toContain('id="page-address"')
    expect(text(out)).toContain('Enter an IPv4 or IPv6 address')
    for (const label of ['When', 'Device', 'Device risk score', 'Assume on']) expect(text(out)).toContain(label)
  })
})

describe('Which policy', () => {
  it('lists the policies on HRMS, with the Global Default not struck and the others folded away', () => {
    const out = html(<WhichPolicy resolution={resolve(form())} appId="hrms" onOpen={() => {}} />)
    expect(text(out)).toContain('HRMS access from corporate offices Decides this sign-in')
    expect(text(out)).toContain('Not on HRMS')
    expect(out).not.toContain('is-struck')
  })

  it('draws a monitoring HRMS with its pill and would-badge, never struck', () => {
    const policies = t.policies.map((p) => (p.id === hrms.id ? { ...p, status: 'monitor' as const } : p))
    const res = resolve(form(), policies)
    const out = html(<WhichPolicy compact resolution={res} appId="hrms" />)
    expect(text(out)).toContain('Monitoring')
    expect(text(out)).toContain('Would allow with 2FA')
    expect(out).not.toContain('is-struck')
    expect(text(html(<WatchingBadge watched={res.watching[0]} />))).toBe('Would allow with 2FA')
  })

  it("says Can't tell for a monitor exactly as the Decision stage does", () => {
    const policies = t.policies.map((p) => (p.id === hrms.id ? { ...p, status: 'monitor' as const } : p))
    const [w] = resolve(form(typedAddressPatch('')), policies).watching
    expect(w.decision).toBeNull()
    expect(html(<WatchingBadge watched={w} />)).toContain(html(<CantTell outcomes={['deny', '2fa']} />).replace(/^<div[^>]*>|<\/div>$/g, ''))
    expect(text(html(<WatchingBadge watched={w} />))).toBe("Can't tell Deny or Allow with 2FA")
  })
})

describe('What they see', () => {
  const kavya = t.directory.people.find((u) => u.id === 'u-hr-1')!
  const screens = screensOf(resolve(form()), { policies: t.policies, methods: t.methods, defaultMethodId: undefined, person: kavya })

  it('opens on the second factor, with a switch between the pages and the caption', () => {
    const out = text(html(<WhatTheySee screens={screens} appId="hrms" defaultOpen />))
    expect(out).toContain('Password Google Authenticator')
    expect(out).toContain('Enter the code from Google Authenticator')
    expect(out).toContain('Approximation of the sign-in page')
  })

  it('starts closed on the page', () => {
    expect(text(html(<WhatTheySee screens={screens} appId="hrms" />))).toBe('What they see')
  })

  it('holds the pages back, in their place, while the answer has not landed', () => {
    const held = html(<WhatTheySee screens={screens} appId="hrms" defaultOpen hidden />)
    expect(held).toMatch(/class="tsee__body"[^>]*aria-hidden="true"[^>]*style="opacity:0"/)
    expect(text(held)).toContain('Enter the code from Google Authenticator')
    expect(html(<WhatTheySee screens={screens} appId="hrms" defaultOpen />)).toMatch(/class="tsee__body" style="opacity:1"/)
  })

  it('draws the deny page with the message word for word', () => {
    const out = text(html(<SignInScreen appId="hrms" appName="HRMS" step={{ kind: 'deny', message: 'Only from the office.' }} />))
    expect(out).toBe('Sign in to HRMS Access denied Only from the office. Back to sign in')
  })
})

describe('the route marker and the save form', () => {
  it('draws the marker hidden from assistive tech', () => {
    const dot = html(<RouteMarker variant="dot" unknown />)
    expect(dot).toContain('aria-hidden="true"')
    expect(dot).toContain('tmarker--dot is-unknown')
    expect(html(<RouteMarker variant="bar" stops={[{ top: 0, height: 40 }]} at={0} />)).toContain('tmarker--bar')
  })

  it('never gives the marker a transform or a transition of its own: motion owns both', () => {
    /* Every rule whose selector names the marker, comments stripped. */
    const rules = [...testingCss.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]*)\{([^{}]*)\}/g)].filter((m) => m[1].includes('.tmarker'))
    expect(rules.length).toBeGreaterThan(0)
    for (const [, selector, body] of rules) expect(`${selector.trim()}: ${/(transform|translate|rotate|scale|transition)\s*:/.test(body)}`).toBe(`${selector.trim()}: false`)
  })

  it('starts the save form on the name, the shown decision and Note', () => {
    const out = html(<SaveSignInForm form={form()} shown="2fa" onClose={() => {}} />)
    expect(out).toContain('value="Kavya Menon on HRMS"')
    expect(text(out)).toContain('Allow with 2FA')
    expect(text(out)).toContain('Note')
    expect(out).toContain('bx-btn--brand')
  })

  it('draws no second orange control on the board, and names its save', () => {
    const out = html(<SaveSignInForm form={form()} shown="2fa" emphasis="quiet" onClose={() => {}} />)
    expect(out).not.toContain('bx-btn--brand')
    expect(text(out)).toContain('Save sign-in')
  })
})
