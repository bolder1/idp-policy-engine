/// <reference types="vite/client" />
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { BrandProvider } from '../../store'
import { BoardBuilder } from '../board/BoardBuilder'
import { TestingSessionProvider } from './session'

/* Policy testing inside a policy's board, as the test panel's tabs carry it
   (Policy testing V4, §2.4-bis), drawn without a browser on the showcase
   tenant through the board itself. The old form panel and its pill tabs are
   gone (§2.5); board-views.test.ts pins what is left of their rules, and
   test-panel-ui.test.tsx the panel's own drawing. This is the join: what the
   board hands the panel — this policy, the version it judges by, the Break-in
   test where it runs. */

/* The policy bar above the board portals its status menu to the document,
   which a server render has none of. */
vi.mock('../board/BoardBar', () => ({ BoardBar: () => null, BoardBarActions: () => null }))

const text = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
const draw = (node: ReactNode) =>
  renderToStaticMarkup(
    <BrandProvider>
      <TestingSessionProvider>{node}</TestingSessionProvider>
    </BrandProvider>,
  )
const tabs = (out: string) => [...out.matchAll(/role="tab"[^>]*>([\s\S]*?)<\/button>/g)].map((m) => text(m[1]))

describe('the test panel on a policy’s board', () => {
  it('opens Saved sign-ins on this policy’s own, and none of another’s', () => {
    const t = text(draw(<BoardBuilder policyId="sc-hrms-office" openTest openPage="saved" />))
    for (const name of ['Kavya Menon in the office', 'Neha Kapoor at home']) expect(t).toContain(name)
    expect(t).not.toContain('Devon Rao on Android 12')
  })

  it('names its tabs without counts, the Break-in test only where it runs', () => {
    const hrms = draw(<BoardBuilder policyId="sc-hrms-office" openTest openPage="saved" />)
    expect(tabs(hrms)).toEqual(['Saved sign-ins', 'People', 'Past sign-ins', 'Break-in test'])
    const global = draw(<BoardBuilder policyId="global-default" openTest openPage="saved" />)
    expect(tabs(global)).toEqual(['Saved sign-ins', 'People', 'Past sign-ins'])
  })

  it('lands a route to the Break-in test on Saved sign-ins where it does not run', () => {
    const out = draw(<BoardBuilder policyId="global-default" openTest openPage="break-in" />)
    expect(out).toContain('role="tabpanel" aria-label="Saved sign-ins"')
    expect(text(out)).not.toContain('Got through')
  })
})

/* The Break-in test's caption names the version as the panel's verdict and
   the outcome node do, so one board never calls the same rules two
   things (spec D §3.6). */
describe('the version the Break-in test names', () => {
  it('is Stored version for a policy that is off, as HRMS opens on the showcase', () => {
    const t = text(draw(<BoardBuilder policyId="sc-hrms-office" openTest openPage="break-in" />))
    expect(t).toContain('HRMS access from corporate offices · Stored version')
    expect(t).toContain('Got through')
  })

  it('is Live for a live policy with nothing changed', () => {
    const t = text(draw(<BoardBuilder policyId="sc-device-compliance" openTest openPage="break-in" />))
    expect(t).toContain('Device compliance for Outlook and Dropbox · Live')
  })
})
