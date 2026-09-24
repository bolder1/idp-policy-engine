import { flushSync } from 'react-dom'
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  ArrowLeft,
  Bug,
  Check,
  CircleCheck,
  Copy,
  CopyPlus,
  Crosshair,
  FileWarning,
  Gauge,
  House,
  Info,
  type LucideIcon,
  MonitorSmartphone,
  Pencil,
  Plus,
  Puzzle,
  Route,
  Server,
  ShieldOff,
  Smartphone,
  Split,
  TabletSmartphone,
  Tag,
  Trash2,
  Unlock,
  Waypoints,
  Wrench,
} from 'lucide-react'

import { PageHead } from '../Shell'
import { SidePanel } from './device-profile-parts'
import { RISK_SIGNALS_NOTE } from './profile-notes'
import { RISK_PAGE_VERSIONS, readRiskPage, writeRiskPage, type RiskPageVersion } from './risk-page-version'
import {
  Badge,
  Button,
  IconButton,
  Modal,
  NameField,
  RowMenu,
  SaveBar,
  SearchBox,
  Tip,
  TipDot,
  TipMark,
  Toggle,
  type MenuItem,
} from '../kit'
import { EmptyState, NoMatches } from '../empty'
import { Picker } from '../picker'
import { TierPick } from '../tier-pick'
import { PlatformMark } from '../logos/PlatformMark'
import { useBrand } from '../store'
import { newId, uniqueName } from '../data'
import { ChangeState, useLeaveGuard } from '../leave-guard'
import { ConfirmDelete, UseList } from './confirm-delete'
import { ListPager } from './list-pager'
import { pageForRow, usePagedList } from './paged-list'
import { LibraryRows, ViewSwitch, type LibRow } from './library-view'
import { PageBar, WidthSwitch } from './page-bar'
import { compactClass, usePageWidth } from '../page-width'
import { libRowHeight, useLibView } from './library-view-state'
import { policiesUsingType, type PolicyUse } from './usage'
import {
  CATEGORY_TONE,
  EMPTY_RISK_PROFILE,
  LIVE_PLATFORMS,
  PLATFORMS,
  RISK_PROFILE_NAME_MAX,
  RISK_SIGNALS,
  SIGNAL_CATEGORIES,
  blankRiskProfile,
  countOn,
  isOn,
  riskChangeNames,
  riskProfileNameProblem,
  riskProfileProblem,
  riskReviewRows,
  riskScale,
  sameRiskProfile,
  setSignalOn,
  setSignalTier,
  tierFor,
  type RiskProfile,
  type Platform,
  type RiskSignal,
  type RiskTuning,
} from '../risk-signals'

import { SHOWCASE } from '../showcase'
import './risk-signals.css'

/* A mark per signal.

   A distinct glyph makes a row recognisable in a table of sixteen. Sixteen
   distinct glyphs, chosen apart on purpose: emulator and simulator, rooted and
   jailbroken, VPN and residential proxy are exactly the pairs worth telling
   apart, and one glyph for both would read as the same thing twice.

   Never `negative`. Red means danger in this kit, and every one of these
   signals is about danger. The severity is the weight column's job. */
const SIGNAL_ICON: Record<string, LucideIcon> = {
  // Device integrity — the handset is not what it claims to be.
  emulator: MonitorSmartphone, // a handset drawn on a desktop
  simulator: TabletSmartphone, // Xcode's window
  rooted: Unlock,
  jailbroken: ShieldOff,
  cloned: Copy,
  'dev-mode': Wrench,

  // Instrumentation — something is interfering with the running app.
  hooking: Puzzle, // a piece slotted into the app as it runs
  debugger: Bug,
  'tampered-request': FileWarning,
  mitm: Split, // something is reading the traffic

  // Network origin — where the connection actually came from.
  tor: Waypoints, // relayed through nodes
  datacenter: Server,
  'residential-proxy': House, // somebody else's home address
  vpn: Route, // a tunnel

  // The last two.
  'known-attacker': Crosshair,
  'high-activity': Activity,
}

/** The glyph for a signal, falling back rather than rendering nothing. */
const signalIcon = (id: string): LucideIcon => SIGNAL_ICON[id] ?? Smartphone

/* -----------------------------------------------------------------------------
   Risk signal profiles.

   Every signal a mobile sign-in can carry, whether a profile listens to it, and
   how hard it pushes when it fires — on Android and on iOS separately, because
   the two platforms do not report the same things with the same confidence.

   A library: a list, a create flow, and an inner page per profile, the shape
   Zones and Device profiles use.

   The scale is what makes this a setting. `device-risk` — "Risk score above
   60" — is the one condition that compares a rule's threshold against a
   number, and that number comes from the profile IN USE. Exactly one profile is
   in use; the rest are alternatives. The reasoning for that rather than
   per-rule references is on `activeRiskProfileId` in the store.
   -------------------------------------------------------------------------- */

const ALL = 'All'

/** Where focus goes when the list comes back: a profile's row, or the row now at an index. */
type ListFocus = { id: string } | { index: number }

