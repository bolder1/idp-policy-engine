import type { EngineRule, EngineRun } from '../engine-run'
import { traceResult } from '../journey'

/* -----------------------------------------------------------------------------
   The Explainer (ExplainerLayout.tsx): the run told as a scrolling story.
   Its MOMENTS, in the engine's order, each one paragraph of the story and
   one state of the pinned visual beside it:

     sign · policies · applies · rule 1 · rule 2 … · outcome · (groups)

   A moment is reached at a step of the plan; the one the clock is at is the
   last reached. Rules come in only as the engine reaches them. Each moment
   also ENDS at a step — the one before the next begins — and a moment
   pressed once the run has landed is drawn as it stood there. Pure.
   -------------------------------------------------------------------------- */

export type MomentKind = 'sign' | 'policies' | 'applies' | 'rule' | 'outcome' | 'groups'

export interface Moment {
  key: string
  kind: MomentKind
  /** The step it is reached at. */
  at: number
  /** Index into `plan.rules`, for a rule. */
  rule?: number
}

export const lastStep = (plan: EngineRun): number => Math.max(0, plan.steps.length - 1)

/** The run has landed at step `s`. */
export const landedAt = (plan: EngineRun, s: number): boolean => s >= lastStep(plan) || (plan.at.outcome >= 0 && s >= plan.at.outcome)

/** Every moment of the run, in order; the person's groups alone after the outcome, when they differ. */
export function momentsOf(plan: EngineRun, groups: boolean): Moment[] {
  const last = lastStep(plan)
  const list: Moment[] = [{ key: 'sign', kind: 'sign', at: 0 }]
  if (plan.empty) {
    list.push({ key: 'outcome', kind: 'outcome', at: last })
    return list
  }
  if (plan.policies.length > 0) {
    const firstScan = plan.policies.find((p) => p.scanAt !== null)?.scanAt
    list.push({ key: 'policies', kind: 'policies', at: Math.max(1, firstScan ?? Math.max(0, plan.at.which)) })
  }
  const d = plan.policies.find((p) => p.decides)
  if (d) {
    const at = d.foundAt ?? d.settleAt
    list.push({ key: 'applies', kind: 'applies', at: Math.max(list[list.length - 1].at + 1, at) })
  }
  plan.rules.forEach((r, i) => {
    if ((r.visited || r.state === 'off') && r.startAt >= 0) list.push({ key: r.node, kind: 'rule', rule: i, at: r.startAt })
  })
  const deciding = plan.steps.findIndex((st) => st.kind === 'deciding')
  /* A conflict's held beat is said over the rule that decided: the answer comes after it. */
  const notice = deciding >= 0 && plan.steps[deciding]?.notice
  const outAt = notice || deciding < 0 ? plan.at.outcome : deciding
  list.push({ key: 'outcome', kind: 'outcome', at: outAt >= 0 ? outAt : last })
  if (groups) list.push({ key: 'groups', kind: 'groups', at: last })
  /* Never out of order, whatever the plan. */
  for (let i = 1; i < list.length; i++) if (list[i].at < list[i - 1].at) list[i] = { ...list[i], at: list[i - 1].at }
  return list
}

/** The moment the clock is at: the last one reached (the groups are only ever pressed). */
export function momentAt(moments: readonly Moment[], s: number, landed: boolean): number {
  const out = moments.findIndex((m) => m.kind === 'outcome')
  if (landed) return out >= 0 ? out : moments.length - 1
  let at = 0
  moments.forEach((m, i) => {
    if (m.kind !== 'groups' && s >= m.at) at = i
  })
  return at
}

/** The step a moment ends at: the one before the next begins; the outcome and after, the last. */
export function endOf(plan: EngineRun, moments: readonly Moment[], i: number): number {
  const m = moments[i]
  const next = moments[i + 1]
  if (!m || m.kind === 'outcome' || m.kind === 'groups' || !next || next.kind === 'groups') return lastStep(plan)
  return Math.max(m.at, next.at - 1)
}

export type Tone = 'positive' | 'negative' | 'notice' | 'neutral'

/* The landed answer's one colour: green for an allow on any number of
   factors, red for a deny, amber only while it can't be told. */
export function toneOf(plan: Pick<EngineRun, 'outcome'>): Tone {
  const o = plan.outcome
  if (o.status === 'decided' && o.decision) return o.decision === 'deny' ? 'negative' : 'positive'
  return o.status === 'depends' ? 'notice' : 'neutral'
}

/** A moment's mark on the rail at step `s`. */
export type MarkState = 'waiting' | 'working' | 'pass' | 'fail' | 'unknown' | 'off' | 'quiet' | Tone

export function ruleMark(r: EngineRule, s: number): MarkState {
  switch (traceResult(r, s)) {
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

export function markOf(plan: EngineRun, m: Moment, s: number, landed: boolean): MarkState {
  const d = plan.policies.find((p) => p.decides)
  switch (m.kind) {
    case 'sign':
    case 'groups':
      return 'quiet'
    case 'policies':
      if (landed || (d && s >= (d.foundAt ?? d.settleAt))) return d ? 'pass' : 'quiet'
      return s >= m.at ? 'working' : 'waiting'
    case 'applies':
      if (!d) return 'quiet'
      return landed || s >= d.settleAt ? 'pass' : s >= m.at ? 'working' : 'waiting'
    case 'rule': {
      const r = plan.rules[m.rule ?? -1]
      return r ? (landed ? ruleMark(r, lastStep(plan)) : ruleMark(r, s)) : 'quiet'
    }
    case 'outcome':
      if (landed) return toneOf(plan)
      return s >= m.at ? 'working' : 'waiting'
  }
}

export const firstName = (name: string): string => name.trim().split(/\s+/)[0] || name

/** The label over a paragraph, and the chip on the rail. */
export function momentLabel(plan: EngineRun, m: Moment): string {
  switch (m.kind) {
    case 'sign':
      return 'Sign-in'
    case 'policies':
      return 'Policies'
    case 'applies':
      return plan.decider?.isGlobalDefault ? 'The fallback' : 'The policy'
    case 'rule': {
      const r = plan.rules[m.rule ?? -1]
      return !r || r.index === null ? 'The last rule' : `Rule ${r.index + 1}`
    }
    case 'outcome':
      return 'Outcome'
    case 'groups':
      return 'Each group alone'
  }
}
