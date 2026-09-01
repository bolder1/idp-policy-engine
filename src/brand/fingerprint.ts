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

/* Back, and only for the risk catalogue. See RISK_ATTRIBUTES below: the two
   modes ask different questions and were never well served by one list. */
export type AttrCategory = 'Hardware' | 'Browser' | 'Security' | 'Network' | 'Behaviour'

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
  /* Only the risk catalogue files its attributes. The five an attribute-match
     profile can use are a list, not a taxonomy — five things do not need
     filing. */
  category?: AttrCategory
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

export const MATCH_ATTRIBUTES: Attribute[] = [
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

/* --- The risk catalogue, and why it is a different list ------------------------
   Attribute match and risk score ask different questions, and one list served
   neither well.

   MATCH asks "may this device sign in", and the answer is a small set of
   conditions an admin states outright: what kind of device, and what it is
   running. Five things, no taxonomy — filing five items is filing for its own
   sake.

   RISK asks "is this the same device as last time", and that is a scoring
   problem: it wants MANY weak signals, because the score is the sum and no
   single signal carries it. Thirty-eight of them do need a filing scheme, which
   is what the five categories are — Hardware, Browser, Security, Network,
   Behaviour, in descending order of how hard they are to forge.

   The sheet's own weights, unchanged: unique hardware identifiers 30, hardware
   specifications 20, browser and network 10, software and configuration 5.

   This list was deleted when the master narrowed to five and is restored from
   `ba0e53d^` rather than retyped, so the weights and the purposes are the
   sheet's own rather than a paraphrase of them. */
export const RISK_ATTRIBUTES: Attribute[] = [
  // --- Hardware -------------------------------------------------------------
  {
    id: 'device-type', category: 'Hardware', name: 'Device type',
    purpose: 'Desktop, laptop, mobile or tablet. Different form factors carry different risk.',
    priority: 'Low', weight: 5, phase: 1,
    config: { kind: 'choice', label: 'Treat a change as', value: 'Significant', options: ['Significant', 'Minor', 'Ignore'] },
  },
  {
    id: 'manufacturer', category: 'Hardware', name: 'Manufacturer and model',
    purpose: 'Apple, Samsung, Dell. Identifies hardware families with known weaknesses.',
    priority: 'Medium', weight: 20, phase: 1, needsAgent: true,
  },
  {
    id: 'mac', category: 'Hardware', name: 'MAC address',
    purpose: 'The network adapter address. Strong, but changes when the adapter does.',
    priority: 'High', weight: 30, phase: 1, needsAgent: true,
  },
  {
    id: 'os', category: 'Hardware', name: 'Operating system and version',
    purpose: 'An unpatched OS is a reason to ask for more, independent of whether the device is known.',
    priority: 'High', weight: 20, phase: 1,
    config: { kind: 'choice', label: 'Match on', value: 'Major version', options: ['Exact build', 'Major version', 'Name only'] },
  },
  {
    id: 'os-install', category: 'Hardware', name: 'OS installation ID',
    purpose: 'Identifies one installation. Survives hardware changes, dies on a reinstall.',
    priority: 'High', weight: 30, phase: 1, needsAgent: true,
  },
  {
    id: 'tpm', category: 'Hardware', name: 'TPM ID',
    purpose: 'The Trusted Platform Module identifier. The strongest signal available, where a TPM exists.',
    priority: 'High', weight: 30, phase: 1, needsAgent: true,
  },
  {
    id: 'cpu', category: 'Hardware', name: 'Processor',
    purpose: 'CPU and GPU model. Stable for the life of the machine.',
    priority: 'Medium', weight: 20, phase: 1, needsAgent: true,
  },
  {
    id: 'screen', category: 'Hardware', name: 'Screen resolution',
    purpose: 'Changes when a monitor is plugged in, so it is weak on its own.',
    priority: 'Low', weight: 5, phase: 2,
  },
  {
    id: 'ram', category: 'Hardware', name: 'Memory and storage',
    purpose: 'Capacity, not serials. Changes on an upgrade.',
    priority: 'Medium', weight: 20, phase: 1, needsAgent: true,
  },
  {
    id: 'battery', category: 'Hardware', name: 'Battery status',
    purpose: 'Present or absent, and health. Distinguishes a laptop from a desktop.',
    priority: 'Low', weight: 5, phase: 2, needsAgent: true,
  },
  {
    id: 'motherboard', category: 'Hardware', name: 'Motherboard serial',
    purpose: 'Unique to the board. Effectively the machine itself.',
    priority: 'High', weight: 30, phase: 1, needsAgent: true,
  },
  {
    id: 'bios', category: 'Hardware', name: 'BIOS UUID',
    purpose: 'A unique firmware identifier, set at manufacture.',
    priority: 'High', weight: 30, phase: 1, needsAgent: true,
  },
  {
    id: 'disk', category: 'Hardware', name: 'Hard disk serial',
    purpose: 'Unique to the drive. Changes if the drive is replaced or cloned.',
    priority: 'High', weight: 30, phase: 1, needsAgent: true,
  },
  {
    id: 'ram-serial', category: 'Hardware', name: 'RAM serials',
    purpose: 'Module serial numbers. Strong, but changes on any memory upgrade.',
    priority: 'Medium', weight: 5, phase: 1, needsAgent: true,
  },
  {
    id: 'machine-sid', category: 'Hardware', name: 'Machine SID',
    purpose: 'The Windows security identifier for the machine.',
    priority: 'High', weight: 30, phase: 1, needsAgent: true,
  },

  // --- Browser --------------------------------------------------------------
  {
    id: 'browser', category: 'Browser', name: 'Browser and version',
    purpose: 'Changes on every browser update, so it is noisy unless matched loosely.',
    priority: 'Medium', weight: 10, phase: 1,
    config: { kind: 'choice', label: 'Match on', value: 'Family only', options: ['Exact version', 'Major version', 'Family only'] },
  },
  {
    id: 'user-agent', category: 'Browser', name: 'User agent',
    purpose: 'The full UA string. Trivially spoofed, and included for completeness.',
    priority: 'Low', weight: 10, phase: 1,
  },
  {
    id: 'plugins', category: 'Browser', name: 'Plugins and extensions',
    purpose: 'A distinctive set, and one the user changes without warning.',
    priority: 'Low', weight: 10, phase: 2,
  },
  {
    id: 'locale', category: 'Browser', name: 'Language and locale',
    purpose: 'Stable for most people, and a strong tell when it moves.',
    priority: 'Medium', weight: 5, phase: 1,
  },
  {
    id: 'canvas', category: 'Browser', name: 'Canvas fingerprint',
    purpose: 'A rendering signature derived from the GPU and font stack.',
    priority: 'Medium', weight: 10, phase: 1,
  },

  // --- Security -------------------------------------------------------------
  {
    id: 'root', category: 'Security', name: 'Root or jailbreak',
    purpose: 'A rooted device cannot be trusted to report anything else honestly.',
    priority: 'High', weight: 30, phase: 2, needsAgent: true,
    config: { kind: 'choice', label: 'When detected', value: 'Deny', options: ['Deny', 'Challenge', 'Flag only'] },
  },
  {
    id: 'vm', category: 'Security', name: 'Virtual machine or emulator',
    purpose: 'Detects a device that is not physical. Legitimate in engineering, suspicious elsewhere.',
    priority: 'High', weight: 30, phase: 1, needsAgent: true,
    config: { kind: 'choice', label: 'When detected', value: 'Challenge', options: ['Deny', 'Challenge', 'Flag only'] },
  },
  {
    id: 'secure-boot', category: 'Security', name: 'Secure Boot and certificates',
    purpose: 'Firmware integrity. Off is not proof of anything, but it is worth knowing.',
    priority: 'High', weight: 20, phase: 1, needsAgent: true,
  },
  {
    id: 'app-integrity', category: 'Security', name: 'Application integrity',
    purpose: 'Whether the client has been tampered with since it was installed.',
    priority: 'Medium', weight: 20, phase: 2, needsAgent: true,
  },

  // --- Network --------------------------------------------------------------
  {
    id: 'hostname', category: 'Network', name: 'Host name and user name',
    purpose: 'Set by the owner, so it is meaningful on managed estates and noise elsewhere.',
    priority: 'Low', weight: 5, phase: 2, needsAgent: true,
  },
  {
    id: 'ip', category: 'Network', name: 'IP address',
    purpose: 'Public and private. Changes constantly on mobile networks.',
    priority: 'Medium', weight: 10, phase: 1,
    config: { kind: 'choice', label: 'Match on', value: 'Subnet', options: ['Exact address', 'Subnet', 'Country only'] },
  },
  {
    id: 'isp', category: 'Network', name: 'ISP and carrier',
    purpose: 'Stable for a fixed line, and a good proxy for "somewhere else" on mobile.',
    priority: 'Medium', weight: 10, phase: 1,
  },
  {
    id: 'geo', category: 'Network', name: 'Geolocation',
    purpose: 'Country, region, city. The signal behind impossible-travel checks.',
    priority: 'High', weight: 10, phase: 1,
    config: { kind: 'choice', label: 'Match on', value: 'Country', options: ['City', 'Region', 'Country'] },
  },
  {
    id: 'vpn', category: 'Network', name: 'Proxy or VPN',
    purpose: 'A VPN hides every other network signal, which is why it is worth its own row.',
    priority: 'High', weight: 5, phase: 1,
    config: { kind: 'choice', label: 'When detected', value: 'Challenge', options: ['Deny', 'Challenge', 'Flag only'] },
  },
  {
    id: 'conn', category: 'Network', name: 'Connection type',
    purpose: 'Cellular, Wi-Fi or Ethernet. Changes as somebody walks out of the building.',
    priority: 'Medium', weight: 10, phase: 1,
  },
  {
    id: 'domain', category: 'Network', name: 'Domain membership',
    purpose: 'Whether the machine is joined to your directory. Binary, and decisive when true.',
    priority: 'High', weight: 20, phase: 1, needsAgent: true,
  },

  // --- Behaviour ------------------------------------------------------------
  {
    id: 'typing', category: 'Behaviour', name: 'Typing dynamics',
    purpose: 'Keystroke speed and intervals. Needs a baseline before it says anything.',
    priority: 'Low', weight: 5, phase: 2,
  },
  {
    id: 'mouse', category: 'Behaviour', name: 'Mouse and scroll patterns',
    purpose: 'Movement signatures. Same caveat: useless until there is history.',
    priority: 'Low', weight: 5, phase: 2,
  },
  {
    id: 'login-freq', category: 'Behaviour', name: 'Login frequency',
    purpose: 'How often this person signs in, and from where.',
    priority: 'High', weight: 10, phase: 2,
  },
  {
    id: 'session', category: 'Behaviour', name: 'Session duration and navigation',
    purpose: 'How long sessions run and where they go.',
    priority: 'Medium', weight: 5, phase: 2,
  },
  {
    id: 'time', category: 'Behaviour', name: 'Time of access',
    purpose: 'Sign-ins outside the usual window are the cheapest anomaly to detect.',
    priority: 'High', weight: 10, phase: 2,
    config: { kind: 'tolerance', label: 'Hours either side of normal', value: 3, min: 0, max: 12, unit: 'hours' },
  },
  {
    id: 'resource', category: 'Behaviour', name: 'Resource being accessed',
    purpose: 'Which app. A finance system at 3am is a different question from a wiki.',
    priority: 'High', weight: 10, phase: 2,
  },
  {
    id: 'role', category: 'Behaviour', name: 'Role and privileges',
    purpose: 'What the account can do if the sign-in is not who it claims to be.',
    priority: 'High', weight: 20, phase: 2,
  },
]

export const CATEGORIES: { id: AttrCategory; label: string; blurb: string }[] = [
  { id: 'Hardware', label: 'Hardware', blurb: 'The machine itself. The strongest signals and the slowest to change.' },
  { id: 'Browser', label: 'Browser', blurb: 'What the browser reports. Easy to collect, easy to change.' },
  { id: 'Security', label: 'Security', blurb: 'Whether the device can be trusted to report the rest honestly.' },
  { id: 'Network', label: 'Network', blurb: 'Where the sign-in came from. Moves with the person.' },
  { id: 'Behaviour', label: 'Behaviour', blurb: 'Patterns over time. Needs history before it says anything.' },
]

/* Which catalogue a profile draws from. The two are disjoint in intent and
   overlap in one id — `device-type` is a sensible signal either way — so this
   is a function of the MODE rather than a merged list with a flag on each row. */
export const attributesFor = (mode: ProfileMode): Attribute[] =>
  mode === 'risk' ? RISK_ATTRIBUTES : MATCH_ATTRIBUTES

/* Kept for the places that hold an id and no mode — the seeds' validation, and
   anything reading a stored value back. Searches match first, because that is
   the smaller and more specific list. */
export const ATTRIBUTES: Attribute[] = [
  ...MATCH_ATTRIBUTES,
  ...RISK_ATTRIBUTES.filter((r) => !MATCH_ATTRIBUTES.some((m) => m.id === r.id)),
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
