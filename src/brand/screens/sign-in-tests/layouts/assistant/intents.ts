import type { AccessDecision } from '../../../../data'
import { DECISION_WORDS } from '../../../../decision-words'
import { stepLabel, type SignInScreens } from '../../../testing/screens-of'
import type { FormField, SignInForm } from '../../../testing/sign-in-form'
import type { GroupRef } from '../../conflicts'
import type { CheckRow, EnginePolicy, EngineRule, EngineRun } from '../../engine-run'
import { eachGroupRows, type GroupRowView } from '../../journey'
import { SAVED_SIGN_INS } from '../../phase'
import type { RunLayoutProps } from '../types'
import { readSignIn, type SignInDict } from './read-sign-in'
import { patchKey, type WhatIf } from './what-if'

/* -----------------------------------------------------------------------------
   The assistant's words (assistant/, SHARED by Focus, Brief and Jarvis): what
   a run offers to ask, the answer to anything asked of it — typed, spoken or
   a suggestion pressed — and the presses each answer offers. PURE: every word
   is composed from the plan (engine-run.ts), its findings (conflicts.ts), the
   per-group rows (journey.ts), what the person sees (screens-of.ts) and the
   PREVIEWS the dock hands in (what-if.ts). Nothing is made up; an ask it
   cannot answer from them says so.

   API (for the view builders — a view only maps targets and handles the two
   view actions, `see` and `checks`, in the dock's `onAction`):

     answer(query, plan, props, label?, last?) → Answer
       `query` is a suggestion's `ask` id or free text. An Answer is one
       SENTENCE of parts (plain text and CITATIONS, each naming the TARGET on
       the canvas it is about), further lines (`more`), the intent (`kind`),
       what to bring into focus, up to three ACTIONS (the first the primary),
       `acts` (the words COMMAND the first action: the dock performs it 350 ms
       after the answer shows), `say` (the sentence plain, for the voice) and
       `previewing` (the fields a preview changed: Jarvis rings them amber).
       `last` is the answer before, so "run it" can run what it offered.

     suggestionsFor(plan, props, asked, last?) → Suggestion[]
       Empty thread (no `last`): the opening, ≤ 4. After an answer: its
       follow-ups, ≤ 3, never one already asked (`asked`: answer ids and
       suggestion ids) or one of the answer's own buttons. A Suggestion is a
       QUESTION (`ask` → answer(ask, …), `answerId` what it answers as) or an
       ACTION (`action` → performed at once: it is the press).

     runAction(action, props) → boolean   does what an action says, through
                                          the layout's callbacks; false for the
                                          view's own (`see`, `checks`)
     isRunAction(action)                  the press starts a run
     didLine(action)                      "Running as Finance only." — the thread's
                                          one line for a press
     iconOf(action) / SuggestionIcon      which icon a row or button carries
     narration(plan, props)               the run's few lines for the narrator
     chipsFor(plan, props)                (kept for old callers) the opening
                                          questions as chips

   Acting on words: a typed or spoken ask performs its first action only when
   the words command it — a run-starting action (asGroup, runWith, assumeOn,
   replay) only when they say run ("run", "re-run", "replay", "run it again",
   "try it for real"); the others on an imperative ("open", "show", "add",
   "set", "edit", "review", "fix"). A question ("why", "what", "can", "?",
   "what if …") never acts: it answers and offers the press.

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

/** A press an answer or a suggestion offers. `label` is the button's words; each says what the press does. */
export type Action =
  /** "Run as Finance only" → onAsGroup(groupId). Runs. */
  | { kind: 'asGroup'; groupId: string; label: string }
  /** "Run with Home broadband" / "Run this sign-in" → onRunWith(patch, field). Runs. */
  | { kind: 'runWith'; patch: Partial<SignInForm>; field: FormField; label: string }
  /** "Run as if Code review were on" → onRunWith({ assumeOn: policyId }, 'assume-on'). Runs. */
  | { kind: 'assumeOn'; policyId: string; label: string }
  /** "Replay" → onReplay. Runs. */
  | { kind: 'replay'; label: string }
  /** "Open rule 2" → onOpenRule (into the builder). */
  | { kind: 'openRule'; policyId: string; ruleId: string; label: string }
  /** "Open policy" → onOpenPolicy. */
  | { kind: 'openPolicy'; policyId: string; label: string }
  /** "Add the device" → onAdd(field): the panel opens on that field; nothing runs. */
  | { kind: 'add'; field: FormField; label: string }
  /** "Edit the sign-in" → onPressPerson. */
  | { kind: 'edit'; label: string }
  /** "Show what Maya sees" → the VIEW's onAction (Focus: the outcome card; Brief: the thumbnail; Jarvis: the inset). */
  | { kind: 'see'; label: string }
  /** "Show every check" → the VIEW's onAction (Focus: Overview; Brief: pins ⁴; Jarvis: every rule row open). */
  | { kind: 'checks'; label: string }
  /** "Review break-in attempts" → onReviewBreakIn('outcome'). */
  | { kind: 'breakIn'; label: string }
  /** "How was it decided?" → the VIEW's onAction (Brief: its evidence in the page's right-hand panel). Offered only with `AskProps.how`. */
  | { kind: 'how'; label: string }

export type ActionKind = Action['kind']

/** The presses that start a run (only these may call onAsGroup / onRunWith / onReplay). */
export const RUN_KINDS: readonly ActionKind[] = ['asGroup', 'runWith', 'assumeOn', 'replay']
export const isRunAction = (a: Pick<Action, 'kind'>): boolean => RUN_KINDS.includes(a.kind)

export type ChipId = `ask:${string}`

/** (Kept for old callers.) A question the run can answer. */
export interface Chip {
  id: ChipId
  label: string
}

export type SuggestionIcon = 'question' | 'run' | 'open' | 'add' | 'breakIn' | 'show' | 'edit'

/** A row in the dock's chat: a question to ask, or an action to press. */
export interface Suggestion {
  /** Stable: 'ask:why', 'act:asGroup:finance'. */
  id: string
  /** ≤ 6 words, sentence case: "Why denied?", "Run as Finance only". */
  label: string
  /** A question: ask it — answer(ask, …, label). */
  ask?: ChipId
  /** The id of the answer it gives: once that is in the thread, it is not offered again. */
  answerId?: string
  /** An action: pressed, it is performed at once. */
  action?: Action
  icon: SuggestionIcon
}

/** What the answer is about: a view reacts to it (Jarvis's HUD, Focus's carousel). */
export type AnswerKind =
  | 'verdict'
  | 'why'
  | 'why-rule'
  | 'others'
  | 'gd'
  | 'depends'
  | 'what-if'
  | 'what-if-value'
  | 'sign-in'
  | 'off'
  | 'see'
  | 'checks'
  | 'group'
  | 'break-in'
  | 'save'
  | 'edit'
  | 'replay'
  | 'add'
  | 'open'
  | 'policy'
  | 'person'
  | 'none'
  | 'empty'
  | 'unknown'

export interface Answer {
  /** Stable for the same question on the same run: 'why', 'why-rule:1', 'others', 'see'… */
  id: string
  kind: AnswerKind
  /** The question as the thread shows it: a suggestion's label, or what was typed. */
  ask: string
  /** The answer, one sentence of parts. */
  sentence: Part[]
  /** Further lines, each a sentence of parts: every check, every other policy. */
  more?: Part[][]
  tone: Tone
  /** What the view brings into focus as the answer shows. */
  focus?: Target
  /** Up to three presses; the first is the primary. */
  actions: Action[]
  /** The words commanded the first action: the dock performs it as the answer shows. */
  acts: boolean
  /** A preview's changed fields (never the run's): Jarvis rings them in the sign-in row. */
  previewing?: FormField[]
  /** The sentence, plain, for the voice. */
  say: string
  /** False for the honest "I can answer about this sign-in:" reply to an ask it does not understand. */
  known: boolean
}

/** What of a layout's props the words need (pure: tests pass just these). The dock adds the previews and the tenant's names. */
export type AskProps = Pick<RunLayoutProps, 'asGroup' | 'screens'> &
  Partial<Pick<RunLayoutProps, 'onAsGroup' | 'onAdd' | 'onOpenRule' | 'onOpenPolicy' | 'form' | 'rows' | 'onRunWith' | 'onReplay' | 'onPressPerson' | 'breakIn' | 'onReviewBreakIn' | 'onSave'>> & {
    /** Any change, run here only (what-if.ts `useWhatIfs().preview`): never changes the page's sign-in. */
    preview?: (patch: Partial<SignInForm>, field?: FormField) => WhatIf | null
    /** The one-fact variations, run and ranked (what-if.ts `useWhatIfs().list`). */
    whatIfs?: readonly WhatIf[]
    /** The tenant's names, for reading a sentence as a sign-in (read-sign-in.ts). */
    dict?: SignInDict
    /** The view shows how it was decided on a press (Brief's panel): offer "How was it decided?". */
    how?: boolean
  }

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
  props: AskProps
  /** "Maya Iyer", or "A member of Finance". */
  person: string
  /** "Maya", or "a member of Finance" mid-sentence. */
  first: string
  isGroup: boolean
  screens: readonly SignInScreens[]
  groups: readonly GroupRef[]
  groupRows: readonly GroupRowView[] | null
  canGroup: boolean
  whatIfs: readonly WhatIf[]
}

