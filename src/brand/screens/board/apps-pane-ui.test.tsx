import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { BrandProvider } from '../../store'
import { AppsPane } from './AppsPane'
import paneSrc from './AppsPane.tsx?raw'
import boardSrc from './Board.tsx?raw'

/* The start node's pane, with who the policy governs above its applications
   (owner, 13 Oct 2026: a policy's groups are seen and changed at the start
   node; picking groups from an application's page was ruled out). Static
   markup only: the dialog, the ticks and the checks are the browser's. */

const text = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
const pane = (policyId: string) =>
  text(
    renderToStaticMarkup(
      <BrandProvider>
        <AppsPane policyId={policyId} />
      </BrandProvider>,
    ),
  )

describe('the start node pane', () => {
  it('asks Applications only: Who belongs to the rules, not the policy', () => {
    const out = pane('sc-device-compliance')
    expect(out).toContain('Applications')
    expect(out).not.toContain('Who')
    expect(out).toContain('Save applications')
    expect(out).toContain('Microsoft Outlook')
  })

  it('holds the policy’s applications as chips inside the one field, with the search after them', () => {
    /* One field (24 Oct 2026; it was a search, then the chips under it, then the list). */
    const html = renderToStaticMarkup(
      <BrandProvider>
        <AppsPane policyId="sc-device-compliance" />
      </BrandProvider>,
    )
    const field = html.indexOf('class="bxt"')
    const input = html.indexOf('class="bxt__input"')
    expect(field).toBeGreaterThan(-1)
    for (const name of ['Microsoft Outlook', 'Dropbox']) {
      const x = html.indexOf(`aria-label="Remove ${name}"`)
      expect(x).toBeGreaterThan(field)
      expect(x).toBeLessThan(input)
    }
    expect(html).toMatch(/<input[^>]*placeholder="Search to add more"/)
    expect(html).not.toContain('bxc__chosen')
    expect(text(html).split('In this policy').length - 1).toBe(1)
    expect(text(html)).toContain('Applications to add')
    /* The panel's foot is untouched: Cancel and its grey save. */
    expect(html.indexOf('>Cancel<')).toBeGreaterThan(html.indexOf('Applications to add'))
  })

  it('leaves the system policy as it was: every application, everyone', () => {
    const out = pane('global-default')
    expect(out).toContain('Every application')
    expect(out).not.toContain('Who')
  })

  it('saves who with the applications, through the same checks', () => {
    /* One button and one guard for both: the audience rides on the apps guard. */
    expect(paneSrc).toContain('appsGuard.check(saved, picked')
    expect(paneSrc).toContain('audience: who')
  })

  it('says the audience on the start node only when it narrows the policy', () => {
    expect(boardSrc).toContain('audienceNames && audienceNames.length > 0')
    expect(boardSrc).toContain('A sign-in')
  })
})
