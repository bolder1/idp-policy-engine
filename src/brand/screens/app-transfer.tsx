import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'motion/react'
import { ArrowRight, Check, ChevronDown, Plus, Search, X } from 'lucide-react'
import { useId, useLayoutEffect, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'

import type { App } from '../data'
import { NoMatches } from '../empty'
import { SearchBox } from '../kit'
import { AppLogo } from '../logos/AppLogo'
import { FilterTabs } from './page-bar'
import { APP_PICKER_COMPARE, useAppPickerView, type AppPickerView } from './app-picker-view'
import { chipKey, fieldKey, listKey, pickInto, takeOut, tokenRows } from './app-tokens'
import './app-transfer.css'

/* The picks and the search as ONE field (owner, 24 Oct 2026: "merge both so one place where we show the added and
   form search as we have in Google or other apps"). Off, the chips are the 21 Oct two-part picker again: a search box,
   then the chips under In this policy, then the list. */
export const APP_TOKEN_FIELD = true
/* The applications another sign-in policy holds, listed greyed at the foot of the list with that policy's name, so a
   search for one says where it is rather than "no match" (one app, one policy, 14 Oct 2026: "In use / On <policy>").
   Off, they are not offered at all, as the 21 Oct chips had it. */
export const SHOW_IN_USE = true
/* …and folded away until asked for (owner, 26 Oct 2026: "this section can be an accordion, only if the user wants they
   can see the app list"). A policy that has most of a hundred applications taken pushed its own free ones off the
   screen under a long grey list nobody was picking from. The line stays, with how many it holds; pressing it opens the
   list. While words are typed the matches are shown anyway, because a search for one says where it is. Off, the list
   is always open, as it was. */
export const FOLD_IN_USE = true
/* The search's words once a chip is in the field: what typing there does. */
const MORE = 'Search to add more'

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
  /** What an empty list means for this policy, said under the chips while none is picked (the builder's
      Applications panel, 23 Oct 2026). The caller decides when there is anything to say. */
  emptyNote?: ReactNode
  /** Whether the applications on another policy start open. Closed unless asked: the line is pressed to open them
      (FOLD_IN_USE). Here for a render that cannot press. */
  openInUse?: boolean
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
      {view === 'list' ? (
        <AppChecklist {...props} />
      ) : view === 'chips' ? (
        APP_TOKEN_FIELD ? (
          <AppTokens {...props} />
        ) : (
          <AppChips {...props} />
        )
      ) : (
        <AppLists {...props} />
      )}
      {/* The chips say it under their field; the two compared drawings, under the picker. */}
      {view !== 'chips' && props.picked.length === 0 && props.emptyNote}
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

/* --- The chips in two parts (owner, 21 Oct 2026: the version they agreed on), kept behind APP_TOKEN_FIELD. ----------
   Search first, then what the policy protects as removable chips right under it, then the applications that can still be
   added, each with its own Add. An added application leaves the list and lands as a chip, so the two never show the same
   thing twice; the ones in use on another policy are not offered (Two lists says why). Superseded on 24 Oct by the one
   field below, which puts the chips and the search in the same box. */
function AppChips({ apps, picked, onChange, takenBy, emptyNote }: PickerProps) {
  const [q, setQ] = useState('')
  const reduced = useReducedMotion()
  const on = new Set(picked)
  const needle = q.trim().toLowerCase()
  const add = (id: string) => onChange(apps.filter((a) => a.id === id || on.has(a.id)).map((a) => a.id))
  const remove = (id: string) => onChange(picked.filter((x) => x !== id))
  const chosen = apps.filter((a) => on.has(a.id))
  const options = apps.filter((a) => !on.has(a.id) && !takenBy(a.id) && (!needle || a.name.toLowerCase().includes(needle)))
  const ease = { duration: reduced ? 0 : 0.16, ease: [0.2, 0, 0, 1] as const }
  return (
    <div className="bxc">
      <SearchBox block value={q} onChange={setQ} placeholder="Search applications" label="Search applications" />
      <div className="bxc__part">
        <p className="bxc__lab" id="bxc-in">
          In this policy
        </p>
        <div className="bxc__chosen" role="group" aria-labelledby="bxc-in">
          <AnimatePresence initial={false} mode="popLayout">
            {chosen.map((a) => (
              <motion.span key={a.id} layout={!reduced} className="bxc__chip" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={ease}>
                <AppLogo appId={a.id} name={a.name} size={18} />
                {a.name}
                <button type="button" aria-label={`Remove ${a.name}`} onClick={() => remove(a.id)}>
                  <X size={13} strokeWidth={2.4} aria-hidden />
                </button>
              </motion.span>
            ))}
          </AnimatePresence>
          {chosen.length === 0 && <p className="bxc__none">None added yet</p>}
        </div>
        {chosen.length === 0 && emptyNote}
      </div>
      <div className="bxc__part is-list">
        <p className="bxc__lab" id="bxc-add">
          Applications to add
        </p>
        <ul className="bxl__list bxc__list" aria-labelledby="bxc-add">
          {options.length === 0 &&
            (needle ? (
              <NoMatches compact noun="applications" query={q} onClear={() => setQ('')} />
            ) : (
              /* Every application is already a chip above, so the list has nothing to show rather than
                 nothing to match: its own end state, not a search miss. */
              <li className="bxc__done">
                <span className="bxc__donemark">
                  <Check size={18} strokeWidth={2.4} aria-hidden />
                </span>
                <b>Every application is in this policy</b>
              </li>
            ))}
          {options.map((a) => (
            <li key={a.id}>
              <button type="button" className="bxl__row" aria-label={`Add ${a.name}`} onClick={() => add(a.id)}>
                <AppLogo appId={a.id} name={a.name} size={24} />
                <b>{a.name}</b>
                <span className="bxc__add">
                  <Plus size={14} strokeWidth={2.2} aria-hidden />
                  Add
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/* --- One field (owner, 24 Oct 2026). ------------------------------------------------------------------------------------
   A mail client's To field: the applications in this policy are chips INSIDE one bordered box, each with its ×, and the
   search is the text after them, so whatever is picked lands where the typing is. The empty search's words say what
   typing does: Search applications, then Search to add more. The list under it stays on screen — a dialog of a hundred
   applications is read, not only searched — and typing narrows it; a press adds the row as a chip and empties the
   search for the next one, with the focus kept in the search.

   Keys (app-tokens.ts): Backspace in an empty search picks out the last chip and a second takes it off; ↓ goes into the
   list and ↑ from its first row comes back; Enter adds the marked best match while words are typed; Escape clears the
   words, and stops there only then, so the next Escape closes the dialog. A press anywhere in the box is a press in the
   search. The box grows with its chips to three lines and scrolls inside after that: the list gives up room, the
   dialog does not grow. */
function AppTokens({ apps, picked, onChange, takenBy, emptyNote, openInUse }: PickerProps) {
  const [q, setQ] = useState('')
  /* The applications on another policy, opened by their line. */
  const [showUsed, setShowUsed] = useState(openInUse ?? false)
  const fold = useRef<HTMLButtonElement | null>(null)
  /* Said to a screen reader after each change: "Zoom added", "Zoom removed". */
  const [said, setSaid] = useState('')
  const reduced = useReducedMotion()
  const id = useId()
  const input = useRef<HTMLInputElement | null>(null)
  const wrap = useRef<HTMLDivElement | null>(null)
  const list = useRef<HTMLUListElement | null>(null)
  /* Each chip's ×, by application, for the keys that move between them. */
  const xs = useRef(new Map<string, HTMLButtonElement>())
  /* Where the focus goes once the picks have changed: the search, a chip's × (by application), or the row now at a place. */
  const after = useRef<{ to: 'input' } | { to: 'chip'; id: string | undefined } | { to: 'row'; index: number } | null>(null)

  const chosen = apps.filter((a) => picked.includes(a.id))
  const { free, used: inUse } = tokenRows(apps, picked, takenBy, q)
  const used = SHOW_IN_USE ? inUse : []
  const typed = q.trim() !== ''
  /* Folded while nothing is typed: a search shows what it found, even there. */
  const folded = FOLD_IN_USE && !typed
  const usedOpen = !folded || showUsed
  /* What Enter adds while words are typed, marked in the list so the key is never a guess. */
  const next = typed ? free[0]?.id : undefined
  const nameOf = (appId: string) => apps.find((a) => a.id === appId)?.name ?? appId
  const ease = { duration: reduced ? 0 : 0.16, ease: [0.2, 0, 0, 1] as const }
  /* The line that opens the others is a stop on the way down the list, so the arrow keys reach it. */
  const rows = () => Array.from(list.current?.querySelectorAll<HTMLButtonElement>('button.bxl__row, button.bxt__fold') ?? [])
  const labId = `${id}-in`
  const inputId = `${id}-q`
  const addId = `${id}-add`
  const listId = `${id}-list`

  /* Into the search, without moving the page unless asked: a press far down the builder's list must not throw it back
     to the top. The box's own scroller goes to its end, where the search is. */
  const toSearch = (scroll = false) => {
    input.current?.focus({ preventScroll: !scroll })
    if (wrap.current) wrap.current.scrollTop = wrap.current.scrollHeight
  }
  /* A letter typed on a chip's × or a row goes on in the search. */
  const typeOn = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.metaKey && !e.altKey) input.current?.focus()
  }

  /* Once the picks have changed and the field has drawn them. Refs only: it reads the field as it is now. */
  useLayoutEffect(() => {
    const go = after.current
    if (!go) return
    after.current = null
    if (go.to === 'chip') {
      const x = go.id ? xs.current.get(go.id) : undefined
      if (x) return x.focus()
    }
    if (go.to === 'row') {
      const r = list.current?.querySelectorAll<HTMLButtonElement>('button.bxl__row')
      const el = r?.[Math.min(go.index, r.length - 1)]
      if (el) return el.focus()
    }
    input.current?.focus({ preventScroll: true })
    if (wrap.current) wrap.current.scrollTop = wrap.current.scrollHeight
  }, [picked])

  /* Opening brings the line to the top of the list, so what it holds is under it and not below the fold. */
  useLayoutEffect(() => {
    if (!showUsed || !fold.current || !list.current || typeof list.current.scrollTo !== 'function') return
    const top = list.current.scrollTop + fold.current.getBoundingClientRect().top - list.current.getBoundingClientRect().top
    list.current.scrollTo({ top, behavior: reduced ? 'auto' : 'smooth' })
  }, [showUsed, reduced])

  const add = (appId: string, then: { to: 'input' } | { to: 'row'; index: number } = { to: 'input' }) => {
    const s = pickInto(apps, { query: q, picked }, appId)
    after.current = then
    setQ(s.query)
    onChange(s.picked)
    setSaid(`${nameOf(appId)} added`)
  }
  /* 'next': the chip after it takes the focus, else the search. */
  const remove = (appId: string, then: 'input' | 'next') => {
    after.current = then === 'next' ? { to: 'chip', id: chosen[chosen.findIndex((a) => a.id === appId) + 1]?.id } : { to: 'input' }
    onChange(takeOut({ query: q, picked }, appId).picked)
    setSaid(`${nameOf(appId)} removed`)
  }

  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return
    const act = fieldKey(e.key, { query: q, picked: chosen.map((a) => a.id) }, next)
    if (!act) return
    e.preventDefault()
    if (act.do === 'clear') {
      /* The words go and the key stops here, so the dialog round the field stays open. */
      e.stopPropagation()
      setQ('')
    } else if (act.do === 'add') add(act.id)
    else if (act.do === 'focus-chip') xs.current.get(chosen[act.index].id)?.focus()
    else rows()[0]?.focus()
  }
  const onListKey = (e: KeyboardEvent<HTMLUListElement>) => {
    const r = rows()
    const at = r.indexOf(document.activeElement as HTMLButtonElement)
    if (at < 0) return
    const act = listKey(e.key, at, r.length)
    if (!act) return typeOn(e)
    e.preventDefault()
    if (act.do === 'focus-input') toSearch(true)
    else r[act.index]?.focus()
  }
  /* A press on the box, a chip's name or the glass is a press in the search; the ×s and the search take their own, and
     so does the box's scrollbar. */
  const onBoxDown = (e: MouseEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement
    if (t === input.current || t.closest('button')) return
    if (t === wrap.current && e.nativeEvent.offsetX >= wrap.current.clientWidth) return
    e.preventDefault()
    toSearch()
  }

  const placeholder = chosen.length > 0 ? MORE : 'Search applications'
  return (
    <div className="bxc">
      <span className="u-sr-only" role="status" aria-live="polite">
        {said}
      </span>
      <div className="bxc__part">
        <label className="bxc__lab" id={labId} htmlFor={inputId}>
          In this policy
        </label>
        <div className="bxt" onMouseDown={onBoxDown}>
          <span className="bxt__ico" aria-hidden>
            <Search size={14} strokeWidth={2} />
          </span>
          <motion.div ref={wrap} layoutScroll className="bxt__wrap" role="group" aria-labelledby={labId}>
            <AnimatePresence initial={false} mode="popLayout">
              {chosen.map((a, i) => (
                <motion.span
                  key={a.id}
                  layout={reduced ? false : 'position'}
                  className="bxt__chip"
                  title={a.name}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={ease}
                >
                  <AppLogo appId={a.id} name={a.name} size={16} />
                  <span className="bxt__name">{a.name}</span>
                  <button
                    ref={(el) => {
                      if (el) xs.current.set(a.id, el)
                      else xs.current.delete(a.id)
                    }}
                    type="button"
                    className="bxt__x"
                    aria-label={`Remove ${a.name}`}
                    /* The press keeps the focus where it was (the search), so the field does not flicker. */
                    onMouseDown={(e) => e.preventDefault()}
                    /* From the keyboard (no press count), the focus goes on to the next chip; from a pointer, the search. */
                    onClick={(e) => remove(a.id, e.detail === 0 ? 'next' : 'input')}
                    onKeyDown={(e) => {
                      const act = chipKey(e.key, i, chosen.length)
                      if (!act) return typeOn(e)
                      e.preventDefault()
                      if (act.do === 'remove') remove(chosen[act.index].id, act.then)
                      else if (act.do === 'focus-chip') xs.current.get(chosen[act.index].id)?.focus()
                      else toSearch(true)
                    }}
                  >
                    <X size={12} strokeWidth={2.4} aria-hidden />
                  </button>
                </motion.span>
              ))}
            </AnimatePresence>
            <motion.input
              ref={input}
              id={inputId}
              layout={reduced ? false : 'position'}
              transition={ease}
              type="text"
              className="bxt__input"
              value={q}
              size={placeholder.length}
              placeholder={placeholder}
              aria-label="Search applications"
              aria-controls={listId}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onSearchKey}
            />
          </motion.div>
        </div>
        {chosen.length === 0 && emptyNote}
      </div>
      <div className="bxc__part is-list">
        <p className="bxc__lab" id={addId}>
          Applications to add
        </p>
        <ul ref={list} id={listId} className="bxl__list bxc__list" aria-labelledby={addId} onKeyDown={onListKey}>
          {free.length === 0 &&
            used.length === 0 &&
            (typed ? (
              <li className="bxt__miss">
                <NoMatches
                  compact
                  noun="applications"
                  query={q}
                  onClear={() => {
                    setQ('')
                    toSearch(true)
                  }}
                />
              </li>
            ) : (
              /* Every application is a chip in the field: the list's own end, not a search miss. */
              <li className="bxc__done">
                <span className="bxc__donemark">
                  <Check size={18} strokeWidth={2.4} aria-hidden />
                </span>
                <b>Every application is in this policy</b>
              </li>
            ))}
          {free.map((a, i) => (
            <li key={a.id}>
              <button
                type="button"
                className={`bxl__row${a.id === next ? ' is-next' : ''}`}
                aria-label={`Add ${a.name}`}
                /* From the keyboard while browsing, the focus stays in the list on the row that moved up; otherwise the
                   search keeps it, for the next one. */
                onClick={(e) => add(a.id, e.detail === 0 && !typed ? { to: 'row', index: i } : { to: 'input' })}
              >
                <AppLogo appId={a.id} name={a.name} size={24} />
                <b>{a.name}</b>
                <span className="bxc__add">
                  <Plus size={14} strokeWidth={2.2} aria-hidden />
                  Add
                </span>
              </button>
            </li>
          ))}
          {used.length > 0 &&
            (folded ? (
              <li className="bxt__sep is-fold">
                <button ref={fold} type="button" className="bxt__fold" aria-expanded={showUsed} onClick={() => setShowUsed((v) => !v)}>
                  In use on another policy · {used.length}
                  <motion.span className="bxt__chev" aria-hidden initial={false} animate={{ rotate: showUsed ? 180 : 0 }} transition={ease}>
                    <ChevronDown size={14} strokeWidth={2} />
                  </motion.span>
                </button>
              </li>
            ) : (
              <li className="bxt__sep" aria-hidden>
                In use on another policy
              </li>
            ))}
          {usedOpen &&
            used.map(({ app: a, owner }) => (
              <motion.li key={a.id} initial={folded ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={ease}>
                {/* Off, not gone: one application, one sign-in policy. Focusable, so the reason is read. */}
                <button type="button" className="bxl__row is-used" aria-disabled="true" aria-label={`${a.name}, in use on ${owner}`} title={`In use on ${owner}`}>
                  <AppLogo appId={a.id} name={a.name} size={24} />
                  <b>{a.name}</b>
                  <em>{owner}</em>
                </button>
              </motion.li>
            ))}
        </ul>
      </div>
    </div>
  )
}
