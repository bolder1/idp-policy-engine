import { appsOf, type App, type Policy, type User, type Zone } from '../../data'
import { FACT_WORDS } from '../../decision-words'
import { EARTH_RADIUS_KM, PLACES, sameName } from '../../places'
import { placeOf } from '../geo-fixture'
import { TENANT_TZ, type SignInFacts, type SignInPlace, type SignInDevice } from '../sign-in-facts'
import { placeOfSignIn } from '../zone-match'
import { isAddress } from '../zone-validation'
import { devicePreset, presetOf, type DevicePresetId } from './device-presets'

/* -----------------------------------------------------------------------------
   One sign-in, as a tester states it.

   The form is not the facts. The facts are what the evaluator reads — an
   address, a place, a device — each stated or not; the form is what the
   controls hold, which is more: which origin chip is on, that the address was
   typed rather than picked, that the place is "wherever the address says" or
   30 km north of the Pune range. `factsOf` is the one crossing from the form to
   the facts, and every testing surface uses it: the board's Try a sign-in, the
   Policy testing views and the saved sign-ins they save.

   Text is kept as typed. An address that is not one yet ("203.0.113") still
   reaches the evaluator, which answers it Can't tell, and the form says why
   beside the field; a form that dropped it would answer as though no address
   had been given, which is a different answer.
   -------------------------------------------------------------------------- */

export type OriginPresetId = 'office' | 'branch' | 'home' | 'tor'

/* Where a sign-in comes from, as one click. Every address is a documentation
   block the geo fixture knows (RFC 5737), so each one looks up to a place. */
export const ORIGIN_PRESETS = [
  { id: 'office', label: 'Office network', address: '203.0.113.24' }, // Pune office, AS64500
  { id: 'branch', label: 'Branch office', address: '198.51.100.20' }, // Bengaluru office, AS64501
  { id: 'home', label: 'Home broadband', address: '192.0.2.10' }, // Pune home, AS64502
  { id: 'tor', label: 'Tor exit', address: '192.0.2.66' }, // an anonymiser: no place
] as const satisfies readonly { id: OriginPresetId; label: string; address: string }[]

export type FormPlace =
  /** Looked up from the address, as the product would. */
  | { kind: 'from-address' }
  /** A catalogue place, stated. */
  | { kind: 'stated'; placeId: string }
  /** A point `km` due north of a zone's range centre: the distance ruler. */
  | { kind: 'distance'; zoneId: string; rangeIndex: number; km: number }
  /* A stated place neither of those describes, carried as it was stated. Only
     `formOf` makes one: a saved ruler point whose range has since moved or
     gone. Said by its name, like the custom device. */
  | { kind: 'custom'; facts: SignInPlace }

export type FormDevice = { kind: 'none' } | { kind: 'preset'; id: DevicePresetId } | { kind: 'custom'; facts: SignInDevice }

export interface SignInForm {
  personId: string | null
  appId: string | null
  /** The origin chip that is on, or null once an address is typed. */
  origin: OriginPresetId | null
  /** '' = not stated. */
  address: string
  addressSource: 'typed' | 'stated'
  place: FormPlace
  /** YYYY-MM-DD, HH:MM and an IANA zone. '' = not stated. */
  date: string
  time: string
  timeZone: string
  device: FormDevice
  /** As typed: '' = not stated. */
  risk: string
  /** A policy evaluated as though it were on, or null. */
  assumeOn: string | null
}

/** The controls a change can come from, in form order. */
export type FormField = 'person' | 'app' | 'address' | 'place' | 'when' | 'device' | 'risk' | 'assume-on'

/* "Changed by {word}": the row that changed, said mid-sentence — the fact
   word of the row it states ("Needs: IP address" and "Changed by IP address"
   name the same row), in sentence case where it sits. The chip read "Changed
   by Device" and "Changed by When" while it borrowed the rows' labels as they
   are (owner-eye review, 29 Sep 2026); a time is a time, and the risk row's
   "Device risk score" is the risk score of the device already on the line. A
   change to the policy itself is "your edits". */
export const CHANGED_BY_WORDS: Record<FormField | 'edits', string> = {
  person: 'person',
  app: 'application',
  address: FACT_WORDS.address,
  place: 'place',
  when: 'time',
  device: 'device',
  risk: 'risk score',
  'assume-on': 'turning it on',
  edits: 'your edits',
}

