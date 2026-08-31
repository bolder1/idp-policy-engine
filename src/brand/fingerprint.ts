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

/* --- The master, and why it is fourteen ----------------------------------------
   The sheet has thirty-eight and this shows fourteen. That is not a
   transcription that lost twenty-four rows, it is a decision about what a
   profile is for.

   Thirty-eight is a catalogue: it needs a filing scheme to be navigable, and
   the filing scheme needs a rail, and the rail needs counts, and by then the
   screen is about finding an attribute rather than about deciding which ones
   identify a machine. Most of the twenty-four were also the weakest signals in
   the sheet — behavioural patterns that need months of history, browser
   properties that change on every update — so the list was long AND its tail
   was the part nobody should pick.

   Fourteen fits on one screen with nothing above it. No categories, no filter,
   no search over five groups: the list IS the interface.

   Ordered agentless first. Nine of these a browser and the request give up on
   their own; five need an agent, and an agentless profile shows them greyed
   with their reason. Putting the five last means such a profile meets what it
   CAN have before what it cannot. */
export const ATTRIBUTES: Attribute[] = [
  {
    id: 'device-type', name: 'Device type',
    purpose: 'Desktop, laptop, mobile or tablet. Different form factors carry different risk.',
    priority: 'Low', weight: 5, phase: 1,
    config: { kind: 'choice', label: 'Treat a change as', value: 'Significant', options: ['Significant', 'Minor', 'Ignore'] },
  },
  {
    id: 'os', name: 'Operating system and version',
    purpose: 'An unpatched OS is a reason to ask for more, independent of whether the device is known.',
    priority: 'High', weight: 20, phase: 1,
    /* The worked example for the rule kind. "Matched on major version" answers
       how loosely to compare; it cannot answer "not Android 12 or below",
       which is the question an unpatched-OS policy is actually made of. */
    config: {
      kind: 'rule',
      label: 'Operating system',
      operators: ['is', 'is not', 'is at least', 'is below'],
      groups: [
        { label: 'Windows', values: ['Windows 11 24H2', 'Windows 11 23H2', 'Windows 10 22H2', 'Windows 10 21H2'] },
        { label: 'macOS', values: ['macOS 15 Sequoia', 'macOS 14 Sonoma', 'macOS 13 Ventura'] },
        { label: 'Android', values: ['Android 15', 'Android 14', 'Android 13', 'Android 12'] },
        { label: 'iOS', values: ['iOS 18', 'iOS 17', 'iOS 16'] },
        { label: 'Linux', values: ['Ubuntu 24.04 LTS', 'Ubuntu 22.04 LTS', 'RHEL 9'] },
      ],
      value: { op: 'is at least', value: 'Windows 10 22H2' },
    },
  },
  {
    id: 'browser', name: 'Browser and version',
    purpose: 'Changes on every browser update, so it is noisy unless matched loosely.',
    priority: 'Medium', weight: 10, phase: 1,
    /* Same shape as the OS, and for the same reason: "at least Chrome 130" is
       a policy, "family only" is a comparison setting. */
    config: {
      kind: 'rule',
      label: 'Browser',
      operators: ['is', 'is not', 'is at least', 'is below'],
      groups: [
        { label: 'Chrome', values: ['Chrome 131', 'Chrome 130', 'Chrome 129'] },
        { label: 'Edge', values: ['Edge 131', 'Edge 130'] },
        { label: 'Safari', values: ['Safari 18', 'Safari 17'] },
        { label: 'Firefox', values: ['Firefox 133', 'Firefox 132'] },
      ],
      value: { op: 'is at least', value: 'Chrome 130' },
    },
  },
  {
    id: 'canvas', name: 'Canvas fingerprint',
    purpose: 'A rendering signature derived from the GPU and font stack.',
    priority: 'Medium', weight: 10, phase: 1,
  },
  {
    id: 'locale', name: 'Language and locale',
    purpose: 'Stable for most people, and a strong tell when it moves.',
    priority: 'Medium', weight: 5, phase: 1,
  },
  {
    id: 'ip', name: 'IP address',
    purpose: 'Public and private. Changes constantly on mobile networks.',
    priority: 'Medium', weight: 10, phase: 1,
    /* Ranges rather than a precision level. "Match on subnet" says how much of
       the address to compare and never says WHICH — so a profile could not
       express "from the office ranges, and nowhere else", which is the only
       thing most people want an IP condition for.

       The ranges below stand in for a tenant's own. A real deployment reads
       them from the zones already defined next door rather than from a list
       shipped in the master. */
    config: {
      kind: 'rule',
      label: 'IP address',
      operators: ['is in', 'is not in'],
      groups: [
        { label: 'Private ranges', values: ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'] },
        { label: 'Office ranges', values: ['203.0.113.0/24', '198.51.100.0/24'] },
      ],
      value: { op: 'is in', value: '10.0.0.0/8' },
    },
  },
  {
    id: 'isp', name: 'ISP and carrier',
    purpose: 'Stable for a fixed line, and a good proxy for "somewhere else" on mobile.',
    priority: 'Medium', weight: 10, phase: 1,
  },
  {
    id: 'geo', name: 'Geolocation',
    purpose: 'Country, region, city. The signal behind impossible-travel checks.',
    priority: 'High', weight: 10, phase: 1,
    /* Places, not precisions, for the same reason as the address above: the
       useful condition names somewhere. */
    config: {
      kind: 'rule',
      label: 'Location',
      operators: ['is in', 'is not in'],
      groups: [
        { label: 'Countries', values: ['India', 'United States', 'United Kingdom', 'Germany', 'Singapore'] },
        { label: 'Regions', values: ['Maharashtra', 'Karnataka', 'California', 'Bavaria'] },
      ],
      value: { op: 'is in', value: 'India' },
    },
  },
  {
    id: 'vpn', name: 'Proxy or VPN',
    purpose: 'A VPN hides every other network signal, which is why it is worth its own row.',
    priority: 'High', weight: 5, phase: 1,
    config: { kind: 'choice', label: 'When detected', value: 'Challenge', options: ['Deny', 'Challenge', 'Flag only'] },
  },

  /* The five only an agent can read. Last, so an agentless profile meets the
     nine it can have before the five it cannot — those render greyed, with the
     reason on the row. */
  {
    id: 'tpm', name: 'TPM ID',
    purpose: 'The Trusted Platform Module identifier. The strongest signal available, where a TPM exists.',
    priority: 'High', weight: 30, phase: 1, needsAgent: true,
  },
  {
    id: 'machine-sid', name: 'Machine SID',
    purpose: 'The Windows security identifier for the machine.',
    priority: 'High', weight: 30, phase: 1, needsAgent: true,
  },
  {
    id: 'motherboard', name: 'Motherboard serial',
    purpose: 'Unique to the board. Effectively the machine itself.',
    priority: 'High', weight: 30, phase: 1, needsAgent: true,
  },
  {
    id: 'mac', name: 'MAC address',
    purpose: 'The network adapter address. Strong, but changes when the adapter does.',
    priority: 'High', weight: 30, phase: 1, needsAgent: true,
  },
  {
    id: 'secure-boot', name: 'Secure Boot and certificates',
    purpose: 'Firmware integrity. Off is not proof of anything, but it is worth knowing.',
    priority: 'High', weight: 20, phase: 1, needsAgent: true,
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
    enabled: ['tpm', 'machine-sid', 'motherboard', 'secure-boot', 'os'],
    config: { os: { op: 'is at least', value: 'Windows 10 22H2' } },
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
    enabled: ['device-type', 'os', 'browser', 'canvas', 'locale', 'ip', 'isp', 'geo', 'vpn'],
    config: {
      browser: { op: 'is at least', value: 'Chrome 130' },
      ip: { op: 'is in', value: '10.0.0.0/8' },
      geo: { op: 'is in', value: 'India' },
      vpn: 'Challenge',
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
    enabled: ['machine-sid', 'mac'],
    config: {},
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
