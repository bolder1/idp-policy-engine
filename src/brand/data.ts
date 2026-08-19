/* ---------------------------------------------------------------------------
   The model, kept as the current prototype has it.

   This is deliberately NOT the reworked engine from the other version. The
   brief for this pass is a brand and experience revamp with the existing
   functions left where they are, so the shape here mirrors what ships today:
   a policy contains ordered rules, rules are evaluated top to bottom, first
   match wins, and a pinned default rule catches the rest.
   --------------------------------------------------------------------------- */

export type PolicyType = 'App Access' | 'Session' | 'Account Management'

/* `monitor` is the framework doc's report-only, and it is the reason the two
   predicates below exist.

   Entra ships it as a first-class policy state and the doc lists it as an open
   question with its own answer already attached — "would meaningfully de-risk
   rollout and should be cheap if we design the PDP to log decisions
   regardless." It is also §6.4's migration mechanism: run the new engine
   alongside the old one, log both, flip when they agree.

   A monitor policy **evaluates and does not enforce.** That is one sentence and
   two different questions, which every surface in this console was previously
   answering with `status !== 'inactive'` — a test that silently counts a
   monitor policy as protection the moment the state exists. Hence: */
export type PolicyStatus = 'active' | 'inactive' | 'monitor' | 'always-on'

/** Decides real sign-ins. The question Coverage, conflicts and cover-counts ask. */
export const enforces = (p: { status: PolicyStatus }) =>
  p.status === 'active' || p.status === 'always-on'

/** Runs and records what it would have done. Enforcing implies evaluating. */
export const evaluates = (p: { status: PolicyStatus }) => enforces(p) || p.status === 'monitor'

export interface App {
  id: string
  name: string
  protocol: 'SAML' | 'OIDC'
  glyph: string
  tint: string
}

export interface Group {
  id: string
  name: string
  memberCount: number
}

// --- Conditions --------------------------------------------------------------

export type Joiner = 'AND' | 'OR'

export interface ConditionType {
  id: string
  label: string
  group: string
  hint: string
  operators: string[]
  /** Where the value comes from: a library object, a fixed list, or free text. */
  valueKind: 'zone' | 'fingerprint' | 'hook' | 'list' | 'text' | 'range' | 'time'
  options?: string[]
}

export const CONDITION_CATALOGUE: ConditionType[] = [
  { id: 'ip', label: 'IP Address', group: 'Network', hint: 'Match by IPv4/IPv6 address, range, or CIDR', operators: ['is', 'is not'], valueKind: 'text' },
  { id: 'zone', label: 'Network Zone', group: 'Network', hint: 'Match by named zone from your library', operators: ['in zone', 'not in zone'], valueKind: 'zone' },

  { id: 'country', label: 'Country', group: 'Location', hint: 'Match by country', operators: ['is', 'is not'], valueKind: 'list', options: ['India', 'United States', 'United Kingdom', 'Germany', 'Singapore'] },
  { id: 'state', label: 'State / Province', group: 'Location', hint: 'Match by state or region', operators: ['is', 'is not'], valueKind: 'list', options: ['Maharashtra', 'Karnataka', 'California', 'Texas'] },
  { id: 'city', label: 'City', group: 'Location', hint: 'Match by city', operators: ['is', 'is not'], valueKind: 'list', options: ['Pune', 'Bengaluru', 'London', 'Austin'] },
  { id: 'coords', label: 'Coordinates', group: 'Location', hint: 'Match within a geographic radius', operators: ['within'], valueKind: 'range' },

  { id: 'time', label: 'Time', group: 'Time', hint: 'Match by login time, timezone, and day of week', operators: ['between', 'not between'], valueKind: 'time' },

  { id: 'device-type', label: 'Device Type', group: 'Device', hint: 'Mobile, PC, tablet, etc.', operators: ['is', 'is not'], valueKind: 'list', options: ['Mobile', 'PC', 'Tablet', 'Other'] },
  { id: 'mac', label: 'MAC Address', group: 'Device', hint: 'Match device MAC addresses', operators: ['is', 'is not'], valueKind: 'text' },
  { id: 'os', label: 'Operating System', group: 'Device', hint: 'Match OS name and version', operators: ['is', 'is not'], valueKind: 'list', options: ['Windows', 'macOS', 'iOS', 'Android', 'Linux', 'ChromeOS'] },
  { id: 'mdm', label: 'MDM Managed', group: 'Device', hint: 'Require MDM enrollment', operators: ['is', 'is not'], valueKind: 'list', options: ['Enrolled', 'Not enrolled'] },
  { id: 'browser', label: 'Browser', group: 'Device', hint: 'Match browser name and version', operators: ['is', 'is not'], valueKind: 'list', options: ['Chrome', 'Edge', 'Safari', 'Firefox'] },
  { id: 'device-risk', label: 'Device Risk Score', group: 'Device', hint: 'Device risk management score', operators: ['above', 'below'], valueKind: 'range' },
  { id: 'ml-risk', label: 'ML Risk Score', group: 'Device', hint: 'AI-derived overall risk score', operators: ['is', 'is not'], valueKind: 'list', options: ['Low', 'Medium', 'High'] },
  { id: 'device-count', label: 'Number of Devices', group: 'Device', hint: 'Limit registered devices per user', operators: ['above', 'below'], valueKind: 'range' },
  { id: 'device-reg', label: 'Device Registration', group: 'Device', hint: 'Registered, pending, or unregistered', operators: ['is', 'is not'], valueKind: 'list', options: ['Registered', 'Pending', 'Unregistered'] },
  /* Replaced the old Device Posture Policy condition. Posture asked whether a
     device was healthy; this asks whether it is the same device as last time,
     which is what the fingerprint profiles actually decide. */
  { id: 'fingerprint', label: 'Device Fingerprint', group: 'Device', hint: 'Match by saved fingerprint profile from your library', operators: ['recognised by', 'not recognised by'], valueKind: 'fingerprint' },

  { id: 'group', label: 'Group Membership', group: 'User', hint: "Match by user's group", operators: ['in', 'not in'], valueKind: 'list', options: ['All Employees', 'Finance', 'Engineering', 'Executives', 'Contractors', 'IT Admins'] },
  { id: 'user-type', label: 'User Type', group: 'User', hint: 'Employee, contractor, or partner', operators: ['is', 'is not'], valueKind: 'list', options: ['Employee', 'Contractor', 'Partner'] },
  { id: 'user-role', label: 'User Role', group: 'User', hint: 'Match by assigned user role', operators: ['is', 'is not'], valueKind: 'list', options: ['Admin', 'Manager', 'Member', 'Auditor'] },
  { id: 'auth-state', label: 'Auth State', group: 'User', hint: 'First login, MFA reset, preferred method', operators: ['is'], valueKind: 'list', options: ['First time login', 'MFA recently reset', 'No MFA configured', 'Normal returning user'] },
  { id: 'trust-age', label: 'Device Trust Age', group: 'User', hint: 'Known device trust duration', operators: ['under', 'over'], valueKind: 'range' },

  { id: 'group-attr', label: 'Group Attribute', group: 'Group', hint: "Match by group's custom attributes", operators: ['is', 'is not'], valueKind: 'text' },
  { id: 'user-attr', label: 'User Attribute', group: 'Custom attributes', hint: 'Match email, designation, age, and more', operators: ['is', 'is not', 'contains'], valueKind: 'text' },
  /* Was a free-text box. It is now a reference to a Hook, for the same reason
     the network condition references a Zone rather than carrying a CIDR: every
     rule that consults the fraud service consults the same fraud service, and
     an endpoint written into each condition makes rotating a URL an audit of
     every policy in the tenant. See hooks.ts. */
  { id: 'webhook', label: 'External hook', group: 'Webhooks', hint: 'Ask an external endpoint, and use its answer as a condition', operators: ['returns true', 'returns false'], valueKind: 'hook' },
]

