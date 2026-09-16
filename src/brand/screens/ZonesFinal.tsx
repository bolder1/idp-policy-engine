import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CirclePlus,
  Copy,
  Globe,
  Info,
  Layers,
  Link2,
  MapPin,
  Network,
  Pencil,
  Plus,
  Search,
  Trash2,
  Unlink,
  X,
} from 'lucide-react'

import { Button, Drawer, IconButton, Modal, NameField, RowMenu, SaveBar, SearchBox, type MenuItem } from '../kit'
import { PageHead } from '../Shell'
import { Picker } from '../picker'
import {
  ASN_DIRECTORY,
  emptyLocation,
  ipSectionEmpty,
  locationEmpty,
  nameTaken,
  newId,
  uniqueName,
  type Zone,
  type ZoneLocation,
} from '../data'
import { PLACES, coveredBy, placeContext, searchPlaces, type Place } from '../places'
import { useBrand } from '../store'
import { ChangeState, useLeaveGuard } from '../leave-guard'
import { EmptyState, NoMatches } from '../empty'
import { describeZone, explainBadEntry, validateZone } from './zone-validation'
import {
  hasEntry,
  locationEntries,
  normaliseEntry,
  parseEntries,
  takenZoneIds,
  zoneChanges,
  zoneReviewRows,
} from './zone-entries'
import { deleteImpact, policiesUsing } from './usage'
import { UsedByList } from './used-by'
import { ConfirmDelete } from './confirm-delete'
import { ListPager } from './list-pager'
import { usePagedList } from './paged-list'
import { LibraryRows, ViewSwitch, type LibRow } from './library-view'
import { PageBar } from './page-bar'
import { libRowHeight, useLibView, type LibView } from './library-view-state'

/* -----------------------------------------------------------------------------
   Zones.

   A zone has two halves, IP networks and locations, and both must match. An
   empty half matches any value, so a zone with neither matches everything and
   cannot be saved.

   The list pages to fit the window. New zone asks for a name and opens the
   zone's page; nothing is stored until that page's first save, so an empty zone
   never reaches the list or a rule picker. Every edit on the page lands in a
   draft that the save bar commits.
   -------------------------------------------------------------------------- */

type Shape = 'net' | 'loc' | 'both' | 'none'

/* Derived, never stored: which half of the zone actually constrains. */
function shapeOf(z: Zone): Shape {
  const net = !ipSectionEmpty(z)
  const loc = !locationEmpty(z.location)
  if (net && loc) return 'both'
  if (net) return 'net'
  if (loc) return 'loc'
  return 'none'
}

const SHAPE: Record<Shape, { icon: typeof Network; tint: string }> = {
  net: { icon: Network, tint: 'blue' },
  loc: { icon: Globe, tint: 'green' },
  both: { icon: Layers, tint: 'indigo' },
  none: { icon: AlertTriangle, tint: 'warn' },
}

type ZoneShapeFilter = 'all' | 'net' | 'loc'
const ZONE_SHAPE_OPTIONS: { value: ZoneShapeFilter; label: string }[] = [
  { value: 'all', label: 'All zones' },
  { value: 'net', label: 'Networks' },
  { value: 'loc', label: 'Locations' },
]
const SHAPE_FILTER: Record<Exclude<ZoneShapeFilter, 'all'>, Shape[]> = {
  net: ['net', 'both'],
  loc: ['loc', 'both'],
}

/** Longest zone name the dialogs and rename accept. */
const NAME_MAX = 50

/* The paged list's row height is the view's now — `libRowHeight`. */

const NAME_IN_USE = 'A zone with this name already exists.'

const ZONE_MENU: MenuItem[] = [
  { id: 'open', label: 'Edit', icon: Pencil },
  { id: 'duplicate', label: 'Duplicate', icon: Copy },
  { id: 'uses', label: 'Used by', icon: Link2 },
  { id: 'delete', label: 'Delete', icon: Trash2, danger: true, divide: true },
]

/* After a delete the row, its menu and the dialog are all gone. Focus the row
   that took its place, or the search box, or the empty state's button. */
function focusRowOrSearch(rowId: string | undefined, searchRef: RefObject<HTMLElement | null>) {
  window.setTimeout(() => {
    const row = rowId
      ? document.querySelector<HTMLElement>(`[data-zone-id="${CSS.escape(rowId)}"] .blist__open`)
      : null
    const search = searchRef.current
    const target =
      row ?? (search?.isConnected ? search : document.querySelector<HTMLElement>('.bz7 .bempty__action button'))
    target?.focus({ preventScroll: true })
  }, 0)
}

/* The zone page after it replaces the list or remounts on a new id. */
const focusZoneHeading = () =>
  window.setTimeout(
    () => document.querySelector<HTMLElement>('.bz7__pagehead h1')?.focus({ preventScroll: true }),
    0,
  )

