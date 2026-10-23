import type { ReactNode } from 'react'
import { Check, Minus } from 'lucide-react'

import { Button } from '../kit'

/* -----------------------------------------------------------------------------
   Ticking rows, and a slider's footer — moved out of DisplayTokensPage.tsx so
   a group's Assignment tab and its Assign users drawer use the same ones.
   The markup and classes are the Display tokens page's (display-token-page.css,
   loaded globally), so that page looks exactly as it did.
   -------------------------------------------------------------------------- */

/* --- Slider footer ---------------------------------------------------------------------- */

/* Two buttons at most (owner, 23 Oct 2026: "3 looks very bad"). With a second
   way forward — Save and add another, Duplicate and add — Cancel goes, as it
   does from the kit's Confirm with `alt`: the slider's ×, Escape and the scrim
   already close it, through the same `onCancel` the caller gave the Drawer. */
export function SliderActions({
  onCancel,
  primary,
  another,
}: {
  onCancel: () => void
  primary: { label: string; run: () => void; disabled?: boolean } | null
  another: { label: string; run: () => void } | null
}) {
  return (
    <>
      {!another && (
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      )}
      {another && (
        <Button variant="secondary" onClick={another.run}>
          {another.label}
        </Button>
      )}
      {primary && (
        <Button variant="brand" disabled={primary.disabled} onClick={primary.run}>
          {primary.label}
        </Button>
      )}
    </>
  )
}

/* --- Selection -------------------------------------------------------------------------- */

/* Every row shown ticked, or, when they all are, none of them — leaving the
   ticks on rows a search has hidden alone. `keyOf` says when two values are the
   same row: identity, or a token serial's case- and space-blind key. */
function toggleAll(selected: readonly string[], shown: readonly string[], keyOf: (s: string) => string): string[] {
  const keys = new Set(shown.map(keyOf))
  const rest = selected.filter((s) => !keys.has(keyOf(s)))
  const all = shown.length > 0 && shown.every((s) => selected.some((x) => keyOf(x) === keyOf(s)))
  return all ? rest : [...rest, ...shown]
}

const same = (s: string) => s

/* Select all, and what a selection can have done to it on the right of the same
   line. There rather than in the toolbar: the toolbar is already full at the
   compact width, and a button arriving there with the first tick wrapped it and
   moved Upload CSV and the primary action out from under the pointer. */
export function SelectAll({
  shown,
  selected,
  onSelected,
  keyOf = same,
  children,
}: {
  shown: string[]
  selected: string[]
  onSelected: (next: string[]) => void
  /** When two values are the same row. Identity unless given. */
  keyOf?: (s: string) => string
  children?: ReactNode
}) {
  const on = shown.filter((s) => selected.some((x) => keyOf(x) === keyOf(s))).length
  const all = shown.length > 0 && on === shown.length
  return (
    <div className="bdt__selbar">
      <button
        type="button"
        role="checkbox"
        aria-checked={all ? true : on > 0 ? 'mixed' : false}
        className={`bdt__check bdt__check--all ${on > 0 ? 'is-on' : ''}`}
        onClick={() => onSelected(toggleAll(selected, shown, keyOf))}
      >
        <span className="bx-tick" aria-hidden>
          {on > 0 && !all ? <Minus size={11} strokeWidth={3.2} /> : <Check size={11} strokeWidth={3.2} />}
        </span>
        {/* No count: the bulk button at the end of this line says how many. */}
        <span>Select all</span>
      </button>
      {children && <span className="bdt__bulk">{children}</span>}
    </div>
  )
}

export function RowCheck({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-label={label}
      className={`bdt__check ${on ? 'is-on' : ''}`}
      onClick={onToggle}
    >
      <span className="bx-tick" aria-hidden>
        <Check size={11} strokeWidth={3.2} />
      </span>
    </button>
  )
}
