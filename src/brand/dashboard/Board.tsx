import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type Ref } from 'react'
import { createPortal } from 'react-dom'
import { motion, useReducedMotion } from 'motion/react'
import { GripVertical } from 'lucide-react'
import { RowMenu, type MenuItem } from '../kit'
import { appRoot } from '../dialog-chrome'
import { pct, useSize } from './format'
import {
  COLS,
  GAP,
  STEP,
  colRange,
  evenRow,
  findCell,
  moveCell,
  moveRow,
  newId,
  place,
  rowMaxH,
  rowMinH,
  rowNaturalH,
  setBoundary,
  setRowHeight,
  setStackSplit,
  stackHeights,
  stackRange,
  type Cell,
  type Row,
  type Target,
} from './layout'
import { WIDGETS, type Range, type WidgetId } from './model'
import type { ThemeId } from './themes'
import { CellLift, CellView, type CellHandlers } from './Tile'

/* -----------------------------------------------------------------------------
   The board: rows of widgets, and in Customize the controls that shape them
   (owner, 19 Nov 2026).

   · Bars. Between two columns, between two stacked widgets, and under every
     row is a bar with a grip in its middle. Drag it and the space on its two
     sides is shared out again: widths in twelfths of the row, heights in steps
     of 8 px, never past a widget's minimum or maximum. A bar's keys do the
     same; Enter (or a double click) evens it out.
   · Rows. A grip in the margin beside each row moves the whole row, and its
     menu evens the row's widths, puts back its height, or removes it.
   · Widgets. Drag one by its card or its grabber and drop it on another: on
     its left or right edge to sit beside it, its top or bottom edge to stack
     with it, its middle to change places, or in a gap between rows to start a
     row of its own. A line shows where it will go before it is let go.

   Widths snap to the same twelfths in every row, so columns line up down the
   board; a guide shows when the bar being dragged lines up with another row's.
   -------------------------------------------------------------------------- */

export interface BoardHandle {
  /** A widget picked up in the library: carry it to the board. */
  startNew: (widget: WidgetId, e: PointerEvent<HTMLElement>) => void
}

type Rect = { left: number; top: number; width: number; height: number }

interface Drop {
  target: Target | null
  /** A row being moved: where it goes. */
  rowTo?: number
  rect: Rect
  shape: 'v' | 'h' | 'box'
}

interface Dock {
  kind: 'cell' | 'new' | 'row'
  id: string
  widget?: WidgetId
  startX: number
  startY: number
  grabX: number
  grabY: number
  started: boolean
  drop: Drop | null
  stop: () => void
}

/** A bar's drag: what it moves and where it started. */
interface BarDrag {
  kind: 'col' | 'row' | 'stack'
  row: string
  index: number
  col: number
  start: number
  unit: number
  origin: Row[]
}

const SPRING = { type: 'spring', stiffness: 460, damping: 42, mass: 0.9 } as const

/** Where bar `i` sits across a row's twelve tracks: the gap after the columns before it. */
const barLeft = (row: Row, i: number) => {
  const s = row.columns.slice(0, i + 1).reduce((a, c) => a + c.span, 0)
  return `calc((100% - ${GAP * (COLS - 1)}px) * ${s} / ${COLS} + ${(s - 1) * GAP}px)`
}
/** Where each column bar falls, in twelfths: what another row's bar lines up with. */
const bounds = (row: Row) => row.columns.slice(0, -1).map((_, i) => row.columns.slice(0, i + 1).reduce((a, c) => a + c.span, 0))