export function conditionType(id: string): ConditionType {
  return CONDITION_CATALOGUE.find((c) => c.id === id) ?? CONDITION_CATALOGUE[0]
}

export interface Condition {
  id: string
  typeId: string
  operator: string
  values: string[]
  /** Joiner to the PREVIOUS condition. Ignored on the first. */
  joiner: Joiner
}

// --- Rules -------------------------------------------------------------------

export type AccessDecision = 'deny' | '1fa' | '2fa'

export const DECISION_LABEL: Record<AccessDecision, string> = {
  deny: 'Deny',
  '1fa': '1 factor',
  '2fa': '2 factors',
}

export const DECISION_CAPTION: Record<AccessDecision, string> = {
  deny: 'Block access',
  '1fa': 'One step',
  '2fa': 'Two steps',
}

export interface Rule {
  id: string
  name: string
  /* Why this rule exists, in the author's words.

     A name says what a rule does; it cannot say what it is for. "Off-network
     finance access" tells the next administrator the predicate and nothing
     about the decision behind it — whether it exists because of a regulator,
     because of an incident, or because somebody was experimenting in March.
     Those three have completely different answers to "can I delete this".

     The framework doc's third persona is defined by wanting exactly this:
     "every rule needs a name, a description, a rationale". Two of the three
     had nowhere to live. Optional rather than required, because forcing a
     sentence out of somebody mid-edit produces "asdf" and teaches everyone
     afterwards that the field is noise. */
  description?: string
  enabled: boolean
  appliesTo: string[]
  conditions: Condition[]
  decision: AccessDecision
  firstFactor: 'Password' | 'Any' | 'Specific'
  /** Which method, when firstFactor is 'Specific'. */
  firstFactorMethod?: string
  secondFactor: 'any' | 'specific' | 'chain' | 'preferred'
  /** Chosen methods, when secondFactor is 'specific'. */
  secondFactorMethods?: string[]
  /** Ordered steps, when secondFactor is 'chain'. */
  methodChain?: string[]
  /** Fallback method, when secondFactor is 'preferred' and the user set none. */
  preferredFallback?: string
  rememberMfa: boolean
  /** How long a remembered device stays trusted. */
  rememberDays?: number
  /** Prompt for MFA every login even on a remembered device. */
  forceMfaEachLogin?: boolean
  allowDisable2fa: boolean
  /** Rough population the rule matches — shown live while editing. */
  matchEstimate: number
}

export interface Policy {
  id: string
  name: string
  type: PolicyType
  appIds: string[]
  allApps?: boolean
  status: PolicyStatus
  lastModified: string
  modifiedBy: string
  rules: Rule[]
  /** The current prototype shows a red dot with no explanation; here it says why. */
  configIssue?: string
  isSystem?: boolean
}

// --- Library objects ---------------------------------------------------------

/* One zone type, two optional sections, combined with AND.

   The old model made the administrator pick a kind up front — IP or Geo or ASN —
   which forced "Reliance Jio, but only inside India" to be two zones that could
   not be intersected. A single zone with two sections expresses it directly.

   An empty section means MATCH ANY, not match none. That is the whole subtlety
   of the model and the reason the UI says "Any location" rather than leaving a
   field blank: blank reads as unset, and unset reads as restrictive, which is
   the opposite of what it does. */
export interface ZoneLocation {
  countries: string[]
  states: string[]
  cities: string[]
  /** A circle on the map, for sites without a clean administrative boundary. */
  radius?: { km: number; lat: number; lon: number; label?: string }
}

/* What a zone is *for*. A zone is only a boundary — it says where a request
   came from, not what to do about it — but in practice every one is written
   with an intention, and leaving that intention unrecorded meant a list of
   zones read as a list of undifferentiated address blocks. Naming it lets the
   list group, and lets a rule-writer see whether a zone is somewhere you trust
   or somewhere you do not before opening it. */
export type ZoneKind = 'allowed' | 'blocked' | 'custom'

export interface Zone {
  id: string
  name: string
  kind: ZoneKind
  /** IPv4/IPv6 addresses, CIDR blocks, and ranges. */
  ip: string[]
  /** Autonomous System Numbers — a whole network operator at once. */
  asn: string[]
  location: ZoneLocation
  usedIn: number
  /* The two defaults ship with the tenant and every rule can assume they
     exist, so they are editable but not removable. Deleting them would break
     that assumption for every policy written after them. */
  locked?: boolean
}

export const emptyLocation = (): ZoneLocation => ({ countries: [], states: [], cities: [] })

/** True when the section places no constraint, i.e. it matches anything. */
export const ipSectionEmpty = (z: Zone) => z.ip.length === 0 && z.asn.length === 0
export const locationEmpty = (l: ZoneLocation) =>
  l.countries.length === 0 && l.states.length === 0 && l.cities.length === 0 && !l.radius

/* The authentication catalogue, read off the prototype's 2-Factor
   Authentication → Methods tab.

   Two facts here are the reason a method set is not just a list of strings.

   `enabled` is tenant-wide: the 2FA page decides which factors exist at all, and
   a method that is off there cannot be satisfied by any user, whatever a policy
   rule asks for. A set containing one is a set that cannot be met.

   `variants` matter because the catalogue is two levels deep — "Email" is the
   method, "OTP over Email" and "Email Link" are the ways it can be delivered.
   Sets reference the method, not the delivery, or the same set would mean
   different things as delivery options are toggled. */
export interface AuthMethod {
  id: string
  name: string
  group: 'Phishing-Resistant' | 'Standard MFA' | 'Fallback & Recovery'
  description: string
  variants?: string[]
  phishingResistant?: boolean
  /** Switched on tenant-wide. Off means no user can complete it. */
  enabled: boolean
  enrolled?: number
  /** Shared with the Recovery configuration, so disabling it there matters. */
  alsoRecovery?: boolean
}

