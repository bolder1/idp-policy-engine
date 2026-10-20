import { LayoutGroup, motion } from 'motion/react'
import { ArrowRight, Check, ChevronDown, X } from 'lucide-react'
import { useState, type DragEvent } from 'react'

import type { App } from '../data'
import { NoMatches } from '../empty'
import { SearchBox } from '../kit'
import { AppLogo } from '../logos/AppLogo'
import { FilterTabs } from './page-bar'
import { APP_PICKER_COMPARE, useAppPickerView, type AppPickerView } from './app-picker-view'
import './app-transfer.css'

/* -----------------------------------------------------------------------------
   Applications as two lists (owner, 14 Oct 2026: "the application selection
   model where the left side is all the apps and the right side the used ones,
   in an animated way"). Every application not in use on the left, the ones in
   use on the right; pressing a row sends it across, and it travels there (the
   rows share a layout id, so Motion moves them rather than redrawing them).

   An application that is on another policy stays on the left, says so, and does
   not move: one application, one policy. Nothing here saves — the caller owns
   the list.
   -------------------------------------------------------------------------- */
const SPRING = { type: 'spring', stiffness: 520, damping: 42 } as const

/* The props every version takes. */
interface PickerProps {
  apps: readonly App[]
  picked: readonly string[]
  onChange: (ids: string[]) => void
  /** The policy an application is already on, by name. Undefined when it is free. */
  takenBy: (appId: string) => string | undefined
}

const VIEWS: { value: AppPickerView; label: string }[] = [
  { value: 'lists', label: 'Two lists' },
  { value: 'list', label: 'One list' },
  { value: 'chips', label: 'Chips' },
]

/* The picker, in whichever version is switched on (app-picker-view.ts). The switch is a comparison control
   (APP_PICKER_COMPARE). */
export function AppTransfer(props: PickerProps) {
  const [view, setView] = useAppPickerView()
  return (
    <div className="bxpick">
      {APP_PICKER_COMPARE && (
        <div className="bxpick__switch">
          <span aria-hidden>View</span>
          <FilterTabs label="Application picker" value={view} options={VIEWS} onChange={setView} />
        </div>
      )}
      {view === 'list' ? <AppChecklist {...props} /> : view === 'chips' ? <AppChips {...props} /> : <AppLists {...props} />}
    </div>
  )
}

