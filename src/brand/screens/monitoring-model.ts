import { FALLBACK_NAME, type AccessDecision, type Policy } from '../data'
import { WOULD_WORDS, strictestFirst } from '../decision-words'
import type { MonitorChange, MonitorRow, MonitorSample } from './monitor-sample'
import type { SimEnv } from './simulate'
import { LAST_ROW, evidenceOf, type CardState, type EvidenceLine, type RuleWord } from './testing/evidence'
import type { TenantResolution } from './tenant-resolver'

/* -----------------------------------------------------------------------------
   The Monitoring page's rows, in words (spec C §3.4, final C.5).

   monitor-sample.ts models the sign-ins and says what moved; this says it the
   way the page's table does, one cell at a time, so a test can read the table
   without drawing it:

     Today         the decision as it stands, and the policy that decides it —
                   or "No policy decides" when the tenant has no Global Default
     If turned on  "Would deny" and the rule that would decide; "No change" and
                   why nothing moves; or grey Can't tell and what it could be
     Show why      the rules the policy would read, once on, in the evidence
                   vocabulary every testing surface prints (testing/evidence.ts)

   The rows run the looser moves first — to 1 factor, then 2FA, then deny —
   then the ones that can't be told, then the unchanged, newest first within
   each, so the row an admin must look at before turning it on is the top one.
   -------------------------------------------------------------------------- */

/** Bucket order: the looser move first, as the plan line reads. */
export const CHANGE_ORDER: Record<MonitorChange, number> = { 'to-1fa': 0, 'to-2fa': 1, 'to-deny': 2, 'cant-tell': 3, unchanged: 4 }

/* "2026-09-27 09:30": a sample's moment, which sorts as text. */
const momentOf = (s: MonitorSample) => `${s.facts.when?.date ?? ''} ${s.time}`

/** The rows as the table lists them: by bucket, then newest first, then as modelled. */
export function orderRows(rows: readonly MonitorRow[]): MonitorRow[] {
  return rows
    .map((row, i) => ({ row, i }))
    .sort(
      (a, b) =>
        CHANGE_ORDER[a.row.change] - CHANGE_ORDER[b.row.change] || momentOf(b.row.sample).localeCompare(momentOf(a.row.sample)) || a.i - b.i,
    )
    .map((x) => x.row)
}

/* The decisions a resolution could still reach, strictest first. */
const reachOf = (r: TenantResolution): AccessDecision[] => strictestFirst(r.possible.map((o) => o.decision))

/** The rule that decides a resolution, by name: the last row's is "Nothing else matched". Null while it can't be told. */
export function decidingRuleName(r: TenantResolution): string | null {
  if (r.status !== 'decided' || !r.trace) return null
  const hit = r.trace.hitIndex
  return hit === null ? FALLBACK_NAME : (r.trace.steps[hit]?.ruleName ?? null)
}

// --- Today -------------------------------------------------------------------------

export type TodayCell =
  | { kind: 'decided'; decision: AccessDecision; by: string }
  | { kind: 'depends'; reach: AccessDecision[]; by: string }
  /* No Global Default, so nothing decides it: grey "No policy decides". */
  | { kind: 'none' }

export function todayCell(today: TenantResolution): TodayCell {
  if (today.status === 'incomplete' || !today.decidedBy) return { kind: 'none' }
  const by = today.decidedBy.policyName
  if (today.status === 'decided' && today.decision) return { kind: 'decided', decision: today.decision, by }
  return { kind: 'depends', reach: reachOf(today), by }
}

// --- If turned on ----------------------------------------------------------------------

export type IfOnCell =
  /* An info badge — never the decision's own tone, because the policy decides
     nothing yet — over the rule that would decide it. */
  | { kind: 'would'; decision: AccessDecision; word: string; sub: string }
  /* Muted "No change", over why nothing moves. */
  | { kind: 'no-change'; sub: string }
  /* Grey "Can't tell": whether it moves can't be told. `reach` is what it could
     be once on, said as Today says its own ("Deny or Allow with 2FA"); when
     that is settled and it is today that can't be told, `reach` is empty and
     `sub` is what it would get, as text ("Would deny"). */
  | { kind: 'cant-tell'; reach: AccessDecision[]; sub: string }