export function RiskSignals() {
  const store = useBrand()
  const [width] = usePageWidth()
  const [openId, setOpenId] = useState<string | null>(null)
  const [naming, setNaming] = useState(false)
  const open = openId ? (store.riskProfiles.find((p) => p.id === openId) ?? null) : null

  /* Read by the list once it has rendered, then cleared. */
  const listFocus = useRef<ListFocus | null>(null)

  const create = (name: string) => {
    const clean = name.trim()
    /* The id comes back from the store, which re-ids anything already taken,
       so a delete never lets two profiles share one. */
    const taken = store.riskProfiles.map((p) => p.id)
    const id = store.addRiskProfile(blankRiskProfile(clean, newId('rp', taken, clean)))
    setNaming(false)
    /* Straight inside, the way creating a zone lands you in the zone. */
    setOpenId(id)
  }

  /* From the row menu, and it opens the copy, so there is always a way to
     reach it. */
  const duplicate = (p: RiskProfile) => {
    const name = uniqueName(
      p.name,
      store.riskProfiles.map((x) => x.name),
      RISK_PROFILE_NAME_MAX,
    )
    const taken = store.riskProfiles.map((x) => x.id)
    const copy: RiskProfile = {
      ...p,
      id: newId('rp', taken, name),
      name,
      /* Copied, not aliased. */
      off: [...p.off],
      tiers: { ...p.tiers },
    }
    const id = store.addRiskProfile(copy)
    store.showToast(`${name} created`)
    setOpenId(id)
  }

  /* The profile a delete is pending on, from its row menu — the only place
     Delete is offered; the inner page has no header actions, so there is never
     an open draft for the delete to throw away.

     No rule names a risk profile by id: `device-risk` compares against the
     profile in use, whichever that is. The menu does not offer Delete on that
     profile, and `remove` refuses it anyway. */
  const [deleting, setDeleting] = useState<RiskProfile | null>(null)
  /* The profile a switch is pending on. Switching re-grades every Risk score
     condition in the tenant, so it asks first and shows what moves. */
  const [switching, setSwitching] = useState<RiskProfile | null>(null)

  const remove = (p: RiskProfile) => {
    setDeleting(null)
    if (p.id === store.activeRiskProfileId) return
    const index = store.riskProfiles.findIndex((x) => x.id === p.id)
    store.removeRiskProfile(p.id)
    /* The row is gone, and focus with it: the list puts it on the row that
       took its place. */
    listFocus.current = { index: Math.max(0, index) }
    store.showToast(`${p.name} deleted`)
  }

  const switchTo = (p: RiskProfile) => {
    store.useRiskProfile(p.id)
    setSwitching(null)
    store.showToast(`Risk scores now come from ${p.name}`)
  }

  const active = store.riskProfiles.find((p) => p.id === store.activeRiskProfileId)

  return (
    /* Compact only while the list shows and the width switch says so; a
       profile's inner page keeps the full width its signal table needs. */
    <div className={open ? 'bpage brs' : `bpage${compactClass(width)} brs brs--list`}>
      {open ? (
        /* Keyed, and the key is load-bearing: the inner page holds a draft in
           `useState`, so opening a second profile without remounting would hand
           it a new prop while keeping the first one's unsaved edits. */
        <RiskProfileDetail
          key={open.id}
          profile={open}
          otherNames={store.riskProfiles.filter((p) => p.id !== open.id).map((p) => p.name)}
          inUse={open.id === store.activeRiskProfileId}
          onBack={() => {
            listFocus.current = { id: open.id }
            setOpenId(null)
          }}
          onSave={(p) => {
            store.updateRiskProfile(p)
            store.showToast(`${p.name} saved`)
          }}
        />
      ) : (
        <RiskProfileList
          profiles={store.riskProfiles}
          activeId={store.activeRiskProfileId}
          focus={listFocus}
          onOpen={setOpenId}
          onCreate={() => setNaming(true)}
          onUse={setSwitching}
          onDuplicate={duplicate}
          onDelete={setDeleting}
        />
      )}

      <NameRiskProfileModal
        open={naming}
        takenNames={store.riskProfiles.map((p) => p.name)}
        onClose={() => setNaming(false)}
        onCreate={create}
      />
      <ConfirmDelete
        open={!!deleting}
        name={deleting?.name ?? ''}
        noun="risk profile"
        detail="It is not in use."
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && remove(deleting)}
      />
      <SwitchProfileModal
        profile={switching}
        current={active ?? null}
        uses={switching ? policiesUsingType('device-risk', store.policies) : []}
        onCancel={() => setSwitching(null)}
        onConfirm={() => switching && switchTo(switching)}
      />
    </div>
  )
}

/* --- The list --------------------------------------------------------------

   Drawn by `LibraryRows`, as Zones and Device profiles are: table, list or card,
   with the kit row menu. Paged to fit the window. */
