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

export type AttrCategory =
  | 'Hardware'
  | 'Browser'
  | 'Security'
  | 'Network'
  | 'Behaviour'

export type Priority = 'High' | 'Medium' | 'Low'

/** How a configurable attribute is tuned. Only some attributes have one. */
export type AttrConfig =
  | { kind: 'tolerance'; label: string; value: number; min: number; max: number; unit: string }
  | { kind: 'choice'; label: string; value: string; options: string[] }
  | { kind: 'list'; label: string; values: string[]; placeholder: string }

export interface Attribute {
  id: string
  category: AttrCategory
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

/* The master. Order within a category follows the sheet. */
export const ATTRIBUTES: Attribute[] = [
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
  agentless: ['browser', 'canvas', 'locale', 'ip', 'isp', 'conn'],
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
  config: Record<string, string | number>
  /** Risk mode: per-attribute weight overrides. */
  weights: Record<string, number>
  /** Match mode: how many enabled attributes may drift before it is a new device. */
  tolerance: number
  /** Match mode: what happens when the tolerance is exceeded. */
  onMismatch: 'deny' | 'challenge' | 'allow'
  /** Risk mode: the upper bound of each band. Deny is everything above challenge. */
  bands: { allow: number; challenge: number }

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
  /** Whether phones and tablets are held to this profile as well as computers. */
  mobileRestriction: boolean
  /** First sight of a device enrols it silently rather than challenging. */
  autoRegister: boolean

  usedIn: number
}

export const DEFAULT_BANDS = { allow: 30, challenge: 70 }


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

export type Band = 'allow' | 'challenge' | 'deny'

export function bandOf(p: FingerprintProfile, score: number): Band {
  if (score <= p.bands.allow) return 'allow'
  if (score <= p.bands.challenge) return 'challenge'
  return 'deny'
}

/** The most a profile can score — every enabled attribute changing at once. */
export function ceilingOf(p: FingerprintProfile): number {
  return scoreOf(p, p.enabled)
}

/* Reachability. A band nobody can land in is a rule that reads as configured and
   is not, and it is the one mistake this editor can make silently. */
export function unreachableBands(p: FingerprintProfile): Band[] {
  const ceiling = ceilingOf(p)
  const out: Band[] = []
  if (ceiling <= p.bands.allow) out.push('challenge', 'deny')
  else if (ceiling <= p.bands.challenge) out.push('deny')
  return out
}

export const seedProfiles: FingerprintProfile[] = [
  {
    id: 'fp-corp',
    name: 'Corporate managed',
    mode: 'match',
    enabled: ['tpm', 'bios', 'motherboard', 'machine-sid', 'domain', 'os', 'secure-boot'],
    config: { os: 'Major version' },
    weights: {},
    tolerance: 1,
    onMismatch: 'challenge',
    /* Every signal it names is one only an agent can read. */
    reach: 'agent',
    registration: 'self',
    maxDevices: 3,
    roster: null,
    mobileRestriction: true,
    autoRegister: false,
    usedIn: 3,
    bands: DEFAULT_BANDS,
  },
  {
    id: 'fp-byod',
    name: 'BYOD risk scoring',
    mode: 'risk',
    enabled: ['browser', 'canvas', 'locale', 'ip', 'isp', 'geo', 'vpn', 'conn', 'device-type', 'os'],
    config: { browser: 'Family only', ip: 'Subnet', geo: 'Country', vpn: 'Challenge' },
    weights: {},
    tolerance: 2,
    onMismatch: 'challenge',
    /* Personal machines, so nothing to install: browser and network only. */
    reach: 'agentless',
    registration: 'self',
    maxDevices: 5,
    roster: null,
    mobileRestriction: true,
    autoRegister: true,
    usedIn: 5,
    bands: DEFAULT_BANDS,
  },
  {
    id: 'fp-kiosk',
    name: 'Shared kiosk',
    mode: 'match',
    enabled: ['machine-sid', 'hostname'],
    config: {},
    weights: {},
    tolerance: 0,
    onMismatch: 'deny',
    /* A kiosk is a known machine, and nobody should be able to enrol another
       one by walking up to it. */
    reach: 'agent',
    registration: 'pre-approved',
    maxDevices: null,
    roster: { fileName: 'kiosks-floor-3.csv', rows: 24, uploadedAt: '12 Aug 2026' },
    mobileRestriction: false,
    autoRegister: false,
    usedIn: 1,
    bands: DEFAULT_BANDS,
  },
]
