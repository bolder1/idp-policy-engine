import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  KeyRound,
  Minus,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  UserPlus,
  UserRoundCheck,
  UserX,
} from 'lucide-react'

import { Badge, Button, DeleteButton, Drawer, Modal, RowMenu, SearchBox, Tabs, type MenuItem } from '../kit'
import { Picker } from '../picker'
import { EmptyState, NoMatches } from '../empty'
import { useLeaveGuard } from '../leave-guard'
import { useBrand, type DisplayTokenTab } from '../store'
import {
  DISPLAY_TOKEN_METHOD_ID,
  canSync,
  deleteBlocker,
  emptyDraft,
  formatDay,
  parseAssignmentCsv,
  parseTokenCsv,
  serialKey,
  syncErrors,
  tokenErrors,
  tokenFromDraft,
  tokenType,
  unassigned,
  type HardwareToken,
  type TokenDraft,
  type TokenField,
} from '../hardware-tokens'
import { ConfirmDelete } from './confirm-delete'
import { ListPager } from './list-pager'
import { usePagedList } from './paged-list'
import {
  AddTokenForm,
  AssignForm,
  DiscardDialog,
  SyncForm,
  UploadForm,
  type UploadMode,
  type UploadPreview,
} from './display-token-forms'
import {
  TOKEN_FILTERS,
  actedToast,
  assignedToast,
  assignmentsEmpty,
  assignmentsOf,
  filterAssignments,
  filterTokens,
  groupPairs,
  importSummary,
  leavesNobody,
  namesBrief,
  plural,
  selectionPlan,
  toggleAll,
  toggleSelected,
  withSkips,
  type Assignment,
  type TokenFilter,
} from './display-tokens-model'

/* -----------------------------------------------------------------------------
   Display tokens — the live console's "Assign Hardware Token To Users" page.

   A page of its own, reached from Authentication methods (Display Token's Set
   up or Manage tokens, and Hardware Token's "Assign hardware tokens" setting).
   It was a list inside that slider, with every step pushed over it as another
   page, until the owner asked for the console's page back (15 Sep 2026): the
   job is big enough to want the whole width, and a slider stacked four deep
   hid where you were.

   The console's function, all of it, in this console's shapes:

     Assignments       one row per token held — who, and which token. Unassign
                       one or many, sync a Feitian C100, assign more by hand or
                       from a CSV.
     Token management  the inventory. Add one, upload a CSV, assign one from its
                       row, delete what nobody holds.

   Lists rather than tables, because each row is read one object at a time; and
   sliders rather than the console's modals, so the list stays in view beside
   the form that is changing it. Changes commit at once, as they do in the
   console, with a confirmation before anything is taken away.

   Every draft lives here, not in the sliders: the store holds one leave guard,
   and it has to know what an open slider would lose.
   -------------------------------------------------------------------------- */

type Slider =
  /* `back`: pushed from Assign tokens, whose empty state ("Every token is
     assigned") offers Add token. A page in that slider with Back, not a
     replacement for it — adding returns to Assign with the new tokens picked
     (15 Sep 2026). */
  | { kind: 'add'; back?: 'assign' }
  /* `serials`: arrives with these picked — a token row's Assign, or the tokens
     just added on a pushed Add token. */
  | { kind: 'assign'; serials?: string[] }
  | { kind: 'upload'; mode: UploadMode }
  | { kind: 'sync'; serial: string }

type Confirm = { kind: 'unassign'; serials: string[] }

/** Fixed row height of both lists, matching `.bdt__list`. */
const ROW_H = 64

const TABS: { value: DisplayTokenTab; label: string; icon: typeof KeyRound }[] = [
  { value: 'assignments', label: 'Assignments', icon: UserRoundCheck },
  { value: 'tokens', label: 'Token management', icon: KeyRound },
]

const sliderTitle = (s: Slider): string =>
  s.kind === 'add'
    ? 'Add token'
    : s.kind === 'assign'
      ? 'Assign tokens'
      : s.kind === 'sync'
        ? 'Sync token'
        : s.mode === 'tokens'
          ? 'Upload tokens'
          : 'Upload assignments'

const PANEL_ID = 'bdt-panel'

/* Row menu items shared by both lists, with the icons every other row menu in
   the console carries. Unassign is red in both: it stops somebody signing in. */
const ASSIGN_ITEM: MenuItem = { id: 'assign', label: 'Assign', icon: UserPlus }
const SYNC_ITEM: MenuItem = { id: 'sync', label: 'Sync', icon: RefreshCw }
const UNASSIGN_ITEM: MenuItem = { id: 'unassign', label: 'Unassign', icon: UserX, danger: true }

/* Where focus goes when the control that had it is gone — a deleted row's menu,
   the last row a filter hid. Select all, the search, then the empty state's
   first button, then the page heading; never <body>. After a tick, so a closing
   dialog's own restore runs first and this only steps in where that found
   nothing.

   One selector at a time, in that order. A single comma-separated selector
   returns the first match in the DOCUMENT, which is always the heading. */
