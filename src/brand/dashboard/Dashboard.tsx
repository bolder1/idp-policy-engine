import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Check, Ellipsis, LayoutDashboard,LayoutGrid, Moon, Plus, Redo2, RotateCcw, Rows3, Settings2, Shapes, Store, Sun, Undo2, type LucideIcon } from 'lucide-react'
import { PageHead } from '../Shell'
import { EmptyState } from '../empty'
import { Button, IconButton, Modal, RowMenu, Tabs, type MenuItem } from '../kit'
import { Picker } from '../picker'
import { PageBar } from '../screens/page-bar'
import { primeSound } from '../sound'
import { useBrand } from '../store'
import { shows } from '../rollout'
import { useTheme } from '../theme-mode'
import { checkLayout } from './check'
import type { Mark } from './tags'
import { Board, type BoardHandle } from './Board'
import { Gallery, type GalleryMode } from './Gallery'
import { Library } from './Library'
import { ThemePicker } from './ThemeMenus'
import { DASHBOARD_THEMES } from './phase'
import { useMigrationOpen } from './format'
import { BoardLoading, useBoardLoading } from './widget-state'
import { addToRow, addWidget, allCells, arrange, findCell, fromSpecs, hasWidget, removeCell, removeRow, type ArrangeMode, type Cell, type Row } from './layout'
import { withoutWithheld } from './withheld'
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
import { DashboardArt } from '../empty-art'
import { NEW_EMPTY_ART } from '../empty-art-phase'

/* -----------------------------------------------------------------------------
   The new Dashboard (rebuilt 18 Nov 2026; rows and themes, 19 Nov).

   The page is the console's own shape: the head, the admin's dashboards as
   line tabs under it, then one bar. Out of Customize the bar holds the time
   range every widget follows; in it, few controls (owner, 19 Nov 2026: "there
   are a lot of buttons … Add Widget will be the main button"):
   · they sit together in a dock at the foot of the window, always in reach
     however far down the board you are (owner, the same day: "when I go down
     I have to jump back way up … move all into an always visible place");
   · Add widgets, a soft orange button, opens the library over the board
     (Library.tsx), where widgets are added and removed;
   · Arrange is three icon buttons in a row, as Figma lays out its tidy-up and
     align: Tidy up, Group by type, Group by need, each one press with Undo;
   · Layouts has a button of its own beside Add widgets, the way into its
     gallery as Browse Xecurify templates is into the template store;
   · Undo, Redo and Reset sit on the dock itself (owner: "Undo, Redo and
     reset can come outside");
   · Cancel puts the dashboard back as Customize found it, and Done, the
     solid button, leaves.
   The page bar keeps the time range in Customize too, so nothing above the
   board moves when the mode changes.
   Every change holds at once and can be undone (Ctrl+Z, the menu, a toast's
   Undo). Themes are behind DASHBOARD_THEMES (phase.ts), off for now.
   -------------------------------------------------------------------------- */

type Naming = { kind: 'rename' | 'template'; value: string }

/** The Light / Dark switch for the board itself, and the check of every layout kept (rollout.ts dashboardGrid). */
const GRID = shows('dashboardGrid')
/** The 22 Nov audit fixes (rollout.ts dashboardPolish): the page carries `data-polish` and dashboard.css scopes them to it. */
const POLISH = shows('dashboardPolish')
type Snap = { rows: Row[]; theme: ThemeId }

/* On Design the widgets' sections are topics (model.ts CATEGORIES), so grouping by them says topic, not need. */
const ARRANGED: Record<ArrangeMode, string> = { tidy: 'Tidied up', type: 'Arranged by type', need: POLISH ? 'Arranged by topic' : 'Arranged by need' }

