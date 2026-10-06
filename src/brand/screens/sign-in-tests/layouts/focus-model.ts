import type { LineStatus } from '../../testing/evidence'
import { traceResult } from '../journey'
import type { EnginePolicy, EngineRule, EngineRun } from '../engine-run'

/* -----------------------------------------------------------------------------
   Focus (FocusLayout.tsx): the run as MOMENTS, one in focus at a time.

     sign-in · policies · rule 1 · rule 2 … · outcome

   A moment is reached at a step of the plan; the one in focus at step `s` is
   the last reached. Every card, the outcome too, comes in only as the engine
   reaches it (owner, 3 Oct 2026: progressive, never waiting ahead). Rules come in only as the engine reaches them —
   the engine does not know how far it will read, so neither does the ribbon.
   Pure: everything here is drawn from the plan and `s`.
   -------------------------------------------------------------------------- */

export type MomentKind = 'sign' | 'policies' | 'rule' | 'outcome'

export interface Moment {
  key: string
  kind: MomentKind
  /** The step it is reached at. */
  at: number
  /** Index into `plan.rules`, for a rule. */
  rule?: number
}

/** Every moment of the run, in order: the outcome last. */
export function momentsOf(plan: EngineRun): Moment[] {
  const list: Moment[] = [{ key: 'sign', kind: 'sign', at: 0 }]
  if (plan.policies.length > 0) {
    /* The stack is shown from the find step; it takes the focus as the first policy is asked. */
    const firstScan = plan.policies.find((p) => p.scanAt !== null)?.scanAt
    const at = firstScan ?? Math.max(0, plan.at.which)
    list.push({ key: 'policies', kind: 'policies', at: Math.max(1, at) })
  }
  plan.rules.forEach((r, i) => {
    if ((r.visited || r.state === 'off') && r.startAt >= 0) list.push({ key: r.node, kind: 'rule', rule: i, at: r.startAt })
  })
  const deciding = plan.steps.findIndex((st) => st.kind === 'deciding')
  /* A conflict's held beat is said over the rule that decided: the answer comes after it. */
  const notice = deciding >= 0 && plan.steps[deciding]?.notice
  const outAt = notice || deciding < 0 ? plan.at.outcome : deciding
  list.push({ key: 'outcome', kind: 'outcome', at: outAt >= 0 ? outAt : Math.max(0, plan.steps.length - 1) })
  return list
}

/** The run has landed at step `s`. */
export const landedAt = (plan: EngineRun, s: number): boolean => s >= plan.steps.length - 1 || (plan.at.outcome >= 0 && s >= plan.at.outcome)

/** The moment the clock is at: the last one reached. */
export function momentAt(moments: readonly Moment[], s: number, landed: boolean): number {
  if (landed) return moments.length - 1
  let at = 0
  moments.forEach((m, i) => {
    if (s >= m.at) at = i
  })
  return at
}

export type Tone = 'positive' | 'negative' | 'notice' | 'neutral'

/* The landed answer's one colour: green for an allow on any number of
   factors, red for a deny, amber only while it can't be told. */
export function toneOf(plan: Pick<EngineRun, 'outcome'>): Tone {
  const o = plan.outcome
  if (o.status === 'decided' && o.decision) return o.decision === 'deny' ? 'negative' : 'positive'
  return o.status === 'depends' ? 'notice' : 'neutral'
}

/** What a moment's chip and receded card say of it at step `s`. */
export type MomentState = 'waiting' | 'working' | 'pass' | 'fail' | 'unknown' | 'off' | 'quiet' | Tone

export function ruleState(r: EngineRule, s: number): MomentState {
  const t = traceResult(r, s)
  switch (t) {
    case 'waiting':
      return 'waiting'
    case 'reading':
      return 'working'
    case 'matched':
      return 'pass'
    case 'missed':
    case 'folded':
      return 'fail'
    case 'unknown':
    case 'possible':
      return 'unknown'
    case 'off':
      return 'off'
    default:
      return 'quiet'
  }
}

export function policiesState(plan: EngineRun, s: number): MomentState {
  const d = plan.policies.find((p) => p.decides)
  if (d && s >= d.settleAt) return 'pass'
  if (landedAt(plan, s)) return d ? 'pass' : 'quiet'
  return 'working'
}

export const firstName = (name: string): string => name.trim().split(/\s+/)[0] || name

/* "Ravi Menon is not in it" said in a few words: "Doesn't cover Ravi". */
export function reasonWords(reason: string, first: string): string {
  if (/ is not in (it|this policy)$/.test(reason)) return `Doesn't cover ${first}`
  return reason
}

/* The rule's requirement, after "needs": "below 40", "not in Corporate
   offices"; a zone's, a profile's or a group's name keeps its capital. */
export const lowerFirst = (t: string): string => (/^(Not|Below|Above|Between|Before|After) /.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t)

/** What a rule passed over comes to: its mark and the check that ended it. */
export function foldLine(r: EngineRule): { status: LineStatus | 'off'; text: string } {
  if (r.state === 'off') return { status: 'off', text: 'Switched off' }
  if (r.state === 'unknown' || r.state === 'possible') {
    const c = r.checks.find((x) => x.status === 'unknown')
    return { status: 'unknown', text: c ? `${c.word} · not stated` : "Can't tell" }
  }
  if (r.miss) return { status: 'fail', text: r.miss }
  const c = r.failing !== null ? r.checks[r.failing] : undefined
  return { status: 'fail', text: c ? c.say : 'No match' }
}

/** A policy's place in the stack at step `s`, for its row. */
export type PolicyRow = 'skeleton' | 'asking' | 'found' | 'applies' | 'passed' | 'also' | 'not-read'

