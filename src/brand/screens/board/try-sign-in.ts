import { FALLBACK_NAME, enforces, memberGroupIds, type AccessDecision, type Condition, type Policy, type Rule, type Zone } from '../../data'
import { CANT_TELL, DECISION_WORDS, decisionsOr, factWords } from '../../decision-words'
import type { AuthMethod } from '../../methods'
import { PLACES, searchPlaces, type PlaceKind } from '../../places'
import { differsFromLive } from '../../policy-draft'
import { leaves } from '../../predicate'
import { FACTOR_RANK, ruleFactor } from '../factor-strength'
import { personOf, type ConditionResult, type RuleTrace, type SignInDevice, type SignInFacts, type SimEnv } from '../simulate'
import { resolveSignIn, type TenantResolution, type WatchedResult } from '../tenant-resolver'
import { LAST_ROW, evidenceOf, lineText, CONDITION_WORDS, type CardEvidence } from '../testing/evidence'
import { deviceFactsOf, withDevice } from '../testing/sign-in-fields'
import { CHANGED_BY_WORDS, factsOf, type FormField, type SignInForm } from '../testing/sign-in-form'
import { differingWatch, watchingSentence } from '../watching-words'
import { classifyIp, ipInEntry, ipv4Number } from '../zone-validation'
import { patchRule } from './model'

/* -----------------------------------------------------------------------------
   Try a sign-in, on the board: the model under the panel and the chain.

   One sign-in, stated in the panel, is run through the whole tenant — every
   policy in the list, not just the one on the board — because the question an
   admin is asking is "what happens to Kavya on HRMS", and the answer can be
   "another policy decides". The board then shows that run twice over: as
   columns in the panel (today, and the version on the board), and as a route
   down the chain on the left, stage by stage, to where it lands.

   Pure, and in one file, so every sentence the board says about a sign-in can
   be pinned without drawing it. What is shared with Policy testing — the form,
   the rows, the evidence words, the rulers, the pages — lives in
   screens/testing/; what is only the board's lives here:

     columns      which versions sit side by side (`columnsFor`), and the
                  resolution for each (`runColumns`)
     route        the stages the marker travels, where it lands, and what each
                  gate and card says (`routeOf`)
     would change what one different fact, or one stricter edit, would do
                  (`wouldChangeIf`)
     words        what the status region says: a run, an update, a step

   Nothing here decides anything. Every answer is the resolver's, so the board
   can never say a thing about a sign-in that Policy testing would not.
   -------------------------------------------------------------------------- */

// --- The columns ---------------------------------------------------------------

export type ColumnId = 'live' | 'edits' | 'today' | 'stored' | 'draft'

export interface ColumnSpec {
  id: ColumnId
  label: string
  tip: string
  /** Evaluated in place of the stored policy, as though it were on. */
  substitute?: Policy
  /** A draft with no application, run as though it covered this one. */
  asIfApp?: string
}

export interface ColumnResult {
  spec: ColumnSpec
  resolution: TenantResolution
}

const LIVE: ColumnSpec = { id: 'live', label: 'Live', tip: 'Decides sign-ins now' }
const edits = (draft: Policy): ColumnSpec => ({ id: 'edits', label: 'Your edits', tip: 'The rules on this board, as if saved', substitute: draft })

/* Two versions side by side, by the version table (final spec, A.5).

   A policy that is on has one column while nothing on the board differs from
   it — Live — and a second, Your edits, once something does. A policy that is
   not on never decides a sign-in as it stands, so its left column is what
   decides them Today, and its right is the policy as though it were on: its
   stored rules, or the ones on the board. A monitoring policy is "not on" in
   the same sense; it checks sign-ins and decides none.

   `draft` is the builder's, with the policy's name, applications and audience
   already laid over it from the store. */
