import { FALLBACK_NAME, type Rule } from '../../data'
import { leaves } from '../../predicate'
import { hasWho } from '../../rule-who'

/* -----------------------------------------------------------------------------
   Why a sign-in was refused, as one reason (docs/specs/DENIAL-REASONS.md).

   A closed list, never typed by an admin. Admin and help desk only (owner, 5 Oct
   2026): the outcome card and Why say it, never the end user's deny page. The
   run's reading, from the rows the engine checked, is sign-in-tests/deny-reason.ts.
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

/** What a refused user can usually do about each cause: the editor offers it as the rule's Next step, one press, never added by itself. */
export const DENY_ACTION_SUGGESTION: Record<DenyReason, string> = {
  zone: 'Connect from the office network and try again.',
  device: 'Update your device and sign in again.',
  risk: 'Try again later, or from a device you use often.',
  time: 'Try again during working hours.',
  group: 'Ask your manager to request access for you.',
  'default-deny': 'Ask your manager to request access for you.',
  rule: 'Contact the help desk if you need access.',
}

const OF_CONDITION: Record<string, DenyReason> = {
  zone: 'zone',
  fingerprint: 'device',
  'device-risk': 'risk',
  time: 'time',
  day: 'time',
}

/** The reason a rule refuses, from what it asks: its first condition that is not about who, else who, else the rule itself. The last row says no rule let them in. Read from the rule alone, so a list of past sign-ins (sign-in-tests/activity.ts) can say it without a run. */
export function denyReasonOfRule(rule: Partial<Pick<Rule, 'name' | 'when' | 'who'>>): DenyReason {
  if (rule.name === FALLBACK_NAME) return 'default-deny'
  const named = rule.when ? leaves(rule.when).find((c) => OF_CONDITION[c.typeId]) : undefined
  if (named) return OF_CONDITION[named.typeId]
  return hasWho(rule.who) ? 'group' : 'rule'
}