export function policyRow(p: EnginePolicy, s: number, deciderIndex: number, i: number, also: boolean, landed: boolean): PolicyRow {
  if (p.foundAt !== null && s >= p.foundAt && s < p.settleAt) return 'found'
  if (p.decides && s >= p.settleAt) return 'applies'
  if (p.scanAt !== null && s >= p.scanAt && s < p.settleAt) return 'asking'
  if (s >= p.settleAt && (deciderIndex < 0 || i < deciderIndex)) return 'passed'
  if (deciderIndex >= 0 && i > deciderIndex && s >= p.settleAt) return also && landed ? 'also' : 'not-read'
  return 'skeleton'
}

/* How tall the run's tallest card will stand once it lands, from the plan
   alone — so the cards hang from one top line and the ribbon sits under them
   from the first frame, never moving as cards grow. Generous by a little. */
export function tallestOf(plan: EngineRun, moments: readonly Moment[], facts: number, wide: boolean): number {
  let h = 0
  for (const m of moments) {
    if (m.kind === 'sign') h = Math.max(h, 170 + facts * 37)
    else if (m.kind === 'policies') h = Math.max(h, 118 + Math.min(plan.policies.length, 8) * 46)
    else if (m.kind === 'rule') {
      const r = plan.rules[m.rule ?? -1]
      const clashes = r && plan.landing !== null && plan.rules[plan.landing]?.id === r.id ? (plan.conflicts?.rules.length ?? 0) : 0
      h = Math.max(h, 132 + (r?.checks.length ?? 0) * 62 + 56 + clashes * 44)
    } else {
      const o = plan.outcome
      const ifs = o.status === 'depends' ? o.view.outcomes.length * 32 + 30 : 0
      h = Math.max(h, (wide ? 380 : 300) + ifs)
    }
  }
  return h
}

/** What makes a moment's card look different at step `s`: a card re-renders only when this changes
    (FocusLayout.tsx memoises each card on it, so a step of the clock touches only the card it changes). */
export function stateKeyOf(m: Moment, plan: EngineRun, s: number, landed: boolean): string {
  if (m.kind === 'sign') return landed ? 'landed' : 'playing'
  if (m.kind === 'policies') {
    const di = plan.policies.findIndex((p) => p.decides)
    return `${policiesState(plan, s)}|${landed ? 1 : 0}|${plan.policies.map((p, i) => policyRow(p, s, di, i, false, landed)).join(',')}|${plan.policies.some((p) => p.scanAt !== null && s >= p.scanAt && s < p.settleAt) ? s : ''}`
  }
  if (m.kind === 'rule') {
    const r = plan.rules[m.rule ?? -1]
    if (!r) return ''
    const read = r.checks
      .slice(0, r.checked)
      .map((_, k) => {
        const at = r.checkAt[k]
        if (at === undefined || s < at) return 'h'
        return s < (r.markAt[k] ?? at + 1) ? 'w' : 's'
      })
      .join('')
    const deciding = plan.steps.findIndex((st) => st.kind === 'deciding')
    return `${traceResult(r, s)}|${read}|${landed ? 1 : 0}|${deciding >= 0 && s >= deciding ? 1 : 0}|${plan.steps[s]?.kind === 'deciding' ? 1 : 0}`
  }
  return `${landed ? 1 : 0}|${plan.steps[s]?.kind === 'deciding' ? 1 : 0}`
}

/** On a Deny that fell to the last rule: the rule read that came closest — the fewest failing checks, the earliest on a
    tie — and what it missed on ("missed only on Device", "missed on 2 checks"). Null for any other answer. */
export function closestMiss(plan: Pick<EngineRun, 'rules' | 'landing' | 'outcome'>): { rule: EngineRule; says: string; line: string } | null {
  const o = plan.outcome
  if (!(o.status === 'decided' && o.decision === 'deny')) return null
  const landing = plan.landing !== null ? plan.rules[plan.landing] : undefined
  if (!landing || landing.index !== null) return null
  let best: { rule: EngineRule; fails: number } | null = null
  for (const r of plan.rules) {
    if (r.index === null || !r.visited || r.state !== 'no-match') continue
    const fails = Math.max(1, r.checks.filter((c) => c.status === 'fail').length)
    if (!best || fails < best.fails) best = { rule: r, fails }
  }
  if (!best) return null
  const r = best.rule
  const only = r.checks.filter((c) => c.status === 'fail')
  const word = only.length === 1 ? only[0].word : r.failing !== null && best.fails === 1 ? (r.checks[r.failing]?.word ?? '') : ''
  const says = best.fails === 1 && word ? `Closest: Rule ${(r.index ?? 0) + 1}, missed only on ${word}` : `Closest: Rule ${(r.index ?? 0) + 1}, missed on ${best.fails} checks`
  return { rule: r, says, line: foldLine(r).text }
}

/* The moment an assistant's target (assistant/intents.ts `Target`) is about:
   its key in `momentsOf`, or null when no card shows it (a rule the engine
   never read). */
export function momentKeyOf(target: string, moments: readonly Moment[], plan: Pick<EngineRun, 'rules'>): string | null {
  if (target === 'person') return moments.find((m) => m.kind === 'sign')?.key ?? null
  if (target === 'outcome' || target === 'screens') return moments.find((m) => m.kind === 'outcome')?.key ?? null
  if (target.startsWith('policy:')) return moments.find((m) => m.kind === 'policies')?.key ?? null
  const id = target.startsWith('rule:') ? target.slice(5) : target.startsWith('check:') ? target.slice(6, target.lastIndexOf(':')) : null
  if (id === null) return null
  return moments.find((m) => m.kind === 'rule' && plan.rules[m.rule ?? -1]?.id === id)?.key ?? null
}
