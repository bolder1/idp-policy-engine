import { CATEGORIES, WIDGETS, type WidgetId } from './catalog'
import type { ThemeId } from './themes'

/* -----------------------------------------------------------------------------
   The Dashboard's layout (owner, 19 Nov 2026: "make things in one grid … add
   a bar in the middle of each element … the user can either manage the whole
   row or whole column together … visually balanced … max and min width").

   A board is rows, top to bottom. A row is columns, left to right, that always
   fill its width: their spans add up to 12. A column holds one widget, or a
   few stacked. So:
   · a row has one height, shared by everything in it;
   · a column has one width, shared by everything stacked in it;
   · between two columns, two stacked widgets, or under a row, is a bar that
     moves width or height from one side to the other and nothing else.

   Nothing here can leave a hole or a widget smaller than it reads at: every
   change goes through `tidyRow`, which holds each widget to its minimum and
   maximum (catalog.ts) and keeps the row full.

   When a widget joins or leaves a row, the row evens out its widths: balance
   is the default, and a bar is how it is made uneven on purpose.

   Pure functions; every one returns new rows.
   -------------------------------------------------------------------------- */

export const COLS = 12
export const GAP = 16
/** Heights move in steps of this many pixels. */
export const STEP = 8
export const ROW_MAX = 800
export const MAX_COLS = 6
export const MAX_STACK = 3

export interface Cell {
  id: string
  widget: WidgetId
  /** Its share of the column's height, against the other cells stacked with it. */
  weight: number
  view?: string
  pick?: string
  /** Its own colour theme; absent, it follows the dashboard's. */
  color?: ThemeId
}

export interface Column {
  id: string
  /** Columns of 12. */
  span: number
  cells: Cell[]
}

export interface Row {
  id: string
  /** Pixels. */
  height: number
  columns: Column[]
}

/* The same shapes without ids: what a template or a saved layout holds. */
export type CellSpec = Omit<Cell, 'id' | 'weight'> & { weight?: number }
export interface ColumnSpec {
  span: number
  cells: CellSpec[]
}
export interface RowSpec {
  height: number
  columns: ColumnSpec[]
}

