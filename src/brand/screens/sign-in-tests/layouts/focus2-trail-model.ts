import type { EngineRun } from '../engine-run'
import { ruleState, toneOf, type Tone } from './focus-model'
import type { BeatSpan } from './focus2-pace'

/* -----------------------------------------------------------------------------
   THE DECISION TRAIL (focus2-trail.tsx): the run said as one row of steps,

     Maya Iyer › AWS for engineering teams › Rule 1 ✕ Device › Rule 2 ✓ › Allow

   Pure, so every showcase run can be swept without rendering anything. A step
   is one thing the admin may want to go back to: the person, the policy that
   covers, each rule read, the answer. It is built from the story's beats and
   goes back to them (`beat` is what the view's `goTo` takes), so it can never
   say something the cards do not.

   Two beats are not steps of their own, because they only go deeper into a card
   already open (focus2-story.ts): the covering policy is the policy list a beat
   later, and the Then is the deciding rule's own row lighting. The policy step
   therefore reads "Policies" until the covering policy is reached and names it
   after; the Then is the rule's step, drawn current while it is on screen.

   `p ≤ s` holds because every mark here reads the PRESENTED step: a rule shows
   its result only once the story has read it, and the answer's word only once
   the run has landed. Before that a step is its short name, faint.
   -------------------------------------------------------------------------- */

export type TrailKind = 'sign' | 'policy' | 'rule' | 'outcome'
export type TrailMark = 'pass' | 'fail' | 'unknown' | 'off'

export interface TrailStep {
  key: string
  kind: TrailKind
  /** The beat a press goes to (the view's `goTo`). */
  beat: number
  /** The step's words: a name, "Rule 2", "Allow". */
  label: string
  /** What a failed rule missed on, or null. */
  detail: string | null
  /** A rule's result, once the story has read it. */
  mark: TrailMark | null
  /** The answer's tone, once it has landed. */
  tone: Tone | null
  /** A press can go here: the story has reached it (and every step once it has landed). */
  reachable: boolean
  /** It is what is on screen. */
  current: boolean
  /** "Rule 1, missed on Device, step 3 of 5" */
  say: string
}

export interface TrailInput {
  /** The person, or "Anyone in Finance". */
  person: string
  /** The beat on screen. */
  at: number
  /** The furthest beat reached. */
  reached: number
  /** The presented step. */
  p: number
  landed: boolean
}

const MARK_WORD: Record<TrailMark, string> = { pass: 'matched', fail: 'did not match', unknown: "can't tell", off: 'switched off' }

function outcomeWord(plan: Pick<EngineRun, 'outcome'>): string {
  const o = plan.outcome
  if (o.status === 'decided' && o.decision) return o.decision === 'deny' ? 'Deny' : o.decision === '2fa' ? 'Allow with 2FA' : 'Allow'
  return o.status === 'depends' ? 'Depends' : 'No policy'
}

export function trailOf(beats: readonly BeatSpan[], plan: EngineRun, o: TrailInput): TrailStep[] {
  const reach = (i: number) => o.landed || i <= o.reached
  const sign = beats.findIndex((b) => b.beat.kind === 'sign')
  const policies = beats.findIndex((b) => b.beat.kind === 'policies')
  const covers = beats.findIndex((b) => b.beat.kind === 'covers')
  const on = beats[o.at]?.beat
  const out: Omit<TrailStep, 'say'>[] = []

  if (sign >= 0) out.push({ key: 'sign', kind: 'sign', beat: sign, label: o.person, detail: null, mark: null, tone: null, reachable: reach(sign), current: on?.kind === 'sign' })

  /* One policy step for the two beats that share a card: the list, then the one that covers. */
  const policyBeat = covers >= 0 && reach(covers) ? covers : policies >= 0 ? policies : covers
  if (policyBeat >= 0) {
    const named = covers >= 0 && reach(covers) && plan.decider
    out.push({ key: 'policy', kind: 'policy', beat: policyBeat, label: named ? plan.decider!.name : 'Policies', detail: null, mark: null, tone: null, reachable: reach(policyBeat), current: on?.kind === 'policies' || on?.kind === 'covers' })
  }

  beats.forEach((b, i) => {
    if (b.beat.kind !== 'rule') return
    const r = b.beat.rule === undefined ? undefined : plan.rules[b.beat.rule]
    const read = reach(i) && !!r && o.p >= b.beat.to
    const state = r && read ? ruleState(r, o.p) : null
    const mark: TrailMark | null = state === 'pass' || state === 'fail' || state === 'unknown' || state === 'off' ? state : null
    const miss = mark === 'fail' && r && r.failing !== null ? (r.checks[r.failing]?.word ?? null) : null
    /* The Then is this rule's own beat going deeper, so while it is on screen the rule's step is the current one. */
    const thenOn = on?.kind === 'then' && on.rule === b.beat.rule
    out.push({ key: b.beat.key, kind: 'rule', beat: i, label: b.beat.short, detail: miss, mark, tone: null, reachable: reach(i), current: o.at === i || thenOn })
  })

  const outcome = beats.findIndex((b) => b.beat.kind === 'outcome')
  if (outcome >= 0) out.push({ key: 'outcome', kind: 'outcome', beat: outcome, label: o.landed ? outcomeWord(plan) : 'Outcome', detail: null, mark: null, tone: o.landed ? toneOf(plan) : null, reachable: reach(outcome), current: on?.kind === 'outcome' })

  return out.map((s, i) => ({ ...s, say: `${s.label}${s.mark ? ` ${MARK_WORD[s.mark]}` : ''}${s.detail ? `, missed on ${s.detail}` : ''}, step ${i + 1} of ${out.length}${s.reachable ? '' : ', not reached yet'}` }))
}

/** A run of steps given up for room: drawn as one "…" the admin can still reach through the buttons either side. */
export type TrailItem = { gap: false; step: TrailStep } | { gap: true; key: string; count: number }

/**
 * At most `max` steps, the person and the answer always, and the rest chosen nearest the step on screen; what is left
 * out is one "…" per run. `max` is what the bar's width can hold, worked out by the component.
 */
export function elideTrail(steps: readonly TrailStep[], max: number): TrailItem[] {
  const keep = new Set<number>()
  const last = steps.length - 1
  if (steps.length <= max) steps.forEach((_, i) => keep.add(i))
  else {
    keep.add(0)
    keep.add(last)
    const at = Math.max(0, steps.findIndex((s) => s.current))
    for (let d = 0; keep.size < Math.max(3, max) && d <= last; d++) {
      for (const i of [at - d, at + d]) if (i >= 0 && i <= last && keep.size < Math.max(3, max)) keep.add(i)
    }
  }
  const out: TrailItem[] = []
  let gap = 0
  steps.forEach((s, i) => {
    if (keep.has(i)) {
      if (gap > 0) out.push({ gap: true, key: `gap:${i}`, count: gap })
      gap = 0
      out.push({ gap: false, step: s })
    } else gap += 1
  })
  return out
}
