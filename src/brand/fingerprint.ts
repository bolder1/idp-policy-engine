/* -----------------------------------------------------------------------------
   Device fingerprinting — the attribute master, and the two ways to use it.

   Transcribed from "Adaptive MFA - Device Fingerprint v2.xlsx": the 38
   attributes on the *Devic Fingerprint* sheet, the weights and bands from
   *Sheet2*, and the outcome matrix from *Sheet9*.

   The thing worth naming up front, because the old screen got it wrong: this is
   not device *posture*. Posture asks "is this device healthy" — disk encrypted,
   OS patched, MDM enrolled. Fingerprinting asks "is this the same device as
   last time", by remembering a set of attribute values and comparing them on
   the next sign-in. Different question, different data, different failure mode,
   and the tab was named after the wrong one.

   Two ways to answer it, and the whole screen turns on which one you pick:

   · **Attribute match.** The chosen attributes either still match or they do
     not. You set how many may drift before the device stops counting as known.
     No arithmetic — which is the point, because a rule you can explain to an
     auditor in one sentence is worth more than a rule that is slightly better
     calibrated.
   · **Risk score.** Every attribute carries a weight. Changed attributes add
     their weight up, and the total lands in a band. It is more expressive and
     considerably harder to reason about, which is the honest trade.

   Weights come from the sheet's own table rather than being invented: unique
   hardware identifiers 30, hardware specifications 20, browser and network 10,
   software and configuration 5. Bands likewise — 0-30 allow, 31-70 challenge,
   71-100 deny.
   -------------------------------------------------------------------------- */

export type Priority = 'High' | 'Medium' | 'Low'

/* --- What an attribute is tuned WITH --------------------------------------------
   Three of these are a single control: a number, a dropdown, a list of strings.
   The fourth is a sentence.

   Some attributes are not usefully described by "how loosely do you match
   this". "Operating system, matched on major version" is a precision setting;
   "operating system is not Android 12" is a different question, and the second
   is the one an admin arrives with. Those attributes need an operator and a
   value, and the value belongs to the attribute rather than to the control —
   the versions that mean something for iOS are not the ones that mean
   something for Windows.

   Values are GROUPED for the same reason. An OS version means nothing without
   its platform, and thirty version strings in one flat list is a list you
   scroll rather than read. The group is the type; the values are that type's
   own. Adding a platform is adding a group. */
export interface AttrRuleValue {
  op: string
  value: string
}

/** What a profile has stored against one attribute. */
export type AttrConfigValue = string | number | AttrRuleValue

export const isRuleValue = (v: AttrConfigValue | undefined): v is AttrRuleValue =>
  typeof v === 'object' && v !== null && 'op' in v

/** How a configurable attribute is tuned. Only some attributes have one. */
export type AttrConfig =
  | { kind: 'tolerance'; label: string; value: number; min: number; max: number; unit: string }
  | { kind: 'choice'; label: string; value: string; options: string[] }
  | { kind: 'list'; label: string; values: string[]; placeholder: string }
  | {
      kind: 'rule'
      label: string
      /* Named per attribute rather than shared, because the operators that make
         sense are not the same everywhere: a version can be "at least", a
         country cannot. */
      operators: string[]
      groups: { label: string; values: string[] }[]
      value: AttrRuleValue
    }
  /* A comparison against a version the admin TYPES.

     `rule` offers a dropdown of known values, which is right for a closed set
     and wrong for a version: the list is never complete, it is stale the week
     after a release, and the value an admin has in mind is usually the one that
     just shipped. A free field is also the honest shape — an admin drawing a
     floor under Android knows the number, and making them find it in thirty
     options is asking them to recognise what they can already state.

     Operators are shared across the four version attributes because a version
     compares the same way whatever platform it belongs to. */
  | {
      kind: 'version'
      label: string
      value: AttrRuleValue
      /** Real examples for THIS platform, since the formats genuinely differ. */
      placeholder: string
      hint: string
    }

