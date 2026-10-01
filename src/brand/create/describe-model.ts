import {
  EVERYONE,
  anySignIn,
  audienceOf,
  card,
  cond,
  fallbackRule,
  rule,
  when as whenOf,
  TIMEZONES,
  type AccessDecision,
  type App,
  type Audience,
  type Condition,
  type Group,
  type Policy,
  type Rule,
  type RuleWho,
  type Scenario,
  type User,
  type Zone,
} from '../data'
import { DECISION_WORDS } from '../decision-words'
import { profileMatches, type FingerprintProfile } from '../fingerprint'
import { RULE_METHODS, type AuthMethod } from '../methods'
import { PLACES, type Place } from '../places'
import { freeName, POLICY_NAME_MAX } from '../policy-name'
import { leaves } from '../predicate'
import { normaliseWho, whoSummary } from '../rule-who'
import { listPhrase } from '../screens/app-policies'
import { DEVICE_PRESETS } from '../screens/testing/device-presets'
import { ORIGIN_PRESETS } from '../screens/testing/sign-in-form'
import * as W from './describe-words'

/* -----------------------------------------------------------------------------
   Describe it: a policy from a sentence, or from six questions.

   It authors; it does not invent. The admin says what the policy should do —
   typed, or answered — and this writes ordinary rule cards from it: the same
   `rule`, `cond`, `card` and `fallbackRule` every seeded policy is built with,
   so nothing downstream can tell a described rule from a hand-made one.

   Reading is MATCHING, not a model. The text is split into words and each run
   of words is looked up against this tenant's own names — its applications,
   groups, people, zones, device profiles and methods — and a fixed table of
   structure words (describe-words.ts). Longest match wins, on whole words
   only, so "board" inside "dashboard" can never be read as anything. What the
   tenant does not hold is listed as not added, with the reason; it never
   becomes a condition.

   It asks only where the tenant holds more than one fitting object — "company
   laptop" when there are two device profiles, "Nadia Haddad" when there are
   two people of that name — and asks with nothing picked. Until it is
   answered, the part of the draft that answer feeds is left out, so a card on
   the board never holds a guessed id.

   And it never writes a rule the text did not ask for. There is no catch-all:
   the last row is the policy's own, and "only" writes a refusal for the people
   named and nobody else (describe spec, §4).
   -------------------------------------------------------------------------- */

// --- Types --------------------------------------------------------------------

export type SlotId = 'apps' | 'who' | 'leaveOut' | 'where' | 'when' | 'devices' | 'risk' | 'signIn' | 'fallback'
export type Origin = 'text' | 'picked' | 'default' | 'unset'
/** A stretch of the text as it was read: offsets into it, and the words. */
export interface Span {
  start: number
  end: number
  phrase: string
}
export interface Answer<T> {
  value: T | null
  origin: Origin
  spans: Span[]
}

export interface Outcome {
  decision: AccessDecision
  /** 2FA: null = any enabled method. 1 factor: null = password. Unused for deny. */
  method: string | null
  /** Deny only. null = the product's default message. */
  message: string | null
}
export type ZoneScope = 'both' | 'ip' | 'location'
export type WhereAnswer = { mode: 'anywhere' } | { mode: 'only' | 'split' | 'not'; zoneId: string; scope: ZoneScope }
/* `days` is a weekday condition with no window — "on weekdays" — which the
   console writes as Day of week alone. */
export type WhenAnswer =
  | { mode: 'any' }
  | { mode: 'between'; from: string; to: string; days: string[]; timeZone: string }
  | { mode: 'days'; days: string[] }
export type DeviceAnswer = { mode: 'any' } | { mode: 'only' | 'not'; profileId: string }
export type RiskAnswer = { mode: 'any' } | { mode: 'bands'; mediumFrom: number; highAbove: number } | { mode: 'above' | 'below'; score: number }
export type BranchId = 'match' | 'inside' | 'outside' | 'low' | 'medium' | 'high'

/* A later sentence with conditions and an outcome of its own — "…; in the
   office, password only". It is its own rule, beside the first. */
export interface ClauseRule {
  where: Answer<WhereAnswer>
  devices: Answer<DeviceAnswer>
  risk: Answer<RiskAnswer>
  when: Answer<WhenAnswer>
  outcome: Answer<Outcome>
  span: Span
}

export interface DescribeAnswers {
  apps: Answer<string[]>
  /** Groups and people only. The exceptions are `leaveOut`. */
  who: Answer<RuleWho | 'everyone'>
  leaveOut: Answer<RuleWho>
  where: Answer<WhereAnswer>
  when: Answer<WhenAnswer>
  devices: Answer<DeviceAnswer>
  risk: Answer<RiskAnswer>
  signIn: Partial<Record<BranchId, Answer<Outcome>>>
  more: ClauseRule[]
  fallback: Answer<Outcome>
  /** "only" was said: the people named are refused outside the conditions. */
  only: Span | null
  /** "everyone else" (or a synonym) was said: the policy stays for Everyone. */
  everyoneElse: Span | null
  /** Two rules that can both match one sign-in: which goes first. 0 is the first rule, 1 + i is `more[i]`. */
  order: Answer<number> | null
  /** Whether "Match on" came from the text. */
  scopeSaid: boolean
}

/** Where a choice's answer goes: the first rule, one of its branches, or a later sentence's rule. */
export type ChoiceTarget = 'match' | `more:${number}`
export interface ChoiceOption {
  value: string
  label: string
  meta?: string
}
export interface Choice {
  id: string
  slot: SlotId | 'order'
  span: Span
  options: ChoiceOption[]
  picked: string | null
  /** What "Don't add" puts under Not added. */
  notAddedReason?: string
  notAddedAction?: NotAdded['action']
  target: ChoiceTarget
  /** For a zone: which way the text read it. */
  mode?: 'only' | 'not' | 'split'
  /** For the order question: the one sign-in both rules would take. */
  detail?: string
  /** For a method: which branch, or the last row. */
  branch?: BranchId | 'fallback'
}
export interface NotAdded {
  span: Span
  reason: string
  action?: 'create-zone' | 'device-profiles' | 'auth-methods'
}
export type ClauseRole = 'lead' | 'branch' | 'plain' | 'rest' | 'dropped'
export interface Clause {
  start: number
  end: number
  text: string
  role: ClauseRole
}
export interface Reading {
  text: string
  answers: DescribeAnswers
  choices: Choice[]
  notAdded: NotAdded[]
  clauses: Clause[]
}

/** What the reader needs from the store. `scenarios` are the tenant's templates. */
export interface DescribeTenant {
  apps: readonly App[]
  groups: readonly Group[]
  users: readonly User[]
  zones: readonly Zone[]
  fingerprints: readonly FingerprintProfile[]
  methods: readonly AuthMethod[]
  policies: readonly Policy[]
  scenarios: readonly Scenario[]
}

/** Card ids by what wrote them ('match', 'inside', 'more:0', 'only'), so recomposing keeps each card. */
export type RuleIds = Map<string, string>
export interface Composed {
  rules: Rule[]
  /** Undefined: the draft's last row is left exactly as it is. */
  fallback: Rule | undefined
  audience: Audience
  /** The words each card came from, by rule id. */
  sources: Record<string, string>
  /** Rules the order made unreachable, dropped rather than written. */
  notAdded: NotAdded[]
  /* The first rule would have been a catch-all — everyone, no conditions — so
     its outcome is the last row instead, and no rule is written for it. */
  merged: boolean
}

// --- Words on screen ------------------------------------------------------------

export const NOT_SET = 'Not set'
export const REASON = {
  unread: 'Not an application, group or person on this tenant',
  deviceType: 'Device type is set in a device profile',
  hours: 'Hours need a start and an end',
  split: 'One split per description',
  oneZone: 'One zone per rule',
  oneMethod: 'One method per rule',
  noMdm: 'No MDM condition',
  noZone: (place: string) => `No zone for ${place}`,
  off: (method: string) => `${method} is off in Authentication methods`,
  never: (name: string) => `Never reached: ${name} decides first`,
  onlyUnreached: 'No place, device or time to limit to',
} as const

/* The tenant's own risk bands, when nothing says otherwise. */
const DEFAULT_CUTOFFS = { mediumFrom: 40, highAbove: 70 }
export const TENANT_TIME_ZONE = 'Asia/Kolkata'
const DAYS = W.DAY_NAMES as readonly string[]

// --- Words ---------------------------------------------------------------------

interface Tok {
  text: string
  low: string
  start: number
  end: number
  punct: boolean
}

/* Letters and digits, with `/ - – . : '` allowed INSIDE a word — so "9:30",
   "two-factor", "asia/kolkata" and "mon–fri" are one word each — and the four
   marks that cut a sentence as words of their own. Anything else ("/" on its
   own, brackets, quotes) is not a word and not a mark. */