export function Dashboard({ switches }: { switches?: ReactNode }) {
  const store = useBrand()
  const still = useReducedMotion() === true
  const [prefs, set] = useDash()
  const board = activeBoard(prefs)
  /* Same array back when nothing is withheld, so memos keyed on rows still hold (withheld.ts). */
  const rows = withoutWithheld(board.rows)
  const theme = board.theme
  const range = prefs.range
  /* The board looks loading on its first paint and after a Range change (states.tsx, Design only). */
  const loading = useBoardLoading(range)
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
  /* The widget just added or moved, which wears a New or Moved tag in Customize until the next change (tags.ts). */
  const [mark, setMark] = useState<Mark | null>(null)
  /* The row whose Add here opened the library: what is added goes there (Board.tsx). */
  const [slot, setSlot] = useState<{ id: string; label: string } | null>(null)
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
  const commit = (next: Row[], text = '', moved?: string) => {
    setMark(moved ? { id: moved, kind: 'moved' } : null)
    /* Every layout kept is checked (check.ts); in development a broken one says so, with what is wrong. */
    if (GRID && import.meta.env.DEV) {
      const wrong = checkLayout(next)
      if (wrong.length) console.warn('Dashboard layout:', wrong.map((w) => w.text))
    }
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

  /* Sounds are made ready at a quiet moment after the press that opened Customize or the library, so the first toast does
     not stall the glide it arrives with (sound.ts primeSound). */
  const openLibrary = () => {
    primeSound()
    setLibrary(true)
  }
  const enter = (withLibrary = false) => {
    primeSound()
    entered.current = snap()
    past.current = []
    future.current = []
    setEditing(true)
    setLibrary(withLibrary)
    setHint(false)
  }
  const leave = () => {
    setEditing(false)
    setMark(null)
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
  /* The widget last added from the library, brought into view when the library closes. */
  const added = useRef<string | null>(null)
  const add = (w: WidgetId) => {
    const into = slot ? addToRow(rows, slot.id, w) : null
    const r = into ?? addWidget(rows, w)
    commit(r.rows, `${WIDGETS[w].name} added`)
    setMark({ id: r.id, kind: 'new' })
    added.current = r.id
    store.showToast(`${WIDGETS[w].name} added`, { label: 'Undo', run: undo })
    /* One widget per Add here: the library closes and the board shows where it went. */
    if (slot) closeLibrary()
  }
  const closeLibrary = () => {
    setLibrary(false)
    setSlot(null)
    const id = added.current
    added.current = null
    if (id) window.setTimeout(() => page.current?.querySelector(`[data-cell="${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 220)
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
  /* Taken off from the library: the first place it is on the board. */
  const removeWidget = (w: WidgetId) => {
    const cell = allCells(rows).find((c) => c.widget === w)
    if (cell) remove(cell)
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
        openLibrary()
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

  const resetTo = [...prefs.own, ...XECURIFY_TEMPLATES].find((x) => x.id === board.from) ?? OVERVIEW
  /* Arrange as three icon buttons in a row, the way Figma lays out its tidy-up and align (owner, same day: "something
     like how Figma … three icon buttons to tidy up properly"). Each is one press with Undo; its name is its tooltip. */
  const ARRANGE: { mode: ArrangeMode; label: string; icon: LucideIcon }[] = [
    { mode: 'tidy', label: 'Tidy up', icon: LayoutGrid },
    { mode: 'type', label: 'Group by type', icon: Shapes },
    { mode: 'need', label: POLISH ? 'Group by topic' : 'Group by need', icon: Rows3 },
  ]

  const empty = rows.length === 0

  /* The dock's More, in a narrow window: what the wide dock shows as Layouts and the three arrange icons. */
  const dockMore: MenuItem[] = [
    { id: 'layouts', label: 'Layouts', icon: Store },
    ...ARRANGE.map((a, i) => ({ id: a.mode, label: a.label, icon: a.icon, disabled: empty, divide: i === 0 })),
  ]
  const onDockMore = (id: string) => {
    if (id === 'layouts') setGallery('layout')
    else doArrange(id as ArrangeMode)
  }
  /* Stable for a layout, so the board works out which rows have room once per change, not on every render. */
  const onBoard = useCallback((w: WidgetId) => hasWidget(rows, w), [rows])
  /* The console's own dark theme makes the board dark too; then the board's switch has nothing to do and is not shown. */
  const [consoleTheme] = useTheme()
  const night = GRID && (prefs.look === 'dark' || consoleTheme === 'dark')
  /* Popups open outside the page: while the night board shows, the document says so and they follow (dashboard.css). */
  useEffect(() => {
    if (!night) return
    const root = document.documentElement
    root.setAttribute('data-dash-look', 'dark')
    return () => root.removeAttribute('data-dash-look')
  }, [night])
  const lookSwitch =
    GRID && consoleTheme !== 'dark' ? (
      <IconButton
        icon={prefs.look === 'dark' ? Sun : Moon}
        label={prefs.look === 'dark' ? 'Light board' : 'Dark board'}
        tone="ghost"
        onClick={() => set((p) => ({ ...p, look: p.look === 'dark' ? 'light' : 'dark' }))}
      />
    ) : null

  const rangePicker = <Picker label="Time range" prefix="Range" size="md" value={range} options={RANGES} onChange={(v) => set((p) => ({ ...p, range: v as Range }))} />
  const barRight = editing ? (
    lookSwitch
  ) : (
    <>
      {lookSwitch}
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

  return (
    <div className="bpage bdash bdash-vars" ref={page} data-look={night ? 'dark' : undefined} data-polish={POLISH ? '' : undefined} style={{ ['--dash-brand' as string]: prefs.brand }}>
      <PageHead title="Dashboard" caption="Your tenant at a glance." preview={switches} />

      <div className="bdash-tabs">
        <Tabs className="bx-tabs--line" name="Dashboards" value={board.id} options={prefs.boards.map((b) => ({ value: b.id, label: b.name }))} onChange={select} />
        <span className="bdash-tabs__tools">
          <IconButton icon={Plus} label="New dashboard" tone="ghost" onClick={() => setGallery('new')} />
          <RowMenu label={`Actions for ${board.name}`} items={menu} onSelect={onMenu} size="md" />
        </span>
        {/* One band instead of two (dashboardPolish): the range, the board's look and Customize ride the tabs row. */}
        {POLISH && (
          <span className="bdash-tabs__bar">
            {rangePicker}
            {barRight}
          </span>
        )}
      </div>

      {!POLISH && <PageBar left={rangePicker} right={barRight} />}

      <div className="bdash-layout" data-dash-theme={DASHBOARD_THEMES ? theme : 'mono'}>
        {empty && !editing ? (
          <EmptyState
            art={NEW_EMPTY_ART && <DashboardArt />} icon={LayoutDashboard}
            title="This dashboard is empty"
            action={
              <Button variant="brand" icon={Plus} onClick={openLibrary}>
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
          <BoardLoading value={loading}>
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
            mark={mark}
            onAddHere={(r, i) => {
              setSlot({ id: r.id, label: `row ${i + 1}` })
              openLibrary()
            }}
            onBoard={onBoard}
          />
          </BoardLoading>
        )}
      </div>

      {/* Customize's controls, together and always in reach. The dock is sticky, not fixed: it rides the foot of the window
          while the board scrolls under it and comes to rest under the board at the end, so it never covers a widget. */}
      <AnimatePresence>
        {editing && (
          <div className="bdash-dock" key="dock">
            <motion.div
              className="bdash-dock__bar"
              role="toolbar"
              aria-label="Customize"
              initial={still ? false : { y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={still ? { opacity: 0, transition: { duration: 0 } } : { y: 16, opacity: 0, transition: { duration: 0.14 } }}
              transition={{ type: 'spring', stiffness: 520, damping: 38 }}
            >
              {POLISH ? (
                /* The dock as three groups on frosted glass (owner, 23 Nov 2026: "try glassmorphism for this bar and
                   rethink this"): build on the left, arrange and history on one tray, finish on the right. */
                <>
                  <span className="bdash-dock__group">
                    <span className="bdash-dock__add">
                      <Button variant="neutral" icon={Plus} onClick={openLibrary}>
                        Add widgets
                      </Button>
                    </span>
                    <span className="bdash-dock__more">
                      <RowMenu label="More" icon={Ellipsis} size="md" align="start" items={dockMore} onSelect={onDockMore} />
                    </span>
                    <span className="bdash-dock__wide">
                      <Button variant="neutral" icon={Store} onClick={() => setGallery('layout')}>
                        Layouts
                      </Button>
                    </span>
                    {DASHBOARD_THEMES && <ThemePicker value={theme} brand={prefs.brand} onTheme={setTheme} onBrand={(c) => set((p) => ({ ...p, brand: c }))} />}
                  </span>
                  <span className="bdash-dock__tray">
                    <span className="bdash-dock__wide">
                      <span className="bdash-dock__set" role="group" aria-label="Arrange">
                        {ARRANGE.map((a) => (
                          <IconButton key={a.mode} icon={a.icon} label={a.label} tone="ghost" disabled={empty} onClick={() => doArrange(a.mode)} />
                        ))}
                      </span>
                      <span className="bdash-dock__hair" aria-hidden />
                    </span>
                    <span className="bdash-dock__set" role="group" aria-label="History">
                      <IconButton icon={Undo2} label="Undo (Ctrl+Z)" tone="ghost" disabled={past.current.length === 0} onClick={undo} />
                      <IconButton icon={Redo2} label="Redo (Ctrl+Y)" tone="ghost" disabled={future.current.length === 0} onClick={redo} />
                      <IconButton icon={RotateCcw} label={`Reset to ${resetTo.name}`} tone="ghost" onClick={reset} />
                    </span>
                  </span>
                  <span className="bdash-dock__group">
                    <Button variant="ghost" onClick={cancel}>
                      Cancel
                    </Button>
                    <Button variant="brand" icon={Check} onClick={leave}>
                      Done
                    </Button>
                  </span>
                </>
              ) : (
                <>
              <span className="bdash-dock__add">
                <Button variant="neutral" icon={Plus} onClick={openLibrary}>
                  Add widgets
                </Button>
              </span>
              {/* Layouts has a button of its own, the way into a store, as the policy templates page has Browse Xecurify
                  templates (owner, 19 Nov 2026: "a dedicated button for layout, as a dedicated marketplace or template
                  like button"). */}
              <Button variant="neutral" icon={Store} onClick={() => setGallery('layout')}>
                Layouts
              </Button>
              {DASHBOARD_THEMES && <ThemePicker value={theme} brand={prefs.brand} onTheme={setTheme} onBrand={(c) => set((p) => ({ ...p, brand: c }))} />}
              <span className="bdash-dock__sep" aria-hidden />
              <span className="bdash-dock__tidy" role="group" aria-label="Arrange">
                {ARRANGE.map((a) => (
                  <IconButton key={a.mode} icon={a.icon} label={a.label} tone="ghost" disabled={empty} onClick={() => doArrange(a.mode)} />
                ))}
              </span>
              <span className="bdash-dock__sep" aria-hidden />
              <IconButton icon={Undo2} label="Undo (Ctrl+Z)" tone="ghost" disabled={past.current.length === 0} onClick={undo} />
              <IconButton icon={Redo2} label="Redo (Ctrl+Y)" tone="ghost" disabled={future.current.length === 0} onClick={redo} />
              <Button variant="ghost" icon={RotateCcw} title={`Reset to ${resetTo.name}`} onClick={reset}>
                Reset
              </Button>
              <span className="bdash-dock__sep" aria-hidden />
              <Button variant="ghost" onClick={cancel}>
                Cancel
              </Button>
              <Button variant="brand" icon={Check} onClick={leave}>
                Done
              </Button>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <Library
        open={library}
        empty={empty}
        has={onBoard}
        onAdd={add}
        onRemove={removeWidget}
        onClose={closeLibrary}
        row={slot ? { label: slot.label, fits: (w) => addToRow(rows, slot.id, w) !== null } : null}
        theme={DASHBOARD_THEMES ? theme : 'mono'}
      />

      <p className="u-sr-only" aria-live="polite">
        {said}
      </p>

      <Gallery mode={gallery} own={prefs.own} onUse={applyLayout} onClose={closeGallery} onRemoveOwn={removeOwn} />

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