export interface Attribute {
  id: string
  name: string
  /** What the attribute is. Sits on a tip, never in the row. */
  purpose: string
  priority: Priority
  /** The sheet's weight, used when the profile scores rather than matches. */
  weight: number
  /** Phase 1 attributes are the ones that actually collect today. */
  phase: 1 | 2
  /* True when nothing but an installed agent can read this.

     Not a preference — a hard limit on which signals EXIST. A page cannot ask
     for a TPM identifier or a motherboard serial, so an agentless profile that
     names one is not misconfigured, it is inert: the value never arrives, so it
     never mismatches, and the profile is quietly weaker than it reads. */
  needsAgent?: true
  /** Absent when the attribute has nothing to tune. */
  config?: AttrConfig
}

/* --- The master, and why it is five --------------------------------------------
   This was thirty-eight in the sheet, then fourteen on the screen, and it is
   five here. That is not attrition, it is the list narrowing onto the two
   questions a device profile is actually asked in this product:

     what KIND of device is this, and what is it RUNNING?

   Everything else the sheet offered — canvas hashes, ISP, MAC, TPM, geolocation
   — answers "is this the same machine as last time", which is a different
   product surface with different plumbing. They are not deleted from the sheet;
   they are simply not what this screen configures today.

   The five are one form-factor question and four version questions, one per
   platform. Four rather than one combined "OS version" because a comparison
   only means anything inside a platform: "greater than 14" is a coherent thing
   to ask of Android and of iOS, and asking it of both at once is not a
   question. A profile names the platforms it cares about and leaves the rest
   alone.

   Everything here is readable without an agent — a form factor and an OS
   version arrive with the request — so nothing in this list carries
   `needsAgent`, and an agentless profile can use all five. */
/* The comparisons a version supports — a symbol, and the words for it.

   Stored as an id and shown as a SYMBOL, which is the shape Figma's conditional
   row uses and the right one here. A version comparison is an expression, and
   an expression reads as one line when its operator is one glyph: `Windows OS
   version  ≥  10` is a sentence, where "Windows OS version · is at least ·
   10" is three controls that happen to be adjacent. The words are not lost —
   they are how the menu names each symbol, so nobody has to know what ≥ means
   before choosing it.

   Both directions and both edges, because a policy is written either way round:
   ≥ 14 draws a floor and < 14 names what to challenge, and those are not the
   same rule with the sign flipped — one says who may in, the other who gets
   stopped. = and ≠ pin an exact build, which is what a rollback or a known-bad
   release needs. */
export interface VersionOp {
  id: string
  label: string
  symbol: string
}

export const VERSION_OPS: VersionOp[] = [
  { id: 'gte', label: 'Greater than or equal to', symbol: '≥' },
  { id: 'gt', label: 'Greater than', symbol: '>' },
  { id: 'lte', label: 'Less than or equal to', symbol: '≤' },
  { id: 'lt', label: 'Less than', symbol: '<' },
  { id: 'eq', label: 'Equal to', symbol: '=' },
  { id: 'ne', label: 'Not equal to', symbol: '≠' },
]

/** Falls back rather than rendering an empty token: an operator that went out
    of the list should read as the nearest thing, not as a blank chip. */
export const versionOp = (id: string): VersionOp =>
  VERSION_OPS.find((o) => o.id === id) ?? VERSION_OPS[0]

