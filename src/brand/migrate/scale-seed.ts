/* -----------------------------------------------------------------------------
   The old console at scale: about a hundred App Login rows (owner, 3 Nov 2026: "100
   policies can be there that can be moved, so things can be very difficult and edgy").

   FABRICATED. The nine showcase rows come first and are unchanged (legacy.ts); then
   forty-seven more applications, each given one of eight shapes an old tenant really
   has, and a handful of rows built to be awkward. Every edge case the move has to
   survive is here at least once:

   - ten applications with identical settings          one merge offer, not 45 pairs
   - one adaptive policy named by many rows             one zone, reused
   - an adaptive policy whose name a zone already has   "India 2"
   - restrictions joined with OR                        one card holding every failure
   - an adaptive policy that is only a device count     no rule, under Left out
   - a DEFAULT row with restrictions                    a catch-all fail rule above the last row
   - old method names ("RSA MFA", "FIDO2 (Biometric)") and one the tenant has none of
   - the same group twice on one application            the second under Left out
   - a group and an application that no longer exist    refused at Select
   - an application name too long for "… sign-in"       a name cut to 50
   -------------------------------------------------------------------------- */
import { apps as catalogue, type App } from '../data'
import { DEFAULT_GROUP, DEFAULT_METHOD, showcaseLegacy, type LegacyAdaptive, type LegacyEstate, type LegacyPolicy } from './legacy'

const CATALOGUE_IDS = ['m365', 'hr-portal', 'finance-dashboard', 'corporate-email', 'vpn-portal', 'admin-console', 'payroll', 'wiki', 'crm', 'trading', 'erp', 'dms', 'pam']

const MADE: [string, string, string, string][] = [
  ['notion', 'Notion', '▤', '#191919'],
  ['figma', 'Figma', '◈', '#a259ff'],
  ['asana', 'Asana', '◎', '#f06a6a'],
  ['miro', 'Miro', '▰', '#f7c922'],
  ['docusign', 'DocuSign', '✎', '#4c00ff'],
  ['zendesk', 'Zendesk', '◩', '#03363d'],
  ['hubspot', 'HubSpot', '✺', '#ff7a59'],
  ['tableau', 'Tableau', '✚', '#e97627'],
  ['confluence', 'Confluence', '≋', '#1868db'],
  ['bitbucket', 'Bitbucket', '◬', '#2684ff'],
  ['datadog', 'Datadog', '◕', '#632ca6'],
  ['pagerduty', 'PagerDuty', '◉', '#06ac38'],
  ['snowflake', 'Snowflake', '❄', '#29b5e8'],
  ['erp-prod', 'Enterprise Resource Planning — Production Environment', '▩', '#5b21b6'],
  ['gitlab', 'GitLab', '◭', '#fc6d26'],
  ['linear', 'Linear', '◢', '#5e6ad2'],
  ['sentry', 'Sentry', '◓', '#362d59'],
  ['okr', 'OKR Tracker', '◎', '#0f766e'],
  ['expensify', 'Expensify', '₹', '#0b1b34'],
  ['greenhouse', 'Greenhouse', '❦', '#24a47f'],
  ['lattice', 'Lattice', '⋈', '#1d4ed8'],
  ['intercom', 'Intercom', '◘', '#1f8ded'],
  ['mixpanel', 'Mixpanel', '◔', '#7856ff'],
  ['looker', 'Looker', '◉', '#4285f4'],
  ['airtable', 'Airtable', '▦', '#fcb400'],
  ['dropbox-sign', 'Dropbox Sign', '✒', '#0061fe'],
  ['freshdesk', 'Freshdesk', '◍', '#25c16f'],
  ['smartsheet', 'Smartsheet', '▤', '#0b347d'],
  ['segment', 'Segment', '◐', '#52bd94'],
  ['vault', 'HashiCorp Vault', '⛨', '#000000'],
  ['jamf', 'Jamf Pro', '◈', '#3a3a3a'],
  ['workplace', 'Workplace', '▥', '#4267b2'],
  ['canva', 'Canva', '◌', '#00c4cc'],
  ['loom', 'Loom', '◯', '#625df5'],
]

/** Applications the old console protects that the showcase tenant's list does not have yet. */
export const scaleApps: App[] = [
  ...catalogue.filter((a) => CATALOGUE_IDS.includes(a.id)),
  ...MADE.map(([id, name, glyph, tint]): App => ({ id, name, protocol: 'SAML', glyph, tint, type: 'SAML/WS-FED', lastUpdated: 'Oct 02, 2026, 09:00:00' })),
]

const ADAPTIVE: LegacyAdaptive[] = [
  { id: 'ad-ops-hours', name: 'Operating hours', time: { days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], from: '07:00', to: '22:00', tz: 'Asia/Kolkata' }, onFail: 'challenge' },
  { id: 'ad-admin-devices', name: 'Admin devices', device: { max: 1 }, onFail: 'deny' },
  { id: 'ad-india-net', name: 'India', ip: ['198.51.100.0/24'], onFail: 'deny' },
  {
    id: 'ad-sales-anywhere',
    name: 'Sales on the road',
    location: { countries: ['India', 'United Kingdom'] },
    time: { days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], from: '08:00', to: '20:00', tz: 'Asia/Kolkata' },
    onFail: 'challenge',
  },
]

type Shape = (appId: string, name: string) => Omit<LegacyPolicy, 'id' | 'appId'>[]

