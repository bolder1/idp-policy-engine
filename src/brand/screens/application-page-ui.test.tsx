import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'

import { BrandProvider } from '../store'
import { apps } from '../data'
import { AddExistingPolicy } from './AddExistingPolicy'
import { ApplicationPage } from './ApplicationPage'
import { TestingSessionProvider } from './testing/session'

/* -----------------------------------------------------------------------------
   An application's page and its Add existing policy drawer, drawn once as
   static markup on the showcase tenant: the head, the tabs, the Policies list
   in the engine's order, Basic's fields, and the drawer's form. Where each
   policy stands is pinned in app-standing.test.ts; nothing here presses
   anything.
   -------------------------------------------------------------------------- */

const render = (node: ReactNode) =>
  renderToStaticMarkup(
    <BrandProvider>
      <TestingSessionProvider>{node}</TestingSessionProvider>
    </BrandProvider>,
  )
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
const count = (html: string, needle: string) => html.split(needle).length - 1

describe('an application page', () => {
  const out = render(<ApplicationPage appId="slack" />)

  it('heads it as a detail page: the way back, the name with its pencil, the type, Documentation', () => {
    const t = text(out)
    expect(t).toContain('All applications')
    expect(out).toMatch(/<h1[^>]*>Slack<\/h1>/)
    expect(out).toContain('aria-label="Rename"')
    expect(t).toContain('Desktop')
    expect(t).toContain('Documentation')
  })

  it('has four tabs with no counts, and opens on Policies', () => {
    const tabs = [...out.matchAll(/role="tab"[^>]*>(.*?)<\/button>/g)].map((m) => text(m[1]).trim())
    expect(tabs).toEqual(['Basic', 'Policies', 'Users', 'Groups'])
    expect(out).toMatch(/aria-selected="true"[^>]*>(?:(?!<\/button>).)*Policies/)
    expect(out).toContain('aria-label="Policies"')
  })

  it('numbers the policies the way the engine ranks them, the tenant default under them', () => {
    const t = text(out)
    const eng = t.indexOf('Slack for engineering and contractors')
    const all = t.indexOf('Slack for everyone')
    expect(eng).toBeGreaterThan(-1)
    expect(all).toBeGreaterThan(eng)
    expect(t).toContain('Global Default Policy')
    expect(t.indexOf('Global Default Policy')).toBeGreaterThan(all)
  })

  it('has one orange button, New policy, and no explaining sentence over the list', () => {
    expect(count(out, 'bx-btn--brand')).toBe(1)
    expect(text(out)).toContain('New policy')
    expect(text(out)).not.toContain('Checked top to bottom')
  })
})

describe('an application page on Basic', () => {
  it('asks an OIDC application for its description and shows its secret masked', () => {
    const out = render(<ApplicationPage appId="github" tab="basic" />)
    const t = text(out)
    expect(t).toContain('Description')
    expect(t).toContain('App secret')
    expect(out).toContain('type="password"')
    expect(out).toContain('aria-label="Show app secret"')
    expect(out).toContain('aria-label="Copy secret"')
    expect(t).toContain('Regenerate')
    expect(t).toContain('Basic details')
  })

  it('does not ask a SAML application for a secret it does not have', () => {
    const out = render(<ApplicationPage appId="slack" tab="basic" />)
    expect(text(out)).toContain('Description')
    expect(text(out)).not.toContain('App secret')
  })
})

describe('an application that is not there', () => {
  it('says so, with the way back and no head', () => {
    const out = render(<ApplicationPage appId="no-such-app" />)
    expect(text(out)).toContain('Application not found')
    expect(text(out)).toContain('Back to applications')
    expect(out).not.toContain('<h1')
  })
})

describe('Add existing policy', () => {
  const slack = apps.find((a) => a.id === 'slack')!
  const out = render(<AddExistingPolicy open app={slack} onClose={() => {}} onAdd={() => true} onCopy={() => true} />)

  it('is a form: the picker, nothing picked, and Add waiting for a pick', () => {
    const t = text(out)
    expect(t).toContain('Add existing policy')
    expect(t).toContain('Choose a policy')
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*>Add to Slack<\/button>/)
    expect(t).not.toContain('Add a copy')
    expect(out).not.toContain('bapr__stack')
  })
})