export const AUTH_METHODS: AuthMethod[] = [
  {
    id: 'passkey', name: 'WebAuthn / FIDO2 + Passkeys', group: 'Phishing-Resistant',
    description: "Built into the user's device — Face ID, Windows Hello, or platform passkey. No separate hardware required.",
    variants: ['FIDO2 / Passkey'], phishingResistant: true, enabled: true, enrolled: 1203,
  },
  {
    id: 'seckey', name: 'Security Keys (FIDO2 / WebAuthn)', group: 'Phishing-Resistant',
    description: 'External USB or NFC device the user carries and taps or inserts. Required for platforms without built-in biometrics.',
    phishingResistant: true, enabled: false,
  },

  {
    id: 'mo-auth', name: 'miniOrange Authenticator', group: 'Standard MFA',
    description: 'Push notifications, OTP, and QR-based verification via the miniOrange app.',
    variants: ['miniOrange Push', 'miniOrange OTP', 'miniOrange QR Verify'], enabled: true, enrolled: 1203,
  },
  {
    id: 'auth-apps', name: 'Authenticator Apps', group: 'Standard MFA',
    description: 'Time-based one-time codes from third-party authenticator apps.',
    variants: ['Google Authenticator', 'Microsoft Authenticator', 'Authy Authenticator', 'Microsoft Push'],
    enabled: true, enrolled: 847,
  },
  {
    id: 'sms', name: 'SMS', group: 'Standard MFA',
    description: 'OTP over SMS, SMS Link, and OTP over SMS and Email.',
    variants: ['OTP over SMS', 'SMS Link', 'OTP over SMS and Email'], enabled: true, enrolled: 512,
  },
  {
    id: 'email', name: 'Email', group: 'Standard MFA',
    description: 'OTP over Email, Email Link, and OTP over Alternate Email.',
    variants: ['OTP over Email', 'Email Link'], enabled: true, enrolled: 612,
  },
  {
    id: 'call', name: 'Call Verification', group: 'Standard MFA',
    description: 'Automated voice call with a spoken one-time code.', enabled: false,
  },
  {
    id: 'grid', name: 'Grid Pattern', group: 'Standard MFA',
    description: 'User-defined grid coordinates entered as a second factor.', enabled: false,
  },
  {
    id: 'hw-otp', name: 'Hardware OTP Tokens', group: 'Standard MFA',
    description: 'Yubikey, Display Token, Vasco. Generates a one-time code; can be phished or replayed like any OTP.',
    enabled: false,
  },
  {
    id: 'smartcard', name: 'Smart Cards (CAC)', group: 'Standard MFA',
    description: 'Certificate-based smart card / CAC login.', enabled: false,
  },
  {
    id: 'rsa', name: 'RSA Authenticator (SecurID)', group: 'Standard MFA',
    description: 'RSA SecurID token codes.', enabled: false,
  },
  {
    id: 'biometric', name: 'Biometric', group: 'Standard MFA',
    description: 'Device-based biometric verification — fingerprint reader or platform passkey.', enabled: false,
  },
  {
    id: 'kba', name: 'Security Questions', group: 'Standard MFA',
    description: 'Knowledge-based answers (KBA). Shared with your Recovery configuration.',
    enabled: true, enrolled: 390, alsoRecovery: true,
  },

  {
    id: 'password', name: 'Password', group: 'Fallback & Recovery',
    description: 'Standard password-based sign in. Configure the password policy end users must follow.',
    enabled: true,
  },
]

export const METHOD_GROUPS: { name: AuthMethod['group']; blurb: string }[] = [
  { name: 'Phishing-Resistant', blurb: 'Cryptographically bound credentials. Cannot be replayed or intercepted.' },
  { name: 'Standard MFA', blurb: 'One-time codes and push notifications. Effective but susceptible to phishing.' },
  { name: 'Fallback & Recovery', blurb: 'Break-glass options for when primary methods are unavailable. Not recommended as primary authentication.' },
]

export const methodByName = (n: string) => AUTH_METHODS.find((m) => m.name === n)

export interface MethodSet {
  id: string
  name: string
  /* Why this set exists, in the author's words.

     Not decoration. A set is referenced from a rule by name alone, so the
     next administrator sees "Phishing-resistant only" and has to infer both
     what is in it and when to reach for it. One sentence at the point of
     authoring is the cheapest way to stop a second, nearly-identical set being
     created six months later by someone who could not tell what this one was
     for. */
  description?: string
  /** Method names from AUTH_METHODS — never variant names. */
  methods: string[]
  usedIn: number
}

export interface Template {
  id: string
  name: string
  category: 'Quick Protection' | 'Device-based' | 'Risk-based' | 'Compliance' | 'Uncategorized'
  description: string
  ruleCount: number
  author: string
  when: string
  provided?: boolean
  /** Same dated attribution as Scenario — see the note there. */
  reviewed?: { by: string; on: string }
  rules: { name: string; ifText: string; decision: AccessDecision }[]
}

// --- Seed --------------------------------------------------------------------

export const apps: App[] = [
  { id: 'salesforce', name: 'Salesforce', protocol: 'SAML', glyph: '☁', tint: '#199fd8' },
  { id: 'workday', name: 'Workday', protocol: 'SAML', glyph: '▲', tint: '#f5a623' },
  { id: 'github', name: 'GitHub Enterprise', protocol: 'OIDC', glyph: '◐', tint: '#24292e' },
  { id: 'm365', name: 'Microsoft 365', protocol: 'SAML', glyph: '▦', tint: '#e14c2a' },
  { id: 'jira', name: 'Jira', protocol: 'OIDC', glyph: '◆', tint: '#2684ff' },
  { id: 'slack', name: 'Slack', protocol: 'SAML', glyph: '✳', tint: '#611f69' },
  { id: 'aws', name: 'AWS Console', protocol: 'SAML', glyph: '◢', tint: '#ff9900' },
  { id: 'zoom', name: 'Zoom', protocol: 'SAML', glyph: '▣', tint: '#2d8cff' },
  { id: 'box', name: 'Box', protocol: 'OIDC', glyph: '▢', tint: '#0061d5' },
  { id: 'servicenow', name: 'ServiceNow', protocol: 'SAML', glyph: '◉', tint: '#62d84e' },
]

export const groups: Group[] = [
  { id: 'all', name: 'All Employees', memberCount: 1240 },
  { id: 'finance', name: 'Finance', memberCount: 86 },
  { id: 'engineering', name: 'Engineering', memberCount: 310 },
  { id: 'executives', name: 'Executives', memberCount: 12 },
  { id: 'contractors', name: 'Contractors', memberCount: 154 },
  { id: 'it-admins', name: 'IT Admins', memberCount: 9 },
]

