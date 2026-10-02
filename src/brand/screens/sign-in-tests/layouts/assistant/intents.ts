import type { AccessDecision } from '../../../../data'
import { DECISION_WORDS } from '../../../../decision-words'
import { stepLabel, type SignInScreens } from '../../../testing/screens-of'
import type { FormField } from '../../../testing/sign-in-form'
import type { GroupRef } from '../../conflicts'
import type { CheckRow, EnginePolicy, EngineRule, EngineRun } from '../../engine-run'
import { eachGroupRows, type GroupRowView } from '../../journey'
import type { RunLayoutProps } from '../types'

/* -----------------------------------------------------------------------------
   The assistant's words (assistant/, shared by Brief and Focus): the
   suggestion chips a run offers, and the answer to anything asked of it —
   typed, spoken or a chip pressed. PURE: every word is composed from the plan
   (engine-run.ts), its findings (conflicts.ts), the per-group rows
   (journey.ts) and what the person sees (screens-of.ts). Nothing is made up;
   an ask it cannot answer from them says so.

   API (stable — two layouts build on it):

     chipsFor(plan, props) → Chip[]
       Only the questions that have a REAL answer for this run, likeliest
       first, at most 6: "Why does it depend?" / "Why denied?", "Why not
       rule 1?" (only for a rule that did not match), "Who else covers Maya?"
       (only when another policy covers her) or "Why the Global Default?",
       "Set the device" (only when a fact the rules read is not stated),
       "What will Maya see?", "Show every check", "As Finance only" (a person
       in two or more groups), "Open rule 2".

     answer(query, plan, props) → Answer
       `query` is a chip's id (`chip.id`) or free text. The Answer is one
       SENTENCE of parts — plain text and CITATIONS, each naming the TARGET
       on the canvas it is about — optional further lines (`more`), what the
       view should bring into focus, one ACTION for a button, and `say`: the
       same words, plain, for the voice.

     runAction(action, props)   does what an action's button says, through
                                the layout's own callbacks.
     narration(plan, props)     the run's few lines for the narrator: start,
                                policy, rules, verdict (and `all`, at once).

   Targets match the canvas's `data-node` ids where there is one:
     'person'                  the sign-in (data-node "sign-in")
     'policy:<policyId>'       a policy (data-node "policy:<id>")
     'rule:<ruleId>'           a rule, or 'rule:<LAST_ROW>' for "Nothing else matched"
     'check:<ruleId>:<cat>'    one check row of a rule (cat: who, network, place, device, time, risk)
     'outcome'                 the answer (data-node "outcome")
     'screens'                 what the person sees
   -------------------------------------------------------------------------- */

export type Tone = 'positive' | 'negative' | 'notice' | 'neutral'
export type Mark = 'pass' | 'fail' | 'unknown'

export type Target = 'person' | 'outcome' | 'screens' | `policy:${string}` | `rule:${string}` | `check:${string}:${string}`

export interface Part {
  text: string
  /** A citation: the phrase is about this thing on the canvas. */
  cite?: Target
  /** The citation's meaning, for its colour (house rule: green matched, red failed, amber can't tell). */
  tone?: Tone
  /** A check's mark, drawn beside the phrase. */
  mark?: Mark
}

export type Action =
  | { kind: 'asGroup'; groupId: string; label: string }
  | { kind: 'add'; field: FormField; label: string }
  | { kind: 'openRule'; policyId: string; ruleId: string; label: string }
  | { kind: 'openPolicy'; policyId: string; label: string }

export type ChipId = `ask:${string}`

export interface Chip {
  id: ChipId
  label: string
}

export interface Answer {
  /** Stable for the same question on the same run: 'why-rule:1', 'others', 'see'… */
  id: string
  /** The question as the thread shows it: a chip's label, or what was typed. */
  ask: string
  /** The answer, one sentence of parts. */
  sentence: Part[]
  /** Further lines, each a sentence of parts: every check, every other policy. */
  more?: Part[][]
  tone: Tone
  /** What the view brings into focus as the answer shows. */
  focus?: Target
  action?: Action
  /** The sentence, plain, for the voice. */
  say: string
  /** False for the honest "I can explain…" reply to an ask it does not understand. */
  known: boolean
}

/** What of a layout's props the words need (pure: tests pass just these). */
export type AskProps = Pick<RunLayoutProps, 'asGroup' | 'screens'> & Partial<Pick<RunLayoutProps, 'onAsGroup' | 'onAdd' | 'onOpenRule' | 'onOpenPolicy'>>

// --- Small words ----------------------------------------------------------------------------

const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
const numWord = (n: number) => NUM[n] ?? String(n)
const list = (xs: readonly string[]) => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)
const lowerFirst = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s)
const capital = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)
/** A decision mid-sentence: "allow on 1 factor", "allow with 2FA", "deny". */
const said = (d: AccessDecision) => lowerFirst(DECISION_WORDS[d])
const decisionTone = (d: AccessDecision): Tone => (d === 'deny' ? 'negative' : 'positive')
const markTone = (m: Mark): Tone => (m === 'pass' ? 'positive' : m === 'fail' ? 'negative' : 'notice')

const T = (text: string): Part => ({ text })
const C = (text: string, cite: Target, tone?: Tone, mark?: Mark): Part => ({ text, cite, ...(tone ? { tone } : {}), ...(mark ? { mark } : {}) })

/** One number per distinct target the SENTENCE cites, in reading order (the further lines are underlined, not numbered: a few markers, not a wall). */
export function citeNumbers(a: Pick<Answer, 'sentence'>): Map<Target, number> {
  const out = new Map<Target, number>()
  for (const p of a.sentence) if (p.cite && p.cite !== 'person' && !out.has(p.cite)) out.set(p.cite, out.size + 1)
  return out
}

/** The parts as one plain line: what the voice says, what a test reads. */
export const plain = (parts: readonly Part[]): string => parts.map((p) => p.text).join('').replace(/\s+/g, ' ').trim()

// --- The run, read --------------------------------------------------------------------------

interface Ctx {
  plan: EngineRun
  /** "Maya Iyer", or "A member of Finance". */
  person: string
  /** "Maya", or "a member of Finance" mid-sentence. */
  first: string
  isGroup: boolean
  screens: readonly SignInScreens[]
  groups: readonly GroupRef[]
  groupRows: readonly GroupRowView[] | null
  canGroup: boolean
}

