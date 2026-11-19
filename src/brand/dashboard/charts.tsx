import { useId, useMemo, useState, type PointerEvent, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { arc, band, curve, fmt, useSize } from './format'
import type { DayState } from './seed'

/* -----------------------------------------------------------------------------
   The Dashboard's charts, drawn by hand in SVG at the pixels their tile gives
   them, so a tile resized redraws its chart rather than stretching it.

   The look is the console's 60/30/10: ink and grey carry the data, with a
   soft fade under a line, and colour is kept for meaning. Lines are smooth
   but never overshoot a point (format.ts `curve`).

   Motion: lines draw in, bars grow, rings sweep. `still` (a picture of the
   widget, or reduced motion) shows them finished. Only SVG attributes and
   Motion's own values are animated; no CSS transform is put on a motion element.
   -------------------------------------------------------------------------- */

const EASE = [0.22, 1, 0.36, 1] as const

export interface Series {
  key: string
  label: string
  color: string
  values: number[]
}

/** The floating card that reads out one point of a chart. */
function Readout({ title, rows, left, flip }: { title: string; rows: { key: string; label: string; color: string; value: number }[]; left: number; flip: boolean }) {
  return (
    <div className={`bdc-readout${flip ? ' is-flip' : ''}`} style={{ left }} role="status">
      <strong>{title}</strong>
      {rows.map((r) => (
        <span key={r.key}>
          <i style={{ background: r.color }} aria-hidden />
          {r.label}
          <b>{fmt(r.value)}</b>
        </span>
      ))}
    </div>
  )
}

/** Which of the given tick labels to draw: the non-empty ones, thinned until they have room. */
function pickTicks(ticks: readonly string[], x: (i: number) => number, room = 64): number[] {
  const out: number[] = []
  let last = -Infinity
  ticks.forEach((t, i) => {
    if (!t) return
    if (x(i) - last < room) return
    out.push(i)
    last = x(i)
  })
  return out
}

interface PlotProps {
  series: Series[]
  /** One per point: what the readout calls it. */
  labels: string[]
  /** One per point: what the axis prints there, or '' for nothing. */
  ticks: string[]
  still?: boolean
}

/* ---- waves ---------------------------------------------------------------------- */

/** Stacked smooth areas over time: the wave chart. The pointer reads out one moment across every series. */
export function WaveChart({ series, labels, ticks, still = false }: PlotProps) {
  const reduce = useReducedMotion() === true || still
  const id = useId()
  const [ref, { w, h }] = useSize<HTMLDivElement>()
  const [at, setAt] = useState<number | null>(null)
  const n = labels.length
  const padT = 8
  const padB = 26
  const plotH = Math.max(0, h - padT - padB)

  const geo = useMemo(() => {
    if (w === 0 || plotH === 0 || n === 0) return null
    const tops: number[][] = []
    let base = labels.map(() => 0)
    for (const s of series) {
      const top = s.values.map((v, i) => base[i] + v)
      tops.push(top)
      base = top
    }
    const max = Math.max(1, ...base) * 1.1
    const x = (i: number) => (n <= 1 ? w / 2 : (i / (n - 1)) * w)
    const y = (v: number) => padT + plotH - (v / max) * plotH
    const shapes = series.map((s, k) => {
      const top = tops[k].map((v, i) => [x(i), y(v)] as const)
      const under = (k === 0 ? labels.map(() => 0) : tops[k - 1]).map((v, i) => [x(i), y(v)] as const)
      return { key: s.key, color: s.color, line: curve(top), area: band(top, under), top }
    })
    return { x, shapes, shown: pickTicks(ticks, x) }
  }, [series, labels, ticks, w, plotH, n])

  const scrub = (e: PointerEvent<HTMLDivElement>) => {
    if (n === 0) return
    const r = e.currentTarget.getBoundingClientRect()
    setAt(Math.round(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * (n - 1)))
  }

  return (
    <div className="bdc bdc--wave" ref={ref} onPointerMove={scrub} onPointerDown={scrub} onPointerLeave={() => setAt(null)}>
      {geo && (
        <svg width={w} height={h} aria-hidden>
          <defs>
            {geo.shapes.map((s) => (
              <linearGradient key={s.key} id={`${id}${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.34} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0.03} />
              </linearGradient>
            ))}
            <clipPath id={`${id}clip`}>
              <motion.rect x={0} y={0} height={h} initial={{ width: reduce ? w : 0 }} animate={{ width: w }} transition={{ duration: reduce ? 0 : 0.9, ease: EASE }} />
            </clipPath>
          </defs>
          {[0.25, 0.5, 0.75, 1].map((g) => (
            <line key={g} x1={0} x2={w} y1={padT + plotH * g} y2={padT + plotH * g} className="bdc-grid" />
          ))}
          <g clipPath={`url(#${id}clip)`}>
            {geo.shapes.map((s) => (
              <g key={s.key}>
                <path d={s.area} fill={`url(#${id}${s.key})`} />
                <path d={s.line} stroke={s.color} className="bdc-line" />
              </g>
            ))}
          </g>
          {geo.shown.map((i) => (
            <text key={i} x={geo.x(i)} y={h - 6} className="bdc-tick" textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>
              {ticks[i]}
            </text>
          ))}
          {at != null && (
            <g>
              <line x1={geo.x(at)} x2={geo.x(at)} y1={padT} y2={padT + plotH} className="bdc-rule" />
              {geo.shapes.map((s) => (
                <circle key={s.key} cx={s.top[at][0]} cy={s.top[at][1]} r={4} fill={s.color} className="bdc-dot" />
              ))}
            </g>
          )}
        </svg>
      )}
      {geo && at != null && (
        <Readout
          title={labels[at]}
          left={geo.x(at)}
          flip={geo.x(at) > w * 0.6}
          rows={[...series].reverse().map((s) => ({ key: s.key, label: s.label, color: s.color, value: s.values[at] }))}
        />
      )}
    </div>
  )
}

/* ---- bars ------------------------------------------------------------------------ */

/** Stacked upright bars over time. */
export function BarChart({ series, labels, ticks, still = false }: PlotProps) {
  const reduce = useReducedMotion() === true || still
  const [ref, { w, h }] = useSize<HTMLDivElement>()
  const [at, setAt] = useState<number | null>(null)
  const n = labels.length
  const padT = 8
  const padB = 26
  const plotH = Math.max(0, h - padT - padB)

  const geo = useMemo(() => {
    if (w === 0 || plotH === 0 || n === 0) return null
    const sums = labels.map((_, i) => series.reduce((s, r) => s + r.values[i], 0))
    const max = Math.max(1, ...sums) * 1.1
    const slot = w / n
    const bar = Math.max(3, Math.min(32, slot * 0.62))
    const x = (i: number) => slot * (i + 0.5)
    const yOf = (v: number) => padT + plotH - (v / max) * plotH
    const cols = labels.map((_, i) => {
      let base = 0
      return series.map((s) => {
        const from = base
        base += s.values[i]
        return { key: s.key, color: s.color, y: yOf(base), height: yOf(from) - yOf(base) }
      })
    })
    return { x, bar, slot, cols, shown: pickTicks(ticks, x, 56) }
  }, [series, labels, ticks, w, plotH, n])

  const scrub = (e: PointerEvent<HTMLDivElement>) => {
    if (n === 0) return
    const r = e.currentTarget.getBoundingClientRect()
    setAt(Math.min(n - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * n))))
  }
  const floor = padT + plotH

  return (
    <div className="bdc bdc--bars" ref={ref} onPointerMove={scrub} onPointerDown={scrub} onPointerLeave={() => setAt(null)}>
      {geo && (
        <svg width={w} height={h} aria-hidden>
          {[0.25, 0.5, 0.75, 1].map((g) => (
            <line key={g} x1={0} x2={w} y1={padT + plotH * g} y2={padT + plotH * g} className="bdc-grid" />
          ))}
          {at != null && <rect x={geo.slot * at} y={padT} width={geo.slot} height={plotH} className="bdc-column" rx={4} />}
          {geo.cols.map((col, i) =>
            /* The top part is drawn first and a little long, so its rounded foot hides behind the part under it. */
            [...col].reverse().map((part, k) => {
              const top = k === 0
              const height = Math.max(0, part.height + (top && col.length > 1 ? 3 : 0))
              return (
                <motion.rect
                  key={`${i}${part.key}`}
                  x={geo.x(i) - geo.bar / 2}
                  width={geo.bar}
                  rx={top ? Math.min(3, geo.bar / 2) : 0}
                  fill={part.color}
                  initial={reduce ? false : { y: floor, height: 0 }}
                  animate={{ y: part.y, height }}
                  transition={{ duration: reduce ? 0 : 0.5, ease: EASE, delay: reduce ? 0 : Math.min(0.4, i * 0.012) }}
                />
              )
            }),
          )}
          {geo.shown.map((i) => (
            <text key={i} x={geo.x(i)} y={h - 6} className="bdc-tick" textAnchor="middle">
              {ticks[i]}
            </text>
          ))}
        </svg>
      )}
      {geo && at != null && (
        <Readout
          title={labels[at]}
          left={geo.x(at)}
          flip={geo.x(at) > w * 0.6}
          rows={[...series].reverse().map((s) => ({ key: s.key, label: s.label, color: s.color, value: s.values[at] }))}
        />
      )}
    </div>
  )
}

/* ---- small lines ------------------------------------------------------------------- */

/** A small smooth trend with a fade under it, and its last point marked. */
export function Spark({ values, color = 'var(--dash-s1)', still = false }: { values: number[]; color?: string; still?: boolean }) {
  const reduce = useReducedMotion() === true || still
  const id = useId()
  const [ref, { w, h }] = useSize<HTMLDivElement>()
  const pts = useMemo(() => {
    if (w === 0 || h === 0 || values.length < 2) return null
    const min = Math.min(...values)
    const span = Math.max(...values) - min || 1
    return values.map((v, i) => [(i / (values.length - 1)) * (w - 8) + 4, h - 5 - ((v - min) / span) * (h - 12)] as const)
  }, [values, w, h])
  return (
    <div className="bdc bdc--spark" ref={ref} aria-hidden>
      {pts && (
        <svg width={w} height={h}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.22} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={band(pts, pts.map(([x]) => [x, h] as const))} fill={`url(#${id})`} />
          <motion.path d={curve(pts)} stroke={color} className="bdc-line" initial={{ pathLength: reduce ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ duration: reduce ? 0 : 0.8, ease: EASE }} />
          <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={3} fill={color} className="bdc-dot" />
        </svg>
      )}
    </div>
  )
}

/* ---- rings -------------------------------------------------------------------------- */

export interface Part {
  key: string
  label: string
  value: number
  color: string
}

/** Parts of a whole as a ring, the total in the middle. Pointing at a part reads that part out instead. */
export function Donut({ parts, caption, still = false }: { parts: Part[]; caption: string; still?: boolean }) {
  const reduce = useReducedMotion() === true || still
  const [ref, { w, h }] = useSize<HTMLDivElement>()
  const [on, setOn] = useState<string | null>(null)
  const size = Math.min(w, h)
  const total = parts.reduce((s, p) => s + p.value, 0)
  const thick = Math.max(10, Math.min(22, size * 0.14))
  const r = size / 2 - thick / 2 - 1
  const gap = parts.length > 1 ? 0.008 : 0
  const arcs = useMemo(() => {
    let from = 0
    return parts.map((p) => {
      const sweep = total > 0 ? p.value / total : 0
      const a = { ...p, from: from + gap / 2, to: Math.max(from + gap / 2 + 0.001, from + sweep - gap / 2) }
      from += sweep
      return a
    })
  }, [parts, total, gap])
  const shown = parts.find((p) => p.key === on)
  return (
    <div className="bdc bdc--donut" ref={ref}>
      {size > 40 && (
        <>
          <svg width={size} height={size} role="img" aria-label={`${caption}: ${fmt(total)}`}>
            {arcs.map((a, i) => (
              <motion.path
                key={a.key}
                d={arc(size / 2, size / 2, r, a.from, a.to)}
                stroke={a.color}
                strokeWidth={thick}
                fill="none"
                className="bdc-arc"
                opacity={on && on !== a.key ? 0.3 : 1}
                initial={{ pathLength: reduce ? 1 : 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: reduce ? 0 : 0.5, ease: EASE, delay: reduce ? 0 : i * 0.07 }}
                onPointerEnter={() => setOn(a.key)}
                onPointerLeave={() => setOn(null)}
              />
            ))}
          </svg>
          <div className="bdc-donut__mid" style={{ width: size - thick * 2.6 }}>
            <b style={{ fontSize: Math.max(15, Math.min(28, size * 0.17)) }}>{fmt(shown ? shown.value : total)}</b>
            {size >= 120 && <span>{shown ? shown.label : caption}</span>}
          </div>
        </>
      )}
    </div>
  )
}

/** One share as three-quarters of a ring, with a mark where the target is. */
export function Gauge({ value, target, children, label, still = false }: { value: number; target?: number; children: ReactNode; label: string; still?: boolean }) {
  const reduce = useReducedMotion() === true || still
  const [ref, { w, h }] = useSize<HTMLDivElement>()
  const size = Math.min(w, h * 1.18)
  const thick = Math.max(8, Math.min(16, size * 0.09))
  const r = size / 2 - thick / 2 - 4
  const from = -0.375
  const sweep = 0.75
  const v = Math.min(1, Math.max(0, value))
  const cy = size / 2
  const mark = target == null ? null : from + sweep * Math.min(1, Math.max(0, target))
  return (
    <div className="bdc bdc--gauge" ref={ref}>
      {size > 60 && (
        <>
          <svg width={size} height={size * 0.86} role="img" aria-label={label}>
            <path d={arc(size / 2, cy, r, from, from + sweep)} className="bdc-track" strokeWidth={thick} />
            <motion.path
              d={arc(size / 2, cy, r, from, from + Math.max(0.002, sweep * v))}
              className="bdc-value"
              strokeWidth={thick}
              initial={{ pathLength: reduce ? 1 : 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: reduce ? 0 : 0.9, ease: EASE }}
            />
            {mark != null && <path d={arc(size / 2, cy, r, mark - 0.004, mark + 0.004)} className="bdc-mark" strokeWidth={thick + 6} />}
          </svg>
          <div className="bdc-gauge__mid">{children}</div>
        </>
      )}
    </div>
  )
}

/* ---- bars that are not charts ---------------------------------------------------------- */

/** A filled share of a limit. Past 85% it turns to the warning tone. */
export function Meter({ value, label, tone, still = false }: { value: number; label: string; tone?: 'bad' | 'good' | 'plain'; still?: boolean }) {
  const reduce = useReducedMotion() === true || still
  const v = Math.min(1, Math.max(0, value))
  return (
    <span className={`bdc-meter${tone ? ` is-${tone}` : v > 0.85 ? ' is-high' : ''}`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)} aria-label={label}>
      <motion.span className="bdc-meter__fill" initial={{ width: reduce ? `${v * 100}%` : '0%' }} animate={{ width: `${v * 100}%` }} transition={{ duration: reduce ? 0 : 0.7, ease: EASE }} />
    </span>
  )
}

/** Parts of a whole as one bar. */
export function CategoryBar({ parts, label }: { parts: Part[]; label: string }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1
  return (
    <span className="bdc-catbar" role="img" aria-label={`${label}: ${parts.map((p) => `${p.label} ${Math.round((p.value / total) * 100)}%`).join(', ')}`}>
      {parts
        .filter((p) => p.value > 0)
        .map((p) => (
          <i key={p.key} style={{ flexGrow: p.value, background: p.color }} title={`${p.label}: ${fmt(p.value)}`} />
        ))}
    </span>
  )
}

/* ---- grids ----------------------------------------------------------------------------- */

/** A grid of cells shaded by how large each is: weekdays down, hours across. */
export function HeatGrid({
  cells,
  rowLabels,
  colLabel,
  onPoint,
}: {
  cells: number[][]
  rowLabels: string[]
  colLabel: (col: number) => string
  onPoint: (at: { row: number; col: number } | null) => void
}) {
  const max = Math.max(1, ...cells.flat())
  const cols = cells[0]?.length ?? 0
  return (
    <div className="bdc-heat" style={{ ['--cols' as string]: cols }} onPointerLeave={() => onPoint(null)}>
      {cells.map((row, r) => (
        <div className="bdc-heat__row" key={rowLabels[r]}>
          <span className="bdc-heat__day">{rowLabels[r]}</span>
          {row.map((v, c) => (
            <i key={c} className={`is-l${Math.min(4, Math.floor((v / max) * 5))}`} onPointerEnter={() => onPoint({ row: r, col: c })} />
          ))}
        </div>
      ))}
      <div className="bdc-heat__row bdc-heat__hours" aria-hidden>
        <span className="bdc-heat__day" />
        {Array.from({ length: cols }, (_, c) => (
          <span key={c}>{c % 6 === 0 ? colLabel(c) : ''}</span>
        ))}
      </div>
    </div>
  )
}

const DAY_WORD: Record<DayState, string> = { ok: 'Ran well', slow: 'Ran slow', down: 'Was down' }

/** One block a day, oldest first, coloured by how the day went. */
export function Tracker({ days, label }: { days: DayState[]; label: string }) {
  return (
    <span className="bdc-tracker" role="img" aria-label={label}>
      {days.map((d, i) => (
        <i key={i} className={`is-${d}`} title={`${days.length - i === 1 ? 'Today' : `${days.length - 1 - i} days ago`}: ${DAY_WORD[d]}`} />
      ))}
    </span>
  )
}