export function ZonesFinal() {
  const store = useBrand()
  const [q, setQ] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  /* A zone that has a name and nothing else yet. Held here, not in the store,
     until the zone page saves it. */
  const [creating, setCreating] = useState<Zone | null>(null)
  const open = openId ? store.zones.find((z) => z.id === openId) ?? null : null
  const detail = creating ?? open
  const searchRef = useRef<HTMLInputElement | null>(null)
  /* The one filter this page exposes: what a zone is made of. */
  const [shape, setShape] = useState<ZoneShapeFilter>('all')

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    /* A zone with both halves is in both filters: it IS a network zone, and a
       location zone. */
    const byShape = shape === 'all' ? store.zones : store.zones.filter((z) => SHAPE_FILTER[shape].includes(shapeOf(z)))
    if (!needle) return byShape
    const hit = (v: string | undefined) => !!v && v.toLowerCase().includes(needle)
    return byShape.filter(
      (z) =>
        hit(z.name) ||
        z.ip.some(hit) ||
        /* The operator names the row shows, not only the AS numbers. */
        z.asn.some((a) => hit(a) || hit(ASN_DIRECTORY[a])) ||
        [...z.location.countries, ...z.location.states, ...z.location.cities].some(hit) ||
        hit(z.location.radius?.label),
    )
  }, [store.zones, q, shape])

  const [view, setView] = useLibView('zones')
  const paged = usePagedList(shown, {
    rowHeight: libRowHeight(view),
    grid: view === 'card',
    resetKey: [q, shape, view],
  })

  const [naming, setNaming] = useState(false)
  const [duping, setDuping] = useState<Zone | null>(null)
  const [deleting, setDeleting] = useState<Zone | null>(null)
  /* The zone whose "Used by" drawer is open, from its row menu. Up here rather
     than on the zone page: which rules name a zone is a question asked of the
     list, beside Duplicate and Delete, and answering it should not mean opening
     the zone and its draft. */
  const [usesFor, setUsesFor] = useState<Zone | null>(null)
  const usesUsers = usesFor ? policiesUsing('zone', usesFor.id, store.policies) : []

  const allNames = store.zones.map((z) => z.name)
  /* Not only the zones that exist: a deleted zone's id may still be named by a rule. */
  const allIds = takenZoneIds(store.zones, store.policies)

  const remove = (z: Zone) => {
    const at = shown.findIndex((x) => x.id === z.id)
    const next = at === -1 ? undefined : (shown[at + 1] ?? shown[at - 1])?.id
    store.removeZone(z.id)
    setDeleting(null)
    /* Only ever from a list row: the zone page has no Delete, so there is no open
       page or draft to close here. */
    store.showToast(`${z.name} deleted`)
    focusRowOrSearch(next, searchRef)
  }

  const duplicate = (z: Zone, name: string) => {
    const id = store.addZone({
      ...z,
      id: newId('z', allIds, name),
      name,
      /* Copied, not aliased: the copy must not share arrays with the original. */
      ip: [...z.ip],
      asn: [...z.asn],
      location: { ...z.location },
      kind: 'custom',
      usedIn: 0,
    })
    setDuping(null)
    /* Opened, so the copy is on screen: in a filtered or paged list it could be
       hidden, and "created" would look untrue. */
    setQ('')
    setOpenId(id)
    store.showToast(`${name} created`)
    focusZoneHeading()
  }

  const startCreate = (name: string) => {
    setCreating({ ...blank(), id: newId('z', allIds, name), name })
    setNaming(false)
    focusZoneHeading()
  }

  const openZone = (id: string) => {
    setOpenId(id)
    focusZoneHeading()
  }

  return (
    /* Compact only while the list shows: the zone page keeps the full width. */
    <div className={detail ? 'bpage bz7' : 'bpage bpage--compact bz7'}>
      {detail ? (
        /* Keyed so opening another zone starts from that zone, not the last draft.
           A new zone is stored under the id it was given here, so its first save
           keeps the page, its tab and its focus instead of remounting. */
        <ZoneDetail
          key={detail.id}
          zone={detail}
          isNew={!!creating}
          otherNames={store.zones.filter((z) => z.id !== detail.id).map((z) => z.name)}
          onBack={() => {
            /* Back on the list, on the row this page was about. */
            setCreating(null)
            setOpenId(null)
            focusRowOrSearch(creating ? undefined : detail.id, searchRef)
          }}
          onSave={(z) => {
            if (creating) {
              const id = store.addZone(z)
              setCreating(null)
              setOpenId(id)
              store.showToast(`${z.name} created`)
              /* Stored under another id only if this one was taken meanwhile; the page then remounts. */
              if (id !== z.id) focusZoneHeading()
            } else {
              store.updateZone(z)
              store.showToast(`${z.name} saved`)
            }
          }}
        />
      ) : (
        <>
          <PageHead title="Zones" caption="IP networks and locations that policy rules reference." />

          {store.zones.length === 0 ? (
            <EmptyState
              icon={Network}
              title="No zones yet"
              blurb="A zone names IP networks and locations for use in policy rules."
              action={
                <Button variant="brand" icon={Plus} onClick={() => setNaming(true)}>
                  New zone
                </Button>
              }
            />
          ) : (
            <>
              {/* The row every list page has — see `PageBar`: the search box,
                  then the filter; the view and New zone on the right. Hidden
                  with the list: the empty state offers the same New zone. */}
              <PageBar
                left={
                  <>
                    <SearchBox
                      value={q}
                      onChange={setQ}
                      inputRef={searchRef}
                      placeholder="Search zones, networks or places…"
                      label="Search zones"
                    />
                    <span className={`btoolbar__filter bbar__filter ${shape !== 'all' ? 'is-set' : ''}`}>
                      <Picker
                        label="Filter by what a zone is made of"
                        size="md"
                        prefix="Show"
                        value={shape}
                        options={ZONE_SHAPE_OPTIONS}
                        onChange={(v) => setShape(v as ZoneShapeFilter)}
                      />
                    </span>
                  </>
                }
                right={
                  <>
                    <ViewSwitch value={view} onChange={setView} label="Zone view" />
                    <Button variant="brand" icon={Plus} onClick={() => setNaming(true)}>
                      New zone
                    </Button>
                  </>
                }
              />

              {shown.length === 0 ? (
                <NoMatches
                  noun="zones"
                  query={q}
                  filtered={shape !== 'all'}
                  onClear={() => {
                    setQ('')
                    setShape('all')
                  }}
                />
              ) : (
                <>
                  <ZoneList
                    view={view}
                    zones={paged.pageRows}
                    listRef={paged.listRef}
                    onOpen={openZone}
                    onDuplicate={setDuping}
                    onUses={setUsesFor}
                    onDelete={setDeleting}
                  />
                  <ListPager {...paged.pager} label="Zone pages" />
                </>
              )}
            </>
          )}

          <Drawer
            open={!!usesFor}
            onClose={() => setUsesFor(null)}
            title="Used by"
            caption={`Policy rules that use ${usesFor?.name ?? ''}.`}
          >
            {usesUsers.length === 0 ? (
              <EmptyState compact icon={Unlink} title="Not used by any policy" blurb="No policy rule uses this zone." />
            ) : (
              <UsedByList users={usesUsers} />
            )}
          </Drawer>
        </>
      )}

      <NameOnlyModal open={naming} names={allNames} onClose={() => setNaming(false)} onCreate={startCreate} />
      <DuplicateZoneModal
        zone={duping}
        names={allNames}
        onClose={() => setDuping(null)}
        onDuplicate={duplicate}
      />
      <ConfirmDelete
        open={!!deleting}
        name={deleting?.name ?? ''}
        noun="zone"
        impact={deleting ? deleteImpact('zone', deleting.id, store.policies) : undefined}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && remove(deleting)}
      />
    </div>
  )
}

/* --- Chips and bands -------------------------------------------------------------- */

/* "Any network", "Any location": the half that constrains nothing. Tinted with
   the info tone the validator grades that state as. */
export function AnyBand({ what }: { what: string }) {
  return <span className="bz7__any">Any {what}</span>
}

function addressBits(z: Zone): string[] {
  const out: string[] = []
  /* Addresses are counted; ASNs are named, because an operator name is
     recognisable and an address is not. */
  if (z.ip.length) out.push(`${z.ip.length} network${z.ip.length === 1 ? '' : 's'}`)
  for (const a of z.asn) out.push(ASN_DIRECTORY[a] ?? a)
  return out
}

function placeBits(l: ZoneLocation): string[] {
  return locationEntries(l)
}

export function Chips({ items, max = 3 }: { items: string[]; max?: number }) {
  const rest = items.length - max
  return (
    <>
      {/* Keyed by position too: a state and a city can share a name (Berlin). */}
      {items.slice(0, max).map((v, i) => (
        <i className="bz7__chip" key={`${i}-${v}`}>
          {v}
        </i>
      ))}
      {rest > 0 && <i className="bz7__chip is-more">+{rest}</i>}
    </>
  )
}

/* --- List ------------------------------------------------------------------------- */

function ZoneList({
  view,
  zones,
  listRef,
  onOpen,
  onDuplicate,
  onUses,
  onDelete,
}: {
  view: LibView
  zones: Zone[]
  listRef: (el: HTMLElement | null) => void
  onOpen: (id: string) => void
  onDuplicate: (z: Zone) => void
  onUses: (z: Zone) => void
  onDelete: (z: Zone) => void
}) {
  /* Table, list or card — the one shape `LibraryRows` draws for every library. */
  const rows: LibRow[] = zones.map((z) => {
    const meta = SHAPE[shapeOf(z)]
    return {
      id: z.id,
      name: z.name,
      tile: <meta.icon size={18} strokeWidth={1.8} />,
      tileClass: `bz7__tile is-${meta.tint}`,
      attrs: { 'data-zone-id': z.id },
      onOpen: () => onOpen(z.id),
      facts: [
        {
          label: 'Networks',
          value: ipSectionEmpty(z) ? <AnyBand what="network" /> : <Chips items={addressBits(z)} max={2} />,
        },
        {
          label: 'Locations',
          value: locationEmpty(z.location) ? <AnyBand what="location" /> : <Chips items={placeBits(z.location)} max={2} />,
        },
      ],
      /* No used-by count on the row: the menu's Used by opens the rules in a drawer. */
      menu: (
        <RowMenu
          label={`Actions for ${z.name}`}
          items={ZONE_MENU}
          onSelect={(id) => {
            if (id === 'open') onOpen(z.id)
            else if (id === 'duplicate') onDuplicate(z)
            else if (id === 'uses') onUses(z)
            else if (id === 'delete') onDelete(z)
          }}
        />
      ),
    }
  })
  return <LibraryRows view={view} rows={rows} columns={['Networks', 'Locations']} listRef={listRef} nameColumn="Zone" />
}

/* --- Zone page ---------------------------------------------------------------------- */

/* Why Save is blocked, per validator error. Shown in the save bar and the leave dialog. */
const ZONE_BLOCKED: Record<string, string> = {
  name: 'Enter a zone name.',
  dupname: NAME_IN_USE,
  empty: 'Add an IP network or a location.',
  badip: 'Fix the entries that are not valid.',
  badasn: 'Fix the ASNs that are not valid.',
}