export function columnsFor(saved: Policy, draft: Policy, appId: string | null): ColumnSpec[] {
  const edited = differsFromLive(saved, draft)
  const today: ColumnSpec = {
    id: 'today',
    label: 'Today',
    tip: saved.status === 'monitor' ? 'Decides sign-ins now; this policy is monitoring' : 'Decides sign-ins now; this policy is off',
  }
  if (saved.status === 'draft') {
    /* A draft with no application reaches no sign-in, so it is asked as though
       it covered the one being tried — and the column says so. */
    const needsApp = draft.appIds.length === 0 && !draft.isSystem && appId !== null
    return [
      today,
      {
        id: 'draft',
        label: 'Draft',
        tip: 'This draft, as if turned on',
        substitute: needsApp ? { ...draft, appIds: [appId] } : draft,
        ...(needsApp ? { asIfApp: appId } : null),
      },
    ]
  }
  if (enforces(saved)) return edited ? [LIVE, edits(draft)] : [LIVE]
  if (edited) return [today, edits(draft)]
  /* The stored rules as though on. A monitor is set to active for the question
     (the resolver would otherwise only watch it); an inactive policy needs
     nothing, because a substitute counts as enforcing whatever its status. */
  const stored = saved.status === 'monitor' ? { ...saved, status: 'active' as const } : saved
  return [today, { id: 'stored', label: 'Stored version', tip: 'This policy’s saved rules, as if turned on', substitute: stored }]
}

/* The version the panel's other views judge by (final spec, B V3): Check a
   person and Saved sign-ins, in Version 3. The same as the right-hand column,
   so a person's HRMS row never says one thing while Try says another beside
   it — Your edits whenever the board holds changes, the stored rules as
   though on for a policy that is off or monitoring, the draft for a draft.
   Null for a live policy with nothing changed: the tenant as it stands.

   Asked with no application: those views go across applications, so a draft
   with none of its own is not run as though it covered the one being tried. */
export function boardVersion(saved: Policy, draft: Policy): { substitute: Policy; label: string; tip: string } | null {
  const right = columnsFor(saved, draft, null).at(-1)
  return right?.substitute ? { substitute: right.substitute, label: right.label, tip: right.tip } : null
}

export function runColumns(specs: readonly ColumnSpec[], policies: readonly Policy[], facts: SignInFacts, env: SimEnv): ColumnResult[] {
  return specs.map((spec) => ({ spec, resolution: resolveSignIn(policies, facts, env, spec.substitute ? { substitute: spec.substitute } : {}) }))
}

const NO_WATCH: readonly WatchedResult[] = []

/* What monitoring policies would decide as the tenant stands — Today's — for
   the Which policy list, where a monitoring policy asked as though on keeps
   its pill and says what it would decide. Only beside the Stored version:
   there the policy standing in IS the monitor's stored rules, so Today's
   would-be decision and the row's own agree. Beside Your edits the row
   decides by the edits, and the stored rules' "Would allow with 2FA" next to
   a Decision of Deny would contradict the chain. */
export function standingWatch(cols: readonly ColumnResult[]): readonly WatchedResult[] {
  return cols.length > 1 && cols.at(-1)?.spec.id === 'stored' ? cols[0].resolution.watching : NO_WATCH
}

// --- Which rule, in words ------------------------------------------------------------

/* The policy a resolution was decided by, as evaluated: the substitute when it
   stood in, the stored one otherwise. */
function policyOf(res: TenantResolution, policies: readonly Policy[], substitute?: Policy): Policy | undefined {
  const id = res.decidedBy?.policyId
  if (!id) return undefined
  return substitute?.id === id ? substitute : policies.find((p) => p.id === id)
}

/* The rule that decided, or null for the last row. */
function decidingRule(res: TenantResolution, policies: readonly Policy[], substitute?: Policy): { rule: Rule | null; index: number | null } {
  const index = res.trace?.hitIndex ?? null
  const p = policyOf(res, policies, substitute)
  return { rule: index === null || !p ? null : (p.rules[index] ?? null), index }
}

/* "Rule 1 · In a corporate office" on this policy, where a number means
   something to the reader; another policy's rule by its name alone, because
   "Rule 1" of a policy that is not on the board points at nothing on screen.
   The last row is "Nothing else matched" on either. */
export function ruleLine(res: TenantResolution, draftId: string, policies: readonly Policy[], substitute?: Policy): string {
  if (!res.decidedBy) return ''
  const { rule, index } = decidingRule(res, policies, substitute)
  if (index === null || !rule) return FALLBACK_NAME
  return res.decidedBy.policyId === draftId ? `Rule ${index + 1} · ${rule.name}` : rule.name
}

