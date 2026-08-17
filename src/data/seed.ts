/* ---------------------------------------------------------------------------
   Seed directory and policy set.

   Shaped so the interesting cases are reachable without hunting:
     - Salesforce is covered for Finance and Engineering but not Contractors.
     - Priya Sharma is in Finance AND Engineering AND the DEFAULT group, so
       signing her in to Salesforce produces a real three-way weight contest.
     - Workday has a Deny policy and Box has none at all, so the coverage grid
       shows both ends of the range.
     - AWS Console is 'critical' and uncovered for two groups — the gap the
       grid exists to surface.
   --------------------------------------------------------------------------- */

import {
  type App,
  type Group,
  type IpRange,
  type NamedLocation,
  type Policy,
  type SignInContext,
  type User,
  emptyAdaptive,
} from '../engine/model'

export const apps: App[] = [
  { id: 'salesforce', name: 'Salesforce', protocol: 'SAML', sensitivity: 'sensitive', glyph: '☁', tint: '#199fd8' },
  { id: 'workday', name: 'Workday', protocol: 'SAML', sensitivity: 'critical', glyph: '▲', tint: '#f5a623' },
  { id: 'github', name: 'GitHub Enterprise', protocol: 'OIDC', sensitivity: 'critical', glyph: '◐', tint: '#24292e' },
  { id: 'm365', name: 'Microsoft 365', protocol: 'SAML', sensitivity: 'sensitive', glyph: '▦', tint: '#e14c2a' },
  { id: 'aws', name: 'AWS Console', protocol: 'SAML', sensitivity: 'critical', glyph: '◢', tint: '#ff9900' },
  { id: 'jira', name: 'Jira', protocol: 'OIDC', sensitivity: 'standard', glyph: '◆', tint: '#2684ff' },
  { id: 'slack', name: 'Slack', protocol: 'SAML', sensitivity: 'standard', glyph: '✳', tint: '#611f69' },
  { id: 'box', name: 'Box', protocol: 'OIDC', sensitivity: 'sensitive', glyph: '▢', tint: '#0061d5' },
  { id: 'zoom', name: 'Zoom', protocol: 'SAML', sensitivity: 'standard', glyph: '▣', tint: '#2d8cff' },
]

export const groups: Group[] = [
  { id: 'default', name: 'DEFAULT', isDefault: true, memberCount: 1240 },
  { id: 'finance', name: 'Finance', isDefault: false, memberCount: 86 },
  { id: 'engineering', name: 'Engineering', isDefault: false, memberCount: 310 },
  { id: 'executives', name: 'Executives', isDefault: false, memberCount: 12 },
  { id: 'contractors', name: 'Contractors', isDefault: false, memberCount: 154 },
  { id: 'it-admins', name: 'IT Admins', isDefault: false, memberCount: 9 },
]

export const users: User[] = [
  { id: 'priya', name: 'Priya Sharma', email: 'priya@mo.com', groupIds: ['finance', 'engineering', 'default'] },
  { id: 'arun', name: 'Arun Patel', email: 'arun@mo.com', groupIds: ['engineering', 'default'] },
  { id: 'mehak', name: 'Mehak Garg', email: 'mehak@mo.com', groupIds: ['it-admins', 'engineering', 'default'] },
  { id: 'divya', name: 'Divya Rao', email: 'divya@mo.com', groupIds: ['executives', 'finance', 'default'] },
  { id: 'contractor-x', name: 'Sam Okafor', email: 'sam@ext.com', groupIds: ['contractors', 'default'] },
  { id: 'nikhil', name: 'Nikhil Bose', email: 'nikhil@mo.com', groupIds: ['default'] },
]

export const ipRanges: IpRange[] = [
  { id: 'hq', name: 'Pune HQ', format: 'IPv4 CIDR', entries: ['10.0.0.0/8', '192.168.1.0/24'] },
  { id: 'vpn', name: 'Corporate VPN', format: 'IPv4 CIDR', entries: ['203.0.113.0/24'] },
  { id: 'branch', name: 'Branch Offices', format: 'IPv4 CIDR', entries: ['198.51.100.0/24'] },
  { id: 'blocked', name: 'Known Bad Ranges', format: 'IPv4 CIDR', entries: ['185.220.101.0/24'] },
]

export const locations: NamedLocation[] = [
  { id: 'pune', name: 'Pune, IN', countryCode: 'IN', lat: 18.52, lon: 73.86 },
  { id: 'bengaluru', name: 'Bengaluru, IN', countryCode: 'IN', lat: 12.97, lon: 77.59 },
  { id: 'london', name: 'London, UK', countryCode: 'GB', lat: 51.51, lon: -0.13 },
  { id: 'austin', name: 'Austin, US', countryCode: 'US', lat: 30.27, lon: -97.74 },
]

// --- Policies ----------------------------------------------------------------