const ROWS_NOT_ADDED = 'Fix or remove the entries that were not added.'

/** Rows still in the IP networks list that are not part of the draft yet. */
type Pending = { typed: number; unread: number }

function ZoneDetail({
  zone,
  isNew,
  otherNames,
  onBack,
  onSave,
}: {
  zone: Zone
  /** Not stored yet: the first save creates it. */
  isNew: boolean
  /** Every other zone's name, for the duplicate-name check. */
  otherNames: string[]
  onBack: () => void
  onSave: (z: Zone) => void
}) {
  /* The edit buffer. A zone is what live rules match against, so nothing here
     writes to the store until the save bar commits. */
  const [draft, setDraft] = useState<Zone>(zone)
  const [pending, setPending] = useState<Pending>({ typed: 0, unread: 0 })
  /* Bumped by Save, so the sections drop their half-typed rows, filter and
     notes along with the draft they were typed against. */
  const [resetKey, setResetKey] = useState(0)

  /* Dirty only once something has actually changed. A zone just named in the
     dialog is not stored yet, but it opens clean all the same: an unsaved pill
     and a save footer on a page nobody has touched ask for a review of nothing.
     Leaving it untouched goes straight back, since the name is all there is to
     lose and the dialog is one click away.
     Read off the same comparison the footer describes, which treats each list
     as a set: an entry removed and typed back in lands at the end of its list,
     and an order-sensitive check called that a change with nothing to name. */
  const changes = zoneChanges(zone, draft)
  const dirty = changes.length > 0 || pending.typed > 0

  /* Renaming in place. The input holds a half-typed name that Escape can throw
     away; a committed rename lands in the draft like every other edit. */
  const [renaming, setRenaming] = useState(false)
  const [draftName, setDraftName] = useState(zone.name)
  const [nameErr, setNameErr] = useState<string | null>(null)
  /* The pencil's wrapper, there so focus can return to it: IconButton takes no ref. */
  const renameSlot = useRef<HTMLSpanElement | null>(null)
  const focusRename = () =>
    window.setTimeout(() => renameSlot.current?.querySelector('button')?.focus({ preventScroll: true }), 0)

  /* Why the typed name cannot be used, or null when it can. Worked out from the
     render rather than the error on show: the field closing after a press asks
     again once the keep has landed, and the error may not have been set yet. */
  const nameProblem = !draftName.trim()
    ? 'Enter a zone name.'
    : nameTaken(draftName.trim(), otherNames)
      ? NAME_IN_USE
      : null

  /* Puts a usable name in the draft, or shows why it is not one and leaves the
     field open to fix it. Does not close the field: that is `commitName` for
     Enter and the tick, and the kit's `onClose` for focus leaving. */
  const keepName = () => {
    if (nameProblem) {
      setNameErr(nameProblem)
      return false
    }
    const name = draftName.trim()
    setNameErr(null)
    setDraftName(name)
    if (name !== draft.name) setDraft((d) => ({ ...d, name }))
    return true
  }

  const commitName = () => {
    if (!keepName()) return
    setRenaming(false)
    focusRename()
  }

  const cancelName = () => {
    setDraftName(draft.name)
    setNameErr(null)
    setRenaming(false)
    focusRename()
  }

  /* The draft is validated, not the saved zone: the warnings are about what
     Save would commit. */
  const issues = validateZone(draft, otherNames)

  const blockedBy = issues.find((i) => i.level === 'error')
  const blockedReason =
    pending.unread > 0
      ? ROWS_NOT_ADDED
      : blockedBy
        ? (ZONE_BLOCKED[blockedBy.id] ?? `${blockedBy.title}.`)
        : null

  /* No discard here: the footer has none, and leaving through the leave dialog's
     Discard unmounts this page and its draft together. */
  const commit = () => {
    onSave(draft)
    setResetKey((k) => k + 1)
  }

  const confirmLeave = useLeaveGuard({
    dirty,
    save: () => {
      if (blockedReason) return false
      commit()
      return true
    },
    saveLabel: isNew ? 'Create zone' : 'Save',
    blocked: blockedReason,
  })

  if (pending.typed > 0 && !changes.includes('IP networks')) changes.push('IP networks')

  const netCount = draft.ip.length + draft.asn.length
  const placeCount = locationEntries(draft.location).length

  /* Opens on the half that has something in it; an empty zone opens on IP networks. */
  const [tab, setTab] = useState<'net' | 'place'>(netCount === 0 && placeCount > 0 ? 'place' : 'net')

  return (
    <>
      <button type="button" className="bz7__back" onClick={() => confirmLeave(onBack)}>
        <ArrowLeft size={14} strokeWidth={2} aria-hidden />
        All zones
      </button>

      <header className="bz7__pagehead">
        <div className="bz7__namewrap">
          <div className={`bz7__titleline ${renaming ? 'is-renaming' : ''}`}>
            {renaming ? (
              /* The kit's rename chrome: the count under the field, and a cross and
                 a tick under its right edge for anyone who reaches for a pointer
                 rather than Enter or Escape. The commit rules stay this page's.
                 Focus leaving the field keeps a usable name and closes; a name
                 that cannot be used shows its error and the field stays open, as
                 the tick would leave it. When a leave counts is the kit's. */
              <NameField
                value={draftName}
                max={NAME_MAX}
                label="Zone name"
                errorId={nameErr ? 'bz7-name-err' : undefined}
                invalid={!!nameErr}
                onChange={(v) => {
                  setDraftName(v)
                  setNameErr(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    commitName()
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    cancelName()
                  }
                }}
                /* A bad name says so at close, not on leave. The error line sits
                   in the flow under the field; shown on the mousedown that left,
                   it pushed the tabs down under the pointer and the click that
                   left never landed. The kit runs the close after that click. */
                onLeave={() => {
                  if (!nameProblem) keepName()
                }}
                onClose={() => {
                  if (nameProblem) setNameErr(nameProblem)
                  else setRenaming(false)
                }}
                onApply={commitName}
                onCancel={cancelName}
              />
            ) : (
              <>
                <h1 tabIndex={-1}>{draft.name}</h1>
                {/* Beside the name it renames and always shown, not a hover reveal:
                    a control that only appears under a pointer is not there for
                    anyone reading the page, or moving through it with Tab. */}
                <span className="bz7__pencil" ref={renameSlot}>
                  <IconButton
                    icon={Pencil}
                    size="sm"
                    tone="ghost"
                    label="Rename"
                    onClick={() => {
                      setDraftName(draft.name)
                      setNameErr(null)
                      setRenaming(true)
                    }}
                  />
                </span>
              </>
            )}
            <ChangeState unsaved={dirty} />
          </div>
          {nameErr && (
            <p className="bz7__fielderr" id="bz7-name-err" role="alert">
              {nameErr}
            </p>
          )}
          <p>{describeZone(draft)}</p>
        </div>
        {/* No action trail on the right. Rename is the pencil above; Duplicate,
            Used by and Delete are questions about a zone on the list, and live
            in its row menu there. */}
      </header>

      <section className="bz7__build">
        <div
          className="bz7__buildtabs"
          role="tablist"
          aria-label="What this zone matches on"
          /* Arrow keys, Home and End move between the two tabs; Tab moves on to the panel. */
          onKeyDown={(e) => {
            const other = tab === 'net' ? 'place' : 'net'
            const to =
              e.key === 'Home'
                ? 'net'
                : e.key === 'End'
                  ? 'place'
                  : e.key === 'ArrowLeft' || e.key === 'ArrowRight'
                    ? other
                    : null
            if (!to) return
            e.preventDefault()
            setTab(to)
            document.getElementById(to === 'net' ? 'bz7-tab-net' : 'bz7-tab-place')?.focus()
          }}
        >
          <button
            type="button"
            role="tab"
            id="bz7-tab-net"
            tabIndex={tab === 'net' ? 0 : -1}
            aria-selected={tab === 'net'}
            aria-controls="bz7-panel-net"
            className={tab === 'net' ? 'is-on' : ''}
            onClick={() => setTab('net')}
          >
            <Network size={14} strokeWidth={1.9} aria-hidden />
            IP networks
          </button>
          <button
            type="button"
            role="tab"
            id="bz7-tab-place"
            tabIndex={tab === 'place' ? 0 : -1}
            aria-selected={tab === 'place'}
            aria-controls="bz7-panel-place"
            className={tab === 'place' ? 'is-on' : ''}
            onClick={() => setTab('place')}
          >
            <Globe size={14} strokeWidth={1.9} aria-hidden />
            Locations
          </button>
        </div>

        <div className="bz7__cols">
          <div className="bz7__work">
            {/* Both panels stay mounted, so a half-typed row survives a tab switch. */}
            <div role="tabpanel" id="bz7-panel-net" aria-labelledby="bz7-tab-net" hidden={tab !== 'net'}>
              <AddressSection key={`net-${resetKey}`} draft={draft} onChange={setDraft} onPending={setPending} />
            </div>
            <div role="tabpanel" id="bz7-panel-place" aria-labelledby="bz7-tab-place" hidden={tab !== 'place'}>
              <PlaceSection key={`place-${resetKey}`} draft={draft} onChange={setDraft} />
            </div>
          </div>

          <aside className="bz7__aside">
            {tab === 'net' ? <AcceptsNote /> : <PlacesNote />}

            {issues.length > 0 && (
              <div className="bz7__issues">
                {issues.map((i) => (
                  <p key={i.id} className={`bz7__issue is-${i.level}`}>
                    <AlertTriangle size={14} strokeWidth={1.9} aria-hidden />
                    <span>
                      <strong>{i.title}.</strong> {i.detail}
                    </span>
                  </p>
                ))}
              </div>
            )}
          </aside>
        </div>
      </section>

      {/* Blocked while the draft has an error, with the reason in the bar. */}
      <SaveBar
        open={dirty}
        changes={isNew ? ['New zone'] : changes}
        saveLabel={isNew ? 'Create zone' : 'Save changes'}
        onSave={commit}
        blocked={!!blockedReason}
        blockedReason={blockedReason ?? undefined}
        review={zoneReviewRows(isNew ? { ...zone, name: '' } : zone, draft)}
      />
    </>
  )
}

