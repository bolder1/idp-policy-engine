import { describe, expect, it } from 'vitest'

import { RESOLVED_LOGOS } from '../logos/manifest.generated'
import { LOGO_SOURCES } from '../logos/sources'
import { showcaseTenant } from '../fixtures'
import {
  ALL_CATALOG,
  APP_CATALOG,
  CATALOG_SHOWS,
  CATALOG_TYPES,
  addedFrom,
  appTypeOf,
  buildApp,
  catalogEntry,
  featuredOf,
  filterCatalog,
  isNarrowed,
  newAppId,
  newAppName,
  protocolCaption,
  startingSetup,
} from './app-catalog'

const apps = showcaseTenant().apps
const entry = (id: string) => APP_CATALOG.find((e) => e.id === id)!

describe('the catalogue', () => {
  it('holds a logo the prototype has for every entry', () => {
    for (const e of APP_CATALOG) {
      expect(LOGO_SOURCES.some((s) => s.id === e.logoId), e.id).toBe(true)
      expect(RESOLVED_LOGOS[e.logoId]?.file, e.id).toBeTruthy()
    }
  })

  it('features the live row less what cannot be added: four, in its order', () => {
    expect(featuredOf(APP_CATALOG).map((e) => e.name)).toEqual(['AWS', 'Google Apps', 'Office 365', 'Salesforce'])
    expect(featuredOf(APP_CATALOG).every((e) => e.protocol === 'SAML' && !e.custom)).toBe(true)
  })

  it('offers only the types it has tiles for, none of them disabled', () => {
    expect(CATALOG_TYPES.map((t) => t.label)).toEqual(['All apps', 'SAML/WS-FED', 'OAuth/OpenID'])
    expect(CATALOG_TYPES.some((t) => 'disabled' in t)).toBe(false)
    for (const t of CATALOG_TYPES) expect(filterCatalog(APP_CATALOG, { ...ALL_CATALOG, type: t.value }).length, t.label).toBeGreaterThan(0)
  })

  it('stands in a Show filter for the live "Show custom apps only"', () => {
    expect(CATALOG_SHOWS).toEqual([
      { value: 'all', label: 'All apps' },
      { value: 'custom', label: 'Custom apps' },
    ])
  })

  it('has one entry per id and per name, captioned with the live protocol words', () => {
    expect(new Set(APP_CATALOG.map((e) => e.id)).size).toBe(APP_CATALOG.length)
    expect(new Set(APP_CATALOG.map((e) => e.name)).size).toBe(APP_CATALOG.length)
    expect(protocolCaption('SAML')).toBe('SAML')
    expect(protocolCaption('OIDC')).toBe('OAuth/OpenID')
    expect(catalogEntry('salesforce')?.name).toBe('Salesforce')
    expect(catalogEntry('no-such-entry')).toBeUndefined()
    expect(catalogEntry(undefined)).toBeUndefined()
  })
})

describe('filterCatalog', () => {
  it('lists every entry, in name order, when nothing narrows it', () => {
    const all = filterCatalog(APP_CATALOG, ALL_CATALOG)
    expect(all).toHaveLength(APP_CATALOG.length)
    expect(all.map((e) => e.name)).toEqual([...all.map((e) => e.name)].sort((a, b) => a.localeCompare(b)))
  })

  it('searches the name and the protocol, ignoring case and the spaces round it', () => {
    expect(filterCatalog(APP_CATALOG, { ...ALL_CATALOG, query: 'zen' }).map((e) => e.id)).toEqual(['zendesk'])
    expect(filterCatalog(APP_CATALOG, { ...ALL_CATALOG, query: '  ZEN ' }).map((e) => e.id)).toEqual(['zendesk'])
    expect(filterCatalog(APP_CATALOG, { ...ALL_CATALOG, query: 'openid' }).map((e) => e.id)).toEqual(['oauth'])
    expect(filterCatalog(APP_CATALOG, { ...ALL_CATALOG, query: 'nothing like it' })).toEqual([])
  })

  it('narrows by type', () => {
    expect(filterCatalog(APP_CATALOG, { ...ALL_CATALOG, type: 'oidc' }).map((e) => e.id)).toEqual(['oauth'])
    const saml = filterCatalog(APP_CATALOG, { ...ALL_CATALOG, type: 'saml' })
    expect(saml).toHaveLength(APP_CATALOG.length - 1)
    expect(saml.every((e) => e.protocol === 'SAML')).toBe(true)
  })

  it('narrows to the custom entries, together with the type and the search', () => {
    expect(filterCatalog(APP_CATALOG, { ...ALL_CATALOG, show: 'custom' }).map((e) => e.id)).toEqual(['custom-saml', 'oauth'])
    expect(filterCatalog(APP_CATALOG, { ...ALL_CATALOG, show: 'custom', type: 'saml' }).map((e) => e.id)).toEqual(['custom-saml'])
    expect(filterCatalog(APP_CATALOG, { query: 'sales', type: 'all', show: 'custom' })).toEqual([])
  })
})

