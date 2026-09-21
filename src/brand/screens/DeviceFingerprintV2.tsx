import { flushSync } from 'react-dom'
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  Copy,
  Eye,
  Fingerprint,
  Link2,
  MonitorSmartphone,
  Pencil,
  Plus,
  Sliders,
  Trash2,
} from 'lucide-react'

import {
  Badge,
  Button,
  Drawer,
  IconButton,
  Modal,
  NameField,
  RowMenu,
  SaveBar,
  SearchBox,
  Tabs,
  TipDot,
  type MenuItem,
} from '../kit'
import { Picker } from '../picker'
import {
  MODES,
  MODE_META,
  PROFILE_NAME_MAX,
  asksReach,
  attrOf,
  blankProfile,
  chosenAttributes,
  countLabel,
  ITEM_NOUN,
  modeLabel,
  offeredAttributes,
  profileChangeParts,
  profileIssue,
  profileReview,
  pruneValues,
  reachLabel,
  tierOf,
  withReach,
  type Attribute,
  type AttrConfigValue,
  type FingerprintProfile,
  type ProfileMode,
  type ProfileReach,
} from '../fingerprint'
import { useBrand } from '../store'
import { ChangeState, useLeaveGuard } from '../leave-guard'
import { EmptyState, NoMatches } from '../empty'
import { DEVICES_NOTE, itemsNote } from './profile-notes'
import { newId, uniqueName } from '../data'
import { deleteImpact, policiesUsing } from './usage'
import { UsedByPanel } from './used-by'
import { ConfirmDelete } from './confirm-delete'
import { pageForRow, usePagedList } from './paged-list'
import { LibraryRows, ViewSwitch, type LibRow } from './library-view'
import { PageBar, WidthSwitch } from './page-bar'
import { compactClass, usePageWidth } from '../page-width'
import { PageHead } from '../Shell'
import { libRowHeight, useLibView } from './library-view-state'
import { ListPager } from './list-pager'
import { MODE_ICON, reachChoices } from './device-profile-choices'
import {
  AttrStep,
  ChoiceTiles,
  ChosenList,
  EnrolmentFields,
  SidePanel,
} from './device-profile-parts'
import {
  basicSetupIssue,
  modeFixedTip,
} from './device-profile-basic'
import { DeviceProfileWizard } from './device-profile-wizard'
import { NewProfileDialog } from './new-profile-dialog'
import { CREATE_VERSIONS, readCreateVersion, writeCreateVersion, type CreateVersion } from './device-profile-version'
import { SHOWCASE } from '../showcase'

/* -----------------------------------------------------------------------------
   Device fingerprint · profiles.

   Three surfaces: the list, a profile's own page, and creating one.

   The list answers "what do we already check devices with, and is anything
   using it". A profile's page is where it is edited: Basic details and the
   checks it holds, each with its value, committed by the save footer.

   Creating one comes in three versions for now, tried side by side from a
   switch on the list (owner, 15 Sep 2026) — see `device-profile-version.ts`.
   Two are a page of steps (`DeviceProfileWizard`), one with each check's
   value on its line and one that chooses checks and sets them on separate
   steps. The third asks only a name and a type (`NewProfileDialog`) and opens
   the profile's own page on an unsaved profile, which its first save creates —
   the way a new zone is made. Every version replaces the list in place, as a
   profile's page does, and ends on the new profile's page.

   The parts all three draw are in `device-profile-parts.tsx`.
   -------------------------------------------------------------------------- */

/* The profile page's heading, once the page has replaced the dialog that
   opened it. After the dialog's own focus restore, which aims at a Create
   button that has gone with the list. */
const focusProfileHeading = () =>
  window.setTimeout(
    () => document.querySelector<HTMLElement>('.bfp2__pagehead h1')?.focus({ preventScroll: true }),
    0,
  )

