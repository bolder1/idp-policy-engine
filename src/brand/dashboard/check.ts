import { WIDGETS } from './catalog'
import { COLS, MAX_COLS, MAX_STACK, ROW_MAX, STEP, colMaxSpan, colMinSpan, rowMaxH, rowMinH, stackHeights, type Row } from './layout'
import { geometry } from './geometry'

/* -----------------------------------------------------------------------------
   The board's position state, checked (owner, 20 Nov 2026: "add state
   management for each interaction and verify the position state").

   Every interaction (a drop, a bar let go, an add, a remove, Arrange, Undo)
   ends in a list of rows. `checkLayout` says whether that list is one the
   board can draw as promised:

   · every row is full: its spans are whole columns and add up to 12;
   · every column sits within its widgets' narrowest and widest, unless it is
     alone in its row (a lone widget always takes the row);
   · every row's height is on the 8 px step and within what its widgets allow;
   · every widget is at least as tall as it reads at;
   · no row has more than six columns, no stack more than three widgets;
   · no id is used twice;
   · drawn (geometry.ts), no two widgets overlap and none leaves the board.

   It returns what is wrong, in words, so a test can print it and the board can
   warn in development. An empty list means the state is sound.
   -------------------------------------------------------------------------- */

export interface Problem {
  /** Which rule: what a test can count by. */
  rule: 'span-sum' | 'span-whole' | 'span-min' | 'span-max' | 'height-step' | 'height-range' | 'cell-short' | 'cell-tall' | 'too-many-columns' | 'stack-full' | 'empty' | 'id-twice' | 'overlap' | 'off-board'
  text: string
}

/** What is wrong with a board's rows, if anything. `width` also checks the drawn board at that width. */
export function checkLayout(rows: readonly Row[], width = 1200): Problem[] {
  const out: Problem[] = []
  const ids = new Set<string>()
  const seen = (id: string) => {
    if (ids.has(id)) out.push({ rule: 'id-twice', text: `${id} is used twice` })
    ids.add(id)
  }
  rows.forEach((row, r) => {
    const name = `Row ${r + 1}`
    seen(row.id)
    if (row.columns.length === 0) out.push({ rule: 'empty', text: `${name} has no columns` })
    if (row.columns.length > MAX_COLS) out.push({ rule: 'too-many-columns', text: `${name} has ${row.columns.length} columns` })
    const total = row.columns.reduce((a, c) => a + c.span, 0)
    if (row.columns.length && total !== COLS) out.push({ rule: 'span-sum', text: `${name} spans ${total} of ${COLS}` })
    if (row.height % STEP !== 0) out.push({ rule: 'height-step', text: `${name} is ${row.height} px, off the ${STEP} px step` })
    const lo = rowMinH(row)
    const hi = rowMaxH(row)
    if (row.height < lo || row.height > Math.max(hi, lo) || row.height > ROW_MAX) out.push({ rule: 'height-range', text: `${name} is ${row.height} px, outside ${lo}–${hi}` })
    row.columns.forEach((col, c) => {
      seen(col.id)
      const where = `${name}, column ${c + 1}`
      if (col.cells.length === 0) out.push({ rule: 'empty', text: `${where} is empty` })
      if (col.cells.length > MAX_STACK) out.push({ rule: 'stack-full', text: `${where} stacks ${col.cells.length}` })
      if (!Number.isInteger(col.span) || col.span < 1) out.push({ rule: 'span-whole', text: `${where} spans ${col.span}` })
      if (row.columns.length > 1) {
        if (col.span < colMinSpan(col)) out.push({ rule: 'span-min', text: `${where} is ${col.span} wide, under its ${colMinSpan(col)}` })
        if (col.span > colMaxSpan(col)) out.push({ rule: 'span-max', text: `${where} is ${col.span} wide, over its ${colMaxSpan(col)}` })
      }
      const px = stackHeights(row, col)
      col.cells.forEach((cell, k) => {
        seen(cell.id)
        const min = WIDGETS[cell.widget].minH
        if (px[k] < min - 1) out.push({ rule: 'cell-short', text: `${WIDGETS[cell.widget].name} is ${Math.round(px[k])} px, under its ${min}` })
        const max = WIDGETS[cell.widget].maxH
        if (px[k] > max + 1) out.push({ rule: 'cell-tall', text: `${WIDGETS[cell.widget].name} is ${Math.round(px[k])} px, over its ${max}` })
      })
    })
  })

  /* Drawn: nothing overlaps, nothing leaves the board. */
  const g = geometry(rows, width, false)
  const boxes = Object.entries(g.cells)
  for (const [id, b] of boxes) {
    if (b.x < 0 || b.x + b.w > width + 0.5 || b.w <= 0 || b.h <= 0) out.push({ rule: 'off-board', text: `${id} is drawn at ${b.x}, ${b.w} wide` })
  }
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const [ia, a] = boxes[i]
      const [ib, b] = boxes[j]
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) out.push({ rule: 'overlap', text: `${ia} overlaps ${ib}` })
    }
  return out
}