/* What stands in for a decision while none can be read. */
export function incompleteLine(res: Pick<TenantResolution, 'missing'>): string {
  const missing = res.missing as readonly string[]
  if (missing.includes('a global default policy')) return 'No policy decides'
  const person = missing.includes('person')
  const app = missing.includes('app')
  if (person && app) return 'Choose a person and an application'
  if (app) return 'Choose an application'
  return 'Choose a person'
}

/** One column, as the panel prints it: version, policy, rule, and the answer. */
export interface ColumnView {
  id: ColumnId
  label: string
  tip: string
  status: TenantResolution['status']
  policyName: string | null
  /** The rule line, or what is missing. "As if on {App}" leads it for a draft with no application. */
  line: string
  decision: AccessDecision | null
  /** The decisions it could reach, in rule order, when it cannot be told. */
  possible: AccessDecision[]
}

export function columnView(col: ColumnResult, draftId: string, policies: readonly Policy[], appName: (id: string) => string): ColumnView {
  const res = col.resolution
  const asIf = col.spec.asIfApp ? `As if on ${appName(col.spec.asIfApp)} · ` : ''
  const base = { id: col.spec.id, label: col.spec.label, tip: col.spec.tip, status: res.status }
  if (res.status === 'incomplete') return { ...base, policyName: null, line: incompleteLine(res), decision: null, possible: [] }
  const rule = res.status === 'decided' ? ruleLine(res, draftId, policies, col.spec.substitute) : ''
  return {
    ...base,
    policyName: res.decidedBy?.policyName ?? null,
    line: `${asIf}${rule}`.replace(/ · $/, ''),
    decision: res.decision,
    possible: res.possible.map((o) => o.decision),
  }
}

// --- The route --------------------------------------------------------------------

/* The stages the marker can stand on, in chain order. The Decision is not one:
   the marker stops where the sign-in lands, and the Decision gate is what that
   landing says. */
export type StageId = 'sign-in' | 'policy' | 'who' | `rule:${string}` | 'last-row'

export const ruleStage = (ruleId: string): StageId => `rule:${ruleId}`

export type GateState = 'pass' | 'fail' | 'unknown'

export interface GateView {
  value: string
  word: string
  state: GateState
}

export interface DecisionView {
  status: TenantResolution['status']
  decision: AccessDecision | null
  /** "{Policy} · {rule line}", or what is missing. */
  line: string
  /** When it cannot be told: one line per outcome, "If rule 1 matches" … "If not". */
  outcomes: { label: string; decision: AccessDecision }[]
  /** What would settle it, in the rows' own words. */
  needs: string[]
  /** Monitors that, on, would decide this sign-in themselves, and differently. */
  watching: WatchedResult[]
}

export interface RouteModel {
  stages: StageId[]
  /** Index into `stages` where the marker stops. */
  landing: number
  /** Stops because the facts do not say which way: a hollow ring. */
  landingUnknown: boolean
  signIn: string
  policy: GateView & { decides: boolean }
  who: GateView
  /** Each card's evidence, by rule id, and the last row under `LAST_ROW`. */
  cards: Record<string, CardEvidence>
  decision: DecisionView
  /** What each stage says, as a string: a stage whose text changed is the one that fades. */
  sig: Record<string, string>
}

/* "Kavya Menon" — the start node's caption, and what a step onto it says: who
   is signing in, '' until somebody is chosen. Only who. The address is in its
   own row and on the Network line, and the time in When when a rule reads one
   — and not at all when none does, though the form always holds 09:30 — so a
   caption that restated them would say a number a third time, or show one the
   admin cannot find to change. */
export function signInSummary(facts: SignInFacts, env: SimEnv): string {
  return personOf(facts.personId, env)?.name ?? ''
}

function policyGate(res: TenantResolution, draftId: string): GateView & { decides: boolean } {
  if (res.status === 'incomplete') {
    const missing = res.missing as readonly string[]
    const value = missing.includes('a global default policy') ? 'No Global Default Policy' : missing.includes('app') ? 'Choose an application' : 'Choose a person'
    return { value, word: CANT_TELL, state: 'unknown', decides: false }
  }
  const decides = res.decidedBy?.policyId === draftId
  return decides
    ? { value: 'This policy', word: 'Decides', state: 'pass', decides }
    : { value: res.decidedBy?.policyName ?? '', word: 'Not deciding', state: 'fail', decides }
}

