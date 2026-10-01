import {
  EVERYONE,
  apps as seedApps,
  audienceOf,
  card,
  cond,
  fallbackRule,
  users as seedUsers,
  rule,
  when,
  type App,
  type Group,
  type Policy,
  type Rule,
  type Scenario,
  type User,
  type Zone,
} from './data'
import { type FingerprintProfile } from './fingerprint'
import type { SavedSignIn } from './saved-sign-ins'
import { devicePreset } from './screens/testing/device-presets'
import { TENANT_TZ, type SignInDevice, type SignInFacts } from './screens/sign-in-facts'

/* -----------------------------------------------------------------------------
   The showcase tenant: what the presentation build loads (24 Sep 2026).

   Owner: "remove all the data … focus on zones, devices, device profiles and
   the policy", then four scenarios to be pre-created as real policies, with
   the zones and device profiles they need and a few simple templates that go
   with them. Everything the showcase shows for those areas comes from here.

   The legacy estate in data.ts and fingerprint.ts is untouched and is still
   what every depth in fixtures.ts returns. It is the test estate now: the
   engine tests read it directly, and none of it reaches the showcase screen.
   The store picks this tenant when SHOWCASE is on (fixtures.showcaseTenant).

   Ids here are new and never collide with the legacy ones, except where an id
   is kept on purpose: `global-default` (the one system policy), the groups and
   people that other surfaces name (`finance` is the board tour's demo group;
   `priya`, `u-it-1` and `u-fin-2` hold the seeded hardware tokens), and the app
   ids that carry a logo.
   -------------------------------------------------------------------------- */

// --- Applications -------------------------------------------------------------

/* The ten well-known apps from the legacy catalogue, minus Microsoft 365 (the
   showcase names Outlook itself), plus the three the scenarios name. The
   sixteen invented internal systems are gone. Catalogue order is display
   order, and a multi-app policy names its FIRST app in catalogue order, so
   Outlook sits before Dropbox and GitHub before Jira. */
const KEEP_APPS = ['salesforce', 'workday', 'github', 'jira', 'slack', 'aws', 'zoom', 'box', 'servicenow', 'google-workspace']

export const showcaseApps: App[] = [
  { id: 'hrms', name: 'HRMS', protocol: 'SAML', glyph: '▤', tint: '#4b6bfb', type: 'SAML/WS-FED', lastUpdated: 'Sep 22, 2026, 10:14:08' },
  { id: 'outlook', name: 'Microsoft Outlook', protocol: 'SAML', glyph: '✉', tint: '#0078d4', type: 'SAML/WS-FED', lastUpdated: 'Sep 18, 2026, 16:02:41' },
  { id: 'dropbox', name: 'Dropbox', protocol: 'SAML', glyph: '◇', tint: '#0061fe', type: 'SAML/WS-FED', lastUpdated: 'Sep 18, 2026, 16:09:55' },
  ...seedApps.filter((a) => KEEP_APPS.includes(a.id)),
]

// --- Groups and people --------------------------------------------------------

/* The groups the four policies name, plus the few every tenant has. Counts are
   stated, as in data.ts, and Employees is the broad population the
   departmental groups sit inside. */
export const showcaseGroups: Group[] = [
  { id: 'employees', name: 'Employees', memberCount: 1180 },
  { id: 'hr', name: 'Human Resources', memberCount: 38 },
  { id: 'finance', name: 'Finance', memberCount: 86 },
  { id: 'sales', name: 'Sales', memberCount: 124 },
  { id: 'engineering', name: 'Engineering', memberCount: 310 },
  { id: 'devops', name: 'DevOps', memberCount: 28 },
  { id: 'executives', name: 'Executives', memberCount: 12 },
  { id: 'contractors', name: 'Contractors', memberCount: 154 },
  { id: 'it-admins', name: 'IT Admins', memberCount: 9 },
]

/* The legacy directory, cut to these groups, plus people for the two groups
   the legacy estate never had. FABRICATED, like every name in data.ts. */
