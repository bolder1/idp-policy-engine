import { conditionType, type AccessDecision, type Condition, type Group, type Policy, type Rule, type User, type Zone } from '../../data'
import { CANT_TELL, DECISION_WORDS } from '../../decision-words'
import { leaves } from '../../predicate'
import { normaliseWho } from '../../rule-who'
import type { ColumnView, DecisionView } from '../board/try-sign-in'
import type { NameLookup, RefKind } from '../predicate-prose'
import { fallbackOf } from '../simulate'
import { lineText, type CardEvidence, type CardState, type EvidenceLine, type LineStatus } from './evidence'

/* -----------------------------------------------------------------------------
   The trace, as pills: what a card in test mode says about one sign-in.

   The evidence lines (evidence.ts) are sentences — "203.0.113.24 · in
   203.0.113.0/24, 198.51.100.0/24" — and a card that printed one per condition
   was a paragraph per rule, which is what the owner meant by "too much text".
   A pill says the other half: WHAT the rule checks, in the few words the
   admin wrote it in — the zone's name, the device profile's name, the groups,
   "Mon–Fri", "Risk above 70" — and a glyph for how this sign-in stood against
   it. The sentence moves to the pill's tooltip, where it is still one hover
   away and no longer the thing you have to read to scan the chain.

   One pill per evidence line, in the line's order, never one per condition:
   a zone asked on both halves is two lines (Network, Place) because one line
   cannot say which half failed, and the pills keep that split — "Corporate
   offices · IP ✕" beside "Corporate offices · Location ✓" is the whole story
   of a home-broadband sign-in in two tokens. A device profile is its own line
   and then one line per check that failed or could not be told, so the check
   that sank it is a pill of its own.

   Lines are matched back to the rule by key, which evidence.ts builds from
   the condition id (`{condition}`, `{condition}:{zone}:network`,
   `{condition}:{profile}:{check}`, and `{rule}:who`). A line that matches no
   condition — or a last row, which has none — falls back to the line's own
   label, so a pill is never blank.

   Pure, and in one file with its tests, so the words a pill says can be
   pinned without drawing a card. TracePills.tsx draws them.
   -------------------------------------------------------------------------- */

export type PillCategory = 'who' | 'network' | 'place' | 'device' | 'time' | 'risk' | 'app' | 'other'

export interface CheckPill {
  /** The evidence line's key: unique within its card. */
  key: string
  /** Which mark leads the pill. The icon does the filing; the text does not repeat it. */
  category: PillCategory
  /** The short requirement the rule checks: "Corporate offices · IP", "Risk above 70". */
  text: string
  status: LineStatus
  /** "actual · required", then the line's own tip on a line of its own. */
  tip: string
}

// --- Names ---------------------------------------------------------------------

/* The lookup a pill needs is the one every rule reader already takes: an id to
   the live name of the zone, device profile, hook, group or person it points
   at. Re-exported rather than redefined, so the board hands its cards the same
   `resolve` it already holds (store.tsx `useNameLookup`). */
export type { NameLookup, RefKind }

/** The tenant collections a lookup reads. Hooks are optional: most callers never name one. */
export interface NameSources {
  zones: readonly Pick<Zone, 'id' | 'name'>[]
  fingerprints: readonly { id: string; name: string }[]
  groups: readonly Pick<Group, 'id' | 'name'>[]
  users: readonly Pick<User, 'id' | 'name'>[]
  hooks?: readonly { id: string; name: string }[]
}

/* A lookup from plain collections, for a caller with no store — a test, the
   Sign-in tests page's journey canvas, a report. Inside the store,
   `useNameLookup()` is the same function over the same lists. */
export function nameLookupOf(s: NameSources): NameLookup {
  const by = <T extends { id: string; name: string }>(list: readonly T[] | undefined) => new Map((list ?? []).map((x) => [x.id, x.name]))
  const maps: Record<RefKind, Map<string, string>> = {
    zone: by(s.zones),
    fingerprint: by(s.fingerprints),
    hook: by(s.hooks),
    group: by(s.groups),
    user: by(s.users),
  }
  return (kind, id) => maps[kind].get(id)
}

