import { FALLBACK_NAME, enforces, type AccessDecision, type App, type Policy, type Rule, type Zone } from '../../data'
import { CANT_TELL, DECISION_WORDS, FACT_WORDS, decisionsOr } from '../../decision-words'
import { openForEditing } from '../../policy-draft'
import { LEVEL_LABEL, SIGN_IN_LEVELS, type SavedSignIn, type SignInLevel } from '../../saved-sign-ins'
import { breakInDefault } from '../break-in-model'
import { personOf, type FactKey, type SignInFacts, type SimEnv } from '../simulate'
import { resolveSignIn, type TenantResolution } from '../tenant-resolver'
import { differingWatch, watchingSentence } from '../watching-words'
import { LAST_ROW, evidenceOf, type CardEvidence } from './evidence'
import { covers } from './prefill'
import type { SampleSignIn } from './samples'
import { FIELD_OF_FACT, type FieldOption } from './sign-in-fields'
import { CHANGED_BY_WORDS, changedBy, factsOf, type FormField, type FormIssue, type SignInForm } from './sign-in-form'

/* -----------------------------------------------------------------------------
   Policy testing's answers, as the views print them — pure, so every sentence
   the three versions say can be pinned without drawing one.

   One core for every version (final spec, B): the page, the slider and, when
   it ships, the board's panel all call these. What differs between them is
   where the views live, never what they say about a sign-in.

     try      the sign-in stated in Try, run through the tenant as it stands
              and, with Assume on, with one off policy as though it were on
     route    the stages the marker travels on the page: which policy, who,
              each rule it reached, the decision
     person   one person, every application
     saved    every saved sign-in against what it expects, failures first
     samples  the nine scenes, each answered live

   Nothing here decides anything. Every answer is the resolver's
   (tenant-resolver.ts), and every word is decision-words.ts's.
   -------------------------------------------------------------------------- */

// --- Assume on ---------------------------------------------------------------------

/* A policy off, or on with a saved draft, on this application: the ones
   Assume on can bring in. The meta says which kind — the draft of an Active
   policy is its saved draft, and assuming it means assuming those rules. */
function assumeMeta(p: Policy): string | null {
  if (p.status === 'inactive') return 'Inactive'
  if (p.status === 'draft') return 'Draft'
  if (enforces(p) && p.pendingDraft) return 'Saved draft'
  return null
}

/** The Assume on options for this application, in list order. Empty: the row is not drawn. */
export function assumeOptions(policies: readonly Policy[], appId: string | null): FieldOption[] {
  return policies.flatMap((p) => {
    const meta = covers(p, appId) && !p.isSystem ? assumeMeta(p) : null
    return meta ? [{ value: p.id, label: p.name, meta }] : []
  })
}

/* The policy Assume on evaluates, as the resolver takes it: the saved draft
   when there is one. Undefined when nothing is assumed, or the assumed policy
   is no longer one that can be — deleted, turned on, moved off the app. */
export function assumedPolicy(policies: readonly Policy[], form: Pick<SignInForm, 'assumeOn' | 'appId'>): Policy | undefined {
  if (!form.assumeOn) return undefined
  const p = policies.find((x) => x.id === form.assumeOn)
  return p && covers(p, form.appId) && !p.isSystem && assumeMeta(p) ? openForEditing(p) : undefined
}

// --- Try -----------------------------------------------------------------------------

export interface TryResult {
  facts: SignInFacts
  issues: FormIssue[]
  /** The tenant as it stands. */
  today: TenantResolution
  /** With the assumed policy as though on; null without Assume on. */
  assumed: TenantResolution | null
  /** The policy standing in for its stored twin in `shown`. */
  substitute: Policy | undefined
  /** What the page answers with: `assumed` when there is one. */
  shown: TenantResolution
}

export function tryResult(policies: readonly Policy[], form: SignInForm, env: SimEnv, zones: readonly Zone[]): TryResult {
  const { facts, issues } = factsOf(form, zones)
  const today = resolveSignIn(policies, facts, env)
  const substitute = assumedPolicy(policies, form)
  const assumed = substitute ? resolveSignIn(policies, facts, env, { substitute }) : null
  return { facts, issues, today, assumed, substitute, shown: assumed ?? today }
}

/* The deciding policy, as the resolution evaluated it: the stand-in where it
   is the one deciding, else the stored policy. */
export function decidingPolicy(res: TenantResolution, policies: readonly Policy[], substitute?: Policy): Policy | undefined {
  const id = res.decidedBy?.policyId
  if (!id) return undefined
  return substitute?.id === id ? substitute : policies.find((p) => p.id === id)
}