function whoGate(draft: Policy, facts: SignInFacts, env: SimEnv): GateView {
  const person = personOf(facts.personId, env)
  if (!person) return { value: 'Choose a person', word: CANT_TELL, state: 'unknown' }
  const value = `${person.name} · ${person.groupName}`
  const a = draft.audience
  if (a.everyone) return { value, word: 'Everyone', state: 'pass' }
  /* Through any group of theirs, as the resolver asks it: Maya Iyer is in AWS billing for Finance through Finance, her second group. */
  const inside = memberGroupIds(person).some((g) => a.groupIds.includes(g)) || a.userIds.includes(person.id)
  return inside ? { value, word: 'In audience', state: 'pass' } : { value, word: 'Not in audience', state: 'fail' }
}

/* The outcomes of a sign-in that cannot be told, one line each, in the order
   the rules give them. On this policy they name the rule by number, as the
   cards do; the last outcome is always the walk past every undecided rule —
   "If not". */
function outcomesOf(res: TenantResolution, draftId: string): DecisionView['outcomes'] {
  const onBoard = res.decidedBy?.policyId === draftId
  return res.possible.map((o, i, all) => ({
    label: i === all.length - 1 && all.length > 1 ? 'If not' : o.ruleIndex === null ? 'If not' : onBoard ? `If rule ${o.ruleIndex + 1} matches` : `If ${o.ruleName} matches`,
    decision: o.decision,
  }))
}

function decisionView(col: ColumnResult, draftId: string, policies: readonly Policy[]): DecisionView {
  const res = col.resolution
  const watching = res.status === 'incomplete' ? [] : differingWatch(res)
  if (res.status === 'incomplete') return { status: res.status, decision: null, line: incompleteLine(res), outcomes: [], needs: [], watching }
  const name = res.decidedBy?.policyName ?? ''
  if (res.status === 'decided') {
    return { status: res.status, decision: res.decision, line: `${name} · ${ruleLine(res, draftId, policies, col.spec.substitute)}`, outcomes: [], needs: [], watching }
  }
  const needs = factWords((res.trace?.unknowns ?? []).flatMap((u) => u.missing))
  return { status: res.status, decision: null, line: name, outcomes: outcomesOf(res, draftId), needs, watching }
}

/* Where the marker stops, and whether it stops sure of the way on.

     this policy decides   the rule that matched, or the last row; where it
                           cannot be told, the first rule that might match —
                           a ring, not a dot
     another one decides   Who, when the person is outside this policy;
                           otherwise Which policy, where the other one won
     nothing can yet       Who without a person, Which policy without an
                           application or a Global Default */
function landingOf(res: TenantResolution, draft: Policy, stages: readonly StageId[], who: GateView): { stage: StageId; unknown: boolean } {
  if (res.status === 'incomplete') {
    const missing = res.missing as readonly string[]
    return { stage: missing.includes('app') || missing.includes('a global default policy') ? 'policy' : 'who', unknown: true }
  }
  if (res.decidedBy?.policyId !== draft.id || !res.trace) return { stage: who.state === 'fail' ? 'who' : 'policy', unknown: false }
  if (res.status === 'depends') {
    const first = res.trace.steps.find((s) => s.kind !== 'off' && s.kind !== 'unreached' && s.match === 'unknown')
    return { stage: first ? ruleStage(first.ruleId) : 'last-row', unknown: true }
  }
  const hit = res.trace.hitIndex
  const id = hit === null ? undefined : draft.rules[hit]?.id
  const stage: StageId = id ? ruleStage(id) : 'last-row'
  return { stage: stages.includes(stage) ? stage : 'last-row', unknown: false }
}

/* The route the right-most column's sign-in takes down this board: every stage
   in chain order — switched-off rules included, the marker passes them — what
   each gate and card says, and where it lands. */