// --- Short words -----------------------------------------------------------------

/* "Engineering, DevOps" and "Engineering, DevOps +1": the first two by name,
   then a count. A pill is one token in a row of four on a 380 px card, and
   "and 3 more" (evidence.ts's line form) is a sentence's way of saying it. */
export function shortNames(names: readonly string[], keep = 2): string {
  if (names.length <= keep) return names.join(', ')
  return `${names.slice(0, keep).join(', ')} +${names.length - keep}`
}

/* What a deleted object reads as. The linter reports the rule as broken; the
   pill must not print an id nobody recognises, or the name of a thing that is
   gone. People and groups fall back to the id, as the trace's own lines do. */
const GONE: Partial<Record<RefKind, string>> = {
  zone: 'Deleted zone',
  fingerprint: 'Deleted device profile',
  hook: 'Deleted hook',
}
const nameOf = (names: NameLookup, kind: RefKind, id: string): string => names(kind, id) ?? GONE[kind] ?? id

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

/* "Mon–Fri", "Sat, Sun", "Mon, Wed, Fri": a run of three or more days is a
   range, as a timetable writes it, and every day is "Every day". */
export function dayText(values: readonly string[]): string {
  const idx = [...new Set(values.map((v) => DAYS.indexOf(v as (typeof DAYS)[number])).filter((i) => i >= 0))].sort((a, b) => a - b)
  if (idx.length === 0) return values.join(', ')
  if (idx.length === 7) return 'Every day'
  const runs: number[][] = []
  for (const i of idx) {
    const run = runs.at(-1)
    if (run && run[run.length - 1] === i - 1) run.push(i)
    else runs.push([i])
  }
  return runs.map((r) => (r.length >= 3 ? `${DAY_SHORT[r[0]]}–${DAY_SHORT[r[r.length - 1]]}` : r.map((i) => DAY_SHORT[i]).join(', '))).join(', ')
}

/* "09:00–18:00", and the city of the zone it is read in when the condition
   names one: a window in Berlin and one in Kolkata are different rules, and
   two pills reading the same would say they are not. */
export function windowText(c: Pick<Condition, 'values' | 'tz'>): string {
  const [from, to] = c.values
  const span = `${from || '…'}–${to || '…'}`
  return c.tz ? `${span} ${(c.tz.split('/').pop() ?? c.tz).replace(/_/g, ' ')}` : span
}

/* "years_of_experience" → "Years of experience": the directory's field name
   as a label, the way the attribute picker prints it. */
const keyWords = (key: string): string => {
  const s = key.replace(/[_-]+/g, ' ').trim()
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s
}

const negated = (c: Pick<Condition, 'operator'>): boolean => c.operator.includes('not') || c.operator === 'returns false'

// --- One line, one pill -----------------------------------------------------------

type Said = { category: PillCategory; text: string }

/* Where a line is filed when nothing on the rule says more: by its label. */
function byLabel(line: EvidenceLine): Said {
  if (line.label === 'Who') return { category: 'who', text: line.label }
  if (line.label === 'Network') return { category: 'network', text: line.label }
  if (line.label === 'Place') return { category: 'place', text: line.label }
  return { category: 'other', text: line.label }
}

/* The who line: the rule's own groups and people, by name. "Everyone except
   Contractors" when it names only exceptions — the one shape where the
   exception IS the requirement. */
function whoSaid(rule: Pick<Rule, 'who'>, names: NameLookup): Said {
  const w = normaliseWho(rule.who)
  const named = w ? [...w.groupIds.map((id) => nameOf(names, 'group', id)), ...w.userIds.map((id) => nameOf(names, 'user', id))] : []
  const except = w ? [...(w.exceptGroupIds ?? []).map((id) => nameOf(names, 'group', id)), ...(w.exceptUserIds ?? []).map((id) => nameOf(names, 'user', id))] : []
  if (named.length > 0) return { category: 'who', text: shortNames(named) }
  return { category: 'who', text: except.length > 0 ? `Everyone except ${shortNames(except)}` : 'Everyone' }
}

