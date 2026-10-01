import { TIMEZONES, memberGroupIds, type Audience, type Group, type User, type Zone } from '../../data'
import { CANT_TELL, DECISION_WORDS } from '../../decision-words'
import { PLACES, haversineKm, placeContext, type Place } from '../../places'
import type { DevicePlatform, FactKey, FormFactor, ScreenLockFact, SignInDevice, SignInFacts } from '../sign-in-facts'
import { placeOfSignIn } from '../zone-match'
import type { Band, Ruler } from './boundaries'
import { DEVICE_PRESETS, devicePreset, presetOf } from './device-presets'
import type { DeviceRowId } from './rows-read'
import type { FormDevice, FormField, SignInForm } from './sign-in-form'

/* -----------------------------------------------------------------------------
   The sign-in rows, as the controls hold them: options, summaries, source
   words, and the device details one by one.

   Kept out of SignInFields.tsx so a component file exports only its component,
   and so what each control says can be pinned without drawing it.

   The words follow two rules.

   A value says where it came from, in one word beside it: "typed" or "stated"
   for an address, "looked up" for a place the sample table gave. Nothing that
   came from the table is shown as though it were geo-IP.

   NOT STATED is its own answer on every control, and never the same as "none".
   A device that does not report a screen lock has FAILED a screen-lock check;
   a device nobody described has not been checked at all. So each detail
   picker offers Not stated and, where a device can say it has nothing, Not
   reported too (sign-in-facts.ts has the rule).
   -------------------------------------------------------------------------- */

/** The word beside a value, saying where it came from. */
export type SourceWord = 'typed' | 'stated' | 'looked up'

// --- Finding a row ---------------------------------------------------------------

/* The row that states a fact, for a "Needs:" link: the same words as
   FACT_WORDS, so "Needs: IP address" goes to the row labelled IP address. */
export const FIELD_OF_FACT: Record<FactKey, FormField> = {
  app: 'app',
  person: 'person',
  address: 'address',
  asn: 'address',
  location: 'place',
  'location.city': 'place',
  'location.coordinates': 'place',
  date: 'when',
  time: 'when',
  risk: 'risk',
  'device.platform': 'device',
  'device.osVersion': 'device',
  'device.formFactor': 'device',
  'device.browser': 'device',
  'device.integrity': 'device',
  'device.screenLock': 'device',
  'device.authenticatorVersion': 'device',
  'device.agent': 'device',
  'device.registration': 'device',
  'device.registeredCount': 'device',
}

/** The DOM id of a field's row, under the prefix its `SignInFields` was given. */
export const fieldRowId = (prefix: string, field: FormField): string => `${prefix}-${field}`

/** Picker values, before any art: the component adds faces, logos and marks. */
export interface FieldOption {
  value: string
  label: string
  meta?: string
  group?: string
}

// --- Person and application ------------------------------------------------------

export const IN_POLICY = 'In this policy'
export const NOT_IN_POLICY = 'Not in this policy'

/* Governed through any group they are in, not only the first (Maya Iyer, in
   Engineering and Finance, is in a Finance policy). */
const governs = (a: Audience, u: Pick<User, 'id' | 'groupId' | 'alsoGroupIds'>) => a.everyone || memberGroupIds(u).some((g) => a.groupIds.includes(g)) || a.userIds.includes(u.id)

/* Everybody in the sample directory, each with every group they are in
   ("Maya Iyer · Engineering, Finance"). On the board the
   people the policy is for come first, under their own heading, because the
   person a tester wants is nearly always one of them; the page has no policy
   to sort by and lists them as the directory does. */
export function personOptions(people: readonly User[], groups: readonly Group[], audience?: Audience | null): FieldOption[] {
  const groupName = (id: string) => groups.find((g) => g.id === id)?.name ?? id
  const option = (u: User, group?: string): FieldOption => ({ value: u.id, label: u.name, meta: memberGroupIds(u).map(groupName).join(', '), ...(group ? { group } : null) })
  if (!audience) return people.map((u) => option(u))
  return [
    ...people.filter((u) => governs(audience, u)).map((u) => option(u, IN_POLICY)),
    ...people.filter((u) => !governs(audience, u)).map((u) => option(u, NOT_IN_POLICY)),
  ]
}

// --- The address -----------------------------------------------------------------

export function addressSource(form: Pick<SignInForm, 'address' | 'addressSource'>): SourceWord | null {
  if (!form.address.trim()) return null
  return form.addressSource === 'typed' ? 'typed' : 'stated'
}

// --- The place ---------------------------------------------------------------------

export const FROM_ADDRESS = 'from-address'
const PLACE_PREFIX = 'place:'

