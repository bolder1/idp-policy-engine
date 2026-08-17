/* ---------------------------------------------------------------------------
   The policy model.

   This mirrors miniOrange's shipping engine, not Okta's. The differences that
   matter, and that the previous prototype got wrong:

     - A policy binds exactly ONE application to ONE user group. There is no
       policy that spans apps or groups, and only one policy may exist per
       (app, group) pair.
     - A policy is a single condition set plus a single outcome. There are no
       ordered rules inside it, no priority, no drag-to-reorder, no catch-all.
     - The four restriction blocks are combined by ONE global conjunction —
       AND or OR. Mixing them is not permitted anywhere in the product.
     - When a user belongs to several groups, several policies match. The
       engine picks a winner by weight, and policies on custom groups outrank
       policies on the DEFAULT group.

   Source: miniOrange admin docs — Policies Overview, App Login Policy,
   Adaptive Access Policy.
   --------------------------------------------------------------------------- */

// --- Directory ---------------------------------------------------------------

export interface App {
  id: string
  name: string
  protocol: 'SAML' | 'OIDC' | 'WS-FED' | 'RADIUS'
  /** Drives the "unprotected sensitive app" signal on the coverage grid. */
  sensitivity: 'standard' | 'sensitive' | 'critical'
  glyph: string
  tint: string
}

export interface Group {
  id: string
  name: string
  /**
   * The DEFAULT group is the fallback every user belongs to. The engine gives
   * custom groups priority over it, so this flag is load-bearing during
   * resolution rather than cosmetic.
   */
  isDefault: boolean
  memberCount: number
}

export interface User {
  id: string
  name: string
  email: string
  /** Group ids, most specific first. Users routinely sit in several. */
  groupIds: string[]
}

// --- Reusable named objects --------------------------------------------------
// The engine has exactly two: named IP ranges and named Locations. It has no
// concept of "Zones", "Method Sets" or "Device Posture Policies" — those were
// invented by the earlier prototype.

export interface IpRange {
  id: string
  name: string
  format: 'IPv4' | 'IPv4 CIDR' | 'IPv6'
  entries: string[]
}

export interface NamedLocation {
  id: string
  name: string
  countryCode: string
  lat: number
  lon: number
}

// --- Authentication ----------------------------------------------------------

export type FirstFactor = 'password' | 'passwordless' | 'magic-link'

export const FIRST_FACTOR_LABEL: Record<FirstFactor, string> = {
  password: 'Password',
  passwordless: 'Passwordless',
  'magic-link': 'Magic Link',
}

export type MfaMethod =
  | 'miniorange-push'
  | 'miniorange-otp'
  | 'authenticator-app'
  | 'otp-sms'
  | 'otp-email'
  | 'security-questions'
  | 'passkey'
  | 'hardware-token'

export const MFA_METHOD_LABEL: Record<MfaMethod, string> = {
  'miniorange-push': 'miniOrange Push',
  'miniorange-otp': 'miniOrange OTP',
  'authenticator-app': 'Authenticator App (TOTP)',
  'otp-sms': 'OTP over SMS',
  'otp-email': 'OTP over Email',
  'security-questions': 'Security Questions',
  passkey: 'Passkey / FIDO2',
  'hardware-token': 'Hardware Token',
}

/**
 * Magic Link cannot be combined with a second factor or with adaptive
 * authentication. The shipping console lets an admin discover this by failure;
 * we surface it as a visible, explained constraint instead.
 */
export function firstFactorSupports(
  factor: FirstFactor,
): { mfa: boolean; adaptive: boolean; reason?: string } {
  switch (factor) {
    case 'password':
      return { mfa: true, adaptive: true }
    case 'passwordless':
      return {
        mfa: true,
        adaptive: false,
        reason:
          'Adaptive Authentication evaluates a password sign-in. Passwordless already verifies possession, so there is no step to adapt.',
      }
    case 'magic-link':
      return {
        mfa: false,
        adaptive: false,
        reason:
          'Magic Link is a single-use link delivered over email. It cannot carry a second factor or an adaptive challenge.',
      }
  }
}

// --- Adaptive restrictions ---------------------------------------------------
// Four blocks, fixed. Each entry carries its own Allow/Deny, which the engine
// treats as allowlist/blocklist semantics; the policy-level action then decides
// what happens once the combined condition is true.

export type EntryAction = 'allow' | 'deny'

export interface IpRestriction {
  enabled: boolean
  /** References a named IP range, or holds inline entries. */
  rangeIds: string[]
  inlineEntries: { value: string; action: EntryAction }[]
  /** Applied to entries resolved from named ranges. */
  rangeAction: EntryAction
}

export interface DeviceRestriction {
  enabled: boolean
  mode: 'agentless' | 'agent'
  maxRegistrations: number
  restrictMobile: boolean
  autoRegister: boolean
  /** Risk Engine score 0-100. At or above this, the block triggers. */
  riskThreshold: number
}

export interface LocationRestriction {
  enabled: boolean
  entries: {
    locationId: string
    distance: number
    unit: 'KMS' | 'Miles'
    action: EntryAction
  }[]
}

