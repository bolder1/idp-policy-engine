import { TIER_WEIGHT, type Priority } from './fingerprint'

/* -----------------------------------------------------------------------------
   The risk signals, and what the tenant has decided each one is worth.

   A device profile answers "is this the same device as last time". This answers
   a different question: "is anything about this sign-in suspicious in its own
   right" — an emulator, a rooted handset, a relay, an address that has attacked
   somebody before. The two are deliberately separate objects, because the
   answers are independent: a perfectly recognisable device can be running under
   Frida, and a brand-new one can be entirely honest.

   **One profile, for the whole tenant.** Not a list of named profiles like the
   device ones. A signal's weight is a statement about the SIGNAL — how much a
   jailbroken handset ought to move a score — and that does not vary by which
   application a person is reaching. What varies by policy is the threshold, and
   rules already carry that.

   **Android and iOS only, and the screen says so.** Most of what is here is
   mobile by nature: an emulator, a simulator, a cloned app, a jailbreak. The
   web-only half of this idea — headless browsers, anti-detect profiles, private
   windows — is not collected, and a column of dashes would imply it is coming.
   The page states the gap in a sentence instead.
   -------------------------------------------------------------------------- */

export type Platform = 'android' | 'ios'

export const PLATFORMS: { id: Platform; label: string }[] = [
  { id: 'android', label: 'Android' },
  { id: 'ios', label: 'iOS' },
]

/* Filed by what the signal is EVIDENCE of, not by where it is collected.

   The alternative was to file by subsystem — device, network, behaviour — which
   is how the collector is built and not how the question is asked. Somebody
   tuning this is deciding how much they care that the handset has been
   interfered with, versus how much they care where the connection came from,
   and those are the two piles they sort into. */
export type SignalCategory = 'Device integrity' | 'Instrumentation' | 'Network origin' | 'Address reputation' | 'Behaviour'

export const SIGNAL_CATEGORIES: SignalCategory[] = [
  'Device integrity',
  'Instrumentation',
  'Network origin',
  'Address reputation',
  'Behaviour',
]

export interface RiskSignal {
  id: string
  name: string
  category: SignalCategory
  /** The platforms that can actually collect it. Never both by default. */
  on: Platform[]
  /** One sentence: what it means when this fires. Sits under the name. */
  purpose: string
  /** What it is worth out of the box, per platform that collects it. */
  tier: Priority
}

/* The catalogue.

   Sixteen, not thirty. Every one of these is a signal a mobile SDK can actually
   report and that changes what a sign-in deserves; the ones that went were the
   browser-side half, which this product does not collect, and the near-duplicate
   pairs, which give a tenant two dials for one decision and no way to tell which
   one is doing the work.

   Default tiers are the shape of the argument, not a vendor's numbers: the
   things that mean the runtime is under someone else's control score High, the
   things that merely mean the origin is obscured score Medium or Low, because a
   VPN is a privacy tool before it is an attack. */