const blank = (): Zone => ({
  id: '',
  name: '',
  /* Nothing on this page surfaces the classification, so everything it makes is custom. */
  kind: 'custom',
  ip: [],
  asn: [],
  location: emptyLocation(),
  usedIn: 0,
})

/* --- Duplicating -----------------------------------------------------------------
   Asks for the name with the next free one typed in, and says what the copy
   takes with it. */
function DuplicateZoneModal({
  zone,
  names,
  onClose,
  onDuplicate,
}: {
  zone: Zone | null
  names: string[]
  onClose: () => void
  onDuplicate: (from: Zone, name: string) => void
}) {
  const [name, setName] = useState('')

  /* Seeded on the way in, so reopening on a different zone does not offer the
     last one's name. `names` is read, not watched: the list does not change
     while the dialog is open. */
  useEffect(() => {
    if (zone) setName(uniqueName(zone.name, names, NAME_MAX))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zone])

  if (!zone) return null

  const nets = zone.ip.length + zone.asn.length
  const places = locationEntries(zone.location).length
  const parts = [
    nets > 0 && `${nets} network ${nets === 1 ? 'entry' : 'entries'}`,
    places > 0 && `${places} ${places === 1 ? 'location' : 'locations'}`,
  ].filter(Boolean) as string[]
  /* A zone with nothing in it matches everything; copying one would make a second. */
  const empty = parts.length === 0

  const clean = name.trim()
  const taken = nameTaken(clean, names)
  const ok = !!clean && !taken && !empty
  const go = () => ok && onDuplicate(zone, clean)

  return (
    <Modal
      open
      onClose={onClose}
      title="Duplicate zone"
      width={480}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="brand" disabled={!ok} onClick={go}>
            Duplicate
          </Button>
        </>
      }
    >
      <div className="bz7__form">
        <label className="bz7__field">
          <span>Name</span>
          <input
            type="text"
            value={name}
            autoFocus
            maxLength={NAME_MAX}
            aria-invalid={taken ? true : undefined}
            aria-describedby={taken ? 'bz7-dup-err' : undefined}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                go()
              }
            }}
          />
          {taken && (
            <span className="bz7__fielderr" id="bz7-dup-err">
              {NAME_IN_USE}
            </span>
          )}
        </label>

        <p className="bz7__dupnote">
          <Copy size={14} strokeWidth={1.9} aria-hidden />
          <span>
            {empty
              ? 'This zone has no networks or locations.'
              : `Copies ${parts.join(' and ')}. No policy rule uses the copy until you add it to one.`}
          </span>
        </p>
      </div>
    </Modal>
  )
}

/* --- New zone ------------------------------------------------------------------------
   One field, then the zone page. The zone is stored when that page first saves. */
function NameOnlyModal({
  open,
  names,
  onClose,
  onCreate,
}: {
  open: boolean
  names: string[]
  onClose: () => void
  onCreate: (name: string) => void
}) {
  const [name, setName] = useState('')

  /* Cleared when it opens: the Modal only unmounts its children, so this state
     would otherwise keep the last name. */
  useEffect(() => {
    if (open) setName('')
  }, [open])

  const clean = name.trim()
  const taken = nameTaken(clean, names)
  const ok = !!clean && !taken
  const go = () => ok && onCreate(clean)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New zone"
      width={480}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="brand" disabled={!ok} onClick={go}>
            Continue
          </Button>
        </>
      }
    >
      <label className="bz7__field">
        <span>Name</span>
        <input
          type="text"
          value={name}
          autoFocus
          maxLength={NAME_MAX}
          placeholder="Pune office"
          aria-invalid={taken ? true : undefined}
          aria-describedby={taken ? 'bz7-new-err' : undefined}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              go()
            }
          }}
        />
        {taken && (
          <span className="bz7__fielderr" id="bz7-new-err">
            {NAME_IN_USE}
          </span>
        )}
      </label>
    </Modal>
  )
}

/* --- IP networks ---------------------------------------------------------------------
   One field for addresses, blocks, ranges and ASNs. */

/* THIS IP IS MOCKED. A browser cannot see its own public address without a
   server, so this is a documentation-range placeholder for what the real console
   would fill from the request. */
const CURRENT_IP = '203.0.113.42'

const QUICK: { label: string; value: string; hint: string }[] = [
  { label: 'My current IP', value: CURRENT_IP, hint: 'The address this session comes from' },
]

export function AcceptsNote() {
  return (
    <div className="bz7__side">
      <h3 className="bz7__sidehead">
        <Info size={14} strokeWidth={2} aria-hidden />
        What you can add
      </h3>
      <ul className="bz7__sidelist">
        <li>
          <code>10.0.0.1</code>
          <em>An IPv4 or IPv6 address</em>
        </li>
        <li>
          <code>192.168.0.0/24</code>
          <em>A CIDR block</em>
        </li>
        <li>
          <code>192.168.0.1-192.168.0.254</code>
          <em>An IPv4 range</em>
        </li>
        <li>
          <code>AS15169</code>
          <em>An ASN</em>
        </li>
      </ul>
      <p className="bz7__sidep">
        Paste a list to add several at once. Entries that can't be read stay in the row.
      </p>
    </div>
  )
}

export function PlacesNote() {
  return (
    <div className="bz7__side">
      <h3 className="bz7__sidehead">
        <Info size={14} strokeWidth={2} aria-hidden />
        What you can add
      </h3>
      <ul className="bz7__sidelist">
        <li>
          <code>India</code>
          <em>A country</em>
        </li>
        <li>
          <code>Maharashtra</code>
          <em>A state or region</em>
        </li>
        <li>
          <code>Pune</code>
          <em>A city</em>
        </li>
      </ul>
      <p className="bz7__sidep">
        A country covers its states and cities, and a state covers its cities. Adding the wider place
        removes the narrower ones.
      </p>
      <p className="bz7__sidep">Matched on the sign-in's IP address. A VPN shows where it exits.</p>
    </div>
  )
}