/* The rule a resolution names: the one that matched, the last row, or where it
   cannot be told, the first rule it could not read — the one standing between
   the sign-in and an answer. '' while nothing decides. */
export function ruleOf(res: TenantResolution, policy: Policy | undefined): { id: string; name: string } | null {
  if (!policy || !res.trace || res.status === 'incomplete') return null
  const trace = res.trace
  const index =
    res.status === 'decided'
      ? trace.hitIndex
      : (trace.steps.find((s) => s.kind !== 'off' && s.kind !== 'unreached' && s.match === 'unknown')?.index ?? null)
  const rule: Rule | undefined = index === null ? undefined : policy.rules[index]
  return rule ? { id: rule.id, name: rule.name } : { id: LAST_ROW, name: FALLBACK_NAME }
}

// --- The route on the page -----------------------------------------------------------

/** A stage the page's marker can stand beside, in route order. */
export type PageStage = 'policy' | 'who' | `rule:${string}` | 'last-row' | 'decision'

export interface PageRule {
  rule: Pick<Rule, 'id' | 'name' | 'enabled'>
  /** 1-based, as the index tile prints it. */
  number: number
  evidence: CardEvidence
}

export interface PageRoute {
  /** Every rule of the deciding policy, in order. */
  rules: PageRule[]
  lastRow: CardEvidence
  /** The last row's decision, for its badge. */
  lastDecision: AccessDecision
  /** The stops the marker travels: which policy, who, each rule it read, the last row when read, the decision. */
  stops: PageStage[]
  /** The deciding rule, the stages it could not read, and the last row when it decides: open to start with. */
  open: PageStage[]
  /** The answer could not be told: the marker ends hollow. */
  unknown: boolean
}

const ruleStop = (id: string): PageStage => `rule:${id}`

export function pageRoute(res: TenantResolution, policy: Policy, facts: SignInFacts, env: SimEnv): PageRoute {
  const trace = res.decidedBy?.policyId === policy.id ? res.trace : null
  const cards = evidenceOf(policy, trace, facts, env)
  const rules = policy.rules.map((rule, i) => ({ rule, number: i + 1, evidence: cards[rule.id] }))
  const lastRow = cards[LAST_ROW]
  /* A rule the walk read: matched, missed or could not tell. Switched-off and
     unreached rules are passed over, not stopped at. */
  const read = (e: CardEvidence) => e.state === 'pass' || e.state === 'fail' || e.state === 'unknown'
  const stops: PageStage[] = [
    'policy',
    'who',
    ...rules.filter((r) => read(r.evidence)).map((r) => ruleStop(r.rule.id)),
    ...(read(lastRow) ? (['last-row'] as const) : []),
    'decision',
  ]
  const open: PageStage[] = [
    ...rules.filter((r) => r.evidence.state === 'pass' || r.evidence.state === 'unknown').map((r) => ruleStop(r.rule.id)),
    ...(lastRow.state === 'pass' || lastRow.state === 'unknown' ? (['last-row'] as const) : []),
  ]
  return {
    rules,
    lastRow,
    lastDecision: policy.fallback?.decision ?? '1fa',
    stops,
    open,
    unknown: res.status !== 'decided',
  }
}

/* "Human Resources · in audience" — who the deciding policy is for, and that
   this person is among them. "Everyone" for a policy that names nobody. */
export function whoSaid(policy: Policy, facts: SignInFacts, env: SimEnv): string {
  if (policy.audience.everyone || policy.isSystem) return 'Everyone'
  const person = personOf(facts.personId, env)
  return person ? `${person.groupName} · in audience` : 'Choose a person'
}

// --- The decision, in words ---------------------------------------------------------------

/** What settles a sign-in that cannot be told: each fact word once, with the row that states it. */
export function needsOf(res: TenantResolution): { word: string; field: FormField }[] {
  const keys: FactKey[] = (res.trace?.unknowns ?? []).flatMap((u) => u.missing)
  const seen = new Set<string>()
  const out: { word: string; field: FormField }[] = []
  for (const k of keys) {
    const word = FACT_WORDS[k]
    if (seen.has(word)) continue
    seen.add(word)
    out.push({ word, field: FIELD_OF_FACT[k] })
  }
  return out
}

/* The outcomes a sign-in that cannot be told could reach, in rule order, each
   with the condition it waits on: `if “In a corporate office” matches`, and
   for the walk past every undecided rule, "if no rule matches". */