const LANDING = ['.bdt__check--all', '.bx-search input', '.bempty__action button', 'h1']
function landFocus() {
  window.setTimeout(() => {
    const active = document.activeElement
    const lost = !active || active === document.body || !active.isConnected || !!active.closest('.bx-modal')
    if (!lost) return
    const root = document.querySelector('.bdt')
    for (const sel of LANDING) {
      const el = root?.querySelector<HTMLElement>(sel)
      if (el) {
        el.focus({ preventScroll: true })
        return
      }
    }
  }, 0)
}

/* Focus inside the Assign tokens slider: the person picker, or — when that was
   the last free token and the form is "Every token is assigned", with only
   Cancel in its footer — the empty state's Add token, and failing that the
   slider itself. Never <body>. `onlyIfLost` leaves focus that already landed. */
function focusAssign(personRef: RefObject<HTMLDivElement | null>, onlyIfLost = false) {
  window.setTimeout(() => {
    const active = document.activeElement
    if (onlyIfLost && active && active !== document.body && active.isConnected) return
    const next =
      personRef.current?.querySelector<HTMLElement>('button') ??
      document.querySelector<HTMLElement>('.bx-drawer .bempty__action button') ??
      document.querySelector<HTMLElement>('.bx-drawer')
    next?.focus({ preventScroll: true })
  }, 0)
}

