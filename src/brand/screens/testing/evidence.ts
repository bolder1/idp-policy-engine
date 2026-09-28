import { conditionType, rangeText, type Condition, type Policy, type Rule, type Zone, type ZoneLocation } from '../../data'
import { CANT_TELL, FACT_WORDS, factWords } from '../../decision-words'
import { leaves } from '../../predicate'
import { normaliseWho } from '../../rule-who'
import { personOf, type ConditionResult, type FactKey, type PolicyTrace, type ProfileResult, type RuleTrace, type SignInFacts, type SimEnv } from '../simulate'
import { placeOfSignIn, type ZonePart } from '../zone-match'
import { isAddress } from '../zone-validation'

/* -----------------------------------------------------------------------------
   What a rule made of one sign-in, line by line — the one vocabulary for it.

   Three surfaces print the same evidence: a card on the board in test mode,
   the Rules stage of Policy testing, and a Monitoring row opened to say why.
   Each spec reached for its own words ("Missed", "Not matched", "Off",
   "Location") and three sets of words for one trace is how an admin ends up
   reading "No match" on the board and "Missed" on the page about the same
   rule. So the words live here, and every surface prints what this returns.

     a rule        Matched · No match · Can't tell · Switched off · Not reached
     a condition   Passes · Fails · Can't tell

   A line is "actual · required", both straight from the trace, which already
   says what the sign-in showed and what the condition asked. Two conditions
   are split, because one line cannot say what decided them:

     in zone          a Network line and a Place line, one per half the zone
                      has and the condition asked — "203.0.113.24 · in
                      203.0.113.0/24, 198.51.100.0/24" and "Pune (looked up)
                      · within 25 km of Pune, or Bengaluru, Mumbai"
     matches profile  "{profile} · 3 of 4 checks pass", then every check that
                      failed or could not be told

   A negated condition stays one line: "not in zone" passes when a half fails,
   and a Network line reading Fails beside a condition reading Passes would say
   two things at once.

   A line that cannot be told carries what would settle it — "Needs: IP
   address" — in the words the form's own rows use (`FACT_WORDS`).
   -------------------------------------------------------------------------- */

export type RuleWord = 'Matched' | 'No match' | typeof CANT_TELL | 'Switched off' | 'Not reached'
export type LineStatus = 'pass' | 'fail' | 'unknown'

/** A condition's standing, in words. Grey for Can't tell, never a pass. */
export const CONDITION_WORDS: Record<LineStatus, string> = { pass: 'Passes', fail: 'Fails', unknown: CANT_TELL }

export interface EvidenceLine {
  /** Unique within its card: the condition id, and the half, profile or check. */
  key: string
  /** "Who", "Network", "Place", a catalogue label, or a profile check's label. */
  label: string
  actual: string
  required: string
  status: LineStatus
  /** One line: what would settle it, a limit of the answer, or the whole of a list the line shortened. */
  tip?: string
}

/** A card's standing, for its tone: the word is what is printed. */
export type CardState = 'pass' | 'fail' | 'unknown' | 'off' | 'not-reached'

export interface CardEvidence {
  word: RuleWord
  state: CardState
  /** Empty for a rule that was switched off or not reached: nothing about it was asked. */
  lines: EvidenceLine[]
}

/** The key the last row's evidence is filed under, beside the rule ids. */
export const LAST_ROW = 'fallback'

/** "actual · required", the text of a line between its label and its word. */
export const lineText = (l: Pick<EvidenceLine, 'actual' | 'required'>): string => `${l.actual} · ${l.required}`

// --- A rule, in a word -------------------------------------------------------

/* The trace keeps two readings (simulate.ts). Its `kind` is the definite one —
   an undecided rule counts as no match — which is what decides where the walk
   stopped, so a rule after the definite hit is "Not reached". Its `match` is
   three-valued, and that is the word: a rule that might match says so. */
export function ruleWordOf(step: RuleTrace | undefined): { word: RuleWord; state: CardState } {
  if (!step || step.kind === 'unreached') return { word: 'Not reached', state: 'not-reached' }
  if (step.kind === 'off') return { word: 'Switched off', state: 'off' }
  if (step.match === 'yes') return { word: 'Matched', state: 'pass' }
  if (step.match === 'no') return { word: 'No match', state: 'fail' }
  return { word: CANT_TELL, state: 'unknown' }
}

/* The last row is reached when every rule above it missed. It always matches
   once reached, so its word is whether it is reached: yes when it is the only
   outcome, Can't tell when an undecided rule above could still catch the
   sign-in first, and no when a rule above certainly does. */
