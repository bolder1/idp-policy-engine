import { useEffect, useId, useRef, type KeyboardEvent } from 'react'
import { Check, Wrench, X } from 'lucide-react'

import { IconButton } from '../../kit'
import type { Policy } from '../../data'
import { FixButton } from '../sign-in-tests/RunChain'
import { ACCESS_CHECKS } from '../sign-in-tests/names'
import { applyConflictFix, fixDone, fixSaidOn, type FixItem } from '../sign-in-tests/conflict-fix'

/* -----------------------------------------------------------------------------
   Fixes — every fix of an Access checks run, in the builder (owner, 7 Oct 2026:
   "can I take this whole fix thing inside the builder? so I don't have to back
   and forth and can do all the fixes together and come back here to check
   result?").

   In the inspector's slot, as Read as text is. Each fix is the Why's card —
   its heading, its line, its Fix — and what it is now is read off the draft
   (conflict-fix.ts `fixDone`): In the draft once it is there — by its own Fix or another's, open again after
   Undo, and "No longer fits" where the rule it names has gone. Apply all makes
   the open ones in one edit. A fix is an ordinary edit to the draft, saved
   only through Review & save, so Access checks sees it once it is saved.
   -------------------------------------------------------------------------- */

export function FixesPanel({
  items,
  draft,
  policies,
  onApply,
  onApplyAll,
  onBack,
  onClose,
}: {
  items: readonly FixItem[]
  draft: Policy
  policies: readonly Policy[]
  onApply: (index: number) => void
  onApplyAll: () => void
  /** Back to Access checks, to run the sign-in again on what is saved. */
  onBack: () => void
  /** The ×, and Esc from anywhere in the panel. */
  onClose: () => void
}) {
  const uid = useId()
  const heading = useRef<HTMLHeadingElement | null>(null)
  useEffect(() => {
    heading.current?.focus()
  }, [])
  const states = items.map((it) => (fixDone(draft, it.fix) ? 'done' : applyConflictFix(draft, it.fix, policies) ? 'open' : 'gone'))
  const open = states.filter((s) => s === 'open').length

  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Escape' && !e.defaultPrevented) {
      e.preventDefault()
      onClose()
    }
  }

  return (
    <aside className="bb__insp brat bfix" aria-labelledby={`${uid}-title`} onKeyDown={onKey}>
      <div className="bb__inspbar brat__bar">
        <h2 id={`${uid}-title`} ref={heading} tabIndex={-1} className="brat__title">
          Fixes
        </h2>
        <span className="brat__barend">
          <IconButton icon={X} size="sm" tone="ghost" label="Close Fixes" onClick={onClose} />
        </span>
      </div>
      <div className="bb__inspbody brat__body">
        <ul className="tj-why__list bfix__list">
          {items.map((it, i) => {
            const state = states[i]
            const Mark = state === 'done' ? Check : Wrench
            return (
              <li key={i} className={`tj-why__item tj-find is-${state === 'open' ? 'conflict' : 'info'}`}>
                <span className="tj-why__icon" aria-hidden>
                  <Mark size={14} strokeWidth={2.1} />
                </span>
                <div className="tj-why__text">
                  <p className="tj-find__title">{it.title}</p>
                  <p className="tj-find__line">{it.line}</p>
                  <div className="tj-find__acts">
                    {state === 'open' ? (
                      <FixButton apply={{ label: fixSaidOn(it.fix, draft), title: 'Makes this change in the draft', onApply: () => onApply(i) }} />
                    ) : (
                      <span className="bfix__state">{state === 'done' ? 'In the draft' : 'No longer fits'}</span>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
        <div className="bfix__foot">
          {open > 1 && (
            <button type="button" className="bx-btn bx-btn--neutral bx-btn--sm" onClick={onApplyAll}>
              Apply all
            </button>
          )}
          <button type="button" className="tj-conflict__open bfix__back" onClick={onBack}>
            Back to {ACCESS_CHECKS}
          </button>
        </div>
      </div>
    </aside>
  )
}