const TOKEN = /[\p{L}\p{N}]+(?:['’/\-–.:][\p{L}\p{N}]+)*|[.;:,]/gu

function tokenize(s: string): Tok[] {
  const out: Tok[] = []
  for (const m of s.matchAll(TOKEN)) {
    const text = m[0]
    const start = m.index ?? 0
    out.push({ text, low: text.toLowerCase().replace(/’/g, "'"), start, end: start + text.length, punct: /^[.;:,]$/.test(text) })
  }
  return out
}

const wordsOf = (phrase: string): string[] => tokenize(phrase).filter((t) => !t.punct).map((t) => t.low)

// --- The dictionary ---------------------------------------------------------------

type Kind =
  | 'app' | 'category' | 'group' | 'person' | 'employee' | 'everyone'
  | 'zone' | 'place' | 'profile' | 'device-choice' | 'unmanaged' | 'device-type'
  | 'method' | 'method-choice' | 'factor1' | 'factor2' | 'deny' | 'allow' | 'require'
  | 'only' | 'complement' | 'rest' | 'where' | 'not-where' | 'elsewhere' | 'on' | 'not-on'
  | 'scope' | 'band' | 'hours' | 'except' | 'days' | 'tz' | 'stop'

/* Ties between entries of one length, broadest claim first: the tenant's own
   objects, then the fixed words, with plain stop words last of all. */
const PRIORITY: Kind[] = [
  'app', 'zone', 'profile', 'group', 'person', 'method', 'employee', 'category', 'everyone', 'place',
  'device-choice', 'unmanaged', 'method-choice', 'factor1', 'factor2', 'deny', 'band', 'hours', 'complement',
  'rest', 'scope', 'not-where', 'not-on', 'elsewhere', 'where', 'on', 'only', 'except', 'allow', 'require',
  'days', 'tz', 'device-type', 'stop',
]

interface Entry {
  words: string[]
  kind: Kind
  ids: string[]
  value?: string
  /** A two-letter alias ("US", "UK") matches only as written in capitals. */
  upper?: boolean
  scope?: ZoneScope
}

export interface Dictionary {
  entries: Map<string, Entry[]>
  tenant: DescribeTenant
  cutoffs: { mediumFrom: number; highAbove: number }
  /** Whether the cut-offs came from the tenant's own policies or templates. */
  cutoffsSaid: boolean
}

const singular = (name: string): string | null => {
  const words = name.split(/\s+/)
  const last = words[words.length - 1]
  if (!/[a-z]s$/i.test(last) || /ss$/i.test(last)) return null
  return [...words.slice(0, -1), last.slice(0, -1)].join(' ')
}

const cutoffsOf = (t: DescribeTenant): { mediumFrom: number; highAbove: number } | null => {
  const aboves = (rules: readonly Rule[]) =>
    [...new Set(rules.flatMap((r) => leaves(r.when)).filter((c) => c.typeId === 'device-risk' && c.operator === 'above').map((c) => Number(c.values[0])))]
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b)
  const from = (v: number[]) => (v.length >= 2 ? { mediumFrom: v[0] + 1, highAbove: v[v.length - 1] } : null)
  for (const p of t.policies) {
    const got = from(aboves(p.rules))
    if (got) return got
  }
  for (const s of t.scenarios) {
    const got = from(aboves(s.rules.map((r) => r.build())))
    if (got) return got
  }
  return null
}

/** Every name this tenant answers to, built fresh for each read. */
export function dictionaryOf(t: DescribeTenant): Dictionary {
  const entries = new Map<string, Entry[]>()
  const add = (phrase: string, kind: Kind, ids: string[] = [], extra: Partial<Entry> = {}) => {
    const words = wordsOf(phrase)
    if (words.length === 0) return
    const list = entries.get(words[0]) ?? []
    if (list.some((e) => e.kind === kind && e.words.join(' ') === words.join(' ') && e.ids.join() === ids.join())) return
    list.push({ words, kind, ids, ...extra })
    entries.set(words[0], list)
  }
  const addAll = (phrases: readonly string[], kind: Kind, ids: string[] = [], extra: Partial<Entry> = {}) => {
    for (const p of phrases) add(p, kind, ids, extra)
  }

  /* Applications, and the short names people use: without a leading vendor
     word or a trailing edition word, when that is still unique. */
  const shortOf = (name: string): string => {
    let w = wordsOf(name)
    if (w.length > 1 && (W.VENDOR_WORDS as readonly string[]).includes(w[0])) w = w.slice(1)
    if (w.length > 1 && (W.EDITION_WORDS as readonly string[]).includes(w[w.length - 1])) w = w.slice(0, -1)
    return w.join(' ')
  }
  const shorts = t.apps.map((a) => shortOf(a.name))
  const fulls = t.apps.map((a) => wordsOf(a.name).join(' '))
  t.apps.forEach((a, i) => {
    add(a.name, 'app', [a.id])
    const s = shorts[i]
    if (s !== fulls[i] && shorts.filter((x) => x === s).length === 1 && !fulls.includes(s)) add(s, 'app', [a.id])
  })
  for (const c of W.APP_CATEGORIES) {
    const ids = t.apps.filter((a) => c.apps.includes(a.name)).map((a) => a.id)
    if (ids.length > 0) addAll(c.words, 'category', ids)
  }

  const groupNamed = (name: string) => t.groups.find((g) => g.name.toLowerCase() === name.toLowerCase())
  for (const g of t.groups) {
    const low = g.name.toLowerCase()
    if ((W.EMPLOYEE_WORDS as readonly string[]).includes(low)) continue
    add(g.name, 'group', [g.id])
    const one = !/\s/.test(g.name) && !(W.NOT_PLURAL as readonly string[]).includes(low) ? singular(g.name) : null
    if (one) add(one, 'group', [g.id])
  }
  for (const a of W.GROUP_ALIASES) {
    const g = groupNamed(a.group)
    if (g) addAll(a.words, 'group', [g.id])
  }
  const employees = t.groups.find((g) => (W.EMPLOYEE_WORDS as readonly string[]).includes(g.name.toLowerCase()))
  if (employees) addAll(W.EMPLOYEE_WORDS, 'employee', [employees.id])

  const byName = new Map<string, string[]>()
  for (const u of t.users) byName.set(u.name.toLowerCase(), [...(byName.get(u.name.toLowerCase()) ?? []), u.id])
  for (const [, ids] of byName) {
    const u = t.users.find((x) => x.id === ids[0])
    if (u) add(u.name, 'person', ids)
  }
  addAll(W.EVERYONE_WORDS, 'everyone')

  const offices: string[] = []
  for (const z of t.zones) {
    add(z.name, 'zone', [z.id])
    const one = singular(z.name)
    if (one) add(one, 'zone', [z.id])
    if (/\boffices?\b/i.test(z.name)) offices.push(z.id)
    const loc = z.location
    const oneCountry = loc.countries.length === 1 && loc.states.length === 0 && loc.cities.length === 0 && loc.ranges.length === 0
    if (oneCountry) {
      const country = PLACES.find((p) => p.kind === 'country' && p.name === loc.countries[0])
      if (country) {
        add(country.name, 'zone', [z.id])
        for (const al of country.aliases ?? []) add(al, 'zone', [z.id], al.length <= 2 ? { upper: true } : {})
      }
    }
  }
  if (offices.length > 0) {
    addAll(W.OFFICE_WORDS, 'zone', offices)
    addAll(W.OFFICE_NETWORK_WORDS, 'zone', offices, { scope: 'ip' })
  }
  for (const p of PLACES) {
    if (p.kind === 'state') continue
    add(p.name, 'place', [p.id])
    for (const al of p.aliases ?? []) add(al, 'place', [p.id], al.length <= 2 ? { upper: true } : {})
  }

  const firsts = t.fingerprints.map((p) => wordsOf(p.name)[0])
  t.fingerprints.forEach((p, i) => {
    add(p.name, 'profile', [p.id])
    const one = singular(p.name)
    if (one) add(one, 'profile', [p.id])
    if (wordsOf(p.name).length > 1 && firsts.filter((f) => f === firsts[i]).length === 1) add(firsts[i], 'profile', [p.id])
  })
  if (t.fingerprints.length > 0) addAll(W.DEVICE_AMBIGUOUS, 'device-choice', t.fingerprints.map((p) => p.id))
  const trusted = t.fingerprints.filter((p) => p.mode === 'device').map((p) => p.id)
  addAll(W.UNMANAGED_WORDS, 'unmanaged', trusted)
  addAll(W.DEVICE_TYPE_WORDS, 'device-type')

  for (const m of RULE_METHODS) add(m, 'method', [], { value: m })
  for (const a of W.METHOD_ALIASES) addAll(a.words, 'method', [], { value: a.method })
  addAll(W.AUTHENTICATOR_APP_WORDS, 'method-choice', [...W.AUTHENTICATOR_APPS])

  addAll(W.FACTOR_1FA, 'factor1')
  addAll(W.FACTOR_2FA, 'factor2')
  addAll(W.DENY_WORDS, 'deny')
  addAll(W.ALLOW_VERBS, 'allow')
  addAll(W.REQUIREMENT_VERBS, 'require')
  addAll(W.ONLY_WORDS, 'only')
  addAll(W.COMPLEMENT_WORDS, 'complement')
  addAll(W.REST_WORDS, 'rest')
  addAll(W.WHERE_WORDS, 'where')
  addAll(W.NOT_WHERE_WORDS, 'not-where')
  addAll(W.ELSEWHERE_WORDS, 'elsewhere')
  addAll(W.ON_WORDS, 'on')
  addAll(W.NOT_ON_WORDS, 'not-on')
  addAll(W.SCOPE_IP_WORDS, 'scope', [], { value: 'ip' })
  addAll(W.SCOPE_LOCATION_WORDS, 'scope', [], { value: 'location' })
  for (const b of W.BAND_WORDS) addAll(b.words, 'band', [], { value: b.band })
  addAll(W.HOURS_WORDS, 'hours')
  addAll(W.EXCEPT_WORDS, 'except')
  for (const d of W.DAY_ALIASES) addAll(d.words, 'days', [...d.days])
  for (const tz of TIMEZONES) add(tz, 'tz', [], { value: tz })
  for (const [al, tz] of Object.entries(W.TZ_ALIASES)) add(al, 'tz', [], { value: tz })
  addAll(W.STOP_WORDS, 'stop')

  const rank = (k: Kind) => PRIORITY.indexOf(k)
  for (const list of entries.values()) list.sort((a, b) => b.words.length - a.words.length || rank(a.kind) - rank(b.kind))

  const cut = cutoffsOf(t)
  return { entries, tenant: t, cutoffs: cut ?? DEFAULT_CUTOFFS, cutoffsSaid: cut !== null }
}

// --- Matching ------------------------------------------------------------------------

interface Item {
  kind: Kind | 'time' | 'risk-num'
  /** Token range, end exclusive. */
  i: number
  j: number
  start: number
  end: number
  ids: string[]
  value?: string
  scope?: ZoneScope
  time?: { from: string; to: string }
  num?: { op: 'above' | 'below'; n: number }
  clause: number
}

const pad = (n: number) => String(n).padStart(2, '0')

/* "9", "9:30", "18:00", "6pm", "9 am". Null when the word is not a time. */
function timeAt(toks: Tok[], k: number): { hhmm: string; next: number; marked: boolean } | null {
  const t = toks[k]
  if (!t || t.punct) return null
  const m = /^(\d{1,2})(?::(\d{2}))?(am|pm)?$/.exec(t.low)
  if (!m) return null
  let h = Number(m[1])
  const min = m[2] ? Number(m[2]) : 0
  let ampm = m[3]
  let next = k + 1
  if (!ampm && toks[next] && !toks[next].punct && (toks[next].low === 'am' || toks[next].low === 'pm')) {
    ampm = toks[next].low
    next += 1
  }
  if (ampm) {
    if (h < 1 || h > 12) return null
    if (ampm === 'pm' && h !== 12) h += 12
    if (ampm === 'am' && h === 12) h = 0
  }
  if (h > 23 || min > 59) return null
  return { hhmm: `${pad(h)}:${pad(min)}`, next, marked: !!ampm || !!m[2] }
}

const dayOf = (low: string): string | null => DAYS.find((d) => d.toLowerCase() === low) ?? W.DAY_SHORT[low] ?? null

/* The patterns no table can hold: a window, a risk number, a run of days. */
function special(toks: Tok[], i: number): Omit<Item, 'clause'> | null {
  const t = toks[i]
  const at = (k: number) => (toks[k] && !toks[k].punct ? toks[k].low : '')
  const make = (j: number, extra: Partial<Item>): Omit<Item, 'clause'> => ({ kind: 'stop', i, j, start: t.start, end: toks[j - 1].end, ids: [], ...extra })

  if (t.low === 'between' || t.low === 'from') {
    const a = timeAt(toks, i + 1)
    const joiner = a ? at(a.next) : ''
    const ok = t.low === 'between' ? ['and', 'to', '-', 'until'].includes(joiner) : ['to', 'until', '-'].includes(joiner)
    if (a && ok) {
      const b = timeAt(toks, a.next + 1)
      if (b && (t.low === 'between' || a.marked || b.marked)) return make(b.next, { kind: 'time', time: { from: a.hhmm, to: b.hhmm } })
    }
  }

  /* "risk above 70", "device risk score is over 60". */
  let k = i
  if (at(k) === 'device' && at(k + 1) === 'risk') k += 1
  if (at(k) === 'risk') {
    let q = k + 1
    if (at(q) === 'score') q += 1
    if (at(q) === 'is') q += 1
    const op = at(q)
    const dir = op === 'above' || op === 'over' ? 'above' : op === 'below' || op === 'under' ? 'below' : null
    const n = Number(at(q + 1))
    if (dir && /^\d{1,3}$/.test(at(q + 1)) && n <= 100) return make(q + 2, { kind: 'risk-num', num: { op: dir, n } })
  }

  const d = dayOf(t.low)
  if (d) {
    const joiner = at(i + 1)
    const e = ['to', 'through', 'until', '-'].includes(joiner) ? dayOf(at(i + 2)) : null
    if (e) {
      const a = DAYS.indexOf(d)
      const b = DAYS.indexOf(e)
      const run = a <= b ? DAYS.slice(a, b + 1) : [...DAYS.slice(a), ...DAYS.slice(0, b + 1)]
      return make(i + 3, { kind: 'days', ids: [...run] })
    }
    return make(i + 1, { kind: 'days', ids: [d] })
  }
  return null
}

function lookup(toks: Tok[], i: number, dict: Dictionary): Omit<Item, 'clause'> | null {
  for (const e of dict.entries.get(toks[i].low) ?? []) {
    const n = e.words.length
    let ok = true
    for (let q = 0; q < n; q++) {
      const t = toks[i + q]
      if (!t || t.punct || t.low !== e.words[q]) {
        ok = false
        break
      }
      if (e.upper && (t.text !== t.text.toUpperCase() || !/[A-Z]/.test(t.text))) {
        ok = false
        break
      }
    }
    if (ok) return { kind: e.kind, i, j: i + n, start: toks[i].start, end: toks[i + n - 1].end, ids: e.ids, value: e.value, scope: e.scope }
  }
  return null
}

// --- Reading ----------------------------------------------------------------------------

const QUOTE = /"([^"]*)"|“([^”]*)”/g