function policy(over: Partial<Policy> & Pick<Policy, 'appId' | 'groupId' | 'name'>): Policy {
  return {
    id: `pol_${over.appId}_${over.groupId}`,
    status: 'active',
    firstFactor: 'password',
    mfa: { enabled: true, methods: ['miniorange-push'], userManaged: false },
    adaptive: emptyAdaptive(),
    lastModified: '2 weeks ago',
    modifiedBy: 'Mehak Garg',
    ...over,
  } as Policy
}

export const policies: Policy[] = [
  // Salesforce — Finance: off-network sign-ins get challenged.
  policy({
    appId: 'salesforce',
    groupId: 'finance',
    name: 'Finance — Salesforce',
    lastModified: '2 hours ago',
    adaptive: {
      ...emptyAdaptive(),
      enabled: true,
      conjunction: 'all',
      ip: { enabled: true, rangeIds: ['hq', 'vpn'], inlineEntries: [], rangeAction: 'allow' },
      device: {
        ...emptyAdaptive().device,
        enabled: true,
        riskThreshold: 50,
      },
      action: 'challenge',
      challengeType: 'second-factor',
    },
  }),

  // Salesforce — Engineering: looser, single condition, OR semantics.
  policy({
    appId: 'salesforce',
    groupId: 'engineering',
    name: 'Engineering — Salesforce',
    lastModified: '1 week ago',
    adaptive: {
      ...emptyAdaptive(),
      enabled: true,
      conjunction: 'any',
      device: { ...emptyAdaptive().device, enabled: true, riskThreshold: 70 },
      action: 'challenge',
      challengeType: 'second-factor',
    },
  }),

  // Salesforce — DEFAULT: the org-wide baseline, deliberately plain.
  policy({
    appId: 'salesforce',
    groupId: 'default',
    name: 'Baseline — Salesforce',
    lastModified: '1 month ago',
    modifiedBy: 'System',
    mfa: { enabled: true, methods: ['otp-email'], userManaged: true },
  }),

  // Workday — Finance: hard deny outside permitted geography.
  policy({
    appId: 'workday',
    groupId: 'finance',
    name: 'Finance — Workday',
    lastModified: '3 days ago',
    mfa: { enabled: true, methods: ['passkey', 'miniorange-push'], userManaged: false },
    adaptive: {
      ...emptyAdaptive(),
      enabled: true,
      conjunction: 'any',
      location: {
        enabled: true,
        entries: [
          { locationId: 'pune', distance: 50, unit: 'KMS', action: 'allow' },
          { locationId: 'bengaluru', distance: 50, unit: 'KMS', action: 'allow' },
        ],
      },
      action: 'deny',
      denyMessage:
        'Workday is only available from approved office locations. Contact IT if you need temporary access.',
    },
  }),

  // Workday — Executives: time-boxed, challenged out of hours.
  policy({
    appId: 'workday',
    groupId: 'executives',
    name: 'Executives — Workday',
    lastModified: '5 days ago',
    mfa: { enabled: true, methods: ['passkey'], userManaged: false },
    adaptive: {
      ...emptyAdaptive(),
      enabled: true,
      conjunction: 'all',
      time: {
        ...emptyAdaptive().time,
        enabled: true,
        start: 7 * 60,
        end: 21 * 60,
        action: 'allow',
        days: [1, 2, 3, 4, 5],
      },
      action: 'challenge',
      challengeType: 'kba',
    },
  }),

  // GitHub — Engineering: passwordless, no adaptive.
  policy({
    appId: 'github',
    groupId: 'engineering',
    name: 'Engineering — GitHub',
    lastModified: 'Yesterday',
    firstFactor: 'passwordless',
    mfa: { enabled: true, methods: ['passkey'], userManaged: false },
  }),

  // GitHub — Contractors: blocked from known bad ranges.
  policy({
    appId: 'github',
    groupId: 'contractors',
    name: 'Contractors — GitHub',
    lastModified: '2 weeks ago',
    adaptive: {
      ...emptyAdaptive(),
      enabled: true,
      conjunction: 'any',
      ip: { enabled: true, rangeIds: ['blocked'], inlineEntries: [], rangeAction: 'deny' },
      action: 'deny',
    },
  }),

  // M365 — DEFAULT baseline plus an IT Admins hardening policy.
  policy({
    appId: 'm365',
    groupId: 'default',
    name: 'Baseline — Microsoft 365',
    lastModified: '1 month ago',
    modifiedBy: 'System',
  }),
  policy({
    appId: 'm365',
    groupId: 'it-admins',
    name: 'IT Admins — Microsoft 365',
    lastModified: '4 days ago',
    mfa: { enabled: true, methods: ['passkey'], userManaged: false },
    adaptive: {
      ...emptyAdaptive(),
      enabled: true,
      conjunction: 'any',
      device: { ...emptyAdaptive().device, enabled: true, riskThreshold: 30 },
      ip: { enabled: true, rangeIds: ['hq'], inlineEntries: [], rangeAction: 'allow' },
      action: 'challenge',
      challengeType: 'second-factor',
    },
  }),

  // AWS — IT Admins only. Critical app, two groups uncovered.
  policy({
    appId: 'aws',
    groupId: 'it-admins',
    name: 'IT Admins — AWS Console',
    lastModified: '6 days ago',
    mfa: { enabled: true, methods: ['passkey', 'hardware-token'], userManaged: false },
    adaptive: {
      ...emptyAdaptive(),
      enabled: true,
      conjunction: 'all',
      ip: { enabled: true, rangeIds: ['hq', 'vpn'], inlineEntries: [], rangeAction: 'allow' },
      device: { ...emptyAdaptive().device, enabled: true, riskThreshold: 40 },
      action: 'deny',
      denyMessage: 'AWS Console requires a managed device on the corporate network.',
    },
  }),

  // Jira, Slack, Zoom — light baselines.
  policy({
    appId: 'jira',
    groupId: 'engineering',
    name: 'Engineering — Jira',
    lastModified: '3 weeks ago',
    mfa: { enabled: false, methods: [], userManaged: false },
  }),
  policy({
    appId: 'slack',
    groupId: 'default',
    name: 'Baseline — Slack',
    lastModified: '1 month ago',
    modifiedBy: 'System',
    mfa: { enabled: false, methods: [], userManaged: false },
  }),
  policy({
    appId: 'slack',
    groupId: 'contractors',
    name: 'Contractors — Slack',
    status: 'shadow',
    lastModified: 'Yesterday',
    adaptive: {
      ...emptyAdaptive(),
      enabled: true,
      conjunction: 'any',
      time: {
        ...emptyAdaptive().time,
        enabled: true,
        start: 9 * 60,
        end: 18 * 60,
        action: 'allow',
        days: [1, 2, 3, 4, 5],
      },
      action: 'challenge',
      challengeType: 'otp-alternate-email',
    },
  }),
  policy({
    appId: 'zoom',
    groupId: 'default',
    name: 'Baseline — Zoom',
    lastModified: '2 months ago',
    modifiedBy: 'System',
    firstFactor: 'magic-link',
    mfa: { enabled: false, methods: [], userManaged: false },
  }),
]