/** "Pune, India": a catalogue place as the Place row names it. */
export const placeName = (p: Pick<Place, 'name' | 'country' | 'kind'>): string => (p.kind === 'country' ? p.name : `${p.name}, ${p.country}`)

const CITIES = PLACES.filter((p) => p.kind === 'city')

/** From the address first, then every catalogue city. */
export function placeOptions(): FieldOption[] {
  return [{ value: FROM_ADDRESS, label: 'From IP address' }, ...CITIES.map((p) => ({ value: `${PLACE_PREFIX}${p.id}`, label: placeName(p), meta: placeContext(p) }))]
}

/** The picker's value for the form's place; null for a ruler point or a carried place, which the summary names. */
export function placeValue(place: SignInForm['place']): string | null {
  if (place.kind === 'from-address') return FROM_ADDRESS
  if (place.kind === 'stated') return `${PLACE_PREFIX}${place.placeId}`
  return null
}

/** The form's place for a picker value. */
export function placeOfValue(value: string): SignInForm['place'] {
  return value.startsWith(PLACE_PREFIX) ? { kind: 'stated', placeId: value.slice(PLACE_PREFIX.length) } : { kind: 'from-address' }
}

/* What the closed Place picker says. Looked up from the address, it says what
   the table gave — "From IP address · Pune, India" — or that it gave nothing,
   and why: an anonymiser has no place, an address outside the table has none
   to give. */
export function placeSummary(form: Pick<SignInForm, 'place' | 'address'>, facts: SignInFacts): string {
  const p = form.place
  if (p.kind === 'stated') {
    const found = PLACES.find((x) => x.id === p.placeId)
    return found ? placeName(found) : 'Stated place'
  }
  if (p.kind === 'distance') return facts.location?.city ?? `${p.km} km`
  if (p.kind === 'custom') return p.facts.city ?? p.facts.state ?? p.facts.country ?? 'Stated place'
  if (!form.address.trim()) return 'From IP address'
  const found = placeOfSignIn(facts)
  if (found === null) return 'From IP address · no place'
  if (found === undefined) return 'From IP address · not in the sample table'
  const name = found.city ?? found.state ?? found.country
  return `From IP address · ${[name, found.city || found.state ? found.country : null].filter(Boolean).join(', ')}`
}

export function placeSource(form: Pick<SignInForm, 'place'>, facts: SignInFacts): SourceWord | null {
  if (form.place.kind !== 'from-address') return 'stated'
  return placeOfSignIn(facts) ? 'looked up' : null
}

/* Where the ruler stands: the stated distance, or how far the place the
   sign-in is at lies from the range's centre — rounded, past the ruler's end
   too, and null when that place has no coordinates to measure from. */
export function distanceNow(form: Pick<SignInForm, 'place'>, facts: SignInFacts, zones: readonly Zone[], zoneId: string, rangeIndex: number): number | null {
  if (form.place.kind === 'distance' && form.place.zoneId === zoneId && form.place.rangeIndex === rangeIndex) return form.place.km
  const range = zones.find((z) => z.id === zoneId)?.location.ranges[rangeIndex]
  const at = placeOfSignIn(facts)
  if (!range || !at || at.lat === null || at.lon === null) return null
  return Math.round(haversineKm({ lat: at.lat, lon: at.lon }, range))
}

/** What the Distance row says: where the thumb goes, the words beside it, and what it announces. */
export interface RulerReading {
  /** The thumb: the sign-in's distance, held at the ruler's end when it is further. */
  at: number
  /** "728 km from Pune", past the end too, or Can't tell. */
  value: string
  /** The value, then the band's decision where that band is this sign-in's answer. */
  valueText: string
  /** The thumb stands where the sign-in is and the band under it is its answer; otherwise it is drawn neutral. */
  placed: boolean
}

/* The Distance row never shows a distance the sign-in does not have. With no
   place to measure from it says Can't tell, grey, and announces no band; past
   the ruler's end it says the real distance with the thumb held at the end;
   and where the zone takes the place by name, not by range, the band under
   the thumb is not the sign-in's answer, so it is not announced as one. */
export function rulerReading(ruler: Pick<Ruler, 'centre' | 'max' | 'bands' | 'now' | 'agrees'>): RulerReading {
  if (ruler.now === null) return { at: 0, value: CANT_TELL, valueText: CANT_TELL, placed: false }
  const at = Math.min(ruler.max, ruler.now)
  const value = `${ruler.now} km from ${ruler.centre}`
  const band = ruler.agrees ? bandAt(ruler.bands, at) : undefined
  return { at, value, valueText: band ? `${value}, ${bandWords(band)}` : value, placed: band !== undefined }
}

