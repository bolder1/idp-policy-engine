import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

/* -----------------------------------------------------------------------------
   A library list that fits the window.

   Zones, Device profiles, Risk signal profiles, Applications and Display tokens
   show as many rows as fit below their bar, and page through the rest, so the
   page itself never scrolls. (Authentication methods paged too until 15 Sep
   2026; it is one full list now, on the owner's word.) Every row has a fixed
   height in its view (`libRowHeight`, or the page's own constant), which is what
   makes "how many fit" a division rather than a guess; a card grid pages whole
   lines (`grid`).

   The space is measured inside the shell's scrolling column: from the top of
   the list to the bottom of that column, less the pager and the page's bottom
   padding. Recomputed when the column resizes, and when the list moves (a
   callout above it appears, the toolbar wraps).

   Usage:

     const paged = usePagedList(shown, { rowHeight: 84, resetKey: [q, kind] })
     <ul className="blist blist--paged" ref={paged.listRef}>
       {paged.pageRows.map(...)}
     </ul>
     <ListPager {...paged.pager} />
   -------------------------------------------------------------------------- */

/** What sits below the list before the pager has rendered: its row and a gap. */
const PAGER_FALLBACK = 56 + 16
/** Never page fewer rows than this, however short the window is. */
export const MIN_ROWS = 3

export function rowsThatFit(available: number, rowHeight: number): number {
  if (!(available > 0) || !(rowHeight > 0)) return MIN_ROWS
  return Math.max(MIN_ROWS, Math.floor(available / rowHeight))
}

/* Cards on a page: whole lines of the grid that fit, times the cards on a line.

   The floor is MIN_ROWS ITEMS, not rows. `rowsThatFit`'s floor of three is
   right for an 84px list row and wrong for a 150px line of cards: where two
   lines fit it still asked for three, and the pager went under the fold. At
   least one line always shows. */
export function cardsThatFit(available: number, lineHeight: number, perLine: number): number {
  const cols = perLine > 0 ? Math.floor(perLine) : 1
  const lines = !(available > 0) || !(lineHeight > 0) ? 1 : Math.max(1, Math.floor(available / lineHeight))
  return Math.max(MIN_ROWS, lines * cols)
}

export function pageSlice<T>(items: T[], page: number, size: number) {
  const safeSize = size > 0 ? Math.floor(size) : MIN_ROWS
  const total = items.length
  const pageCount = Math.max(1, Math.ceil(total / safeSize))
  const current = Math.min(Math.max(1, Number.isFinite(page) ? Math.floor(page) : 1), pageCount)
  const from = (current - 1) * safeSize
  const rows = items.slice(from, from + safeSize)
  return {
    rows,
    page: current,
    pageCount,
    total,
    /** 1-based, 0 when there is nothing. */
    start: total === 0 ? 0 : from + 1,
    end: from + rows.length,
  }
}

/* What "the search or filter changed" compares.

   `resetKey` is usually written inline — `[q, kind]` — which is a new array on
   every render. Compared by identity, that reset the page on every render and
   the Next arrow could never leave page 1. Compared by value instead. */
export function resetSignature(key: unknown): string {
  if (key === undefined) return ''
  try {
    return JSON.stringify(key, (_k, v) => (v instanceof Set ? [...v] : v)) ?? String(key)
  } catch {
    return String(key)
  }
}

/** The page that keeps a row in view after the page size changes. */
export function pageForRow(firstRowIndex: number, size: number): number {
  if (!(size > 0) || !(firstRowIndex >= 0)) return 1
  return Math.floor(firstRowIndex / size) + 1
}

const px = (v: string) => parseFloat(v) || 0

/* Everything below the list's rows, down to the bottom of the scrolling column:
   the list's own bottom border, whatever follows it (the pager and the gap to
   it), and every wrapper's bottom padding on the way up.

   Measured rather than assumed. A fixed allowance of 80px was 34px short on
   Zones (15px gap, 43px pager, 56px page padding), so one row too many was
   shown and the page scrolled by exactly that much.

   Counted from the followers' own HEIGHTS and the container's gap, not from
   where they sit (16 Sep 2026). The pager is pushed to the bottom of the
   window now, so its position says how much room is free rather than how much
   it takes — read that way, a short list measured "no room" and shrank to the
   floor, which pushed the pager further down, which left even less. */
