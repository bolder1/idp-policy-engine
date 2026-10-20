/* -----------------------------------------------------------------------------
   An application's setup: the live console's Basic, Advanced, Login Options and
   Attributes tabs, as data (spec docs/specs/APP-CREATE-AND-ACCESS.md, 13 Oct
   2026).

   The fields, their words, their order and their defaults are the live
   console's, read 13 Oct 2026 on its Add Application forms (SAML: Salesforce;
   OAuth: OAuth2/OpenID Connect). Labels are in sentence case, and "Login
   Options" is "Sign-in options" (house rule: never "login").

   Left out, because each has one possible answer in this tenant and a
   question with one answer is not asked: Primary identity provider, and the
   OAuth app's SSO flows. Left out because they need a second control the
   prototype has no use for: the Name ID's custom choices (Custom profile
   attribute, Custom attribute value, External IdP attribute).

   Pure, and below `data.ts` in the imports: `App.setup` is typed from here.
   -------------------------------------------------------------------------- */

import { LOGO_SOURCES } from './logos/sources'

export type Binding = 'HTTP-Redirect' | 'HTTP-POST'
export type RelayStateKind = 'none' | 'value' | 'profile' | 'group'
/** What a SAML Name ID or an OAuth subject is filled from. */
export type ProfileAttr = 'email' | 'username' | 'guid' | 'phone' | 'first-name' | 'last-name' | 'full-name'

/** One row of Attribute mapping: the name the application receives, and the profile value sent. */
export interface AttrRow {
  id: string
  name: string
  value: ProfileAttr
}

export interface SamlSetup {
  kind: 'saml'
  /* Basic */
  entityId: string
  acsUrl: string
  audienceUri: string
  sloUrl: string
  /* Advanced */
  signedRequest: boolean
  signResponse: boolean
  signAssertion: boolean
  signatureAlgorithm: 'RSA-SHA256' | 'RSA-SHA1'
  encryptAssertion: boolean
  relayState: RelayStateKind
  relayStateValue: string
  overrideRelayState: boolean
  logoutResponseBinding: Binding
  idpLogoutRequestBinding: Binding
  /** The live field's number, 300 by default. The console prints no unit beside it. */
  validityPeriod: number
  sharedIdentity: boolean
  authnContext: string
  /* Sign-in options */
  forceAuthentication: boolean
  showOnDashboard: boolean
  /* Attributes */
  nameId: ProfileAttr
  nameIdFormat: string
  addNameFormat: boolean
  multiValued: boolean
  attributes: AttrRow[]
}

export interface OidcSetup {
  kind: 'oidc'
  /* Basic. The client secret is `App.secret`, as it was before setup existed. */
  redirectUrls: string[]
  clientId: string
  subject: ProfileAttr
  /* Advanced */
  accessTokenHours: number
  idTokenHours: number
  refreshTokenDays: number
  signatureAlgorithm: 'RSA-SHA256' | 'HMAC-SHA256'
  clientCredentialGrant: boolean
  sharedIdentity: boolean
  /* Sign-in options */
  showOnDashboard: boolean
  forceAuthentication: boolean
  logoutUris: string[]
  singleLogout: boolean
  /* Attributes */
  multiValued: boolean
  attributes: AttrRow[]
}

export type AppSetup = SamlSetup | OidcSetup

// --- The choices ---------------------------------------------------------------------

/* "Email address", not the live list's "E-mail Address": the console says
   Email on every people surface, and one concept takes one spelling. */
export const PROFILE_ATTRS: { value: ProfileAttr; label: string }[] = [
  { value: 'email', label: 'Email address' },
  { value: 'username', label: 'Username' },
  { value: 'guid', label: 'GUID' },
  { value: 'phone', label: 'Phone number' },
  { value: 'first-name', label: 'First name' },
  { value: 'last-name', label: 'Last name' },
  { value: 'full-name', label: 'Full name' },
]

export const NAME_ID_FORMATS: string[] = [
  'urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified',
  'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
  'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent',
  'urn:oasis:names:tc:SAML:2.0:nameid-format:transient',
]