// --- When --------------------------------------------------------------------------

export const timeZoneOptions = (): FieldOption[] => TIMEZONES.map((z) => ({ value: z, label: z }))

// --- The device ----------------------------------------------------------------------

export const NO_DEVICE = 'none'
export const CUSTOM_DEVICE = 'Custom device'

export function deviceOptions(): FieldOption[] {
  return [{ value: NO_DEVICE, label: 'Not stated' }, ...DEVICE_PRESETS.map((p) => ({ value: p.id, label: p.label }))]
}

/** The picker's value; null for a custom device, which the summary names. */
export function deviceValue(d: FormDevice): string | null {
  return d.kind === 'none' ? NO_DEVICE : d.kind === 'preset' ? d.id : null
}

/** The device the details start from: nothing stated, a preset's facts, or the custom ones. */
export function deviceFactsOf(d: FormDevice): SignInDevice {
  if (d.kind === 'preset') return devicePreset(d.id).facts
  if (d.kind === 'custom') return d.facts
  return { source: 'stated' }
}

/* A detail edited. The device becomes a custom one — unless the edit lands it
   exactly on a preset, which it then IS, and the picker says so. */
export function withDevice(next: SignInDevice): FormDevice {
  const preset = presetOf(next)
  return preset ? { kind: 'preset', id: preset } : { kind: 'custom', facts: { ...next, source: 'stated' } }
}

/** A detail row's label: the words the device facts are named by everywhere (decision-words.ts). */
export const DEVICE_ROW_LABEL: Record<DeviceRowId, string> = {
  platform: 'Platform',
  'os-version': 'OS version',
  'device-type': 'Device type',
  integrity: 'Integrity',
  'screen-lock': 'Screen lock',
  authenticator: 'miniOrange Authenticator',
  agent: 'Device Agent',
  registered: 'Registered to this person',
  'registered-count': 'Devices already registered',
}

/** '' is Not stated on every detail picker. */
export const NOT_STATED = ''

const PLATFORMS: [DevicePlatform, string][] = [
  ['windows', 'Windows'],
  ['macos', 'macOS'],
  ['ios', 'iOS'],
  ['android', 'Android'],
  ['linux', 'Linux'],
]
const FORM_FACTORS: FormFactor[] = ['Mobile', 'Tablet', 'Laptop']
const LOCKS: [ScreenLockFact, string][] = [
  ['none', 'None'],
  ['pattern', 'Pattern'],
  ['pin', 'PIN or passcode'],
  ['biometric', 'Biometric'],
]

const notStated: FieldOption = { value: NOT_STATED, label: 'Not stated' }
const UNREPORTED = 'unreported'
const unreported: FieldOption = { value: UNREPORTED, label: 'Not reported' }

/** The choices a picker detail offers. The two free-text versions and the count have none. */
export const DETAIL_OPTIONS: Partial<Record<DeviceRowId, FieldOption[]>> = {
  platform: [notStated, ...PLATFORMS.map(([value, label]) => ({ value, label }))],
  'device-type': [notStated, ...FORM_FACTORS.map((f) => ({ value: f, label: f }))],
  integrity: [
    notStated,
    { value: 'intact', label: 'Intact' },
    { value: 'rooted', label: 'Rooted or jailbroken' },
    { value: 'tampered', label: 'Tampered' },
    { value: 'emulated', label: 'Emulator' },
    unreported,
  ],
  'screen-lock': [notStated, ...LOCKS.map(([value, label]) => ({ value, label })), unreported],
  authenticator: [notStated, { value: 'installed', label: 'Installed' }, { value: 'absent', label: 'Not installed' }],
  agent: [notStated, { value: 'installed', label: 'Installed' }, { value: 'absent', label: 'Not installed' }],
  registered: [notStated, { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }],
}

/* A version filled in when somebody picks Installed and has not typed one:
   the showcase's own current releases, so Installed alone passes the floors. */
const INSTALLED_VERSION = { authenticator: '6.5.0', agent: '4.3' }

/** What a detail picker shows for a device. */
export function detailValue(d: SignInDevice, row: DeviceRowId): string {
  switch (row) {
    case 'platform':
      return d.platform ?? NOT_STATED
    case 'os-version':
      return d.osVersion ?? ''
    case 'device-type':
      return d.formFactor ?? NOT_STATED
    case 'integrity': {
      const i = d.integrity
      if (i === undefined) return NOT_STATED
      if (i === null) return UNREPORTED
      return i.rooted ? 'rooted' : i.tampered ? 'tampered' : i.emulated ? 'emulated' : 'intact'
    }
    case 'screen-lock':
      return d.screenLock === undefined ? NOT_STATED : d.screenLock === null ? UNREPORTED : d.screenLock
    case 'authenticator':
      return d.authenticatorVersion === undefined ? NOT_STATED : d.authenticatorVersion === null ? 'absent' : 'installed'
    case 'agent':
      return d.agentInstalled === undefined ? NOT_STATED : d.agentInstalled ? 'installed' : 'absent'
    case 'registered':
      return d.registeredToPerson === undefined ? NOT_STATED : d.registeredToPerson ? 'yes' : 'no'
    case 'registered-count':
      return d.registeredCount === undefined ? NOT_STATED : String(d.registeredCount)
  }
}

