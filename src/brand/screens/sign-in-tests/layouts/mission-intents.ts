import type { AccessDecision } from '../../../data'
import { DECISION_WORDS } from '../../../decision-words'
import { stepLabel, type SignInScreens } from '../../testing/screens-of'
import type { FormField } from '../../testing/sign-in-form'
import type { GroupRef, Via } from '../conflicts'
import type { CheckRow, EngineRule, EngineRun } from '../engine-run'
import type { GroupRowView } from '../journey'

/* -----------------------------------------------------------------------------
   What flight says (MissionLayout.tsx; adapted from jarvis-intents.ts): the voice's few lines for a run, the
   suggestions it offers once a run has landed, and the answers to what is
   asked of it — typed, spoken or pressed. Pure: every word is composed from
   the plan (engine-run.ts), its findings (conflicts.ts) and what the person
   sees (screens-of.ts); nothing here is made up, and an ask it cannot answer
   from them says so.
   -------------------------------------------------------------------------- */

export type Tone = 'positive' | 'negative' | 'notice' | 'neutral'

export interface AskContext {
  plan: EngineRun
  /** "Maya Iyer", or "A member of Finance". */
  person: string
  /** "Maya", or the group's name. */
  first: string
  /** The person is a group's member (the picker's "Anyone in …"). */
  isGroup: boolean
  screens: readonly SignInScreens[]
  /** The person's groups, first group first. */
  groups: readonly GroupRef[]
  /** "As each group": what each of their groups alone gets; null for one group. */
  groupRows: readonly GroupRowView[] | null
  /** The page can re-run as a group. */
  canGroup: boolean
  /** The facts of the sign-in, by the field that states them, as the launch pad shows them. */
  facts: readonly { field: FormField; label: string; value: string; unset: boolean }[]
}

const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
const numWord = (n: number) => NUM[n] ?? String(n)
const lowerFirst = (t: string): string => (/^(Not|Below|Above|Between|Before|After|Any) /.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t)
const capital = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t)
const list = (xs: readonly string[]) => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)

/** "via Engineering" said aloud: "through Engineering". */
function viaSpoken(via: Via | undefined): string {
  if (!via?.matches || !via.say) return ''
  if (via.kind === 'groups') return `through ${via.label}`
  if (via.kind === 'person') return 'by name'
  return 'as a policy for everyone'
}

export function toneOf(plan: Pick<EngineRun, 'outcome'>): Tone {
  const o = plan.outcome
  if (o.status === 'decided' && o.decision) return o.decision === 'deny' ? 'negative' : 'positive'
  return o.status === 'depends' ? 'notice' : 'neutral'
}

export const decisionTone = (d: AccessDecision): Tone => (d === 'deny' ? 'negative' : 'positive')

/** A decision said aloud, after "it would": the words a voice reads well. */
const SPOKEN: Record<AccessDecision, string> = { '1fa': 'allow on one factor', '2fa': 'ask for a second factor', deny: 'deny' }

/** The rule the walk stopped at, or undefined. */
export const landingOf = (plan: EngineRun): EngineRule | undefined => (plan.landing !== null ? plan.rules[plan.landing] : undefined)

/** The deciding policy's audience, as the findings measured it: "via Engineering"; '' when they did not. */
export function deciderVia(plan: EngineRun): Via | undefined {
  const v = plan.conflicts?.policies[0]?.deciderVia
  return v?.matches ? v : undefined
}

/** A check's fact, as the sign-in showed it: a Who that let the person in says how. */
export function factOf(c: CheckRow, via?: Via): string {
  if (c.missing || c.status === 'unknown') return c.value && c.value !== 'Not stated' && !c.missing ? c.value : 'Not stated'
  if (c.category === 'who' && c.status === 'pass' && via?.matches && via.say) return `${c.value} · ${via.say}`
  return c.value
}
export const needOf = (c: CheckRow): string => (c.requirement ? `needs ${lowerFirst(c.requirement)}` : '')

/** The check that ended a rule that did not match, or the first it could not tell. */
export function failingOf(r: EngineRule): CheckRow | undefined {
  if (r.failing !== null) return r.checks[r.failing]
  return r.checks.find((c) => c.status === 'fail') ?? r.checks.find((c) => c.status === 'unknown')
}

/** What one factor or two looks like for the decision on screen. */
export function factorsOf(screens: readonly SignInScreens[], d: AccessDecision | null): string[] {
  if (!d) return []
  const sc = screens.find((x) => x.decision === d)
  return (sc?.steps ?? []).filter((st) => st.kind !== 'deny').map(stepLabel)
}
export function denyMessageOf(screens: readonly SignInScreens[]): string {
  const sc = screens.find((x) => x.decision === 'deny')
  const st = sc?.steps.find((x) => x.kind === 'deny')
  return st && st.kind === 'deny' ? st.message : ''
}