function ctxOf(plan: EngineRun, props: AskProps): Ctx {
  const isGroup = props.asGroup !== null && props.asGroup !== undefined
  const name = plan.conflicts?.personName || plan.asEachGroup?.personName || ''
  const person = isGroup ? `A member of ${props.asGroup}` : name || 'This person'
  const first = isGroup ? `a member of ${props.asGroup}` : name ? (name.trim().split(/\s+/)[0] ?? name) : 'they'
  return {
    plan,
    person,
    first,
    isGroup,
    screens: props.screens ?? [],
    groups: plan.asEachGroup?.groups ?? plan.conflicts?.groups ?? [],
    groupRows: eachGroupRows(plan),
    canGroup: typeof props.onAsGroup === 'function' && !isGroup,
  }
}

const landingOf = (plan: EngineRun): EngineRule | undefined => (plan.landing !== null ? plan.rules[plan.landing] : undefined)
const ruleNo = (r: EngineRule) => (r.index ?? 0) + 1
const ruleTarget = (r: Pick<EngineRule, 'id'>): Target => `rule:${r.id}`
const checkTarget = (r: Pick<EngineRule, 'id'>, c: Pick<CheckRow, 'category'>): Target => `check:${r.id}:${c.category}`
const policyTarget = (id: string): Target => `policy:${id}`
/** "rule 2", or "Nothing else matched" for the last row. */
const ruleWord = (r: EngineRule) => (r.index === null ? 'Nothing else matched' : `rule ${ruleNo(r)}`)

/** The rules before the walk stopped that did not match, in order. */
const missedBefore = (plan: EngineRun) => plan.rules.slice(0, plan.landing ?? plan.rules.length).filter((r) => r.index !== null && r.visited && r.state === 'no-match')
/** The check that ended a rule that did not match, or the first it could not tell. */
function failingOf(r: EngineRule): CheckRow | undefined {
  if (r.failing !== null) return r.checks[r.failing]
  return r.checks.find((c) => c.status === 'fail') ?? r.checks.find((c) => c.status === 'unknown')
}
/** The rows the engine read in a rule. */
const readOf = (r: EngineRule) => r.checks.slice(0, Math.max(r.checked, r.failing !== null ? r.failing + 1 : 0))

/** A check's finding, in the sign-in's words ("Home broadband is not in Corporate offices"), with a fallback. */
const findingOf = (c: CheckRow) => c.line || c.say || `${c.word} · ${c.value}`

/* A Who row's fact and the rule's requirement, said apart: "Maya Iyer is in
   Engineering" (her fact — the group that lets her in) and, beside it, who
   the rule is for. Never the requirement put into her fact. */
function checkParts(r: EngineRule, c: CheckRow): Part[] {
  const m: Mark = c.status
  const out: Part[] = [T(`${c.word}: `), C(findingOf(c), checkTarget(r, c), markTone(m), m)]
  if (c.category === 'who' && c.requirement && c.status === 'pass') out.push(T(` · ${capital(ruleWord(r))} is for ${c.requirement}`))
  else if (c.status === 'unknown' && c.requirement) out.push(T(` · it needs ${lowerFirst(c.requirement)}`))
  return out
}

/** The facts' form fields that would settle a Depends, each once, in the order they matter. */
function unstatedFields(plan: EngineRun): FormField[] {
  const out: FormField[] = []
  for (const r of plan.rules) {
    if (!r.visited) continue
    for (const c of readOf(r).concat(r.state === 'unknown' ? r.checks : [])) if (c.status === 'unknown' && c.missing && !out.includes(c.missing)) out.push(c.missing)
  }
  return out
}

const FIELD_WORD: Partial<Record<FormField, string>> = { device: 'device', address: 'network', place: 'place', when: 'time', risk: 'risk score', person: 'person', app: 'application' }
const fieldWord = (f: FormField) => FIELD_WORD[f] ?? 'sign-in'
const FIELD_CATS: Partial<Record<FormField, readonly CheckRow['category'][]>> = { device: ['device'], address: ['network', 'place'], place: ['place', 'network'], when: ['time'], risk: ['risk'] }

/* The policies that did not decide, by why: those that also cover the person
   (a conflict), those asked before it that do not, those not on, and those
   never asked because the one deciding came first. */
function othersOf(plan: EngineRun) {
  const covers = new Map((plan.conflicts?.policies ?? []).map((p) => [p.policyId, p]))
  const rest = plan.policies.filter((p) => !p.decides)
  const isOn = (p: EnginePolicy) => p.status === 'active' || p.status === 'always-on'
  const also = rest.filter((p) => covers.has(p.policyId))
  const missed = rest.filter((p) => !covers.has(p.policyId) && p.scanned && !p.isGlobalDefault)
  const off = rest.filter((p) => !covers.has(p.policyId) && !p.scanned && !isOn(p))
  const unasked = rest.filter((p) => !covers.has(p.policyId) && !p.scanned && isOn(p))
  return { covers, also, missed, off, unasked }
}

/** What the person is asked for, screen by screen, for a decision. */
function factorsOf(screens: readonly SignInScreens[], d: AccessDecision | null): string[] {
  if (!d) return []
  const sc = screens.find((x) => x.decision === d)
  return (sc?.steps ?? []).filter((st) => st.kind !== 'deny').map(stepLabel)
}
function denyMessageOf(screens: readonly SignInScreens[]): string {
  for (const sc of screens) {
    const st = sc.steps.find((x) => x.kind === 'deny')
    if (st && st.kind === 'deny') return st.message
  }
  return ''
}
/** "the password", "the password, then miniOrange Push". */
const askedFor = (f: readonly string[]) => f.map((x, i) => (i === 0 && x === 'Password' ? 'the password' : x)).join(', then ')

const ruleAction = (policyId: string | null | undefined, r: EngineRule | undefined): Action | undefined =>
  policyId && r && r.index !== null ? { kind: 'openRule', policyId, ruleId: r.id, label: `Open rule ${ruleNo(r)} ↗` } : policyId ? { kind: 'openPolicy', policyId, label: 'Open the policy ↗' } : undefined

function outcomeTone(plan: EngineRun): Tone {
  const o = plan.outcome
  if (o.status === 'decided' && o.decision) return decisionTone(o.decision)
  return o.status === 'depends' ? 'notice' : 'neutral'
}

// --- Intents --------------------------------------------------------------------------------

type Intent =
  | { kind: 'why-rule'; rule: number | null }
  | { kind: 'others' }
  | { kind: 'gd' }
  | { kind: 'see' }
  | { kind: 'checks' }
  | { kind: 'group'; groupId: string | null }
  | { kind: 'add'; field: FormField }
  | { kind: 'open'; rule: number | null }
  | { kind: 'verdict' }
  | { kind: 'policy' }
  | { kind: 'person' }
  | { kind: 'depends' }
  | { kind: 'unknown' }