export function routeOf(col: ColumnResult, draft: Policy, facts: SignInFacts, env: SimEnv, policies: readonly Policy[]): RouteModel {
  const res = col.resolution
  const stages: StageId[] = ['sign-in', 'policy', 'who', ...draft.rules.map((r) => ruleStage(r.id)), 'last-row']
  const policy = policyGate(res, draft.id)
  const who = whoGate(draft, facts, env)
  const trace = res.decidedBy?.policyId === draft.id ? res.trace : null
  const cards = evidenceOf(draft, trace, facts, env)
  const decision = decisionView(col, draft.id, policies)
  const landing = landingOf(res, draft, stages, who)
  const signIn = signInSummary(facts, env)

  const sig: Record<string, string> = {
    'sign-in': signIn,
    policy: `${policy.value}|${policy.word}`,
    who: `${who.value}|${who.word}`,
    decision: JSON.stringify(decision, (k, v) => (k === 'trace' ? undefined : v)),
  }
  for (const r of draft.rules) sig[ruleStage(r.id)] = JSON.stringify(cards[r.id])
  sig['last-row'] = JSON.stringify(cards[LAST_ROW])

  return { stages, landing: stages.indexOf(landing.stage), landingUnknown: landing.unknown, signIn, policy, who, cards, decision, sig }
}

/** The decision a route lands on, as one string: a change to it is what "Changed by" names. */
export const decisionSig = (d: DecisionView): string => `${d.status}|${d.decision ?? ''}|${d.outcomes.map((o) => o.decision).join(',')}`

// --- What the status region says ----------------------------------------------------

/** "Allow with 2FA", "Depends", "Can't tell": the answer as a word. */
function answerWord(d: DecisionView): string {
  if (d.status === 'decided' && d.decision) return DECISION_WORDS[d.decision]
  return d.status === 'depends' ? 'Depends' : CANT_TELL
}

const monitorClause = (d: DecisionView): string => d.watching.map((w) => ` ${watchingSentence(w)}.`).join('')

/* Once per run, when the marker lands: "Allow with 2FA. HRMS access from
   corporate offices, Rule 1 · In a corporate office." Where it cannot be told,
   the outcomes it could reach; where a monitor would decide it differently,
   that too. */
export function runSentence(d: DecisionView): string {
  if (d.status === 'incomplete') return `${CANT_TELL}. ${d.line}.`
  if (d.status === 'depends') return `Depends. ${decisionsOr(d.outcomes.map((o) => o.decision))}.${monitorClause(d)}`
  const [policy, ...rule] = d.line.split(' · ')
  return `${answerWord(d)}. ${policy}, ${rule.join(' · ')}.${monitorClause(d)}`
}

/** An update that moved the answer: "Now Deny. Changed by IP address." */
export function updateSentence(d: DecisionView, cause: FormField | 'edits'): string {
  return `Now ${answerWord(d)}. Changed by ${CHANGED_BY_WORDS[cause]}.`
}

const STAGE_LABEL: Record<'sign-in' | 'policy' | 'who' | 'last-row', string> = {
  'sign-in': 'Sign-in',
  policy: 'Which policy',
  who: 'Who',
  'last-row': FALLBACK_NAME,
}

/** A stage's name, as Back and Next stage say it. */
export function stageLabel(stage: StageId, draft: Pick<Policy, 'rules'>): string {
  if (!stage.startsWith('rule:')) return STAGE_LABEL[stage as keyof typeof STAGE_LABEL]
  const i = draft.rules.findIndex((r) => ruleStage(r.id) === stage)
  return i < 0 ? 'Rule' : `Rule ${i + 1}`
}

/* A step: "Which policy: This policy, Decides", and for a card its word and
   every line — "Rule 1: Matched. Network, 203.0.113.24 · in …, Passes." */
export function stageSentence(route: RouteModel, index: number, draft: Pick<Policy, 'rules'>): string {
  const stage = route.stages[index]
  if (!stage) return ''
  const label = stageLabel(stage, draft)
  if (stage === 'sign-in') return `${label}: ${route.signIn || 'nothing stated'}`
  if (stage === 'policy') return `${label}: ${route.policy.value}, ${route.policy.word}`
  if (stage === 'who') return `${label}: ${route.who.value}, ${route.who.word}`
  const card = route.cards[stage === 'last-row' ? LAST_ROW : stage.slice(5)]
  if (!card) return label
  const lines = card.lines.map((l) => ` ${l.label}, ${lineText(l)}, ${CONDITION_WORDS[l.status]}.`).join('')
  return `${label}: ${card.word}.${lines}`
}

