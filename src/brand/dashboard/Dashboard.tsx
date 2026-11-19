import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Check, LayoutDashboard, LayoutTemplate, Plus, Redo2, RotateCcw, Settings2, Undo2 } from 'lucide-react'
import { PageHead } from '../Shell'
import { EmptyState } from '../empty'
import { Button, IconButton, Modal, RowMenu, Tabs, type MenuItem } from '../kit'
import { Picker } from '../picker'
import { PageBar } from '../screens/page-bar'
import { useBrand } from '../store'
import { Board, type BoardHandle } from './Board'
import { Gallery, type GalleryMode } from './Gallery'
import { Library } from './Library'
import { ArrangeMenu, ThemePicker } from './ThemeMenus'
import { useMigrationOpen } from './format'
import { addWidget, arrange, findCell, fromSpecs, hasWidget, removeCell, removeRow, type ArrangeMode, type Cell, type Row } from './layout'
import {
  RANGES,
  WIDGETS,
  activeBoard,
  addBoard,
  applyTemplate,
  currentDash,
  duplicateBoard,
  removeBoard,
  renameBoard,
  saveAsTemplate,
  useDash,
  withRows,
  withTheme,
  type DashTemplate,
  type Range,
  type WidgetId,
} from './model'
import { BLANK_ID, OVERVIEW, XECURIFY_TEMPLATES } from './templates'
import { THEMES, type ThemeId } from './themes'

/* -----------------------------------------------------------------------------
   The new Dashboard (rebuilt 18 Nov 2026; rows and themes, 19 Nov).

   The page is the console's own shape: the head, the admin's dashboards as
   line tabs under it, then one bar. Out of Customize the bar holds the time
   range every widget follows; in it, the bar holds what Customize does:
   · Add widgets opens the library beside the board;
   · Arrange lays the widgets out again by a rule;
   · Theme recolours them;
   · Layouts swaps the whole layout for a template;
   · every change holds at once and can be undone (Ctrl+Z, the bar's arrows,
     a toast's Undo); Cancel puts the dashboard back as Customize found it,
     Reset puts it back as its template made it, and Done leaves the mode.
   -------------------------------------------------------------------------- */

type Naming = { kind: 'rename' | 'template'; value: string }
type Snap = { rows: Row[]; theme: ThemeId }

const ARRANGED: Record<ArrangeMode, string> = { tidy: 'Tidied up', type: 'Arranged by type', need: 'Arranged by need' }