/** What is wrong with a field, said beside it. */
export interface FormIssue {
  field: FormField
  message: string
}

export const ADDRESS_ERROR = 'Enter an IPv4 or IPv6 address'
export const RISK_ERROR = 'Enter 0 to 100'

/* One degree of latitude, in km: the ruler puts a stated place due north of
   the range centre, where distance is latitude alone. From the same radius the
   evaluator measures with (places.ts): at 111.195, a rounded one, "25 km" came
   back from `haversineKm` as 25.000018 and fell outside a 25 km range. */
export const KM_PER_DEGREE = (EARTH_RADIUS_KM * Math.PI) / 180

// --- The form, as facts ---------------------------------------------------------

export function factsOf(form: SignInForm, zones: readonly Zone[]): { facts: SignInFacts; issues: FormIssue[] } {
  const facts: SignInFacts = {}
  const issues: FormIssue[] = []
  if (form.personId) facts.personId = form.personId
  if (form.appId) facts.appId = form.appId

  const address = form.address.trim()
  if (address) {
    facts.network = { address, source: form.addressSource }
    if (!isAddress(address)) issues.push({ field: 'address', message: ADDRESS_ERROR })
  }

  /* From the address: nothing stated, and the evaluator looks it up. */
  const location = placeFacts(form.place, zones)
  if (location) facts.location = location

  if (form.time) {
    facts.when = { ...(form.date ? { date: form.date } : null), time: form.time, timeZone: form.timeZone || TENANT_TZ, source: 'stated' }
  }

  const device = deviceFacts(form.device)
  if (device) facts.device = device

  const risk = form.risk.trim()
  if (risk) {
    const score = /^\d{1,3}$/.test(risk) ? Number(risk) : NaN
    if (score >= 0 && score <= 100) facts.risk = { score, source: 'stated' }
    else issues.push({ field: 'risk', message: RISK_ERROR })
  }

  return { facts, issues }
}

function placeFacts(place: FormPlace, zones: readonly Zone[]): SignInPlace | undefined {
  if (place.kind === 'stated') return placeOf(place.placeId, 'stated')
  if (place.kind === 'distance') return distancePlace(zones, place.zoneId, place.rangeIndex, place.km)
  if (place.kind === 'custom') return { ...place.facts, source: 'stated' }
  return undefined
}

/* A point on the distance ruler, as a stated place.

   Named "30 km from Pune" rather than left without a city. The zone's own city
   list is read by name, and a point with no name is Can't tell against it — so
   the ruler past 25 km would say "Can't tell" where the answer is plainly
   "outside the office", which is the one thing the ruler exists to show. The
   country and state are the centre's, which a few km never changes. */
export function distancePlace(zones: readonly Zone[], zoneId: string, rangeIndex: number, km: number): SignInPlace | undefined {
  const range = zones.find((z) => z.id === zoneId)?.location.ranges[rangeIndex]
  if (!range) return undefined
  const centre = range.placeId ? placeOf(range.placeId, 'stated') : undefined
  return {
    country: centre?.country ?? null,
    state: centre?.state ?? null,
    city: `${km} km from ${range.label}`,
    lat: range.lat + km / KM_PER_DEGREE,
    lon: range.lon,
    source: 'stated',
  }
}

function deviceFacts(device: FormDevice): SignInDevice | undefined {
  if (device.kind === 'preset') return devicePreset(device.id).facts
  if (device.kind === 'custom') return { ...device.facts, source: 'stated' }
  return undefined
}

// --- Facts, as a form --------------------------------------------------------------

/* The way back, for a saved or sample sign-in loaded into Try. It must give
   the decision the facts get: a saved row reads Deny, and Try on it has to read
   Deny too. So nothing stated is dropped. A device no preset describes is a
   custom one; a stated place is the ruler point it came from when a range in
   `zones` still puts one exactly there, else the catalogue place, else a
   custom place carried as stated. Looking a ruler point up from the address
   again was the old way back, and it turned "30 km out: Deny" into 2FA. */
