import { WIDGETS } from './catalog'
import { COLS, colMaxSpan, colMinSpan, tidyRow, type Row } from './layout'

/* -----------------------------------------------------------------------------
   Row splits (owner, 20 Nov 2026: "Row splits", in place of Small, Medium and
   Large on each widget, which "don't fit well").

   A row is the board's unit: it always fills twelve columns and shares one
   height. So a row is shaped as a whole, by picking how its width is shared:
   halves, two thirds and a third, three equal, and so on, drawn as small
   diagrams. Only the splits its widgets can take are offered; the rest are
   shown faint, with the widget that holds them back named.
   -------------------------------------------------------------------------- */

export interface Split {
  /** Columns of 12, left to right. */
  spans: number[]
  /** Said to a screen reader and in the tooltip. */
  name: string
}

/** The splits a row of `n` widgets can be shaped into, evenly first. */
export function splitsOf(n: number): Split[] {
  if (n === 2)
    return [
      { spans: [6, 6], name: 'Halves' },
      { spans: [8, 4], name: 'Two thirds and a third' },
      { spans: [4, 8], name: 'A third and two thirds' },
      { spans: [9, 3], name: 'Three quarters and a quarter' },
      { spans: [3, 9], name: 'A quarter and three quarters' },
    ]
  if (n === 3)
    return [
      { spans: [4, 4, 4], name: 'Thirds' },
      { spans: [6, 3, 3], name: 'A half, then two quarters' },
      { spans: [3, 6, 3], name: 'A half in the middle' },
      { spans: [3, 3, 6], name: 'Two quarters, then a half' },
    ]
  if (n === 4)
    return [
      { spans: [3, 3, 3, 3], name: 'Quarters' },
      { spans: [4, 2, 2, 4], name: 'Wide at the ends' },
      { spans: [2, 4, 4, 2], name: 'Wide in the middle' },
    ]
  if (n === 6) return [{ spans: [2, 2, 2, 2, 2, 2], name: 'Sixths' }]
  return []
}

export interface SplitChoice extends Split {
  /** The row is shaped like this now. */
  on: boolean
  /** Why its widgets cannot take it, where they cannot. */
  why: string | null
}

/** A row's splits: which it has now, and why any it cannot take. */
export function splitChoices(row: Row): SplitChoice[] {
  return splitsOf(row.columns.length).map((s) => {
    const on = s.spans.every((x, i) => row.columns[i].span === x)
    let why: string | null = null
    row.columns.some((c, i) => {
      const name = WIDGETS[c.cells[0].widget].name
      if (s.spans[i] < colMinSpan(c)) why = `${name} cannot be that narrow`
      else if (s.spans[i] > colMaxSpan(c)) why = `${name} cannot be that wide`
      return why !== null
    })
    return { ...s, on, why }
  })
}

/** The row shaped by a split, or null where its widgets cannot take it or it is shaped so already. */
export function applySplit(row: Row, spans: readonly number[]): Row | null {
  if (spans.length !== row.columns.length || spans.reduce((a, b) => a + b, 0) !== COLS) return null
  if (row.columns.some((c, i) => spans[i] < colMinSpan(c) || spans[i] > colMaxSpan(c))) return null
  if (row.columns.every((c, i) => c.span === spans[i])) return null
  return tidyRow({ ...row, columns: row.columns.map((c, i) => ({ ...c, span: spans[i] })) })
}