const row = (name: string, groupId: string, rest: Partial<LegacyPolicy> = {}): Omit<LegacyPolicy, 'id' | 'appId'> => ({
  name,
  groupId,
  firstFactor: 'Password',
  ...rest,
})

/* Eight shapes, dealt out in turn. The first is dealt ten times on purpose: ten identical applications. */
const STANDARD: Shape = (_, n) => [
  row(`${n} Employees`, 'employees', { mfa: { method: DEFAULT_METHOD, rememberDays: 30 } }),
  row(`${n} Default`, DEFAULT_GROUP, { mfa: { method: DEFAULT_METHOD, rememberDays: 30 } }),
]

/* Every other application gets one more group, by turn, so two applications dealt the same shape still differ
   (only the ten above are meant to be identical). Never a group the shape already names. */
const EXTRA: [string, string, string][] = [
  ['design', 'Design', 'Microsoft Authenticator'],
  ['hr', 'HR', 'OTP over Email'],
  ['executives', 'Executives', 'miniOrange Push'],
  ['devops', 'DevOps', 'Google Authenticator'],
  ['sales', 'Sales', 'OTP over SMS'],
  ['finance', 'Finance', 'Authy Authenticator'],
]
const SHAPES: Shape[] = [
  (_, n) => [row(`${n} Engineering`, 'engineering', { mfa: { method: 'Google Authenticator' } }), row(`${n} Default`, DEFAULT_GROUP)],
  (_, n) => [
    row(`${n} Finance`, 'finance', { mfa: { method: 'OTP over Email', rememberDays: 7 }, adaptive: { policyId: 'ad-india', using: 'and', checks: ['location'] } }),
    row(`${n} Executives`, 'executives', { mfa: { method: 'miniOrange Push' } }),
  ],
  (_, n) => [
    row(`${n} Contractors`, 'contractors', { mfa: { method: 'OTP over SMS' }, adaptive: { policyId: 'ad-contractor', using: 'and', checks: ['ip'] } }),
    row(`${n} Employees`, 'employees', { mfa: { method: DEFAULT_METHOD } }),
    row(`${n} Default`, DEFAULT_GROUP),
  ],
  (_, n) => [row(`${n} Sales`, 'sales', { adaptive: { policyId: 'ad-sales-anywhere', using: 'or', checks: ['location', 'time'] } }), row(`${n} Default`, DEFAULT_GROUP)],
  (_, n) => [
    row(`${n} IT Admins`, 'it-admins', { mfa: { method: 'Yubikey Token' }, adaptive: { policyId: 'ad-admin-devices', using: 'and', checks: ['device'] } }),
    row(`${n} Default`, DEFAULT_GROUP, { mfa: { method: DEFAULT_METHOD } }),
  ],
  (_, n) => [
    row(`${n} Engineering`, 'engineering', { mfa: { method: 'RSA MFA' } }),
    row(`${n} HR`, 'hr', { firstFactor: 'Password-less', mfa: { method: 'FIDO2 (Biometric)' } }),
    row(`${n} Design`, 'design', { mfa: { method: 'Grid Token' } }),
  ],
  (_, n) => [row(`${n} Default`, DEFAULT_GROUP, { mfa: { method: DEFAULT_METHOD, userCanTurnOff: true }, adaptive: { policyId: 'ad-ops-hours', using: 'and', checks: ['time'] } })],
  (_, n) => [
    row(`${n} DevOps`, 'devops', { mfa: { method: 'Google Authenticator' }, forceMfa: true, adaptive: { policyId: 'ad-india-net', using: 'and', checks: ['ip'] } }),
    row(`${n} Engineering`, 'engineering', { mfa: { method: 'Google Authenticator' } }),
  ],
]

function deal(): LegacyPolicy[] {
  const out: LegacyPolicy[] = []
  scaleApps.forEach((app, i) => {
    const rows = i < 10 ? STANDARD(app.id, app.name) : SHAPES[(i - 10) % SHAPES.length](app.id, app.name)
    if (i >= 10) {
      const free = EXTRA.filter(([g]) => !rows.some((r) => r.groupId === g))
      const [g, label, method] = free[(i - 10) % free.length]
      rows.splice(rows.length - (rows.at(-1)?.groupId === DEFAULT_GROUP ? 1 : 0), 0, row(`${app.name} ${label}`, g, { mfa: { method } }))
    }
    rows.forEach((r, k) => out.push({ ...r, id: `lp-${app.id}-${k}`, appId: app.id }))
  })
  return out
}

/* The awkward rows, on applications above. */
const EDGES: LegacyPolicy[] = [
  { id: 'lp-notion-sales-dup', name: 'Notion Sales (copy)', groupId: 'sales', appId: 'notion', firstFactor: 'Password', mfa: { method: 'OTP over SMS' } },
  { id: 'lp-gone-group', name: 'Asana Marketing', groupId: 'marketing', appId: 'asana', firstFactor: 'Password' },
  { id: 'lp-gone-app', name: 'Legacy Intranet Default', groupId: DEFAULT_GROUP, appId: 'legacy-intranet', firstFactor: 'Password' },
]

/** The showcase's nine rows, then the scale rows, then the edges, with every adaptive policy they name. */
export const scaleLegacy: LegacyEstate = {
  adaptive: [...showcaseLegacy.adaptive, ...ADAPTIVE],
  policies: [...showcaseLegacy.policies, ...deal(), ...EDGES],
}