const EMPTY_WHO: RuleWho = { groupIds: [], userIds: [] }

/** Nothing said yet: every answer at its default, Sign-in and the last row not set. */
export function emptyAnswers(): DescribeAnswers {
  return {
    apps: { value: null, origin: 'unset', spans: [] },
    who: { value: 'everyone', origin: 'default', spans: [] },
    leaveOut: { value: EMPTY_WHO, origin: 'default', spans: [] },
    where: { value: { mode: 'anywhere' }, origin: 'default', spans: [] },
    when: { value: { mode: 'any' }, origin: 'default', spans: [] },
    devices: { value: { mode: 'any' }, origin: 'default', spans: [] },
    risk: { value: { mode: 'any' }, origin: 'default', spans: [] },
    signIn: {},
    more: [],
    fallback: { value: null, origin: 'unset', spans: [] },
    only: null,
    everyoneElse: null,
    order: null,
    scopeSaid: false,
  }
}

const OUTCOME_KINDS = new Set<Item['kind']>(['deny', 'factor1', 'factor2', 'method', 'method-choice'])

/** Read a sentence against this tenant. Nothing is guessed: see the note at the top. */
export function readText(text: string, dict: Dictionary): Reading {
  const t = dict.tenant
  const span = (start: number, end: number): Span => ({ start, end, phrase: text.slice(start, end) })

  /* Quoted words are a message, never words to read. Blanked to spaces so
     every offset still points into the text as typed. */
  const quotes: { start: number; end: number; inner: string }[] = []
  let masked = text
  for (const m of text.matchAll(QUOTE)) {
    const start = m.index ?? 0
    const end = start + m[0].length
    quotes.push({ start, end, inner: (m[1] ?? m[2] ?? '').trim() })
    masked = masked.slice(0, start) + ' '.repeat(end - start) + masked.slice(end)
  }
  const toks = tokenize(masked)

  /* One pass, longest match at each word. */
  const raw: Omit<Item, 'clause'>[] = []
  const unread: number[] = []
  for (let i = 0; i < toks.length; ) {
    if (toks[i].punct) {
      i += 1
      continue
    }
    const m = special(toks, i) ?? lookup(toks, i, dict)
    if (m) {
      raw.push(m)
      i = m.j
    } else {
      unread.push(i)
      i += 1
    }
  }

  /* Clauses: cut at . ; and : — and at a comma only when both sides carry an
     outcome, so "Sales, Finance and Vikram Nair use…" stays one clause and
     "password at low risk, deny at high risk" is two. */
  const hard: [number, number][] = []
  let from = 0
  toks.forEach((tk, k) => {
    if (tk.punct && tk.text !== ',') {
      hard.push([from, k])
      from = k + 1
    }
  })
  hard.push([from, toks.length])
  const outcomeIn = (a: number, b: number) => raw.some((it) => it.i >= a && it.i < b && OUTCOME_KINDS.has(it.kind))
  const ranges: [number, number][] = []
  for (const [a, b] of hard) {
    const pieces: [number, number][] = []
    let p = a
    for (let k = a; k < b; k++) {
      if (toks[k].text === ',') {
        pieces.push([p, k])
        p = k + 1
      }
    }
    pieces.push([p, b])
    let cur: [number, number] | null = null
    for (const piece of pieces) {
      if (!cur) cur = piece
      else if (outcomeIn(cur[0], cur[1]) && outcomeIn(piece[0], piece[1])) {
        ranges.push(cur)
        cur = piece
      } else cur = [cur[0], piece[1]]
    }
    if (cur) ranges.push(cur)
  }
  const clauseRanges = ranges.filter(([a, b]) => toks.slice(a, b).some((tk) => !tk.punct))
  const clauseAt = (k: number) => clauseRanges.findIndex(([a, b]) => k >= a && k < b)
  const items: Item[] = raw.map((it) => ({ ...it, clause: clauseAt(it.i) }))
  const clauseSpan = (ci: number): Span => {
    const [a, b] = clauseRanges[ci]
    const words = toks.slice(a, b).filter((tk) => !tk.punct)
    return span(words[0].start, words[words.length - 1].end)
  }
  const inClause = (ci: number) => items.filter((it) => it.clause === ci)
  const has = (ci: number, ...kinds: Item['kind'][]) => inClause(ci).some((it) => kinds.includes(it.kind))
  const hasOutcome = (ci: number) => inClause(ci).some((it) => OUTCOME_KINDS.has(it.kind))
  const isRest = (ci: number) => has(ci, 'rest', 'complement')

  const choices: Choice[] = []
  const notAdded: NotAdded[] = []

  /* The structure word immediately before an item, over stop words. */
  const before = (it: Item): Item | null => {
    const idx = items.indexOf(it)
    let edge = it.i
    for (let q = idx - 1; q >= 0; q--) {
      const p = items[q]
      if (p.clause !== it.clause || p.j !== edge) return null
      if (p.kind === 'stop') {
        edge = p.i
        continue
      }
      return p
    }
    return null
  }
  const polarity = (it: Item): 'in' | 'not' | 'none' => {
    const b = before(it)
    if (!b) return 'none'
    if (b.kind === 'not-where' || b.kind === 'not-on') return 'not'
    if (b.kind === 'where' || b.kind === 'on') return 'in'
    return 'none'
  }
  /* A phrase with its lead-in: "only from a corporate office", "outside the US". */
  const withLead = (it: Item, kinds: Item['kind'][], andOnly = false): Span => {
    let start = it.start
    const b = before(it)
    if (b && kinds.includes(b.kind)) {
      start = b.start
      if (andOnly) {
        const o = before(b)
        if (o && o.kind === 'only') start = o.start
      }
    } else {
      const idx = items.indexOf(it)
      const prev = items[idx - 1]
      if (prev && prev.kind === 'stop' && prev.j === it.i && prev.clause === it.clause && ['a', 'an', 'the'].includes(toks[prev.i].low)) start = prev.start
    }
    return span(start, it.end)
  }

  // --- Roles ------------------------------------------------------------------------

  const clauseCount = clauseRanges.length
  const roles: ClauseRole[] = Array.from({ length: clauseCount }, () => 'lead')
  const branchOf: (BranchId | null)[] = Array.from({ length: clauseCount }, () => null)

  /* A split: "in the office" in one clause with an outcome, "elsewhere" (or a
     bare "outside") in another. */
  const zoneLike = (it: Item) => it.kind === 'zone' || it.kind === 'place'
  const bareOutside = (it: Item) => it.kind === 'not-where' && !items.some((x) => x.clause === it.clause && zoneLike(x) && x.i >= it.j && before(x) === it)
  let insideC = -1
  let outsideC = -1
  let splitZone: Item | null = null
  for (let ci = 0; ci < clauseCount; ci++) {
    if (isRest(ci) || !hasOutcome(ci)) continue
    const els = inClause(ci).find((it) => it.kind === 'elsewhere' || bareOutside(it))
    if (els && outsideC < 0) {
      outsideC = ci
      continue
    }
    const z = inClause(ci).find((it) => it.kind === 'zone' && polarity(it) === 'in')
    if (z && insideC < 0) {
      insideC = ci
      splitZone = z
    }
  }
  let split = insideC >= 0 && outsideC >= 0

  /* Bands: all three said, each in a clause with an outcome. */
  const bandItems = items.filter((it) => it.kind === 'band' && !isRest(it.clause))
  const levels = new Set(bandItems.map((b) => b.value))
  let bands = levels.size === 3 && bandItems.every((b) => hasOutcome(b.clause))

  if (split && bands) {
    const splitFirst = Math.min(insideC, outsideC) < Math.min(...bandItems.map((b) => b.clause))
    const dropped = splitFirst ? [...new Set(bandItems.map((b) => b.clause))] : [insideC, outsideC]
    for (const ci of dropped) {
      roles[ci] = 'dropped'
      notAdded.push({ span: clauseSpan(ci), reason: REASON.split })
    }
    if (splitFirst) bands = false
    else split = false
  }
  if (split) {
    roles[insideC] = 'branch'
    roles[outsideC] = 'branch'
    branchOf[insideC] = 'inside'
    branchOf[outsideC] = 'outside'
  }
  if (bands) {
    for (const b of bandItems) {
      if (branchOf[b.clause]) continue
      roles[b.clause] = 'branch'
      branchOf[b.clause] = b.value as BranchId
    }
  }
  for (let ci = 0; ci < clauseCount; ci++) {
    if (roles[ci] !== 'lead') continue
    if (isRest(ci)) roles[ci] = 'rest'
    else if (hasOutcome(ci)) roles[ci] = 'plain'
  }
  const dropped = (it: Item) => roles[it.clause] === 'dropped'

  // --- Who --------------------------------------------------------------------------

  /* The people after "except" are left out, not named. */
  const exceptRun = new Set<Item>()
  for (const ex of items.filter((it) => it.kind === 'except')) {
    let edge = ex.j
    for (let q = items.indexOf(ex) + 1; q < items.length; q++) {
      const p = items[q]
      const gapIsComma = toks.slice(edge, p.i).every((tk) => tk.text === ',')
      if (p.clause !== ex.clause || !gapIsComma) break
      if (p.kind === 'group' || p.kind === 'person') exceptRun.add(p)
      else if (p.kind !== 'stop') break
      edge = p.j
    }
  }

  const whoItems = items.filter((it) => (it.kind === 'group' || it.kind === 'person' || it.kind === 'employee' || it.kind === 'everyone') && roles[it.clause] !== 'rest' && !dropped(it) && !exceptRun.has(it))
  const who: RuleWho = { groupIds: [], userIds: [] }
  let whoPending = false
  let everyoneSaid = false
  for (const it of whoItems) {
    if (it.kind === 'everyone') everyoneSaid = true
    else if (it.kind === 'group') {
      if (!who.groupIds.includes(it.ids[0])) who.groupIds.push(it.ids[0])
    } else if (it.kind === 'person' && it.ids.length === 1) {
      if (!who.userIds.includes(it.ids[0])) who.userIds.push(it.ids[0])
    } else if (it.kind === 'person') {
      whoPending = true
      choices.push({
        id: `who:${it.start}`,
        slot: 'who',
        span: span(it.start, it.end),
        options: it.ids.map((id) => {
          const u = t.users.find((x) => x.id === id)
          return { value: `user:${id}`, label: u?.name ?? id, meta: t.groups.find((g) => g.id === u?.groupId)?.name }
        }),
        picked: null,
        target: 'match',
      })
    } else if (it.kind === 'employee') {
      whoPending = true
      choices.push({
        id: `who:${it.start}`,
        slot: 'who',
        span: span(it.start, it.end),
        options: [
          { value: `group:${it.ids[0]}`, label: t.groups.find((g) => g.id === it.ids[0])?.name ?? 'Employees', meta: 'Group' },
          { value: 'everyone', label: 'Everyone', meta: 'Every user' },
        ],
        picked: null,
        target: 'match',
      })
    }
  }
  const named = who.groupIds.length + who.userIds.length > 0
  const whoSpans = whoItems.map((it) => span(it.start, it.end))
  const whoAnswer: Answer<RuleWho | 'everyone'> = whoPending
    ? { value: named ? who : null, origin: 'unset', spans: whoSpans }
    : named
      ? { value: who, origin: 'text', spans: whoSpans }
      : { value: 'everyone', origin: everyoneSaid ? 'text' : 'default', spans: whoSpans }

  const leave: RuleWho = { groupIds: [], userIds: [] }
  for (const it of exceptRun) {
    if (it.kind === 'group' && !leave.groupIds.includes(it.ids[0])) leave.groupIds.push(it.ids[0])
    if (it.kind === 'person' && !leave.userIds.includes(it.ids[0])) leave.userIds.push(it.ids[0])
  }
  const leaveAnswer: Answer<RuleWho> =
    exceptRun.size > 0 ? { value: leave, origin: 'text', spans: [...exceptRun].map((it) => span(it.start, it.end)) } : { value: EMPTY_WHO, origin: 'default', spans: [] }

  // --- Applications -------------------------------------------------------------------

  const order = new Map(t.apps.map((a, i) => [a.id, i]))
  const appItems = items.filter((it) => it.kind === 'app' && !dropped(it))
  const appIds = [...new Set(appItems.map((it) => it.ids[0]))].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0))
  for (const it of items.filter((x) => x.kind === 'category' && !dropped(x))) {
    const phrase = withLead(it, [])
    choices.push({
      id: `apps:${it.start}`,
      slot: 'apps',
      span: phrase,
      options: [...it.ids.map((id) => ({ value: id, label: t.apps.find((a) => a.id === id)?.name ?? id })), { value: '*', label: 'Another application' }],
      picked: null,
      target: 'match',
    })
  }
  const appsAnswer: Answer<string[]> =
    appIds.length > 0 ? { value: appIds, origin: 'text', spans: appItems.map((it) => span(it.start, it.end)) } : { value: null, origin: 'unset', spans: [] }

  // --- Outcomes ---------------------------------------------------------------------------

  const consumedOnly = new Set<Item>()
  const quoteIn = (ci: number): string | null => {
    const [a, b] = clauseRanges[ci]
    const lo = toks[a]?.start ?? 0
    const hi = b < toks.length ? toks[b].start : text.length + 1
    return quotes.find((q) => q.start >= lo && q.start < hi)?.inner || null
  }
  const methodActive = (name: string) => {
    const m = t.methods.find((x) => x.name === name)
    return !m || m.active
  }

  const outcomeOf = (ci: number, target: ChoiceTarget, branch: BranchId | 'fallback' | null): Answer<Outcome> => {
    const its = inClause(ci)
    const deny = its.find((it) => it.kind === 'deny')
    const methods = its.filter((it) => it.kind === 'method')
    const f2 = its.find((it) => it.kind === 'factor2')
    const f1 = its.find((it) => it.kind === 'factor1')
    const mc = its.find((it) => it.kind === 'method-choice')
    const allow = its.find((it) => it.kind === 'allow')
    const sp = (...xs: (Item | undefined)[]) => xs.filter((x): x is Item => !!x).map((x) => span(x.start, x.end))
    if (deny) return { value: { decision: 'deny', method: null, message: quoteIn(ci) }, origin: 'text', spans: sp(deny) }
    if (methods.length > 0) {
      const m = methods[0]
      for (const extra of methods.slice(1)) notAdded.push({ span: span(extra.start, extra.end), reason: REASON.oneMethod })
      const name = m.value ?? ''
      if (!methodActive(name)) {
        notAdded.push({ span: span(m.start, m.end), reason: REASON.off(name), action: 'auth-methods' })
        return { value: { decision: '2fa', method: null, message: null }, origin: 'default', spans: [] }
      }
      const next = items[items.indexOf(m) + 1]
      if (next && next.kind === 'only' && next.i === m.j && next.clause === m.clause) {
        consumedOnly.add(next)
        return { value: { decision: '1fa', method: name, message: null }, origin: 'text', spans: [span(m.start, next.end)] }
      }
      return { value: { decision: '2fa', method: name, message: null }, origin: 'text', spans: sp(m) }
    }
    if (mc) {
      const opts = mc.ids.filter((m) => methodActive(m))
      if (opts.length === 1) return { value: { decision: '2fa', method: opts[0], message: null }, origin: 'text', spans: sp(mc) }
      if (opts.length > 1) {
        choices.push({
          id: `method:${mc.start}`,
          slot: 'signIn',
          span: span(mc.start, mc.end),
          options: opts.map((m) => ({ value: m, label: m })),
          picked: null,
          target,
          branch: branch ?? undefined,
        })
        return { value: null, origin: 'unset', spans: sp(mc) }
      }
    }
    if (f2) return { value: { decision: '2fa', method: null, message: null }, origin: 'text', spans: sp(f2) }
    if (f1) return { value: { decision: '1fa', method: null, message: null }, origin: 'text', spans: sp(f1) }
    if (allow) return { value: { decision: '1fa', method: null, message: null }, origin: 'default', spans: [] }
    return { value: null, origin: 'unset', spans: [] }
  }

  // --- Conditions ----------------------------------------------------------------------------

  const zoneById = (id: string) => t.zones.find((z) => z.id === id)
  const zonesHolding = (p: Place): Zone[] =>
    t.zones.filter((z) => {
      const loc = z.location
      if (p.kind === 'country') return loc.countries.some((c) => c.toLowerCase() === p.name.toLowerCase())
      return loc.cities.some((c) => c.toLowerCase() === p.name.toLowerCase()) || loc.ranges.some((r) => r.placeId === p.id || r.label.toLowerCase() === p.name.toLowerCase())
    })

  interface Conds {
    where: Answer<WhereAnswer>
    devices: Answer<DeviceAnswer>
    risk: Answer<RiskAnswer>
    when: Answer<WhenAnswer>
    scopeSaid: boolean
  }
  const condsOf = (cis: number[], target: ChoiceTarget): Conds => {
    const its = items.filter((it) => cis.includes(it.clause) && !(split && it === splitZone))
    const out: Conds = {
      where: { value: { mode: 'anywhere' }, origin: 'default', spans: [] },
      devices: { value: { mode: 'any' }, origin: 'default', spans: [] },
      risk: { value: { mode: 'any' }, origin: 'default', spans: [] },
      when: { value: { mode: 'any' }, origin: 'default', spans: [] },
      scopeSaid: false,
    }
    const scopeItem = its.find((it) => it.kind === 'scope')

    /* Where. The first zone or place said; a second is set aside. */
    let whereTaken = false
    for (const it of its.filter((x) => x.kind === 'zone' || x.kind === 'place')) {
      const pol = polarity(it)
      const mode: 'only' | 'not' = pol === 'not' ? 'not' : 'only'
      const phrase = withLead(it, ['where', 'not-where', 'on'], true)
      if (whereTaken) {
        notAdded.push({ span: phrase, reason: REASON.oneZone })
        continue
      }
      if (it.kind === 'zone') {
        whereTaken = true
        const scope: ZoneScope = it.scope ?? (scopeItem?.value as ZoneScope | undefined) ?? 'both'
        out.scopeSaid = !!it.scope || !!scopeItem
        if (it.ids.length === 1) {
          out.where = { value: { mode, zoneId: it.ids[0], scope }, origin: 'text', spans: [phrase] }
        } else {
          out.where = { value: null, origin: 'unset', spans: [phrase] }
          choices.push({
            id: `where:${it.start}`,
            slot: 'where',
            span: phrase,
            options: it.ids.map((id) => ({ value: id, label: zoneById(id)?.name ?? id, meta: zoneCities(zoneById(id)) })),
            picked: null,
            target,
            mode,
          })
        }
        continue
      }
      const place = PLACES.find((p) => p.id === it.ids[0])
      if (!place) continue
      const holders = zonesHolding(place)
      const reason = REASON.noZone(place.name)
      if (holders.length === 0) {
        notAdded.push({ span: phrase, reason, action: 'create-zone' })
        continue
      }
      whereTaken = true
      out.where = { value: null, origin: 'unset', spans: [phrase] }
      choices.push({
        id: `where:${it.start}`,
        slot: 'where',
        span: phrase,
        options: [...holders.map((z) => ({ value: z.id, label: z.name, meta: zoneCities(z) })), { value: '-', label: "Don't add" }],
        picked: null,
        notAddedReason: reason,
        notAddedAction: 'create-zone',
        target,
        mode,
      })
    }

    /* Devices. */
    const prof = its.find((x) => x.kind === 'profile')
    const devChoice = its.find((x) => x.kind === 'device-choice')
    const unmanaged = its.find((x) => x.kind === 'unmanaged')
    if (prof) {
      const phrase = withLead(prof, ['on', 'not-on', 'not-where', 'where'])
      out.devices = { value: { mode: polarity(prof) === 'not' ? 'not' : 'only', profileId: prof.ids[0] }, origin: 'text', spans: [phrase] }
    } else if (devChoice) {
      const phrase = withLead(devChoice, ['on'])
      if (devChoice.ids.length === 1) out.devices = { value: { mode: 'only', profileId: devChoice.ids[0] }, origin: 'text', spans: [phrase] }
      else {
        out.devices = { value: null, origin: 'unset', spans: [phrase] }
        choices.push({
          id: `devices:${devChoice.start}`,
          slot: 'devices',
          span: span(devChoice.start, devChoice.end),
          options: devChoice.ids.map((id) => {
            const p = t.fingerprints.find((f) => f.id === id)
            return { value: id, label: p?.name ?? id, meta: p?.mode === 'device' ? 'Trusted device' : 'Device health' }
          }),
          picked: null,
          target,
          mode: 'only',
        })
      }
    } else if (unmanaged) {
      const phrase = span(unmanaged.start, unmanaged.end)
      out.devices = { value: null, origin: 'unset', spans: [phrase] }
      choices.push({
        id: `devices:${unmanaged.start}`,
        slot: 'devices',
        span: phrase,
        options: [
          ...unmanaged.ids.map((id) => {
            const name = t.fingerprints.find((f) => f.id === id)?.name ?? id
            return { value: `not:${id}`, label: `Not ${name}`, meta: `Device does not match ${name}` }
          }),
          { value: '-', label: "Don't add", meta: REASON.noMdm },
        ],
        picked: null,
        notAddedReason: REASON.noMdm,
        target,
        mode: 'not',
      })
    }
    for (const it of its.filter((x) => x.kind === 'device-type')) notAdded.push({ span: span(it.start, it.end), reason: REASON.deviceType, action: 'device-profiles' })

    /* Risk: a number said outright, or a band word asked about. */
    const num = its.find((x) => x.kind === 'risk-num')
    const band = bands ? undefined : its.find((x) => x.kind === 'band')
    if (num?.num) out.risk = { value: { mode: num.num.op, score: num.num.n }, origin: 'text', spans: [span(num.start, num.end)] }
    else if (band) {
      const { mediumFrom, highAbove } = dict.cutoffs
      const phrase = span(band.start, band.end)
      out.risk = { value: null, origin: 'unset', spans: [phrase] }
      choices.push({
        id: `risk:${band.start}`,
        slot: 'risk',
        span: phrase,
        options:
          band.value === 'low'
            ? [
                { value: `below:${mediumFrom}`, label: `Below ${mediumFrom}`, meta: "Low in this tenant's bands" },
                { value: `below:${highAbove + 1}`, label: `Below ${highAbove + 1}`, meta: 'Low and medium' },
              ]
            : [
                { value: `above:${highAbove}`, label: `Above ${highAbove}`, meta: "High in this tenant's bands" },
                { value: `above:${mediumFrom - 1}`, label: `Above ${mediumFrom - 1}`, meta: 'Medium and high' },
              ],
        picked: null,
        target,
      })
    }

    /* When. */
    const win = its.find((x) => x.kind === 'time')
    const dayItems = its.filter((x) => x.kind === 'days')
    const days = DAYS.filter((d) => dayItems.some((x) => x.ids.includes(d)))
    const tz = its.find((x) => x.kind === 'tz')
    const spans = [win, ...dayItems, tz].filter((x): x is Item => !!x).map((x) => span(x.start, x.end))
    if (win?.time) out.when = { value: { mode: 'between', from: win.time.from, to: win.time.to, days, timeZone: tz?.value ?? TENANT_TIME_ZONE }, origin: 'text', spans }
    else if (days.length > 0) out.when = { value: { mode: 'days', days }, origin: 'text', spans }
    for (const it of its.filter((x) => x.kind === 'hours')) notAdded.push({ span: span(it.start, it.end), reason: REASON.hours })
    return out
  }

  // --- Assembly ------------------------------------------------------------------------------

  const answers = emptyAnswers()
  answers.apps = appsAnswer
  answers.who = whoAnswer
  answers.leaveOut = leaveAnswer

  const all = Array.from({ length: clauseCount }, (_, ci) => ci)
  const leads = all.filter((ci) => roles[ci] === 'lead')
  const plains = all.filter((ci) => roles[ci] === 'plain')
  const branches = all.filter((ci) => roles[ci] === 'branch')
  const rests = all.filter((ci) => roles[ci] === 'rest')

  let matchCis: number[]
  let moreCis: number[] = []
  if (branches.length > 0) {
    matchCis = [...leads, ...branches]
    moreCis = plains
    for (const ci of branches) answers.signIn[branchOf[ci] as BranchId] = outcomeWithClause(outcomeOf(ci, 'match', branchOf[ci]), clauseSpan(ci))
  } else if (plains.length > 0) {
    matchCis = [...leads, plains[0]]
    moreCis = plains.slice(1)
    answers.signIn.match = outcomeOf(plains[0], 'match', 'match')
  } else {
    /* No outcome said at all. A verb that lets people in — "reach", "use",
       "access" — with nothing else is on 1 factor, the password, as a default
       the admin can see and change (describe spec, §4.3). Without one, nothing
       was asked for: Sign-in stays not set, and no rule is written for it. */
    matchCis = leads
    if (leads.some((ci) => has(ci, 'allow'))) answers.signIn.match = { value: { decision: '1fa', method: null, message: null }, origin: 'default', spans: [] }
  }

  const shared = condsOf(matchCis, 'match')
  answers.where = shared.where
  answers.devices = shared.devices
  answers.risk = shared.risk
  answers.when = shared.when
  answers.scopeSaid = shared.scopeSaid
  if (split && splitZone) {
    const z = splitZone
    const scopeItem = items.find((it) => it.kind === 'scope' && matchCis.includes(it.clause))
    const scope: ZoneScope = z.scope ?? (scopeItem?.value as ZoneScope | undefined) ?? 'both'
    const elseItem = inClause(outsideC).find((it) => it.kind === 'elsewhere' || bareOutside(it))
    const spans = [withLead(z, ['where']), ...(elseItem ? [span(elseItem.start, elseItem.end)] : [])]
    answers.scopeSaid = !!z.scope || !!scopeItem
    if (z.ids.length === 1) answers.where = { value: { mode: 'split', zoneId: z.ids[0], scope }, origin: 'text', spans }
    else {
      answers.where = { value: null, origin: 'unset', spans }
      choices.push({
        id: `where:${z.start}`,
        slot: 'where',
        span: withLead(z, ['where']),
        options: z.ids.map((id) => ({ value: id, label: zoneById(id)?.name ?? id, meta: zoneCities(zoneById(id)) })),
        picked: null,
        target: 'match',
        mode: 'split',
      })
    }
  }
  if (bands) {
    const spans = bandItems.map((b) => span(b.start, b.end))
    answers.risk = { value: { mode: 'bands', ...dict.cutoffs }, origin: dict.cutoffsSaid ? 'text' : 'unset', spans }
  }

  answers.more = moreCis.map((ci, k) => {
    const c = condsOf([ci], `more:${k}`)
    return { where: c.where, devices: c.devices, risk: c.risk, when: c.when, outcome: outcomeOf(ci, `more:${k}`, null), span: clauseSpan(ci) }
  })

  /* The last row: a clause for everything else, or "only". */
  const onlyItem = items.find((it) => it.kind === 'only' && !consumedOnly.has(it) && roles[it.clause] !== 'rest' && !dropped(it))
  answers.only = onlyItem ? span(onlyItem.start, onlyItem.end) : null
  const complement = items.find((it) => it.kind === 'complement')
  answers.everyoneElse = complement ? span(complement.start, complement.end) : null
  const rest = rests[0]
  if (rest !== undefined) {
    const o = outcomeOf(rest, 'match', 'fallback')
    answers.fallback = o.value === null && o.origin !== 'unset' ? { value: null, origin: 'unset', spans: [] } : { ...o, spans: o.origin === 'text' ? [clauseSpan(rest)] : o.spans }
  } else if (onlyItem) {
    answers.fallback = { value: { decision: 'deny', method: null, message: null }, origin: 'text', spans: [span(onlyItem.start, onlyItem.end)] }
  }
  /* A message said with no refusal in its own clause goes to the last row's. */
  if (answers.fallback.value?.decision === 'deny' && answers.fallback.value.message === null) {
    const loose = quotes.find((q) => {
      const ci = clauseRanges.findIndex(([a, b]) => q.start >= (toks[a]?.start ?? 0) && q.start < (b < toks.length ? toks[b].start : text.length + 1))
      return q.inner && (ci < 0 || !inClause(ci).some((it) => it.kind === 'deny'))
    })
    if (loose) answers.fallback = { ...answers.fallback, value: { ...answers.fallback.value, message: loose.inner } }
  }

  /* Two rules one sign-in can both meet, with different outcomes: which first. */
  const firstRule: RuleView | null = answers.signIn.match?.value && branchesOf(answers)[0] === 'match' ? { ...viewOf(answers), outcome: answers.signIn.match.value } : null
  if (firstRule) {
    for (let k = 0; k < answers.more.length; k++) {
      const m = answers.more[k]
      if (!m.outcome.value || sameOutcome(m.outcome.value, firstRule.outcome) || !overlaps(firstRule, moreView(m))) continue
      answers.order = { value: null, origin: 'unset', spans: [m.span] }
      choices.push({
        id: `order:${k}`,
        slot: 'order',
        span: m.span,
        options: [
          { value: String(k + 1), label: outcomeWords(m.outcome.value) },
          { value: '0', label: outcomeWords(firstRule.outcome) },
        ],
        picked: null,
        target: 'match',
        detail: bothSignIn(answers, firstRule, moreView(m), t),
      })
      break
    }
  }

  /* Anything left over is said, with why. */
  let run: number[] = []
  const flush = () => {
    if (run.length > 0) notAdded.push({ span: span(toks[run[0]].start, toks[run[run.length - 1]].end), reason: REASON.unread })
    run = []
  }
  for (const k of unread) {
    if (run.length > 0 && k !== run[run.length - 1] + 1) flush()
    run.push(k)
  }
  flush()
  notAdded.sort((a, b) => a.span.start - b.span.start)
  /* A place with no zone, and the word that names what it is — "the Berlin
     branch" — are one phrase not added, not a place and a stray word. */
  for (let k = notAdded.length - 2; k >= 0; k--) {
    const place = notAdded[k]
    const next = notAdded[k + 1]
    if (place.action !== 'create-zone' || next.reason !== REASON.unread || !PLACE_NOUNS.has(next.span.phrase.toLowerCase())) continue
    if (text.slice(place.span.end, next.span.start).trim() !== '') continue
    notAdded.splice(k, 2, { ...place, span: span(place.span.start, next.span.end) })
  }

  const clauses: Clause[] = clauseRanges.map((_, ci) => ({ ...clauseSpan(ci), text: clauseSpan(ci).phrase, role: roles[ci] }))
  return { text, answers, choices, notAdded, clauses }
}

