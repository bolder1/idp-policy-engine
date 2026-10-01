import { FALLBACK_NAME, zoneScopeOf, type AccessDecision, type Policy, type PolicyStatus, type Rule } from '../../data'
import { DECISION_PHRASE, DECISION_WORDS, decisionsOr, factWords } from '../../decision-words'
import { cardJoin, leaves, topJoin } from '../../predicate'
import type { SavedSignIn } from '../../saved-sign-ins'
import { incompleteLine, type DecisionView } from '../board/try-sign-in'
import { personOf, type ConditionResult, type RuleTrace, type SignInFacts, type SimEnv } from '../simulate'
import { tierOf, type StandingKind, type TenantResolution } from '../tenant-resolver'
import { LAST_ROW, conditionLines, lineText, placeActual, whoLine, type EvidenceLine, type LineStatus } from '../testing/evidence'
import { policiesOn, type RowsLibrary } from '../testing/rows-read'
import type { FormField, SignInForm } from '../testing/sign-in-form'
import { tokenValue, type SentenceContext } from '../testing/sign-in-sentence'
import { conditionRequirement, nameLookupOf, outcomeOf, whoRequirement, type NameLookup, type PillCategory, type Requirement } from '../testing/trace-pills'
import { whichPolicyRows, type WhichRowKind } from '../testing/which-policy'
import { differingWatch } from '../watching-words'

/* -----------------------------------------------------------------------------
   Try a sign-in on the Sign-in tests page, as an ENGINE RUN (TESTING-V4 §8).

   The owner found a journey that was already drawn when the page opened "too
   overwhelming". The answer is to let the engine do its work in front of the
   admin, one step at a time, and let the loading BE the explanation:

     it finds the policy     each policy on the application, in the order the
                             engine asks them, until the one that decides
     it checks the rules     the deciding policy's rules in order, each rule's
                             checks one row at a time, the first failing check
                             ending that rule — first match wins, drawn
     it decides              the answer lands

   This file is the plan, and nothing else: from the resolver's answer
   (`resolveSignIn`) and the tenant, the rows each column holds and the ordered
   steps the canvas plays, each with the words the engine line says while it
   runs. The component only plays it (TryJourney.tsx). Nothing here decides
   anything: which policy is the resolver's `decidedBy`, where each stands is
   its `standings`, each rule's match is its trace. The steps are the order
   those answers are SHOWN in — which is why it is tested for parity with the
   resolver on the whole showcase tenant (engine-run.test.ts).

   Checks with hierarchy (§8.4). A rule's checks are grouped by category — Who,
   Network, Place, Device, Time, Risk — one row each in the rule's order, so a
   device profile with nine checks is ONE row whose sub-checks open in place,
   and "Mon–Fri" and "09:00–18:00" are one Time row. The row's standing is its
   conditions', never its evidence lines': a zone condition naming two zones
   passes when either does, which a row built from the lines would get wrong.

   First match wins, literally. The engine reads a rule's rows in order and
   the first that fails ends the rule — "No match", the failing row kept,
   "2 not checked" for the rest. That short cut is exact only when the rule is
   one run of ANDs, which is every rule the editor writes and every rule in the
   showcase; a rule of alternatives ("this card or that one") is read whole,
   every row checked, and its standing is the trace's.
   -------------------------------------------------------------------------- */

// --- Nodes -----------------------------------------------------------------------------

/* Every box the canvas measures, by id. A rule card is `rule:{rule id}`, and
   the last row is `rule:fallback` (evidence.ts files it under `LAST_ROW`). */
export type NodeId = 'sign-in' | 'outcome' | `policy:${string}` | `rule:${string}`

export const policyNode = (policyId: string): NodeId => `policy:${policyId}`
export const ruleNode = (ruleId: string): NodeId => `rule:${ruleId}`

// --- The model --------------------------------------------------------------------------

/** One policy that could govern this application, as its row in the Which policy column. */
export interface EnginePolicy {
  policyId: string
  node: NodeId
  name: string
  status: PolicyStatus
  kind: WhichRowKind
  /** "Switched off", "Not in this policy", "Checked after Developer tools"; '' on the one that decides. */
  reason: string
  /** The resolver's own sentence, for the tooltip. */
  tip: string
  decides: boolean
  isGlobalDefault: boolean
  /** The scan stops on it: every policy up to and including the one that decides. */
  scanned: boolean
  /** The step it is scanned at, or null when the scan never reaches it. */
  scanAt: number | null
  /** The step it settles at — dimmed with its reason, or lit. */
  settleAt: number
}

/** A sub-check under a row: a device profile's own checks, a zone's two halves. */
export interface SubCheck {
  key: string
  label: string
  actual: string
  required: string
  status: LineStatus
}

