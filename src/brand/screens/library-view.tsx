import type { ReactNode } from 'react'
import { LIB_VIEWS, type LibView, type ViewOption } from './library-view-state'

/* -----------------------------------------------------------------------------
   Three views of one library, drawn once.

   Zones, Device profiles and Risk signal profiles are the same object in three
   flavours: a marked name, a couple of facts about it, and a row menu. They had
   three hand-built copies of the list markup, which is why they had drifted
   apart on spacing and why only one of them could ever gain a view (owner,
   16 Sep 2026: "give me a view of table, list and card ... make sure you use
   consistent table, card and list design for all of them").

   So a page hands over rows in one shape and picks a view. The three renderings
   below are the ONLY place any of the three pages says what a row looks like.

   This reverses two earlier calls, on the owner's say-so: that library pages are
   lists and not tables, and that the card view was removed. What survives from
   both is that the LIST is still the default — it is the shape that holds two
   facts and a menu without scrolling sideways.
   -------------------------------------------------------------------------- */

/* Icons alone, with their names in the accessible label: three words across a
   toolbar that already has a search box and a filter would be the widest thing
   on it, and the shapes are the convention. `role="tablist"` rather than a radio
   group — these choose a rendering of what is already on screen. */
export function ViewSwitch<T extends string = LibView>({
  value,
  onChange,
  label,
  views,
}: {
  value: T
  onChange: (v: T) => void
  /** "Zone view", "Device profile view" — what the group chooses. */
  label: string
  /** The three library views by default. A page with a view of its own — the
      policies' Coverage matrix — passes the three plus that one. */
  views?: ViewOption<T>[]
}) {
  const shown = views ?? (LIB_VIEWS as unknown as ViewOption<T>[])
  return (
    <div className="bviewswitch blib__views" role="tablist" aria-label={label}>
      {shown.map((v) => (
        <button
          key={v.id}
          type="button"
          role="tab"
          aria-selected={value === v.id}
          aria-label={v.label}
          title={v.note ?? v.label}
          disabled={v.disabled}
          className={value === v.id ? 'is-on' : ''}
          onClick={() => onChange(v.id)}
        >
          <v.icon size={15} strokeWidth={1.9} aria-hidden />
        </button>
      ))}
    </div>
  )
}

/** One fact about a row: what it is called, and what it says. */
export interface LibFact {
  /** Printed before the value in list and card views; the table's column head.
      Omitted where the value is a whole phrase that names itself. */
  label?: string
  value: ReactNode
}

export interface LibRow {
  id: string
  name: string
  /** The mark, already sized by the caller — each library has its own icon set. */
  tile: ReactNode
  /** The page's tint class for that mark, e.g. `bz7__tile is-blue`. */
  tileClass?: string
  /** A pill beside the name: a type, a state. */
  badge?: ReactNode
  facts: LibFact[]
  /** The caller's `RowMenu`, so each page keeps its own actions. */
  menu?: ReactNode
  onOpen: () => void
  /** `data-*` on the row, which the pages use to put focus back on one. */
  attrs?: Record<string, string>
}

export function LibraryRows({
  view,
  rows,
  columns,
  listRef,
  nameColumn = 'Name',
}: {
  view: LibView
  rows: LibRow[]
  /** The table's column heads, positional against `facts`. */
  columns: string[]
  /** The pages hand focus back to a row after a drawer closes. */
  listRef?: (el: HTMLElement | null) => void
  nameColumn?: string
}) {
  if (view === 'table') {
    return (
      <div className="btable-wrap">
        <div className="btable__scroll">
          <table className="btable blib__table">
            <thead>
              <tr>
                <th scope="col">{nameColumn}</th>
                {columns.map((c) => (
                  <th scope="col" key={c}>
                    {c}
                  </th>
                ))}
                <th scope="col" className="btable__actions btable__col-actions">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody ref={listRef}>
              {rows.map((r) => (
                <tr key={r.id} {...r.attrs}>
                  <td>
                    <span className="blib__cellname">
                      <span className={`blist__tile ${r.tileClass ?? ''}`} aria-hidden>
                        {r.tile}
                      </span>
                      <button type="button" className="blist__open" title={r.name} onClick={r.onOpen}>
                        {r.name}
                      </button>
                      {r.badge}
                    </span>
                  </td>
                  {/* Positional against `columns`, so a page with fewer facts
                      than heads still lines up rather than shifting left. */}
                  {columns.map((c, i) => (
                    <td key={c}>{r.facts[i]?.value ?? <span className="blib__none">—</span>}</td>
                  ))}
                  <td className="btable__actions">{r.menu}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  if (view === 'card') {
    return (
      <ul className="blib__cards" ref={listRef}>
        {rows.map((r) => (
          <li className="blib__card" key={r.id} {...r.attrs}>
            <div className="blib__cardhead">
              <span className={`blist__tile ${r.tileClass ?? ''}`} aria-hidden>
                {r.tile}
              </span>
              <span className="blib__cardname">
                <button type="button" className="blist__open" title={r.name} onClick={r.onOpen}>
                  {r.name}
                </button>
                {r.badge}
              </span>
              <span className="blib__cardmenu">{r.menu}</span>
            </div>
            {r.facts.length > 0 && (
              <dl className="blib__cardfacts">
                {r.facts.map((f, i) => (
                  <div key={f.label ?? i}>
                    <dt>{f.label ?? ''}</dt>
                    <dd>{f.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </li>
        ))}
      </ul>
    )
  }

  return (
    <ul className="blist blist--paged" ref={listRef}>
      {rows.map((r) => (
        <li className="blist__row" key={r.id} {...r.attrs}>
          <span className={`blist__tile ${r.tileClass ?? ''}`} aria-hidden>
            {r.tile}
          </span>
          <span className="blist__main">
            <span className="blist__name">
              {/* The name truncates in a fixed-height row; the title gives it back. */}
              <button type="button" className="blist__open" title={r.name} onClick={r.onOpen}>
                {r.name}
              </button>
              {r.badge}
            </span>
            {r.facts.length > 0 && (
              <span className="blist__meta">
                {r.facts.map((f, i) => (
                  <span className="blist__fact" key={f.label ?? i}>
                    {f.label && <span className="blist__label">{f.label}</span>}
                    {f.value}
                  </span>
                ))}
              </span>
            )}
          </span>
          <span className="blist__side">{r.menu}</span>
        </li>
      ))}
    </ul>
  )
}
