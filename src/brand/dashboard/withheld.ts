import { HIDE_CHECKS } from '../tester'
import type { WidgetId } from './catalog'
import { allCells, removeCell, type Row } from './layout'

/* Widgets a line doesn't get. Dev handoff has no Check access anywhere (rollout.ts activityAndChecks, owner 23 Nov
   2026: "hide check access completely"), so its widget leaves the library, the Add here list and any board or layout
   that holds it. Tester keeps what it had: it changes only on the owner's check. */
const WITHHELD: ReadonlySet<WidgetId> = new Set<WidgetId>(HIDE_CHECKS ? ['check'] : [])

export const offered = (w: WidgetId): boolean => !WITHHELD.has(w)

/** The board without the withheld widgets. Each goes as a delete would, so its row closes up rather than leave a gap. */
export function withoutWithheld<R extends readonly Row[]>(rows: R): R {
  if (!WITHHELD.size) return rows
  const gone = allCells(rows).filter((c) => WITHHELD.has(c.widget))
  if (!gone.length) return rows
  return gone.reduce<Row[]>((left, c) => removeCell(left, c.id), [...rows]) as unknown as R
}