let seq = 0
export const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}${(seq++).toString(36)}`

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0)
export const snapH = (h: number) => Math.round(h / STEP) * STEP

/* ---- what each part allows ----------------------------------------------------------------------------------- */

const meta = (w: WidgetId) => WIDGETS[w]

export const colMinSpan = (c: Pick<Column, 'cells'>) => Math.max(1, ...c.cells.map((x) => meta(x.widget).minW))
export const colMaxSpan = (c: Pick<Column, 'cells'>) => Math.max(colMinSpan(c), Math.min(COLS, ...c.cells.map((x) => meta(x.widget).maxW)))
export const colMinH = (c: Pick<Column, 'cells'>) => sum(c.cells.map((x) => meta(x.widget).minH)) + GAP * (c.cells.length - 1)
const colMaxH = (c: Pick<Column, 'cells'>) => sum(c.cells.map((x) => meta(x.widget).maxH)) + GAP * (c.cells.length - 1)
const colNaturalH = (c: Pick<Column, 'cells'>) => sum(c.cells.map((x) => meta(x.widget).h)) + GAP * (c.cells.length - 1)

export const rowMinH = (r: Pick<Row, 'columns'>) => Math.max(0, ...r.columns.map(colMinH))
export const rowMaxH = (r: Pick<Row, 'columns'>) => Math.max(rowMinH(r), Math.min(ROW_MAX, ...r.columns.map(colMaxH)))
/** The tallest the row can go before some widget in it is stretched past what it reads at. Unlike `rowMaxH`, it is not
    raised to the row's minimum, so a row whose minimum is over it is one that cannot be drawn well. */
export const rowCeil = (r: Pick<Row, 'columns'>) => Math.min(ROW_MAX, ...r.columns.map(colMaxH))
/** A row every widget in it reads well in: it can be as tall as its tallest needs without stretching another. */
export const rowFits = (r: Pick<Row, 'columns'>) => rowMinH(r) <= rowCeil(r)

/** The height its widgets arrive at: the tallest column's. */
export const rowNaturalH = (r: Pick<Row, 'columns'>) => clamp(snapH(Math.max(0, ...r.columns.map(colNaturalH))), rowMinH(r), rowMaxH(r))

/* ---- keeping a row whole ----------------------------------------------------------------------------------- */

/** Spans as even as the columns allow, adding up to 12. A lone column takes the row. */
export function evenSpans(cols: readonly Pick<Column, 'cells'>[]): number[] {
  const n = cols.length
  if (n === 0) return []
  if (n === 1) return [COLS]
  const lo = cols.map(colMinSpan)
  const hi = cols.map(colMaxSpan)
  const out = [...lo]
  /* One column at a time to whichever is narrowest and can still grow; ties go left. */
  for (let left = COLS - sum(out); left > 0; left--) {
    let pick = -1
    for (let i = 0; i < n; i++) if (out[i] < hi[i] && (pick < 0 || out[i] < out[pick])) pick = i
    if (pick < 0) pick = out.indexOf(Math.min(...out))
    out[pick]++
  }
  return out
}

/** The spans asked for, held to each column's limits and made to add up to 12 again. */
function fitSpans(cols: readonly Column[]): number[] {
  const n = cols.length
  if (n <= 1) return n ? [COLS] : []
  const lo = cols.map(colMinSpan)
  const hi = cols.map(colMaxSpan)
  const out = cols.map((c, i) => clamp(Math.round(c.span) || lo[i], lo[i], hi[i]))
  let diff = COLS - sum(out)
  /* Too wide: take from the widest that can give. Too narrow: give to the narrowest that can take. */
  while (diff < 0) {
    let pick = -1
    for (let i = 0; i < n; i++) if (out[i] > lo[i] && (pick < 0 || out[i] > out[pick])) pick = i
    if (pick < 0) break
    out[pick]--
    diff++
  }
  while (diff > 0) {
    let pick = -1
    for (let i = 0; i < n; i++) if (out[i] < hi[i] && (pick < 0 || out[i] < out[pick])) pick = i
    if (pick < 0) pick = out.indexOf(Math.min(...out))
    out[pick]++
    diff--
  }
  return out
}

/** A stack's cells given heights that add up to the row's and never go under their minimum. Weights are pixels. */
function fitStack(cells: readonly Cell[], height: number): Cell[] {
  if (cells.length <= 1) return cells.map((c) => ({ ...c, weight: 1 }))
  const avail = height - GAP * (cells.length - 1)
  const mins = cells.map((c) => meta(c.widget).minH)
  const maxs = cells.map((c) => meta(c.widget).maxH)
  const total = sum(cells.map((c) => (c.weight > 0 ? c.weight : 1)))
  let px = cells.map((c) => ((c.weight > 0 ? c.weight : 1) / total) * avail)
  /* Each cell held between its shortest and tallest; what that frees or takes is shared by the cells that still have
     room, in proportion, until it all fits (a few passes settle it). */
  for (let pass = 0; pass < 6; pass++) {
    px = px.map((p, i) => clamp(p, mins[i], maxs[i]))
    const diff = avail - sum(px)
    if (Math.abs(diff) <= 0.5) break
    const open = px.map((p, i) => (diff > 0 ? maxs[i] - p : p - mins[i]))
    const room = sum(open.map((o) => Math.max(0, o)))
    if (room <= 0) break
    px = px.map((p, i) => p + (diff * Math.max(0, open[i])) / room)
  }
  return cells.map((c, i) => ({ ...c, weight: Math.round(px[i]) }))
}

/** A row made whole: no empty columns, spans within limits and adding up to 12, a height everything fits in. */
export function tidyRow(row: Row): Row {
  const cols = row.columns.filter((c) => c.cells.length > 0)
  const spans = fitSpans(cols)
  const shape = { columns: cols }
  const height = clamp(snapH(row.height || rowNaturalH(shape)), rowMinH(shape), rowMaxH(shape))
  return { ...row, height, columns: cols.map((c, i) => ({ ...c, span: spans[i], cells: fitStack(c.cells, height) })) }
}

/** Rows made whole. A row with too many columns for its widths moves the extra ones to a row of their own below. */
export function tidyRows(rows: readonly Row[]): Row[] {
  const out: Row[] = []
  for (const row of rows) {
    const cols = row.columns.filter((c) => c.cells.length > 0)
    if (cols.length === 0) continue
    let first = cols
    const rest: Column[] = []
    while (first.length > 1 && (first.length > MAX_COLS || sum(first.map(colMinSpan)) > COLS)) {
      rest.unshift(first[first.length - 1])
      first = first.slice(0, -1)
    }
    /* A row that would stretch a widget past its tallest (a number beside a chart, from an older board or a template)
       lets the columns that need the most height go to a row of their own below, so nothing is drawn emptier than it
       reads (owner, 20 Nov 2026). */
    while (first.length > 1 && !rowFits({ columns: first })) {
      const ceil = Math.min(...first.map(colMaxH))
      const tall = first.filter((c) => colMinH(c) > ceil)
      const keep = first.filter((c) => colMinH(c) <= ceil)
      if (!tall.length || !keep.length) break
      rest.unshift(...tall)
      first = keep
    }
    out.push(tidyRow({ ...row, columns: first.length === cols.length ? first : withEven(first) }))
    if (rest.length) out.push(...tidyRows([{ id: newId('r'), height: row.height, columns: withEven(rest) }]))
  }
  return out
}

const withEven = (cols: Column[]): Column[] => {
  const spans = evenSpans(cols)
  return cols.map((c, i) => ({ ...c, span: spans[i] }))
}

/** The row with its widths evened out. */
export const evenRow = (row: Row): Row => tidyRow({ ...row, columns: withEven(row.columns) })

/* ---- the bars ------------------------------------------------------------------------------------------------- */

/** How wide the column left of bar `i` can go, with the column right of it taking the rest of their two. */
export function colRange(row: Row, i: number): { lo: number; hi: number } {
  const a = row.columns[i]
  const b = row.columns[i + 1]
  if (!a || !b) return { lo: a?.span ?? 0, hi: a?.span ?? 0 }
  const total = a.span + b.span
  return { lo: Math.max(colMinSpan(a), total - colMaxSpan(b)), hi: Math.min(colMaxSpan(a), total - colMinSpan(b)) }
}

/** Bar `i` moved so the column left of it is `span` wide. Only its two neighbours change. */
export function setBoundary(row: Row, i: number, span: number): Row {
  const { lo, hi } = colRange(row, i)
  const a = row.columns[i]
  const b = row.columns[i + 1]
  if (!a || !b) return row
  const left = clamp(Math.round(span), lo, hi)
  const total = a.span + b.span
  return { ...row, columns: row.columns.map((c, k) => (k === i ? { ...c, span: left } : k === i + 1 ? { ...c, span: total - left } : c)) }
}

export const setRowHeight = (row: Row, height: number): Row => tidyRow({ ...row, height: clamp(snapH(height), rowMinH(row), rowMaxH(row)) })

/** Each stacked cell's height in pixels, in the row as it is. */
export function stackHeights(row: Row, col: Column): number[] {
  const avail = row.height - GAP * (col.cells.length - 1)
  const total = sum(col.cells.map((c) => c.weight)) || 1
  return col.cells.map((c) => (c.weight / total) * avail)
}

/** How tall cell `k` of a stack can go, with the cell under it taking the rest of their two. */
export function stackRange(row: Row, c: number, k: number): { lo: number; hi: number; now: number } {
  const col = row.columns[c]
  const px = stackHeights(row, col)
  const a = col.cells[k]
  const b = col.cells[k + 1]
  if (!a || !b) return { lo: px[k] ?? 0, hi: px[k] ?? 0, now: px[k] ?? 0 }
  const pair = px[k] + px[k + 1]
  return { lo: Math.max(meta(a.widget).minH, pair - meta(b.widget).maxH), hi: Math.min(meta(a.widget).maxH, pair - meta(b.widget).minH), now: px[k] }
}

/** The bar under stacked cell `k` moved so that cell is `height` tall. Only its two neighbours change. */
export function setStackSplit(row: Row, c: number, k: number, height: number): Row {
  const col = row.columns[c]
  if (!col || !col.cells[k + 1]) return row
  const px = stackHeights(row, col)
  const { lo, hi } = stackRange(row, c, k)
  const top = clamp(Math.round(height), lo, hi)
  const pair = px[k] + px[k + 1]
  const cells = col.cells.map((cell, i) => ({ ...cell, weight: Math.round(i === k ? top : i === k + 1 ? pair - top : px[i]) }))
  return { ...row, columns: row.columns.map((x, i) => (i === c ? { ...x, cells } : x)) }
}

/* ---- finding things ------------------------------------------------------------------------------------------ */

export function findCell(rows: readonly Row[], id: string): { r: number; c: number; k: number } | null {
  for (let r = 0; r < rows.length; r++)
    for (let c = 0; c < rows[r].columns.length; c++) {
      const k = rows[r].columns[c].cells.findIndex((x) => x.id === id)
      if (k >= 0) return { r, c, k }
    }
  return null
}

export const allCells = (rows: readonly Row[]): Cell[] => rows.flatMap((r) => r.columns.flatMap((c) => c.cells))

export const hasWidget = (rows: readonly Row[], widget: WidgetId) => allCells(rows).some((c) => c.widget === widget)

/* ---- moving and placing ---------------------------------------------------------------------------------------- */

/** Where a widget can go: a row of its own, a column in a row, a place in a stack, or another widget's place. */
export type Target =
  | { at: 'row'; before: string | null }
  | { at: 'column'; row: string; before: string | null }
  | { at: 'stack'; column: string; before: string | null }
  | { at: 'swap'; cell: string }

export const moveRow = (rows: readonly Row[], from: number, to: number): Row[] => {
  if (from === to || from < 0 || from >= rows.length) return [...rows]
  const next = [...rows]
  const [row] = next.splice(from, 1)
  next.splice(clamp(to, 0, next.length), 0, row)
  return next
}

export const removeRow = (rows: readonly Row[], id: string): Row[] => rows.filter((r) => r.id !== id)

/** The cell taken out. Its column goes if it was the last in it, and that row evens out; its row goes if it was the last. */
export function removeCell(rows: readonly Row[], id: string): Row[] {
  const at = findCell(rows, id)
  if (!at) return [...rows]
  return rows.flatMap((row, r) => {
    if (r !== at.r) return [row]
    const col = row.columns[at.c]
    if (col.cells.length > 1) {
      /* What is left of the stack may now be shorter than the row: the row splits rather than stretch it (tidyRows). */
      const cells = col.cells.filter((x) => x.id !== id)
      return tidyRows([{ ...row, columns: row.columns.map((x, i) => (i === at.c ? { ...x, cells } : x)) }])
    }
    const columns = row.columns.filter((_, i) => i !== at.c)
    return columns.length ? [evenRow({ ...row, columns })] : []
  })
}

/** A widget placed at a target, or null where it cannot go (no room for one more column, a full stack, too tall). */
export function place(rows: readonly Row[], cell: Cell, target: Target): Row[] | null {
  const lone = (): Column => ({ id: newId('c'), span: COLS, cells: [{ ...cell, weight: 1 }] })
  if (target.at === 'row') {
    const row: Row = tidyRow({ id: newId('r'), height: meta(cell.widget).h, columns: [lone()] })
    const at = target.before === null ? rows.length : rows.findIndex((r) => r.id === target.before)
    if (at < 0) return null
    return [...rows.slice(0, at), row, ...rows.slice(at)]
  }
  if (target.at === 'column') {
    const r = rows.findIndex((x) => x.id === target.row)
    if (r < 0) return null
    const row = rows[r]
    const at = target.before === null ? row.columns.length : row.columns.findIndex((c) => c.id === target.before)
    if (at < 0) return null
    const columns = [...row.columns.slice(0, at), lone(), ...row.columns.slice(at)]
    if (columns.length > MAX_COLS || sum(columns.map(colMinSpan)) > COLS || !rowFits({ columns })) return null
    const next = evenRow({ ...row, height: Math.max(row.height, meta(cell.widget).minH), columns })
    return rows.map((x, i) => (i === r ? next : x))
  }
  if (target.at === 'stack') {
    for (let r = 0; r < rows.length; r++) {
      const c = rows[r].columns.findIndex((x) => x.id === target.column)
      if (c < 0) continue
      const row = rows[r]
      const col = row.columns[c]
      if (col.cells.length >= MAX_STACK) return null
      /* A column alone in its row is the row's full width and cannot narrow: a widget that reads narrower is not
         stacked into it, where it would be drawn twelve columns wide (owner, 20 Nov 2026). */
      if (row.columns.length === 1 && meta(cell.widget).maxW < COLS) return null
      const at = target.before === null ? col.cells.length : col.cells.findIndex((x) => x.id === target.before)
      if (at < 0) return null
      const px = stackHeights(row, col)
      const share = col.cells.length === 1 ? row.height : sum(px) / col.cells.length
      const cells = [...col.cells.slice(0, at), { ...cell, weight: share }, ...col.cells.slice(at)]
      const grown = { ...col, cells, span: Math.max(col.span, meta(cell.widget).minW) }
      const columns = row.columns.map((x, i) => (i === c ? grown : x))
      if (sum(columns.map(colMinSpan)) > COLS) return null
      const shape = { columns }
      /* The row keeps its height unless the stack needs more, and grows only as far as everything in it allows: a stack
         that would stretch a widget beside it past its tallest is refused (rowFits, not rowMaxH, which is never under
         the row's minimum and so never refused anything). */
      if (!rowFits(shape)) return null
      const next = tidyRow({ ...row, columns, height: Math.max(row.height, rowMinH(shape)) })
      return rows.map((x, i) => (i === r ? next : x))
    }
    return null
  }
  return null
}

/** Two cells change places. Each slot keeps its size; the rows are made whole again around what arrived. */
function swapCells(rows: readonly Row[], a: string, b: string): Row[] | null {
  const pa = findCell(rows, a)
  const pb = findCell(rows, b)
  if (!pa || !pb || a === b) return null
  const ca = rows[pa.r].columns[pa.c].cells[pa.k]
  const cb = rows[pb.r].columns[pb.c].cells[pb.k]
  const next = rows.map((row, r) => ({
    ...row,
    columns: row.columns.map((col, c) => ({
      ...col,
      cells: col.cells.map((cell, k) => {
        if (r === pa.r && c === pa.c && k === pa.k) return { ...cb, weight: cell.weight }
        if (r === pb.r && c === pb.c && k === pb.k) return { ...ca, weight: cell.weight }
        return cell
      }),
    })),
  }))
  /* A swap that leaves a widget stretched past its tallest, or a row too narrow for what arrived, is refused. */
  for (const r of [pa.r, pb.r]) {
    const row = next[r]
    if (!rowFits(row) || sum(row.columns.map(colMinSpan)) > COLS) return null
  }
  return tidyRows(next)
}

/* ---- why not ---------------------------------------------------------------------------------------------------- */

/** Why a widget cannot go to a target, in a few words for the tip beside the pointer; null where it can. */
export function whyNot(rows: readonly Row[], cell: Pick<Cell, 'id' | 'widget'>, target: Target): string | null {
  const m = meta(cell.widget)
  const base = findCell(rows, cell.id) ? removeCell(rows, cell.id) : [...rows]
  if (target.at === 'column') {
    const row = base.find((r) => r.id === target.row)
    if (!row) return null
    if (row.columns.length >= MAX_COLS) return `A row holds ${MAX_COLS} widgets`
    if (sum(row.columns.map(colMinSpan)) + m.minW > COLS) return 'No room in this row'
    const shape = { columns: [...row.columns, { id: 'x', span: m.minW, cells: [{ id: 'x', widget: cell.widget, weight: 1 }] }] }
    if (!rowFits(shape)) return tallest(shape) ?? 'Too tall for this row'
    return null
  }
  if (target.at === 'stack') {
    const row = base.find((r) => r.columns.some((c) => c.id === target.column))
    const col = row?.columns.find((c) => c.id === target.column)
    if (!row || !col) return null
    if (col.cells.length >= MAX_STACK) return `A stack holds ${MAX_STACK}`
    if (row.columns.length === 1 && m.maxW < COLS) return `Too wide here for ${m.name}`
    const grown = { ...col, cells: [...col.cells, { id: 'x', widget: cell.widget, weight: 1 }] }
    const columns = row.columns.map((c) => (c.id === col.id ? grown : c))
    if (sum(columns.map(colMinSpan)) > COLS) return 'No room in this row'
    if (!rowFits({ columns })) return tallest({ columns }) ?? 'Too tall to stack here'
    return null
  }
  if (target.at === 'swap') {
    const other = allCells(rows).find((c) => c.id === target.cell)
    if (!other) return null
    return `${m.name} does not fit in ${meta(other.widget).name}'s place`
  }
  return null
}