/* A zone condition's line. `rest` is what follows the condition id in the
   key: "{zone}:network", "{zone}:place", "{zone}", or nothing for a negated
   condition, which evidence.ts keeps as one line. The half is said only when
   the card also carries the other half's pill for the same zone — a zone asked
   on one half is just its name. */
function zoneSaid(c: Condition, rest: string, line: EvidenceLine, card: CardEvidence, names: NameLookup): Said {
  const values = c.values.filter((v) => v.trim() !== '')
  const byPlace = values.length > 0 && values.every((id) => c.scopes?.[id] === 'location')
  if (!rest) {
    /* Nothing set: the attribute's own name, as every unset condition says it. */
    if (values.length === 0) return { category: 'network', text: conditionType(c.typeId).label }
    const zones = shortNames(values.map((id) => nameOf(names, 'zone', id)))
    return { category: byPlace ? 'place' : 'network', text: negated(c) ? `Not in ${zones}` : zones }
  }
  const half = rest.endsWith(':network') ? 'network' : rest.endsWith(':place') ? 'place' : null
  const zoneId = half ? rest.slice(0, -(half.length + 1)) : rest
  const name = nameOf(names, 'zone', zoneId)
  if (!half) return { category: c.scopes?.[zoneId] === 'location' ? 'place' : 'network', text: name }
  const base = line.key.slice(0, -(half.length + 1))
  const other = `${base}:${half === 'network' ? 'place' : 'network'}`
  const both = card.lines.some((l) => l.key === other)
  return { category: half, text: both ? `${name} · ${half === 'network' ? 'IP' : 'Location'}` : name }
}

/* A device profile condition's line: the profile by name, or — for a check
   line, "{profile}:{check}" — the check by its own label ("Screen lock"),
   which is the row of the profile that sank it. */
function profileSaid(c: Condition, rest: string, line: EvidenceLine, names: NameLookup): Said {
  const values = c.values.filter((v) => v.trim() !== '')
  if (!rest) {
    if (values.length === 0) return { category: 'device', text: conditionType(c.typeId).label }
    const profiles = shortNames(values.map((id) => nameOf(names, 'fingerprint', id)))
    return { category: 'device', text: negated(c) ? `Not ${profiles}` : profiles }
  }
  const profile = values.find((id) => rest === id)
  if (profile) return { category: 'device', text: nameOf(names, 'fingerprint', profile) }
  return { category: 'device', text: line.label }
}

/* Everything else is one line per condition, and says the condition short. */
function conditionSaid(c: Condition, line: EvidenceLine, names: NameLookup): Said {
  const values = c.values.filter((v) => v.trim() !== '')
  const t = conditionType(c.typeId)
  /* A condition with nothing set: its attribute's name, and the tip says why it cannot be told. */
  if (values.length === 0) return { category: byLabel(line).category, text: t.label }
  const not = negated(c)
  switch (c.typeId) {
    case 'time':
      return { category: 'time', text: not ? `Outside ${windowText(c)}` : windowText(c) }
    case 'day':
      return { category: 'time', text: not ? `Not ${dayText(values)}` : dayText(values) }
    case 'device-risk':
      return { category: 'risk', text: `Risk ${c.operator} ${values[0]}` }
    case 'ml-risk':
      return { category: 'risk', text: `ML risk ${c.operator} ${shortNames(values)}` }
    case 'user-attr':
    case 'custom-attr':
      return { category: 'who', text: `${c.key ? keyWords(c.key) : t.label} ${c.operator} ${shortNames(values)}` }
    case 'group':
      return { category: 'who', text: `${not ? 'Not ' : ''}${shortNames(values.map((id) => nameOf(names, 'group', id)))}` }
    case 'user':
      return { category: 'who', text: `${not ? 'Not ' : ''}${shortNames(values.map((id) => nameOf(names, 'user', id)))}` }
    case 'country':
    case 'state':
    case 'city':
      return { category: 'place', text: `${not ? 'Not ' : ''}${shortNames(values)}` }
    case 'webhook':
      return { category: 'other', text: `${not ? 'Not ' : ''}${nameOf(names, 'hook', values[0])}` }
  }
  return byLabel(line)
}

/* The condition a line belongs to: the one whose id is the key, or its
   prefix up to a colon. Longest first, so an id that happens to prefix
   another's never claims its lines. */
