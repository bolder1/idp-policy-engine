import { fallbackRule, type Policy, type Rule } from '../../data'
import { isPostSignIn } from '../../post-sign-in'
import { shows } from '../../rollout'

/* -----------------------------------------------------------------------------
   THE DEFAULT TURNS WITH THE FIRST RULE (owner, 25 Nov 2026: "whenever I add my first rule, Nothing else matched goes
   to Deny by default; otherwise Allow by default. The user should know why it's happening and how the transition works";
   rollout.ts `defaultFlips`).

   A policy with no rules has nothing to check, so it lets everyone in with a password (blankPolicy's default). Once it
   has a rule, the rules are the way in and "Nothing else matched" closes the door behind them: Deny. Deleting the last
   rule opens it again.

   Only a default nobody chose turns. The marker is `Rule.setBy` on the fallback: absent is the blank Allow, 'auto' the
   Deny this turned it to, 'admin' anything picked in its panel, which is never turned for them. Not on the Global
   Default, whose default is the tenant's, nor on a post sign-in policy, whose outcome is an action, not Allow or Deny;
   and not where the edit wrote its own default (Describe it, Guided setup, a template that brings one).

   Pure, so it is one decision wherever a rule comes or goes: BoardBuilder's `commitDraft` applies it in the same history
   entry as the rule it follows, so one Undo takes both back.
   -------------------------------------------------------------------------- */

export const DEFAULT_FLIPS: boolean = shows('defaultFlips')

export type DefaultFlip = 'to-deny' | 'to-allow'

type Side = Pick<Policy, 'rules' | 'fallback' | 'isSystem' | 'type'>

/** The blank default, or one nobody has picked: Allow on a password, set by no one. */
const untouchedAllow = (fb: Rule | undefined): boolean => !fb || (fb.decision === '1fa' && fb.setBy === undefined)

/** Whether an edit from `prev` to `next` turns the default, and which way. `on` is the rollout gate, a parameter so
 *  the tests can read both sides. */
export function defaultFlip(prev: Side, next: Side, on: boolean = DEFAULT_FLIPS): DefaultFlip | null {
  if (!on || next.isSystem || isPostSignIn(next)) return null
  /* The edit chose a default of its own: leave it. By content, since some writers copy the default they keep. */
  if (next.fallback !== prev.fallback && JSON.stringify(next.fallback) !== JSON.stringify(prev.fallback)) return null
  if (prev.rules.length === 0 && next.rules.length > 0 && untouchedAllow(next.fallback)) return 'to-deny'
  if (prev.rules.length > 0 && next.rules.length === 0 && next.fallback?.setBy === 'auto' && next.fallback.decision === 'deny') return 'to-allow'
  return null
}

/** The edit with its default turned. Back to Allow drops the marker, so a rule added and deleted again leaves the
 *  default exactly as it was, and the policy no different from its saved self. */
export function withFlip<P extends Side>(next: P, flip: DefaultFlip): P {
  const fb = next.fallback ?? fallbackRule()
  if (flip === 'to-deny') return { ...next, fallback: { ...fb, decision: 'deny', setBy: 'auto' } }
  const back: Rule = { ...fb, decision: '1fa' }
  delete back.setBy
  return { ...next, fallback: back }
}

/** A hand edit to the default, marked as the admin's so it is never turned for them. A patch that changes nothing (a
 *  panel settling its own fields) leaves it unmarked. */
export function adminFallback(fb: Rule | undefined, patch: Partial<Rule>, on: boolean = DEFAULT_FLIPS): Rule {
  const base = fb ?? fallbackRule()
  const next = { ...base, ...patch }
  if (!on || JSON.stringify(next) === JSON.stringify(base)) return next
  return { ...next, setBy: 'admin' }
}
