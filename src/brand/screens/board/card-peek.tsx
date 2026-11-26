import { useEffect, useRef, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'

import { AnchoredPopover } from '../testing/AnchoredPopover'
import { getPeek, setPeek, usePeek } from './card-peek-store'
import './card-peek.css'

/* -----------------------------------------------------------------------------
   One chip on a rule card that opens a peek (card-peek-store.ts, rollout `cardPeeks`).

   Hover a moment and the peek shows; move off and it goes, unless the pointer went into the peek itself. A click pins it:
   it stays until Esc, a click elsewhere, or the chip again, and other chips' hovers leave it alone. The click is the
   chip's own, so it does not open the rule's panel underneath. Keyboard: Enter or Space pins, Esc closes.
   -------------------------------------------------------------------------- */

/** A beat before a hover opens a peek, so sweeping the pointer across a card opens nothing; and a beat before it closes,
 *  so the pointer can travel from the chip into the peek. */
const SHOW_MS = 300
const HIDE_MS = 160

export function PeekTrigger({
  id,
  label,
  children,
  content,
  wide = false,
}: {
  /** Unique on the canvas: the rule and the part ("r12:who", "r12:c3", "r12:then"). */
  id: string
  /** The peek's name, and the chip's: "Who: 2 groups and 1 person". */
  label: string
  children: ReactNode
  /** Drawn only while open. */
  content: () => ReactNode
  /** A condition's values span a run of chips, so the trigger is a row of them. */
  wide?: boolean
}) {
  const ref = useRef<HTMLSpanElement | null>(null)
  const peek = usePeek()
  const isOpen = peek?.id === id
  const pinned = isOpen && peek.pinned
  const showT = useRef<number | undefined>(undefined)
  const hideT = useRef<number | undefined>(undefined)
  useEffect(
    () => () => {
      window.clearTimeout(showT.current)
      window.clearTimeout(hideT.current)
    },
    [],
  )

  const enter = () => {
    window.clearTimeout(hideT.current)
    const now = getPeek()
    if (now?.pinned || now?.id === id) return
    showT.current = window.setTimeout(() => {
      if (!getPeek()?.pinned) setPeek({ id, pinned: false })
    }, SHOW_MS)
  }
  const leave = () => {
    window.clearTimeout(showT.current)
    hideT.current = window.setTimeout(() => {
      const now = getPeek()
      if (now?.id === id && !now.pinned) setPeek(null)
    }, HIDE_MS)
  }
  const toggle = (e: MouseEvent | KeyboardEvent) => {
    /* The chip's press, not the card's: it would open the rule's panel. */
    e.stopPropagation()
    window.clearTimeout(showT.current)
    window.clearTimeout(hideT.current)
    setPeek(pinned ? null : { id, pinned: true })
  }

  return (
    <>
      <span
        ref={ref}
        role="button"
        tabIndex={0}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={label}
        className={`bpeek-t${wide ? ' is-wide' : ''}${isOpen ? ' is-open' : ''}${pinned ? ' is-pinned' : ''}`}
        onMouseEnter={enter}
        onMouseLeave={leave}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            toggle(e)
          } else if (e.key === 'Escape' && isOpen) {
            e.stopPropagation()
            setPeek(null)
          }
        }}
      >
        {children}
      </span>
      <AnchoredPopover
        anchor={ref}
        open={isOpen}
        onClose={() => {
          if (getPeek()?.id === id) setPeek(null)
        }}
        label={label}
        width={312}
        focusFirst={false}
        follow
        beside
        className={`bpeek${pinned ? ' is-pinned' : ''}`}
      >
        {/* The pointer may travel into the peek: while it is inside, a hover peek stays. */}
        <div
          className="bpeek__in"
          onMouseEnter={() => window.clearTimeout(hideT.current)}
          onMouseLeave={() => {
            if (!getPeek()?.pinned) leave()
          }}
        >
          {isOpen && content()}
        </div>
      </AnchoredPopover>
    </>
  )
}