// --- The voice's lines ------------------------------------------------------------------------

export function lineStart(ctx: AskContext): string {
  return `Flight, ${ctx.plan.appName} poll. ${ctx.isGroup ? capital(ctx.person) : ctx.first} is on the pad.`
}

/** The rules' line cut to where the walk stopped: what is said with the verdict when the rules' own line had no time. */
export function lineLanding(ctx: AskContext): string {
  const landing = landingOf(ctx.plan)
  if (!landing) return ''
  if (landing.index !== null) return landing.state === 'match' ? `Rule ${numWord(landing.index + 1)}, GO.` : ''
  return landing.state === 'possible' ? '' : 'Nothing else matched.'
}

export function lineLock(ctx: AskContext): string | null {
  const { plan, first } = ctx
  if (!plan.decider) return null
  if (plan.decider.isGlobalDefault) {
    const others = plan.policies.filter((p) => !p.isGlobalDefault).length
    return others > 0 ? `No ${plan.appName} policy is GO for ${first}. The Global Default takes the flight.` : `${plan.appName} has no policy of its own. The Global Default takes the flight.`
  }
  const via = viaSpoken(deciderVia(plan))
  const nogo = plan.policies.filter((p) => !p.decides && p.scanned && p.order < (plan.policies.find((x) => x.decides)?.order ?? 0)).length
  return `${nogo === 1 ? 'Policy one, no-go. ' : nogo > 1 ? `${capital(numWord(nogo))} stations no-go. ` : ''}${plan.decider.name}? GO${via ? `, ${via}` : ''}.`
}

export function lineRules(ctx: AskContext): string | null {
  const { plan } = ctx
  const landing = landingOf(plan)
  if (!plan.decider || !landing) return null
  const before = plan.rules.slice(0, plan.landing ?? 0).filter((r) => r.index !== null && r.visited)
  const missed = before.filter((r) => r.state === 'no-match')
  const parts: string[] = []
  let unknowns = 0
  let collapsed = false
  /* In reading order: what each rule before the one that stopped the walk said. */
  for (const r of before) {
    const n = numWord((r.index ?? 0) + 1)
    if (r.state === 'no-match') {
      if (missed.length > 2) {
        if (!collapsed) parts.push(`Rules ${list(missed.map((x) => numWord((x.index ?? 0) + 1)))}, no-go.`)
        collapsed = true
        continue
      }
      const c = failingOf(r)
      parts.push(`Rule ${n}, no-go${c ? ` on ${c.word.toLowerCase()}` : ''}.`)
    } else if (r.state === 'unknown' && unknowns < 2) {
      unknowns++
      const c = r.checks.find((x) => x.status === 'unknown')
      parts.push(`Rule ${n}, hold${c ? ` on ${c.word.toLowerCase()}` : ''}.`)
    }
  }
  if (landing.index !== null) parts.push(landing.state === 'match' ? `Rule ${numWord(landing.index + 1)}, GO.` : `Rule ${numWord(landing.index + 1)}, hold.`)
  else parts.push(landing.state === 'possible' ? 'Otherwise, nothing else matched.' : 'Nothing else matched.')
  return parts.join(' ')
}

/** The rules' line in short: which did not apply, and where it stopped. */
export function lineRulesShort(ctx: AskContext): string | null {
  const { plan } = ctx
  const landing = landingOf(plan)
  if (!plan.decider || !landing) return null
  const before = plan.rules.slice(0, plan.landing ?? 0).filter((r) => r.index !== null && r.visited)
  /* A hold: the rules that can't tell are the story; those that miss go unsaid. */
  if (plan.outcome.status === 'depends') {
    const held = before.filter((r) => r.state === 'unknown')
    if (held.length > 0) return `${held.length === 1 ? 'Rule' : 'Rules'} ${list(held.map((r) => numWord((r.index ?? 0) + 1)))}, hold.`
  }
  const missed = before.filter((r) => r.state === 'no-match')
  const head =
    missed.length === 0
      ? ''
      : missed.length === 1
        ? `Rule ${numWord((missed[0].index ?? 0) + 1)}, no-go.`
        : `Rules ${list(missed.map((r) => numWord((r.index ?? 0) + 1)))}, no-go.`
  return `${head} ${lineLanding(ctx)}`.trim() || null
}

export function lineVerdict(ctx: AskContext): string {
  const o = ctx.plan.outcome
  if (o.status === 'decided' && o.decision) {
    if (o.decision === '1fa') return 'We are GO for sign-in, on one factor.'
    if (o.decision === '2fa') {
      const f = factorsOf(ctx.screens, '2fa')
      return `We are GO for sign-in, with a second factor${f.length > 1 ? `: ${f[f.length - 1]}` : ''}.`
    }
    return 'Scrub. Access denied.'
  }
  if (o.status === 'depends') {
    const needs = o.view.needs.map((n) => n.toLowerCase())
    return needs.length > 0 ? `Hold. Waiting on the ${list(needs)}.` : 'Hold. Waiting on a fact not stated.'
  }
  return 'No call: no policy decides.'
}

