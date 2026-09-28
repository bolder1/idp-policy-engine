import {
  FALLBACK_NAME,
  conditionType,
  rangeText,
  users as seedUsers,
  zoneScopeOf,
  type AccessDecision,
  type Condition,
  type ConditionCard,
  type Group,
  type Policy,
  type Predicate,
  type Rule,
  type User,
  type Zone,
  type ZoneScope,
} from '../data'
import {
  DEFAULT_MATCH,
  decidingCheck,
  profileMatches,
  type FingerprintProfile,
  type MatchOptions,
  type ProfileCheck,
  type ProfileMatch,
} from '../fingerprint'
import type { AuthMethod } from '../methods'
import { sameName, type PlaceKind } from '../places'
import { allOf, anyOf, blame, cardJoin, cardName, credit, leaves, notState, predicatePasses, predicateState, topJoin, type CondState } from '../predicate'
import { hasWho, normaliseWho, whoPasses, type WhoPerson } from '../rule-who'
import {
  CHIP_DEVICES,
  RISK_SCORE,
  TENANT_TZ,
  chipFacts,
  clock,
  type FactKey,
  type FactSource,
  type SignInDevice,
  type SignInFacts,
  type SignInPlace,
} from './sign-in-facts'
import { placeOfSignIn, zoneMember, type ZonePart } from './zone-match'
import { isAddress } from './zone-validation'

/* The sign-in facts model and the chip adapter live beside this file and are
   re-exported from it, so every caller still imports its evaluator vocabulary
   from one place. */
export * from './sign-in-facts'
export type { ZonePart }
export type { MatchOptions, ProfileCheck } from '../fingerprint'

/* -----------------------------------------------------------------------------
   The simulation core.

   Lifted verbatim out of builder-test.tsx so that every surface which claims to
   say what a policy would do — the Test dialog, the Gauntlet, the Impact arena —
   answers from ONE evaluator. Three implementations of "would this rule match"
   is three chances for two screens to contradict each other in front of an
   administrator, and the moment that happens none of them are believed again.

   --- What is modelled, and what is a fixture --------------------------------

   This is a model of the engine, not the engine. It is exact about the parts it
   reads from the tenant and says so; it names the parts that are tables.

   Read from the tenant (when the env carries the library — see `EvalLibrary`):
     · zone membership, from each zone's own entries — IPv4 and IPv6 blocks and
       ranges, ASNs, countries, states, cities, and distance ranges in km or
       miles, each half three-valued (`zone-match.ts`)
     · who a rule and a policy are for, from the directory and the groups
     · the time of day and the day of week, from a real date and time zone,
       daylight saving included (`instantOf`, `wallClock`)
     · the device risk score, compared as a number against the threshold
     · which policy governs a person on an app (`tenant-resolver.ts`)
     · a device against a device profile, row by row (`profileMatches` in
       fingerprint.ts): OS and browser floors, integrity, screen lock, the
       Authenticator and Device Agent versions for a health profile; the
       agent, mobile restriction, registration and device limit for a trusted
       device. Whether a device is registered is a STATED fact — no score
       threshold exists to derive it from — and a trace says it was stated

   Still tables, and said to be:
     · where an address is. `geo-fixture.ts` places a handful of documentation
       address blocks; it is not geo-IP, and a trace says "looked up"
     · what a chip means. `chipFacts` turns "Office Network" into an address
       and a place, and "Managed (MDM)" into a device, so the chip surfaces can
       ask the same evaluator the typed facts do
     · the legacy chip table (`PLACE_FACTS`, `DEVICE_FACTS`), for callers with
       no library — every test estate built on `rawEnv` reads it exactly as
       before

   Exact in either reading, within this prototype's model of a policy: the
   ORDER of evaluation, the first-match-wins stop, the last row, and the
   decision that results. And one rule that holds on both paths: `unknown` is
   never a pass. Where a fact is missing, the typed trace
   reports every decision the missing fact could produce (`tracePolicy`).

   The proposed parts, said once: ordered rules with first-match-wins are this
   prototype's model of a policy. The product's Adaptive Access Policy has four
   restriction sections and resolves conflicts between policies by a weight it
   does not document — `tenant-resolver.ts` implements what IS documented.
   -------------------------------------------------------------------------- */

export interface SimUser {
  id: string
  name: string
  email: string
  groupId: string
  groupName: string
  userType: string
  role: string
}

/* What `user-attr` reads, keyed by the names the catalogue offers.

   A fixed table, and the module header already says why that is the honest
   shape here: the map from a context option to a condition value is a table,
   not the engine. What is exact is the order of evaluation and the decision,
   as this prototype models them.

   Only the keys a `SimUser` can actually answer. `designation`, `team`, `age`
   and `years_of_experience` are offered by the catalogue and are NOT here —
   a directory holds them and this fixture does not, so a rule naming one comes
   back undecided rather than passing on a value nobody supplied. That is the
   same rule `unknown` follows everywhere else in this evaluator. */
export const userAttr = (u: SimUser, key: string): string | null => {
  if (key === 'email') return u.email
  if (key === 'username') return u.email.split('@')[0]
  if (key === 'department') return u.groupName
  if (key === 'employment_type') return u.userType
  return null
}

export const SIM_USERS: SimUser[] = [
  { id: 'priya', name: 'Priya Sharma', email: 'priya@mo.com', groupId: 'finance', groupName: 'Finance', userType: 'Employee', role: 'Member' },
  { id: 'arun', name: 'Arun Patel', email: 'arun@mo.com', groupId: 'engineering', groupName: 'Engineering', userType: 'Employee', role: 'Member' },
  { id: 'mehak', name: 'Mehak Garg', email: 'mehak@mo.com', groupId: 'executives', groupName: 'Executives', userType: 'Employee', role: 'Admin' },
  { id: 'devon', name: 'Devon Rao', email: 'devon@ext.com', groupId: 'contractors', groupName: 'Contractors', userType: 'Contractor', role: 'Member' },
]

export const PLACES = ['Any location', 'Office Network', 'Outside all zones', 'Tor exit node', 'Known proxy']
export const DEVICE_OPTIONS = ['New / unknown', 'Known < 90 days', 'Known > 90 days', 'Expired trust', 'Managed (MDM)', 'Changed fingerprint']
export const AUTH_STATES = ['Normal returning user', 'First time login', 'MFA recently reset', 'No MFA configured']
export const RISKS = ['Low', 'Medium', 'High']

/* `zonesIn: null` is the whole reason "Any location" is not a free pass. An
   unspecified origin cannot decide a zone test either way, so those rules come
   back undecided rather than silently passing — which is what tells the author
   to pin the axis down. Every other option names its zones exactly, so
   "not in zone X" is definite for all X. */
export interface PlaceFacts {
  zonesIn: string[] | null
  /* Which half of each zone this origin actually satisfies.

     A zone is two ANDed sections — a network half and a geographic half — and a
     condition may now name one of them. `zonesIn` alone cannot answer that: it
     says the origin is inside "Corporate ASN" without saying whether it got
     there by its address or by its country, so a rule narrowed to one half
     would be graded against the other and the trace would state a verdict it
     had not earned. That is the one failure this simulator is written to avoid.

     Two explicit lists rather than one plus a subtraction, because a zone can
     be satisfied on BOTH halves — "Reliance Jio · India" is an ASN and a
     country — and `zonesIn minus zonesByIp` would silently drop it from the
     geographic side. `zonesIn` stays the union of the two, and a test pins
     that. */
  zonesByIp: string[]
  zonesByLocation: string[]
  country: string | null
  state: string | null
  city: string | null
}

/* Derived from the zone library rather than asserted — and two rows changed
   when somebody finally derived them.

   An EMPTY section of a zone means ANY, not none. The zones screen draws it as
   "Any network" / "Any location" and the validator says so out loud, so a zone
   with no addresses at all is reached by its geography alone — and two of these
   origins reach one:

     `eu`      no addresses, countries [Germany, France]. "Known proxy"
               geolocates to Germany, so it is inside, by location.
     `pune-hq` no addresses, within 25 km of Pune. "Office
               Network" geolocates to Pune, so it is inside, by location.
     `jio-in`  countries [India], but its network half is `asn: ['AS55836']`,
               which is CONSTRAINED — and nothing here is on Reliance Jio. It is
               the one library zone none of these five origins is in.

   `zonesIn` was already wrong about the first two before the halves existed:
   "Known proxy" answered PASS to `Country is Germany` and FAIL to `in zone EU
   Countries` in the same trace, which is the single contradiction this module's
   header says would end an administrator's trust in every other answer it gives.

   Splitting the field is what surfaced it. An all-empty geographic column is
   the only value consistent with the old `zonesIn`, and it would have meant no
   location-scoped rule could ever match anything in a rehearsal, a sweep or a
   gauntlet round — so the new half could not be written honestly without
   checking the old one.

   Read only when the env carries no library. With one, a chip's zone is graded
   from the tenant's own zone entries (see `chipZone`), because this table knows
   the four ids of one test estate and nothing else. */
export const PLACE_FACTS: Record<string, PlaceFacts> = {
  'Any location': { zonesIn: null, zonesByIp: [], zonesByLocation: [], country: null, state: null, city: null },
  'Office Network': { zonesIn: ['office', 'pune-hq'], zonesByIp: ['office'], zonesByLocation: ['pune-hq'], country: 'India', state: 'Maharashtra', city: 'Pune' },
  /* Austin, Texas is in none of the six, which is what makes this the origin
     worth rehearsing an off-network rule against. */
  'Outside all zones': { zonesIn: [], zonesByIp: [], zonesByLocation: [], country: 'United States', state: 'Texas', city: 'Austin' },
  /* No country at all, so it is in `anon` by address and in nothing by map. */
  'Tor exit node': { zonesIn: ['anon'], zonesByIp: ['anon'], zonesByLocation: [], country: null, state: null, city: null },
  'Known proxy': { zonesIn: ['anon', 'eu'], zonesByIp: ['anon'], zonesByLocation: ['eu'], country: 'Germany', state: null, city: null },
}

