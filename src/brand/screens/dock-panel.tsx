import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

import { IconButton } from '../kit'

/* -----------------------------------------------------------------------------
   A panel docked beside a library list.

   The policy builder's inspector, on a list page (owner, 16 Sep 2026: "an
   inline slider like we have in the policy builder, the right side
   configuration"). It was a kit `Drawer` — a modal over a dimmed page — for a
   question you ask while looking AT the list: which rules name this zone, this
   profile. A scrim put the list behind glass, and the drawer, rendered inside a
   paged page, was being shrunk to its content by the pager's alignment rule.

   So it is the inspector's shape instead: a card in a column of its own, beside
   the list rather than over it, from the bar down to the pager. The list gives
   the panel its width and keeps working — another row's "Used by" swaps what
   the panel shows, and the row it is about stays marked. Not modal: no scrim,
   no focus trap. Escape inside it, or its close button, shuts it.

   Layout is the page's: a page adds `has-dock` while the panel shows, and
   screens.css gives the list and the panel their columns. The panel must come
   BEFORE the list in the DOM — the paged-list hook counts every element after
   the rows as space the rows cannot have.
   -------------------------------------------------------------------------- */

export function DockPanel({
  title,
  caption,
  subject,
  onClose,
  children,
}: {
  title: string
  caption?: string
  /** What the panel is about — an id. Focus moves into the panel whenever it
      changes, as it does when another row's menu opens it. */
  subject: string
  onClose: () => void
  children: ReactNode
}) {
  const headingId = useId()
  const panel = useRef<HTMLElement | null>(null)
  const heading = useRef<HTMLHeadingElement | null>(null)
  /* The control that opened the panel — the row menu's trigger, which the menu
     refocuses before it acts — so closing can put focus back there. */
  const returnTo = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const from = document.activeElement
    if (from instanceof HTMLElement && !panel.current?.contains(from)) returnTo.current = from
    heading.current?.focus({ preventScroll: true })
  }, [subject])

  /* On close, only if focus was in the panel: a panel shut because its row was
     deleted must not pull focus away from wherever the page put it.

     Checked again on the timer, against the panel itself: StrictMode runs this
     cleanup once on mount without removing anything, and restoring then took
     focus straight back out of a panel that had just opened. */
  useEffect(() => {
    const node = panel.current
    return () => {
      const active = document.activeElement
      const inside = !active || active === document.body || (node?.contains(active) ?? false)
      if (!inside) return
      window.setTimeout(() => {
        const back = returnTo.current
        if (node?.isConnected || !back?.isConnected) return
        back.focus({ preventScroll: true })
      }, 0)
    }
  }, [])

  return (
    <aside
      ref={panel}
      className="bdock"
      aria-labelledby={headingId}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        e.stopPropagation()
        onClose()
      }}
    >
      <header className="bdock__head">
        <div className="bdock__title">
          <h2 id={headingId} ref={heading} tabIndex={-1}>
            {title}
          </h2>
          {caption && <p>{caption}</p>}
        </div>
        <IconButton icon={X} label={`Close ${title}`} tone="ghost" size="sm" onClick={onClose} />
      </header>
      <div className="bdock__body">{children}</div>
    </aside>
  )
}