// --- Recent sign-ins ---------------------------------------------------------
// Real history is what makes the simulator usable. A blank-canvas simulator
// asks the admin to invent scenarios, which is exactly why AWS's IAM Policy
// Simulator goes unused; seeding it with sign-ins that actually happened
// removes that cost entirely.

export const signInHistory: SignInContext[] = [
  {
    userId: 'priya', appId: 'salesforce', ip: '115.160.205.254', locationId: 'pune',
    locationLabel: 'Pune, IN', deviceKnown: true, deviceRegistered: true, deviceRiskScore: 22,
    isMobile: false, timeOfDay: 11 * 60 + 48, dayOfWeek: 2, timestamp: 'Today 11:48',
  },
  {
    userId: 'priya', appId: 'salesforce', ip: '86.14.22.9', locationId: 'london',
    locationLabel: 'London, UK', deviceKnown: false, deviceRegistered: false, deviceRiskScore: 74,
    isMobile: true, timeOfDay: 3 * 60 + 12, dayOfWeek: 6, timestamp: 'Sat 03:12',
  },
  {
    userId: 'divya', appId: 'workday', ip: '203.0.113.44', locationId: 'austin',
    locationLabel: 'Austin, US', deviceKnown: true, deviceRegistered: true, deviceRiskScore: 18,
    isMobile: false, timeOfDay: 22 * 60 + 40, dayOfWeek: 4, timestamp: 'Thu 22:40',
  },
  {
    userId: 'sam', appId: 'github', ip: '185.220.101.12', locationId: null,
    locationLabel: 'Unknown (Tor exit)', deviceKnown: false, deviceRegistered: false,
    deviceRiskScore: 91, isMobile: false, timeOfDay: 2 * 60 + 5, dayOfWeek: 0,
    timestamp: 'Sun 02:05',
  },
  {
    userId: 'mehak', appId: 'aws', ip: '10.4.2.19', locationId: 'pune',
    locationLabel: 'Pune, IN', deviceKnown: true, deviceRegistered: true, deviceRiskScore: 12,
    isMobile: false, timeOfDay: 10 * 60 + 3, dayOfWeek: 1, timestamp: 'Mon 10:03',
  },
  {
    userId: 'arun', appId: 'salesforce', ip: '198.51.100.77', locationId: 'bengaluru',
    locationLabel: 'Bengaluru, IN', deviceKnown: true, deviceRegistered: true, deviceRiskScore: 66,
    isMobile: true, timeOfDay: 19 * 60 + 30, dayOfWeek: 3, timestamp: 'Wed 19:30',
  },
]

/** `sam` is the contractor's user id in history; the directory calls it contractor-x. */
export function normalizeUserId(id: string): string {
  return id === 'sam' ? 'contractor-x' : id
}