export function DisplayTokensPage({ tab }: { tab: DisplayTokenTab }) {
  const store = useBrand()
  const tokens = store.hardwareTokens
  const users = store.users
  const methodOn = !!store.methods.find((m) => m.id === DISPLAY_TOKEN_METHOD_ID)?.active

  const heading = useRef<HTMLHeadingElement | null>(null)
  /* Arriving from Authentication methods, the button that brought you here has
     unmounted and focus is on <body>. The heading takes it, as a zone page's
     does when it opens. */
  useEffect(() => {
    if (!document.activeElement || document.activeElement === document.body) heading.current?.focus({ preventScroll: true })
  }, [])

  /* --- The lists' own state, kept across tab switches ----------------------------- */

  const [aq, setAq] = useState('')
  const [aSelected, setASelected] = useState<string[]>([])
  const [tq, setTq] = useState('')
  const [filter, setFilter] = useState<TokenFilter>('all')
  const [tSelected, setTSelected] = useState<string[]>([])
  const dropSelected = (serials: readonly string[]) => {
    const gone = new Set(serials.map(serialKey))
    const keep = (cur: string[]) => cur.filter((s) => !gone.has(serialKey(s)))
    setASelected(keep)
    setTSelected(keep)
  }

  /* --- Sliders -------------------------------------------------------------------- */

  const [slider, setSlider] = useState<Slider | null>(null)
  /* The Discard / Keep editing question, and what Discard then does: close the
     slider, or step back from a pushed Add token to Assign tokens. */
  const [asking, setAsking] = useState<'close' | 'back' | null>(null)

  // Add.
  const [draft, setDraft] = useState<TokenDraft>(emptyDraft)
  /** Serials saved on a pushed Add token, picked on the way back to Assign. */
  const [addedHere, setAddedHere] = useState<string[]>([])
  const [touched, setTouched] = useState<TokenField[]>([])
  const [addTried, setAddTried] = useState(false)
  const addRefs = useRef<Partial<Record<TokenField, HTMLElement | null>>>({})
  const [addFocus, setAddFocus] = useState(0)

  // Assign.
  const [person, setPerson] = useState<string | null>(null)
  const [picks, setPicks] = useState<string[]>([])
  const [initialPicks, setInitialPicks] = useState<string[]>([])
  const [pickQuery, setPickQuery] = useState('')
  const [assignTried, setAssignTried] = useState(false)
  const personRef = useRef<HTMLDivElement | null>(null)

  // Upload.
  const [file, setFile] = useState<{ name: string; text: string } | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)

  // Sync.
  const [codes, setCodes] = useState<string[]>(['', '', ''])
  const [syncTried, setSyncTried] = useState(false)
  const [syncFocus, setSyncFocus] = useState(0)

  /* Every slider opens clean, and closing one clears all of them — the secret
     key above all, which hardware-tokens.ts is written never to hold on to.
     The slider animating out keeps the words it was showing: the drawer holds
     its last render while it leaves. */
  const clearDrafts = () => {
    setDraft(emptyDraft)
    setAddedHere([])
    setTouched([])
    setAddTried(false)
    setPerson(null)
    setPicks([])
    setInitialPicks([])
    setPickQuery('')
    setAssignTried(false)
    setFile(null)
    setFileError(null)
    setCodes(['', '', ''])
    setSyncTried(false)
  }
  const openSlider = (s: Slider) => {
    setAsking(null)
    clearDrafts()
    /* Taken as given. Tokens added a moment ago are not in this render's
       inventory yet; `livePicks` below drops any that are not free. */
    if (s.kind === 'assign' && s.serials) {
      setPicks(s.serials)
      setInitialPicks(s.serials)
    }
    setSlider(s)
  }
  const closeSlider = () => {
    setAsking(null)
    setSlider(null)
    clearDrafts()
    landFocus()
  }
  /* From a pushed Add token back to Assign tokens, with what was added picked.
     The Back link that had focus went with the page; the person picker takes
     it (AssignForm does that on arrival), or the empty state's button. */
  const backToAssign = (added: string[]) => {
    openSlider({ kind: 'assign', serials: added })
    focusAssign(personRef, true)
  }

  /* Add. */
  const addErrors = tokenErrors(draft, tokens)
  const firstAddError = (['serial', 'secret', 'type', 'counter'] as TokenField[]).find((f) => addErrors[f])
  /* Typed values only. The type alone is not work — Save and add another keeps
     it — and a counter under a type that has none is not shown, so not at risk. */
  const addDirty =
    !!draft.serial.trim() || !!draft.secret.trim() || (!!draft.type && tokenType(draft.type).counter && !!draft.counter.trim())

  /** The serial saved, or null when the form stopped on an error. */
  const saveAdd = (another: boolean): string | null => {
    setAddTried(true)
    const errors = tokenErrors(draft, store.hardwareTokens)
    const first = (['serial', 'secret', 'type', 'counter'] as TokenField[]).find((f) => errors[f])
    if (first) {
      const el = addRefs.current[first]
      ;(el instanceof HTMLInputElement ? el : el?.querySelector<HTMLElement>('input, button'))?.focus()
      return null
    }
    const token = tokenFromDraft(draft, formatDay(new Date()))
    store.addHardwareTokens([token])
    store.showToast(`${token.serial} added`)
    if (slider?.kind === 'add' && slider.back) setAddedHere((a) => [...a, token.serial])
    if (another) {
      // The type stays: a box of fobs is usually one model.
      setDraft({ ...emptyDraft, type: draft.type })
      setTouched([])
      setAddTried(false)
      setAddFocus((n) => n + 1)
    }
    return token.serial
  }
  /* Add token's primary button. Pushed from Assign, it goes back there with
     every token added on the way picked; otherwise it closes. */
  const finishAdd = () => {
    const serial = saveAdd(false)
    if (!serial) return
    if (slider?.kind === 'add' && slider.back) backToAssign([...addedHere, serial])
    else closeSlider()
  }
  const addBack = () => (addDirty ? setAsking('back') : backToAssign(addedHere))

  /* Assign. Picks that stopped being free (assigned in another way meanwhile) drop out. */
  const free = unassigned(tokens)
  const isFree = (s: string) => free.some((t) => serialKey(t.serial) === serialKey(s))
  const livePicks = picks.filter(isFree)
  const liveInitial = initialPicks.filter(isFree)
  const assignDirty =
    !!person ||
    livePicks.length !== liveInitial.length ||
    livePicks.some((s) => !liveInitial.some((i) => serialKey(i) === serialKey(s)))
  const assignBlocked = !person ? 'Choose a person.' : livePicks.length === 0 ? 'Choose at least one token.' : null
  const assignOffered = free.length > 0 && users.length > 0

  const saveAssign = (another: boolean): boolean => {
    setAssignTried(true)
    if (!person || livePicks.length === 0) {
      if (!person) personRef.current?.querySelector<HTMLElement>('button')?.focus()
      return false
    }
    const result = store.assignHardwareTokens(person, livePicks)
    const name = store.userById(person)?.name ?? 'this person'
    store.showToast(withSkips(result.assigned.length ? assignedToast(result.assigned, name) : null, result.skipped))
    if (another) {
      setPerson(null)
      setPicks([])
      setInitialPicks([])
      setPickQuery('')
      setAssignTried(false)
      focusAssign(personRef)
    }
    return true
  }

  /* Upload. Parsed against the inventory as it is now, not as it was when the
     file was chosen — a token added since would otherwise be imported twice. */
  const uploadMode: UploadMode = slider?.kind === 'upload' ? slider.mode : 'tokens'
  const preview = useMemo<UploadPreview | null>(() => {
    if (!file) return null
    if (uploadMode === 'tokens') {
      const r = parseTokenCsv(file.text, tokens)
      return { ready: r.ready.map((t) => ({ serial: t.serial, detail: tokenType(t.type).label })), skipped: r.skipped, error: r.error }
    }
    const r = parseAssignmentCsv(file.text, users, tokens)
    const nameOf = new Map(users.map((u) => [u.id, u.name]))
    return { ready: r.ready.map((p) => ({ serial: p.serial, detail: nameOf.get(p.userId) ?? '' })), skipped: r.skipped, error: r.error }
  }, [file, uploadMode, tokens, users])
  const ready = preview && !preview.error ? preview.ready.length : 0
  const uploadVerb = uploadMode === 'tokens' ? 'Import' : 'Assign'

  const saveUpload = (): boolean => {
    if (!file || ready === 0) return false
    if (uploadMode === 'tokens') {
      const r = parseTokenCsv(file.text, store.hardwareTokens)
      store.addHardwareTokens(r.ready)
      store.showToast(importSummary(r.ready.length, r.skipped.length, 'imported'))
    } else {
      const r = parseAssignmentCsv(file.text, store.users, store.hardwareTokens)
      let done = 0
      let skipped = r.skipped.length
      /* One call per person. The store builds each call on the one before, so
         the calls compose inside this handler. */
      for (const g of groupPairs(r.ready)) {
        const x = store.assignHardwareTokens(g.userId, g.serials)
        done += x.assigned.length
        skipped += x.skipped.length
      }
      store.showToast(importSummary(done, skipped, 'assigned'))
    }
    return true
  }

  /* Sync. */
  const syncTarget =
    slider?.kind === 'sync' ? (tokens.find((t) => serialKey(t.serial) === serialKey(slider.serial)) ?? null) : null
  const syncProblem = syncErrors(codes)
  const saveSync = (): boolean => {
    setSyncTried(true)
    if (!syncTarget || !canSync(syncTarget) || syncProblem) {
      setSyncFocus((n) => n + 1)
      return false
    }
    store.syncHardwareToken(syncTarget.serial)
    store.showToast(`${syncTarget.serial} synced`)
    return true
  }

  /* What the open slider would lose, and how the leave dialog saves it. */
  const sliderDirty =
    slider?.kind === 'add'
      ? addDirty
      : slider?.kind === 'assign'
        ? assignOffered && assignDirty
        : slider?.kind === 'upload'
          ? !!file
          : slider?.kind === 'sync'
            ? codes.some((c) => c !== '')
            : false

  useLeaveGuard({
    dirty: sliderDirty,
    save: () =>
      slider?.kind === 'add'
        ? saveAdd(false) !== null
        : slider?.kind === 'assign'
          ? saveAssign(false)
          : slider?.kind === 'upload'
            ? saveUpload()
            : slider?.kind === 'sync'
              ? saveSync()
              : false,
    saveLabel:
      slider?.kind === 'add' ? 'Add token' : slider?.kind === 'assign' ? 'Assign' : slider?.kind === 'upload' ? uploadVerb : 'Sync',
    blocked:
      slider?.kind === 'add'
        ? firstAddError
          ? (addErrors[firstAddError] ?? null)
          : null
        : slider?.kind === 'assign'
          ? assignBlocked
          : slider?.kind === 'upload'
            ? ready > 0
              ? null
              : 'Nothing in this file can be imported.'
            : slider?.kind === 'sync'
              ? syncProblem
              : null,
  })

  /* Esc, the scrim, the close button and Cancel all ask first when something
     was typed — the device profile create drawer's rule. */
  const requestClose = () => (sliderDirty ? setAsking('close') : closeSlider())
  const done = (saved: boolean) => {
    if (saved) closeSlider()
  }

  /* --- Confirmations --------------------------------------------------------------- */

  const [confirm, setConfirm] = useState<Confirm | null>(null)
  /* What a delete will remove and what it passes over, taken when the dialog
     opens and kept while it animates out — by then the tokens are gone, and a
     dialog read live would retitle itself "Delete 0 tokens?" on its way off. */
  const [del, setDel] = useState<{ deleting: string[]; kept: string[] }>({ deleting: [], kept: [] })
  const [delOpen, setDelOpen] = useState(false)
  const askDelete = (serials: string[]) => {
    const p = selectionPlan(tokens, serials)
    if (p.deletable.length === 0) return
    setDel({ deleting: p.deletable.map((t) => t.serial), kept: p.assigned.map((t) => t.serial) })
    setDelOpen(true)
  }
  const nameOf = (t: HardwareToken) => (t.userId ? (store.userById(t.userId)?.name ?? 'A user not in the directory') : '')

  const unassign = (serials: string[]) => {
    store.unassignHardwareTokens(serials)
    store.showToast(actedToast(serials, 'unassigned'))
    dropSelected(serials)
    setConfirm(null)
    landFocus()
  }
  const remove = (serials: string[]) => {
    const r = store.deleteHardwareTokens(serials)
    if (r.deleted.length) store.showToast(actedToast(r.deleted, 'deleted'))
    dropSelected(r.deleted)
    setDelOpen(false)
    landFocus()
  }

  /* --- The page -------------------------------------------------------------------- */

  const goTab = (t: DisplayTokenTab) => store.go({ name: 'display-tokens', tab: t })

  return (
    <div className="bpage bpage--compact bdt">
      <button type="button" className="bz7__back" onClick={() => store.go({ name: 'methods', from: 'display-tokens' })}>
        <ArrowLeft size={14} strokeWidth={2} aria-hidden />
        Authentication methods
      </button>

      <header className="bpage__head">
        <div className="bpage__headrow">
          <div className="bpage__title">
            <h1 ref={heading} tabIndex={-1}>
              Display tokens
            </h1>
            <p>Add hardware tokens and assign them to the people who carry them.</p>
          </div>
        </div>
      </header>

      <Tabs className="bx-tabs--line bdt__tabs" name="Display tokens" value={tab} options={TABS} onChange={goTab} panelId={PANEL_ID} />

      <div id={PANEL_ID} role="tabpanel" aria-label={TABS.find((t) => t.value === tab)?.label} className="bdt__panel">
        {tab === 'assignments' ? (
          <AssignmentsTab
            tokens={tokens}
            users={users}
            query={aq}
            onQuery={setAq}
            selected={aSelected}
            onSelected={setASelected}
            onAssign={() => openSlider({ kind: 'assign' })}
            onUpload={() => openSlider({ kind: 'upload', mode: 'assignments' })}
            onSync={(serial) => openSlider({ kind: 'sync', serial })}
            onUnassign={(serials) => setConfirm({ kind: 'unassign', serials })}
            onTokensTab={() => goTab('tokens')}
          />
        ) : (
          <TokensTab
            tokens={tokens}
            users={users}
            query={tq}
            onQuery={setTq}
            filter={filter}
            onFilter={setFilter}
            selected={tSelected}
            onSelected={setTSelected}
            onAdd={() => openSlider({ kind: 'add' })}
            onUpload={() => openSlider({ kind: 'upload', mode: 'tokens' })}
            onAssign={(serial) => openSlider({ kind: 'assign', serials: [serial] })}
            onSync={(serial) => openSlider({ kind: 'sync', serial })}
            onUnassign={(serials) => setConfirm({ kind: 'unassign', serials })}
            onDelete={askDelete}
          />
        )}
      </div>

      {/* Before the drawer, so its focus is restored first and the drawer's
          own restore, to the button that opened it, is the one that lands. */}
      <DiscardDialog
        open={asking !== null}
        title={slider?.kind === 'upload' ? 'Discard this upload?' : 'Discard what you entered?'}
        onKeep={() => setAsking(null)}
        onDiscard={() => (asking === 'back' ? backToAssign(addedHere) : closeSlider())}
      />

      <Drawer
        open={slider !== null}
        onClose={requestClose}
        title={slider ? sliderTitle(slider) : ''}
        width={560}
        actions={
          slider && (
            <SliderActions
              onCancel={requestClose}
              primary={
                slider.kind === 'add'
                  ? { label: 'Add token', run: finishAdd }
                  : slider.kind === 'assign'
                    ? assignOffered
                      ? { label: 'Assign', run: () => done(saveAssign(false)) }
                      : null
                    : slider.kind === 'upload'
                      ? {
                          label: ready > 0 ? `${uploadVerb} ${plural(ready, 'token')}` : `${uploadVerb} tokens`,
                          run: () => done(saveUpload()),
                          disabled: ready === 0,
                        }
                      : syncTarget
                        ? { label: 'Sync', run: () => done(saveSync()) }
                        : null
              }
              another={
                slider.kind === 'add'
                  ? { label: 'Save and add another', run: () => saveAdd(true) }
                  : slider.kind === 'assign' && assignOffered
                    ? { label: 'Save and assign another', run: () => saveAssign(true) }
                    : null
              }
            />
          )
        }
      >
        {/* Named for where it goes, as a pushed page's Back is in the
            Authentication methods slider. */}
        {slider?.kind === 'add' && slider.back && (
          <button type="button" className="bz7__back bdt__sliderback" onClick={addBack}>
            <ArrowLeft size={14} strokeWidth={2} aria-hidden />
            Assign tokens
          </button>
        )}
        {slider?.kind === 'add' && (
          <AddTokenForm
            draft={draft}
            onDraft={(patch) => setDraft((d) => ({ ...d, ...patch }))}
            onTouch={(f) => setTouched((t) => (t.includes(f) ? t : [...t, f]))}
            error={(f) => {
              const msg = addErrors[f]
              if (!msg) return undefined
              if (addTried) return msg
              const value = f === 'type' ? draft.type : draft[f]
              return touched.includes(f) && String(value).trim() ? msg : undefined
            }}
            refs={addRefs}
            focusTick={addFocus}
            onSubmit={finishAdd}
          />
        )}
        {slider?.kind === 'assign' && (
          <AssignForm
            tokens={tokens}
            users={users}
            person={person}
            onPerson={setPerson}
            picks={livePicks}
            onPicks={setPicks}
            query={pickQuery}
            onQuery={setPickQuery}
            tried={assignTried}
            personRef={personRef}
            onAddToken={() => openSlider({ kind: 'add', back: 'assign' })}
          />
        )}
        {slider?.kind === 'upload' && (
          <UploadForm
            mode={slider.mode}
            file={file}
            onFile={(f) => {
              setFile(f)
              setFileError(null)
            }}
            fileError={fileError}
            /* The file already chosen stays. A wrong pick while replacing it says
               so, and does not throw away a file that was ready to import. */
            onFileError={setFileError}
            preview={preview}
          />
        )}
        {slider?.kind === 'sync' && (
          <SyncForm
            token={syncTarget}
            holder={syncTarget?.userId ? (store.userById(syncTarget.userId)?.name ?? null) : null}
            codes={codes}
            onCodes={setCodes}
            error={syncTried ? syncProblem : null}
            focusTick={syncFocus}
            onSubmit={() => done(saveSync())}
          />
        )}
      </Drawer>

      <UnassignConfirm
        confirm={confirm?.kind === 'unassign' ? confirm : null}
        tokens={tokens}
        nameOf={nameOf}
        methodOn={methodOn}
        onClose={() => setConfirm(null)}
        onUnassign={unassign}
      />

      <ConfirmDelete
        open={delOpen}
        name={del.deleting.length === 1 ? del.deleting[0] : plural(del.deleting.length, 'token')}
        noun="token"
        detail={deleteDetail(del.deleting.length, del.kept)}
        onCancel={() => setDelOpen(false)}
        onConfirm={() => delOpen && remove(del.deleting)}
      />
    </div>
  )
}

