import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

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
}: {
  icon: LucideIcon
  title: string
  /** One line. If it needs two, the second one belongs somewhere else. */
  blurb: string
  action?: ReactNode
  /* For an empty SECTION rather than an empty page — the panel it sits in
     already has a heading and a border, so the state inside it needs less air
     and a smaller mark or it out-weighs the thing it belongs to. */
  compact?: boolean
}) {
  return (
    <div className={`bempty ${compact ? 'is-compact' : ''}`}>
      <span className="bempty__icon" aria-hidden>
        <Icon size={26} strokeWidth={1.5} />
      </span>
      <h2 className="bempty__title">{title}</h2>
      <p className="bempty__blurb">{blurb}</p>
      {action && <div className="bempty__action">{action}</div>}
    </div>
  )
}

/* The inline kind: a filter or a search that matched nothing. No drawing — the
   surrounding page is still full of context, and an illustration here would be
   a picture of a thing that does exist, drawn because it is hidden. */
export function NoResults({ children }: { children: ReactNode }) {
  return <p className="bempty__none">{children}</p>
}

/* --- The drawings ---------------------------------------------------------------
   All on a 132×92 field, 1.5 stroke, round joins, sharing `S` — so the three
   read as one set rather than three illustrations that happen to be nearby.

   One per surface that can genuinely be empty, and no more. Policies and
   Authentication methods are never empty (the system catch-all and the
   twenty-one-method catalogue always exist), and Templates is a static
   catalogue — those get `NoResults` for a search that matched nothing, which is
   a different thing and correctly undrawn. */
