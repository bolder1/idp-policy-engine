import { useRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { IconButton } from '../kit'

/* The pager under a library list, the live console's shape: "1–8 of 19" and a
   previous and a next arrow. Both arrows stay in place at the ends, disabled,
   so the control never shifts under the pointer.

   Reaching the first or last page disables the arrow that was just pressed,
   and a disabled button drops keyboard focus to <body>. Focus moves to the
   other arrow instead, so the pager can be walked both ways from the keys. */
export function ListPager({
  start,
  end,
  total,
  page,
  pageCount,
  onPrev,
  onNext,
  label = 'Pages',
}: {
  start: number
  end: number
  total: number
  page: number
  pageCount: number
  onPrev: () => void
  onNext: () => void
  label?: string
}) {
  const nav = useRef<HTMLElement | null>(null)
  if (total === 0) return null

  const go = (dir: -1 | 1) => {
    const hadFocus = !!nav.current?.contains(document.activeElement)
    const hitsEdge = dir < 0 ? page - 1 <= 1 : page + 1 >= pageCount
    if (dir < 0) onPrev()
    else onNext()
    if (!hadFocus || !hitsEdge) return
    window.setTimeout(() => {
      const buttons = nav.current?.querySelectorAll<HTMLButtonElement>('button')
      const other = buttons?.[dir < 0 ? 1 : 0]
      if (other && !other.disabled) other.focus({ preventScroll: true })
    }, 0)
  }

  return (
    <nav className="blist__pager" aria-label={label} ref={nav}>
      <span className="blist__range" aria-live="polite">
        {start}–{end} of {total}
      </span>
      <IconButton icon={ChevronLeft} label="Previous page" size="sm" tone="ghost" disabled={page <= 1} onClick={() => go(-1)} />
      <IconButton
        icon={ChevronRight}
        label="Next page"
        size="sm"
        tone="ghost"
        disabled={page >= pageCount}
        onClick={() => go(1)}
      />
    </nav>
  )
}