const AC = 'urn:oasis:names:tc:SAML:2.0:ac:classes:'
/* The classes the live list was seen to hold (13 Oct 2026), in its order. */
export const AUTHN_CONTEXTS: string[] = [
  'InternetProtocolPassword',
  'Kerberos',
  'MobileOneFactorUnregistered',
  'MobileTwoFactorUnregistered',
  'MobileOneFactorContract',
  'MobileTwoFactorContract',
  'Password',
  'PasswordProtectedTransport',
  'PreviousSession',
  'X509',
  'PGP',
  'SPKI',
  'XMLDSig',
  'Smartcard',
  'SmartcardPKI',
  'SoftwarePKI',
  'Telephony',
  'NomadTelephony',
].map((c) => AC + c)

/** The class's own name, without the URN in front of it. */
export const authnContextLabel = (urn: string): string => (urn.startsWith(AC) ? urn.slice(AC.length) : urn)

/** A Name ID format as a picker shows it: the URN's last part ("emailAddress"), the rest being the same on every one. */
export const nameIdFormatLabel = (urn: string): string => urn.slice(urn.lastIndexOf(':') + 1) || urn

export const SAML_SIGNATURE_ALGORITHMS: SamlSetup['signatureAlgorithm'][] = ['RSA-SHA256', 'RSA-SHA1']
/* RSA-SHA256 is the live default. The second choice is assumed: the live list
   was not opened. */
export const OIDC_SIGNATURE_ALGORITHMS: OidcSetup['signatureAlgorithm'][] = ['RSA-SHA256', 'HMAC-SHA256']
export const BINDINGS: Binding[] = ['HTTP-Redirect', 'HTTP-POST']

export const RELAY_STATES: { value: RelayStateKind; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'value', label: 'Custom attribute value' },
  { value: 'profile', label: 'Custom profile attribute' },
  { value: 'group', label: 'Custom group attribute' },
]

export const profileAttrLabel = (v: ProfileAttr): string => PROFILE_ATTRS.find((p) => p.value === v)?.label ?? v

// --- Defaults --------------------------------------------------------------------------

/** The live SAML form's defaults, with Basic empty. */
export function defaultSaml(): SamlSetup {
  return {
    kind: 'saml',
    entityId: '',
    acsUrl: '',
    audienceUri: '',
    sloUrl: '',
    signedRequest: false,
    signResponse: true,
    signAssertion: false,
    signatureAlgorithm: 'RSA-SHA256',
    encryptAssertion: false,
    relayState: 'none',
    relayStateValue: '',
    overrideRelayState: false,
    logoutResponseBinding: 'HTTP-POST',
    idpLogoutRequestBinding: 'HTTP-Redirect',
    validityPeriod: 300,
    sharedIdentity: false,
    authnContext: `${AC}PasswordProtectedTransport`,
    forceAuthentication: false,
    showOnDashboard: true,
    nameId: 'email',
    nameIdFormat: NAME_ID_FORMATS[0],
    addNameFormat: false,
    multiValued: false,
    attributes: [],
  }
}

/** The live OAuth form's defaults, with Basic empty but for the client id it makes. */
export function defaultOidc(clientId: string): OidcSetup {
  return {
    kind: 'oidc',
    redirectUrls: [''],
    clientId,
    subject: 'email',
    accessTokenHours: 1,
    idTokenHours: 1,
    refreshTokenDays: 14,
    signatureAlgorithm: 'RSA-SHA256',
    clientCredentialGrant: false,
    sharedIdentity: false,
    /* Off on the live OAuth form, on on the SAML one. */
    showOnDashboard: false,
    forceAuthentication: false,
    logoutUris: [],
    singleLogout: false,
    multiValued: false,
    attributes: [],
  }
}

/* A stable made-up hex string from a seed, so the same application shows the
   same client id on every load. FNV-1a, stretched. Never a real tenant's. */