/** One row of checks in a rule card: one category. */
export interface CheckRow {
  key: string
  category: PillCategory
  /** "Network", "Device": the category, said. */
  word: string
  /** What the rule asks for: "Corporate offices", "Mon–Fri 09:00–18:00", "Below 40". */
  requirement: string
  /** What this sign-in showed: "Office network", "Windows 11 laptop · registered", or "Not stated". */
  value: string
  status: LineStatus
  /** The fact is not stated, so the row offers Add: the card's field that states it. */
  missing: FormField | null
  subs: SubCheck[]
  /** The evidence, whole: every line's "actual · required" and its tip. */
  tip: string
  /** The engine line while this row is checked: "Network · Office network is in Corporate offices". */
  say: string
}

/*   match        every row passed: the rule decides
     no-match     a row failed
     unknown      no row failed and one could not be told: the walk goes on
                  past it (the definite reading), and the answer Depends
     off          switched off: passed on the way, nothing asked
     not-reached  after the rule that decided */
export type RuleState = 'match' | 'no-match' | 'unknown' | 'off' | 'not-reached'

export interface EngineRule {
  /** The rule's id, or `LAST_ROW` for "Nothing else matched". */
  id: string
  node: NodeId
  /** 0-based position in the policy; null for the last row. */
  index: number | null
  name: string
  /** Its THEN. */
  decision: AccessDecision
  state: RuleState
  /** Every row of the rule, in its order. */
  checks: CheckRow[]
  /** How many rows the engine reads before the rule is settled: to the first failure, or all. */
  checked: number
  /** The row that ended it, or null. */
  failing: number | null
  /** One run of ANDs: the first failing row ends it. */
  shortCircuit: boolean
  /** The engine walks into it and reads it. */
  visited: boolean
  startAt: number
  endAt: number
  /** The step each read row is checked at, `checked` of them. */
  checkAt: number[]
}

export interface EngineOutcome {
  status: TenantResolution['status']
  decision: AccessDecision | null
  possible: AccessDecision[]
  policyId: string | null
  policyName: string | null
  /** "Rule 2 · In the office", "Nothing else matched", or ''. */
  ruleLine: string
  /** "Decided by {policy} · Rule 2 · {rule}", or what is missing. */
  why: string
  /** The board's outcome node takes this (TracePills.tsx `OutcomeNode`). */
  view: DecisionView
}

export type StepKind = 'fill' | 'collapse' | 'find' | 'scan' | 'decides' | 'rules' | 'rule' | 'check' | 'rule-end' | 'deciding' | 'outcome' | 'done'

export interface EngineStep {
  kind: StepKind
  /** The engine line while this step runs. */
  text: string
  /** A new stage: what the status region says aloud as it starts. Checks are never said. */
  stage?: string
  /** Which policy row, rule or check row it works on. */
  policy?: number
  rule?: number
  check?: number
  /** A rule that is switched off is passed quickly. */
  quick?: boolean
}

/** How a run starts: the card filled first (a saved sign-in, a suggestion), the card collapsing (Run), or neither (Replay). */
export type Intro = 'fill' | 'collapse' | 'none'

export interface EngineRun {
  /** No person or no application: there is nothing to run. */
  empty: boolean
  appName: string
  /** The application's policies and the Global Default, in the order the engine asks them. */
  policies: EnginePolicy[]
  decider: { id: string; name: string; isGlobalDefault: boolean } | null
  /** The deciding policy's rules, then "Nothing else matched". */
  rules: EngineRule[]
  /** Index into `rules` of where the walk stopped, or null when no policy decides. */
  landing: number | null
  outcome: EngineOutcome
  steps: EngineStep[]
  /** Step indices: the Which policy column appears, the Rules column appears, the answer lands, the run is done. */
  at: { which: number; decides: number; rules: number; outcome: number; done: number }
  /** "Checked 2 policies · 1 rule · 4 checks": the engine line once it is done. */
  summary: string
}

export interface EngineInput {
  res: TenantResolution
  policies: readonly Policy[]
  form: SignInForm
  facts: SignInFacts
  env: SimEnv
  /** The tenant the values are said against: people, applications, zones. */
  ctx: SentenceContext
  names?: NameLookup
  intro?: Intro
}

// --- Words ------------------------------------------------------------------------------

export const CATEGORY_WORD: Record<PillCategory, string> = {
  who: 'Who',
  network: 'Network',
  place: 'Place',
  device: 'Device',
  time: 'Time',
  risk: 'Risk',
  app: 'Application',
  other: 'Check',
}

export const NOT_STATED_WORD = 'Not stated'