export interface DeviceFacts {
  /* Whether the fingerprint still matches — not whether the device is
     healthy. A device can be perfectly recognisable and badly configured. */
  recognised: boolean
  mdm: string
  registration: string
  trustDays: number
}

export const DEVICE_FACTS: Record<string, DeviceFacts> = {
  'New / unknown': { recognised: false, mdm: 'Not enrolled', registration: 'Unregistered', trustDays: 0 },
  'Known < 90 days': { recognised: true, mdm: 'Not enrolled', registration: 'Registered', trustDays: 34 },
  'Known > 90 days': { recognised: true, mdm: 'Not enrolled', registration: 'Registered', trustDays: 214 },
  'Expired trust': { recognised: false, mdm: 'Not enrolled', registration: 'Pending', trustDays: 402 },
  'Managed (MDM)': { recognised: true, mdm: 'Enrolled', registration: 'Registered', trustDays: 120 },
  'Changed fingerprint': { recognised: false, mdm: 'Not enrolled', registration: 'Registered', trustDays: 61 },
}

export interface SimContext {
  user: SimUser
  place: string
  device: string
  authState: string
  risk: string
  /** Captured once per run so the trace cannot shift under a re-render. */
  nowMinutes: number
  /* Typed sign-in facts, when the caller has them. Optional, and absent on
     every chip surface, which is what keeps `contextFor()` and every context
     literal assignable. Present, the zone, device profile, risk, time, day and
     place conditions are graded from these facts rather than from the chips;
     who a person is still comes from `user`. */
  facts?: SignInFacts
}

/* The tenant objects a truthful answer needs.

   Optional on `SimEnv`, and absence is the compatibility promise: with no
   library, every legacy path behaves exactly as before — `rawEnv`, and every
   test estate built on it, still grades a zone from the chip table. With one,
   a chip's zone is graded from the zone's own entries, and the typed path can
   read people, groups and policies by id. */
export interface EvalLibrary {
  zones: readonly Zone[]
  fingerprints: readonly FingerprintProfile[]
  people: readonly User[]
  groups: readonly Group[]
  methods: readonly AuthMethod[]
  policies: readonly Policy[]
}

export interface SimEnv {
  zoneName: (id: string) => string
  fingerprintName: (id: string) => string
  groupName: (id: string) => string
  /* A person's name, for the trace line of a rule whose who did not match.
     Optional, and absent falls back to the seeded directory, then the id. */
  userName?: (id: string) => string
  /* An application's name, for the resolver's "Does not cover HRMS". Optional,
     and absent names the application by its id. */
  appName?: (id: string) => string
  /* What the three risk verdicts are worth in this tenant, from the risk-signal
     profile. Optional, and absent means the shipped scale.

     On the ENV rather than on the context, and that is the whole reason this
     wiring is one line instead of seven. A context is built at seven call sites
     — the board's rehearsal, the Check tab, the trail's preview, the gauntlet's
     thirteen cards, the impact sweep's 1,440 situations — and each would have
     had to learn about a tenant setting it has no other business knowing. The
     env is already threaded to every one of them, because it is where the
     lookups a rule needs but a situation does not already live. */
  riskScale?: Record<string, number>
  /* Whether the tenant still has this zone / device profile. Optional, and
     absent means every id exists, which is how the evaluator behaved before.

     Passed, a condition naming a deleted one comes back `unknown` — never a
     pass, under `in` or `not in` alike. The linter reports it as PE134 / PE135;
     the rehearsal must not grade it as though the object were still there. */
  hasZone?: (id: string) => boolean
  hasFingerprint?: (id: string) => boolean
  /** The tenant's own objects. See `EvalLibrary`; absent means the legacy chip table. */
  library?: EvalLibrary
  /* How a device-health profile's client rows are read (`MatchOptions` in
     fingerprint.ts). Optional, and absent is the handset reading. */
  deviceMatch?: MatchOptions
}

// --- Evaluation --------------------------------------------------------------

/* Lives in predicate.ts now, so the predicate can be read three-valued without
   a cycle through this file. Re-exported so nothing that imported it moves. */
export type { CondState }

/* Where the tenant's clock sits, and how far every offerable zone is from UTC.

   Minutes, not hours, because two of these are not whole hours — and a table
   that could not express Asia/Kolkata would be a table that quietly rounded a
   fixture's own timezone away.

   STANDARD time only. There is no date in a `SimContext`, so there is nothing
   to decide DST against; a rehearsal in July against Europe/Berlin is an hour
   out, and that is a stated limit rather than a bug to hunt. The typed path
   uses this table only when it is given no date either, and says so. */
const TZ_OFFSET: Record<string, number> = {
  'Asia/Kolkata': 330,
  'Europe/Berlin': 60,
  'Europe/London': 0,
  'America/New_York': -300,
  'America/Los_Angeles': -480,
  'Asia/Tokyo': 540,
  'Asia/Singapore': 480,
  'Australia/Sydney': 600,
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map((n) => Number(n))
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0)
}

/** The condition's values as the trace names them — zones and profiles by name. */
function shownValues(c: Condition, env: SimEnv): string {
  const t = conditionType(c.typeId)
  const vals = c.values.filter((v) => v.trim() !== '')
  return t.valueKind === 'zone'
    ? vals.map((v) => (env.hasZone && !env.hasZone(v) ? '(deleted)' : env.zoneName(v))).join(', ')
    : t.valueKind === 'fingerprint'
      ? vals.map((v) => (env.hasFingerprint && !env.hasFingerprint(v) ? 'a deleted device profile' : env.fingerprintName(v))).join(', ')
      : t.valueKind === 'time'
        ? `${vals[0] ?? '—'}–${vals[1] ?? '—'}`
        : vals.join(', ')
}

export function condPhrase(c: Condition, env: SimEnv): string {
  const t = conditionType(c.typeId)
  return `${t.label} ${c.operator} ${shownValues(c, env) || '…'}`
}

/* The condition types the typed path answers from facts when a caller hands a
   context explicit facts. Everything else — who the person is, the legacy
   directory conditions, the ones nothing can settle — keeps reading the chip
   context, which carries the same person. */
const FROM_FACTS = new Set(['zone', 'fingerprint', 'device-risk', 'time', 'day', 'country', 'state', 'city'])

type CondVerdict = { state: CondState; detail: string }

/* One condition against one context. `unknown` is deliberately NOT treated as a
   pass: a signal this sim cannot derive is reported as unmet, because claiming
   a match on a fact we never had is the one failure mode that would make the
   whole trace untrustworthy.

   `card` is the card the condition sits in, handed on to `evalCondition` so a
   weekday with no zone of its own reads the zone of a time window beside it —
   the same reading `traceRule` gives, so `walk` and `tracePolicy` cannot
   disagree about one rule on the same facts. Optional, and only the typed
   path reads it. */
export function evalCond(c: Condition, ctx: SimContext, env?: SimEnv, card?: ConditionCard): CondVerdict {
  const vals = c.values.filter((v) => v.trim() !== '')
  if (vals.length === 0) return { state: 'unknown', detail: 'the condition has no value set' }

  /* The bridge to the typed path, and the only place the two meet.

     Explicit facts on the context: the fact-shaped conditions are answered
     from them, word for word what `evalCondition` says.

     No facts, but a library on the env: the chips are turned into facts, and
     two conditions are graded from the tenant's own objects. A ZONE, from the
     zone's entries — the whole fix for a tenant whose zones are not the four
     the chip table names — in sentences that keep their chip shape ("this
     login is in Office Network"), so the chip surfaces read as they always
     have; "Any location" keeps its own undecided sentence, because it states
     no origin to grade. A DEVICE PROFILE, row by row from the chip's device,
     in the typed sentence: there is no chip-shaped sentence for "Android 12 is
     below the floor of 13", and "the fingerprint matches" was the sentence
     that hid it. A device does not depend on the origin chip, so this one is
     asked whatever the place. Everything else on the chip path — risk, the
     clock, the day, the legacy place conditions — stays on the legacy code,
     which reads the same numbers from the same chips.

     Neither: nothing here runs, and the legacy code answers exactly as it did. */
  if (ctx.facts && FROM_FACTS.has(c.typeId)) {
    const r = evalCondition(c, ctx.facts, env ?? rawEnv, card)
    return { state: r.status, detail: r.detail }
  }
  if (!ctx.facts && env?.library && c.typeId === 'zone' && PLACE_FACTS[ctx.place]?.zonesIn != null) {
    return chipZone(c, ctx, env, env.library.zones)
  }
  if (!ctx.facts && env?.library && c.typeId === 'fingerprint') {
    return chipProfile(c, ctx, env, env.library.fingerprints)
  }
  return legacyCond(c, ctx, env)
}

/* The chip table's reading of one condition — what `evalCond` has always done,
   unchanged, for every caller with no library and no facts. */
