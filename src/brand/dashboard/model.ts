import { useSyncExternalStore } from 'react'
import { shows } from '../rollout'
import { CATEGORIES as SUBJECTS, WIDGETS } from './catalog'
import { fromBoxes, fromSpecs, newId, tidyRows, toSpecs, type Box, type Cell, type Column, type Row, type RowSpec } from './layout'
import { DEFAULT_BRAND, DEFAULT_THEME, isBrandColour, isTheme, type ThemeId } from './themes'
import { OVERVIEW } from './templates'

/* -----------------------------------------------------------------------------
   The Dashboard's model: the admin's dashboards, the templates they start
   from, and the prefs around them, kept in localStorage `idp.dashboard` the
   way rail-custom.ts keeps the rail.

   A dashboard is rows of widgets (layout.ts) and a colour theme (themes.ts).
   Everything here is pure except the store at the end.
   -------------------------------------------------------------------------- */

export { WIDGETS, WIDGET_IDS, kindOf, viewOf } from './catalog'

/* 23 Nov (rollout.ts dashboardPolish, owner's pick): widgets are filed by what they show, layouts by who they are for,
   and no word is in both lists. On Design the widgets' Posture reads as the plainer Security. catalog.ts stays free of
   imports, so the rename is made here, where every screen reads the list. */
const POLISH = shows('dashboardPolish')

/** The widget library's sections: what a widget shows. */
export const CATEGORIES: typeof SUBJECTS = POLISH ? SUBJECTS.map((c) => (c.value === 'posture' ? { ...c, label: 'Security' } : c)) : SUBJECTS
export type { Category, Kind, ViewChoice, WidgetId, WidgetMeta } from './catalog'

export interface Board {
  id: string
  name: string
  rows: Row[]
  /** The template it was made from, for Reset. */
  from?: string
  theme: ThemeId
}

export type TemplateNeed = 'security' | 'operations' | 'policies' | 'compliance' | 'people' | 'start'
export const NEEDS: { value: TemplateNeed; label: string }[] = [
  { value: 'security', label: 'Security' },
  { value: 'operations', label: 'Operations' },
  { value: 'policies', label: 'Policies' },
  { value: 'compliance', label: 'Compliance' },
  { value: 'people', label: 'People' },
  { value: 'start', label: 'Getting started' },
]

/* The layout gallery's sections on Design: who a layout is for (owner, 23 Nov 2026). A layout keeps its stored need, so
   nothing saved changes; the role is read from it, and Operations splits in two (the help desk's day, IT's service). */
export type LayoutRole = 'any' | 'security' | 'helpdesk' | 'it' | 'policy' | 'audit'
export const ROLES: { value: LayoutRole; label: string }[] = [
  { value: 'any', label: 'Any admin' },
  { value: 'security', label: 'Security team' },
  { value: 'helpdesk', label: 'Help desk' },
  { value: 'it', label: 'IT admins' },
  { value: 'policy', label: 'Policy owners' },
  { value: 'audit', label: 'Auditors' },
]
const ROLE_OF_NEED: Record<TemplateNeed, LayoutRole> = { start: 'any', security: 'security', operations: 'helpdesk', people: 'it', policies: 'policy', compliance: 'audit' }

/** Who a layout is for. Service health is IT's, though it is filed under Operations with the help desk's day. */
export const roleOf = (t: Pick<DashTemplate, 'id' | 'need'>): LayoutRole => (t.id === 'service' ? 'it' : ROLE_OF_NEED[t.need])

export interface DashTemplate {
  id: string
  name: string
  blurb: string
  need: TemplateNeed
  rows: RowSpec[]
  /** The theme it brings, if not Monochrome. */
  theme?: ThemeId
  /** Saved by the admin from a dashboard, rather than one of Xecurify's. */
  own?: true
}

