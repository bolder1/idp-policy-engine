import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { IconButton } from './kit'
import { Picker } from './picker'
import { PAGE_SIZES, pageMarks, type Paged } from './pager-state'
import './pager.css'

/* The shared table footer with paging. The hook, the gate and the page arithmetic are in pager-state.ts. */

const SIZE_OPTIONS = PAGE_SIZES.map((n) => ({ value: String(n), label: String(n) }))

/* The footer. Children are the table's own summary, on the left. `alone`: it sits under a list rather than inside a
   table card (the library pages, whose rows come in more than one view), so it draws its own edge. */
export function Pager<T>({
  paged,
  label = 'Pages',
  alone = false,
  children,
}: {
  paged: Paged<T>
  label?: string
  alone?: boolean
  children?: ReactNode
}) {
  if (!paged.on) return children == null || children === false ? null : <footer className="btable__foot">{children}</footer>

  const { page, pages, size, start, end, total, setPage, setSize } = paged
  return (
    <footer className={alone ? 'bpager bpager--alone blist__pager' : 'bpager'}>
      <div className="bpager__summary">{children}</div>
      <div className="bpager__controls">
        <span className="bpager__rows">
          <span className="bpager__label" aria-hidden>
            Rows per page
          </span>
          <Picker label="Rows per page" value={String(size)} options={SIZE_OPTIONS} onChange={(v) => setSize(Number(v))} searchable={false} />
        </span>
        <span className="bpager__range" aria-live="polite">
          {start}–{end} of {total}
        </span>
        <nav className="bpager__pages" aria-label={label}>
          <IconButton icon={ChevronLeft} label="Previous page" size="sm" tone="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)} />
          {pageMarks(page, pages).map((m, i) =>
            m === 'gap' ? (
              <span key={`gap-${i}`} className="bpager__gap" aria-hidden>
                …
              </span>
            ) : (
              <button
                key={m}
                type="button"
                className={m === page ? 'bpager__page is-on' : 'bpager__page'}
                aria-current={m === page ? 'page' : undefined}
                aria-label={`Page ${m}`}
                onClick={() => setPage(m)}
              >
                {m}
              </button>
            ),
          )}
          <IconButton icon={ChevronRight} label="Next page" size="sm" tone="ghost" disabled={page >= pages} onClick={() => setPage(page + 1)} />
        </nav>
      </div>
    </footer>
  )
}