/** The widget a row's height would stretch past its tallest: what a refusal names. */
function tallest(r: Pick<Row, 'columns'>): string | null {
  const need = rowMinH(r)
  for (const c of r.columns) if (colMaxH(c) < need) return `${meta(c.cells[0].widget).name} would be stretched`
  return null
}

/** A bar that cannot move, and why: both sides are at a limit. Null where it moves. */
export function barLock(row: Row, i: number): string | null {
  const { lo, hi } = colRange(row, i)
  if (hi > lo) return null
  const a = row.columns[i]
  const b = row.columns[i + 1]
  if (!a || !b) return null
  const name = (c: Column) => meta(c.cells[0].widget).name
  if (a.span >= colMaxSpan(a) && b.span >= colMaxSpan(b)) return `${name(a)} and ${name(b)} are both at their widest`
  if (a.span <= colMinSpan(a) && b.span <= colMinSpan(b)) return `${name(a)} and ${name(b)} are both at their narrowest`
  return `${name(a)} and ${name(b)} cannot share this width another way`
}

/** A height bar that cannot move: the row's shortest and tallest are the same. */
export function rowLock(row: Row): string | null {
  return rowMaxH(row) > rowMinH(row) ? null : 'This row is as tall as its widgets need and no taller'
}

/** A cell moved to a target, or null where it cannot go. Moving a cell to where it already is changes nothing. */
export function moveCell(rows: readonly Row[], id: string, target: Target): Row[] | null {
  if (target.at === 'swap') return swapCells(rows, id, target.cell)
  const at = findCell(rows, id)
  if (!at) return null
  const cell = rows[at.r].columns[at.c].cells[at.k]
  if (target.at === 'stack' && target.before === id) return null
  const out = place(removeCell(rows, id), cell, target)
  return out && same(out, rows) ? null : out
}