export function outcomeLines(res: TenantResolution): { decision: AccessDecision; when: string }[] {
  return res.possible.map((o) => ({ decision: o.decision, when: o.ruleIndex === null ? 'if no rule matches' : `if “${o.ruleName}” matches` }))
}

/** A resolution's answer as one string: a change to it is what "Changed by" names. */
export function decisionSig(res: TenantResolution): string {
  return `${res.status}|${res.decidedBy?.policyId ?? ''}|${res.decision ?? ''}|${res.possible.map((o) => o.decision).join(',')}`
}

/* What the Which policy stage says, as one string: the decider and where
   every other policy stands, and what each monitor would do. A committed edit
   that changes it fades the stage up (spec B §6, "Changed stages"). */
export function whichSig(res: Pick<TenantResolution, 'decidedBy' | 'standings' | 'watching'>): string {
  const standings = res.standings.map((s) => `${s.policyId}:${s.kind}:${s.reason}`).join(';')
  const watching = res.watching.map((w) => `${w.policyId}:${w.status}:${w.decision ?? ''}:${w.wouldDecide}`).join(';')
  return `${res.decidedBy?.policyId ?? ''}|${standings}|${watching}`
}

/** Nothing can decide: the tenant has no Global Default for a sign-in to fall back to. */
export const noGlobalDefault = (res: Pick<TenantResolution, 'status' | 'missing'>): boolean =>
  res.status === 'incomplete' && (res.missing as readonly string[]).includes('a global default policy')

/** "Allow with 2FA", or "Can't tell · Allow with 2FA or Deny", for a line of text. */
export function answerSaid(res: Pick<TenantResolution, 'status' | 'decision' | 'possible'>): string {
  if (res.status === 'decided' && res.decision) return DECISION_WORDS[res.decision]
  const or = res.possible.length > 0 ? decisionsOr(res.possible.map((o) => o.decision)) : ''
  return or ? `${CANT_TELL} · ${or}` : CANT_TELL
}

/* What the status region says, once per run and on an edit that moves the
   answer: "Allow with 2FA. HRMS access from corporate offices, In a corporate
   office." — or what is missing. A monitor that would decide differently is
   said after it. */
export function liveSentence(res: TenantResolution, policies: readonly Policy[], substitute?: Policy): string {
  if (res.status === 'incomplete') return `${CANT_TELL}. ${noGlobalDefault(res) ? 'No global default policy' : 'Choose a person and an application'}.`
  const watch = differingWatch(res)
    .map((w) => ` ${watchingSentence(w)}.`)
    .join('')
  if (res.status === 'depends') {
    const needs = needsOf(res).map((n) => n.word)
    return `${CANT_TELL}.${needs.length > 0 ? ` Needs ${needs.join(', ')}.` : ''}${watch}`
  }
  const rule = ruleOf(res, decidingPolicy(res, policies, substitute))
  return `${answerSaid(res)}. ${res.decidedBy?.policyName ?? ''}, ${rule?.name ?? FALLBACK_NAME}.${watch}`
}

/* "Changed by IP address": which field moved the answer on the last committed
   edit, until the next one (spec B §6). A run starts again with nothing named,
   and so does an edit that leaves the answer where it was — the last name
   would credit a field the tester has since moved on from. */
export interface ChangeTrack {
  run: number
  sig: string
  form: SignInForm
  /** The field, or null since the run began. */
  changed: FormField | null
}

export function nextChange(prev: ChangeTrack, now: { run: number; sig: string; form: SignInForm }): ChangeTrack {
  if (now.run !== prev.run) return { ...now, changed: null }
  if (now.sig === prev.sig) return now.form === prev.form ? prev : { ...prev, form: now.form, changed: null }
  return { ...now, changed: changedBy(prev.form, now.form) }
}

export const changedWords = (f: FormField | null): string | null => (f ? `Changed by ${CHANGED_BY_WORDS[f]}` : null)

// --- Check a person -----------------------------------------------------------------------

export interface PersonRow {
  appId: string
  appName: string
  res: TenantResolution
  /** The tenant as it stands, when a stand-in is in play and it decides differently. */
  today: TenantResolution | null
  policyName: string
  ruleName: string
  /** "Monitoring: HRMS access from corporate offices would allow with 2FA", or null. */
  monitoring: string | null
}

/* One row per application, in the catalogue's order: the same sign-in, on
   each. With a stand-in (Assume on), each row also says what decides today
   where that differs. */