/* What a place is called after its name: "the Berlin branch", "the Pune campus". */
const PLACE_NOUNS = new Set(['branch', 'branches', 'office', 'offices', 'campus', 'site', 'sites', 'hq', 'headquarters', 'centre', 'center', 'building', 'location'])

/* A branch clause's outcome keeps the whole clause as its words, so the card
   it writes reads "password in the office" rather than "password". */
function outcomeWithClause(o: Answer<Outcome>, clause: Span): Answer<Outcome> {
  return o.origin === 'text' ? { ...o, spans: [clause] } : o
}

function zoneCities(z: Zone | undefined): string | undefined {
  if (!z) return undefined
  const names = [...z.location.cities, ...z.location.ranges.map((r) => r.label), ...z.location.countries]
  return names.length > 0 ? names.join(', ') : undefined
}

// --- Choices ------------------------------------------------------------------------------

/** The reading with one choice answered. "Don't add" moves the phrase to Not added. */
export function applyChoice(r: Reading, choiceId: string, value: string, dict: Dictionary): Reading {
  const c = r.choices.find((x) => x.id === choiceId)
  if (!c) return r
  const t = dict.tenant
  const choices = r.choices.map((x) => (x.id === choiceId ? { ...x, picked: value } : x))
  const a: DescribeAnswers = { ...r.answers, signIn: { ...r.answers.signIn }, more: [...r.answers.more] }
  let notAdded = r.notAdded
  const refuse = () => {
    notAdded = [...notAdded, { span: c.span, reason: c.notAddedReason ?? REASON.unread, action: c.notAddedAction }].sort((x, y) => x.span.start - y.span.start)
  }
  const stillOpen = (slot: Choice['slot'], target: ChoiceTarget) => choices.some((x) => x.slot === slot && x.target === target && x.picked === null)
  const moreAt = c.target.startsWith('more:') ? Number(c.target.slice(5)) : -1
  /* Picked, or — for "Don't add" — back to its default, with the words kept for the trace. */
  const answer = <T>(prev: Answer<T>, v: T | null, none: T): Answer<T> => (v === null ? { value: none, origin: 'default', spans: [] } : { value: v, origin: 'picked', spans: prev.spans })
  const setWhere = (v: WhereAnswer | null) => {
    if (moreAt >= 0) a.more[moreAt] = { ...a.more[moreAt], where: answer(a.more[moreAt].where, v, { mode: 'anywhere' }) }
    else a.where = answer(a.where, v, { mode: 'anywhere' })
  }
  const setDevices = (v: DeviceAnswer | null) => {
    if (moreAt >= 0) a.more[moreAt] = { ...a.more[moreAt], devices: answer(a.more[moreAt].devices, v, { mode: 'any' }) }
    else a.devices = answer(a.devices, v, { mode: 'any' })
  }
  const setRisk = (v: RiskAnswer) => {
    if (moreAt >= 0) a.more[moreAt] = { ...a.more[moreAt], risk: answer(a.more[moreAt].risk, v, { mode: 'any' }) }
    else a.risk = answer(a.risk, v, { mode: 'any' })
  }

  switch (c.slot) {
    case 'apps': {
      if (value !== '*') {
        /* A default is the policy's own list, shown until the text says
           otherwise; a picked category says otherwise, as a named app would. */
        const kept = a.apps.origin === 'default' ? [] : (a.apps.value ?? [])
        const ids = [...new Set([...kept, value])]
        const order = new Map(t.apps.map((x, i) => [x.id, i]))
        ids.sort((x, y) => (order.get(x) ?? 0) - (order.get(y) ?? 0))
        a.apps = { value: ids, origin: a.apps.origin === 'text' ? 'text' : 'picked', spans: [...a.apps.spans, c.span] }
      }
      break
    }
    case 'who': {
      const base: RuleWho = a.who.value && a.who.value !== 'everyone' ? { groupIds: [...a.who.value.groupIds], userIds: [...a.who.value.userIds] } : { groupIds: [], userIds: [] }
      if (value.startsWith('user:')) base.userIds.push(value.slice(5))
      else if (value.startsWith('group:')) base.groupIds.push(value.slice(6))
      const open = stillOpen('who', 'match')
      const everyone = value === 'everyone' && base.groupIds.length + base.userIds.length === 0
      a.who = open
        ? { value: base, origin: 'unset', spans: a.who.spans }
        : { value: everyone ? 'everyone' : base.groupIds.length + base.userIds.length === 0 ? 'everyone' : base, origin: 'picked', spans: a.who.spans }
      break
    }
    case 'where': {
      if (value === '-') {
        refuse()
        setWhere(null)
      } else setWhere({ mode: c.mode ?? 'only', zoneId: value, scope: 'both' })
      break
    }
    case 'devices': {
      if (value === '-') {
        refuse()
        setDevices(null)
      } else if (value.startsWith('not:')) setDevices({ mode: 'not', profileId: value.slice(4) })
      else setDevices({ mode: 'only', profileId: value })
      break
    }
    case 'risk': {
      const [op, n] = value.split(':')
      setRisk({ mode: op === 'below' ? 'below' : 'above', score: Number(n) })
      break
    }
    case 'signIn': {
      const o: Outcome = { decision: '2fa', method: value, message: null }
      if (moreAt >= 0) a.more[moreAt] = { ...a.more[moreAt], outcome: { value: o, origin: 'picked', spans: a.more[moreAt].outcome.spans } }
      else if (c.branch === 'fallback') a.fallback = { value: o, origin: 'picked', spans: a.fallback.spans }
      else {
        const b = c.branch ?? 'match'
        a.signIn[b] = { value: o, origin: 'picked', spans: a.signIn[b]?.spans ?? [c.span] }
      }
      break
    }
    case 'order': {
      a.order = { value: Number(value), origin: 'picked', spans: a.order?.spans ?? [c.span] }
      break
    }
    default:
      break
  }
  return { ...r, answers: a, choices, notAdded }
}