/** Two layouts the same, ignoring the ids rows and columns were given. */
export function same(a: readonly Row[], b: readonly Row[]): boolean {
  const key = (rows: readonly Row[]) => JSON.stringify(rows.map((r) => [r.height, r.columns.map((c) => [c.span, c.cells.map((x) => [x.id, Math.round(x.weight)])])]))
  return key(a) === key(b)
}

/** The width a column arrives at: its widest widget's own. */
const colNaturalW = (c: Pick<Column, 'cells'>) => clamp(Math.max(...c.cells.map((x) => meta(x.widget).w)), colMinSpan(c), colMaxSpan(c))

/** A widget joined to the end of a row at the width it arrives at, or as near as the row allows, taken from the
    columns with the most to spare: first what they have over their own arrival width, then over their narrowest.
    The other columns keep their widths otherwise, so a row made uneven on purpose stays so. Null where it does not
    fit (no room, too many columns, or the row would stretch a widget past its tallest). */
export function joinRow(row: Row, cell: Cell): Row | null {
  const m = meta(cell.widget)
  if (row.columns.length >= MAX_COLS) return null
  const spans = row.columns.map((c) => c.span)
  const nat = row.columns.map(colNaturalW)
  const lo = row.columns.map(colMinSpan)
  let want = Math.min(m.w, m.maxW)
  let got = 0
  const take = (floor: number[]) => {
    while (got < want) {
      let pick = -1
      for (let i = 0; i < spans.length; i++) if (spans[i] > floor[i] && (pick < 0 || spans[i] - floor[i] > spans[pick] - floor[pick])) pick = i
      if (pick < 0) return
      spans[pick]--
      got++
    }
  }
  take(nat)
  if (got < want) take(lo)
  if (got < m.minW) return null
  want = got
  const columns = [...row.columns.map((c, i) => ({ ...c, span: spans[i] })), { id: newId('c'), span: want, cells: [{ ...cell, weight: 1 }] }]
  if (!rowFits({ columns })) return null
  /* A newcomer never makes the row shorter than the height its widgets were given: a short widget does not shrink the
     charts beside it (owner, 20 Nov 2026). */
  if (row.height > 0 && rowCeil({ columns }) < row.height) return null
  return tidyRow({ ...row, height: Math.max(row.height, m.minH), columns })
}

