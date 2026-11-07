import { useSyncExternalStore } from 'react'

/* -----------------------------------------------------------------------------
   Customize sidebar (3 Nov 2026), after Notion's own (audited live and against
   notion.com/help/customize-your-sidebar the same day; plan agreed with the
   owner the same evening).

   What Notion does, and what this keeps:

   · The mode is in place. The rail itself turns into the editor — a grip on
     every row and every section heading, an ✕ to take a row out, "Add page" at
     a section's end to bring one back — and one Done at its foot ends it.
   · No save step. Each change holds at once; Done only leaves the mode.
   · It is the admin's own rail: it hides nothing from anyone else and deletes
     nothing. Reset puts it back the way it came, with Undo.
   · Notion's row menu (Move up / Move down) is its no-drag route. Here the grip
     takes the arrow keys instead, so there is one control per job. A row moved
     past the end of its section goes into the next one.

   Rows move between sections and sections move. The unnamed first group
   (Dashboard, Getting Started) is the rail's head: rows can move into it and
   out of it, but it stays first, as it has no heading to hold.

   Not kept: tabs and "Show N". The console's rail is a fixed list of pages.

   Off = the rail as it was, with no way in. -------------------------------- */
export const CUSTOMIZE_SIDEBAR = true

/** One section of the rail: its key (its heading, or `top`) and its rows by label. */
export interface RailSection {
  key: string
  items: string[]
}

/** The admin's arrangement: the whole layout (null = the console's own), and the rows taken out. */
export interface RailPrefs {
  layout: RailSection[] | null
  removed: string[]
}

export const RAIL_DEFAULT: RailPrefs = { layout: null, removed: [] }
export const RAIL_KEY = 'brand-rail'
export const HEAD = 'top'

/** A section's key: its heading, or `top` for the unnamed first group. */
export const sectionKey = (section?: string) => section ?? HEAD

const same = (a: RailSection[], b: RailSection[]) => JSON.stringify(a) === JSON.stringify(b)

/** The layout to draw: the stored one made to fit today's rail. A page it does not know keeps its place after the row
    before it in the console's own order; a name no longer in the rail is dropped; the head stays first. */
export function resolve(defaults: RailSection[], layout: RailSection[] | null): RailSection[] {
  if (!layout) return defaults
  const all = new Set(defaults.flatMap((s) => s.items))
  const seen = new Set<string>()
  const keys = defaults.map((s) => s.key)
  const order = [
    ...layout.map((s) => s.key).filter((k, i, a) => keys.includes(k) && a.indexOf(k) === i),
    ...keys.filter((k) => !layout.some((s) => s.key === k)),
  ]
  const head = order.indexOf(HEAD)
  if (head > 0) order.unshift(...order.splice(head, 1))
  const out = order.map((key) => ({
    key,
    items: (layout.find((s) => s.key === key)?.items ?? []).filter((l) => all.has(l) && !seen.has(l) && seen.add(l)),
  }))
  for (const d of defaults) {
    d.items.forEach((label, i) => {
      if (seen.has(label)) return
      seen.add(label)
      const before = d.items[i - 1]
      const home = (before && out.find((s) => s.items.includes(before))) || out.find((s) => s.key === d.key)!
      home.items.splice(before ? home.items.indexOf(before) + 1 : 0, 0, label)
    })
  }
  return out
}

function withLayout(prefs: RailPrefs, defaults: RailSection[], layout: RailSection[]): RailPrefs {
  return { ...prefs, layout: same(layout, defaults) ? null : layout }
}

/** `label` into section `to` at `index` (counted among that section's rows, before the move). */
export function place(prefs: RailPrefs, defaults: RailSection[], label: string, to: string, index: number): RailPrefs {
  const layout = resolve(defaults, prefs.layout).map((s) => ({ ...s, items: s.items.filter((l) => l !== label) }))
  const target = layout.find((s) => s.key === to)
  if (!target) return prefs
  target.items.splice(Math.max(0, Math.min(index, target.items.length)), 0, label)
  return withLayout(prefs, defaults, layout)
}

/** A section's rows in a new order, as a drag inside it leaves them. Rows taken out keep their slots. */
export function reorderSection(prefs: RailPrefs, defaults: RailSection[], key: string, shown: string[]): RailPrefs {
  const layout = resolve(defaults, prefs.layout).map((s) => {
    if (s.key !== key) return s
    const queue = [...shown]
    return { ...s, items: s.items.map((l) => (shown.includes(l) ? queue.shift()! : l)) }
  })
  return withLayout(prefs, defaults, layout)
}