/** Choices still waiting for an answer. */
export const openChoices = (r: Reading): Choice[] => r.choices.filter((c) => c.picked === null)

// --- Branches ---------------------------------------------------------------------------------

/** The Sign-in rows this policy has: one, the two halves of a split, or three risk bands. */
export function branchesOf(a: DescribeAnswers): BranchId[] {
  if (a.where.value?.mode === 'split') return ['inside', 'outside']
  if (a.risk.value?.mode === 'bands') return ['low', 'medium', 'high']
  return ['match']
}

export function branchLabel(b: BranchId, a: DescribeAnswers, t: DescribeTenant): string {
  const zone = a.where.value && a.where.value.mode !== 'anywhere' ? t.zones.find((z) => z.id === (a.where.value as { zoneId: string }).zoneId)?.name : undefined
  switch (b) {
    case 'inside':
      return `In ${zone ?? 'the zone'}`
    case 'outside':
      return 'Elsewhere'
    case 'low':
      return 'Low risk'
    case 'medium':
      return 'Medium risk'
    case 'high':
      return 'High risk'
    default:
      return 'When it matches'
  }
}

// --- Composing ----------------------------------------------------------------------------------

interface RuleView {
  where: WhereAnswer
  devices: DeviceAnswer
  risk: RiskAnswer
  when: WhenAnswer
  outcome: Outcome
}
/* An answer still waiting on its object — a question from the text, or "Only
   from" picked by hand with no zone chosen yet — reads as its default, so the
   part of the draft it feeds is left out until it is answered (describe spec,
   §3.6) and no card ever holds a blank id. */