/** Everything at once — a run that landed without playing (reduced motion). */
export function lineAll(ctx: AskContext): string {
  return `${ctx.person} on ${ctx.plan.appName}. ${lineVerdict(ctx)}`
}

// --- Asking -------------------------------------------------------------------------------------

export type Intent =
  | { kind: 'why-rule'; rule: number | null }
  | { kind: 'others' }
  | { kind: 'see' }
  | { kind: 'checks' }
  | { kind: 'group'; groupId: string | null }
  | { kind: 'set'; field: FormField }
  | { kind: 'open' }
  | { kind: 'verdict' }
  | { kind: 'policy' }
  | { kind: 'depends' }
  | { kind: 'unknown' }

export type Act =
  | { kind: 'group'; groupId: string }
  | { kind: 'set'; field: FormField }
  | { kind: 'open'; policyId: string; ruleId: string | null }
  | { kind: 'see' }
  | { kind: 'checks' }

export interface AnswerLine {
  text: string
  /** A quieter second line: what the rule needs, why. */
  sub?: string
  mark?: 'pass' | 'fail' | 'unknown'
  tone?: Tone
}

export interface Answer {
  key: string
  title: string
  tone: Tone
  lines: AnswerLine[]
  /** What in the room it is about: lit while it shows (data-mx ids). */
  lit: string[]
  /** What the voice says. */
  say: string
  /** What it does as it is given. */
  act?: Act
}

export interface Chip {
  key: string
  label: string
  intent: Intent
}

const WORD_NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, first: 1, second: 2, third: 3, last: -1 }

/* What a few words ask for. Keywords, in order of how specific they are; the
   group a person names is found by its name. */