export const RISK_SIGNALS: RiskSignal[] = [
  // --- Device integrity -----------------------------------------------------
  {
    id: 'emulator',
    name: 'Emulator',
    category: 'Device integrity',
    on: ['android'],
    purpose: 'The app is running on a simulated handset rather than real hardware.',
    tier: 'High',
  },
  {
    id: 'simulator',
    name: 'iOS Simulator',
    category: 'Device integrity',
    on: ['ios'],
    purpose: 'The app is running under Xcode’s simulator, which no real customer does.',
    tier: 'High',
  },
  {
    id: 'rooted',
    name: 'Rooted device',
    category: 'Device integrity',
    on: ['android'],
    purpose: 'The operating system’s own protections have been removed.',
    tier: 'High',
  },
  {
    id: 'jailbroken',
    name: 'Jailbroken device',
    category: 'Device integrity',
    on: ['ios'],
    purpose: 'The operating system’s own protections have been removed.',
    tier: 'High',
  },
  {
    id: 'cloned',
    name: 'Cloned app',
    category: 'Device integrity',
    on: ['android'],
    purpose: 'A second copy of the app is running side by side with the first.',
    tier: 'Medium',
  },
  {
    id: 'dev-mode',
    name: 'Developer mode',
    category: 'Device integrity',
    on: ['android', 'ios'],
    purpose: 'Debugging is switched on, so the app can be inspected while it runs.',
    tier: 'Low',
  },

  // --- Instrumentation ------------------------------------------------------
  {
    id: 'hooking',
    name: 'Runtime hooking',
    category: 'Instrumentation',
    on: ['android', 'ios'],
    purpose: 'Something is rewriting the app’s behaviour as it executes.',
    tier: 'High',
  },
  {
    id: 'debugger',
    name: 'Debugger attached',
    category: 'Instrumentation',
    on: ['android', 'ios'],
    purpose: 'A debugger is attached to the running process.',
    tier: 'High',
  },
  {
    id: 'tampered-request',
    name: 'Tampered request',
    category: 'Instrumentation',
    on: ['android', 'ios'],
    purpose: 'The sign-in request was altered between the app and the server.',
    tier: 'High',
  },
  {
    id: 'mitm',
    name: 'Intercepted connection',
    category: 'Instrumentation',
    on: ['android', 'ios'],
    purpose: 'Something is sitting between the app and the server, reading the traffic.',
    tier: 'High',
  },

  // --- Network origin -------------------------------------------------------
  {
    id: 'tor',
    name: 'Tor exit node',
    category: 'Network origin',
    on: ['android', 'ios'],
    purpose: 'The connection arrived through the Tor network, so its true origin is unknown.',
    tier: 'High',
  },
  {
    id: 'datacenter',
    name: 'Data centre address',
    category: 'Network origin',
    on: ['android', 'ios'],
    purpose: 'The address belongs to a hosting provider rather than to a consumer network.',
    tier: 'Medium',
  },
  {
    id: 'residential-proxy',
    name: 'Residential proxy',
    category: 'Network origin',
    on: ['android', 'ios'],
    purpose: 'The connection is being relayed through somebody else’s home address.',
    tier: 'Medium',
  },
  {
    id: 'vpn',
    name: 'VPN',
    category: 'Network origin',
    on: ['android', 'ios'],
    /* Deliberately one signal, where the reference has five.

       Five VPN dials — mobile detection, public service, OS mismatch, relay,
       time zone mismatch — are five ways of detecting one fact, and a tenant
       setting all five is not making five decisions. They are a confidence
       question, and confidence belongs to the collector rather than to the
       person deciding what a VPN is worth. */
    purpose: 'The connection is coming through a VPN, however it was detected.',
    tier: 'Low',
  },

  // --- Address reputation ---------------------------------------------------
  {
    id: 'known-attacker',
    name: 'Known attack source',
    category: 'Address reputation',
    on: ['android', 'ios'],
    purpose: 'This address has been seen attacking somebody, recently and elsewhere.',
    tier: 'High',
  },

  // --- Behaviour ------------------------------------------------------------
  {
    id: 'high-activity',
    name: 'Unusually busy device',
    category: 'Behaviour',
    on: ['android', 'ios'],
    purpose: 'This handset is signing in far more often than a person plausibly would.',
    tier: 'Medium',
  },
]

export const signalById = (id: string) => RISK_SIGNALS.find((s) => s.id === id)

/* What the tenant has changed.

   Stored as the DIFFERENCE from the catalogue rather than as a full copy of it,
   which is the same shape `FingerprintProfile` uses and for the same reason: a
   signal added to the catalogue in a later release arrives switched on at its
   shipped weight, instead of being invisible because a stored snapshot predates
   it. `off` and `tiers` are both empty on a tenant that has never opened the
   screen, and that is exactly the shipped configuration. */
export interface RiskProfile {
  /** Signal ids the tenant has switched off. Everything else is on. */
  off: string[]
  /** Per-signal, per-platform weight overrides. Keyed `${signalId}:${platform}`. */
  tiers: Record<string, Priority>
}