export const zones: Zone[] = [
  /* The two defaults. Every tenant gets them, every rule can name them, and
     neither can be deleted — only emptied, which is the honest way to switch
     one off. */
  {
    id: 'default-allowed',
    name: 'Allowed locations',
    kind: 'allowed',
    ip: ['10.0.0.0/8', '192.168.0.0/16'],
    asn: [],
    location: { countries: ['India'], states: [], cities: [] },
    usedIn: 0,
    locked: true,
  },
  {
    /* Seeded rather than empty, and the linter is the reason: an empty zone
       matches everything, so a default Blocked zone shipped blank would deny
       every sign-in the moment somebody wrote the obvious rule against it. It
       ships with the one thing every tenant agrees is worth blocking — known
       anonymising infrastructure — and can be emptied deliberately by somebody
       who has read the warning. */
    id: 'default-blocked',
    name: 'Blocked locations',
    kind: 'blocked',
    ip: ['185.220.101.0/24'],
    asn: ['AS9009'],
    location: { countries: [], states: [], cities: [] },
    usedIn: 0,
    locked: true,
  },
  /* Worked example 1 — address only. Inside the zone regardless of where it
     geolocates, which is what an office egress block should mean. */
  {
    id: 'office',
    kind: 'allowed',
    name: 'Office Network',
    ip: ['10.0.0.0/8', '192.168.1.0/24', '203.0.113.5', '198.51.100.0/24', '172.16.0.0/12', '2001:db8::/32'],
    asn: [],
    location: emptyLocation(),
    usedIn: 6,
  },
  /* Worked example 2 — location only. The remote-workforce case: the addresses
     rotate, so they cannot be enumerated. */
  {
    id: 'eu',
    kind: 'custom',
    name: 'EU Countries',
    ip: [],
    asn: [],
    location: { countries: ['Germany', 'France'], states: [], cities: [] },
    usedIn: 2,
  },
  {
    id: 'asn',
    kind: 'allowed',
    name: 'Corporate ASN',
    ip: [],
    asn: ['AS64512'],
    location: emptyLocation(),
    usedIn: 1,
  },
  /* Worked example 3 — the AND genuinely narrowing. One operator spans several
     countries and one country holds many operators, so neither half alone says
     what this zone says. */
  {
    id: 'jio-in',
    kind: 'custom',
    name: 'Reliance Jio · India',
    ip: [],
    asn: ['AS55836'],
    location: { countries: ['India'], states: [], cities: [] },
    usedIn: 0,
  },
  {
    id: 'pune-hq',
    name: 'Pune HQ · 25km',
    kind: 'custom',
    ip: [],
    asn: [],
    location: {
      countries: ['India'],
      states: ['Maharashtra'],
      cities: [],
      radius: { km: 25, lat: 18.5204, lon: 73.8567, label: 'Pune HQ' },
    },
    usedIn: 0,
  },
  {
    id: 'anon',
    kind: 'blocked',
    name: 'Anonymizers',
    ip: ['185.220.101.0/24', '185.220.102.0/24'],
    asn: ['AS9009', 'AS16276'],
    location: emptyLocation(),
    usedIn: 4,
  },
]

/** Known operators, so an ASN can be shown as more than a number. */
export const ASN_DIRECTORY: Record<string, string> = {
  AS15169: 'Google LLC',
  AS16509: 'Amazon AWS',
  AS55836: 'Reliance Jio',
  AS9498: 'Bharti Airtel',
  AS64512: 'Corporate (private range)',
  AS9009: 'M247 — hosting',
  AS16276: 'OVH — hosting',
}

export const methodSets: MethodSet[] = [
  /* Names must resolve against AUTH_METHODS in methods.ts — a set referencing a
     name that no longer exists silently contains nothing, which is why
     method-sets.test.ts asserts every one of them resolves. */
  {
    id: 'phishing-resistant',
    name: 'Phishing-resistant only',
    description: 'For rules protecting regulated data. Nothing here can be replayed, intercepted, or handed over by a user who was asked nicely.',
    methods: ['FIDO2 / Passkey', 'CAC Card'],
    usedIn: 2,
  },
  {
    id: 'standard',
    name: 'Standard workforce',
    description: 'The everyday set. Broad enough that nobody is locked out on a bad travel day, and deliberately not used on anything holding regulated records.',
    methods: ['miniOrange Push', 'miniOrange OTP', 'Google Authenticator', 'OTP over Email', 'Security Questions'],
    usedIn: 4,
  },
]

// --- Rule helpers ------------------------------------------------------------

let ruleSeq = 0
function rule(over: Partial<Rule> & Pick<Rule, 'name'>): Rule {
  ruleSeq += 1
  return {
    id: `r${ruleSeq}`,
    enabled: true,
    appliesTo: ['all'],
    conditions: [],
    decision: '2fa',
    firstFactor: 'Password',
    secondFactor: 'any',
    rememberMfa: false,
    allowDisable2fa: false,
    matchEstimate: 120,
    ...over,
  }
}

let condSeq = 0
export function cond(typeId: string, operator: string, values: string[], joiner: Joiner = 'AND'): Condition {
  condSeq += 1
  return { id: `c${condSeq}`, typeId, operator, values, joiner }
}