/* Focus the item now at `index` in a section's list, or the one before it, or
   the section's add control. Used after a remove takes the focused row away.
   Takes the ref, not the element: removing the last row swaps the section for
   its empty state, and the element the remove started in is gone by then. */
function focusInSection(sectionRef: RefObject<HTMLElement | null>, selector: string, index: number) {
  window.setTimeout(() => {
    const section = sectionRef.current
    if (!section?.isConnected) return
    const items = section.querySelectorAll<HTMLElement>(selector)
    const target =
      items[index] ?? items[index - 1] ?? section.querySelector<HTMLElement>('.bz7__addrow, .bempty__action button')
    target?.focus({ preventScroll: true })
  }, 0)
}

/* One line of the IP networks list: a field, and the draft entry it stands for. */
interface NetRow {
  key: number
  /** What the field shows: the entry as stored, or what is being typed over it. */
  text: string
  /** The draft entry this row holds, or null while it holds nothing yet. */
  value: string | null
  err: string | null
}

let netRowSeq = 0
const netRow = (value: string): NetRow => ({ key: ++netRowSeq, text: value, value, err: null })

const ALREADY_IN = 'Already in this zone.'

const unreadMessage = (bad: string[]) =>
  bad.length === 1 ? explainBadEntry(bad[0]) : `${bad.length} entries could not be read.`