function RiskProfileList({
  profiles,
  activeId,
  focus,
  onOpen,
  onCreate,
  onUse,
  onDuplicate,
  onDelete,
}: {
  profiles: RiskProfile[]
  activeId: string
  focus: { current: ListFocus | null }
  onOpen: (id: string) => void
  onCreate: () => void
  onUse: (p: RiskProfile) => void
  onDuplicate: (p: RiskProfile) => void
  onDelete: (p: RiskProfile) => void
}) {
  /* The showcase presents ONE view (owner, 23 Sep 2026: "keep list view only,
     remove the view selection — make it the default and hide the three").
     Pinned here, at the call site, so a view saved by an earlier visit cannot
     bring a hidden one back; `useLibView` still describes storage, and flipping
     SHOWCASE gives the switch and the saved preference back. */
  const [savedView, setView] = useLibView('risk-profiles')
  const view = SHOWCASE ? 'list' : savedView
  /* By name, as on every other list page. */
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const shown = needle ? profiles.filter((p) => p.name.toLowerCase().includes(needle)) : profiles
  const paged = usePagedList(shown, {
    rowHeight: libRowHeight(view),
    grid: view === 'card',
    resetKey: [q, view],
  })
  const listEl = useRef<HTMLElement | null>(null)
  const { listRef } = paged
  const setList = useCallback(
    (el: HTMLElement | null) => {
      listRef(el)
      listEl.current = el
    },
    [listRef],
  )

  /* The pager as last rendered, and the rows it pages, for the focus pass
     below, which runs outside render. */
  const pager = useRef({ shown, page: paged.page, size: paged.size, prev: paged.prev, next: paged.next })
  useLayoutEffect(() => {
    pager.current = { shown, page: paged.page, size: paged.size, prev: paged.prev, next: paged.next }
  })

  /* Focus after a delete or on the way back from a profile.

     On a timer, not in the effect: the list measures how many rows fit in a
     layout effect on mount, and that re-render lands after this effect would
     have run, so a row focused then could be taken off the page. By the timer
     the page size is settled. A list that remounts on the way back starts at
     page 1, so it turns to the row's page first. The dialog that closed has
     already put focus back where it guessed; this runs after it. */
  useEffect(() => {
    if (!focus.current) return
    const t = window.setTimeout(() => {
      const req = focus.current
      if (!req) return
      focus.current = null
      const { shown: rows, page, size, prev, next } = pager.current
      /* Positions are counted in the rows the pager pages, which a search
         narrows. After a delete, the row to land on is the nearest one still
         visible — the one that took the deleted row's place, or the one above. */
      const visible = new Set(rows.map((p) => p.id))
      const wanted =
        'id' in req
          ? req.id
          : (profiles.slice(req.index).find((p) => visible.has(p.id)) ??
              [...profiles.slice(0, req.index)].reverse().find((p) => visible.has(p.id)))?.id
      const at = wanted ? rows.findIndex((p) => p.id === wanted) : -1
      const onPage = at >= 0 ? pageForRow(at, size) : page
      if (onPage !== page) {
        flushSync(() => {
          for (let i = page; i < onPage; i += 1) next()
          for (let i = page; i > onPage; i -= 1) prev()
        })
      }
      const drawn = Array.from(listEl.current?.querySelectorAll<HTMLElement>('[data-profile-id]') ?? [])
      const row = drawn.find((r) => r.dataset.profileId === wanted)
      const target =
        row?.querySelector<HTMLElement>('.blist__open') ??
        document.querySelector<HTMLElement>('.brs--list .bpage__title h1')
      if (!target) return
      if (target.tagName === 'H1' && !target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1')
      target.focus({ preventScroll: true })
    }, 0)
    return () => window.clearTimeout(t)
  }, [profiles, focus])

  const head = (
    <PageHead
      title="Risk signal profiles"
      caption="The profile in use sets the scores that Risk score conditions compare against."
      preview={SHOWCASE ? undefined : <WidthSwitch />}
    />
  )

  /* A tenant always has the profile in use, so this should not show; if it
     ever does, it is a full empty state rather than an empty list. */
  if (profiles.length === 0) {
    return (
      <>
        {head}
        <EmptyState
          icon={Activity}
          title="No risk profiles"
          blurb="Create one to set how much each risk signal counts."
          action={
            <Button variant="brand" icon={Plus} onClick={onCreate}>
              Create profile
            </Button>
          }
        />
      </>
    )
  }

  const menuItems = (inUse: boolean): MenuItem[] => [
    /* Absent on the row that already carries it, rather than present and disabled. */
    ...(inUse ? [] : [{ id: 'use', label: 'Use this profile', icon: CircleCheck }]),
    /* CopyPlus, the glyph the policy builder's rule menu uses (owner, 23 Sep
       2026: "use the one we use inside the policy builder"). Two sheets alone
       read as "copy to the clipboard"; the plus says a second one is made. */
    { id: 'duplicate', label: 'Duplicate', icon: CopyPlus },
    /* The tenant must always have a scale, so the profile producing it cannot
       be deleted; the badge says why. */
    ...(inUse ? [] : [{ id: 'delete', label: 'Delete', icon: Trash2, danger: true, divide: true }]),
  ]

  /* A fragment, not a wrapping div: each section sits straight on the page
     grid, so `.bpage--compact` places them all. */
  return (
    <>
      {head}

      {/* The row every list page has — see `PageBar`: the search box, then the
          scope note where the others put a filter; the view and Create on the
          right. */}
      <PageBar
        left={
          <>
            <SearchBox value={q} onChange={setQ} placeholder="Search profiles…" label="Search risk profiles" />
            <p className="brs__gap">
              <Info size={13} strokeWidth={2} aria-hidden />
              <span>Mobile SDKs only.</span>
              <TipDot label="About risk signals" text="Browser sign-ins carry none of these signals." />
            </p>
          </>
        }
        right={
          <>
            {!SHOWCASE && <ViewSwitch value={view} onChange={setView} label="Risk profile view" />}
            <Button variant="brand" onClick={onCreate}>
              <Plus size={14} strokeWidth={2.2} aria-hidden />
              Create profile
            </Button>
          </>
        }
      />

      {shown.length === 0 ? (
        <NoMatches noun="risk profiles" query={q} onClear={() => setQ('')} />
      ) : (
        <>
          <LibraryRows
            view={view}
            listRef={setList}
            nameColumn="Profile"
            columns={['Signals', 'High risk score']}
            rows={paged.pageRows.map((p): LibRow => {
              const inUse = p.id === activeId
              return {
                id: p.id,
                name: p.name,
                tile: <Gauge size={18} strokeWidth={1.8} />,
                tileClass: 'brs__tile',
                attrs: { 'data-profile-id': p.id },
                onOpen: () => onOpen(p.id),
                /* Not a status pill. "In use" is a relationship between this
                   profile and the tenant — exactly one row can carry it. */
                badge: inUse ? <Badge tone="system">In use</Badge> : undefined,
                facts: [
                  { label: 'Signals', value: `${countOn(p)} of ${RISK_SIGNALS.length} on` },
                  { label: 'High risk score', value: String(riskScale(p).High) },
                ],
                menu: (
                  <RowMenu
                    label={`Actions for ${p.name}`}
                    items={menuItems(inUse)}
                    onSelect={(id) => {
                      if (id === 'use') onUse(p)
                      else if (id === 'duplicate') onDuplicate(p)
                      else if (id === 'delete') onDelete(p)
                    }}
                  />
                ),
              }
            })}
          />
          <ListPager {...paged.pager} label="Risk profile pages" />
        </>
      )}
    </>
  )
}

/* --- Naming a new one ------------------------------------------------------

   One question, then the profile — the shape zones use. */
function NameRiskProfileModal({
  open,
  takenNames,
  onClose,
  onCreate,
}: {
  open: boolean
  takenNames: string[]
  onClose: () => void
  onCreate: (name: string) => void
}) {
  const [name, setName] = useState('')
  useEffect(() => {
    if (open) setName('')
  }, [open])

  const problem = riskProfileNameProblem(name, takenNames)
  /* An empty field needs no message: the disabled button and the label say it.
     A taken name does, because the field looks filled in. */
  const shownProblem = name.trim() ? problem : null
  const ok = !problem

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Name this risk profile"
      width={460}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="brand" disabled={!ok} title={problem ?? undefined} onClick={() => ok && onCreate(name)}>
            Create profile
          </Button>
        </>
      }
    >
      <div className="brs__namebody">
        <label className="bfp2__field">
          <span>Name</span>
          <input
            type="text"
            value={name}
            autoFocus
            maxLength={RISK_PROFILE_NAME_MAX}
            placeholder="Remote workforce"
            aria-invalid={shownProblem ? true : undefined}
            aria-describedby={shownProblem ? 'brs-name-problem' : undefined}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && ok) onCreate(name)
            }}
          />
        </label>
        {shownProblem && (
          <p className="brs__nameerr" id="brs-name-problem" role="alert">
            {shownProblem}
          </p>
        )}
        <p>Starts with every signal on at its shipped priority. Nothing changes until you use it.</p>
      </div>
    </Modal>
  )
}