const settled = <T,>(x: Answer<T>, none: T): T => (x.origin === 'unset' || x.value === null ? none : x.value)
const viewOf = (a: DescribeAnswers): Omit<RuleView, 'outcome'> => ({
  where: settled<WhereAnswer>(a.where, { mode: 'anywhere' }),
  devices: settled<DeviceAnswer>(a.devices, { mode: 'any' }),
  risk: settled<RiskAnswer>(a.risk, { mode: 'any' }),
  when: settled<WhenAnswer>(a.when, { mode: 'any' }),
})
const moreView = (m: ClauseRule): RuleView => ({
  where: settled<WhereAnswer>(m.where, { mode: 'anywhere' }),
  devices: settled<DeviceAnswer>(m.devices, { mode: 'any' }),
  risk: settled<RiskAnswer>(m.risk, { mode: 'any' }),
  when: settled<WhenAnswer>(m.when, { mode: 'any' }),
  outcome: m.outcome.value ?? { decision: '1fa', method: null, message: null },
})
const sameOutcome = (x: Outcome, y: Outcome) => x.decision === y.decision && (x.decision === 'deny' || x.method === y.method)

/* Can one sign-in meet both? Only a condition the other negates keeps them apart. */
function overlaps(x: RuleView, y: RuleView): boolean {
  const zx = x.where.mode === 'only' || x.where.mode === 'not' ? x.where : null
  const zy = y.where.mode === 'only' || y.where.mode === 'not' ? y.where : null
  if (zx && zy && zx.zoneId === zy.zoneId && zx.mode !== zy.mode) return false
  const dx = x.devices.mode === 'any' ? null : x.devices
  const dy = y.devices.mode === 'any' ? null : y.devices
  if (dx && dy && dx.profileId === dy.profileId && dx.mode !== dy.mode) return false
  const range = (r: RiskAnswer): [number, number] => (r.mode === 'above' ? [r.score + 1, 100] : r.mode === 'below' ? [0, r.score - 1] : [0, 100])
  const [a1, a2] = range(x.risk)
  const [b1, b2] = range(y.risk)
  if (a2 < b1 || b2 < a1) return false
  return true
}

const zoneCond = (zoneId: string, scope: ZoneScope, not = false) => cond('zone', not ? 'not in zone' : 'in zone', [zoneId], scope === 'both' ? undefined : scope)

/* Zone, device, risk, time, day: the order every card here is written in. */
function condsFor(v: Omit<RuleView, 'outcome'>, skipZone = false): Condition[] {
  const out: Condition[] = []
  if (!skipZone && (v.where.mode === 'only' || v.where.mode === 'not') && v.where.zoneId) out.push(zoneCond(v.where.zoneId, v.where.scope, v.where.mode === 'not'))
  if (v.devices.mode !== 'any' && v.devices.profileId) out.push(cond('fingerprint', v.devices.mode === 'only' ? 'matches' : 'does not match', [v.devices.profileId]))
  if (v.risk.mode === 'above' || v.risk.mode === 'below') out.push(cond('device-risk', v.risk.mode, [String(v.risk.score)]))
  if (v.when.mode === 'between') out.push(cond('time', 'between', [v.when.from, v.when.to], undefined, { tz: v.when.timeZone }))
  if ((v.when.mode === 'between' || v.when.mode === 'days') && v.when.days.length > 0 && v.when.days.length < 7) out.push(cond('day', 'is', [...v.when.days]))
  return out
}

const outcomeFields = (o: Outcome): Partial<Rule> =>
  o.decision === 'deny'
    ? { decision: 'deny', ...(o.message ? { denyMessage: o.message } : null) }
    : o.decision === '1fa'
      ? o.method
        ? { decision: '1fa', firstFactor: 'Specific', firstFactorMethod: o.method }
        : { decision: '1fa', firstFactor: 'Password' }
      : o.method
        ? { decision: '2fa', firstFactor: 'Password', secondFactor: 'specific', secondFactorMethods: [o.method] }
        : { decision: '2fa', firstFactor: 'Password', secondFactor: 'any' }

/** Who every composed rule applies to: the Who answer, less Leave out. Undefined is everyone. */
export function ruleWhoOf(a: DescribeAnswers): RuleWho | undefined {
  const base = a.who.value && a.who.value !== 'everyone' ? a.who.value : EMPTY_WHO
  const lo = a.leaveOut.value ?? EMPTY_WHO
  return normaliseWho({ groupIds: base.groupIds, userIds: base.userIds, exceptGroupIds: lo.groupIds, exceptUserIds: lo.userIds })
}
const namesWho = (a: DescribeAnswers) => !!a.who.value && a.who.value !== 'everyone' && a.who.value.groupIds.length + a.who.value.userIds.length > 0