const capital = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/* The row's words, few. The resolver's reasons are sentences written for a
   list with room; a row in a 230 px column says the gist, and the sentence is
   its tooltip. */
function whichReason(
  kind: WhichRowKind,
  standing: StandingKind | undefined,
  decider: string | null,
  watched: { decision: AccessDecision | null; possible: { decision: AccessDecision }[] } | null,
): string {
  switch (kind) {
    case 'decides':
      return ''
    case 'watching':
      if (!watched) return 'Only watching'
      return watched.decision ? `Would ${DECISION_PHRASE[watched.decision]}` : `Would ${decisionsOr(watched.possible.map((o) => o.decision)).toLowerCase()}`
    case 'waiting':
      return standing === 'draft' ? 'Not turned on yet' : 'Switched off'
    default:
      if (standing === 'not-in-audience') return 'Not in this policy'
      return decider ? `Checked after ${decider}` : 'Another policy applies'
  }
}

/* The lookup a row names zones, profiles, groups and people by: the caller's
   (the store's `useNameLookup`), else one from the env's own library, else the
   env's name functions. */
function namesOf(env: SimEnv): NameLookup {
  const lib = env.library
  if (lib) return nameLookupOf({ zones: lib.zones, fingerprints: lib.fingerprints, groups: lib.groups, users: lib.people })
  return (kind, id) => {
    if (kind === 'zone') return env.zoneName(id)
    if (kind === 'fingerprint') return env.fingerprintName(id)
    if (kind === 'group') return env.groupName(id)
    if (kind === 'user') return env.userName?.(id)
    return undefined
  }
}

// --- Checks, by category ----------------------------------------------------------------------

/** One condition (or the who), before rows of one category are put together. */
interface Unit {
  key: string
  req: Requirement
  status: LineStatus
  lines: EvidenceLine[]
  subs: SubCheck[]
}

/* The sign-in's own value for a category, as the card states it: the origin's
   name rather than its address, the device preset rather than its facts. */
function valueOf(category: PillCategory, form: SignInForm, facts: SignInFacts, ctx: SentenceContext, lines: readonly EvidenceLine[]): { value: string; missing: FormField | null } {
  const said = (t: Parameters<typeof tokenValue>[0]) => {
    const v = tokenValue(t, form, ctx)
    return v.unset ? null : v.text
  }
  switch (category) {
    case 'who': {
      const v = said('person')
      return v ? { value: v, missing: null } : { value: NOT_STATED_WORD, missing: 'person' }
    }
    case 'network': {
      const address = form.address.trim()
      if (!address) return { value: NOT_STATED_WORD, missing: 'address' }
      const v = said('from')
      return { value: v ?? address, missing: null }
    }
    case 'place': {
      const place = placeActual(facts)
      if (place === 'Not stated') return { value: NOT_STATED_WORD, missing: 'address' }
      return { value: place, missing: null }
    }
    case 'device': {
      const v = said('device')
      return v ? { value: v, missing: null } : { value: NOT_STATED_WORD, missing: 'device' }
    }
    case 'time': {
      const v = said('when')
      return v ? { value: v, missing: null } : { value: NOT_STATED_WORD, missing: 'when' }
    }
    case 'risk': {
      const v = form.risk.trim()
      return v ? { value: v, missing: null } : { value: NOT_STATED_WORD, missing: 'risk' }
    }
    default:
      return { value: lines[0]?.actual ?? '', missing: null }
  }
}

/* The engine line while a row is read. Plain words, the relation said the way
   an admin would: "Network · Office network is in Corporate offices", "Device ·
   Windows 10 laptop does not meet Compliant devices", "Risk · 86 is not below
   71". A fact left unstated is said so, and nothing else. */
function sayOf(word: string, value: string, status: LineStatus, category: PillCategory, req: Pick<Requirement, 'core' | 'negated'>): string {
  if (status === 'unknown') return value === NOT_STATED_WORD ? `${word} · not stated` : `${word} · ${value}, can't tell`
  const pass = status === 'pass'
  const inside = pass !== req.negated
  switch (category) {
    case 'device':
      return `${word} · ${value} ${inside ? 'meets' : 'does not meet'} ${req.core}`
    case 'time':
      return `${word} · ${value} is ${inside ? 'in' : 'outside'} ${req.core}`
    case 'risk':
      return `${word} · ${value} is ${pass ? '' : 'not '}${req.core}`
    case 'app':
    case 'other':
      return `${word} · ${req.core} ${pass ? 'passes' : 'fails'}`
    default:
      return `${word} · ${value} is ${inside ? 'in' : 'not in'} ${req.core}`
  }
}

