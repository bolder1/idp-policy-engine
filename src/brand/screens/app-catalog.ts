import { defaultOidc, defaultSaml, logoBase, randomHex, type AppSetup } from '../app-setup'
import { type App, type AppType } from '../data'
import { LOGO_SOURCES } from '../logos/sources'
import { freeName } from '../policy-name'

/* -----------------------------------------------------------------------------
   Choose application: the live console's catalogue (Apps → Add Application),
   read 13 Oct 2026 (docs/specs/APP-CREATE-AND-ACCESS.md §3.1).

   The live page holds 577 tiles under ten types. This one holds the brands
   whose logos the prototype already has, plus the live page's two generic
   entries for building an application by hand — Custom SAML App and
   OAuth2/OpenID Connect, both with the miniOrange mark. Only SAML and
   OAuth/OpenID applications can be added here, so the Type filter offers
   those two and nothing else: a type with no tile behind it is a choice that
   cannot be made, and those are not rendered (product parity ruling).

   Names are the live catalogue's where it was read: "Google Apps" and
   "Office 365", not the tenant's "Google Workspace" and "Microsoft Outlook".
   Featured is the live row less what cannot be added here: AWS, Google Apps,
   Office 365 and Salesforce, without BigCommerce (JWT) and Cisco-ASA VPN
   (RADIUS). Nothing stands in for those two, so the row is the live one's
   words and order, four long.
   -------------------------------------------------------------------------- */

export type CatalogProtocol = 'SAML' | 'OIDC'

export interface CatalogApp {
  /** The entry's own id. */
  id: string
  name: string
  protocol: CatalogProtocol
  /** The logo registry id (logos/sources.ts). The custom entries use the miniOrange mark. */
  logoId: string
  featured?: boolean
  /** One of the live page's own entries for building an application by hand. */
  custom?: boolean
}

export const APP_CATALOG: CatalogApp[] = [
  { id: 'aws', name: 'AWS', protocol: 'SAML', logoId: 'aws', featured: true },
  { id: 'box', name: 'Box', protocol: 'SAML', logoId: 'box' },
  { id: 'confluence', name: 'Confluence', protocol: 'SAML', logoId: 'confluence' },
  { id: 'custom-saml', name: 'Custom SAML app', protocol: 'SAML', logoId: 'miniorange', custom: true },
  { id: 'dropbox', name: 'Dropbox', protocol: 'SAML', logoId: 'dropbox' },
  { id: 'github', name: 'GitHub Enterprise', protocol: 'SAML', logoId: 'github' },
  { id: 'google', name: 'Google Apps', protocol: 'SAML', logoId: 'google', featured: true },
  { id: 'jira', name: 'Jira', protocol: 'SAML', logoId: 'jira' },
  { id: 'oauth', name: 'OAuth2/OpenID Connect', protocol: 'OIDC', logoId: 'miniorange', custom: true },
  { id: 'm365', name: 'Office 365', protocol: 'SAML', logoId: 'm365', featured: true },
  { id: 'salesforce', name: 'Salesforce', protocol: 'SAML', logoId: 'salesforce', featured: true },
  { id: 'servicenow', name: 'ServiceNow', protocol: 'SAML', logoId: 'servicenow' },
  { id: 'slack', name: 'Slack', protocol: 'SAML', logoId: 'slack' },
  { id: 'workday', name: 'Workday', protocol: 'SAML', logoId: 'workday' },
  { id: 'zendesk', name: 'Zendesk', protocol: 'SAML', logoId: 'zendesk' },
  { id: 'zoom', name: 'Zoom', protocol: 'SAML', logoId: 'zoom' },
]

export const catalogEntry = (id: string | undefined): CatalogApp | undefined => APP_CATALOG.find((e) => e.id === id)

/** What a tile says under the name: the live page's protocol caption. */
export const protocolCaption = (p: CatalogProtocol): string => (p === 'OIDC' ? 'OAuth/OpenID' : 'SAML')

// --- The bar's two filters -------------------------------------------------------------------

/* Type: the live "All Apps" list, cut to the types that have tiles here, in
   its order. The live JWT, RADIUS (VPN), Desktop, TACACS, Browser Extension,
   Passwordless/Bookmark and Provisioning are left out, not offered disabled
   (spec §3.1). */
export type CatalogType = 'all' | 'saml' | 'oidc'

export const CATALOG_TYPES: { value: CatalogType; label: string }[] = [
  { value: 'all', label: 'All apps' },
  { value: 'saml', label: 'SAML/WS-FED' },
  { value: 'oidc', label: 'OAuth/OpenID' },
]