function legacyCond(c: Condition, ctx: SimContext, env?: SimEnv): CondVerdict {
  const t = conditionType(c.typeId)
  const vals = c.values.filter((v) => v.trim() !== '')
  const negated = c.operator.includes('not')
  const place = PLACE_FACTS[ctx.place]
  const device = DEVICE_FACTS[ctx.device]
  const decide = (hit: boolean, detail: string): CondVerdict => ({
    state: (negated ? !hit : hit) ? 'pass' : 'fail',
    detail,
  })
  const unknown = (detail: string): CondVerdict => ({ state: 'unknown', detail })

  /* On `c.typeId`, not on `t.id`, and the difference is a wrong answer.

     `t` is the RESOLVED type, so a condition naming an attribute the catalogue
     no longer has used to arrive here wearing the sentinel's id — or, before
     the sentinel existed, wearing `zone`'s. Switching on the stored id means an
     attribute this evaluator does not know falls to `default` and says so,
     which is the one thing the trace has to be able to do. */
  switch (c.typeId) {
    case 'zone': {
      if (env?.hasZone && vals.some((v) => !env.hasZone!(v))) return unknown('this rule names a zone that no longer exists')
      if (!place.zonesIn) return unknown('“Any location” does not fix an origin, so zone membership is undecided')
      /* The half each zone was asked about, and nothing wider. A zone scoped to
         the network half must not be satisfied by a geographic match it did not
         ask for — that is the whole reason the scope exists. Per zone since 22
         Sep 2026: each named zone is tested against its own half's pool. */
      const zonesIn = place.zonesIn
      const poolOf = (h: 'both' | ZoneScope): readonly string[] =>
        (h === 'ip' ? place.zonesByIp : h === 'location' ? place.zonesByLocation : zonesIn) ?? []
      const hit = vals.find((v) => poolOf(zoneScopeOf(c, v)).includes(v))
      const inside = hit !== undefined
      const halves = [...new Set(vals.length > 0 ? vals.map((v) => zoneScopeOf(c, v)) : (['both'] as const))]
      /* The half that decided it: the matching zone's, or — on a miss — the one
         every zone shares. Mixed halves on a miss say none, rather than naming
         one zone's half as though it were the condition's. */
      const half = hit !== undefined ? halfWord(zoneScopeOf(c, hit)) : halves.length === 1 ? halfWord(halves[0]) : ''
      /* Built from the membership that was actually tested, not from the
         origin's standing generally — otherwise the sentence asserts the thing
         the verdict has just rejected. Asking about the office network by
         geography returned FAIL under the detail "this sign-in is in Office
         Network by location": true of the origin, false of the half tested, and
         printed directly beneath the word FAIL.

         Gating on `pool.length` alone is not enough, and it took a test to say
         so: once an origin is inside SOME zone by location, a location-scoped
         miss still has a non-empty pool, so the "in ${ctx.place}" branch fired
         again. The three cases are the three real answers — it is in one of
         these, it is in none at all, or it is in a zone but not one of these.

         Unscoped, the first two branches are word-for-word what they were. */
      const where = inside
        ? `this login is in ${ctx.place}`
        : halves.every((h) => poolOf(h).length === 0)
          ? 'this login is in no zone at all'
          : 'this login is in another zone'
      return decide(inside, `${where}${half}`)
    }
    case 'country':
      return place.country === null
        ? unknown(`“${ctx.place}” does not fix a country`)
        : decide(vals.includes(place.country), `the connection geolocates to ${place.country}`)
    case 'state':
      return place.state === null
        ? unknown(`“${ctx.place}” does not fix a state`)
        : decide(vals.includes(place.state), `the connection geolocates to ${place.state}`)
    case 'city':
      return place.city === null
        ? unknown(`“${ctx.place}” does not fix a city`)
        : decide(vals.includes(place.city), `the connection geolocates to ${place.city}`)

    case 'fingerprint':
      if (env?.hasFingerprint && vals.some((v) => !env.hasFingerprint!(v)))
        return unknown('this rule names a device profile that no longer exists')
      return decide(
        device.recognised,
        `the device fingerprint ${device.recognised ? 'matches the profile' : 'does not match the profile'}`,
      )
    case 'mdm':
      return decide(vals.includes(device.mdm), `the device is ${device.mdm.toLowerCase()} in MDM`)
    case 'device-reg':
      return decide(vals.includes(device.registration), `the device is ${device.registration.toLowerCase()}`)
    case 'trust-age': {
      const limit = Number(vals[0])
      if (!Number.isFinite(limit)) return unknown('the trust-age limit is not a number')
      const hit = c.operator === 'under' ? device.trustDays < limit : device.trustDays > limit
      // Handled directly rather than through decide() — "under"/"over" carry
      // the comparison, so the generic negation flip does not apply.
      return { state: hit ? 'pass' : 'fail', detail: `this device has been trusted for ${device.trustDays} days` }
    }

    case 'ml-risk':
      return decide(vals.includes(ctx.risk), `the risk signal is ${ctx.risk}`)
    case 'device-risk': {
      const limit = Number(vals[0])
      if (!Number.isFinite(limit)) return unknown('the risk threshold is not a number')
      const score = (env?.riskScale ?? RISK_SCORE)[ctx.risk]
      const hit = c.operator === 'above' ? score > limit : score < limit
      return { state: hit ? 'pass' : 'fail', detail: `${ctx.risk} risk scores ${score}` }
    }

    case 'auth-state':
      return decide(vals.includes(ctx.authState), `the auth state is ${ctx.authState.toLowerCase()}`)
    case 'user-type':
      return decide(vals.includes(ctx.user.userType), `${ctx.user.name} is a ${ctx.user.userType.toLowerCase()}`)
    case 'user-role':
      return decide(vals.includes(ctx.user.role), `${ctx.user.name} has the ${ctx.user.role} role`)
    /* Legacy only. People and groups are `Rule.who` now and `evalRule` reads
       that before any card; no picker writes these two and the linter reports
       one as PE150. They still evaluate honestly, keyed by id, so a rule that
       has not been migrated is rehearsed as it would run rather than going
       quiet. */
    case 'group':
      return decide(vals.includes(ctx.user.groupId), `${ctx.user.name} is in ${ctx.user.groupName}`)
    case 'user':
      return decide(vals.includes(ctx.user.id), `this login is ${ctx.user.name}`)

    /* An attribute the directory holds, by name.

       Two ways to be undecided and they are different: no key means the author
       has not finished the condition, and a key this fixture cannot answer
       means the SIMULATION does not have the value. Both are `unknown` — which
       is never a pass — and the sentences say which, because "no attribute
       chosen" is a thing to go and fix and "the sim does not model team" is
       not. */
    case 'user-attr': {
      if (!c.key) return unknown('the condition does not say which attribute')
      const got = userAttr(ctx.user, c.key)
      if (got === null) return unknown(`this simulation does not carry “${c.key}”`)
      const hit =
        c.operator === 'contains'
          ? vals.some((v) => got.toLowerCase().includes(v.toLowerCase()))
          : c.operator === 'above' || c.operator === 'below'
            ? (() => {
                const a = Number(got)
                const b = Number(vals[0])
                if (!Number.isFinite(a) || !Number.isFinite(b)) return false
                return c.operator === 'above' ? a > b : a < b
              })()
            : vals.some((v) => v.toLowerCase() === got.toLowerCase())
      /* `above` and `below` carry the comparison, so the generic negation flip
         must not also apply to them. */
      if (c.operator === 'above' || c.operator === 'below')
        return { state: hit ? 'pass' : 'fail', detail: `${c.key} is ${got}` }
      return decide(hit, `${c.key} is ${got}`)
    }

    /* A key this product has never heard of, by definition. Nothing in a
       fixture can answer it, and saying so is the whole value of the case —
       without it the row falls to `default` and reports "this simulation does
       not model custom attribute", which sounds like a gap in the simulator
       rather than a fact about where the value lives. */
    case 'custom-attr':
      return unknown(
        c.key
          ? `“${c.key}” comes from your directory, which this simulation does not call`
          : 'the condition does not say which attribute',
      )

    /* The endpoint is not called, and the rule that consults one cannot be
       rehearsed without calling it.

       `unknown`, deliberately, and it is the correct answer rather than a
       missing feature: a hook's verdict depends on a live service, so any value
       this simulator invented would be a rehearsal of a decision the product
       never made. The hook's FAILURE MODE is the part that can be reasoned
       about statically, and `diagnostics` already does — PE130 to PE133. */
    case 'webhook':
      return unknown('an external hook is not called during a rehearsal')

    case 'time': {
      const from = toMinutes(vals[0] ?? '00:00')
      const to = toMinutes(vals[1] ?? '23:59')
      /* The clock the window is read against, shifted into the zone it names.

         `ctx.nowMinutes` is one number — the hour the rehearsal is set to — and
         it has no zone of its own, so the honest reading is "this is the
         tenant's local time". A condition that names Europe/Berlin is asking
         about a different clock, and `TZ_OFFSET` is the fixed table that says
         how far apart the two are. Fixed, because the module header says the
         map from a context option to a value is a table rather than the engine:
         no DST, no date, and both of those would matter in a real evaluator.

         Absent `tz` shifts by nothing, which is exactly what every window meant
         before the field existed.

         A shifted clock says it was read on standard time. With no date there
         is no daylight saving to apply, and "05:30 in Europe/Berlin" printed
         bare would state as fact an hour that is an hour out all summer. */
      const shift = c.tz ? (TZ_OFFSET[c.tz] ?? 0) - (TZ_OFFSET[TENANT_TZ] ?? 0) : 0
      const local = ((ctx.nowMinutes + shift) % 1440 + 1440) % 1440
      // A window that wraps midnight is an OR, not an AND.
      const inside = from <= to ? local >= from && local <= to : local >= from || local <= to
      const onStandard = c.tz !== undefined && c.tz !== TENANT_TZ ? ' (standard time)' : ''
      return decide(inside, c.tz ? `it is ${clock(local)} in ${c.tz}${onStandard}` : `it is ${clock(ctx.nowMinutes)} right now`)
    }

    default:
      return unknown(`this simulation does not model ${t.label.toLowerCase()}`)
  }
}

const halfWord = (h: 'both' | ZoneScope) => (h === 'ip' ? ' on the network' : h === 'location' ? ' by location' : '')