/* A condition's sub-checks: a zone's halves when it has two lines, a device
   profile's checks (every one it asked, not only the failures — the row is
   where to see what passed). One line is the row itself, and has none. */
function subsOf(r: ConditionResult, lines: readonly EvidenceLine[]): SubCheck[] {
  if (r.typeId === 'fingerprint' && r.profiles && r.profiles.length > 0) {
    const many = r.profiles.length > 1
    return r.profiles.flatMap((p) =>
      p.checks
        .filter((c) => c.status !== 'not applicable')
        .map((c) => ({
          key: `${r.conditionId}:${p.profileId}:${c.id}`,
          label: many ? `${p.profileName} · ${c.label}` : c.label,
          actual: c.actual,
          required: c.required,
          status: c.status as LineStatus,
        })),
    )
  }
  if (lines.length < 2) return []
  return lines.map((l) => ({
    key: l.key,
    label: l.label === 'Network' ? 'IP address' : l.label,
    actual: l.actual,
    required: l.required,
    status: l.status,
  }))
}

const worst = (s: readonly LineStatus[]): LineStatus => (s.includes('fail') ? 'fail' : s.includes('unknown') ? 'unknown' : 'pass')

/* One run of ANDs: the who is always ANDed with the WHEN, and the WHEN is one
   bracket when every card is an AND-run and the cards are ANDed too (or there
   is only one). A rule of alternatives is anything else. */
export function allAnd(rule: Pick<Rule, 'when'>): boolean {
  const cards = rule.when.cards
  if (!cards.every((k) => cardJoin(k) === 'and')) return false
  return cards.length <= 1 || topJoin(rule.when) === 'and'
}

/* The requirement a row says, from its conditions'. Time reads as one
   window ("Mon–Fri 09:00–18:00"), risk as its bounds ("Above 39 and below
   71" — the row's word already says Risk), the rest as a list. */
function rowRequirement(category: PillCategory, units: readonly Unit[]): Pick<Requirement, 'core' | 'negated'> & { text: string } {
  if (units.length === 1) {
    const r = units[0].req
    if (category === 'risk') return { text: capital(r.core), core: r.core, negated: false }
    return { text: r.text, core: r.core, negated: r.negated }
  }
  if (category === 'risk') {
    const core = units.map((u) => u.req.core).join(' and ')
    return { text: capital(core), core, negated: false }
  }
  const text = units.map((u) => u.req.text).join(category === 'time' ? ' ' : ', ')
  return { text, core: text, negated: false }
}

export function checkRowsOf(
  rule: Rule,
  step: RuleTrace,
  input: Pick<EngineInput, 'form' | 'facts' | 'env' | 'ctx'> & { names: NameLookup },
): { rows: CheckRow[]; shortCircuit: boolean } {
  const { form, facts, env, ctx, names } = input
  const units: Unit[] = []
  const who = whoLine(rule, step, facts, env)
  if (who) units.push({ key: who.key, req: whoRequirement(rule, names), status: who.status, lines: [who], subs: [] })
  const byId = new Map(leaves(rule.when).map((c) => [c.id, c]))
  for (const r of step.conditions) {
    const c = byId.get(r.conditionId)
    if (!c) continue
    const lines = conditionLines(r, c, facts, env)
    units.push({ key: r.conditionId, req: conditionRequirement(c, names), status: r.status, lines, subs: subsOf(r, lines) })
  }

  const shortCircuit = allAnd(rule)
  /* Grouped by category, first appearance first — only where every condition
     is required, since a row's standing is then every one of its conditions
     passing. A rule of alternatives keeps one row per condition. */
  const groups: { category: PillCategory; units: Unit[] }[] = []
  for (const u of units) {
    const g = shortCircuit ? groups.find((x) => x.category === u.req.category) : undefined
    if (g) g.units.push(u)
    else groups.push({ category: u.req.category, units: [u] })
  }

  const rows = groups.map(({ category, units: us }): CheckRow => {
    const word = CATEGORY_WORD[category]
    const req = rowRequirement(category, us)
    const status = worst(us.map((u) => u.status))
    const lines = us.flatMap((u) => u.lines)
    const { value, missing } = valueOf(category, form, facts, ctx, lines)
    const subs =
      us.length > 1
        ? us.map((u) => ({ key: u.key, label: category === 'risk' ? capital(u.req.core) : u.req.text, actual: value, required: '', status: u.status }))
        : us[0].subs
    /* A row of several conditions that failed is said by the one that failed. */
    const failed = us.length > 1 && status === 'fail' ? us.find((u) => u.status === 'fail') : undefined
    const say = failed ? sayOf(word, value, 'fail', category, failed.req) : sayOf(word, value, status, category, req)
    const tip = lines.map((l) => (l.tip ? `${lineText(l)}\n${l.tip}` : lineText(l))).join('\n')
    return {
      key: us[0].key,
      category,
      word,
      requirement: req.text,
      value,
      status,
      missing: status === 'unknown' ? missing : null,
      subs,
      tip,
      say,
    }
  })
  return { rows, shortCircuit }
}