export const policies: Policy[] = [
  {
    id: 'global-default',
    name: 'Global Default Policy',
    type: 'App Access',
    appIds: [],
    allApps: true,
    status: 'always-on',
    lastModified: 'System',
    modifiedBy: 'System',
    isSystem: true,
    rules: [
      rule({
        name: 'Baseline access',
        appliesTo: ['all'],
        decision: '1fa',
        matchEstimate: 1240,
      }),
    ],
  },
  {
    id: 'finance-high',
    name: 'Finance Team – High Security',
    type: 'App Access',
    appIds: ['salesforce', 'workday', 'github'],
    status: 'active',
    lastModified: '2 hours ago',
    modifiedBy: 'Mehak Garg',
    rules: [
      rule({
        name: 'Block compromised devices',
        appliesTo: ['all'],
        conditions: [cond('fingerprint', 'not recognised by', ['fp-corp'])],
        decision: 'deny',
        matchEstimate: 108,
      }),
      rule({
        name: 'Off-network finance access',
        description: 'Required by the FY26 audit finding on remote access to ledger systems. The 09:00–17:00 window is the auditor’s, not ours — check with Compliance before widening it.',
        appliesTo: ['finance'],
        conditions: [
          cond('zone', 'not in zone', ['office']),
          cond('time', 'between', ['09:00', '17:00'], 'AND'),
          cond('device-type', 'is', ['Mobile', 'Tablet'], 'OR'),
        ],
        decision: '2fa',
        matchEstimate: 85,
      }),
      rule({
        name: 'Executive step-up',
        appliesTo: ['executives'],
        conditions: [cond('ml-risk', 'is', ['High']), cond('zone', 'not in zone', ['office'], 'AND')],
        decision: '2fa',
        secondFactor: 'specific',
        // "Specific" with nothing named is a rule that cannot be satisfied —
        // the diagnostics checker found this gap in the seed.
        secondFactorMethods: ['WebAuthn / FIDO2 + Passkeys', 'miniOrange Authenticator'],
        matchEstimate: 12,
      }),
      rule({
        name: 'Contractor baseline',
        appliesTo: ['contractors'],
        conditions: [cond('user-type', 'is', ['Contractor'])],
        decision: '1fa',
        matchEstimate: 154,
      }),
    ],
  },
  /* The one seeded policy built to survive the gauntlet.

     Every other policy here is realistic, which is to say it has holes — and a
     product where the best available score is F teaches its user that the score
     only ever says "bad", at which point they stop reading it. This one exists
     so the top of the ladder is visible in the product and not just in the
     grading function.

     It is also the shape the checks argue for, in order: refuse what cannot be
     legitimate, refuse what cannot complete a challenge, then step up on risk,
     on unmanaged hardware, and on the two moments an account is most
     impersonated. Everything left is a managed device on a known network, which
     is the only case that earns a single factor. */
  {
    id: 'zero-trust',
    name: 'Zero-Trust Baseline',
    type: 'App Access',
    appIds: ['salesforce', 'm365', 'aws'],
    status: 'active',
    lastModified: '4 hours ago',
    modifiedBy: 'Mehak Garg',
    rules: [
      rule({
        name: 'Block anonymised sources',
        description: 'No legitimate sign-in to these apps has ever arrived from a Tor exit or a hosting ASN. Written after the March access review; delete only if a customer is genuinely behind one of these networks.',
        appliesTo: ['all'],
        conditions: [cond('zone', 'in zone', ['anon'])],
        decision: 'deny',
        matchEstimate: 31,
      }),
      rule({
        name: 'Block accounts with no second factor',
        description: 'A challenge nobody can complete is a lockout dressed as security. Refusing the sign-in outright sends the user to enrolment instead of to the help desk.',
        appliesTo: ['all'],
        conditions: [cond('auth-state', 'is', ['No MFA configured'])],
        decision: 'deny',
        matchEstimate: 6,
      }),
      rule({
        name: 'Verify elevated risk',
        appliesTo: ['all'],
        conditions: [cond('ml-risk', 'is', ['High'])],
        decision: '2fa',
        matchEstimate: 64,
      }),
      rule({
        name: 'Verify unmanaged devices',
        appliesTo: ['all'],
        conditions: [cond('mdm', 'is', ['Not enrolled'])],
        decision: '2fa',
        matchEstimate: 410,
      }),
      /* Redundant against the rule above for anyone on unmanaged hardware, and
         deliberately kept: a first login from a *managed* device is still the
         one moment an account is worth binding to a person. */
      rule({
        name: 'Verify first login and resets',
        description: 'Redundant against the unmanaged-device rule above for most people, and kept deliberately: a first login from a managed device is still the one moment an account is worth binding to a person.',
        appliesTo: ['all'],
        conditions: [
          cond('auth-state', 'is', ['First time login']),
          cond('auth-state', 'is', ['MFA recently reset'], 'OR'),
        ],
        decision: '2fa',
        matchEstimate: 60,
      }),
    ],
  },
  {
    id: 'contractor-session',
    name: 'Contractor Session Limits',
    type: 'Session',
    appIds: ['slack', 'jira'],
    status: 'active',
    lastModified: 'Yesterday',
    modifiedBy: 'Jaspreet T.',
    rules: [
      rule({ name: 'Cap session length', appliesTo: ['contractors'], conditions: [cond('user-type', 'is', ['Contractor'])], decision: '1fa', matchEstimate: 154 }),
      rule({ name: 'Re-auth after idle', appliesTo: ['contractors'], conditions: [cond('trust-age', 'over', ['30'])], decision: '2fa', matchEstimate: 96 }),
    ],
  },
  {
    id: 'account-recovery',
    name: 'Account Recovery Verification',
    type: 'Account Management',
    appIds: [],
    status: 'active',
    lastModified: '3 days ago',
    modifiedBy: 'Mehak Garg',
    configIssue: 'No applications assigned — this policy cannot take effect until at least one app is attached.',
    rules: [
      rule({ name: 'First login enforcement', appliesTo: ['all'], conditions: [cond('auth-state', 'is', ['First time login'])], decision: '2fa', matchEstimate: 42 }),
      rule({ name: 'After MFA reset', appliesTo: ['all'], conditions: [cond('auth-state', 'is', ['MFA recently reset'])], decision: '2fa', matchEstimate: 18 }),
      rule({ name: 'No MFA configured', appliesTo: ['all'], conditions: [cond('auth-state', 'is', ['No MFA configured'])], decision: 'deny', matchEstimate: 6 }),
    ],
  },
  {
    id: 'exec-stepup',
    name: 'Executive Step-up Authentication',
    type: 'App Access',
    appIds: ['m365', 'aws', 'box', 'salesforce'],
    status: 'active',
    lastModified: '5 days ago',
    modifiedBy: 'Mehak Garg',
    rules: [
      rule({ name: 'Deny anonymized traffic', appliesTo: ['executives'], conditions: [cond('zone', 'in zone', ['anon'])], decision: 'deny', matchEstimate: 12 }),
      /* The Lenskart/Oberoi shape, seeded so the capability is exercised rather
         than merely available: a condition this engine cannot evaluate, asked
         of a system that can. Paired with a fail-open hook on a deny rule
         deliberately — the linter reports it, and a warning nobody can trigger
         is a warning nobody trusts. */
      rule({
        name: 'External risk verdict',
        description: 'The risk platform sees payment history this console never will. Owner is the risk team; changes to the threshold happen there, not here.',
        appliesTo: ['executives'],
        conditions: [cond('webhook', 'returns true', ['hk-fraud'])],
        decision: 'deny',
        matchEstimate: 3,
      }),
      rule({ name: 'New country', appliesTo: ['executives'], conditions: [cond('country', 'is not', ['India'])], decision: '2fa', matchEstimate: 9 }),
      rule({ name: 'Unmanaged device', appliesTo: ['executives'], conditions: [cond('mdm', 'is', ['Not enrolled'])], decision: '2fa', matchEstimate: 7 }),
      rule({ name: 'High ML risk', appliesTo: ['executives'], conditions: [cond('ml-risk', 'is', ['High'])], decision: '2fa', matchEstimate: 4 }),
      rule({ name: 'Trusted office access', appliesTo: ['executives'], conditions: [cond('zone', 'in zone', ['office'])], decision: '1fa', matchEstimate: 12 }),
    ],
  },
  {
    id: 'default-workforce',
    name: 'Default Workforce Access',
    type: 'App Access',
    appIds: ['m365', 'slack', 'zoom'],
    status: 'inactive',
    lastModified: '1 week ago',
    modifiedBy: 'System',
    rules: [rule({ name: 'Everyone', appliesTo: ['all'], decision: '1fa', matchEstimate: 1240 })],
  },
  {
    id: 'partner-portal',
    name: 'Partner Portal Access',
    type: 'App Access',
    appIds: ['box'],
    status: 'inactive',
    lastModified: '2 weeks ago',
    modifiedBy: 'Jaspreet T.',
    configIssue: 'No rules configured — every sign-in falls straight through to the default rule.',
    rules: [],
  },
  {
    id: 'eng-vpn',
    name: 'Engineering VPN Policy',
    type: 'App Access',
    appIds: ['github', 'aws', 'jira'],
    /* Seeded in monitor rather than inactive, so the state exists in the demo
       estate and not only in the type. Its first rule denies everything off the
       corporate ASN, which is precisely the kind of rule nobody should switch
       on without watching it for a week first. */
    status: 'monitor',
    lastModified: '2 weeks ago',
    modifiedBy: 'Mehak Garg',
    rules: [
      rule({ name: 'Require corporate ASN', description: 'Written during the VPN migration and never revisited. Engineering now works from home two days a week, so this may be denying more than it was meant to.', appliesTo: ['engineering'], conditions: [cond('zone', 'not in zone', ['asn'])], decision: 'deny', matchEstimate: 310 }),
      rule({ name: 'Known device', appliesTo: ['engineering'], conditions: [cond('device-reg', 'is', ['Registered'])], decision: '1fa', matchEstimate: 280 }),
      rule({ name: 'Everything else', appliesTo: ['engineering'], decision: '2fa', matchEstimate: 30 }),
    ],
  },
  {
    id: 'idle-session',
    name: 'Idle Session Timeout',
    type: 'Session',
    appIds: ['salesforce', 'workday', 'm365', 'slack', 'jira'],
    status: 'active',
    lastModified: '3 weeks ago',
    modifiedBy: 'System',
    rules: [
      rule({ name: 'Standard idle window', appliesTo: ['all'], conditions: [cond('trust-age', 'over', ['15'])], decision: '1fa', matchEstimate: 1240 }),
      rule({ name: 'Shorter for contractors', appliesTo: ['contractors'], conditions: [cond('user-type', 'is', ['Contractor'])], decision: '2fa', matchEstimate: 154 }),
    ],
  },
]