/* --- The inner page --------------------------------------------------------

   One profile, committing through a draft. Every control here moves the scale,
   and the scale is what every `Risk score` condition compares against, so the
   whole re-weighting is saved as one act.

   Use this profile, Duplicate and Delete are not on this page. They work on the
   profile as stored, not on the draft, and the list's row menu already carries
   all three; a header trail repeating them was a row of buttons to read past
   before the page's own work. What stays is what edits the draft: the name's
   pencil, and Restore shipped priorities. */
function RiskProfileDetail({
  profile,
  otherNames,
  inUse,
  onBack,
  onSave,
}: {
  profile: RiskProfile
  otherNames: string[]
  inUse: boolean
  onBack: () => void
  onSave: (p: RiskProfile) => void
}) {
  const [draft, setDraft] = useState<RiskProfile>(profile)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<string>(ALL)
  /* Which SDKs the admin is working on. Empty is every platform, so the filter
     starts saying nothing (owner, 18 Sep 2026: "add a filter for platform…
     the user can select multiple"). */
  const [plats, setPlats] = useState<Platform[]>([])
  /* Table or list — the two shapes of this page, remembered per viewer. */
  /* The showcase build is always the List — the owner's pick, 21 Sep 2026 — and
     hides the switch (see showcase.ts). */
  const [version, setVersionState] = useState<RiskPageVersion>(() => (SHOWCASE ? 'list' : readRiskPage()))
  const setVersion = (v: RiskPageVersion) => {
    setVersionState(v)
    writeRiskPage(v)
  }
  const [renaming, setRenaming] = useState(false)
  const head = useRef<HTMLElement | null>(null)
  /* The pencil's wrapper. IconButton takes no ref, and focus goes back to the
     button inside when a rename ends. */
  const pencil = useRef<HTMLSpanElement | null>(null)

  const dirty = !sameRiskProfile(draft, profile)
  const problem = riskProfileProblem(draft, otherNames)

  /* Opened from a row, a create or a duplicate, and the control that did it is
     gone: the heading takes focus. */
  useEffect(() => {
    const h = head.current?.querySelector<HTMLElement>('h1')
    h?.focus({ preventScroll: true })
  }, [])

  /* `justSaved` and `settled` stood here: what the leave dialog's Save had just
     committed, for the header's Duplicate and Use this profile to act on before
     `profile` caught up. Both buttons left with the header trail, and leaving
     for the list is the only thing the leave dialog guards now. */
  const commit = () => {
    if (problem) return false
    const saved = { ...draft, name: draft.name.trim() }
    setDraft(saved)
    onSave(saved)
    return true
  }

  /* Leaving asks first. Its Save is the footer's, blocked for the same reason. */
  const confirmLeave = useLeaveGuard({
    dirty,
    save: commit,
    saveLabel: 'Save',
    blocked: problem,
  })

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase()
    return RISK_SIGNALS.filter((s) => {
      /* The platform filter holds through a search: it says which SDK the
         admin is working on, which a query does not change. */
      if (plats.length > 0 && !plats.some((p) => s.on.includes(p))) return false
      /* Searching leaves the category behind: a query that matched nothing in
         the chosen category would show an empty table with the answer one
         click away. */
      if (!n) return cat === ALL || s.category === cat
      return `${s.name} ${s.purpose} ${s.category}`.toLowerCase().includes(n)
    })
  }, [q, cat, plats])

  const toggle = (s: RiskSignal, on: boolean) => setDraft((d) => setSignalOn(d, s.id, on))

  const setTier = (s: RiskSignal, t: RiskSignal['tier']) => setDraft((d) => setSignalTier(d, s, t))

  const touched = draft.off.length > 0 || Object.keys(draft.tiers).length > 0

  /* Restore shipped priorities clears `touched`, which takes the button out of
     the page in the same render, and focus would fall to the body. It goes to
     the pencil instead, the nearest control left in the header.

     Pressed during a rename, the kit closes the name field only after the click
     has run, so the pencil is not back yet when `touched` clears. The effect
     waits for `renaming` too, rather than focusing the input the pending close
     is about to take away. */
  const restored = useRef(false)
  useEffect(() => {
    if (!restored.current || touched || renaming) return
    restored.current = false
    const to =
      pencil.current?.querySelector<HTMLButtonElement>('button') ?? head.current?.querySelector<HTMLElement>('h1')
    to?.focus({ preventScroll: true })
  }, [touched, renaming])

  const onCount = countOn(draft)
  const scale = riskScale(draft)
  const savedScale = riskScale(profile)

  return (
    <>
      <button type="button" className="bfp2__back" onClick={() => confirmLeave(onBack)}>
        <ArrowLeft size={14} strokeWidth={2} aria-hidden />
        All risk profiles
      </button>

      <header className="bfp2__head" ref={head}>
        {/* Name, pencil, then the pills — the zone and device profile pages'
            order. The pencil is always shown, not revealed on hover, and it
            steps aside while the name is an input. */}
        <div className="bfp2__pagehead">
          <EditableProfileName
            value={draft.name}
            onChange={(name) => setDraft((d) => ({ ...d, name }))}
            editing={renaming}
            setEditing={setRenaming}
            onDone={() => pencil.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })}
          />
          {!renaming && (
            <span className="bfp2__rename" ref={pencil}>
              <IconButton icon={Pencil} size="sm" tone="ghost" label="Rename" onClick={() => setRenaming(true)} />
            </span>
          )}
          {inUse && <Badge tone="system">In use</Badge>}
          <ChangeState unsaved={dirty} />
        </div>

        {/* Prototype furniture, not a setting: the two shapes of this page,
            side by side, the way the library pages carry Width. */}
        {!SHOWCASE && (
        <div className="bpage__preview brs__preview">
          <span className="bwidth__label" aria-hidden>
            Version
          </span>
          <div className="bseg" role="group" aria-label="Page version">
            {RISK_PAGE_VERSIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                aria-pressed={version === o.value}
                className={version === o.value ? 'is-on' : ''}
                onClick={() => setVersion(o.value)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
        )}

        {/* The one action left in the header, at the right of the row: it edits
            the draft, so it belongs to the page. Only once there is something
            to restore. */}
        {touched && (
          /* Right-aligned by the version switch's auto margin while it is on
             the row; in the showcase build the switch is gone, so it takes the
             auto margin itself. */
          <span className={SHOWCASE ? 'brs__restore' : undefined}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                restored.current = true
                setDraft((d) => ({ ...d, ...EMPTY_RISK_PROFILE }))
              }}
            >
              Restore shipped priorities
            </Button>
          </span>
        )}
      </header>

      {/* The output, not a summary: three numbers a rule can be written
          against, recalculated as the page is edited. Hidden in the showcase
          build for now (owner, 21 Sep 2026: "hide this as of now"). */}
      {!SHOWCASE && (
      <div className="brs__scale" aria-live="polite">
        <div className="brs__scale__what">
          <b>Risk scores</b>
          <em>
            {inUse ? 'Risk score conditions compare against these.' : 'Rules use these once this profile is in use.'}{' '}
            {onCount} of {RISK_SIGNALS.length} signals on.
          </em>
        </div>
        <dl className="brs__bands">
          {(['Low', 'Medium', 'High'] as const).map((b) => {
            const moved = dirty && scale[b] !== savedScale[b]
            return (
              <div key={b} className={`brs__band is-${b.toLowerCase()} ${moved ? 'is-moved' : ''}`}>
                <dt>{b}</dt>
                <dd>{scale[b]}</dd>
                {/* Where it was, while the change is unsaved. */}
                {moved && <i className="brs__was">was {savedScale[b]}</i>}
              </div>
            )
          })}
        </dl>
      </div>
      )}

      <div className="btoolbar">
        <SearchBox value={q} onChange={setQ} placeholder="Search signals…" label="Search risk signals" />
        <div className="btoolbar__right">
          <span className={`btoolbar__filter bbar__filter${plats.length > 0 ? ' is-set' : ''}`}>
            <Picker
              label="Filter by platform"
              multiple
              prefix="Platform"
              value={plats}
              summary={platformSummary(plats)}
              options={PLATFORMS.map((p) => ({
                value: p.id,
                label: p.label,
                art: <PlatformMark platform={p.id} />,
                /* Announced, not offered: nothing in the catalogue is collected
                   on a desktop platform yet, so the row says when rather than
                   filtering to an empty table. */
                meta: p.soon ? 'Coming soon' : undefined,
                disabled: p.soon,
              }))}
              onChange={(id) =>
                setPlats(
                  plats.includes(id as Platform)
                    ? plats.filter((x) => x !== id)
                    : LIVE_PLATFORMS.filter((p) => p.id === id || plats.includes(p.id)).map((p) => p.id),
                )
              }
            />
          </span>
          <Picker
            label="Filter by category"
            value={cat}
            options={[
              { value: ALL, label: 'All categories' },
              ...SIGNAL_CATEGORIES.map((c) => ({
                value: c,
                label: c,
                /* The category's tint, the same one its pills carry. */
                art: <Tag size={14} strokeWidth={2} className={`brs__cattag is-${CATEGORY_TONE[c]}`} />,
              })),
            ]}
            onChange={setCat}
          />
        </div>
      </div>

      {/* Here as well as on the list, and the same words in both places. It
          also explained a dash — the per-platform columns carried one for a
          signal that platform does not report. Those columns are marks on the
          name now (18 Sep 2026), so there is no dash left to explain. */}
      <p className="brs__gap">
        <Info size={13} strokeWidth={2} aria-hidden />
        <span>Mobile SDKs only.</span>
        <TipDot label="About risk signals" text="Browser sign-ins carry none of these signals." />
      </p>

      {shown.length === 0 ? (
        <NoMatches
          noun="signals"
          query={q}
          filtered={(!q.trim() && cat !== ALL) || plats.length > 0}
          onClear={() => {
            /* Only what the button says. A search ignores the category, so the
               category the picker still shows comes back with the list. */
            if (q.trim()) setQ('')
            else setCat(ALL)
            setPlats([])
          }}
        />
      ) : version === 'list' ? (
        /* The device profile's inner page, on these signals: the work on the
           left, one line per signal, and what the page does on the right. */
        <div className="bz7__cols brs__cols">
          <div className="bz7__work">
            <SignalList items={shown} profile={draft} onToggle={toggle} onTier={setTier} />
          </div>
          <SidePanel note={RISK_SIGNALS_NOTE} />
        </div>
      ) : (
        <SignalTable items={shown} profile={draft} onToggle={toggle} onTier={setTier} />
      )}

      {/* No Discard: leaving the page is where edits are thrown away, through
          the leave dialog. */}
      <SaveBar
        open={dirty}
        changes={riskChangeNames(profile, draft)}
        review={riskReviewRows(profile, draft)}
        onSave={() => {
          commit()
        }}
        blocked={!!problem}
        blockedReason={problem ?? undefined}
      />
    </>
  )
}