/* How far the engine reads a rule, and what it settles to. The first failing
   row ends a rule of ANDs; otherwise every row is read, and the standing is
   the trace's own. */
export function readRule(rows: readonly CheckRow[], shortCircuit: boolean, match: RuleTrace['match']): { checked: number; failing: number | null; state: 'match' | 'no-match' | 'unknown' } {
  const traced = match === 'yes' ? 'match' : match === 'no' ? 'no-match' : 'unknown'
  if (!shortCircuit) {
    const failing = match === 'no' ? rows.findIndex((r) => r.status === 'fail') : -1
    return { checked: rows.length, failing: failing >= 0 ? failing : null, state: traced }
  }
  const failing = rows.findIndex((r) => r.status === 'fail')
  if (failing >= 0) return { checked: failing + 1, failing, state: 'no-match' }
  return { checked: rows.length, failing: null, state: rows.some((r) => r.status === 'unknown') ? 'unknown' : 'match' }
}

// --- The run -------------------------------------------------------------------------------------

const NOTHING: DecisionView = { status: 'incomplete', decision: null, line: '', outcomes: [], needs: [], watching: [] }

/* The policies on the application in the order the engine asks them: the
   custom-group tier in list order, then the DEFAULT-group tier, then the
   Global Default (tenant-resolver.ts `governingPolicy`). The first of them
   that can govern this person decides; the scan stops there. */
function inEngineOrder<T extends { policyId: string }>(rows: readonly T[], policies: readonly Policy[]): T[] {
  const at = new Map(policies.map((p, i) => [p.id, i]))
  const tier = new Map(policies.map((p) => [p.id, { custom: 0, 'default-group': 1, 'global-default': 2 }[tierOf(p)]]))
  return [...rows].sort((a, b) => (tier.get(a.policyId) ?? 3) - (tier.get(b.policyId) ?? 3) || (at.get(a.policyId) ?? 0) - (at.get(b.policyId) ?? 0))
}

function outcomeOfRun(res: TenantResolution, decider: Policy | null): EngineOutcome {
  const trace = res.trace
  const hit = trace?.hitIndex ?? null
  const hitRule = decider && hit !== null ? decider.rules[hit] : undefined
  const ruleLine = res.status === 'decided' ? (hitRule && hit !== null ? `Rule ${hit + 1} · ${hitRule.name}` : FALLBACK_NAME) : ''
  const needs = factWords((trace?.unknowns ?? []).flatMap((u) => u.missing))
  const policyName = res.decidedBy?.policyName ?? null

  let view: DecisionView = NOTHING
  let why = ''
  if (res.status === 'incomplete') {
    const line = incompleteLine(res)
    view = { ...NOTHING, line }
    why = line
  } else if (res.status === 'decided') {
    view = { status: 'decided', decision: res.decision, line: `${policyName} · ${ruleLine}`, outcomes: [], needs: [], watching: differingWatch(res) }
    why = `Decided by ${policyName} · ${ruleLine}`
  } else {
    /* The rules column numbers the deciding policy's rules, so the outcomes
       name them by number, as the board's do; the last is always the walk past
       every undecided rule — "If not". */
    const outcomes = res.possible.map((o, i, list) => ({
      label: (i === list.length - 1 && list.length > 1) || o.ruleIndex === null ? 'If not' : `If rule ${o.ruleIndex + 1} matches`,
      decision: o.decision,
    }))
    view = { status: 'depends', decision: null, line: policyName ?? '', outcomes, needs, watching: differingWatch(res) }
    why = needs.length > 0 ? `Decided by ${policyName} · Needs: ${needs.join(', ')}` : `Decided by ${policyName}`
  }
  return { status: res.status, decision: res.decision, possible: res.possible.map((o) => o.decision), policyId: res.decidedBy?.policyId ?? null, policyName, ruleLine, why, view }
}

function answerText(o: EngineOutcome): string {
  if (o.status === 'decided' && o.decision) return DECISION_WORDS[o.decision]
  if (o.status === 'depends') return 'Depends'
  return o.view.line || 'No policy decides'
}