function Bar({
  orientation,
  label,
  now,
  min,
  max,
  style,
  className = '',
  onDrag,
  onDone,
  onKey,
  onReset,
}: {
  /** `vertical`: a bar between two columns, moving width. `horizontal`: a bar moving height. */
  orientation: 'vertical' | 'horizontal'
  label: string
  now: number
  min: number
  max: number
  style?: CSSProperties
  className?: string
  onDrag: (phase: 'start' | 'move', dx: number, dy: number, e: PointerEvent<HTMLDivElement>) => void
  onDone: (keep: boolean) => void
  onKey: (e: KeyboardEvent<HTMLDivElement>) => void
  onReset: () => void
}) {
  const from = useRef<{ x: number; y: number } | null>(null)
  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation={orientation}
      aria-label={label}
      aria-valuenow={Math.round(now)}
      aria-valuemin={Math.round(min)}
      aria-valuemax={Math.round(max)}
      data-chrome
      className={`bdash-bar is-${orientation === 'vertical' ? 'v' : 'h'} ${className}`}
      style={style}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.preventDefault()
        e.stopPropagation()
        e.currentTarget.setPointerCapture(e.pointerId)
        from.current = { x: e.clientX, y: e.clientY }
        onDrag('start', 0, 0, e)
      }}
      onPointerMove={(e) => {
        if (from.current) onDrag('move', e.clientX - from.current.x, e.clientY - from.current.y, e)
      }}
      onPointerUp={() => {
        if (!from.current) return
        from.current = null
        onDone(true)
      }}
      onPointerCancel={() => {
        if (!from.current) return
        from.current = null
        onDone(false)
      }}
      onKeyDown={onKey}
      onDoubleClick={onReset}
    >
      <i className="bdash-bar__grip" aria-hidden />
    </div>
  )
}