// --- Would change if ------------------------------------------------------------------

export interface ChangeChip {
  kind: 'sign-in' | 'policy'
  /** "From Corporate offices network", "Turn on rule 2". */
  text: string
  /** What the right-most column would then decide. */
  decision: AccessDecision
  /** Sign-in: the patch to the form, and the row it is named by. */
  patch?: Partial<SignInForm>
  field?: FormField
  /** Policy: the board's rules after the edit, and what the toast says. */
  rules?: Rule[]
  toast?: string
}

export interface WouldChangeContext {
  form: SignInForm
  saved: Policy
  draft: Policy
  right: ColumnResult
  policies: readonly Policy[]
  env: SimEnv
  zones: readonly Zone[]
  methods: readonly AuthMethod[]
}

const STRICTNESS: Record<AccessDecision, number> = { '1fa': 0, '2fa': 1, deny: 2 }
const MAX_CHIPS = 3
const MAX_SIGN_IN_CHIPS = 2

/* An address inside an IP entry, for "From {zone} network": ten past a block's
   network address (203.0.113.0/24 → 203.0.113.10), a range's start, the
   address itself. Checked against the entry with the evaluator's own test, so
   a chip never offers an address the zone would not take. */
export function addressInside(entry: string): string | null {
  const v = entry.trim().replace(/\s*[–—]\s*/g, '-')
  const kind = classifyIp(v)
  let out: string | null = null
  if (kind === 'ipv4' || kind === 'ipv6') out = v
  else if (kind === 'ipv4-range') out = v.split('-')[0].trim()
  else if (kind === 'ipv4-cidr') {
    const [addr, prefix] = v.split('/')
    const size = 2 ** (32 - Number(prefix))
    const network = Math.floor(ipv4Number(addr) / size) * size
    const n = network + Math.min(10, size - 1)
    out = [24, 16, 8, 0].map((s) => Math.floor(n / 2 ** s) % 256).join('.')
  } else if (kind === 'ipv6-cidr') {
    const addr = v.split('/')[0]
    out = addr.endsWith('::') ? `${addr}a` : addr
  }
  return out && ipInEntry(out, v) === true ? out : null
}

/* The next date after `from` that falls on `weekday`, as a date input writes it. */
export function nextWeekday(from: string, weekday: string): string | null {
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const want = DAYS.indexOf(weekday)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(from)
  if (want < 0 || !m) return null
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  for (let i = 1; i <= 7; i++) {
    const next = new Date(d.getTime() + i * 86400000)
    if (next.getUTCDay() === want) return next.toISOString().slice(0, 10)
  }
  return null
}

const firstVersion = (s: string): string | null => /\d+(?:\.\d+)*/.exec(s)?.[0] ?? null

/* The device facts that would pass one profile check, or null where no fact
   the tester can state passes it — a phone asked not to be a phone. */
function deviceFix(check: { id: string; required: string }, d: SignInDevice): Partial<SignInDevice> | null {
  const version = firstVersion(check.required)
  if (check.id.startsWith('os-')) return version && d.platform ? { osVersion: version } : null
  switch (check.id) {
    case 'mo-authenticator':
      return version ? { authenticatorVersion: version } : null
    case 'mo-agent':
      return version ? { agentInstalled: true, agentVersion: version } : null
    case 'agent':
      return d.platform === 'windows' || d.platform === undefined ? { agentInstalled: true, agentVersion: d.agentVersion ?? '4.3' } : null
    case 'integrity':
      return { integrity: { rooted: false, tampered: false, emulated: false } }
    case 'screen-lock':
      return { screenLock: 'pin' }
    case 'registration':
      return { registeredToPerson: true }
    case 'device-type':
      return check.required === 'Mobile' || check.required === 'Tablet' || check.required === 'Laptop' ? { formFactor: check.required } : null
  }
  return null
}