const GROUP_IDS = new Set(showcaseGroups.map((g) => g.id))
export const showcaseUsers: User[] = [
  ...seedUsers.filter((u) => GROUP_IDS.has(u.groupId)),
  { id: 'u-hr-1', name: 'Kavya Menon', email: 'kavya.m@mo.com', groupId: 'hr', userType: 'Employee', role: 'Manager' },
  { id: 'u-hr-2', name: 'Neha Kapoor', email: 'neha.k@mo.com', groupId: 'hr', userType: 'Employee', role: 'Member' },
  { id: 'u-hr-3', name: 'James Whitfield', email: 'james.w@mo.com', groupId: 'hr', userType: 'Employee', role: 'Member' },
  { id: 'u-sales-1', name: 'Aisha Khan', email: 'aisha.k@mo.com', groupId: 'sales', userType: 'Employee', role: 'Manager' },
  { id: 'u-sales-2', name: 'Rahul Verma', email: 'rahul.v@mo.com', groupId: 'sales', userType: 'Employee', role: 'Member' },
  { id: 'u-sales-3', name: 'Emily Carter', email: 'emily.c@mo.com', groupId: 'sales', userType: 'Employee', role: 'Member' },
  /* The admin at the console (store.account), so a sign-in as "you" has a
     person to resolve: Describe it's You check, and the guard's own sign-ins,
     read the admin's id against this directory. Last, so every person the
     scenarios and saved sign-ins name keeps the place it had. */
  { id: 'jaspreet', name: 'Jaspreet Toor', email: 'jaspreet.t@mo.com', groupId: 'it-admins', userType: 'Employee', role: 'Admin' },
]

// --- Zones --------------------------------------------------------------------

/* Scene 1: the office zone, with both halves. A condition that names it with
   no scope asks both, so a sign-in is "in" it when it comes from an office
   address block AND geolocates to an office city. CIDRs only: a single host
   beside locations raises the zone page's exact-vs-location warning.
   Addresses are the RFC 5737 documentation blocks. */
export const showcaseZones: Zone[] = [
  {
    id: 'corp-offices',
    name: 'Corporate offices',
    kind: 'allowed',
    ip: ['203.0.113.0/24', '198.51.100.0/24'],
    asn: [],
    location: {
      countries: [],
      states: [],
      cities: ['Bengaluru', 'Mumbai'],
      /* Exactly as the zone page's `rangeAt` writes a catalogue city. */
      ranges: [{ km: 25, lat: 18.5, lon: 73.9, label: 'Pune', placeId: 'in-maharashtra-pune' }],
    },
    usedIn: 2,
  },
  /* Location only, for the "Sign in from India only" template. */
  {
    id: 'india',
    name: 'India',
    kind: 'allowed',
    ip: [],
    asn: [],
    location: { countries: ['India'], states: [], cities: [], ranges: [] },
    usedIn: 0,
  },
]

// --- Device profiles ----------------------------------------------------------

export const showcaseProfiles: FingerprintProfile[] = [
  /* Scene 2: a trusted-device profile, agent-based, two devices a person.
     The four signals every request carries, plus hardware only the agent can
     read, at a mix of priorities (secure boot and manufacturer Medium, the
     rest of the hardware High) so the Signals tab shows what a priority is. */
  {
    id: 'fp-corp-devices',
    name: 'Corporate devices',
    mode: 'device',
    enabled: ['device-type', 'os', 'browser', 'ip', 'manufacturer', 'mac', 'tpm', 'motherboard', 'disk', 'secure-boot'],
    config: {},
    weights: {},
    reach: 'agent',
    registration: 'self',
    maxDevices: 2,
    roster: null,
    autoRegister: false,
    restrictMobile: false,
    restrictionSet: true,
    usedIn: 1,
  },
  /* Scene 3, the manager's device compliance brief: OS version, integrity
     (rooted, jailbroken, tampered), security (screen lock) and the miniOrange
     Authenticator floor. No device type, so phones and laptops both qualify;
     an OS floor only constrains the platform it names. Every version is a
     listed release, so no row reads "Not a listed release". */
  {
    id: 'fp-compliant',
    name: 'Compliant devices',
    mode: 'os',
    enabled: ['os-windows', 'os-macos', 'os-ios', 'os-android', 'integrity', 'screen-lock', 'mo-authenticator'],
    config: {
      'os-windows': { op: 'gte', value: '11' },
      'os-macos': { op: 'gte', value: '14' },
      'os-ios': { op: 'gte', value: '17' },
      'os-android': { op: 'gte', value: '13' },
      integrity: 'Not rooted, jailbroken or tampered',
      'screen-lock': 'PIN, passcode or password',
      'mo-authenticator': { op: 'gte', value: '6.4' },
    },
    weights: {},
    reach: 'agentless',
    registration: 'self',
    maxDevices: 3,
    roster: null,
    autoRegister: false,
    restrictMobile: false,
    restrictionSet: true,
    usedIn: 2,
  },
]