export function personRows(policies: readonly Policy[], apps: readonly Pick<App, 'id' | 'name'>[], form: SignInForm, env: SimEnv, zones: readonly Zone[], substitute?: Policy): PersonRow[] {
  return apps.map((app) => {
    const facts = factsOf({ ...form, appId: app.id }, zones).facts
    const now = resolveSignIn(policies, facts, env)
    const res = substitute ? resolveSignIn(policies, facts, env, { substitute }) : now
    const watch = differingWatch(res)[0]
    return {
      appId: app.id,
      appName: app.name,
      res,
      today: substitute && decisionSig(now) !== decisionSig(res) ? now : null,
      policyName: res.decidedBy?.policyName ?? (res.status === 'incomplete' ? 'No policy decides' : ''),
      ruleName: ruleOf(res, decidingPolicy(res, policies, substitute))?.name ?? '',
      monitoring: watch ? watchingSentence(watch) : null,
    }
  })
}

// --- Saved sign-ins ---------------------------------------------------------------------------

export type SavedResult = 'pass' | 'fail' | 'unknown'

export interface SavedRow {
  saved: SavedSignIn
  res: TenantResolution
  /** The tenant as it stands, when a stand-in is in play and it decides differently. */
  today: TenantResolution | null
  /* Pass only when the tenant decides it and decides what was expected. A
     sign-in that cannot be told is never a pass. */
  result: SavedResult
}

const RESULT_ORDER: readonly SavedResult[] = ['fail', 'unknown', 'pass']

/* Every saved sign-in against the tenant, failures first: then Can't tell,
   then passes; within each, the strongest promise first; then by name. With a
   stand-in (Assume on), each is judged on the answer with it, and says what
   decides today where that differs — as Check a person does. */
export function savedRows(saved: readonly SavedSignIn[], policies: readonly Policy[], env: SimEnv, substitute?: Policy): SavedRow[] {
  return saved
    .map((s) => {
      const now = resolveSignIn(policies, s.facts, env)
      const res = substitute ? resolveSignIn(policies, s.facts, env, { substitute }) : now
      const result: SavedResult = res.status !== 'decided' ? 'unknown' : res.decision === s.expected ? 'pass' : 'fail'
      return { saved: s, res, today: substitute && decisionSig(now) !== decisionSig(res) ? now : null, result }
    })
    .sort(
      (a, b) =>
        RESULT_ORDER.indexOf(a.result) - RESULT_ORDER.indexOf(b.result) ||
        SIGN_IN_LEVELS.indexOf(a.saved.level) - SIGN_IN_LEVELS.indexOf(b.saved.level) ||
        a.saved.name.localeCompare(b.saved.name),
    )
}

export type LevelFilter = 'all' | SignInLevel

/** The Level filter's options: All, then the levels weakest first. */
export const LEVEL_FILTER: { value: LevelFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'note', label: LEVEL_LABEL.note },
  { value: 'must-pass', label: LEVEL_LABEL['must-pass'] },
  { value: 'protected', label: LEVEL_LABEL.protected },
]

/* The policy the Break-in test opens on (final spec, B.8): the one Try
   assumes on, else the one deciding Try's sign-in unless that is the Global
   Default, else the first a Break-in test can run on. Null when there is none. */
export function breakInStart(policies: readonly Policy[], form: SignInForm, env: SimEnv, zones: readonly Zone[]): string | null {
  const t = tryResult(policies, form, env, zones)
  const decider = t.today.decidedBy
  return breakInDefault(policies, { assumedId: t.substitute?.id, deciderId: decider && !decider.isGlobalDefault ? decider.policyId : null })
}

/** The rows a search and the Level filter leave. */
export function filterSaved(rows: readonly SavedRow[], query: string, level: LevelFilter): SavedRow[] {
  const q = query.trim().toLowerCase()
  return rows.filter((r) => (level === 'all' || r.saved.level === level) && (!q || r.saved.name.toLowerCase().includes(q)))
}

// --- Samples ---------------------------------------------------------------------------------

export interface SampleRow {
  sample: SampleSignIn
  personName: string
  appName: string
  res: TenantResolution
}

export function sampleRows(samples: readonly SampleSignIn[], policies: readonly Policy[], env: SimEnv): SampleRow[] {
  return samples.map((sample) => ({
    sample,
    personName: personOf(sample.facts.personId, env)?.name ?? sample.facts.personId,
    appName: env.appName?.(sample.facts.appId) ?? sample.facts.appId,
    res: resolveSignIn(policies, sample.facts, env),
  }))
}
