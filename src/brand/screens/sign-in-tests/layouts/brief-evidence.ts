import type { AccessDecision } from '../../../data'
import { DECISION_WORDS } from '../../../decision-words'
import { stepLabel, type SignInScreens } from '../../testing/screens-of'
import type { FormField } from '../../testing/sign-in-form'
import type { Via } from '../conflicts'
import type { CheckRow, EnginePolicy, EngineRule, EngineRun } from '../engine-run'
import type { Target } from './assistant/intents'
import type { BriefModel, CiteId, Decisive, Part } from './brief-model'

/* -----------------------------------------------------------------------------
   The brief's EVIDENCE (BriefLayout.tsx): how the answer was decided. Not on
   the canvas — the canvas holds only the sentence (owner, 3 Oct 2026: "remove
   the evidence and add a button only, and on click open the right-side panel
   with the evidence inside"). It is read in the page's right-hand panel
   (brief-panel.tsx), opened by "How it was decided" under the sentence, by a
   cited part of the sentence, or by the assistant.

   ONE pure model of the evidence from the plan (`evidenceOf`): the person
   and their groups, the application's policies in the engine's order with
   their state, the rules reached, the deciding rule's checks (value, needs,
   mark — said as the engine found them), the outcome, the conflicts. Every
   item carries the sentence's parts it proves (`cites`), so a hovered part
   lights its evidence and back. `howStepsOf` lays it out as the panel's
   steps, in the engine's order.

   Words: plain admin English, the person's first name (the sentence above
   has already said the name in full, as stored — never lower-cased), every
   word from the plan, its findings (conflicts.ts) or the screens. A mark is
   what the engine found: ✓ beside a value never fails its need. Never throws:
   a plan it was not shaped for gets fewer lines, never a wrong one.
   -------------------------------------------------------------------------- */

// --- The model ---------------------------------------------------------------------------

/** ✓ green, ✕ red, ? amber (can't tell), – grey (not asked, not reached). */
export type Mark = 'pass' | 'fail' | 'unknown' | 'none'

/** The person (or the group run as), and the group the deciding policy covers them through. */
export interface EvWho {
  /** As stored ("Maya Iyer"); '' when run as a group's member. */
  name: string
  /** "Maya"; "them" as a group's member. */
  first: string
  asGroup: string | null
  /** Their groups in their order; `counts` on those the deciding policy covers them through. */
  groups: { name: string; counts: boolean }[]
  /** "through Engineering", "by name", "for everyone"; '' when it does not say. */
  via: string
  /** "Maya is in Engineering and Finance." / "Anyone in Finance." */
  line: string
  at: number
  cites: CiteId[]
}

/*   not-covered  asked before the one that decides; its audience leaves the person out
     decides      the first that covers them: it decides
     also-covers  after the one that decides, it covers them too (never reached)
     not-reached  after the one that decides, and not covering them (or not asked)
     off          switched off, or not turned on yet
     watching     monitoring: it only watches */
export type PolicyState = 'not-covered' | 'decides' | 'also-covers' | 'not-reached' | 'off' | 'watching'

export interface EvPolicy {
  key: string
  policyId: string
  /** 1-based: where the engine asks it. */
  order: number
  name: string
  isGlobalDefault: boolean
  state: PolicyState
  mark: Mark
  /** Amber: a conflict is about it (it also covers the person, and would answer otherwise). */
  notice: boolean
  /** Who it covers, said ("Engineering, DevOps, Contractors"); '' when the plan does not say. */
  audience: string
  /** The person's group it covers them through ("Finance"); '' when not by a group. */
  through: string
  /** A stack bar's few words: "doesn't cover Priya", "covers Priya, through Finance", "also covers Maya", "not reached", "switched off". */
  short: string
  /** One plain sentence: "AWS for engineering teams doesn't cover Priya." */
  line: string
  /** What it would decide on its own (also covers, off): "Allow with 2FA (rule 1)"; ''. */
  would: string
  at: number
  cites: CiteId[]
}