/* The sign-in facts a failed or undecided condition asks for, one candidate
   each. Only ever TOWARD what the condition asks: into the zone, onto a
   compliant device, a lower risk score. A negated condition is never taken the
   other side of ("not in zone" is not a place to send somebody), the person
   and the application are never changed, and risk is never raised. */
function signInCandidates(c: Condition, r: ConditionResult, form: SignInForm, zones: readonly Zone[]): Omit<ChangeChip, 'decision' | 'kind'>[] {
  const out: Omit<ChangeChip, 'decision' | 'kind'>[] = []
  if (r.status === 'pass') return out
  switch (c.typeId) {
    case 'zone': {
      if (c.operator !== 'in zone') break
      for (const part of r.zones ?? []) {
        const zone = zones.find((z) => z.id === part.zoneId)
        if (!zone) continue
        if (part.network === 'fail' || part.network === 'unknown') {
          const address = zone.ip.map(addressInside).find((a): a is string => a !== null)
          if (address) out.push({ text: `From ${zone.name} network`, patch: { origin: null, address, addressSource: 'stated' }, field: 'address' })
        }
        if (part.location === 'fail' || part.location === 'unknown') {
          const l = zone.location
          const placeId =
            l.ranges.find((x) => x.placeId)?.placeId ??
            searchPlaces(l.cities[0] ?? '', 1, 'city')[0]?.id ??
            searchPlaces(l.states[0] ?? '', 1, 'state')[0]?.id ??
            searchPlaces(l.countries[0] ?? '', 1, 'country')[0]?.id
          const place = PLACES.find((p) => p.id === placeId)
          if (place) out.push({ text: `From ${place.name}`, patch: { place: { kind: 'stated', placeId: place.id } }, field: 'place' })
        }
      }
      break
    }
    case 'country':
    case 'state':
    case 'city': {
      if (c.operator !== 'is') break
      const place = searchPlaces(c.values[0] ?? '', 1, c.typeId as PlaceKind)[0]
      if (place) out.push({ text: `From ${place.name}`, patch: { place: { kind: 'stated', placeId: place.id } }, field: 'place' })
      break
    }
    case 'time': {
      if (c.operator !== 'between' || !c.values[0]) break
      out.push({ text: `At ${c.values[0]}`, patch: { time: c.values[0], timeZone: c.tz ?? form.timeZone }, field: 'when' })
      break
    }
    case 'day': {
      if (c.operator !== 'is') break
      const date = form.date ? nextWeekday(form.date, c.values[0] ?? '') : null
      if (date) out.push({ text: `On ${c.values[0]}`, patch: { date, time: form.time || '09:30' }, field: 'when' })
      break
    }
    case 'device-risk': {
      if (c.operator !== 'below') break
      const v = Number(c.values[0])
      if (!Number.isFinite(v) || v < 1) break
      const now = /^\d{1,3}$/.test(form.risk.trim()) ? Number(form.risk.trim()) : null
      if (now !== null && now < v) break
      out.push({ text: `Device risk score ${Math.ceil(v) - 1}`, patch: { risk: String(Math.ceil(v) - 1) }, field: 'risk' })
      break
    }
    case 'fingerprint': {
      if (c.operator !== 'matches') break
      const device = deviceFactsOf(form.device)
      for (const p of r.profiles ?? []) {
        if (p.status === 'pass') continue
        const failing = p.checks.filter((k) => k.status === 'fail' || k.status === 'unknown')
        const fixes = failing.map((k) => deviceFix(k, device))
        if (failing.length === 0 || fixes.some((f) => f === null)) continue
        const next = Object.assign({ ...device }, ...fixes) as SignInDevice
        const one = failing.length === 1 ? failing[0] : null
        const version = one ? firstVersion(one.required) : null
        out.push({
          text: one && version ? `${one.label} ${version}` : `Device meets ${p.profileName}`,
          patch: { device: withDevice(next) },
          field: 'device',
        })
      }
      break
    }
  }
  return out
}

/* The rules above where the sign-in landed, on this policy only: another
   policy's rules are not the board's to suggest. `through` is the landing rule
   itself, or every rule when the last row caught it. */