/* --- Putting a profile in use ------------------------------------------------

   Switching re-grades every Risk score condition in the tenant, so it asks
   first and shows how the bands move and which rules compare against them. Not
   a danger action — nothing is lost, and switching back is the same dialog. */
function SwitchProfileModal({
  profile,
  current,
  uses,
  onCancel,
  onConfirm,
}: {
  profile: RiskProfile | null
  current: RiskProfile | null
  uses: PolicyUse[]
  onCancel: () => void
  onConfirm: () => void
}) {
  const from = riskScale(current ?? EMPTY_RISK_PROFILE)
  const to = profile ? riskScale(profile) : from

  return (
    <Modal
      open={!!profile}
      onClose={onCancel}
      title={`Use ${profile?.name ?? 'this profile'}?`}
      width={480}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onConfirm}>
            Use this profile
          </Button>
        </>
      }
    >
      <div className="brs__switch">
        <table className="brs__switchscale">
          <thead>
            <tr>
              <th scope="col">
                <span className="u-sr">Band</span>
              </th>
              <th scope="col">{current?.name ?? 'Current'}</th>
              <th scope="col">{profile?.name}</th>
            </tr>
          </thead>
          <tbody>
            {(['Low', 'Medium', 'High'] as const).map((b) => (
              <tr key={b} className={from[b] !== to[b] ? 'is-moved' : ''}>
                <th scope="row">{b}</th>
                <td>{from[b]}</td>
                <td>{to[b]}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {uses.length === 0 ? (
          <p>No policy rule uses Risk score.</p>
        ) : (
          <>
            <p>These rules use Risk score.</p>
            {/* The delete dialog's own list, so a row here is a row there: the
                name opens the policy, and the press covers the whole row. */}
            <UseList uses={uses} onOpen={onCancel} />
          </>
        )}
      </div>
    </Modal>
  )
}

/* The name, edited where it is read — the kit's name field, as on the device
   profile page, opened by the pencil beside it. A blank name is never left
   behind: leaving the field empty puts the name back. When focus has left the
   field, and when a press elsewhere lets it close, is the kit's to decide — see
   NameField. */
function EditableProfileName({
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
  /** Called after Enter, Escape, ✓ or ✕ has ended the edit, to put focus back on the pencil. */
  onDone?: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const before = useRef(value)
  /* Enter, Escape, ✓ and ✕ take the focused field away; focus goes back to the
     pencil, which is back in the page by the time this effect runs. A leave has
     already sent focus somewhere on purpose and keeps it there. */
  const refocus = useRef(false)

  const finish = (revert = false) => {
    if (revert || !value.trim()) onChange(before.current)
    refocus.current = true
    setEditing(false)
  }

  useEffect(() => {
    if (!editing) {
      if (refocus.current) {
        refocus.current = false
        onDone?.()
      }
      return
    }
    before.current = value
    refocus.current = false
    input.current?.focus()
    input.current?.select()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing])

  if (!editing) {
    return (
      <h1 tabIndex={-1} title={value}>
        {value}
      </h1>
    )
  }

  /* ✓ is Enter and ✕ is Escape, focus back to the pencil included. The kit
     keeps the input focused through the press, so no focus leaves the field
     before the button has settled the name. A leave keeps the typed name as it
     stands, only putting the old one back over a blank. */
  return (
    <NameField
      inputRef={input}
      value={value}
      max={RISK_PROFILE_NAME_MAX}
      label="Profile name"
      placeholder="Remote workforce"
      onChange={onChange}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          finish()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          finish(true)
        }
      }}
      onLeave={() => {
        if (!value.trim()) onChange(before.current)
      }}
      onClose={() => setEditing(false)}
      onApply={() => finish()}
      onCancel={() => finish(true)}
    />
  )
}