export function DeviceFingerprintV2() {
  const store = useBrand()
  const [width] = usePageWidth()
  const [openId, setOpenId] = useState<string | null>(null)

  const open = openId ? store.fingerprints.find((p) => p.id === openId) ?? null : null

  /* --- Creating, three ways ---------------------------------------------------

     Which of the three versions Create opens, from the switch on the list, and
     remembered for this viewer (see `device-profile-version.ts`). */
  /* The showcase build is always Version 1, Full page — the chosen flow — and
     does not offer the picker (see showcase.ts). */
  const [version, setVersionState] = useState<CreateVersion>(() => (SHOWCASE ? 'full' : readCreateVersion()))
  const setVersion = (v: CreateVersion) => {
    setVersionState(v)
    writeCreateVersion(v)
  }
  /* Versions 1 and 3: the wizard page, in place of the list. */
  const [wizard, setWizard] = useState(false)
  /* Version 2: the name-and-type dialog, then an unsaved profile. Held here
     rather than in the store, as a newly named zone is, so nothing is stored
     until its page saves — and leaving it untouched stores nothing. */
  const [naming, setNaming] = useState(false)
  const [creating, setCreating] = useState<FingerprintProfile | null>(null)
  /* The id a create flow's profile was just stored under. When it is created
     from the leave dialog on the way out, the list lands on its row rather than
     on Create — and the handler leaving is the one from before the save, which
     cannot see it in the store. */
  const created = useRef<string | null>(null)

  const detail = creating ?? open
  /* The list is on screen: no profile page, and no page wizard in its place.
     The Current slide-over opens over the list and leaves it up. */
  const listUp = !detail && !(wizard && version !== 'current')

  /* The profile a delete is pending on, from its row menu — the only place
     Delete is offered; the inner page has no header actions. The dialog moves
     any live policy that uses the profile to draft (a system policy blocks it),
     and names the drafts that will need another one. Deleting does not unlink those rules — same contract as zones
     and hooks — and the checks flag each rule left naming it. */
  const [deleting, setDeleting] = useState<FingerprintProfile | null>(null)

  /* The profile whose "Used by" panel is open, from its row menu. Up here
     rather than on the page: Used by is a question about a profile on the list,
     asked beside Duplicate and Delete, and answering it should not mean opening
     the profile and its draft. Held by id and read from the store, so a rename
     shows and a delete closes the panel. */
  const [usesId, setUsesId] = useState<string | null>(null)
  const uses = usesId ? (store.fingerprints.find((f) => f.id === usesId) ?? null) : null
  /* The Used by panel docks beside the list — see `DockPanel`. */
  const docked = listUp && uses !== null

  /* Where keyboard focus goes when the list comes back: the row just left, or
     the row next to the one just deleted. The control that had focus went with
     its page or its row, which used to drop focus to <body>. */
  const [listFocus, setListFocus] = useState<ListFocus | null>(null)
  const focusDone = useCallback(() => setListFocus(null), [])

  /* The list's search and type filter live here, not in the list: the list
     unmounts while a profile is open, and coming back from one should land on
     the same filtered list, with its row still in it. */
  const [q, setQ] = useState('')
  const [modeFilter, setModeFilter] = useState<ProfileMode | 'all'>('all')

  const remove = (p: FingerprintProfile) => {
    const all = store.fingerprints
    const at = all.findIndex((x) => x.id === p.id)
    const rest = all.filter((x) => x.id !== p.id)
    const near = rest[at] ?? rest[at - 1] ?? null
    store.removeFingerprint(p.id)
    setDeleting(null)
    /* The last one gone: no filter is left on screen to clear, so none stays set
       to hide the next profile somebody creates. */
    if (rest.length === 0) {
      setQ('')
      setModeFilter('all')
    }
    setListFocus({ id: near?.id ?? null, on: 'menu' })
    store.showToast(`${p.name} deleted`)
  }

  /* A copy gets a name no other profile has ("(copy)", "(copy 2)", …) and an id
     nothing else has, so deleting one row never takes another with it. It stays
     on the list: duplicating is a list gesture, and may be done again. */
  /* An id no profile has AND no policy rule still names. Deleting a profile
     leaves the rules that named it in place, so reusing its id (a new profile
     with the same name gets the same slug) would quietly hand those rules to the
     new profile. */
  const freshId = (name: string) => {
    const taken = store.fingerprints.map((f) => f.id)
    for (;;) {
      const id = newId('fp', taken, name)
      if (policiesUsing('fingerprint', id, store.policies).length === 0) return id
      taken.push(id)
    }
  }

  const duplicate = (p: FingerprintProfile) => {
    const name = uniqueName(
      p.name,
      store.fingerprints.map((f) => f.name),
      PROFILE_NAME_MAX,
    )
    store.addFingerprint({
      ...p,
      id: freshId(name),
      name,
      usedIn: 0,
    })
    store.showToast(`${name} created`)
  }

  const startCreate = () => {
    setUsesId(null)
    if (version === 'name') {
      setNaming(true)
      return
    }
    created.current = null
    setWizard(true)
  }

  /* The wizard's finished profile: stored, announced, and opened. Its page
     focuses its own heading as it mounts. */
  const createFromWizard = (p: FingerprintProfile) => {
    const id = store.addFingerprint({ ...p, id: freshId(p.name) })
    created.current = id
    setWizard(false)
    setOpenId(id)
    store.showToast(`${p.name} created`)
  }

  /* Back on the list from a create flow: on the row it created, if it did, and
     otherwise on Create, which is what was pressed to get here. */
  const leaveCreate = (id: string | null) => {
    setWizard(false)
    setCreating(null)
    setOpenId(null)
    setListFocus({ id, on: 'create' })
  }

  /* An unsaved profile from the name-first dialog. Its id is chosen now and is
     the one the store keeps on the first save, so that save does not remount
     the page under the admin. */
  const startNamed = (name: string, mode: ProfileMode) => {
    created.current = null
    setCreating({ ...blankProfile(name, mode), id: freshId(name) })
    setNaming(false)
    focusProfileHeading()
  }

  const names = store.fingerprints.map((f) => f.name)

  return (
    /* Compact only while the list is up and the width switch says so: the inner
       page and the page wizards keep the full ten columns, since their panels
       and footers are laid out for that width. `bfp2--list` marks the list page
       whichever width it is — including under the Current slide-over, which
       leaves the list on screen and must not make it jump wider. */
    <div className={`bpage bfp2${listUp ? ` bfp2--list${compactClass(width)}` : ''}${docked ? ' has-dock' : ''}`}>
      {detail ? (
        /* Keyed, and the key is load-bearing now that the page holds a draft:
           without it, opening a second profile would hand the same component a
           new `profile` prop while its `useState` seed kept the first one's
           unsaved edits. A new profile keeps its key across its first save —
           see `startNamed`. */
        <ProfilePage
          key={detail.id}
          profile={detail}
          isNew={creating !== null}
          otherNames={store.fingerprints.filter((f) => f.id !== detail.id).map((f) => f.name)}
          onBack={() => {
            if (creating) {
              /* Created from the leave dialog on the way out, or not at all.
                 Read from the ref: this handler is the render's from before
                 that save, when the store did not have it yet. */
              leaveCreate(created.current)
              return
            }
            setListFocus({ id: detail.id, on: 'open' })
            setOpenId(null)
          }}
          onChange={(p) => {
            if (creating) {
              const id = store.addFingerprint(p)
              created.current = id
              setCreating(null)
              setOpenId(id)
              store.showToast(`${p.name} created`)
              /* Stored under another id only if this one was taken meanwhile;
                 the page then remounts, and its heading takes focus again. */
              if (id !== p.id) focusProfileHeading()
              return
            }
            store.updateFingerprint(p)
            store.showToast(`${p.name} saved`)
          }}
        />
      ) : wizard && version !== 'current' ? (
        <DeviceProfileWizard
          /* Version 3 chooses checks and sets them on separate steps. */
          step3={version === 'values' ? 'split' : 'inline'}
          names={names}
          onCancel={() => leaveCreate(created.current)}
          onCreate={createFromWizard}
        />
      ) : (
        <>
          <ProfileList
            profiles={store.fingerprints}
            q={q}
            setQ={setQ}
            mode={modeFilter}
            setMode={setModeFilter}
            focus={listFocus}
            onFocused={focusDone}
            onOpen={(id) => {
              setUsesId(null)
              setOpenId(id)
            }}
            version={version}
            onVersion={setVersion}
            onCreate={startCreate}
            onDuplicate={duplicate}
            uses={uses}
            usesPanel={
              uses && (
                <UsedByPanel
                  subject={uses.id}
                  caption={`Policy rules that name ${uses.name}.`}
                  emptyBlurb="No policy rule names this profile."
                  users={policiesUsing('fingerprint', uses.id, store.policies)}
                  onClose={() => setUsesId(null)}
                />
              )
            }
            onUses={(p) => setUsesId(p.id)}
            onDelete={setDeleting}
          />
          {/* Current renders BESIDE the list rather than instead of it.

              The three page versions take the whole region over, which is what
              makes them pages. The slide-over's whole argument is the opposite:
              the profiles you are naming this one against stay on screen behind
              it, so a duplicate name is something you can see rather than
              something the form has to tell you. That is why it is mounted here
              with the list still rendered, and not in the branch above. */}
          {wizard && version === 'current' && (
            <DeviceProfileWizard
              variant="drawer"
              step3="inline"
              names={names}
              onCancel={() => leaveCreate(created.current)}
              onCreate={createFromWizard}
            />
          )}
        </>
      )}

      <NewProfileDialog
        open={naming}
        names={names}
        onClose={() => {
          setNaming(false)
          setListFocus({ id: null, on: 'create' })
        }}
        onCreate={startNamed}
      />
      <ConfirmDelete
        open={!!deleting}
        name={deleting?.name ?? ''}
        noun="device profile"
        impact={deleting ? deleteImpact('fingerprint', deleting.id, store.policies) : undefined}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && remove(deleting)}
      />
    </div>
  )
}

/* --- List --------------------------------------------------------------------- */

interface ListFocus {
  /** The row to land on, or null to land on the first control that is left. */
  id: string | null
  /** The row's name, or its actions menu — or, back from a create flow, the
      row it created if there is one and Create if there is not. */
  on: 'open' | 'menu' | 'create'
}

const ROW_ITEMS: MenuItem[] = [
  { id: 'open', label: 'View details', icon: Eye },
  { id: 'duplicate', label: 'Duplicate', icon: Copy },
  { id: 'uses', label: 'Used by', icon: Link2 },
  { id: 'delete', label: 'Delete', icon: Trash2, danger: true, divide: true },
]

/* No "Used by" count on the row. Which policies name a profile is answered by
   the row menu's "Used by", which docks the answer beside the list; the row
   says what each profile is and offers its actions. */
