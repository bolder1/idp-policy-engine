import type { ReactNode } from 'react'

/* -----------------------------------------------------------------------------
   The row under a page's head. ONE shape, on every list page (owner, 16 Sep
   2026: "do the heading separate as we have in Policies and move the rest to
   the bottom of the heading — make things constant").

     HEAD   the title and its caption, in one container, and nothing else — at
            most a Documentation link against the right edge (`PageHead`).
     BAR    everything you do to the list, on one dedicated row:
              left   the search BOX, always first and always a box, then the
                     page's filters — segments where one filter is switched
                     often (Policies' status), dropdowns otherwise;
              right  anything that governs the primary action (Device
                     profiles' create flow), the view switch, and the primary
                     action LAST, at the far right.
     BODY   the list, in the chosen view, and its pager.

   Tried and withdrawn the same day, so they are not tried again: search as an
   icon that opens a field (Claude's pages do it; here a search you cannot see
   is one fewer thing that says the list can be searched), and the controls on
   the heading row itself for pages with a rare filter (it made two page shapes
   where the owner wants one). Slots may be empty per page — a page with no
   filter has only its search on the left — but the order never changes.
   -------------------------------------------------------------------------- */

export function PageBar({ left, right }: { left?: ReactNode; right?: ReactNode }) {
  return (
    <div className="btoolbar bbar">
      <div className="bbar__left">{left}</div>
      <div className="bbar__right">{right}</div>
    </div>
  )
}

/* The filter that is used often enough to be seen: text segments, the chosen
   one filled. A group of pressed buttons rather than tabs — the list under them
   is the same list, narrowed, not a different panel. No counts on them: a
   number belongs to the list's pager, where it is one number and not four. */
export function FilterTabs<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  /** "Filter by status" — what the group narrows. */
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="bseg" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          className={value === o.value ? 'is-on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
