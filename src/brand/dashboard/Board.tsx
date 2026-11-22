import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type Ref } from 'react'
import { createPortal } from 'react-dom'
import { useReducedMotion } from 'motion/react'
import { GripVertical, Plus } from 'lucide-react'
import { RowMenu, type MenuItem } from '../kit'
import { appRoot } from '../dialog-chrome'
import { pct, useSize } from './format'
import {
  COLS,
  GAP,
  STEP,
  barLock,
  colMaxSpan,
  colMinSpan,
  colRange,
  evenRow,
  findCell,
  fitsRow,
  moveCell,
  moveRow,
  newId,
  place,
  rowMaxH,
  rowMinH,
  rowLock,
  rowNaturalH,
  setBoundary,
  setRowHeight,
  setStackSplit,
  stackHeights,
  stackRange,
  whyNot,
  type Cell,
  type Row,
  type Target,
} from './layout'
import { geometry, type Geometry } from './geometry'
import { WIDGETS, WIDGET_IDS, type Range, type WidgetId } from './model'
import type { ThemeId } from './themes'
import { CellLift, Tile, type CellHandlers } from './Tile'
import { resolveTarget, targetKey, type DragPhase } from './drag'
import { tagsOf, type Mark } from './tags'
import { applySplit } from './splits'
import { SplitPicker } from './SplitPicker'
import { shows } from '../rollout'

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

   Smooth by construction (owner, same day: "laggy, very heavy, and very
   jittery … snappy … as smooth as can be"):
   · Every widget sits in ONE flat layer, placed by a transform from
     geometry.ts, so a widget that changes row keeps its element and its chart.
   · A move glides: the widget is put in its new place at once and played in
     from the old one as a transform animation, which runs on the compositor.
     Nothing else animates the layout, so nothing fights.
   · A pointer move does no React work: the lifted copy, the drop line, the
     tip and the guide are moved on the next animation frame by hand, and a
     drop is found from the geometry, not by reading the page.
   -------------------------------------------------------------------------- */

export interface BoardHandle {
  /** A widget picked up outside the board: carry it to the board. */
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

/** The drop previews live: once the pointer rests on a place, the board makes room there and the widget's slot moves to
    it, so what is let go is what was seen (owner, 20 Nov 2026: "like a preview"). Design only (rollout.ts). */
const LIVE = shows('dashboardGrid')
/** How long the pointer rests on a place before the board makes room there: long enough that sweeping across the board
    does not shuffle it, short enough to feel immediate. */
const DWELL_MS = 90
/** How far outside the board a widget can be carried before letting go puts it back. */
const OUTSIDE = 40

/** The board as a drag shows it: the rows, and where everything in them is drawn. */
interface View {
  rows: Row[]
  geo: Geometry
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
  /** The board as it was when the drag began: the drag never changes it. */
  rows: Row[]
  geo: Geometry
  /** Targets already tried, so a pointer resting on one does not lay the board out again. */
  tried: Map<string, boolean>
  /** Why the last place tried was refused, for the tip. */
  why: string | null
  /** What the board shows now: `rows` until a preview lands, then the preview. Places are found on this. */
  view: View
  /** The target the preview shows, and the one waiting out its dwell. */
  shownKey: string | null
  waitKey: string | null
  wait: number
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

/** The glide: quick off the mark, soft to land (owner: "snappy … smooth"). */
const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)'
const GLIDE_MS = 280

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
  locked = null,
  onLocked,
}: {
  /** `vertical`: a bar between two columns, moving width. `horizontal`: a bar moving height. */
  orientation: 'vertical' | 'horizontal'
  label: string
  now: number
  min: number
  max: number
  style?: CSSProperties
  className?: string
  onDrag: (phase: 'start' | 'move', dx: number, dy: number, x: number, y: number) => void
  onDone: (keep: boolean) => void
  onKey: (e: KeyboardEvent<HTMLDivElement>) => void
  onReset: () => void
  /** Why the bar cannot move, where both its sides are at a limit: it shows no grip and says so when pressed. */
  locked?: string | null
  onLocked?: (why: string, x: number, y: number) => void
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
      aria-disabled={locked ? true : undefined}
      title={locked ?? undefined}
      data-chrome
      className={`bdash-bar is-${orientation === 'vertical' ? 'v' : 'h'} ${className}${locked ? ' is-locked' : ''}`}
      style={style}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.preventDefault()
        e.stopPropagation()
        if (locked) {
          onLocked?.(locked, e.clientX, e.clientY)
          return
        }
        e.currentTarget.setPointerCapture(e.pointerId)
        from.current = { x: e.clientX, y: e.clientY }
        onDrag('start', 0, 0, e.clientX, e.clientY)
      }}
      onPointerMove={(e) => {
        if (from.current) onDrag('move', e.clientX - from.current.x, e.clientY - from.current.y, e.clientX, e.clientY)
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
      onKeyDown={(e) => {
        if (locked && e.key !== 'Tab') {
          if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) e.preventDefault()
          return onLocked?.(locked, -1, -1)
        }
        onKey(e)
      }}
      onDoubleClick={locked ? undefined : onReset}
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
  mark = null,
  onAddHere,
  onBoard,
}: {
  ref?: Ref<BoardHandle>
  rows: Row[]
  editing: boolean
  range: Range
  theme: ThemeId
  brand: string
  /** The row that stays first while the move from the old policies is open: not moved, not dropped into. */
  pinnedRow: string | null
  /** The dashboard is being built from a layout: its widgets arrive one after another. */
  building: boolean
  /** The layout changed by hand: keep it, and say what happened. `moved`: the widget that was moved, for its tag. */
  onCommit: (next: Row[], said: string, moved?: string) => void
  /** The widget just added or moved, which wears a tag saying so (tags.ts). */
  mark?: Mark | null
  /** A row's Add here: open the library for what fits that row. */
  onAddHere?: (row: Row, index: number) => void
  /** Widgets already on the dashboard, which a row's Add here does not offer. */
  onBoard?: (w: WidgetId) => boolean
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
  const [dock, setDock] = useState<{ kind: Dock['kind']; id: string } | null>(null)
  const [lift, setLift] = useState<{ cell: Cell; width: number; height: number } | null>(null)
  const [chip, setChip] = useState<WidgetId | null>(null)
  const [picked, setPicked] = useState<{ id: string; origin: Row[] } | null>(null)
  const [settle, setSettle] = useState<string | null>(null)
  /* The board as a widget being carried shows it: room made where it would land (LIVE). */
  const [preview, setPreview] = useState<Row[] | null>(null)
  /* Where a widget's drag is (drag.ts), on the board as data-drag for the rigs and the styles. */
  const [phase, setPhase] = useState<DragPhase>('idle')
  const bar = useRef<BarDrag | null>(null)
  const barDraft = useRef<Row[] | null>(null)
  const session = useRef<Dock | null>(null)
  const dragged = useRef(false)
  const liftEl = useRef<HTMLDivElement>(null)
  const chipEl = useRef<HTMLSpanElement>(null)
  const dropEl = useRef<HTMLSpanElement>(null)
  const tipEl = useRef<HTMLSpanElement>(null)
  const guideEl = useRef<HTMLSpanElement>(null)
  /* Where the lifted copy and the chip first appear; after that the pointer moves them by hand (begin). Their refs are
     stable, so the copy, drawn once, is not drawn again. */
  const liftAt = useRef({ x: 0, y: 0 })
  const chipAt = useRef({ x: 0, y: 0 })
  const setLiftEl = useCallback((el: HTMLDivElement | null) => {
    liftEl.current = el
    if (el && !el.style.transform) el.style.transform = `translate(${liftAt.current.x}px, ${liftAt.current.y}px)`
  }, [])
  const setChipEl = useCallback((el: HTMLSpanElement | null) => {
    chipEl.current = el
    if (el && !el.style.transform) el.style.transform = `translate(${chipAt.current.x}px, ${chipAt.current.y}px)`
  }, [])

  const shown = preview ?? draft ?? rows
  const geo = useMemo(() => geometry(shown, size.w, stacked), [shown, size.w, stacked])

  /* What the window's own listeners read: they outlive the render that added them. */
  const live = useRef({ rows, pinnedRow, onCommit, onSay, width: size.w, stacked })
  live.current = { rows, pinnedRow, onCommit, onSay, width: size.w, stacked }

  const setBoard = (el: HTMLDivElement | null) => {
    board.current = el
    sizeRef.current = el
  }

  /* ---- one piece of work per animation frame ---- */

  const frame = useRef(0)
  const pending = useRef<(() => void) | null>(null)
  const schedule = (fn: () => void) => {
    pending.current = fn
    if (frame.current) return
    frame.current = requestAnimationFrame(() => {
      frame.current = 0
      const f = pending.current
      pending.current = null
      f?.()
    })
  }
  /** The frame waiting, now: a pointer let go before its last move was drawn still lands where it was let go. */
  const flush = () => {
    if (frame.current) cancelAnimationFrame(frame.current)
    frame.current = 0
    const f = pending.current
    pending.current = null
    f?.()
  }
  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  /* ---- the line, the tip and the guide, drawn by hand ---- */

  const showDrop = (d: Drop | null) => {
    const el = dropEl.current
    if (!el) return
    if (!d) {
      el.hidden = true
      return
    }
    const fresh = el.hidden
    el.hidden = false
    /* The first time it shows it is put in place; after that it glides from target to target. */
    el.className = `bdash-drop is-${d.shape}${fresh ? ' is-fresh' : ''}`
    el.style.transform = `translate(${d.rect.left}px, ${d.rect.top}px)`
    el.style.width = `${d.rect.width}px`
    el.style.height = `${d.rect.height}px`
  }
  const showTip = (x: number, y: number, text: string | null) => {
    const el = tipEl.current
    if (!el) return
    el.hidden = !text
    if (!text) return
    el.textContent = text
    el.style.transform = `translate(${x}px, ${y}px)`
  }
  const showGuide = (x: number | null) => {
    const el = guideEl.current
    if (!el) return
    el.hidden = x == null
    if (x != null) el.style.transform = `translateX(${x}px)`
  }

  /* Leaving Customize ends anything in hand. */
  useEffect(() => {
    if (editing) return
    session.current?.stop()
    session.current = null
    bar.current = null
    barDraft.current = null
    setDraft(null)
    setPicked(null)
    setSizing(null)
    setDock(null)
    setLift(null)
    setChip(null)
    setPreview(null)
    setPhase('idle')
  }, [editing])
  useEffect(() => () => session.current?.stop(), [])

  /* ---- the glide ----
     Every widget whose place changed is played in from where it was, as a transform animation: it is already in its new
     place, so a glide cut short ends there. Nothing glides while a bar is held (the board follows the pointer), when the
     page itself changed width, or with reduced motion. Widgets that are new arrive: one by one when a layout is being
     built, together otherwise. */
  const before = useRef<Geometry | null>(null)
  useLayoutEffect(() => {
    const was = before.current
    before.current = geo
    const host = board.current
    if (!host || geo.width === 0 || still) return
    const fresh = !was || was.width === 0
    if (!fresh && (sizing || was.width !== geo.width || was.stacked !== geo.stacked)) return
    if (fresh && !building) return
    let n = 0
    host.querySelectorAll<HTMLElement>(':scope > [data-cell]').forEach((el) => {
      const id = el.dataset.cell ?? ''
      const box = geo.cells[id]
      if (!box || id === settle) return
      const old = fresh ? undefined : was.cells[id]
      if (!old) {
        el.animate([{ opacity: 0, translate: '0 12px' }, { opacity: 1, translate: '0 0' }], {
          duration: building ? 340 : 220,
          delay: building ? Math.min(900, n++ * 45) : 0,
          easing: EASE,
          fill: 'backwards',
        })
        return
      }
      const dx = old.x - box.x
      const dy = old.y - box.y
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return
      el.animate([{ translate: `${dx}px ${dy}px` }, { translate: '0 0' }], { duration: GLIDE_MS, easing: EASE })
    })
    /* Run again for a flag alone (a bar let go, a glide landed), it finds every widget where it was, and plays nothing. */
  }, [geo, building, still, sizing, settle])

  /* A dropped widget's lifted copy glides to where the widget landed, and only then is the widget shown. */
  useLayoutEffect(() => {
    if (!settle) return
    const el = liftEl.current
    const box = geo.cells[settle]
    const host = board.current
    if (!el || !box || !host || still) {
      setLift(null)
      setSettle(null)
      setPhase('idle')
      return
    }
    const hb = host.getBoundingClientRect()
    const glide = el.animate(
      [
        { transform: el.style.transform, rotate: '1.2deg', width: el.style.width, height: el.style.height },
        { transform: `translate(${hb.left + box.x}px, ${hb.top + box.y}px)`, rotate: '0deg', width: `${box.w}px`, height: `${box.h}px` },
      ],
      { duration: 200, easing: EASE, fill: 'forwards' },
    )
    glide.onfinish = () => {
      setLift(null)
      setSettle(null)
      setPhase('idle')
    }
    return () => {
      glide.onfinish = null
    }
  }, [settle, still, geo.cells])

  /* ---- the bars ---- */

  const startBar = (kind: BarDrag['kind'], row: Row, index: number, col: number) => {
    const unit = (geo.width + GAP) / COLS
    const start = kind === 'col' ? row.columns[index].span : kind === 'row' ? row.height : stackHeights(row, row.columns[col])[index]
    bar.current = { kind, row: row.id, index, col, start, unit, origin: rows }
    barDraft.current = null
    setSizing(kind)
  }

  const dragBar = (dx: number, dy: number, x: number, y: number) =>
    schedule(() => {
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
      barDraft.current = next
      setDraft(next)
      const r = changed as Row | null
      if (!r) return
      if (b.kind === 'col') {
        const { lo, hi } = colRange(r, b.index)
        const a = r.columns[b.index].span
        const nameA = WIDGETS[r.columns[b.index].cells[0].widget].name
        const nameB = WIDGETS[r.columns[b.index + 1].cells[0].widget].name
        const left = r.columns[b.index]
        const plain = a === lo || a === hi ? ` · ${a === lo ? 'narrowest' : 'widest'}` : ''
        /* At a limit, the tip names the widget that holds it there. */
        const named =
          a === lo ? ` · ${a <= colMinSpan(left) ? `${nameA} at its narrowest` : `${nameB} at its widest`}` : a === hi ? ` · ${a >= colMaxSpan(left) ? `${nameA} at its widest` : `${nameB} at its narrowest`}` : ''
        const edge = LIVE ? named : plain
        showTip(x, y, `${pct(a / COLS)} | ${pct(r.columns[b.index + 1].span / COLS)}${edge}`)
        /* Another row with a bar in the same place: draw the line they share. */
        const at = bounds(r)[b.index]
        const match = next.some((o) => o.id !== r.id && bounds(o).includes(at))
        showGuide(match ? Math.round(at * b.unit) - GAP / 2 : null)
      } else {
        const min = b.kind === 'row' ? rowMinH(r) : stackRange(r, b.col, b.index).lo
        const max = b.kind === 'row' ? rowMaxH(r) : stackRange(r, b.col, b.index).hi
        const now = b.kind === 'row' ? r.height : stackHeights(r, r.columns[b.col])[b.index]
        showTip(x, y, now <= min + 0.5 ? 'Shortest' : now >= max - 0.5 ? 'Tallest' : null)
      }
    })

  const endBar = (keep: boolean) => {
    flush()
    const b = bar.current
    const last = barDraft.current
    bar.current = null
    barDraft.current = null
    setSizing(null)
    showTip(0, 0, null)
    showGuide(null)
    if (b && keep && last && JSON.stringify(last) !== JSON.stringify(b.origin)) {
      onCommit(last, b.kind === 'col' ? 'Widths changed' : b.kind === 'row' ? 'Row height changed' : 'Heights changed')
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

  /** A locked bar pressed: the tip by the pointer (or the bar, from the keys) says why, and the reader hears it. */
  const sayLocked = (why: string, x: number, y: number) => {
    onSay(why)
    if (x < 0) return
    showTip(x, y, why)
    window.setTimeout(() => showTip(0, 0, null), 1600)
  }

  /* ---- dragging widgets and rows ---- */

  /** Where a drop would land, and the line or outline that says so, in the board's own pixels. Null where nothing can
      go. Read from the geometry the drag began with, so no part of the page is measured but the board's corner. */
  const hit = (x: number, y: number, d: Dock): Drop | null => {
    const host = board.current
    if (!host) return null
    const hb = host.getBoundingClientRect()
    const px = x - hb.left
    const py = y - hb.top
    /* A widget is found a place on the board as it is drawn (a preview, if one shows); a row on the board as it was. */
    const now = d.kind === 'cell' ? d.view.rows : d.rows
    const g = d.kind === 'cell' ? d.view.geo : d.geo
    const pinned = live.current.pinnedRow
    const floor = pinned && now[0]?.id === pinned ? 1 : 0

    /** The place said against the board as it was before the drag; 'keep' over the widget's own slot. */
    const said = (t: Target): Target | 'keep' => (d.kind === 'cell' && d.view.rows !== d.rows ? resolveTarget(t, d.view.rows, d.rows, d.id) : t)
    const valid = (t: Target): boolean => {
      const o = said(t)
      if (o === 'keep') return false
      const key = targetKey(o)
      const known = d.tried.get(key)
      if (known === undefined) {
        const ok = d.kind === 'cell' ? moveCell(d.rows, d.id, o) !== null : d.kind === 'new' && !!d.widget && place(d.rows, { id: 'x', widget: d.widget, weight: 1 }, o) !== null
        d.tried.set(key, ok)
      }
      const ok = d.tried.get(key) === true
      if (!ok && d.kind !== 'row') {
        const cell = d.kind === 'cell' ? findCell(d.rows, d.id) : null
        const widget = cell ? d.rows[cell.r].columns[cell.c].cells[cell.k].widget : d.widget
        if (widget) d.why = whyNot(d.rows, { id: d.id, widget }, o) ?? d.why
      }
      return ok
    }
    /** A drop said against the board as it was. */
    const out = (t: Target, rect: Rect, shape: Drop['shape']): Drop | null => {
      const o = said(t)
      return o === 'keep' ? null : { target: o, rect, shape }
    }
    /* A gap between rows (or above the first, below the last): a row of its own there. */
    const between = (index: number): Drop | null => {
      const at = Math.max(floor, index)
      const above = g.rows[at - 1]
      const below = g.rows[at]
      const lineY = above && below ? (above.y + above.h + below.y) / 2 : above ? above.y + above.h + GAP / 2 : below ? below.y - GAP / 2 : 0
      const rect = { left: 0, top: lineY - 1.5, width: g.width, height: 3 }
      if (d.kind === 'row') {
        const from = now.findIndex((r) => r.id === d.id)
        const to = at > from ? at - 1 : at
        return to === from ? null : { target: null, rowTo: to, rect, shape: 'h' }
      }
      const target: Target = { at: 'row', before: now[at]?.id ?? null }
      return valid(target) ? out(target, rect, 'h') : null
    }

    if (g.rows.length === 0) return between(0)
    const inRow = g.rows.findIndex((b) => py >= b.y && py <= b.y + b.h)
    if (inRow < 0 || d.kind === 'row') return between(g.rows.filter((b) => b.y + b.h / 2 < py).length)
    const rb = g.rows[inRow]
    const row = now[inRow]
    /* The first and last few pixels of a row count as the gap beside it, so a new row is easy to start. */
    if (py < rb.y + 10) return between(inRow)
    if (py > rb.y + rb.h - 10) return between(inRow + 1)
    if (row.id === pinned) return null

    const cols = row.columns.map((c) => ({ c, b: g.cols[c.id] }))
    const colLine = (before: string | null, xLine: number): Drop | null => {
      const target: Target = { at: 'column', row: row.id, before }
      return valid(target) ? out(target, { left: xLine - 1.5, top: rb.y, width: 3, height: rb.h }, 'v') : null
    }
    const ci = cols.findIndex((o) => px >= o.b.x && px <= o.b.x + o.b.w)
    if (ci < 0) {
      const after = cols.filter((o) => o.b.x + o.b.w < px).length
      const left = cols[after - 1]?.b
      const right = cols[after]?.b
      return colLine(cols[after]?.c.id ?? null, left && right ? (left.x + left.w + right.x) / 2 : left ? left.x + left.w + GAP / 2 : (right?.x ?? 0) - GAP / 2)
    }
    const { c: col, b: cb } = cols[ci]
    const cells = col.cells.map((cell) => ({ cell, b: g.cells[cell.id] }))
    const stackLine = (before: string | null, yLine: number): Drop | null => {
      const target: Target = { at: 'stack', column: col.id, before }
      return valid(target) ? out(target, { left: cb.x, top: yLine - 1.5, width: cb.w, height: 3 }, 'h') : null
    }
    const ki = cells.findIndex((o) => py >= o.b.y && py <= o.b.y + o.b.h)
    if (ki < 0) {
      const after = cells.filter((o) => o.b.y + o.b.h < py).length
      const above = cells[after - 1]?.b
      const below = cells[after]?.b
      return stackLine(cells[after]?.cell.id ?? null, above && below ? (above.y + above.h + below.y) / 2 : above ? above.y + above.h + GAP / 2 : (below?.y ?? cb.y) - GAP / 2)
    }
    const { cell, b: kb } = cells[ki]
    const rx = (px - kb.x) / kb.w
    const ry = (py - kb.y) / kb.h
    const nextCol = row.columns[ci + 1]?.id ?? null
    const nextCell = col.cells[ki + 1]?.id ?? null
    if (rx < 0.22) return colLine(col.id, cb.x - GAP / 2)
    if (rx > 0.78) return colLine(nextCol, cb.x + cb.w + GAP / 2)
    if (ry < 0.3) return stackLine(cell.id, kb.y - GAP / 2)
    if (ry > 0.7) return stackLine(nextCell, kb.y + kb.h + GAP / 2)
    if (d.kind === 'cell') {
      if (cell.id === d.id) return null
      const target: Target = { at: 'swap', cell: cell.id }
      return valid(target) ? out(target, { left: kb.x, top: kb.y, width: kb.w, height: kb.h }, 'box') : null
    }
    return stackLine(nextCell, kb.y + kb.h + GAP / 2) ?? colLine(nextCol, cb.x + cb.w + GAP / 2)
  }

  const finish = (d: Dock, keep: boolean) => {
    if (session.current === d) flush()
    d.stop()
    window.clearTimeout(d.wait)
    session.current = null
    setDock(null)
    showDrop(null)
    showTip(0, 0, null)
    setChip(null)
    setPreview(null)
    setPhase('idle')
    if (!d.started) return
    dragged.current = true
    window.setTimeout(() => (dragged.current = false), 0)
    const now = live.current.rows
    const out = d.drop
    /* What the preview showed is what lands, to the pixel: the same rows, ids and all. */
    if (keep && LIVE && d.kind === 'cell' && d.view.rows !== d.rows && d.shownKey) {
      live.current.onCommit(d.view.rows, `${WIDGETS[findWidget(now, d.id)].name} moved`, d.id)
      setSettle(d.id)
      setPhase('settling')
      return
    }
    if (keep && out) {
      if (d.kind === 'row' && out.rowTo !== undefined) {
        live.current.onCommit(moveRow(now, now.findIndex((r) => r.id === d.id), out.rowTo), 'Row moved')
      } else if (d.kind === 'cell' && out.target) {
        const next = moveCell(now, d.id, out.target)
        if (next) {
          live.current.onCommit(next, `${WIDGETS[findWidget(now, d.id)].name} ${out.target.at === 'swap' ? 'swapped' : 'moved'}`, d.id)
          setSettle(d.id)
          setPhase('settling')
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

  /** One frame of a widget being carried with the live preview (drag.ts has the states):
      · over its own slot in the preview, nothing changes;
      · carried off the board, the board shows itself as it was, and letting go puts the widget back;
      · resting on a place for DWELL_MS, the board makes room there;
      · over a place it cannot go, the room already made stays, and the tip says why not. */
  const carry = (d: Dock, x: number, y: number) => {
    const host = board.current
    if (!host) return
    const hb = host.getBoundingClientRect()
    const px = x - hb.left
    const py = y - hb.top
    const off = px < -OUTSIDE || px > hb.width + OUTSIDE || py < -OUTSIDE || py > hb.height + OUTSIDE
    const toOrigin = () => {
      window.clearTimeout(d.wait)
      d.waitKey = null
      if (d.view.rows === d.rows) return
      d.view = { rows: d.rows, geo: d.geo }
      d.shownKey = null
      d.drop = null
      setPreview(null)
      setPhase('carrying')
    }
    if (off) {
      toOrigin()
      showDrop(null)
      showTip(x, y, 'Let go to put it back')
      return
    }
    const slot = d.view.geo.cells[d.id]
    if (slot && px >= slot.x && px <= slot.x + slot.w && py >= slot.y && py <= slot.y + slot.h) {
      window.clearTimeout(d.wait)
      d.waitKey = null
      showDrop(null)
      showTip(0, 0, null)
      return
    }
    d.why = null
    const found = hit(x, y, d)
    if (!found?.target) {
      window.clearTimeout(d.wait)
      d.waitKey = null
      showDrop(null)
      showTip(x, y, d.why)
      return
    }
    showTip(0, 0, null)
    const key = targetKey(found.target)
    if (key === d.shownKey) {
      showDrop(null)
      return
    }
    /* The line says where it would go while the board waits to be sure. */
    showDrop(found)
    if (key === d.waitKey) return
    window.clearTimeout(d.wait)
    d.waitKey = key
    const target = found.target
    d.wait = window.setTimeout(() => {
      if (session.current !== d || d.waitKey !== key) return
      const next = moveCell(d.rows, d.id, target)
      d.waitKey = null
      if (!next) return
      const { width, stacked: narrow } = live.current
      d.view = { rows: next, geo: geometry(next, width, narrow) }
      d.shownKey = key
      d.drop = found
      showDrop(null)
      setPreview(next)
      setPhase('previewing')
    }, DWELL_MS)
  }

  const begin = (kind: Dock['kind'], id: string, e: PointerEvent<HTMLElement>, grab: { x: number; y: number }, widget?: WidgetId) => {
    session.current?.stop()
    const { rows: now, width, stacked: narrow } = live.current
    const d: Dock = {
      kind,
      id,
      widget,
      startX: e.clientX,
      startY: e.clientY,
      grabX: grab.x,
      grabY: grab.y,
      started: false,
      drop: null,
      rows: now,
      geo: geometry(now, width, narrow),
      tried: new Map(),
      why: null,
      view: { rows: now, geo: geometry(now, width, narrow) },
      shownKey: null,
      waitKey: null,
      wait: 0,
      stop: () => {},
    }
    d.view.geo = d.geo
    const move = (ev: globalThis.PointerEvent) => {
      const x = ev.clientX
      const y = ev.clientY
      if (!d.started) {
        if (Math.hypot(x - d.startX, y - d.startY) < 5) return
        d.started = true
        setPhase('carrying')
        document.documentElement.classList.add('bdash-dragging')
        setPicked(null)
        setDock({ kind, id })
        if (kind === 'cell') {
          const box = d.geo.cells[id]
          const at = findCell(d.rows, id)
          if (box && at) {
            liftAt.current = { x: x - d.grabX, y: y - d.grabY }
            setLift({ cell: d.rows[at.r].columns[at.c].cells[at.k], width: box.w, height: box.h })
          }
        }
        if (kind === 'new' && widget) {
          chipAt.current = { x, y }
          setChip(widget)
        }
      }
      ev.preventDefault()
      schedule(() => {
        if (session.current !== d) return
        if (kind === 'cell' && liftEl.current) liftEl.current.style.transform = `translate(${x - d.grabX}px, ${y - d.grabY}px)`
        if (kind === 'new' && chipEl.current) chipEl.current.style.transform = `translate(${x}px, ${y}px)`
        if (kind === 'cell' && LIVE) return carry(d, x, y)
        d.why = null
        d.drop = hit(x, y, d)
        showDrop(d.drop)
        showTip(x, y, d.drop ? null : d.why)
      })
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

  /* The tiles' callbacks, rebuilt every render with the render's own values, behind one object that never changes:
     a tile is memoized, and a new set of callbacks would draw every tile again. */
  const latest = useRef<CellHandlers | null>(null)
  latest.current = {
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
        if (mine && draft && JSON.stringify(draft) !== JSON.stringify(mine.origin)) onCommit(draft, `${name} moved`, c.id)
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
  const handlers = useMemo<CellHandlers>(
    () => ({
      onGrab: (c, e) => latest.current?.onGrab(c, e),
      onKey: (c, e) => latest.current?.onKey(c, e),
      onRemove: (c) => latest.current?.onRemove(c),
      onPatch: (c, p) => latest.current?.onPatch(c, p),
      onColour: (c, t) => latest.current?.onColour(c, t),
    }),
    [],
  )

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

  const edit = editing && !stacked
  const byId = new Map(shown.map((r) => [r.id, r]))
  /* Rows with room for one more widget, which show an Add here. Worked out once per layout, not per frame. */
  const roomy = useMemo(() => {
    if (!edit || !LIVE || !onAddHere) return new Set<string>()
    const free = WIDGET_IDS.filter((w) => !onBoard?.(w))
    return new Set(rows.filter((r) => r.id !== pinnedRow && fitsRow(rows, r.id, free).length > 0).map((r) => r.id))
  }, [edit, rows, pinnedRow, onAddHere, onBoard])
  const movingRow = dock?.kind === 'row' ? dock.id : null
  const stateOf = (cell: Cell, row: string): 'rest' | 'slot' | 'hidden' | 'dim' =>
    settle === cell.id ? 'hidden' : dock?.kind === 'cell' && dock.id === cell.id ? 'slot' : movingRow === row ? 'dim' : 'rest'

  return (
    <div
      className={`bdash-board${editing ? ' is-editing' : ''}${stacked ? ' is-stacked' : ''}${sizing ? ` is-sizing is-sizing-${sizing}` : ''}${dock ? ' is-docking' : ''}`}
      ref={setBoard}
      data-drag={phase}
      style={{ height: geo.height + (edit ? GAP : 0) }}
    >
      {/* Each row's grip, in the margin beside it; pointing at it outlines the row it moves. Not while a bar is held:
          nothing else is pressed then, and the grips would be drawn again on every frame. */}
      {edit &&
        !sizing &&
        geo.rows.map((rb, ri) => {
          const row = shown[ri]
          return (
            <div
              key={row.id}
              data-band={row.id}
              className={`bdash-band${row.id === pinnedRow ? ' is-pinned' : ''}${movingRow === row.id ? ' is-moving' : ''}`}
              style={{ transform: `translateY(${rb.y}px)`, height: rb.h }}
            >
              {row.id !== pinnedRow && (
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
              {/* Row splits: the row's layouts as small diagrams (splits.ts, owner 20 Nov 2026). */}
              {LIVE && row.id !== pinnedRow && !dock && (
                <SplitPicker
                  row={row}
                  index={ri}
                  onSplit={(spans, name) => {
                    const next = applySplit(row, spans)
                    if (next) onCommit(rows.map((r) => (r.id === row.id ? next : r)), `Row ${ri + 1} set to ${name.toLowerCase()}`)
                  }}
                />
              )}
              {/* Add here: a widget straight into this row, from the widgets that fit it (owner, 20 Nov 2026). */}
              {roomy.has(row.id) && !dock && (
                <button type="button" className="bdash-row__add" data-chrome aria-label={`Add a widget to row ${ri + 1}`} title="Add a widget to this row" onClick={() => onAddHere?.(row, ri)}>
                  <Plus size={14} strokeWidth={2.4} aria-hidden />
                </button>
              )}
            </div>
          )
        })}

      {/* Too narrow to arrange: the board shows one widget under another, and says why nothing can be moved (owner, 20 Nov
          2026: "if something can't move, let the user know"). */}
      {editing && stacked && LIVE && (
        <p className="bdash-narrow" role="status">
          Widen the window to move and size widgets
        </p>
      )}

      {/* The widgets, in reading order, each placed by its box. */}
      {shown.flatMap((row) =>
        row.columns.flatMap((col, ci) =>
          col.cells.map((cell, ki) => {
            const box = geo.cells[cell.id]
            if (!box) return null
            return (
              <Tile
                key={cell.id}
                cell={cell}
                box={box}
                editing={editing}
                range={range}
                movable={edit && row.id !== pinnedRow}
                state={stateOf(cell, row.id)}
                picked={picked?.id === cell.id}
                boardTheme={theme}
                brand={brand}
                handlers={handlers}
                tags={edit && LIVE ? tagsOf(row, ci, ki, row.id === pinnedRow, mark) : undefined}
              />
            )
          }),
        ),
      )}

      {/* The bars: between columns, between stacked widgets, and under each row. */}
      {edit &&
        geo.colBars.map((b) => {
          const row = byId.get(b.row)
          if (!row) return null
          const col = row.columns[b.index]
          const r = colRange(row, b.index)
          return (
            <Bar
              key={`v${col.id}`}
              orientation="vertical"
              label={`Share the width of ${WIDGETS[col.cells[0].widget].name} and ${WIDGETS[row.columns[b.index + 1].cells[0].widget].name}`}
              now={col.span}
              min={r.lo}
              max={r.hi}
              style={{ transform: `translate(${b.x}px, ${b.y}px)`, height: b.h }}
              onDrag={(phase, dx, dy, x, y) => (phase === 'start' ? startBar('col', row, b.index, 0) : dragBar(dx, dy, x, y))}
              onDone={endBar}
              onKey={keyBar('col', row, b.index, 0)}
              onReset={resetBar('col', row, b.index, 0)}
              locked={LIVE ? barLock(row, b.index) : null}
              onLocked={sayLocked}
            />
          )
        })}
      {edit &&
        geo.stackBars.map((b) => {
          const row = byId.get(b.row)
          if (!row) return null
          const col = row.columns[b.col]
          const cell = col.cells[b.index]
          const r = stackRange(row, b.col, b.index)
          return (
            <Bar
              key={`s${cell.id}`}
              orientation="horizontal"
              label={`Share the height of ${WIDGETS[cell.widget].name} and ${WIDGETS[col.cells[b.index + 1].widget].name}`}
              now={r.now}
              min={r.lo}
              max={r.hi}
              className="is-stack"
              style={{ transform: `translate(${b.x}px, ${b.y}px)`, width: b.w }}
              onDrag={(phase, dx, dy, x, y) => (phase === 'start' ? startBar('stack', row, b.index, b.col) : dragBar(dx, dy, x, y))}
              onDone={endBar}
              onKey={keyBar('stack', row, b.index, b.col)}
              onReset={resetBar('stack', row, b.index, b.col)}
            />
          )
        })}
      {edit &&
        geo.rows.map((rb, ri) => {
          const row = shown[ri]
          return (
            <Bar
              key={`h${row.id}`}
              orientation="horizontal"
              label={`Height of row ${ri + 1}`}
              now={row.height}
              min={rowMinH(row)}
              max={rowMaxH(row)}
              className="is-row"
              style={{ transform: `translateY(${rb.y + rb.h}px)` }}
              onDrag={(phase, dx, dy, x, y) => (phase === 'start' ? startBar('row', row, 0, 0) : dragBar(dx, dy, x, y))}
              onDone={endBar}
              onKey={keyBar('row', row, 0, 0)}
              onReset={resetBar('row', row, 0, 0)}
              locked={LIVE ? rowLock(row) : null}
              onLocked={sayLocked}
            />
          )
        })}

      {edit && <span ref={guideEl} className="bdash-guide" hidden aria-hidden />}
      {edit && <span ref={dropEl} className="bdash-drop" hidden aria-hidden />}
      {typeof document !== 'undefined' &&
        createPortal(
          <>
            {edit && <span ref={tipEl} className="bdash-tip" hidden aria-hidden />}
            {lift && (
              <CellLift
                ref={setLiftEl}
                cell={lift.cell}
                range={range}
                width={lift.width}
                height={lift.height}
                theme={theme}
                brand={brand}
              />
            )}
            {chip && (
              <span ref={setChipEl} className="bdash-chip bdash-vars" aria-hidden>
                {WIDGETS[chip].name}
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