function ProfileList({
  profiles,
  q,
  setQ,
  mode,
  setMode,
  focus,
  onFocused,
  onOpen,
  version,
  onVersion,
  onCreate,
  onDuplicate,
  uses,
  usesPanel,
  onUses,
  onDelete,
}: {
  profiles: FingerprintProfile[]
  q: string
  setQ: (q: string) => void
  mode: ProfileMode | 'all'
  setMode: (m: ProfileMode | 'all') => void
  focus: ListFocus | null
  onFocused: () => void
  onOpen: (id: string) => void
  /** Which create flow Create opens. */
  version: CreateVersion
  onVersion: (v: CreateVersion) => void
  onCreate: () => void
  onDuplicate: (p: FingerprintProfile) => void
  /** The profile the Used by panel is about, marked on its row. */
  uses: FingerprintProfile | null
  /** That panel, placed between the bar and the rows. */
  usesPanel: ReactNode
  onUses: (p: FingerprintProfile) => void
  onDelete: (p: FingerprintProfile) => void
}) {
  const search = useRef<HTMLInputElement>(null)
  const head = useRef<HTMLElement>(null)

  /* Name only. A search that silently matched a kind would make "device" return
     every trusted-device profile whether or not one is called that. */
  const shown = profiles.filter((p) => {
    if (mode !== 'all' && p.mode !== mode) return false
    const n = q.trim().toLowerCase()
    return !n || p.name.toLowerCase().includes(n)
  })

  /* As many rows as fit the window, and a pager for the rest. */
  const [view, setView] = useLibView('device-profiles')
  const paged = usePagedList(shown, {
    rowHeight: libRowHeight(view),
    grid: view === 'card',
    resetKey: [q, mode, view],
  })
  const listNode = useRef<HTMLElement | null>(null)
  const { listRef: pagedRef } = paged
  const listRef = useCallback(
    (el: HTMLElement | null) => {
      listNode.current = el
      pagedRef(el)
    },
    [pagedRef],
  )

  const clear = () => {
    setMode('all')
    setQ('')
  }

  /* The list and its pager as last rendered, for the focus pass below, which
     runs on a timer outside render. */
  const latest = useRef({ shown, page: paged.page, size: paged.size, prev: paged.prev, next: paged.next })
  useLayoutEffect(() => {
    latest.current = { shown, page: paged.page, size: paged.size, prev: paged.prev, next: paged.next }
  })

  /* On a timer, and turning to the row's page first — Risk signal profiles'
     way. The list comes back on page 1 and sizes its page in a layout effect
     after mount, and a profile just created is added at the end, on the last
     page: focus fell back to the first row of page 1, with the new profile out
     of sight (15 Sep 2026). */
  useEffect(() => {
    if (!focus) return
    const t = window.setTimeout(() => {
      onFocused()
      const { shown: rows, page, size, prev, next } = latest.current
      const at = focus.id ? rows.findIndex((p) => p.id === focus.id) : -1
      const onPage = at >= 0 ? pageForRow(at, size) : page
      if (onPage !== page) {
        flushSync(() => {
          for (let i = page; i < onPage; i += 1) next()
          for (let i = page; i > onPage; i -= 1) prev()
        })
      }
      const list = listNode.current
      const which = focus.on === 'menu' ? '.bx-rowmenu' : '.blist__open'
      const row = list
        ? Array.from(list.querySelectorAll<HTMLElement>('[data-id]')).find((el) => el.dataset.id === focus.id)
        : undefined
      /* Create is on the bar under the head, or in the empty state while there is no list. */
      const create = head.current?.parentElement?.querySelector<HTMLElement>('.bfp2__create button')
      const target =
        row?.querySelector<HTMLElement>(which) ??
        (focus.on === 'create' ? create : null) ??
        list?.querySelector<HTMLElement>(which) ??
        search.current ??
        head.current?.parentElement?.querySelector<HTMLElement>('.bempty button')
      target?.focus({ preventScroll: true })
    }, 0)
    return () => window.clearTimeout(t)
  }, [focus, onFocused])

  const choose = (p: FingerprintProfile, id: string) => {
    if (id === 'open') onOpen(p.id)
    else if (id === 'duplicate') onDuplicate(p)
    else if (id === 'uses') onUses(p)
    else if (id === 'delete') onDelete(p)
  }

  return (
    <>
      {/* The create flow sits on the heading row with the width switch (owner,
          16 Sep 2026: "move this with the heading"). Both compare versions of
          the page rather than act on the list, and on the bar the flow picker
          was what wrapped it to a second line. On the head it also stays over
          an empty state, where it decides what that state's Create does.
          Scaffolding for choosing a direction; it comes out when one is
          chosen. Each flow's description is the option's second line. */}
      <PageHead
        title="Device profiles"
        caption="Device health checks and trusted devices, for policy rules to use."
        headRef={head}
        preview={
          SHOWCASE ? undefined : (
          <>
            <Picker
              label="Create flow"
              size="md"
              prefix="Flow"
              value={version}
              summary={CREATE_VERSIONS.find((v) => v.id === version)?.name ?? ''}
              options={CREATE_VERSIONS.map((v) => ({
                value: v.id,
                label: `${v.label} · ${v.name}`,
                meta: v.tip,
              }))}
              onChange={(v) => onVersion(v as CreateVersion)}
            />
            <WidthSwitch />
          </>
          )
        }
      />

      {/* The row every list page has — see `PageBar`: the search box, then the
          type filter; the view and Create on the right. Not rendered over the
          empty state, as on Zones: an empty bar still took a row and its
          margin, and the empty state offers the same Create. */}
      {profiles.length > 0 && (
        <PageBar
          left={
            <>
              <SearchBox
                value={q}
                onChange={setQ}
                inputRef={search}
                placeholder="Search profiles…"
                label="Search device profiles"
              />
              <span className={`btoolbar__filter bbar__filter ${mode !== 'all' ? 'is-set' : ''}`}>
                <Picker
                  label="Filter by profile type"
                  size="md"
                  prefix="Type"
                  value={mode}
                  options={[{ value: 'all', label: 'All' }, ...MODES.map((m) => ({ value: m.id, label: m.label }))]}
                  onChange={(v) => setMode(v as ProfileMode | 'all')}
                />
              </span>
            </>
          }
          right={
            <>
              <ViewSwitch value={view} onChange={setView} label="Device profile view" />
              {/* The span is what focus finds on the way back from a create
                  flow — the kit's Button takes no ref. */}
              <span className="bfp2__create">
                <Button variant="brand" onClick={onCreate}>
                  <Plus size={15} strokeWidth={2.2} aria-hidden />
                  Create new profile
                </Button>
              </span>
            </>
          }
        />
      )}

      {/* Before the rows, not after: the paged-list hook counts everything that
          follows the rows as room they cannot have. */}
      {profiles.length > 0 && usesPanel}

      {profiles.length === 0 ? (
        <EmptyState
          icon={MonitorSmartphone}
          title="No device profiles yet"
          blurb="Create a profile to check device health or recognise trusted devices."
          action={
            <span className="bfp2__create">
              <Button variant="brand" onClick={onCreate}>
                <Plus size={15} strokeWidth={2.2} aria-hidden />
                Create new profile
              </Button>
            </span>
          }
        />
      ) : shown.length === 0 ? (
        <NoMatches noun="device profiles" query={q} filtered={mode !== 'all'} onClear={clear} />
      ) : (
        /* Table, list or card — the one shape `LibraryRows` draws for all three
           libraries. The type and what the profile holds are its two facts,
           so the table has columns to show and a card has lines to hold. */
        <>
          <LibraryRows
            view={view}
            listRef={listRef}
            nameColumn="Profile"
            columns={['Type', 'Includes']}
            rows={paged.pageRows.map(
              (p): LibRow => ({
                id: p.id,
                name: p.name,
                tile: renderModeIcon(p.mode, 18),
                tileClass: 'bfp2__tile',
                attrs: uses?.id === p.id ? { 'data-id': p.id, 'data-docked': 'true' } : { 'data-id': p.id },
                onOpen: () => onOpen(p.id),
                facts: [
                  { label: 'Type', value: <ModeBadge mode={p.mode} /> },
                  { label: 'Includes', value: countLabel(p.mode, chosenAttributes(p).length) },
                ],
                menu: <RowMenu label={`Actions for ${p.name}`} items={ROW_ITEMS} onSelect={(id) => choose(p, id)} />,
              }),
            )}
          />
          <ListPager {...paged.pager} label="Device profile pages" />
        </>
      )}
    </>
  )
}