export function formOf(facts: SignInFacts, zones: readonly Zone[]): SignInForm {
  const address = facts.network?.address ?? ''
  const origin = ORIGIN_PRESETS.find((o) => o.address === address)?.id ?? null
  const device = facts.device
  const preset = device ? presetOf(device) : null
  return {
    personId: facts.personId ?? null,
    appId: facts.appId ?? null,
    origin: facts.network?.source === 'typed' ? null : origin,
    address,
    addressSource: facts.network?.source === 'typed' ? 'typed' : 'stated',
    place: formPlaceOf(facts.location, zones),
    date: facts.when?.date ?? '',
    time: facts.when?.time ?? '',
    timeZone: facts.when?.timeZone ?? TENANT_TZ,
    device: !device ? { kind: 'none' } : preset ? { kind: 'preset', id: preset } : { kind: 'custom', facts: { ...device, source: 'stated' } },
    risk: facts.risk ? String(facts.risk.score) : '',
    assumeOn: null,
  }
}

function formPlaceOf(location: SignInPlace | null | undefined, zones: readonly Zone[]): FormPlace {
  if (!location || location.source !== 'stated') return { kind: 'from-address' }
  const ruler = rulerPointOf(location, zones)
  if (ruler) return ruler
  const hit = PLACES.find((p) => {
    const name = location.city ?? location.state ?? location.country
    if (!name) return false
    const kind = location.city ? 'city' : location.state ? 'state' : 'country'
    return p.kind === kind && sameName(kind, p.name, name) && sameName('country', p.country, location.country ?? '')
  })
  /* The name alone is not enough: the catalogue place has to be the point
     that was stated, or the way back would move it. */
  const catalogue = hit ? placeOf(hit.id, 'stated') : undefined
  if (hit && catalogue && samePoint(catalogue, location)) return { kind: 'stated', placeId: hit.id }
  return { kind: 'custom', facts: location }
}

/* "30 km from Pune", read back to the range it was measured from: a range
   with that label where the ruler at that distance states exactly this point.
   Two zones holding the same range state the same point, so the first is as
   good as the other. */
const RULER_CITY = /^(\d+(?:\.\d+)?) km from (.+)$/

function rulerPointOf(location: SignInPlace, zones: readonly Zone[]): FormPlace | undefined {
  const m = location.city ? RULER_CITY.exec(location.city) : null
  if (!m) return undefined
  const km = Number(m[1])
  for (const z of zones) {
    for (const [rangeIndex, r] of z.location.ranges.entries()) {
      if (r.label !== m[2]) continue
      const at = distancePlace(zones, z.id, rangeIndex, km)
      if (at && samePoint(at, location)) return { kind: 'distance', zoneId: z.id, rangeIndex, km }
    }
  }
  return undefined
}

const samePoint = (a: SignInPlace, b: SignInPlace): boolean =>
  a.country === b.country && (a.state ?? null) === (b.state ?? null) && a.city === b.city && a.lat === b.lat && a.lon === b.lon

// --- The form, in one line -------------------------------------------------------

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/* "203.0.113.24 · Pune (looked up) · 28 Sep 2026 09:30 Asia/Kolkata · Device
   not stated · Risk not stated": Check a person's scenario line, and a saved
   sign-in's tip. Said from the facts, so the line names the place the
   evaluator will read rather than the control that chose it. Person and
   application are left out; both surfaces name them beside it. */
export function formSummary(form: SignInForm, zones: readonly Zone[]): string {
  const { facts } = factsOf(form, zones)
  const preset = facts.device ? presetOf(facts.device) : null
  return [
    facts.network?.address ?? 'IP address not stated',
    placeSaid(facts),
    facts.when ? [facts.when.date && dateSaid(facts.when.date), facts.when.time, facts.when.timeZone].filter(Boolean).join(' ') : 'When not stated',
    !facts.device ? 'Device not stated' : preset ? devicePreset(preset).label : 'Custom device',
    facts.risk ? `Risk ${facts.risk.score}` : 'Risk not stated',
  ].join(' · ')
}

/* The Place control's own words: a looked-up place says so, an anonymiser has
   no place, and an address outside the fixture has none to look up. */
function placeSaid(facts: SignInFacts): string {
  const place = placeOfSignIn(facts)
  if (place === null) return 'No place'
  if (!place) return facts.network ? 'Not in the sample table' : 'Place not stated'
  const name = place.city ?? place.state ?? place.country ?? 'Place not named'
  return place.source === 'looked-up' ? `${name} (looked up)` : name
}

