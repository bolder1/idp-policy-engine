/// <reference types="vite/client" />
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { BrandProvider } from '../../store'
import { BoardBuilder } from '../board/BoardBuilder'
import { TestingSessionProvider } from './session'

/* Policy testing inside a policy's board. Until 1 Oct 2026 it was the test
   panel's tabs (Policy testing V4, §2.4-bis) — Saved sign-ins, People, Past
   sign-ins, the Break-in test — and these pinned what the board handed them.
   Since then the board's test mode is Check access, the Sign-in tests page's
   own form (PolicyCheck.tsx): saved sign-ins are the panel's Use a saved
   sign-in, Past sign-ins a button on the bar, and People and the Break-in
   test are hidden (owner: "Hide people and break-in test as of now"),
   behind test-mode.ts `PEOPLE_AND_BREAK_IN`. Pinned here: a route that names
   one of the old tabs reaches none of them. The views themselves keep their
   own tests (test-panel-ui, break-in-*), and policy-check-ui.test.tsx the
   new join. */

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

describe('the old test panel’s tabs, gone from a policy’s board', () => {
  it('draws no tabs for any route, on a policy the Break-in test runs on or not', () => {
    for (const policyId of ['sc-hrms-office', 'global-default', 'sc-device-compliance'])
      for (const openPage of ['try', 'saved', 'person', 'break-in'] as const) {
        const out = draw(<BoardBuilder policyId={policyId} openTest openPage={openPage} />)
        expect(out, `${policyId} ${openPage}`).not.toContain('role="tab"')
        expect(out, `${policyId} ${openPage}`).not.toContain('role="tabpanel"')
      }
  })

  it('reaches neither People nor the Break-in test from a route that names them', () => {
    /* The old panel's views all wore `.tpanel-view`; nothing of one is drawn. */
    const people = draw(<BoardBuilder policyId="sc-hrms-office" openTest openPage="person" />)
    expect(people).not.toContain('tpanel-')
    const breakIn = draw(<BoardBuilder policyId="sc-hrms-office" openTest openPage="break-in" />)
    expect(breakIn).not.toContain('class="bbi')
    expect(text(breakIn)).not.toContain('Got through')
    expect(text(breakIn)).not.toContain('HRMS access from corporate offices · Stored version')
  })
})