/** `label` one shown row up (`-1`) or down (`1`). Past its section's edge it goes to the end of the section above or
    the start of the one below; at the rail's two ends it stays. */
export function step(prefs: RailPrefs, defaults: RailSection[], label: string, dir: -1 | 1): RailPrefs {
  const layout = resolve(defaults, prefs.layout)
  const shown = (s: RailSection) => s.items.filter((l) => !prefs.removed.includes(l))
  const si = layout.findIndex((s) => s.items.includes(label))
  if (si < 0) return prefs
  const rows = shown(layout[si])
  const at = rows.indexOf(label)
  const next = rows[at + dir]
  if (next) {
    const others = layout[si].items.filter((l) => l !== label)
    const n = others.indexOf(next)
    return place(prefs, defaults, label, layout[si].key, dir === 1 ? n + 1 : n)
  }
  const ti = si + dir
  if (ti < 0 || ti >= layout.length) return prefs
  return place(prefs, defaults, label, layout[ti].key, dir === 1 ? 0 : layout[ti].items.length)
}

/** Section `key` one place up or down. The head never moves, and nothing moves above it. */
export function moveSection(prefs: RailPrefs, defaults: RailSection[], key: string, dir: -1 | 1): RailPrefs {
  const layout = resolve(defaults, prefs.layout)
  const at = layout.findIndex((s) => s.key === key)
  const to = at + dir
  if (key === HEAD || at < 0 || to < 0 || to >= layout.length || layout[to].key === HEAD) return prefs
  const next = [...layout]
  next.splice(at, 1)
  next.splice(to, 0, layout[at])
  return withLayout(prefs, defaults, next)
}

/** The sections in a new order, as a drag leaves them; the head is put back first. */
export function orderSections(prefs: RailPrefs, defaults: RailSection[], keys: string[]): RailPrefs {
  const layout = resolve(defaults, prefs.layout)
  const sorted = [HEAD, ...keys.filter((k) => k !== HEAD)]
    .map((k) => layout.find((s) => s.key === k))
    .filter((s): s is RailSection => !!s)
  return withLayout(prefs, defaults, sorted)
}

export const removeRow = (prefs: RailPrefs, label: string): RailPrefs =>
  prefs.removed.includes(label) ? prefs : { ...prefs, removed: [...prefs.removed, label] }
export const addRow = (prefs: RailPrefs, label: string): RailPrefs => ({ ...prefs, removed: prefs.removed.filter((l) => l !== label) })

export const isDefault = (prefs: RailPrefs) => prefs.removed.length === 0 && prefs.layout === null

/** What was stored, or the default for anything that is not a well-formed arrangement. */
export function parseRail(value: string | null): RailPrefs {
  if (!value) return RAIL_DEFAULT
  try {
    const v = JSON.parse(value) as Partial<RailPrefs>
    const strings = (a: unknown): a is string[] => Array.isArray(a) && a.every((s) => typeof s === 'string')
    const sections = (a: unknown): a is RailSection[] =>
      Array.isArray(a) && a.every((s) => s && typeof s.key === 'string' && strings(s.items))
    return { layout: sections(v.layout) ? v.layout : null, removed: strings(v.removed) ? v.removed : [] }
  } catch {
    return RAIL_DEFAULT
  }
}

function readRail(): RailPrefs {
  try {
    return parseRail(window.localStorage.getItem(RAIL_KEY))
  } catch {
    return RAIL_DEFAULT
  }
}

let rail: RailPrefs = typeof window === 'undefined' ? RAIL_DEFAULT : readRail()
const listeners = new Set<() => void>()

/** The arrangement as it is this moment, for a drag's end, which can land after several moves the render has not seen. */
export const currentRail = () => rail

/** The arrangement for the page, remembered (it still holds for this visit where storage is blocked). */
export function setRail(next: RailPrefs): void {
  rail = next
  try {
    if (isDefault(next)) window.localStorage.removeItem(RAIL_KEY)
    else window.localStorage.setItem(RAIL_KEY, JSON.stringify(next))
  } catch {
    /* Kept in memory only. */
  }
  listeners.forEach((l) => l())
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export function useRail(): [RailPrefs, (next: RailPrefs) => void] {
  const prefs = useSyncExternalStore(
    subscribe,
    () => rail,
    () => RAIL_DEFAULT,
  )
  return [prefs, setRail]
}