// --- Policies -----------------------------------------------------------------

/* The last row of every scenario policy. Its name is fixed ("Nothing else
   matched") and only the outcome and the message are the author's. */
function denyAll(denyMessage: string): Rule {
  return { ...fallbackRule('deny'), denyMessage }
}

/* Scene 2's three bands. The evaluator compares strictly (above = >, below = <),
   so the bands are 0–39, 40–70 and 71 up, and every one names the device
   profile too — a device that is not a corporate one falls to the last row. */
const onCorporateDevice = () => cond('fingerprint', 'matches', ['fp-corp-devices'])

export const showcasePolicies: Policy[] = [
  /* Where a sign-in lands when no application policy covers it. Unchanged from
     the legacy estate, and pinned to the top of the list by Policies.tsx. */
  {
    id: 'global-default',
    name: 'Global Default Policy',
    type: 'App Access',
    appIds: [],
    status: 'always-on',
    lastModified: 'System',
    modifiedBy: 'System',
    isSystem: true,
    audience: EVERYONE,
    rules: [rule({ name: 'Baseline access', decision: '1fa', matchEstimate: 1240 })],
  },

  /* Scene 1 — a zone in a policy. HR and Finance reach HRMS from an office,
     with a password and Google Authenticator; anywhere else is refused. The
     groups are the policy's audience as well as the rule's Who, so everyone
     else keeps falling through to the Global Default rather than being denied
     here.

     Seeded Inactive (Phase 4, 28 Sep 2026): the pitch opens on a policy that
     is built and not yet on, so Try a sign-in reads "Today | Stored version"
     — the Global Default today, this policy's rule 1 once it is turned on —
     and Turn on runs Before turning on. The other three stay Active. */
  {
    id: 'sc-hrms-office',
    name: 'HRMS access from corporate offices',
    type: 'App Access',
    appIds: ['hrms'],
    audience: audienceOf(['hr', 'finance']),
    status: 'inactive',
    lastModified: '2 hours ago',
    modifiedBy: 'Jaspreet Toor',
    rules: [
      rule({
        name: 'In a corporate office',
        who: { groupIds: ['hr', 'finance'], userIds: [] },
        when: when(card(cond('zone', 'in zone', ['corp-offices']))),
        decision: '2fa',
        firstFactor: 'Password',
        secondFactor: 'specific',
        secondFactorMethods: ['Google Authenticator'],
        matchEstimate: 118,
      }),
    ],
    fallback: denyAll('HRMS opens only from a corporate office. Contact IT if you need access from elsewhere.'),
  },

  /* Scene 2 — a trusted device and the device risk score, one rule per band.
     "Access the application through corporate devices only" is 53 characters
     and a policy name holds 50, so the name says "app". */
  {
    id: 'sc-corporate-devices',
    name: 'Access the app through corporate devices only',
    type: 'App Access',
    appIds: ['google-workspace'],
    audience: audienceOf(['sales', 'finance'], ['u-exec-2']),
    status: 'active',
    lastModified: '1 hour ago',
    modifiedBy: 'Jaspreet Toor',
    rules: [
      rule({
        name: 'Low risk — password',
        who: { groupIds: ['sales', 'finance'], userIds: ['u-exec-2'] },
        when: when(card(onCorporateDevice(), cond('device-risk', 'below', ['40']))),
        decision: '1fa',
        firstFactor: 'Password',
        matchEstimate: 164,
      }),
      rule({
        name: 'Medium risk — password and OTP',
        who: { groupIds: ['sales', 'finance'], userIds: ['u-exec-2'] },
        when: when(card(onCorporateDevice(), cond('device-risk', 'above', ['39']), cond('device-risk', 'below', ['71']))),
        decision: '2fa',
        firstFactor: 'Password',
        secondFactor: 'specific',
        secondFactorMethods: ['OTP over Email'],
        matchEstimate: 38,
      }),
      rule({
        name: 'High risk — deny',
        who: { groupIds: ['sales', 'finance'], userIds: ['u-exec-2'] },
        when: when(card(onCorporateDevice(), cond('device-risk', 'above', ['70']))),
        decision: 'deny',
        denyMessage: 'This sign-in looks risky. Try again later, or contact IT.',
        matchEstimate: 9,
      }),
    ],
    fallback: denyAll('Google Workspace opens only on a registered corporate device.'),
  },

  /* Scene 3 — device health. A compliant device is let in; anything else is
     refused by the last row. Everyone the apps serve, so no Who. */
  {
    id: 'sc-device-compliance',
    name: 'Device compliance for Outlook and Dropbox',
    type: 'App Access',
    appIds: ['outlook', 'dropbox'],
    audience: EVERYONE,
    status: 'active',
    lastModified: '45 minutes ago',
    modifiedBy: 'Jaspreet Toor',
    rules: [
      rule({
        name: 'Compliant device',
        when: when(card(cond('fingerprint', 'matches', ['fp-compliant']))),
        decision: '1fa',
        firstFactor: 'Password',
        matchEstimate: 1090,
      }),
    ],
    fallback: denyAll('Your device does not meet the security requirements. Update it, or contact IT.'),
  },

  /* Scene 4 — scenes 1 and 3 together, as separate rules. The office on a
     compliant device is a password; a compliant device elsewhere adds a push;
     a device that fails the checks is refused. The narrower rule goes first:
     the other order would make it unreachable. */
  {
    id: 'sc-dev-tools',
    name: 'Developer tools — office and device checks',
    type: 'App Access',
    appIds: ['github', 'jira'],
    audience: audienceOf(['engineering', 'devops']),
    status: 'active',
    lastModified: '20 minutes ago',
    modifiedBy: 'Jaspreet Toor',
    rules: [
      rule({
        name: 'In the office on a compliant device',
        who: { groupIds: ['engineering', 'devops'], userIds: [] },
        when: when(card(cond('zone', 'in zone', ['corp-offices']), cond('fingerprint', 'matches', ['fp-compliant']))),
        decision: '1fa',
        firstFactor: 'Password',
        matchEstimate: 214,
      }),
      rule({
        name: 'Compliant device, working remotely',
        who: { groupIds: ['engineering', 'devops'], userIds: [] },
        when: when(card(cond('fingerprint', 'matches', ['fp-compliant']))),
        decision: '2fa',
        firstFactor: 'Password',
        secondFactor: 'specific',
        secondFactorMethods: ['miniOrange Push'],
        matchEstimate: 96,
      }),
    ],
    fallback: denyAll('GitHub and Jira need a compliant device. Update your device, or contact IT.'),
  },
]