/* Every signal as one line, in the device profile's own picked row: the tick
   that turns it on FIRST, then the mark, the name and its tip, the platforms
   it is collected on, and the weight at the end (owner, 18 Sep 2026: "convert
   them into a checkbox and place it at the first of each row like we have in
   Device profile").

   A switch at the row's end said the same thing, in the one place a device
   profile's rows keep their Remove. The tick is the gesture this list is
   actually for — turning sixteen signals on and off — and it is where the eye
   starts. An off signal's weight is disabled with it: a signal that is not
   collected has nothing to weigh. */
function SignalList({
  items,
  profile,
  onToggle,
  onTier,
}: {
  items: RiskSignal[]
  profile: RiskTuning
  onToggle: (s: RiskSignal, on: boolean) => void
  onTier: (s: RiskSignal, t: RiskSignal['tier']) => void
}) {
  return (
    <section className="bfp2__checks brs__list">
      <header className="bfp2__checkshead">
        <h2>Signals</h2>
        <TipDot
          label="About risk signals"
          text="Each signal that fires on a sign-in adds to the score by its priority. A signal switched off is not collected at all."
        />
        {/* No count here. The Risk scores block above already says how many are
            on, the Table version of this page never repeated it, and a number
            gets one useful place per view. */}
      </header>

      <div className="brs__listbody">
        {/* The columns' names, as a device profile's list has them (owner,
            22 Sep 2026: "add the headings in the risk profile as well — the
            attributes and priority"). The left over the tick and the name, the
            right over the priority. Hidden from assistive tech: every row's
            checkbox and picker already names itself. */}
        <div className="brs__row2 brs__colhead" aria-hidden>
          <span className="brs__colhead__left">Attribute</span>
          <span className="brs__rowctl">Priority</span>
        </div>
        <ul className="brs__rows">
          {items.map((s) => (
            <SignalRow key={s.id} signal={s} on={isOn(profile, s.id)} tier={tierFor(profile, s)} onToggle={onToggle} onTier={onTier} />
          ))}
        </ul>
      </div>
    </section>
  )
}

