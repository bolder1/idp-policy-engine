import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { blankPolicy, type Policy } from '../../data'
import { showcaseTenant } from '../../fixtures'
import { BrandProvider } from '../../store'
import { ReadAsTextDrawer, ReadAsTextPanel } from './ReadAsTextPanel'
import { STATUS_WORD, readFoot, readVersions, storedVersions } from './read-as-text'

/* -----------------------------------------------------------------------------
   Read as text (describe spec, §7.2): which version is read, the line under
   it, and the panel and drawer as the board and the list draw them. The
   sentences themselves are pinned in predicate-prose.test.ts.
   -------------------------------------------------------------------------- */

const T = showcaseTenant()
const hrms = T.policies.find((p) => p.id === 'sc-hrms-office')!
const edited: Policy = { ...hrms, rules: [{ ...hrms.rules[0], decision: 'deny' }] }
const noop = () => {}
const html = (node: ReactNode) => renderToStaticMarkup(<BrandProvider>{node}</BrandProvider>)
const text = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim()

describe('which versions there are to read', () => {
  it('offers Live beside the draft only when the draft differs from what is live', () => {
    expect(readVersions(hrms, hrms)).toEqual({ draft: hrms, live: null })
    expect(readVersions(hrms, edited)).toEqual({ draft: edited, live: hrms })
  })

  it('never offers Live for a policy that has never been published', () => {
    const draft = { ...blankPolicy('Untitled policy', ['hrms']), rules: hrms.rules }
    expect(readVersions(draft, { ...draft, rules: [] }).live).toBeNull()
  })

  it('reads a stored policy’s saved draft, with Live beside it', () => {
    const saved: Policy = { ...hrms, pendingDraft: { rules: edited.rules, fallback: hrms.fallback, savedAt: 'Just now', savedBy: 'You' } }
    const v = storedVersions(saved)
    expect(v.draft.rules).toBe(edited.rules)
    expect(v.live).toBe(saved)
    expect(storedVersions(hrms).live).toBeNull()
  })
})

describe('the line under the text', () => {
  /* HRMS opens Inactive on the showcase (Phase 4). */
  it('says the status, when and by whom', () => {
    expect(readFoot(hrms)).toBe('Inactive · Changed 2 hours ago by Jaspreet Toor')
    expect(readFoot({ ...hrms, status: 'active' })).toBe('Active · Changed 2 hours ago by Jaspreet Toor')
    expect(readFoot({ status: 'draft', lastModified: 'Just now', modifiedBy: 'You' })).toBe('Draft · Changed just now by you')
    expect(readFoot({ status: 'monitor', lastModified: 'Yesterday', modifiedBy: 'Priya Sharma' })).toBe('Monitoring · Changed yesterday by Priya Sharma')
  })

  it('says the system policy’s status alone', () => {
    expect(readFoot(T.policies.find((p) => p.isSystem)!)).toBe('Always on')
  })

  it('uses the status pill’s words', () => {
    expect(Object.values(STATUS_WORD)).toEqual(['Draft', 'Active', 'Monitoring', 'Inactive', 'Always on'])
  })
})

describe('the panel on the board', () => {
  it('reads the policy as numbered sentences, with Copy and close, and no Version choice when there is one version', () => {
    const out = html(<ReadAsTextPanel saved={hrms} draft={hrms} onClose={noop} onHover={noop} onPick={noop} />)
    const said = text(out)
    expect(said).toContain('Read as text')
    expect(out).toContain('aria-label="Copy text"')
    expect(out).toContain('aria-label="Close Read as text"')
    expect(said).toContain('Applies to HRMS.')
    expect(said).toContain('For Human Resources and Finance.')
    expect(said).toContain('1. For Human Resources and Finance, if in zone Corporate offices: allow with 2FA, password then Google Authenticator.')
    expect(said).toContain('Nothing else matched: deny, “HRMS opens only from a corporate office.')
    expect(said).toContain('Inactive · Changed 2 hours ago by Jaspreet Toor')
    expect(out).not.toContain('role="radiogroup"')
  })

  it('makes each rule’s sentence and the last row a button, and the rest plain text', () => {
    const out = html(<ReadAsTextPanel saved={hrms} draft={hrms} onClose={noop} onHover={noop} onPick={noop} />)
    expect(out.match(/<button type="button" class="brat__line is-rule"/g)).toHaveLength(2)
    expect(out.match(/<p class="brat__line"/g)).toHaveLength(2)
  })

  it('offers Draft · Live, Draft first and chosen, when the board’s rules differ from live', () => {
    const out = html(<ReadAsTextPanel saved={hrms} draft={edited} onClose={noop} onHover={noop} onPick={noop} />)
    expect(out).toContain('role="radiogroup" aria-label="Version"')
    expect(text(out)).toMatch(/Draft Live/)
    expect(out).toMatch(/aria-checked="true"[^>]*>Draft</)
    expect(text(out)).toContain('Corporate offices: deny.')
  })
})

describe('the drawer from the Policies list', () => {
  it('is titled with the policy’s name and reads the same sentences, with Copy', () => {
    const out = html(<ReadAsTextDrawer open policy={hrms} onClose={noop} />)
    const said = text(out)
    expect(out).toContain('aria-label="HRMS access from corporate offices"')
    expect(out).toContain('width:560px')
    expect(out).toContain('aria-label="Copy text"')
    expect(said).toContain('1. For Human Resources and Finance, if in zone Corporate offices: allow with 2FA, password then Google Authenticator.')
    /* No chain to point at: no line is a button. */
    expect(out).not.toContain('brat__line is-rule')
  })
})