// --- Templates and scenarios -------------------------------------------------

export const templates: Template[] = [
  {
    id: 't-mfa', name: 'Require MFA for all users', category: 'Quick Protection',
    description: 'Org-wide second factor on every login.', ruleCount: 1,
    author: 'Mehak Garg', when: '2 days ago',
    rules: [{ name: 'Require MFA', ifText: 'All users, every login', decision: '2fa' }],
  },
  {
    id: 't-device', name: 'Adaptive device trust (90-day)', category: 'Device-based',
    description: 'Known devices skip extra auth; new devices verify.', ruleCount: 2,
    author: 'Mehak Garg', when: '1 week ago',
    rules: [
      { name: 'Trusted device', ifText: 'Known device trusted < 90 days', decision: '1fa' },
      { name: 'New or expired device', ifText: 'New, unrecognized, or expired device', decision: '2fa' },
    ],
  },
  {
    id: 't-anon', name: 'Block anonymized traffic', category: 'Risk-based',
    description: 'Deny Tor, VPN, and proxy traffic.', ruleCount: 1,
    author: 'System', when: '—',
    rules: [{ name: 'Block anonymizers', ifText: 'Source is Tor, VPN or a known proxy', decision: 'deny' }],
  },
  {
    id: 't-baseline', name: 'Baseline MFA', category: 'Quick Protection',
    description: 'Second factor for every user. A safe org-wide default.', ruleCount: 1,
    author: 'Xecurify', when: '—', provided: true, reviewed: { by: 'miniOrange Security', on: '2026-01' },
    rules: [{ name: 'Require MFA', ifText: 'All users, every login', decision: '2fa' }],
  },
  {
    id: 't-zerotrust', name: 'Zero-Trust starter', category: 'Device-based',
    description: 'Device fingerprint + network + risk gating for sensitive apps.', ruleCount: 2,
    author: 'Xecurify', when: '—', provided: true, reviewed: { by: 'miniOrange Security', on: '2026-01' },
    rules: [
      { name: 'Block unrecognised devices', ifText: 'Device not recognised by Corporate managed', decision: 'deny' },
      { name: 'Step up off-network', ifText: 'Outside Office Network', decision: '2fa' },
    ],
  },
]

export interface Scenario {
  id: string
  name: string
  description: string
  category: 'Quick Protection' | 'Device-based' | 'Risk-based' | 'Compliance'
  tag?: string
  badge?: string
  /** Shipped by Xecurify. Absent means this tenant authored it. */
  provided?: boolean
  /* When miniOrange last reviewed this template, and who signed it off.

     Deliberately a dated attribution rather than a rating. A star average on a
     security template makes popularity a proxy for appropriateness, and in this
     catalogue those rank in opposite directions — the one-rule "Require MFA for
     all users" is the easiest thing here to adopt, and "Regulated data access"
     with five ordered rules is the hardest. A review record is falsifiable, has
     a name against it, and decays honestly: an old date tells you the template
     may predate the current threat model, where a rating only ever rises. */
  reviewed?: { by: string; on: string }
  /** Who wrote it, on the tenant's own templates. */
  author?: string
  when?: string
  rules: { name: string; ifText: string; decision: AccessDecision; build: () => Rule }[]
}