/* A chip context's zone, read from the tenant's zones.

   The chips become facts (`chipFacts`: "Office Network" is 203.0.113.10 in
   Pune) and each named zone is asked about those facts through its own
   entries. The verdict is the typed path's; the SENTENCE keeps the chip
   path's three shapes — it is in this origin, it is in no zone at all, it is
   in another zone — so a chip surface reads the way it always has, and only
   says something new when the answer is new. "In none of these zones" is that
   case: a zone the facts cannot place (a location-only zone, asked about a Tor
   exit that names no place) is not somewhere the sign-in can be said to be, or
   not to be.

   Remembered per zone object and origin, because the impact sweep asks this
   question 1,440 times per run and the chip's address and place — the only
   facts a zone reads — depend on the origin chip alone. A zone that is edited
   is a new object, so the memory cannot outlive the zone it describes. */
const CHIP_MEMBERSHIP = new WeakMap<Zone, Map<string, CondState>>()

function chipMember(zone: Zone, place: string, facts: SignInFacts, scope: 'both' | ZoneScope): CondState {
  let byOrigin = CHIP_MEMBERSHIP.get(zone)
  if (!byOrigin) {
    byOrigin = new Map()
    CHIP_MEMBERSHIP.set(zone, byOrigin)
  }
  const key = `${place}|${scope}`
  let state = byOrigin.get(key)
  if (state === undefined) {
    state = zoneMember(zone, facts, scope).status
    byOrigin.set(key, state)
  }
  return state
}

function chipZone(c: Condition, ctx: SimContext, env: SimEnv, zones: readonly Zone[]): CondVerdict {
  const vals = c.values.filter((v) => v.trim() !== '')
  if (vals.some((v) => (env.hasZone && !env.hasZone(v)) || !zones.some((z) => z.id === v)))
    return { state: 'unknown', detail: 'this rule names a zone that no longer exists' }
  const facts = chipFacts(ctx, env)
  const states = vals.map((v) => chipMember(zones.find((z) => z.id === v)!, ctx.place, facts, zoneScopeOf(c, v)))
  const inside = anyOf(states)
  /* Undecided: the typed sentence says which fact is missing, and there is no
     chip-shaped sentence that would be true instead. */
  if (inside === 'unknown') return { state: 'unknown', detail: evalCondition(c, facts, env).detail }

  const hit = states.indexOf('pass')
  const halves = [...new Set(vals.map((v) => zoneScopeOf(c, v)))]
  const half = hit >= 0 ? halfWord(zoneScopeOf(c, vals[hit])) : halves.length === 1 ? halfWord(halves[0]) : ''
  const elsewhere = halves.map((h) => anyOf(zones.map((z) => chipMember(z, ctx.place, facts, h))))
  const where =
    inside === 'pass'
      ? `this login is in ${ctx.place}`
      : elsewhere.every((s) => s === 'fail')
        ? 'this login is in no zone at all'
        : elsewhere.some((s) => s === 'pass')
          ? 'this login is in another zone'
          : 'this login is in none of these zones'
  const negated = c.operator.includes('not')
  return { state: (negated ? inside === 'fail' : inside === 'pass') ? 'pass' : 'fail', detail: `${where}${half}` }
}

/* A chip context's device profile, read from the tenant's profiles.

   Word for word what `evalCondition` says of the chip's facts — the verdict
   and the sentence are the typed path's, and a test holds the two equal for
   every device chip. Written out here only so it can be remembered: the impact
   sweep asks this 1,440 times a run, and the chip's device and whether the
   person is known are the only facts a profile reads. Keyed per profile
   object, so an edited profile — a new object — is graded afresh. */
const CHIP_PROFILE = new WeakMap<FingerprintProfile, Map<string, { match: ProfileMatch; words: string }>>()

function chipProfile(c: Condition, ctx: SimContext, env: SimEnv, profiles: readonly FingerprintProfile[]): CondVerdict {
  const vals = c.values.filter((v) => v.trim() !== '')
  if (vals.some((v) => (env.hasFingerprint && !env.hasFingerprint(v)) || !profiles.some((p) => p.id === v)))
    return { state: 'unknown', detail: 'this rule names a device profile that no longer exists' }
  const device = CHIP_DEVICES[ctx.device]
  const personKnown = personOf(ctx.user.id, env) !== null
  const key = `${ctx.device}|${personKnown}|${env.deviceMatch?.clientRows ?? DEFAULT_MATCH.clientRows}`
  const graded = vals.map((v) => {
    const p = profiles.find((x) => x.id === v)!
    let byDevice = CHIP_PROFILE.get(p)
    if (!byDevice) {
      byDevice = new Map()
      CHIP_PROFILE.set(p, byDevice)
    }
    let g = byDevice.get(key)
    if (!g) {
      const match = profileMatches(p, device, { ...env.deviceMatch, personKnown })
      g = { match, words: profileWords(p, match, device) }
      byDevice.set(key, g)
    }
    return g
  })
  const inside = anyOf(graded.map((g) => g.match.status))
  return { state: c.operator.includes('not') ? notState(inside) : inside, detail: graded.map((g) => g.words).join('; ') }
}

/* What an unmatched sign-in gets. Optional on the model so every existing
   policy literal keeps working, and `1fa` here is the behaviour those policies
   already had — so reading it is a no-op for them and a real answer for
   anything that has set it. */
export const fallbackOf = (p: Policy): AccessDecision => p.fallback?.decision ?? '1fa'

export interface RuleVerdict {
  match: boolean
  reason: string
  /** Which card carried the match, or came closest to it. Null when there are no cards. */
  card: number | null
}

/* One rule against one context.

   The audience test that used to sit at the top of this function is gone — it
   is a policy-level fact now, short-circuited once in `walk` rather than
   re-asked for every rule. What is left is the predicate, and the predicate is
   a disjunction: the rule matches when ANY card has every one of its conditions
   met.

   `unknown` is not a pass, here as in `evalCond`. A card the simulator cannot
   fully decide does not carry the match.

   Who comes first. It is ANDed with the whole WHEN, so a person the rule is
   not for misses before a single condition is read, and the trace says who
   the rule was for rather than blaming a card. */
export function evalRule(rule: Rule, ctx: SimContext, env: SimEnv): RuleVerdict {
  const p = rule.when

  if (!whoPasses(rule.who, ctx.user)) {
    return { match: false, reason: whoMissReason(rule, ctx, env), card: null }
  }

  if (p.cards.length === 0) {
    return { match: true, reason: catchAllReason(rule), card: null }
  }

  const results = new Map<string, CondVerdict>()
  const cardOf = cardsByCondition(p)
  for (const c of leaves(p)) results.set(c.id, evalCond(c, ctx, env, cardOf.get(c.id)))
  const passed = (c: Condition) => results.get(c.id)?.state === 'pass'
  return predicateVerdict(p, passed, (c) => results.get(c.id)?.detail ?? '', env)
}

/* Which card each condition sits in, by condition id. Built the same way for
   `evalRule` and `traceRule`, so both paths hand `evalCondition` the same card. */
function cardsByCondition(p: Predicate): Map<string, ConditionCard> {
  const cardOf = new Map<string, ConditionCard>()
  for (const k of p.cards) for (const c of k.conditions) cardOf.set(c.id, k)
  return cardOf
}

const catchAllReason = (rule: Pick<Rule, 'who'>) =>
  hasWho(rule.who)
    ? 'No conditions — this step catches everyone it applies to'
    : 'No conditions — this step catches everything that reaches it'

/* The sentence for a predicate, given which of its conditions passed. Shared by
   `evalRule` and `traceRule`, so a rule decided on either path reads the same
   words — the typed trace is not allowed a second opinion about phrasing. */
function predicateVerdict(p: Predicate, passed: (c: Condition) => boolean, detailOf: (c: Condition) => string, env: SimEnv): RuleVerdict {
  /* Asked of the whole predicate. `credit` names the card that carried it,
     but with the cards joined by AND one passing card is not a match — every
     card has to hold, and returning on the first would report a match the
     engine would not make. */
  const won = predicatePasses(p, passed) ? credit(p, passed) : null
  if (won) {
    const n = won.card.conditions.length
    const oneRun = p.cards.length === 1
    /* "All N conditions met" is only true when there is one card. With
       alternatives it is false — the other card's conditions were NOT met —
       and a trace that overstates what it checked is a trace nobody believes
       the second time. */
    return {
      match: true,
      reason: oneRun
        ? cardJoin(won.card) === 'or'
          ? `One of ${n} condition${n === 1 ? '' : 's'} met`
          : `All ${n} condition${n === 1 ? '' : 's'} met`
        : topJoin(p) === 'and'
          ? `All ${p.cards.length} groups met`
          : `Matched ${cardName(won.card, won.index)}`,
      card: won.index,
    }
  }

  /* One reason, not a list — but "the first thing that failed" is meaningless
     across three alternatives that each failed differently. The useful answer
     is the alternative that came closest. */
  const near = blame(p, passed)
  if (!near) return { match: false, reason: 'No card could be satisfied', card: null }
  const detail = detailOf(near.condition)
  const prefix = p.cards.length > 1 ? `Closest was ${cardName(near.card, near.index)}: ` : ''
  return { match: false, reason: `${prefix}${condPhrase(near.condition, env)} — ${detail}`, card: near.index }
}

/* Why a rule's who did not cover this person, in one line.

   "Not Finance or Mehak Rao" when they are outside the chosen groups and
   people; "Contractors is an exception" or "Devon Rao is an exception" when
   they were included and then taken out. Names come from the env, so a renamed
   group reads as renamed. */