/** A check of a rule, said as the engine found it. */
export interface EvCheck {
  key: string
  category: CheckRow['category']
  /** "Device", "Network", "Who". */
  word: string
  /** What the sign-in showed: "Windows 11 laptop", "Office network", "Risk score 12", "Maya"; "Not stated". */
  value: string
  /** What the rule asks for: "Compliant devices", "not in Corporate offices", "below 40", "Engineering, DevOps". */
  needs: string
  mark: Mark
  /** The engine's finding: "Windows 11 laptop meets Compliant devices", "Maya is in Engineering". */
  line: string
  /** A fact not stated: the field that states it (Add opens the panel on it). */
  missing: FormField | null
  /** The check that decided it (the sentence's check part). */
  decides: boolean
  at: number
  cites: CiteId[]
}

/*   matched     every check passed: it decides
     skipped     a check failed: the engine moved on
     unknown     a fact it reads is not stated: can't tell (the answer depends)
     off         switched off: passed over
     fallback    "Nothing else matched" decided
     possible    "Nothing else matched", if the rules that can't tell don't match */
export type RuleEvState = 'matched' | 'skipped' | 'unknown' | 'off' | 'fallback' | 'possible'

export interface EvRule {
  key: string
  ruleId: string
  /** 1-based; null for "Nothing else matched". */
  number: number | null
  name: string
  /** Its THEN. */
  decision: AccessDecision
  state: RuleEvState
  mark: Mark
  /** The check that ended it (skipped) or could not be told (unknown); null otherwise. */
  failing: EvCheck | null
  /** "Rule 1 is skipped — Maya isn't in Contractors." / "Rule 2 matches." */
  line: string
  /** Every row of the rule, as the engine left it: the rows it read with their marks, the rest unmarked (not asked). */
  checks: EvCheck[]
  at: number
  cites: CiteId[]
}

export interface EvOutcome {
  kind: 'allow' | 'deny' | 'depends' | 'none'
  decision: AccessDecision | null
  /** "Allow with 2FA", "Deny", "Depends on the device", or what the plan says when no policy decides. */
  words: string
  /** The factors asked for, by name, in order: ["Password", "Google Authenticator"]. */
  factors: string[]
  /** A Deny's message, verbatim; ''. */
  message: string
  /** Depends: the facts it hangs on, the form's words ("Device"). */
  dependsOn: string[]
  /** Depends: the fields to state. */
  missing: FormField[]
  /** Depends: each answer it could be, and the rule that gives it (null: Nothing else matched). */
  outcomes: { decision: AccessDecision; words: string; rule: number | null; ruleName: string }[]
  /** "So Priya is asked for Password, then Google Authenticator." */
  line: string
  at: number
  cites: CiteId[]
}

export interface EvConflict {
  key: string
  /** conflict: another way gives the person another answer (amber); info: worth knowing. */
  tone: 'conflict' | 'info'
  /** "Maya is in Engineering and Finance — AWS for engineering teams applies first." */
  line: string
  /** What the admin can do; ''. */
  fix: string
  policyId: string
  ruleId: string | null
  at: number
  cites: CiteId[]
}

export interface Evidence {
  who: EvWho
  /** Every policy on the application (and the Global Default), in the engine's order. */
  policies: EvPolicy[]
  decider: EvPolicy | null
  /** The policies asked before the decider that don't cover the person. */
  before: EvPolicy[]
  /** Those, in one line ("AWS for engineering teams doesn't cover Priya."); '' when none. */
  beforeLine: string
  /** The rules the engine reached, in order, up to and including where it stopped. */
  rules: EvRule[]
  /** Of those, the ones passed over before the deciding one. */
  skipped: EvRule[]
  /** The rule that decided (matched, fallback) or could not tell (Depends); null when no policy decides. */
  deciding: EvRule | null
  /** The deciding rule's checks, as far as the engine read them. */
  checks: EvCheck[]
  outcome: EvOutcome
  conflicts: EvConflict[]
  /** The policy that decides, for "Open policy ↗" / "Open rule 2 ↗"; null. */
  deciderId: string | null
}

// --- Lighting ------------------------------------------------------------------------------

/** An item lights when the lit part is one it proves. */
export const litBy = (cites: readonly CiteId[], lit: CiteId | null): boolean => lit !== null && cites.includes(lit)

// --- Words ----------------------------------------------------------------------------------