function SignalRow({
  signal,
  on,
  tier,
  onToggle,
  onTier,
}: {
  signal: RiskSignal
  on: boolean
  tier: RiskSignal['tier']
  onToggle: (s: RiskSignal, on: boolean) => void
  onTier: (s: RiskSignal, t: RiskSignal['tier']) => void
}) {
  const descId = useId()
  const Ico = signalIcon(signal.id)
  return (
    <li className="brs__row2">
      {/* The row IS the checkbox, as the device profile's is: one press target
          from the tick to the platform marks. `TipMark` rather than `TipDot`
          because a button cannot hold another button. */}
      <button
        type="button"
        role="checkbox"
        aria-checked={on}
        aria-describedby={descId}
        className={`bfp2__pickrow${on ? ' is-on' : ''}`}
        onClick={() => onToggle(signal, !on)}
      >
        <span className="bx-tick" aria-hidden>
          <Check size={11} strokeWidth={3.2} />
        </span>
        <span className="bfp2__pickico" aria-hidden>
          <Ico size={15} strokeWidth={1.7} />
        </span>
        <span className="bfp2__pickname">
          <span className="bfp2__pickword" title={signal.name}>
            {signal.name}
          </span>
          <TipMark text={signal.purpose} />
        </span>
        <span className="brs__rowplats">
          <SignalPlatforms signal={signal} plain />
        </span>
      </button>
      {/* The purpose, for a keyboard: `TipMark` is a pointer's way to it. */}
      <span id={descId} hidden>
        {signal.purpose}
      </span>

      {/* A `fieldset`, so the weight dims and stops taking presses with no
          `disabled` prop on the picker — the device profile's own trick. */}
      <fieldset
        className="brs__rowctl"
        disabled={!on}
        title={on ? undefined : `Turn ${signal.name} on to set its priority`}
      >
        <TierPick value={tier} label={`${signal.name} priority`} onChange={(t) => onTier(signal, t)} />
      </fieldset>
    </li>
  )
}