export function lastRowWordOf(trace: PolicyTrace | null): { word: RuleWord; state: CardState } {
  if (!trace || trace.outOfAudience) return { word: 'Not reached', state: 'not-reached' }
  const last = trace.possible.some((o) => o.ruleIndex === null)
  if (!last) return { word: 'Not reached', state: 'not-reached' }
  return trace.possible.some((o) => o.ruleIndex !== null) ? { word: CANT_TELL, state: 'unknown' } : { word: 'Matched', state: 'pass' }
}

// --- Lists, shortened ------------------------------------------------------------

/* "a, b and 3 more" past two, with the whole list for the tip. A line is one
   row of a 448 px panel, and a zone with nine blocks would wrap it to four. */
function shortList(items: readonly string[], keep = 2): { text: string; full?: string } {
  if (items.length <= keep) return { text: items.join(', ') }
  return { text: `${items.slice(0, keep).join(', ')} and ${items.length - keep} more`, full: items.join(', ') }
}

const needs = (keys: readonly FactKey[]): string | undefined => (keys.length > 0 ? `Needs: ${factWords(keys).join(', ')}` : undefined)

const sentence = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

const lowerFirst = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s)

// --- Who ---------------------------------------------------------------------

/* "Kavya Menon · Human Resources, Finance". The rule's own who, by name, so
   the line says who the rule is for rather than why this person missed it —
   that sentence is the tip. */
export function whoLine(rule: Pick<Rule, 'id' | 'who'>, step: RuleTrace, facts: SignInFacts, env: SimEnv): EvidenceLine | null {
  const w = normaliseWho(rule.who)
  if (!w || step.who === 'none') return null
  const person = personOf(facts.personId, env)
  const user = (id: string) => env.userName?.(id) ?? id
  const named = [...w.groupIds.map(env.groupName), ...w.userIds.map(user)]
  const except = [...(w.exceptGroupIds ?? []).map(env.groupName), ...(w.exceptUserIds ?? []).map(user)]
  const head = named.length === 0 ? 'Everyone' : named.join(', ')
  const status: LineStatus = step.who === 'in' ? 'pass' : step.who === 'out' ? 'fail' : 'unknown'
  return {
    key: `${rule.id}:who`,
    label: 'Who',
    actual: person?.name ?? 'Not stated',
    required: except.length > 0 ? `${head} except ${except.join(', ')}` : head,
    status,
    tip: status === 'fail' ? (step.whoReason ?? undefined) : status === 'unknown' ? needs(['person']) : undefined,
  }
}

// --- Zones ---------------------------------------------------------------------

/* The place a sign-in is at, as the Place row says it: looked up says so, an
   anonymiser has none, and an address outside the sample table has none to
   look up. */
export function placeActual(facts: SignInFacts): string {
  const place = placeOfSignIn(facts)
  if (place === null) return 'No place'
  if (place === undefined) return facts.network ? 'Not in the sample table' : 'Not stated'
  const name = place.city ?? place.state ?? place.country ?? 'A place with no name'
  return place.source === 'looked-up' ? `${name} (looked up)` : name
}

/* "within 25 km of Pune, or Bengaluru, Mumbai": the ranges first, as the zone
   page lists them, then the places named outright. */
function placeRequired(l: ZoneLocation): { text: string; full?: string } {
  const ranges = l.ranges.map((r) => lowerFirst(rangeText(r)))
  const names = shortList([...l.cities, ...l.states, ...l.countries])
  if (ranges.length === 0) return { text: `in ${names.text}`, full: names.full && `in ${names.full}` }
  const within = ranges.join(', or ')
  if (!names.text) return { text: within }
  return { text: `${within}, or ${names.text}`, full: names.full && `${within}, or ${names.full}` }
}

function zoneLines(r: ConditionResult, parts: readonly ZonePart[], facts: SignInFacts, env: SimEnv): EvidenceLine[] {
  const zones = env.library?.zones ?? []
  const many = parts.length > 1
  const lines: EvidenceLine[] = []
  for (const part of parts) {
    const zone: Zone | undefined = zones.find((z) => z.id === part.zoneId)
    const named = (s: string) => (many ? `${part.zoneName} · ${s}` : s)
    const key = `${r.conditionId}:${part.zoneId}`
    if (!zone) {
      lines.push({ key, label: conditionType('zone').label, actual: r.actual, required: named('in zone'), status: part.status })
      continue
    }
    const network = part.network !== 'any' && part.network !== 'not asked' ? part.network : null
    const location = part.location !== 'any' && part.location !== 'not asked' ? part.location : null
    if (network) {
      const entries = shortList([...zone.ip, ...zone.asn])
      const address = facts.network?.address
      /* A typed address that is not one is what is missing, even though one was typed. */
      const missing: FactKey[] = address === undefined || !isAddress(address) ? ['address'] : ['asn']
      lines.push({
        key: `${key}:network`,
        label: 'Network',
        actual: address ?? 'Not stated',
        required: named(`in ${entries.text}`),
        status: network,
        tip: network === 'unknown' ? needs(missing) : entries.full && `In ${entries.full}`,
      })
    }
    if (location) {
      const req = placeRequired(zone.location)
      lines.push({
        key: `${key}:place`,
        label: FACT_WORDS.location,
        actual: placeActual(facts),
        required: named(req.text),
        status: location,
        tip: location === 'unknown' ? needs(['location']) : req.full && sentence(req.full),
      })
    }
    /* A zone that lists nothing on the half asked, or nothing at all: one line with its verdict. */
    if (!network && !location) {
      lines.push({ key, label: conditionType('zone').label, actual: r.actual, required: named(`in ${part.zoneName}`), status: part.status })
    }
  }
  return lines
}

