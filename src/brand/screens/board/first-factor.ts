import type { Rule } from '../../data'

/* The First factor as ONE choice (owner, 21 Sep 2026: "can we merge these two
   into one").

   It was two pickers: "Password / Any enabled method / A specific method",
   and — only after the third — a second one asking which. That is one question
   asked twice, and the gap between the two answers was a state the rule could
   be saved in: "A specific method" with nothing chosen, which the pane then had
   to flag in red. Unfinished means draft; a control that cannot produce the
   unfinished answer is better than one that reports it.

   So one picker holds all of it, the named methods under an "A specific method"
   heading, and choosing one sets both fields at once. The model does not change
   — still `firstFactor: 'Specific'` plus `firstFactorMethod` — only how many
   gestures it takes to say it.

   A method's option value carries a prefix so it can never collide with the two
   plain answers, whatever a method comes to be called. */
export const METHOD_PREFIX = 'method:'

type FirstFactor = Pick<Rule, 'firstFactor' | 'firstFactorMethod'>

/** The picker's value for a rule's first factor. `''` for a specific method not
    yet chosen — which only a rule saved before this change can hold — so the
    picker shows its placeholder instead of a plain answer that is not true. */
export function firstFactorValue(r: FirstFactor): string {
  if (r.firstFactor !== 'Specific') return r.firstFactor
  return r.firstFactorMethod ? METHOD_PREFIX + r.firstFactorMethod : ''
}

/** What choosing an option writes. A plain answer clears any method left over
    from a specific one, so the rule never carries a method it is not using. */
export function firstFactorPatch(value: string): FirstFactor {
  if (value.startsWith(METHOD_PREFIX)) {
    return { firstFactor: 'Specific', firstFactorMethod: value.slice(METHOD_PREFIX.length) }
  }
  return { firstFactor: value === 'Any' ? 'Any' : 'Password', firstFactorMethod: undefined }
}
