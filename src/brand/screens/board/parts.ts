import { blankRule, type Rule } from '../../data'
import { leafCount } from '../../predicate'
import { hasWho } from '../../rule-who'
import type { RuleState } from '../rule-form'
import type { Part } from './model'

/* -----------------------------------------------------------------------------
   How the parts of a rule are named, and when a rule is still untouched.

   Pure — no React, no store, no DOM — and kept out of `model.ts` on purpose:
   that file is the board's vocabulary rather than its presentation.
   -------------------------------------------------------------------------- */

/* The three questions, as a person reads them.

   `Condition`, not `If`. `If` is the keyword the card's own block prints
   inside the predicate — `if … and … then` is the grammar of the thing, and it
   stays. This names the question you OPEN, and the word for that is the one
   the person asking for it used. The id underneath is still `'when'`. */
export const PART_LABEL: Record<Part, string> = { who: 'Who', when: 'Condition' }

/* A rule nobody has answered anything on yet.

   Not "no who and no conditions": a rule with neither that says Deny catches
   every sign-in that reaches it, and the card must say so. Pristine means it
   still holds exactly what `blankRule` writes — the name aside, which says
   nothing about what the rule does. */
export function isPristine(rule: Rule): boolean {
  const b = blankRule()
  /* The flag first. The blank rule's own default is "allow after a second
     factor", so a rule somebody has set to exactly that — Allow, then any
     enabled method — is field-for-field the blank, and the comparison below
     alone called it untouched: the card read "Nothing set yet" over a rule that
     was fully written, and the panel lit no tile when it reopened. Only
     `blankRule` sets the flag, so a seeded or template rule is never blank. */
  if (rule.pristine !== true) return false
  return (
    !hasWho(rule.who) &&
    leafCount(rule.when) === 0 &&
    rule.decision === b.decision &&
    rule.firstFactor === b.firstFactor &&
    !rule.firstFactorMethod &&
    rule.secondFactor === b.secondFactor &&
    (rule.secondFactorMethods?.length ?? 0) === 0 &&
    (rule.methodChain?.length ?? 0) === 0 &&
    !rule.preferredFallback &&
    !rule.rememberMfa &&
    !rule.allowDisable2fa
  )
}

/* The name a duplicated rule takes.

   Appending " (copy)" to a copy stacked into "(copy) (copy)". The suffix is
   stripped first, and the copies are numbered: "MFA (copy)", "MFA (copy 2)". */
export function copyName(name: string, taken: readonly string[]): string {
  const base = name.trim().replace(/\s*\(copy(?: \d+)?\)$/, '') || 'Untitled rule'
  const names = new Set(taken.map((n) => n.trim()))
  let n = 1
  let next = `${base} (copy)`
  while (names.has(next)) {
    n += 1
    next = `${base} (copy ${n})`
  }
  return next
}

const STATE_LABEL: Record<RuleState, string> = { ready: 'Ready', setup: 'Needs setup', warn: 'Check' }

/** Findings that mean another rule always matches first, so this one never runs. */
export const UNREACHABLE_CODES: readonly string[] = ['PE101', 'PE102', 'PE103']

/** The pill beside a rule's name. A rule another rule always catches first is unreachable, not unfinished. */
export function stateLabel(state: RuleState, enabled: boolean, unreachable: boolean): string {
  if (!enabled) return 'Off'
  if (state === 'setup' && unreachable) return 'Unreachable'
  return STATE_LABEL[state]
}

/** The name to keep when a rule's name field is left blank. */
export function settledName(typed: string, previous: string, index: number): string {
  return typed.trim() || previous.trim() || `Rule ${index + 1}`
}
