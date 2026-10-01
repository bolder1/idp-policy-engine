import type { App, Audience, Policy, User, Zone } from '../../data'
import { CANT_TELL, DECISION_WORDS } from '../../decision-words'
import { PLACES } from '../../places'
import type { ColumnView } from '../board/try-sign-in'
import { TENANT_TZ, type DevicePlatform } from '../sign-in-facts'
import { DEVICE_PRESETS, devicePreset, type DevicePresetId } from './device-presets'
import type { RowsRead } from './rows-read'
import { CUSTOM_DEVICE, deviceFactsOf, fieldRowId, type FieldOption } from './sign-in-fields'
import { ORIGIN_PRESETS, distancePlace, type FormField, type FormIssue, type OriginPresetId, type SignInForm } from './sign-in-form'

/* -----------------------------------------------------------------------------
   The sign-in, as one sentence of pills (Policy testing V4, §2.2).

     [Arun Patel ▾] signs in to [GitHub Enterprise ▾] from [Office network ▾]
     on [Windows 11 laptop ▾] at [09:30 Mon ▾] with risk [12 ▾]

   The form was rows of labelled controls, every row on screen at once; the
   owner found it "too context heavy". A sentence says the same sign-in in the
   words an admin would use to describe it, and only the facts that can change
   the answer get a pill at all: person, application and where from always,
   because every policy reads who, what and where; the device, the time and
   the risk score only when a rule on this application reads them
   (rows-read.ts). Place and distance are parts of "from", inside its popover.

   What each pill says is the form, read — never the facts. The form holds more
   than the facts (which origin row is on, that an address was typed), and a
   pill that said "203.0.113.24" where the admin picked Office network would
   read as a different sign-in from the one they chose.

   An unstated value is a pill too, in the placeholder's grey: "Choose a
   person", "Any device". It is still a control — the sentence is where it is
   stated — and a missing pill would hide the one thing to press.

   Pure, and apart from the component, so the words are pinned without
   drawing them, and the component file exports only components.
   -------------------------------------------------------------------------- */

export type TokenId = 'person' | 'app' | 'from' | 'device' | 'when' | 'risk'

/** Every token, in sentence order. */
export const TOKENS: readonly TokenId[] = ['person', 'app', 'from', 'device', 'when', 'risk']

/* The words before each token. Plain text between the pills, so the line reads
   as the sentence it is; "with risk" rather than a "Risk 12" pill, so the
   number is said once. */
export const CONNECTOR: Record<TokenId, string> = {
  person: '',
  app: 'signs in to',
  from: 'from',
  device: 'on',
  when: 'at',
  risk: 'with risk',
}

/** What a token states, as the rows name it: the popover's name and the first half of the token's accessible name. */
export const TOKEN_LABEL: Record<TokenId, string> = {
  person: 'Person',
  app: 'Application',
  from: 'From',
  device: 'Device',
  when: 'When',
  risk: 'Device risk score',
}

/* The form field a token's id is named by, so a "Needs: IP address" link finds
   the From token by the same `fieldRowId` it would have found the row by. */
export const TOKEN_FIELD: Record<TokenId, FormField> = {
  person: 'person',
  app: 'app',
  from: 'address',
  device: 'device',
  when: 'when',
  risk: 'risk',
}

/** The token that states a field: the address and the place are both "from". Assume on has none. */
export function tokenOfField(field: FormField): TokenId | null {
  switch (field) {
    case 'person':
    case 'app':
    case 'device':
    case 'when':
    case 'risk':
      return field
    case 'address':
    case 'place':
      return 'from'
    case 'assume-on':
      return null
  }
}

/** A token's DOM id under the sentence's prefix: the same id the field's row had. */
export const tokenDomId = (idPrefix: string, token: TokenId): string => fieldRowId(idPrefix, TOKEN_FIELD[token])

/** What is wrong with a token's value, said in its accessible name and beside the field in its popover. */
export function tokenIssue(token: TokenId, issues: readonly FormIssue[]): string | undefined {
  return issues.find((i) => tokenOfField(i.field) === token)?.message
}

// --- Which tokens ------------------------------------------------------------------

/* Person, application and from always; the rest only when a rule on this
   application reads them. The same rule as the rows (rows-read.ts): a pill
   that cannot change the answer pushes the one that can out of the line. */
