/* ---------------------------------------------------------------------------
   Evaluation.

   Produces a full per-condition trace, not just a verdict. That trace is the
   thing the shipping product cannot give an admin today: the Adaptive
   Authentication Report records the outcome (Allow / Challenge / Deny), the IP,
   the location and whether the user registered a device — but nothing about
   which policy applied or which conditions matched.

   Two ideas are load-bearing here:

     1. Every enabled restriction block is evaluated and reported, even once the
        outcome is already decided, so the admin sees the whole picture.
     2. When a policy does NOT apply, we report the FIRST unsatisfied condition
        and only that one. Listing every failure produces noise; the first
        failure is the actionable one. (Entra's What If tool makes the same
        call, and it is the best information-design decision in that product.)
   --------------------------------------------------------------------------- */

import {
  type AdaptivePolicy,
  type IpRange,
  type NamedLocation,
  type Policy,
  type RestrictionKey,
  type SignInContext,
  RESTRICTION_LABEL,
  enabledRestrictions,
} from './model'

export interface ConditionResult {
  key: RestrictionKey
  label: string
  /** True when the block detected the behaviour it is configured to watch for. */
  triggered: boolean
  /** Plain sentence explaining what was compared and what was found. */
  reason: string
  /** The concrete value observed, for the context column of a trace. */
  observed: string
}

export interface EvaluationTrace {
  policyId: string
  /** Every enabled block, in display order. */
  conditions: ConditionResult[]
  conjunction: 'all' | 'any'
  /** Did the combined condition come out true? */
  conditionsMet: boolean
  /** Final outcome for this policy in isolation. */
  outcome: 'allow' | 'deny' | 'challenge'
  /** What the user would actually be asked to do, in order. */
  obligations: string[]
  /**
   * When the combined condition is false, the single most useful explanation.
   * Null when the conditions were met.
   */
  firstUnsatisfied: ConditionResult | null
}

// --- IP ----------------------------------------------------------------------

/** Minimal IPv4-in-CIDR test. Enough for the seeded data; not a netmask library. */
export function ipInCidr(ip: string, cidr: string): boolean {
  if (!cidr.includes('/')) return ip === cidr
  const [base, bitsRaw] = cidr.split('/')
  const bits = Number(bitsRaw)
  if (!Number.isFinite(bits)) return false
  const toInt = (v: string) =>
    v.split('.').reduce((acc, oct) => (acc << 8) + (Number(oct) & 255), 0) >>> 0
  if (ip.split('.').length !== 4 || base.split('.').length !== 4) return false
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
  return (toInt(ip) & mask) === (toInt(base) & mask)
}

function evaluateIp(
  a: AdaptivePolicy,
  ctx: SignInContext,
  ranges: IpRange[],
): ConditionResult {
  const resolved: { value: string; action: 'allow' | 'deny'; source: string }[] = []

  for (const id of a.ip.rangeIds) {
    const range = ranges.find((r) => r.id === id)
    if (!range) continue
    for (const value of range.entries) {
      resolved.push({ value, action: a.ip.rangeAction, source: range.name })
    }
  }
  for (const e of a.ip.inlineEntries) {
    resolved.push({ value: e.value, action: e.action, source: 'inline' })
  }

  const match = resolved.find((e) => ipInCidr(ctx.ip, e.value))
  const allowList = resolved.filter((e) => e.action === 'allow')

  // A matching Deny entry is an explicit hit on a blocklist.
  if (match && match.action === 'deny') {
    return {
      key: 'ip',
      label: RESTRICTION_LABEL.ip,
      triggered: true,
      reason: `${ctx.ip} matches the blocked entry ${match.value}${
        match.source !== 'inline' ? ` in ${match.source}` : ''
      }.`,
      observed: ctx.ip,
    }
  }
  // A matching Allow entry is a bypass: "if a user logs in with the whitelisted
  // IP address, they will always be allowed access."
  if (match && match.action === 'allow') {
    return {
      key: 'ip',
      label: RESTRICTION_LABEL.ip,
      triggered: false,
      reason: `${ctx.ip} is inside the allowed range ${match.value}${
        match.source !== 'inline' ? ` (${match.source})` : ''
      }.`,
      observed: ctx.ip,
    }
  }
  // An allowlist exists and nothing matched — the sign-in is outside it.
  if (allowList.length > 0) {
    return {
      key: 'ip',
      label: RESTRICTION_LABEL.ip,
      triggered: true,
      reason: `${ctx.ip} is outside every allowed range.`,
      observed: ctx.ip,
    }
  }
  return {
    key: 'ip',
    label: RESTRICTION_LABEL.ip,
    triggered: false,
    reason: `${ctx.ip} does not match any blocked range.`,
    observed: ctx.ip,
  }
}