describe('isNarrowed', () => {
  it('is false only while the search is empty and both filters say all', () => {
    expect(isNarrowed(ALL_CATALOG)).toBe(false)
    expect(isNarrowed({ ...ALL_CATALOG, query: '   ' })).toBe(false)
    expect(isNarrowed({ ...ALL_CATALOG, query: 'aws' })).toBe(true)
    expect(isNarrowed({ ...ALL_CATALOG, type: 'saml' })).toBe(true)
    expect(isNarrowed({ ...ALL_CATALOG, show: 'custom' })).toBe(true)
  })
})

describe('addedFrom', () => {
  it('counts the seed applications by their logo, aliases included', () => {
    expect(addedFrom(entry('salesforce'), apps)).toBe(1)
    expect(addedFrom(entry('m365'), apps)).toBe(1)
    expect(addedFrom(entry('google'), apps)).toBe(1)
    expect(addedFrom(entry('zendesk'), apps)).toBe(0)
    expect(addedFrom(entry('custom-saml'), apps)).toBe(0)
  })

  it('counts an application added from the entry, numbered or not', () => {
    const added = [...apps, { id: 'salesforce-2', catalogId: 'salesforce' }, { id: 'custom-saml', catalogId: 'custom-saml' }]
    expect(addedFrom(entry('salesforce'), added)).toBe(2)
    expect(addedFrom(entry('custom-saml'), added)).toBe(1)
  })
})

describe('making the application', () => {
  it('numbers a second application from one entry, by id and by name', () => {
    expect(newAppId(entry('zendesk'), apps)).toBe('zendesk')
    expect(newAppId(entry('salesforce'), apps)).toBe('salesforce-2')
    expect(newAppId(entry('salesforce'), [...apps, { id: 'salesforce-2' }])).toBe('salesforce-3')
    expect(newAppName(entry('salesforce'), apps)).toBe('Salesforce 2')
    expect(newAppName(entry('zendesk'), apps)).toBe('Zendesk')
  })

  it('types it from the protocol, and keeps an OAuth secret on the app', () => {
    expect(appTypeOf('SAML')).toBe('SAML/WS-FED')
    expect(appTypeOf('OIDC')).toBe('OAuth/OpenID')
    const setup = startingSetup(entry('oauth'))
    expect(setup.kind).toBe('oidc')
    const app = buildApp(entry('oauth'), 'oauth', { name: ' Partner portal ', description: '', secret: 'abc', setup: { ...setup, kind: 'oidc', redirectUrls: ['https://p.example/cb', ' '] } as typeof setup })
    expect(app).toMatchObject({ id: 'oauth', name: 'Partner portal', protocol: 'OIDC', type: 'OAuth/OpenID', secret: 'abc', catalogId: 'oauth' })
    expect(app.setup?.kind === 'oidc' && app.setup.redirectUrls).toEqual(['https://p.example/cb'])
    expect('description' in app).toBe(false)
  })

  it('gives a SAML application no secret', () => {
    const app = buildApp(entry('zendesk'), 'zendesk', { name: 'Zendesk', description: 'Support desk', secret: 'abc', setup: startingSetup(entry('zendesk')) })
    expect(app.secret).toBeUndefined()
    expect(app.description).toBe('Support desk')
  })
})
