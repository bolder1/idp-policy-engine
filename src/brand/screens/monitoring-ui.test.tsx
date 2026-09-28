/// <reference types="vite/client" />
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { Policy } from '../data'
import { showcaseTenant } from '../fixtures'
import { BrandProvider } from '../store'
import { changeOf, monitorRows, monitorSamples, type MonitorRow } from './monitor-sample'
import monitoringCss from './monitoring-page.css?raw'
import { MonitoringPage } from './monitoring-page'
import { envOf, type TenantResolution } from './tenant-resolver'

/* The Monitoring page drawn once without a browser, on the showcase tenant with
   HRMS switched to monitoring (spec C §3.4 and §8, final C.5): what the head,
   the plan line and the table say, that the only orange is Turn on, that the
   footer is buttons only, and that nothing framer animates carries a
   stylesheet transform. The browser pass checks the slider and the motion. */

const t = showcaseTenant()
const env = envOf(t)
const HRMS_ID = 'sc-hrms-office'
const monitoring = t.policies.map((p): Policy => (p.id === HRMS_ID ? { ...p, status: 'monitor' } : p))
const hrms = monitoring.find((p) => p.id === HRMS_ID)!
const MONDAY = new Date(Date.UTC(2026, 8, 28))
const rows = monitorRows(hrms, monitoring, env, monitorSamples(hrms, env, MONDAY))
const noop = () => {}

const html = (node: ReactNode) => renderToStaticMarkup(<BrandProvider>{node}</BrandProvider>)
const text = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
const footOf = (s: string) => /<footer class="bx-drawer__foot">([\s\S]*?)<\/footer>/.exec(s)?.[1] ?? ''
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length

const page = (policy: Policy, r = rows) =>
  html(<MonitoringPage open policy={policy} rows={r} env={env} onClose={noop} onTurnOn={noop} onTurnOff={noop} />)

describe('the Monitoring page', () => {
  const out = page(hrms)
  const said = text(out)

  it('names itself, the policy and that it is a sample, as a 780 px slider', () => {
    expect(out).toContain('aria-label="Monitoring: HRMS access from corporate offices"')
    expect(out).toContain('width:780px')
    expect(said).toMatch(/^Monitoring Sample HRMS access from corporate offices/)
    expect(said).not.toContain('Saved draft not included')
  })

  it('says the sign-ins are modelled, and the plan line exactly (acceptance 5)', () => {
    expect(said).toContain('Modelled sign-ins')
    expect(out).toContain('aria-label="About modelled sign-ins"')
    expect(said).toContain('If turned on: 0 to allow on 1 factor, 3 to allow with 2FA, 5 to deny, 4 unchanged.')
    expect(said).toContain('Modelled sign-ins for HRMS access from corporate offices')
  })

  it('lists twelve rows: the 2FA moves, then the denials, then the unchanged', () => {
    expect(said).toContain('Time Person Application From Today If turned on Details')
    const order = [...said.matchAll(/Would allow with 2FA|Would deny|No change/g)].map((m) => m[0])
    expect(order).toEqual([...Array(3).fill('Would allow with 2FA'), ...Array(5).fill('Would deny'), ...Array(4).fill('No change')])
    expect(count(out, /aria-label="Show why: /g)).toBe(12)
    expect(count(out, /aria-expanded="false"/g)).toBe(12)
  })

  it('says Today as a decision badge over the policy deciding it, on every row', () => {
    expect(count(out, /bx-badge--positive bx-decision-badge/g)).toBe(12)
    expect(count(said, /Allow on 1 factor Global Default Policy/g)).toBe(12)
  })

  it('draws a would-be decision as an info badge, never the decision’s tone', () => {
    expect(count(out, /bx-badge--info bx-would-badge/g)).toBe(8)
    expect(count(out, /bx-badge--negative/g)).toBe(0)
    expect(said).toContain('Would allow with 2FA In a corporate office')
    expect(said).toContain('Would deny Nothing else matched')
    expect(said).toContain('No change Not in audience')
  })

  it('draws a row it can’t tell as grey text in both cells, in the same words, and counts it as the plan line does', () => {
    const home = rows.find((r) => r.sample.address === '192.0.2.10' && r.sample.personName === 'Priya Sharma')!
    const depends: TenantResolution = {
      ...home.today,
      status: 'depends',
      decision: null,
      possible: [
        { decision: '2fa', ruleIndex: 0, ruleName: 'Somewhere else', assumes: [] },
        { decision: 'deny', ruleIndex: null, ruleName: 'Nothing else matched', assumes: [] },
      ],
    }
    const moved: MonitorRow = { ...home, today: depends, change: changeOf(depends, home.ifOn) }
    const out = page(hrms, [moved])
    expect(text(out).replace(/ ([,.])/g, '$1')).toContain("If turned on: 0 to allow on 1 factor, 0 to allow with 2FA, 0 to deny, 0 unchanged, 1 can't tell.")
    expect(count(out, /bx-would-badge/g)).toBe(0)
    expect(text(out)).toContain("Can't tell Deny or Allow with 2FA Global Default Policy Can't tell Would deny")
  })

  it('keeps the footer to Turn off and Turn on, and Turn on the only orange', () => {
    const foot = footOf(out)
    expect(foot).not.toMatch(/<p\b/)
    expect(text(foot)).toBe('Turn off Turn on')
    expect(count(out, /bx-btn--brand/g)).toBe(1)
    expect(foot).toMatch(/bx-btn--brand[^>]*>[\s\S]*Turn on/)
  })

  it('says a saved draft is not what is monitored', () => {
    const withDraft: Policy = { ...hrms, pendingDraft: { rules: [], fallback: hrms.fallback, savedAt: 'now', savedBy: 'Jaspreet Toor' } }
    expect(text(page(withDraft))).toMatch(/^Monitoring Sample Saved draft not included HRMS access/)
  })

  it('says only a title when there is nothing to model', () => {
    const empty = page(hrms, [])
    expect(text(empty)).toContain('No modelled sign-ins')
    expect(empty).not.toContain('bempty__blurb')
    expect(text(empty)).not.toContain('If turned on:')
  })

  it('draws nothing for a policy that is gone', () => {
    expect(html(<MonitoringPage open policy={null} rows={[]} env={env} onClose={noop} onTurnOn={noop} onTurnOff={noop} />)).toBe('')
  })

  it('never says a retired word', () => {
    expect(said).not.toMatch(/gauntlet|blast radius|rehearse|try a login|report only|sample sign-ins/i)
  })

  it('puts no transform on anything framer animates', () => {
    const css = monitoringCss.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(css).not.toMatch(/transform|translate|scale\(/)
  })
})