// --- Device profiles ------------------------------------------------------------

/* A check that cannot be told waits on the device, except registration and
   the device limit, which are per person and wait on the person first. */
function checkNeeds(id: string, facts: SignInFacts): FactKey[] {
  if ((id === 'registration' || id === 'limit') && !facts.personId) return ['person']
  return ['device.platform']
}

function profileLines(r: ConditionResult, profiles: readonly ProfileResult[], facts: SignInFacts): EvidenceLine[] {
  const lines: EvidenceLine[] = []
  for (const p of profiles) {
    /* Rows that do not apply to this device are not checks it was asked. */
    const asked = p.checks.filter((c) => c.status !== 'not applicable')
    const passed = asked.filter((c) => c.status === 'pass').length
    lines.push({
      key: `${r.conditionId}:${p.profileId}`,
      label: conditionType('fingerprint').label,
      actual: p.profileName,
      required: `${passed} of ${asked.length} ${asked.length === 1 ? 'check passes' : 'checks pass'}`,
      status: p.status,
      tip: p.status === 'unknown' && !facts.device ? needs(['device.platform']) : undefined,
    })
    for (const c of asked) {
      if (c.status !== 'fail' && c.status !== 'unknown') continue
      lines.push({
        key: `${r.conditionId}:${p.profileId}:${c.id}`,
        label: c.label,
        actual: c.actual,
        required: c.required,
        status: c.status,
        tip: c.status === 'unknown' ? needs(checkNeeds(c.id, facts)) : undefined,
      })
    }
  }
  return lines
}

// --- One condition ----------------------------------------------------------------

/* Everything else is one line, in the catalogue's own label. An undecided line
   with no fact that could settle it — a condition the model has no reading
   for — carries the trace's own reason instead. */
function oneLine(r: ConditionResult): EvidenceLine {
  const tip = r.status === 'unknown' ? (needs(r.missing) ?? sentence(r.detail)) : r.caveat
  return { key: r.conditionId, label: conditionType(r.typeId).label, actual: r.actual, required: r.required, status: r.status, ...(tip ? { tip } : null) }
}

/** One condition's lines. `condition` is the rule's own, for its operator. */
export function conditionLines(r: ConditionResult, condition: Pick<Condition, 'operator'> | undefined, facts: SignInFacts, env: SimEnv): EvidenceLine[] {
  const op = condition?.operator
  if (r.typeId === 'zone' && op === 'in zone' && r.zones && r.zones.length > 0) return zoneLines(r, r.zones, facts, env)
  if (r.typeId === 'fingerprint' && op === 'matches' && r.profiles && r.profiles.length > 0) return profileLines(r, r.profiles, facts)
  return [oneLine(r)]
}

// --- A rule, and a policy -----------------------------------------------------------

/** One rule's card: its word, and its lines when it was asked — the who first, then each condition in card order. */
export function ruleEvidence(rule: Rule, step: RuleTrace | undefined, facts: SignInFacts, env: SimEnv): CardEvidence {
  const { word, state } = ruleWordOf(step)
  if (!step || state === 'off' || state === 'not-reached') return { word, state, lines: [] }
  const byId = new Map(leaves(rule.when).map((c) => [c.id, c]))
  const who = whoLine(rule, step, facts, env)
  return {
    word,
    state,
    lines: [...(who ? [who] : []), ...step.conditions.flatMap((r) => conditionLines(r, byId.get(r.conditionId), facts, env))],
  }
}

/* Every card of a policy against one trace, by rule id, and the last row under
   `LAST_ROW`. A policy that is not the one deciding has no trace here, and every
   card reads Not reached — the sign-in never met it. */
export function evidenceOf(policy: Pick<Policy, 'rules'>, trace: PolicyTrace | null, facts: SignInFacts, env: SimEnv): Record<string, CardEvidence> {
  const out: Record<string, CardEvidence> = {}
  for (const rule of policy.rules) {
    const step = trace?.steps.find((s) => s.ruleId === rule.id)
    out[rule.id] = ruleEvidence(rule, step, facts, env)
  }
  out[LAST_ROW] = { ...lastRowWordOf(trace), lines: [] }
  return out
}
