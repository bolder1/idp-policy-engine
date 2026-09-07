import { ArrowRight, Split, Users, type LucideIcon } from 'lucide-react'

import { restConditions, whoEditable, whoIds } from '../../audience-ops'
import type { Rule } from '../../data'
import type { NameLookup } from '../predicate-prose'
import { summarise } from '../ConditionPopover'
import { DECISION_SHORT, type Part } from './model'

/* -----------------------------------------------------------------------------
   How the three parts of a rule are named and summarised.

   Pure — no React, no store, no DOM — and kept out of both neighbours on
   purpose. `model.ts` is the board's vocabulary rather than its presentation,
   and `audience-ops.ts` is `Predicate → Predicate`: a formatter living there
   would be the first crack in the one module that is only allowed to be a
   writer.
   -------------------------------------------------------------------------- */

/* The three questions, as a person reads them.

   `Condition`, not `If`. `If` is the keyword the card's own block prints
   inside the predicate — `if … and … then` is the grammar of the thing, and it
   stays. This names the question you OPEN, and the word for that is the one
   the person asking for it used. The id underneath is still `'when'`. */
export const PART_LABEL: Record<Part, string> = { who: 'Who', when: 'Condition', then: 'Then' }

export const PART_HINT: Record<Part, string> = {
  who: 'Which people is this rule about?',
  when: 'And in what circumstances?',
  then: 'What happens when it matches?',
}

/* The three glyphs the card already draws with: `Users` is what the who rows
   used, `Split` is the branch mark on the summary line and at the head of
   every `if`, and `ArrowRight` is the arrow between the test and the outcome.
   Nothing new is introduced — the buttons are labelling parts of the card that
   were already there. */
export const PART_ICON: Record<Part, LucideIcon> = { who: Users, when: Split, then: ArrowRight }

/** What a part button says after its label, and whether that reads as unset. */
export interface PartSummary {
  text: string
  /** Nothing chosen — drawn muted, so the chain shows at a glance what is set. */
  dim: boolean
}

/* The value on each of the card's three buttons.

   The condition count is `restConditions`, not every leaf. It used to be every
   leaf, and that was right while the card had one number for the whole
   predicate — but a card that reports its groups and people under `Who` and
   then counts them again under `Condition` is telling you the same fact twice
   and inflating the second telling. `WhenEditor` has always hidden them from
   the If list on exactly this argument; `IfBlock` now does too, so all three
   agree about what a condition is.

   "Any sign-in" for the empty case, because a rule with no conditions does not
   test less — it tests nothing, and it catches everything that reaches it. */
export function partSummary(rule: Rule, part: Part, resolve: NameLookup): PartSummary {
  if (part === 'then') return { text: DECISION_SHORT[rule.decision], dim: false }

  if (part === 'when') {
    const n = restConditions(rule.when).length
    return n === 0 ? { text: 'Any sign-in', dim: true } : { text: `${n} condition${n === 1 ? '' : 's'}`, dim: false }
  }

  /* On an OR of alternatives the who belongs to each way in rather than to the
     rule, so no single phrase is true of it. The button stays — a control that
     vanishes when a rule grows an OR is a card changing shape for a reason
     nobody can see — and it says what is actually the case. The pane it opens
     does the explaining. */
  if (!whoEditable(rule.when)) return { text: 'Per alternative', dim: true }

  const names = [
    ...whoIds(rule.when, 'group').map((id) => resolve('group', id) ?? `deleted · ${id}`),
    ...whoIds(rule.when, 'user').map((id) => resolve('user', id) ?? `deleted · ${id}`),
  ]
  return names.length === 0 ? { text: 'Everyone', dim: true } : { text: summarise(names, 'Everyone'), dim: false }
}