/* The profile's type as a tinted pill, on the list row and the page heading. */
const MODE_TONE = { info: 'lime', accent: 'magenta' } as const
export function ModeBadge({ mode }: { mode: ProfileMode }) {
  return <Badge tone={MODE_TONE[MODE_META[mode].tint]}>{modeLabel({ mode })}</Badge>
}

/* `UsedByDrawer` stood here — "Used by" as a modal drawer over the list. It is
   `UsedByPanel` (used-by.tsx) now, docked beside the list (16 Sep 2026). */

/* --- Shared with the create flows ---------------------------------------------

   The pieces a profile is made of on screen — the type and reach tiles, the
   catalogue picker, the check list and its value controls, the enrolment form
   and the side panels — are in `device-profile-parts.tsx` (15 Sep 2026). This
   page, the create wizard and the name-first dialog all draw them, and kept
   here they made the wizard import the screen that imports the wizard. */

/* --- The mode mark, in one place ---------------------------------------------- */
const renderModeIcon = (mode: ProfileMode, size: number) => {
  const Ico = MODE_ICON[mode]
  return <Ico size={size} strokeWidth={1.7} />
}

/* --- Create ------------------------------------------------------------------

   `CreateDrawer` stood here: a 560px slide-over over the list, two or three
   steps, and a picker with no values in it, so every profile arrived on
   catalogue defaults.

   It was replaced by three versions of the create flow, tried side by side from
   a switch on the list (owner, 15 Sep 2026): a page of steps with each check's
   value on its line (`DeviceProfileWizard`, `step3="inline"`), a name and a
   type then the profile's own page (`NewProfileDialog`, then `ProfilePage`
   with `isNew`), and the same page of steps with choosing and setting apart
   (`step3="split"`). Which one Create opens is `device-profile-version.ts`.

   Its step ladder (`WizSteps`) and the "Needs the Device Agent" callout
   (`AgentPrereq`) went with it. The wizard draws its own pressable ladder, and
   the agent's cost is said in the side panel beside the reach tiles, as Basic
   details says it. `DiscardDialog` stays: the Edit checks drawer asks with it. */

/* "Discard …?" over a drawer that holds unsaved work. A question, not setup, so
   it is a small centred dialog rather than a page pushed into the drawer. */
function DiscardDialog({
  open,
  title,
  onKeep,
  onDiscard,
}: {
  open: boolean
  title: string
  onKeep: () => void
  onDiscard: () => void
}) {
  return (
    <Modal
      open={open}
      onClose={onKeep}
      title={title}
      width={440}
      footer={
        <>
          <Button variant="ghost" onClick={onKeep}>
            Keep editing
          </Button>
          <Button variant="danger" onClick={onDiscard}>
            Discard
          </Button>
        </>
      }
    >
      <p className="bx-leave__body">What you have entered will not be saved.</p>
    </Modal>
  )
}

/* `REACHES` moved to `fingerprint.ts`.

   It is asked at creation now, of a device-attributes profile only, and the
   thing that decides whether it is asked at all — whether this kind has any
   attribute an agent is needed for — is a property of the catalogue. So the
   cards live beside the catalogue, and `asksReach(mode)` is the question
   answered from the data rather than from a branch in a dialog.

   The copy travelled unchanged, including the reason "Windows only" sits on the
   card rather than in a callout after the choice: a platform limit is a
   property of the choice, and the console puts it one screen too late.

*/

/* --- The inner page ------------------------------------------------------------

   Two tabs, and the page edits rather than states.

   What stood here was one scrolling surface: a card holding the attribute list,
   a 240px rail of read-only facts beside it, and two drawers behind two Edit
   buttons for everything the rail merely reported. That shape asked the reader
   to hold three places in their head — the fact in the rail, the door that
   changes it, and the panel behind the door — for a profile that is, in the
   end, a name, four settings and a list.

   So the two halves become two tabs. `Basic details` is the profile itself —
   the form, editable on the tab (16 Sep 2026; for a day it was a read-only view
   with the form in a slider behind Edit). The attribute tab is the list. Both get the full width of the
   page, which is the width the attribute controls wanted and did not have.

   And the page now has a draft. Every control used to write through to the
   store as it was touched — hence a drawer whose action said `Done` rather than
   `Save`, because there was nothing left to commit. Live write-through is a
   defensible model, but it is not the one asked for here, and it had a real
   cost this screen was paying: renaming a profile was unabortable, because the
   rename landed a keystroke at a time. Now the tabs edit a copy, the save footer
   appears when the copy differs, and throwing the copy away is the leave
   dialog's Discard rather than a retype.
   -------------------------------------------------------------------------- */

type ProfileTab = 'basic' | 'attributes'

/* How a health profile works, beside a new one's empty list. */
/* `ENROLMENT_KEYS` and `enrolmentAnswered` stood here: the save flipped
   `restrictionSet` when any enrolment value differed from the stored profile,
   because the enrolment rows were live on the page and a changed row was the
   only evidence anybody had answered them. The rows are on the Basic details tab
   now, and any answer there sets the flag on the draft (`changeBasic`) —
   including a press on the reach already shown, which confirms the defaults and
   which a diff of the values could never see. Saving a rename still leaves the flag alone. */

/* `onDuplicate` went with the header button, and `onDelete` and Used by went
   the same way when the header lost its action trail. Duplicating, deleting and
   asking what uses a profile are list gestures — you do them while comparing,
   and possibly twice — so they live in the row menu, where doing one again is a
   click rather than a navigation. The page keeps only what edits its draft. */
