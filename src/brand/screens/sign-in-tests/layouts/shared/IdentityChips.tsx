import { Check, CircleHelp, KeyRound, Minus, Users, X } from 'lucide-react'

import { Face } from '../../../../faces'
import type { ChipMark, IdentityChip } from './sign-in-row'
import './sign-in-row.css'

/* -----------------------------------------------------------------------------
   THE IDENTITY CHIPS — a Run of several identities (owner, 5 Oct 2026: "one
   run each, switch"): a chip each, in pick order. Drawn where a canvas says
   who signs in: the sign-in row's Who part (SignInRow.tsx), and the left of
   the run line's pill over the column canvas — the policy builder's Check
   access (EngineJourney.tsx `EngineLine`). The words are sign-in-row.ts's
   (`identityChips`); this only draws them.

     [MI Maya Iyer ✓] [▣ Finance ✓] [RM Ravi Menon ✕]

   The one the canvas tells is pressed, and a press on it does nothing; a
   press on another switches the canvas to it (`onPick`) and never opens the
   panel. Once the run on screen has landed each chip marks that identity's
   own answer (12 px; the host's ok / bad / amber / muted); before, no marks,
   so no result is ahead of the story.

   Too wide for its host, the host folds them (`fold`): the whole names, the
   short ones ("Maya", "Engineeri…"), then the faces alone — the host puts
   each answer on its face's corner (`.sir.is-faces`, `.tj-engine__ids.is-faces`).
   The whole name stays in the title and the name.

   API:
     <IdentityChips chips={identityChips(run.identities, landed)}
                    fold="name" | "short" | "face"
                    lit?                // a citation hovered elsewhere: the pressed chip's blue ring
                    onPick={(key) => …}
                    className? />       // the host's own class beside `sir__ids`
   Its look is sign-in-row.css's, in the host's `--sir-*` vars.
   -------------------------------------------------------------------------- */

/** How far the chips have folded to fit: the whole names, the short ones, the faces alone. */
export type ChipFold = 'name' | 'short' | 'face'

/* An identity's answer on its chip: the shape says it, the colour backs it (green allows, red denies, amber can't tell). */
const CHIP_ICON: Record<ChipMark, typeof Check> = { allow: Check, '2fa': KeyRound, deny: X, depends: CircleHelp, none: Minus }

export interface IdentityChipsProps {
  /** The chips (sign-in-row.ts `identityChips`): two or more. */
  chips: readonly IdentityChip[]
  fold?: ChipFold
  /** A citation hovered elsewhere lights the person: the pressed chip takes the blue ring. */
  lit?: boolean
  /** Another chip pressed: switch the canvas to that identity. */
  onPick?: (key: string) => void
  className?: string
}

export function IdentityChips({ chips, fold = 'name', lit = false, onPick, className = '' }: IdentityChipsProps) {
  return (
    <span className={`sir__ids${className ? ` ${className}` : ''}`} role="group" aria-label="Identities" data-sir="who">
      {chips.map((c) => {
        const Mark = c.mark ? CHIP_ICON[c.mark] : null
        return (
          <button
            key={c.key}
            type="button"
            className={`sir__id${c.active ? ' is-on' : ''}${c.active && lit ? ' is-lit' : ''}`}
            aria-pressed={c.active}
            aria-label={c.label}
            title={c.label}
            onClick={() => !c.active && onPick?.(c.key)}
          >
            {c.kind === 'group' ? (
              <span className="sir__grp" aria-hidden>
                <Users size={14} strokeWidth={2.2} />
              </span>
            ) : (
              <span className="sir__face">
                <Face kind="user" name={c.name} size="sm" decorative />
              </span>
            )}
            {fold !== 'face' && <span className="sir__idname">{fold === 'short' ? c.short : c.name}</span>}
            {Mark && <Mark className={`sir__idmark is-${c.mark}`} size={12} strokeWidth={2.6} aria-hidden />}
          </button>
        )
      })}
    </span>
  )
}
