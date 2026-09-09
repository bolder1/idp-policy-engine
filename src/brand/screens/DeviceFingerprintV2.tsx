import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  AlertTriangle,
  AppWindow,
  ArrowLeft,
  BadgeCheck,
  Brush,
  Check,
  CircuitBoard,
  Copy,
  Download,
  Pencil,
  Cpu,
  Eye,
  Fingerprint,
  Globe,
  Hash,
  IdCard,
  Languages,
  Lock,
  MapPin,
  Microchip,
  MonitorCog,
  MonitorSmartphone,
  Monitor,
  Network,
  Plus,
  RadioTower,
  Repeat,
  Search,
  Server,
  ShieldCheck,
  ShieldOff,
  Sliders,
  Smartphone,
  Trash2,
  Unlink,
  UserRound,
} from 'lucide-react'

import { Button, Drawer, MenuButton, Modal, NumberStepper, SaveBar, Tabs, TipDot, Toggle } from '../kit'
import { TierPick } from '../tier-pick'
import {
  CATEGORIES,
  DEFAULT_MAX_DEVICES,
  MODES,
  MODE_META,
  REACHES,
  REGISTRATION_LABEL,
  TIER_WEIGHT,
  VERSION_OPS,
  asksReach,
  attrOf,
  attributesFor,
  blockedAttributes,
  ITEM_NOUN,
  countLabel,
  isRuleValue,
  modeLabel,
  offeredAttributes,
  pruneValues,
  reachLabel,
  stepsFor,
  tierOf,
  versionOp,
  withReach,
  type AttrCategory,
  type Attribute,
  type AttrConfigValue,
  type AttrRuleValue,
  type FingerprintProfile,
  type ProfileMode,
  type ProfileReach,
  type Registration,
  type Roster,
} from '../fingerprint'
import { useBrand } from '../store'
import { EmptyState } from '../empty'
import type { Policy } from '../data'
import { policiesUsing } from './usage'
import { UsedByList, UsedByPeek } from './used-by'

/* -----------------------------------------------------------------------------
   Device fingerprint · profiles.

   The change this version makes is to the order of two questions.

   Every earlier version put "which attributes" and "how does each one behave"
   on the same surface, so creating a profile meant meeting forty-six
   attributes and their tolerances at once, before knowing which ones were even
   going in. That is the wrong first conversation. Picking the signals is a
   scoping decision — you can make it in a minute from names and priorities —
   and tuning each one is a configuration decision that only makes sense once
   the set is settled.

   So creation asks three cheap things: name it, say whether it MATCHES or
   SCORES, and tick the attributes it contains. Nothing is configured. Then it
   drops you inside the profile, where every attribute you chose is waiting with
   its own control, and nothing you did not choose is on the page at all.

   Those three things are now asked across two steps rather than on one
   scrolling surface: the profile in step one, the master in step two. See
   CreateModal for why.

   The list is the third surface, and it exists to answer "what do we already
   fingerprint with, and is anything using it".
   -------------------------------------------------------------------------- */