export function engineRun(input: EngineInput): EngineRun {
  const { res, policies, facts, env, intro = 'collapse' } = input
  const names = input.names ?? namesOf(env)
  const appId = facts.appId ?? null
  const appName = appId ? (env.appName?.(appId) ?? appId) : ''
  const person = personOf(facts.personId, env)
  const missing = res.missing as readonly string[]
  const empty = !person || !appId || missing.includes('person') || missing.includes('app')

  const decider = res.decidedBy ? (policies.find((p) => p.id === res.decidedBy?.policyId) ?? null) : null
  const outcome = outcomeOfRun(res, decider)
  const steps: EngineStep[] = []
  const push = (s: EngineStep) => steps.push(s) - 1
  const at = { which: -1, decides: -1, rules: -1, outcome: -1, done: -1 }

  if (empty) {
    at.done = push({ kind: 'done', text: outcome.why })
    return { empty, appName, policies: [], decider: null, rules: [], landing: null, outcome, steps, at, summary: outcome.why }
  }

  // --- 1. Finding the policy ---

  const finding = `Finding the policy for ${appName}`
  if (intro === 'fill') push({ kind: 'fill', text: '' })
  if (intro !== 'none') push({ kind: 'collapse', text: finding, stage: finding })
  at.which = push({ kind: 'find', text: finding, ...(intro === 'none' ? { stage: finding } : null) })

  const standing = new Map(res.standings.map((s) => [s.policyId, s.kind]))
  const byId = new Map(policies.map((p) => [p.id, p]))
  const rows = inEngineOrder(whichPolicyRows(res, policies, appId).on, policies)
  const stop = rows.findIndex((r) => r.kind === 'decides')
  const scanTo = stop >= 0 ? stop : rows.length - 1
  const engPolicies: EnginePolicy[] = rows.map((row, i) => {
    const p = byId.get(row.policyId)
    const scanned = i <= scanTo
    return {
      policyId: row.policyId,
      node: policyNode(row.policyId),
      name: row.name,
      status: p?.status ?? 'inactive',
      kind: row.kind,
      /* The scan stops at the one that decides, so one it never reached says so — the order is the reason, and the resolver's sentence is the tooltip. */
      reason: !scanned && row.kind === 'lost' ? 'Not reached' : whichReason(row.kind, standing.get(row.policyId), decider?.name ?? null, row.watched),
      tip: row.reason,
      decides: row.kind === 'decides',
      isGlobalDefault: p?.isSystem === true,
      scanned,
      scanAt: scanned ? push({ kind: 'scan', text: `Checking ${row.name}`, policy: i }) : null,
      settleAt: -1,
    }
  })
  at.decides = push({ kind: 'decides', text: decider ? `${decider.name} decides` : 'No policy decides', ...(stop >= 0 ? { policy: stop } : null) })
  for (const p of engPolicies) p.settleAt = p.scanAt !== null && p.scanAt + 1 < at.decides ? p.scanAt + 1 : at.decides

  // --- 2. Checking the rules ---

  const trace = decider ? res.trace : null
  const engRules: EngineRule[] = []
  let landing: number | null = null
  const pending: EngineRule[] = []
  if (decider && trace) {
    const checking = `Checking rules in ${decider.name}`
    at.rules = push({ kind: 'rules', text: checking, stage: checking })
    const ctxNames = { ...input, names }
    decider.rules.forEach((r, i) => {
      const step = trace.steps.find((s) => s.ruleId === r.id)
      const base = { id: r.id, node: ruleNode(r.id), index: i, name: r.name, decision: r.decision }
      if (!step || step.kind === 'unreached') {
        const rule: EngineRule = { ...base, state: 'not-reached', checks: [], checked: 0, failing: null, shortCircuit: allAnd(r), visited: false, startAt: -1, endAt: -1, checkAt: [] }
        engRules.push(rule)
        pending.push(rule)
        return
      }
      if (step.kind === 'off') {
        const s = push({ kind: 'rule', text: `Rule ${i + 1} · switched off`, rule: engRules.length, quick: true })
        engRules.push({ ...base, state: 'off', checks: [], checked: 0, failing: null, shortCircuit: allAnd(r), visited: false, startAt: s, endAt: s, checkAt: [] })
        return
      }
      const { rows: checks, shortCircuit } = checkRowsOf(r, step, ctxNames)
      const read = readRule(checks, shortCircuit, step.match)
      const index = engRules.length
      const startAt = push({ kind: 'rule', text: `Rule ${i + 1} · ${r.name}`, rule: index })
      const checkAt = checks.slice(0, read.checked).map((c, k) => push({ kind: 'check', text: c.say, rule: index, check: k }))
      const endText = read.state === 'match' ? `Rule ${i + 1} matches` : read.state === 'no-match' ? `Rule ${i + 1} · no match` : `Rule ${i + 1} · can't tell`
      const endAt = push({ kind: 'rule-end', text: endText, rule: index })
      engRules.push({ ...base, state: read.state, checks, checked: read.checked, failing: read.failing, shortCircuit, visited: true, startAt, endAt, checkAt })
      if (trace.hitIndex === i) landing = index
    })

    /* The last row: reached when every rule above it missed, under the
       definite reading — the walk the resolver's `hitIndex` is. */
    const lastDecision = outcomeOf(null, decider)
    const lastBase = { id: LAST_ROW, node: ruleNode(LAST_ROW), index: null, name: FALLBACK_NAME, decision: lastDecision, checks: [], checked: 0, failing: null, shortCircuit: true, checkAt: [] }
    if (trace.hitIndex === null && trace.lastRow !== null) {
      const index = engRules.length
      const startAt = push({ kind: 'rule', text: FALLBACK_NAME, rule: index })
      const endAt = push({ kind: 'rule-end', text: `${FALLBACK_NAME} · ${DECISION_WORDS[lastDecision]}`, rule: index })
      engRules.push({ ...lastBase, state: 'match', visited: true, startAt, endAt })
      landing = index
    } else {
      const rule: EngineRule = { ...lastBase, state: 'not-reached', visited: false, startAt: -1, endAt: -1 }
      engRules.push(rule)
      pending.push(rule)
    }
  }

  // --- 3. The outcome ---

  const deciding = push({ kind: 'deciding', text: 'Deciding', stage: 'Deciding' })
  for (const r of pending) {
    r.startAt = deciding
    r.endAt = deciding
  }
  at.outcome = push({ kind: 'outcome', text: answerText(outcome) })

  const scanned = engPolicies.filter((p) => p.scanned).length
  const ruled = engRules.filter((r) => r.visited && r.index !== null).length
  const checks = engRules.reduce((n, r) => n + r.checked, 0)
  const summary = ['Checked ' + plural(scanned, 'policy', 'policies'), ruled > 0 ? plural(ruled, 'rule', 'rules') : null, checks > 0 ? plural(checks, 'check', 'checks') : null]
    .filter(Boolean)
    .join(' · ')
  at.done = push({ kind: 'done', text: summary })

  return {
    empty,
    appName,
    policies: engPolicies,
    decider: decider ? { id: decider.id, name: decider.name, isGlobalDefault: decider.isSystem === true } : null,
    rules: engRules,
    landing,
    outcome,
    steps,
    at,
    summary,
  }
}