/** "2026-09-28" as "28 Sep 2026". By table, not Intl: en-GB now says "Sept". */
function dateSaid(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  const month = m ? MONTHS[Number(m[2]) - 1] : undefined
  return m && month ? `${Number(m[3])} ${month} ${m[1]}` : iso
}

// --- What changed ---------------------------------------------------------------

const SAME: Record<FormField, (a: SignInForm, b: SignInForm) => boolean> = {
  person: (a, b) => a.personId === b.personId,
  app: (a, b) => a.appId === b.appId,
  address: (a, b) => a.origin === b.origin && a.address === b.address && a.addressSource === b.addressSource,
  place: (a, b) => JSON.stringify(a.place) === JSON.stringify(b.place),
  when: (a, b) => a.date === b.date && a.time === b.time && a.timeZone === b.timeZone,
  device: (a, b) => JSON.stringify(a.device) === JSON.stringify(b.device),
  risk: (a, b) => a.risk === b.risk,
  'assume-on': (a, b) => a.assumeOn === b.assumeOn,
}

/** The first field, in form order, that differs between two forms; null when none does. */
export function changedBy(prev: SignInForm, next: SignInForm): FormField | null {
  return (Object.keys(SAME) as FormField[]).find((f) => !SAME[f](prev, next)) ?? null
}

// --- One click -------------------------------------------------------------------

/** The patch an origin chip makes: its address, stated. */
export function originPatch(id: OriginPresetId): Pick<SignInForm, 'origin' | 'address' | 'addressSource'> {
  const o = ORIGIN_PRESETS.find((x) => x.id === id)!
  return { origin: id, address: o.address, addressSource: 'stated' }
}

/** The patch typing an address makes: typed, and no chip is on any more. */
export function typedAddressPatch(address: string): Pick<SignInForm, 'origin' | 'address' | 'addressSource'> {
  return { origin: null, address, addressSource: 'typed' }
}

// --- Where a form starts -----------------------------------------------------------

/** Today's date where the tenant is, as a date input writes it. */
export function todayIn(timeZone: string = TENANT_TZ, now: Date = new Date()): string {
  /* en-CA writes ISO order: 2026-09-26. */
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

const officeAt0930 = (today: string): Pick<SignInForm, 'origin' | 'address' | 'addressSource' | 'place' | 'date' | 'time' | 'timeZone'> => ({
  ...originPatch('office'),
  place: { kind: 'from-address' },
  date: today,
  time: '09:30',
  timeZone: TENANT_TZ,
})

/* The board's first sign-in for a policy: somebody the policy is for, on its
   first application, from the office at half past nine today, on the
   registered laptop at low risk. A sign-in the policy's own first rule was
   most likely written for, so the first run shows the policy working. */
export function defaultBoardForm(p: Policy, people: readonly User[], apps: readonly App[], today: string): SignInForm {
  const person =
    people.find((u) => p.audience.groupIds[0] !== undefined && u.groupId === p.audience.groupIds[0]) ??
    people.find((u) => u.id === p.audience.userIds[0]) ??
    people[0]
  const app = appsOf(p, [...apps])[0] ?? apps[0]
  return {
    personId: person?.id ?? null,
    appId: app?.id ?? null,
    ...officeAt0930(today),
    device: { kind: 'preset', id: 'win11-registered' },
    risk: '12',
    assumeOn: null,
  }
}

/* The Policy testing views' first sign-in: Kavya Menon on HRMS from the office,
   the scene the showcase opens on, with no device and no risk stated. A tenant
   without her gets its first person and first application and nothing else
   stated, rather than an office address that means nothing to it. */
export function defaultForm(people: readonly User[], apps: readonly App[], today: string): SignInForm {
  const kavya = people.find((u) => u.id === 'u-hr-1')
  const hrms = apps.find((a) => a.id === 'hrms')
  const base = { device: { kind: 'none' } as const, risk: '', assumeOn: null }
  if (kavya && hrms) return { personId: kavya.id, appId: hrms.id, ...officeAt0930(today), ...base }
  return {
    personId: people[0]?.id ?? null,
    appId: apps[0]?.id ?? null,
    origin: null,
    address: '',
    addressSource: 'typed',
    place: { kind: 'from-address' },
    date: '',
    time: '',
    timeZone: TENANT_TZ,
    ...base,
  }
}