function ownerOf(key: string, conditions: readonly Condition[]): { c: Condition; rest: string } | null {
  let best: { c: Condition; rest: string } | null = null
  for (const c of conditions) {
    if (key === c.id) return { c, rest: '' }
    if (key.startsWith(`${c.id}:`) && (!best || c.id.length > best.c.id.length)) best = { c, rest: key.slice(c.id.length + 1) }
  }
  return best
}

/* The tooltip: the line's sentence, and under it what would settle it or the
   whole of a list the line shortened. */
const tipOf = (line: EvidenceLine): string => (line.tip ? `${lineText(line)}\n${line.tip}` : lineText(line))

/** One pill per evidence line. `rule` is null for the last row, which checks nothing and has no lines. */
export function checkPills(rule: Rule | null, evidence: CardEvidence, names: NameLookup): CheckPill[] {
  const conditions = rule ? leaves(rule.when) : []
  return evidence.lines.map((line) => {
    let said: Said
    if (rule && line.key === `${rule.id}:who`) said = whoSaid(rule, names)
    else {
      const owner = ownerOf(line.key, conditions)
      if (!owner) said = byLabel(line)
      else if (owner.c.typeId === 'zone') said = zoneSaid(owner.c, owner.rest, line, evidence, names)
      else if (owner.c.typeId === 'fingerprint') said = profileSaid(owner.c, owner.rest, line, names)
      else said = conditionSaid(owner.c, line, names)
    }
    return { key: line.key, category: said.category, text: said.text || line.label, status: line.status, tip: tipOf(line) }
  })
}

// --- A card, and where the route lands ------------------------------------------------

/** What a rule decides when it matches: its THEN, or the last row's for `null`. */
export function outcomeOf(rule: Rule | null, policy: Pick<Policy, 'fallback'>): AccessDecision {
  return rule ? rule.decision : fallbackOf(policy as Policy)
}

export type CardTone = 'lit' | 'missed' | 'dim'

/* How a card is drawn in test mode, from its standing.

     lit      it matched: the accent ring, full tone on its outcome
     missed   it was asked and did not match — or might, and cannot be told:
              the text steps down, the pills stay, and the one that failed (or
              the "?" that could not be read) is the vivid thing on it
     dim      switched off, or never reached: nothing about it was asked

   Can't tell is `missed`, not `lit`. Under the definite reading an undecided
   rule counts as no match and the walk goes on past it (simulate.ts), and a
   ring on it would read as the rule that decided. The marker's hollow ring
   (`landingUnknown`) is what says the route stopped there unsure. */
export function cardTone(state: CardState): CardTone {
  if (state === 'pass') return 'lit'
  if (state === 'fail' || state === 'unknown') return 'missed'
  return 'dim'
}

/** The small grey word a card carries in test mode, or null for the card that matched. */
export function cardWord(state: CardState): string | null {
  switch (state) {
    case 'pass':
      return null
    case 'fail':
      return 'No match'
    case 'unknown':
      return CANT_TELL
    case 'off':
      return 'Switched off'
    case 'not-reached':
      return 'Not reached'
  }
}

// --- The outcome node -------------------------------------------------------------------

/** "Allow with 2FA", "Depends", "Can't tell": the answer as a word, for the node's accessible name. */
export function answerWord(d: Pick<DecisionView, 'status' | 'decision'>): string {
  if (d.status === 'decided' && d.decision) return DECISION_WORDS[d.decision]
  return d.status === 'depends' ? 'Depends' : CANT_TELL
}

const columnSig = (c: ColumnView): string => `${c.status}|${c.decision ?? ''}|${c.possible.join(',')}`

/* The two versions the node sets side by side — "Live [Allow on 1 factor] →
   Your edits [Deny]" — only when they answer differently. One column, or two
   that agree, is nothing: the big badge already says it, and a number is said
   once a view. */
export function versionPair(columns: readonly ColumnView[]): [ColumnView, ColumnView] | null {
  if (columns.length < 2) return null
  const first = columns[0]
  const last = columns[columns.length - 1]
  return columnSig(first) === columnSig(last) ? null : [first, last]
}