export const scenarios: Scenario[] = [
  {
    id: 's-mfa', provided: true, reviewed: { by: 'miniOrange Security', on: '2025-09' }, name: 'Require MFA for all users', category: 'Quick Protection', tag: 'Identity',
    description: 'Every user must verify with a second factor on every login.',
    rules: [{
      name: 'Require MFA', ifText: 'All users, every login', decision: '2fa',
      build: () => rule({ name: 'Require MFA', appliesTo: ['all'], decision: '2fa', matchEstimate: 1240 }),
    }],
  },
  {
    id: 's-office', provided: true, name: 'Block access outside office network', category: 'Quick Protection', tag: 'Network',
    description: 'Deny login attempts from IPs outside your network zones.',
    rules: [{
      name: 'Outside office network', ifText: 'Not in Office Network', decision: 'deny',
      build: () => rule({ name: 'Outside office network', appliesTo: ['all'], conditions: [cond('zone', 'not in zone', ['office'])], decision: 'deny', matchEstimate: 340 }),
    }],
  },
  {
    id: 's-contractor', provided: true, name: 'Stricter auth for contractors', category: 'Quick Protection', tag: 'Identity',
    description: 'Contractors face stronger authentication requirements than employees.',
    rules: [{
      name: 'Contractor step-up', ifText: 'User type is Contractor', decision: '2fa',
      build: () => rule({ name: 'Contractor step-up', appliesTo: ['contractors'], conditions: [cond('user-type', 'is', ['Contractor'])], decision: '2fa', matchEstimate: 154 }),
    }],
  },
  {
    id: 's-passwordless', provided: true, name: 'Passwordless for executives', category: 'Quick Protection', tag: 'Identity',
    description: 'Executives with miniOrange App can sign in with a push notification.',
    rules: [{
      name: 'Executive passwordless', ifText: 'Group is Executives', decision: '1fa',
      build: () => rule({ name: 'Executive passwordless', appliesTo: ['executives'], conditions: [cond('group', 'in', ['Executives'])], decision: '1fa', firstFactor: 'Any', matchEstimate: 12 }),
    }],
  },
  {
    id: 's-trust', provided: true, reviewed: { by: 'miniOrange Security', on: '2026-01' }, name: 'Adaptive device trust (90-day)', category: 'Device-based', tag: 'Device', badge: 'Recommended for SIB/HRS',
    description: 'Known devices skip extra auth. New or expired devices require full verification.',
    rules: [
      {
        name: 'Trusted device', ifText: 'Known device trusted < 90 days', decision: '1fa',
        build: () => rule({ name: 'Trusted device', appliesTo: ['all'], conditions: [cond('trust-age', 'under', ['90'])], decision: '1fa', matchEstimate: 980 }),
      },
      {
        name: 'New or expired device', ifText: 'New, unrecognized, or expired device', decision: '2fa',
        build: () => rule({ name: 'New or expired device', appliesTo: ['all'], conditions: [cond('device-reg', 'is', ['Unregistered'])], decision: '2fa', matchEstimate: 260 }),
      },
    ],
  },
  {
    id: 's-compromised', provided: true, reviewed: { by: 'miniOrange Security', on: '2025-11' }, name: 'Block compromised devices', category: 'Device-based', tag: 'Device',
    description: 'Deny access from jailbroken, rooted, or unrecognised devices.',
    rules: [{
      name: 'Block compromised devices', ifText: 'Not recognised by Corporate managed', decision: 'deny',
      build: () => rule({ name: 'Block compromised devices', appliesTo: ['all'], conditions: [cond('fingerprint', 'not recognised by', ['fp-corp'])], decision: 'deny', matchEstimate: 108 }),
    }],
  },
  {
    id: 's-managed', provided: true, name: 'Managed devices only', category: 'Device-based', tag: 'Device',
    description: 'Restrict access to devices enrolled in your MDM.',
    rules: [{
      name: 'MDM enrolled only', ifText: 'MDM Managed is Not enrolled', decision: 'deny',
      build: () => rule({ name: 'MDM enrolled only', appliesTo: ['all'], conditions: [cond('mdm', 'is', ['Not enrolled'])], decision: 'deny', matchEstimate: 210 }),
    }],
  },
  {
    id: 's-suspicious', provided: true, name: 'Step up on suspicious login', category: 'Risk-based', tag: 'Risk',
    description: 'Challenge users when behavioral signals indicate elevated risk.',
    rules: [{
      name: 'Elevated risk', ifText: 'ML Risk Score is High', decision: '2fa',
      build: () => rule({ name: 'Elevated risk', appliesTo: ['all'], conditions: [cond('ml-risk', 'is', ['High'])], decision: '2fa', matchEstimate: 64 }),
    }],
  },
  {
    id: 's-anon', provided: true, reviewed: { by: 'miniOrange Security', on: '2025-06' }, name: 'Block anonymized traffic', category: 'Risk-based', tag: 'Network',
    description: 'Deny access from Tor, VPNs, and known proxies.',
    rules: [{
      name: 'Anonymized source', ifText: 'In zone Anonymizers', decision: 'deny',
      build: () => rule({ name: 'Anonymized source', appliesTo: ['all'], conditions: [cond('zone', 'in zone', ['anon'])], decision: 'deny', matchEstimate: 31 }),
    }],
  },
  {
    id: 's-country', provided: true, name: 'New country detection', category: 'Risk-based', tag: 'Risk',
    description: 'Require additional verification from a new country.',
    rules: [{
      name: 'Unfamiliar country', ifText: 'Country is not India', decision: '2fa',
      build: () => rule({ name: 'Unfamiliar country', appliesTo: ['all'], conditions: [cond('country', 'is not', ['India'])], decision: '2fa', matchEstimate: 88 }),
    }],
  },
  {
    id: 's-firstlogin', author: 'Mehak Garg', when: '1 week ago', name: 'First login enforcement', category: 'Compliance', tag: 'Identity', badge: 'SIB/HRS',
    description: 'First-time users and users with reset MFA must complete a specific auth chain.',
    rules: [{
      name: 'First login chain', ifText: 'Auth state is First time login', decision: '2fa',
      build: () => rule({ name: 'First login chain', appliesTo: ['all'], conditions: [cond('auth-state', 'is', ['First time login'])], decision: '2fa', secondFactor: 'chain', matchEstimate: 42 }),
    }],
  },
  {
    id: 's-session', provided: true, name: 'Session limits for contractors', category: 'Compliance', tag: 'Identity',
    description: 'Cap session duration and require re-authentication for contractors.',
    rules: [{
      name: 'Contractor session cap', ifText: 'User type is Contractor', decision: '2fa',
      build: () => rule({ name: 'Contractor session cap', appliesTo: ['contractors'], conditions: [cond('user-type', 'is', ['Contractor'])], decision: '2fa', matchEstimate: 154 }),
    }],
  },

  // --- Multi-rule templates -------------------------------------------------
  // Real policies are rarely one rule. These exercise the ordered-evaluation
  // model properly, and they are what the card back has to stay legible with.
  {
    id: 's-zerotrust', provided: true, reviewed: { by: 'miniOrange Security', on: '2026-01' }, name: 'Zero-Trust baseline', category: 'Device-based', tag: 'Device', badge: 'Recommended',
    description: 'Layered checks in order — block the broken, trust the known, verify everything in between.',
    rules: [
      { name: 'Block unrecognised devices', ifText: 'Device not recognised by Corporate managed', decision: 'deny',
        build: () => rule({ name: 'Block unrecognised devices', appliesTo: ['all'], conditions: [cond('fingerprint', 'not recognised by', ['fp-corp'])], decision: 'deny', matchEstimate: 108 }) },
      { name: 'Block anonymised sources', ifText: 'Connection is Tor, VPN or a known proxy', decision: 'deny',
        build: () => rule({ name: 'Block anonymised sources', appliesTo: ['all'], conditions: [cond('zone', 'in zone', ['anon'])], decision: 'deny', matchEstimate: 31 }) },
      { name: 'Trusted office device', ifText: 'On Office Network and device registered', decision: '1fa',
        build: () => rule({ name: 'Trusted office device', appliesTo: ['all'], conditions: [cond('zone', 'in zone', ['office']), cond('device-reg', 'is', ['Registered'], 'AND')], decision: '1fa', matchEstimate: 820 }) },
      { name: 'Off-network step-up', ifText: 'Outside Office Network', decision: '2fa',
        build: () => rule({ name: 'Off-network step-up', appliesTo: ['all'], conditions: [cond('zone', 'not in zone', ['office'])], decision: '2fa', matchEstimate: 340 }) },
      { name: 'Elevated risk', ifText: 'ML Risk Score is High', decision: '2fa',
        build: () => rule({ name: 'Elevated risk', appliesTo: ['all'], conditions: [cond('ml-risk', 'is', ['High'])], decision: '2fa', matchEstimate: 64 }) },
    ],
  },
  {
    id: 's-regulated', author: 'Mehak Garg', when: '3 days ago', name: 'Regulated data access', category: 'Compliance', tag: 'Identity', badge: 'SIB/HRS',
    description: 'For apps holding regulated records: managed devices, approved geography, working hours, and a phishing-resistant factor.',
    rules: [
      { name: 'Deny unmanaged devices', ifText: 'MDM Managed is Not enrolled', decision: 'deny',
        build: () => rule({ name: 'Deny unmanaged devices', appliesTo: ['finance'], conditions: [cond('mdm', 'is', ['Not enrolled'])], decision: 'deny', matchEstimate: 42 }) },
      { name: 'Deny outside approved countries', ifText: 'Country is not India', decision: 'deny',
        build: () => rule({ name: 'Deny outside approved countries', appliesTo: ['finance'], conditions: [cond('country', 'is not', ['India'])], decision: 'deny', matchEstimate: 18 }) },
      { name: 'Out-of-hours verification', ifText: 'Outside 09:00–18:00', decision: '2fa',
        build: () => rule({ name: 'Out-of-hours verification', appliesTo: ['finance'], conditions: [cond('time', 'not between', ['09:00', '18:00'])], decision: '2fa', matchEstimate: 51 }) },
      { name: 'New device verification', ifText: 'Device trust age under 30 days', decision: '2fa',
        build: () => rule({ name: 'New device verification', appliesTo: ['finance'], conditions: [cond('trust-age', 'under', ['30'])], decision: '2fa', matchEstimate: 26 }) },
      { name: 'Everything else in-office', ifText: 'On Office Network', decision: '1fa',
        build: () => rule({ name: 'Everything else in-office', appliesTo: ['finance'], conditions: [cond('zone', 'in zone', ['office'])], decision: '1fa', matchEstimate: 86 }) },
    ],
  },
  {
    id: 's-contractor-life', author: 'Jaspreet T.', when: '2 weeks ago', name: 'Contractor lifecycle', category: 'Compliance', tag: 'Identity',
    description: 'Tighter treatment for non-employees across first login, device state, hours and session length.',
    rules: [
      { name: 'First login chain', ifText: 'Auth state is First time login', decision: '2fa',
        build: () => rule({ name: 'First login chain', appliesTo: ['contractors'], conditions: [cond('auth-state', 'is', ['First time login'])], decision: '2fa', secondFactor: 'chain', matchEstimate: 22 }) },
      { name: 'Unregistered device', ifText: 'Device Registration is Unregistered', decision: 'deny',
        build: () => rule({ name: 'Unregistered device', appliesTo: ['contractors'], conditions: [cond('device-reg', 'is', ['Unregistered'])], decision: 'deny', matchEstimate: 37 }) },
      { name: 'Outside contract hours', ifText: 'Outside 09:00–18:00 Mon–Fri', decision: '2fa',
        build: () => rule({ name: 'Outside contract hours', appliesTo: ['contractors'], conditions: [cond('time', 'not between', ['09:00', '18:00'])], decision: '2fa', matchEstimate: 64 }) },
      { name: 'Standard contractor access', ifText: 'User type is Contractor', decision: '2fa',
        build: () => rule({ name: 'Standard contractor access', appliesTo: ['contractors'], conditions: [cond('user-type', 'is', ['Contractor'])], decision: '2fa', matchEstimate: 154 }) },
    ],
  },
]

