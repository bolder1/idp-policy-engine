import { useMemo, useState, type PointerEvent } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Check, Plus, X } from 'lucide-react'
import { Chip, IconButton, SearchBox } from '../kit'
import { CATEGORIES, WIDGETS, WIDGET_IDS, type Category, type WidgetId } from './model'
import { SUGGESTED } from './templates'
import { Thumb } from './thumbs'

/* -----------------------------------------------------------------------------
   Add widgets: the panel beside the board in Customize. Search and the five
   needs find a widget; each row is a picture of how it shows its data, its
   name and what it answers.

   Two ways in, as the AWS console and Azure have it: the plus puts the widget
   in the first space it fits, and dragging the row carries it to the place
   you choose. A widget already on the dashboard says so.
   -------------------------------------------------------------------------- */

export function Library({
  onAdd,
  onGrab,
  onClose,
  has,
  empty,
}: {
  onAdd: (w: WidgetId) => void
  /** A row picked up to be carried to the board. */
  onGrab: (w: WidgetId, e: PointerEvent<HTMLElement>) => void
  onClose: () => void
  has: (w: WidgetId) => boolean
  /** The dashboard has no tiles: offer a few first. */
  empty: boolean
}) {
  const still = useReducedMotion() === true
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<Category | 'all'>('all')
  const groups = useMemo(() => {
    const words = q.trim().toLowerCase()
    const match = (w: WidgetId) => {
      const m = WIDGETS[w]
      return !words || `${m.name} ${m.blurb} ${m.words ?? ''}`.toLowerCase().includes(words)
    }
    const out: { key: string; label: string; widgets: WidgetId[] }[] = []
    if (empty && !words && cat === 'all') out.push({ key: 'suggested', label: 'Suggested', widgets: SUGGESTED })
    for (const c of CATEGORIES) {
      if (cat !== 'all' && cat !== c.value) continue
      const widgets = WIDGET_IDS.filter((w) => WIDGETS[w].category === c.value && match(w))
      if (widgets.length) out.push({ key: c.value, label: c.label, widgets })
    }
    return out
  }, [q, cat, empty])

  return (
    <motion.aside
      className="bdash-lib"
      aria-label="Add widgets"
      initial={still ? false : { opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={still ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, x: 20 }}
      transition={{ type: 'spring', stiffness: 460, damping: 42 }}
    >
      <header className="bdash-lib__head">
        <h2>Add widgets</h2>
        <IconButton icon={X} label="Close" tone="ghost" onClick={onClose} />
      </header>
      <div className="bdash-lib__find">
        <SearchBox value={q} onChange={setQ} placeholder="Search widgets" label="Search widgets" block />
        <div className="bdash-chips" role="group" aria-label="Widgets by need">
          <Chip active={cat === 'all'} onClick={() => setCat('all')}>
            All
          </Chip>
          {CATEGORIES.map((c) => (
            <Chip key={c.value} active={cat === c.value} onClick={() => setCat(c.value)}>
              {c.label}
            </Chip>
          ))}
        </div>
      </div>
      <div className="bdash-lib__list">
        {groups.map((g) => (
          <section key={g.key} aria-label={g.label}>
            <h3>{g.label}</h3>
            <ul>
              {g.widgets.map((w) => (
                <LibraryRow key={`${g.key}${w}`} widget={w} added={has(w)} onAdd={onAdd} onGrab={onGrab} />
              ))}
            </ul>
          </section>
        ))}
        {groups.length === 0 && <p className="bdash-lib__none">No widget matches “{q.trim()}”</p>}
      </div>
    </motion.aside>
  )
}

function LibraryRow({ widget, added, onAdd, onGrab }: { widget: WidgetId; added: boolean; onAdd: (w: WidgetId) => void; onGrab: (w: WidgetId, e: PointerEvent<HTMLElement>) => void }) {
  const m = WIDGETS[widget]
  return (
    <li className={`bdash-pick${added ? ' is-added' : ''}`} onPointerDown={added ? undefined : (e) => ((e.target as Element).closest('button') ? undefined : onGrab(widget, e))}>
      <span className="bdash-pick__art">
        <Thumb kind={m.kind} />
      </span>
      <span className="bdash-pick__text">
        <b>{m.name}</b>
        <span>{m.blurb}</span>
      </span>
      {added ? (
        <span className="bdash-pick__done">
          <Check size={14} strokeWidth={2.4} aria-hidden />
          Added
        </span>
      ) : (
        <IconButton icon={Plus} label={`Add ${m.name}`} size="sm" onClick={() => onAdd(widget)} />
      )}
    </li>
  )
}