/* The delete dialog's one line: what happens, and which selected tokens it
   passes over because somebody holds them. */
function deleteDetail(deleting: number, kept: readonly string[]): string {
  const head = deleting === 1 ? 'It is removed from the inventory.' : 'They are removed from the inventory.'
  if (kept.length === 0) return head
  return `${head} ${kept.length === 1 ? `${kept[0]} is assigned, so it stays.` : `${plural(kept.length, 'assigned token')} stay.`}`
}

/* --- Slider footer ---------------------------------------------------------------------- */

function SliderActions({
  onCancel,
  primary,
  another,
}: {
  onCancel: () => void
  primary: { label: string; run: () => void; disabled?: boolean } | null
  another: { label: string; run: () => void } | null
}) {
  return (
    <>
      <Button variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
      {another && (
        <Button variant="secondary" onClick={another.run}>
          {another.label}
        </Button>
      )}
      {primary && (
        <Button variant="brand" disabled={primary.disabled} onClick={primary.run}>
          {primary.label}
        </Button>
      )}
    </>
  )
}

/* --- Selection -------------------------------------------------------------------------- */

/* Select all, and what a selection can have done to it on the right of the same
   line. There rather than in the toolbar: the toolbar is already full at the
   compact width, and a button arriving there with the first tick wrapped it and
   moved Upload CSV and the primary action out from under the pointer. */
