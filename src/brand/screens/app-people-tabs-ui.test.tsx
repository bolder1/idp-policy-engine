import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'

import { BrandProvider } from '../store'
import { AppGroupsTab, AppUsersTab } from './app-people-tabs'
import { TestingSessionProvider } from './testing/session'
import { UserDrawer } from './UserDrawer'

/* -----------------------------------------------------------------------------
   The application page's Users and Groups tabs and the user drawer, drawn
   once as static markup: the columns, the filters and the drawer's sections
   are there, and the Everyone row leads Groups. What the rows SAY is pinned in
   app-people-tabs-model.test.ts; nothing here presses anything.
   -------------------------------------------------------------------------- */

const render = (node: ReactNode) =>
  renderToStaticMarkup(
    <BrandProvider>
      <TestingSessionProvider>{node}</TestingSessionProvider>
    </BrandProvider>,
  )
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('the application Users tab', () => {
  const out = render(<AppUsersTab appId="slack" />)

  it('has the search, the Group and Policy filters, and no button of its own', () => {
    expect(out).toContain('aria-label="Search users"')
    expect(out).toContain('aria-label="Filter by group"')
    expect(out).toContain('aria-label="Filter by policy"')
    expect(out).not.toContain('bx-btn--brand')
  })

  it('lists people with the email over the name, and names the deciding policy', () => {
    for (const head of ['User', 'Groups', 'Deciding policy', 'Actions']) expect(text(out)).toContain(head)
    expect(out).toContain('class="busr__who"')
    expect(out).toContain('class="busr__sub"')
    expect(out).toContain('aria-label="User pages"')
  })

  it('lands on a group the route names', () => {
    const filtered = render(<AppUsersTab appId="slack" group="engineering" />)
    expect(filtered).toContain('bbar__filter is-set')
  })

  /* The second line under the Deciding policy (spec APP-CREATE-AND-ACCESS.md §4). */
  it('says how the deciding policy reaches each person, and nothing under the tenant default', () => {
    expect(text(render(<AppUsersTab appId="outlook" />))).toContain('For everyone')
    expect(text(render(<AppUsersTab appId="github" group="engineering" />))).toContain('Through Engineering')
    const fallback = text(render(<AppUsersTab appId="salesforce" />))
    expect(fallback).not.toContain('For everyone')
    expect(fallback).not.toContain('Through ')
  })

  it('takes the page\'s saving state, and still has no button of its own', () => {
    expect(render(<AppUsersTab appId="slack" saving />)).not.toContain('bx-btn--brand')
    expect(render(<AppGroupsTab appId="slack" onShowUsers={() => {}} saving />)).not.toContain('bx-btn--brand')
  })
})

describe('the application Groups tab', () => {
  const out = render(<AppGroupsTab appId="slack" onShowUsers={() => {}} />)

  it('leads with Everyone, the default group', () => {
    const t = text(out)
    expect(t).toContain('Everyone')
    expect(t).toContain('Default group')
    expect(t.indexOf('Everyone')).toBeLessThan(t.indexOf('Default group'))
    expect(out).toContain('aria-label="Group pages"')
  })

  it('has the Group, Users, Deciding policy and Actions columns', () => {
    for (const head of ['Group', 'Users', 'Deciding policy', 'Actions']) expect(text(out)).toContain(head)
  })
})

describe('the user drawer', () => {
  it('draws nothing before anybody is opened', () => {
    /* The session provider's own status region is all there is. */
    expect(render(<UserDrawer userId={null} onClose={() => {}} />)).not.toContain('role="dialog"')
  })

  it('shows the person, their applications and groups, and Check access', () => {
    /* Arun is in both the showcase and the legacy directory. */
    const out = render(<UserDrawer userId="arun" onClose={() => {}} />)
    const t = text(out)
    for (const s of ['User details', 'Applications', 'Groups', 'Check access', 'Email', 'Role']) expect(t).toContain(s)
  })

  it('says so when the person is gone', () => {
    expect(text(render(<UserDrawer userId="nobody-here" onClose={() => {}} />))).toContain('User not found')
  })
})
