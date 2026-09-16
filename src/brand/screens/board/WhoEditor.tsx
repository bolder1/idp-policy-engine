import { useRef } from 'react'

import type { Audience, Rule } from '../../data'
import { useBrand } from '../../store'
import { WhoPicker } from '../who-picker'

/* -----------------------------------------------------------------------------
   WHO — the people a rule applies to.

   It edits `Rule.who` and nothing else. The If cards are not read and not
   written here, whatever shape they have: who is ANDed with the whole WHEN (see
   `rule-who.ts`), so a rule with two ways in still has exactly one who, and
   this section is always the place it is chosen.

   That is what retired the stand-down that stood here — "Who has more than one
   place to be", with an A/B list of each alternative's people and a button to
   go and edit them among the conditions. It existed because people used to be
   `group` and `user` conditions inside the cards. They are not any more, so
   there is nothing to stand down for.

   The control is the shared `WhoPicker`, inline rather than in a dialog. Every
   other section of this panel writes as it is touched and the board's save bar
   commits the lot; a dialog with its own Save was the one exception. Each change
   is one patch, so undo steps back one choice at a time.

   Empty means everyone the policy governs, and the field says "Everyone". The
   picker hands back `undefined` for that, and the board's patch stores it so
   the rule serialises exactly as it did before anything was chosen, and the
   save bar stays dark.
   -------------------------------------------------------------------------- */

export function WhoEditor({
  rule,
  audience,
  onPatch,
}: {
  rule: Rule
  /** The policy's own audience, for marking choices it does not govern. Never written here. */
  audience: Audience
  onPatch: (p: Partial<Rule>) => void
}) {
  const store = useBrand()
  const box = useRef<HTMLDivElement>(null)

  /* A chip's remove button goes with the chip, and focus falls to the page.
     On the page, Delete deletes the selected RULE. The picker now moves focus
     to the next badge or its search itself; this is the backstop, keeping focus
     in this section, where the board's rule keys stand down. */
  const keepFocus = () =>
    requestAnimationFrame(() => {
      const el = box.current
      const at = document.activeElement
      if (el && (at === null || at === document.body)) el.focus({ preventScroll: true })
    })

  return (
    <div className="bb__who" ref={box} tabIndex={-1} onClickCapture={keepFocus}>
      <WhoPicker
        who={rule.who}
        onChange={(who) => onPatch({ who })}
        audience={audience}
        directory={store.users}
        groups={store.groups}
      />
    </div>
  )
}