export type Range = '24h' | '7d' | '30d'
export const RANGES: { value: Range; label: string }[] = [
  { value: '24h', label: '24 hours' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
]

export interface DashPrefs {
  /** The shape of what is stored. */
  v: 3
  /** Which Dashboard the page shows: HomeHub, or this one. */
  version: 'classic' | 'new'
  /** The starting-point gallery has opened once (first visit). */
  seen: boolean
  /** The one hint after a template's first build has shown. */
  hinted: boolean
  boards: Board[]
  active: string
  own: DashTemplate[]
  range: Range
  /** The tenant's brand colour, for the Brand and Brand accent themes: a swatch's token or a hex. */
  brand: string
  /** Light, or the Dashboard's own dark board (owner, 20 Nov 2026: "dark mode as well, a premium one"). */
  look: Look
}

export type Look = 'light' | 'dark'
export const LOOKS: { value: Look; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

export const activeBoard = (p: DashPrefs): Board => p.boards.find((b) => b.id === p.active) ?? p.boards[0]

const onBoard = (p: DashPrefs, id: string, f: (b: Board) => Board): DashPrefs => ({ ...p, boards: p.boards.map((b) => (b.id === id ? f(b) : b)) })

export const withRows = (p: DashPrefs, rows: Row[], boardId = activeBoard(p).id): DashPrefs => onBoard(p, boardId, (b) => ({ ...b, rows }))
export const withTheme = (p: DashPrefs, theme: ThemeId, boardId = activeBoard(p).id): DashPrefs => onBoard(p, boardId, (b) => ({ ...b, theme }))

/** A name none of these has yet: "Security watch", then "Security watch 2". */
export function freshName(taken: readonly { name: string }[], base: string): string {
  const names = new Set(taken.map((b) => b.name.trim().toLowerCase()))
  if (!names.has(base.trim().toLowerCase())) return base
  for (let n = 2; ; n++) if (!names.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`
}

/** A new dashboard from a template, opened at once. */
export function addBoard(p: DashPrefs, name: string, t: Pick<DashTemplate, 'id' | 'rows' | 'theme'>): DashPrefs {
  const board: Board = { id: newId('b'), name: freshName(p.boards, name.trim() || 'Dashboard'), rows: fromSpecs(t.rows), from: t.id, theme: t.theme ?? DEFAULT_THEME }
  return { ...p, boards: [...p.boards, board], active: board.id }
}

/** The template's layout in place of this dashboard's own. The dashboard keeps its name and its theme. */
export const applyTemplate = (p: DashPrefs, t: Pick<DashTemplate, 'id' | 'rows'>): DashPrefs => onBoard(p, activeBoard(p).id, (b) => ({ ...b, rows: fromSpecs(t.rows), from: t.id }))

export function duplicateBoard(p: DashPrefs, id: string): DashPrefs {
  const src = p.boards.find((b) => b.id === id)
  if (!src) return p
  const copy: Board = { ...src, id: newId('b'), name: freshName(p.boards, `${src.name} copy`), rows: fromSpecs(toSpecs(src.rows)) }
  const at = p.boards.indexOf(src)
  return { ...p, boards: [...p.boards.slice(0, at + 1), copy, ...p.boards.slice(at + 1)], active: copy.id }
}

export function removeBoard(p: DashPrefs, id: string): DashPrefs {
  if (p.boards.length <= 1) return p
  const at = p.boards.findIndex((b) => b.id === id)
  if (at < 0) return p
  const boards = p.boards.filter((b) => b.id !== id)
  return { ...p, boards, active: p.active === id ? boards[Math.max(0, at - 1)].id : p.active }
}

export const renameBoard = (p: DashPrefs, id: string, name: string): DashPrefs => onBoard(p, id, (b) => ({ ...b, name: name.trim() || b.name }))

export function saveAsTemplate(p: DashPrefs, name: string): DashPrefs {
  const b = activeBoard(p)
  const t: DashTemplate = { id: newId('own-'), name: freshName(p.own, name.trim() || b.name), blurb: 'Saved from your dashboards', need: 'start', rows: toSpecs(b.rows), own: true, ...(b.theme !== 'mono' ? { theme: b.theme } : {}) }
  return { ...p, own: [t, ...p.own] }
}

/* ---- storage -------------------------------------------------------------- */

export const DASH_KEY = 'idp.dashboard'

export function defaultPrefs(): DashPrefs {
  return {
    v: 3,
    version: 'classic',
    seen: false,
    hinted: false,
    boards: [{ id: 'overview', name: OVERVIEW.name, rows: fromSpecs(OVERVIEW.rows), from: OVERVIEW.id, theme: DEFAULT_THEME }],
    active: 'overview',
    own: [],
    range: '7d',
    brand: DEFAULT_BRAND,
    look: 'light',
  }
}

const oneOf = <T extends string>(v: unknown, all: readonly T[], or: T): T => (all.includes(v as T) ? (v as T) : or)
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const text = (v: unknown): string => (typeof v === 'string' ? v : '')
type Raw = Record<string, unknown>

/** Rows as stored, held to today's widgets: unknown widgets dropped, a view the widget lost forgotten, ids unique. */
function parseRows(v: unknown): Row[] | null {
  if (!Array.isArray(v)) return null
  const seen = new Set<string>()
  const id = (raw: unknown, prefix: string) => {
    const s = text(raw)
    const out = s && !seen.has(s) ? s : newId(prefix)
    seen.add(out)
    return out
  }
  const rows: Row[] = []
  for (const r of v as Raw[]) {
    if (!r || !Array.isArray(r.columns)) continue
    const columns: Column[] = []
    for (const c of r.columns as Raw[]) {
      if (!c || !Array.isArray(c.cells)) continue
      const cells: Cell[] = []
      for (const x of c.cells as Raw[]) {
        if (!x || typeof x.widget !== 'string' || !(x.widget in WIDGETS)) continue
        const widget = x.widget as Cell['widget']
        const cell: Cell = { id: id(x.id, 'w'), widget, weight: num(x.weight) > 0 ? num(x.weight) : 1 }
        if (typeof x.view === 'string' && WIDGETS[widget].views?.some((o) => o.id === x.view)) cell.view = x.view
        if (typeof x.pick === 'string') cell.pick = x.pick
        if (isTheme(x.color)) cell.color = x.color
        cells.push(cell)
      }
      if (cells.length) columns.push({ id: id(c.id, 'c'), span: num(c.span), cells })
    }
    if (columns.length) rows.push({ id: id(r.id, 'r'), height: num(r.height), columns })
  }
  return tidyRows(rows)
}

/** Boxes from the first rebuild (x, y, w, h on a grid), read as rows. */
function parseBoxes(v: unknown): Row[] | null {
  if (!Array.isArray(v)) return null
  const boxes: Box[] = (v as Raw[]).flatMap((t) =>
    t && typeof t.widget === 'string' && t.widget in WIDGETS && [t.x, t.y, t.w, t.h].every((n) => typeof n === 'number')
      ? [{ widget: t.widget as Box['widget'], x: num(t.x), y: num(t.y), w: num(t.w), h: num(t.h), ...(typeof t.view === 'string' ? { view: t.view } : {}), ...(typeof t.pick === 'string' ? { pick: t.pick } : {}) }]
      : [],
  )
  return parseRows(fromSpecs(fromBoxes(boxes)))
}

/** What was stored, made to fit today's widgets; the default for anything that is not a well-formed arrangement. */
export function parseDash(value: string | null): DashPrefs {
  const d = defaultPrefs()
  if (!value) return d
  try {
    const v = JSON.parse(value) as Raw
    if (!v || typeof v !== 'object' || Array.isArray(v)) return d
    const older = v.v === 2
    if (v.v !== 3 && !older) return { ...d, version: oneOf(v.version, ['classic', 'new'], d.version), range: oneOf(v.range, ['24h', '7d', '30d'], d.range) }
    const boards: Board[] = Array.isArray(v.boards)
      ? (v.boards as Raw[]).flatMap((b) => {
          const rows = b && (older ? parseBoxes(b.tiles) : parseRows(b.rows))
          if (!b || typeof b.id !== 'string' || typeof b.name !== 'string' || !rows) return []
          return [{ id: b.id, name: b.name, rows, theme: isTheme(b.theme) ? b.theme : 'mono', ...(typeof b.from === 'string' ? { from: b.from } : {}) }]
        })
      : []
    const own: DashTemplate[] = Array.isArray(v.own)
      ? (v.own as Raw[]).flatMap((t) => {
          const rows = t && (older ? parseBoxes(t.tiles) : parseRows(t.rows))
          if (!t || typeof t.id !== 'string' || typeof t.name !== 'string' || !rows) return []
          return [{ id: t.id, name: t.name, blurb: 'Saved from your dashboards', need: 'start' as const, own: true as const, rows: toSpecs(rows), ...(isTheme(t.theme) && t.theme !== 'mono' ? { theme: t.theme } : {}) }]
        })
      : []
    const list = boards.length ? boards : d.boards
    return {
      v: 3,
      version: oneOf(v.version, ['classic', 'new'], d.version),
      seen: v.seen === true,
      hinted: v.hinted === true,
      boards: list,
      active: typeof v.active === 'string' && list.some((b) => b.id === v.active) ? v.active : list[0].id,
      own,
      range: oneOf(v.range, ['24h', '7d', '30d'], d.range),
      brand: isBrandColour(v.brand) ? v.brand : d.brand,
      look: oneOf(v.look, ['light', 'dark'], d.look),
    }
  } catch {
    return d
  }
}

function readDash(): DashPrefs {
  try {
    return parseDash(window.localStorage.getItem(DASH_KEY))
  } catch {
    return defaultPrefs()
  }
}

let dash: DashPrefs | null = null
const listeners = new Set<() => void>()
const current = () => (dash ??= typeof window === 'undefined' ? defaultPrefs() : readDash())

/** The arrangement this moment, for a handler that runs after changes the render has not seen. */
export const currentDash = current

/** Remembered at once (it still holds for this visit where storage is blocked). */
export function setDash(next: DashPrefs | ((p: DashPrefs) => DashPrefs)): void {
  dash = typeof next === 'function' ? next(current()) : next
  try {
    window.localStorage.setItem(DASH_KEY, JSON.stringify(dash))
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

let server: DashPrefs | null = null
export function useDash(): [DashPrefs, typeof setDash] {
  const prefs = useSyncExternalStore(subscribe, current, () => (server ??= defaultPrefs()))
  return [prefs, setDash]
}
