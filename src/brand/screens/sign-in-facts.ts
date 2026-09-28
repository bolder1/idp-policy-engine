import type { AccessDecision } from '../data'
import { PLACES } from '../places'

/* -----------------------------------------------------------------------------
   What a sign-in is, as facts rather than as chips.

   The Check tab, the gauntlet and the impact sweep describe a sign-in with five
   chips — a person, "Office Network", "Managed (MDM)", an auth state, "Low"
   risk — and the evaluator used to grade a rule against a hand-written table of
   what each chip meant. That table knew four zone ids and one device fact, so
   any tenant whose zones were not those four got a confident answer about a
   zone it had never read.

   This is the other description: the address, the place, the clock, the device
   and the score, each stated or not stated, and each saying where it came from.
   The evaluator grades a condition by reading the tenant's own zone or profile
   against these, so a zone it has never seen is answered from its entries.

   Three rules hold everywhere a fact is read:

   1. NOT STATED (`undefined`) is not the same as STATED ABSENT (`null`). An
      unstated address leaves every address check undecided; a device that
      reports no screen lock at all has failed a screen-lock check. The two are
      never merged, because merging them is how "we did not ask" turns into
      "they passed".
   2. Every stated fact carries a `FactSource`, and a trace repeats it. A place
      looked up from an address through the fixture is labelled as looked up, so
      nobody reads a fixture row as geo-IP.
   3. `unknown` is a condition state, never a decision. There are three
      decisions — 1 factor, 2 factors, deny — and when a fact is missing the
      evaluator reports every decision the missing fact could produce.

   This file imports nothing from `simulate.ts`, which re-exports it, so the
   types can be read by both without a cycle. The chip adapter at the foot is
   here for the same reason: it turns the five chips into these facts, once,
   for every surface that still speaks in chips.
   -------------------------------------------------------------------------- */

/** Where a fact came from. Every stated fact carries one, and a trace repeats it. */
export type FactSource = 'typed' | 'looked-up' | 'stated' | 'assumed'
/*  typed      the tester typed it (an address, a version)
    looked-up  derived from another fact through a FIXTURE (address → place)
    stated     the tester picked it (a place, a risk score)
    assumed    the chip adapter filled it in so a chip means something concrete */

export type DevicePlatform = 'windows' | 'macos' | 'ios' | 'android' | 'linux' | 'other'
export type BrowserFamily = 'chrome' | 'edge' | 'firefox' | 'safari' | 'other'
/** The device catalogue's own words for a form factor. */
export type FormFactor = 'Mobile' | 'Tablet' | 'Laptop'
export type ScreenLockFact = 'none' | 'pattern' | 'pin' | 'biometric'

/* undefined = NOT STATED, so any check that needs it is 'unknown'.
   null      = STATED ABSENT: nothing on the device reports it. The catalogue
               (fingerprint.ts, the Authenticator-read rows) makes that a FAILED
               check. Never merge the two. */
export interface SignInDevice {
  source: FactSource
  platform?: DevicePlatform
  /** As the platform writes it: '14', '17.5', '10.0.22631', '11'. */
  osVersion?: string
  formFactor?: FormFactor
  browser?: { family: BrowserFamily; version: string }
  integrity?: { rooted: boolean; tampered: boolean; emulated: boolean } | null
  screenLock?: ScreenLockFact | null
  /** null: the miniOrange Authenticator is not installed. '': installed, version not stated. */
  authenticatorVersion?: string | null
  agentInstalled?: boolean
  agentVersion?: string | null
  /** This device is registered to this person under the profile being checked. */
  registeredToPerson?: boolean
  /** Devices this person ALREADY has registered under the profile, not counting this one. */
  registeredCount?: number
}

export interface SignInPlace {
  /** Display names, as zones store them. */
  country: string | null
  state?: string | null
  city: string | null
  lat: number | null
  lon: number | null
  source: FactSource
}

export interface SignInFacts {
  appId?: string
  personId?: string
  network?: { address: string; asn?: string | null; source: FactSource }
  /* undefined: not stated, and looked up from `network` when that is set.
     null: looked up, and the lookup names no place (an anonymiser). */
  location?: SignInPlace | null
  when?: { date?: string /* YYYY-MM-DD */; time: string /* HH:MM */; timeZone: string /* IANA */; source: FactSource }
  device?: SignInDevice
  /** 0–100, compared strictly, as the showcase bands need. */
  risk?: { score: number; source: FactSource }
}

