import { WIDGETS } from './catalog'
import { COLS, GAP, stackHeights, type Row } from './layout'

/* -----------------------------------------------------------------------------
   Where everything on the board sits, in pixels.

   The board draws every widget in ONE flat layer, each placed by a transform
   worked out here, rather than nesting widgets inside their row and their
   column (owner, 19 Nov 2026: "laggy, very heavy, and very jittery"). A widget
   that goes to another row keeps its element, so it never mounts again; its
   move is a change of transform, which the browser animates off the main
   thread; and a drop can be found from these numbers without reading the page.
   -------------------------------------------------------------------------- */

export interface Box {
  x: number
  y: number
  w: number
  h: number
}
export interface CellBox extends Box {
  row: string
  col: string
}
export interface Geometry {
  width: number
  height: number
  stacked: boolean
  rows: (Box & { id: string })[]
  cols: Record<string, Box & { row: string }>
  cells: Record<string, CellBox>
  /** The gap between two columns of a row, where its bar sits. */
  colBars: { row: string; index: number; x: number; y: number; h: number }[]
  /** The gap between two stacked widgets, where its bar sits. */
  stackBars: { row: string; col: number; index: number; x: number; y: number; w: number }[]
}

const statRow = (row: Row) => row.columns.length > 1 && row.columns.every((c) => c.cells.length === 1 && WIDGETS[c.cells[0].widget].kind === 'stat')

/** Where every row, column, widget and bar of `rows` sits on a board `width` pixels wide. Edges fall on whole pixels,
    so text never lands between two. A narrow board (`stacked`) puts each widget under the one before at full width,
    and numbers two to a line. */
export function geometry(rows: readonly Row[], width: number, stacked: boolean): Geometry {
  const g: Geometry = { width, height: 0, stacked, rows: [], cols: {}, cells: {}, colBars: [], stackBars: [] }
  if (width <= 0) return g
  let y = 0
  for (const row of rows) {
    const top = y
    if (stacked) {
      if (statRow(row)) {
        const w = Math.floor((width - GAP) / 2)
        row.columns.forEach((col, i) => {
          const x = i % 2 === 0 ? 0 : width - w
          const cy = top + Math.floor(i / 2) * (row.height + GAP)
          g.cols[col.id] = { row: row.id, x, y: cy, w, h: row.height }
          g.cells[col.cells[0].id] = { row: row.id, col: col.id, x, y: cy, w, h: row.height }
        })
        y = top + Math.ceil(row.columns.length / 2) * (row.height + GAP)
      } else {
        for (const col of row.columns) {
          const colTop = y
          const px = stackHeights(row, col)
          col.cells.forEach((cell, k) => {
            const h = Math.round(px[k])
            g.cells[cell.id] = { row: row.id, col: col.id, x: 0, y, w: width, h }
            y += h + GAP
          })
          g.cols[col.id] = { row: row.id, x: 0, y: colTop, w: width, h: y - GAP - colTop }
        }
      }
      g.rows.push({ id: row.id, x: 0, y: top, w: width, h: y - GAP - top })
      continue
    }
    const unit = (width + GAP) / COLS
    /* The left edge of track `s`. The last track's right edge is the board's. */
    const edge = (s: number) => Math.round(s * unit)
    let s = 0
    row.columns.forEach((col, i) => {
      const x = edge(s)
      const w = edge(s + col.span) - GAP - x
      g.cols[col.id] = { row: row.id, x, y: top, w, h: row.height }
      const px = stackHeights(row, col)
      let acc = 0
      col.cells.forEach((cell, k) => {
        const last = k === col.cells.length - 1
        const cy = top + Math.round(acc) + k * GAP
        const bottom = last ? top + row.height : top + Math.round(acc + px[k]) + k * GAP
        g.cells[cell.id] = { row: row.id, col: col.id, x, y: cy, w, h: bottom - cy }
        if (!last) g.stackBars.push({ row: row.id, col: i, index: k, x, y: bottom, w })
        acc += px[k]
      })
      s += col.span
      if (i < row.columns.length - 1) g.colBars.push({ row: row.id, index: i, x: edge(s) - GAP, y: top, h: row.height })
    })
    g.rows.push({ id: row.id, x: 0, y: top, w: width, h: row.height })
    y = top + row.height + GAP
  }
  g.height = Math.max(0, y - GAP)
  return g
}

/** The same box, to the pixel. */
export const sameBox = (a: Box | undefined, b: Box | undefined) => !!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h