function ProfilePage({
  profile,
  isNew = false,
  otherNames,
  onBack,
  onChange,
}: {
  profile: FingerprintProfile
  /** Not stored yet: named and typed in the new-profile dialog, and created by
      this page's first save. */
  isNew?: boolean
  /** Every other profile's name, for the duplicate-name check. */
  otherNames: string[]
  onBack: () => void
  onChange: (p: FingerprintProfile) => void
}) {
  const [tab, setTab] = useState<ProfileTab>('basic')
  const [editing, setEditing] = useState(false)
  /* Whether the heading is the name field — the pencil's rename. */
  const [renaming, setRenaming] = useState(false)
  const head = useRef<HTMLElement>(null)
  /* The pencil's wrapper. IconButton takes no ref, and focus goes back to the
     button inside when a rename ends. */
  const pencil = useRef<HTMLSpanElement>(null)

  /* The edit buffer. Seeded once per profile — the call site keys this
     component on `profile.id`, so opening a different profile remounts rather
     than merging one profile's unsaved edits into another's. */
  const [draft, setDraft] = useState<FingerprintProfile>(profile)

  /* Whether this profile still owes the agent answer.

     `asksReach` rather than `mode === 'device'`, because whether the question
     exists is a fact about the CATALOGUE — it is true exactly while some of
     that kind's signals need an agent — and a hard-coded mode would go quietly
     wrong the day a health check needs one. */
  const needsReach = asksReach(draft.mode) && !draft.restrictionSet
  const reachAskId = useId()
  /* Unsaved means there is a change to name. A value picked again, or set back
     to what is saved, can leave the draft's JSON different from the profile's
     (a default written out, a weight inside the same tier) with nothing for the
     save bar or Review changes to list — an "Unsaved changes" bar with no
     changes in it. So the bar, the pill and the leave guard follow the review. */
  const review = profileReview(profile, draft)
  const changedNow = review.length > 0 && JSON.stringify(draft) !== JSON.stringify(profile)
  /* A new profile opens clean all the same, as a newly named zone does (owner,
     15 Sep 2026): no pill and no footer until something is changed, and leaving
     it untouched goes straight back — the name and type are all there is to
     lose, and the dialog is one click away. So the test keeps comparing against
     the seed. Only what Review changes LISTS is read against a copy with no
     name, so the name shows as added beside everything else going in.

     Once touched, a new profile stays unsaved until it is created or left. A
     trusted device is valid on its defaults, and undoing the one change made
     used to take Create profile away with it — so a profile on every default
     could not be created this way at all (15 Sep 2026). Latched during render,
     React's pattern for state derived from a change, so the footer never
     flickers off for a frame. */
  const [touched, setTouched] = useState(false)
  if (isNew && changedNow && !touched) setTouched(true)
  const dirty = changedNow || (isNew && touched)
  const shownReview = isNew ? profileReview({ ...profile, name: '' }, draft) : review

  /* Why the draft can't be saved yet: a blank or taken name, no checks, a
     version that isn't one, a roster that is missing or can't be matched. The
     save bar, Review changes and the leave dialog all say the same thing.
     And, on a new trusted device, basic details nobody has set up — see
     `basicSetupIssue` for why that blocks Create profile rather than creating
     a profile whose own tab says it isn't finished. */
  const issue = profileIssue(draft, otherNames) ?? basicSetupIssue(draft, isNew)

  /* Focus lands on the heading when the page opens. The control that opened it
     (a row's name, a menu item, Create profile) left with the list. */
  useEffect(() => {
    head.current?.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true })
  }, [])

  /* Picking the value a check already has writes nothing. */
  const setConfig = (id: string, v: AttrConfigValue) =>
    setDraft((d) => {
      const c = attrOf(d.mode, id)?.config
      const current = d.config[id] ?? (c && 'value' in c ? c.value : undefined)
      return JSON.stringify(current) === JSON.stringify(v) ? d : { ...d, config: { ...d.config, [id]: v } }
    })

  /* Weights are shown and chosen as tiers, so picking the tier a signal is
     already in leaves its stored number alone. */
  const setWeight = (id: string, w: number) =>
    setDraft((d) => {
      const current = d.weights[id] ?? attrOf(d.mode, id)?.weight
      return current !== undefined && tierOf(current) === tierOf(w) ? d : { ...d, weights: { ...d.weights, [id]: w } }
    })

  /* The drawer's picks, written into the draft.

     A check the saved profile already had comes back AS SAVED — in its saved
     place in `enabled`, with its saved value and weight — so removing a check and
     adding it back in the same edit leaves the draft identical and the SaveBar
     closed. Key order too, not just values: `dirty` compares JSON, and a restored
     value appended at the end of `config` stringifies differently from the same
     value in its saved place. And through `pruneValues`, so a check taken out
     takes its value with it rather than leaving it for the next time somebody
     adds it back unseen. */
  const applyPicks = (picked: string[]) => {
    const rank = (order: string[]) => (x: string) => {
      const i = order.indexOf(x)
      return i < 0 ? Infinity : i
    }
    const byEnabled = rank(profile.enabled)
    const restore = <T,>(saved: Record<string, T>, current: Record<string, T>) => {
      const back = picked.filter((id) => id in saved && !(id in current))
      if (back.length === 0) return current
      const at = rank(Object.keys(saved))
      return Object.fromEntries(
        Object.entries({ ...current, ...Object.fromEntries(back.map((id) => [id, saved[id]])) }).sort(
          ([a], [b]) => at(a) - at(b),
        ),
      )
    }
    setDraft((d) => {
      const kept = pruneValues({ ...d, enabled: [...picked].sort((a, b) => byEnabled(a) - byEnabled(b)) })
      return {
        ...kept,
        config: restore(profile.config, kept.config),
        weights: restore(profile.weights, kept.weights),
      }
    })
    setEditing(false)
  }

  /* A row's Remove, through the drawer's own path: the same picks minus one, so
     a removed check takes its value with it and adding it back restores it as
     saved — and the SaveBar, the leave guard and "Unsaved changes" all follow. */
  const removeCheck = (id: string) => applyPicks(draft.enabled.filter((x) => x !== id))

  /* --- The agent question, answered from Signals -------------------------------

     A trusted-device profile draws on a different catalogue depending on this
     one answer: 20 signals agentless, 38 with an agent — 18 of the 38 cannot be
     read without one. The wizard asks it as a step. `blankProfile` cannot: it
     has to return a whole profile, so `reach` carries 'agentless' as a value
     nobody chose, and `restrictionSet: false` is the record that nobody chose
     it. That flag already exists for exactly this and already means exactly
     this — its own comment calls "agentless, self-service, 3 devices" presented
     as a configuration nobody chose "a claim the screen cannot support".

     So the tab asks rather than assuming, and answering here is the same write
     Basic details makes: the reach, and the flag that says it was chosen. It
     marks Basic details answered too, which is right — it is one question, and
     the two places that ask it must not disagree about whether it has been. */
  const answerReach = (reach: ProfileReach) =>
    setDraft((d) => (d.reach === reach && d.restrictionSet ? d : { ...d, reach, restrictionSet: true }))

  /* Basic details, written into the draft as they are edited.

     There is no Apply any more: the form is on the tab (16 Sep 2026), so every
     change lands on the draft and the page's own save footer is what commits
     it. `restrictionSet` goes true with the first change, which is the answer
     the flag records — somebody has been here and chosen. It cannot be set on
     mount instead: a tab you opened and read is not a question you answered.

     A whole profile is accepted as the patch, not just the fields the old
     slider owned, because a reach switch rewrites `enabled`, `config` and
     `weights` along with `reach`. */
  const changeBasic = (patch: Partial<FingerprintProfile>) =>
    setDraft((d) => ({ ...d, ...patch, restrictionSet: true }))

  /* Saved as it stands. The save used to write `restrictionSet` too — true on a
     new trusted device's first save, on the argument that its enrolment rows
     were the first thing on the page and Create profile answered them. The page
     does not start answered, so Create profile answers nothing, and the flag
     comes only from an answer on the Basic details tab or the Signals tab's
     reach question (`changeBasic`, `answerReach`). A new trusted
     device that was never set up is blocked by `issue` instead
     (`basicSetupIssue`); one set up on every default is not, which keeps the
     owner's call recorded above that a trusted device is valid on them. */
  const save = () => {
    if (issue) return false
    onChange(draft)
    return true
  }

  /* Leaving asks first. Its Save is the bar's, and it is blocked for the same
     reason the bar's is. */
  const confirmLeave = useLeaveGuard({
    dirty,
    save,
    saveLabel: isNew ? 'Create profile' : 'Save',
    blocked: issue,
  })

  const noun = ITEM_NOUN[draft.mode]
  /* "Signals" on a trusted device, "Checks" on a health profile — the same word
     the rest of the screen uses for the things in the list. */
  const attrTab = noun.many.charAt(0).toUpperCase() + noun.many.slice(1)
  /* The same test the create wizard uses to decide whether it has two steps or
     three. One question, one answer, both surfaces. */
  const tabbed = asksReach(draft.mode)
  /* "Change what it reads", from the signals drawer. Straight to the Basic
     details tab, where the reach tiles are. It used to open a slider on top of
     that tab, because the tab itself was read-only; the tab holds the live form
     now, so the slider was one surface in the way. */
  const toReach = tabbed
    ? () => {
        setEditing(false)
        setTab('basic')
      }
    : undefined

  return (
    <>
      <button type="button" className="bfp2__back" onClick={() => confirmLeave(onBack)}>
        <ArrowLeft size={14} strokeWidth={2} aria-hidden />
        All profiles
      </button>

      <header className="bfp2__head" ref={head}>
        {/* `draft.name`, not `profile.name`: the heading is the name field, so
            it shows what was typed. The save bar says the two differ. */}
        {/* Name, pencil, then the pills — the zone and risk profile pages'
            order. The pencil is always shown, not revealed on hover, and it is
            the page's only Rename: the header's action trail is gone, and Used
            by and Delete are on the list's row menu. It steps aside while the
            name is an input, and gets focus back when Enter, Escape, ✓ or ✕
            ends it. */}
        <div className="bfp2__pagehead">
          <EditableName
            value={draft.name}
            onChange={(name) => setDraft((d) => ({ ...d, name }))}
            editing={renaming}
            setEditing={setRenaming}
            onDone={() => pencil.current?.querySelector<HTMLButtonElement>('button')?.focus()}
          />
          {!renaming && (
            <span className="bfp2__rename" ref={pencil}>
              <IconButton icon={Pencil} size="sm" tone="ghost" label="Rename" onClick={() => setRenaming(true)} />
            </span>
          )}
          {/* The type is fixed once created, so it is a pill, not a control.
              The `?` beside it is the one place that now says so: Basic details
              used to restate the type in a "Can't be changed" section of one
              row, and this pill is the original (16 Sep 2026). `Badge` has no
              tip of its own — its `title` only fires when a label is clipped —
              so the sentence hangs off a TipDot, and comes from the model
              rather than being retyped here. */}
          <ModeBadge mode={draft.mode} />
          <TipDot label="Profile type" text={modeFixedTip(draft)} />
          <ChangeState unsaved={dirty} />
        </div>
      </header>

      {/* Two tabs, or none, and the type decides which. A health profile is a
          name and a list of checks: it has no collector to choose and no
          enrolment, so a second tab would hold nothing. A trusted device has
          both halves and keeps its tabs. */}
      {tabbed ? (
        <>
          <Tabs
            className="bx-tabs--line bfp2__tabs"
            name="Profile"
            value={tab}
            onChange={setTab}
            panelId="bfp2-panel"
            options={[
              { value: 'basic', label: 'Basic details', icon: Sliders },
              { value: 'attributes', label: attrTab, icon: Fingerprint },
            ]}
          />

          <div id="bfp2-panel" role="tabpanel" className="bfp2__panel">
            {tab === 'basic' ? (
              <BasicDetailsTab draft={draft} onChange={changeBasic} />
            ) : (
              /* The zone page's two columns, under the tabs as they are there:
                 the list on the left, what describes it on the right. */
              <div className="bz7__cols">
                <div className="bz7__work">
                  {/* The question before the list it decides.

                      Unanswered, the list would be 20 of 38 signals with
                      nothing on screen saying the other 18 exist or what they
                      cost — and the four always-on ones would read as the whole
                      of what this profile compares. So the question comes
                      first, and the list follows it.

                      Not a blocking step: this page exists because Name first
                      does not want a wizard, and a gate that refuses to show
                      anything until answered is a wizard with one step. The
                      always-on four stay visible underneath, because they are
                      collected whatever the answer is. */}
                  {needsReach && (
                    <section className="bfp2__basicsec bfp2__reachask">
                      <header className="bfp2__sechead">
                        <h2 id={reachAskId}>What it can read</h2>
                        <TipDot
                          label="What it can read"
                          text="Decides which signals are available. Hardware identifiers need the Device Agent."
                        />
                      </header>
                      <ChoiceTiles labelledBy={reachAskId} options={reachChoices()} value={null} onPick={answerReach} />
                    </section>
                  )}
                  <ChosenList
                    draft={draft}
                    /* While the question stands, the list is the four that
                       arrive regardless — so Add is not offered for a
                       catalogue whose size is still undecided. */
                    awaitingReach={needsReach}
                    onEdit={() => setEditing(true)}
                    onConfig={setConfig}
                    onWeight={setWeight}
                    onRemove={removeCheck}
                  />
                </div>
                <SidePanel note={itemsNote(draft.mode)} />
              </div>
            )}
          </div>
        </>
      ) : (
        /* Two columns, the zone page's own grid and breakpoint: the checks on
           the left, and on the right what they add up to and what else could go
           in. */
        <div className="bfp2__panel bz7__cols">
          <div className="bz7__work">
            {/* A new health profile has no checks yet, and that list is the
                whole page, so its empty state is drawn as a page's is. */}
            <ChosenList
              draft={draft}
              fullEmpty={isNew}
              onEdit={() => setEditing(true)}
              onConfig={setConfig}
              onWeight={setWeight}
              onRemove={removeCheck}
            />
          </div>
          {/* How the checks work, in the wizard's words — the same panel a new
              profile's empty state gets, since neither reads the draft. */}
          <SidePanel note={itemsNote(draft.mode)} />
        </div>
      )}

      {/* The kit's footer, not a local one. Zones and risk profiles commit the
          same way. It has no Discard: leaving the page is where edits are
          thrown away, through the leave dialog. */}
      <SaveBar
        open={dirty}
        changes={isNew ? ['New profile'] : profileChangeParts(profile, draft)}
        saveLabel={isNew ? 'Create profile' : 'Save changes'}
        review={shownReview}
        blocked={issue !== null}
        blockedReason={issue ?? undefined}
        onSave={save}
      />

      <ChecksDrawer
        open={editing}
        profile={draft}
        onClose={() => setEditing(false)}
        onSave={applyPicks}
        onBack={toReach}
      />

    </>
  )
}