export function Board({
  ref,
  rows,
  editing,
  range,
  theme,
  brand,
  pinnedRow,
  building,
  onCommit,
  onRemove,
  onRemoveRow,
  onPatch,
  onColour,
  onSay,
}: {
  ref?: Ref<BoardHandle>
  rows: Row[]
  editing: boolean
  range: Range
  theme: ThemeId
  brand: string
  /** The row that stays first while the move from the old policies is open: not moved, not dropped into. */
  pinnedRow: string | null
  building: boolean
  /** The layout changed by hand: keep it, and say what happened. */
  onCommit: (next: Row[], said: string) => void
  onRemove: (c: Cell) => void
  onRemoveRow: (r: Row) => void
  onPatch: (id: string, p: Partial<Pick<Cell, 'view' | 'pick'>>) => void
  onColour: (id: string, t: ThemeId | null) => void
  onSay: (text: string) => void
}) {
  const still = useReducedMotion() === true
  const [sizeRef, size] = useSize<HTMLDivElement>()
  const board = useRef<HTMLDivElement | null>(null)
  const stacked = size.w > 0 && size.w < 720
  const [draft, setDraft] = useState<Row[] | null>(null)
  const [sizing, setSizing] = useState<BarDrag['kind'] | null>(null)
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null)
  const [guides, setGuides] = useState<number[]>([])
  const [dock, setDock] = useState<{ kind: Dock['kind']; id: string } | null>(null)
  const [drop, setDrop] = useState<Drop | null>(null)
  const [lift, setLift] = useState<{ cell: Cell; rect: Rect; settling: boolean } | null>(null)
  const [chip, setChip] = useState<{ widget: WidgetId; x: number; y: number } | null>(null)
  const [picked, setPicked] = useState<{ id: string; origin: Row[] } | null>(null)
  const [settle, setSettle] = useState<string | null>(null)
  const bar = useRef<BarDrag | null>(null)
  const session = useRef<Dock | null>(null)
  const dragged = useRef(false)

  /* What the window's own listeners read: they outlive the render that added them. */
  const live = useRef({ rows, pinnedRow, onCommit, onSay })
  live.current = { rows, pinnedRow, onCommit, onSay }

  const shown = draft ?? rows
  const setBoard = (el: HTMLDivElement | null) => {
    board.current = el
    sizeRef.current = el
  }

  /* Leaving Customize ends anything in hand. */
  useEffect(() => {
    if (editing) return
    session.current?.stop()
    session.current = null
    bar.current = null
    setDraft(null)
    setPicked(null)
    setSizing(null)
    setTip(null)
    setGuides([])
    setDock(null)
    setDrop(null)
    setLift(null)
    setChip(null)
  }, [editing])
  useEffect(() => () => session.current?.stop(), [])

  /* A dropped widget's lifted copy glides to where the widget landed, and only then is the widget shown. */
  useLayoutEffect(() => {
    if (!settle) return
    const el = board.current?.querySelector<HTMLElement>(`[data-cell="${settle}"]`)
    if (!el || still) {
      setLift(null)
      setSettle(null)
      return
    }
    const r = el.getBoundingClientRect()
    setLift((l) => (l ? { ...l, rect: { left: r.left, top: r.top, width: r.width, height: r.height }, settling: true } : l))
    const t = window.setTimeout(() => {
      setLift(null)
      setSettle(null)
    }, 200)
    return () => window.clearTimeout(t)
  }, [settle, still])

  /* ---- the bars ---- */

  const colsEl = (rowId: string) => board.current?.querySelector<HTMLElement>(`[data-row="${rowId}"] .bdash-row__cols`)

  const startBar = (kind: BarDrag['kind'], row: Row, index: number, col: number) => {
    const el = colsEl(row.id)
    const unit = el ? (el.getBoundingClientRect().width + GAP) / COLS : 1
    const start = kind === 'col' ? row.columns[index].span : kind === 'row' ? row.height : stackHeights(row, row.columns[col])[index]
    bar.current = { kind, row: row.id, index, col, start, unit, origin: rows }
    setSizing(kind)
  }

  const dragBar = (dx: number, dy: number, e: PointerEvent<HTMLDivElement>) => {
    const b = bar.current
    if (!b) return
    let changed: Row | null = null
    const next = b.origin.map((row) => {
      if (row.id !== b.row) return row
      if (b.kind === 'col') changed = setBoundary(row, b.index, b.start + Math.round(dx / b.unit))
      else if (b.kind === 'row') changed = setRowHeight(row, b.start + dy)
      else changed = setStackSplit(row, b.col, b.index, b.start + dy)
      return changed
    })
    setDraft(next)
    const r = changed as Row | null
    if (!r) return
    if (b.kind === 'col') {
      const { lo, hi } = colRange(r, b.index)
      const a = r.columns[b.index].span
      const edge = a === lo || a === hi ? ` · ${a === lo ? 'narrowest' : 'widest'}` : ''
      setTip({ x: e.clientX, y: e.clientY, text: `${pct(a / COLS)} | ${pct(r.columns[b.index + 1].span / COLS)}${edge}` })
      /* Another row with a bar in the same place: draw the line they share. */
      const at = bounds(r)[b.index]
      const match = next.some((o) => o.id !== r.id && bounds(o).includes(at))
      const el = colsEl(r.id)
      const host = board.current?.getBoundingClientRect()
      if (match && el && host) {
        const w = el.getBoundingClientRect()
        const x = w.left - host.left + ((w.width - GAP * (COLS - 1)) * at) / COLS + (at - 1) * GAP + GAP / 2
        setGuides([x])
      } else setGuides([])
    } else {
      const min = b.kind === 'row' ? rowMinH(r) : stackRange(r, b.col, b.index).lo
      const max = b.kind === 'row' ? rowMaxH(r) : stackRange(r, b.col, b.index).hi
      const now = b.kind === 'row' ? r.height : stackHeights(r, r.columns[b.col])[b.index]
      setTip(now <= min + 0.5 ? { x: e.clientX, y: e.clientY, text: 'Shortest' } : now >= max - 0.5 ? { x: e.clientX, y: e.clientY, text: 'Tallest' } : null)
    }
  }

  const endBar = (keep: boolean) => {
    const b = bar.current
    bar.current = null
    setSizing(null)
    setTip(null)
    setGuides([])
    if (b && keep && draft) {
      const changed = JSON.stringify(draft) !== JSON.stringify(b.origin)
      if (changed) onCommit(draft, b.kind === 'col' ? 'Widths changed' : b.kind === 'row' ? 'Row height changed' : 'Heights changed')
    }
    setDraft(null)
  }

  /* A bar's keys: arrows move it a step, Home and End to its limits, Enter evens it out. */
  const keyBar = (kind: BarDrag['kind'], row: Row, index: number, col: number) => (e: KeyboardEvent<HTMLDivElement>) => {
    const k = e.key
    const step = (kind === 'col' ? 1 : STEP) * (e.shiftKey ? 4 : 1)
    const back = kind === 'col' ? 'ArrowLeft' : 'ArrowUp'
    const fwd = kind === 'col' ? 'ArrowRight' : 'ArrowDown'
    if (![back, fwd, 'Home', 'End', 'Enter'].includes(k)) return
    e.preventDefault()
    let next: Row
    if (kind === 'col') {
      const { lo, hi } = colRange(row, index)
      const now = row.columns[index].span
      next = k === 'Enter' ? evenRow(row) : setBoundary(row, index, k === 'Home' ? lo : k === 'End' ? hi : now + (k === fwd ? step : -step))
      onSay(k === 'Enter' ? 'Widths evened out' : `${pct(next.columns[index].span / COLS)} and ${pct(next.columns[index + 1].span / COLS)}`)
    } else if (kind === 'row') {
      next = k === 'Enter' ? setRowHeight(row, rowNaturalH(row)) : setRowHeight(row, k === 'Home' ? rowMinH(row) : k === 'End' ? rowMaxH(row) : row.height + (k === fwd ? step : -step))
      onSay(`Row height ${next.height} pixels`)
    } else {
      const r = stackRange(row, col, index)
      next = setStackSplit(row, col, index, k === 'Enter' ? (r.now + stackHeights(row, row.columns[col])[index + 1]) / 2 : k === 'Home' ? r.lo : k === 'End' ? r.hi : r.now + (k === fwd ? step : -step))
      onSay('Heights changed')
    }
    if (JSON.stringify(next) !== JSON.stringify(row)) onCommit(rows.map((x) => (x.id === row.id ? next : x)), kind === 'col' ? 'Widths changed' : 'Heights changed')
  }

  /* A double click evens out the two sides of a bar; under a row it puts the row back to the height its widgets want. */
  const resetBar = (kind: BarDrag['kind'], row: Row, index: number, col: number) => () => {
    let next: Row
    if (kind === 'col') next = setBoundary(row, index, (row.columns[index].span + row.columns[index + 1].span) / 2)
    else if (kind === 'row') next = setRowHeight(row, rowNaturalH(row))
    else {
      const px = stackHeights(row, row.columns[col])
      next = setStackSplit(row, col, index, (px[index] + px[index + 1]) / 2)
    }
    if (JSON.stringify(next) !== JSON.stringify(row)) onCommit(rows.map((x) => (x.id === row.id ? next : x)), kind === 'row' ? 'Row height put back' : 'Evened out')
  }

  /* ---- dragging widgets and rows ---- */

  /** Where a drop would land, and the line or outline that says so. Null where nothing can go. */
  const hit = (x: number, y: number, d: Dock): Drop | null => {
    const host = board.current
    if (!host) return null
    const hb = host.getBoundingClientRect()
    const now = live.current.rows
    const pinned = live.current.pinnedRow
    const rel = (r: DOMRect): Rect => ({ left: r.left - hb.left, top: r.top - hb.top, width: r.width, height: r.height })
    const rowRects = now.map((r) => ({ r, el: host.querySelector<HTMLElement>(`[data-row="${r.id}"] .bdash-row__cols`) })).flatMap((o) => (o.el ? [{ r: o.r, b: o.el.getBoundingClientRect() }] : []))
    const floor = pinned && now[0]?.id === pinned ? 1 : 0

    /* A gap between rows (or above the first, below the last): a row of its own there. */
    const between = (index: number): Drop | null => {
      const at = Math.max(floor, index)
      const above = rowRects[at - 1]?.b
      const below = rowRects[at]?.b
      const lineY = above && below ? (above.bottom + below.top) / 2 : above ? above.bottom + GAP / 2 : below ? below.top - GAP / 2 : hb.top
      const rect = { left: 0, top: lineY - hb.top - 1.5, width: hb.width, height: 3 }
      if (d.kind === 'row') {
        const from = now.findIndex((r) => r.id === d.id)
        const to = at > from ? at - 1 : at
        return to === from ? null : { target: null, rowTo: to, rect, shape: 'h' }
      }
      const target: Target = { at: 'row', before: now[at]?.id ?? null }
      return valid(target) ? { target, rect, shape: 'h' } : null
    }
    const valid = (t: Target): boolean => {
      if (d.kind === 'cell') return moveCell(now, d.id, t) !== null
      if (d.kind === 'new' && d.widget) return place(now, { id: 'x', widget: d.widget, weight: 1 }, t) !== null
      return false
    }

    if (rowRects.length === 0) return between(0)
    const inRow = rowRects.findIndex((o) => y >= o.b.top && y <= o.b.bottom)
    if (inRow < 0 || d.kind === 'row') {
      const index = rowRects.filter((o) => o.b.top + o.b.height / 2 < y).length
      return between(index)
    }
    const { r: row, b: rb } = rowRects[inRow]
    /* The first and last few pixels of a row count as the gap beside it, so a new row is easy to start. */
    if (y < rb.top + 10) return between(inRow)
    if (y > rb.bottom - 10) return between(inRow + 1)
    if (row.id === pinned) return null
    const colEls = row.columns.flatMap((c) => {
      const el = host.querySelector<HTMLElement>(`[data-col="${c.id}"]`)
      return el ? [{ c, b: el.getBoundingClientRect() }] : []
    })
    const colLine = (before: string | null, xLine: number): Drop | null => {
      const target: Target = { at: 'column', row: row.id, before }
      return valid(target) ? { target, rect: { left: xLine - hb.left - 1.5, top: rb.top - hb.top, width: 3, height: rb.height }, shape: 'v' } : null
    }
    const ci = colEls.findIndex((o) => x >= o.b.left && x <= o.b.right)
    if (ci < 0) {
      const after = colEls.filter((o) => o.b.right < x).length
      const left = colEls[after - 1]?.b
      const right = colEls[after]?.b
      return colLine(colEls[after]?.c.id ?? null, left && right ? (left.right + right.left) / 2 : left ? left.right + GAP / 2 : (right?.left ?? rb.left) - GAP / 2)
    }
    const { c: col, b: cb } = colEls[ci]
    const cellEls = col.cells.flatMap((cell) => {
      const el = host.querySelector<HTMLElement>(`[data-cell="${cell.id}"]`)
      return el ? [{ cell, b: el.getBoundingClientRect() }] : []
    })
    const stackLine = (before: string | null, yLine: number): Drop | null => {
      const target: Target = { at: 'stack', column: col.id, before }
      return valid(target) ? { target, rect: { left: cb.left - hb.left, top: yLine - hb.top - 1.5, width: cb.width, height: 3 }, shape: 'h' } : null
    }
    const ki = cellEls.findIndex((o) => y >= o.b.top && y <= o.b.bottom)
    if (ki < 0) {
      const after = cellEls.filter((o) => o.b.bottom < y).length
      const above = cellEls[after - 1]?.b
      const below = cellEls[after]?.b
      return stackLine(cellEls[after]?.cell.id ?? null, above && below ? (above.bottom + below.top) / 2 : above ? above.bottom + GAP / 2 : (below?.top ?? cb.top) - GAP / 2)
    }
    const { cell, b: kb } = cellEls[ki]
    const rx = (x - kb.left) / kb.width
    const ry = (y - kb.top) / kb.height
    const nextCol = row.columns[row.columns.indexOf(col) + 1]?.id ?? null
    const nextCell = col.cells[ki + 1]?.id ?? null
    if (rx < 0.22) return colLine(col.id, cb.left - GAP / 2)
    if (rx > 0.78) return colLine(nextCol, cb.right + GAP / 2)
    if (ry < 0.3) return stackLine(cell.id, kb.top - GAP / 2)
    if (ry > 0.7) return stackLine(nextCell, kb.bottom + GAP / 2)
    if (d.kind === 'cell') {
      if (cell.id === d.id) return null
      const target: Target = { at: 'swap', cell: cell.id }
      return valid(target) ? { target, rect: rel(kb), shape: 'box' } : null
    }
    return stackLine(nextCell, kb.bottom + GAP / 2) ?? colLine(nextCol, cb.right + GAP / 2)
  }

  const finish = (d: Dock, keep: boolean) => {
    d.stop()
    session.current = null
    setDock(null)
    setDrop(null)
    setChip(null)
    if (!d.started) return
    dragged.current = true
    window.setTimeout(() => (dragged.current = false), 0)
    const now = live.current.rows
    const out = d.drop
    if (keep && out) {
      if (d.kind === 'row' && out.rowTo !== undefined) {
        live.current.onCommit(moveRow(now, now.findIndex((r) => r.id === d.id), out.rowTo), 'Row moved')
      } else if (d.kind === 'cell' && out.target) {
        const next = moveCell(now, d.id, out.target)
        if (next) {
          live.current.onCommit(next, `${WIDGETS[findWidget(now, d.id)].name} ${out.target.at === 'swap' ? 'swapped' : 'moved'}`)
          setSettle(d.id)
          return
        }
      } else if (d.kind === 'new' && out.target && d.widget) {
        const id = newId('w')
        const next = place(now, { id, widget: d.widget, weight: 1 }, out.target)
        if (next) live.current.onCommit(next, `${WIDGETS[d.widget].name} added`)
      }
    }
    setLift(null)
  }

  const begin = (kind: Dock['kind'], id: string, e: PointerEvent<HTMLElement>, grab: { x: number; y: number }, widget?: WidgetId) => {
    session.current?.stop()
    const d: Dock = { kind, id, widget, startX: e.clientX, startY: e.clientY, grabX: grab.x, grabY: grab.y, started: false, drop: null, stop: () => {} }
    const move = (ev: globalThis.PointerEvent) => {
      if (!d.started) {
        if (Math.hypot(ev.clientX - d.startX, ev.clientY - d.startY) < 5) return
        d.started = true
        document.documentElement.classList.add('bdash-dragging')
        setPicked(null)
        setDock({ kind, id })
        if (kind === 'cell') {
          const el = board.current?.querySelector<HTMLElement>(`[data-cell="${id}"]`)
          const at = findCell(live.current.rows, id)
          if (el && at) {
            const r = el.getBoundingClientRect()
            setLift({ cell: live.current.rows[at.r].columns[at.c].cells[at.k], rect: { left: ev.clientX - d.grabX, top: ev.clientY - d.grabY, width: r.width, height: r.height }, settling: false })
          }
        }
      }
      ev.preventDefault()
      if (kind === 'cell') setLift((l) => (l ? { ...l, rect: { ...l.rect, left: ev.clientX - d.grabX, top: ev.clientY - d.grabY } } : l))
      if (kind === 'new' && widget) setChip({ widget, x: ev.clientX, y: ev.clientY })
      d.drop = hit(ev.clientX, ev.clientY, d)
      setDrop(d.drop)
    }
    const up = () => finish(d, true)
    const cancel = () => finish(d, false)
    const key = (ev: globalThis.KeyboardEvent) => {
      if (ev.key !== 'Escape') return
      ev.preventDefault()
      ev.stopPropagation()
      cancel()
    }
    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', key, true)
    d.stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('keydown', key, true)
      document.documentElement.classList.remove('bdash-dragging')
    }
    session.current = d
  }

  useImperativeHandle(ref, () => ({
    startNew: (widget, e) => {
      if (e.button !== 0) return
      begin('new', `new-${widget}`, e, { x: 0, y: 0 }, widget)
    },
  }))

  /* ---- widgets from the keyboard ---- */

  /** One step for a picked-up widget: left and right change places with the widget beside it; up and down change
      places in its stack, or move it to the row above or below (beside the widgets there, or on a row of its own). */
  const step = (list: Row[], id: string, key: string): Row[] | null => {
    const at = findCell(list, id)
    if (!at) return null
    const row = list[at.r]
    const col = row.columns[at.c]
    if (key === 'ArrowLeft' || key === 'ArrowRight') {
      const side = row.columns[at.c + (key === 'ArrowRight' ? 1 : -1)]
      if (!side) return null
      return moveCell(list, id, { at: 'swap', cell: side.cells[Math.min(at.k, side.cells.length - 1)].id })
    }
    const up = key === 'ArrowUp'
    const inStack = col.cells[at.k + (up ? -1 : 1)]
    if (inStack) return moveCell(list, id, { at: 'swap', cell: inStack.id })
    const floor = pinnedRow && list[0]?.id === pinnedRow ? 1 : 0
    const other = list[at.r + (up ? -1 : 1)]
    if (!other || (up && at.r - 1 < floor)) return null
    return moveCell(list, id, { at: 'column', row: other.id, before: null }) ?? moveCell(list, id, { at: 'row', before: up ? other.id : (list[at.r + 2]?.id ?? null) })
  }

  const handlers: CellHandlers = {
    onGrab: (c, e) => {
      if (e.button !== 0 || stacked) return
      const target = e.target as Element
      if (target.closest('[data-chrome]')) return
      /* A finger scrolls the page from a widget's face; it moves the widget from its grabber. */
      if (e.pointerType === 'touch' && !target.closest('[data-grab]')) return
      const r = e.currentTarget.getBoundingClientRect()
      begin('cell', c.id, e, { x: e.clientX - r.left, y: e.clientY - r.top })
    },
    onKey: (c, e) => {
      const name = WIDGETS[c.widget].name
      const mine = picked?.id === c.id ? picked : null
      const keep = () => {
        if (mine && draft && JSON.stringify(draft) !== JSON.stringify(mine.origin)) onCommit(draft, `${name} moved`)
        setDraft(null)
        setPicked(null)
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        if (mine) keep()
        else {
          setPicked({ id: c.id, origin: rows })
          setDraft(rows)
          onSay(`${name} picked up`)
        }
        return
      }
      if (!mine) return
      if (e.key === 'Tab') return keep()
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        setDraft(null)
        setPicked(null)
        onSay(`${name} put back`)
        return
      }
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return
      e.preventDefault()
      const next = step(draft ?? rows, c.id, e.key)
      if (!next) return onSay(`${name} cannot go further`)
      setDraft(next)
      const at = findCell(next, c.id)
      if (at) onSay(`Row ${at.r + 1}, column ${at.c + 1}`)
    },
    onRemove,
    onPatch: (c, p) => onPatch(c.id, p),
    onColour: (c, t) => onColour(c.id, t),
  }

  /* ---- rows ---- */

  const rowMenu = (row: Row, index: number): MenuItem[] => [
    { id: 'even', label: 'Even out widths', disabled: row.columns.length < 2 },
    { id: 'height', label: 'Reset height', disabled: row.height === rowNaturalH(row) },
    { id: 'up', label: 'Move up', disabled: index === 0 || (pinnedRow !== null && rows[0]?.id === pinnedRow && index === 1), divide: true },
    { id: 'down', label: 'Move down', disabled: index === rows.length - 1 },
    { id: 'remove', label: 'Remove row', divide: true },
  ]
  const onRowMenu = (row: Row, index: number) => (id: string) => {
    if (id === 'even') onCommit(rows.map((r) => (r.id === row.id ? evenRow(r) : r)), 'Widths evened out')
    else if (id === 'height') onCommit(rows.map((r) => (r.id === row.id ? setRowHeight(r, rowNaturalH(r)) : r)), 'Row height put back')
    else if (id === 'up') onCommit(moveRow(rows, index, index - 1), 'Row moved up')
    else if (id === 'down') onCommit(moveRow(rows, index, index + 1), 'Row moved down')
    else if (id === 'remove') onRemoveRow(row)
  }

  const order = (() => {
    const out = new Map<string, number>()
    shown.forEach((r) => r.columns.forEach((c) => c.cells.forEach((x) => out.set(x.id, out.size))))
    return out
  })()
  const edit = editing && !stacked

  return (
    <div className={`bdash-board${editing ? ' is-editing' : ''}${stacked ? ' is-stacked' : ''}${sizing ? ` is-sizing is-sizing-${sizing}` : ''}${dock ? ' is-docking' : ''}`} ref={setBoard}>
      {shown.map((row, ri) => (
        <motion.div
          key={row.id}
          layout={still ? false : 'position'}
          transition={{ layout: sizing || still ? { duration: 0 } : SPRING }}
          data-row={row.id}
          className={`bdash-row${row.id === pinnedRow ? ' is-pinned' : ''}${dock?.kind === 'row' && dock.id === row.id ? ' is-moving' : ''}`}
          style={{ ['--row-h' as string]: `${row.height}px` }}
        >
          {edit && row.id !== pinnedRow && (
            <span
              className="bdash-row__grip"
              data-chrome
              onPointerDown={(e) => {
                if (e.button !== 0) return
                begin('row', row.id, e, { x: 0, y: 0 })
              }}
              onClickCapture={(e) => {
                /* A grip that was dragged does not also open its menu. */
                if (dragged.current) {
                  e.preventDefault()
                  e.stopPropagation()
                }
              }}
            >
              <RowMenu label={`Row ${ri + 1}`} icon={GripVertical} items={rowMenu(row, ri)} onSelect={onRowMenu(row, ri)} align="start" />
            </span>
          )}
          <div className="bdash-row__cols">
            {row.columns.map((col, ci) => {
              const px = stackHeights(row, col)
              return (
                <div key={col.id} data-col={col.id} className="bdash-col" style={{ gridColumn: `span ${col.span}` }}>
                  {col.cells.map((cell, k) => (
                    <CellView
                      key={cell.id}
                      cell={cell}
                      order={order.get(cell.id) ?? 0}
                      editing={editing}
                      range={range}
                      movable={edit && row.id !== pinnedRow}
                      state={settle === cell.id ? 'hidden' : dock?.kind === 'cell' && dock.id === cell.id ? 'slot' : 'rest'}
                      picked={picked?.id === cell.id}
                      building={building}
                      boardTheme={theme}
                      instant={sizing !== null || settle === cell.id}
                      style={{ ['--cell-h' as string]: `${Math.round(px[k])}px` }}
                      handlers={handlers}
                    />
                  ))}
                  {edit &&
                    col.cells.slice(0, -1).map((cell, k) => {
                      const r = stackRange(row, ci, k)
                      return (
                        <Bar
                          key={`s${cell.id}`}
                          orientation="horizontal"
                          label={`Share the height of ${WIDGETS[cell.widget].name} and ${WIDGETS[col.cells[k + 1].widget].name}`}
                          now={r.now}
                          min={r.lo}
                          max={r.hi}
                          className="is-stack"
                          style={{ top: px.slice(0, k + 1).reduce((a, b) => a + b, 0) + k * GAP }}
                          onDrag={(phase, dx, dy, e) => (phase === 'start' ? startBar('stack', row, k, ci) : dragBar(dx, dy, e))}
                          onDone={endBar}
                          onKey={keyBar('stack', row, k, ci)}
                          onReset={resetBar('stack', row, k, ci)}
                        />
                      )
                    })}
                </div>
              )
            })}
            {edit &&
              row.columns.slice(0, -1).map((col, i) => {
                const r = colRange(row, i)
                return (
                  <Bar
                    key={`v${col.id}`}
                    orientation="vertical"
                    label={`Share the width of ${WIDGETS[col.cells[0].widget].name} and ${WIDGETS[row.columns[i + 1].cells[0].widget].name}`}
                    now={col.span}
                    min={r.lo}
                    max={r.hi}
                    style={{ left: barLeft(row, i) }}
                    onDrag={(phase, dx, dy, e) => (phase === 'start' ? startBar('col', row, i, 0) : dragBar(dx, dy, e))}
                    onDone={endBar}
                    onKey={keyBar('col', row, i, 0)}
                    onReset={resetBar('col', row, i, 0)}
                  />
                )
              })}
          </div>
          {edit && (
            <Bar
              orientation="horizontal"
              label={`Height of row ${ri + 1}`}
              now={row.height}
              min={rowMinH(row)}
              max={rowMaxH(row)}
              className="is-row"
              onDrag={(phase, dx, dy, e) => (phase === 'start' ? startBar('row', row, 0, 0) : dragBar(dx, dy, e))}
              onDone={endBar}
              onKey={keyBar('row', row, 0, 0)}
              onReset={resetBar('row', row, 0, 0)}
            />
          )}
        </motion.div>
      ))}
      {guides.map((x) => (
        <span key={x} className="bdash-guide" style={{ left: x }} aria-hidden />
      ))}
      {drop && <span className={`bdash-drop is-${drop.shape}`} style={drop.rect} aria-hidden />}
      {typeof document !== 'undefined' &&
        createPortal(
          <>
            {tip && (
              <span className="bdash-tip" style={{ left: tip.x, top: tip.y }} aria-hidden>
                {tip.text}
              </span>
            )}
            {lift && <CellLift cell={lift.cell} range={range} rect={lift.rect} settling={lift.settling} theme={theme} brand={brand} />}
            {chip && (
              <span className="bdash-chip bdash-vars" style={{ left: chip.x, top: chip.y }} aria-hidden>
                {WIDGETS[chip.widget].name}
              </span>
            )}
          </>,
          appRoot(),
        )}
    </div>
  )
}

const findWidget = (rows: readonly Row[], id: string): WidgetId => {
  const at = findCell(rows, id)
  return at ? rows[at.r].columns[at.c].cells[at.k].widget : 'sign-ins'
}