/** Who the policy governs: the people named, unless the text kept everyone else. */
export function audienceOfAnswers(a: DescribeAnswers): Audience {
  if (!namesWho(a) || a.everyoneElse || a.who.origin === 'unset') return EVERYONE
  const w = a.who.value as RuleWho
  return audienceOf([...w.groupIds], [...w.userIds])
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

function condWords(v: Omit<RuleView, 'outcome'>, t: DescribeTenant, skipZone = false): string {
  const parts: string[] = []
  const zone = (id: string) => t.zones.find((z) => z.id === id)?.name ?? id
  const profile = (id: string) => t.fingerprints.find((p) => p.id === id)?.name ?? id
  if (!skipZone && v.where.mode === 'only') parts.push(`in ${zone(v.where.zoneId)}`)
  if (!skipZone && v.where.mode === 'not') parts.push(`not in ${zone(v.where.zoneId)}`)
  if (v.devices.mode === 'only') parts.push(profile(v.devices.profileId))
  if (v.devices.mode === 'not') parts.push(`not ${profile(v.devices.profileId)}`)
  if (v.risk.mode === 'above' || v.risk.mode === 'below') parts.push(`risk ${v.risk.mode} ${v.risk.score}`)
  if (v.when.mode === 'between') parts.push(`${v.when.from}–${v.when.to}`)
  if ((v.when.mode === 'between' || v.when.mode === 'days') && v.when.days.length > 0 && v.when.days.length < 7) parts.push(daysWords(v.when.days))
  return cap(parts.join(', '))
}

function whoWords(a: DescribeAnswers, t: DescribeTenant): string {
  return whoSummary(a.who.value && a.who.value !== 'everyone' ? a.who.value : undefined, (kind, id) =>
    kind === 'group' ? t.groups.find((g) => g.id === id)?.name : t.users.find((u) => u.id === id)?.name,
  )
}

/** Something in the answers is still waiting on a choice. */
const pendingAny = (a: DescribeAnswers) =>
  [a.who, a.where, a.devices, a.risk, a.when].some((x) => x.origin === 'unset') || (a.order !== null && a.order.value === null)

/* The rule for the first sentence, its branches, or nothing: a rule with no
   conditions and no Who is a catch-all, and those are never written. */
interface Planned {
  key: string
  rule: Rule
  source: string
  conds: Condition[]
}

/** The rules, last row and audience the answers describe. See the note at the top. */
export function compose(a: DescribeAnswers, t: DescribeTenant, ids: RuleIds = new Map()): Composed {
  const audience = audienceOfAnswers(a)
  const notAdded: NotAdded[] = []
  const sources: Record<string, string> = {}
  const who = ruleWhoOf(a)
  const stamp = (key: string, r: Rule): Rule => {
    const kept = ids.get(key)
    if (kept) return { ...r, id: kept }
    ids.set(key, r.id)
    return r
  }
  const lastRow = (o: Outcome) => ({ ...fallbackRule(o.decision), ...outcomeFields(o) })
  const fallback = a.fallback.value ? lastRow(a.fallback.value) : undefined
  if (a.who.origin === 'unset') return { rules: [], fallback, audience, sources, notAdded, merged: false }

  const v = viewOf(a)
  const sharedConds = condsFor(v, v.where.mode === 'split')
  const spanWords = (xs: Span[]) => xs.map((s) => s.phrase).join(' · ')
  /* Only the words of answers that wrote a condition: "on a company laptop"
     is no source for a card while it is still a question. */
  const condSource = spanWords(
    [a.where, a.devices, a.risk, a.when]
      .filter((x) => x.origin !== 'unset')
      .flatMap((x) => x.spans)
      .sort((x, y) => x.start - y.start),
  )
  const make = (key: string, name: string, conds: Condition[], o: Outcome): Rule =>
    stamp(key, rule({ name: name || whoWords(a, t), ...(who ? { who } : null), when: conds.length > 0 ? whenOf(card(...conds)) : anySignIn(), ...outcomeFields(o) }))

  const planned: Planned[] = []
  let merged: Outcome | null = null
  for (const b of branchesOf(a)) {
    const o = a.signIn[b]
    if (!o?.value) continue
    let conds: Condition[] = []
    let name = ''
    const w = a.where.value
    const zoneId = w && w.mode !== 'anywhere' ? w.zoneId : ''
    const scope = w && w.mode !== 'anywhere' ? w.scope : 'both'
    const zoneName = t.zones.find((z) => z.id === zoneId)?.name ?? zoneId
    const { mediumFrom, highAbove } = a.risk.value?.mode === 'bands' ? a.risk.value : DEFAULT_CUTOFFS
    /* "Inside and outside" with no zone chosen yet: the halves have nothing to split on. */
    if ((b === 'inside' || b === 'outside') && !zoneId) continue
    if (b === 'match') {
      conds = sharedConds
      name = condWords(v, t)
    } else if (b === 'inside') {
      conds = [zoneCond(zoneId, scope), ...sharedConds]
      name = `In ${zoneName}`
    } else if (b === 'outside') {
      conds = sharedConds.length > 0 ? sharedConds : [zoneCond(zoneId, scope, true)]
      name = 'Elsewhere'
    } else if (b === 'low') {
      conds = [...sharedConds, cond('device-risk', 'below', [String(mediumFrom)])]
      name = 'Low risk'
    } else if (b === 'medium') {
      conds = [...sharedConds, cond('device-risk', 'above', [String(mediumFrom - 1)]), cond('device-risk', 'below', [String(highAbove + 1)])]
      name = 'Medium risk'
    } else {
      conds = [...sharedConds, cond('device-risk', 'above', [String(highAbove)])]
      name = 'High risk'
    }
    if (conds.length === 0 && !who) {
      if (!pendingAny(a)) merged = o.value
      continue
    }
    const source = b === 'match' ? condSource || spanWords(o.spans) : spanWords(o.spans)
    planned.push({ key: b, rule: make(b, name, conds, o.value), source, conds })
  }

  /* Later sentences, each its own rule. */
  const extra: Planned[] = []
  a.more.forEach((m, k) => {
    if (!m.outcome.value) return
    if ([m.where, m.devices, m.risk, m.when].some((x) => x.origin === 'unset')) return
    const mv = moreView(m)
    const conds = condsFor(mv)
    if (conds.length === 0 && !who) return
    extra.push({ key: `more:${k}`, rule: make(`more:${k}`, condWords(mv, t), conds, m.outcome.value), source: m.span.phrase, conds })
  })

  /* The order question, unanswered, writes neither rule it asks about. */
  let chain: Planned[] = [...planned, ...extra]
  if (a.order) {
    if (a.order.value === null) chain = planned.filter((p) => p.key !== 'match').concat()
    else {
      const all = [planned.find((p) => p.key === 'match'), ...a.more.map((_, k) => extra.find((e) => e.key === `more:${k}`))]
      const first = all[a.order.value]
      const rest = all.filter((p, i) => i !== a.order?.value && p)
      chain = [...planned.filter((p) => p.key !== 'match'), ...(first ? [first] : []), ...(rest as Planned[])]
      /* A rule after one whose conditions it all repeats is never reached. */
      const kept: Planned[] = []
      for (const p of chain) {
        const shadow = kept.find((e) => e.conds.every((c) => p.conds.some((d) => ckeyOf(d) === ckeyOf(c))))
        if (shadow) {
          notAdded.push({ span: { start: 0, end: 0, phrase: p.source }, reason: REASON.never(shadow.rule.name) })
          ids.delete(p.key)
          continue
        }
        kept.push(p)
      }
      chain = kept
    }
  }

  /* "only", with a clause for everyone else: the people named are refused
     outside the conditions — a refusal for them, not a catch-all. Not after
     a rule for them that checks nothing (a place with no zone, left out):
     every sign-in of theirs stops there, so the refusal could never be
     reached. It is not written, and "only" is said under Not added — once
     nothing is still being asked, since an answer may give that rule its
     condition. */
  if (a.only && who && writesOnlyRule(a)) {
    if (!chain.some((p) => p.conds.length === 0)) {
      const r = make('only', `${whoWords(a, t)} elsewhere`, [], { decision: 'deny', method: null, message: null })
      chain.push({ key: 'only', rule: r, source: a.only.phrase, conds: [] })
    } else if (!pendingAny(a)) {
      notAdded.push({ span: a.only, reason: REASON.onlyUnreached })
    }
  }

  const rules = chain.map((p) => p.rule)
  for (const p of chain) if (p.source) sources[p.rule.id] = p.source
  /* A catch-all outcome decides every sign-in, so it is the last row whatever
     the text said for "anything else" — nothing else is left to reach it. */
  return { rules, fallback: merged ? lastRow(merged) : fallback, audience, sources, notAdded, merged: merged !== null }
}

/* "only" said, and something else said for the rest — "…only from the
   office; everyone else needs Google Authenticator" — so "only" is not the
   last row: it is a refusal for the people named, outside the conditions. */
function writesOnlyRule(a: DescribeAnswers): boolean {
  const only = a.only
  if (!only || !namesWho(a)) return false
  const fromOnly = a.fallback.spans.some((s) => s.start === only.start && s.end === only.end)
  return !fromOnly && (!!a.everyoneElse || !!a.fallback.value)
}

const ckeyOf = (c: Condition) => `${c.typeId}|${c.operator}|${[...c.values].sort().join(',')}|${JSON.stringify(c.scopes ?? {})}`

/* The last row, as the panel says it. */
export type LastRow = 'set' | 'unset' | 'not-reached' | 'merged'
export function lastRowOf(a: DescribeAnswers, t: DescribeTenant): LastRow {
  const c = compose(a, t)
  if (c.merged) return 'merged'
  const lo = a.leaveOut.value ?? EMPTY_WHO
  const bare = c.rules.some((r) => r.when.cards.length === 0 && JSON.stringify(r.who) === JSON.stringify(ruleWhoOf(a)))
  if (namesWho(a) && !a.everyoneElse && lo.groupIds.length + lo.userIds.length === 0 && bare) return 'not-reached'
  return a.fallback.value ? 'set' : 'unset'
}

/* Leave out is asked when a composed rule refuses and names nobody in
   particular (describe spec, §3.5) — a rule on the board, not an outcome
   still waiting on a question — and stays once it holds somebody. */
export function leaveOutAsked(a: DescribeAnswers, t: DescribeTenant): boolean {
  const lo = a.leaveOut.value ?? EMPTY_WHO
  if (lo.groupIds.length + lo.userIds.length > 0) return true
  if (namesWho(a)) return false
  return compose(a, t).rules.some((r) => r.decision === 'deny')
}

// --- The order question's one sign-in --------------------------------------------------------------

function bothSignIn(a: DescribeAnswers, x: RuleView, y: RuleView, t: DescribeTenant): string {
  const w = a.who.value && a.who.value !== 'everyone' ? a.who.value : null
  const person =
    (w && (t.users.find((u) => w.groupIds.includes(u.groupId)) ?? t.users.find((u) => w.userIds.includes(u.id)))) ?? t.users[0]
  const app = t.apps.find((p) => (a.apps.value ?? []).includes(p.id))
  const inZone = [x.where, y.where].some((v) => v.mode === 'only')
  const outZone = [x.where, y.where].some((v) => v.mode === 'not')
  const place = inZone ? ORIGIN_PRESETS[0].label : outZone ? ORIGIN_PRESETS[2].label : ORIGIN_PRESETS[0].label
  const need = [x.devices, y.devices].filter((d): d is { mode: 'only' | 'not'; profileId: string } => d.mode !== 'any')
  const device = DEVICE_PRESETS.find((p) =>
    need.every((d) => {
      const prof = t.fingerprints.find((f) => f.id === d.profileId)
      if (!prof) return false
      const s = profileMatches(prof, p.facts).status
      return d.mode === 'only' ? s === 'pass' : s === 'fail'
    }),
  )
  return [person?.name, app?.name, place, need.length > 0 ? device?.label : undefined].filter(Boolean).join(' · ')
}

// --- Words for the panel ---------------------------------------------------------------------------

export function daysWords(days: readonly string[]): string {
  const idx = days.map((d) => DAYS.indexOf(d)).filter((i) => i >= 0).sort((p, q) => p - q)
  const run = idx.length >= 3 && idx.every((v, i) => i === 0 || v === idx[i - 1] + 1)
  if (run) return `${DAYS[idx[0]]} to ${DAYS[idx[idx.length - 1]]}`
  return idx.map((i) => DAYS[i]).join(', ')
}

/** "Allow with 2FA · Google Authenticator", "Deny · Custom message". */
export function outcomeWords(o: Outcome): string {
  const d = DECISION_WORDS[o.decision]
  if (o.decision === 'deny') return o.message ? `${d} · Custom message` : d
  if (o.decision === '1fa') return `${d} · ${o.method ?? 'Password'}`
  return `${d} · ${o.method ?? 'Any enabled method'}`
}

const zoneName = (t: DescribeTenant, id: string) => t.zones.find((z) => z.id === id)?.name ?? id
const profileName = (t: DescribeTenant, id: string) => t.fingerprints.find((p) => p.id === id)?.name ?? id

export function whereWords(w: WhereAnswer, t: DescribeTenant): string {
  if (w.mode === 'anywhere') return 'Anywhere'
  const z = zoneName(t, w.zoneId)
  const scope = w.scope === 'ip' ? ' (IP)' : w.scope === 'location' ? ' (Location)' : ''
  if (w.mode === 'only') return `Only from ${z}${scope}`
  if (w.mode === 'split') return `${z}, inside and outside${scope}`
  return `Not from ${z}${scope}`
}
export function whenWords(w: WhenAnswer): string {
  if (w.mode === 'any') return 'Any time'
  if (w.mode === 'days') return daysWords(w.days)
  return [`${w.from}–${w.to}`, w.days.length > 0 && w.days.length < 7 ? daysWords(w.days) : '', w.timeZone].filter(Boolean).join(', ')
}
export function deviceWords(d: DeviceAnswer, t: DescribeTenant): string {
  if (d.mode === 'any') return 'Any device'
  return `${d.mode === 'only' ? 'Only' : 'Not'} ${profileName(t, d.profileId)}`
}
export function riskWords(r: RiskAnswer): string {
  if (r.mode === 'any') return ''
  if (r.mode === 'bands') return `Medium from ${r.mediumFrom}, high above ${r.highAbove}`
  return `Risk ${r.mode} ${r.score}`
}

/** An answer's collapsed line (describe spec, §3.4). */
export function summaryOf(slot: SlotId, a: DescribeAnswers, t: DescribeTenant): string {
  switch (slot) {
    case 'apps': {
      const names = t.apps.filter((p) => (a.apps.value ?? []).includes(p.id)).map((p) => p.name)
      return names.length > 0 ? listPhrase(names) : NOT_SET
    }
    case 'who':
      return a.who.origin === 'unset' ? NOT_SET : whoWords(a, t)
    case 'leaveOut': {
      const lo = a.leaveOut.value ?? EMPTY_WHO
      if (lo.groupIds.length + lo.userIds.length === 0) return 'Nobody'
      return whoSummary(lo, (kind, id) => (kind === 'group' ? t.groups.find((g) => g.id === id)?.name : t.users.find((u) => u.id === id)?.name))
    }
    case 'where':
    case 'when': {
      if (a.where.origin === 'unset' || a.when.origin === 'unset') return NOT_SET
      return `${whereWords(a.where.value ?? { mode: 'anywhere' }, t)} · ${whenWords(a.when.value ?? { mode: 'any' })}`
    }
    case 'devices':
    case 'risk': {
      if (a.devices.origin === 'unset' || a.risk.origin === 'unset') return NOT_SET
      const r = riskWords(a.risk.value ?? { mode: 'any' })
      return r ? `${deviceWords(a.devices.value ?? { mode: 'any' }, t)} · ${r}` : deviceWords(a.devices.value ?? { mode: 'any' }, t)
    }
    case 'signIn': {
      const rows = [
        ...branchesOf(a).map((b) => ({ label: branchLabel(b, a, t), o: a.signIn[b]?.value ?? null })),
        /* A later sentence's rule, by the name its card carries. */
        ...a.more.map((m) => ({ label: condWords(moreView(m), t) || whoWords(a, t), o: m.outcome.value })),
      ]
      if (rows.length === 1) return rows[0].o ? outcomeWords(rows[0].o) : NOT_SET
      if (rows.every((r) => !r.o)) return NOT_SET
      return rows.map((r) => `${r.label}: ${r.o ? DECISION_WORDS[r.o.decision] : NOT_SET}`).join(' · ')
    }
    case 'fallback': {
      const state = lastRowOf(a, t)
      if (state === 'not-reached') return 'Not reached'
      /* The one rule would have been everyone's with no conditions, so the
         last row holds its outcome (`merged` in compose): say that outcome. */
      const merged = state === 'merged' ? a.signIn.match?.value : null
      if (merged) return outcomeWords(merged)
      return a.fallback.value ? outcomeWords(a.fallback.value) : NOT_SET
    }
  }
}

/** A name for the policy from its answers: "HRMS from Corporate offices". */
export function nameOf(a: DescribeAnswers, t: DescribeTenant, taken: readonly string[] = []): string {
  const names = t.apps.filter((p) => (a.apps.value ?? []).includes(p.id)).map((p) => p.name)
  const apps = listPhrase(names) || 'Sign-ins'
  /* A zone or profile not chosen yet names nothing. */
  const { where: w, devices: d } = viewOf(a)
  const qualifier =
    w && (w.mode === 'only' || w.mode === 'split')
      ? ` from ${zoneName(t, w.zoneId)}`
      : d && d.mode === 'only'
        ? ` on ${profileName(t, d.profileId)}`
        : namesWho(a)
          ? ` for ${whoWords(a, t)}`
          : ''
  let base = `${apps}${qualifier}`
  if (base.length > POLICY_NAME_MAX) base = apps
  if (base.length > POLICY_NAME_MAX && names.length > 1) base = `${names[0]} and ${names.length - 1} more`
  return freeName(base, taken, POLICY_NAME_MAX)
}

// --- Which answer is open ------------------------------------------------------------------------------

/** The panel's answers, top to bottom. Where and when, and Devices, each hold two slots. */
export type AnswerKey = 'apps' | 'who' | 'leaveOut' | 'where' | 'devices' | 'signIn' | 'fallback'
export const ANSWER_ORDER: readonly AnswerKey[] = ['apps', 'who', 'leaveOut', 'where', 'devices', 'signIn', 'fallback']
/* The answers a policy cannot do without. The last row can: the draft keeps its own. */
const REQUIRED = new Set<AnswerKey>(['apps', 'who', 'where', 'devices', 'signIn'])

/** The answer a question from the text is asked in. */
export function answerOfChoice(c: Choice): AnswerKey {
  if (c.slot === 'signIn') return c.branch === 'fallback' ? 'fallback' : 'signIn'
  if (c.slot === 'order') return 'signIn'
  if (c.slot === 'when') return 'where'
  if (c.slot === 'risk') return 'devices'
  return c.slot as AnswerKey
}

/** A Sign-in row with no decision yet — one branch of several counts, though the summary names the others. */
export function signInMissing(a: DescribeAnswers): boolean {
  return branchesOf(a).some((b) => !a.signIn[b]?.value) || a.more.some((m) => !m.outcome.value)
}

/** A value the answer cannot do without is missing. */
export function answerMissing(key: AnswerKey, a: DescribeAnswers, t: DescribeTenant): boolean {
  if (!REQUIRED.has(key)) return false
  return key === 'signIn' ? signInMissing(a) : summaryOf(key, a, t) === NOT_SET
}

/** The answer holds a question still open, or is missing a value. */
export function needsAnswer(key: AnswerKey, r: Reading, t: DescribeTenant): boolean {
  return openChoices(r).some((c) => answerOfChoice(c) === key) || answerMissing(key, r.answers, t)
}

/** Open by default (describe spec, §3.4): the first answer with a question, else the first missing a value, else none. */
export function firstNeeding(r: Reading, t: DescribeTenant): AnswerKey | null {
  const open = openChoices(r)
  return ANSWER_ORDER.find((k) => open.some((c) => answerOfChoice(c) === k)) ?? ANSWER_ORDER.find((k) => answerMissing(k, r.answers, t)) ?? null
}

/* After a change by hand, what is open. Only the pick that fills an answer's
   last missing value closes it and opens the next that needs something: it
   needed something before and needs nothing now. Any other change leaves the
   answer open where the admin is working — "Between" and its times, a band
   stepped, a second branch still to decide. `stay` is a change that has just
   put a control of its own in the answer — Allow with 2FA and its Method,
   Deny and its Message — or came from a list still open for more. */
export function openAfter(before: Reading, after: Reading, from: AnswerKey, open: AnswerKey | null, t: DescribeTenant, stay = false): AnswerKey | null {
  const filled = !stay && needsAnswer(from, before, t) && !needsAnswer(from, after, t)
  return filled ? firstNeeding(after, t) : open
}

// --- The sentence the answers make -------------------------------------------------------------------

const joinNames = (names: string[]): string =>
  names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`

/* An outcome, as a phrase the reader reads back to itself. */
function outcomePhrase(o: Outcome): string {
  if (o.decision === 'deny') return o.message ? `deny with “${o.message}”` : 'deny'
  if (o.decision === '1fa') return o.method ? `${o.method} only` : 'password'
  return o.method ?? 'MFA'
}
function restPhrase(o: Outcome, everyoneElse: boolean): string {
  const rest = everyoneElse ? 'everyone else' : 'anything else'
  if (o.decision === 'deny') return o.message ? `Block ${rest} with “${o.message}”` : `Block ${rest}`
  const who = everyoneElse ? 'Everyone else' : 'Anything else'
  if (o.decision === '1fa') return o.method ? `${who} needs ${o.method} only` : `${who} needs a password`
  return `${who} needs ${o.method ?? 'MFA'}`
}
function condPhrase(v: Omit<RuleView, 'outcome'>, t: DescribeTenant, skipZone: boolean): string {
  let s = ''
  const scope = (w: { scope: ZoneScope }) => (w.scope === 'ip' ? ' by IP' : w.scope === 'location' ? ' by location' : '')
  if (!skipZone && v.where.mode === 'only') s += ` from ${zoneName(t, v.where.zoneId)}${scope(v.where)}`
  if (!skipZone && v.where.mode === 'not') s += ` not from ${zoneName(t, v.where.zoneId)}${scope(v.where)}`
  if (v.devices.mode === 'only') s += ` on ${profileName(t, v.devices.profileId)}`
  if (v.devices.mode === 'not') s += ` not on ${profileName(t, v.devices.profileId)}`
  if (v.risk.mode === 'above' || v.risk.mode === 'below') s += ` at risk ${v.risk.mode} ${v.risk.score}`
  if (v.when.mode === 'between') s += ` between ${v.when.from} and ${v.when.to}`
  if ((v.when.mode === 'between' || v.when.mode === 'days') && v.when.days.length > 0 && v.when.days.length < 7) s += ` on ${daysPhrase(v.when.days)}`
  if (v.when.mode === 'between' && v.when.timeZone !== TENANT_TIME_ZONE) s += ` (${v.when.timeZone})`
  return s
}
function daysPhrase(days: readonly string[]): string {
  const idx = days.map((d) => DAYS.indexOf(d)).filter((i) => i >= 0).sort((p, q) => p - q)
  const run = idx.length >= 2 && idx.every((v, i) => i === 0 || v === idx[i - 1] + 1)
  if (run) return `${DAYS[idx[0]]} to ${DAYS[idx[idx.length - 1]]}`
  return idx.map((i) => DAYS[i]).join(' and ')
}

/* The answers as one plain sentence: what the text box shows after an answer
   is changed by hand, so both ways in stay in step. Read back, it gives the
   same answers (describe-model.test.ts). */
export function sentenceOf(a: DescribeAnswers, t: DescribeTenant): string {
  const w = namesWho(a) ? (a.who.value as RuleWho) : null
  const whoNames = w
    ? [...w.groupIds.map((id) => t.groups.find((g) => g.id === id)?.name ?? id), ...w.userIds.map((id) => t.users.find((u) => u.id === id)?.name ?? id)]
    : ['Everyone']
  const lo = a.leaveOut.value ?? EMPTY_WHO
  const loNames = [...lo.groupIds.map((id) => t.groups.find((g) => g.id === id)?.name ?? id), ...lo.userIds.map((id) => t.users.find((u) => u.id === id)?.name ?? id)]
  const apps = t.apps.filter((p) => (a.apps.value ?? []).includes(p.id)).map((p) => p.name)
  const v = viewOf(a)
  const split = v.where.mode === 'split'

  const bs = branchesOf(a)
  const outs: string[] = []
  for (const b of bs) {
    const o = a.signIn[b]?.value
    if (!o) continue
    /* The halves of a split with no zone chosen yet write nothing (compose). */
    if ((b === 'inside' || b === 'outside') && v.where.mode !== 'split') continue
    const p = outcomePhrase(o)
    const zone = v.where.mode === 'split' ? zoneName(t, v.where.zoneId) : ''
    const scope = v.where.mode === 'split' && v.where.scope !== 'both' ? (v.where.scope === 'ip' ? ' by IP' : ' by location') : ''
    if (b === 'match') outs.push(p)
    else if (b === 'inside') outs.push(`${p} in ${zone}${scope}`)
    else if (b === 'outside') outs.push(`${p} elsewhere`)
    else outs.push(`${p} at ${b} risk`)
  }

  /* The verb agrees with who: "Everyone reaches", "Vikram Nair reaches",
     "Sales reach". With no decision yet it is no verb that lets anyone in —
     "signing in to" — because the reader takes a bare "reach" as Allow on 1
     factor (§4.3), and the box must read back to the answers it came from. */
  const one = !w || (w.groupIds.length === 0 && w.userIds.length === 1)
  let lead = joinNames(whoNames)
  if (loNames.length > 0) lead += ` except ${joinNames(loNames)}`
  if (outs.length === 0) lead += apps.length > 0 ? ` signing in to ${joinNames(apps)}` : ' signing in'
  else lead += apps.length > 0 ? ` ${one ? 'reaches' : 'reach'} ${joinNames(apps)}` : ` ${one ? 'signs in' : 'sign in'}`
  /* Said only where it writes a rule of its own. Where "only" was the last
     row, the last row's own sentence below says the same thing. */
  if (writesOnlyRule(a)) lead += ' only'
  lead += condPhrase(v, t, split)

  let s = outs.length > 0 ? `${lead}: ${outs.join(', ')}.` : `${lead}.`
  for (const m of a.more) {
    if (!m.outcome.value) continue
    s += ` ${cap(condPhrase(moreView(m), t, false).trim())}, ${outcomePhrase(m.outcome.value)}.`
  }
  /* "Everyone else" keeps the policy for everyone; "anything else" does not. */
  if (a.fallback.value) s += ` ${restPhrase(a.fallback.value, !!a.everyoneElse)}.`
  else if (a.everyoneElse) s += ' Everyone else.'
  return s
}

// --- The examples ----------------------------------------------------------------------------------------

/* The four buttons under the text box. Each reads to exactly its seeded
   policy; the round-trip test holds them to it, so the buttons and the seed
   cannot drift apart. */
export const EXAMPLES: readonly { label: string; text: string; policyId: string }[] = [
  {
    label: 'HRMS from the office',
    text: 'HR and Finance reach HRMS only from a corporate office, with Google Authenticator.',
    policyId: 'sc-hrms-office',
  },
  {
    label: 'Corporate devices by risk',
    text: 'Sales, Finance and Vikram Nair use Google Workspace only on a corporate device: password at low risk, OTP over Email at medium risk, deny at high risk.',
    policyId: 'sc-corporate-devices',
  },
  {
    label: 'Compliant devices',
    text: 'Outlook and Dropbox need a compliant device and a password. Block anything else with “Your device does not meet the security requirements. Update it, or contact IT.”',
    policyId: 'sc-device-compliance',
  },
  {
    label: 'Developer tools',
    text: 'Engineering and DevOps reach GitHub and Jira on a compliant device: password in the office, miniOrange Push elsewhere. Block other devices.',
    policyId: 'sc-dev-tools',
  },
]

/** The answers as values alone, origins and spans aside: what two readings are compared on. */
export function valuesOf(a: DescribeAnswers): unknown {
  const v = <T,>(x: Answer<T>) => x.value
  return {
    apps: v(a.apps),
    who: v(a.who),
    leaveOut: v(a.leaveOut),
    where: v(a.where),
    when: v(a.when),
    devices: v(a.devices),
    risk: v(a.risk),
    signIn: Object.fromEntries(Object.entries(a.signIn).map(([k, x]) => [k, x ? x.value : null])),
    more: a.more.map((m) => ({ where: v(m.where), devices: v(m.devices), risk: v(m.risk), when: v(m.when), outcome: v(m.outcome) })),
    fallback: v(a.fallback),
    only: a.only !== null,
    everyoneElse: a.everyoneElse !== null,
    order: a.order ? a.order.value : null,
  }
}