export function AddressSection({
  draft,
  onChange,
  onPending,
}: {
  draft: Zone
  onChange: (z: Zone) => void
  /** Told how many rows hold text that is not in the draft, and how many of those failed. */
  onPending?: (p: Pending) => void
}) {
  const sectionRef = useRef<HTMLElement | null>(null)
  const [filter, setFilter] = useState('')
  /* Rows committed while a filter was on. They stay shown until the filter
     changes, whether or not their new entry matches it: a fixed entry that no
     longer matches would otherwise vanish from under the caret, and take focus
     with it, the moment Enter or a blur commits it. */
  const [stay, setStay] = useState<ReadonlySet<number>>(() => new Set())
  const changeFilter = (next: string) => {
    setFilter(next)
    setStay(new Set())
  }
  /* What the last add did, so a large paste reports how much landed. */
  const [note, setNote] = useState<string | null>(null)

  /* Every entry is a field, all the time. There was a display row that opened
     into an editor on click, a pencil that appeared on hover, and a tick to
     confirm; for a list of short strings that was three states to learn where
     one does. Click a row and you are typing in it. A row commits when it is
     left or on Enter, and one that cannot be read keeps its text and says why
     under it. Addresses first, then ASNs, as the draft files them. */
  const [rows, setRows] = useState<NetRow[]>(() => [...draft.ip, ...draft.asn].map(netRow))

  /* Kept level with the draft when something else changes it: Quick add, or
     Remove all. A row whose entry left the draft goes; an entry with no row gets
     one at the end. A row that holds nothing yet is somebody typing, and stays. */
  useEffect(() => {
    setRows((rs) => {
      const entries = [...draft.ip, ...draft.asn]
      const inDraft = new Set(entries)
      const kept = rs.filter((r) => r.value === null || inDraft.has(r.value))
      const held = new Set(kept.map((r) => r.value))
      const missing = entries.filter((v) => !held.has(v))
      return kept.length === rs.length && missing.length === 0 ? rs : [...kept, ...missing.map(netRow)]
    })
  }, [draft.ip, draft.asn])

  const typed = rows.filter((r) => r.text.trim() !== '' && r.text !== r.value).length
  const unread = rows.filter((r) => r.text.trim() !== '' && r.err !== null).length
  useEffect(() => {
    onPending?.({ typed, unread })
  }, [typed, unread, onPending])
  /* A section that unmounts takes its rows with it. */
  useEffect(() => () => onPending?.({ typed: 0, unread: 0 }), [onPending])

  const patchRow = (key: number, patch: Partial<NetRow>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  const addRow = () => {
    const row: NetRow = { key: ++netRowSeq, text: '', value: null, err: null }
    setRows((rs) => [...rs, row])
    /* Scrolled to, not only focused: in a long list the new row is below the fold. */
    window.setTimeout(() => sectionRef.current?.querySelector<HTMLElement>(`[data-row="${row.key}"]`)?.focus(), 0)
  }

  /* The draft's two lists without one entry. */
  const without = (value: string | null) =>
    value === null
      ? { ip: draft.ip, asn: draft.asn }
      : { ip: draft.ip.filter((x) => x !== value), asn: draft.asn.filter((x) => x !== value) }

  /* Only while a filter narrows the list: without one every row shows anyway. */
  const keepShown = (keys: number[]) => {
    if (filter.trim()) setStay((s) => new Set([...s, ...keys]))
  }

  /* Commits one row into the draft. Says whether it landed, failed and kept its
     text, or took the row away with it. */
  const commitRow = (key: number): 'clean' | 'error' | 'dropped' => {
    const row = rows.find((r) => r.key === key)
    if (!row) return 'dropped'
    const raw = row.text.trim()
    const base = without(row.value)
    /* Split the way a paste is split, so "10.0.0.1," is one entry and not a typo. */
    const parsed = parseEntries(raw, [], [])
    const tokens = parsed.ip.length + parsed.asn.length + parsed.bad.length

    /* Emptied: a new row goes, and an entry cleared out of its row leaves the zone. */
    if (tokens === 0) {
      if (row.value !== null) onChange({ ...draft, ...base })
      setRows((rs) => rs.filter((r) => r.key !== key))
      return 'dropped'
    }

    const single = tokens === 1 ? (parsed.ip[0] ?? parsed.asn[0] ?? null) : null

    /* The same entry, give or take case and spacing. Nothing to commit, and the
       row shows it as stored, so a click in and out never reads as an edit. */
    if (row.value !== null && single !== null && single === normaliseEntry(row.value)) {
      if (row.text !== row.value || row.err) patchRow(key, { text: row.value, err: null })
      return 'clean'
    }

    if (tokens === 1) {
      /* Not readable: the text stays to be fixed, and the draft keeps what this row held. */
      if (single === null) {
        patchRow(key, { err: explainBadEntry(parsed.bad[0]) })
        return 'error'
      }
      if (hasEntry([...base.ip, ...base.asn], single)) {
        patchRow(key, { err: ALREADY_IN })
        return 'error'
      }
      const asAsn = parsed.asn.length === 1
      const wasAsn = row.value !== null && draft.asn.includes(row.value)
      let { ip, asn } = base
      if (row.value !== null && asAsn === wasAsn) {
        /* Same kind: replaced where it stood, so a fixed typo is not a remove and a re-add. */
        if (asAsn) asn = draft.asn.map((x) => (x === row.value ? single : x))
        else ip = draft.ip.map((x) => (x === row.value ? single : x))
      } else if (asAsn) {
        asn = [...base.asn, single]
      } else {
        ip = [...base.ip, single]
      }
      onChange({ ...draft, ip, asn })
      patchRow(key, { text: single, value: single, err: null })
      keepShown([key])
      setNote(null)
      return 'clean'
    }

    /* Several at once, pasted or typed. What reads joins the zone in place of
       what this row held; what does not stays in the row, with the reason. */
    const res = parseEntries(raw, base.ip, base.asn)
    const added = [...res.ip.slice(base.ip.length), ...res.asn.slice(base.asn.length)]
    if (added.length === 0) {
      patchRow(key, res.bad.length > 0 ? { text: res.bad.join(' '), err: unreadMessage(res.bad) } : { err: ALREADY_IN })
      setNote(null)
      return 'error'
    }

    onChange({ ...draft, ip: res.ip, asn: res.asn })
    setNote(`${added.length} ${added.length === 1 ? 'entry' : 'entries'} added`)
    if (res.bad.length > 0) {
      /* The added ones land above the row still being fixed, which stays where the caret is. */
      const fresh = added.map(netRow)
      const left = { text: res.bad.join(' '), value: null, err: unreadMessage(res.bad) }
      setRows((rs) => rs.flatMap((r) => (r.key === key ? [...fresh, { ...r, ...left }] : [r])))
      keepShown(fresh.map((r) => r.key))
      return 'error'
    }
    const [first, ...rest] = added
    const fresh = rest.map(netRow)
    setRows((rs) => rs.flatMap((r) => (r.key === key ? [{ ...r, text: first, value: first, err: null }, ...fresh] : [r])))
    keepShown([key, ...fresh.map((r) => r.key)])
    return 'clean'
  }

  /* The filter only exists once the list is long enough to lose something in,
     and it only applies while its box is on screen. */
  const filterOn = draft.ip.length + draft.asn.length > 8
  useEffect(() => {
    if (!filterOn && filter) setFilter('')
  }, [filterOn, filter])
  const needle = filterOn ? filter.trim().toLowerCase() : ''
  /* Matched on the field's text or on the entry it holds, so a row being retyped
     does not vanish under the caret, and a row committed under this filter stays
     (see `stay`). A row that holds nothing yet always shows. */
  const shown = needle
    ? rows.filter(
        (r) =>
          r.value === null ||
          stay.has(r.key) ||
          r.text.toLowerCase().includes(needle) ||
          r.value.toLowerCase().includes(needle),
      )
    : rows
  /* Counted without the empty row that always shows, which removes nothing. */
  const shownCount = shown.filter((r) => r.value !== null || r.text.trim() !== '').length

  const removeRow = (key: number) => {
    const row = rows.find((r) => r.key === key)
    if (!row) return
    const at = shown.findIndex((r) => r.key === key)
    if (row.value !== null) onChange({ ...draft, ...without(row.value) })
    setRows((rs) => rs.filter((r) => r.key !== key))
    /* The next row's field, else the one before, else Add IP. */
    focusInSection(sectionRef, '.bz7__rowin', Math.max(at, 0))
  }

  /* The field now at `index`, else the add control: forward only, unlike
     focusInSection, because this follows a Tab and Tab does not go back up. */
  const focusForward = (index: number) =>
    window.setTimeout(() => {
      const section = sectionRef.current
      if (!section?.isConnected) return
      const target =
        section.querySelectorAll<HTMLElement>('.bz7__rowin')[index] ??
        section.querySelector<HTMLElement>('.bz7__addrow, .bempty__action button')
      target?.focus({ preventScroll: true })
    }, 0)

  /* With a filter on, only the rows shown are removed. */
  const removeShown = () => {
    const keys = new Set(shown.map((r) => r.key))
    const gone = new Set(shown.flatMap((r) => (r.value === null ? [] : [r.value])))
    onChange({ ...draft, ip: draft.ip.filter((x) => !gone.has(x)), asn: draft.asn.filter((x) => !gone.has(x)) })
    setRows((rs) => rs.filter((r) => !keys.has(r.key)))
    changeFilter('')
    setNote(null)
    focusInSection(sectionRef, '.bz7__rowin', 0)
  }

  const quick = (
    <div className="bz7__quick">
      <span>Quick add</span>
      {QUICK.map((q) => {
        const already = hasEntry(draft.ip, q.value)
        return (
          <button
            key={q.value}
            type="button"
            className={`bz7__quickbtn ${already ? 'is-in' : ''}`}
            disabled={already}
            title={q.hint}
            /* Keeps a row being typed from committing, and moving the button, before the click lands. */
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onChange({ ...draft, ip: [...draft.ip, q.value] })}
          >
            {already ? (
              <Check size={12} strokeWidth={2.6} aria-hidden />
            ) : (
              <Plus size={12} strokeWidth={2.4} aria-hidden />
            )}
            {q.label}
            <code>{q.value}</code>
          </button>
        )
      })}
    </div>
  )

  if (draft.ip.length + draft.asn.length === 0 && rows.length === 0) {
    return (
      <section className="bz7__sec bz7__sec--empty" ref={sectionRef}>
        <EmptyState
          compact
          icon={Network}
          title="No IP networks yet"
          blurb="Add addresses, CIDR blocks, ranges or ASNs. Left empty, any network matches."
          action={
            <>
              <Button variant="brand" icon={Plus} onClick={addRow}>
                Add IP
              </Button>
              {quick}
            </>
          }
        />
      </section>
    )
  }

  return (
    <section className="bz7__sec" ref={sectionRef}>
      {filterOn && (
        <div className="bz7__listbar">
          <SearchBox block value={filter} onChange={changeFilter} placeholder="Filter entries…" label="Filter entries" />
          <Button variant="danger" size="sm" disabled={shownCount === 0} onClick={removeShown}>
            {needle ? `Remove ${shownCount} shown` : 'Remove all'}
          </Button>
        </div>
      )}

      {needle && shown.length === 0 ? (
        <NoMatches compact noun="entries" query={filter} onClear={() => changeFilter('')} />
      ) : (
        <ul className={`bz7__fields ${filterOn ? 'is-scroll' : ''}`}>
          {shown.map((r) => {
            const errId = `bz7-net-err-${r.key}`
            return (
              <li key={r.key}>
                <div className="bz7__fieldline">
                  <input
                    type="text"
                    className="bz7__rowin"
                    data-row={r.key}
                    value={r.text}
                    placeholder={r.value === null ? '10.0.0.1, 192.168.0.0/24, AS15169' : undefined}
                    aria-label="IP address, network or ASN"
                    aria-invalid={r.err ? true : undefined}
                    aria-describedby={r.err ? errId : undefined}
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(e) => patchRow(r.key, { text: e.target.value, err: null })}
                    /* A one-line field drops the line breaks out of a pasted list,
                       which glues "10.0.0.1" and "10.0.0.2" into one unreadable
                       entry. Each line becomes a comma instead. */
                    onPaste={(e) => {
                      const pasted = e.clipboardData.getData('text')
                      if (!/[\r\n]/.test(pasted)) return
                      e.preventDefault()
                      const el = e.currentTarget
                      const from = el.selectionStart ?? el.value.length
                      const to = el.selectionEnd ?? from
                      const flat = pasted.trim().replace(/\s*[\r\n]+\s*/g, ', ')
                      patchRow(r.key, { text: el.value.slice(0, from) + flat + el.value.slice(to), err: null })
                    }}
                    /* Committed on the way out: a filled row left behind is an
                       entry somebody believes they added.
                       Tab out of an empty row lands on that row's own trash
                       button, and the commit then drops the row and the button
                       with it, which leaves focus on the page body. So when the
                       row goes and focus was headed into it, focus carries on
                       forward: the row that took its place, else Add IP. */
                    onBlur={(e) => {
                      const to = e.relatedTarget
                      const within = to instanceof Node && !!e.currentTarget.closest('li')?.contains(to)
                      const at = shown.findIndex((x) => x.key === r.key)
                      if (commitRow(r.key) === 'dropped' && within) focusForward(at)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        /* An empty new row is already the next row. */
                        if (r.value === null && !r.text.trim()) return
                        const at = shown.findIndex((x) => x.key === r.key)
                        const last = at === shown.length - 1
                        const done = commitRow(r.key)
                        if (done === 'clean' && last) addRow()
                        else if (done === 'dropped') focusInSection(sectionRef, '.bz7__rowin', at)
                      }
                      if (e.key === 'Escape') {
                        if (r.value === null && !r.text.trim()) {
                          e.preventDefault()
                          removeRow(r.key)
                        } else if (r.value !== null && r.text !== r.value) {
                          /* Back to the entry as stored. */
                          e.preventDefault()
                          patchRow(r.key, { text: r.value, err: null })
                        }
                      }
                    }}
                  />
                  {/* The mousedown would blur the field first, and a blur commits:
                      an empty row would unmount this button before the click. */}
                  <span className="bz7__rowdel" onMouseDown={(e) => e.preventDefault()}>
                    <IconButton
                      icon={Trash2}
                      tone="danger"
                      size="sm"
                      label={`Remove ${r.text.trim() || 'this row'}`}
                      onClick={() => removeRow(r.key)}
                    />
                  </span>
                </div>
                {r.err && (
                  <p className="bz7__rowerr" id={errId}>
                    {r.err}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <button type="button" className="bz7__addrow" onMouseDown={(e) => e.preventDefault()} onClick={addRow}>
        <CirclePlus size={16} strokeWidth={1.9} aria-hidden />
        Add IP
      </button>

      {quick}

      {note && (
        <p className="bz7__note" role="status">
          {note}
          <button type="button" onClick={() => setNote(null)} aria-label="Dismiss">
            <X size={12} strokeWidth={2.2} />
          </button>
        </p>
      )}
    </section>
  )
}

/* --- Locations -----------------------------------------------------------------------
   The same list as IP networks: a field per place, the same remove beside each,
   and Add location under them, so the two tabs read as one kind of list.

   A place is chosen from the catalogue rather than typed, so its field is a
   search. Add location opens an empty one at the end; clicking a place's field
   turns that field into a search for the place to put in its stead. A search
   that is left without a pick leaves the zone as it was. */

type PlaceList = 'countries' | 'states' | 'cities'

/** One row of the list. The id is the kind and the name: a state and a city can share a name (Berlin). */
type Chosen = { id: string; kind: PlaceList | 'radius'; v: string; label: string }

const LIST_OF: Record<Place['kind'], PlaceList> = { country: 'countries', state: 'states', city: 'cities' }

/** The one open search row: a new place at the end, or a stand-in for a chosen one. */
interface PlaceSearch {
  key: number
  /** The id of the row this search would replace, or null for a new place. */
  replacing: string | null
  q: string
}

let placeSearchSeq = 0

/** Why a place cannot go in, or null when it can. */
type Refusal = { kind: 'added' } | { kind: 'covered'; by: string } | null

function chosenPlaces(l: ZoneLocation): Chosen[] {
  const rows = (kind: PlaceList, label: string) => l[kind].map((v) => ({ id: `${kind}:${v}`, kind, v, label }))
  const out: Chosen[] = [...rows('countries', 'Country'), ...rows('states', 'State'), ...rows('cities', 'City')]
  if (l.radius) {
    const v = l.radius.label ?? `${l.radius.lat}, ${l.radius.lon}`
    out.push({ id: `radius:${v}`, kind: 'radius', v, label: `${l.radius.km} km radius` })
  }
  return out
}

/* The location without one of its rows. */
function withoutPlace(l: ZoneLocation, c: Chosen): ZoneLocation {
  if (c.kind === 'radius') {
    const { radius: _gone, ...rest } = l
    void _gone
    return rest
  }
  return { ...l, [c.kind]: l[c.kind].filter((x) => x !== c.v) }
}

/* A place already in the zone, or inside one that is, would change nothing. */
function placeRefusal(p: Place, l: ZoneLocation): Refusal {
  if (l[LIST_OF[p.kind]].includes(p.name)) return { kind: 'added' }
  const by = coveredBy(p, l)
  return by ? { kind: 'covered', by } : null
}

/* `p` added to the location, or put in place of `replacing`. The caller has
   checked `placeRefusal` against the location without `replacing`. */
function withPlace(l: ZoneLocation, p: Place, replacing: Chosen | null): ZoneLocation {
  const list = LIST_OF[p.kind]
  let next: ZoneLocation
  if (replacing?.kind === list) {
    /* The same kind: swapped where it stood, so the list does not reorder under the edit. */
    next = { ...l, [list]: l[list].map((x) => (x === replacing.v ? p.name : x)) }
  } else {
    const base = replacing ? withoutPlace(l, replacing) : l
    next = { ...base, [list]: [...base[list], p.name] }
  }
  /* The reverse sweep: a wider place makes the narrower ones inside it redundant. */
  if (p.kind === 'country') {
    next = {
      ...next,
      states: next.states.filter((s) => !inCountry(s, p.name, 'state')),
      cities: next.cities.filter((c) => !inCountry(c, p.name, 'city')),
    }
  }
  if (p.kind === 'state') {
    next = { ...next, cities: next.cities.filter((c) => !inState(c, p.name, p.country)) }
  }
  return next
}

/* The first hit that can be picked, so Enter on a fresh query does not land on "Added". */
const firstOpenHit = (hits: Place[], l: ZoneLocation) => Math.max(0, hits.findIndex((p) => !placeRefusal(p, l)))

export function PlaceSection({ draft, onChange }: { draft: Zone; onChange: (z: Zone) => void }) {
  const sectionRef = useRef<HTMLElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [search, setSearch] = useState<PlaceSearch | null>(null)
  const [cursor, setCursor] = useState(0)
  const l = draft.location
  const chosen = chosenPlaces(l)

  /* A search standing in for a row that has since gone is no search at all. */
  const replacing = search?.replacing ? (chosen.find((c) => c.id === search.replacing) ?? null) : null
  const open = search && (search.replacing === null || replacing) ? search : null
  const q = open?.q ?? ''
  const hits = useMemo(() => searchPlaces(q), [q])
  /* Hits are checked against the zone without the row being replaced, so that
     place is offered back, and a place inside it is not refused as covered by it. */
  const base = replacing ? withoutPlace(l, replacing) : l

  /* The list shows about six of its twelve hits, so a cursor moved by the keyboard,
     or reset by typing, is scrolled into view: Enter must not add a place the user
     cannot see. Not one moved by the pointer, which is already over what it
     points at, and scrolling under a resting pointer would move the cursor again.
     Before the empty state's return, so the hooks run in the same order. */
  const cursorByPointer = useRef(false)
  const openKey = open?.key
  useEffect(() => {
    if (cursorByPointer.current) {
      cursorByPointer.current = false
      return
    }
    if (openKey === undefined) return
    document.getElementById(`bz7-place-hits-${openKey}-${cursor}`)?.scrollIntoView({ block: 'nearest' })
  }, [cursor, openKey, q])

  const put =(next: ZoneLocation) => onChange({ ...draft, location: next })

  /* After the render that moved things: the element a selector names in this section. */
  const focusLater = (selector: string) =>
    window.setTimeout(() => sectionRef.current?.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true }), 0)

  /* The row now at `index`, else the one before it, else Add location, or the
     empty state's button once the last place has gone. A row's field where it
     has one, and its remove where it does not: the radius. */
  const focusRow = (index: number) =>
    window.setTimeout(() => {
      const section = sectionRef.current
      if (!section?.isConnected) return
      const rows = section.querySelectorAll<HTMLElement>('.bz7__fields > li')
      const row = rows[index] ?? rows[index - 1]
      const target = row
        ? (row.querySelector<HTMLElement>('button.bz7__place, input') ?? row.querySelector<HTMLElement>('button'))
        : section.querySelector<HTMLElement>('.bz7__addrow, .bempty__action button')
      target?.focus({ preventScroll: true })
    }, 0)

  const openNew = () => {
    /* One search at a time: a second Add location goes back to the one already open. */
    if (open && open.replacing === null) {
      inputRef.current?.focus()
      return
    }
    setSearch({ key: ++placeSearchSeq, replacing: null, q: '' })
    setCursor(0)
  }

  const openReplace = (c: Chosen) => {
    setSearch({ key: ++placeSearchSeq, replacing: c.id, q: c.v })
    setCursor(firstOpenHit(searchPlaces(c.v), withoutPlace(l, c)))
  }

  /* Closes the search with this key, if it is still the open one: the blur from a
     field that a pick has already replaced must not close the next one. */
  const close = (key: number) => setSearch((s) => (s?.key === key ? null : s))

  const pick = (p: Place, via: 'enter' | 'click') => {
    if (!open || placeRefusal(p, base)) return
    put(withPlace(l, p, replacing))
    if (via === 'enter' && open.replacing === null) {
      /* As Enter on the last IP row: the next row, ready, so four countries are four Returns. */
      setSearch({ key: ++placeSearchSeq, replacing: null, q: '' })
      setCursor(0)
    } else {
      setSearch(null)
      /* The field became the place: focus stays on that row. */
      focusLater(`[data-place="${CSS.escape(`${LIST_OF[p.kind]}:${p.name}`)}"]`)
    }
  }

  const remove = (c: Chosen) => {
    const at = chosen.findIndex((x) => x.id === c.id)
    put(withoutPlace(l, c))
    if (search?.replacing === c.id) setSearch(null)
    focusRow(at)
  }

  if (chosen.length === 0 && !open) {
    return (
      <section className="bz7__sec bz7__sec--empty" ref={sectionRef}>
        <EmptyState
          compact
          icon={Globe}
          title="No locations yet"
          blurb="Add countries, states or cities. Left empty, any location matches."
          action={
            <Button variant="brand" icon={Plus} onClick={openNew}>
              Add location
            </Button>
          }
        />
      </section>
    )
  }

  /* The search field, in a new row at the end or in the row it would replace. */
  const searchLine = (s: PlaceSearch, c: Chosen | null) => {
    const listId = `bz7-place-hits-${s.key}`
    const showHits = s.q.trim() !== ''
    return (
      <div className="bz7__fieldline">
        <div className="bz7__combo">
          {/* The whole label reads as the field, but only the input takes focus: a
              mousedown on the icon or the padding would blur the input, and a blur
              closes the search before the label's click could hand focus back. */}
          <label
            className="bz7__rowin bz7__place bz7__placesearch"
            onMouseDown={(e) => {
              if (e.target !== inputRef.current) e.preventDefault()
            }}
          >
            <Search size={14} strokeWidth={1.9} aria-hidden />
            <input
              ref={inputRef}
              type="text"
              value={s.q}
              /* The row or the button that opened this search is gone in the same render. */
              autoFocus
              placeholder="Search a country, state or city"
              aria-label={c ? `Replace ${c.v}` : 'Search places'}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={showHits}
              aria-controls={showHits ? listId : undefined}
              aria-activedescendant={showHits && hits.length > 0 ? `${listId}-${cursor}` : undefined}
              autoComplete="off"
              spellCheck={false}
              /* Selected, so typing replaces the name and an arrow key keeps it. */
              onFocus={(e) => {
                if (c) e.currentTarget.select()
              }}
              onChange={(e) => {
                const text = e.target.value
                setSearch((cur) => (cur?.key === s.key ? { ...cur, q: text } : cur))
                setCursor(firstOpenHit(searchPlaces(text), base))
              }}
              /* Left without a pick, nothing is half added: a new row goes, and a
                 row being replaced shows its place again. Tab from a new row lands
                 on its own remove, which goes with the row, so focus carries on to
                 Add location. */
              onBlur={(e) => {
                const to = e.relatedTarget
                const within = to instanceof Node && !!e.currentTarget.closest('li')?.contains(to)
                close(s.key)
                if (within && !c) focusLater('.bz7__addrow, .bempty__action button')
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault()
                  close(s.key)
                  /* Back to the place this stood in for, or on to what brings the search back. */
                  focusLater(
                    c ? `[data-place="${CSS.escape(c.id)}"]` : '.bz7__addrow, .bempty__action button',
                  )
                  return
                }
                if (!hits.length) return
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setCursor((i) => (i + 1) % hits.length)
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setCursor((i) => (i - 1 + hits.length) % hits.length)
                } else if (e.key === 'Enter') {
                  e.preventDefault()
                  const p = hits[cursor]
                  if (p) pick(p, 'enter')
                }
              }}
            />
          </label>

          {showHits && (
            <ul
              className="bz7__hits"
              id={listId}
              role="listbox"
              aria-label="Place results"
              /* Keeps focus in the field, which closes on blur, through a click on
                 the list's own scrollbar or padding. */
              onMouseDown={(e) => e.preventDefault()}
            >
              {hits.length === 0 && <li className="bz7__nohit">No place matches “{s.q.trim()}”.</li>}
              {hits.map((p, i) => {
                const no = placeRefusal(p, base)
                return (
                  <li key={p.id} role="presentation">
                    <button
                      type="button"
                      role="option"
                      id={`${listId}-${i}`}
                      tabIndex={-1}
                      aria-selected={i === cursor}
                      aria-disabled={no ? true : undefined}
                      className={`bz7__hit ${i === cursor ? 'is-cursor' : ''} ${no ? 'is-off' : ''}`}
                      /* A move, not an enter: a keyboard scroll slides options under a
                         resting pointer, and that must not take the cursor back. */
                      onMouseMove={() => {
                        if (i === cursor) return
                        cursorByPointer.current = true
                        setCursor(i)
                      }}
                      onClick={() => pick(p, 'click')}
                    >
                      <MapPin size={13} strokeWidth={1.9} aria-hidden />
                      <span className="bz7__hitname">{p.name}</span>
                      <span className="bz7__hitctx">{placeContext(p)}</span>
                      {no?.kind === 'added' && (
                        <i className="bz7__hitnote">
                          <Check size={12} strokeWidth={2.6} aria-hidden /> Added
                        </i>
                      )}
                      {no?.kind === 'covered' && <i className="bz7__hitnote is-warn">Covered by {no.by}</i>}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
        {/* The mousedown would blur the field first, and a blur closes the search. */}
        <span className="bz7__rowdel" onMouseDown={(e) => e.preventDefault()}>
          <IconButton
            icon={Trash2}
            tone="danger"
            size="sm"
            label={c ? `Remove ${c.v}` : 'Remove this row'}
            onClick={() => {
              if (c) {
                remove(c)
              } else {
                setSearch(null)
                focusRow(chosen.length)
              }
            }}
          />
        </span>
      </div>
    )
  }

  return (
    <section className="bz7__sec" ref={sectionRef}>
      <ul className="bz7__fields">
        {chosen.map((c) => (
          <li key={c.id}>
            {open && replacing?.id === c.id ? (
              searchLine(open, c)
            ) : (
              <div className="bz7__fieldline">
                {c.kind === 'radius' ? (
                  /* A circle is not in the catalogue, so there is nothing to search
                     for in its place. It only has Remove. */
                  <div className="bz7__rowin bz7__place is-static" data-place={c.id}>
                    <span className="bz7__placename">{c.v}</span>
                    <span className="bz7__placekind">{c.label}</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="bz7__rowin bz7__place"
                    data-place={c.id}
                    aria-label={`Change ${c.v} (${c.label.toLowerCase()})`}
                    onClick={() => openReplace(c)}
                  >
                    <span className="bz7__placename">{c.v}</span>
                    <span className="bz7__placekind">{c.label}</span>
                  </button>
                )}
                {/* The same remove as an IP network row. Its mousedown keeps an open
                    search from closing, and moving this row, before the click lands. */}
                <span className="bz7__rowdel" onMouseDown={(e) => e.preventDefault()}>
                  <IconButton icon={Trash2} tone="danger" size="sm" label={`Remove ${c.v}`} onClick={() => remove(c)} />
                </span>
              </div>
            )}
          </li>
        ))}
        {open && open.replacing === null && <li key={`search-${open.key}`}>{searchLine(open, null)}</li>}
      </ul>

      <button type="button" className="bz7__addrow" onMouseDown={(e) => e.preventDefault()} onClick={openNew}>
        <CirclePlus size={16} strokeWidth={1.9} aria-hidden />
        Add location
      </button>
    </section>
  )
}

/* --- Helpers --------------------------------------------------------------------- */

/* Whether a state or city of this name sits inside a country, asked of the
   catalogue directly. It was a ranked search capped at forty hits, which only
   held because an exact name happens to rank first. */
function inCountry(name: string, country: string, kind: 'state' | 'city'): boolean {
  return PLACES.some((p) => p.kind === kind && p.name === name && p.country === country)
}

/* Whether a city of this name sits inside a state of that country. */
function inState(city: string, state: string, country: string): boolean {
  return PLACES.some((p) => p.kind === 'city' && p.name === city && p.state === state && p.country === country)
}