export const ATTRIBUTES: Attribute[] = [
  {
    id: 'device-type', name: 'Device type',
    purpose: 'The form factor the request came from. A laptop and a phone are not the same risk, and some apps have no business being opened on one of them.',
    priority: 'Low', weight: 5, phase: 1,
    /* Three, and no "Desktop". The distinction that pays is portable versus
       not, and a desktop and a laptop answer that the same way for every rule
       anyone writes here — splitting them adds an option and no decision. */
    config: {
      kind: 'choice',
      label: 'Device type',
      value: 'Laptop',
      options: ['Mobile', 'Tablet', 'Laptop'],
    },
  },
  {
    id: 'os-windows', name: 'Windows OS version',
    purpose: 'The Windows build the request came from. Compare it to draw a floor under what may sign in.',
    priority: 'High', weight: 20, phase: 1,
    config: {
      kind: 'version',
      label: 'Windows version',
      value: { op: 'gte', value: '10' },
      placeholder: '10, 11, 10.0.19045',
      hint: 'A build number works as well as a major version — 10, 11, 22H2, 10.0.19045.',
    },
  },
  {
    id: 'os-android', name: 'Android OS version',
    purpose: 'The Android version the request came from. Compare it to keep unpatched handsets out.',
    priority: 'High', weight: 20, phase: 1,
    config: {
      kind: 'version',
      label: 'Android version',
      value: { op: 'gte', value: '13' },
      placeholder: '13, 14, 15',
      hint: 'Android numbers its releases whole — 13, 14, 15.',
    },
  },
  {
    id: 'os-ios', name: 'iOS version',
    purpose: 'The iOS version the request came from. Compare it to keep unpatched phones out.',
    priority: 'High', weight: 20, phase: 1,
    config: {
      kind: 'version',
      label: 'iOS version',
      value: { op: 'gte', value: '17' },
      placeholder: '17, 18.1, 18.1.2',
      hint: 'Major, minor and patch all work — 17, 18.1, 18.1.2.',
    },
  },
  {
    id: 'os-macos', name: 'macOS version',
    purpose: 'The macOS version the request came from. Compare it to draw a floor under what may sign in.',
    priority: 'High', weight: 20, phase: 1,
    config: {
      kind: 'version',
      label: 'macOS version',
      value: { op: 'gte', value: '14' },
      placeholder: '14, 15.1, 15.1.1',
      hint: 'The version number, not the cat or the mountain — 14, 15.1.',
    },
  },
]

/* --- Profiles ---------------------------------------------------------------- */

export type ProfileMode = 'match' | 'risk'

/* The two ways a device can be identified, and the console's own split.

   Agentless is what a browser and the request itself give up. Agent-based adds
   everything only software running on the machine can read — the TPM, the disk,
   whether Secure Boot is on. Higher assurance, and it has a prerequisite an
   admin has to satisfy before any of it works. */
export type ProfileReach = 'agentless' | 'agent'

/* How a device gets onto a person's list in the first place. The console's two,
   and they are a BRANCH rather than a menu: choosing a roster removes the
   device allowance entirely and replaces it with an upload. */
export type Registration = 'self' | 'pre-approved'

export const REGISTRATION_LABEL: Record<Registration, string> = {
  self: 'Users register their own devices',
  'pre-approved': 'Pre-approved devices only',
}

/** An uploaded roster of approved devices. Keyed on MAC, so it needs an agent. */
export interface Roster {
  fileName: string
  rows: number
  uploadedAt: string
}

/** What a new profile starts watching, per reach. Agentless gets only what a
    page can actually read. */
export const DEFAULT_ATTRS: Record<ProfileReach, string[]> = {
  agentless: ['browser', 'canvas', 'locale', 'ip', 'isp'],
  agent: ['tpm', 'bios', 'motherboard', 'machine-sid', 'disk', 'os', 'secure-boot'],
}

/** How many devices a new profile allows. The console ships 1, which denies
    anybody with a laptop and a desktop on the day it goes live. */
export const DEFAULT_MAX_DEVICES = 3

export interface FingerprintProfile {
  id: string
  name: string
  mode: ProfileMode
  /** Attribute ids that are switched on. */
  enabled: string[]
  /** Per-attribute overrides of the master's config default. */
  config: Record<string, AttrConfigValue>
  /** Risk mode: per-attribute weight overrides, as one of three tiers. */
  weights: Record<string, number>

  /* --- Device restriction ----------------------------------------------------
     Which signals this profile may draw on at all, and what happens the first
     time a device is seen. The attributes above decide whether this is the SAME
     device; these decide whether it is allowed to become a known one. */

  /** Decides whether half the master is even collectable. */
  reach: ProfileReach
  /** How a device gets onto a person's list. */
  registration: Registration
  /** How many one person may register. Null when a roster replaces the limit. */
  maxDevices: number | null
  /** Pre-approved only. */
  roster: Roster | null
  /** First sight of a device enrols it silently rather than challenging. */
  autoRegister: boolean
  /* Whether anybody has answered these questions yet.

     Not derivable from the values: every field above has a working default, so
     a profile nobody has opened is indistinguishable from one deliberately set
     to exactly those defaults. The difference matters because the section shows
     an empty state until it is true, and "agentless, self-service, 3 devices"
     presented as a configuration nobody chose is a claim the screen cannot
     support. */
  restrictionSet: boolean