function ctxOf(plan: EngineRun, props: AskProps): Ctx {
  const isGroup = props.asGroup !== null && props.asGroup !== undefined
  const name = plan.conflicts?.personName || plan.asEachGroup?.personName || ''
  const person = isGroup ? `A member of ${props.asGroup}` : name || 'This person'
  const first = isGroup ? `a member of ${props.asGroup}` : name ? (name.trim().split(/\s+/)[0] ?? name) : 'they'
  return {
    plan,
    props,
    person,
    first,
    isGroup,
    screens: props.screens ?? [],
    groups: plan.asEachGroup?.groups ?? plan.conflicts?.groups ?? [],
    groupRows: eachGroupRows(plan),
    canGroup: typeof props.onAsGroup === 'function' && !isGroup,
    whatIfs: props.whatIfs ?? [],
  }
}

/** "Maya" in a label ("What will Maya see?"), "they" for a group. */
const firstOf = (ctx: Ctx) => (ctx.isGroup ? 'they' : ctx.first)

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

const FIELD_WORD: Partial<Record<FormField, string>> = { device: 'device', address: 'network', place: 'place', when: 'time', risk: 'risk score', person: 'person', app: 'application', 'assume-on': 'policy assumed on' }
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

const openRule = (policyId: string, r: EngineRule): Action => ({ kind: 'openRule', policyId, ruleId: r.id, label: `Open rule ${ruleNo(r)}` })
const ruleAction = (policyId: string | null | undefined, r: EngineRule | undefined): Action | undefined =>
  policyId && r && r.index !== null ? openRule(policyId, r) : policyId ? { kind: 'openPolicy', policyId, label: 'Open policy' } : undefined
/** At most three presses, each label once. */
const some = (...xs: (Action | undefined | null | false)[]): Action[] => {
  const out: Action[] = []
  for (const x of xs) if (x && !out.some((y) => y.label === x.label)) out.push(x)
  return out.slice(0, 3)
}

function outcomeTone(plan: EngineRun): Tone {
  const o = plan.outcome
  if (o.status === 'decided' && o.decision) return decisionTone(o.decision)
  return o.status === 'depends' ? 'notice' : 'neutral'
}

/** The groups the person is in that the deciding policy did not take them through: "Run as Finance only". */
function otherGroups(ctx: Ctx): GroupRef[] {
  if (!ctx.canGroup || !ctx.groupRows || ctx.groups.length < 2) return []
  const ids = ctx.groupRows.filter((r) => r.groupId && !r.current).map((r) => r.groupId as string)
  const via = ctx.plan.conflicts?.policies[0]?.deciderVia ?? landingOf(ctx.plan)?.via
  const viaIds = new Set((via?.groups ?? []).map((g) => g.id))
  const pick = ctx.groups.filter((g) => ids.includes(g.id) && !viaIds.has(g.id))
  return (pick.length > 0 ? pick : ctx.groups.filter((g) => ids.includes(g.id))).slice(0, 2)
}
const asGroupAction = (g: GroupRef): Action => ({ kind: 'asGroup', groupId: g.id, label: `Run as ${g.name} only` })

/** A preview, said: "From Home broadband Maya is denied (rule 2)." / "Same answer: allow on 1 factor." */
function previewSaid(w: WhatIf, ctx: Ctx, lead: string): string {
  const who = ctx.isGroup ? 'they' : ctx.first
  if (!w.changed) return `${lead ? `${lead}: same` : 'Same'} answer — ${lowerFirst(w.words)}${w.source ? ` (${w.source})` : ''}.`
  const o = w.plan.outcome
  const what =
    o.status === 'decided' && o.decision === 'deny'
      ? `${who} ${ctx.isGroup ? 'are' : 'is'} denied`
      : o.status === 'decided' && o.decision
        ? `${who} ${ctx.isGroup ? 'get' : 'gets'} ${said(o.decision)}`
        : o.status === 'depends'
          ? 'it depends'
          : 'no policy decides'
  return `${lead ? `${lead} ` : ''}${what}${w.source ? ` (${w.source})` : ''}.`
}
const runWithAction = (w: WhatIf): Action => ({ kind: 'runWith', patch: w.patch, field: w.field, label: `Run with ${w.value || lowerFirst(w.label)}` })

// --- Intents --------------------------------------------------------------------------------

type Intent =
  | { kind: 'why-rule'; rule: number | null }
  | { kind: 'why' }
  | { kind: 'verdict' }
  | { kind: 'others' }
  | { kind: 'gd' }
  | { kind: 'see' }
  | { kind: 'checks' }
  | { kind: 'group'; groupId: string | null }
  | { kind: 'add'; field: FormField }
  | { kind: 'open'; rule: number | null; fix: boolean }
  | { kind: 'policy' }
  | { kind: 'how' }
  | { kind: 'person' }
  | { kind: 'depends' }
  | { kind: 'what-if' }
  | ({ kind: 'what-if-value' } & ReadWords)
  | ({ kind: 'sign-in' } & ReadWords)
  | { kind: 'off'; policyId: string | null }
  | { kind: 'break-in' }
  | { kind: 'save' }
  | { kind: 'edit' }
  | { kind: 'replay' }
  | { kind: 'run' }
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

/* The words' grammar, for acting on them. */
const QUESTION = /^(why|what|whats|who|whom|whose|which|how|can|could|does|do|did|will|would|is|are|should|has|have|if)\b/
const RUN_WORDS = /\b(run|runs|rerun|re run|replay|again|for real)\b/
const IMPERATIVE = /^(please )?(open|show|add|set|edit|review|fix|go to|take me|change|state)\b/
const WHAT_IF = /\b(what if|if (she|he|they|i|it|maya)|try|instead|suppose|would .* (get|be))\b/

const norm = (raw: string) => ` ${raw.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim()} `

/** The words ask a question (they never act), or command. */
export function isQuestion(raw: string): boolean {
  return /\?\s*$/.test(raw.trim()) || QUESTION.test(norm(raw).trim())
}

/** A sentence, read against the sign-in on screen: the change (`patch`, `fields`), every value read (`read`), each changed field's words (`said`). */
interface ReadWords {
  patch: Partial<SignInForm>
  fields: FormField[]
  read: string[]
  said: Partial<Record<FormField, string>>
  unread: string[]
}

const FIELD_KEYS: Partial<Record<FormField, readonly (keyof SignInForm)[]>> = { person: ['personId'], app: ['appId'], address: ['origin', 'address', 'addressSource', 'place'], device: ['device'], risk: ['risk'], when: ['time'] }

/* What a sentence's read patch changes against the sign-in on screen: a value it already has is not a change. */
function changedFields(read: ReturnType<typeof readSignIn>, form: SignInForm | undefined): ReadWords {
  const patch = { ...read.patch }
  const keep: FormField[] = []
  const said: Partial<Record<FormField, string>> = {}
  read.fields.forEach((f, i) => {
    const same = !form
      ? false
      : f === 'person'
        ? patch.personId === form.personId
        : f === 'app'
          ? patch.appId === form.appId
          : f === 'address'
            ? patch.origin === form.origin
            : f === 'device'
              ? JSON.stringify(patch.device) === JSON.stringify(form.device)
              : f === 'risk'
                ? patch.risk === form.risk.trim()
                : f === 'when'
                  ? patch.time === form.time
                  : false
    if (same) {
      for (const k of FIELD_KEYS[f] ?? []) delete patch[k]
    } else {
      keep.push(f)
      said[f] = read.read[i]
    }
  })
  return { patch, fields: keep, read: read.read, said, unread: read.unread }
}

/* What a few words ask for: keywords, the most specific first; a group, a
   policy, a person, an application, a network or a device found by name. */