function SelectAll({
  shown,
  selected,
  onSelected,
  children,
}: {
  shown: string[]
  selected: string[]
  onSelected: (next: string[]) => void
  children?: ReactNode
}) {
  const on = shown.filter((s) => selected.some((x) => serialKey(x) === serialKey(s))).length
  const all = shown.length > 0 && on === shown.length
  return (
    <div className="bdt__selbar">
      <button
        type="button"
        role="checkbox"
        aria-checked={all ? true : on > 0 ? 'mixed' : false}
        className={`bdt__check bdt__check--all ${on > 0 ? 'is-on' : ''}`}
        onClick={() => onSelected(toggleAll(selected, shown))}
      >
        <span className="bx-tick" aria-hidden>
          {on > 0 && !all ? <Minus size={11} strokeWidth={3.2} /> : <Check size={11} strokeWidth={3.2} />}
        </span>
        {/* No count: the bulk button at the end of this line says how many. */}
        <span>Select all</span>
      </button>
      {children && <span className="bdt__bulk">{children}</span>}
    </div>
  )
}

function RowCheck({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-label={label}
      className={`bdt__check ${on ? 'is-on' : ''}`}
      onClick={onToggle}
    >
      <span className="bx-tick" aria-hidden>
        <Check size={11} strokeWidth={3.2} />
      </span>
    </button>
  )
}

