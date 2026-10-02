import type { LineStatus } from '../../testing/evidence'
import { traceResult } from '../journey'
import type { EnginePolicy, EngineRule, EngineRun } from '../engine-run'

/* -----------------------------------------------------------------------------
   Focus (FocusLayout.tsx): the run as MOMENTS, one in focus at a time.

     sign-in · policies · rule 1 · rule 2 … · outcome

   A moment is reached at a step of the plan; the one in focus at step `s` is
   the last reached. The outcome is always there at the end, waiting, as the
   place the run is going. Rules come in only as the engine reaches them —
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