export function DeviceFingerprintV2() {
  const store = useBrand()
  const [openId, setOpenId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const open = openId ? store.fingerprints.find((p) => p.id === openId) ?? null : null

  /* The list can delete now, which is what the detail page has been promising
     all along: "No rule references this profile. It can be changed or deleted
     without affecting any sign-in." There was no delete anywhere on this screen
     when that sentence was written, so the store's `removeFingerprint` sat
     unused and the copy described an affordance nobody could reach.

     Deleting does not unlink the rules that name the profile — same contract as
     zones and hooks. The usage count on the row is the warning, and a rule
     pointing at a profile that no longer exists resolves to nothing, which the
     policy linter already reports. */
  const remove = (p: FingerprintProfile) => {
    store.removeFingerprint(p.id)
    store.showToast(`${p.name} deleted`)
  }

  /* `open` is what tells the two call sites apart, and they genuinely differ.
     From the list, duplicating is a bulk gesture — you may be about to do it
     again — so it stays put and the new row appears in place. From inside a
     profile it is "start from this one", which is only useful if it takes you
     there. */
  const duplicate = (p: FingerprintProfile, open = false) => {
    const copy: FingerprintProfile = {
      ...p,
      id: `fp-${p.id}-copy-${store.fingerprints.length}`,
      name: `${p.name} (copy)`,
    }
    store.addFingerprint(copy)
    store.showToast(`${copy.name} created`)
    if (open) setOpenId(copy.id)
  }

  const create = (p: FingerprintProfile) => {
    store.addFingerprint(p)
    setCreating(false)
    /* Straight inside. The brief is explicit and it is also the right default:
       a profile that has been scoped but not tuned is not finished, and landing
       back on the list would imply it was. */
    setOpenId(p.id)
  }

  return (
    <div className="bpage bfp2">
      {open ? (
        /* Keyed, and the key is load-bearing now that the page holds a draft:
           without it, opening a second profile would hand the same component a
           new `profile` prop while its `useState` seed kept the first one's
           unsaved edits. */
        <ProfilePage
          key={open.id}
          profile={open}
          policies={store.policies}
          onBack={() => setOpenId(null)}
          onChange={(p) => {
            store.updateFingerprint(p)
            store.showToast(`${p.name} saved`)
          }}
          onDuplicate={(p) => duplicate(p, true)}
          onDelete={(p) => {
            remove(p)
            setOpenId(null)
          }}
        />
      ) : (
        <ProfileList
          profiles={store.fingerprints}
          policies={store.policies}
          onOpen={setOpenId}
          onCreate={() => setCreating(true)}
          onDuplicate={duplicate}
          onDelete={remove}
        />
      )}

      <CreateDrawer open={creating} onClose={() => setCreating(false)} onCreate={create} />
    </div>
  )
}

/* --- List --------------------------------------------------------------------- */

function ProfileList({
  profiles,
  policies,
  onOpen,
  onCreate,
  onDuplicate,
  onDelete,
}: {
  profiles: FingerprintProfile[]
  policies: Policy[]
  onOpen: (id: string) => void
  onCreate: () => void
  onDuplicate: (p: FingerprintProfile) => void
  onDelete: (p: FingerprintProfile) => void
}) {
  const [menuFor, setMenuFor] = useState<string | null>(null)

  /* Picking an item closes the menu. The menu stops its own clicks bubbling to
     the table, which is what dismisses it, so without this a chosen menu stayed
     open — invisible on Delete because the row went with it, but on Duplicate
     it hung over the table and a second kebab could be opened beside it. Two
     open menus over different rows is a mis-click waiting to happen. */
  const choose = (run: () => void) => {
    setMenuFor(null)
    run()
  }

  return (
    <>
      <header className="bfp2__head">
        <div>
          <h1>Device profiles</h1>
          <p>
            A profile is a set of device signals and what to do when they change. Policy rules name
            a profile the way they name a zone.
          </p>
        </div>
        {/* Not while the empty state is up: it offers the same action in
            the middle of the page, and two brand buttons pointing at one
            dialog is a question the reader has to stop and answer. */}
        {profiles.length > 0 && (
          <Button variant="brand" onClick={onCreate}>
            <Plus size={15} strokeWidth={2.2} aria-hidden />
            Create new profile
          </Button>
        )}
      </header>

      {profiles.length === 0 ? (
        <EmptyState
          icon={MonitorSmartphone}
          title="No profiles yet"
          /* The signals by name. "What identifies a device" is the page
             caption again; a TPM key and an OS build are the things somebody
             is actually about to choose between. */
          blurb="The signals that identify a machine — its TPM key, its serial, its OS build — and what should happen on the day they stop matching."
          action={
            <Button variant="brand" onClick={onCreate}>
              <Plus size={15} strokeWidth={2.2} aria-hidden />
              Create your first profile
            </Button>
          }
        />
      ) : (
        <div className="bfp2__table" role="table" onClick={() => setMenuFor(null)}>
            <div className="bfp2__trow bfp2__thead" role="row">
              <span role="columnheader">Profile</span>
              <span role="columnheader">Decides by</span>
              <span role="columnheader">Attributes</span>
              <span role="columnheader">Used by</span>
              <span role="columnheader" />
            </div>
            {profiles.map((p) => {
              const users = policiesUsing('fingerprint', p.id, policies)
              return (
              <div className="bfp2__trow" role="row" key={p.id}>
                {/* One cell, as on the zones table — the icon belongs to the
                    name rather than to a column of its own. */}
                <span role="cell" className="bfp2__tname">
                  {/* No `is-${p.mode}` on the tile. It never had a rule — the
                      tile is deliberately grey, because the chip beside it
                      already names the kind in that kind's colour — so the
                      class was a mode name emitted into the DOM for nothing,
                      and one more place a rename could break. */}
                  <span className="bfp2__tile bfp2__tile--sm" aria-hidden>
                    {renderModeIcon(p.mode, 13)}
                  </span>
                  <button type="button" className="bfp2__gname" onClick={() => onOpen(p.id)}>
                    {p.name}
                  </button>
                </span>
                <span role="cell">
                  {/* The TINT, not the id. `is-${p.mode}` meant a rename had
                      to be mirrored in the stylesheet, and a class matching
                      nothing renders an untinted chip — no error, no failing
                      test, a chip that quietly stops saying anything. */}
                  <i className={`bfp2__modechip is-${MODE_META[p.mode].tint}`}>{modeLabel(p)}</i>
                </span>
                <span role="cell" className="bfp2__tnum">{p.enabled.length}</span>
                {/* The count, and what is behind it — the same peek the zones
                    table and the policies table use. */}
                <span role="cell">
                  <UsedByPeek users={users} />
                </span>

                {/* The same three actions the zones table carries, in the same
                    order, because a profile and a zone are the same kind of
                    thing to an admin: a library object a rule points at. */}
                <span role="cell" className="bfp2__menuwrap">
                  <button
                    type="button"
                    className="bfp2__kebab"
                    aria-label={`Actions for ${p.name}`}
                    aria-expanded={menuFor === p.id}
                    onClick={(e) => {
                      e.stopPropagation()
                      setMenuFor((m) => (m === p.id ? null : p.id))
                    }}
                  >
                    ⋯
                  </button>
                  <AnimatePresence>
                    {menuFor === p.id && (
                      <motion.div
                        className="bmenu"
                        initial={{ opacity: 0, y: -4, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.98 }}
                        transition={{ duration: 0.13 }}
                        onClick={(e) => e.stopPropagation()}
                        role="menu"
                      >
                        <button role="menuitem" onClick={() => choose(() => onOpen(p.id))}>
                          <Eye size={14} strokeWidth={1.9} aria-hidden />
                          View details
                        </button>
                        <button role="menuitem" onClick={() => choose(() => onDuplicate(p))}>
                          <Copy size={14} strokeWidth={1.9} aria-hidden />
                          Duplicate
                        </button>
                        <span className="bmenu__rule" />
                        <button role="menuitem" className="is-danger" onClick={() => choose(() => onDelete(p))}>
                          <Trash2 size={14} strokeWidth={1.9} aria-hidden />
                          Delete profile
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </span>
              </div>
            )
            })}
        </div>
      )}
    </>
  )
}

/* --- Create ------------------------------------------------------------------- */

/* The labels and blurbs live in `fingerprint.ts` now, and only the marks are
   here — an icon is a rendering decision and a name is not.

   They were declared in this file as `MODES`, with strings that did not match
   `modeLabel`'s: a profile was called "Attribute based" while being created and
   "Attribute match" everywhere afterwards, for the same profile, on the same
   day. Two lists is how that happens, so there is one.

   `MonitorCog` rather than `Sliders`: a screen with a setting on it, which is
   what an OS-and-version profile names. `Sliders` said "settings" generically
   and said nothing about an OS — and it is the mark this console uses for Edit
   buttons two rows further down the same page.

   `Fingerprint` rather than `Gauge`: this is the kind that actually
   fingerprints. `Gauge` was right for "Risk score" and reads as SPEED under the
   new name — and `Fingerprint` is already the mark the policy builder draws
   these options with, so the two surfaces stop disagreeing. */
const MODE_ICON: Record<ProfileMode, typeof Sliders> = {
  os: MonitorCog,
  device: Fingerprint,
}

const REACH_ICON: Record<ProfileReach, typeof Sliders> = {
  agentless: Globe,
  agent: Microchip,
}

/* `CAT_META` and `metaOf` — an icon and a tint per category — stood here, and
   went when the categories did. What is left is `ATTR_ICON`: a mark per
   attribute, which is the identifying the tint was helping with anyway, at
   fourteen rows and no groups to tell apart. */

const ATTR_ICON: Record<string, typeof Cpu> = {
  'device-type': Smartphone,
  mac: Network,
  os: Monitor,
  tpm: Lock,
  motherboard: CircuitBoard,
  'machine-sid': IdCard,
  browser: AppWindow,
  locale: Languages,
  canvas: Brush,
  'secure-boot': BadgeCheck,
  ip: Hash,
  isp: RadioTower,
  geo: MapPin,
  vpn: ShieldOff,
}

/* `AttrFilter` — a search and a row of category pills, shared by the picker and
   the profile page — stood here.

   It was built for thirty-eight. The master is fourteen: one screen, no groups,
   nothing to narrow. A filter over a list you can already see whole is a
   control that can only ever tell you what you were already looking at, and the
   pills were five of them.

   The picker keeps a plain search, because a modal that opens on a scroller is
   still worth being able to jump around in. The profile page has none — it
   holds at most fourteen rows and usually fewer. */

/* `CAT_META` and `metaOf` stood here — a tint and an icon per category, for
   the rail that filed thirty-eight attributes into five columns of one.

   The rail is a dropdown now and the list is flat, so there is no per-category
   surface left to tint: a `<option>` cannot carry a colour that means anything,
   and a flat list tinted five ways is a list wearing its filing scheme as
   decoration. The tints themselves live on in `--cat-*` for the one thing that
   still uses them — a selected row takes its category's colour rather than the
   brand, so a search returning hits from four families reads as four families.

*/

function AttrStep({
  mode,
  reach,
  picked,
  setPicked,
  config,
  weights,
  onValue,
  onWeight,
  settings,
  onBack,
}: {
  mode: ProfileMode
  /** Null before the question has been asked; reads as "no agent", the safe half. */
  reach: ProfileReach | null
  picked: string[]
  setPicked: (ids: string[]) => void
  config: Record<string, AttrConfigValue>
  weights: Record<string, number>
  onValue: (id: string, v: AttrConfigValue) => void
  onWeight: (id: string, w: number) => void
  /* Whether a ticked row opens its settings underneath it.

     Off while the profile is being CREATED, on once it exists. Choosing what a
     profile watches and tuning what each signal is worth are two jobs, and the
     wizard step was doing both: every tick unfolded a weight dropdown and a
     configuration control, so a person picking eight attributes answered
     sixteen questions they had not asked for, in a list that grew under them
     as they worked.

     The defaults are not lost by hiding them — an untouched attribute keeps the
     weight and the precision the catalogue gives it, which is the same value
     the wizard would have written. So the wizard says WHAT is watched, and the
     profile's own Attributes panel says how much each one counts. */
  settings: boolean
  /* Absent on the detail page, where there is no step to go back to. */
  onBack?: () => void
}) {
  const [q, setQ] = useState('')
  /* '' is every category, and it is the default. The rail this replaces made
     you pick one before you could see anything, which is a filing scheme
     presented as a prerequisite. */
  const [cat, setCat] = useState<AttrCategory | ''>('')

  const offered = offeredAttributes(mode, reach)
  const blocked = blockedAttributes(mode, reach)
  const locked = offered.filter((a) => a.always)

  /* Counted against what is OFFERED, never against the whole catalogue. "6 of
     38 selected" on an agentless profile names a denominator eighteen of whose
     rows are not on the screen and cannot be reached from it. */
  const chosen = picked.filter((id) => offered.some((a) => a.id === id))

  const needle = q.trim().toLowerCase()
  const shown = offered.filter(
    (a) =>
      (!cat || a.category === cat) &&
      (!needle ||
        a.name.toLowerCase().includes(needle) ||
        a.purpose.toLowerCase().includes(needle) ||
        (a.category ?? '').toLowerCase().includes(needle)),
  )

  const toggle = (id: string) =>
    setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id])

  const row = (a: Attribute) => (
    <AttrPickRow
      key={a.id}
      attr={a}
      mode={mode}
      on={a.always || picked.includes(a.id)}
      config={config}
      weights={weights}
      settings={settings}
      onToggle={() => toggle(a.id)}
      onValue={onValue}
      onWeight={onWeight}
    />
  )

  /* --- The small catalogue: no bar at all -----------------------------------

     Five rows, all of them on screen, every one of them a condition somebody is
     about to state. A search box over five rows is a control that can only ever
     hide four of them, and a category filter over a list with no categories is
     a control with one option. */
  if (!asksReach(mode) && offered.length <= 8) {
    return <div className="bfp2__pickrows">{offered.map(row)}</div>
  }

  const free = shown.filter((a) => !a.always)
  const lockedShown = shown.filter((a) => a.always)
  const blockedShown = cat ? blocked.filter((a) => a.category === cat) : blocked

  return (
    <div className="bfp2__pick">
      {/* --- The bar ---------------------------------------------------------

          The category rail is a dropdown here, and the list below is all of
          them by default.

          The rail was five buttons down the left, and it showed ONE category at
          a time: a filing scheme you had to operate before the catalogue would
          show you anything, spending 196px of a panel's width to hide 80% of
          its contents. It answered "have I done Hardware yet" with a count per
          row, which is real — and the count now sits in the dropdown's own
          options, where it costs no width at all.

          The list is the thing. The filter is a control on the bar beside the
          search, which is where every list in this console puts one. */}
      <div className="bfp2__pickbar">
        <label className="bfp2__search">
          <Search size={14} strokeWidth={1.9} aria-hidden />
          <input
            type="search"
            value={q}
            placeholder={`Search all ${offered.length} attributes…`}
            aria-label="Search attributes"
            onChange={(e) => setQ(e.target.value)}
          />
        </label>

        <select
          className="bfp2__select bfp2__catfilter"
          aria-label="Filter by category"
          value={cat}
          onChange={(e) => setCat(e.target.value as AttrCategory | '')}
        >
          <option value="">All categories</option>
          {CATEGORIES.map((c) => {
            const all = offered.filter((a) => a.category === c.id)
            /* A category an agentless profile cannot reach at all is offered
               and says so, rather than being dropped from the list — "why is
               Security missing" is the support ticket that hiding it writes. */
            return (
              <option key={c.id} value={c.id} disabled={all.length === 0}>
                {c.label} · {all.filter((a) => a.always || picked.includes(a.id)).length}/{all.length}
                {all.length === 0 ? ' · needs an agent' : ''}
              </option>
            )
          })}
        </select>

        <span className={`bfp2__pickcount ${chosen.length ? 'is-on' : ''}`}>
          {chosen.length} of {offered.length} selected
        </span>
        {/* Clears what can be cleared. The always-on four are not "selected" in
            a sense anybody can undo, so a Clear that silently left four ticked
            rows behind would read as a broken control rather than a correct
            one — the label says which. */}
        {chosen.length > locked.length && (
          <button
            type="button"
            className="bfp2__clear"
            onClick={() => setPicked(picked.filter((id) => locked.some((a) => a.id === id)))}
          >
            Clear the rest
          </button>
        )}
      </div>

      <div className="bfp2__pane">
        {shown.length === 0 ? (
          <p className="bfp2__none">Nothing matches that.</p>
        ) : (
          <>
            {/* --- Always collected, at the top --------------------------------

                Pinned rather than left in category order, because they are the
                one part of this list nobody is choosing — a locked row sitting
                between two you can tick reads as one you have failed to
                untick. Grouped, labelled, and above the line, they read as what
                they are: the floor this profile is built on.

                They still carry their settings. What a profile decides about
                these is not WHETHER they are collected but how much each one
                counts, and that is the more interesting half. */}
            {lockedShown.length > 0 && (
              <section className="bfp2__pang">
                <header className="bfp2__panghead">
                  <Lock size={12} strokeWidth={2} aria-hidden />
                  <h4>Always collected</h4>
                  <span>{lockedShown.length}</span>
                  <TipDot
                    label="Always collected"
                    text="These arrive with every request before any profile is consulted, so they cannot be switched off. What this profile decides is how much each one counts."
                  />
                </header>
                <div className="bfp2__pickrows">{lockedShown.map(row)}</div>
              </section>
            )}

            {free.length > 0 && (
              <section className="bfp2__pang">
                {lockedShown.length > 0 && (
                  <header className="bfp2__panghead">
                    <h4>{cat ? CATEGORIES.find((c) => c.id === cat)?.label : 'Everything else'}</h4>
                    <span>
                      {free.filter((a) => picked.includes(a.id)).length}/{free.length}
                    </span>
                    <button
                      type="button"
                      className="bfp2__selectall"
                      onClick={() => {
                        const ids = free.map((a) => a.id)
                        const full = ids.every((id) => picked.includes(id))
                        setPicked(
                          full
                            ? picked.filter((x) => !ids.includes(x))
                            : [...new Set([...picked, ...ids])],
                        )
                      }}
                    >
                      {free.every((a) => picked.includes(a.id)) ? 'Clear these' : 'Select all'}
                    </button>
                  </header>
                )}
                <div className="bfp2__pickrows">{free.map(row)}</div>
              </section>
            )}
          </>
        )}

        {/* Named, not counted. "12 more need an agent" is a number you cannot
            act on; the names are what tell you whether the ones you are missing
            are ones you wanted. */}
        {blockedShown.length > 0 && (
          <p className="bfp2__locked">
            <Lock size={12} strokeWidth={2} aria-hidden />
            <span>
              {blockedShown.length} more need an agent —{' '}
              {blockedShown
                .slice(0, 3)
                .map((a) => a.name)
                .join(', ')}
              {blockedShown.length > 3 && ` and ${blockedShown.length - 3} others`}.
            </span>
            {onBack && (
              <button type="button" className="bfp2__clear" onClick={onBack}>
                Change what it reads
              </button>
            )}
          </p>
        )}
      </div>
    </div>
  )
}

/* One row in the catalogue: the tick, and — once ticked — what it is set to.

   The settings render only when the row is on. A catalogue where every row
   carries two controls is a form, not a list, and thirty-eight of them is a
   form nobody reads to the bottom of. Ticking is what says "I want this one",
   and it is the moment the question "set to what?" becomes worth asking.

   Nothing is WRITTEN on tick. `AttrControl` already falls back to the master's
   own default, and storing that default would make "nobody has touched this"
   indistinguishable from "somebody chose exactly the default" — which is the
   distinction `restrictionSet` exists for one panel further down. It matters
   here too: `pruneValues` can then tell a real setting from a ghost. */
function AttrPickRow({
  attr,
  mode,
  on,
  config,
  weights,
  settings,
  onToggle,
  onValue,
  onWeight,
}: {
  attr: Attribute
  mode: ProfileMode
  on: boolean
  config: Record<string, AttrConfigValue>
  weights: Record<string, number>
  /** See `AttrStep`: off while creating, on once the profile exists. */
  settings: boolean
  onToggle: () => void
  onValue: (id: string, v: AttrConfigValue) => void
  onWeight: (id: string, w: number) => void
}) {
  /* An always-collected row is ticked and cannot be untucked, so the toggle is
     a disabled button rather than a live one with a handler that refuses.

     `disabled` and not `aria-disabled`: there is nothing to announce and
     nothing to explain on press. Where settings are shown at all, the row still
     opens them — what a profile decides about an always-collected signal is not
     WHETHER it is read but how much it counts, which is the more interesting
     half — so the control that is dead is exactly the one with no decision
     behind it. */
  const fixed = Boolean(attr.always)
  return (
    <div className={`bfp2__pickrow ${on ? 'is-on' : ''} ${fixed ? 'is-fixed' : ''}`}>
      <button
        type="button"
        className="bfp2__picktoggle"
        aria-pressed={on}
        disabled={fixed}
        onClick={onToggle}
      >
        <span className="bfp2__picktick" aria-hidden>
          <Check size={11} strokeWidth={3.2} />
        </span>
        {/* No attribute mark on a picker row.

            It was a second glyph beside the tick, at the same size, on every
            row — so a column of thirty-eight rows opened with two small shapes
            per line and the one that MATTERS is the checkbox. A mark earns its
            place where it distinguishes one row from another at a glance; here
            it competed with the control that says whether the row is chosen.

            The detail page keeps its icons: those rows have no checkbox, so the
            mark is the only thing in that column and it is doing the
            identifying work rather than fighting for it. */}
        <span className="bfp2__pickmain">
          <span className="bfp2__pickname">
            {attr.name}
            {/* Says why the tick will not move, on the row where it will not
                move. The section heading above says it once for the group; a
                row read on its own — after a search, say, where the grouping is
                gone — still has to answer it. */}
            {fixed && <i className="bfp2__fixedtag">Always on</i>}
            {/* Marked here rather than only on the inner page. Whether a signal
                is collected at all is part of deciding to include it, and
                learning it afterwards is learning it too late. */}
            {attr.phase === 2 && <i className="bfp2__soon">Not collected yet</i>}
          </span>
          {/* On the row, not on a `title` tip. The tip was right when the pane
              held thirty-eight rows in two columns and the sentences were a
              wall of prose in front of a choice made from the names — but a
              `title` is unreachable by keyboard, and with the rail showing one
              category at a time there is room for the line that says what the
              attribute IS. */}
          <span className="bfp2__pickpurpose">{attr.purpose}</span>
        </span>
      </button>

      {on && settings && (
        <div className="bfp2__pickvals">
          {/* Both, on a device row, and they are not the same question.

              The page argued for years that showing a weight AND a
              configuration meant one of them was inert, and that argument was
              right about the OS catalogue's configs — "at least Windows 10" is
              a CONDITION, and a score has no conditions. It is wrong about the
              device catalogue's, which are all precision: "Match on: Family
              only" decides whether a Chrome update counts as a change at all.
              One says whether something changed, the other says what that
              costs. The one genuine duplicate — `device-type`'s "Treat a change
              as" — is deleted from the catalogue rather than hidden here. */}
          {mode === 'device' && (
            <div className="bfp2__pickcfg">
              <span>How much it counts</span>
              <TierPick
                value={tierOf(weights[attr.id] ?? attr.weight)}
                label={`${attr.name} weight`}
                onChange={(t) => onWeight(attr.id, TIER_WEIGHT[t])}
              />
            </div>
          )}
          {attr.config && (
            <div className="bfp2__pickcfg">
              <span>{attr.config.label}</span>
              <AttrControl attr={attr} values={config} onChange={onValue} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* --- What agent-based costs, and how to pay it ---------------------------------

   Agent-based is the only answer on this screen with a prerequisite outside it.
   Nothing about the profile is wrong until an agent is actually installed on
   the machines — and then every sign-in from a machine without one is refused,
   with a message the admin has never seen and cannot change.

   The console states this in a callout that appears AFTER agent-based has been
   chosen, and carries the download in it. Two things are wrong with that and
   only one of them was fixed here before now: the platform limit is a decision
   INPUT, so it moved onto the card where it can affect the choice. The
   download is the opposite — it is what you do once you HAVE chosen, so it
   belongs exactly where the console puts it, and it was simply missing.

   So this renders under the cards, on the answer, in both places the answer is
   given. It does not repeat "Windows only": that is on the card two rows above,
   and a prerequisite panel that restates the card is a panel people learn to
   skip. */
function AgentPrereq() {
  return (
    <div className="bfp2__prereqbox">
      <span className="bfp2__prereqico" aria-hidden>
        <Microchip size={15} strokeWidth={1.8} />
      </span>
      <div className="bfp2__prereqbody">
        <strong>Before this profile can work</strong>
        <ul>
          <li>Every person it governs has to install the Device Agent on the machines they sign in from.</li>
          <li>
            Until they do, they cannot sign in: they are told “Please install the miniOrange Device
            Agent on your device and try again.”
          </li>
        </ul>
        {/* No handler, the same as the roster's Upload CSV. This prototype does
            not ship a binary, and a button that pretends to start a download is
            worse than one that visibly does not. */}
        <Button variant="secondary" size="sm">
          <Download size={14} strokeWidth={1.9} aria-hidden />
          Download agent
        </Button>
      </div>
    </div>
  )
}

/* Every step's explanation is on its heading, not under it.

   Each of these was a paragraph of two or three lines between a heading and the
   controls it described — so on a panel of three steps you read roughly a
   hundred words before reaching the first thing you could press, and you read
   them again on every visit, having understood them the first time. A wizard is
   not a document: the reason a step exists is worth ONE reading and the step
   itself is worth many.

   The sentences are unchanged and none of them is lost. They are on the mark
   beside each heading, which is where this screen already puts a thing you want
   once — the same `TipDot` the attribute rows and the detail rail use, so there
   is one gesture for "tell me more" everywhere on the surface. */

/* --- The mode mark, in one place ---------------------------------------------- */
const renderModeIcon = (mode: ProfileMode, size: number) => {
  const Ico = MODE_ICON[mode]
  return <Ico size={size} strokeWidth={1.7} />
}

/* Where you are, how far in, and how much is left.

   Numbered AND named, which took a revision to arrive at. It was words alone,
   on the argument that three is few enough to name every step and that naming
   is the difference between a progress bar and a table of contents. That is
   true about the LABELS and it is not an argument against the numbers: a
   contents page has page numbers. The words say what each step is; the numeral
   says where you are in the sequence and — with the last one in view — how much
   is left, which words in a row cannot tell you at a glance.

   The done state puts the tick INSIDE the circle rather than beside the word,
   so the ladder keeps one mark per step and every label sits on one baseline. */
function WizSteps({ steps, at }: { steps: string[]; at: number }) {
  return (
    <>
      <ol className="bfp2__wizsteps">
        {steps.map((label, i) => (
          <li
            key={label}
            className={`bfp2__wizstep ${i === at ? 'is-on' : ''} ${i < at ? 'is-done' : ''}`}
            aria-current={i === at ? 'step' : undefined}
          >
            <span className="bfp2__wizstep__n" aria-hidden>
              {i < at ? <Check size={12} strokeWidth={3} /> : i + 1}
            </span>
            {label}
          </li>
        ))}
      </ol>
      {/* `Drawer` moves focus once, when it opens, so nothing else announces a
          step change to a screen reader — the panel's caption is re-rendered
          but not re-read. */}
      <p className="u-sr-only" aria-live="polite">{`Step ${at + 1} of ${steps.length} — ${steps[at]}`}</p>
    </>
  )
}

/* --- Create ------------------------------------------------------------------

   A slide-over, not a centred dialog, and two steps or three.

   It was a modal, and it outgrew one. A modal is right for a question — name
   this, confirm that — and this is a form: a name, a choice of kind, a
   collector, four enrolment rows, and a catalogue of up to thirty-eight
   attributes each of which opens its own settings. At 620px that was a column
   of controls in a box floating over a page it had nothing to do with; at
   1000px it was a box with almost no page left around it, which is a modal
   pretending to be a screen. A panel that slides in from the edge is the shape
   this already was — it keeps the list it came from visible beside it, it can
   be dragged wider for the step that needs it, and it does not have to choose
   a width that suits both a text field and a five-category picker.

   THE STEPS

     1  Profile       what it is called, and which of the two kinds it is
     2  Devices       what the collector can read, and how machines enrol —
                      order matters, a roster needs MAC and MAC needs an agent.
                      The DEVICE kind only.
     3  Attributes    the catalogue, and every ticked row's own settings
        / 2 Requirements  on the OS kind, which has no middle step

   Enrolment is asked on step 2 rather than on the detail page because a profile
   should not arrive holding defaults nobody chose — which is what
   `restrictionSet` exists to admit. It is asked of the DEVICE kind only,
   because that is where it has a neighbour to depend on: the roster option
   turns on the collector answer directly above it. Asked of the OS kind it was
   a step of three rows and a caveat explaining why one of them was
   unavailable — an interruption in a two-question flow. That profile answers it
   from the detail page's one Edit, and `restrictionSet` stays false until it
   does.
   -------------------------------------------------------------------------- */
function CreateDrawer({
  open,
  onClose,
  onCreate,
}: {
  open: boolean
  onClose: () => void
  onCreate: (p: FingerprintProfile) => void
}) {
  const [at, setAt] = useState(0)
  const [name, setName] = useState('')
  const [mode, setMode] = useState<ProfileMode>('os')
  /* Null, not `'agentless'`. A default here would let the question be skipped,
     and the whole reason it is a step is that it is an answer somebody gives
     rather than a setting that happens to have a value. */
  const [reach, setReach] = useState<ProfileReach | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [config, setConfig] = useState<Record<string, AttrConfigValue>>({})
  const [weights, setWeights] = useState<Record<string, number>>({})
  const [registration, setRegistration] = useState<Registration>('self')
  const [autoRegister, setAutoRegister] = useState(false)
  const [maxDevices, setMaxDevices] = useState<number | null>(DEFAULT_MAX_DEVICES)

  /* Cleared on the way IN, not on the way out.

     The panel never unmounts, so something has to blank it between uses. Doing
     it on close means either a visible snap back to step one while it is still
     animating away, or a timer to outlast the animation — and a timer races the
     user: close on the last step, re-open inside the delay, and the pending
     reset fires under an open panel. Clearing on open has neither problem. */
  useEffect(() => {
    if (!open) return
    setAt(0)
    setName('')
    setMode('os')
    setReach(null)
    setPicked([])
    setConfig({})
    setWeights({})
    setRegistration('self')
    setAutoRegister(false)
    setMaxDevices(DEFAULT_MAX_DEVICES)
  }, [open])

  const steps = stepsFor(mode)
  const last = steps.length - 1

  /* A permissive draft and a strict write.

     `picked` is never filtered as you move between steps, so going back from the
     catalogue to the collector, flipping to agentless and returning HIDES the
     agent-only rows and flipping back RESTORES them — which is what a Back
     button is for. What gets written is `offeredPicked`, so no incoherent
     profile can be created even transiently, and nothing is silently deleted
     from under you on the way past. */
  const offered = offeredAttributes(mode, reach)
  const offeredPicked = picked.filter((id) => offered.some((a) => a.id === id))

  const named = name.trim().length > 0
  const canAdvance = at === 0 ? named : at === 1 ? reach !== null : true
  const canSave = named && offeredPicked.length > 0

  const save = () => {
    if (!canSave) return
    onCreate(
      pruneValues({
        id: `fp-${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`,
        name: name.trim(),
        mode,
        /* Exactly what was ticked, and exactly what was set — the difference
           between a profile you made and a profile that was made for you. */
        enabled: offeredPicked,
        config,
        weights,
        /* Agentless on an OS profile is not a default nobody chose: it is what
           those five attributes actually need. They arrive with the request. */
        reach: reach ?? 'agentless',
        registration,
        maxDevices,
        roster: null,
        autoRegister,
        /* True only where something asked. The Devices step asks it of a
           device profile; an OS profile has no Devices step, so nobody has, and
           saying otherwise would present "self-service, three devices" as a
           configuration somebody chose. */
        restrictionSet: asksReach(mode),
        usedIn: 0,
      }),
    )
  }

  /* The step's own question, as the panel's caption. The title stays put: a
     panel that renames itself on every press is one you have to re-read to know
     you are still in the same place. */
  const caption =
    at === 0
      ? 'What it is called, and how it decides.'
      : at === 1 && asksReach(mode)
        ? 'What the collector can read, and how machines enrol.'
        : mode === 'os'
          ? 'Everything a device has to satisfy.'
          : 'Every signal it watches, and what each one counts for.'

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="New device profile"
      caption={caption}
      /* Wide enough for the catalogue step, draggable for the one time in ten
         somebody wants the whole of Hardware on screen at once. The first two
         steps do not need 760 and are not hurt by it — the fields inside them
         have their own widths, so the extra space is margin rather than
         stretched controls. */
      width={760}
      resizable
      minWidth={560}
      maxWidth={1120}
      actions={
        <>
          <Button variant="ghost" onClick={at === 0 ? onClose : () => setAt(at - 1)}>
            {at === 0 ? 'Cancel' : 'Back'}
          </Button>
          {at === last ? (
            <Button variant="brand" disabled={!canSave} onClick={save}>
              Create profile
            </Button>
          ) : (
            <Button variant="brand" disabled={!canAdvance} onClick={() => setAt(at + 1)}>
              Next
            </Button>
          )}
        </>
      }
    >
      <WizSteps steps={steps} at={at} />

      {at === 0 && (
        <div className="bfp2__form">
          <label className="bfp2__field">
            <span>Profile name</span>
            <input
              type="text"
              value={name}
              autoFocus
              placeholder="Corporate laptops"
              onChange={(e) => setName(e.target.value)}
            />
            <span className="bfp2__hint">
              A policy rule names a profile the way it names a zone, so name it after the fleet it
              describes.
            </span>
          </label>

          <fieldset className="bfp2__modes">
            <legend>How it decides</legend>
            {MODES.map((m) => {
              const Ico = MODE_ICON[m.id]
              return (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={mode === m.id}
                  className={`bfp2__mode-card ${mode === m.id ? 'is-on' : ''}`}
                  onClick={() => {
                    /* The two do not share a catalogue, so a ticked row cannot
                       survive the switch — and neither can a value set against
                       it. Clearing here rather than filtering at the end means
                       no count in this panel is ever briefly a lie. */
                    setMode(m.id)
                    setPicked([])
                    setConfig({})
                    setWeights({})
                    setReach(null)
                    /* A roster needs an agent, and an OS profile has none. */
                    if (m.id === 'os') {
                      setRegistration('self')
                      setMaxDevices((n) => n ?? DEFAULT_MAX_DEVICES)
                    }
                  }}
                >
                  <span className="bfp2__mode-ico" aria-hidden>
                    <Ico size={17} strokeWidth={1.8} />
                  </span>
                  <span className="bfp2__mode-body">
                    <strong>{m.label}</strong>
                    <em>{m.blurb}</em>
                    <i className="bfp2__mode-steps">
                      {attributesFor(m.id).length} attributes to choose from
                    </i>
                  </span>
                  {mode === m.id && (
                    <Check size={15} strokeWidth={2.6} className="bfp2__mode-tick" aria-hidden />
                  )}
                </button>
              )
            })}
          </fieldset>
        </div>
      )}

      {at === 1 && asksReach(mode) && (
        <div className="bfp2__form">
          <section className="bfp2__wizsection">
              <h4>
                What the collector can read
                <TipDot
                  label="What the collector can read"
                  text="This decides which attributes exist at the next step. Hardware identifiers — the TPM, the motherboard, the disk — need software running on the machine. Everything else arrives with the request."
                />
              </h4>

              <fieldset className="bfp2__modes" aria-label="What the collector can read">
                {REACHES.map((r) => {
                  const Ico = REACH_ICON[r.id]
                  return (
                    <button
                      key={r.id}
                      type="button"
                      role="radio"
                      aria-checked={reach === r.id}
                      className={`bfp2__mode-card ${reach === r.id ? 'is-on' : ''}`}
                      onClick={() => {
                        setReach(r.id)
                        /* A roster is matched on MAC, so going agentless takes
                           the option away — and the answer already given with
                           it, rather than leaving a selected value the next
                           dropdown will not offer. */
                        if (r.id === 'agentless') {
                          setRegistration('self')
                          setMaxDevices((n) => n ?? DEFAULT_MAX_DEVICES)
                        }
                      }}
                    >
                      <span className="bfp2__mode-ico" aria-hidden>
                        <Ico size={17} strokeWidth={1.8} />
                      </span>
                      <span className="bfp2__mode-body">
                        <strong>{r.label}</strong>
                        <em>{r.blurb}</em>
                        {r.note && (
                          <i className="bfp2__mode-note">
                            <AlertTriangle size={11} strokeWidth={2.2} aria-hidden />
                            {r.note}
                          </i>
                        )}
                      </span>
                      {reach === r.id && (
                        <Check size={15} strokeWidth={2.6} className="bfp2__mode-tick" aria-hidden />
                      )}
                    </button>
                  )
                })}
              </fieldset>

              {/* A count of what the answer above makes available stood here —
                  "20 of 38 attributes available · 18 need an agent". It was
                  written to give the collector question a consequence you could
                  see move, which it did, and it turned out to be the third
                  thing on this step saying the same thing: the card says what
                  agent-based costs, the panel below says what it requires of
                  everybody, and the next step names the attributes that are
                  missing and offers the way back to change it. A number is the
                  least useful of the four. */}
              {reach === 'agent' && <AgentPrereq />}
          </section>

          {/* Below the collector, and only once it is answered.

              It was on the page from the start, dimmed, with a line saying what
              it was waiting for — on the argument that a section appearing out
              of nowhere on a press reads as a step that grew, and that the
              shape of a form should be honest before you touch it. The argument
              is sound about a form you can fill in any order and wrong about
              this one: nothing here can be answered until the question above is,
              because the collector decides whether a roster exists as an option
              at all. So the placeholder was a heading and a sentence telling you
              to do the thing you were already looking at, occupying the space
              its own controls will take.

              What keeps it honest is the step ladder, which says there is one
              step and not two. */}
          {reach !== null && (
          <section className="bfp2__wizsection">
            <h4>
              How devices enrol
              <TipDot
                label="How devices enrol"
                text="The attributes decide whether a machine is the SAME one. These decide whether it is allowed to become a known one at all."
              />
            </h4>
            <EnrolmentFields
              mode={mode}
              reach={reach}
              registration={registration}
              autoRegister={autoRegister}
              maxDevices={maxDevices}
              roster={null}
              onChange={(p) => {
                if (p.registration !== undefined) setRegistration(p.registration)
                if (p.autoRegister !== undefined) setAutoRegister(p.autoRegister)
                if (p.maxDevices !== undefined) setMaxDevices(p.maxDevices)
              }}
            />
          </section>
          )}
        </div>
      )}

      {at === last && at > 0 && (
        <section className="bfp2__wizsection">
          <h4>
            What it {ITEM_NOUN[mode].verb}
            <TipDot
              label={`What it ${ITEM_NOUN[mode].verb}`}
              text={
                mode === 'os'
                  ? 'Each one you tick is a condition, and they all have to hold. A platform you do not name is not checked at all.'
                  : 'Tick what this profile watches. Each one starts at the weight the catalogue gives it — open the profile afterwards to change any of them.'
              }
            />
          </h4>
          <AttrStep
            mode={mode}
            reach={reach}
            picked={picked}
            setPicked={setPicked}
            config={config}
            weights={weights}
            onValue={(id, v) => setConfig((c) => ({ ...c, [id]: v }))}
            onWeight={(id, w) => setWeights((c) => ({ ...c, [id]: w }))}
            settings={false}
            onBack={asksReach(mode) ? () => setAt(1) : undefined}
          />
        </section>
      )}
    </Drawer>
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

   So the two halves become two tabs. `Basic details` is the profile itself, as
   a form rather than as facts with an Edit beside them. The attribute tab is
   the list. Both get the full width of the page, which is the width the
   enrolment rows and the attribute controls both wanted and neither had.

   And the page now has a draft. Every control used to write through to the
   store as it was touched — hence a drawer whose action said `Done` rather than
   `Save`, because there was nothing left to commit. Live write-through is a
   defensible model, but it is not the one asked for here, and it had a real
   cost this screen was paying: renaming a profile was unabortable, because the
   rename landed a keystroke at a time. Now the tabs edit a copy, the action bar
   appears when the copy differs, and `Discard` is a button rather than a
   retype.
   -------------------------------------------------------------------------- */

type ProfileTab = 'basic' | 'attributes'

/* What the enrolment answers are, for the one flag that has to know.

   `restrictionSet` records that somebody ANSWERED the enrolment questions — the
   difference between a profile running on defaults and one running on
   decisions. Saving a rename must not flip it, or the flag stops meaning what
   the empty state reads it for. */
const ENROLMENT_KEYS = ['registration', 'autoRegister', 'maxDevices', 'roster'] as const
const enrolmentAnswered = (before: FingerprintProfile, after: FingerprintProfile) =>
  ENROLMENT_KEYS.some((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]))

function ProfilePage({
  profile,
  policies,
  onBack,
  onChange,
  onDuplicate,
  onDelete,
}: {
  profile: FingerprintProfile
  policies: Policy[]
  onBack: () => void
  onChange: (p: FingerprintProfile) => void
  onDuplicate: (p: FingerprintProfile) => void
  onDelete: (p: FingerprintProfile) => void
}) {
  const [tab, setTab] = useState<ProfileTab>('basic')
  const [adding, setAdding] = useState(false)
  const [showUses, setShowUses] = useState(false)
  const [deleting, setDeleting] = useState(false)

  /* The edit buffer. Seeded once per profile — the call site keys this
     component on `profile.id`, so opening a different profile remounts rather
     than merging one profile's unsaved edits into another's. */
  const [draft, setDraft] = useState<FingerprintProfile>(profile)
  const dirty = JSON.stringify(draft) !== JSON.stringify(profile)

  /* `attrOf(draft.mode, …)`, not a merged lookup. `device-type` is in both
     catalogues and the merged list always answered with the OS copy, so a
     device profile has been reading the wrong row's purpose and category since
     the two lists split. */
  const chosen = draft.enabled
    .map((id) => attrOf(draft.mode, id))
    .filter((a): a is Attribute => Boolean(a))
  const users = policiesUsing('fingerprint', profile.id, policies)

  const setConfig = (id: string, v: AttrConfigValue) =>
    setDraft((d) => ({ ...d, config: { ...d.config, [id]: v } }))

  const setWeight = (id: string, w: number) =>
    setDraft((d) => ({ ...d, weights: { ...d.weights, [id]: w } }))

  /* Through `pruneValues`, so removing a row removes what it was set to.

     Writing `enabled` alone left `config['os-windows']` behind forever:
     invisible, because no surface draws a value for a row that is not there,
     and back the moment somebody re-ticked the attribute — restoring a setting
     nobody had re-approved and nobody had been shown. */
  const drop = (id: string) =>
    setDraft((d) => pruneValues({ ...d, enabled: d.enabled.filter((x) => x !== id) }))

  const save = () =>
    onChange({
      ...draft,
      restrictionSet: profile.restrictionSet || enrolmentAnswered(profile, draft),
    })

  const noun = ITEM_NOUN[draft.mode]
  /* "Attributes" on a device profile, "Requirements" on an OS one — the same
     word the rest of the screen uses for the things in the list, rather than a
     second name for them that only the tab bar knows. */
  const attrTab = noun.many.charAt(0).toUpperCase() + noun.many.slice(1)
  /* The same test the create wizard uses to decide whether it has two steps or
     three. One question, one answer, both surfaces. */
  const tabbed = asksReach(draft.mode)
  const phase2 = chosen.filter((a) => a.phase === 2).length

  return (
    <>
      <button type="button" className="bfp2__back" onClick={onBack}>
        <ArrowLeft size={14} strokeWidth={2} aria-hidden />
        All profiles
      </button>

      <header className="bfp2__head">
        {/* `draft.name`, not `profile.name`. The heading IS the name field
            now, so it has to show what you have typed rather than what was last
            saved — the bar at the bottom is what says the two differ. */}
        <div className="bfp2__pagehead">
          <span className="bfp2__tile bfp2__tile--lg" aria-hidden>
            {renderModeIcon(draft.mode, 18)}
          </span>
          <EditableName value={draft.name} onChange={(name) => setDraft((d) => ({ ...d, name }))} />
        </div>

        {/* The whole of C, R, U and D, in the order they are reached.

            Update is the page itself now, so what is left up here is everything
            that acts on the profile as a WHOLE — read it out, copy it, destroy
            it. Duplicate and Delete were on the list only, which meant the one
            screen showing you enough to decide whether a profile was worth
            keeping was the one screen that could not act on the answer. */}
        <div className="bfp2__headacts">
          <Button variant="secondary" size="sm" onClick={() => onDuplicate(draft)}>
            <Copy size={14} strokeWidth={1.9} aria-hidden />
            Duplicate
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setDeleting(true)}>
            <Trash2 size={14} strokeWidth={1.9} aria-hidden />
            Delete
          </Button>
        </div>
      </header>

      {/* Two tabs, or none, and the mode decides which.

          An OS-and-version profile is a name and a list of version floors.
          There is nothing else to put on a second tab: it has no collector to
          choose — `asksReach` is false for it, which is why the create wizard
          already skips that step — and none of the enrolment questions apply,
          because those govern how a machine becomes a KNOWN device and this
          kind of profile does not know devices at all. It asks what a machine
          is running, one sign-in at a time.

          So it gets one surface with its name at the top of it. A tablist with
          one tab is a label with a border round it, and a `Basic details` tab
          holding a single text field is a click charged for nothing.

          A device-attributes profile does have two halves — the collector and
          the enrolment rules on one, the watched attributes and their weights
          on the other — and keeps its tabs. */}
      {tabbed ? (
        <>
          {/* The count rides on the tab, so switching is never how you find out
              how many there are. */}
          <Tabs
            className="bx-tabs--line bfp2__tabs"
            name="Profile"
            value={tab}
            onChange={setTab}
            panelId="bfp2-panel"
            options={[
              { value: 'basic', label: 'Basic details', icon: Sliders },
              { value: 'attributes', label: attrTab, count: chosen.length, icon: Fingerprint },
            ]}
          />

          <div id="bfp2-panel" role="tabpanel" className="bfp2__panel">
            {tab === 'basic' ? (
              <BasicDetailsTab
                draft={draft}
                setDraft={setDraft}
                users={users}
                onShowUses={() => setShowUses(true)}
              />
            ) : (
              <AttributesTab
                draft={draft}
                chosen={chosen}
                phase2={phase2}
                onAdd={() => setAdding(true)}
                onConfig={setConfig}
                onWeight={setWeight}
                onDrop={drop}
              />
            )}
          </div>
        </>
      ) : (
        <div className="bfp2__panel bfp2__form">
          <AttributesTab
            draft={draft}
            chosen={chosen}
            phase2={phase2}
            onAdd={() => setAdding(true)}
            onConfig={setConfig}
            onWeight={setWeight}
            onDrop={drop}
          />
        </div>
      )}

      {/* The kit's bar, not a local one. Zones and risk profiles commit the
          same way, and three copies of a floating strip is three answers to how
          far off the bottom it sits. */}
      <SaveBar
        open={dirty}
        changes={changeSummary(profile, draft)}
        onDiscard={() => setDraft(profile)}
        onSave={save}
      />

      <Drawer
        open={showUses}
        onClose={() => setShowUses(false)}
        title="Used by"
        caption={`Policy rules that name ${profile.name}.`}
      >
        {users.length === 0 ? (
          <EmptyState
            compact
            icon={Unlink}
            title="Nothing references this profile"
            blurb="No policy rule names it, so renaming or deleting it changes nothing."
          />
        ) : (
          <UsedByList users={users} />
        )}
      </Drawer>

      {/* The picker stays a drawer, and that is not an exception to the tabs.

          Choosing FROM forty-six attributes and tuning the nine you chose are
          different jobs at different widths — the catalogue needs its
          categories, its search and its blocked-row explanations; the tab needs
          a list you can read down. The drawer writes into the draft, so what it
          saves is still nothing until the bar below says so. */}
      <AttributesDrawer
        open={adding}
        profile={draft}
        onClose={() => setAdding(false)}
        onSave={(next) => {
          setDraft(next)
          setAdding(false)
        }}
      />

      <DeleteProfileDialog
        open={deleting}
        profile={profile}
        users={users}
        onCancel={() => setDeleting(false)}
        onConfirm={() => {
          setDeleting(false)
          onDelete(profile)
        }}
      />
    </>
  )
}

/* What is unsaved, in the words of the thing that changed.

   Ordered as the tabs are, so the list also says which tab to look at. Returns
   the parts rather than a sentence: `SaveBar` counts them and shows the first
   two, which is a rule about how much of an edit fits on one strip and belongs
   with the strip rather than with each screen that has one. */
function changeSummary(before: FingerprintProfile, after: FingerprintProfile): string[] {
  const parts: string[] = []
  if (before.name !== after.name) parts.push('name')
  if (before.reach !== after.reach) parts.push('what it can read')
  if (enrolmentAnswered(before, after)) parts.push('how devices enrol')

  const added = after.enabled.filter((id) => !before.enabled.includes(id)).length
  const removed = before.enabled.filter((id) => !after.enabled.includes(id)).length
  if (added > 0) parts.push(`${added} added`)
  if (removed > 0) parts.push(`${removed} removed`)

  /* Settings last and counted, not named: a tolerance changing from Family to
     Exact is a real edit, and its name is the attribute's — which is already in
     the list one tab away. */
  const tuned = after.enabled.filter(
    (id) =>
      before.enabled.includes(id) &&
      (JSON.stringify(before.config[id]) !== JSON.stringify(after.config[id]) ||
        before.weights[id] !== after.weights[id]),
  ).length
  if (tuned > 0) parts.push(`${tuned} retuned`)

  return parts
}

/* --- Tab one: the profile itself ------------------------------------------------

   Everything that is not an attribute, as a form. It was a 240px rail of
   read-only facts with an Edit button opening a drawer that held these exact
   controls — so the page stated a value, and a click away a panel asked for it.
   One of those two is redundant, and it is the one that cannot be typed into.

   Three rows stay stated, because all three are read-only in fact as well as in
   presentation: the kind is fixed for the life of the profile, the platform list
   is derived from the attributes on the other tab, and Used by belongs to the
   policies rather than to this. They sit together at the end, under a heading
   that says so. */
/* The name, edited where it is read.

   `NameCard` stood here: a card with the heading "Name" and one text field in
   it, first in the form on both shapes of this page. It was the most expensive
   way to ask the cheapest question — a full card, a border, a heading and a
   label, all to hold a single line that the page was ALREADY showing in 20px
   bold at the top of itself.

   Two renderings of one string is the actual problem, not the space. The h1 and
   the field could disagree mid-edit, and did: the heading read `profile.name`
   while the field wrote `draft.name`, so typing in the card left the title
   showing the old name until somebody saved.

   So there is one rendering, and it is the heading. Clicking the pencil turns
   it into an input of the same size and weight, which is what keeps the page
   from jumping — the input is styled to match the h1 rather than to look like a
   form field, because it is not one.

   Escape reverts just the name. The bar at the bottom can already discard
   everything, but backing out of a rename you started by mistake should not
   cost the attribute you retuned two minutes ago. */
function EditableName({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  /* What the name was when this edit began, for Escape. Captured on entry
     rather than read from the saved profile: the pre-edit value may itself be
     unsaved, and reverting to what is on disk would silently discard it. */
  const before = useRef(value)

  useEffect(() => {
    if (!editing) return
    before.current = value
    input.current?.focus()
    input.current?.select()
    /* `value` deliberately absent: this runs when the edit OPENS, and listing
       it would re-select the whole field on every keystroke. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing])

  if (!editing) {
    return (
      <>
        <h1>{value}</h1>
        <button
          type="button"
          className="bfp2__rename"
          aria-label={`Rename ${value}`}
          title="Rename"
          onClick={() => setEditing(true)}
        >
          <Pencil size={14} strokeWidth={1.9} aria-hidden />
        </button>
      </>
    )
  }

  return (
    <input
      ref={input}
      type="text"
      className="bfp2__nameinput"
      value={value}
      placeholder="Corporate laptops"
      aria-label="Profile name"
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => setEditing(false)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          setEditing(false)
        } else if (e.key === 'Escape') {
          e.preventDefault()
          onChange(before.current)
          setEditing(false)
        }
      }}
    />
  )
}

function BasicDetailsTab({
  draft,
  setDraft,
  users,
  onShowUses,
}: {
  draft: FingerprintProfile
  setDraft: React.Dispatch<React.SetStateAction<FingerprintProfile>>
  users: ReturnType<typeof policiesUsing>
  onShowUses: () => void
}) {
  /* The reach a press is proposing, or null when none is. Not a copy of the
     current value — this is "somebody has asked for a change and not yet
     confirmed it", which is a different thing and reads as one. */
  const [pendingReach, setPendingReach] = useState<ProfileReach | null>(null)

  const dropped =
    pendingReach === null
      ? []
      : draft.enabled
          .map((id) => attrOf(draft.mode, id))
          .filter((a): a is Attribute => Boolean(a?.needsAgent && pendingReach !== 'agent'))

  const commitReach = (reach: ProfileReach) => {
    setDraft((d) => withReach(d, reach))
    setPendingReach(null)
  }

  const pressReach = (reach: ProfileReach) => {
    if (reach === draft.reach) return setPendingReach(null)
    /* Only the destructive direction waits. Turning an agent ON adds nothing
       and removes nothing — it makes rows available — so a confirmation there
       would be a dialog about a change with no cost. */
    const loses = draft.enabled.some((id) => attrOf(draft.mode, id)?.needsAgent)
    if (reach === 'agentless' && loses) setPendingReach(reach)
    else commitReach(reach)
  }

  return (
    <div className="bfp2__form">
      {/* The same test that put the tabs here, so this is true whenever this
          component renders at all. Kept as a guard rather than unwrapped: it is
          the one line that says WHY a profile without a collector never reaches
          this card, and a third mode would arrive needing it. */}
      {asksReach(draft.mode) && (
        <section className="bfp2__card bfp2__formcard">
          <header className="bfp2__cardhead">
            <h2 id="bfp2-reach">What it can read</h2>
            <span className="bfp2__cardcount">
              Hardware identifiers need something installed on the machine. This decides which
              attributes can arrive at all.
            </span>
          </header>
          <div className="bfp2__cardbody">
            {/* The card's own heading is the visible label, so a legend would
                print it twice. `aria-labelledby` points at the heading that is
                already there — one label in the accessibility tree instead of
                two saying the same words. */}
            <fieldset className="bfp2__modes" aria-labelledby="bfp2-reach">
              {REACHES.map((r) => {
                const Ico = REACH_ICON[r.id]
                const on = draft.reach === r.id
                return (
                  <button
                    key={r.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    className={`bfp2__mode-card ${on ? 'is-on' : ''} ${pendingReach === r.id ? 'is-pending' : ''}`}
                    onClick={() => pressReach(r.id)}
                  >
                    <span className="bfp2__mode-ico" aria-hidden>
                      <Ico size={17} strokeWidth={1.8} />
                    </span>
                    <span className="bfp2__mode-body">
                      <strong>{r.label}</strong>
                      <em>{r.blurb}</em>
                      {r.note && (
                        <i className="bfp2__mode-note">
                          <AlertTriangle size={11} strokeWidth={2.2} aria-hidden />
                          {r.note}
                        </i>
                      )}
                    </span>
                    {on && <Check size={15} strokeWidth={2.6} className="bfp2__mode-tick" aria-hidden />}
                  </button>
                )
              })}
            </fieldset>

            {/* Only while agent-based is the standing answer. During a pending
                switch to agentless the confirmation below is the thing to read,
                and a panel telling you to install software you are about to
                stop needing would be arguing with it. */}
            {draft.reach === 'agent' && pendingReach === null && <AgentPrereq />}

            {/* Named, not counted, and before it happens rather than after.
                "4 attributes" is a number nobody can act on; the names are what
                say whether the ones going are ones you wanted. */}
            {pendingReach && (
              <div className="bfp2__confirm">
                <p className="bfp2__prereq">
                  <AlertTriangle size={13} strokeWidth={2} aria-hidden />
                  <span>
                    Removes {dropped.map((a) => a.name).join(', ')} and everything they are set to.
                    {draft.registration === 'pre-approved' &&
                      ' The approved roster is matched on MAC address, so it will stop matching anything.'}
                  </span>
                </p>
                <div className="bfp2__confirmacts">
                  <Button variant="ghost" size="sm" onClick={() => setPendingReach(null)}>
                    Keep {reachLabel(draft.reach).toLowerCase()}
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => commitReach(pendingReach)}>
                    Switch and remove {dropped.length}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      <section className="bfp2__card bfp2__formcard">
        <header className="bfp2__cardhead">
          <h2>How devices enrol</h2>
          {/* The sentence the old rail put behind an empty state with a door in
              it. The door was this card; there is nothing left to open. */}
          {!draft.restrictionSet && (
            <span className="bfp2__cardcount">
              <i>Nobody has answered these yet — the profile is running on the defaults.</i>
            </span>
          )}
        </header>
        <div className="bfp2__cardbody">
          <EnrolmentFields
            mode={draft.mode}
            reach={draft.reach}
            registration={draft.registration}
            autoRegister={draft.autoRegister}
            maxDevices={draft.maxDevices}
            roster={draft.roster}
            onChange={(p) => setDraft((d) => ({ ...d, ...p }))}
          />
        </div>
      </section>

      <section className="bfp2__card bfp2__formcard">
        <header className="bfp2__cardhead">
          <h2>Fixed and derived</h2>
          <span className="bfp2__cardcount">Set elsewhere, or not settable at all.</span>
        </header>
        <div className="bfp2__cardbody bfp2__cardbody--facts">
          <Fact
            label="Decides by"
            tip={`${MODE_META[draft.mode].blurb} A profile's kind is fixed: the two do not share a catalogue, so changing it would discard every attribute. Duplicate and re-create instead.`}
            value={modeLabel(draft)}
          />
          <Fact
            label="Used by"
            tip="Policy rules that name this profile. Renaming or deleting it changes what they resolve to."
            value={users.length === 0 ? 'Nothing' : `${users.length} polic${users.length === 1 ? 'y' : 'ies'}`}
            onOpen={users.length > 0 ? onShowUses : undefined}
          />
        </div>
      </section>
    </div>
  )
}

/* --- Tab two: the list ----------------------------------------------------------

   Unchanged in behaviour and moved out of a card in a 1fr column into the full
   width of the page, which is what the row wanted: a name, a tolerance, a
   weight and a remove, with the controls no longer competing with a rail for
   the last 240px. */
function AttributesTab({
  draft,
  chosen,
  phase2,
  onAdd,
  onConfig,
  onWeight,
  onDrop,
}: {
  draft: FingerprintProfile
  chosen: Attribute[]
  phase2: number
  onAdd: () => void
  onConfig: (id: string, v: AttrConfigValue) => void
  onWeight: (id: string, w: number) => void
  onDrop: (id: string) => void
}) {
  const noun = ITEM_NOUN[draft.mode]

  return (
    <section className="bfp2__card">
      <header className="bfp2__cardhead">
        <h2>What it {noun.verb}</h2>
        <span className="bfp2__cardcount">
          {countLabel(draft.mode, chosen.length)}
          {phase2 > 0 && <i>· {phase2} not collected yet</i>}
        </span>
        {/* The create, and it admits to being the delete as well: the panel it
            opens removes rows as readily as it adds them, so a bare `+` would
            be the wrong promise. */}
        <Button variant="secondary" size="sm" onClick={onAdd}>
          <Pencil size={13} strokeWidth={2} aria-hidden />
          Add or remove
        </Button>
      </header>

      {chosen.length === 0 ? (
        <EmptyState
          compact
          icon={ShieldOff}
          title={draft.mode === 'os' ? 'No requirements' : 'Nothing watched'}
          blurb={
            draft.mode === 'os'
              ? 'A profile that requires nothing lets every device through.'
              : 'A profile that watches nothing cannot tell one device from another.'
          }
          action={
            <Button variant="secondary" size="sm" onClick={onAdd}>
              <Plus size={14} strokeWidth={2.2} aria-hidden />
              Add {noun.many}
            </Button>
          }
        />
      ) : (
        <div className="bfp2__rows">
          {chosen.map((a) => {
            const AIcon = ATTR_ICON[a.id] ?? ShieldCheck
            return (
              <div className="bfp2__attrow" key={a.id}>
                <span className="bfp2__attico" aria-hidden>
                  <AIcon size={15} strokeWidth={1.8} />
                </span>

                {/* One line, and the purpose is on the tip. Every one of these
                    is a full sentence, and as a second line under the name they
                    turned a list of three controls into a page of grey prose.
                    The picker is where you read them; here the question is what
                    the thing is SET to. */}
                <div className="bfp2__attmain">
                  <span className="bfp2__attname">
                    {/* The name in its own element so the ellipsis has
                        something to land on. `text-overflow` does not apply to
                        a bare text node inside a flex container — it becomes an
                        anonymous flex item. */}
                    <span className="bfp2__attword">{a.name}</span>
                    <TipDot label={a.name} text={a.purpose} />
                    {a.phase === 2 && <i className="bfp2__soon">Not collected yet</i>}
                  </span>
                </div>

                {/* Both controls on a device row, where there are two to show.
                    One says whether something changed; the other says what that
                    costs. */}
                <div className="bfp2__attctl">
                  {draft.mode === 'device' && (
                    <TierPick
                      value={tierOf(draft.weights[a.id] ?? a.weight)}
                      label={`${a.name} weight`}
                      onChange={(t) => onWeight(a.id, TIER_WEIGHT[t])}
                    />
                  )}
                  {a.config ? (
                    <AttrControl attr={a} values={draft.config} onChange={onConfig} />
                  ) : draft.mode === 'os' ? (
                    <span className="bfp2__nocfg">Nothing to tune</span>
                  ) : null}
                </div>

                <button
                  type="button"
                  className="bfp2__drop"
                  /* Says what else goes. Removing a row removes what it was set
                     to, which is the right behaviour and the kind of thing a
                     label has to admit to. */
                  aria-label={`Remove ${a.name} and its settings`}
                  onClick={() => onDrop(a.id)}
                >
                  <Trash2 size={14} strokeWidth={1.9} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

/* The D, and the only one of the four that retyping cannot undo.

   It names the policies rather than counting them, for the same reason the
   reach confirmation names the attributes it drops: a count is a number nobody
   can act on. Deleting does not unlink those rules — same contract as zones and
   hooks — so the dialog says what they will resolve to instead of implying a
   tidy-up it does not perform. */
function DeleteProfileDialog({
  open,
  profile,
  users,
  onCancel,
  onConfirm,
}: {
  open: boolean
  profile: FingerprintProfile
  users: ReturnType<typeof policiesUsing>
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={`Delete ${profile.name}?`}
      width={480}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            Delete profile
          </Button>
        </>
      }
    >
      <div className="bfp2__confirmbody">
        {users.length === 0 ? (
          <p>No policy rule names this profile, so deleting it changes no sign-in.</p>
        ) : (
          <>
            <p>
              {users.length} polic{users.length === 1 ? 'y' : 'ies'} name
              {users.length === 1 ? 's' : ''} it:{' '}
              <strong>{users.map((u) => u.policy.name).join(', ')}</strong>.
            </p>
            <p>
              Deleting does not edit them. The rules stay, pointing at a profile that no longer
              exists, and resolve to nothing until somebody picks another.
            </p>
          </>
        )}
      </div>
    </Modal>
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

function AttrControl({
  attr,
  values,
  onChange,
}: {
  attr: Attribute
  /* A bag of values, not a profile.

     The wizard sets values now and it has no profile to hand — building a
     half-real one, with a fake id and a `restrictionSet` it has no opinion
     about, would be a state the model should not be able to express. So the
     control takes the only thing it ever read. */
  values: Record<string, AttrConfigValue>
  onChange: (id: string, v: AttrConfigValue) => void
}) {
  const c = attr.config!
  const raw = values[attr.id]

  if (c.kind === 'tolerance') {
    return (
      <span className="bfp2__num">
        <input
          type="number"
          min={c.min}
          max={c.max}
          value={Number(raw ?? c.value)}
          aria-label={c.label}
          onChange={(e) => onChange(attr.id, Number(e.target.value))}
        />
        {c.unit}
      </span>
    )
  }

  if (c.kind === 'choice') {
    return (
      <select
        className="bfp2__select"
        aria-label={c.label}
        value={String(raw ?? c.value)}
        onChange={(e) => onChange(attr.id, e.target.value)}
      >
        {c.options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    )
  }

  /* Two controls, read as one sentence: the attribute's name is already to the
     left of them, so "Operating system · is at least · Windows 10 22H2" runs
     across the row as a line of English rather than as two settings that happen
     to be adjacent.

     The operator is narrow and the value is not, because that is the ratio of
     the words in them and a pair of equal boxes would make the short one look
     like the more important half.

     Values arrive grouped, straight from the attribute's own list. An <optgroup>
     rather than a flat list with prefixes: the platform is the group, so
     "Android 14" does not have to carry the word Android to be findable, and a
     platform added to the master arrives as a heading rather than as thirty
     more rows. */
  if (c.kind === 'rule') {
    const v: AttrRuleValue = isRuleValue(raw) ? raw : c.value
    const set = (next: Partial<AttrRuleValue>) => onChange(attr.id, { ...v, ...next })
    return (
      <span className="bfp2__rule">
        <select
          className="bfp2__select bfp2__select--op"
          aria-label={`${attr.name} — comparison`}
          value={v.op}
          onChange={(e) => set({ op: e.target.value })}
        >
          {c.operators.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
        <select
          className="bfp2__select bfp2__select--val"
          aria-label={`${attr.name} — value`}
          value={v.value}
          onChange={(e) => set({ value: e.target.value })}
        >
          {c.groups.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.values.map((val) => (
                <option key={val}>{val}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </span>
    )
  }

  /* A comparison and a version the admin PICKS.

     The same two-part sentence the rule kind makes — "Android OS version · is
     at least · 13" reads across the row as English — and the second half is now
     the platform's own list rather than a text field. What the text field cost
     is in the config type's comment: it accepted "Windows 11", "11 " and
     "22h2" as readily as "11", validated none of them, and a floor that does
     not parse is a floor that is not there.
     A stored value the list does not carry is added to it and stays selected.
     That is the whole of what the old free field was protecting — a profile
     written before a release, or a fixture with a build nobody offers — and it
     survives without letting anyone type a new bad one. */
  if (c.kind === 'version') {
    const v: AttrRuleValue = isRuleValue(raw) ? raw : c.value
    const set = (next: Partial<AttrRuleValue>) => onChange(attr.id, { ...v, ...next })
    const op = versionOp(v.op)
    return (
      <span className="bfp2__expr">
        {/* The operator as one glyph, the way a conditional row states it —
            Figma's prototype panel is the reference. A dropdown reading "is at
            least" is three words competing with the attribute name to its left;
            the symbol is the join between two operands and disappears into the
            expression, which is what an operator should do.

            The menu is where the words live. Each row names the symbol and
            shows it on the right — the kit's `kbd` slot, which already renders
            exactly that — so ≥ is choosable by somebody who does not read
            mathematical notation, and recognisable afterwards by somebody who
            does. */}
        <MenuButton
          size="sm"
          align="start"
          label={op.symbol}
          items={VERSION_OPS.map((o) => ({ id: o.id, label: o.label, kbd: o.symbol }))}
          onSelect={(id) => set({ op: id })}
        />
        {/* The stored value first when the catalogue does not carry it, so a
            profile's floor is never quietly rewritten to whatever happens to be
            at the top of the list. It is marked as what it is rather than
            passed off as a current release. */}
        <select
          className="bfp2__select bfp2__exprval"
          aria-label={c.label}
          value={v.value}
          title={c.hint}
          onChange={(e) => set({ value: e.target.value })}
        >
          {!c.versions.some((o) => o.value === v.value) && (
            <option value={v.value}>{v.value} (not a listed release)</option>
          )}
          {c.versions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label ?? o.value}
            </option>
          ))}
        </select>
      </span>
    )
  }

  /* A list is edited on the inner page, but not in a row this narrow — it gets
     the count and opens where there is room. Kept honest: the count is the
     real length, not a placeholder. */
  return <span className="bfp2__nocfg">{c.values.length} entries</span>
}

/* Re-picking the set, on the same picker step two uses — same decision, same
   surface, so it gets the same width to make it in. */
/* One stated fact, in the rail.

   It was `DetailRow`, and it shared `.bfp2__attrow` with the editable rows on
   the argument that a profile should read as one list of rows whichever half of
   it you were looking at. That was true while both halves were in the same
   column and it is what made the column unreadable: a row built to hold a
   control has to reserve the width of one, so a row holding the word "Off"
   pushed it 900px from its own label.

   They are different things in different places now. A fact is a label and a
   value eleven characters apart; a row is a name, a sentence and up to two
   controls. Sharing markup between them was the mistake, not the fix.

   No icon. The rail's job is to be scanned down the left edge, and a column of
   fifteen-pixel glyphs in front of the labels is a second thing to scan past.
   The tip stays: it is the only place several of these say what they cost. */
function Fact({
  label,
  tip,
  value,
  warn,
  onOpen,
}: {
  label: string
  tip: string
  value: string
  /* A stated value worth a second look — no platform named, silent enrolment
     on, a roster with no file. Not an error: all three are legitimate, and all
     three are states people arrive in without meaning to. */
  warn?: boolean
  /** The one fact with somewhere to go. Absent when there is nothing behind it. */
  onOpen?: () => void
}) {
  return (
    <div className="bfp2__fact">
      <span className="bfp2__factlabel">
        {label}
        <TipDot label={label} text={tip} />
      </span>
      {onOpen ? (
        <button type="button" className="bfp2__factval is-link" onClick={onOpen}>
          {value}
        </button>
      ) : (
        <span className={`bfp2__factval ${warn ? 'is-warn' : ''}`}>{value}</span>
      )}
    </div>
  )
}

/* One labelled row, for the settings that are questions rather than attributes. */
/* One row, and a choice about its second line.

   `help` prints under the name; `tip` hides behind a mark beside it. The test
   is whether the sentence says something the NAME and the CONTROL do not.
   "Devices per person — how many they may register before the next one is
   refused" is the name restated next to a stepper showing 3; "Register silently
   on first sign-in — it means an attacker's machine registers itself" is the
   consequence of the toggle, and nobody should have to hover for that. */
function FormRow({
  icon: Icon,
  label,
  help,
  tip,
  children,
}: {
  icon: typeof Sliders
  label: string
  help?: string
  tip?: string
  children: React.ReactNode
}) {
  return (
    <div className="bfp2__attrow">
      <span className="bfp2__attico" aria-hidden>
        <Icon size={15} strokeWidth={1.8} />
      </span>
      <div className="bfp2__attmain">
        <span className="bfp2__attname">
          {label}
          {tip && <TipDot label={label} text={tip} />}
        </span>
        {help && <span className="bfp2__attpurpose">{help}</span>}
      </div>
      <div className="bfp2__attctl">{children}</div>
    </div>
  )
}

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

/* --- Enrolment: one definition, two places -------------------------------------

   How a device gets onto a person's list, and how many they may keep. The
   attributes decide whether a machine is the SAME one; these decide whether it
   is allowed to become a known one at all.

   It is asked in the create form now, on the step where the collector is
   chosen, and it is edited from one place afterwards. It used to be editable
   only — a panel of defaults on the detail page that a new profile arrived
   holding without anybody having answered them, which is what `restrictionSet`
   exists to admit. A question worth asking is worth asking while the thing is
   being made.

   One component because the two surfaces must not drift: the same rows, the
   same dependency order, the same refusals. That order is real and it is why a
   roster question can disappear rather than grey out — a roster is matched on
   MAC address, MAC is one of the eighteen things only an agent can read, and it
   is in the device catalogue only. So an OS-and-version profile cannot use one
   at any reach, and an agentless device profile cannot either. */
function EnrolmentFields({
  mode,
  reach,
  registration,
  autoRegister,
  maxDevices,
  roster,
  onChange,
}: {
  mode: ProfileMode
  /** Null while the collector question is still unanswered on the step above. */
  reach: ProfileReach | null
  registration: Registration
  autoRegister: boolean
  maxDevices: number | null
  roster: Roster | null
  onChange: (p: {
    registration?: Registration
    autoRegister?: boolean
    maxDevices?: number | null
  }) => void
}) {
  const rosterPossible = mode === 'device' && reach === 'agent'

  return (
    <>
      <div className="bfp2__rows bfp2__rows--form">
        <FormRow
          icon={UserRound}
          label="How a device gets registered"
          /* The refusal is on the row that carries the disabled option, rather
             than in a paragraph above the whole section.

             It was a standing sentence explaining why one entry in the dropdown
             below it could not be chosen — which is a footnote about a control,
             printed before the control, on a step where it is true most of the
             time. The row it is about is the place for it. */
          tip={
            (registration === 'self'
              ? 'People enrol their own machines, up to a limit. '
              : 'Only devices on the uploaded roster may sign in. ') +
            (rosterPossible
              ? ''
              : mode === 'os'
                ? 'A roster is not available here: it is matched on MAC address, which an OS and version profile does not read.'
                : 'A roster is not available here: it is matched on MAC address, and MAC is one of the attributes only an agent can read.')
          }
        >
          {/* A dropdown only where there is something to drop down to.

              Both options were always rendered and the unavailable one was
              `disabled`, which is a control with one usable entry — a decision
              presented as a choice, with the reason it is not one hidden on the
              tip. Where a roster is impossible there is exactly one way a device
              can be registered, so the row states it. The tip still explains
              why, because "this cannot be changed" is a fact somebody will want
              a reason for. */}
          {rosterPossible ? (
            <select
              className="bfp2__select"
              aria-label="How a device gets registered"
              value={registration}
              onChange={(e) => {
                const next = e.target.value as Registration
                /* The console's own branch: a roster REPLACES the allowance
                   rather than sitting beside it. */
                onChange({
                  registration: next,
                  maxDevices: next === 'pre-approved' ? null : (maxDevices ?? DEFAULT_MAX_DEVICES),
                })
              }}
            >
              {(Object.keys(REGISTRATION_LABEL) as Registration[]).map((r) => (
                <option key={r} value={r}>
                  {REGISTRATION_LABEL[r]}
                </option>
              ))}
            </select>
          ) : (
            <span className="bfp2__setvalue">{REGISTRATION_LABEL[registration]}</span>
          )}
        </FormRow>

        <FormRow
          icon={Repeat}
          label="Register silently on first sign-in"
          /* Worth stating rather than leaving to be discovered: the convenience
             and the hole it opens are the same sentence. */
          help="Convenient, and it means an attacker's machine registers itself."
        >
          <Toggle
            checked={autoRegister}
            onChange={(next) => onChange({ autoRegister: next })}
            label="Register silently on first sign-in"
            size="sm"
          />
        </FormRow>

        {/* One or the other, never both. A question that no longer applies is
            not disabled or greyed — it is not rendered. */}
        {registration === 'self' ? (
          <FormRow
            icon={Smartphone}
            label="Devices per person"
            tip="How many they may register before the next one is refused."
          >
            <NumberStepper
              label="Devices per person"
              value={maxDevices ?? DEFAULT_MAX_DEVICES}
              min={1}
              max={20}
              onChange={(next) => onChange({ maxDevices: next })}
            />
          </FormRow>
        ) : (
          <FormRow
            icon={Server}
            label="Approved device roster"
            help="A CSV of device name, user email and MAC address."
          >
            {roster ? (
              <span className="bfp2__roster">
                <strong>{roster.fileName}</strong>
                <em>
                  {roster.rows} devices · {roster.uploadedAt}
                </em>
              </span>
            ) : (
              <Button variant="secondary" size="sm">
                Upload CSV
              </Button>
            )}
          </FormRow>
        )}
      </div>
    </>
  )
}

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
   not. */

/* The same catalogue, the same shape.

   It renders `AttrStep`, which is the create panel's last step — so it is the
   same surface at the same width in the same place on the screen, opened from
   a different button. As a centred 1000px modal beside a 760px slide-over it
   was two different treatments of one thing, and the only difference between
   them is whether the profile exists yet. */
function AttributesDrawer({
  open,
  profile,
  onClose,
  onSave,
}: {
  open: boolean
  profile: FingerprintProfile
  onClose: () => void
  onSave: (p: FingerprintProfile) => void
}) {
  /* A draft of the three fields the picker writes, not of the profile.

     It held only `enabled`, which is why re-opening this used to drop nothing
     and change nothing else — the values were somewhere the dialog could not
     see. Now that a row carries its settings, the draft has to carry them too,
     or ticking an attribute here and setting it here would write one and
     discard the other. */
  const [picked, setPicked] = useState<string[]>(profile.enabled)
  const [config, setConfig] = useState(profile.config)
  const [weights, setWeights] = useState(profile.weights)

  /* On `open` alone, deliberately — the same argument as the create panel's
     reset. A draft that re-synced while the panel was open would throw away
     what you had just ticked every time the page behind it re-rendered. */
  useEffect(() => {
    if (!open) return
    setPicked(profile.enabled)
    setConfig(profile.config)
    setWeights(profile.weights)
  }, [open])

  const noun = ITEM_NOUN[profile.mode]

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`What it ${noun.verb}`}
      caption={profile.name}
      width={760}
      resizable
      minWidth={560}
      maxWidth={1120}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="brand"
            disabled={picked.length === 0}
            onClick={() =>
              /* Through `pruneValues`, so unticking a row here takes its
                 settings with it rather than leaving them for the next time
                 somebody ticks it back on. */
              onSave(pruneValues({ ...profile, enabled: picked, config, weights }))
            }
          >
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
        config={config}
        weights={weights}
        onValue={(id, v) => setConfig((c) => ({ ...c, [id]: v }))}
        onWeight={(id, w) => setWeights((c) => ({ ...c, [id]: w }))}
        settings
      />
    </Drawer>
  )
}

/* `ReachDialog` stood here — a dialog of its own for the one destructive edit.

   It folded into `EditProfileDrawer` and then, with it, into `BasicDetailsTab`,
   which is where the reach is now asked. Its argument has survived both moves
   intact: the change waits for a second press, and that press NAMES what it
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
