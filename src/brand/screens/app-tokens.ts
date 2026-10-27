import type { App } from '../data'

/* -----------------------------------------------------------------------------
   The applications field, as plain functions (app-transfer.tsx `AppTokens`).

   Owner, 24 Oct 2026: "what if we can merge both so one place where we show
   the added and form search as we have in Google or other apps. so whatever we
   select add to the input, and let the user know they can search from there as
   well." One bordered field holds the picks as chips and the search after
   them; the list under it is what can still be added. What the field does on a
   key lives here, so the suite can hold it without a browser: the tests render
   static markup only.
   -------------------------------------------------------------------------- */

/** How well a name answers the typed words: starts with them, has a word that does, holds them, or not at all. */
export function matchRank(name: string, needle: string): number {
  const l = name.toLowerCase()
  if (!needle) return 0
  if (l.startsWith(needle)) return 0
  if (l.split(/[\s\-.]+/).some((w) => w.startsWith(needle))) return 1
  return l.includes(needle) ? 2 : 3
}

export interface UsedRow {
  app: App
  /** The sign-in policy it is on, by name. */
  owner: string
}

/** The list under the field: what can be added, best match first, then what another policy holds, set apart and off. */
export function tokenRows(
  apps: readonly App[],
  picked: readonly string[],
  takenBy: (appId: string) => string | undefined,
  query: string,
): { free: App[]; used: UsedRow[] } {
  const needle = query.trim().toLowerCase()
  const on = new Set(picked)
  const ranked = apps
    .map((app, i) => ({ app, i, r: matchRank(app.name, needle) }))
    .filter((x) => !on.has(x.app.id) && x.r < 3)
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.app)
  const free: App[] = []
  const used: UsedRow[] = []
  for (const app of ranked) {
    const owner = takenBy(app.id)
    if (owner) used.push({ app, owner })
    else free.push(app)
  }
  return { free, used }
}

/** The picks with one more, in catalogue order: one order for the list, so "changed" never fires on nothing. */
export function withApp(apps: readonly App[], picked: readonly string[], id: string): string[] {
  const on = new Set(picked)
  return apps.filter((a) => a.id === id || on.has(a.id)).map((a) => a.id)
}

export function withoutApp(picked: readonly string[], id: string): string[] {
  return picked.filter((x) => x !== id)
}

/** The field's own state: what is typed, and the picks. */
export interface FieldState {
  query: string
  picked: readonly string[]
}

/** A row picked, from the list or by Enter: its chip joins the field and the search empties for the next one. */
export function pickInto(apps: readonly App[], s: FieldState, id: string): { query: string; picked: string[] } {
  return { query: '', picked: withApp(apps, s.picked, id) }
}

/** A chip taken off: the typed words stay. */
export function takeOut(s: FieldState, id: string): { query: string; picked: string[] } {
  return { query: s.query, picked: withoutApp(s.picked, id) }
}

export type FieldKey =
  /** Enter with words typed: the best match that can be added. */
  | { do: 'add'; id: string }
  /** Backspace in an empty search: the last chip's ×, so the next Backspace takes it off. */
  | { do: 'focus-chip'; index: number }
  /** Escape with words typed: they go, and the key stops there (a dialog stays open). */
  | { do: 'clear' }
  /** ↓: into the list. */
  | { do: 'list' }

/** A key in the search. Null leaves the key to the input and to whatever holds the field. */
export function fieldKey(key: string, s: FieldState, firstFree: string | undefined): FieldKey | null {
  const typed = s.query.trim() !== ''
  if (key === 'Backspace' && s.query === '' && s.picked.length > 0) return { do: 'focus-chip', index: s.picked.length - 1 }
  if (key === 'Enter' && typed && firstFree) return { do: 'add', id: firstFree }
  if (key === 'Escape' && s.query !== '') return { do: 'clear' }
  if (key === 'ArrowDown') return { do: 'list' }
  return null
}

export type ChipKey =
  | { do: 'remove'; index: number; then: 'input' | 'next' }
  | { do: 'focus-chip'; index: number }
  | { do: 'focus-input' }

/** A key on a chip's ×. Backspace takes the chip off and goes back to the search, as in a mail client's To field;
    Delete takes it off and stays on the chips; ← and → walk them, and → past the last is the search. */
export function chipKey(key: string, index: number, count: number): ChipKey | null {
  if (key === 'Backspace') return { do: 'remove', index, then: 'input' }
  if (key === 'Delete') return { do: 'remove', index, then: 'next' }
  if (key === 'ArrowLeft') return index > 0 ? { do: 'focus-chip', index: index - 1 } : null
  if (key === 'ArrowRight') return index + 1 < count ? { do: 'focus-chip', index: index + 1 } : { do: 'focus-input' }
  return null
}

export type ListKey = { do: 'focus-row'; index: number } | { do: 'focus-input' }

/** ↑ and ↓ through the list's rows; ↑ from the first is the search again. Home and End go to the ends. */
export function listKey(key: string, index: number, count: number): ListKey | null {
  if (count === 0) return null
  if (key === 'ArrowDown') return { do: 'focus-row', index: Math.min(index + 1, count - 1) }
  if (key === 'ArrowUp') return index <= 0 ? { do: 'focus-input' } : { do: 'focus-row', index: index - 1 }
  if (key === 'Home') return { do: 'focus-row', index: 0 }
  if (key === 'End') return { do: 'focus-row', index: count - 1 }
  return null
}
