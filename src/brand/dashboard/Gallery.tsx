import { useMemo, useRef, useState } from 'react'
import { Store, Trash2 } from 'lucide-react'
import { Button, Chip, RowMenu } from '../kit'
import { allCells, fromSpecs } from './layout'
import { Market } from './Market'
import { MiniRows } from './mini'
import { NEEDS, WIDGETS, type DashTemplate, type TemplateNeed } from './model'
import { XECURIFY_TEMPLATES } from './templates'

/* -----------------------------------------------------------------------------
   Layouts: where a dashboard starts, as a gallery like the template store
   (owner, 19 Nov 2026: "the list can easily be like a layout gallery, or
   maybe a marketplace kind of thing"; Market.tsx).

   Each card is a layout in miniature, every widget in its place and size,
   that builds itself tile by tile when pointed at, as using it does. Its need
   is in the corner tab, and its one button uses it. It opens three ways:
   · first    the first visit: a layout, or Not now to keep Overview.
   · new      the plus beside the tabs: Create dashboard adds one.
   · layout   the board's actions in Customize: Use this layout replaces this dashboard's.
   -------------------------------------------------------------------------- */

export type GalleryMode = 'first' | 'new' | 'layout'

const WORDS: Record<GalleryMode, { title: string; by: string; go: string; close: string }> = {
  first: { title: 'Choose a starting point', by: 'Every layout can be changed afterwards', go: 'Use this layout', close: 'Not now' },
  new: { title: 'New dashboard', by: 'Start from a layout, or from nothing', go: 'Create dashboard', close: 'Close' },
  layout: { title: 'Layouts', by: 'Replaces this dashboard’s widgets', go: 'Use this layout', close: 'Close' },
}

/** A need's colour, from the template store's set (create.css `.bgcard.is-cat-*`). */
const HUE: Record<TemplateNeed, string> = { security: 'risk', operations: 'device', policies: 'quick', compliance: 'compliance', people: 'reuse', start: 'neutral' }

type Shelf = TemplateNeed | 'all' | 'own'

export function Gallery({
  mode,
  own,
  onUse,
  onClose,
  onRemoveOwn,
}: {
  mode: GalleryMode | null
  own: DashTemplate[]
  onUse: (t: DashTemplate) => void
  onClose: () => void
  onRemoveOwn: (t: DashTemplate) => void
}) {
  const [q, setQ] = useState('')
  const [shelf, setShelf] = useState<Shelf>('all')
  const all = useMemo(() => [...own, ...XECURIFY_TEMPLATES], [own])
  /* What each layout holds, for the search: its widgets' names as well as its own words. */
  const said = useMemo(() => new Map(all.map((t) => [t.id, `${t.name} ${t.blurb} ${allCells(fromSpecs(t.rows)).map((x) => WIDGETS[x.widget].name).join(' ')}`.toLowerCase()])), [all])
  const words = q.trim().toLowerCase()
  const shown = all.filter((t) => (shelf === 'all' || (shelf === 'own' ? t.own : !t.own && t.need === shelf)) && (!words || (said.get(t.id) ?? '').includes(words)))
  const shelves: { value: Shelf; label: string }[] = [{ value: 'all', label: 'All layouts' }, ...NEEDS, ...(own.length ? [{ value: 'own' as const, label: 'Yours' }] : [])]
  /* The words it opened with, kept while it closes. */
  const last = useRef<GalleryMode>('layout')
  if (mode) last.current = mode
  const w = WORDS[mode ?? last.current]

  return (
    <Market open={mode !== null} title={w.title} by={w.by} icon={Store} query={q} onQuery={setQ} placeholder="Search layouts" closeLabel={w.close} onClose={onClose}>
      <div className="bdash-market__top">
        <div className="bmarket__chips" role="group" aria-label="Layouts by need">
          {shelves.map((s) => (
            <Chip key={s.value} active={shelf === s.value} onClick={() => setShelf(s.value)}>
              {s.label}
            </Chip>
          ))}
        </div>
        {mode === 'first' && (
          <Button variant="ghost" onClick={onClose}>
            Not now
          </Button>
        )}
      </div>
      <div className="bgal__grid">
        {shown.map((t) => (
          <LayoutCard key={t.id} t={t} go={w.go} onUse={onUse} onRemove={t.own ? onRemoveOwn : undefined} />
        ))}
      </div>
      {shown.length === 0 && <p className="bdash-market__none">No layout matches “{q.trim()}”</p>}
    </Market>
  )
}

function LayoutCard({ t, go, onUse, onRemove }: { t: DashTemplate; go: string; onUse: (t: DashTemplate) => void; onRemove?: (t: DashTemplate) => void }) {
  const need = t.own ? 'Yours' : (NEEDS.find((n) => n.value === t.need)?.label ?? '')
  return (
    <article className={`bgcard bdash-lcard is-cat-${t.own ? 'neutral' : HUE[t.need]}`}>
      <span className="bgcard__cat">{need}</span>
      <div className="bgcard__in">
        <div className="bgcard__canvas is-picture">
          <span className="bgviz bdash-lpic">
            <MiniRows rows={t.rows} scale={0.06} max={128} />
          </span>
        </div>
        <div className="bgcard__body">
          <div className="bgcard__head">
            <h3 className="bgcard__h" title={t.name}>
              {t.name}
            </h3>
            {onRemove && <RowMenu label={`More for ${t.name}`} items={[{ id: 'remove', label: 'Remove layout', icon: Trash2, danger: true }]} onSelect={() => onRemove(t)} />}
          </div>
          <p className="bgcard__sub">{t.blurb}</p>
          <div className="bgcard__go">
            <button type="button" className="bgcard__cta" aria-label={`${go}: ${t.name}`} onClick={() => onUse(t)}>
              {go}
            </button>
          </div>
        </div>
      </div>
    </article>
  )
}