export function Dashboard({ switches }: { switches?: ReactNode }) {
  const store = useBrand()
  const [prefs, set] = useDash()
  const board = activeBoard(prefs)
  const rows = board.rows
  const theme = board.theme
  const range = prefs.range
  const mig = useMigrationOpen()
  /* While the move is open the Migration strip stays where its dashboard put it: first. */
  const pinnedRow = mig.open && rows[0]?.columns.some((c) => c.cells.some((x) => x.widget === 'migration')) ? rows[0].id : null

  const [editing, setEditing] = useState(false)
  const [library, setLibrary] = useState(false)
  const [gallery, setGallery] = useState<GalleryMode | null>(null)
  const [naming, setNaming] = useState<Naming | null>(null)
  const [building, setBuilding] = useState(true)
  const [hint, setHint] = useState(false)
  const [said, setSaid] = useState('')
  const boardRef = useRef<BoardHandle>(null)
  const page = useRef<HTMLDivElement>(null)

  /* The edit session: how the dashboard was when Customize began, and what was done since. */
  const entered = useRef<Snap | null>(null)
  const past = useRef<Snap[]>([])
  const future = useRef<Snap[]>([])
  const [, redraw] = useState(0)

  /* Widgets arrive one after another when a dashboard opens or is built. */
  const build = useCallback(() => {
    setBuilding(true)
    const t = window.setTimeout(() => setBuilding(false), 1100)
    return () => window.clearTimeout(t)
  }, [])
  useEffect(() => build(), [build, board.id])

  /* First visit: the gallery opens over the dashboard. */
  useEffect(() => {
    if (!prefs.seen) setGallery('first')
  }, [prefs.seen])

  /* The board as it is this moment, and putting one back: read from the store, so a toast's Undo that runs after
     later renders still finds the right board. */
  const snap = useCallback((): Snap => {
    const b = activeBoard(currentDash())
    return { rows: b.rows, theme: b.theme }
  }, [])
  const restore = useCallback((s: Snap) => set((p) => withTheme(withRows(p, s.rows), s.theme)), [set])
  const remember = () => {
    past.current.push(snap())
    future.current = []
    redraw((n) => n + 1)
  }
  const put = (next: Row[]) => set((p) => withRows(p, next, board.id))
  const commit = (next: Row[], text = '') => {
    remember()
    put(next)
    if (text) setSaid(text)
  }
  const undo = useCallback(() => {
    const prev = past.current.pop()
    if (!prev) return
    future.current.push(snap())
    restore(prev)
    setSaid('Undone')
    redraw((n) => n + 1)
  }, [snap, restore])
  const redo = useCallback(() => {
    const next = future.current.pop()
    if (!next) return
    past.current.push(snap())
    restore(next)
    setSaid('Done again')
    redraw((n) => n + 1)
  }, [snap, restore])

  const enter = (withLibrary = false) => {
    entered.current = snap()
    past.current = []
    future.current = []
    setEditing(true)
    setLibrary(withLibrary)
    setHint(false)
  }
  const leave = () => {
    setEditing(false)
    setLibrary(false)
    entered.current = null
  }
  const cancel = () => {
    if (entered.current) restore(entered.current)
    leave()
  }

  /* Ctrl+Z and Ctrl+Shift+Z (or Ctrl+Y) while customizing, unless a field has the keys. */
  useEffect(() => {
    if (!editing) return
    const key = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      const k = e.key.toLowerCase()
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [editing, undo, redo])

  /* ---- widgets ---- */

  const cellName = (c: Pick<Cell, 'widget'>) => WIDGETS[c.widget].name
  const remove = (c: Cell) => {
    commit(removeCell(rows, c.id), `${cellName(c)} removed`)
    store.showToast(`${cellName(c)} removed`, { label: 'Undo', run: undo })
  }
  const dropRow = (r: Row) => {
    commit(removeRow(rows, r.id), 'Row removed')
    store.showToast(r.columns.length === 1 && r.columns[0].cells.length === 1 ? `${cellName(r.columns[0].cells[0])} removed` : 'Row removed', { label: 'Undo', run: undo })
  }
  const add = (w: WidgetId) => {
    const r = addWidget(rows, w)
    commit(r.rows, `${WIDGETS[w].name} added`)
    /* Bring the new widget into view once it is on the page. */
    window.setTimeout(() => page.current?.querySelector(`[data-cell="${r.id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 80)
  }
  const patch = (id: string, p: Partial<Pick<Cell, 'view' | 'pick'>>) => {
    const at = findCell(rows, id)
    if (!at) return
    put(rows.map((r, ri) => (ri !== at.r ? r : { ...r, columns: r.columns.map((c, ci) => (ci !== at.c ? c : { ...c, cells: c.cells.map((x, k) => (k === at.k ? { ...x, ...p } : x)) })) })))
  }
  const colour = (id: string, t: ThemeId | null) => {
    const next = rows.map((r) => ({ ...r, columns: r.columns.map((c) => ({ ...c, cells: c.cells.map((x) => (x.id !== id ? x : t ? { ...x, color: t } : { ...x, color: undefined })) })) }))
    commit(next, t ? `Colour set to ${THEMES[t].name}` : 'Colour follows the dashboard')
  }
  const setTheme = (t: ThemeId) => {
    if (t === theme) return
    remember()
    set((p) => withTheme(p, t))
    setSaid(`Theme set to ${THEMES[t].name}`)
  }
  const doArrange = (mode: ArrangeMode) => {
    commit(arrange(rows, mode, pinnedRow ? 'migration' : undefined), ARRANGED[mode])
    store.showToast(ARRANGED[mode], { label: 'Undo', run: undo })
  }

  /* ---- dashboards and templates ---- */

  const select = (id: string) => {
    if (id === board.id) return
    leave()
    set((p) => ({ ...p, active: id }))
  }

  const closeGallery = () => {
    setGallery(null)
    if (!prefs.seen) set((p) => ({ ...p, seen: true }))
  }

  const applyLayout = (t: DashTemplate) => {
    const mode = gallery
    const before = currentDash()
    const blank = t.id === BLANK_ID
    setGallery(null)
    if (mode === 'new') {
      leave()
      /* A blank dashboard is not called after the card that made it. */
      const name = blank ? 'New dashboard' : t.name
      set((p) => ({ ...addBoard(p, name, t), seen: true }))
      store.showToast(`${name} added`, { label: 'Undo', run: () => set((p) => ({ ...p, boards: before.boards, active: before.active })) })
    } else {
      if (editing) remember()
      set((p) => ({ ...(mode === 'first' ? renameBoard(applyTemplate(p, t), activeBoard(p).id, t.name) : applyTemplate(p, t)), seen: true }))
      if (mode === 'layout') store.showToast(`Layout set to ${t.name}`, { label: 'Undo', run: () => set((p) => ({ ...p, boards: before.boards, active: before.active })) })
    }
    build()
    if (blank) {
      /* An empty dashboard opens ready to be filled. */
      window.setTimeout(() => {
        entered.current = snap()
        past.current = []
        future.current = []
        setEditing(true)
        setLibrary(true)
      }, 0)
    } else if (!before.hinted && !editing) {
      set((p) => ({ ...p, hinted: true }))
      window.setTimeout(() => setHint(true), 1200)
    }
  }

  const reset = () => {
    const t = [...prefs.own, ...XECURIFY_TEMPLATES].find((x) => x.id === board.from) ?? OVERVIEW
    commit(fromSpecs(t.rows), `Reset to ${t.name}`)
    build()
    store.showToast(`Reset to ${t.name}`, { label: 'Undo', run: undo })
  }

  const removeOwn = (t: DashTemplate) => {
    const before = currentDash().own
    set((p) => ({ ...p, own: p.own.filter((x) => x.id !== t.id) }))
    store.showToast(`${t.name} removed from your layouts`, { label: 'Undo', run: () => set((p) => ({ ...p, own: before })) })
  }

  const menu: MenuItem[] = [
    { id: 'rename', label: 'Rename' },
    { id: 'duplicate', label: 'Duplicate' },
    { id: 'template', label: 'Save as template', disabled: rows.length === 0 },
    { id: 'delete', label: 'Delete', disabled: prefs.boards.length <= 1, divide: true },
  ]
  const onMenu = (id: string) => {
    if (id === 'rename') setNaming({ kind: 'rename', value: board.name })
    else if (id === 'template') setNaming({ kind: 'template', value: board.name })
    else if (id === 'duplicate') {
      leave()
      set((p) => duplicateBoard(p, board.id))
    } else if (id === 'delete') {
      const before = currentDash()
      leave()
      set((p) => removeBoard(p, board.id))
      store.showToast(`${board.name} deleted`, { label: 'Undo', run: () => set((p) => ({ ...p, boards: before.boards, active: before.active })) })
    }
  }
  const saveName = () => {
    if (!naming) return
    const value = naming.value.trim()
    if (!value) return
    if (naming.kind === 'rename') set((p) => renameBoard(p, board.id, value))
    else {
      set((p) => saveAsTemplate(p, value))
      store.showToast(`${value} saved to your layouts`)
    }
    setNaming(null)
  }

  const empty = rows.length === 0

  return (
    <div className="bpage bdash bdash-vars" ref={page} style={{ ['--dash-brand' as string]: prefs.brand }}>
      <PageHead title="Dashboard" caption="Your tenant at a glance." preview={switches} />

      <div className="bdash-tabs">
        <Tabs className="bx-tabs--line" name="Dashboards" value={board.id} options={prefs.boards.map((b) => ({ value: b.id, label: b.name }))} onChange={select} />
        <span className="bdash-tabs__tools">
          <IconButton icon={Plus} label="New dashboard" tone="ghost" onClick={() => setGallery('new')} />
          <RowMenu label={`Actions for ${board.name}`} items={menu} onSelect={onMenu} size="md" />
        </span>
      </div>

      <PageBar
        left={
          editing ? (
            <>
              <Button variant="neutral" icon={Plus} pressed={library} onClick={() => setLibrary((v) => !v)}>
                Add widgets
              </Button>
              <ArrangeMenu rows={rows} pinned={pinnedRow ? 'migration' : undefined} onArrange={doArrange} />
              <ThemePicker value={theme} brand={prefs.brand} onTheme={setTheme} onBrand={(c) => set((p) => ({ ...p, brand: c }))} />
              <Button variant="neutral" icon={LayoutTemplate} onClick={() => setGallery('layout')}>
                Layouts
              </Button>
              <span className="bdash-bar__undo">
                <IconButton icon={Undo2} label="Undo" tone="ghost" disabled={past.current.length === 0} onClick={undo} />
                <IconButton icon={Redo2} label="Redo" tone="ghost" disabled={future.current.length === 0} onClick={redo} />
              </span>
            </>
          ) : (
            <Picker label="Time range" prefix="Range" size="md" value={range} options={RANGES} onChange={(v) => set((p) => ({ ...p, range: v as Range }))} />
          )
        }
        right={
          editing ? (
            <>
              <Button variant="ghost" icon={RotateCcw} onClick={reset}>
                Reset
              </Button>
              <Button variant="neutral" onClick={cancel}>
                Cancel
              </Button>
              <Button variant="brand" icon={Check} onClick={leave}>
                Done
              </Button>
            </>
          ) : (
            <>
              <AnimatePresence>
                {hint && (
                  <motion.span className="bdash-hint" role="status" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
                    Customize to move, resize or add widgets
                  </motion.span>
                )}
              </AnimatePresence>
              <Button variant="neutral" icon={Settings2} onClick={() => enter()}>
                Customize
              </Button>
            </>
          )
        }
      />

      <div className={`bdash-layout${library && editing ? ' has-library' : ''}`} data-dash-theme={theme}>
        {empty && !editing ? (
          <EmptyState
            icon={LayoutDashboard}
            title="This dashboard is empty"
            action={
              <Button variant="brand" icon={Plus} onClick={() => enter(true)}>
                Add widgets
              </Button>
            }
          />
        ) : empty ? (
          <div className="bdash-empty">
            <LayoutDashboard size={24} strokeWidth={1.6} aria-hidden />
            <span>No widgets yet</span>
          </div>
        ) : (
          <Board
            ref={boardRef}
            rows={rows}
            editing={editing}
            range={range}
            theme={theme}
            brand={prefs.brand}
            pinnedRow={pinnedRow}
            building={building}
            onCommit={commit}
            onRemove={remove}
            onRemoveRow={dropRow}
            onPatch={patch}
            onColour={colour}
            onSay={setSaid}
          />
        )}
        <AnimatePresence>
          {library && editing && (
            <Library key="library" empty={empty} has={(w) => hasWidget(rows, w)} onAdd={add} onGrab={(w, e) => (empty ? undefined : boardRef.current?.startNew(w, e))} onClose={() => setLibrary(false)} />
          )}
        </AnimatePresence>
      </div>

      <p className="u-sr-only" aria-live="polite">
        {said}
      </p>

      {gallery && <Gallery mode={gallery} own={prefs.own} onUse={applyLayout} onClose={closeGallery} onRemoveOwn={removeOwn} />}

      <NameDialog naming={naming} onChange={(value) => setNaming((n) => (n ? { ...n, value } : n))} onClose={() => setNaming(null)} onSave={saveName} />
    </div>
  )
}

function NameDialog({ naming, onChange, onClose, onSave }: { naming: Naming | null; onChange: (v: string) => void; onClose: () => void; onSave: () => void }) {
  return (
    <Modal
      open={!!naming}
      onClose={onClose}
      title={naming?.kind === 'template' ? 'Save as template' : 'Rename dashboard'}
      width={480}
      footer={
        <>
          <Button variant="neutral" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="brand" onClick={onSave} disabled={!naming?.value.trim()}>
            {naming?.kind === 'template' ? 'Save' : 'Rename'}
          </Button>
        </>
      }
    >
      <label className="bdash-name">
        <span>Name</span>
        <input
          type="text"
          value={naming?.value ?? ''}
          maxLength={48}
          autoFocus
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSave()
          }}
        />
      </label>
    </Modal>
  )
}