/** How well a widget sits in a row it joined: 0 is as it arrives everywhere; each column short of its own width, and
    each step of height away from its own, costs. */
function joinCost(before: Row, after: Row, cell: Cell): number {
  const m = meta(cell.widget)
  const mine = after.columns[after.columns.length - 1]
  const short = (c: Column) => Math.max(0, colNaturalW(c) - c.span)
  /* Only what joining takes from them counts: a row already made narrow on purpose is not held against the newcomer. */
  const others = after.columns.slice(0, -1).reduce((a, c, i) => a + short(c) - short(before.columns[i]), 0)
  const grown = Math.max(0, after.height - before.height) / 48
  return (m.w - mine.span) * 2 + others + grown + Math.abs(after.height - m.h) / 96
}

/** How a widget was added: beside others in a row, or on a row of its own. */
export type Added = 'joined' | 'row'

/** Where Add widgets puts a widget (owner, 20 Nov 2026: "by default you use the whole row for a single item … use the
    width and height smartly"):
    · a number joins a row of numbers with room, the row evening out;
    · anything else joins the row where it sits best: at or near its own width, taken from widgets with width to
      spare, in a row near its own height (joinCost), never beside a table or a strip, never into a row of numbers;
    · only where no row takes it well does it start a row of its own at the foot. */