export interface TimeRestriction {
  enabled: boolean
  timezone: string
  /** Minutes from midnight, so comparisons stay trivial. */
  start: number
  end: number
  bufferMinutes: number
  action: EntryAction
  /** 0 = Sunday. Empty means every day. */
  days: number[]
}

export type RestrictionKey = 'ip' | 'device' | 'location' | 'time'

export const RESTRICTION_LABEL: Record<RestrictionKey, string> = {
  ip: 'IP Address',
  device: 'Device',
  location: 'Location',
  time: 'Time',
}

/** One global conjunction across every enabled block. Mixing is not allowed. */
export type Conjunction = 'all' | 'any'

export type AdaptiveAction = 'allow' | 'deny' | 'challenge'

export const ACTION_LABEL: Record<AdaptiveAction, string> = {
  allow: 'Allow',
  deny: 'Deny',
  challenge: 'Challenge',
}

export type ChallengeType = 'second-factor' | 'kba' | 'otp-alternate-email'

export const CHALLENGE_TYPE_LABEL: Record<ChallengeType, string> = {
  'second-factor': 'User Second Factor',
  kba: 'KBA',
  'otp-alternate-email': 'OTP over Alternate Email',
}

export const CHALLENGE_TYPE_DETAIL: Record<ChallengeType, string> = {
  'second-factor': 'OTP over SMS, push notification, OTP over email, or another configured method.',
  kba: 'Two of the three questions the user configured in their Self Service Console.',
  'otp-alternate-email': 'A one-time code sent to the alternate email on the user’s profile.',
}

export interface AdaptiveAlerts {
  notifyAdmins: boolean
  adminEmails: string
  notifyUsers: boolean
  onUnknownContext: boolean
  onChallengeCompletedRegistered: boolean
  onChallengeCompletedNotRegistered: boolean
  onChallengeFailed: boolean
}

export interface AdaptivePolicy {
  enabled: boolean
  conjunction: Conjunction
  ip: IpRestriction
  device: DeviceRestriction
  location: LocationRestriction
  time: TimeRestriction
  action: AdaptiveAction
  challengeType: ChallengeType
  denyMessage: string
  alerts: AdaptiveAlerts
}

// --- Policy ------------------------------------------------------------------

/**
 * Shadow does not exist in the shipping engine. It is carried here so the
 * prototype can demonstrate the value of a monitor mode, and every surface that
 * renders it marks it as proposed rather than implying it already works.
 */
export type PolicyStatus = 'active' | 'inactive' | 'shadow'

export interface Policy {
  id: string
  name: string
  appId: string
  groupId: string
  status: PolicyStatus
  firstFactor: FirstFactor
  mfa: {
    enabled: boolean
    methods: MfaMethod[]
    userManaged: boolean
  }
  adaptive: AdaptivePolicy
  lastModified: string
  modifiedBy: string
}

// --- Sign-in context ---------------------------------------------------------

export interface SignInContext {
  userId: string
  appId: string
  ip: string
  locationId: string | null
  /** Free-text fallback so replayed sign-ins from unknown places still render. */
  locationLabel: string
  deviceKnown: boolean
  deviceRegistered: boolean
  deviceRiskScore: number
  isMobile: boolean
  /** Minutes from midnight, local to the tenant timezone. */
  timeOfDay: number
  dayOfWeek: number
  timestamp: string
}

// --- Factory helpers ---------------------------------------------------------

export function emptyAdaptive(): AdaptivePolicy {
  return {
    enabled: false,
    conjunction: 'all',
    ip: { enabled: false, rangeIds: [], inlineEntries: [], rangeAction: 'allow' },
    device: {
      enabled: false,
      mode: 'agentless',
      maxRegistrations: 2,
      restrictMobile: false,
      autoRegister: true,
      riskThreshold: 60,
    },
    location: { enabled: false, entries: [] },
    time: {
      enabled: false,
      timezone: 'Asia/Kolkata',
      start: 9 * 60,
      end: 18 * 60,
      bufferMinutes: 0,
      action: 'allow',
      days: [1, 2, 3, 4, 5],
    },
    action: 'challenge',
    challengeType: 'second-factor',
    denyMessage: 'Access denied by your organisation’s security policy. Contact your administrator.',
    alerts: {
      notifyAdmins: false,
      adminEmails: '',
      notifyUsers: false,
      onUnknownContext: true,
      onChallengeCompletedRegistered: false,
      onChallengeCompletedNotRegistered: false,
      onChallengeFailed: true,
    },
  }
}

export function newPolicy(appId: string, groupId: string, name: string): Policy {
  return {
    id: `pol_${appId}_${groupId}`,
    name,
    appId,
    groupId,
    status: 'inactive',
    firstFactor: 'password',
    mfa: { enabled: false, methods: [], userManaged: false },
    adaptive: emptyAdaptive(),
    lastModified: 'Just now',
    modifiedBy: 'You',
  }
}

export function enabledRestrictions(a: AdaptivePolicy): RestrictionKey[] {
  const keys: RestrictionKey[] = []
  if (a.ip.enabled) keys.push('ip')
  if (a.device.enabled) keys.push('device')
  if (a.location.enabled) keys.push('location')
  if (a.time.enabled) keys.push('time')
  return keys
}