function rulesAbove(res: TenantResolution, draft: Policy): { rule: Rule; index: number; step: RuleTrace }[] {
  if (res.decidedBy?.policyId !== draft.id || !res.trace) return []
  const steps = res.trace.steps
  const stop =
    res.status === 'depends'
      ? steps.findIndex((s) => s.kind !== 'off' && s.kind !== 'unreached' && s.match === 'unknown')
      : (res.trace.hitIndex ?? -1)
  const through = stop < 0 ? draft.rules.length - 1 : stop
  return draft.rules.slice(0, through + 1).flatMap((rule, index) => (steps[index] ? [{ rule, index, step: steps[index] }] : []))
}

/* What one different fact, or one stricter edit, would do to the answer.

   At most three chips, sign-in ones first (two at most), and every one of
   them run through the resolver before it is offered: a chip is kept only if
   the right-most column's answer would actually change. Policy chips go one
   way only — the answer gets stricter, or stays and asks for a stronger second
   factor. A tester is never shown how to let somebody in more easily; that is
   an edit the admin makes on purpose, not a suggestion. */
export function wouldChangeIf(ctx: WouldChangeContext): ChangeChip[] {
  const { form, saved, draft, right, policies, env, zones, methods } = ctx
  const res = right.resolution
  if (res.status === 'incomplete') return []
  const current = res.status === 'decided' ? res.decision : null
  const above = rulesAbove(res, draft)
  const seen = new Set<string>()

  const signIn: ChangeChip[] = []
  for (const { rule, step } of above) {
    if (!rule.enabled || (step.who !== 'in' && step.who !== 'none')) continue
    const byId = new Map(leaves(rule.when).map((c) => [c.id, c]))
    for (const r of step.conditions) {
      const c = byId.get(r.conditionId)
      if (!c) continue
      for (const cand of signInCandidates(c, r, form, zones)) {
        if (signIn.length >= MAX_SIGN_IN_CHIPS || seen.has(cand.text)) continue
        const after = resolveSignIn(policies, factsOf({ ...form, ...cand.patch }, zones).facts, env, right.spec.substitute ? { substitute: right.spec.substitute } : {})
        if (after.status !== 'decided' || !after.decision || after.decision === current) continue
        seen.add(cand.text)
        signIn.push({ kind: 'sign-in', decision: after.decision, ...cand })
      }
    }
  }

  const policy: ChangeChip[] = []
  if (current !== null) {
    const facts = factsOf(form, zones).facts
    const rank = (rule: Rule | null) => {
      const s = rule ? ruleFactor(rule, methods) : null
      return s === null ? -1 : FACTOR_RANK[s]
    }
    const before = rank(decidingRule(res, policies, right.spec.substitute).rule)
    const person = personOf(facts.personId, env)
    for (const { rule, index, step } of above) {
      if (res.trace?.hitIndex === index) continue
      let text: string | null = null
      let toast = ''
      let next: Rule | null = null
      if (!rule.enabled) {
        text = `Turn on rule ${index + 1}`
        toast = `Rule ${index + 1} switched on`
        next = { ...rule, enabled: true }
      } else if (step.who === 'out' && person && step.conditions.every((r) => r.status === 'pass') && rule.who) {
        const group = env.groupName(person.groupId)
        text = `Add ${group} to rule ${index + 1}`
        toast = `${group} added to rule ${index + 1}`
        next = patchRule(rule, { who: { ...rule.who, groupIds: [...rule.who.groupIds, person.groupId] } })
      }
      if (!text || !next) continue
      const rules = draft.rules.map((r, i) => (i === index ? next : r))
      const spec = columnsFor(saved, { ...draft, rules }, form.appId).at(-1)!
      const after = resolveSignIn(policies, facts, env, spec.substitute ? { substitute: spec.substitute } : {})
      if (after.status !== 'decided' || !after.decision) continue
      const stricter = STRICTNESS[after.decision] > STRICTNESS[current]
      const stronger = after.decision === current && rank(decidingRule(after, policies, spec.substitute).rule) > before
      if (!stricter && !stronger) continue
      policy.push({ kind: 'policy', text, decision: after.decision, rules, toast: `${toast}. Not saved yet.` })
    }
  }

  return [...signIn, ...policy].slice(0, MAX_CHIPS)
}
