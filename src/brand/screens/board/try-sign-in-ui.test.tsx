/// <reference types="vite/client" />
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { showcaseTenant } from '../../fixtures'
import { BrandProvider, useBrand } from '../../store'
import { useSimEnv } from '../sim-env'
import { envOf } from '../tenant-resolver'
import { TestingSessionProvider } from '../testing/session'
import { defaultBoardForm, factsOf, type SignInForm } from '../testing/sign-in-form'
import { RouteDecision, RouteEvidence, RouteGate } from './RouteGate'
import { SignInPanel } from './SignInPanel'
import { columnsFor, routeOf, runColumns } from './try-sign-in'
import { useTrySignIn } from './use-try-sign-in'
import css from './try-sign-in.css?raw'

/* Try a sign-in's pieces, drawn without a browser: the gates, the evidence and
   the Decision the chain carries, and the panel as the board mounts it — on
   the store's own tenant, through the same hook the board uses. The words are
   pinned in try-sign-in.test.ts; this is the join between them and the page. */

const t = showcaseTenant()
const env = envOf(t)
const TODAY = '2026-09-28'
const hrms = t.policies.find((p) => p.id === 'sc-hrms-office')!
const compliance = t.policies.find((p) => p.id === 'sc-device-compliance')!
const html = (node: ReactNode) => renderToStaticMarkup(<BrandProvider>{node}</BrandProvider>)
const text = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()

function routeFor(policyId: string, patch: Partial<SignInForm> = {}) {
  const p = t.policies.find((x) => x.id === policyId)!
  const form = { ...defaultBoardForm(p, t.directory.people, t.apps, TODAY), ...patch }
  const { facts } = factsOf(form, t.zones)
  const right = runColumns(columnsFor(p, p, form.appId), t.policies, facts, env).at(-1)!
  return routeOf(right, p, facts, env, t.policies)
}

describe('the gates on the chain', () => {
  const route = routeFor(hrms.id)

  it('names a gate by its label, value and word', () => {
    const out = html(<RouteGate label="Who" view={route.who} marked={false} hidden={false} fade={false} />)
    expect(out).toContain('aria-label="Who: Kavya Menon · Human Resources, In audience"')
    expect(text(out)).toBe('Who Kavya Menon · Human Resources In audience')
  })

  it('holds a stage the marker has not reached in its place, hidden from a screen reader', () => {
    const out = html(<RouteGate label="Who" view={route.who} marked={false} hidden fade />)
    expect(out).toContain('aria-label="Who"')
    expect(out).toContain('aria-hidden="true"')
    /* Still there, so the chain does not move under the marker. */
    expect(text(out)).toContain('Kavya Menon')
  })

  it('prints a card’s evidence in the one vocabulary', () => {
    const out = text(html(<RouteEvidence evidence={route.cards[hrms.rules[0].id]} hidden={false} fade={false} />))
    expect(out).toMatch(/^Matched Who Kavya Menon · Human Resources, Finance Passes Network 203\.0\.113\.24 · in 203\.0\.113\.0\/24, 198\.51\.100\.0\/24 Passes Place/)
  })

  it('lands on a badge and the rule that gave it, and says what changed it', () => {
    const out = text(html(<RouteDecision view={route.decision} changed="IP address" hidden={false} fade={false} />))
    expect(out).toBe('Decision Allow with 2FA HRMS access from corporate offices · Rule 1 · In a corporate office Changed by IP address')
  })

  it('says Depends in grey with each outcome and what would settle it, never a pass', () => {
    const android: Partial<SignInForm> = { device: { kind: 'custom', facts: { source: 'stated', platform: 'android', osVersion: '14', formFactor: 'Mobile', screenLock: 'pin', authenticatorVersion: '6.5.0' } } }
    const depends = routeFor(compliance.id, android)
    const out = html(<RouteDecision view={depends.decision} changed={null} hidden={false} fade={false} />)
    expect(text(out)).toBe('Decision Depends Device compliance for Outlook and Dropbox If rule 1 matches Allow on 1 factor If not Deny Needs: Device')
    expect(out).toContain('bb__gate__unknown')
  })
})

/* The panel, through the hook, the way BoardBuilder mounts it. */
function Panel({ policyId }: { policyId: string }) {
  const store = useBrand()
  const env = useSimEnv()
  const saved = store.policyById(policyId)!
  const t = useTrySignIn({ on: true, saved, draft: saved, env })
  return t ? <SignInPanel t={t} draft={saved} headingRef={() => {}} swap={false} onClose={() => {}} onChip={() => {}} /> : null
}

describe('the sign-in panel', () => {
  const out = renderToStaticMarkup(
    <BrandProvider>
      <TestingSessionProvider>
        <Panel policyId={hrms.id} />
      </TestingSessionProvider>
    </BrandProvider>,
  )

  it('heads the column with its name and the run’s own buttons, in order', () => {
    const labels = [...out.matchAll(/aria-label="([^"]+)"/g)].map((m) => m[1])
    const head = ['Save sign-in', 'Replay', 'Back one stage', 'Next stage', 'Close Try a sign-in']
    expect(labels.filter((l) => head.includes(l))).toEqual(head)
    expect(out).toContain('<h2')
    expect(out).toContain('Try a sign-in</h2>')
  })

  /* HRMS opens Inactive on the showcase (Phase 4): the pitch's third beat,
     Today beside the Stored version. */
  it('shows the rows HRMS reads, Today beside the Stored version, and what they see', () => {
    const said = text(out)
    for (const label of ['Person', 'Application', 'From', 'IP address', 'Place', 'Distance']) expect(said).toContain(label)
    expect(said).not.toContain('Device risk score')
    expect(said).not.toContain('Live')
    expect(said).toContain('Today Global Default Policy Baseline access Allow on 1 factor Stored version HRMS access from corporate offices Rule 1 · In a corporate office Allow with 2FA')
    expect(said).toContain('What they see · Stored version')
    expect(said).toContain('Approximation of the sign-in page')
  })

  it('has nothing that would change the default run', () => {
    expect(text(out)).not.toContain('Would change if')
  })
})

describe('the stylesheet', () => {
  it('leaves every transform to motion, and colour to the tokens', () => {
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(rules).not.toMatch(/\btransform\s*:/)
    expect(rules).not.toMatch(/\btransition\s*:/)
    expect(rules).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(rules).not.toMatch(/rgba?\(/)
    /* Can't tell is tertiary, never the muted grey. */
    expect(rules).not.toContain('--text-muted')
  })
})
