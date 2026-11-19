import { kindOf } from './catalog'
import type { RowSpec } from './layout'
import { Thumb } from './thumbs'

/* A layout in miniature: its rows, columns and stacks in proportion, each widget drawn as the kind of content it
   holds. The template gallery and the Arrange choices draw with it. */
export function MiniRows({ rows, scale = 0.07, max = 150 }: { rows: readonly RowSpec[]; scale?: number; max?: number }) {
  /* The first screen of a layout is what a card has room for. */
  const shown: RowSpec[] = []
  let used = 0
  for (const r of rows) {
    const h = Math.max(10, r.height * scale)
    if (shown.length && used + h > max) break
    shown.push(r)
    used += h + 3
  }
  return (
    <span className="bdash-mini" aria-hidden>
      {shown.length === 0 && <span className="bdash-mini__empty" />}
      {shown.map((r, i) => (
        <span key={i} className="bdash-mini__row" style={{ height: Math.max(10, r.height * scale) }}>
          {r.columns.map((c, j) => (
            <span key={j} className="bdash-mini__col" style={{ flexGrow: c.span }}>
              {c.cells.map((x, k) => (
                <span key={k} className="bdash-mini__tile" style={{ flexGrow: x.weight ?? 1 }}>
                  <Thumb kind={kindOf(x)} />
                </span>
              ))}
            </span>
          ))}
        </span>
      ))}
    </span>
  )
}
