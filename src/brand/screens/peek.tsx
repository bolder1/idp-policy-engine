import { motion } from 'motion/react'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/* -----------------------------------------------------------------------------
   A count you can look inside.

   A table cell saying "3 rules" states a size and hides the answer. The number
   is almost never the question — which three is — and the only way to find out
   was to open the object, read its rules, and come back. On hover the count
   opens a small panel with the rules in it, and the row is left where it was.

   Written once here and used three times: the policies table's own rule count,
   and the "Used by" column on zones and on device profiles. It was Policies'
   private component until those two needed the same thing; the measuring below
   is the part worth not writing twice.

   PLACEMENT IS MEASURED, NOT ESTIMATED.

   The first version guessed the height from the row count and, when the guess
   said there was no room below, flipped by writing `transform: translateY(-100%)`
   into the same style object motion animates `y` through. Motion owns transform
   on an animated element and overwrites it every frame, so the flip never
   applied — a panel that should have opened upwards opened downwards over the
   rows instead. Nothing about that is visible until it is measured.

   So the box renders, `useLayoutEffect` measures it before paint, and top/left
   come from real numbers. No transform involved, nothing for motion to fight.
   -------------------------------------------------------------------------- */

/* Long enough that crossing the column on the way somewhere else does not open
   four of them, short enough not to feel like a wait. */
const PEEK_DELAY = 180

export function Peek({
  label,
  className,
  children,
}: {
  /** What the cell reads when closed — the count itself. */
  label: ReactNode
  className?: string
  /** The panel's contents. Rendered only while open. */
  children: ReactNode
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const timer = useRef<number>(0)
  const [at, setAt] = useState<DOMRect | null>(null)

  const place = () => {
    const el = ref.current
    if (el) setAt(el.getBoundingClientRect())
  }

  const open = () => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(place, PEEK_DELAY)
  }
  const close = () => {
    window.clearTimeout(timer.current)
    setAt(null)
  }

  /* Fixed coordinates go stale the moment anything moves under them, and the
     table itself scrolls. Closing is more honest than chasing. */
  useEffect(() => {
    if (!at) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [at])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  return (
    <>
      <button
        ref={ref}
        type="button"
        className={`${className ?? 'btable__rules'} ${at ? 'is-open' : ''}`}
        onMouseEnter={open}
        onMouseLeave={close}
        onFocus={place}
        onBlur={close}
        aria-expanded={at !== null}
      >
        {label}
      </button>

      {at && createPortal(<PeekPanel anchor={at}>{children}</PeekPanel>, document.body)}
    </>
  )
}

function PeekPanel({ anchor, children }: { anchor: DOMRect; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const gap = 8
    const below = anchor.bottom + gap
    const fitsBelow = below + height <= window.innerHeight - gap
    const fitsAbove = anchor.top - height - gap >= gap
    setPos({
      top:
        fitsBelow || !fitsAbove
          ? Math.min(below, window.innerHeight - height - gap)
          : anchor.top - height - gap,
      left: Math.min(Math.max(gap, anchor.left), window.innerWidth - width - gap),
    })
  }, [anchor])

  return (
    <motion.div
      ref={box}
      className="brpk"
      role="tooltip"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.12 }}
      style={{ top: pos?.top ?? anchor.bottom + 8, left: pos?.left ?? anchor.left }}
    >
      {children}
    </motion.div>
  )
}