/* The name, edited where it is read.

   One rendering, and it is the heading. The pencil beside it turns it into the
   kit's name field: the input, its count, and a ✕ and ✓ under its right edge.

   Enter, ✓ or leaving the field keeps the trimmed name; a blank one puts back
   the name the edit started from. Escape or ✕ reverts just the name — leaving
   the page can already discard everything, but backing out of a rename should
   not cost the check retuned two minutes ago. The keys and the buttons hand
   focus back to the pencil; leaving the field leaves it where it went. */
function EditableName({
  value,
  onChange,
  editing,
  setEditing,
  onDone,
}: {
  value: string
  onChange: (v: string) => void
  editing: boolean
  setEditing: (on: boolean) => void
  /** Called after Enter, Escape, ✓ or ✕ has ended the edit, to put focus somewhere real. */
  onDone?: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  /* What the name was when this edit began. Captured on entry rather than read
     from the saved profile: the pre-edit value may itself be unsaved. */
  const before = useRef(value)
  /* Set once a key or a button has ended the edit, which is what sends focus
     back to the pencil. A leave has already put focus where it was going. */
  const ended = useRef(false)

  /* Enter and ✓ are one act, Escape and ✕ the other. */
  const apply = () => {
    ended.current = true
    onChange(value.trim() || before.current)
    setEditing(false)
  }
  const cancel = () => {
    ended.current = true
    onChange(before.current)
    setEditing(false)
  }

  useEffect(() => {
    if (!editing) {
      /* After the commit that took the input away, not in the key handler: the
         pencil `onDone` focuses is hidden while the name is an input, and is
         only back in the page once this render has landed. */
      if (ended.current) onDone?.()
      return
    }
    before.current = value
    ended.current = false
    input.current?.focus()
    input.current?.select()
    /* `value` and `onDone` deliberately absent: this runs when the edit OPENS
       or ENDS, and listing `value` would re-select the whole field on every
       keystroke. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing])

  if (!editing) {
    /* `tabIndex={-1}` so the page can put focus here when it opens; `title`
       for a long name the heading cuts short. */
    return (
      <h1 tabIndex={-1} title={value}>
        {value}
      </h1>
    )
  }

  return (
    <NameField
      inputRef={input}
      value={value}
      max={PROFILE_NAME_MAX}
      label="Profile name"
      placeholder="Corporate laptops"
      onChange={onChange}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          apply()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          cancel()
        }
      }}
      /* Focus out of the field keeps the name as ✓ would, without the trip back
         to the pencil; the kit holds the close until a press has had its click. */
      onLeave={() => onChange(value.trim() || before.current)}
      onClose={() => setEditing(false)}
      onApply={apply}
      onCancel={cancel}
    />
  )
}