function spaceBelowRows(list: HTMLElement, column: HTMLElement | null): number {
  const own = getComputedStyle(list)
  let space = px(own.borderTopWidth) + px(own.borderBottomWidth) + px(own.paddingTop) + px(own.paddingBottom)
  /* The pager's allowance before it has rendered — added once, at the end, and
     only if nothing followed the rows at ANY level. It was added whenever the
     rows' own element had no sibling, which is always true of a table's tbody,
     so the table view counted its pager twice and showed a row too few. */
  let followed = false
  let el: HTMLElement = list
  while (el.parentElement && el !== column) {
    const parent: HTMLElement = el.parentElement
    const pcs = getComputedStyle(parent)
    /* `normal` in a block box reads as 0, which is what it is there. */
    const gap = px(pcs.rowGap)
    let below = px(getComputedStyle(el).marginBottom)
    for (let s = el.nextElementSibling; s; s = s.nextElementSibling) {
      const cs = getComputedStyle(s)
      if (cs.position === 'absolute' || cs.position === 'fixed' || cs.display === 'none') continue
      below += gap + px(cs.marginTop) + s.getBoundingClientRect().height + px(cs.marginBottom)
      followed = true
    }
    space += below + px(pcs.paddingBottom) + px(pcs.borderBottomWidth)
    el = parent
  }
  return followed ? space : space + PAGER_FALLBACK
}

/* How many items a grid lays on one line, read from the grid itself. The card
   view is `auto-fill`, so the answer changes with the column's width and only
   the browser knows it. */
function gridColumns(el: HTMLElement): number {
  const cols = getComputedStyle(el).gridTemplateColumns
  if (!cols || cols === 'none') return 1
  return Math.max(1, cols.split(' ').filter(Boolean).length)
}

export function usePagedList<T>(
  items: T[],
  opts: {
    rowHeight: number
    resetKey?: unknown
    /** The list is a grid of cards: a "row" holds as many items as the grid
        has columns, so a page is rows that fit × columns. */
    grid?: boolean
  },
) {
  const nodeRef = useRef<HTMLElement | null>(null)
  const [node, setNode] = useState<HTMLElement | null>(null)
  const [size, setSize] = useState(8)
  const [page, setPage] = useState(1)

  /* A callback ref, so a list that mounts later — after an empty state or a
     no-matches block gives way to it — is still observed. Typed on HTMLElement
     so it attaches to a <ul> or an <ol> without a cast. */
  const listRef = useCallback((el: HTMLElement | null) => {
    nodeRef.current = el
    setNode(el)
  }, [])

  /* The committed size and page, for `measure`, which runs outside render. */
  const sizeRef = useRef(size)
  const pageRef = useRef(page)
  useLayoutEffect(() => {
    sizeRef.current = size
    pageRef.current = page
  })

  const measure = useCallback(() => {
    const list = nodeRef.current
    if (!list) return
    const column = list.closest('.bshell__main') as HTMLElement | null
    const bottom = column ? column.getBoundingClientRect().bottom : window.innerHeight
    /* From where the list sits with the column scrolled to the top, so a page
       left scrolled does not read as extra room. */
    const top = list.getBoundingClientRect().top + (column?.scrollTop ?? 0)
    const available = bottom - top - spaceBelowRows(list, column)
    const next = opts.grid
      ? cardsThatFit(available, opts.rowHeight, gridColumns(list))
      : rowsThatFit(available, opts.rowHeight)
    const was = sizeRef.current
    if (next === was) return
    sizeRef.current = next
    setSize(next)
    /* Keep the first row on screen in view rather than jumping to whatever the
       old page number now points at. */
    const nextPage = pageForRow((pageRef.current - 1) * was, next)
    pageRef.current = nextPage
    setPage(nextPage)
  }, [opts.rowHeight, opts.grid])

  useLayoutEffect(() => {
    measure()
  })

  useEffect(() => {
    if (!node) return
    const column = node.closest('.bshell__main')
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => measure())
    if (ro && column) ro.observe(column)
    if (ro && node.parentElement) ro.observe(node.parentElement)
    window.addEventListener('resize', measure)
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [node, measure])

  /* A new search or filter starts again at the first page. */
  const signature = resetSignature(opts.resetKey)
  useEffect(() => {
    setPage(1)
  }, [signature])

  const slice = useMemo(() => pageSlice(items, page, size), [items, page, size])

  /* Deleting the last rows of the last page never leaves an empty page. */
  useEffect(() => {
    if (slice.page !== page) setPage(slice.page)
  }, [slice.page, page])

  const pageCount = slice.pageCount
  const prev = useCallback(() => setPage((p) => Math.max(1, p - 1)), [])
  const next = useCallback(() => setPage((p) => Math.min(pageCount, p + 1)), [pageCount])

  return {
    /** Attach to the list element: `<ul ref={paged.listRef}>`. */
    listRef,
    ...slice,
    /** The rows to render: only this page's. */
    pageRows: slice.rows,
    size,
    prev,
    next,
    /** Everything ListPager needs: `<ListPager {...paged.pager} />`. */
    pager: {
      start: slice.start,
      end: slice.end,
      total: slice.total,
      page: slice.page,
      pageCount: slice.pageCount,
      onPrev: prev,
      onNext: next,
    },
  }
}
