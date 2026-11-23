import { useEffect, useState, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowRight, ChartArea, ChartBarBig, ChartColumn, ChartPie, Check, Inbox, LayoutGrid, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react'
import { Counter } from '../kit'
import { FilterTabs } from '../screens/page-bar'
import { ViewSwitch } from '../screens/library-view'
import type { Part } from './charts'
import { fmt, pct, useRows } from './format'
import { viewOf, type Kind } from './model'
import { useTile } from './tile-context'
import { shows } from '../rollout'
import type { WidgetId } from './catalog'

/* 22 Nov audit #12 (rollout.ts dashboardPolish): a list or table a filter leaves empty says so (states.tsx). */
const STATES = shows('dashboardPolish')

/** What an empty widget says, where the general words would be wrong. */
const EMPTY_WORDS: Partial<Record<WidgetId, string>> = {
  'recent-sign-ins': 'No sign-ins match',
  approvals: 'No requests waiting',
  expiring: 'Nothing expiring soon',
  'apps-without': 'Every app has a policy',
}

/** Nothing to show: a quiet mark and a few words, in the middle of the widget. */
export function Empty() {
  const { tile, meta } = useTile()
  /* Only what follows the board's range says so; a widget that does not (Quick actions, MFA coverage) has nothing to show. */
  const general = meta.category === 'activity' ? 'Nothing in this range' : 'Nothing to show'
  return (
    <div className="bdw-empty">
      <Mark icon={Inbox} />
      <p>{EMPTY_WORDS[tile.widget as WidgetId] ?? general}</p>
    </div>
  )
}

/* -----------------------------------------------------------------------------
   What the Dashboard's widgets are made of. One anatomy per kind of content,
   built once and used by every widget of that kind, so 39 widgets read as one
   product:

   · Head      the card's title and one line under it; on the right, the
               widget's filter and, where it has more than one view, the
               console's own view switch.
   · Stat      a label, a trend chip, one large value, then a line that says
               what moved and a quieter line that says what it is.
   · Fit       a list that shows as many whole rows as its tile has room for.
   · Row       a lead (a face, a logo, a mark), a name over a line, a trail.
   · BarList   ranked rows with a soft bar behind each label.
   · Legend    what the parts of a ring or a bar are, and how large.
   · Table     the console's table, fitted to the tile.

   Nothing here is orange, and selection is the console's blue.
   -------------------------------------------------------------------------- */

const VIEW_ICON: Record<Kind, LucideIcon> = {
  area: ChartArea,
  bars: ChartColumn,
  barlist: ChartBarBig,
  donut: ChartPie,
  grid: LayoutGrid,
  stat: ChartColumn,
  gauge: ChartPie,
  catbar: ChartBarBig,
  heat: LayoutGrid,
  tracker: ChartBarBig,
  funnel: ChartBarBig,
  list: ChartBarBig,
  feed: ChartBarBig,
  table: LayoutGrid,
  checklist: ChartBarBig,
  meters: ChartBarBig,
  actions: LayoutGrid,
  form: LayoutGrid,
  strip: ChartBarBig,
  note: LayoutGrid,
}

/** The card's heading. Its title is the widget's name; `children` are the widget's own controls. */
export function Head({ caption, children }: { caption?: ReactNode; children?: ReactNode }) {
  const { meta, tile, patch } = useTile()
  const view = viewOf(tile)
  return (
    <header className="bdw-head">
      <div className="bdw-head__text">
        <h2 className="bdw-title">{meta.name}</h2>
        {caption != null && caption !== '' && <p className="bdw-caption">{caption}</p>}
      </div>
      {(children || view) && (
        <div className="bdw-head__tools">
          {children}
          {view && meta.views && (
            <ViewSwitch
              label={`${meta.name} view`}
              value={view.id}
              onChange={(id) => patch({ view: id })}
              views={meta.views.map((v) => ({ id: v.id, label: v.label, icon: VIEW_ICON[v.kind] }))}
            />
          )}
        </div>
      )}
    </header>
  )
}

/** A widget's own filter: the console's segments, remembered on the tile. */
export function Filter<T extends string>({ label, value, options }: { label: string; value: T; options: { value: T; label: string }[] }) {
  const { patch } = useTile()
  return (
    <span className="bdw-filter">
      <FilterTabs label={label} value={value} options={options} onChange={(v) => patch({ pick: v })} />
    </span>
  )
}

/** A number that counts up from zero when its tile arrives. */
export function Count({ value }: { value: number }) {
  const { preview } = useTile()
  const [shown, setShown] = useState(preview ? value : 0)
  useEffect(() => {
    setShown(value)
  }, [value])
  return preview ? <>{fmt(value)}</> : <Counter value={shown} />
}

/** How far a number moved, as the console's pill. `good` says which way is the good one; without it the chip is plain. */
export function Trend({ change, good, points = false }: { change: number; good?: 'up' | 'down'; points?: boolean }) {
  const flat = Math.abs(change) < 0.0005
  const up = change > 0
  const tone = flat || !good ? 'plain' : (good === 'up') === up ? 'good' : 'bad'
  const Icon = up ? TrendingUp : TrendingDown
  const size = points ? `${Math.abs(change * 100).toFixed(Math.abs(change) < 0.1 ? 1 : 0)} pts` : pct(Math.abs(change), Math.abs(change) < 0.1 ? 1 : 0)
  return (
    <span className={`bdw-trend is-${tone}`}>
      {!flat && <Icon size={12} strokeWidth={2.2} aria-hidden />}
      <span className="u-sr-only">{flat ? 'No change' : up ? 'Up' : 'Down'} </span>
      {flat ? 'No change' : `${up ? '+' : '−'}${size}`}
    </span>
  )
}

/** The stat card: one number, what moved, and what it is. A taller tile gets the trend drawn under it. */
export function Stat({
  value,
  chip,
  line,
  up,
  caption,
  spark,
}: {
  value: ReactNode
  chip?: ReactNode
  /** What moved, in a few words. */
  line: ReactNode
  /** Which way `line` went, for the mark after it. */
  up?: boolean
  caption: ReactNode
  spark?: ReactNode
}) {
  const { meta } = useTile()
  const Arrow = up === undefined ? null : up ? TrendingUp : TrendingDown
  return (
    <div className="bdw-stat">
      <h2 className="bdw-stat__label">{meta.name}</h2>
      {chip && <span className="bdw-stat__chip">{chip}</span>}
      <p className="bdw-stat__value">{value}</p>
      {spark && <div className="bdw-stat__spark">{spark}</div>}
      <div className="bdw-stat__foot">
        <p className="bdw-stat__line">
          <span>{line}</span>
          {Arrow && <Arrow size={16} strokeWidth={2} aria-hidden />}
        </p>
        <p className="bdw-stat__caption">{caption}</p>
      </div>
    </div>
  )
}

/** A list that shows the whole rows its tile has room for. */
export function Fit<T>({ items, pitch, least = 1, className = '', children }: { items: readonly T[]; pitch: number; least?: number; className?: string; children: (item: T, index: number) => ReactNode }) {
  const [ref, rows] = useRows<HTMLUListElement>(pitch, least)
  return (
    <ul ref={ref} className={`bdw-fit ${className}`}>
      {items.slice(0, rows).map(children)}
    </ul>
  )
}

/** One row of a list: a lead, a name over a line, and what sits at the end. Pressable when it opens something. */
export function Row({ lead, title, sub, trail, onClick }: { lead?: ReactNode; title: ReactNode; sub?: ReactNode; trail?: ReactNode; onClick?: () => void }) {
  const main = (
    <>
      {lead && <span className="bdw-row__lead">{lead}</span>}
      <span className="bdw-row__main">
        <b>{title}</b>
        {sub != null && sub !== '' && <span>{sub}</span>}
      </span>
    </>
  )
  return (
    <li className="bdw-row">
      {onClick ? (
        <button type="button" className="bdw-row__open" onClick={onClick}>
          {main}
        </button>
      ) : (
        <span className="bdw-row__open">{main}</span>
      )}
      {trail != null && <span className="bdw-row__trail">{trail}</span>}
    </li>
  )
}

/** A small square mark in a soft tint, for a row or a cell that has no face or logo. */
export function Mark({ icon: Icon, tone = 'plain' }: { icon: LucideIcon; tone?: 'plain' | 'good' | 'warn' | 'bad' | 'info' }) {
  return (
    <span className={`bdw-mark is-${tone}`} aria-hidden>
      <Icon size={16} strokeWidth={1.9} />
    </span>
  )
}

export interface BarItem {
  key: string
  label: string
  value: number
  lead?: ReactNode
  /** A quieter word after the label. */
  hint?: string
  onClick?: () => void
}

/** Ranked rows, a soft bar behind each label and its value at the end. */
export function BarList({ items, format = fmt, tone }: { items: BarItem[]; format?: (v: number) => string; tone?: 'bad' }) {
  const { preview } = useTile()
  const reduce = useReducedMotion() === true || preview
  const max = Math.max(1, ...items.map((i) => i.value))
  if (STATES && items.every((i) => i.value === 0)) return <Empty />
  return (
    <Fit items={items} pitch={40} className={`bdw-barlist${tone ? ` is-${tone}` : ''}`}>
      {(i) => {
        const inner = (
          <>
            <motion.span
              className="bdw-bar"
              aria-hidden
              initial={{ width: reduce ? `${(i.value / max) * 100}%` : '0%' }}
              animate={{ width: `${(i.value / max) * 100}%` }}
              transition={{ duration: reduce ? 0 : 0.6, ease: [0.22, 1, 0.36, 1] }}
            />
            <span className="bdw-bar__label">
              {i.lead}
              <span>{i.label}</span>
              {i.hint && <em>{i.hint}</em>}
            </span>
          </>
        )
        return (
          <li key={i.key}>
            {i.onClick ? (
              <button type="button" className="bdw-bar__row" onClick={i.onClick}>
                {inner}
              </button>
            ) : (
              <span className="bdw-bar__row">{inner}</span>
            )}
            <b>{format(i.value)}</b>
          </li>
        )
      }}
    </Fit>
  )
}

/** What the parts of a ring or a bar are: a swatch, a name, and its size as a count or a share. */
export function Legend({ parts, as = 'share', columns = false, fit = false }: { parts: Part[]; as?: 'share' | 'count' | 'none'; columns?: boolean; fit?: boolean }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1
  const [ref, rows] = useRows<HTMLUListElement>(24, 2)
  return (
    <ul ref={fit ? ref : undefined} className={`bdw-legend${columns ? ' is-columns' : ''}${fit ? ' is-fit' : ''}`}>
      {(fit ? parts.slice(0, rows) : parts).map((p) => (
        <li key={p.key}>
          <i style={{ background: p.color }} aria-hidden />
          <span>{p.label}</span>
          {as !== 'none' && <b>{as === 'share' ? pct(p.value / total) : fmt(p.value)}</b>}
        </li>
      ))}
    </ul>
  )
}

/** Nothing to act on: a tick and a few words. */
export function Clear({ children }: { children: ReactNode }) {
  return (
    <p className="bdw-clear">
      <span className="bdw-mark is-good" aria-hidden>
        <Check size={16} strokeWidth={2.2} />
      </span>
      {children}
    </p>
  )
}

/** The way out of a tile to the page behind it. */
export function More({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  const { preview } = useTile()
  return (
    <button type="button" className="bdw-more" onClick={preview ? undefined : onClick}>
      {children}
      <ArrowRight size={14} strokeWidth={2} aria-hidden />
    </button>
  )
}

export interface Column {
  key: string
  label: string
  /** Numbers and short states sit at the end of the row. */
  end?: boolean
  /** Share of the row's width, as a flex grow. */
  grow?: number
}

/** The console's table, showing the whole rows its tile has room for. */
export function Table({ columns, rows, label }: { columns: Column[]; rows: { key: string; cells: ReactNode[] }[]; label: string }) {
  const [ref, fit] = useRows<HTMLDivElement>(44, 2)
  const shown = rows.slice(0, Math.max(1, fit - 1))
  if (STATES && rows.length === 0) return <Empty />
  const template = columns.map((c) => `minmax(0, ${c.grow ?? 1}fr)`).join(' ')
  return (
    <div className="bdw-table" ref={ref} role="table" aria-label={label}>
      <div className="bdw-table__head" role="row" style={{ gridTemplateColumns: template }}>
        {columns.map((c) => (
          <span key={c.key} role="columnheader" className={c.end ? 'is-end' : ''}>
            {c.label}
          </span>
        ))}
      </div>
      {shown.map((r) => (
        <div className="bdw-table__row" role="row" key={r.key} style={{ gridTemplateColumns: template }}>
          {r.cells.map((cell, i) => (
            <span key={columns[i].key} role="cell" className={columns[i].end ? 'is-end' : ''}>
              {cell}
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}