function matchIntent(raw: string, ctx: Ctx): Intent {
  const t = norm(raw)
  if (t.trim() === '') return { kind: 'unknown' }
  const plan = ctx.plan
  const n = ruleNumberIn(t, plan)

  if (/\b(save|keep (this|it) as|as a test)\b/.test(t)) return { kind: 'save' }
  if (/\b(break ?in|breakin|attempts?|attack|attacker|hack|breach)\b/.test(t)) return { kind: 'break-in' }
  if (/\b(edit|change) (the |this )?sign ?in\b/.test(t)) return { kind: 'edit' }

  /* A policy that is off: "turn on Code review", "run as if Code review were on". */
  const offs = plan.conflicts?.off ?? []
  /* Named in full, or by its own words ("Code review" for "Code review for Finance"). */
  const ownWords = (name: string) => norm(name).trim().split(' ').filter((w) => w.length >= 4)
  const offNamed = offs.find((o) => t.includes(norm(o.policyName))) ?? offs.find((o) => ownWords(o.policyName).filter((w) => t.includes(` ${w} `)).length >= Math.min(2, ownWords(o.policyName).length))
  if (/\b(as if|turn on|turned on|switch on|were on|was on|is off|switched off|turned off|inactive|drafts?|off polic\w*)\b/.test(t) || (offNamed && /\b(on|off)\b/.test(t))) return { kind: 'off', policyId: offNamed?.policyId ?? null }

  if (/\bwhat (would|could|might|will) change\b|\bchange (it|the answer|the outcome|the result)\b|\bwhat changes\b|\bflip\b/.test(t)) return { kind: 'what-if' }

  /* A sign-in in words: another person or application is a sign-in of its own; a fact alone, a what-if. */
  if (ctx.props.dict) {
    const read = changedFields(readSignIn(raw, ctx.props.dict), ctx.props.form)
    const facts = read.fields.filter((f) => f !== 'person' && f !== 'app')
    if (read.fields.includes('person') || read.fields.includes('app')) return { kind: 'sign-in', ...read }
    if (facts.length > 0 && (WHAT_IF.test(t) || RUN_WORDS.test(t) || /\b(set|change|use|switch|make|with|from|on|at)\b/.test(t))) return { kind: 'what-if-value', ...read, fields: facts }
    /* A sign-in asked of something it cannot place: say so, never guess. */
    if (read.unread.length > 0 && /\b(get into|get in to|into|sign in to|log in to|access to|reach|use)\b/.test(t)) return { kind: 'sign-in', ...read }
  }

  if (/\b(replay|run (it|this|that) again|run again|rerun|re run|again|for real)\b/.test(t) || /^ (run|run it|run this|run that|go) $/.test(t)) return /\b(replay|again|rerun|re run)\b/.test(t) ? { kind: 'replay' } : { kind: 'run' }

  /* "How was it decided?", "show me the evidence": where the view shows it on a press (Brief's panel), that press first —
     a question offers it, "show me …" performs it — never the policy's builder. */
  if (ctx.props.how && /\bhow\b.*\b(decided|decide|decides|worked out|reached)\b|\b(evidence|proof)\b/.test(t)) return { kind: 'how' }
  if (/\b(open|builder|go to|fix|take me)\b/.test(t) || (/\bedit\b/.test(t) && n !== undefined)) return { kind: 'open', rule: n ?? null, fix: /\bfix\b/.test(t) }
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
  if (/\b(why not|fail|failed|didn't|didnt|not match|no match)\b/.test(t) && missedBefore(plan).length > 0) return { kind: 'why-rule', rule: null }
  if (/\bwhy\b/.test(t)) return { kind: 'why' }
  if (/\b(polic(y|ies)|which|decides?|decided)\b/.test(t)) return { kind: 'policy' }
  if (/\b(outcome|verdict|result|decision|allowed?|access|factors?|mfa|2fa|granted|get in|gets?|denied|deny|blocked|refused|let in)\b/.test(t)) return { kind: 'verdict' }
  return { kind: 'unknown' }
}

function intentOfChip(id: ChipId): Intent {
  const [, kind, arg] = id.split(':')
  switch (kind) {
    case 'why':
      return arg ? { kind: 'why-rule', rule: Number(arg) || null } : { kind: 'why' }
    case 'deny':
      return { kind: 'why' }
    case 'verdict':
      return { kind: 'verdict' }
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
      return { kind: 'open', rule: arg ? Number(arg) || null : null, fix: false }
    case 'depends':
      return { kind: 'depends' }
    case 'policy':
      return { kind: 'policy' }
    case 'change':
      return { kind: 'what-if' }
    case 'off':
      return { kind: 'off', policyId: arg || null }
    case 'breakin':
      return { kind: 'break-in' }
    case 'save':
      return { kind: 'save' }
    case 'edit':
      return { kind: 'edit' }
    case 'replay':
      return { kind: 'replay' }
    default:
      return { kind: 'unknown' }
  }
}

export const isChipId = (q: string): q is ChipId => q.startsWith('ask:')

// --- Suggestions ------------------------------------------------------------------------------

/** Which icon a press carries: a run plays, open goes out, add opens a field. */
export function iconOf(a: Pick<Action, 'kind'>): SuggestionIcon {
  switch (a.kind) {
    case 'asGroup':
    case 'runWith':
    case 'assumeOn':
    case 'replay':
      return 'run'
    case 'openRule':
    case 'openPolicy':
      return 'open'
    case 'add':
      return 'add'
    case 'edit':
      return 'edit'
    case 'breakIn':
      return 'breakIn'
    default:
      return 'show'
  }
}

const actionKey = (a: Action): string => {
  switch (a.kind) {
    case 'asGroup':
      return `act:asGroup:${a.groupId}`
    case 'runWith':
      return `act:runWith:${patchKey(a.patch)}`
    case 'assumeOn':
      return `act:assumeOn:${a.policyId}`
    case 'openRule':
      return `act:openRule:${a.ruleId}`
    case 'openPolicy':
      return `act:openPolicy:${a.policyId}`
    case 'add':
      return `act:add:${a.field}`
    default:
      return `act:${a.kind}`
  }
}
const act = (a: Action): Suggestion => ({ id: actionKey(a), label: a.label, action: a, icon: iconOf(a) })
const HOW: Action = { kind: 'how', label: 'How was it decided?' }

/* The opening set, ≤ 4: (1) why this answer; (2) the thing most worth asking
   next — a later rule that also applies, who else covers them, the Global
   Default, a rule passed over; (3) what would change it, when a preview
   does; (4) what they will see. */
function openingOf(ctx: Ctx, q: (id: ChipId, label: string) => Suggestion): Suggestion[] {
  const { plan } = ctx
  const out: Suggestion[] = []
  const o = plan.outcome
  const decider = plan.decider
  if (!decider) out.push(q('ask:why', 'Why does no policy decide?'))
  else if (o.status === 'depends') out.push(q('ask:depends', 'Why does it depend?'))
  else if (o.status === 'decided' && o.decision === 'deny') out.push(q('ask:why', 'Why denied?'))
  else out.push(q('ask:why', 'Why allowed?'))
  if (decider) {
    const clash = plan.conflicts?.conflicts.find((c) => plan.rules.find((r) => r.id === c.ruleId)?.state === 'not-reached')
    const others = othersOf(plan)
    const missed = missedBefore(plan)[0]
    if (clash) out.push(q(`ask:why:${clash.number}`, `Why not rule ${clash.number}?`))
    else if (!decider.isGlobalDefault && (others.also.length > 0 || (!ctx.isGroup && ctx.groups.length >= 2))) out.push(q('ask:others', ctx.isGroup ? 'Which other policies cover them?' : `Who else covers ${ctx.first}?`))
    else if (decider.isGlobalDefault) out.push(q('ask:gd', 'Why the Global Default?'))
    else if (missed) out.push(q(`ask:why:${ruleNo(missed)}`, `Why not rule ${ruleNo(missed)}?`))
  }
  if (ctx.whatIfs.some((w) => w.changed)) out.push(q('ask:change', 'What would change it?'))
  if (ctx.screens.length > 0) out.push(q('ask:see', `What will ${firstOf(ctx)} see?`))
  /* The view that shows how it was decided offers it second, after the why. */
  if (ctx.props.how && !plan.empty) out.splice(1, 0, act(HOW))
  return out.slice(0, 4)
}

/* The values a Depends could be settled with: up to two previews of the
   missing fact that give definite, different answers. */
function settlersOf(ctx: Ctx): WhatIf[] {
  const field = unstatedFields(ctx.plan)[0]
  if (!field) return []
  const out: WhatIf[] = []
  for (const w of ctx.whatIfs) {
    if (w.field !== field && !(field === 'place' && w.field === 'address')) continue
    if (w.plan.outcome.status !== 'decided') continue
    if (out.some((x) => x.words === w.words)) continue
    out.push(w)
    if (out.length === 2) break
  }
  return out
}

/** The suggestions for this run, inside the chat: the opening (no `last`), or the follow-ups to `last`. Never one asked. */
export function suggestionsFor(plan: EngineRun, props: AskProps, asked: ReadonlySet<string> | readonly string[] = [], last?: Answer | null): Suggestion[] {
  try {
    if (plan.empty) return []
    const ctx = ctxOf(plan, props)
    const done = asked instanceof Set ? (asked as ReadonlySet<string>) : new Set(asked as readonly string[])
    const q = (id: ChipId, label: string): Suggestion => ({ id, label, ask: id, answerId: answer(id, plan, props, label).id, icon: 'question' })
    const opening = openingOf(ctx, q)
    const free = (s: Suggestion) => !done.has(s.id) && !(s.answerId && done.has(s.answerId)) && !(last && (last.id === s.answerId || last.ask === s.label || last.actions.some((a) => a.label === s.label)))
    if (!last) return opening.filter(free).slice(0, 4)

    const landing = landingOf(plan)
    const decider = plan.decider
    const next: (Suggestion | null | undefined | false)[] = []
    const change = opening.find((s) => s.ask === 'ask:change')
    const see = opening.find((s) => s.ask === 'ask:see')
    switch (last.kind) {
      case 'why':
      case 'verdict':
      case 'policy':
        next.push(props.how && act(HOW), change, decider && landing && landing.index !== null && act(openRule(decider.id, landing)), see)
        break
      case 'why-rule':
        next.push(props.how && act(HOW), ...last.actions.filter((a) => a.kind === 'openRule').map(act), opening[0])
        break
      case 'others':
      case 'gd': {
        next.push(...otherGroups(ctx).map((g) => act(asGroupAction(g))))
        const fixAt = plan.conflicts?.findings.find((f) => f.tone === 'conflict' && f.fixAt?.ruleId)?.fixAt
        const fixRule = fixAt?.ruleId ? plan.rules.find((r) => r.id === fixAt.ruleId) : undefined
        if (fixAt && fixRule && fixRule.index !== null) next.push(act(openRule(fixAt.policyId, fixRule)))
        break
      }
      case 'what-if':
        next.push(...ctx.whatIfs.filter((w) => w.changed).slice(0, 2).map((w) => act(runWithAction(w))))
        break
      case 'depends': {
        next.push(...settlersOf(ctx).map((w) => act(runWithAction(w))))
        const f = unstatedFields(plan)[0]
        if (f) next.push(act({ kind: 'add', field: f, label: `Add the ${fieldWord(f)}` }))
        break
      }
      case 'see':
        next.push(change)
        break
      default:
        break
    }
    /* Then, if there is room: a policy that is off and would change it; a hole in the break-in attempts. */
    for (const off of (plan.conflicts?.off ?? []).filter((x) => x.changes).slice(0, 1)) next.push(act({ kind: 'assumeOn', policyId: off.policyId, label: `Run as if ${off.policyName} were on` }))
    if (props.breakIn && props.breakIn.summary.holes > 0) next.push(act({ kind: 'breakIn', label: 'Review break-in attempts' }))
    next.push(...opening)
    const out: Suggestion[] = []
    for (const s of next) if (s && free(s) && !out.some((x) => x.id === s.id || x.label === s.label)) out.push(s)
    return out.slice(0, 3)
  } catch {
    /* A plan it cannot read: nothing to suggest, never a throw. */
    return []
  }
}

/** (Kept for old callers.) The opening questions, as chips. */
export function chipsFor(plan: EngineRun, props: AskProps): Chip[] {
  return suggestionsFor(plan, props).flatMap((s) => (s.ask ? [{ id: s.ask, label: s.label }] : []))
}

// --- The answers ------------------------------------------------------------------------------

const UNKNOWN_SENTENCE = 'I can answer about this sign-in:'

type Draft = Omit<Answer, 'say' | 'known' | 'actions' | 'acts'> & { known?: boolean; actions?: (Action | undefined | null | false)[] }

function make(a: Draft): Answer {
  const { actions, known, ...rest } = a
  return { ...rest, actions: some(...(actions ?? [])), acts: false, known: known ?? true, say: plain(a.sentence) }
}

/** Do the words command the answer's first action? (A question never does; a run only when they say run.) */
function commands(raw: string, a: Answer): boolean {
  const first = a.actions[0]
  if (!first || isQuestion(raw)) return false
  const t = norm(raw)
  return isRunAction(first) ? RUN_WORDS.test(t) : IMPERATIVE.test(t.trim()) || /\b(fix it|show me)\b/.test(t)
}

/** The answer to a suggestion (its `ask` id) or to anything typed or said. `last`: the answer before. Never throws. */
export function answer(query: string | ChipId, plan: EngineRun, props: AskProps, label?: string, last?: Answer | null): Answer {
  const chip = isChipId(query)
  const ask = label ?? (chip ? query.slice(4) : query.trim())
  try {
    if (plan.empty) return make({ id: 'empty', kind: 'empty', ask, sentence: [T('Pick a person and an application, then Run, and I can explain the sign-in.')], tone: 'neutral', known: false })
    const ctx = ctxOf(plan, props)
    const intent = chip ? intentOfChip(query) : matchIntent(query, ctx)
    const a = answerOf(intent, ctx, ask, last ?? null)
    return chip ? a : { ...a, acts: commands(query, a) }
  } catch {
    return make({ id: 'unknown', kind: 'unknown', ask, sentence: [T(UNKNOWN_SENTENCE)], tone: 'neutral', known: false })
  }
}

function noDecider(ctx: Ctx, ask: string): Answer {
  const { plan } = ctx
  return make({
    id: 'none',
    kind: 'none',
    ask,
    sentence: [T(`No policy decides this sign-in on ${plan.appName}.`)],
    more: plan.policies.slice(0, 4).map((p) => [C(`${p.order}. ${p.name}`, policyTarget(p.policyId), 'neutral'), T(p.reason ? ` · ${p.reason}` : '')]),
    tone: 'neutral',
    actions: [{ kind: 'edit', label: 'Edit the sign-in' }],
  })
}

function answerOf(intent: Intent, ctx: Ctx, ask: string, last: Answer | null): Answer {
  const { plan, person, first } = ctx
  const landing = landingOf(plan)
  const decider = plan.decider
  const o = plan.outcome

  switch (intent.kind) {
    case 'why-rule':
      return whyRule(intent.rule, ctx, ask)
    case 'gd':
      return gdOf(ctx, ask)
    case 'others':
      return othersAnswer(ctx, ask)
    case 'see':
      return seeOf(ctx, ask)
    case 'checks':
      return checksOf(ctx, ask)
    case 'group':
      return groupOf(intent.groupId, ctx, ask)
    case 'add':
      return addOf(intent.field, ctx, ask)
    case 'depends':
      return dependsOf(ctx, ask)
    case 'what-if':
      return whatIfOf(ctx, ask)
    case 'what-if-value':
    case 'sign-in':
      return previewAnswer(intent, ctx, ask)
    case 'off':
      return offOf(intent.policyId, ctx, ask)
    case 'break-in':
      return breakInOf(ctx, ask)

    case 'open': {
      if (!decider || !o.policyId) return noDecider(ctx, ask)
      const rules = plan.rules.filter((r) => r.index !== null)
      const fixAt = intent.fix ? plan.conflicts?.findings.find((f) => f.fixAt?.ruleId)?.fixAt : undefined
      const fixRule = fixAt?.ruleId ? plan.rules.find((x) => x.id === fixAt.ruleId && x.index !== null) : undefined
      const r = fixRule ?? (intent.rule !== null ? rules.find((x) => ruleNo(x) === intent.rule) : landing && landing.index !== null ? landing : undefined)
      if (!r) return make({ id: 'open', kind: 'open', ask, sentence: [C(decider.name, policyTarget(decider.id)), T(' decides this sign-in. Open it in the builder.')], tone: 'neutral', focus: policyTarget(decider.id), actions: [{ kind: 'openPolicy', policyId: decider.id, label: 'Open policy' }] })
      return make({
        id: `open:${ruleNo(r)}`,
        kind: 'open',
        ask,
        sentence: [C(`Rule ${ruleNo(r)} · ${r.name}`, ruleTarget(r)), T(' is in '), C(decider.name, policyTarget(decider.id)), T(fixRule ? '. The fix is made there: open it in the builder.' : '. Open it in the builder.')],
        tone: 'neutral',
        focus: ruleTarget(r),
        actions: [ruleAction(decider.id, r)],
      })
    }

    case 'verdict': {
      if (o.status === 'depends') return dependsOf(ctx, ask)
      if (!decider || o.status !== 'decided' || !o.decision || !landing) return noDecider(ctx, ask)
      const d = o.decision
      const f = factorsOf(ctx.screens, d)
      const msg = d === 'deny' ? denyMessageOf(ctx.screens) : ''
      return make({
        id: 'verdict',
        kind: 'verdict',
        ask,
        sentence:
          d === 'deny'
            ? [C(person, 'person'), T(ctx.isGroup ? ' are ' : ' is '), C('denied', 'outcome', 'negative'), ...(msg ? [T(': '), C(`“${msg}”`, 'screens', 'negative')] : []), T('.')]
            : [C(person, 'person'), T(ctx.isGroup ? ' get ' : ' gets '), C(DECISION_WORDS[d], 'outcome', 'positive'), ...(f.length > 0 ? [T(' · '), C(f.join(' → '), 'screens', 'positive')] : []), T('.')],
        more: [[T('Decided by '), C(decider.name, policyTarget(decider.id)), T(' · '), C(landing.index === null ? 'Nothing else matched' : `rule ${ruleNo(landing)}`, ruleTarget(landing))]],
        tone: decisionTone(d),
        focus: 'outcome',
        actions: [ruleAction(decider.id, landing)],
      })
    }

    case 'why': {
      if (o.status === 'depends') return dependsOf(ctx, ask)
      if (!decider || o.status !== 'decided' || !o.decision || !landing) return noDecider(ctx, ask)
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
      const checks: Part[][] =
        landing.index !== null
          ? readOf(landing).map((c) => checkParts(landing, c))
          : missedBefore(plan).map((r) => {
              const c = failingOf(r)
              return [C(`Rule ${ruleNo(r)}`, ruleTarget(r), 'negative'), T(': '), ...(c ? [C(findingOf(c), checkTarget(r, c), 'negative', 'fail')] : [T('a check failed')])]
            })
      return make({
        id: 'why',
        kind: 'why',
        ask,
        sentence: [C(person, 'person'), T(d === 'deny' ? (ctx.isGroup ? ' are ' : ' is ') : ctx.isGroup ? ' get ' : ' gets '), C(d === 'deny' ? 'denied' : said(d), 'outcome', decisionTone(d)), T(': '), ...why, ...rulePart, T('.')],
        more: [...checks, ...(msg ? [[T('They see '), C(`“${msg}”`, 'screens', 'negative')]] : [])],
        tone: decisionTone(d),
        focus: landing.index !== null && readOf(landing).length > 0 ? ruleTarget(landing) : 'outcome',
        actions: [ruleAction(decider.id, landing)],
      })
    }

    case 'how': {
      /* The why, with "How was it decided?" its first press (the view's panel). */
      const v = answerOf({ kind: 'why' }, ctx, ask, last)
      return { ...v, actions: [HOW, ...v.actions].slice(0, 3) }
    }

    case 'policy': {
      if (!decider) return noDecider(ctx, ask)
      const v = answerOf({ kind: 'why' }, ctx, ask, last)
      return { ...v, id: 'policy', kind: 'policy', focus: policyTarget(decider.id) }
    }

    case 'person': {
      const g = ctx.groups.map((x) => x.name)
      if (ctx.isGroup) return make({ id: 'person', kind: 'person', ask, sentence: [T('This is tested as '), C(lowerFirst(person), 'person'), T('.')], tone: 'neutral', focus: 'person' })
      const via = landing?.via
      return make({
        id: 'person',
        kind: 'person',
        ask,
        sentence: [C(person, 'person'), T(g.length > 0 ? ` is in ${list(g)}` : ' is in no group'), T(via?.matches && via.say && landing && landing.index !== null ? `; ${ruleWord(landing)} lets them in ${via.say}.` : '.')],
        tone: 'neutral',
        focus: 'person',
        actions: otherGroups(ctx).map(asGroupAction),
      })
    }

    case 'save':
      return make({
        id: 'save',
        kind: 'save',
        ask,
        sentence: [T(SAVED_SIGN_INS && ctx.props.onSave ? 'Save this sign-in as a test from the panel.' : 'Saving a sign-in as a test comes in a later phase.')],
        tone: 'neutral',
      })

    case 'edit':
      return make({ id: 'edit', kind: 'edit', ask, sentence: [T('Edit '), C(person, 'person'), T(` on ${plan.appName} in the panel; Run checks it again.`)], tone: 'neutral', focus: 'person', actions: [{ kind: 'edit', label: 'Edit the sign-in' }] })

    case 'replay':
      return make({ id: 'replay', kind: 'replay', ask, sentence: [T('Replay runs this sign-in again: '), C(person, 'person'), T(` on ${plan.appName}.`)], tone: 'neutral', actions: [{ kind: 'replay', label: 'Replay' }] })

    case 'run': {
      /* "Run it", "try it for real": what the answer before offered to run, else Replay. */
      const run = last?.actions.find(isRunAction)
      if (run) return make({ id: `run:${actionKey(run)}`, kind: 'replay', ask, sentence: [T(`${run.label}.`)], tone: 'neutral', actions: [run] })
      return answerOf({ kind: 'replay' }, ctx, ask, last)
    }

    default:
      return make({ id: 'unknown', kind: 'unknown', ask, sentence: [T(UNKNOWN_SENTENCE)], tone: 'neutral', known: false })
  }
}

function whyRule(asked: number | null, ctx: Ctx, ask: string): Answer {
  const { plan, first } = ctx
  const decider = plan.decider
  const landing = landingOf(plan)
  const o = plan.outcome
  if (!decider) return noDecider(ctx, ask)
  const rules = plan.rules.filter((r) => r.index !== null)
  let n = asked
  if (n === null) {
    const m = missedBefore(plan)[0] ?? plan.rules.slice(0, plan.landing ?? 0).find((r) => r.state === 'unknown')
    if (!m) return answerOf({ kind: 'why' }, ctx, ask, null)
    n = ruleNo(m)
  }
  const r = rules.find((x) => ruleNo(x) === n)
  if (!r) {
    return make({
      id: `why-rule:${n}:none`,
      kind: 'why-rule',
      ask,
      sentence: [C(decider.name, policyTarget(decider.id)), T(` has ${rules.length === 1 ? '1 rule' : `${rules.length} rules`}, then `), C('Nothing else matched', ruleTarget(plan.rules[plan.rules.length - 1] ?? { id: 'last' })), T(` — there is no rule ${n}.`)],
      tone: 'neutral',
      focus: policyTarget(decider.id),
    })
  }
  const rule = C(`Rule ${n} · ${r.name}`, ruleTarget(r))
  const base = { id: `why-rule:${n}`, kind: 'why-rule' as const, ask }
  if (r.state === 'no-match') {
    const c = failingOf(r)
    /* The rule the engine ACTUALLY reads next: a rule that is switched off is passed over (engine-run.ts stores it as
       state 'off', not visited), so the first later rule that is not off. 'Nothing else matched' is never off, so a
       next row is always found; if the run somehow has none, the sentence says the rules end there. */
    const next = plan.rules.slice(plan.rules.indexOf(r) + 1).find((x) => x.state !== 'off')
    const unread = r.checks.slice(readOf(r).length).map((x) => x.word)
    const subs = c ? c.subs.filter((x) => x.status === 'fail').slice(0, 4) : []
    return make({
      ...base,
      sentence: [
        rule,
        T(" doesn't apply: "),
        ...(c ? [C(findingOf(c), checkTarget(r, c), 'negative', 'fail')] : [T('a check failed')]),
        ...(next ? [T(', so the engine reads on to '), C(next.index === null ? 'Nothing else matched' : `rule ${ruleNo(next)}`, ruleTarget(next))] : [T(', and no rule is left to read after it')]),
        T('.'),
      ],
      more: [
        ...subs.map((x) => [T(`${x.label}: `), C(x.actual || 'Not stated', c ? checkTarget(r, c) : ruleTarget(r), 'negative', 'fail'), T(x.required ? ` · needs ${lowerFirst(x.required)}` : '')]),
        ...(unread.length > 0 ? [[T(`Not read after it: ${list(unread)} — the first failing check ends a rule.`)]] : []),
      ],
      tone: 'negative',
      focus: c ? checkTarget(r, c) : ruleTarget(r),
      actions: [ruleAction(decider.id, r)],
    })
  }
  if (r.state === 'unknown') {
    const c = r.checks.find((x) => x.status === 'unknown')
    return make({
      ...base,
      sentence: [rule, T(" can't tell: "), ...(c ? [C(`the ${c.word.toLowerCase()} is not stated`, checkTarget(r, c), 'notice', 'unknown'), T(c.requirement ? `, and it needs ${lowerFirst(c.requirement)}` : '')] : [T('a fact it reads is not stated')]), T('.')],
      more: readOf(r).map((x) => checkParts(r, x)),
      tone: 'notice',
      focus: ruleTarget(r),
      actions: [c?.missing ? { kind: 'add', field: c.missing, label: `Add the ${fieldWord(c.missing)}` } : undefined, ruleAction(decider.id, r)],
    })
  }
  if (r.state === 'match') {
    const read = readOf(r)
    return make({
      ...base,
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
      actions: [ruleAction(decider.id, r)],
    })
  }
  if (r.state === 'off') return make({ ...base, sentence: [rule, T(' is switched off, so the engine passes over it.')], tone: 'neutral', focus: ruleTarget(r), actions: [ruleAction(decider.id, r)] })
  /* Not reached: the first match decides. A later rule that also applies says so. */
  const clash = plan.conflicts?.rules.find((x) => x.ruleId === r.id)
  return make({
    ...base,
    sentence: [rule, T(" wasn't read: "), ...(landing && landing.index !== null ? [C(`rule ${ruleNo(landing)}`, ruleTarget(landing)), T(' matched first, and the first match decides.')] : [T('the walk stopped before it.')])],
    more: clash
      ? [[T(`It ${clash.match === 'unknown' ? 'might also apply' : 'also applies'} to ${first}${clash.via.say ? ` ${clash.via.say}` : ''} and would `), C(said(r.decision), ruleTarget(r), clash.kind === 'conflict' ? 'notice' : 'neutral'), T('.')], ...(clash.fix ? [[T(`${clash.fix}.`)]] : []), ...(clash.caution ? [[T(`${clash.caution}.`)]] : [])]
      : undefined,
    tone: clash?.kind === 'conflict' ? 'notice' : 'neutral',
    focus: ruleTarget(r),
    actions: [ruleAction(decider.id, r)],
  })
}

/* When the Global Default decides: the policies they are outside of, and who each covers. */
function gdOf(ctx: Ctx, ask: string): Answer {
  const { plan, person, first } = ctx
  const decider = plan.decider
  if (!decider) return noDecider(ctx, ask)
  const gd = plan.policies.find((p) => p.isGlobalDefault)
  if (!decider.isGlobalDefault) {
    if (!gd) return othersAnswer(ctx, ask)
    return make({
      id: 'gd',
      kind: 'gd',
      ask,
      sentence: [C(gd.name, policyTarget(gd.policyId), 'neutral'), T(" isn't used: "), C(decider.name, policyTarget(decider.id)), T(` covers ${ctx.isGroup ? 'them' : first} first. The Global Default applies only when no ${plan.appName} policy covers someone.`)],
      tone: 'neutral',
      focus: policyTarget(decider.id),
    })
  }
  const dec = C(decider.name, policyTarget(decider.id))
  const misses = plan.conflicts?.missedBy ?? []
  const groups = ctx.groups.map((g) => g.name)
  const appPolicies = plan.policies.filter((p) => !p.isGlobalDefault)
  return make({
    id: 'gd',
    kind: 'gd',
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
    actions: [misses[0] ? { kind: 'openPolicy', policyId: misses[0].policyId, label: 'Open policy' } : undefined],
  })
}

/* Who else covers them, and the conflicts: the findings, ranked, conflicts first, with the fix and its caution. */
function othersAnswer(ctx: Ctx, ask: string): Answer {
  const { plan, person, first } = ctx
  const decider = plan.decider
  if (!decider) return noDecider(ctx, ask)
  if (decider.isGlobalDefault) return gdOf(ctx, ask)
  const { covers, also, missed, off, unasked } = othersOf(plan)
  const dec = C(decider.name, policyTarget(decider.id))
  const findings = (plan.conflicts?.findings ?? []).filter((f) => f.tone === 'conflict')
  const fixAt = findings.find((f) => f.fixAt)?.fixAt
  const fixRule = fixAt?.ruleId ? plan.rules.find((x) => x.id === fixAt.ruleId) : undefined
  const fixAction: Action | undefined = fixAt ? (fixRule && fixRule.index !== null ? openRule(fixAt.policyId, fixRule) : { kind: 'openPolicy', policyId: fixAt.policyId, label: 'Open policy' }) : undefined
  const groupActions = otherGroups(ctx).map(asGroupAction)
  const findingLines: Part[][] = findings.slice(0, 3).map((f) => [T(f.line || f.title), T(f.fix ? ` — ${lowerFirst(f.fix).replace(/\.$/, '')}.` : '.'), T(f.caution ? ` ${f.caution.replace(/\.$/, '')}.` : '')])
  const base = { id: 'others', kind: 'others' as const, ask }
  if (also.length > 0) {
    const p = also[0]
    const c = covers.get(p.policyId)
    const would = c && c.status === 'decided' && c.decision ? c.decision : null
    return make({
      ...base,
      sentence: [
        C(p.name, policyTarget(p.policyId), 'notice'),
        T(` also covers ${ctx.isGroup ? 'them' : first}${c?.via.say ? ` ${c.via.say}` : ''}`),
        ...(would ? [T(' and would '), C(said(would), policyTarget(p.policyId), 'notice'), T(c?.ruleNumber ? ` (rule ${c.ruleNumber})` : '')] : c && c.possible.length > 1 ? [T(` and can't tell (${c.possible.map(said).join(' or ')})`)] : []),
        T(' — it isn’t used: '),
        dec,
        T(' comes first, and only the first policy that covers someone applies.'),
      ],
      more: [...also.slice(1).map((x) => [C(`${x.order}. ${x.name}`, policyTarget(x.policyId), 'notice'), T(` · also covers ${first} · not used`)]), ...(findingLines.length > 0 ? findingLines : c?.fix ? [[T(`To change it: ${lowerFirst(c.fix)}.`)]] : [])],
      tone: 'notice',
      focus: policyTarget(p.policyId),
      actions: [...groupActions, fixAction],
    })
  }
  if (findings.length > 0) {
    return make({ ...base, sentence: [T('No other policy covers '), C(person, 'person'), T(` on ${plan.appName}, but inside `), dec, T(':')], more: findingLines, tone: 'notice', focus: policyTarget(decider.id), actions: [...groupActions, fixAction] })
  }
  if (missed.length > 0) {
    return make({
      ...base,
      sentence: [...missed.flatMap((p, i) => [...(i === 0 ? [] : [T(i === missed.length - 1 ? ' and ' : ', ')]), C(p.name, policyTarget(p.policyId), 'neutral')]), T(missed.length === 1 ? " doesn't cover " : " don't cover "), C(person, 'person'), T(', so '), dec, T(' is the first that does.')],
      more: missed.map((p) => [C(`${p.order}. ${p.name}`, policyTarget(p.policyId), 'neutral'), T(p.reason ? ` · ${p.reason}` : '')]),
      tone: 'neutral',
      focus: policyTarget(decider.id),
      actions: groupActions,
    })
  }
  return make({
    ...base,
    sentence: [T('No other policy covers '), C(person, 'person'), T(` on ${plan.appName}: `), dec, T(' applies.')],
    more: [...(unasked.length > 0 ? [[T(`Not asked: ${unasked.map((p) => `${p.order}. ${p.name}`).join(', ')} — ${decider.name} applies first.`)]] : []), ...off.map((p) => [C(`${p.order}. ${p.name}`, policyTarget(p.policyId), 'neutral'), T(p.reason ? ` · ${p.reason}` : '')])],
    tone: 'neutral',
    focus: policyTarget(decider.id),
    actions: groupActions,
  })
}

function seeOf(ctx: Ctx, ask: string): Answer {
  const { plan, person } = ctx
  const o = plan.outcome
  const show: Action = { kind: 'see', label: ctx.isGroup ? 'Show what they see' : `Show what ${ctx.first} sees` }
  const base = { id: 'see', kind: 'see' as const, ask, focus: 'screens' as Target }
  if (ctx.screens.length === 0) return make({ id: 'see', kind: 'see', ask, sentence: [T('There is no sign-in page to show: no decision was reached.')], tone: 'neutral' })
  const who = C(person, 'person')
  const approx: Part[] = [T('(An approximation of the sign-in page.)')]
  if (o.status === 'decided' && o.decision) {
    if (o.decision === 'deny') {
      const msg = denyMessageOf(ctx.screens)
      return make({ ...base, sentence: [who, T(ctx.isGroup ? ' are blocked' : ' is blocked'), ...(msg ? [T(', with '), C(`“${msg}”`, 'screens', 'negative')] : []), T('.')], more: [approx], tone: 'negative', actions: [show] })
    }
    const f = factorsOf(ctx.screens, o.decision)
    return make({ ...base, sentence: f.length > 0 ? [who, T(ctx.isGroup ? ' are asked for ' : ' is asked for '), C(askedFor(f), 'screens', 'positive'), T(ctx.isGroup ? ', then are in.' : ', then is in.')] : [who, T(ctx.isGroup ? ' are let in.' : ' is let in.')], more: [approx], tone: 'positive', actions: [show] })
  }
  const outs = o.view.outcomes
  return make({
    ...base,
    sentence: [T(`It depends, so ${ctx.screens.length} sign-in ${ctx.screens.length === 1 ? 'page is' : 'pages are'} possible — one for each answer.`)],
    more: [
      ...(outs.length > 0 ? outs : ctx.screens.map((s) => ({ label: DECISION_WORDS[s.decision], decision: s.decision }))).map((x) => {
        const f = factorsOf(ctx.screens, x.decision)
        const msg = x.decision === 'deny' ? denyMessageOf(ctx.screens) : ''
        return [T(`${capital(x.label)}: `), C(x.decision === 'deny' ? (msg ? `blocked, with “${msg}”` : 'blocked') : askedFor(f) || said(x.decision), 'screens', decisionTone(x.decision))]
      }),
      approx,
    ],
    tone: 'notice',
    actions: [show],
  })
}

function checksOf(ctx: Ctx, ask: string): Answer {
  const { plan } = ctx
  const decider = plan.decider
  const landing = landingOf(plan)
  const o = plan.outcome
  if (!decider) return noDecider(ctx, ask)
  const show: Action = { kind: 'checks', label: 'Show every check' }
  const base = { id: 'checks', kind: 'checks' as const, ask }
  if (o.status === 'depends') {
    const open = plan.rules.filter((r) => r.index !== null && r.visited && r.state === 'unknown')
    if (open.length === 0) return dependsOf(ctx, ask)
    return make({
      ...base,
      sentence: [...open.flatMap((r, i) => [...(i === 0 ? [] : [T(i === open.length - 1 ? ' and ' : ', ')]), C(`Rule ${ruleNo(r)}`, ruleTarget(r), 'notice')]), T(" can't tell, with these checks:")],
      more: open.slice(0, 3).flatMap((r) => [[C(`Rule ${ruleNo(r)} · ${r.name}`, ruleTarget(r), 'notice')], ...r.checks.slice(0, Math.max(r.checked, 1)).map((c) => checkParts(r, c))]),
      tone: 'notice',
      focus: ruleTarget(open[0]),
      actions: [show],
    })
  }
  if (!landing || landing.index === null || landing.checks.length === 0) {
    /* The last row decided: every rule before it, by the check that ended it. */
    const missed = missedBefore(plan)
    return make({
      ...base,
      sentence: [T(missed.length === 0 ? `${decider.name} has no rules, so ` : `None of ${decider.name}'s ${missed.length === 1 ? 'rule matches' : `${missed.length} rules match`}, so `), C('Nothing else matched', landing ? ruleTarget(landing) : 'outcome'), T(' decides.')],
      more: missed.map((r) => {
        const c = failingOf(r)
        return [C(`Rule ${ruleNo(r)}`, ruleTarget(r), 'negative'), T(': '), ...(c ? [C(findingOf(c), checkTarget(r, c), 'negative', 'fail')] : [T('a check failed')])]
      }),
      tone: outcomeTone(plan),
      focus: landing ? ruleTarget(landing) : 'outcome',
      actions: [show],
    })
  }
  const n = landing.checks.length
  return make({
    ...base,
    sentence: [C(`Rule ${ruleNo(landing)} · ${landing.name}`, ruleTarget(landing)), T(` reads ${numWord(n)} ${n === 1 ? 'check' : 'checks'}`), T(landing.state === 'match' ? `, and ${n === 1 ? 'it passes' : n === 2 ? 'both pass' : 'all pass'}:` : ':')],
    more: landing.checks.flatMap((c) => [checkParts(landing, c), ...c.subs.filter((x) => x.label && c.subs.length > 1).map((x) => [T(` ${x.label}: `), C(x.actual || 'Not stated', checkTarget(landing, c), markTone(x.status), x.status), T(x.required ? ` · needs ${lowerFirst(x.required)}` : '')])]),
    tone: decisionTone(landing.decision),
    focus: ruleTarget(landing),
    actions: [show, ruleAction(decider.id, landing)],
  })
}

function groupOf(groupId: string | null, ctx: Ctx, ask: string): Answer {
  const { plan, person, first } = ctx
  const o = plan.outcome
  const rows = ctx.groupRows
  if (ctx.isGroup) return make({ id: 'group', kind: 'group', ask, sentence: [T('This is tested as '), C(lowerFirst(person), 'person'), T(': there is no other group to run as.')], tone: 'neutral', focus: 'person' })
  if (!rows || ctx.groups.length < 2) {
    const g = ctx.groups.map((x) => x.name)
    return make({ id: 'group', kind: 'group', ask, sentence: g.length === 1 ? [C(person, 'person'), T(` is only in ${g[0]}, so there is no other group to run as.`)] : [C(person, 'person'), T(' is in no group to run as.')], tone: 'neutral', focus: 'person' })
  }
  if (groupId) {
    const row = rows.find((x) => x.groupId === groupId)
    const g = ctx.groups.find((x) => x.id === groupId)
    if (row && g) {
      const d = row.status === 'decided' ? row.decision : null
      return make({
        id: `group:${g.id}`,
        kind: 'group',
        ask,
        sentence: [T(`As ${g.name} alone, `), C(first, 'person'), T(' would get '), C(d ? said(d) : lowerFirst(row.words), 'outcome', d ? decisionTone(d) : 'notice'), T(row.source ? ` — ${row.source}.` : '.')],
        more: [[T(`Today ${first} gets ${lowerFirst(rows.find((x) => x.current)?.words ?? DECISION_WORDS[o.decision ?? '1fa'])}${plan.asEachGroup?.why ? ` — ${plan.asEachGroup.why}` : ''}.`)]],
        tone: d ? decisionTone(d) : 'notice',
        focus: 'person',
        actions: [ctx.canGroup && asGroupAction(g)],
      })
    }
  }
  return make({
    id: 'group',
    kind: 'group',
    ask,
    sentence: [C(person, 'person'), T(` is in ${list(ctx.groups.map((x) => x.name))}. Each group alone gets:`)],
    more: rows.map((x) => [T(`${x.label}: `), C(x.decision && x.status === 'decided' ? DECISION_WORDS[x.decision] : x.words, 'outcome', x.status === 'decided' && x.decision ? decisionTone(x.decision) : 'notice'), T(x.source ? ` · ${x.source}` : '')]),
    tone: 'neutral',
    focus: 'person',
    actions: otherGroups(ctx).map(asGroupAction),
  })
}

function addOf(field: FormField, ctx: Ctx, ask: string): Answer {
  const { plan } = ctx
  const cats = FIELD_CATS[field] ?? []
  const word = fieldWord(field)
  const unknownRules = plan.rules.filter((r) => r.visited && r.state === 'unknown' && r.checks.some((c) => cats.includes(c.category) && c.status === 'unknown'))
  if (unknownRules.length > 0) {
    const r0 = unknownRules[0]
    const c0 = r0.checks.find((c) => cats.includes(c.category) && c.status === 'unknown')
    return make({
      id: `add:${field}`,
      kind: 'add',
      ask,
      sentence: [
        C(`The ${word} is not stated`, c0 ? checkTarget(r0, c0) : ruleTarget(r0), 'notice', 'unknown'),
        T(', so '),
        ...unknownRules.flatMap((r, i) => [...(i === 0 ? [] : [T(i === unknownRules.length - 1 ? ' and ' : ', ')]), C(r.index === null ? 'Nothing else matched' : `rule ${ruleNo(r)}`, ruleTarget(r), 'notice')]),
        T(` can't tell. State it to see which rule decides.`),
      ],
      tone: 'notice',
      focus: ruleTarget(unknownRules[0]),
      actions: [{ kind: 'add', field, label: `Add the ${word}` }],
    })
  }
  /* Stated: what it is, where the rules read it. */
  const seen: { r: EngineRule; c: CheckRow }[] = []
  for (const r of plan.rules) for (const c of readOf(r)) if (cats.includes(c.category)) seen.push({ r, c })
  if (seen.length === 0) return make({ id: `add:${field}`, kind: 'add', ask, sentence: [T(`No rule this sign-in reached reads the ${word}.`)], tone: 'neutral', actions: [{ kind: 'add', field, label: `Change the ${word}` }] })
  const { r, c } = seen[seen.length - 1]
  return make({
    id: `add:${field}`,
    kind: 'add',
    ask,
    sentence: [T(`The ${word} is `), C(c.value, 'person'), T(`: in `), C(r.index === null ? 'Nothing else matched' : `rule ${ruleNo(r)}`, ruleTarget(r)), T(', '), C(findingOf(c), checkTarget(r, c), markTone(c.status), c.status), T('.')],
    tone: markTone(c.status),
    focus: checkTarget(r, c),
    actions: [{ kind: 'add', field, label: `Change the ${word}` }],
  })
}

function dependsOf(ctx: Ctx, ask: string): Answer {
  const { plan } = ctx
  const o = plan.outcome
  if (o.status !== 'depends') {
    const v = answerOf({ kind: 'why' }, ctx, ask, null)
    return { ...v, id: 'depends:none', kind: 'depends', sentence: [T("It doesn't depend on anything: every fact it reads is stated. "), ...v.sentence], say: plain([T("It doesn't depend on anything: every fact it reads is stated. "), ...v.sentence]) }
  }
  const dep = plan.conflicts?.depends
  const needs = (o.view.needs.length > 0 ? o.view.needs : (dep?.factWords ?? [])).map((x) => x.toLowerCase())
  const open = plan.rules.filter((r) => r.index !== null && r.visited && r.state === 'unknown')
  const field = unstatedFields(plan)[0]
  const c0 = open[0]?.checks.find((c) => c.status === 'unknown')
  const settle = settlersOf(ctx)
  return make({
    id: 'depends',
    kind: 'depends',
    ask,
    sentence: [
      T('It depends on '),
      C(needs.length > 0 ? `the ${list(needs)}` : 'a fact not stated', open[0] && c0 ? checkTarget(open[0], c0) : open[0] ? ruleTarget(open[0]) : 'outcome', 'notice', 'unknown'),
      T(': it is not stated, so '),
      ...open.flatMap((r, i) => [...(i === 0 ? [] : [T(i === open.length - 1 ? ' and ' : ', ')]), C(`rule ${ruleNo(r)}`, ruleTarget(r), 'notice')]),
      T(" can't tell."),
    ],
    more: [
      ...o.view.outcomes.map((x) => {
        const rule = /rule (\d+)/i.exec(x.label)
        const r = rule ? plan.rules.find((y) => y.index !== null && ruleNo(y) === Number(rule[1])) : plan.rules.find((y) => y.index === null)
        return [C(capital(x.label), r ? ruleTarget(r) : 'outcome'), T(': '), C(said(x.decision), 'outcome', decisionTone(x.decision))]
      }),
      ...settle.map((w) => [T(`${w.label}: ${lowerFirst(w.words)}${w.source ? ` (${w.source})` : ''} — a preview.`)]),
    ],
    tone: 'notice',
    focus: open[0] ? ruleTarget(open[0]) : 'outcome',
    actions: [...settle.map(runWithAction), field ? { kind: 'add', field, label: `Add the ${fieldWord(field)}` } : undefined],
  })
}

/* "What would change it?": the previews that change the answer, fewest-changed-rules first. */
function whatIfOf(ctx: Ctx, ask: string): Answer {
  const tried = ctx.whatIfs
  const changed = tried.filter((w) => w.changed).slice(0, 4)
  if (!ctx.props.whatIfs) return make({ id: 'what-if', kind: 'what-if', ask, sentence: [T('Other networks, devices and risk scores can be previewed once the run is done.')], tone: 'neutral' })
  if (changed.length === 0)
    return make({ id: 'what-if', kind: 'what-if', ask, sentence: [T(`None of the ${tried.length} previewed ${tried.length === 1 ? 'change' : 'changes'} to the network, device and risk score would change the answer.`)], tone: 'neutral', actions: [{ kind: 'edit', label: 'Edit the sign-in' }] })
  const n = tried.filter((w) => w.changed).length
  return make({
    id: 'what-if',
    kind: 'what-if',
    ask,
    sentence: [T(`${n} of the ${tried.length} previewed changes would change the answer — previews, not runs:`)],
    /* Each row is ONE change, and says so; the one preview that brings a second ("From Home broadband and its place",
       what-if.ts `variationsOf`) names both in its own label, so the list needs no footnote the panels could drop. */
    more: changed.map((w) => [T(`${w.label} → `), T(`${w.words}${w.source ? ` (${w.source})` : ''}`)]),
    tone: 'neutral',
    previewing: [...new Set(changed.map((w) => w.field))],
    actions: changed.slice(0, 2).map(runWithAction),
  })
}

const LEAD: Partial<Record<FormField, string>> = { address: 'From', device: 'On', risk: 'With', when: 'At' }

/* A sentence's sign-in, or one fact changed: run here as a preview, with the press that runs it. */
function previewAnswer(intent: Extract<Intent, { kind: 'what-if-value' | 'sign-in' }>, ctx: Ctx, ask: string): Answer {
  const preview = ctx.props.preview
  const unread: Part[][] = intent.unread.length > 0 ? [[T(`I didn't recognise ${intent.unread.map((u) => `'${u}'`).join(', ')}.`)]] : []
  const field = intent.fields[0] ?? 'person'
  const w = preview ? preview(intent.patch, field) : null
  if (intent.kind === 'sign-in') {
    if (intent.fields.length === 0) return make({ id: `sign-in:unread`, kind: 'sign-in', ask, sentence: [T(`I didn't recognise ${intent.unread.map((u) => `'${u}'`).join(', ')}.`)], more: [[T('Name a person, an application, a network or a device as the panel has them.')]], tone: 'neutral', known: false })
    const read = T(`Read: ${intent.read.join(' · ')}.`)
    if (!w) return make({ id: `sign-in:${patchKey(intent.patch)}`, kind: 'sign-in', ask, sentence: [read], more: [[T(preview ? 'It cannot run yet: it needs a person and an application.' : 'It can be previewed once the run is done.')], ...unread], tone: 'neutral', previewing: intent.fields })
    const who = w.plan.conflicts?.personName || w.plan.asEachGroup?.personName || ctx.person
    return make({
      id: `sign-in:${patchKey(intent.patch)}`,
      kind: 'sign-in',
      ask,
      sentence: [read],
      more: [[T(`${who} on ${w.plan.appName}: `), T(`${w.words}${w.source ? ` (${w.source})` : ''}`), T(' — a preview.')], ...unread],
      tone: w.tone,
      previewing: intent.fields,
      actions: [{ kind: 'runWith', patch: intent.patch, field, label: 'Run this sign-in' }],
    })
  }
  const words = intent.fields.map((f) => intent.said[f] ?? fieldWord(f))
  const values = words.map((r, i) => (intent.fields[i] === 'risk' || r === 'No device' ? lowerFirst(r) : r))
  const lead = intent.fields.map((f, i) => (words[i] === 'No device' ? 'With no device' : `${LEAD[f] ?? 'With'} ${values[i]}`)).join(', ')
  if (!w) return make({ id: `what-if:${patchKey(intent.patch)}`, kind: 'what-if-value', ask, sentence: [T(preview ? `${lead}: it cannot run as a preview.` : 'It can be previewed once the run is done.')], more: unread, tone: 'neutral', previewing: intent.fields })
  return make({
    id: `what-if:${patchKey(intent.patch)}`,
    kind: 'what-if-value',
    ask,
    sentence: [T(previewSaid(w, ctx, lead))],
    more: [[T('A preview: the sign-in on screen is unchanged.')], ...unread],
    tone: w.changed ? w.tone : 'neutral',
    previewing: intent.fields,
    actions: [{ kind: 'runWith', patch: intent.patch, field, label: `Run with ${values.join(' and ')}` }],
  })
}

/* A policy that is off or a draft, covering them: what it would do turned on (conflicts.ts `off`). */
function offOf(policyId: string | null, ctx: Ctx, ask: string): Answer {
  const { plan } = ctx
  const offs = plan.conflicts?.off ?? []
  const pick = policyId ? offs.filter((x) => x.policyId === policyId) : offs
  const name = (id: string, n: string): Part => (plan.policies.some((p) => p.policyId === id) ? C(n, policyTarget(id), 'neutral') : T(n))
  if (pick.length === 0) return make({ id: 'off', kind: 'off', ask, sentence: [T(`No switched-off or draft policy on ${plan.appName} covers ${ctx.isGroup ? 'them' : ctx.first}.`)], tone: 'neutral' })
  const [p, ...rest] = pick
  return make({
    id: 'off',
    kind: 'off',
    ask,
    sentence: [name(p.policyId, p.policyName), T(` · ${p.say}.`)],
    more: rest.map((x) => [name(x.policyId, x.policyName), T(` · ${x.say}.`)]),
    tone: pick.some((x) => x.changes) ? 'notice' : 'neutral',
    focus: plan.policies.some((x) => x.policyId === p.policyId) ? policyTarget(p.policyId) : undefined,
    actions: [p, ...rest.filter((x) => x.changes)].slice(0, 2).map((x) => ({ kind: 'assumeOn', policyId: x.policyId, label: `Run as if ${x.policyName} were on` }) as Action),
  })
}

function breakInOf(ctx: Ctx, ask: string): Answer {
  const b = ctx.props.breakIn
  if (!b) return make({ id: 'break-in', kind: 'break-in', ask, sentence: [T('Break-in attempts come once the run is done.')], tone: 'neutral' })
  const c = b.summary.counts
  const bits = [
    c.gotThrough > 0 && `${c.gotThrough} hostile got through`,
    c.weakerFactor > 0 && `${c.weakerFactor} on a weaker factor`,
    c.lessThanAsked > 0 && `${c.lessThanAsked} got less than asked`,
    c.lockedOut > 0 && `${c.lockedOut} locked out`,
    c.extraPrompts > 0 && `${c.extraPrompts} asked for more`,
    c.undecided > 0 && `${c.undecided} can't tell`,
  ].filter((x): x is string => typeof x === 'string')
  return make({
    id: 'break-in',
    kind: 'break-in',
    ask,
    sentence: [T(`Break-in attempts on ${b.summary.appName}: ${b.summary.holes} got through, ${c.held} held.`)],
    more: bits.length > 0 ? [[T(`${capital(bits.join(' · '))}.`)]] : undefined,
    tone: b.summary.holes > 0 ? 'notice' : 'positive',
    actions: [{ kind: 'breakIn', label: 'Review break-in attempts' }],
  })
}

// --- Acting -----------------------------------------------------------------------------------

/** Does what an action says, through the layout's callbacks. False for the view's own (`see`, `checks`) or a way out it lacks. */
export function runAction(action: Action, props: AskProps): boolean {
  try {
    switch (action.kind) {
      case 'asGroup':
        return call(props.onAsGroup, action.groupId)
      case 'runWith':
        return call2(props.onRunWith, action.patch, action.field)
      case 'assumeOn':
        return call2(props.onRunWith, { assumeOn: action.policyId }, 'assume-on')
      case 'replay':
        return call(props.onReplay)
      case 'openRule':
        return call2(props.onOpenRule, action.policyId, action.ruleId)
      case 'openPolicy':
        return call(props.onOpenPolicy, action.policyId)
      case 'add':
        return call(props.onAdd, action.field)
      case 'edit':
        return call(props.onPressPerson)
      case 'breakIn':
        return call(props.onReviewBreakIn, 'outcome' as const)
      default:
        return false
    }
  } catch {
    /* A way out that refused: nothing else to do. */
    return false
  }
}
function call<A extends unknown[]>(f: ((...a: A) => void) | undefined, ...args: A): boolean {
  if (!f) return false
  f(...args)
  return true
}
function call2<A, B>(f: ((a: A, b: B) => void) | undefined, a: A, b: B): boolean {
  if (!f) return false
  f(a, b)
  return true
}

/** The thread's one line for a press: "Running as Finance only.", "Opening rule 2 in the builder." */
export function didLine(a: Action): string {
  switch (a.kind) {
    case 'asGroup':
    case 'runWith':
    case 'assumeOn':
      return `${a.label.replace(/^Run\b/, 'Running')}.`
    case 'replay':
      return 'Replaying the run.'
    case 'openRule':
      return `${a.label.replace(/^Open\b/, 'Opening')} in the builder.`
    case 'openPolicy':
      return 'Opening the policy in the builder.'
    case 'add':
      return `Opening the ${fieldWord(a.field)} in the panel.`
    case 'edit':
      return 'Opening the sign-in in the panel.'
    case 'see':
    case 'checks':
      return `${a.label.replace(/^Show\b/, 'Showing')}.`
    case 'breakIn':
      return 'Opening the break-in attempts.'
    case 'how':
      return 'Showing how it was decided.'
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