// --- Templates ----------------------------------------------------------------

/* Simple, one idea each, and built on the zones and profiles above so that
   Use never comes back asking for a missing zone or device profile. A
   template has no last row of its own (the policy's is Allow), so every
   refusal here is a rule of its own. All shipped, and every category has at
   least one, because the template sheet always offers all four. */

export const showcaseScenarios: Scenario[] = [
  {
    id: 'st-mfa', provided: true, name: 'Require MFA for everyone', category: 'Quick Protection',
    description: 'Every sign-in needs a password and a second factor.',
    audience: EVERYONE,
    rules: [{
      name: 'Every sign-in', ifText: 'Any sign-in', decision: '2fa',
      build: () => rule({ name: 'Every sign-in', decision: '2fa', firstFactor: 'Password', secondFactor: 'any', matchEstimate: 1240 }),
    }],
  },
  {
    id: 'st-office', provided: true, name: 'Block sign-ins outside the office', category: 'Quick Protection',
    description: 'Deny any sign-in that does not come from the Corporate offices zone.',
    audience: EVERYONE,
    rules: [{
      name: 'Outside the office', ifText: 'Not in zone Corporate offices', decision: 'deny',
      build: () => rule({ name: 'Outside the office', when: when(card(cond('zone', 'not in zone', ['corp-offices']))), decision: 'deny', matchEstimate: 310 }),
    }],
  },
  {
    id: 'st-compliant', provided: true, name: 'Compliant devices only', category: 'Device-based',
    description: 'Deny devices that fail the OS, integrity, screen lock or Authenticator checks.',
    audience: EVERYONE,
    rules: [{
      name: 'Device is not compliant', ifText: 'Device does not match Compliant devices', decision: 'deny',
      build: () => rule({ name: 'Device is not compliant', when: when(card(cond('fingerprint', 'does not match', ['fp-compliant']))), decision: 'deny', matchEstimate: 150 }),
    }],
  },
  {
    id: 'st-corporate', provided: true, name: 'Corporate devices only', category: 'Device-based',
    description: 'Deny sign-ins from any device that is not a registered corporate device.',
    audience: EVERYONE,
    rules: [{
      name: 'Not a corporate device', ifText: 'Device does not match Corporate devices', decision: 'deny',
      build: () => rule({ name: 'Not a corporate device', when: when(card(cond('fingerprint', 'does not match', ['fp-corp-devices']))), decision: 'deny', matchEstimate: 260 }),
    }],
  },
  {
    id: 'st-risk', provided: true, name: 'Step up as device risk rises', category: 'Risk-based',
    description: 'High risk is denied, medium risk adds an OTP, low risk signs in with a password.',
    audience: EVERYONE,
    rules: [
      {
        name: 'High risk', ifText: 'Device risk score above 70', decision: 'deny',
        build: () => rule({ name: 'High risk', when: when(card(cond('device-risk', 'above', ['70']))), decision: 'deny', matchEstimate: 24 }),
      },
      {
        name: 'Medium risk', ifText: 'Device risk score above 39', decision: '2fa',
        build: () => rule({ name: 'Medium risk', when: when(card(cond('device-risk', 'above', ['39']))), decision: '2fa', firstFactor: 'Password', secondFactor: 'specific', secondFactorMethods: ['OTP over Email'], matchEstimate: 180 }),
      },
    ],
  },
  {
    id: 'st-india', provided: true, name: 'Sign in from India only', category: 'Compliance',
    description: 'Keep access inside the country: deny sign-ins located outside India.',
    audience: EVERYONE,
    rules: [{
      name: 'Outside India', ifText: 'Not in zone India', decision: 'deny',
      build: () => rule({ name: 'Outside India', when: when(card(cond('zone', 'not in zone', ['india']))), decision: 'deny', matchEstimate: 42 }),
    }],
  },
]