/* The token half of a row: serial, then type, and when a C100 was last synced. */
function TokenCell({ token, className }: { token: HardwareToken; className?: string }) {
  return (
    <span className={className}>
      <span className="bdt__serial" title={token.serial}>
        {token.serial}
      </span>
      <span className="bdt__type">
        {tokenType(token.type).label}
        {token.syncedAt && canSync(token) && <span className="bdt__quiet">Synced {token.syncedAt}</span>}
      </span>
    </span>
  )
}

/* --- Assignments ------------------------------------------------------------------------- */

function AssignmentsTab({
  tokens,
  users,
  query,
  onQuery,
  selected,
  onSelected,
  onAssign,
  onUpload,
  onSync,
  onUnassign,
  onTokensTab,
}: {
  tokens: HardwareToken[]
  users: { id: string; name: string; email: string }[]
  query: string
  onQuery: (q: string) => void
  selected: string[]
  onSelected: (next: string[] | ((cur: string[]) => string[])) => void
  onAssign: () => void
  onUpload: () => void
  onSync: (serial: string) => void
  onUnassign: (serials: string[]) => void
  onTokensTab: () => void
}) {
  const all = useMemo(() => assignmentsOf(tokens, users), [tokens, users])
  const shown = useMemo(() => filterAssignments(all, query), [all, query])
  const paged = usePagedList(shown, { rowHeight: ROW_H, resetKey: query })
  /* A selection acts only on rows the search leaves. A search that hides a
     selected row must not leave it to be unassigned by a button that no longer
     shows it. */
  const plan = selectionPlan(
    shown.map((r) => r.token),
    selected,
  )
  const count = plan.assigned.length

  if (all.length === 0) {
    return assignmentsEmpty(tokens) === 'no-tokens' ? (
      <EmptyState
        icon={KeyRound}
        title="No tokens to assign"
        blurb="Add tokens on Token management, then assign them here."
        action={
          <Button variant="brand" iconRight={ArrowRight} onClick={onTokensTab}>
            Go to token management
          </Button>
        }
      />
    ) : (
      <EmptyState
        icon={UserRoundCheck}
        title="No tokens assigned yet"
        blurb="Give each person the token they carry."
        action={
          <>
            <Button variant="brand" icon={Plus} onClick={onAssign}>
              Assign tokens
            </Button>
            <Button variant="secondary" icon={Upload} onClick={onUpload}>
              Upload CSV
            </Button>
          </>
        }
      />
    )
  }

  return (
    <>
      <div className="btoolbar">
        <div className="btoolbar__left">
          <SearchBox value={query} onChange={onQuery} placeholder="Search people or serials" label="Search assignments" />
        </div>
        <div className="btoolbar__right">
          <Button variant="secondary" icon={Upload} onClick={onUpload}>
            Upload CSV
          </Button>
          <Button variant="brand" icon={Plus} onClick={onAssign}>
            Assign tokens
          </Button>
        </div>
      </div>

      {shown.length === 0 ? (
        <NoMatches noun="assignments" query={query} onClear={() => onQuery('')} />
      ) : (
        <>
          <SelectAll shown={shown.map((r) => r.token.serial)} selected={selected} onSelected={onSelected}>
            {count > 0 && (
              <Button variant="danger" size="sm" icon={UserX} onClick={() => onUnassign(plan.assigned.map((t) => t.serial))}>
                Unassign {plural(count, 'token')}
              </Button>
            )}
          </SelectAll>
          <ul className="blist blist--paged bdt__list" ref={paged.listRef} aria-label="Assignments">
            {paged.pageRows.map((r) => (
              <AssignmentRow
                key={r.token.serial}
                row={r}
                on={plan.picked.includes(r.token)}
                onToggle={() => onSelected((cur) => toggleSelected(cur, r.token.serial))}
                onSync={onSync}
                onUnassign={onUnassign}
              />
            ))}
          </ul>
          <ListPager {...paged.pager} label="Assignment pages" />
        </>
      )}
    </>
  )
}

