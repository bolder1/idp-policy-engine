import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { BrandProvider } from '../store'
import { SignInActivity } from './SignInActivity'
import { TestingSessionProvider } from './testing/session'
import brandAppSrc from '../BrandApp.tsx?raw'
import shellSrc from '../Shell.tsx?raw'
import panelSrc from './sign-in-tests/TryPanel.tsx?raw'
import pageSrc from './SignInActivity.tsx?raw'
import policiesSrc from './Policies.tsx?raw'

const render = () =>
  renderToStaticMarkup(
    <BrandProvider>
      <TestingSessionProvider>
        <SignInActivity />
      </TestingSessionProvider>
    </BrandProvider>,
  )
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('Sign-in activity', () => {
  const out = render()

  it('is a page with its head, a way back to Policies, the filters, and a sample badge that says so', () => {
    expect(text(out)).toContain('Sign-in activity')
    expect(out).toContain('aria-label="Breadcrumb"')
    expect(out).toContain('aria-label="Search sign-in activity"')
    expect(out).toContain('aria-label="Filter by result"')
    /* The reasons report's chips are the reason filter: no dropdown for it. */
    expect(out).not.toContain('aria-label="Filter by reason"')
    expect(out).toContain('aria-label="Filter by application"')
    expect(text(out)).toContain('Sample')
  })

  it('has the Sign-ins and Changes views and the reasons report, each reason a filter', () => {
    expect(out).toContain('role="tablist" aria-label="View"')
    expect(text(out)).toContain('Policy changes')
    expect(out).toContain('aria-label="Why they were blocked"')
    expect(out).toContain('class="sia__chip"')
  })

  it('opens on the blocked sign-ins: every row says Deny and gives a reason', () => {
    const body = out.slice(out.indexOf('<tbody'), out.indexOf('</tbody>'))
    const rows = body.split('<tr ').slice(1)
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      expect(text(r)).toContain('Deny')
      expect(text(r)).toMatch(/not allowed|does not meet|too high|outside the allowed|No rule let|blocks this|This group/)
    }
  })

  it('is routed, kept under Policies in the rail, and reached from the Access checks form', () => {
    expect(brandAppSrc).toContain("case 'sign-in-activity':")
    expect(shellSrc).toMatch(/'sign-in-tests',\s+'sign-in-activity',\s+\]/)
    expect(shellSrc).toContain("'policy-details', 'sign-in-tests', 'sign-in-activity']")
    /* From the Policies bar, beside Check access — not from the Access checks form. */
    expect(policiesSrc).toContain("store.go({ name: 'sign-in-activity' })")
    expect(panelSrc).not.toContain('Sign-in activity')
  })

  /* Opened from an application's Policies tab (APP-POLICY-TAB.md, review 15 Oct 2026). */
  it('opened from an application, goes back to it and counts that application’s reasons', () => {
    const box = renderToStaticMarkup(
      <BrandProvider>
        <TestingSessionProvider>
          <SignInActivity appId="box" from={{ appId: 'box' }} />
        </TestingSessionProvider>
      </BrandProvider>,
    )
    const crumbOf = (html: string) => text(html.slice(html.indexOf('aria-label="Breadcrumb"'), html.indexOf('</nav>', html.indexOf('aria-label="Breadcrumb"'))))
    expect(crumbOf(box)).toContain('Box')
    expect(crumbOf(box)).not.toContain('Policies')
    /* Each chip's count is out of Box's sign-ins: no more than the rows the table holds. */
    const counts = [...box.matchAll(/class="sia__chipn">(\d+)</g)].map((m) => Number(m[1]))
    const rows = box.slice(box.indexOf('<tbody'), box.indexOf('</tbody>')).split('<tr ').length - 1
    expect(counts.length).toBeGreaterThan(0)
    for (const n of counts) expect(n).toBeLessThanOrEqual(rows)
    expect(crumbOf(out)).toContain('Policies')
  })

  it('opens a sign-in in Access checks by loading it into the session, and never starts a run', () => {
    expect(pageSrc).toContain('session.load(formOf(r.facts, zones))')
    expect(pageSrc).toContain("go({ name: 'sign-in-tests' })")
    expect(pageSrc).not.toContain('start(')
  })
})