export function whoMissReason(rule: Pick<Rule, 'who'>, ctx: SimContext, env: SimEnv): string {
  return whoMissFor(rule, ctx.user, env)
}

/* The same sentence for any person record, so the typed trace (which has a
   person but no chip context) words a who exactly as the chip trace does. */
function whoMissFor(rule: Pick<Rule, 'who'>, user: WhoPerson & { name: string }, env: SimEnv): string {
  const w = normaliseWho(rule.who)
  if (!w) return ''
  const person = (id: string) => env.userName?.(id) ?? seedUsers.find((u) => u.id === id)?.name ?? id
  /* In the order `whoPasses` decides: not included at all is the reason before
     any exception is, so "Finance except Priya" reads "Not Finance" to Devon
     in Contractors even when Devon is also listed as an exception. */
  const included = w.groupIds.length + w.userIds.length === 0 || w.groupIds.includes(user.groupId) || w.userIds.includes(user.id)
  if (included && w.exceptUserIds?.includes(user.id)) return `${user.name} is an exception`
  if (included && w.exceptGroupIds?.includes(user.groupId)) return `${env.groupName(user.groupId)} is an exception`
  const names = [...w.groupIds.map((id) => env.groupName(id)), ...w.userIds.map(person)]
  const list = names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`
  return `Not ${list}`
}

/** Does this policy govern the person signing in? Asked once, above the rules. */
export function inAudience(policy: Policy, ctx: SimContext): boolean {
  const a = policy.audience
  return a.everyone || a.groupIds.includes(ctx.user.groupId) || a.userIds.includes(ctx.user.id)
}

export type StepKind = 'off' | 'miss' | 'hit' | 'unreached'

export interface TraceStep {
  index: number
  rule: Rule
  kind: StepKind
  reason: string
}

export interface TraceResult {
  steps: TraceStep[]
  hitIndex: number | null
  decision: AccessDecision
  /* The policy did not govern this person at all, so no rule ran.

     Distinct from "every rule missed": the surfaces that count what the engine
     decided must not fold these together, or a policy scoped to Finance reads
     as though it evaluated — and let through — every contractor in the tenant. */
  outOfAudience: boolean
}

export function walk(policy: Policy, ctx: SimContext, env: SimEnv): TraceResult {
  const steps: TraceStep[] = []
  let hitIndex: number | null = null

  /* The audience, asked once. It used to be re-asked inside every rule, which
     produced a trace where five rules each explained separately that they were
     not for this person. The policy either governs somebody or it does not. */
  if (!inAudience(policy, ctx)) {
    return { steps, hitIndex: null, decision: fallbackOf(policy), outOfAudience: true }
  }

  for (let i = 0; i < policy.rules.length; i++) {
    const rule = policy.rules[i]
    if (hitIndex !== null) {
      steps.push({ index: i, rule, kind: 'unreached', reason: 'Evaluation had already stopped' })
      continue
    }
    if (!rule.enabled) {
      steps.push({ index: i, rule, kind: 'off', reason: 'This step is switched off' })
      continue
    }
    const verdict = evalRule(rule, ctx, env)
    steps.push({ index: i, rule, kind: verdict.match ? 'hit' : 'miss', reason: verdict.reason })
    if (verdict.match) hitIndex = i
  }

  // No hit falls through to the engine default, which lets the sign-in proceed
  // on the first factor alone. There is no 'allow' decision in the model.
  return {
    steps,
    hitIndex,
    decision: hitIndex === null ? fallbackOf(policy) : policy.rules[hitIndex].decision,
    outOfAudience: false,
  }
}

/** The decision only — used by the situation sweep, which runs thousands of
    walks and would otherwise allocate a trace array for every one of them. */
export function decide(
  policy: Policy,
  ctx: SimContext,
  env: SimEnv,
): { decision: AccessDecision; hitIndex: number | null; outOfAudience: boolean } {
  /* Same gate as `walk`, and it has to be here too. The sweep runs 1,440
     situations through this function; without the gate, every person outside
     the audience is counted as "the engine looked and let them through", which
     inflates the fell-through lane on every scoped policy and corrupts the
     blast-radius numbers the review stage is built on. */
  if (!inAudience(policy, ctx)) return { decision: fallbackOf(policy), hitIndex: null, outOfAudience: true }

  for (let i = 0; i < policy.rules.length; i++) {
    const rule = policy.rules[i]
    if (!rule.enabled) continue
    if (evalRule(rule, ctx, env).match) return { decision: rule.decision, hitIndex: i, outOfAudience: false }
  }
  return { decision: fallbackOf(policy), hitIndex: null, outOfAudience: false }
}

/** A stand-in environment for callers with no store — tests, mostly. */
export const rawEnv: SimEnv = {
  zoneName: (id) => id,
  fingerprintName: (id) => id,
  groupName: (id) => id,
}

/* =============================================================================
   The typed path.

   Everything above answers two-valued questions about chips: did this rule
   match, yes or no, with "cannot tell" folded into no. That is the reading the
   chip surfaces were built on and it stays, untouched, for them.

   Everything below answers from `SignInFacts` and keeps all three values all
   the way up. A condition is pass, fail or unknown; a rule matches, does not,
   or might; a policy has one decision when every reading agrees, and a short
   list of the decisions it could reach when it does not. Nothing here throws a
   condition's verdict away — every leaf of every rule is in the trace, with
   what the sign-in showed, what the condition asked for, and which facts would
   settle it if it could not be settled.

   Three decisions and no more: 1 factor, 2 factors, deny. `unknown` is a state
   a CONDITION can be in, never an outcome a policy can have, so "can't tell"
   surfaces as two or three possible outcomes, each saying which undecided rules
   it assumed matched and which it assumed did not.
   ========================================================================== */

export interface ConditionResult {
  conditionId: string
  typeId: string
  /** AFTER negation: 'not in zone' and 'does not match' are already applied. */
  status: CondState
  /** What the sign-in showed, in words. */
  actual: string
  /** What the condition asks for, in words. */
  required: string
  /** The trace sentence. */
  detail: string
  /** Zone conditions only, one per named zone, before negation. */
  zones?: ZonePart[]
  /** Device profile conditions only, one per profile check, in catalogue order. */
  checks?: ProfileCheck[]
  /* Device profile conditions only, one per named profile, with that profile's
     own verdict and checks — `checks` above is every profile's rows run
     together, which cannot say "Compliant devices · 3 of 4 checks pass" when
     the condition names two profiles. */
  profiles?: ProfileResult[]
  /** Facts that would settle an 'unknown'; [] when decided, or when no fact can. */
  missing: FactKey[]
  /** A true limit of the answer, e.g. a risk score stated for a platform that does not collect one. */
  caveat?: string
}

/** One device profile a condition named, graded against the sign-in's device. Before the condition's negation. */
export interface ProfileResult {
  profileId: string
  profileName: string
  status: CondState
  checks: ProfileCheck[]
}

export interface RuleTrace {
  /** Position in `policy.rules`; -1 for the last row ("Nothing else matched"). */
  index: number
  ruleId: string
  ruleName: string
  /** The legacy union, unchanged. An undecided rule reports 'miss' here; `match` says 'unknown'. */
  kind: StepKind
  /* 'unknown' when the rule names its people and no person was given — the
     one who that cannot be read, which is not the same as a who that missed. */
  who: 'none' | 'in' | 'out' | 'unknown'
  /** The `whoMissReason` sentence when who is 'out'. */
  whoReason: string | null
  match: 'yes' | 'no' | 'unknown'
  /** Every leaf in `leaves()` order, evaluated even when the who is 'out'. */
  conditions: ConditionResult[]
  /** The card that carried the match or came closest, as in `RuleVerdict`. */
  card: number | null
  /** The sentence `evalRule` would produce for these results. */
  reason: string
}

export interface PossibleOutcome {
  decision: AccessDecision
  /** Null when the last row decided. */
  ruleIndex: number | null
  ruleName: string
  /** The undecided rules this outcome assumes, and whether each matched. */
  assumes: { ruleIndex: number; matches: boolean }[]
}

export interface PolicyTrace {
  policyId: string
  outOfAudience: boolean
  /* False only when the policy names its audience and no person was given, so
     whether it governs this sign-in cannot be read. The rules are then traced
     as though it did — the resolver never asks that way, because it will not
     resolve a sign-in without a person. */
  audienceKnown: boolean
  /** The rules only; the last row is `lastRow`. */
  steps: RuleTrace[]
  /** The last row's trace, when it is reached under the definite reading. */
  lastRow: RuleTrace | null
  /** The DEFINITE reading: unknown counts as no match, which is what `decide` does. */
  hitIndex: number | null
  /** The definite reading's decision; null when the policy does not govern this person. */
  decision: AccessDecision | null
  /** Every possible outcome has the same decision (vacuously true out of the audience). */
  settled: boolean
  /** At least one unless out of the audience, in rule order, deduped by (decision, rule). */
  possible: PossibleOutcome[]
  /** The unknown conditions on undecided rules that were reached, deduped by condition. */
  unknowns: ConditionResult[]
}

// --- The clock ---------------------------------------------------------------

/* Wall-clock time in a named zone, from the platform's own time zone database.

   `Intl` rather than a table, because a table cannot know that Berlin is an
   hour further from Kolkata in January than in July. The formatter is made
   once per zone and kept: building one is the expensive part. A zone the
   platform does not know gives null, which every caller turns into `unknown`
   — never a throw, and never a guess at an offset. */
const FORMATS = new Map<string, Intl.DateTimeFormat | null>()

function formatIn(timeZone: string): Intl.DateTimeFormat | null {
  if (FORMATS.has(timeZone)) return FORMATS.get(timeZone) ?? null
  let f: Intl.DateTimeFormat | null
  try {
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      weekday: 'long',
    })
  } catch {
    f = null
  }
  FORMATS.set(timeZone, f)
  return f
}

function partsAt(instant: number, timeZone: string) {
  const f = formatIn(timeZone)
  if (!f) return null
  const parts = f.formatToParts(instant)
  const num = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value)
  return {
    year: num('year'),
    month: num('month'),
    day: num('day'),
    /* `% 24` because some engines still print midnight as 24 under h23. */
    hour: num('hour') % 24,
    minute: num('minute'),
    weekday: parts.find((p) => p.type === 'weekday')?.value ?? '',
  }
}

/** How many minutes ahead of UTC this zone's clock is at this instant. */
function offsetMin(timeZone: string, instant: number): number | null {
  const p = partsAt(instant, timeZone)
  if (!p) return null
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute)
  return Math.round((asUtc - (instant - (instant % 60_000))) / 60_000)
}

const DATE_TEXT = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME_TEXT = /^([01]?\d|2[0-3]):([0-5]\d)$/

/* The instant a wall-clock date and time in a zone names.

   Guess the instant as though the zone were UTC, correct by the zone's offset
   at the guess, and correct once more if that moved the instant across a
   daylight-saving change — the second offset is the one in force at the
   answer.

   Two edges, each settled on purpose:

     · A date the calendar does not have — 30 February, 31 April — is not a
       date. `Date.UTC` would roll it into the next month and the weekday
       would come back confident and wrong, so it is refused here, and the
       caller turns that into undecided.
     · A time in a spring-forward gap (02:30 on the night New York skips from
       02:00 to 03:00) names no instant. It is read an hour LATER, on the
       offset in force before the change — 03:30 — which is what a clock that
       skipped the hour shows, and what java.time and Temporal's default do.
       The second correction alone lands an hour earlier (01:30), so a gap is
       detected by reading the answer back, and the later of the two readings
       is kept. In an autumn overlap both readings are real; the first one,
       on the earlier offset, is kept. */
function instantOf(date: string, time: string, timeZone: string): number | null {
  const d = DATE_TEXT.exec(date)
  const t = TIME_TEXT.exec(time)
  if (!d || !t) return null
  const [y, mo, day] = [Number(d[1]), Number(d[2]), Number(d[3])]
  const [hh, mm] = [Number(t[1]), Number(t[2])]
  if (mo < 1 || mo > 12 || day < 1 || day > 31) return null
  const guess = Date.UTC(y, mo - 1, day, hh, mm)
  const rolled = new Date(guess)
  if (rolled.getUTCFullYear() !== y || rolled.getUTCMonth() !== mo - 1 || rolled.getUTCDate() !== day) return null
  const off1 = offsetMin(timeZone, guess)
  if (off1 === null) return null
  const first = guess - off1 * 60_000
  const off2 = offsetMin(timeZone, first)
  if (off2 === null) return null
  if (off2 === off1) return first
  const second = guess - off2 * 60_000
  const back = partsAt(second, timeZone)
  const reads = back !== null && back.year === y && back.month === mo && back.day === day && back.hour === hh && back.minute === mm
  return reads ? second : Math.max(first, second)
}

/** The time of day and the weekday an instant reads as in a zone. */
function wallClock(instant: number, timeZone: string): { minutes: number; weekday: string } | null {
  const p = partsAt(instant, timeZone)
  if (!p || !Number.isFinite(p.hour) || !Number.isFinite(p.minute)) return null
  return { minutes: p.hour * 60 + p.minute, weekday: p.weekday }
}

/* What a sign-in's clock reads in another zone, in minutes of the day — the
   reading the `time` condition makes of it: with a date, the real instant read
   again in `target`; without one, the standard-time table. Null where the
   condition would answer undecided (a time or zone it cannot read).

   For the testing surfaces' time ruler, which prints a window's edges on the
   sign-in's own clock and so has to shift them by the same amount this does. */
export function minutesIn(when: { date?: string; time: string; timeZone: string }, target: string): number | null {
  if (!TIME_TEXT.test(when.time)) return null
  if (when.date) {
    const at = instantOf(when.date, when.time, when.timeZone)
    return at === null ? null : (wallClock(at, target)?.minutes ?? null)
  }
  const a = TZ_OFFSET[target]
  const b = TZ_OFFSET[when.timeZone]
  if (a === undefined || b === undefined) return null
  return (((toMinutes(when.time) + a - b) % 1440) + 1440) % 1440
}

// --- People ------------------------------------------------------------------

/* A person, by id: from the tenant's directory when the env carries one, then
   from the chip people. The group's name comes from the tenant's groups, so a
   renamed group reads renamed. Null for an id nobody has. */
export function personOf(id: string | undefined, env: SimEnv): SimUser | null {
  if (!id) return null
  const u = env.library?.people.find((p) => p.id === id)
  if (u) {
    const groupName = env.library?.groups.find((g) => g.id === u.groupId)?.name ?? env.groupName(u.groupId)
    return { id: u.id, name: u.name, email: u.email, groupId: u.groupId, groupName, userType: u.userType, role: u.role }
  }
  return SIM_USERS.find((s) => s.id === id) ?? null
}

/* A chip context carrying nothing but a person, so the person-shaped cases of
   the legacy reading can be asked from the typed path without a second copy of
   their sentences. The origin is "Any location" so no zone is ever read from it. */
const personContext = (user: SimUser): SimContext => ({ user, place: 'Any location', device: 'New / unknown', authState: '', risk: '', nowMinutes: 0 })
const NOBODY: SimUser = { id: '', name: 'Nobody', email: '', groupId: '', groupName: '', userType: '', role: '' }

// --- Words -------------------------------------------------------------------

const SOURCE_WORD: Record<FactSource, string> = { typed: 'typed', 'looked-up': 'looked up', stated: 'stated', assumed: 'assumed' }

/** A place in words, saying when it was looked up from an address rather than stated. */
function placeWords(p: SignInPlace): string {
  const name = p.city ?? p.state ?? p.country ?? 'a place with no name'
  return p.source === 'looked-up' ? `${name} (looked up)` : name
}

function originWords(facts: SignInFacts): string {
  const place = placeOfSignIn(facts)
  const where = place ? placeWords(place) : place === null ? 'no place' : 'no place stated'
  return `${facts.network?.address ?? 'no address'}, ${where}`
}

const dedupeKeys = (keys: readonly FactKey[]): FactKey[] => [...new Set(keys)]

type ZoneMatch = ReturnType<typeof zoneMember>

/* One zone's verdict in a sentence: each half it asked, what decided it. */
function zoneWords(m: ZoneMatch, facts: SignInFacts): string {
  const h = m.halves
  const address = facts.network?.address
  const bits: string[] = []
  if (m.network === 'any' && m.location === 'not asked') bits.push('it lists no networks')
  else if (m.network === 'pass') bits.push(`${address} is in ${h.networkEntry}`)
  else if (m.network === 'fail') bits.push(`${address} is not on any of its networks`)
  else if (m.network === 'unknown')
    bits.push(
      address === undefined
        ? 'no address was given'
        : !isAddress(address)
          ? `${address} is not an address`
          : `the network operator for ${address} is not known`,
    )

  if (m.location === 'any' && m.network === 'not asked') bits.push('it lists no places')
  else if (m.location === 'pass')
    bits.push(
      h.locationRange
        ? `${placeWords(h.place!)} is ${rangeText(h.locationRange).replace(/^Within/, 'within')}`
        : `${placeWords(h.place!)} matches ${h.locationEntry}`,
    )
  else if (m.location === 'fail') bits.push(`${placeWords(h.place!)} is outside its places`)
  else if (m.location === 'unknown')
    bits.push(
      h.place === null
        ? `the lookup names no place for ${address}`
        : h.place === undefined
          ? address === undefined
            ? 'no place was given'
            : `${address} is not in the address fixture, so its place is not known`
          : 'the place given is not precise enough to say',
    )

  return bits.length === 0 ? `${m.zoneName} lists no networks and no places` : `${m.zoneName}: ${bits.join(', and ')}`
}

// --- Device profiles ---------------------------------------------------------

/* The device a sign-in stated, in the words a trace prints beside a verdict:
   "Android 12 mobile (stated)", "Windows 10.0.22631 laptop (assumed)". */
const PLATFORM_NAME: Record<NonNullable<SignInDevice['platform']>, string> = {
  windows: 'Windows',
  macos: 'macOS',
  ios: 'iOS',
  android: 'Android',
  linux: 'Linux',
  other: 'A device',
}

const deviceWhat = (d: SignInDevice): string =>
  [d.platform ? PLATFORM_NAME[d.platform] : 'A device', d.osVersion, d.formFactor?.toLowerCase()].filter(Boolean).join(' ')

function deviceWords(d: SignInDevice | undefined): string {
  if (!d) return 'no device stated'
  return `${deviceWhat(d)} (${SOURCE_WORD[d.source]})`
}

/* What would settle an undecided row, as the trace names it. */
const FACT_WORD: Partial<Record<FactKey, string>> = {
  person: 'who is signing in',
  'device.platform': 'the platform',
  'device.osVersion': 'the OS version',
  'device.formFactor': 'the device type',
  'device.browser': 'the browser',
  'device.integrity': 'device integrity',
  'device.screenLock': 'the screen lock',
  'device.authenticatorVersion': 'the Authenticator version',
  'device.agent': 'the Device Agent',
  'device.registration': 'whether the device is registered',
  'device.registeredCount': 'how many devices are registered',
}

/* One profile's verdict in a sentence, naming the row that decided it — the
   row `decidingCheck` picks, so the limit is named before "not registered".

   A device nobody stated is said to be one. The chip surfaces hand the
   evaluator a device the chip adapter filled in (`CHIP_DEVICES`, source
   `assumed`): "Known > 90 days" names no platform and no version, and the
   adapter chose Windows 10.0.19045 so the chip means something a profile can
   grade. A verdict resting on that choice has to say so where it states the
   fact — "Windows OS version is 10.0.19045 (assumed)" — or the trace would be
   presenting the adapter's guess as the sign-in's. A device the tester typed
   or picked carries no mark, as a place they stated carries none; `actual`
   names the source either way. */
function profileWords(p: FingerprintProfile, m: ProfileMatch, device: SignInDevice | undefined): string {
  const assumed = device !== undefined && (device.source === 'assumed' || device.source === 'looked-up')
  const tag = assumed ? ` (${SOURCE_WORD[device.source]})` : ''
  if (m.status === 'pass') {
    const skipped = m.checks.some((c) => c.status === 'not applicable')
    const the = assumed ? `the device (${deviceWhat(device)}, ${SOURCE_WORD[device.source]})` : 'the device'
    return p.mode === 'device'
      ? `${the} meets ${p.name}`
      : `${the} passes every check in ${p.name}${skipped ? ' that applies to it' : ''}`
  }
  const c = decidingCheck(p, m)
  if (m.status === 'unknown') {
    if (!device) return `${p.name}: no device was stated, so this is undecided`
    const need = m.missing.map((k) => FACT_WORD[k]).filter(Boolean)
    const list = need.length <= 1 ? (need[0] ?? '') : `${need.slice(0, -1).join(', ')} and ${need[need.length - 1]}`
    return need.length > 0
      ? `${p.name}: ${list} ${need.length === 1 ? 'was' : 'were'} not stated, so this is undecided`
      : `${p.name}: ${c ? c.label : 'a check'} could not be compared, so this is undecided`
  }
  if (!c) return `${p.name}: the device does not meet it`
  switch (c.id) {
    case 'limit':
      return `${p.name}: ${c.actual}${tag}, and the device limit is ${p.maxDevices}`
    case 'agent':
      return c.actual === 'not installed'
        ? `${p.name}: the Device Agent is not installed${tag}`
        : `${p.name}: the Device Agent runs on Windows only, and this is ${c.actual}${tag}`
    case 'registration':
      return p.registration === 'pre-approved'
        ? `${p.name}: this device is not on the pre-approved list${tag}`
        : `${p.name}: this device is not registered to this person${tag}`
    case 'mobile':
      return `${p.name}: sign-in from a phone or tablet is not allowed${assumed ? `, and the device is ${deviceWords(device)}` : ''}`
  }
  if (c.actual === 'not installed') return `${p.name}: ${c.label.replace(/ version$/, '')} is not installed${tag}`
  const need = /^[A-Z][a-z]/.test(c.required) ? c.required.charAt(0).toLowerCase() + c.required.slice(1) : c.required
  return `${p.name}: ${c.label} is ${c.actual}${tag}, and it needs ${need}`
}

// --- One condition -----------------------------------------------------------

/* One condition against typed sign-in facts, three-valued, with its evidence.

   `card` is the card the condition sits in, and only `day` reads it: a weekday
   with no zone of its own is read in the zone of a time window beside it, so
   "Monday, 09:00–17:00 in New York" means Monday in New York. */
export function evalCondition(c: Condition, facts: SignInFacts, env: SimEnv, card?: ConditionCard): ConditionResult {
  const vals = c.values.filter((v) => v.trim() !== '')
  const negated = c.operator.includes('not')
  const flip = (s: CondState): CondState => (negated ? notState(s) : s)
  const required = `${c.operator} ${shownValues(c, env) || '…'}`
  const result = (status: CondState, actual: string, detail: string, extra: Partial<ConditionResult> = {}): ConditionResult => ({
    conditionId: c.id,
    typeId: c.typeId,
    status,
    actual,
    required,
    detail,
    missing: [],
    ...extra,
  })
  const unknown = (detail: string, missing: FactKey[] = [], extra: Partial<ConditionResult> = {}): ConditionResult =>
    result('unknown', 'not stated', detail, { missing, ...extra })

  if (vals.length === 0) return unknown('the condition has no value set')

  switch (c.typeId) {
    /* Membership read from each zone's own entries (`zone-match.ts`). A zone
       the tenant no longer has is undecided with the legacy sentence, under
       `in` and `not in` alike; so is a tenant whose zones were never handed
       over, because a zone nobody can read cannot be passed or failed. */
    case 'zone': {
      const zones = env.library?.zones
      if (vals.some((v) => (env.hasZone && !env.hasZone(v)) || (zones && !zones.some((z) => z.id === v))))
        return unknown('this rule names a zone that no longer exists')
      if (!zones) return unknown('the tenant’s zones were not given, so membership cannot be read')
      const parts = vals.map((v) => zoneMember(zones.find((z) => z.id === v)!, facts, zoneScopeOf(c, v)))
      const status = flip(anyOf(parts.map((m) => m.status)))
      const missing = status === 'unknown' ? dedupeKeys(parts.filter((m) => m.status === 'unknown').flatMap((m) => m.missing)) : []
      return result(status, originWords(facts), parts.map((m) => zoneWords(m, facts)).join('; '), {
        zones: parts.map(({ zoneId, zoneName, status: s, network, location }) => ({ zoneId, zoneName, status: s, network, location })),
        missing,
      })
    }

    case 'fingerprint': {
      const profiles = env.library?.fingerprints
      if (vals.some((v) => (env.hasFingerprint && !env.hasFingerprint(v)) || (profiles && !profiles.some((p) => p.id === v))))
        return unknown('this rule names a device profile that no longer exists')
      if (!profiles) return unknown('the tenant’s device profiles were not given, so the device cannot be checked')
      /* Row by row (`fingerprint.ts`): a health profile's checks, or a trusted
         device's agent, registration and limit. A trusted device is registered
         to a PERSON, so whether one was given is part of the reading. Several
         profiles in one condition are alternatives, as zones are. */
      const personKnown = personOf(facts.personId, env) !== null
      const graded = vals.map((v) => {
        const p = profiles.find((x) => x.id === v)!
        return { p, m: profileMatches(p, facts.device, { ...env.deviceMatch, personKnown }) }
      })
      const status = flip(anyOf(graded.map((g) => g.m.status)))
      return result(status, deviceWords(facts.device), graded.map((g) => profileWords(g.p, g.m, facts.device)).join('; '), {
        checks: graded.flatMap((g) => g.m.checks),
        profiles: graded.map((g) => ({ profileId: g.p.id, profileName: g.p.name, status: g.m.status, checks: g.m.checks })),
        missing: status === 'unknown' ? dedupeKeys(graded.filter((g) => g.m.status === 'unknown').flatMap((g) => g.m.missing)) : [],
      })
    }

    /* A number against a threshold, strictly: above is `>`, anything else is
       `<`, which is what the showcase's bands 0–39, 40–70 and 71 up rely on.
       The score is stated, never derived here; on a platform that collects no
       risk signals the trace says so beside the verdict. */
    case 'device-risk': {
      const limit = Number(vals[0])
      if (!Number.isFinite(limit)) return unknown('the risk threshold is not a number')
      const risk = facts.risk
      if (!risk) return unknown('no device risk score was given', ['risk'])
      const hit = c.operator === 'above' ? risk.score > limit : risk.score < limit
      const platform = facts.device?.platform
      return result(hit ? 'pass' : 'fail', String(risk.score), `the device risk score is ${risk.score} (${SOURCE_WORD[risk.source]})`, {
        ...(platform === 'windows' || platform === 'macos'
          ? { caveat: 'Risk signals are collected on Android and iOS only, so this score was stated, not measured.' }
          : null),
      })
    }

    /* The window is read on the clock of the zone it names (`c.tz`, else the
       tenant's). With a date, the sign-in's own wall clock becomes an instant
       and is read again in that zone, so daylight saving on either side is
       real. With no date there is nothing to decide daylight saving against,
       and the standard-time table stands in — said in a caveat whenever the
       two clocks differ, because that is exactly when it can be an hour out. */
    case 'time': {
      const target = c.tz ?? TENANT_TZ
      const from = toMinutes(vals[0] ?? '00:00')
      const to = toMinutes(vals[1] ?? '23:59')
      const asked = `${c.operator} ${vals[0] ?? '—'} and ${vals[1] ?? '—'}${c.tz ? ` in ${c.tz}` : ''}`
      const when = facts.when
      if (!when) return unknown('no time was given', ['time'], { required: asked })
      let local: number
      let caveat: string | undefined
      if (when.date) {
        const at = instantOf(when.date, when.time, when.timeZone)
        const wall = at === null ? null : wallClock(at, target)
        if (!wall) return unknown(`${when.date} ${when.time} in ${when.timeZone} is not a time this model can read`, [], { required: asked })
        local = wall.minutes
      } else {
        const a = TZ_OFFSET[target]
        const b = TZ_OFFSET[when.timeZone]
        if (!TIME_TEXT.test(when.time)) return unknown(`${when.time} is not a time of day`, [], { required: asked })
        if (a === undefined || b === undefined)
          return unknown('no date was given, and the standard-time table does not hold this time zone', ['date'], { required: asked })
        local = (((toMinutes(when.time) + a - b) % 1440) + 1440) % 1440
        if (target !== when.timeZone) caveat = 'No date was given, so standard time is used.'
      }
      // A window that wraps midnight is an OR, not an AND.
      const inside = from <= to ? local >= from && local <= to : local >= from || local <= to
      return result(flip(inside ? 'pass' : 'fail'), `${clock(local)} in ${target}`, `it is ${clock(local)} in ${target}`, {
        required: asked,
        ...(caveat ? { caveat } : null),
      })
    }

    /* A weekday needs a date — the one thing a chip rehearsal never had, which
       is why this was always undecided there. Read in the condition's zone,
       else a time window's zone in the same card, else the tenant's. */
    case 'day': {
      const target = c.tz ?? card?.conditions.find((x) => x.typeId === 'time' && x.tz)?.tz ?? TENANT_TZ
      const when = facts.when
      if (!when?.date) return unknown('no date was given, so the weekday is not known', when ? ['date'] : ['date', 'time'])
      const at = instantOf(when.date, when.time, when.timeZone)
      const wall = at === null ? null : wallClock(at, target)
      if (!wall) return unknown(`${when.date} ${when.time} in ${when.timeZone} is not a time this model can read`)
      return result(flip(vals.includes(wall.weekday) ? 'pass' : 'fail'), `${wall.weekday} in ${target}`, `it is ${wall.weekday} in ${target}`)
    }

    /* The legacy place conditions, by name, aliases included — the same
       comparison a zone's location half makes, so the two cannot disagree. */
    case 'country':
    case 'state':
    case 'city': {
      const kind = c.typeId as PlaceKind
      const place = placeOfSignIn(facts)
      if (place === undefined) return unknown('no place was given', ['location'])
      if (place === null) return unknown(`the lookup names no place for ${facts.network?.address}`, ['location'])
      const have = kind === 'country' ? place.country : kind === 'state' ? place.state : place.city
      if (have === null || have === undefined)
        return unknown(`the sign-in’s place does not name a ${kind}`, [kind === 'city' ? 'location.city' : 'location'])
      const hit = vals.some((v) => sameName(kind, v, have))
      const said = place.source === 'looked-up' ? `${have} (looked up)` : have
      return result(flip(hit ? 'pass' : 'fail'), said, `the sign-in is in ${said}`)
    }

    /* Who the person is: the legacy sentences, asked of the person the facts
       name. Without one, the condition waits on the person. */
    case 'user-attr':
    case 'group':
    case 'user':
    case 'user-type':
    case 'user-role': {
      const person = personOf(facts.personId, env)
      if (!person) return unknown('no person was given', ['person'])
      const r = legacyCond(c, personContext(person), env)
      return result(r.state, `${person.name}, ${person.groupName}`, r.detail)
    }
    case 'custom-attr':
    case 'webhook': {
      const r = legacyCond(c, personContext(NOBODY), env)
      return unknown(r.detail)
    }

    case 'ml-risk':
      return unknown('a band name is not a sign-in fact')

    case 'mdm':
      return unknown('sign-in facts do not carry MDM enrolment')
    case 'device-reg':
      return unknown('sign-in facts do not carry device registration')
    case 'trust-age':
      return unknown('sign-in facts do not carry how long a device has been trusted')
    case 'auth-state':
      return unknown('sign-in facts do not carry an auth state')
    default:
      return unknown(`sign-in facts do not carry ${conditionType(c.typeId).label.toLowerCase()}`)
  }
}

// --- One rule ----------------------------------------------------------------

/* One rule against typed facts: every condition kept, three-valued.

   The who comes first, as in `evalRule`, and the sentence is `evalRule`'s for
   the same states — `predicateVerdict` writes both. The conditions are still
   evaluated when the who misses, so a trace can show what the rule WOULD have
   made of this sign-in for somebody it covers. */
export function traceRule(rule: Rule, index: number, facts: SignInFacts, person: SimUser | null, env: SimEnv): RuleTrace {
  const p = rule.when
  const cardOf = cardsByCondition(p)
  const conditions = leaves(p).map((c) => evalCondition(c, facts, env, cardOf.get(c.id)))
  const byId = new Map(conditions.map((r) => [r.conditionId, r]))
  const state = (c: Condition): CondState => byId.get(c.id)?.status ?? 'unknown'

  const who: RuleTrace['who'] = !hasWho(rule.who) ? 'none' : !person ? 'unknown' : whoPasses(rule.who, person) ? 'in' : 'out'
  const base = { index, ruleId: rule.id, ruleName: rule.name, who, conditions }
  const noPerson = 'No person was given, so who this rule is for cannot be checked'

  if (who === 'out') {
    const whoReason = whoMissFor(rule, person!, env)
    return { ...base, kind: 'miss', whoReason, match: 'no', card: null, reason: whoReason }
  }
  if (p.cards.length === 0) {
    return who === 'unknown'
      ? { ...base, kind: 'miss', whoReason: null, match: 'unknown', card: null, reason: noPerson }
      : { ...base, kind: 'hit', whoReason: null, match: 'yes', card: null, reason: catchAllReason(rule) }
  }

  const predicate = predicateState(p, state)
  const match = who === 'unknown' ? allOf(['unknown', predicate]) : predicate
  const verdict = predicateVerdict(p, (c) => state(c) === 'pass', (c) => byId.get(c.id)?.detail ?? '', env)
  return {
    ...base,
    kind: match === 'pass' ? 'hit' : 'miss',
    whoReason: null,
    match: match === 'pass' ? 'yes' : match === 'fail' ? 'no' : 'unknown',
    card: verdict.card,
    reason: who === 'unknown' && predicate === 'pass' ? noPerson : verdict.reason,
  }
}

/* The last row as a rule, for a policy that has not set one: the 1 factor it
   has always meant. Built here rather than with `fallbackRule()`, which draws
   an id from the seed counter and would renumber every rule a test makes next. */
const lastRowOf = (policy: Policy): Rule =>
  policy.fallback ?? {
    id: `${policy.id}-last-row`,
    name: FALLBACK_NAME,
    enabled: true,
    when: { cards: [] },
    decision: fallbackOf(policy),
    firstFactor: 'Password',
    secondFactor: 'any',
    rememberMfa: false,
    allowDisable2fa: false,
    matchEstimate: 0,
  }

// --- One policy --------------------------------------------------------------

/* One policy against typed facts.

   The audience first: a person the policy does not govern gets nothing from it
   — no decision, no possible outcomes — because a policy's own Deny never
   applies to somebody it was not written for. Who DOES decide for them is the
   resolver's question (`tenant-resolver.ts`), not this function's.

   Then two readings of the same rules.

   The DEFINITE reading is `decide`'s: undecided counts as no match, top to
   bottom, first match wins, else the last row. It is what the chip surfaces
   have always shown, and it is kept so the two paths can be compared.

   The POSSIBLE reading keeps the third value. Walking down, a rule that
   matches ends the walk; a rule that does not is passed; a rule that MIGHT
   forks it — one outcome where it matched and decided, and the walk carries
   on assuming it did not. Each outcome lists the forks it took. The policy is
   settled when every outcome lands on the same decision, which is often true
   even with undecided rules: two rules that both deny cannot disagree. */
export function tracePolicy(policy: Policy, facts: SignInFacts, env: SimEnv): PolicyTrace {
  const person = personOf(facts.personId, env)
  const a = policy.audience
  const audience: 'in' | 'out' | 'unknown' = a.everyone
    ? 'in'
    : !person
      ? 'unknown'
      : a.groupIds.includes(person.groupId) || a.userIds.includes(person.id)
        ? 'in'
        : 'out'

  if (audience === 'out') {
    return {
      policyId: policy.id,
      outOfAudience: true,
      audienceKnown: true,
      steps: [],
      lastRow: null,
      hitIndex: null,
      decision: null,
      settled: true,
      possible: [],
      unknowns: [],
    }
  }

  const traced = policy.rules.map((r, i) => traceRule(r, i, facts, person, env))

  let hitIndex: number | null = null
  const steps: RuleTrace[] = []
  for (let i = 0; i < traced.length; i++) {
    const t = traced[i]
    if (hitIndex !== null) steps.push({ ...t, kind: 'unreached' })
    else if (!policy.rules[i].enabled) steps.push({ ...t, kind: 'off' })
    else if (t.match === 'yes') {
      hitIndex = i
      steps.push({ ...t, kind: 'hit' })
    } else steps.push({ ...t, kind: 'miss' })
  }

  const lastRow =
    hitIndex === null
      ? { ...traceRule(lastRowOf(policy), -1, facts, person, env), ruleName: FALLBACK_NAME, kind: 'hit' as const, reason: 'No rule above matched' }
      : null

  const possible: PossibleOutcome[] = []
  const unknowns: ConditionResult[] = []
  let assumes: PossibleOutcome['assumes'] = []
  let stopped = false
  for (let i = 0; i < policy.rules.length && !stopped; i++) {
    const rule = policy.rules[i]
    if (!rule.enabled) continue
    const m = traced[i].match
    if (m === 'yes') {
      possible.push({ decision: rule.decision, ruleIndex: i, ruleName: rule.name, assumes })
      stopped = true
    } else if (m === 'unknown') {
      possible.push({ decision: rule.decision, ruleIndex: i, ruleName: rule.name, assumes: [...assumes, { ruleIndex: i, matches: true }] })
      assumes = [...assumes, { ruleIndex: i, matches: false }]
      for (const r of traced[i].conditions) if (r.status === 'unknown' && !unknowns.some((u) => u.conditionId === r.conditionId)) unknowns.push(r)
    }
  }
  if (!stopped) possible.push({ decision: fallbackOf(policy), ruleIndex: null, ruleName: FALLBACK_NAME, assumes })

  const seen = new Set<string>()
  const distinct = possible.filter((o) => {
    const k = `${o.decision}|${o.ruleIndex}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })

  return {
    policyId: policy.id,
    outOfAudience: false,
    audienceKnown: audience === 'in',
    steps,
    lastRow,
    hitIndex,
    decision: hitIndex === null ? fallbackOf(policy) : policy.rules[hitIndex].decision,
    settled: new Set(distinct.map((o) => o.decision)).size === 1,
    possible: distinct,
    unknowns,
  }
}