/* Basic details, EDITABLE on the tab (owner, 16 Sep 2026: "open the same form
   in an editable way, no need for the view-only and Edit button").

   The tab held a rail of facts and an Edit that opened the same form in a
   slider. Three surfaces for one set of five answers — a report, a door, and
   the form — and the report's whole content was "here is what the form says".
   The form is the tab now. Changes land on the page's draft as they are made
   and the page's save footer commits them, which is how the Signals tab beside
   it already worked.

   What that removes with it: the Edit button, the "Basic details not set up"
   empty state and its Set up (the form IS the setting up), and the slider.
   What it keeps: the destructive reach switch still asks before it takes the
   agent-only signals, and the side panel still explains rather than describes
   until something has been chosen.

   Used by is not repeated here; it is the list's row menu that answers it. */
function BasicDetailsTab({
  draft,
  onChange,
}: {
  draft: FingerprintProfile
  onChange: (patch: Partial<FingerprintProfile>) => void
}) {
  return (
    /* The Signals tab's two columns, and the zone page's: the form on the left,
       what it means on the right. Switching tabs keeps both columns where they
       were, because they are the same grid. */
    <div className="bz7__cols">
      <div className="bz7__work">
        <BasicDetailsForm profile={draft} onChange={onChange} />
      </div>
      {/* One panel, answered or not: it describes the choices, so it does not
          have to wait for them or change with them. */}
      <SidePanel note={DEVICES_NOTE} />
    </div>
  )
}

/* `FACT_ICON`, `FACT_CHIP` and `BasicDetailsView` stood here — the rail of
   facts the tab used to draw, its per-row marks and the rule for which answers
   wore a pill. The tab holds the form itself now, and the model that fed them
   (`basicDetailsSections`) went too. */

/* The Basic details form, ON the tab (owner, 16 Sep 2026).

   The same questions, in the same order, with the same two careful parts: the
   switch to agentless waits for a second press and NAMES what it takes, and the
   roster is uploaded on its row.

   It writes STRAIGHT to the page's draft. There is no copy and no Apply — it
   was a slider until today, and a slider has to hold a copy because closing it
   must be able to mean "no". On the tab there is nothing to close: the page's
   save footer is the only commit, and it already knows how to say what changed
   and how to discard it. That also takes the discard question with it, which
   was asking about a slider that no longer exists.

   No "Can't be changed" section: the type has no control here, and the heading
   pill above says what it is.

   `basicApplyIssue` used to gate Apply. It has gone with Apply: a half-answered
   reach switch changes nothing until it is confirmed, so there is nothing
   unsafe to save, and the missing-roster half of it is already in
   `profileIssue`, which is what blocks the footer. */
function BasicDetailsForm({
  profile,
  onChange,
}: {
  profile: FingerprintProfile
  /** A patch onto the page's draft. A reach switch sends a whole profile: it
      rewrites `enabled`, `config` and `weights` along with `reach`. */
  onChange: (patch: Partial<FingerprintProfile>) => void
}) {
  /* The reach a press is proposing, or null when none is. Not a copy of the
     current value — this is "somebody has asked for a change and not yet
     confirmed it", which is a different thing and reads as one. */
  const [pendingReach, setPendingReach] = useState<ProfileReach | null>(null)

  const reachId = useId()
  const dropped =
    pendingReach === null
      ? []
      : profile.enabled
          .map((id) => attrOf(profile.mode, id))
          .filter((a): a is Attribute => Boolean(a?.needsAgent && pendingReach !== 'agent'))

  /* Both confirmation buttons take away the panel they sit in, so without this
     a keyboard user is dropped at the top of the form. Focus goes back to the
     tile that is now the answer — the one kept, or the one switched to — which
     is where the question was asked. Set only by those two presses: a press on
     a tile keeps its own focus and needs no help. The kit's tiles take no ref,
     so the section holds one and the checked tile is found in it. */
  const reachSection = useRef<HTMLElement>(null)
  const refocusReach = useRef(false)
  useEffect(() => {
    if (pendingReach !== null || !refocusReach.current) return
    refocusReach.current = false
    reachSection.current?.querySelector<HTMLButtonElement>('[role="radio"][aria-checked="true"]')?.focus()
  }, [pendingReach])

  const commitReach = (reach: ProfileReach) => {
    onChange(withReach(profile, reach))
    setPendingReach(null)
  }

  const pressReach = (reach: ProfileReach) => {
    /* Pressing the tile that is ALREADY the answer still answers it.

       A profile nobody has set up shows its default reach checked while
       `restrictionSet` is false, and the save footer refuses with "Set up basic
       details" until that flag turns true. The slider's Apply used to turn it —
       Apply on untouched defaults counted as an answer, deliberately. With the
       slider gone, a press that returned early here left no press in the form
       that could ever turn it, and the profile could not be created. */
    if (reach === profile.reach) {
      setPendingReach(null)
      onChange({ reach })
      return
    }
    /* Only the destructive direction waits. Turning an agent ON adds nothing
       and removes nothing — it makes rows available — so a confirmation there
       would be a question about a change with no cost. */
    const loses = profile.enabled.some((id) => attrOf(profile.mode, id)?.needsAgent)
    if (reach === 'agentless' && loses) setPendingReach(reach)
    else commitReach(reach)
  }

  return (
    <div className="bfp2__basic">
      {/* Only a kind with a collector to choose gets here: the page draws this
          tab for a trusted device alone. Kept as a guard because it is the one
          line that says why. */}
      {asksReach(profile.mode) && (
        <section className="bfp2__basicsec" ref={reachSection}>
          <header className="bfp2__sechead">
            <h2 id={reachId}>What it can read</h2>
            <TipDot
              label="What it can read"
              text="Decides which signals are available. Hardware identifiers need the Device Agent."
            />
          </header>
          {/* The section's own heading is the visible label, so a legend would
              print it twice. */}
          <ChoiceTiles
            labelledBy={reachId}
            options={reachChoices()}
            value={profile.reach}
            pending={pendingReach}
            onPick={pressReach}
          />

          {/* Named, not counted, and before it happens rather than after.
              "4 signals" is a number nobody can act on; the names are what say
              whether the ones going are ones you wanted. */}
          {pendingReach && (
            <div className="bfp2__confirm">
              <p className="bfp2__prereq">
                <AlertTriangle size={13} strokeWidth={2} aria-hidden />
                <span>
                  Removes {dropped.map((a) => a.name).join(', ')} and everything they are set to.
                  {profile.registration === 'pre-approved' &&
                    ' It also deletes the approved device roster, and users will register their own devices.'}
                </span>
              </p>
              <div className="bfp2__confirmacts">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    refocusReach.current = true
                    setPendingReach(null)
                  }}
                >
                  Keep {reachLabel(profile.reach).toLowerCase()}
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    refocusReach.current = true
                    commitReach(pendingReach)
                  }}
                >
                  Switch and remove {dropped.length}
                </Button>
              </div>
            </div>
          )}
        </section>
      )}

      <section className="bfp2__basicsec">
        <header className="bfp2__sechead">
          <h2>How devices enrol</h2>
          <TipDot
            label="How devices enrol"
            text="Signals decide whether a device is the same one as before. These settings decide whether a new device may be registered at all."
          />
        </header>
        <EnrolmentFields
          enabled={profile.enabled}
          mode={profile.mode}
          reach={profile.reach}
          registration={profile.registration}
          autoRegister={profile.autoRegister}
          maxDevices={profile.maxDevices}
          roster={profile.roster}
          onChange={onChange}
        />
      </section>
    </div>
  )
}