// --- Saved sign-ins -------------------------------------------------------------

/* Sixteen sign-ins somebody on this tenant has promised will keep working, or
   keep being refused: the first six one per thing the four policies decide,
   then ten more so every policy has a few (below). Every one on a live policy
   passes on load, so the first thing a change can do to them is break one —
   which is what the guard is for. Kavya in the office and Neha at home
   are promises about HRMS as it will decide, and HRMS opens Inactive, so they
   read Fail until it is turned on (or assumed on); turning it on is what makes
   them pass (saved-sign-ins.test.ts).

   A Monday at half past nine in Pune, stated, so a rule about the hour or the
   weekday reads the same on every day the showcase is opened. The office
   address is in the Corporate offices block; the home one is not. */
const MONDAY_0930: NonNullable<SignInFacts['when']> = { date: '2026-09-28', time: '09:30', timeZone: TENANT_TZ, source: 'stated' }
const OFFICE = { address: '203.0.113.24', source: 'stated' } as const
const HOME = { address: '192.0.2.10', source: 'stated' } as const
/* The Bengaluru office block, and a London residential line (RFC 5737). */
const BRANCH = { address: '198.51.100.20', source: 'stated' } as const
const LONDON = { address: '192.0.2.200', source: 'stated' } as const
const SAVED = { savedBy: 'Jaspreet Toor', savedAt: '2026-09-24T16:30:00+05:30' }