const WORD_NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, first: 1, second: 2, third: 3, last: -1 }

function ruleNumberIn(t: string, plan: EngineRun): number | null | undefined {
  const rm = t.match(/\brule\s*(\d+|one|two|three|four|five|six|seven|eight|nine|ten|first|second|third|last)\b/) ?? t.match(/\b(first|second|third|last)\s+rule\b/)
  if (!rm) return undefined
  const k = rm[1]
  const n = /^\d+$/.test(k) ? Number(k) : (WORD_NUM[k] ?? null)
  const count = plan.rules.filter((r) => r.index !== null).length
  return n === -1 ? count || null : n
}

/* What a few words ask for: keywords, the most specific first; a group is
   found by its name. */
function matchIntent(raw: string, ctx: Ctx): Intent {
  const t = ` ${raw.toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim()} `
  if (t.trim() === '') return { kind: 'unknown' }
  const n = ruleNumberIn(t, ctx.plan)
  if (/\b(open|builder|edit|go to|fix)\b/.test(t)) return { kind: 'open', rule: n ?? null }
  const named = ctx.groups.find((g) => t.includes(` ${g.name.toLowerCase()} `) || t.includes(` ${g.name.toLowerCase()}s `))
  if (named && /\b(as|only|run|alone|just)\b/.test(t)) return { kind: 'group', groupId: named.id }
  if (/\b(as \w+ only|only as|run as|each group|as a group|per group|both groups|all groups|every group)\b/.test(t)) return { kind: 'group', groupId: null }
  if (/\b(see|sees|screen|screens|prompt|prompted|shown|page|asked for)\b/.test(t)) return { kind: 'see' }
  if (/\b(global default|fallback|default policy)\b/.test(t)) return { kind: 'gd' }
  if (/\b(who else|other polic|another polic|conflicts?|also covers?|others|clash)\b/.test(t)) return { kind: 'others' }
  if (/\b(every|all|each|full|show)\b.*\bchecks?\b|\bchecks\b|\bdetails?\b|\bconditions?\b/.test(t)) return { kind: 'checks' }
  if (n !== undefined) return { kind: 'why-rule', rule: n }
  if (/\b(depends?|depending|can't tell|cant tell|unknown|not stated|missing)\b/.test(t)) return { kind: 'depends' }
  if (/\b(device|laptop|phone|mdm)\b/.test(t)) return { kind: 'add', field: 'device' }
  if (/\b(network|ip|address|office|location|place|where|home)\b/.test(t)) return { kind: 'add', field: /\b(place|location|where|city)\b/.test(t) && !/\b(network|ip|address)\b/.test(t) ? 'place' : 'address' }
  if (/\b(risk|score)\b/.test(t)) return { kind: 'add', field: 'risk' }
  if (/\b(time|hour|day)\b/.test(t)) return { kind: 'add', field: 'when' }
  if (/\b(who is|which groups?|groups?|member|in which)\b/.test(t)) return { kind: 'person' }
  if (/\b(denied|deny|blocked|refused)\b/.test(t)) return { kind: 'verdict' }
  if (/\b(polic(y|ies)|which|decides?|decided)\b/.test(t)) return { kind: 'policy' }
  if (/\b(why|fail|failed|didn't|didnt|not match|no match)\b/.test(t)) return missedBefore(ctx.plan).length > 0 ? { kind: 'why-rule', rule: null } : { kind: 'verdict' }
  if (/\b(outcome|verdict|result|decision|allowed?|access|factors?|mfa|2fa|granted|get|gets)\b/.test(t)) return { kind: 'verdict' }
  return { kind: 'unknown' }
}

function intentOfChip(id: ChipId): Intent {
  const [, kind, arg] = id.split(':')
  switch (kind) {
    case 'why':
      return { kind: 'why-rule', rule: Number(arg) || null }
    case 'others':
      return { kind: 'others' }
    case 'gd':
      return { kind: 'gd' }
    case 'see':
      return { kind: 'see' }
    case 'checks':
      return { kind: 'checks' }
    case 'group':
      return { kind: 'group', groupId: arg || null }
    case 'add':
      return { kind: 'add', field: (arg || 'device') as FormField }
    case 'open':
      return { kind: 'open', rule: arg ? Number(arg) || null : null }
    case 'depends':
      return { kind: 'depends' }
    case 'deny':
    case 'verdict':
      return { kind: 'verdict' }
    case 'policy':
      return { kind: 'policy' }
    default:
      return { kind: 'unknown' }
  }
}

export const isChipId = (q: string): q is ChipId => q.startsWith('ask:')

// --- The chips --------------------------------------------------------------------------------

/** The suggestions for THIS run: only those with a real answer, the likeliest first, at most six. */
export function chipsFor(plan: EngineRun, props: AskProps): Chip[] {
  const out: Chip[] = []
  try {
    if (plan.empty || !plan.decider) return out
    const ctx = ctxOf(plan, props)
    const o = plan.outcome
    const landing = landingOf(plan)
    if (o.status === 'depends') out.push({ id: 'ask:depends', label: 'Why does it depend?' })
    else if (o.status === 'decided' && o.decision === 'deny') out.push({ id: 'ask:deny', label: 'Why denied?' })
    const missed = missedBefore(plan)
    if (missed[0]) out.push({ id: `ask:why:${ruleNo(missed[0])}`, label: `Why not rule ${ruleNo(missed[0])}?` })
    const unstated = unstatedFields(plan)
    if (unstated[0]) out.push({ id: `ask:add:${unstated[0]}`, label: `Set the ${fieldWord(unstated[0])}` })
    const others = othersOf(plan)
    if (plan.decider.isGlobalDefault) out.push({ id: 'ask:gd', label: 'Why the Global Default?' })
    else if (others.also.length > 0) out.push({ id: 'ask:others', label: ctx.isGroup ? 'Which other policies cover them?' : `Who else covers ${ctx.first}?` })
    if (ctx.screens.length > 0) out.push({ id: 'ask:see', label: ctx.isGroup ? 'What will they see?' : `What will ${ctx.first} see?` })
    if (landing && landing.index !== null && landing.checks.length > 0 && o.status === 'decided') out.push({ id: 'ask:checks', label: 'Show every check' })
    if (ctx.canGroup && ctx.groupRows) {
      for (const row of ctx.groupRows.filter((g) => g.groupId).slice(0, 2)) {
        const g = ctx.groups.find((x) => x.id === row.groupId)
        if (g) out.push({ id: `ask:group:${g.id}`, label: `As ${g.name} only` })
      }
    }
    if (o.policyId && landing && landing.index !== null && o.status === 'decided') out.push({ id: `ask:open:${ruleNo(landing)}`, label: `Open rule ${ruleNo(landing)}` })
  } catch {
    /* A plan it cannot read: no chips, never a throw. */
  }
  return out.slice(0, 6)
}

// --- The answers ------------------------------------------------------------------------------

const UNKNOWN_SENTENCE = "I can explain this sign-in's policies, rules and outcome — try one of these."

function make(a: Omit<Answer, 'say' | 'known'> & { known?: boolean }): Answer {
  return { ...a, known: a.known ?? true, say: plain(a.sentence) }
}

/** The answer to a chip (its id) or to anything typed or said. Never throws. */
export function answer(query: string | ChipId, plan: EngineRun, props: AskProps, label?: string): Answer {
  const ask = label ?? (isChipId(query) ? (chipsFor(plan, props).find((c) => c.id === query)?.label ?? query.slice(4)) : query.trim())
  try {
    if (plan.empty) return make({ id: 'empty', ask, sentence: [T('Pick a person and an application, then Run, and I can explain the sign-in.')], tone: 'neutral', known: false })
    const ctx = ctxOf(plan, props)
    const intent = isChipId(query) ? intentOfChip(query) : matchIntent(query, ctx)
    return answerOf(intent, ctx, ask)
  } catch {
    return make({ id: 'unknown', ask, sentence: [T(UNKNOWN_SENTENCE)], tone: 'neutral', known: false })
  }
}

function answerOf(intent: Intent, ctx: Ctx, ask: string): Answer {
  const { plan, person, first } = ctx
  const landing = landingOf(plan)
  const decider = plan.decider
  const o = plan.outcome
  const noDecider = (): Answer => make({ id: 'none', ask, sentence: [T(`No policy decides this sign-in on ${plan.appName}.`)], tone: 'neutral' })

  switch (intent.kind) {
    case 'why-rule': {
      if (!decider) return noDecider()
      const rules = plan.rules.filter((r) => r.index !== null)
      let n = intent.rule
      if (n === null) {
        const m = missedBefore(plan)[0] ?? plan.rules.slice(0, plan.landing ?? 0).find((r) => r.state === 'unknown')
        if (!m) return answerOf({ kind: 'verdict' }, ctx, ask)
        n = ruleNo(m)
      }
      const r = rules.find((x) => ruleNo(x) === n)
      if (!r) {
        return make({
          id: `why-rule:${n}:none`,
          ask,
          sentence: [C(decider.name, policyTarget(decider.id)), T(` has ${rules.length === 1 ? '1 rule' : `${rules.length} rules`}, then `), C('Nothing else matched', ruleTarget(plan.rules[plan.rules.length - 1] ?? { id: 'last' })), T(` — there is no rule ${n}.`)],
          tone: 'neutral',
          focus: policyTarget(decider.id),
        })
      }
      const rule = C(`Rule ${n} · ${r.name}`, ruleTarget(r))
      if (r.state === 'no-match') {
        const c = failingOf(r)
        const next = plan.rules[plan.rules.indexOf(r) + 1]
        const unread = r.checks.slice(readOf(r).length).map((x) => x.word)
        const subs = c ? c.subs.filter((x) => x.status === 'fail').slice(0, 4) : []
        return make({
          id: `why-rule:${n}`,
          ask,
          sentence: [
            rule,
            T(" doesn't apply: "),
            ...(c ? [C(findingOf(c), checkTarget(r, c), 'negative', 'fail')] : [T('a check failed')]),
            ...(next ? [T(', so the engine reads on to '), C(next.index === null ? 'Nothing else matched' : `rule ${ruleNo(next)}`, ruleTarget(next))] : []),
            T('.'),
          ],
          more: [
            ...subs.map((x) => [T(`${x.label}: `), C(x.actual || 'Not stated', c ? checkTarget(r, c) : ruleTarget(r), 'negative', 'fail'), T(x.required ? ` · needs ${lowerFirst(x.required)}` : '')]),
            ...(unread.length > 0 ? [[T(`Not read after it: ${list(unread)} — the first failing check ends a rule.`)]] : []),
          ],
          tone: 'negative',
          focus: c ? checkTarget(r, c) : ruleTarget(r),
          action: ruleAction(decider.id, r),
        })
      }
      if (r.state === 'unknown') {
        const c = r.checks.find((x) => x.status === 'unknown')
        return make({
          id: `why-rule:${n}`,
          ask,
          sentence: [rule, T(" can't tell: "), ...(c ? [C(`the ${c.word.toLowerCase()} is not stated`, checkTarget(r, c), 'notice', 'unknown'), T(c.requirement ? `, and it needs ${lowerFirst(c.requirement)}` : '')] : [T('a fact it reads is not stated')]), T('.')],
          more: readOf(r).map((x) => checkParts(r, x)),
          tone: 'notice',
          focus: ruleTarget(r),
          action: c?.missing ? { kind: 'add', field: c.missing, label: `Set the ${fieldWord(c.missing)}` } : ruleAction(decider.id, r),
        })
      }
      if (r.state === 'match') {
        const read = readOf(r)
        return make({
          id: `why-rule:${n}`,
          ask,
          sentence: [
            rule,
            T(' matches: '),
            ...read.flatMap((x, i) => [...(i === 0 ? [] : [T(i === read.length - 1 ? ' and ' : ', ')]), C(findingOf(x), checkTarget(r, x), 'positive', 'pass')]),
            T(o.status === 'decided' ? ', so it decides ' : ', and its answer is '),
            C(said(r.decision), 'outcome', decisionTone(r.decision)),
            T('.'),
          ],
          tone: decisionTone(r.decision),
          focus: ruleTarget(r),
          action: ruleAction(decider.id, r),
        })
      }
      if (r.state === 'off') return make({ id: `why-rule:${n}`, ask, sentence: [rule, T(' is switched off, so the engine passes over it.')], tone: 'neutral', focus: ruleTarget(r), action: ruleAction(decider.id, r) })
      /* Not reached: the first match decides. A later rule that also applies says so. */
      const clash = plan.conflicts?.rules.find((x) => x.ruleId === r.id)
      return make({
        id: `why-rule:${n}`,
        ask,
        sentence: [
          rule,
          T(" wasn't read: "),
          ...(landing && landing.index !== null ? [C(`rule ${ruleNo(landing)}`, ruleTarget(landing)), T(' matched first, and the first match decides.')] : [T('the walk stopped before it.')]),
        ],
        more: clash
          ? [[T(`It ${clash.match === 'unknown' ? 'might also apply' : 'also applies'} to ${first}${clash.via.say ? ` ${clash.via.say}` : ''} and would `), C(said(r.decision), ruleTarget(r), clash.kind === 'conflict' ? 'notice' : 'neutral'), T('.')], ...(clash.fix ? [[T(`${clash.fix}.`)]] : [])]
          : undefined,
        tone: clash?.kind === 'conflict' ? 'notice' : 'neutral',
        focus: ruleTarget(r),
        action: ruleAction(decider.id, r),
      })
    }

    case 'gd': {
      if (!decider) return noDecider()
      const gd = plan.policies.find((p) => p.isGlobalDefault)
      if (decider.isGlobalDefault || !gd) return answerOf({ kind: 'others' }, ctx, ask)
      return make({
        id: 'gd',
        ask,
        sentence: [C(gd.name, policyTarget(gd.policyId), 'neutral'), T(" isn't used: "), C(decider.name, policyTarget(decider.id)), T(` covers ${ctx.isGroup ? 'them' : first} first. The Global Default applies only when no ${plan.appName} policy covers someone.`)],
        tone: 'neutral',
        focus: policyTarget(decider.id),
      })
    }

    case 'others': {
      if (!decider) return noDecider()
      const { covers, also, missed, off, unasked } = othersOf(plan)
      const dec = C(decider.name, policyTarget(decider.id))
      if (decider.isGlobalDefault) {
        const misses = plan.conflicts?.missedBy ?? []
        const groups = ctx.groups.map((g) => g.name)
        const appPolicies = plan.policies.filter((p) => !p.isGlobalDefault)
        return make({
          id: 'others',
          ask,
          sentence:
            appPolicies.length === 0
              ? [T(`${plan.appName} has no policy of its own, so the `), dec, T(' decides for '), C(person, 'person'), T('.')]
              : [T(`No ${plan.appName} policy covers `), C(person, 'person'), T(groups.length > 0 && !ctx.isGroup ? ` (${list(groups)})` : ''), T(', so the tenant’s fallback, the '), dec, T(', decides.')],
          more: (misses.length > 0 ? misses.map((m) => ({ id: m.policyId, name: m.policyName, say: m.say })) : appPolicies.map((p) => ({ id: p.policyId, name: p.name, say: p.reason }))).map((m) => {
            const p = plan.policies.find((x) => x.policyId === m.id)
            return [C(`${p ? `${p.order}. ` : ''}${m.name}`, policyTarget(m.id), 'neutral'), T(m.say ? ` · ${m.say}` : '')]
          }),
          tone: 'neutral',
          focus: policyTarget(decider.id),
        })
      }
      if (also.length > 0) {
        const p = also[0]
        const c = covers.get(p.policyId)
        const would = c && c.status === 'decided' && c.decision ? c.decision : null
        const finding = plan.conflicts?.findings.find((f) => (f.kind === 'policy-conflict' || f.kind === 'same-group-policy') && f.target.policyId === p.policyId)
        const fixAt = finding?.fixAt
        const fixRule = fixAt?.ruleId ? plan.rules.find((x) => x.id === fixAt.ruleId) : undefined
        return make({
          id: 'others',
          ask,
          sentence: [
            C(p.name, policyTarget(p.policyId), 'notice'),
            T(` also covers ${ctx.isGroup ? 'them' : first}${c?.via.say ? ` ${c.via.say}` : ''}`),
            ...(would ? [T(' and would '), C(said(would), policyTarget(p.policyId), 'notice'), T(c?.ruleNumber ? ` (rule ${c.ruleNumber})` : '')] : c && c.possible.length > 1 ? [T(` and can't tell (${c.possible.map(said).join(' or ')})`)] : []),
            T(' — it isn’t used: '),
            dec,
            T(' comes first, and only the first policy that covers someone applies.'),
          ],
          more: [
            ...also.slice(1).map((x) => [C(`${x.order}. ${x.name}`, policyTarget(x.policyId), 'notice'), T(` · also covers ${first} · not used`)]),
            ...(c?.fix ? [[T(`To change it: ${lowerFirst(c.fix)}.`)]] : []),
          ],
          tone: 'notice',
          focus: policyTarget(p.policyId),
          action: fixAt ? (fixRule && fixRule.index !== null ? { kind: 'openRule', policyId: fixAt.policyId, ruleId: fixRule.id, label: `Open rule ${ruleNo(fixRule)} ↗` } : { kind: 'openPolicy', policyId: fixAt.policyId, label: 'Open the policy ↗' }) : undefined,
        })
      }
      if (missed.length > 0) {
        return make({
          id: 'others',
          ask,
          sentence: [
            ...missed.flatMap((p, i) => [...(i === 0 ? [] : [T(i === missed.length - 1 ? ' and ' : ', ')]), C(p.name, policyTarget(p.policyId), 'neutral')]),
            T(missed.length === 1 ? " doesn't cover " : " don't cover "),
            C(person, 'person'),
            T(', so '),
            dec,
            T(' is the first that does.'),
          ],
          more: missed.map((p) => [C(`${p.order}. ${p.name}`, policyTarget(p.policyId), 'neutral'), T(p.reason ? ` · ${p.reason}` : '')]),
          tone: 'neutral',
          focus: policyTarget(decider.id),
        })
      }
      return make({
        id: 'others',
        ask,
        sentence: [T('No other policy covers '), C(person, 'person'), T(` on ${plan.appName}: `), dec, T(' applies.')],
        more: [
          ...(unasked.length > 0 ? [[T(`Not asked: ${unasked.map((p) => `${p.order}. ${p.name}`).join(', ')} — ${decider.name} applies first.`)]] : []),
          ...off.map((p) => [C(`${p.order}. ${p.name}`, policyTarget(p.policyId), 'neutral'), T(p.reason ? ` · ${p.reason}` : '')]),
        ],
        tone: 'neutral',
        focus: policyTarget(decider.id),
      })
    }

    case 'see': {
      if (ctx.screens.length === 0) return make({ id: 'see', ask, sentence: [T('There is no sign-in page to show: no decision was reached.')], tone: 'neutral' })
      const who = C(person, 'person')
      if (o.status === 'decided' && o.decision) {
        if (o.decision === 'deny') {
          const msg = denyMessageOf(ctx.screens)
          return make({ id: 'see', ask, sentence: [who, T(' is blocked'), ...(msg ? [T(', with '), C(`“${msg}”`, 'screens', 'negative')] : []), T('.')], tone: 'negative', focus: 'screens' })
        }
        const f = factorsOf(ctx.screens, o.decision)
        return make({
          id: 'see',
          ask,
          sentence: f.length > 0 ? [who, T(' is asked for '), C(askedFor(f), 'screens', 'positive'), T(', then is in.')] : [who, T(' is let in.')],
          tone: 'positive',
          focus: 'screens',
        })
      }
      const outs = o.view.outcomes
      return make({
        id: 'see',
        ask,
        sentence: [T(`It depends, so ${ctx.screens.length} sign-in ${ctx.screens.length === 1 ? 'page is' : 'pages are'} possible — one for each answer.`)],
        more: (outs.length > 0 ? outs : ctx.screens.map((s) => ({ label: DECISION_WORDS[s.decision], decision: s.decision }))).map((x) => {
          const f = factorsOf(ctx.screens, x.decision)
          const msg = x.decision === 'deny' ? denyMessageOf(ctx.screens) : ''
          return [T(`${capital(x.label)}: `), C(x.decision === 'deny' ? (msg ? `blocked, with “${msg}”` : 'blocked') : askedFor(f) || said(x.decision), 'screens', decisionTone(x.decision))]
        }),
        tone: 'notice',
        focus: 'screens',
      })
    }

    case 'checks': {
      if (!decider) return noDecider()
      if (o.status === 'depends') {
        const open = plan.rules.filter((r) => r.index !== null && r.visited && r.state === 'unknown')
        if (open.length === 0) return answerOf({ kind: 'depends' }, ctx, ask)
        return make({
          id: 'checks',
          ask,
          sentence: [...open.flatMap((r, i) => [...(i === 0 ? [] : [T(i === open.length - 1 ? ' and ' : ', ')]), C(`Rule ${ruleNo(r)}`, ruleTarget(r), 'notice')]), T(open.length === 1 ? " can't tell, with these checks:" : " can't tell, with these checks:")],
          more: open.slice(0, 3).flatMap((r) => [[C(`Rule ${ruleNo(r)} · ${r.name}`, ruleTarget(r), 'notice')], ...r.checks.slice(0, Math.max(r.checked, 1)).map((c) => checkParts(r, c))]),
          tone: 'notice',
          focus: ruleTarget(open[0]),
        })
      }
      if (!landing || landing.index === null || landing.checks.length === 0) {
        /* The last row decided: every rule before it, by the check that ended it. */
        const missed = missedBefore(plan)
        return make({
          id: 'checks',
          ask,
          sentence: [T(missed.length === 0 ? `${decider.name} has no rules, so ` : `None of ${decider.name}'s ${missed.length === 1 ? 'rule matches' : `${missed.length} rules match`}, so `), C('Nothing else matched', landing ? ruleTarget(landing) : 'outcome'), T(' decides.')],
          more: missed.map((r) => {
            const c = failingOf(r)
            return [C(`Rule ${ruleNo(r)}`, ruleTarget(r), 'negative'), T(': '), ...(c ? [C(findingOf(c), checkTarget(r, c), 'negative', 'fail')] : [T('a check failed')])]
          }),
          tone: outcomeTone(plan),
          focus: landing ? ruleTarget(landing) : 'outcome',
        })
      }
      const n = landing.checks.length
      return make({
        id: 'checks',
        ask,
        sentence: [
          C(`Rule ${ruleNo(landing)} · ${landing.name}`, ruleTarget(landing)),
          T(` reads ${numWord(n)} ${n === 1 ? 'check' : 'checks'}`),
          T(landing.state === 'match' ? `, and ${n === 1 ? 'it passes' : n === 2 ? 'both pass' : 'all pass'}:` : ':'),
        ],
        more: landing.checks.flatMap((c) => [checkParts(landing, c), ...c.subs.filter((x) => x.label && c.subs.length > 1).map((x) => [T(` ${x.label}: `), C(x.actual || 'Not stated', checkTarget(landing, c), markTone(x.status), x.status), T(x.required ? ` · needs ${lowerFirst(x.required)}` : '')])]),
        tone: decisionTone(landing.decision),
        focus: ruleTarget(landing),
        action: ruleAction(decider.id, landing),
      })
    }

    case 'group': {
      const rows = ctx.groupRows
      if (ctx.isGroup) return make({ id: 'group', ask, sentence: [T('This is tested as '), C(lowerFirst(person), 'person'), T(': there is no other group to run as.')], tone: 'neutral', focus: 'person' })
      if (!rows || ctx.groups.length < 2) {
        const g = ctx.groups.map((x) => x.name)
        return make({ id: 'group', ask, sentence: g.length === 1 ? [C(person, 'person'), T(` is only in ${g[0]}, so there is no other group to run as.`)] : [C(person, 'person'), T(' is in no group to run as.')], tone: 'neutral', focus: 'person' })
      }
      if (intent.groupId) {
        const row = rows.find((x) => x.groupId === intent.groupId)
        const g = ctx.groups.find((x) => x.id === intent.groupId)
        if (row && g) {
          const d = row.status === 'decided' ? row.decision : null
          return make({
            id: `group:${g.id}`,
            ask,
            sentence: [T(`As ${g.name} alone, `), C(first, 'person'), T(' would get '), C(d ? said(d) : lowerFirst(row.words), 'outcome', d ? decisionTone(d) : 'notice'), T(row.source ? ` — ${row.source}.` : '.')],
            more: [[T(`Today ${first} gets ${lowerFirst(rows.find((x) => x.current)?.words ?? DECISION_WORDS[o.decision ?? '1fa'])}${plan.asEachGroup?.why ? ` — ${plan.asEachGroup.why}` : ''}.`)]],
            tone: d ? decisionTone(d) : 'notice',
            focus: 'person',
            action: ctx.canGroup ? { kind: 'asGroup', groupId: g.id, label: `Run as ${g.name} only` } : undefined,
          })
        }
      }
      return make({
        id: 'group',
        ask,
        sentence: [C(person, 'person'), T(` is in ${list(ctx.groups.map((x) => x.name))}. Each group alone gets:`)],
        more: rows.map((x) => [T(`${x.label}: `), C(x.decision && x.status === 'decided' ? DECISION_WORDS[x.decision] : x.words, 'outcome', x.status === 'decided' && x.decision ? decisionTone(x.decision) : 'notice'), T(x.source ? ` · ${x.source}` : '')]),
        tone: 'neutral',
        focus: 'person',
      })
    }

    case 'add': {
      const cats = FIELD_CATS[intent.field] ?? []
      const word = fieldWord(intent.field)
      const unknownRules = plan.rules.filter((r) => r.visited && r.state === 'unknown' && r.checks.some((c) => cats.includes(c.category) && c.status === 'unknown'))
      if (unknownRules.length > 0) {
        const r0 = unknownRules[0]
        const c0 = r0.checks.find((c) => cats.includes(c.category) && c.status === 'unknown')
        return make({
          id: `add:${intent.field}`,
          ask,
          sentence: [
            C(`The ${word} is not stated`, c0 ? checkTarget(r0, c0) : ruleTarget(r0), 'notice', 'unknown'),
            T(', so '),
            ...unknownRules.flatMap((r, i) => [...(i === 0 ? [] : [T(i === unknownRules.length - 1 ? ' and ' : ', ')]), C(r.index === null ? 'Nothing else matched' : `rule ${ruleNo(r)}`, ruleTarget(r), 'notice')]),
            T(` can't tell. State it to see which rule decides.`),
          ],
          tone: 'notice',
          focus: ruleTarget(unknownRules[0]),
          action: { kind: 'add', field: intent.field, label: `Set the ${word}` },
        })
      }
      /* Stated: what it is, where the rules read it. */
      const seen: { r: EngineRule; c: CheckRow }[] = []
      for (const r of plan.rules) for (const c of readOf(r)) if (cats.includes(c.category)) seen.push({ r, c })
      if (seen.length === 0) return make({ id: `add:${intent.field}`, ask, sentence: [T(`No rule this sign-in reached reads the ${word}.`)], tone: 'neutral', action: { kind: 'add', field: intent.field, label: `Set the ${word}` } })
      const { r, c } = seen[seen.length - 1]
      return make({
        id: `add:${intent.field}`,
        ask,
        sentence: [T(`The ${word} is `), C(c.value, 'person'), T(`: in `), C(r.index === null ? 'Nothing else matched' : `rule ${ruleNo(r)}`, ruleTarget(r)), T(', '), C(findingOf(c), checkTarget(r, c), markTone(c.status), c.status), T('.')],
        tone: markTone(c.status),
        focus: checkTarget(r, c),
        action: { kind: 'add', field: intent.field, label: `Change the ${word}` },
      })
    }

    case 'open': {
      if (!decider || !o.policyId) return noDecider()
      const rules = plan.rules.filter((r) => r.index !== null)
      const r = intent.rule !== null ? rules.find((x) => ruleNo(x) === intent.rule) : landing && landing.index !== null ? landing : undefined
      if (!r) return make({ id: 'open', ask, sentence: [C(decider.name, policyTarget(decider.id)), T(' decides this sign-in. Open it in the builder.')], tone: 'neutral', focus: policyTarget(decider.id), action: { kind: 'openPolicy', policyId: decider.id, label: 'Open the policy ↗' } })
      return make({
        id: `open:${ruleNo(r)}`,
        ask,
        sentence: [C(`Rule ${ruleNo(r)} · ${r.name}`, ruleTarget(r)), T(' is in '), C(decider.name, policyTarget(decider.id)), T('. Open it in the builder.')],
        tone: 'neutral',
        focus: ruleTarget(r),
        action: ruleAction(decider.id, r),
      })
    }

    case 'depends': {
      if (o.status !== 'depends') {
        const v = answerOf({ kind: 'verdict' }, ctx, ask)
        return make({ ...v, id: 'depends:none', sentence: [T("It doesn't depend on anything: every fact it reads is stated. "), ...v.sentence] })
      }
      const dep = plan.conflicts?.depends
      const needs = (o.view.needs.length > 0 ? o.view.needs : (dep?.factWords ?? [])).map((x) => x.toLowerCase())
      const open = plan.rules.filter((r) => r.index !== null && r.visited && r.state === 'unknown')
      const field = unstatedFields(plan)[0]
      const c0 = open[0]?.checks.find((c) => c.status === 'unknown')
      return make({
        id: 'depends',
        ask,
        sentence: [
          T('It depends on '),
          C(needs.length > 0 ? `the ${list(needs)}` : 'a fact not stated', open[0] && c0 ? checkTarget(open[0], c0) : open[0] ? ruleTarget(open[0]) : 'outcome', 'notice', 'unknown'),
          T(': it is not stated, so '),
          ...open.flatMap((r, i) => [...(i === 0 ? [] : [T(i === open.length - 1 ? ' and ' : ', ')]), C(`rule ${ruleNo(r)}`, ruleTarget(r), 'notice')]),
          T(open.length === 1 ? " can't tell." : " can't tell."),
        ],
        more: o.view.outcomes.map((x) => {
          const rule = /rule (\d+)/i.exec(x.label)
          const r = rule ? plan.rules.find((y) => y.index !== null && ruleNo(y) === Number(rule[1])) : plan.rules.find((y) => y.index === null)
          return [C(capital(x.label), r ? ruleTarget(r) : 'outcome'), T(': '), C(said(x.decision), 'outcome', decisionTone(x.decision))]
        }),
        tone: 'notice',
        focus: open[0] ? ruleTarget(open[0]) : 'outcome',
        action: field ? { kind: 'add', field, label: `Set the ${fieldWord(field)}` } : undefined,
      })
    }

    case 'verdict': {
      if (o.status === 'depends') return answerOf({ kind: 'depends' }, ctx, ask)
      if (!decider || o.status !== 'decided' || !o.decision || !landing) return noDecider()
      const d = o.decision
      const dec = C(decider.name, policyTarget(decider.id))
      const via = plan.conflicts?.policies[0]?.deciderVia
      const viaSay = via?.matches && via.kind === 'groups' ? ` (${via.say})` : ''
      const why: Part[] = decider.isGlobalDefault
        ? [T(`no ${plan.appName} policy covers ${ctx.isGroup ? 'them' : first}, so the `), dec, T(' applies')]
        : [dec, T(` is the first policy on ${plan.appName} that covers ${ctx.isGroup ? 'them' : first}${viaSay}`)]
      const rulePart: Part[] =
        landing.index === null
          ? [T(', and none of its rules match, so '), C('Nothing else matched', ruleTarget(landing), decisionTone(d)), T(' decides')]
          : [T(', and '), C(`rule ${ruleNo(landing)} · ${landing.name}`, ruleTarget(landing), decisionTone(d)), T(' is its first rule that matches')]
      const msg = d === 'deny' ? denyMessageOf(ctx.screens) : ''
      const f = factorsOf(ctx.screens, d)
      return make({
        id: 'verdict',
        ask,
        sentence: [C(person, 'person'), T(d === 'deny' ? ' is ' : ' gets '), C(d === 'deny' ? 'denied' : said(d), 'outcome', decisionTone(d)), T(': '), ...why, ...rulePart, T('.')],
        more:
          d === 'deny'
            ? [
                ...(landing.index !== null ? [[T(`Rule ${ruleNo(landing)} matches: `), ...readOf(landing).flatMap((c, i) => [...(i === 0 ? [] : [T(' and ')]), C(findingOf(c), checkTarget(landing, c), 'positive', 'pass')])]] : missedBefore(plan).map((r) => { const c = failingOf(r); return [C(`Rule ${ruleNo(r)}`, ruleTarget(r), 'negative'), T(': '), ...(c ? [C(findingOf(c), checkTarget(r, c), 'negative', 'fail')] : [])] })),
                ...(msg ? [[T('They see '), C(`“${msg}”`, 'screens', 'negative')]] : []),
              ]
            : f.length > 0
              ? [[T('They are asked for '), C(askedFor(f), 'screens', 'positive'), T('.')]]
              : undefined,
        tone: decisionTone(d),
        focus: 'outcome',
        action: ruleAction(decider.id, landing),
      })
    }

    case 'policy': {
      if (!decider) return noDecider()
      const v = answerOf({ kind: 'verdict' }, ctx, ask)
      return make({ ...v, id: 'policy', focus: policyTarget(decider.id) })
    }

    case 'person': {
      const g = ctx.groups.map((x) => x.name)
      if (ctx.isGroup) return make({ id: 'person', ask, sentence: [T('This is tested as '), C(lowerFirst(person), 'person'), T('.')], tone: 'neutral', focus: 'person' })
      const via = landing?.via
      return make({
        id: 'person',
        ask,
        sentence: [C(person, 'person'), T(g.length > 0 ? ` is in ${list(g)}` : ' is in no group'), T(via?.matches && via.say && landing && landing.index !== null ? `; ${ruleWord(landing)} lets them in ${via.say}.` : '.')],
        tone: 'neutral',
        focus: 'person',
      })
    }

    default:
      return make({ id: 'unknown', ask, sentence: [T(UNKNOWN_SENTENCE)], tone: 'neutral', known: false })
  }
}

// --- Acting -----------------------------------------------------------------------------------

/** Does what an action's button says, through the layout's own callbacks. */
export function runAction(action: Action, props: AskProps): void {
  try {
    switch (action.kind) {
      case 'asGroup':
        props.onAsGroup?.(action.groupId)
        return
      case 'add':
        props.onAdd?.(action.field)
        return
      case 'openRule':
        props.onOpenRule?.(action.policyId, action.ruleId)
        return
      case 'openPolicy':
        props.onOpenPolicy?.(action.policyId)
        return
    }
  } catch {
    /* A way out that refused: nothing else to do. */
  }
}

// --- The narrator's lines ---------------------------------------------------------------------

export interface Narration {
  /** "Checking Maya Iyer on AWS Console." */
  start: string
  /** "AWS for engineering teams covers Maya, via Engineering." / "No AWS Console policy covers Ravi. The Global Default applies." */
  policy: string
  /** "Rule one doesn't apply: Maya Iyer is not in Contractors. Rule two matches." */
  rules: string
  /** "Allow on 1 factor." / "Denied." / "It depends on the device." */
  verdict: string
  /** All of it at once (a run that landed without playing). */
  all: string
}

/** The run's few lines, said once a run: composed from the plan, like everything here. Empty strings where there is nothing to say. */
export function narration(plan: EngineRun, props: AskProps): Narration {
  const none: Narration = { start: '', policy: '', rules: '', verdict: '', all: '' }
  try {
    if (plan.empty) return none
    const ctx = ctxOf(plan, props)
    const start = `Checking ${ctx.isGroup ? lowerFirst(ctx.person) : ctx.person} on ${plan.appName}.`
    const d = plan.decider
    let policy = ''
    if (d) {
      if (d.isGlobalDefault) policy = plan.policies.some((p) => !p.isGlobalDefault) ? `No ${plan.appName} policy covers ${ctx.first}. The Global Default applies.` : `${plan.appName} has no policy of its own. The Global Default applies.`
      else {
        const via = plan.conflicts?.policies[0]?.deciderVia
        policy = `${d.name} covers ${ctx.first}${via?.matches && via.kind === 'groups' ? `, ${via.say.replace(/^via /, 'through ')}` : ''}.`
      }
    } else policy = `No policy decides on ${plan.appName}.`
    const landing = landingOf(plan)
    const bits: string[] = []
    const missed = missedBefore(plan)
    if (missed.length > 2) bits.push(`Rules ${list(missed.map((r) => numWord(ruleNo(r))))} don't apply.`)
    else for (const r of missed) bits.push(`Rule ${numWord(ruleNo(r))} doesn't apply${failingOf(r)?.line ? `: ${failingOf(r)?.line}` : ''}.`)
    if (landing) {
      if (landing.index !== null) bits.push(landing.state === 'match' ? `Rule ${numWord(ruleNo(landing))} matches.` : `Rule ${numWord(ruleNo(landing))} can't tell.`)
      else bits.push(landing.state === 'possible' ? "Otherwise, nothing else matches." : 'Nothing else matched.')
    }
    const rules = bits.join(' ')
    const o = plan.outcome
    const verdict =
      o.status === 'decided' && o.decision
        ? o.decision === 'deny'
          ? 'Denied.'
          : o.decision === '2fa'
            ? (() => {
                const f = factorsOf(ctx.screens, '2fa')
                return `Allowed, with a second factor${f.length > 1 ? `: ${f[f.length - 1]}` : ''}.`
              })()
            : 'Allowed, on one factor.'
        : o.status === 'depends'
          ? o.view.needs.length > 0
            ? `It depends on the ${list(o.view.needs.map((n) => n.toLowerCase()))}.`
            : 'It depends on a fact not stated.'
          : 'No policy decides.'
    return { start, policy, rules, verdict, all: `${ctx.person} on ${plan.appName}. ${verdict}` }
  } catch {
    return none
  }
}