// --- Device ------------------------------------------------------------------

function evaluateDevice(a: AdaptivePolicy, ctx: SignInContext): ConditionResult {
  const d = a.device
  const observed = `${ctx.deviceKnown ? 'known' : 'new'} device · risk ${ctx.deviceRiskScore}`

  if (d.restrictMobile && ctx.isMobile) {
    return {
      key: 'device',
      label: RESTRICTION_LABEL.device,
      triggered: true,
      reason: 'Mobile device restriction is on and this is a mobile device.',
      observed,
    }
  }
  if (!ctx.deviceRegistered) {
    return {
      key: 'device',
      label: RESTRICTION_LABEL.device,
      triggered: true,
      reason: 'The device is not registered to this user.',
      observed,
    }
  }
  if (ctx.deviceRiskScore >= d.riskThreshold) {
    return {
      key: 'device',
      label: RESTRICTION_LABEL.device,
      triggered: true,
      reason: `Risk Engine scored this device ${ctx.deviceRiskScore}, at or above the ${d.riskThreshold} threshold.`,
      observed,
    }
  }
  return {
    key: 'device',
    label: RESTRICTION_LABEL.device,
    triggered: false,
    reason: `Registered device scoring ${ctx.deviceRiskScore}, below the ${d.riskThreshold} threshold.`,
    observed,
  }
}

// --- Location ----------------------------------------------------------------

function evaluateLocation(
  a: AdaptivePolicy,
  ctx: SignInContext,
  locations: NamedLocation[],
): ConditionResult {
  const label = ctx.locationLabel || 'Unknown location'
  const entries = a.location.entries
  const match = entries.find((e) => e.locationId === ctx.locationId)
  const allowList = entries.filter((e) => e.action === 'allow')
  const nameOf = (id: string) => locations.find((l) => l.id === id)?.name ?? id

  if (match && match.action === 'deny') {
    return {
      key: 'location',
      label: RESTRICTION_LABEL.location,
      triggered: true,
      reason: `Signing in from ${nameOf(match.locationId)}, which is denied.`,
      observed: label,
    }
  }
  if (match && match.action === 'allow') {
    return {
      key: 'location',
      label: RESTRICTION_LABEL.location,
      triggered: false,
      reason: `Within ${match.distance} ${match.unit.toLowerCase()} of ${nameOf(match.locationId)}.`,
      observed: label,
    }
  }
  if (allowList.length > 0) {
    return {
      key: 'location',
      label: RESTRICTION_LABEL.location,
      triggered: true,
      reason: `${label} is outside every permitted location.`,
      observed: label,
    }
  }
  return {
    key: 'location',
    label: RESTRICTION_LABEL.location,
    triggered: false,
    reason: `${label} does not match any denied location.`,
    observed: label,
  }
}

// --- Time --------------------------------------------------------------------