/* --- Two lists: all on the left, in use on the right, a row travels across. --- */
function AppLists({
  apps,
  picked,
  onChange,
  takenBy,
}: {
  apps: readonly App[]
  picked: readonly string[]
  onChange: (ids: string[]) => void
  /** The policy an application is already on, by name. Undefined when it is free. */
  takenBy: (appId: string) => string | undefined
}) {
  const [q, setQ] = useState('')
  /* A row being dragged, and the list it is over. Native drag: a press still moves a row, and the keyboard keeps to the buttons. */
  const [drag, setDrag] = useState<{ id: string; from: 'left' | 'right' } | null>(null)
  /* The ones in use elsewhere stay folded until asked for: the list is for what can be added. */
  const [showUsed, setShowUsed] = useState(false)
  const [over, setOver] = useState<'left' | 'right' | null>(null)
  const on = new Set(picked)
  /* Catalogue order, not click order: one order for the list, so "changed" never fires on nothing. */
  const ordered = (ids: Set<string>) => apps.filter((a) => ids.has(a.id)).map((a) => a.id)
  const add = (id: string) => onChange(ordered(new Set([...picked, id])))
  const remove = (id: string) => onChange(picked.filter((x) => x !== id))

  const start = (id: string, from: 'left' | 'right') => (e: DragEvent) => {
    e.dataTransfer.setData('text/plain', id)
    e.dataTransfer.effectAllowed = 'move'
    setDrag({ id, from })
  }
  const end = () => {
    setDrag(null)
    setOver(null)
  }
  /* A list takes the row only from the other list. */
  const zone = (side: 'left' | 'right') => ({
    onDragOver: (e: DragEvent) => {
      if (!drag || drag.from === side) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      if (over !== side) setOver(side)
    },
    onDragLeave: (e: DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null) && over === side) setOver(null)
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault()
      if (drag && drag.from !== side) (side === 'right' ? add : remove)(drag.id)
      end()
    },
  })

  const needle = q.trim().toLowerCase()
  const left = apps.filter((a) => !on.has(a.id) && (!needle || a.name.toLowerCase().includes(needle) || a.protocol.toLowerCase().includes(needle)))
  const right = apps.filter((a) => on.has(a.id))
  /* What can be added comes first; what is in use on another policy follows, set apart and greyed. */
  const free = left.filter((a) => !takenBy(a.id))
  const used = left.filter((a) => takenBy(a.id))

  return (
    <LayoutGroup>
      <div className="bxfer">
        <div className="bxfer__pane">
          <h4 className="bxfer__head">All applications</h4>
          <SearchBox block value={q} onChange={setQ} placeholder="Search applications…" label="Search applications" />
          <ul className={`bxfer__list${over === 'left' ? ' is-over' : ''}`} aria-label="Applications to add" {...zone('left')}>
            {left.length === 0 && (needle ? <NoMatches compact noun="applications" query={q} onClear={() => setQ('')} /> : <li className="bxfer__empty">Every application is in use.</li>)}
            {free.map((a) => (
              <motion.li key={a.id} layout layoutId={`bxfer-${a.id}`} transition={SPRING}>
                <button type="button" className="bxfer__row" title={`Add ${a.name}`} aria-label={`Add ${a.name}`} draggable onDragStart={start(a.id, 'left')} onDragEnd={end} onClick={() => add(a.id)}>
                  <AppLogo appId={a.id} name={a.name} size={20} />
                  <b>{a.name}</b>
                  <span className="bxfer__mark" aria-hidden>
                    <ArrowRight size={14} strokeWidth={2} />
                  </span>
                </button>
              </motion.li>
            ))}
            {used.length > 0 && (
              <li className="bxfer__sep">
                <button type="button" className="bxfer__fold" aria-expanded={showUsed} onClick={() => setShowUsed(!showUsed)}>
                  In use on another policy · {used.length}
                  <ChevronDown size={14} strokeWidth={2} aria-hidden className={showUsed ? 'is-open' : undefined} />
                </button>
              </li>
            )}
            {showUsed && used.map((a) => (
              <motion.li key={a.id} layout layoutId={`bxfer-${a.id}`} transition={SPRING}>
                <button
                  type="button"
                  className="bxfer__row is-used"
                  aria-disabled="true"
                  title={`On ${takenBy(a.id)}. Remove it there first.`}
                  aria-label={`${a.name}, in use on ${takenBy(a.id)}`}
                >
                  <AppLogo appId={a.id} name={a.name} size={20} />
                  <b>{a.name}</b>
                  <em>In use</em>
                </button>
              </motion.li>
            ))}
          </ul>
        </div>

        <div className="bxfer__pane">
          <h4 className="bxfer__head">
            In this policy <span>{right.length === 0 ? 'None' : `${right.length} selected`}</span>
          </h4>
          <ul className={`bxfer__list is-chosen${over === 'right' ? ' is-over' : ''}`} aria-label="Applications in this policy" {...zone('right')}>
            {right.length === 0 && <li className="bxfer__empty">Nothing yet. Press or drag an application here.</li>}
            {right.map((a) => (
              <motion.li key={a.id} layout layoutId={`bxfer-${a.id}`} transition={SPRING}>
                <button type="button" className="bxfer__row" title={`Remove ${a.name}`} aria-label={`Remove ${a.name}`} draggable onDragStart={start(a.id, 'right')} onDragEnd={end} onClick={() => remove(a.id)}>
                  <AppLogo appId={a.id} name={a.name} size={20} />
                  <b>{a.name}</b>
                  <span className="bxfer__mark" aria-hidden>
                    <X size={14} strokeWidth={2} />
                  </span>
                </button>
              </motion.li>
            ))}
          </ul>
        </div>
      </div>
    </LayoutGroup>
  )
}