/** The facts that would settle an undecided condition, by name. */
export type FactKey =
  | 'app'
  | 'person'
  | 'address'
  | 'asn'
  | 'location'
  | 'location.city'
  | 'location.coordinates'
  | 'date'
  | 'time'
  | 'risk'
  | 'device.platform'
  | 'device.osVersion'
  | 'device.formFactor'
  | 'device.browser'
  | 'device.integrity'
  | 'device.screenLock'
  | 'device.authenticatorVersion'
  | 'device.agent'
  | 'device.registration'
  | 'device.registeredCount'

/** The three decisions, and nothing else. `unknown` is a condition state, never a decision. */
export type Decision = AccessDecision

// --- The tenant's clock and scale ---------------------------------------------

/** The zone an unqualified window is read in. The fixtures are an Indian tenant. */
export const TENANT_TZ = 'Asia/Kolkata'

export const clock = (mins: number) =>
  `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`

/* What a risk verdict is worth, out of the box.

   Still the shipped numbers, and still the fallback — but no longer the only
   answer. The tenant's risk-signal profile derives its own scale from which
   signals it collects and how heavily it weighs them, and hands it to the
   evaluator on the context. A profile nobody has edited derives exactly these
   three numbers, which is what keeps every seeded policy grading as it did.

   This is the only numeric seam in risk evaluation: `device-risk` is the one
   condition that compares a threshold against a number rather than against a
   band name. Which is precisely why the profile had to own it — a weighting
   screen that could not reach this would be configuration nothing reads. */
export const RISK_SCORE: Record<string, number> = { Low: 12, Medium: 48, High: 86 }

/** A band ("Low", "Medium", "High") as the score the tenant's scale gives it, or undefined for a band it does not know. */
export function riskFromBand(band: string, env?: { riskScale?: Record<string, number> }): SignInFacts['risk'] {
  const score = (env?.riskScale ?? RISK_SCORE)[band]
  return score === undefined ? undefined : { score, source: 'stated' }
}

// --- The chip adapter ---------------------------------------------------------

/* The five chips, as facts.

   The chip surfaces stay exactly as they are; what changes is what a chip
   MEANS to the evaluator. "Office Network" used to mean "inside the zones
   called office and pune-hq", which is a fact about one test estate. It now
   means an address and a place, and the tenant's own zones decide whether that
   address and that place are inside them.

   Every address is from a documentation block (RFC 5737), and the ones the
   geo fixture knows are looked up the same way a typed address is. The place
   is COPIED from the legacy chip table rather than looked up, so the zone,
   country and city answers for one chip can never disagree in one trace; the
   coordinates are the catalogue city's own. A test pins both. */

const cityAt = (id: string): Pick<SignInPlace, 'lat' | 'lon'> => {
  const p = PLACES.find((x) => x.id === id)
  return p ? { lat: p.lat, lon: p.lon } : { lat: null, lon: null }
}

export interface ChipOrigin {
  /** undefined: the chip does not fix a network. */
  address?: string
  /** undefined: not stated. null: stated, and names no place. */
  location?: SignInPlace | null
}

export const CHIP_NETWORK: Readonly<Record<string, ChipOrigin>> = {
  'Any location': {},
  'Office Network': {
    address: '203.0.113.10',
    location: { country: 'India', state: 'Maharashtra', city: 'Pune', ...cityAt('in-maharashtra-pune'), source: 'assumed' },
  },
  /* Austin, Texas: inside no showcase zone, which is what makes it the origin
     worth rehearsing an off-network rule against. */
  'Outside all zones': {
    address: '192.0.2.130',
    location: { country: 'United States', state: 'Texas', city: 'Austin', ...cityAt('us-texas-austin'), source: 'assumed' },
  },
  /* A Tor exit: the address is known and the place is not. */
  'Tor exit node': { address: '192.0.2.66', location: null },
  /* A commercial proxy that geolocates to Germany and no finer — the legacy
     chip said Germany and nothing else, so neither does this. */
  'Known proxy': {
    address: '192.0.2.82',
    location: { country: 'Germany', state: null, city: null, lat: null, lon: null, source: 'assumed' },
  },
}