/* A personal Mac a year behind: macOS 13 under the Compliant devices floor of
   14, no Device Agent, and — as on every laptop row — the handset-only
   signals stated absent. No preset describes it, so it is stated in full. */
const UNMANAGED_MAC: SignInDevice = {
  source: 'stated',
  platform: 'macos',
  osVersion: '13',
  formFactor: 'Laptop',
  browser: { family: 'safari', version: '17.0' },
  integrity: null,
  screenLock: null,
  authenticatorVersion: null,
  agentInstalled: false,
  agentVersion: null,
  registeredToPerson: false,
  registeredCount: 0,
}

export const showcaseSavedSignIns: SavedSignIn[] = [
  {
    id: 'ssi-kavya-office',
    name: 'Kavya Menon in the office',
    facts: { personId: 'u-hr-1', appId: 'hrms', network: OFFICE, when: MONDAY_0930 },
    expected: '2fa',
    level: 'must-pass',
    ...SAVED,
  },
  {
    id: 'ssi-neha-home',
    name: 'Neha Kapoor at home',
    facts: { personId: 'u-hr-2', appId: 'hrms', network: HOME, when: MONDAY_0930 },
    expected: 'deny',
    level: 'note',
    ...SAVED,
  },
  {
    id: 'ssi-aisha-hrms',
    name: 'Aisha Khan on HRMS',
    facts: { personId: 'u-sales-1', appId: 'hrms', network: OFFICE, when: MONDAY_0930 },
    expected: '1fa',
    level: 'note',
    ...SAVED,
  },
  {
    id: 'ssi-devon-android',
    name: 'Devon Rao on Android 12',
    facts: { personId: 'devon', appId: 'outlook', when: MONDAY_0930, device: devicePreset('android-12').facts },
    expected: 'deny',
    level: 'must-pass',
    ...SAVED,
  },
  /* IT Admins are outside the HRMS policy's audience, so the Global Default
     decides: the sign-in that proves the policy has not grown past HR and
     Finance. */
  {
    id: 'ssi-ravi-hrms',
    name: 'Ravi Menon on HRMS',
    facts: { personId: 'u-it-1', appId: 'hrms', network: OFFICE, when: MONDAY_0930 },
    expected: '1fa',
    level: 'protected',
    ...SAVED,
  },
  /* The registered corporate laptop, with its second device already
     registered, at low risk: rule 1 of the corporate-devices policy. */
  {
    id: 'ssi-vikram-laptop',
    name: 'Vikram Nair on a corporate laptop',
    facts: {
      personId: 'u-exec-2',
      appId: 'google-workspace',
      when: MONDAY_0930,
      device: { ...devicePreset('win11-registered').facts, agentVersion: '4.2', registeredCount: 2 },
      risk: { score: 12, source: 'stated' },
    },
    expected: '1fa',
    level: 'protected',
    ...SAVED,
  },

  /* ---------------------------------------------------------------------------
     Ten more (28 Sep 2026, Policy testing V4 §5), so that no policy's Tests
     dock opens empty in the demo: every scenario policy's applications now
     have three or four, at a mix of levels, each expecting what the seeded
     policies decide as they stand — a saved sign-in that failed on a clean
     tenant would stop every save the guard reads it on.

     Each is chosen to stay where the guard scenes pin the tenant
     (library-guard.test.ts): the office sign-ins on GitHub and Jira come from
     the Bengaluru office block, so removing the Pune block moves only Kavya;
     the one away from the office is in London, so adding the home block to
     the office zone moves only Neha; and no new device is on Android 12, so
     lowering the Android floor lets in only Devon. Names never repeat one the
     demo saves live ("Hannah Lowe on an iPhone", "Devon Rao on Dropbox").
     ------------------------------------------------------------------------ */

  /* Developer tools (GitHub, Jira): each of its three answers, and a person
     outside its audience. */
  {
    id: 'ssi-arun-office',
    name: 'Arun Patel in the office',
    facts: { personId: 'arun', appId: 'github', network: BRANCH, when: MONDAY_0930, device: devicePreset('win11-registered').facts },
    expected: '1fa',
    level: 'must-pass',
    ...SAVED,
  },
  {
    id: 'ssi-sofia-london',
    name: 'Sofia Marchetti in London on an iPhone',
    facts: { personId: 'u-eng-2', appId: 'jira', network: LONDON, when: MONDAY_0930, device: devicePreset('iphone').facts },
    expected: '2fa',
    level: 'note',
    ...SAVED,
  },
  {
    id: 'ssi-tom-win10',
    name: 'Tom Whelan on Windows 10',
    facts: { personId: 'u-dev-3', appId: 'github', network: BRANCH, when: MONDAY_0930, device: devicePreset('win10').facts },
    expected: 'deny',
    level: 'protected',
    ...SAVED,
  },
  /* Contractors are outside Developer tools' audience, so the Global Default
     decides: the sign-in that proves the policy has not grown past its
     engineers. */
  {
    id: 'ssi-contractor-jira',
    name: 'Contractor at home on Jira',
    facts: { personId: 'u-con-5', appId: 'jira', network: HOME, when: MONDAY_0930, device: devicePreset('win10').facts },
    expected: '1fa',
    level: 'note',
    ...SAVED,
  },

  /* Device compliance (Outlook, Dropbox), beside Devon's Android 12. */
  {
    id: 'ssi-sanjay-iphone',
    name: 'Sanjay Bhatt on Outlook from an iPhone',
    facts: { personId: 'u-emp-1', appId: 'outlook', network: HOME, when: MONDAY_0930, device: devicePreset('iphone').facts },
    expected: '1fa',
    level: 'must-pass',
    ...SAVED,
  },
  {
    id: 'ssi-priya-mac',
    name: 'Priya on an unmanaged Mac',
    facts: { personId: 'priya', appId: 'dropbox', network: HOME, when: MONDAY_0930, device: UNMANAGED_MAC },
    expected: 'deny',
    level: 'note',
    ...SAVED,
  },
  {
    id: 'ssi-ivy-android',
    name: 'Ivy Zhang on an Android 14 phone',
    facts: { personId: 'u-con-2', appId: 'dropbox', network: HOME, when: MONDAY_0930, device: devicePreset('android-14').facts },
    expected: '1fa',
    level: 'note',
    ...SAVED,
  },

  /* Corporate devices (Google Workspace): the other two risk bands, and a
     laptop that is not a corporate one. Each states its score, so no risk
     profile moves it. */
  {
    id: 'ssi-rahul-medium',
    name: 'Rahul Verma at medium risk',
    facts: { personId: 'u-sales-2', appId: 'google-workspace', network: OFFICE, when: MONDAY_0930, device: devicePreset('win11-registered').facts, risk: { score: 55, source: 'stated' } },
    expected: '2fa',
    level: 'must-pass',
    ...SAVED,
  },
  {
    id: 'ssi-emily-high',
    name: 'Emily Carter at high risk',
    facts: { personId: 'u-sales-3', appId: 'google-workspace', network: HOME, when: MONDAY_0930, device: devicePreset('win11-registered').facts, risk: { score: 86, source: 'stated' } },
    expected: 'deny',
    level: 'note',
    ...SAVED,
  },
  {
    id: 'ssi-aisha-laptop',
    name: 'Aisha Khan on a personal laptop',
    facts: { personId: 'u-sales-1', appId: 'google-workspace', network: HOME, when: MONDAY_0930, device: devicePreset('win11-no-agent').facts, risk: { score: 12, source: 'stated' } },
    expected: 'deny',
    level: 'note',
    ...SAVED,
  },
]