export function formatMinutes(m: number): string {
  const h24 = Math.floor(m / 60)
  const mm = String(m % 60).padStart(2, '0')
  const period = h24 >= 12 ? 'PM' : 'AM'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${mm} ${period}`
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function evaluateTime(a: AdaptivePolicy, ctx: SignInContext): ConditionResult {
  const t = a.time
  const observed = `${formatMinutes(ctx.timeOfDay)} ${DAY_NAMES[ctx.dayOfWeek]}`
  const window = `${formatMinutes(t.start)}–${formatMinutes(t.end)}`

  const dayOk = t.days.length === 0 || t.days.includes(ctx.dayOfWeek)
  const inWindow =
    ctx.timeOfDay >= t.start - t.bufferMinutes && ctx.timeOfDay <= t.end + t.bufferMinutes
  const inside = dayOk && inWindow

  // action 'allow' means the window is permitted time; outside it is the anomaly.
  const triggered = t.action === 'allow' ? !inside : inside

  let reason: string
  if (t.action === 'allow') {
    reason = inside
      ? `Inside the permitted window (${window}).`
      : !dayOk
        ? `${DAY_NAMES[ctx.dayOfWeek]} is outside the permitted days.`
        : `${formatMinutes(ctx.timeOfDay)} is outside the permitted window (${window}).`
  } else {
    reason = inside
      ? `Inside the blocked window (${window}).`
      : `Outside the blocked window (${window}).`
  }

  return { key: 'time', label: RESTRICTION_LABEL.time, triggered, reason, observed }
}

// --- Policy evaluation -------------------------------------------------------

export function evaluatePolicy(
  policy: Policy,
  ctx: SignInContext,
  ranges: IpRange[],
  locations: NamedLocation[],
): EvaluationTrace {
  const a = policy.adaptive
  const keys = a.enabled ? enabledRestrictions(a) : []

  const conditions: ConditionResult[] = keys.map((key) => {
    switch (key) {
      case 'ip':
        return evaluateIp(a, ctx, ranges)
      case 'device':
        return evaluateDevice(a, ctx)
      case 'location':
        return evaluateLocation(a, ctx, locations)
      case 'time':
        return evaluateTime(a, ctx)
    }
  })

  // With no enabled blocks there is no adaptive behaviour to detect, so the
  // condition is false and the baseline sign-in applies.
  const conditionsMet =
    conditions.length === 0
      ? false
      : a.conjunction === 'all'
        ? conditions.every((c) => c.triggered)
        : conditions.some((c) => c.triggered)

  const outcome: EvaluationTrace['outcome'] = conditionsMet ? a.action : 'allow'

  return {
    policyId: policy.id,
    conditions,
    conjunction: a.conjunction,
    conditionsMet,
    outcome,
    obligations: obligationsFor(policy, outcome),
    firstUnsatisfied: conditionsMet ? null : (conditions.find((c) => !c.triggered) ?? null),
  }
}

/** The steps the user actually experiences, in order. */
export function obligationsFor(policy: Policy, outcome: 'allow' | 'deny' | 'challenge'): string[] {
  if (outcome === 'deny') return ['Access denied']

  const steps: string[] = []
  switch (policy.firstFactor) {
    case 'password':
      steps.push('Enter password')
      break
    case 'passwordless':
      steps.push('Verify with biometric or one-time code')
      break
    case 'magic-link':
      steps.push('Open the magic link sent by email')
      break
  }

  if (policy.mfa.enabled && policy.firstFactor !== 'magic-link') {
    const first = policy.mfa.methods[0]
    steps.push(
      first
        ? `Complete second factor — ${METHOD_SHORT[first] ?? first}`
        : 'Complete second factor',
    )
  }

  if (outcome === 'challenge') {
    switch (policy.adaptive.challengeType) {
      case 'second-factor':
        steps.push('Additional verification — second factor')
        break
      case 'kba':
        steps.push('Additional verification — 2 of 3 security questions')
        break
      case 'otp-alternate-email':
        steps.push('Additional verification — code sent to alternate email')
        break
    }
  }

  return steps
}

const METHOD_SHORT: Record<string, string> = {
  'miniorange-push': 'miniOrange Push',
  'miniorange-otp': 'miniOrange OTP',
  'authenticator-app': 'Authenticator App',
  'otp-sms': 'OTP over SMS',
  'otp-email': 'OTP over Email',
  'security-questions': 'Security Questions',
  passkey: 'Passkey',
  'hardware-token': 'Hardware Token',
}