export interface EvidenceInput {
  /** "Maya", or "them" as a group's member. */
  first: string
  /** The group signed in as ("Finance"), or null. */
  asGroup: string | null
  /** The person's full name as stored ('' as a group). */
  name: string
  /** The person's groups, by name, in their order. */
  groups: readonly string[]
  /** How the deciding policy's audience covers them (conflicts.ts `audienceViaOf`). */
  via: Via | null
  appName: string
  screens: readonly SignInScreens[]
}

const end = (t: string): string => (/[.!?”]$/.test(t.trim()) ? t.trim() : `${t.trim()}.`)

const andList = (xs: readonly string[]): string => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`)


/** The person's full name said by their first ("Maya Iyer is in Engineering" → "Maya is in Engineering"); plain contractions. */
function plain(text: string, inp: Pick<EvidenceInput, 'name' | 'first'>): string {
  let t = text
  if (inp.name && inp.first && inp.name !== inp.first) t = t.split(inp.name).join(inp.first)
  return t.replace(/\bis not\b/g, 'isn’t').replace(/\bdoes not\b/g, 'doesn’t')
}

/** "through Engineering", "by name", "for everyone"; '' when it does not say. */
export function viaPhrase(via: Via | null | undefined): string {
  if (!via || !via.matches) return ''
  if (via.kind === 'groups' && via.label) return `through ${via.label}`
  if (via.kind === 'person') return 'by name'
  if (via.kind === 'everyone') return 'for everyone'
  return ''
}

const markOf = (st: CheckRow['status']): Mark => (st === 'pass' ? 'pass' : st === 'fail' ? 'fail' : 'unknown')

/* What a check needs, mid-sentence: a name keeps its capital ("Compliant devices"); "Not in Corporate offices", "Below 40" read on. */
const needsOf = (row: CheckRow): string => (row.requirement || row.word.toLowerCase()).replace(/^(Not|Below|Above|Under|Over|Between|Within|Outside|Any)\b/, (w) => w.toLowerCase())

/** The factors the person is asked for, by name: ["Password", "Google Authenticator"]. */
export function factorsOf(screens: readonly SignInScreens[], decision: AccessDecision): string[] {
  const sc = screens.find((x) => x.decision === decision)
  return (sc?.steps ?? []).filter((x) => x.kind !== 'deny').map(stepLabel)
}

/** The deny message, verbatim, or ''. */
export function denyMessage(screens: readonly SignInScreens[]): string {
  const st = screens.find((x) => x.decision === 'deny')?.steps.find((x) => x.kind === 'deny')
  return st && st.kind === 'deny' ? st.message : ''
}

/** "Password, then Google Authenticator". */
const thenList = (xs: readonly string[]): string => xs.join(', then ')

// --- The parts -------------------------------------------------------------------------------

interface Ctx {
  plan: EngineRun
  model: Pick<BriefModel, 'cites' | 'decisive' | 'provenAt'>
  inp: EvidenceInput
  atOut: number
  /** "Maya", or "them" as a group's member. */
  who: string
}

function whoOf(c: Ctx): EvWho {
  const { inp } = c
  const counted = new Set(inp.via?.matches && inp.via.kind === 'groups' ? inp.via.groups.map((g) => g.name) : [])
  const groups = (inp.asGroup ? [inp.asGroup] : inp.groups).map((name) => ({ name, counts: counted.has(name) }))
  const line = inp.asGroup ? `Anyone in ${inp.asGroup}.` : groups.length > 0 ? `${c.who} is in ${andList(groups.map((g) => g.name))}.` : `${c.who} is in no group.`
  return { name: inp.asGroup ? '' : inp.name, first: c.who, asGroup: inp.asGroup, groups, via: viaPhrase(inp.via), line, at: c.model.provenAt.who, cites: ['who'] }
}

const NOT_IN = /\bis not in (it|this policy)$|^Not in this policy$/

/* An off policy's say ("Switched off — on, it would decide Allow with 2FA (rule 1)"), after its name. */
function offLine(name: string, status: 'inactive' | 'draft', say: string): string {
  const rest = say.replace(/^(Switched off|Draft|Not turned on yet)\s*—\s*/, '')
  const state = status === 'draft' ? 'isn’t turned on yet' : 'is switched off'
  return end(rest && rest !== say ? `${name} ${state}; ${rest}` : `${name} ${state}`)
}

function wouldOf(d: { status: string; decision: AccessDecision | null; ruleNumber: number | null }): string {
  if (d.status !== 'decided' || !d.decision) return 'it can’t tell'
  return `${DECISION_WORDS[d.decision]}${d.ruleNumber !== null ? ` (rule ${d.ruleNumber})` : ''}`
}

/** The deciding policy, as an item. */
function deciderOf(c: Ctx, p: EnginePolicy, first: boolean): Pick<EvPolicy, 'through' | 'short' | 'line'> {
  const { inp } = c
  const v = inp.via
  const through = v?.matches && v.kind === 'groups' ? v.label : ''
  const via = viaPhrase(v)
  if (p.isGlobalDefault) {
    const line = first ? `${inp.appName} has no policy of its own, so the ${p.name} decides.` : `No ${inp.appName} policy covers ${c.who}, so the ${p.name} decides.`
    return { through: '', short: 'decides when no policy covers', line }
  }
  if (via === 'for everyone') return { through, short: 'covers everyone', line: `${p.name} covers everyone, ${c.who} included.` }
  const short = `covers ${c.who}${through ? `, through ${through}` : via === 'by name' ? ', by name' : ''}`
  return { through, short, line: `${p.name} covers ${c.who}${via ? `, ${via}` : ''}.` }
}

function policiesOf(c: Ctx): EvPolicy[] {
  const { plan, inp } = c
  const cf = plan.conflicts
  const di = plan.policies.findIndex((p) => p.decides)
  const hot = new Set((cf?.findings ?? []).filter((f) => f.tone === 'conflict' && f.target.ruleId === null).map((f) => f.target.policyId))
  const missed = new Map((cf?.missedBy ?? []).map((m) => [m.policyId, m]))
  const also = new Map((cf?.policies ?? []).map((pc) => [pc.policyId, pc]))
  const off = new Map((cf?.off ?? []).map((op) => [op.policyId, op]))
  return plan.policies.map((p, i): EvPolicy => {
    const base = { key: p.policyId, policyId: p.policyId, order: p.order, name: p.name, isGlobalDefault: p.isGlobalDefault, notice: hot.has(p.policyId), audience: missed.get(p.policyId)?.audience ?? '', through: '', would: '' }
    const settled = p.settleAt >= 0 ? p.settleAt : c.atOut
    if (p.decides) return { ...base, ...deciderOf(c, p, i === 0), state: 'decides', mark: 'pass', at: c.model.provenAt.policy, cites: ['policy', 'who'] }
    if (p.kind === 'waiting') {
      const op = off.get(p.policyId)
      const status = op?.status ?? (p.status === 'draft' ? 'draft' : 'inactive')
      return { ...base, state: 'off', mark: 'none', short: status === 'draft' ? 'not turned on yet' : 'switched off', line: offLine(p.name, status, op?.say ?? ''), would: op ? wouldOf(op.then) : '', at: op ? c.atOut : settled, cites: ['policy'] }
    }
    if (p.kind === 'watching') return { ...base, state: 'watching', mark: 'none', short: 'only watching', line: `${p.name} only watches.`, at: settled, cites: ['policy'] }
    if (di >= 0 && i < di) {
      const said = NOT_IN.test(p.reason) || !p.reason
      return { ...base, state: 'not-covered', mark: 'fail', short: `doesn’t cover ${c.who}`, line: said ? `${p.name} doesn’t cover ${c.who}.` : end(`${p.name}: ${plain(p.reason, inp)}`), at: settled, cites: ['policy'] }
    }
    const pc = also.get(p.policyId)
    if (pc && pc.via.matches) {
      const through = pc.via.kind === 'groups' ? pc.via.label : ''
      const would = wouldOf(pc)
      const line = `${p.name} also covers ${c.who}${through ? `, through ${through}` : ''}, but comes after, so it isn’t reached. On its own: ${would}.`
      return { ...base, through, state: 'also-covers', mark: base.notice ? 'unknown' : 'none', short: `also covers ${c.who}`, line, would, at: c.atOut, cites: ['policy'] }
    }
    return { ...base, state: 'not-reached', mark: 'none', short: 'not reached', line: `${p.name} isn’t reached.`, at: c.atOut, cites: ['policy'] }
  })
}

/** The policies before the decider that don't cover the person, in one line. */
function beforeLineOf(c: Ctx, before: readonly EvPolicy[], decider: EvPolicy | null): string {
  if (before.length === 0) return ''
  if (decider?.isGlobalDefault) return `No ${c.inp.appName} policy covers ${c.who}.`
  if (before.length === 1) return before[0].line
  if (before.length === 2) return `${before[0].name} and ${before[1].name} don’t cover ${c.who}.`
  return `The ${before.length} policies before it don’t cover ${c.who}.`
}

/** A check, as the engine found it; `read` false for a check a run of ANDs never reached (no mark). */
function checkOf(c: Ctx, r: EngineRule, row: CheckRow, k: number, decides: boolean, read: boolean): EvCheck {
  const stated = !row.missing && row.value !== NOT_STATED
  const value = !stated ? NOT_STATED : row.category === 'who' ? c.who : row.category === 'device' ? row.value.split(' · ')[0] : row.category === 'risk' ? `Risk score ${row.value}` : row.value
  return {
    key: `${r.id}:${row.key || k}`,
    category: row.category,
    word: row.word,
    value,
    needs: needsOf(row),
    mark: read ? markOf(row.status) : 'none',
    /* The engine's own finding, never "value · needs" beside a mark: a laptop not registered can still meet a profile that does not ask for it. */
    line: !stated ? `The ${row.word.toLowerCase()} isn’t stated.` : end(plain(row.line || row.say, c.inp)),
    missing: row.missing,
    decides,
    at: r.markAt[k] ?? (r.endAt >= 0 ? r.endAt : c.atOut),
    cites: decides ? ['check'] : row.category === 'who' ? ['who', 'rule'] : ['rule'],
  }
}

const NOT_STATED = 'Not stated'

/** The deciding check's index in rule `i`, or -1. */
const decisiveIn = (c: Ctx, i: number): number => (c.model.decisive && c.model.decisive.rule === i ? c.model.decisive.check : -1)

/** A rule the engine reached, as it left it, in a line. */
function ruleOf(c: Ctx, r: EngineRule, i: number): EvRule {
  const n = r.index === null ? null : r.index + 1
  const at = r.endAt >= 0 ? r.endAt : r.startAt >= 0 ? r.startAt : c.atOut
  const dk = decisiveIn(c, i)
  const fi = r.state === 'unknown' ? r.checks.findIndex((x) => x.status === 'unknown') : (r.failing ?? -1)
  const failing = fi >= 0 && r.checks[fi] ? checkOf(c, r, r.checks[fi], fi, fi === dk, true) : null
  const read = r.state === 'off' ? 0 : Math.max(r.checked, fi + 1, dk + 1)
  const checks = n === null ? [] : r.checks.map((row, k) => checkOf(c, r, row, k, k === dk, k < read))
  const base = { key: r.id, ruleId: r.id, number: n, name: r.name, decision: r.decision, failing, checks, at, cites: ['rule'] as CiteId[] }
  if (n === null) {
    const real = c.plan.rules.filter((x) => x.index !== null).length
    if (r.state === 'possible') return { ...base, state: 'possible', mark: 'unknown', line: `If no rule matches, Nothing else matched decides: ${DECISION_WORDS[r.decision]}.` }
    const lead = real === 0 ? 'The policy has no rules' : real === 1 ? 'Its one rule doesn’t match' : 'No rule matches'
    return { ...base, state: 'fallback', mark: 'pass', line: `${lead}, so Nothing else matched decides.` }
  }
  if (r.state === 'match') return { ...base, state: 'matched', mark: 'pass', line: `Rule ${n} matches.` }
  if (r.state === 'off') return { ...base, state: 'off', mark: 'none', line: `Rule ${n} is switched off.` }
  if (r.state === 'unknown') return { ...base, state: 'unknown', mark: 'unknown', line: `Rule ${n} can’t tell — ${failing ? failing.line.replace(/^The /, 'the ') : 'a fact isn’t stated.'}` }
  const why = failing ? failing.line : r.miss ? end(plain(r.miss.replace(/^\w+ · /, ''), c.inp)) : ''
  return { ...base, state: 'skipped', mark: 'fail', line: why ? `Rule ${n} is skipped — ${why}` : `Rule ${n} is skipped.` }
}

function outcomeOf(c: Ctx): EvOutcome {
  const { plan, inp } = c
  const o = plan.outcome
  const subject = inp.asGroup ? 'they are' : `${c.who} is`
  const base = { factors: [] as string[], message: '', dependsOn: [] as string[], missing: [] as FormField[], outcomes: [] as EvOutcome['outcomes'], at: c.atOut, cites: ['outcome'] as CiteId[] }
  const d = o.status === 'decided' && o.decision ? o.decision : null
  if (d === 'deny') {
    const message = denyMessage(inp.screens)
    return { ...base, kind: 'deny', decision: d, words: DECISION_WORDS.deny, message, line: message ? `So ${subject} denied and sees “${message}”` : `So ${subject} denied.` }
  }
  if (d) {
    const factors = factorsOf(inp.screens, d)
    return { ...base, kind: 'allow', decision: d, words: DECISION_WORDS[d], factors, line: factors.length > 0 ? `So ${subject} asked for ${thenList(factors)}.` : `So ${subject} let in: ${DECISION_WORDS[d]}.` }
  }
  if (o.status === 'depends') {
    const dep = plan.conflicts?.depends ?? null
    const dependsOn = dep?.factWords ?? o.view.needs
    const outcomes = dep
      ? dep.outcomes.map((x) => ({ decision: x.decision, words: x.words, rule: x.ruleNumber, ruleName: x.ruleName }))
      : o.view.outcomes.map((x) => ({ decision: x.decision, words: DECISION_WORDS[x.decision], rule: Number(/rule (\d+)/i.exec(x.label)?.[1] ?? NaN) || null, ruleName: x.label }))
    const missing = [...new Set(plan.rules.filter((r) => r.state === 'unknown').flatMap((r) => r.checks.map((x) => x.missing).filter((f): f is FormField => !!f)))]
    const facts = dependsOn.length > 0 ? `the ${andList(dependsOn.map((x) => x.toLowerCase()))}` : 'a fact not stated'
    const each = outcomes.map((x) => `${x.words} (${x.rule !== null ? `rule ${x.rule}` : x.ruleName || 'Nothing else matched'})`)
    const list = each.length <= 1 ? (each[0] ?? '') : `${each.slice(0, -1).join(', ')} or ${each.at(-1)}`
    return { ...base, kind: 'depends', decision: null, words: `Depends on ${facts}`, dependsOn, missing, outcomes, line: list ? `So it depends on ${facts}: ${list}.` : `So it depends on ${facts}.` }
  }
  return { ...base, kind: 'none', decision: null, words: o.view.line || 'No policy decides', line: end(o.view.line || 'No policy decides') }
}

function conflictsOf(c: Ctx): EvConflict[] {
  const cf = c.plan.conflicts
  if (!cf) return []
  const out: EvConflict[] = cf.findings
    .filter((f) => f.tone === 'conflict')
    .map((f, i) => ({ key: `f${i}:${f.kind}`, tone: 'conflict' as const, line: end(plain(f.line || f.title, c.inp)), fix: f.fix, policyId: f.target.policyId, ruleId: f.target.ruleId, at: c.atOut, cites: [f.target.ruleId ? 'rule' : 'policy'] as CiteId[] }))
  for (const rc of cf.rules) {
    if (out.some((x) => x.ruleId === rc.ruleId)) continue
    const via = rc.via.say ? ` ${rc.via.say}` : ''
    const verb = rc.match === 'unknown' ? 'might also apply' : 'also applies'
    out.push({
      key: `r:${rc.ruleId}`,
      tone: rc.kind === 'conflict' ? 'conflict' : 'info',
      line: `Rule ${rc.number} ${verb} to ${c.who}${via}, but comes after. On its own: ${rc.ask.words}.`,
      fix: rc.fix,
      policyId: cf.policyId ?? c.plan.decider?.id ?? '',
      ruleId: rc.ruleId,
      at: c.atOut,
      cites: ['rule'],
    })
  }
  return out
}

/** The evidence, from the plan. Never throws: a part it was not shaped for is left out, never a wrong one. */
export function evidenceOf(plan: EngineRun, model: Pick<BriefModel, 'cites' | 'decisive' | 'provenAt'>, inp: EvidenceInput): Evidence {
  const last = Math.max(0, plan.steps.length - 1)
  const c: Ctx = { plan, model, inp, atOut: plan.at.outcome >= 0 ? plan.at.outcome : last, who: inp.asGroup ? 'them' : inp.first || 'them' }
  const safe = <T>(f: () => T, fallback: T): T => {
    try {
      return f()
    } catch {
      return fallback
    }
  }
  const policies = safe(() => policiesOf(c), [])
  const decider = policies.find((p) => p.state === 'decides') ?? null
  const before = policies.filter((p) => p.state === 'not-covered')
  const land = plan.landing
  const di = plan.outcome.status === 'depends' && model.decisive ? model.decisive.rule : land
  const reached = land === null ? [] : plan.rules.map((r, i) => ({ r, i })).filter(({ r, i }) => i <= land && (r.visited || i === land))
  const rules = safe(() => reached.map(({ r, i }) => ruleOf(c, r, i)), [])
  const deciding = di === null ? null : (rules[reached.findIndex((x) => x.i === di)] ?? null)
  const dr = di === null ? undefined : plan.rules[di]
  const dk = di === null ? -1 : decisiveIn(c, di)
  const checks = dr && dr.index !== null ? safe(() => dr.checks.slice(0, Math.max(dr.checked, dk + 1)).map((row, k) => checkOf(c, dr, row, k, k === dk, true)), []) : []
  if (deciding && deciding.state === 'matched' && checks.length > 0) deciding.line = `Rule ${deciding.number} matches: ${andList(checks.map((x) => x.line.replace(/\.$/, '')))}.`
  const skipped = deciding ? rules.slice(0, rules.indexOf(deciding)).filter((r) => r.state === 'skipped' || r.state === 'off' || r.state === 'unknown') : rules.filter((r) => r.state !== 'matched')
  return {
    who: whoOf(c),
    policies,
    decider,
    before,
    beforeLine: beforeLineOf(c, before, decider),
    rules,
    skipped,
    deciding,
    checks,
    outcome: safe(() => outcomeOf(c), { kind: 'none', decision: null, words: 'No policy decides', factors: [], message: '', dependsOn: [], missing: [], outcomes: [], line: 'No policy decides.', at: c.atOut, cites: ['outcome'] }),
    conflicts: safe(() => conflictsOf(c), []),
    deciderId: decider?.policyId ?? null,
  }
}

/** The deciding rule in a line; when the answer depends on more than one rule that can't tell, all of them ("Rules 1 and 2 can’t tell — the device isn’t stated."). */
export function decidingLine(ev: Pick<Evidence, 'deciding' | 'rules' | 'outcome'>): string {
  const d = ev.deciding
  if (!d) return ''
  const unknown = ev.outcome.kind === 'depends' ? ev.rules.filter((r) => r.state === 'unknown' && r.number !== null) : []
  if (unknown.length < 2) return d.line
  const why = d.failing ? d.failing.line.replace(/^The /, 'the ') : 'a fact isn’t stated.'
  return `Rules ${andList(unknown.map((r) => String(r.number)))} can’t tell — ${why}`
}

// --- How it was decided: the panel's steps --------------------------------------------------

/** What leads a step: the policy's layers, the rule's list, the outcome's own mark — the sentence's marks. */
export type HowIcon = 'policy' | 'rule' | 'outcome'

export type HowLink =
  | { kind: 'policy'; policyId: string; label: string }
  | { kind: 'rule'; policyId: string; ruleId: string; label: string }
  | { kind: 'add'; field: FormField; label: string }

/** One step, one plain sentence, ended by its mark; `cites`: the sentence's parts it proves. */
export interface HowStep {
  key: string
  icon: HowIcon
  text: string
  mark: Mark
  cites: CiteId[]
  link: HowLink | null
}

const OUTCOME_MARK: Record<EvOutcome['kind'], Mark> = { allow: 'pass', deny: 'fail', depends: 'unknown', none: 'none' }

/* The steps in the engine's order: the policies before the one that decides
   (one line), the one that decides and how it covers the person, each
   earlier rule that did not match, the rule that matched with its checks
   said inline (Depends: every rule that could not tell), then the outcome. */
export function howStepsOf(ev: Evidence): HowStep[] {
  const out: HowStep[] = []
  if (ev.beforeLine && ev.before.length > 0) out.push({ key: 'before', icon: 'policy', text: ev.beforeLine, mark: 'fail', cites: ['policy'], link: null })
  const d = ev.decider
  if (d) {
    const gd = d.isGlobalDefault
    out.push({ key: 'decider', icon: 'policy', text: gd && ev.beforeLine ? `So the ${d.name} decides.` : d.line, mark: 'pass', cites: ['policy', 'who'], link: gd ? null : { kind: 'policy', policyId: d.policyId, label: 'Open policy' } })
  }
  const o = ev.outcome
  const lead = ev.deciding
  const rules = o.kind === 'depends' ? ev.rules : [...ev.skipped, ...(lead ? [lead] : [])]
  for (const r of rules) {
    const isLead = r === lead
    const link: HowLink | null = isLead && ev.deciderId && r.number !== null ? { kind: 'rule', policyId: ev.deciderId, ruleId: r.ruleId, label: `Open rule ${r.number}` } : null
    out.push({ key: `rule:${r.key}`, icon: 'rule', text: r.line, mark: r.mark, cites: isLead ? ['rule', 'check'] : ['rule'], link })
  }
  const missing = o.kind === 'depends' ? (o.missing[0] ?? null) : null
  out.push({
    key: 'outcome',
    icon: 'outcome',
    text: o.line,
    mark: OUTCOME_MARK[o.kind],
    cites: ['outcome'],
    link: missing ? { kind: 'add', field: missing, label: `Add the ${(o.dependsOn[0] ?? 'fact').toLowerCase()}` } : null,
  })
  return out
}

/** The step a part of the sentence is shown on: the last that proves it (the policy that decides, the rule that matched). */
export function howStepOf(steps: readonly Pick<HowStep, 'key' | 'cites'>[], c: CiteId | null): string | null {
  if (!c) return null
  for (let i = steps.length - 1; i >= 0; i--) if (steps[i].cites.includes(c)) return steps[i].key
  return null
}

/** The answer in a line, as the panel's head says it: "Allow with 2FA · Password → Google Authenticator", "Deny", "Depends on the device". */
export function answerLineOf(o: Pick<EvOutcome, 'kind' | 'words' | 'factors'>): string {
  return o.kind === 'allow' && o.factors.length > 0 ? `${o.words} · ${o.factors.join(' → ')}` : o.words
}

// --- The sentence's ties --------------------------------------------------------------------

/** A dock answer's citation (assistant/intents.ts `Target`) as the brief's part. */
export function citeOfTarget(t: Target | null | undefined): CiteId | null {
  if (!t) return null
  if (t === 'person') return 'who'
  if (t === 'outcome' || t === 'screens') return 'outcome'
  if (t.startsWith('policy:')) return 'policy'
  if (t.startsWith('check:')) return 'check'
  if (t.startsWith('rule:')) return 'rule'
  return null
}

const FIELD_OF: Partial<Record<CheckRow['category'], FormField>> = { network: 'address', place: 'place', device: 'device', time: 'when', risk: 'risk' }

/** What a lit part lights in the sign-in row: the person for who, the fact the deciding check read for check. */
export function rowLitOf(c: CiteId | null, plan: Pick<EngineRun, 'rules'>, decisive: Decisive | null): 'person' | FormField | null {
  if (c === 'who') return 'person'
  if (c !== 'check' || !decisive) return null
  const row = plan.rules[decisive.rule]?.checks[decisive.check]
  if (!row) return null
  return row.category === 'who' ? 'person' : (FIELD_OF[row.category] ?? null)
}

const plainOf = (parts: readonly Part[]): string =>
  parts
    .map((p) => p.text)
    .join('')
    .replace(/\s+/g, ' ')
    .trim()

/** The sentence (and its conflict line) as the narrator says it once it lands. */
export function spokenOf(model: Pick<BriefModel, 'parts' | 'after'>): string {
  return [plainOf(model.parts), plainOf(model.after)].filter(Boolean).join(' ')
}