/* The six device chips, as a device.

   Chosen so a chip still means what its label says — "Managed (MDM)" is a
   registered Windows 11 laptop with the Device Agent, "New / unknown" is a
   phone nobody has registered — and so the legacy "recognised" reading falls
   out of `registeredToPerson` exactly. On every Windows row the handset-only
   signals (integrity, screen lock, Authenticator) are STATED ABSENT: a laptop
   does not report them, and pretending it did would be inventing a pass. */
const WINDOWS_ABSENT = { integrity: null, screenLock: null, authenticatorVersion: null } as const

export const CHIP_DEVICES: Readonly<Record<string, SignInDevice>> = {
  'New / unknown': {
    source: 'assumed',
    platform: 'android',
    osVersion: '12',
    formFactor: 'Mobile',
    browser: { family: 'chrome', version: '128' },
    integrity: null,
    screenLock: null,
    authenticatorVersion: null,
    agentInstalled: false,
    agentVersion: null,
    registeredToPerson: false,
    registeredCount: 0,
  },
  'Known < 90 days': {
    source: 'assumed',
    platform: 'ios',
    osVersion: '17.5',
    formFactor: 'Mobile',
    browser: { family: 'safari', version: '17.5' },
    integrity: { rooted: false, tampered: false, emulated: false },
    screenLock: 'pin',
    authenticatorVersion: '6.5.0',
    agentInstalled: false,
    agentVersion: null,
    registeredToPerson: true,
    registeredCount: 1,
  },
  'Known > 90 days': {
    source: 'assumed',
    platform: 'windows',
    osVersion: '10.0.19045',
    formFactor: 'Laptop',
    browser: { family: 'chrome', version: '126' },
    ...WINDOWS_ABSENT,
    agentInstalled: false,
    agentVersion: null,
    registeredToPerson: true,
    registeredCount: 1,
  },
  'Expired trust': {
    source: 'assumed',
    platform: 'windows',
    osVersion: '10.0.22631',
    formFactor: 'Laptop',
    browser: { family: 'edge', version: '128' },
    ...WINDOWS_ABSENT,
    agentInstalled: true,
    agentVersion: '4.3',
    registeredToPerson: false,
    registeredCount: 1,
  },
  'Managed (MDM)': {
    source: 'assumed',
    platform: 'windows',
    osVersion: '10.0.22631',
    formFactor: 'Laptop',
    browser: { family: 'edge', version: '128' },
    ...WINDOWS_ABSENT,
    agentInstalled: true,
    agentVersion: '4.3',
    registeredToPerson: true,
    registeredCount: 1,
  },
  'Changed fingerprint': {
    source: 'assumed',
    platform: 'windows',
    osVersion: '10.0.22631',
    formFactor: 'Laptop',
    browser: { family: 'edge', version: '128' },
    ...WINDOWS_ABSENT,
    agentInstalled: true,
    agentVersion: '4.3',
    registeredToPerson: false,
    registeredCount: 1,
  },
}

/* The chip context, structurally — every `SimContext` is one. Declared here
   rather than imported so this file stays free of `simulate.ts`. The auth state
   is not read: no sign-in fact carries it (see `chipFacts`). */
export interface ChipContext {
  user: { id: string }
  place: string
  device: string
  risk: string
  nowMinutes: number
}

/* One chip context, as sign-in facts.

   No date: a chip rehearsal has an hour and no day, so a day-of-week condition
   stays undecided and a timezone shift uses standard time, exactly as the chip
   evaluator always has. No application: a chip context has none, and the
   caller that knows the policy adds it.

   The auth state maps to nothing. "First time login" and "MFA recently reset"
   are situations, not facts a sign-in carries, and no condition in the
   catalogue reads them. */
export function chipFacts(ctx: ChipContext, env?: { riskScale?: Record<string, number> }): SignInFacts {
  const origin = CHIP_NETWORK[ctx.place] ?? {}
  const device = CHIP_DEVICES[ctx.device]
  const risk = riskFromBand(ctx.risk, env)
  return {
    personId: ctx.user.id,
    ...(origin.address !== undefined ? { network: { address: origin.address, source: 'assumed' as const } } : null),
    ...(origin.location !== undefined ? { location: origin.location } : null),
    when: { time: clock(ctx.nowMinutes), timeZone: TENANT_TZ, source: 'stated' },
    ...(device ? { device } : null),
    ...(risk ? { risk } : null),
  }
}
