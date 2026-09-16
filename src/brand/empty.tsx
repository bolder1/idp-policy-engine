import type { ReactNode } from 'react'
import { useId } from 'react'
import { type LucideIcon, SearchX } from 'lucide-react'

import { Button } from './kit'

/* -----------------------------------------------------------------------------
   Empty states.

   An icon in a circle, a heading, a line, a button.

   This was five hand-drawn wireframes — one per surface, a monochrome sketch of
   the object you were about to make, on the argument that a shield in a circle
   says "security product" and nothing about zones. That argument is right about
   what a drawing CAN do and wrong about what five of them cost. Each new empty
   surface needed a new SVG before it could ship, so the ones nobody drew got no
   empty state at all; the drawings were fixed at 132×92 and had to be scaled by
   transform to fit a compact panel; and five bespoke illustrations in one
   console drift apart the moment two people touch them.

   One component, one icon prop. A new surface picks a glyph and is done, the
   circle scales by changing two numbers, and every empty state in the product
   is recognisably the same object. The heading and the line carry the meaning —
   which, on a screen with four words of copy, is where it was always carried.
   -------------------------------------------------------------------------- */

export function EmptyState({
  icon: Icon,
  title,
  blurb,
  action,
  compact,
  live,
  id,
}: {
  icon: LucideIcon
  title: string
  /** One line. If it needs two, the second one belongs somewhere else. */
  blurb: string
  /** A Button, or a fragment of a primary Button and one secondary control. */
  action?: ReactNode
  /* For an empty SECTION rather than an empty page — the panel it sits in
     already has a heading and a border, so the state inside it needs less air
     and a smaller mark or it out-weighs the thing it belongs to. */
  compact?: boolean
  /** Announce it when it appears — for a state that replaces a list as somebody types. */
  live?: boolean
  id?: string
}) {
  return (
    <div id={id} className={`bempty ${compact ? 'is-compact' : ''}`} role={live ? 'status' : undefined}>
      <span className="bempty__icon" aria-hidden>
        <Icon size={26} strokeWidth={1.5} />
      </span>
      <h2 className="bempty__title">{title}</h2>
      <p className="bempty__blurb">{blurb}</p>
      {action && <div className="bempty__action">{action}</div>}
    </div>
  )
}

/* A search or a filter that matched nothing, drawn as fully as an empty page.

   The owner asked for every empty state to be treated equally (14 Sep 2026):
   the one-line "Nothing matches" read as a loading glitch. It is the same block
   now, with its own mark, a title that names what was searched for, one plain
   line, and the action that brings the list back.

   Clearing brings the list back and removes this block, button and all, which
   used to leave keyboard focus on <body>. Focus goes to the page's search box
   instead, the control somebody clearing a search reaches for next. */
export function NoMatches({
  noun,
  query,
  filtered = false,
  onClear,
  compact,
  blurb: blurbOverride,
  secondary,
}: {
  /** Plural, lower case: 'zones', 'device profiles'. */
  noun: string
  query?: string
  /** A filter other than the search is narrowing the list. */
  filtered?: boolean
  onClear: () => void
  compact?: boolean
  /** Replaces the default line, for a fact worth more than the default ("3 in Xecurify templates."). */
  blurb?: string
  /** One more control beside Clear, such as a switch to where the matches are. */
  secondary?: ReactNode
}) {
  const id = useId()
  const q = query?.trim()
  const title = q ? `No ${noun} match “${q}”` : `No ${noun} match these filters`
  const blurb =
    blurbOverride ??
    (q && filtered
      ? 'Try another search, or change the filters.'
      : q
        ? 'Check the spelling, or try another search.'
        : 'Change or clear the filters to see more.')
  const clear = q && filtered ? 'Clear search and filters' : q ? 'Clear search' : 'Clear filters'

  const clearAndRefocus = () => {
    const scope = document.getElementById(id)?.closest('[role="dialog"], .bpage, .bshell__main') ?? document.body
    onClear()
    window.setTimeout(() => {
      const active = document.activeElement
      if (active && active !== document.body && active.isConnected) return
      scope.querySelector<HTMLInputElement>('.bx-search input, input[type="search"]')?.focus({ preventScroll: true })
    }, 0)
  }

  return (
    <EmptyState
      id={id}
      icon={SearchX}
      title={title}
      blurb={blurb}
      compact={compact}
      live
      action={
        <>
          <Button variant="secondary" onClick={clearAndRefocus}>
            {clear}
          </Button>
          {secondary}
        </>
      }
    />
  )
}