/* The platform filter's own word. Never "2 selected": a filter says what it is
   showing, and one platform says it by name. */
function platformSummary(plats: Platform[]): string {
  if (plats.length === 0) return 'All'
  if (plats.length === 1) return PLATFORMS.find((p) => p.id === plats[0])?.label ?? 'All'
  return `${plats.length} platforms`
}

/* The platforms a signal is collected on, as the marks the table used to head
   its columns with. Named as well as drawn: two logos side by side are a
   picture, and "Android, iOS" is what a reader would say. */
function SignalPlatforms({ signal, plain = false }: { signal: RiskSignal; plain?: boolean }) {
  const on = LIVE_PLATFORMS.filter((p) => signal.on.includes(p.id))
  return (
    <span className="brs__plats">
      {on.map((p) =>
        /* `plain` inside the list's row, which is itself a button: a tooltip
           there would be a button inside a button. The platform's name is read
           out either way. */
        plain ? (
          <span className="brs__plat" key={p.id} title={`Collected on ${p.label}`}>
            <PlatformMark platform={p.id} />
            <span className="u-sr-only">{p.label}</span>
          </span>
        ) : (
          <Tip key={p.id} text={`Collected on ${p.label}`}>
            <span className="brs__plat">
              <PlatformMark platform={p.id} />
              <span className="u-sr-only">{p.label}</span>
            </span>
          </Tip>
        ),
      )}
    </span>
  )
}

/* Every signal, in one table, with the category as a tinted pill on the row.

   Two columns after the name, not three and never four: the platforms a signal
   is collected on are marks ON ITS LABEL, and the weight is one control (owner,
   18 Sep 2026: "can we add it with the label only instead of a dedicated
   column", and before that "instead of 2
   different options for Android and iOS we need one… add icons in each row for
   which platform supports this signal"). A weight per platform asked an admin
   to say the same thing twice; a column for two logos spent a seventh of the
   table on them. */
function SignalTable({
  items,
  profile,
  onToggle,
  onTier,
}: {
  items: RiskSignal[]
  profile: RiskTuning
  onToggle: (s: RiskSignal, on: boolean) => void
  onTier: (s: RiskSignal, t: RiskSignal['tier']) => void
}) {
  return (
    <div className="brs__table" role="table" aria-label="Risk signals">
      <div className="brs__row brs__row--head" role="row">
        <span role="columnheader">Signal</span>
        <span role="columnheader" className="brs__col">
          Priority
        </span>
        {/* "Enabled", not "On": the column says what the switch makes the
            signal, and its two states are words an admin says out loud
            (owner, 18 Sep 2026). */}
        <span role="columnheader" className="brs__col brs__col--on">
          Enabled
        </span>
      </div>

      {items.map((s) => {
        const live = isOn(profile, s.id)
        const Ico = signalIcon(s.id)
        return (
          <div className={`brs__row ${live ? '' : 'is-off'}`} role="row" key={s.id}>
            <span className="brs__sig" role="cell">
              {/* Outside the text column, so the names keep one left edge. */}
              <i className="brs__mark" aria-hidden>
                <Ico size={15} strokeWidth={1.9} />
              </i>
              <span className="brs__sigtext">
                <span className="brs__name">
                  <b>{s.name}</b>
                  {/* What it means when it fires: on the mark, not a second line. */}
                  <TipDot label={`About ${s.name}`} text={s.purpose} />
                  {/* One tint per category, from CATEGORY_TONE. */}
                  <i className={`brs__cat is-${CATEGORY_TONE[s.category]}`}>{s.category}</i>
                  {/* The platforms that collect it, on the label rather than in
                      a column of their own (owner, 18 Sep 2026): two marks are
                      a property of the signal, and a column for them spent a
                      seventh of the table on four pixels of logo. */}
                  <SignalPlatforms signal={s} />
                </span>
              </span>
            </span>

            <span className="brs__col" role="cell" data-label="Priority">
              <TierPick
                value={tierFor(profile, s)}
                label={`${s.name} priority`}
                onChange={(t) => onTier(s, t)}
              />
            </span>

            <span className="brs__col brs__col--on" role="cell" data-label="Enabled">
              <Toggle
                checked={live}
                onChange={(v) => onToggle(s, v)}
                label={`${s.name} is ${live ? 'enabled' : 'disabled'}`}
                size="sm"
              />
            </span>
          </div>
        )
      })}
    </div>
  )
}