export function sentenceTokens(rows: RowsRead): TokenId[] {
  return TOKENS.filter((t) => {
    if (t === 'device') return rows.rows.has('device')
    if (t === 'when') return rows.rows.has('when')
    if (t === 'risk') return rows.rows.has('risk')
    return true
  })
}

/** The token after `token` in this sentence, or null at its end: where Tab goes from an open popover. */
export function nextToken(tokens: readonly TokenId[], token: TokenId): TokenId | null {
  const at = tokens.indexOf(token)
  return at < 0 ? null : (tokens[at + 1] ?? null)
}

// --- What a token says ---------------------------------------------------------------

/* The mark before the value. A person is their face, an application its logo,
   a device its platform's mark; everything else a line icon, named here and
   drawn by the component. */
export type MarkKind = 'face' | 'logo' | 'platform' | 'icon'

export type TokenIcon = 'person' | 'app' | OriginPresetId | 'address' | 'anywhere' | 'device' | 'clock' | 'risk'

export type MarkPlatform = Extract<DevicePlatform, 'android' | 'ios' | 'windows' | 'macos'>

export type TokenMark =
  | { kind: 'face'; name: string }
  | { kind: 'logo'; appId: string; name: string }
  | { kind: 'platform'; platform: MarkPlatform }
  | { kind: 'icon'; icon: TokenIcon }

export interface TokenValue {
  token: TokenId
  /** "Person": what the token states. */
  label: string
  /** "Arun Patel", or the placeholder while nothing is stated. */
  text: string
  /** Nothing stated: the text is a placeholder, drawn grey. */
  unset: boolean
  mark: TokenMark
}

/** The tenant a token's words are read against. */
export interface SentenceContext {
  people: readonly Pick<User, 'id' | 'name'>[]
  apps: readonly Pick<App, 'id' | 'name'>[]
  zones: readonly Zone[]
  /* The rows the rules read. A stated place is said on the From token only
     where a rule reads a place; elsewhere it cannot change the answer. */
  rows?: RowsRead
}

