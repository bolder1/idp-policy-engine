import { findCell, type Row, type Target } from './layout'

/* -----------------------------------------------------------------------------
   A widget's drag, as states (owner, 20 Nov 2026: "add state management for
   each interaction and verify the position state").

     idle ──press──▶ pressed ──moves 5 px──▶ carrying
     carrying ──rests on a place 90 ms──▶ previewing (the board made room)
     previewing ──rests on another place──▶ previewing (room made there)
     previewing ──over its own slot──▶ previewing (held: nothing changes)
     carrying / previewing ──carried off the board──▶ carrying (put back)
     any ──let go──▶ settling (the lifted copy glides into its slot) ──▶ idle
     any ──Escape──▶ idle, the board as it was

   While a preview shows, places are found on the board as it is drawn, which
   is the preview, but every layout is worked out from the board as it was
   before the drag. Otherwise a widget carried across a row would leave that
   row evened out behind it, and the result would depend on the path taken,
   not on where it was let go.

   A preview made room with rows and columns of its own (a new row for the
   widget, a new column in a row). A place found next to one of those is said
   again against the board as it was: `resolveTarget` does that.
   -------------------------------------------------------------------------- */

export type DragPhase = 'idle' | 'carrying' | 'previewing' | 'settling'

/** A place found on the board as a preview draws it, said against the board as it was (`origin`), so a layout can be
    worked out from that. `keep`: the place is the widget's own slot in the preview, so nothing changes. */
export function resolveTarget(t: Target, view: readonly Row[], origin: readonly Row[], id: string): Target | 'keep' {
  const rowIds = new Set(origin.map((r) => r.id))
  const colIds = new Set(origin.flatMap((r) => r.columns.map((c) => c.id)))
  if (t.at === 'swap') return t.cell === id ? 'keep' : t
  if (t.at === 'row') {
    if (t.before === null || rowIds.has(t.before)) return t
    /* Above the preview's own row: the place is the row after it. */
    const at = view.findIndex((r) => r.id === t.before)
    const next = view.slice(at + 1).find((r) => rowIds.has(r.id))
    return { at: 'row', before: next?.id ?? null }
  }
  if (t.at === 'column') {
    if (!rowIds.has(t.row)) return 'keep'
    if (t.before === null || colIds.has(t.before)) return t
    const row = view.find((r) => r.id === t.row)
    const at = row ? row.columns.findIndex((c) => c.id === t.before) : -1
    const next = row?.columns.slice(at + 1).find((c) => colIds.has(c.id))
    return { at: 'column', row: t.row, before: next?.id ?? null }
  }
  if (!colIds.has(t.column)) return 'keep'
  if (t.before !== id) return t
  /* Just above itself in a stack it was previewed into: the place is the widget after it. */
  const at = findCell(view, id)
  const col = at ? view[at.r].columns[at.c] : null
  const after = col?.cells[(at?.k ?? 0) + 1]
  return { at: 'stack', column: t.column, before: after?.id ?? null }
}

/** One key for a target, so the same place is not laid out twice. */
export const targetKey = (t: Target) => JSON.stringify(t)