export function addWidget(rows: readonly Row[], widget: WidgetId): { rows: Row[]; id: string; how: Added } {
  const cell: Cell = { id: newId('w'), widget, weight: 1 }
  const k = klass(widget)
  const own = (): { rows: Row[]; id: string; how: Added } => ({ rows: place(rows, cell, { at: 'row', before: null }) ?? [...rows], id: cell.id, how: 'row' })
  if (k === 'full') return own()
  const kinds = (r: Row) => r.columns.flatMap((c) => c.cells.map((x) => klass(x.widget)))
  if (k === 'stat') {
    for (const row of rows) {
      if (row.columns.length >= 4 || !row.columns.every((c) => c.cells.length === 1) || !kinds(row).every((x) => x === 'stat')) continue
      const out = place(rows, cell, { at: 'column', row: row.id, before: null })
      if (out) return { rows: out, id: cell.id, how: 'joined' }
    }
    return own()
  }
  let best: { at: number; row: Row; cost: number } | null = null
  rows.forEach((row, at) => {
    const ks = kinds(row)
    if (ks.includes('full') || ks.every((x) => x === 'stat')) return
    const next = joinRow(row, cell)
    if (!next) return
    const cost = joinCost(row, next, cell)
    /* Ties go to the lower row, nearer where the admin is looking after adding. */
    if (!best || cost <= best.cost) best = { at, row: next, cost }
  })
  const pick = best as { at: number; row: Row; cost: number } | null
  /* Joining at less than its own width less one column, or making a row much taller, is worse than a row of its own. */
  if (!pick || pick.cost > 3) return own()
  return { rows: rows.map((r, i) => (i === pick.at ? pick.row : r)), id: cell.id, how: 'joined' }
}

/** A widget added to one row, from that row's Add here (owner, 20 Nov 2026): numbers into a row of numbers even it out,
    anything else joins at its own width as `joinRow` does. Null where it does not fit that row. */
export function addToRow(rows: readonly Row[], rowId: string, widget: WidgetId): { rows: Row[]; id: string } | null {
  const r = rows.findIndex((x) => x.id === rowId)
  const row = rows[r]
  if (!row) return null
  const cell: Cell = { id: newId('w'), widget, weight: 1 }
  const ks = row.columns.flatMap((c) => c.cells.map((x) => klass(x.widget)))
  if (ks.includes('full') || klass(widget) === 'full') return null
  const stats = ks.every((x) => x === 'stat')
  if (stats !== (klass(widget) === 'stat')) return null
  if (stats) {
    const out = place(rows, cell, { at: 'column', row: rowId, before: null })
    return out ? { rows: out, id: cell.id } : null
  }
  const next = joinRow(row, cell)
  return next ? { rows: rows.map((x, i) => (i === r ? next : x)), id: cell.id } : null
}

