import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { useBrand } from '../store'
import type { Range } from './model'
import type { SeriesKey } from './seed'

/* What the Dashboard's widgets and charts share that is not a component: number and time words, the data colours,
   curve geometry, and the hooks that measure a tile so its content can fit it. */

export const fmt = (n: number) => Math.round(n).toLocaleString('en-US')

/** "78%", or "4.3%" with `digits`. */
export const pct = (share: number, digits = 0) => `${(share * 100).toFixed(digits)}%`

/** A number short enough for an axis: 950, 1.2k, 24k. */
export function short(n: number): string {
  if (n < 1000) return String(Math.round(n))
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return `${Math.round(n / 1000)}k`
}

export function bucketLabel(at: Date, range: Range): string {
  if (range === '24h') return at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  if (range === '7d') return `${at.toLocaleDateString('en-GB', { weekday: 'short' })} ${at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
  return at.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

/** The axis says less than the readout: a weekday on a week, an hour on a day. */
export function tickLabel(at: Date, range: Range): string {
  if (range === '24h') return at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  if (range === '7d') return at.toLocaleDateString('en-GB', { weekday: 'short' })
  return at.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export const RANGE_WORD: Record<Range, string> = { '24h': 'the last 24 hours', '7d': 'the last 7 days', '30d': 'the last 30 days' }
export const BEFORE_WORD: Record<Range, string> = { '24h': 'the 24 hours before', '7d': 'the 7 days before', '30d': 'the 30 days before' }

/* The data colours, all from the dashboard's theme (dashboard.css, themes.ts). The first two series take the
   theme's colours; blocked stays red in every theme, because there it means something. */
export const SERIES_COLOR: Record<SeriesKey, string> = {
  allowed: 'var(--dash-s1)',
  mfa: 'var(--dash-s2)',
  blocked: 'var(--dash-bad)',
}

/** The theme's colours for parts of a whole, strongest first: steps of one colour, or one colour each. */
export const RAMP = ['var(--dash-r1)', 'var(--dash-r2)', 'var(--dash-r3)', 'var(--dash-r4)', 'var(--dash-r5)', 'var(--dash-r6)']

/* ---- curves ------------------------------------------------------------------ */

/* A smooth line through the points that never overshoots them (monotone cubic, Fritsch and Carlson): a count
   that is never negative must not dip under the axis between two points. `start` is M for a new line, L to
   carry on from where the path already is. */
export function curve(pts: readonly (readonly [number, number])[], start: 'M' | 'L' = 'M'): string {
  const n = pts.length
  if (n === 0) return ''
  const f = (v: number) => v.toFixed(1)
  let d = `${start}${f(pts[0][0])},${f(pts[0][1])}`
  if (n === 1) return d
  if (n === 2) return `${d}L${f(pts[1][0])},${f(pts[1][1])}`
  const dx: number[] = []
  const s: number[] = []
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1][0] - pts[i][0])
    s.push(dx[i] === 0 ? 0 : (pts[i + 1][1] - pts[i][1]) / dx[i])
  }
  const t: number[] = [s[0]]
  for (let i = 1; i < n - 1; i++) t.push(s[i - 1] * s[i] <= 0 ? 0 : (s[i - 1] + s[i]) / 2)
  t.push(s[n - 2])
  for (let i = 0; i < n - 1; i++) {
    if (s[i] === 0) {
      t[i] = 0
      t[i + 1] = 0
      continue
    }
    const a = t[i] / s[i]
    const b = t[i + 1] / s[i]
    const h = a * a + b * b
    if (h > 9) {
      const k = 3 / Math.sqrt(h)
      t[i] = k * a * s[i]
      t[i + 1] = k * b * s[i]
    }
  }
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i]
    const [x1, y1] = pts[i + 1]
    d += `C${f(x0 + dx[i] / 3)},${f(y0 + (t[i] * dx[i]) / 3)} ${f(x1 - dx[i] / 3)},${f(y1 - (t[i + 1] * dx[i]) / 3)} ${f(x1)},${f(y1)}`
  }
  return d
}

/** A closed shape between a top line and a bottom line, both smooth. */
export function band(top: readonly (readonly [number, number])[], base: readonly (readonly [number, number])[]): string {
  if (top.length === 0) return ''
  return `${curve(top)}${curve([...base].reverse(), 'L')}Z`
}

/** A point on a circle, with 0 at twelve o'clock and angles in turns (0.25 = three o'clock). */
export function onCircle(cx: number, cy: number, r: number, turn: number): [number, number] {
  const a = turn * 2 * Math.PI - Math.PI / 2
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
}

/** An arc from one turn to another, clockwise. */
export function arc(cx: number, cy: number, r: number, from: number, to: number): string {
  const [x0, y0] = onCircle(cx, cy, r, from)
  const [x1, y1] = onCircle(cx, cy, r, to)
  return `M${x0.toFixed(2)},${y0.toFixed(2)}A${r},${r} 0 ${to - from > 0.5 ? 1 : 0} 1 ${x1.toFixed(2)},${y1.toFixed(2)}`
}

/* ---- hooks ------------------------------------------------------------------- */

/** The element's own size, kept up as it changes: a chart is drawn at the pixels its tile gives it. */
export function useSize<T extends HTMLElement>(): [RefObject<T | null>, { w: number; h: number }] {
  const ref = useRef<T>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const read = (w: number, h: number) => setSize((s) => (Math.abs(s.w - w) < 0.5 && Math.abs(s.h - h) < 0.5 ? s : { w, h }))
    read(el.clientWidth, el.clientHeight)
    const ro = new ResizeObserver(([e]) => read(e.contentRect.width, e.contentRect.height))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, size]
}

/** How many rows of `pitch` pixels fit the element, so a list shows whole rows and never half of one. */
export function useRows<T extends HTMLElement>(pitch: number, least = 1): [RefObject<T | null>, number] {
  const [ref, size] = useSize<T>()
  return [ref, size.h === 0 ? least : Math.max(least, Math.floor((size.h + 1) / pitch))]
}

/** The move from the old policies: what is left, what waits for review, and whether it is still open. */
export function useMigrationOpen() {
  const store = useBrand()
  const left = store.legacy.policies.filter((lp) => !store.movedLegacy[lp.id]).length
  const staged = Object.values(store.moved).filter((m) => !m.approved).length
  return { left, staged, open: left > 0 || staged > 0 }
}
