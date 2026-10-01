/// <reference types="vite/client" />
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ChangeSection, type ChangeBlock } from '../change-list'
import type { Zone } from '../data'
import { showcaseTenantHrmsOn } from '../fixtures'
import { USE_STOP, profileGuard, zoneGuard, type LibraryTenant } from './library-guard'
import { libraryRows } from './library-review'
import guardCss from './guard.css?raw'
import { envOf } from './tenant-resolver'

/* The library guard's rows in Review changes, drawn without a browser: a
   saved sign-in the save breaks says why beside its own row, with the fix and
   — for a Must pass only — the way to expect otherwise; the review's Save
   carries one short word; nothing it says is meant for the footer. The browser
   pass checks the dialog itself, which renders through a portal.

   The zone save stops on HRMS's Must pass, so it runs on the tenant once
   HRMS is turned on; the seed opens with it Inactive (Phase 4). */

const t = showcaseTenantHrmsOn()
const env = envOf(t)
const tenant: LibraryTenant = { policies: t.policies, env, apps: t.apps, savedSignIns: t.savedSignIns, adminId: 'jaspreet' }
const OFFICES = t.zones.find((z) => z.id === 'corp-offices')!
const COMPLIANT = t.fingerprints.find((p) => p.id === 'fp-compliant')!
const noop = () => {}
const html = (node: ReactNode) => renderToStaticMarkup(<>{node}</>)
const text = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()

describe('a zone save a Must pass stops', () => {
  const draft: Zone = { ...OFFICES, ip: OFFICES.ip.filter((x) => x !== '203.0.113.0/24') }
  const review = libraryRows(zoneGuard(tenant, OFFICES, draft), noop, noop)
  const kavya = review.rows.at(-1)!
  const out = html(kavya.after)

  it('holds the review with one short word', () => {
    expect(review.stop).toBe("Can't save")
  })

  it('says why beside the row, with the fix and Expect instead', () => {
    expect(kavya.label).toBe('Kavya Menon in the office · Must pass')
    expect(kavya.check).toBe('fail')
    expect(text(out)).toBe(
      'Deny · expected Allow with 2FA Kavya Menon in the office must pass and would get Deny. Keep 203.0.113.0/24 Expect Deny instead',
    )
    expect(out).toMatch(/role="group" aria-label="Can(?:'|&#x27;)t save"/)
    // The fix is neutral, never the orange primary.
    expect(out).toMatch(/class="bx-btn bx-btn--neutral[^"]*"[^>]*>[\s\S]*?Keep 203\.0\.113\.0\/24/)
    expect(out).not.toMatch(/bx-btn--brand/)
  })

  it('draws the policies and what changes as plain rows, with no stop of their own', () => {
    /* AWS for engineering teams reads the office zone too (the troubleshooting estate, 30 Sep 2026). */
    expect(review.rows.slice(0, 2).map((r) => [r.label, r.after, r.check])).toEqual([
      ['Active policies', 'HRMS access from corporate offices, Developer tools — office and device checks, AWS for engineering teams', undefined],
      ['What changes', 'Of 1,440 modelled sign-ins: Now allowed 0 · Now on 1 factor 0 · Now asked for 2FA 24 · Now denied 30', undefined],
    ])
  })

  it('offers no fix where the page offers none, and says the held action in its own word (Use)', () => {
    const bare = libraryRows(zoneGuard(tenant, OFFICES, draft), null, noop, USE_STOP)
    const said = html(bare.rows.at(-1)!.after)
    expect(text(said)).not.toContain('Keep 203.0.113.0/24')
    expect(bare.stop).toBe("Can't use this profile")
    expect(said).toMatch(/role="group" aria-label="Can(?:'|&#x27;)t use this profile"/)
  })
})

describe('a note that moves', () => {
  it('is listed with its value and nothing else', () => {
    const review = libraryRows(zoneGuard(tenant, OFFICES, { ...OFFICES, ip: [...OFFICES.ip, '192.0.2.0/24'] }), noop, noop)
    expect(review.stop).toBeNull()
    const neha = review.rows.at(-1)!
    expect(neha.label).toBe('Neha Kapoor at home')
    expect(text(html(neha.after))).toBe('Allow with 2FA · expected Deny')
  })
})

describe('a device profile save a Must pass stops', () => {
  const lowered = { ...COMPLIANT, config: { ...COMPLIANT.config, 'os-android': { op: 'gte', value: '12' } } }
  const review = libraryRows(profileGuard(tenant, COMPLIANT, lowered), noop, noop)

  it('offers the saved profile back', () => {
    expect(text(html(review.rows.at(-1)!.after))).toContain('Devon Rao on Android 12 must pass and would get Allow on 1 factor. Restore the saved profile')
  })

  it("draws What changes grey as Can't tell, never as four zeros", () => {
    const what = review.rows.find((r) => r.label === 'What changes')!
    expect(html(what.after)).toBe('<span class="bgd__grey">Can&#x27;t tell</span>')
  })
})

describe('a long Also changes section', () => {
  /* Ten rows under a limit of eight: the section trims, and the Fails block —
     a note that sorts first by name and the blocker behind it — stays whole,
     so the reason Save is off is never behind "Show N more". */
  const row = (n: number) => ({ id: `e${n}`, name: `Policy ${n}`, after: 'Now denied 1' })
  const blocks: ChangeBlock[] = [
    { tone: 'effect', label: 'Happens for you', items: Array.from({ length: 8 }, (_, n) => row(n)) },
    {
      tone: 'fail',
      label: 'Fails',
      items: [
        { id: 'note', name: 'Aarav at home', after: 'Allow with 2FA · expected Deny' },
        { id: 'stop', name: 'Kavya Menon in the office · Must pass', after: 'Deny · expected Allow with 2FA' },
      ],
    },
  ]
  const out = text(renderToStaticMarkup(<ChangeSection title="Also changes" layout="list" blocks={blocks} />))

  it('keeps every failing row and trims the rest', () => {
    expect(out).toContain('Aarav at home')
    expect(out).toContain('Kavya Menon in the office · Must pass')
    expect(out).toContain('Policy 5')
    expect(out).not.toContain('Policy 6')
    expect(out).toContain('Show 2 more')
  })

  it('shows everything when the only rows over the limit are failing ones', () => {
    const fails: ChangeBlock[] = [{ ...blocks[1], items: Array.from({ length: 11 }, (_, n) => ({ id: `f${n}`, name: `Sign-in ${n}`, after: 'Deny' })) }]
    const all = text(renderToStaticMarkup(<ChangeSection title="Also changes" layout="list" blocks={fails} />))
    expect(all).toContain('Sign-in 10')
    expect(all).not.toMatch(/Show \d+ more/)
  })
})

describe('the stylesheet', () => {
  it('says the reason in the negative ink, and sets no transform', () => {
    expect(guardCss).toMatch(/\.blg__line \{[^}]*color: var\(--fb-negative-fg\)/)
    const rules = guardCss.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(rules).not.toMatch(/\btransform\s*:/)
  })
})
