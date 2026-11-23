import { useCallback, useMemo, useState } from 'react'

import { shows } from './rollout'
import { resetSignature } from './screens/paged-list'

/* -----------------------------------------------------------------------------
   One pager for every table (owner, 23 Nov 2026: "add pagination ... change this globally for all the tabs and
   tables. We should have pagination static at the bottom").

   The footer every table already had, with paging on its right: "Rows per page", the range, and the page numbers
   (first, last, the current one and its neighbours, a gap mark between). It sticks to the bottom of the window while
   the table scrolls under it, so the controls are always where the pointer left them.

   Design only (rollout.ts `pagination`). Off, the hook hands back every row and the Pager draws the old footer, so
   Dev handoff and Tester see the page exactly as before.
   -------------------------------------------------------------------------- */

export const PAGINATION: boolean = shows('pagination')

export const PAGE_SIZES = [10, 25, 50, 100] as const

export interface Paged<T> {
  /** This page's rows (every row when paging is off). */
  items: T[]
  total: number
  /** 1-based, already clamped to the last page. */
  page: number
  pages: number
  size: number
  /** 1-based range shown, 0–0 when there is nothing. */
  start: number
  end: number
  setPage: (page: number) => void
  setSize: (size: number) => void
  /** Whether paging is on for this line. */
  on: boolean
}

export type PageMark = number | 'gap'

/* The page buttons: first, last, the current page and one either side. A gap mark stands for two or more pages
   left out; a single missing page is drawn as its number instead, since a gap the size of one button saves nothing. */
export function pageMarks(page: number, pages: number): PageMark[] {
  if (pages <= 5) return Array.from({ length: Math.max(1, pages) }, (_, i) => i + 1)
  const keep = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages))
  const sorted = [...keep].sort((a, b) => a - b)
  const out: PageMark[] = []
  for (const n of sorted) {
    const prev = out[out.length - 1]
    if (typeof prev === 'number' && n - prev === 2) out.push(prev + 1)
    else if (typeof prev === 'number' && n - prev > 2) out.push('gap')
    out.push(n)
  }
  return out
}

/** The page that keeps the row at `firstIndex` (0-based) in view at a new page size. */
export function pageKeeping(firstIndex: number, size: number): number {
  return size > 0 && firstIndex >= 0 ? Math.floor(firstIndex / size) + 1 : 1
}

/* `resetKey`: a search or filter that changes it starts again at page 1. Compared by value, so an inline array is
   fine. Without it, a list that shrinks keeps its page, clamped to the last one. */
export function usePaged<T>(rows: readonly T[], initialSize: number = PAGE_SIZES[0], resetKey?: unknown): Paged<T> {
  const [want, setWant] = useState(1)
  const [size, setSizeState] = useState(initialSize)
  const signature = resetSignature(resetKey)
  const [seen, setSeen] = useState(signature)
  /* Reset during render rather than in an effect, so the stale page never paints. */
  if (seen !== signature) {
    setSeen(signature)
    setWant(1)
  }

  const total = rows.length
  const pages = PAGINATION ? Math.max(1, Math.ceil(total / size)) : 1
  const page = Math.min(Math.max(1, want), pages)

  const setPage = useCallback((p: number) => setWant(Math.max(1, Math.floor(p))), [])
  const setSize = useCallback(
    (next: number) => {
      setWant(pageKeeping((page - 1) * size, next))
      setSizeState(next)
    },
    [page, size],
  )

  const items = useMemo(
    () => (PAGINATION ? rows.slice((page - 1) * size, page * size) : rows.slice()),
    [rows, page, size],
  )
  const start = total === 0 ? 0 : PAGINATION ? (page - 1) * size + 1 : 1
  const end = PAGINATION ? Math.min(total, page * size) : total

  return { items, total, page, pages, size, start, end, setPage, setSize, on: PAGINATION }
}