/** The widgets that would fit a row, of those given. */
export const fitsRow = (rows: readonly Row[], rowId: string, widgets: readonly WidgetId[]): WidgetId[] => widgets.filter((w) => addToRow(rows, rowId, w) !== null)

/* ---- specs ------------------------------------------------------------------------------------------------------- */

export function fromSpecs(specs: readonly RowSpec[]): Row[] {
  return tidyRows(
    specs.map((r) => ({
      id: newId('r'),
      height: r.height,
      columns: r.columns.map((c) => ({ id: newId('c'), span: c.span, cells: c.cells.map((x) => ({ ...x, id: newId('w'), weight: x.weight ?? 1 })) })),
    })),
  )
}

export function toSpecs(rows: readonly Row[]): RowSpec[] {
  return rows.map((r) => ({
    height: r.height,
    columns: r.columns.map((c) => ({
      span: c.span,
      cells: c.cells.map((x) => ({ widget: x.widget, weight: x.weight, ...(x.view ? { view: x.view } : {}), ...(x.pick ? { pick: x.pick } : {}), ...(x.color ? { color: x.color } : {}) })),
    })),
  }))
}

/** A grid's cell count in pixels: n rows of 48 px with 16 px between them. Templates are written in these cells. */
export const cellsToPx = (n: number) => n * 48 + (n - 1) * GAP

export interface Box {
  widget: WidgetId
  x: number
  y: number
  w: number
  h: number
  view?: string
  pick?: string
}

/** Boxes on a 12-column grid (how templates are written, and how the first rebuild stored boards) read as rows,
    columns and stacks: a row wherever nothing crosses a line across the board, a column wherever nothing crosses a
    line down the row, and what is left in a column stacked. */
export function fromBoxes(boxes: readonly Box[]): RowSpec[] {
  if (boxes.length === 0) return []
  const crossH = (y: number, set: readonly Box[]) => set.some((b) => b.y < y && y < b.y + b.h)
  const crossV = (x: number, set: readonly Box[]) => set.some((b) => b.x < x && x < b.x + b.w)
  const cutsY = [...new Set([0, ...boxes.map((b) => b.y + b.h)])].filter((y) => !crossH(y, boxes)).sort((a, b) => a - b)
  const out: RowSpec[] = []
  for (let i = 0; i < cutsY.length; i++) {
    const top = cutsY[i]
    const bot = cutsY[i + 1] ?? Infinity
    const band = boxes.filter((b) => b.y >= top && b.y < bot)
    if (band.length === 0) continue
    const units = Math.max(...band.map((b) => b.y + b.h)) - top
    const cutsX = [...new Set([0, ...band.map((b) => b.x + b.w), COLS])].filter((x) => !crossV(x, band)).sort((a, b) => a - b)
    const columns: ColumnSpec[] = []
    for (let j = 0; j < cutsX.length - 1; j++) {
      const x0 = cutsX[j]
      const x1 = cutsX[j + 1]
      const inCol = band.filter((b) => b.x >= x0 && b.x < x1).sort((a, b) => a.y - b.y)
      if (inCol.length === 0) continue
      /* A column holds a stack when its boxes sit one above another; otherwise the first box stands for it. */
      const stacked = inCol.every((b, k) => k === 0 || b.y >= inCol[k - 1].y + inCol[k - 1].h)
      const list = stacked ? inCol.slice(0, MAX_STACK) : [inCol[0]]
      columns.push({ span: x1 - x0, cells: list.map((b) => ({ widget: b.widget, weight: cellsToPx(b.h), ...(b.view ? { view: b.view } : {}), ...(b.pick ? { pick: b.pick } : {}) })) })
    }
    out.push({ height: cellsToPx(units), columns })
  }
  return out
}

/* ---- arranging ----------------------------------------------------------------------------------------------- */

export type ArrangeMode = 'tidy' | 'type' | 'need'

type Klass = 'full' | 'stat' | 'wide' | 'mid'

/** How a widget sits in a row: alone across it, in a row of numbers, wide beside a narrow one, or in a row of three. */
function klass(widget: WidgetId): Klass {
  const m = meta(widget)
  if (m.kind === 'strip' || m.kind === 'table') return 'full'
  if (m.kind === 'stat') return 'stat'
  return m.w >= 6 ? 'wide' : 'mid'
}

const RANK: Record<Klass, number> = { stat: 1, wide: 2, mid: 3, full: 4 }

/** `n` items in groups of at most `size`, as even as they go: 5 in groups of 4 is 3 and 2. */
function chunks<T>(items: readonly T[], size: number): T[][] {
  const count = Math.ceil(items.length / size)
  const base = Math.floor(items.length / count)
  const extra = items.length % count
  const out: T[][] = []
  let at = 0
  for (let i = 0; i < count; i++) {
    const n = base + (i < extra ? 1 : 0)
    out.push(items.slice(at, at + n))
    at += n
  }
  return out
}