export function ifOnCell(row: MonitorRow, policy: Pick<Policy, 'id'>): IfOnCell {
  const on = row.ifOn
  const mine = on.decidedBy?.policyId === policy.id
  const decided = on.status === 'decided' && on.decision !== null
  /* Under the badge: the rule of this policy that would decide, or — should
     something else still decide once it is on — that policy. */
  const sub = mine ? (decidingRuleName(on) ?? '') : (on.decidedBy?.policyName ?? '')

  if (row.change === 'unchanged') {
    if (row.standing?.kind === 'not-in-audience') return { kind: 'no-change', sub: 'Not in audience' }
    if (!mine && on.decidedBy) return { kind: 'no-change', sub: `When on: ${on.decidedBy.policyName} applies first` }
    /* It would decide, and decide what the tenant decides today: said as text, not a badge. */
    if (decided) return { kind: 'no-change', sub: WOULD_WORDS[on.decision!] }
    return { kind: 'no-change', sub: row.standing?.reason ?? '' }
  }
  /* A move: what it would get. Only a move is a badge, so the page shows as
     many as the plan line counts. */
  if (row.change !== 'cant-tell' && decided) return { kind: 'would', decision: on.decision!, word: WOULD_WORDS[on.decision!], sub }
  /* Whether it moves can't be told, and the plan line counts it so: grey, with
     what turned on could be — or, when that is settled and today is not, what
     it would get, as text rather than a badge. */
  return decided ? { kind: 'cant-tell', reach: [], sub: WOULD_WORDS[on.decision!] } : { kind: 'cant-tell', reach: reachOf(on), sub: '' }
}

// --- From -----------------------------------------------------------------------------

/** "Pune, India" over the address; an address the sample table names no place for says so. */
export function fromCell(sample: Pick<MonitorSample, 'place' | 'address'>): { place: string; address: string } {
  return { place: sample.place ?? 'Place not found', address: sample.address }
}

/** "Show why: Kavya Menon, Sun 09:30" — the disclosure's name, which says whose row it opens. */
export function showWhyLabel(sample: Pick<MonitorSample, 'personName' | 'day' | 'time'>): string {
  return `Show why: ${sample.personName}, ${sample.day} ${sample.time}`
}

// --- Why ----------------------------------------------------------------------------------

export interface WhyRule {
  key: string
  /** 1-based, as the board numbers its cards; '' for the last row. */
  number: string
  name: string
  word: RuleWord
  state: CardState
  lines: EvidenceLine[]
}

export type Why =
  /* Turned on, it still would not decide this sign-in: one line, its standing — "Not in audience: Human Resources, Finance". */
  | { kind: 'standing'; line: string }
  /* It would decide: the rule that does (null when it can't be told), and every rule it reads on the way. */
  | { kind: 'rules'; decidedBy: string | null; rules: WhyRule[] }

/* What the policy, turned on, would read of one sign-in: its rules in order up
   to the one that decides, each with its word and its lines, and the last row
   when the walk reaches it. A rule past the one that decides was never read and
   is left out. The lines are straight from the trace (evidence.ts) — nothing
   here rewords them. */
export function whyOf(row: MonitorRow, policy: Pick<Policy, 'id' | 'rules'>, env: SimEnv): Why {
  const on = row.ifOn
  if (on.decidedBy?.policyId !== policy.id || !on.trace) {
    return { kind: 'standing', line: row.standing?.reason ?? (on.status === 'incomplete' ? 'No policy decides' : '') }
  }
  const trace = on.trace
  const ev = evidenceOf(policy, trace, row.sample.facts, env)
  const upTo = on.status === 'decided' && trace.hitIndex !== null ? trace.hitIndex : Infinity
  const rules: WhyRule[] = []
  policy.rules.forEach((r, i) => {
    const e = ev[r.id]
    if (i <= upTo && e.state !== 'not-reached') rules.push({ key: r.id, number: String(i + 1), name: r.name, ...e })
  })
  const last = ev[LAST_ROW]
  if (last.state !== 'not-reached') rules.push({ key: LAST_ROW, number: '', name: FALLBACK_NAME, ...last })
  return { kind: 'rules', decidedBy: decidingRuleName(on), rules }
}