export function blankRule(name = 'New rule'): Rule {
  return rule({ name, appliesTo: ['all'], decision: '2fa', matchEstimate: 1240 })
}

export function blankPolicy(name: string, appIds: string[]): Policy {
  return {
    id: `p${Date.now()}`,
    name,
    type: 'App Access',
    appIds,
    status: 'inactive',
    lastModified: 'Just now',
    modifiedBy: 'You',
    rules: [],
  }
}

// --- Decision log ------------------------------------------------------------

export interface LogEntry {
  time: string
  user: string
  app: string
  matchedRule: string
  decision: 'Allow' | 'Deny' | 'Challenge'
  conditions: { label: string; matched: boolean }[]
  ip: string
  device: string
  place: string
  factor: string
  latency: string
  risk: string
  chain: { rule: string; outcome: string }[]
}

export const decisionLog: LogEntry[] = [
  {
    time: '11:48:02', user: 'priya@mo.com', app: 'Salesforce', matchedRule: 'Off-network finance access', decision: 'Challenge',
    conditions: [{ label: 'Group is Finance', matched: true }, { label: 'Outside Office Network', matched: true }],
    ip: '115.160.205.254', device: 'MO-LT-0510', place: 'Pune, IN', factor: 'Push', latency: '142ms', risk: 'Low · ML Engine: No escalation',
    chain: [{ rule: 'Rule 1 · Block compromised devices', outcome: 'skipped (no match)' }, { rule: 'Rule 2 · Off-network finance access', outcome: 'matched — evaluation stopped' }],
  },
  {
    time: '11:47:51', user: 'arun@mo.com', app: 'Workday', matchedRule: 'Default Rule', decision: 'Allow',
    conditions: [{ label: 'No rule matched', matched: false }],
    ip: '10.4.2.19', device: 'MO-LT-0233', place: 'Pune, IN', factor: 'Password', latency: '88ms', risk: 'Low',
    chain: [{ rule: 'Rules 1–4', outcome: 'skipped (no match)' }, { rule: 'Default Rule', outcome: 'applied' }],
  },
  {
    time: '11:47:30', user: 'contractor@ext.com', app: 'GitHub Enterprise', matchedRule: 'Block compromised devices', decision: 'Deny',
    conditions: [{ label: 'Not recognised by Corporate managed', matched: true }],
    ip: '185.220.101.12', device: 'unknown', place: 'Unknown (Tor exit)', factor: '—', latency: '61ms', risk: 'High · ML Engine: escalated',
    chain: [{ rule: 'Rule 1 · Block compromised devices', outcome: 'matched — evaluation stopped' }],
  },
  {
    time: '11:46:12', user: 'mehak@mo.com', app: 'Salesforce', matchedRule: 'Off-network finance access', decision: 'Challenge',
    conditions: [{ label: 'Group is Finance', matched: true }, { label: 'Outside Office Network', matched: true }],
    ip: '49.36.12.8', device: 'MO-LT-0119', place: 'Bengaluru, IN', factor: 'OTP', latency: '210ms', risk: 'Medium',
    chain: [{ rule: 'Rule 1', outcome: 'skipped (no match)' }, { rule: 'Rule 2', outcome: 'matched — evaluation stopped' }],
  },
  {
    time: '11:45:03', user: 'jwttest@wttest.com', app: 'Salesforce', matchedRule: 'Default Rule', decision: 'Allow',
    conditions: [{ label: 'No rule matched', matched: false }],
    ip: '10.4.9.71', device: 'MO-DT-0044', place: 'Pune, IN', factor: 'Password', latency: '73ms', risk: 'Low',
    chain: [{ rule: 'Rules 1–4', outcome: 'skipped (no match)' }, { rule: 'Default Rule', outcome: 'applied' }],
  },
  {
    time: '11:44:20', user: 'ops@mo.com', app: 'Workday', matchedRule: 'Off-network finance access', decision: 'Challenge',
    conditions: [{ label: 'Group is Finance', matched: true }, { label: 'Outside Office Network', matched: true }],
    ip: '86.14.22.9', device: 'MO-MB-0091', place: 'London, UK', factor: 'Push', latency: '164ms', risk: 'Medium',
    chain: [{ rule: 'Rule 1', outcome: 'skipped (no match)' }, { rule: 'Rule 2', outcome: 'matched — evaluation stopped' }],
  },
]