// --- Pace ------------------------------------------------------------------------------------------

/* How long each step holds, at full pace, in ms. The fixed beats — the card
   collapsing, a column arriving, the answer landing — keep their length; the
   rows' (a policy scanned, a rule opened, a check read, a rule settled) share
   what is left of the budget, so a policy with many checks reads faster rather
   than longer. */
const BASE_MS: Record<StepKind, number> = {
  fill: 360,
  collapse: 380,
  find: 300,
  scan: 240,
  decides: 320,
  rules: 260,
  rule: 170,
  check: 190,
  'rule-end': 220,
  deciding: 300,
  outcome: 440,
  done: 0,
}

const ROW_STEPS: ReadonlySet<StepKind> = new Set(['scan', 'rule', 'check', 'rule-end'])

/** The whole of a full-pace run, the card's own fill aside, is at most this. */
export const CAP_MS = 4200
/** Rows never read faster than this share of their pace: a check under ~110 ms is not seen. */
export const MIN_ROW_SHARE = 0.58
/** A run started by editing the sign-in plays at this share. */
export const EDIT_SHARE = 0.6

export type Pace = 'full' | 'edit' | 'instant'

export interface Timeline {
  /** When each step starts, ms from the start. */
  at: number[]
  /** How long each holds. */
  dur: number[]
  total: number
}

export function timeline(steps: readonly EngineStep[], pace: Pace): Timeline {
  if (pace === 'instant') return { at: steps.map(() => 0), dur: steps.map(() => 0), total: 0 }
  const base = steps.map((s) => BASE_MS[s.kind] * (s.quick ? 0.6 : 1))
  const fixed = steps.reduce((n, s, i) => (ROW_STEPS.has(s.kind) || s.kind === 'fill' ? n : n + base[i]), 0)
  const rows = steps.reduce((n, s, i) => (ROW_STEPS.has(s.kind) ? n + base[i] : n), 0)
  const share = rows > 0 ? Math.min(1, Math.max(MIN_ROW_SHARE, (CAP_MS - fixed) / rows)) : 1
  const mult = pace === 'edit' ? EDIT_SHARE : 1
  const dur = steps.map((s, i) => Math.round(base[i] * (ROW_STEPS.has(s.kind) ? share : 1) * mult))
  const at: number[] = []
  let t = 0
  for (const d of dur) {
    at.push(t)
    t += d
  }
  return { at, dur, total: t }
}