function AssignmentRow({
  row,
  on,
  onToggle,
  onSync,
  onUnassign,
}: {
  row: Assignment
  on: boolean
  onToggle: () => void
  onSync: (serial: string) => void
  onUnassign: (serials: string[]) => void
}) {
  const { token, person } = row
  const items: MenuItem[] = [
    ...(canSync(token) ? [SYNC_ITEM] : []),
    { ...UNASSIGN_ITEM, divide: canSync(token) },
  ]
  return (
    <li className={`blist__row bdt__row ${on ? 'is-selected' : ''}`} data-serial={token.serial}>
      <RowCheck label={`Select ${token.serial}`} on={on} onToggle={onToggle} />
      <span className="blist__main bdt__person">
        <span className="bdt__who" title={person?.name}>
          {person?.name ?? 'A user not in the directory'}
        </span>
        {person && <span className="bdt__mail">{person.email}</span>}
      </span>
      <TokenCell token={token} className="bdt__token" />
      <span className="blist__side">
        <RowMenu
          label={`Actions for ${token.serial}`}
          items={items}
          onSelect={(id) => (id === 'sync' ? onSync(token.serial) : onUnassign([token.serial]))}
        />
      </span>
    </li>
  )
}

/* --- Token management ---------------------------------------------------------------------- */

/* A token row's menu, in the same order as an assignment row's: what moves the
   token on, then under a rule the two that take something away — Unassign
   above Delete, both red, as Unassign's own confirmation is. */
function tokenMenu(t: HardwareToken, blocker: string | null): MenuItem[] {
  const top: MenuItem[] = [...(t.userId ? [] : [ASSIGN_ITEM]), ...(canSync(t) ? [SYNC_ITEM] : [])]
  const away: MenuItem[] = [
    ...(t.userId ? [UNASSIGN_ITEM] : []),
    { id: 'delete', label: 'Delete', icon: Trash2, danger: true, disabled: !!blocker, hint: blocker ?? undefined },
  ]
  return [...top, ...away.map((it, i) => (i === 0 && top.length > 0 ? { ...it, divide: true } : it))]
}