/* One detail changed, the rest kept. Not stated removes the fact rather than
   setting it to null — null is "the device reports none", a different answer. */
export function withDetail(d: SignInDevice, row: DeviceRowId, value: string): SignInDevice {
  const next: SignInDevice = { ...d }
  const unset = value === NOT_STATED
  switch (row) {
    case 'platform':
      if (unset) delete next.platform
      else next.platform = value as DevicePlatform
      break
    case 'os-version':
      if (!value.trim()) delete next.osVersion
      else next.osVersion = value.trim()
      break
    case 'device-type':
      if (unset) delete next.formFactor
      else next.formFactor = value as FormFactor
      break
    case 'integrity':
      if (unset) delete next.integrity
      else if (value === UNREPORTED) next.integrity = null
      else next.integrity = { rooted: value === 'rooted', tampered: value === 'tampered', emulated: value === 'emulated' }
      break
    case 'screen-lock':
      if (unset) delete next.screenLock
      else next.screenLock = value === UNREPORTED ? null : (value as ScreenLockFact)
      break
    case 'authenticator':
      if (unset) delete next.authenticatorVersion
      else next.authenticatorVersion = value === 'absent' ? null : (d.authenticatorVersion ?? INSTALLED_VERSION.authenticator)
      break
    case 'agent':
      if (unset) {
        delete next.agentInstalled
        delete next.agentVersion
      } else if (value === 'absent') {
        next.agentInstalled = false
        next.agentVersion = null
      } else {
        next.agentInstalled = true
        next.agentVersion = d.agentVersion ?? INSTALLED_VERSION.agent
      }
      break
    case 'registered':
      if (unset) delete next.registeredToPerson
      else next.registeredToPerson = value === 'yes'
      break
    case 'registered-count': {
      const n = Number(value)
      if (unset || !Number.isInteger(n) || n < 0) delete next.registeredCount
      else next.registeredCount = Math.min(10, n)
      break
    }
  }
  return next
}

/* An installed component's version, typed. Blank keeps it installed with no
   version stated — the box stays, and the version check reads Can't tell. The
   Agent says "installed" by a flag of its own; the Authenticator only by a
   version, so for it the empty version IS that answer (sign-in-facts.ts).
   Removing the fact instead turned the row back to Not stated and took the
   box away while somebody was still typing in it. */
export function withVersion(d: SignInDevice, row: 'authenticator' | 'agent', version: string): SignInDevice {
  const v = version.trim()
  if (row === 'authenticator') return { ...d, authenticatorVersion: v }
  const next = { ...d, agentInstalled: true }
  if (v) next.agentVersion = v
  else delete next.agentVersion
  return next
}

// --- The risk score ---------------------------------------------------------------------

/** The band a score sits in, if the control has bands. */
export function bandAt(bands: readonly Band[] | undefined, n: number): Band | undefined {
  return bands?.find((b) => n >= b.from && n <= b.to)
}

/** A band's decision as its label says it: grey Can't tell where it cannot be told. */
export const bandWords = (b: Pick<Band, 'decision'>): string => (b.decision ? DECISION_WORDS[b.decision] : CANT_TELL)

/** "48, Allow with 2FA": what a slider announces as its value. */
export function valueText(n: number, bands: readonly Band[] | undefined, unit = ''): string {
  const band = bandAt(bands, n)
  return band ? `${n}${unit}, ${bandWords(band)}` : `${n}${unit}`
}

/** "Boundaries 40 and 71": the printed edges, for a screen reader. */
export function edgesText(edges: readonly (number | string)[]): string {
  if (edges.length === 0) return ''
  if (edges.length === 1) return `Boundary ${edges[0]}`
  return `Boundaries ${edges.slice(0, -1).join(', ')} and ${edges[edges.length - 1]}`
}

/* Risk signals are collected on phones, so a score stated for a laptop is a
   score nobody measured. Said beside the label, not instead of the answer. */
export function riskUnmeasured(device: FormDevice): boolean {
  const p = deviceFactsOf(device).platform
  return p === 'windows' || p === 'macos'
}
