import { useState } from 'react'

import { shows } from './rollout'

/* -----------------------------------------------------------------------------
   Manage columns (rollout.ts `manageColumns`; owner, 26 Nov 2026: "for every table … add 'Manage columns' so the user
   can select what the user wanted to showcase in the table").

   Each table names its columns once: which are always there (the name, the row's menu), which show by default, and the
   extras that wait to be asked for. The picks are kept per table in this browser, a viewer's convenience like the view
   switch, so a reload keeps them and nothing else sees them. Where the line does not show the change, a table draws its
   default columns, exactly as before.
   -------------------------------------------------------------------------- */

export const MANAGE_COLUMNS: boolean = shows('manageColumns')

export interface ColumnDef {
  id: string
  label: string
  /** Always shown, listed greyed so the admin sees it is part of the table: the name. */
  locked?: boolean
  /** Shown until the admin hides it. False: an extra, hidden until asked for. */
  on?: boolean
}

export interface Columns {
  defs: readonly ColumnDef[]
  /** Whether a column is drawn. */
  shown: (id: string) => boolean
  toggle: (id: string) => void
  reset: () => void
  /** Anything differs from the defaults: Reset has something to do. */
  changed: boolean
}

const byDefault = (d: ColumnDef): boolean => !!d.locked || d.on !== false

/** A library page's columns (library-view.tsx `LibraryRows`): the name, always there, then its fact columns by their
 *  heads, which are also their ids — `shownColumn` is asked by head. */
export const libraryColumns = (nameColumn: string, columns: readonly string[]): ColumnDef[] => [
  { id: `name:${nameColumn}`, label: nameColumn, locked: true },
  ...columns.map((c) => ({ id: c, label: c })),
]

export function useColumns(table: string, defs: readonly ColumnDef[]): Columns {
  const key = `idp.columns.${table}`
  const [picks, setPicks] = useState<Record<string, boolean>>(() => {
    if (!MANAGE_COLUMNS) return {}
    try {
      const raw = localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as Record<string, boolean>) : {}
    } catch {
      return {}
    }
  })
  const store = (next: Record<string, boolean>) => {
    setPicks(next)
    try {
      if (Object.keys(next).length) localStorage.setItem(key, JSON.stringify(next))
      else localStorage.removeItem(key)
    } catch {
      /* Kept for this visit only. */
    }
  }
  const def = (id: string) => defs.find((d) => d.id === id)
  const shown = (id: string): boolean => {
    const d = def(id)
    if (!d) return true
    if (d.locked || !MANAGE_COLUMNS) return byDefault(d)
    return picks[id] ?? byDefault(d)
  }
  return {
    defs,
    shown,
    toggle: (id) => {
      const d = def(id)
      if (!d || d.locked) return
      const next = { ...picks, [id]: !shown(id) }
      /* A pick back at its default is no pick at all: the stored list stays the admin's changes only. */
      if (next[id] === byDefault(d)) delete next[id]
      store(next)
    },
    reset: () => store({}),
    changed: Object.keys(picks).length > 0,
  }
}