export function matchIntent(raw: string, ctx: Pick<AskContext, 'groups' | 'plan'>): Intent {
  const t = ` ${raw.toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim()} `
  if (t.trim() === '') return { kind: 'unknown' }
  if (/\b(open|builder|edit|go to)\b/.test(t)) return { kind: 'open' }
  const named = ctx.groups.find((g) => t.includes(` ${g.name.toLowerCase()} `) || t.includes(` ${g.name.toLowerCase()}s `))
  if (named && /\b(as|only|run|alone|just)\b/.test(t)) return { kind: 'group', groupId: named.id }
  if (/\b(each group|groups|as a group|per group|both groups)\b/.test(t)) return { kind: 'group', groupId: null }
  if (/\b(see|sees|screen|screens|prompt|prompted|shown|page)\b/.test(t)) return { kind: 'see' }
  if (/\b(who else|other polic|another polic|conflicts?|also covers?|others|clash)\b/.test(t)) return { kind: 'others' }
  if (/\b(every|all|each|full|show)\b.*\bchecks?\b|\bchecks\b|\bdetails?\b/.test(t)) return { kind: 'checks' }
  const rm = t.match(/\brule\s*(\d+|one|two|three|four|five|six|seven|eight|nine|ten|first|second|third|last)\b/) ?? t.match(/\b(first|second|third|last)\s+rule\b/)
  if (rm) {
    const k = rm[1]
    const n = /^\d+$/.test(k) ? Number(k) : (WORD_NUM[k] ?? null)
    const rules = ctx.plan.rules.filter((r) => r.index !== null)
    return { kind: 'why-rule', rule: n === -1 ? rules.length || null : n }
  }
  if (/\b(depends?|can't tell|cant tell|unknown|not stated|missing)\b/.test(t)) return { kind: 'depends' }
  if (/\b(device|laptop|phone|mdm)\b/.test(t)) return { kind: 'set', field: 'device' }
  if (/\b(network|ip|address|office|from|location|place|where)\b/.test(t)) return { kind: 'set', field: /\b(place|location|where|city)\b/.test(t) ? 'place' : 'address' }
  if (/\b(risk|score)\b/.test(t)) return { kind: 'set', field: 'risk' }
  if (/\b(time|when|hour|day)\b/.test(t)) return { kind: 'set', field: 'when' }
  if (/\b(why|fail|failed|didn't|didnt|not match|no match)\b/.test(t)) return { kind: 'why-rule', rule: null }
  if (/\b(outcome|verdict|result|decision|allowed?|denied|deny|access|factors?|mfa|2fa|granted)\b/.test(t)) return { kind: 'verdict' }
  if (/\b(polic(y|ies)|which|decides?|decided)\b/.test(t)) return { kind: 'policy' }
  return { kind: 'unknown' }
}

/** The facts' form fields that would settle a Depends, each once, in the order they matter. */
function neededFields(plan: EngineRun): FormField[] {
  const out: FormField[] = []
  for (const r of plan.rules) {
    if (!r.visited) continue
    for (const c of r.checks.slice(0, Math.max(r.checked, 0))) if (c.status === 'unknown' && c.missing && !out.includes(c.missing)) out.push(c.missing)
  }
  return out
}

const FIELD_OF: Partial<Record<CheckRow['category'], FormField>> = { network: 'address', place: 'place', device: 'device', time: 'when', risk: 'risk' }

function setLabel(field: FormField, first: string, isGroup: boolean): string {
  switch (field) {
    case 'device':
      return isGroup ? 'Set the device' : `Set ${first}'s device`
    case 'address':
      return 'Set the network'
    case 'place':
      return 'Set the place'
    case 'when':
      return 'Set the time'
    case 'risk':
      return 'Set the risk score'
    default:
      return 'Change the sign-in'
  }
}

/** The rules before the one that decided that did not match, in order. */
const missedBefore = (plan: EngineRun) => plan.rules.slice(0, plan.landing ?? plan.rules.length).filter((r) => r.index !== null && r.visited && r.state === 'no-match')

/* The suggestions for THIS run: only those with a real answer, the likeliest
   first, no more than seven. */
export function chipsOf(ctx: AskContext): Chip[] {
  const { plan, first, isGroup } = ctx
  const out: Chip[] = []
  if (plan.empty) return out
  /* A Depends first: it is the question the run leaves open. */
  if (plan.outcome.status === 'depends') out.push({ key: 'depends', label: 'Why the hold?', intent: { kind: 'depends' } })
  for (const r of missedBefore(plan).slice(0, 2)) {
    const n = (r.index ?? 0) + 1
    out.push({ key: `why:${n}`, label: `Why NO-GO on rule ${n}?`, intent: { kind: 'why-rule', rule: n } })
  }
  const needs = neededFields(plan)
  const failed = missedBefore(plan)
    .map((r) => failingOf(r))
    .map((c) => (c ? FIELD_OF[c.category] : undefined))
    .filter((f): f is FormField => f !== undefined)
  for (const f of [...new Set([...needs, ...failed])].slice(0, 1)) out.push({ key: `set:${f}`, label: setLabel(f, first, isGroup), intent: { kind: 'set', field: f } })
  const o = othersOf(plan)
  if (plan.decider?.isGlobalDefault && o.missed.length > 0) out.push({ key: 'others', label: 'Why the Global Default?', intent: { kind: 'others' } })
  else if (plan.decider && o.also.length > 0) out.push({ key: 'others', label: 'Who else called GO?', intent: { kind: 'others' } })
  else if (plan.decider && o.missed.length > 0) out.push({ key: 'others', label: o.missed.length === 1 ? `Why NO-GO on policy ${o.missed[0].order}?` : 'Why NO-GO above?', intent: { kind: 'others' } })
  /* What they see has its own button on the call (Crew view): not offered twice. */
  const landing = landingOf(plan)
  if (ctx.canGroup && ctx.groupRows) {
    /* One group to run as: the one whose answer alone differs from this one, else the first. */
    const mine = ctx.groupRows.find((g) => g.current)
    const rows = ctx.groupRows.filter((g) => g.groupId)
    const differs = rows.filter((g) => !mine || g.words !== mine.words)
    for (const row of (differs.length > 0 ? differs : rows).slice(0, 1)) {
      const g = ctx.groups.find((x) => x.id === row.groupId)
      if (g) out.push({ key: `group:${g.id}`, label: `Run as ${g.name} only`, intent: { kind: 'group', groupId: g.id } })
    }
  }
  if (plan.outcome.policyId) out.push({ key: 'open', label: landing && landing.index !== null && plan.outcome.status === 'decided' ? `Open rule ${landing.index + 1}` : 'Open the policy', intent: { kind: 'open' } })
  return out.slice(0, 6)
}

function checkLine(c: CheckRow, via?: Via): AnswerLine {
  return { text: `${c.word} · ${factOf(c, via)}`, sub: needOf(c), mark: c.status }
}

function ruleTitle(r: EngineRule): string {
  return r.index === null ? 'Nothing else matched' : `Rule ${r.index + 1} · ${r.name}`
}

/* The policies that did not decide, by why: those that also cover the person
   (a conflict), those asked before it that do not, those not on, and those
   never asked because the one deciding came first. */
function othersOf(plan: EngineRun) {
  const covers = new Map((plan.conflicts?.policies ?? []).map((p) => [p.policyId, p]))
  const rest = plan.policies.filter((p) => !p.decides)
  const isOn = (p: EngineRun['policies'][number]) => p.status === 'active' || p.status === 'always-on'
  const also = rest.filter((p) => covers.has(p.policyId))
  const missed = rest.filter((p) => !covers.has(p.policyId) && p.scanned)
  const off = rest.filter((p) => !covers.has(p.policyId) && !p.scanned && !isOn(p))
  const unasked = rest.filter((p) => !covers.has(p.policyId) && !p.scanned && isOn(p))
  return { covers, also, missed, off, unasked }
}

const listed = (ps: readonly { order: number; name: string }[]) => ps.map((p) => `${p.order}. ${p.name}`).join(' · ')

export function answerOf(intent: Intent, ctx: AskContext): Answer {
  const { plan, first, person } = ctx
  const landing = landingOf(plan)
  const decider = plan.decider
  const o = plan.outcome

  switch (intent.kind) {
    case 'why-rule': {
      const rules = plan.rules.filter((r) => r.index !== null)
      let n = intent.rule
      if (n === null) {
        const m = missedBefore(plan)[0] ?? plan.rules.slice(0, plan.landing ?? 0).find((r) => r.state === 'unknown')
        if (!m) return answerOf({ kind: 'policy' }, ctx)
        n = (m.index ?? 0) + 1
      }
      const r = rules.find((x) => (x.index ?? -1) + 1 === n)
      if (!r || !decider) {
        return {
          key: `why:${n}:none`,
          title: `No rule ${n}`,
          tone: 'neutral',
          lines: [{ text: decider ? `${decider.name} has ${rules.length === 1 ? '1 rule' : `${rules.length} rules`}, then Nothing else matched.` : 'No policy decides this sign-in.' }],
          lit: [],
          say: decider ? `${decider.name} has ${numWord(rules.length)} ${rules.length === 1 ? 'rule' : 'rules'}.` : 'No policy decides this sign-in.',
        }
      }
      const read = r.checks.slice(0, Math.max(r.checked, r.failing !== null ? r.failing + 1 : 0))
      if (r.state === 'no-match') {
        const c = failingOf(r)
        const subs = c ? c.subs.filter((x) => x.status === 'fail') : []
        const unread = r.checks.slice(read.length).map((x) => x.word)
        return {
          key: `why:${n}`,
          title: `Rule ${n} · NO-GO`,
          tone: 'negative',
          lines: [
            ...(c ? [{ text: c.line || c.say, tone: 'negative' as Tone }, checkLine(c, r.via)] : []),
            ...subs.slice(0, 4).map((x) => ({ text: `${x.label} · ${x.actual || 'Not stated'}`, sub: x.required ? `needs ${lowerFirst(x.required)}` : '', mark: x.status })),
            ...(unread.length > 0 ? [{ text: `Not read after it: ${list(unread)}`, tone: 'neutral' as Tone }] : []),
          ],
          lit: [r.node],
          say: `Rule ${numWord(n)} doesn't apply${c?.line ? `: ${c.line}` : ''}.`,
        }
      }
      if (r.state === 'unknown') {
        const c = r.checks.find((x) => x.status === 'unknown')
        return {
          key: `why:${n}`,
          title: `Rule ${n} · HOLD · can't tell`,
          tone: 'notice',
          lines: read.map((x) => checkLine(x, r.via)),
          lit: [r.node],
          say: `Rule ${numWord(n)} can't tell${c ? `: the ${c.word.toLowerCase()} is not stated` : ''}.`,
          act: undefined,
        }
      }
      if (r.state === 'match') {
        return {
          key: `why:${n}`,
          title: `Rule ${n} · GO`,
          tone: decisionTone(r.decision),
          lines: [...read.map((x) => checkLine(x, r.via)), { text: `Then · ${DECISION_WORDS[r.decision]}`, tone: decisionTone(r.decision) }],
          lit: [r.node],
          say: `Rule ${numWord(n)} matches: ${read.map((x) => x.line).filter(Boolean).join(', ')}.`,
        }
      }
      if (r.state === 'off') return { key: `why:${n}`, title: `Rule ${n} is switched off`, tone: 'neutral', lines: [{ text: 'Passed over: nothing in it is asked.' }], lit: [r.node], say: `Rule ${numWord(n)} is switched off.` }
      /* Not reached: the first match decides. A later rule that also applies says so. */
      const clash = plan.conflicts?.rules.find((x) => x.ruleId === r.id)
      const at = landing && landing.index !== null ? `Rule ${landing.index + 1} matched first` : 'The walk stopped before it'
      return {
        key: `why:${n}`,
        title: `Rule ${n} wasn't read`,
        tone: clash?.kind === 'conflict' ? 'notice' : 'neutral',
        lines: [
          { text: `${at}, and the first match decides.` },
          ...(clash ? [{ text: `${clash.match === 'unknown' ? 'Might apply' : 'Also applies'} to ${first}${clash.via.say ? ` ${clash.via.say}` : ''} · ${DECISION_WORDS[r.decision]}`, sub: [clash.fix, clash.caution].filter(Boolean).join('. '), tone: (clash.kind === 'conflict' ? 'notice' : 'neutral') as Tone }] : []),
        ],
        lit: [r.node],
        say: `Rule ${numWord(n)} wasn't read. ${at}.${clash ? ` It ${clash.match === 'unknown' ? 'might also apply' : 'also applies'} to ${first}${clash.via.say ? `, ${viaSpoken(clash.via)}` : ''}.` : ''}`,
      }
    }

    case 'others': {
      const { covers, also, missed, off, unasked } = othersOf(plan)
      if (!decider || also.length + missed.length + off.length + unasked.length === 0) {
        return { key: 'others', title: `Only one policy on ${plan.appName}`, tone: 'neutral', lines: [{ text: decider ? `${decider.name} is the only one asked.` : 'No policy decides.' }], lit: decider ? [`policy:${decider.id}`] : [], say: decider ? `${decider.name} is the only policy here.` : 'No policy decides.' }
      }
      const title = decider.isGlobalDefault
        ? `No ${plan.appName} policy covers ${first}`
        : also.length > 0
          ? `${also.length === 1 ? '1 other station' : `${also.length} other stations`} also GO for ${first} · not used`
          : missed.length > 0
            ? `${missed.length === 1 ? `Policy ${missed[0].order} doesn't` : `Policies ${list(missed.map((p) => String(p.order)))} don't`} cover ${first}`
            : `No other policy covers ${first}`
      const lines: AnswerLine[] = []
      for (const p of also) {
        const c = covers.get(p.policyId)
        const would = c && c.status === 'decided' && c.decision ? `on its own: ${DECISION_WORDS[c.decision]}${c.ruleNumber !== null ? `, rule ${c.ruleNumber}` : ''}` : c && c.possible.length > 0 ? `on its own: ${c.possible.map((d) => DECISION_WORDS[d]).join(' or ')}` : ''
        lines.push({ text: `${p.order}. ${p.name}`, sub: [`Also covers ${first}${c?.via.say ? ` ${c.via.say}` : ''} · not used`, would].filter(Boolean).join(' · '), tone: 'notice' })
      }
      for (const p of missed) lines.push({ text: `${p.order}. ${p.name}`, sub: /is not in (it|this policy)$/.test(p.reason) ? `Doesn't cover ${first}` : p.reason || "Doesn't cover them", tone: 'neutral' })
      for (const p of off) lines.push({ text: `${p.order}. ${p.name}`, sub: p.reason || 'Not on', tone: 'neutral' })
      if (unasked.length > 0) lines.push({ text: `Not asked: ${listed(unasked)}`, sub: decider.isGlobalDefault ? '' : `${decider.name} applies first`, tone: 'neutral' })
      const first1 = also[0] ? covers.get(also[0].policyId) : undefined
      const say = decider.isGlobalDefault
        ? `No ${plan.appName} policy covers ${first}, so the Global Default applies.`
        : first1
          ? `${first1.policyName} also covers ${first}${first1.via.say ? `, ${viaSpoken(first1.via)}` : ''}. ${first1.status === 'decided' && first1.decision ? `On its own it would ${SPOKEN[first1.decision]}. ` : ''}It isn't used: ${decider.name} comes first.`
          : missed.length > 0
            ? `${missed.length === 1 ? `Policy ${numWord(missed[0].order)} doesn't` : `Policies ${list(missed.map((p) => numWord(p.order)))} don't`} cover ${first}. ${decider.name} is the first that does.`
            : `No other policy covers ${first}. ${decider.name} applies.`
      return {
        key: 'others',
        title,
        tone: also.length > 0 && !decider.isGlobalDefault ? 'notice' : 'neutral',
        lines,
        lit: (also.length > 0 ? also : missed).map((p) => p.node),
        say,
      }
    }

    case 'see': {
      if (ctx.screens.length === 0) return { key: 'see', title: 'Nothing to show', tone: 'neutral', lines: [{ text: 'No decision to show a sign-in page for.' }], lit: [], say: 'There is no page to show for this sign-in.' }
      const lines: AnswerLine[] = []
      for (const sc of ctx.screens) {
        const head = ctx.screens.length > 1 ? `${DECISION_WORDS[sc.decision]}: ` : ''
        const deny = sc.steps.find((x) => x.kind === 'deny')
        if (deny && deny.kind === 'deny') lines.push({ text: `${head}Blocked`, sub: `“${deny.message}”`, tone: 'negative' })
        else lines.push({ text: `${head}${sc.steps.map(stepLabel).join(' → ')}`, tone: decisionTone(sc.decision) })
      }
      const d = o.status === 'decided' ? o.decision : null
      const f = factorsOf(ctx.screens, d)
      const say =
        d === 'deny'
          ? `${person} is blocked, with the message: ${denyMessageOf(ctx.screens)}`
          : f.length > 1
            ? `First the ${f[0].toLowerCase()}, then ${f.slice(1).join(', then ')}.`
            : f.length === 1
              ? `${person} is asked for the ${f[0].toLowerCase()}, and is in.`
              : `It depends: ${ctx.screens.length} different pages, one for each answer.`
      return { key: 'see', title: ctx.isGroup ? 'Crew view · what they see' : `Crew view · what ${first} sees`, tone: d ? decisionTone(d) : 'notice', lines, lit: ['outcome'], say, act: { kind: 'see' } }
    }

    case 'checks': {
      if (!landing || landing.index === null || landing.checks.length === 0) {
        const open = plan.rules.filter((r) => r.index !== null && r.visited && r.state === 'unknown')
        if (open.length === 0) return answerOf({ kind: 'verdict' }, ctx)
        const lines: AnswerLine[] = []
        for (const r of open.slice(0, 3)) {
          lines.push({ text: ruleTitle(r), tone: 'notice' })
          for (const c of r.checks.slice(0, Math.max(r.checked, 1))) lines.push(checkLine(c, r.via))
        }
        return {
          key: 'checks',
          title: open.length === 1 ? `Rule ${(open[0].index ?? 0) + 1} can't tell` : `${open.length} rules can't tell`,
          tone: 'notice',
          lines,
          lit: open.map((r) => r.node),
          say: lineVerdict(ctx),
        }
      }
      const lines: AnswerLine[] = []
      for (const c of landing.checks) {
        lines.push(checkLine(c, landing.via))
        for (const x of c.subs.filter((y) => y.label && c.subs.length > 1)) lines.push({ text: `   ${x.label} · ${x.actual || 'Not stated'}`, sub: x.required ? `needs ${lowerFirst(x.required)}` : '', mark: x.status })
      }
      const n = landing.checks.length
      return {
        key: 'checks',
        title: ruleTitle(landing),
        tone: decisionTone(landing.decision),
        lines,
        lit: [landing.node],
        say: `Rule ${numWord(landing.index + 1)} reads ${numWord(n)} ${n === 1 ? 'check' : 'checks'}. ${landing.state === 'match' ? `${n === 1 ? 'It passes' : n === 2 ? 'Both pass' : 'All pass'}, so it decides: ${SPOKEN[landing.decision]}.` : ''}`.trim(),
        act: { kind: 'checks' },
      }
    }

    case 'group': {
      const rows = ctx.groupRows
      if (!rows || ctx.groups.length < 2) {
        const g = ctx.groups.map((x) => x.name)
        return { key: 'group', title: ctx.isGroup ? `Tested as ${ctx.person.toLowerCase()}` : `${first} is in ${g.length === 1 ? 'one group' : 'no group'}`, tone: 'neutral', lines: [{ text: g.length > 0 ? g.join(', ') : 'No groups' }], lit: ['sign-in'], say: g.length === 1 ? `${first} is only in ${g[0]}.` : `There is no other group to run as.` }
      }
      if (intent.groupId && ctx.canGroup) {
        const row = rows.find((x) => x.groupId === intent.groupId)
        const g = ctx.groups.find((x) => x.id === intent.groupId)
        if (row && g) {
          return {
            key: `group:${g.id}`,
            title: `Running as ${g.name} only`,
            tone: row.status === 'decided' && row.decision ? decisionTone(row.decision) : 'notice',
            lines: [{ text: `${row.label} · ${row.words}`, sub: row.source }],
            lit: ['sign-in'],
            say: `Running as ${g.name} only.`,
            act: { kind: 'group', groupId: g.id },
          }
        }
      }
      return {
        key: 'group',
        title: 'As each group',
        tone: 'neutral',
        lines: rows.map((x) => ({ text: `${x.label} · ${x.words}`, sub: x.source, tone: x.status === 'decided' && x.decision ? decisionTone(x.decision) : 'notice' })),
        lit: ['sign-in'],
        say: rows.map((x) => `${x.label}: ${x.words}.`).join(' '),
      }
    }

    case 'set': {
      const f = ctx.facts.find((x) => x.field === intent.field || (intent.field === 'place' && x.field === 'address'))
      const what = intent.field === 'address' ? 'the network' : intent.field === 'place' ? 'the place' : intent.field === 'device' ? 'the device' : intent.field === 'risk' ? 'the risk score' : intent.field === 'when' ? 'the time' : 'the sign-in'
      return {
        key: `set:${intent.field}`,
        title: `Set ${what}`,
        tone: 'neutral',
        lines: [{ text: f ? `${f.label} · ${f.unset ? 'Not stated' : f.value}` : `${capital(what)} is not asked here`, sub: 'Opening the panel on it' }],
        lit: f ? [`fact:${f.field}`] : [],
        say: `Opening ${what} in the panel.`,
        act: { kind: 'set', field: intent.field },
      }
    }

    case 'open': {
      if (!o.policyId) return { key: 'open', title: 'Nothing to open', tone: 'neutral', lines: [{ text: 'No policy decides this sign-in.' }], lit: [], say: 'No policy decides this sign-in.' }
      const rule = landing && landing.index !== null && o.status === 'decided' ? landing : null
      return {
        key: 'open',
        title: rule ? `Opening rule ${(rule.index ?? 0) + 1}` : `Opening ${o.policyName ?? 'the policy'}`,
        tone: 'neutral',
        lines: [{ text: rule ? `${o.policyName} · ${rule.name}` : (o.policyName ?? '') }],
        lit: rule ? [rule.node] : [`policy:${o.policyId}`],
        say: rule ? `Opening rule ${numWord((rule.index ?? 0) + 1)} in the builder.` : 'Opening the policy in the builder.',
        act: { kind: 'open', policyId: o.policyId, ruleId: rule ? rule.id : null },
      }
    }

    case 'depends': {
      const dep = plan.conflicts?.depends
      if (o.status !== 'depends') {
        const v = answerOf({ kind: 'verdict' }, ctx)
        return { ...v, key: 'depends:none', title: `Nothing left to tell · ${v.title}`, say: `It doesn't depend on anything: every fact it needs is stated. ${v.say}` }
      }
      return {
        key: 'depends',
        title: dep?.say ?? 'Depends on a fact not stated',
        tone: 'notice',
        lines: o.view.outcomes.map((x) => ({ text: `${x.label} · ${DECISION_WORDS[x.decision]}`, tone: decisionTone(x.decision) })).concat(dep?.fix ? [{ text: dep.fix, tone: 'neutral' as Tone }] : []),
        lit: plan.rules.filter((r) => r.state === 'unknown').map((r) => r.node),
        say: `${lineVerdict(ctx)} ${dep?.fix ? `${dep.fix}.` : ''}`.trim(),
      }
    }

    case 'verdict': {
      const d = o.status === 'decided' ? o.decision : null
      const f = factorsOf(ctx.screens, d)
      return {
        key: 'verdict',
        title: d ? DECISION_WORDS[d] : o.status === 'depends' ? (o.view.needs.length > 0 ? `Depends on the ${list(o.view.needs.map((n) => n.toLowerCase()))}` : 'Depends') : 'No policy decides',
        tone: toneOf(plan),
        lines: [
          ...(o.policyName ? [{ text: d ? `Decided by ${o.policyName}${landing && landing.index !== null ? ` · Rule ${landing.index + 1}` : ' · Nothing else matched'}` : `Policy · ${o.policyName}` }] : []),
          ...(d === 'deny' ? [{ text: `“${denyMessageOf(ctx.screens)}”`, tone: 'negative' as Tone }] : f.length > 0 ? [{ text: f.join(' → ') }] : []),
          ...(o.status === 'depends' ? o.view.outcomes.map((x) => ({ text: `${x.label} · ${DECISION_WORDS[x.decision]}`, tone: decisionTone(x.decision) })) : []),
        ],
        lit: ['outcome'],
        say: lineVerdict(ctx),
      }
    }

    case 'policy': {
      if (!decider) return { key: 'policy', title: 'No policy decides', tone: 'neutral', lines: [], lit: [], say: 'No policy decides this sign-in.' }
      const via = deciderVia(plan)
      const why = decider.isGlobalDefault ? `No policy above it covers ${first}` : `The first policy on ${plan.appName} that covers ${first}${via ? ` · ${via.say}` : ''}`
      return {
        key: 'policy',
        title: `${decider.name} applies`,
        tone: toneOf(plan),
        lines: [
          { text: why },
          ...(o.status === 'depends'
            ? [{ text: `Can't tell: ${list(plan.rules.filter((r) => r.index !== null && r.visited && r.state === 'unknown').map((r) => `rule ${(r.index ?? 0) + 1}`))}`, sub: o.view.needs.length > 0 ? `the ${list(o.view.needs.map((n) => n.toLowerCase()))} is not stated` : '', tone: 'notice' as Tone }]
            : landing
              ? [{ text: landing.index === null ? 'Nothing else matched' : `Rule ${landing.index + 1} · ${landing.name}`, sub: landing.index === null ? 'no rule above it matches' : 'the first rule that matches decides' }]
              : []),
        ],
        lit: [`policy:${decider.id}`],
        say: `${lineLock(ctx) ?? ''} ${lineRules(ctx) ?? ''}`.trim(),
      }
    }

    default:
      return {
        key: 'unknown',
        title: "I can't answer that one",
        tone: 'neutral',
        lines: [{ text: "I can explain this sign-in's policies, rules and outcome — try one of these." }],
        lit: [],
        say: "I can explain this sign-in's policies, rules and outcome. Try one of these.",
      }
  }
}