function rowOf(cells: readonly Cell[], spans?: number[]): Row {
  const columns = cells.map((cell, i) => ({ id: newId('c'), span: spans?.[i] ?? 0, cells: [{ ...cell, weight: 1 }] }))
  const shape = { columns }
  const row = { id: newId('r'), height: rowNaturalH(shape), columns }
  return spans ? tidyRow(row) : evenRow(row)
}

/** Whether a lone widget can join a row: one of lists and charts, not yet three across, with room for its minimum. */
function joins(row: Row | undefined, cell: Cell): boolean {
  if (!row || row.columns.length >= 3) return false
  if (!row.columns.every((c) => c.cells.length === 1 && (klass(c.cells[0].widget) === 'wide' || klass(c.cells[0].widget) === 'mid'))) return false
  return sum(row.columns.map(colMinSpan)) + meta(cell.widget).minW <= COLS
}

/** Cells packed into balanced rows, in the order given: numbers four across, a wide chart beside a narrow list,
    lists three across, tables and strips on their own. Nothing is left stretched across a row alone if it can sit
    beside something: one or two numbers take a list or a chart beside them, and a lone list joins the row before it
    or the chart after it. */
function pack(list: readonly Cell[]): Row[] {
  const rows: Row[] = []
  const q = [...list]
  while (q.length) {
    const c = q.shift()!
    const k = klass(c.widget)
    if (k === 'full') {
      rows.push(rowOf([c]))
    } else if (k === 'stat') {
      const run = [c]
      while (q.length && klass(q[0].widget) === 'stat') run.push(q.shift()!)
      const groups = chunks(run, 4)
      const last = groups[groups.length - 1]
      for (const group of groups.slice(0, -1)) rows.push(rowOf(group))
      const next = q[0] && klass(q[0].widget)
      /* Two numbers left over sit stacked in one column beside the chart or list after them: together they are its
         height, where side by side they would be stretched to it. */
      if (last.length === 2 && (next === 'mid' || next === 'wide')) {
        const partner = q.shift()!
        const stack: Column = { id: newId('c'), span: 3, cells: last.map((c) => ({ ...c, weight: 1 })) }
        const other: Column = { id: newId('c'), span: COLS - 3, cells: [{ ...partner, weight: 1 }] }
        const columns = [stack, other]
        const row = tidyRow({ id: newId('r'), height: rowNaturalH({ columns }), columns })
        rows.push(rowFits(row) ? row : rowOf(last), ...(rowFits(row) ? [] : [rowOf([partner])]))
      } else rows.push(rowOf(last))
    } else if (k === 'wide') {
      const partner = q.findIndex((x, i) => i < 4 && klass(x.widget) === 'mid')
      if (partner >= 0) rows.push(rowOf([c, q.splice(partner, 1)[0]], [8, 4]))
      else if (q.length && klass(q[0].widget) === 'wide') rows.push(rowOf([c, q.shift()!], [6, 6]))
      else rows.push(rowOf([c]))
    } else {
      const run = [c]
      while (q.length && run.length < 3 && klass(q[0].widget) === 'mid') run.push(q.shift()!)
      if (run.length === 1 && q[0] && klass(q[0].widget) === 'wide') rows.push(rowOf([c, q.shift()!], [4, 8]))
      else if (run.length === 1 && joins(rows[rows.length - 1], c)) {
        const prev = rows.pop()!
        rows.push(evenRow({ ...prev, columns: [...prev.columns, { id: newId('c'), span: 0, cells: [{ ...c, weight: 1 }] }] }))
      } else rows.push(rowOf(run))
    }
  }
  return rows
}

const byRank = (list: readonly Cell[]) => [...list].sort((a, b) => RANK[klass(a.widget)] - RANK[klass(b.widget)])

/** The board laid out again, every widget kept with its view, filter and colour:
    · tidy   in the order it reads now, packed into balanced rows;
    · type   numbers first, then charts, lists and tables;
    · need   by what they are about (posture, sign-ins, policies, people, admin), numbers first within each.
    A pinned widget (the Migration strip while the move is open) stays first. */
export function arrange(rows: readonly Row[], mode: ArrangeMode, pinned?: WidgetId): Row[] {
  const cells = allCells(rows)
  const first = pinned ? cells.filter((c) => c.widget === pinned) : []
  const rest = cells.filter((c) => !first.includes(c))
  const top = first.map((c) => rowOf([c]))
  if (mode === 'tidy') return [...top, ...pack(rest)]
  if (mode === 'type') return [...top, ...pack(byRank(rest))]
  const need = (c: Cell) => CATEGORIES.findIndex((g) => g.value === meta(c.widget).category)
  return [...top, ...pack([...rest].sort((a, b) => need(a) - need(b) || RANK[klass(a.widget)] - RANK[klass(b.widget)]))]
}
