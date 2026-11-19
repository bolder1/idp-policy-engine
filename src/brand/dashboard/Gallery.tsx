import { useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button, Chip, IconButton, Modal, SearchBox } from '../kit'
import { allCells, fromSpecs } from './layout'
import { MiniRows } from './mini'
import { NEEDS, WIDGETS, type DashTemplate, type TemplateNeed } from './model'
import { XECURIFY_TEMPLATES } from './templates'

/* -----------------------------------------------------------------------------
   The template gallery: where a dashboard starts. One look (owner, 18 Nov
   2026: the split and the card previews read the same, so there is one).

   Each card is the layout in miniature: every tile in its place and size,
   drawn as the kind of widget it holds. Pick one, then the popup's one orange
   button. It opens three ways:
   · first    the first visit: Use this layout, or Not now to keep Overview.
   · new      the plus beside the tabs: Create dashboard adds one.
   · layout   Customize, Layouts: Use this layout replaces this dashboard's.
   -------------------------------------------------------------------------- */

export type GalleryMode = 'first' | 'new' | 'layout'

const WORDS: Record<GalleryMode, { title: string; go: string; no: string }> = {
  first: { title: 'Choose a starting point', go: 'Use this layout', no: 'Not now' },
  new: { title: 'New dashboard', go: 'Create dashboard', no: 'Cancel' },
  layout: { title: 'Layouts', go: 'Use this layout', no: 'Cancel' },
}

type Pill = TemplateNeed | 'all' | 'own'

export function Gallery({
  mode,
  own,
  onUse,
  onClose,
  onRemoveOwn,
}: {
  mode: GalleryMode
  own: DashTemplate[]
  onUse: (t: DashTemplate) => void
  onClose: () => void
  onRemoveOwn: (t: DashTemplate) => void
}) {
  const [q, setQ] = useState('')
  const [pill, setPill] = useState<Pill>('all')
  const all = useMemo(() => [...own, ...XECURIFY_TEMPLATES], [own])
  const [picked, setPicked] = useState<string>(mode === 'first' ? XECURIFY_TEMPLATES[0].id : XECURIFY_TEMPLATES[1].id)
  const words = q.trim().toLowerCase()
  const shown = all.filter((t) => {
    const byPill = pill === 'all' || (pill === 'own' ? t.own : !t.own && t.need === pill)
    return byPill && (!words || `${t.name} ${t.blurb} ${allCells(fromSpecs(t.rows)).map((x) => WIDGETS[x.widget].name).join(' ')}`.toLowerCase().includes(words))
  })
  const choice = all.find((t) => t.id === picked) ?? null
  const pills: { value: Pill; label: string }[] = [{ value: 'all', label: 'All' }, ...NEEDS, ...(own.length ? [{ value: 'own' as const, label: 'Yours' }] : [])]
  const w = WORDS[mode]

  return (
    <Modal
      open
      onClose={onClose}
      title={w.title}
      width={1040}
      padded={false}
      footer={
        <>
          <Button variant="neutral" onClick={onClose}>
            {w.no}
          </Button>
          <Button variant="brand" disabled={!choice} onClick={() => choice && onUse(choice)}>
            {w.go}
          </Button>
        </>
      }
    >
      <div className="bdash-gal bdash-vars">
        <div className="bdash-gal__find">
          <SearchBox value={q} onChange={setQ} placeholder="Search layouts" label="Search layouts" />
          <div className="bdash-chips" role="group" aria-label="Layouts by need">
            {pills.map((p) => (
              <Chip key={p.value} active={pill === p.value} onClick={() => setPill(p.value)}>
                {p.label}
              </Chip>
            ))}
          </div>
        </div>
        <ul className="bdash-gal__grid" role="listbox" aria-label="Layouts">
          {shown.map((t) => (
            <li key={t.id} role="option" aria-selected={t.id === picked}>
              <button type="button" className={`bdash-gal__card${t.id === picked ? ' is-on' : ''}`} onClick={() => setPicked(t.id)} onDoubleClick={() => onUse(t)}>
                <MiniRows rows={t.rows} />
                <b>{t.name}</b>
                <span>{t.blurb}</span>
              </button>
              {t.own && <IconButton icon={Trash2} label={`Remove ${t.name}`} tone="ghost" size="sm" onClick={() => onRemoveOwn(t)} />}
            </li>
          ))}
          {shown.length === 0 && <li className="bdash-gal__none">No layout matches “{q.trim()}”</li>}
        </ul>
      </div>
    </Modal>
  )
}