  usedIn: number
}

/* --- The three weights a risk profile can give an attribute ---------------------
   The master carries four (5, 10, 20, 30) because the sheet does. A profile
   picks from three, because a person setting thirty-eight of these is choosing
   how much something matters, and "how much" has never usefully had four
   answers — the fourth is the one that makes the other three ambiguous.

   The master weight still seeds it: an attribute the sheet scores at 5 or 10
   arrives as Low, 20 as Medium, 30 as High, so the defaults are the sheet's
   even though the vocabulary is not. */
export const TIER_WEIGHT: Record<Priority, number> = { High: 30, Medium: 20, Low: 10 }

export const tierOf = (weight: number): Priority =>
  weight >= 30 ? 'High' : weight >= 20 ? 'Medium' : 'Low'

/* A profile's kind, in the two words a picker row has space for. */
export const modeLabel = (p: { mode: 'match' | 'risk' }) => (p.mode === 'match' ? 'Attribute match' : 'Risk score')

export const byId = (id: string) => ATTRIBUTES.find((a) => a.id === id)

/* The score a profile would produce if `changed` attributes came back
   different. Weights are the profile's overrides falling back to the master,
   and the total is capped at 100 because the bands are expressed on that
   scale — an uncapped total makes "71 and above" meaningless. */
export function scoreOf(p: FingerprintProfile, changed: string[]): number {
  const live = changed.filter((id) => p.enabled.includes(id))
  const raw = live.reduce((sum, id) => sum + (p.weights[id] ?? byId(id)?.weight ?? 0), 0)
  return Math.min(100, raw)
}

/* `bandOf`, `ceilingOf` and `unreachableBands` lived here and went with the
   thresholds they read. The profile page no longer offers an Allow-below /
   Challenge-below pair to set, so there is nothing left for them to check, and
   a reachability warning about numbers nobody can edit is a warning with no
   action attached to it.

   `scoreOf` above stays. It is what a risk profile computes, and the
   per-attribute tiers are only meaningful because something adds them up. */
export const seedProfiles: FingerprintProfile[] = [
  {
    id: 'fp-corp',
    name: 'Corporate managed',
    mode: 'match',
    /* A managed Windows fleet: the form factor it should be, and a floor
       under the build. */
    enabled: ['device-type', 'os-windows'],
    config: {
      'device-type': 'Laptop',
      'os-windows': { op: 'gte', value: '10' },
    },
    weights: {},
    /* Every signal it names is one only an agent can read. */
    reach: 'agent',
    registration: 'self',
    maxDevices: 3,
    roster: null,
    autoRegister: false,
    restrictionSet: true,
    usedIn: 3,
  },
  {
    id: 'fp-byod',
    name: 'BYOD risk scoring',
    mode: 'risk',
    /* Personal phones and tablets, so both mobile platforms are named and the
       floor is the one the vendor still patches. */
    enabled: ['device-type', 'os-android', 'os-ios'],
    config: {
      'device-type': 'Mobile',
      'os-android': { op: 'gte', value: '13' },
      'os-ios': { op: 'gte', value: '17' },
    },
    weights: {},
    /* Personal machines, so nothing to install: browser and network only. */
    reach: 'agentless',
    registration: 'self',
    maxDevices: 5,
    roster: null,
    autoRegister: true,
    restrictionSet: true,
    usedIn: 5,
  },
  {
    id: 'fp-kiosk',
    name: 'Shared kiosk',
    mode: 'match',
    enabled: ['device-type'],
    config: { 'device-type': 'Laptop' },
    weights: {},
    /* A kiosk is a known machine, and nobody should be able to enrol another
       one by walking up to it. */
    reach: 'agent',
    registration: 'pre-approved',
    maxDevices: null,
    roster: { fileName: 'kiosks-floor-3.csv', rows: 24, uploadedAt: '12 Aug 2026' },
    autoRegister: false,
    restrictionSet: true,
    usedIn: 1,
  },
]