/* --- Version 1, one list: tick what the policy protects. Nothing else on screen. ------------- */
function AppChecklist({ apps, picked, onChange, takenBy }: PickerProps) {
  const [q, setQ] = useState('')
  const [showUsed, setShowUsed] = useState(false)
  const on = new Set(picked)
  const needle = q.trim().toLowerCase()
  const match = (a: App) => !needle || a.name.toLowerCase().includes(needle)
  const toggle = (id: string) => onChange(apps.filter((a) => (a.id === id ? !on.has(id) : on.has(a.id))).map((a) => a.id))
  const free = apps.filter((a) => match(a) && (on.has(a.id) || !takenBy(a.id)))
  const used = apps.filter((a) => match(a) && !on.has(a.id) && takenBy(a.id))
  return (
    <div className="bxl">
      <SearchBox block value={q} onChange={setQ} placeholder="Search applications…" label="Search applications" />
      <ul className="bxl__list" aria-label="Applications">
        {free.length === 0 && used.length === 0 && <NoMatches compact noun="applications" query={q} onClear={() => setQ('')} />}
        {free.map((a) => (
          <li key={a.id}>
            <button type="button" role="checkbox" aria-checked={on.has(a.id)} className={`bxl__row${on.has(a.id) ? ' is-on' : ''}`} onClick={() => toggle(a.id)}>
              <span className="bx-tick" aria-hidden>
                {on.has(a.id) && <Check size={12} strokeWidth={3} />}
              </span>
              <AppLogo appId={a.id} name={a.name} size={20} />
              <b>{a.name}</b>
            </button>
          </li>
        ))}
        {used.length > 0 && (
          <li className="bxfer__sep">
            <button type="button" className="bxfer__fold" aria-expanded={showUsed} onClick={() => setShowUsed(!showUsed)}>
              In use on another policy · {used.length}
              <ChevronDown size={14} strokeWidth={2} aria-hidden className={showUsed ? 'is-open' : undefined} />
            </button>
          </li>
        )}
        {showUsed &&
          used.map((a) => (
            <li key={a.id}>
              <button type="button" className="bxl__row is-used" aria-disabled="true" title={`On ${takenBy(a.id)}. Remove it there first.`} aria-label={`${a.name}, in use on ${takenBy(a.id)}`}>
                <span className="bx-tick" aria-hidden />
                <AppLogo appId={a.id} name={a.name} size={20} />
                <b>{a.name}</b>
                <em>In use</em>
              </button>
            </li>
          ))}
      </ul>
      <p className="bxl__count">{picked.length === 0 ? 'None selected' : `${picked.length} selected`}</p>
    </div>
  )
}

/* --- Version 2, chips: what the policy protects as removable chips; a search that adds. ------- */
function AppChips({ apps, picked, onChange, takenBy }: PickerProps) {
  const [q, setQ] = useState('')
  const on = new Set(picked)
  const needle = q.trim().toLowerCase()
  const add = (id: string) => onChange(apps.filter((a) => a.id === id || on.has(a.id)).map((a) => a.id))
  const remove = (id: string) => onChange(picked.filter((x) => x !== id))
  const chosen = apps.filter((a) => on.has(a.id))
  const options = apps.filter((a) => !on.has(a.id) && !takenBy(a.id) && (!needle || a.name.toLowerCase().includes(needle)))
  return (
    <div className="bxc">
      <div className="bxc__chosen" aria-label="Applications in this policy">
        {chosen.length === 0 && <p className="bxc__none">No applications yet. Search below to add one.</p>}
        {chosen.map((a) => (
          <span key={a.id} className="bxc__chip">
            <AppLogo appId={a.id} name={a.name} size={16} />
            {a.name}
            <button type="button" aria-label={`Remove ${a.name}`} onClick={() => remove(a.id)}>
              <X size={12} strokeWidth={2.4} aria-hidden />
            </button>
          </span>
        ))}
      </div>
      <SearchBox block value={q} onChange={setQ} placeholder="Search applications to add…" label="Search applications to add" />
      <ul className="bxl__list bxc__list" aria-label="Applications to add">
        {options.length === 0 && (needle ? <NoMatches compact noun="applications" query={q} onClear={() => setQ('')} /> : <li className="bxfer__empty">Nothing left to add.</li>)}
        {options.map((a) => (
          <li key={a.id}>
            <button type="button" className="bxl__row" onClick={() => add(a.id)}>
              <AppLogo appId={a.id} name={a.name} size={20} />
              <b>{a.name}</b>
              <span className="bxc__add">Add</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