export function fakeHex(seed: string, length: number): string {
  let out = ''
  let h = 0x811c9dc5
  let i = 0
  while (out.length < length) {
    h ^= seed.charCodeAt(i % Math.max(1, seed.length)) + i
    h = Math.imul(h, 0x01000193) >>> 0
    out += (h & 0xff).toString(16).padStart(2, '0')
    i += 1
  }
  return out.slice(0, length)
}

/** A new client id or secret: 32 random hex characters. */
export function randomHex(length = 32): string {
  const bytes = new Uint8Array(Math.ceil(length / 2))
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, length)
}

/* What the seed applications show on Basic. They predate setup, and an
   application with empty required fields would read as unfinished — and there
   is no such state (unfinished means draft). FABRICATED, on the showcase's
   made-up company "acme": the brand's own domain when the logo registry knows
   it, else the application's id under acme.com. */
export function seedSetup(app: { id: string; protocol: 'SAML' | 'OIDC' }, domain?: string): AppSetup {
  const host = domain ? `acme.${domain}` : `${app.id}.acme.com`
  if (app.protocol === 'OIDC') {
    return { ...defaultOidc(fakeHex(`client:${app.id}`, 32)), redirectUrls: [`https://${host}/oauth/callback`], showOnDashboard: true }
  }
  return { ...defaultSaml(), entityId: `https://${host}/saml/metadata`, acsUrl: `https://${host}/saml/acs` }
}

/* The domain the logo registry holds for an application id, a numbered copy's
   ("salesforce-2") included. */
export function brandDomain(appId: string): string | undefined {
  const base = logoBase(appId)
  return LOGO_SOURCES.find((s) => s.id === base || s.aliases?.includes(base))?.domain
}

/** "salesforce-2" → "salesforce": a second application added from one catalogue entry keeps its mark. */
export const logoBase = (appId: string): string => appId.replace(/-\d+$/, '')

/** The application's setup: its own, or the made-up one a seed application shows. Always the protocol's kind. */
export function setupOf(app: { id: string; protocol: 'SAML' | 'OIDC'; setup?: AppSetup }): AppSetup {
  const want = app.protocol === 'OIDC' ? 'oidc' : 'saml'
  if (app.setup && app.setup.kind === want) return app.setup
  return seedSetup(app, brandDomain(app.id))
}

// --- What the service provider needs ------------------------------------------------------

/* The values an admin pastes into the service provider: the live Metadata and
   Endpoints tabs, which the live console hides until the application is saved.
   The paths are the console's public pattern; the tenant segment is made up. */
const IDP = 'https://login.xecurify.com/moas'

export interface IdpValue {
  label: string
  value: string
}

export function idpValues(kind: AppSetup['kind'], appId: string, clientId?: string): IdpValue[] {
  if (kind === 'oidc') {
    return [
      { label: 'Authorization endpoint', value: `${IDP}/idp/openidsso` },
      { label: 'Token endpoint', value: `${IDP}/rest/oauth/token` },
      { label: 'User info endpoint', value: `${IDP}/rest/oauth/getuserinfo` },
      { label: 'Discovery endpoint', value: `${IDP}/discovery/v2.0/${clientId || 'client-id'}/.well-known/openid-configuration` },
    ]
  }
  return [
    { label: 'IdP entity ID', value: `${IDP}/acme` },
    { label: 'SAML sign-in URL', value: `${IDP}/idp/samlsso` },
    { label: 'SAML sign-out URL', value: `${IDP}/idp/samllogout` },
    { label: 'Metadata URL', value: `${IDP}/metadata/saml/acme/${appId}` },
  ]
}

// --- Checking ----------------------------------------------------------------------------

export const APP_NAME_MAX = 50
export const DESCRIPTION_MAX = 250