/* The catalogue, to add or remove: `AttrStep` — the same one-line list the
   create wizard's Choose step uses — in a drawer over the page. Save hands the
   picks to the page's draft; nothing is stored until the page's SaveBar says so.

   Closing with ticks that differ from the page asks first: Escape, the scrim
   and X used to drop them silently. */
function ChecksDrawer({
  open,
  profile,
  onClose,
  onSave,
  onBack,
}: {
  open: boolean
  profile: FingerprintProfile
  onClose: () => void
  onSave: (picked: string[]) => void
  /** Leaves for what the profile can read. Absent on a health profile. */
  onBack?: () => void
}) {
  const [picked, setPicked] = useState<string[]>(profile.enabled)
  /* What to do once the discard question is answered with Discard. */
  const [leaving, setLeaving] = useState<(() => void) | null>(null)

  /* Re-seeded as the drawer OPENS, and only then: a draft that re-synced while
     the panel was open would throw away what was just ticked every time the page
     behind it re-rendered. Done during render on the open edge rather than in an
     effect, so the first frame of the drawer already shows the right ticks. */
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setPicked(profile.enabled)
      setLeaving(null)
    }
  }

  const noun = ITEM_NOUN[profile.mode]
  const offered = offeredAttributes(profile.mode, profile.reach)
  const any = offered.some((a) => a.always || picked.includes(a.id))
  const reason = any ? null : profile.mode === 'os' ? 'Add at least one check.' : 'Add at least one signal.'
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((id) => b.includes(id))
  const changed = !same(picked, profile.enabled)

  const guarded = (run: () => void) => () => (changed ? setLeaving(() => run) : run())
  const close = guarded(onClose)

  return (
    <>
      <DiscardDialog
        open={leaving !== null}
        title={`Discard changes to ${noun.many}?`}
        onKeep={() => setLeaving(null)}
        onDiscard={() => {
          const run = leaving
          setLeaving(null)
          run?.()
        }}
      />
      <Drawer
        open={open}
        onClose={close}
        title={`Edit ${noun.many}`}
        caption={profile.name}
        /* `form`, 560: the kit's step for a one-column form, which is what a
           one-check-to-a-line list is. At 520 the enrolment row's label, the
           widest row the old create drawer at this width held, truncated. */
        width={560}
        actions={
          <>
            {reason && (
              <span className="bfp2__footreason" role="status">
                {reason}
              </span>
            )}
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button variant="brand" disabled={!any} title={reason ?? undefined} onClick={() => onSave(picked)}>
              Save
            </Button>
          </>
        }
      >
        <AttrStep
          mode={profile.mode}
          reach={profile.reach}
          picked={picked}
          setPicked={setPicked}
          onBack={onBack ? guarded(onBack) : undefined}
        />
      </Drawer>
    </>
  )
}

/* `RiskBands` stood here — the Allow-below / Challenge-below pair, and the
   ceiling check that kept them honest. It went with the "How it decides"
   section: a risk profile is its per-attribute tiers now, and a threshold
   editor for a score with no thresholds is a control with nothing behind it.

   The reachability warning went too, and that is the part worth naming. It
   existed to catch a band nobody could land in, which was the one mistake this
   editor could make silently. There is no band to mis-set any more, so the
   warning has nothing to warn about — but if thresholds ever come back, they
   come back with it. */

/* `Fact` stood here — one stated fact, a label and its value eleven characters
   apart, first in the old detail page's rail and last as Basic details' one
   read-only row, Profile type. The tab is the form now (`BasicDetailsForm`). */

/* The sheet's four stops, and the master's own value as the starting point.
   Printed as the number rather than a word, because the number is what the
   score adds up — "High" beside an invisible sum is the console's mistake. */

/* `WeightPick` moved to `tier-pick.tsx` as `TierPick`, unchanged in behaviour.

   A second screen — the risk signal profile — sets exactly this: how much one
   thing pushes a score, in three words. Two copies of a three-pill radiogroup
   drift in ordering, hue and accessible name, so there is one, and the two
   arguments that shaped it (three pills rather than a dropdown, three hues
   rather than three shades) travelled with it.

   The conversion stays here. This screen stores weights as numbers because the
   master sheet does, so it converts at its own edge with `tierOf` on the way in
   and `TIER_WEIGHT` on the way out — which is where a storage format belongs,
   not inside a control shared with a screen that stores tiers directly. */

/* `EditProfileDrawer` stood here — one Edit button, and everything about a
   profile that was not an attribute behind it: the name, the reach, how devices
   enrol.

   Its argument was that a page which STATES is easier to read than one that
   asks, so the facts sat in a rail and the questions sat in a drawer. The
   argument holds; the price was that a profile's own settings were never on the
   page, only a report of them, and reaching them cost a click through a door
   whose contents you could not see from outside.

   The tabs are the same separation done with less machinery: `Basic details`
   asks, the attribute tab asks, and neither hides behind the other. What
   survives of this component is all of its content and both of its careful
   parts — the reach switch still waits for a second press and still NAMES what
   it drops — now in `BasicDetailsTab`. What has gone is the door.

   Its `Done` action has gone too, and that is the deliberate half. `Done` meant
   "I have read this", because every control had already written through; the
   bar at the bottom of the page means "commit these", because now they have
   not.

   The door came back (owner, 15 Sep 2026): Basic details states its answers
   and one Edit opens `BasicDetailsDrawer`. Not this drawer again — the name
   stays the heading's pencil, the drawer's action is Apply into the page's
   draft rather than Done over a live write, and the page's footer still
   commits. What returned is only the split between reading and changing, on a
   tab where the report is the whole tab rather than a rail beside a form.

   It went again on 16 Sep 2026: the form is on the tab (`BasicDetailsForm`),
   with no Edit, drawer or Apply. */

/* `ReachDialog` stood here — a dialog of its own for the one destructive edit.

   It folded into `EditProfileDrawer`, then with it into `BasicDetailsTab`, and
   is now in `BasicDetailsForm`, on the Basic details tab, which is where the
   reach is asked. Its argument has survived every move intact: the change waits for a second press, and that press NAMES what it
   will take rather than counting it. What has gone is a dialog you reached
   through a button on a panel that also had an Edit, beside a page that had no
   way to rename anything. */

/* `SummaryDrawer` stood here — the whole profile with no controls in it, in
   reading order, for pasting into a change request.

   It went with the `Summary` button that opened it, and the button went because
   the page it sat on had become the thing it was summarising. When the profile
   was a rail of six facts and two drawers, a surface that stated everything at
   once was answering a question the page genuinely could not: what does this
   profile DO. The page answers that now — the fields are the facts, in the
   order the drawer used to print them — so the drawer had become a second
   rendering of one screen, and the failure mode of a second rendering is that
   it disagrees with the first.

   The one thing it did that the page does not is print a version with no
   controls in it. If that comes back it should come back as an export rather
   than as a drawer, because the audience for it was never the person editing. */

/* --- Helpers -------------------------------------------------------------------- */

/* Which policies name this profile, and which of their rules do.

   Zones got this right and fingerprints did not: the profile page said "used by
   3 rules" and stopped, which tells an admin that a change is dangerous without
   telling them where the danger is. Three is not actionable; three *named*
   policies are — you can go and read them before you save.

   It used to say the same shape as `policiesUsing` in ZonesFinal, deliberately.
   It is now literally the same function — see ./usage. */