export const UNSET_WORDS: Record<TokenId, string> = {
  person: 'Choose a person',
  app: 'Choose an application',
  from: 'Anywhere',
  device: 'Any device',
  when: 'Any time',
  risk: 'Not stated',
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** "2026-09-28" as "Mon". By UTC arithmetic, so the day never depends on where the browser is. */
export function weekdayOf(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return null
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return Number.isNaN(d.getTime()) ? null : WEEKDAYS[d.getUTCDay()]
}

/** "Europe/London" as "London": the part of a zone an admin reads. */
const zoneCity = (tz: string): string => (tz.split('/').pop() ?? tz).replace(/_/g, ' ')

const MARKED: readonly DevicePlatform[] = ['android', 'ios', 'windows', 'macos']
const markable = (p: DevicePlatform | undefined): p is MarkPlatform => p !== undefined && MARKED.includes(p)

/* The place a stated place is said by on the From token, short: the city's own
   name, the ruler's "30 km from Pune", a carried place's name. Looked up from
   the address, the place is the address's and adds nothing to the token. */
function statedPlace(form: SignInForm, zones: readonly Zone[]): string | null {
  const p = form.place
  if (p.kind === 'stated') return PLACES.find((x) => x.id === p.placeId)?.name ?? 'Stated place'
  if (p.kind === 'distance') return distancePlace(zones, p.zoneId, p.rangeIndex, p.km)?.city ?? `${p.km} km`
  if (p.kind === 'custom') return p.facts.city ?? p.facts.state ?? p.facts.country ?? 'Stated place'
  return null
}

export function tokenValue(token: TokenId, form: SignInForm, ctx: SentenceContext): TokenValue {
  const label = TOKEN_LABEL[token]
  const unset = (mark: TokenMark): TokenValue => ({ token, label, text: UNSET_WORDS[token], unset: true, mark })
  const said = (text: string, mark: TokenMark): TokenValue => ({ token, label, text, unset: false, mark })

  switch (token) {
    case 'person': {
      const u = ctx.people.find((x) => x.id === form.personId)
      return u ? said(u.name, { kind: 'face', name: u.name }) : unset({ kind: 'icon', icon: 'person' })
    }
    case 'app': {
      const a = ctx.apps.find((x) => x.id === form.appId)
      return a ? said(a.name, { kind: 'logo', appId: a.id, name: a.name }) : unset({ kind: 'icon', icon: 'app' })
    }
    case 'from': {
      const origin = ORIGIN_PRESETS.find((o) => o.id === form.origin)
      const address = form.address.trim()
      const readsPlace = !ctx.rows || ctx.rows.rows.has('place') || ctx.rows.rows.has('distance')
      const place = readsPlace ? statedPlace(form, ctx.zones) : null
      const base = origin ? origin.label : address || null
      const mark: TokenMark = { kind: 'icon', icon: origin ? origin.id : address ? 'address' : 'anywhere' }
      if (!base && !place) return unset(mark)
      return said([base, place].filter(Boolean).join(' · '), mark)
    }
    case 'device': {
      const d = form.device
      if (d.kind === 'none') return unset({ kind: 'icon', icon: 'device' })
      const platform = d.kind === 'preset' ? devicePreset(d.id).platform : deviceFactsOf(d).platform
      const mark: TokenMark = markable(platform) ? { kind: 'platform', platform } : { kind: 'icon', icon: 'device' }
      return said(d.kind === 'preset' ? devicePreset(d.id).label : CUSTOM_DEVICE, mark)
    }
    case 'when': {
      if (!form.time) return unset({ kind: 'icon', icon: 'clock' })
      const day = form.date ? weekdayOf(form.date) : null
      const tz = form.timeZone && form.timeZone !== TENANT_TZ ? zoneCity(form.timeZone) : null
      return said([[form.time, day].filter(Boolean).join(' '), tz].filter(Boolean).join(' · '), { kind: 'icon', icon: 'clock' })
    }
    case 'risk': {
      const risk = form.risk.trim()
      return risk ? said(risk, { kind: 'icon', icon: 'risk' }) : unset({ kind: 'icon', icon: 'risk' })
    }
  }
}

/** "Person: Arun Patel", and the error after it when the value is wrong: a token's accessible name. */
export function tokenName(v: Pick<TokenValue, 'label' | 'text'>, issue?: string): string {
  return `${v.label}: ${v.text}${issue ? `, ${issue}` : ''}`
}

/* The sentence as plain words: "Arun Patel signs in to GitHub Enterprise from
   Office network at 09:30 Mon". For a status line or a saved sign-in's tip. */
export function sentenceWords(form: SignInForm, ctx: SentenceContext & { rows: RowsRead }): string {
  return sentenceTokens(ctx.rows)
    .map((t) => [CONNECTOR[t], tokenValue(t, form, ctx).text].filter(Boolean).join(' '))
    .join(' ')
}

// --- What a popover lists --------------------------------------------------------------

/* Which applications the sentence may name.

   Inside a policy, only that policy's: a sign-in on an application the policy
   does not protect is a question for the tenant, not for this board. The
   Global Default protects every application, and so does the Sign-in tests
   page (`'all'`). A draft with no application yet is asked AS IF it were on
   the one chosen (try-sign-in.ts, `asIfApp`), so it lists every application,
   under a heading that says so. */
export interface SentenceScope {
  appIds: readonly string[] | 'all'
  /** A draft with no application: every application, "As if on". */
  asIf?: boolean
  /** The policy's audience: its people are listed first. Absent on the tenant's page. */
  audience?: Audience
}

/** The Sign-in tests page: every person, every application. */
export const GLOBAL_SCOPE: SentenceScope = { appIds: 'all' }

export const AS_IF_HEADING = 'As if on'

/** The scope of a policy's board: its applications, the Global Default's all of them, a draft's none "as if". */
export function boardScope(draft: Pick<Policy, 'appIds' | 'isSystem' | 'audience'>): SentenceScope {
  if (draft.isSystem) return { appIds: 'all', audience: draft.audience }
  return { appIds: draft.appIds, asIf: draft.appIds.length === 0, audience: draft.audience }
}

export interface AppChoice {
  value: string
  label: string
}

/* The applications, in the catalogue's order (as `appsOf` gives them). An
   empty list is read as a draft with none, never as "nothing to choose". */
export function appChoices(scope: SentenceScope, apps: readonly Pick<App, 'id' | 'name'>[]): { options: AppChoice[]; heading?: string } {
  const all = apps.map((a) => ({ value: a.id, label: a.name }))
  if (scope.appIds === 'all') return { options: all }
  if (scope.asIf || scope.appIds.length === 0) return { options: all, heading: AS_IF_HEADING }
  const ids = scope.appIds
  return { options: all.filter((a) => ids.includes(a.value)) }
}

/** The origin rows of the From popover: each preset, its address under it. */
export function originChoices(): (FieldOption & { value: OriginPresetId })[] {
  return ORIGIN_PRESETS.map((o) => ({ value: o.id, label: o.label, meta: o.address }))
}

export const NO_DEVICE_CHOICE = 'none'

/* The device rows: no device stated first — the same words as the token, with
   "Not stated" under them, which is what it means — then the presets, phones
   first. */
export function deviceChoices(): (FieldOption & { platform?: DevicePlatform })[] {
  return [
    { value: NO_DEVICE_CHOICE, label: UNSET_WORDS.device, meta: 'Not stated' },
    ...DEVICE_PRESETS.map((p) => ({ value: p.id, label: p.label, platform: p.platform })),
  ]
}

/** The device a device row states. */
export function deviceOfChoice(value: string): SignInForm['device'] {
  const preset = DEVICE_PRESETS.find((p) => p.id === value)
  return preset ? { kind: 'preset', id: preset.id as DevicePresetId } : { kind: 'none' }
}

/** The device row that is on: the preset's, none's, or no row for a custom device. */
export function deviceChoiceOf(d: SignInForm['device']): string | null {
  return d.kind === 'none' ? NO_DEVICE_CHOICE : d.kind === 'preset' ? d.id : null
}

/* A popover's search: the label or the line under it, trimmed, any case. A
   stray space neither hides every row nor reports that nothing matches " ". */
export function filterChoices<T extends Pick<FieldOption, 'label' | 'meta'>>(choices: readonly T[], query: string): T[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return [...choices]
  return choices.filter((c) => `${c.label} ${c.meta ?? ''}`.toLowerCase().includes(needle))
}

/** Rows under their headings, in the order given: a heading starts where the group changes. */
export function groupChoices<T extends Pick<FieldOption, 'group'>>(choices: readonly T[]): { heading?: string; items: T[] }[] {
  const out: { heading?: string; items: T[] }[] = []
  for (const c of choices) {
    const last = out[out.length - 1]
    if (last && last.heading === c.group) last.items.push(c)
    else out.push({ heading: c.group, items: [c] })
  }
  return out
}

// --- The verdict ---------------------------------------------------------------------

/* The answer at the end of the sentence: the right-hand column's (the version
   on the board), and — only when it differs from the left-hand one, what
   decides today — both, as [left] → [right]. Two identical pills would say the
   same answer twice, which the owner's "numbers once" rule is about. */
export function verdictParts(columns: readonly ColumnView[]): { single?: ColumnView; from?: ColumnView; to?: ColumnView } {
  const to = columns[columns.length - 1]
  if (!to) return {}
  const from = columns[0]
  if (columns.length === 1 || answerKey(from) === answerKey(to)) return { single: to }
  return { from, to }
}

/* Two answers are the same when both are the same decision, or both cannot be
   told in the same way. A Depends that could go two ways and one that could go
   three are both "Depends" at the end of a sentence; the outcome node says which. */
const answerKey = (c: ColumnView): string => (c.status === 'decided' && c.decision ? `decided:${c.decision}` : c.status)

/** "Allow on 1 factor", "Depends", "Can't tell": a column's answer as words. */
export function answerWords(c: Pick<ColumnView, 'status' | 'decision'>): string {
  if (c.status === 'decided' && c.decision) return DECISION_WORDS[c.decision]
  return c.status === 'depends' ? 'Depends' : CANT_TELL
}

/** "Live Allow on 1 factor, Your edits Deny": the verdict's accessible name; the answer alone when there is one. */
export function verdictLabel(columns: readonly ColumnView[]): string {
  const { single, from, to } = verdictParts(columns)
  if (single) return answerWords(single)
  if (!from || !to) return ''
  return `${from.label} ${answerWords(from)}, ${to.label} ${answerWords(to)}`
}
