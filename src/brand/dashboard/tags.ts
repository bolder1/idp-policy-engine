import { WIDGETS } from './catalog'
import { COLS, colMaxSpan, colMinSpan, rowLock, stackHeights, type Row } from './layout'

/* -----------------------------------------------------------------------------
   The tags a widget wears in Customize (owner, 20 Nov 2026: "after adding a
   thing I don't know where it's added … tags like moved or new, with max width,
   min width … if something can't be small or can't move, let the user know").

   At most two on a widget, so they stay readable:
   · what just happened to it: New (added) or Moved, until the next change;
   · the one limit that matters most: Pinned, Full row, Fixed height, Widest,
     Narrowest or Tallest, each with a line saying why, for its tooltip and
     for the screen reader.
   -------------------------------------------------------------------------- */

export type TagKind = 'new' | 'moved' | 'pinned' | 'full' | 'fixed' | 'widest' | 'narrowest' | 'tallest'

export interface TileTag {
  kind: TagKind
  label: string
  why: string
}

/** What just happened to a widget, if anything: the board keeps one at a time. */
export interface Mark {
  id: string
  kind: 'new' | 'moved'
}

/** The limit a widget in `row` is held at, if any. `pinned`: its row stays first and cannot move. */
export function limitTag(row: Row, c: number, k: number, pinned: boolean): TileTag | null {
  const col = row.columns[c]
  const cell = col?.cells[k]
  if (!cell) return null
  const m = WIDGETS[cell.widget]
  if (pinned) return { kind: 'pinned', label: 'Pinned', why: `${m.name} stays first while the move from the old policies is open` }
  if (row.columns.length === 1 && m.maxW < COLS)
    return { kind: 'full', label: 'Full row', why: `Alone in its row, ${m.name} takes the full width. Put a widget beside it to make it narrower` }
  if (rowLock(row)) return { kind: 'fixed', label: 'Fixed height', why: 'This row is as tall as its widgets need, and none of them can be taller' }
  if (row.columns.length > 1) {
    const hi = colMaxSpan(col)
    const lo = colMinSpan(col)
    if (col.span >= hi && hi < COLS && hi > lo) return { kind: 'widest', label: 'Widest', why: `${m.name} is as wide as it reads well` }
    if (col.span <= lo && hi > lo) return { kind: 'narrowest', label: 'Narrowest', why: `${m.name} cannot be narrower` }
    if (hi === lo) return { kind: 'fixed', label: 'Fixed width', why: `${m.name} reads at one width only beside these widgets` }
  }
  const px = stackHeights(row, col)[k]
  if (px >= m.maxH - 1) return { kind: 'tallest', label: 'Tallest', why: `${m.name} is as tall as it reads well` }
  return null
}

/** Every tag a widget wears, the change first. */
export function tagsOf(row: Row, c: number, k: number, pinned: boolean, mark: Mark | null): TileTag[] {
  const cell = row.columns[c]?.cells[k]
  if (!cell) return []
  const out: TileTag[] = []
  const name = WIDGETS[cell.widget].name
  if (mark?.id === cell.id)
    out.push(
      mark.kind === 'new'
        ? { kind: 'new', label: 'New', why: `${name} was just added here` }
        : { kind: 'moved', label: 'Moved', why: `${name} was just moved here` },
    )
  const limit = limitTag(row, c, k, pinned)
  if (limit) out.push(limit)
  return out
}

/** One key for a widget's tags, so a tile is drawn again only when they change. */
export const tagKey = (tags: readonly TileTag[] | undefined) => (tags ?? []).map((t) => t.kind).join(',')