// --- The state of a thing at a step ----------------------------------------------------------------

export type RowPhase = 'waiting' | 'working' | 'settled'

/** A policy row at step `s`: a skeleton, being checked, or settled. */
export function policyPhase(p: Pick<EnginePolicy, 'scanAt' | 'settleAt'>, s: number): RowPhase {
  if (s >= p.settleAt) return 'settled'
  if (p.scanAt !== null && s >= p.scanAt) return 'working'
  return 'waiting'
}

/** A rule card at step `s`: a skeleton, open with its checks arriving, or settled from its rule-end on. */
export function rulePhase(r: Pick<EngineRule, 'startAt' | 'endAt'>, s: number): RowPhase {
  if (r.startAt < 0 || s < r.startAt) return 'waiting'
  return s < r.endAt ? 'working' : 'settled'
}

/** A check row at step `s`: not there yet, its spinner turning, or its mark. */
export function checkPhase(r: Pick<EngineRule, 'checkAt'>, k: number, s: number): 'hidden' | 'working' | 'settled' {
  const at = r.checkAt[k]
  if (at === undefined || s < at) return 'hidden'
  return s === at ? 'working' : 'settled'
}

// --- Stage 0: what the card asks ---------------------------------------------------------------------

export type AskedField = 'from' | 'place' | 'device' | 'when' | 'risk'

/* Which rules read each fact the card can ask, as the TipDot on the field's
   label says it: "Read by Developer tools — office and device checks · Rules
   1, 2". The rules asked are rows-read.ts's own: every enabled rule of every
   app access policy on the application, the Global Default's included. */
export function readersOf(policies: readonly Policy[], appId: string | null, lib: RowsLibrary): Record<AskedField, string> {
  const by: Record<AskedField, Map<string, number[]>> = { from: new Map(), place: new Map(), device: new Map(), when: new Map(), risk: new Map() }
  const note = (f: AskedField, policy: string, n: number) => {
    const list = by[f].get(policy) ?? []
    if (!list.includes(n)) list.push(n)
    by[f].set(policy, list)
  }
  for (const p of policiesOn(policies, appId)) {
    p.rules.forEach((r, i) => {
      if (!r.enabled) return
      for (const c of leaves(r.when)) {
        switch (c.typeId) {
          case 'zone':
            for (const id of c.values) {
              const scope = zoneScopeOf(c, id)
              const zone = lib.zones.find((z) => z.id === id)
              const l = zone?.location
              const hasPlace = l ? l.countries.length + l.states.length + l.cities.length + l.ranges.length > 0 : false
              if (scope !== 'location') note('from', p.name, i + 1)
              if (scope !== 'ip' && hasPlace) note('place', p.name, i + 1)
            }
            break
          case 'country':
          case 'state':
          case 'city':
            note('place', p.name, i + 1)
            break
          case 'time':
          case 'day':
            note('when', p.name, i + 1)
            break
          case 'device-risk':
            note('risk', p.name, i + 1)
            break
          case 'fingerprint':
            note('device', p.name, i + 1)
            break
        }
      }
    })
  }
  const said = (m: Map<string, number[]>): string => {
    if (m.size === 0) return ''
    const parts = [...m.entries()].map(([name, ns]) => `${name} · ${ns.length === 1 ? 'Rule' : 'Rules'} ${ns.join(', ')}`)
    const shown = parts.slice(0, 2).join('; ')
    return `Read by ${shown}${parts.length > 2 ? ` +${parts.length - 2}` : ''}`
  }
  return { from: said(by.from), place: said(by.place), device: said(by.device), when: said(by.when), risk: said(by.risk) }
}

/* Three saved sign-ins that take different paths — one allowed on one
   factor, one stepped up, one denied — for the chips under the empty card.
   Judged as the tenant stands; a sign-in some app policy decides is chosen
   over one the Global Default does, because its run has more to show. */
export function suggestionsOf(saved: readonly SavedSignIn[], judge: (s: SavedSignIn) => TenantResolution): SavedSignIn[] {
  const judged = saved.filter((s) => !s.generated).map((s) => ({ s, res: judge(s) }))
  const out: SavedSignIn[] = []
  for (const d of ['1fa', '2fa', 'deny'] as const) {
    const fits = judged.filter((j) => j.res.status === 'decided' && j.res.decision === d && !out.includes(j.s))
    const pick = fits.find((j) => j.res.decidedBy && !j.res.decidedBy.isGlobalDefault) ?? fits[0]
    if (pick) out.push(pick.s)
  }
  return out
}
