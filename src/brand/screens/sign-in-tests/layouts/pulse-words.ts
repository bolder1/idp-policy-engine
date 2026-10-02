import { DECISION_WORDS } from '../../../decision-words'
import type { Via } from '../conflicts'
import type { CheckRow, EngineRule, EngineRun } from '../engine-run'

/* -----------------------------------------------------------------------------
   Pulse's words (PulseLayout.tsx): a check said short, for the card pinned to
   its beat — "Who via Engineering", "Device meets Compliant devices",
   "Network is not in Corporate offices". The person's fact and the rule's
   requirement are never run together into one claim ("Maya Iyer in
   Engineering, DevOps" is the requirement put into the fact): the short line
   says what was found, the card's detail says the fact and the need apart.
   -------------------------------------------------------------------------- */

export type Tone = 'positive' | 'negative' | 'notice' | 'neutral'

/** The landed path's one colour: green for any allow, red for a deny, amber while it can't be told. */
export function toneOf(plan: Pick<EngineRun, 'outcome'>): Tone {
  const o = plan.outcome
  if (o.status === 'decided' && o.decision) return o.decision === 'deny' ? 'negative' : 'positive'
  return o.status === 'depends' ? 'notice' : 'neutral'
}

export const firstName = (name: string): string => name.trim().split(/\s+/)[0] || name

/* The verb a check's line turns on: what is said after the fact. */
const VERB = /\s(does not meet|meets|is not in|is in|is not|is below|is above|is between|is|are not|are|not stated)(\s|$)/

/** A check, said short: its word, then what was found. */
export function shortCheck(c: CheckRow, via?: Via): string {
  if (c.status === 'unknown' || c.missing) return `${c.word} not stated`
  if (c.category === 'who') {
    if (c.status === 'pass') return via?.matches && via.say ? `${c.word} ${via.say}` : `${c.word} in ${c.requirement}`
    return `${c.word} · not in ${c.requirement}`
  }
  const line = c.line || ''
  const m = VERB.exec(line)
  if (m && m.index !== undefined) return `${c.word} ${line.slice(m.index + 1)}`
  return line ? `${c.word} · ${line}` : c.word
}

/** What a rule's card says it read, check by check: the ones read, to the one that ended it. */
export function readChecks(r: EngineRule): CheckRow[] {
  const n = Math.max(r.checked, r.failing !== null ? r.failing + 1 : 0)
  return r.checks.slice(0, n)
}

/** The rule's requirement after "needs": "below 40", "not in Corporate offices"; a name keeps its capital. */
export const lowerFirst = (t: string): string => (/^(Not|Below|Above|Between|Before|After) /.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t)

/** "Ravi Menon is not in it" said short: "Doesn't cover Ravi". */
export function reasonWords(reason: string, first: string): string {
  if (/ is not in (it|this policy)$/.test(reason)) return `Doesn't cover ${first}`
  return reason || 'Not used'
}

/** A rule's THEN, as its card says it. */
export function thenWords(r: Pick<EngineRule, 'index' | 'state' | 'decision'>): string {
  return r.index === null && r.state === 'possible' ? `If not · ${DECISION_WORDS[r.decision]}` : DECISION_WORDS[r.decision]
}
