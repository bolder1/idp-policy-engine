import { LAST_ROW } from '../testing/evidence'
import type { PillCategory } from '../testing/trace-pills'
import type { EngineRun } from './engine-run'

/* -----------------------------------------------------------------------------
   Why a sign-in was refused, as one reason (docs/specs/DENIAL-REASONS.md).

   A closed list, read off the run the engine already made, never typed by an
   admin: the end user's message, the admin's Why and the help desk's view all
   say the same cause. PURE — it only reads the deciding rule's rows.

   A rule that denies has matched, so every row of it held; the cause is the
   condition that made it deny. The first row that is not about who the person
   is names it; a rule that asks only who says `group`. A refusal from
   "Nothing else matched" says `default-deny`: no rule let the person in.
   -------------------------------------------------------------------------- */

export type DenyReason = 'zone' | 'device' | 'risk' | 'time' | 'group' | 'default-deny' | 'rule'

/** Plain admin words, one line each, said once here. */
export const DENY_REASON_WORD: Record<DenyReason, string> = {
  zone: 'Network or place is not allowed',
  device: 'Device does not meet the requirement',
  risk: 'Sign-in risk is too high',
  time: 'Sign-in is outside the allowed hours',
  group: 'This group is not allowed',
  'default-deny': 'No rule let this person in',
  rule: 'A rule blocks this sign-in',
}

/** The short name a help desk can match on a screenshot: "Ref: zone". */
export const denyRef = (reason: DenyReason): string => `Ref: ${reason}`

const OF_CATEGORY: Partial<Record<PillCategory, DenyReason>> = {
  network: 'zone',
  place: 'zone',
  device: 'device',
  risk: 'risk',
  time: 'time',
  who: 'group',
}

/** The reason the run refused the sign-in, or null when it did not (allowed, depends, nothing decided). */
export function denyReasonOf(run: Pick<EngineRun, 'outcome' | 'rules' | 'landing'>): DenyReason | null {
  const { outcome, rules, landing } = run
  if (outcome.status !== 'decided' || outcome.decision !== 'deny' || landing === null) return null
  const rule = rules[landing]
  if (!rule) return null
  if (rule.id === LAST_ROW) return 'default-deny'
  const named = rule.checks.find((c) => c.category !== 'who' && OF_CATEGORY[c.category])
  if (named) return OF_CATEGORY[named.category] ?? 'rule'
  return rule.checks.some((c) => c.category === 'who') ? 'group' : 'rule'
}