export const EMPTY_RISK_PROFILE: RiskProfile = { off: [], tiers: {} }

export const tierKey = (signalId: string, p: Platform) => `${signalId}:${p}`

export const isOn = (profile: RiskProfile, signalId: string) => !profile.off.includes(signalId)

export const tierFor = (profile: RiskProfile, s: RiskSignal, p: Platform): Priority =>
  profile.tiers[tierKey(s.id, p)] ?? s.tier

/* The weight a platform currently carries, and the weight it shipped with.

   Two totals rather than one, because the scale below is a RATIO of them and
   neither is meaningful alone. Uncapped on purpose: sixteen signals at their
   shipped tiers total far more than 100, and capping here was the first attempt
   — it made the ceiling insensitive, because a tenant had to switch off two
   thirds of the catalogue before the total fell under the cap and anything
   moved. A screen whose controls do nothing for their first ten clicks is worse
   than one that does nothing at all, because it takes longer to find out. */
export function weightFor(profile: RiskProfile, p: Platform): number {
  return RISK_SIGNALS.filter((s) => s.on.includes(p) && isOn(profile, s.id)).reduce(
    (sum, s) => sum + TIER_WEIGHT[tierFor(profile, s, p)],
    0,
  )
}

export function shippedWeightFor(p: Platform): number {
  return RISK_SIGNALS.filter((s) => s.on.includes(p)).reduce((sum, s) => sum + TIER_WEIGHT[s.tier], 0)
}

/* What Low, Medium and High are WORTH, given this profile.

   This is the whole reason the screen is not decoration. `RISK_SCORE` in
   simulate.ts was a hard constant — `{ Low: 12, Medium: 48, High: 86 }` — and it
   is the only numeric seam in risk evaluation: the one thing `device-risk`
   compares a rule's threshold against. Owning it is what makes tuning a signal
   change which sign-ins a policy catches, in the rehearsal, in the deck and in
   the impact sweep.

   The scale is the shipped bands times how much evidence this tenant has chosen
   to weigh, relative to what the catalogue ships. A tenant who has changed
   nothing scores a ratio of exactly 1 and gets 12, 48 and 86 to the digit, so
   every seeded policy grades on the release that adds this screen as it did on
   the release before. Switch off half the signals and the ratio halves, so
   "High risk" is worth less and a rule written against `above 60` stops firing —
   which is the honest consequence of having said those signals do not matter.
   Raise a signal's weight and the ratio rises, capped at 100 because the scale
   and every threshold already written against it are expressed on 0-100.

   The lower of the two platforms, not the mean. A rule cannot ask which mobile
   OS somebody is on — the simulator has no platform axis, and inventing one
   would mean inventing facts for thirteen deck cards and 1,440 swept situations
   — so the score a rule can rely on is the one BOTH platforms can reach. Being
   wrong in the strict direction costs a challenge; being wrong in the loose
   direction costs a breach. */
const SHIPPED_BAND: Record<string, number> = { Low: 12, Medium: 48, High: 86 }

export function riskScale(profile: RiskProfile): Record<string, number> {
  const ratio = Math.min(
    ...PLATFORMS.map((p) => {
      const shipped = shippedWeightFor(p.id)
      return shipped === 0 ? 0 : weightFor(profile, p.id) / shipped
    }),
  )
  return {
    Low: Math.min(100, Math.round(SHIPPED_BAND.Low * ratio)),
    Medium: Math.min(100, Math.round(SHIPPED_BAND.Medium * ratio)),
    High: Math.min(100, Math.round(SHIPPED_BAND.High * ratio)),
  }
}

/** How many signals are switched on, for the category headings and the summary. */
export const countOn = (profile: RiskProfile, within?: SignalCategory) =>
  RISK_SIGNALS.filter((s) => (within ? s.category === within : true) && isOn(profile, s.id)).length