/* Show: the live "Show custom apps only" checkbox, as the bar's other filter
   shape — a prefixed dropdown, as Zones' Show is — rather than a toggle in a
   row of dropdowns. */
export type CatalogShow = 'all' | 'custom'

export const CATALOG_SHOWS: { value: CatalogShow; label: string }[] = [
  { value: 'all', label: 'All apps' },
  { value: 'custom', label: 'Custom apps' },
]

export interface CatalogFilter {
  query: string
  type: CatalogType
  show: CatalogShow
}

/** The page as it opens, and as No matches' Clear puts it back. */
export const ALL_CATALOG: CatalogFilter = { query: '', type: 'all', show: 'all' }

/** The entries a search, the Type and the Show leave, in name order. */
export function filterCatalog(entries: readonly CatalogApp[], f: CatalogFilter): CatalogApp[] {
  const q = f.query.trim().toLowerCase()
  return entries
    .filter((e) => (f.type === 'saml' ? e.protocol === 'SAML' : f.type === 'oidc' ? e.protocol === 'OIDC' : true))
    .filter((e) => f.show === 'all' || e.custom)
    .filter((e) => !q || e.name.toLowerCase().includes(q) || protocolCaption(e.protocol).toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** A search or either filter is narrowing the page. A search of spaces is no search. */
export const isNarrowed = (f: CatalogFilter): boolean => f.query.trim() !== '' || f.type !== 'all' || f.show !== 'all'

/* Featured apps, in the catalogue's order. Shown only while nothing narrows
   the page: under a search the row would repeat tiles that All apps already
   lists beneath it. */
export const featuredOf = (entries: readonly CatalogApp[]): CatalogApp[] => entries.filter((e) => e.featured)

/* The tenant's applications that came from this entry: added from it here, or
   a seed application with its logo (Salesforce, or Outlook for Office 365,
   through the registry's aliases). The custom entries have none. */
export function addedFrom(entry: CatalogApp, apps: readonly Pick<App, 'id' | 'catalogId'>[]): number {
  if (entry.custom) return apps.filter((a) => a.catalogId === entry.id).length
  const source = LOGO_SOURCES.find((s) => s.id === entry.logoId)
  const ids = new Set([entry.logoId, ...(source?.aliases ?? [])])
  return apps.filter((a) => a.catalogId === entry.id || (!a.catalogId && ids.has(logoBase(a.id)))).length
}

// --- Making the application ------------------------------------------------------------------

/* The new application's id: the entry's logo id, so `AppLogo` finds its mark,
   then "-2", "-3" for a second one (AppLogo resolves the number away). The
   custom entries take "custom-saml" / "oauth" the same way, which has no mark,
   so the list shows the generic application icon as it does for every
   unbranded application. */
export function newAppId(entry: CatalogApp, apps: readonly Pick<App, 'id'>[]): string {
  const base = entry.custom ? entry.id : entry.logoId
  const taken = new Set(apps.map((a) => a.id))
  if (!taken.has(base)) return base
  for (let n = 2; ; n += 1) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`
}

/** The Display name a new application starts with: the entry's, numbered when the tenant has it. */
export const newAppName = (entry: CatalogApp, apps: readonly Pick<App, 'name'>[]): string =>
  freeName(entry.name, apps.map((a) => a.name))

export const appTypeOf = (p: CatalogProtocol): AppType => (p === 'OIDC' ? 'OAuth/OpenID' : 'SAML/WS-FED')

/** The setup a new application starts from: the live form's defaults, with a fresh client id on an OAuth one. */
export const startingSetup = (entry: CatalogApp): AppSetup => (entry.protocol === 'OIDC' ? defaultOidc(randomHex(32)) : defaultSaml())

/* The application as stored. Last updated is the store's to stamp. A SAML
   application has no secret; an OAuth one keeps its client secret where every
   OAuth application in the tenant does, `App.secret`. */
export function buildApp(
  entry: CatalogApp,
  id: string,
  d: { name: string; description: string; secret: string; setup: AppSetup },
): App {
  const oidc = entry.protocol === 'OIDC'
  return {
    id,
    name: d.name.trim(),
    protocol: entry.protocol,
    glyph: '',
    tint: '',
    type: appTypeOf(entry.protocol),
    lastUpdated: '',
    ...(d.description.trim() ? { description: d.description.trim() } : {}),
    ...(oidc && d.secret ? { secret: d.secret } : {}),
    setup: oidc && d.setup.kind === 'oidc' ? { ...d.setup, redirectUrls: d.setup.redirectUrls.map((u) => u.trim()).filter(Boolean) } : d.setup,
    catalogId: entry.id,
  }
}