function TokensTab({
  tokens,
  users,
  query,
  onQuery,
  filter,
  onFilter,
  selected,
  onSelected,
  onAdd,
  onUpload,
  onAssign,
  onSync,
  onUnassign,
  onDelete,
}: {
  tokens: HardwareToken[]
  users: { id: string; name: string; email: string }[]
  query: string
  onQuery: (q: string) => void
  filter: TokenFilter
  onFilter: (f: TokenFilter) => void
  selected: string[]
  onSelected: (next: string[] | ((cur: string[]) => string[])) => void
  onAdd: () => void
  onUpload: () => void
  onAssign: (serial: string) => void
  onSync: (serial: string) => void
  onUnassign: (serials: string[]) => void
  onDelete: (serials: string[]) => void
}) {
  const shown = useMemo(() => filterTokens(tokens, users, query, filter), [tokens, users, query, filter])
  const paged = usePagedList(shown, { rowHeight: ROW_H, resetKey: [query, filter] })
  const plan = selectionPlan(shown, selected)
  const byId = useMemo(() => new Map(users.map((u) => [u.id, u])), [users])

  if (tokens.length === 0) {
    return (
      <EmptyState
        icon={KeyRound}
        title="No tokens yet"
        blurb="Add each token, or upload a CSV of them."
        action={
          <>
            <Button variant="brand" icon={Plus} onClick={onAdd}>
              Add token
            </Button>
            <Button variant="secondary" icon={Upload} onClick={onUpload}>
              Upload CSV
            </Button>
          </>
        }
      />
    )
  }

  let bulk: ReactNode = null
  if (plan.picked.length > 0) {
    bulk =
      plan.deletable.length === 0 ? (
        /* Said beside the button rather than on hover: a disabled button fires no hover. */
        <>
          <span className="bdt__why">Assigned tokens can't be deleted.</span>
          <DeleteButton disabled>Delete {plural(plan.picked.length, 'token')}</DeleteButton>
        </>
      ) : (
        /* Counts what it will delete, not what is ticked: the dialog it opens
           says "Delete 5 tokens?" and names the assigned ones it keeps, and the
           button must not promise 8 first. */
        <DeleteButton onClick={() => onDelete(plan.picked.map((t) => t.serial))}>
          Delete {plural(plan.deletable.length, 'token')}
        </DeleteButton>
      )
  }

  return (
    <>
      <div className="btoolbar">
        <div className="btoolbar__left">
          <SearchBox value={query} onChange={onQuery} placeholder="Search serial numbers" label="Search tokens" />
          <span className={`btoolbar__filter ${filter !== 'all' ? 'is-set' : ''}`}>
            <Picker
              label="Show tokens"
              width="fill"
              value={filter}
              options={TOKEN_FILTERS.map((f) => ({ value: f.id, label: f.label }))}
              onChange={(v) => onFilter(v as TokenFilter)}
            />
          </span>
        </div>
        <div className="btoolbar__right">
          <Button variant="secondary" icon={Upload} onClick={onUpload}>
            Upload CSV
          </Button>
          <Button variant="brand" icon={Plus} onClick={onAdd}>
            Add token
          </Button>
        </div>
      </div>

      {shown.length === 0 ? (
        <NoMatches
          noun="tokens"
          query={query}
          filtered={filter !== 'all'}
          onClear={() => {
            onQuery('')
            onFilter('all')
          }}
        />
      ) : (
        <>
          <SelectAll shown={shown.map((t) => t.serial)} selected={selected} onSelected={onSelected}>
            {bulk}
          </SelectAll>
          <ul className="blist blist--paged bdt__list" ref={paged.listRef} aria-label="Tokens">
            {paged.pageRows.map((t) => {
              const holder = t.userId ? byId.get(t.userId) : undefined
              const blocker = deleteBlocker(t)
              const items = tokenMenu(t, blocker)
              const on = plan.picked.includes(t)
              return (
                <li key={t.serial} data-serial={t.serial} className={`blist__row bdt__row ${on ? 'is-selected' : ''}`}>
                  <RowCheck label={`Select ${t.serial}`} on={on} onToggle={() => onSelected((cur) => toggleSelected(cur, t.serial))} />
                  <TokenCell token={t} className="blist__main bdt__tokenmain" />
                  <span className="bdt__status">
                    {t.userId ? (
                      <Badge tone="info">Assigned to {holder?.name ?? 'a user not in the directory'}</Badge>
                    ) : (
                      <Badge tone="neutral">Unassigned</Badge>
                    )}
                  </span>
                  <span className="blist__side">
                    <RowMenu
                      label={`Actions for ${t.serial}`}
                      items={items}
                      onSelect={(id) => {
                        if (id === 'assign') onAssign(t.serial)
                        else if (id === 'unassign') onUnassign([t.serial])
                        else if (id === 'sync') onSync(t.serial)
                        else if (id === 'delete') onDelete([t.serial])
                      }}
                    />
                  </span>
                </li>
              )
            })}
          </ul>
          <ListPager {...paged.pager} label="Token pages" />
        </>
      )}
    </>
  )
}

/* --- Unassign confirmation ------------------------------------------------------------------- */

interface UnassignView {
  title: string
  lines: string[]
  serials: string[]
}

/* Unassigning is undone by assigning again, but it stops somebody signing in
   the moment it lands, so it asks — and says when it switches Display Token off
   with it. Deleting has ConfirmDelete, the console's one delete dialog. */
function UnassignConfirm({
  confirm,
  tokens,
  nameOf,
  methodOn,
  onClose,
  onUnassign,
}: {
  confirm: Confirm | null
  tokens: HardwareToken[]
  nameOf: (t: HardwareToken) => string
  methodOn: boolean
  onClose: () => void
  onUnassign: (serials: string[]) => void
}) {
  const targets = confirm ? selectionPlan(tokens, confirm.serials).assigned : []
  const view: UnassignView | null =
    confirm && targets.length > 0
      ? {
          title: targets.length === 1 ? `Unassign ${targets[0].serial}?` : `Unassign ${plural(targets.length, 'token')}?`,
          lines: [
            targets.length === 1
              ? `${nameOf(targets[0])} can no longer sign in with it.`
              : `${namesBrief(targets.map(nameOf))} can no longer sign in with them.`,
            ...(methodOn && leavesNobody(tokens, targets.map((t) => t.serial))
              ? ['Nobody else holds a token, so Display Token switches off.']
              : []),
          ],
          serials: targets.map((t) => t.serial),
        }
      : null
  /* Kept while the dialog animates out, so its words do not change mid-exit to
     describe the inventory the action has just changed. */
  const [last, setLast] = useState<UnassignView | null>(view)
  if (view && (view.title !== last?.title || view.lines.join() !== last?.lines.join())) setLast(view)
  const v = view ?? last

  return (
    <Modal
      open={!!view}
      onClose={onClose}
      title={v?.title ?? ''}
      width={480}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" icon={UserX} onClick={() => view && onUnassign(view.serials)}>
            Unassign
          </Button>
        </>
      }
    >
      <div className="bx-confirm">
        {(v?.lines ?? []).map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
    </Modal>
  )
}