/** An absolute http(s) URL. */
export function isUrl(s: string, httpsOnly = false): boolean {
  try {
    const u = new URL(s.trim())
    return httpsOnly ? u.protocol === 'https:' : u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

/** Basic's problems, by field: what Save or Next says under each question. Empty when Basic is complete. */
export type BasicField = 'name' | 'entityId' | 'acsUrl' | 'audienceUri' | 'sloUrl' | 'redirectUrls' | 'clientId' | 'secret'

export function basicIssues(
  setup: AppSetup,
  name: string,
  otherNames: readonly string[],
  secret: string,
): Partial<Record<BasicField, string>> {
  const out: Partial<Record<BasicField, string>> = {}
  const n = name.trim()
  if (!n) out.name = 'Enter a display name.'
  else if (otherNames.some((o) => o.trim().toLowerCase() === n.toLowerCase())) out.name = 'An application with this name already exists.'
  if (setup.kind === 'saml') {
    if (!setup.entityId.trim()) out.entityId = 'Enter the SP entity ID or issuer.'
    if (!setup.acsUrl.trim()) out.acsUrl = 'Enter the ACS URL.'
    else if (!isUrl(setup.acsUrl, true)) out.acsUrl = 'Enter an https URL.'
    if (setup.audienceUri.trim() && !/^[a-z][a-z0-9+.-]*:/i.test(setup.audienceUri.trim())) out.audienceUri = 'Enter a URI.'
    if (setup.sloUrl.trim() && !isUrl(setup.sloUrl)) out.sloUrl = 'Enter a URL.'
  } else {
    const urls = setup.redirectUrls.map((u) => u.trim())
    if (!urls.some(Boolean)) out.redirectUrls = 'Enter a redirect URL.'
    else if (urls.some((u) => u && !isUrl(u))) out.redirectUrls = 'Enter each redirect URL as a URL.'
    if (!setup.clientId.trim()) out.clientId = 'Regenerate the client ID.'
    if (!secret.trim()) out.secret = 'Regenerate the client secret.'
  }
  return out
}

/* The setup as it is stored: text trimmed, and the rows a form leaves blank —
   an empty extra redirect URL or logout URI, an attribute with no name — left
   out. The review already reads those as nothing (`setupChanges`), so storing
   them would keep a page dirty over a difference nobody can see. */
export function cleanSetup(setup: AppSetup): AppSetup {
  const urls = (xs: readonly string[]) => xs.map((x) => x.trim()).filter(Boolean)
  const attributes = setup.attributes.filter((r) => r.name.trim()).map((r) => ({ ...r, name: r.name.trim() }))
  if (setup.kind === 'oidc') return { ...setup, redirectUrls: urls(setup.redirectUrls), logoutUris: urls(setup.logoutUris), attributes }
  return {
    ...setup,
    entityId: setup.entityId.trim(),
    acsUrl: setup.acsUrl.trim(),
    audienceUri: setup.audienceUri.trim(),
    sloUrl: setup.sloUrl.trim(),
    relayStateValue: setup.relayState === 'none' ? '' : setup.relayStateValue.trim(),
    attributes,
  }
}

// --- What changed -----------------------------------------------------------------------

/** The form tab a setup field sits on: the application page's Basic, Advanced, Sign-in options and Attributes. */
export type SetupTab = 'basic' | 'advanced' | 'sign-in' | 'attributes'

/* The application page's review: one row per field the draft changed, in the
   form's order, with the value before and after, and the tab it was changed
   on — the review files each row under it. A secret is never printed. */
export interface SetupChange {
  label: string
  before: string
  after: string
  tab: SetupTab
}

const onOff = (b: boolean) => (b ? 'On' : 'Off')
const list = (xs: readonly string[]) => xs.map((x) => x.trim()).filter(Boolean).join(', ') || 'None'
const attrs = (rows: readonly AttrRow[]) => rows.filter((r) => r.name.trim()).map((r) => `${r.name.trim()} = ${profileAttrLabel(r.value)}`).join(', ') || 'None'
const text = (s: string) => s.trim() || 'None'

type Reader<T> = [label: string, tab: SetupTab, read: (s: T) => string]

const SAML_FIELDS: Reader<SamlSetup>[] = [
  ['SP entity ID or issuer', 'basic', (s) => text(s.entityId)],
  ['ACS URL', 'basic', (s) => text(s.acsUrl)],
  ['Audience URI', 'basic', (s) => text(s.audienceUri)],
  ['Single logout URL', 'basic', (s) => text(s.sloUrl)],
  ['Signed request', 'advanced', (s) => onOff(s.signedRequest)],
  ['Sign response', 'advanced', (s) => onOff(s.signResponse)],
  ['Sign assertion', 'advanced', (s) => onOff(s.signAssertion)],
  ['Signature algorithm', 'advanced', (s) => s.signatureAlgorithm],
  ['Encrypt assertion', 'advanced', (s) => onOff(s.encryptAssertion)],
  ['Relay state', 'advanced', (s) => (s.relayState === 'none' ? 'None' : `${RELAY_STATES.find((r) => r.value === s.relayState)?.label}: ${text(s.relayStateValue)}`)],
  ['Override relay state', 'advanced', (s) => onOff(s.overrideRelayState)],
  ['Logout response binding', 'advanced', (s) => s.logoutResponseBinding],
  ['IdP-initiated logout request binding', 'advanced', (s) => s.idpLogoutRequestBinding],
  ['SAML authentication validity period', 'advanced', (s) => String(s.validityPeriod)],
  ['Enable shared identity', 'advanced', (s) => onOff(s.sharedIdentity)],
  ['AuthnContext class', 'advanced', (s) => authnContextLabel(s.authnContext)],
  ['Force authentication', 'sign-in', (s) => onOff(s.forceAuthentication)],
  ['Show on end user dashboard', 'sign-in', (s) => onOff(s.showOnDashboard)],
  ['Name ID', 'attributes', (s) => profileAttrLabel(s.nameId)],
  ['Name ID format', 'attributes', (s) => nameIdFormatLabel(s.nameIdFormat)],
  ['Add name format', 'attributes', (s) => onOff(s.addNameFormat)],
  ['Enable multi-valued attributes', 'attributes', (s) => onOff(s.multiValued)],
  ['Attribute mapping', 'attributes', (s) => attrs(s.attributes)],
]

const OIDC_FIELDS: Reader<OidcSetup>[] = [
  ['Redirect URL', 'basic', (s) => list(s.redirectUrls)],
  ['Client ID', 'basic', (s) => s.clientId],
  ['Subject', 'basic', (s) => profileAttrLabel(s.subject)],
  ['Access token expiry (in hours)', 'advanced', (s) => String(s.accessTokenHours)],
  ['ID token expiry (in hours)', 'advanced', (s) => String(s.idTokenHours)],
  ['Refresh token expiry (in days)', 'advanced', (s) => String(s.refreshTokenDays)],
  ['Signature algorithm', 'advanced', (s) => s.signatureAlgorithm],
  ['Client credential grant', 'advanced', (s) => onOff(s.clientCredentialGrant)],
  ['Enable shared identity', 'advanced', (s) => onOff(s.sharedIdentity)],
  ['Show on end user dashboard', 'sign-in', (s) => onOff(s.showOnDashboard)],
  ['Force authentication', 'sign-in', (s) => onOff(s.forceAuthentication)],
  ['Allowed logout URIs', 'sign-in', (s) => list(s.logoutUris)],
  ['Single logout enabled', 'sign-in', (s) => onOff(s.singleLogout)],
  ['Enable multi-valued attributes', 'attributes', (s) => onOff(s.multiValued)],
  ['Attribute mapping', 'attributes', (s) => attrs(s.attributes)],
]

export function setupChanges(before: AppSetup, after: AppSetup): SetupChange[] {
  if (before.kind !== after.kind) return [{ label: 'Protocol', before: before.kind.toUpperCase(), after: after.kind.toUpperCase(), tab: 'basic' }]
  const fields = (before.kind === 'saml' ? SAML_FIELDS : OIDC_FIELDS) as Reader<AppSetup>[]
  return fields.flatMap(([label, tab, read]) => {
    const b = read(before)
    const a = read(after)
    return a === b ? [] : [{ label, before: b, after: a, tab }]
  })
}

/** Whether a setup asks for the application on the end user's dashboard. */
export const shownOnDashboard = (setup: AppSetup | undefined): boolean => setup?.showOnDashboard ?? true
