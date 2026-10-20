import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'

import { BrandProvider } from '../store'
import { AppCatalog } from './AppCatalog'
import { APP_CATALOG } from './app-catalog'

/* -----------------------------------------------------------------------------
   Choose application, drawn once as static markup on the showcase tenant: the
   head, the bar, Featured and All apps as tiles, the Added pill, and the page
   under a search or a filter. What a filter KEEPS is pinned in
   app-catalog.test.ts; nothing here presses anything, so a narrowed page is
   drawn by starting it narrowed.
   -------------------------------------------------------------------------- */

const render = (node: ReactNode) => renderToStaticMarkup(<BrandProvider>{node}</BrandProvider>)
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
const count = (html: string, needle: string) => html.split(needle).length - 1
/** Each tile's words, in page order. */
const tiles = (html: string) =>
  [...html.matchAll(/<button type="button" class="bapc__tile">(.*?)<\/button>/g)].map((m) => text(m[1]).trim())
const headings = (html: string) => [...html.matchAll(/<h2[^>]*>(.*?)<\/h2>/g)].map((m) => text(m[1]).trim())

describe('Choose application', () => {
  const out = render(<AppCatalog />)

  it('heads it as a step under Applications: the way back, the heading, no caption', () => {
    expect(out).toMatch(/<button type="button" class="bz7__back">.*?All applications<\/button>/)
    expect(out).toMatch(/<h1[^>]*>Choose application<\/h1>/)
    expect(out).not.toMatch(/<header class="bz7__pagehead">(?:(?!<\/header>).)*<p/)
  })

  it('has one bar: the search, Type and Show, and the request link on the right', () => {
    expect(out).toContain('aria-label="Search applications"')
    expect(out).toContain('placeholder="Search applications…"')
    expect(out).toContain('aria-label="Filter by type"')
    expect(out).toContain('aria-label="Filter by custom apps"')
    expect(count(out, 'btoolbar__filter bbar__filter')).toBe(2)
    expect(out).not.toContain('is-set')
    const right = out.slice(out.indexOf('bbar__right'))
    expect(right).toMatch(/class="bx-btn bx-btn--link[^"]*"[^>]*>Submit new app request<\/button>/)
  })

  it('has no orange button: a tile is the choice', () => {
    expect(out).not.toContain('bx-btn--brand')
  })

  it('leads with the four featured apps, then every entry in name order, all as buttons', () => {
    expect(headings(out)).toEqual(['Featured apps', 'All apps'])
    const all = tiles(out)
    expect(all).toHaveLength(4 + APP_CATALOG.length)
    expect(all.slice(0, 4).map((t) => t.split(' SAML')[0])).toEqual(['AWS', 'Google Apps', 'Office 365', 'Salesforce'])
    const names = APP_CATALOG.map((e) => e.name).sort((a, b) => a.localeCompare(b))
    expect(all.slice(4).every((t, i) => t.startsWith(names[i]))).toBe(true)
  })

  it('captions each tile with its protocol, the live words', () => {
    const all = tiles(out)
    expect(all.find((t) => t.startsWith('OAuth2/OpenID Connect'))).toContain('OAuth/OpenID')
    expect(all.find((t) => t.startsWith('Zendesk'))).toContain('SAML')
  })

  it('does not mark an entry the tenant already has (owner, 13 Oct 2026)', () => {
    const all = tiles(out)
    expect(all.filter((t) => t.startsWith('Salesforce'))).toEqual(['Salesforce SAML', 'Salesforce SAML'])
    expect(text(out)).not.toContain('Added')
  })

  it('prints no count and no pager', () => {
    expect(out).not.toContain('blist__pager')
    expect(text(out)).not.toMatch(/\b\d+\s*(?:–|-)\s*\d+ of \d+/)
    expect(text(out)).not.toContain(String(APP_CATALOG.length))
  })

  it('keeps the logo out of the tile name', () => {
    expect(count(out, '<span class="bapc__logo" aria-hidden="true">')).toBe(4 + APP_CATALOG.length)
  })
})

describe('Choose application, narrowed', () => {
  it('hides Featured while a search is on, and lists what matches', () => {
    const out = render(<AppCatalog start={{ query: 'sales' }} />)
    expect(headings(out)).toEqual(['All apps'])
    expect(tiles(out)).toEqual(['Salesforce SAML'])
  })

  it('hides Featured while a filter is set, and marks the filter as set', () => {
    const out = render(<AppCatalog start={{ type: 'oidc' }} />)
    expect(headings(out)).toEqual(['All apps'])
    expect(tiles(out)).toEqual(['OAuth2/OpenID Connect OAuth/OpenID'])
    expect(count(out, 'bbar__filter is-set')).toBe(1)

    const custom = render(<AppCatalog start={{ show: 'custom' }} />)
    expect(tiles(custom)).toEqual(['Custom SAML app SAML', 'OAuth2/OpenID Connect OAuth/OpenID'])
    expect(count(custom, 'bbar__filter is-set')).toBe(1)
  })

  it('says when nothing matches, with the way back to every tile', () => {
    const searched = render(<AppCatalog start={{ query: 'zzz' }} />)
    expect(text(searched)).toContain('No applications match “zzz”')
    expect(text(searched)).toContain('Clear search')
    expect(searched).not.toContain('bapc__tile')
    expect(headings(searched)).toEqual(['No applications match “zzz”'])

    const both = render(<AppCatalog start={{ query: 'sales', show: 'custom' }} />)
    expect(text(both)).toContain('Clear search and filters')
  })
})
