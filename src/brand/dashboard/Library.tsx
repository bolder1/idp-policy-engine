import { useEffect, useMemo, useState } from 'react'
import { Check, LayoutGrid } from 'lucide-react'
import { Chip } from '../kit'
import { CATEGORIES, WIDGETS, WIDGET_IDS, type Category, type WidgetId } from './model'
import { Market } from './Market'
import { WidgetPicture } from './pictures'
import { SUGGESTED } from './templates'
import type { ThemeId } from './themes'
import { HIDE_CHECKS } from '../tester'
import { offered } from './withheld'

/* Where Check access is withheld (Dev handoff, rollout.ts activityAndChecks), Quick actions doesn't promise it. */
const blurbOf = (w: WidgetId): string => (HIDE_CHECKS && w === 'shortcuts' ? 'New policy, add an app, add a user' : WIDGETS[w].blurb)

/* -----------------------------------------------------------------------------
   Add widgets: the dashboard's library, in a popup over it (owner, 19 Nov
   2026: "Add Widget will be the main button … a large library of widgets …
   maybe we don't go inline so that doesn't hamper the dashboard … either a
   slider or a pop-up, you decide"). A popup, because it is a catalogue to
   browse and the template store already taught this console's admins its
   shape.

   Every widget is a card like a template's: a picture of the widget that
   plays its use when pointed at, its need in the corner tab, its name and
   what it answers, and one button. The button manages it: Add to dashboard,
   or, once it is there, Remove; the chips find one by need, and "On this
   dashboard" lists what the dashboard holds. The popup stays open while
   widgets come and go, and the board behind it glides to take them.
   -------------------------------------------------------------------------- */

/** A need's colour, from the template store's set (create.css `.bgcard.is-cat-*`, tokens.css `--tpl-*`). */
const HUE: Record<Category, string> = { posture: 'compliance', activity: 'device', engine: 'quick', people: 'risk', admin: 'neutral' }

type Shelf = Category | 'all' | 'on'

export function Library({
  open,
  has,
  empty,
  onAdd,
  onRemove,
  onClose,
  row = null,
  theme,
}: {
  open: boolean
  has: (w: WidgetId) => boolean
  /** The dashboard has no widgets: a few to start with come first. */
  empty: boolean
  onAdd: (w: WidgetId) => void
  onRemove: (w: WidgetId) => void
  onClose: () => void
  /** Opened from a row's Add here: only what fits that row and is not on the dashboard yet. */
  row?: { label: string; fits: (w: WidgetId) => boolean } | null
  /** The board's theme, so a picture's data is in the colours it will have on the board (dashboardPolish). */
  theme?: ThemeId
}) {
  const [q, setQ] = useState('')
  const [shelf, setShelf] = useState<Shelf>('all')
  const words = q.trim().toLowerCase()
  /* The first shelf as the popup opens and the rest once it has landed: forty cards drawn at once took a frame of
     their own, in the middle of the popup's rise. A search or a chip shows everything it finds at once. */
  const [landed, setLanded] = useState(false)
  useEffect(() => {
    if (!open) {
      setLanded(false)
      return
    }
    const t = window.setTimeout(() => setLanded(true), 320)
    return () => window.clearTimeout(t)
  }, [open])

  const sections = useMemo(() => {
    const match = (w: WidgetId) => {
      const m = WIDGETS[w]
      if (!offered(w)) return false
      if (row && (has(w) || !row.fits(w))) return false
      return !words || `${m.name} ${blurbOf(w)} ${m.words ?? ''}`.toLowerCase().includes(words)
    }
    const out: { key: string; label: string; widgets: WidgetId[] }[] = []
    if (shelf === 'on') {
      const on = WIDGET_IDS.filter((w) => has(w) && match(w))
      if (on.length) out.push({ key: 'on', label: 'On this dashboard', widgets: on })
      return out
    }
    if (empty && !row && !words && shelf === 'all') out.push({ key: 'suggested', label: 'Suggested', widgets: SUGGESTED })
    for (const c of CATEGORIES) {
      if (shelf !== 'all' && shelf !== c.value) continue
      const widgets = WIDGET_IDS.filter((w) => WIDGETS[w].category === c.value && match(w))
      if (widgets.length) out.push({ key: c.value, label: c.label, widgets })
    }
    return out
  }, [words, shelf, empty, has, row])

  const shelves: { value: Shelf; label: string }[] = [{ value: 'all', label: 'All widgets' }, ...CATEGORIES, ...(row ? [] : [{ value: 'on' as const, label: 'On this dashboard' }])]

  return (
    <Market open={open} title={row ? `Add to ${row.label}` : 'Add widgets'} by={row ? 'Widgets that fit this row' : 'Pick what this dashboard shows'} icon={LayoutGrid} query={q} onQuery={setQ} placeholder="Search widgets" onClose={onClose}>
      <div className="bmarket__chips" role="group" aria-label="Widgets by need">
        {shelves.map((s) => (
          <Chip key={s.value} active={shelf === s.value} onClick={() => setShelf(s.value)}>
            {s.label}
          </Chip>
        ))}
      </div>
      {(landed || words || shelf !== 'all' ? sections : sections.slice(0, 1)).map((s) => (
        <section key={s.key} className="bdash-market__shelf" aria-label={s.label}>
          <h3 className="bgal__section">{s.label}</h3>
          <div className="bgal__grid">
            {s.widgets.map((w) => (
              <WidgetCard key={`${s.key}${w}`} widget={w} on={has(w)} theme={theme} onAdd={onAdd} onRemove={onRemove} />
            ))}
          </div>
        </section>
      ))}
      {sections.length === 0 && (
        <p className="bdash-market__none">{shelf === 'on' && !words ? 'Nothing on this dashboard yet' : row && !words ? 'Nothing else fits this row' : `No widget matches “${q.trim()}”`}</p>
      )}
    </Market>
  )
}

function WidgetCard({ widget, on, theme, onAdd, onRemove }: { widget: WidgetId; on: boolean; theme?: ThemeId; onAdd: (w: WidgetId) => void; onRemove: (w: WidgetId) => void }) {
  const m = WIDGETS[widget]
  const need = CATEGORIES.find((c) => c.value === m.category)?.label ?? ''
  return (
    <article className={`bgcard bdash-wcard is-cat-${HUE[m.category]}`}>
      <span className="bgcard__cat">{need}</span>
      <div className="bgcard__in">
        <div className="bgcard__canvas is-picture">
          <WidgetPicture widget={widget} theme={theme} />
        </div>
        <div className="bgcard__body">
          <div className="bgcard__head">
            <h3 className="bgcard__h" title={m.name}>
              {m.name}
            </h3>
          </div>
          <p className="bgcard__sub">{blurbOf(widget)}</p>
          <div className="bgcard__go">
            {on && (
              <span className="bgcard__done">
                <Check size={14} strokeWidth={2.2} aria-hidden />
                On the dashboard
              </span>
            )}
            <button
              type="button"
              className={`bgcard__cta${on ? ' is-quiet' : ''}`}
              aria-label={on ? `Remove ${m.name} from the dashboard` : `Add ${m.name} to the dashboard`}
              onClick={() => (on ? onRemove(widget) : onAdd(widget))}
            >
              {on ? 'Remove' : 'Add to dashboard'}
            </button>
          </div>
        </div>
      </div>
    </article>
  )
}
