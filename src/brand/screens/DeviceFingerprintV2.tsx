import { useEffect, useState } from 'react'
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
  ScrollText,
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

import { Button, Drawer, MenuButton, NumberStepper, TipDot, Toggle } from '../kit'
import { TierPick } from '../tier-pick'
import {
  CATEGORIES,
  DEFAULT_MAX_DEVICES,
  MODES,
  MODE_META,
  REACHES,
  REACH_META,
  REGISTRATION_LABEL,
  REGISTRATION_SHORT,
  TIER_WEIGHT,
  VERSION_OPS,
  asksReach,
  attrOf,
  attributesFor,
  blockedAttributes,
  ITEM_NOUN,
  countLabel,
  describeProfile,
  isRuleValue,
  modeLabel,
  offeredAttributes,
  platformsNamed,
  pruneValues,
  reachLabel,
  rosterNeedsMac,
  stepsFor,
  tierOf,
  valueLabel,
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

  const duplicate = (p: FingerprintProfile) => {
    const copy: FingerprintProfile = {
      ...p,
      id: `fp-${p.id}-copy-${store.fingerprints.length}`,
      name: `${p.name} (copy)`,
    }
    store.addFingerprint(copy)
    store.showToast(`${copy.name} created`)
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
        <ProfilePage
          profile={open}
          policies={store.policies}
          onBack={() => setOpenId(null)}
          onChange={store.updateFingerprint}
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
          <p>Device signals, and what to do when they change.</p>
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
          /* The signals by name. Both empty states in this section used to be
             built the same way — a frame, then a dash-list, then a second
             clause — and two screens using one sentence shape is what makes
             prose read as generated. This one states the nouns and stops. */
          blurb="A machine's TPM key, serial and OS build, and what happens when they stop matching."
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
      width={780}
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

/* --- The inner page ------------------------------------------------------------ */

function ProfilePage({
  profile,
  policies,
  onBack,
  onChange,
}: {
  profile: FingerprintProfile
  policies: Policy[]
  onBack: () => void
  onChange: (p: FingerprintProfile) => void
}) {
  const [adding, setAdding] = useState(false)
  /* One editor, one flag. It was three — `restricting`, `reaching`, and no way
     to rename at all — which is three doors into one room. */
  const [editing, setEditing] = useState(false)
  const [summarising, setSummarising] = useState(false)
  const [showUses, setShowUses] = useState(false)
  /* `attrOf(profile.mode, …)`, not a merged lookup. `device-type` is in both
     catalogues and the merged list always answered with the OS copy, so a
     device profile has been reading the wrong row's purpose and category since
     the two lists split — invisible until something rendered a device row's
     configuration, which the overview below now does. */
  const chosen = profile.enabled
    .map((id) => attrOf(profile.mode, id))
    .filter((a): a is Attribute => Boolean(a))
  const users = policiesUsing('fingerprint', profile.id, policies)
  const platforms = platformsNamed(profile)

  const setConfig = (id: string, v: AttrConfigValue) =>
    onChange({ ...profile, config: { ...profile.config, [id]: v } })

  const setWeight = (id: string, w: number) =>
    onChange({ ...profile, weights: { ...profile.weights, [id]: w } })

  /* Through `pruneValues`, so removing a row removes what it was set to.

     It used to write `enabled` alone, which left `config['os-windows']` behind
     forever: invisible, because no surface draws a value for a row that is not
     there, and back the moment somebody re-ticked the attribute — restoring a
     setting nobody had re-approved and nobody had been shown. */
  const drop = (id: string) =>
    onChange(pruneValues({ ...profile, enabled: profile.enabled.filter((x) => x !== id) }))

  const noun = ITEM_NOUN[profile.mode]
  const phase2 = chosen.filter((a) => a.phase === 2).length

  return (
    <>
      <button type="button" className="bfp2__back" onClick={onBack}>
        <ArrowLeft size={14} strokeWidth={2} aria-hidden />
        All profiles
      </button>

      <header className="bfp2__head">
        <div className="bfp2__pagehead">
          <span className="bfp2__tile bfp2__tile--lg" aria-hidden>
            {renderModeIcon(profile.mode, 18)}
          </span>
          <h1>{profile.name}</h1>
        </div>

        <div className="bfp2__headacts">
          <Button variant="secondary" size="sm" onClick={() => setSummarising(true)}>
            <ScrollText size={14} strokeWidth={1.9} aria-hidden />
            Summary
          </Button>
          {/* THE edit. Everything about this profile that is not an attribute
              is behind it — the name, what it can read, how devices enrol —
              and everything on the page states rather than asks. */}
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            <Sliders size={14} strokeWidth={2} aria-hidden />
            Edit
          </Button>
        </div>
      </header>

      {/* --- Two columns ------------------------------------------------------

          A page of stated facts and one editable list, and it was drawn as
          three stacked full-width cards holding six one-row facts between them.
          At 1200px that put a label at the far left of a 950px row and its value
          at the far right, with nothing in between — six times, each in its own
          card with its own heading floating above it. It read as a form with the
          fields taken out.

          The shape every console with this job converges on is two columns: the
          thing you came to change in the main one, and everything the page
          merely STATES in a narrow rail beside it. Linear's issue properties,
          the OpenAI platform's resource facts, Clerk's metadata column — all the
          same move, and all for the same reason. A fact needs a label and a
          value near each other; an editor needs room. One column cannot give
          both, and the fact list is the half that suffers, because it is the
          half made of short strings.

          So the facts go right, at 260px, where a label and its value are
          eleven characters apart. The attributes get the main column. And the
          page stops spending a card and a heading on every sentence. */}
      <div className="bfp2__cols">
        <div className="bfp2__main">
          {/* The heading is INSIDE the card, with its action on the same line.

              It was above it, floating over the panel it named, which is a fine
              pattern for a page of several sections and a waste of a line for a
              page with one. */}
          <section className="bfp2__card">
            <header className="bfp2__cardhead">
              <h2>What it {noun.verb}</h2>
              <span className="bfp2__cardcount">
                {countLabel(profile.mode, chosen.length)}
                {phase2 > 0 && <i>· {phase2} not collected yet</i>}
              </span>
              {/* A pencil, not a plus. The panel it opens removes rows and
                  changes their settings as readily as it adds, and a `+` on it
                  is the wrong promise — it also stops this reading as the twin
                  of the profile Edit in the page header, which it is not: that
                  one edits the profile, this one edits its contents. */}
              <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
                <Pencil size={13} strokeWidth={2} aria-hidden />
                Edit
              </Button>
            </header>

            {chosen.length === 0 ? (
              <EmptyState
                compact
                icon={ShieldOff}
                title={profile.mode === 'os' ? 'No requirements' : 'Nothing watched'}
                blurb={
                  profile.mode === 'os'
                    ? 'A profile that requires nothing lets every device through.'
                    : 'A profile that watches nothing cannot tell one device from another.'
                }
                action={
                  <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
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

                      {/* One line, and the purpose is on the tip.

                          It was a second line under the name, and every one of
                          these is a full sentence — "The form factor the
                          request came from. A laptop and a phone are not the
                          same risk, and some apps have no business being opened
                          on one of them." In the main column of a two-column
                          page that wraps to four lines, so a profile with three
                          attributes was a page of grey prose with three
                          controls hidden in it.

                          The picker is where you read these: it has the width,
                          and it is where the question "what IS this" is
                          actually being asked. Here the question is "what is it
                          set to", and the sentence is a `TipDot` away —
                          keyboard-reachable, unlike the `title` this row used
                          to carry. */}
                      <div className="bfp2__attmain">
                        <span className="bfp2__attname">
                          {/* The name in its own element so the ellipsis has
                              something to land on. `text-overflow` does not
                              apply to a bare text node inside a flex container
                              — it becomes an anonymous flex item — so with the
                              name unwrapped it simply overflowed and collided
                              with the controls to its right. */}
                          <span className="bfp2__attword">{a.name}</span>
                          <TipDot label={a.name} text={a.purpose} />
                          {a.phase === 2 && <i className="bfp2__soon">Not collected yet</i>}
                        </span>
                      </div>

                      {/* Both controls on a device row, where there are two to
                          show — and this reverses an argument that stood here
                          for a long time.

                          It said a weight and a configuration on one row meant
                          one of them was inert, because "a weighted profile
                          does not care whether the OS is at least Windows 10".
                          That is right, and it is right about the OS
                          catalogue's configs: a version floor is a CONDITION
                          and a score has no conditions. It is wrong about the
                          device catalogue's, which are all precision — "Match
                          on: Family only" decides whether a Chrome update
                          counts as a change at all. One says whether something
                          changed; the other says what that costs. */}
                      <div className="bfp2__attctl">
                        {profile.mode === 'device' && (
                          <TierPick
                            value={tierOf(profile.weights[a.id] ?? a.weight)}
                            label={`${a.name} weight`}
                            onChange={(t) => setWeight(a.id, TIER_WEIGHT[t])}
                          />
                        )}
                        {a.config ? (
                          <AttrControl attr={a} values={profile.config} onChange={setConfig} />
                        ) : profile.mode === 'os' ? (
                          <span className="bfp2__nocfg">Nothing to tune</span>
                        ) : null}
                      </div>

                      <button
                        type="button"
                        className="bfp2__drop"
                        /* Says what else goes. Removing a row now removes what
                           it was set to, which is the right behaviour and the
                           kind of thing a label has to admit to. */
                        aria-label={`Remove ${a.name} and its settings`}
                        onClick={() => drop(a.id)}
                      >
                        <Trash2 size={14} strokeWidth={1.9} />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </div>

        {/* --- The rail: everything the page states ---------------------------

            No pills. Six of them, two in the brand colour, is what the previous
            version put here — and a brand pill means "look at this", which is
            not true of "OS and version". Plain text carries a fact; a tint is
            spent on the two that are worth a second look, which is a warning
            about the profile rather than a decoration on it. */}
        <aside className="bfp2__aside">
          <section className="bfp2__facts">
            <h3>Details</h3>
            <Fact
              label="Decides by"
              tip={`${MODE_META[profile.mode].blurb} A profile's kind is fixed: the two do not share a catalogue, so changing it would discard every attribute. Duplicate and re-create instead.`}
              value={modeLabel(profile)}
            />
            {asksReach(profile.mode) && (
              <Fact
                label="What it can read"
                tip={`${REACH_META[profile.reach].blurb}${REACH_META[profile.reach].note ? ` ${REACH_META[profile.reach].note}` : ''}`}
                value={reachLabel(profile.reach)}
              />
            )}
            {profile.mode === 'os' && (
              <Fact
                label="Platforms named"
                tip="A platform this profile does not name is not checked. Nothing stops a device running it from signing in."
                value={platforms.length > 0 ? platforms.join(', ') : 'None'}
                warn={platforms.length === 0}
              />
            )}
            {/* The rail states, with one exception. This is not an edit — it
                is the prerequisite the "Agent-based" line above it creates, and
                somewhere to get it is the only useful thing a page can offer
                about a piece of software that has to exist on other people's
                machines. */}
            {asksReach(profile.mode) && profile.reach === 'agent' && (
              <div className="bfp2__factact">
                <Button variant="secondary" size="sm" onClick={() => undefined}>
                  <Download size={14} strokeWidth={1.9} aria-hidden />
                  Download agent
                </Button>
              </div>
            )}

            <Fact
              label="Used by"
              tip="Policy rules that name this profile. Renaming or deleting it changes what they resolve to."
              value={users.length === 0 ? 'Nothing' : `${users.length} polic${users.length === 1 ? 'y' : 'ies'}`}
              onOpen={users.length > 0 ? () => setShowUses(true) : undefined}
            />
          </section>

          <section className="bfp2__facts">
            <h3>
              Device restriction
              {/* The console's own name for this, and the panel it replaces
                  carried an Edit. It states now: the one Edit in the header is
                  where all of it is set, and a device profile arrives with it
                  answered because the create panel asks. */}
            </h3>
            {profile.restrictionSet ? (
              <>
                <Fact
                  label="How devices register"
                  tip={`${REGISTRATION_LABEL[profile.registration]}. Either people enrol their own machines, up to a limit, or only the ones on an uploaded roster may sign in.`}
                  value={REGISTRATION_SHORT[profile.registration]}
                />
                <Fact
                  label="Silent enrolment"
                  tip={
                    profile.autoRegister
                      ? 'The first sign-in from a new machine enrols it silently — convenient, and it means an attacker\u2019s machine registers itself.'
                      : 'A new machine is challenged before it is trusted.'
                  }
                  value={profile.autoRegister ? 'On' : 'Off'}
                  warn={profile.autoRegister}
                />
                {profile.registration === 'pre-approved' ? (
                  <Fact
                    label="Approved roster"
                    tip={
                      profile.roster
                        ? `${profile.roster.rows} devices, uploaded ${profile.roster.uploadedAt}.`
                        : 'Nothing can sign in against this profile until a roster is uploaded.'
                    }
                    value={profile.roster ? profile.roster.fileName : 'None uploaded'}
                    warn={!profile.roster}
                  />
                ) : (
                  <Fact
                    label="Devices per person"
                    tip="How many they may register before the next one is refused."
                    value={String(profile.maxDevices ?? DEFAULT_MAX_DEVICES)}
                  />
                )}
              </>
            ) : (
              /* Not an empty state with an illustration — at 260px that is a
                 panel apologising. One sentence saying nobody has answered, and
                 the door. */
              <p className="bfp2__factsnone">
                Nobody has decided how devices enrol, so this profile is running on the defaults.
                <button type="button" className="bfp2__clear" onClick={() => setEditing(true)}>
                  Set it up
                </button>
              </p>
            )}
          </section>
        </aside>
      </div>

      <EditProfileDrawer
        open={editing}
        profile={profile}
        onChange={onChange}
        onClose={() => setEditing(false)}
      />

      <SummaryDrawer
        open={summarising}
        profile={profile}
        chosen={chosen}
        platforms={platforms}
        onClose={() => setSummarising(false)}
      />

      {/* The count is on the rail, so the first half of "is this safe to
          change" never needs a click; this is the follow-up, and a follow-up
          does not need a heading and a card at the bottom of the page. */}
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

      <AttributesDrawer
        open={adding}
        profile={profile}
        onClose={() => setAdding(false)}
        onSave={(next) => {
          onChange(next)
          setAdding(false)
        }}
      />
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

  /* A comparison and a version the admin types.

     The same two-part sentence the rule kind makes — "Android OS version · is
     at least · 13" reads across the row as English — but the second half is a
     text field rather than a dropdown. A version list is never complete: it is
     stale the week after a release, and the number an admin wants is usually
     the one that just shipped. Making them find it in a list is asking them to
     recognise what they can already state.

     `inputMode="decimal"` rather than `type="number"`, because 18.1.2 is a
     version and not a number — a numeric input would refuse the second dot and
     silently mangle it. Nothing is validated on the way in for the same reason:
     the formats genuinely differ per platform, so the placeholder and the tip
     carry real examples for THIS one and the field takes what it is given. */
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
        {/* Typed, not picked. A version list is stale the week after a release
            and the number an admin wants is usually the one that just shipped.

            `inputMode="decimal"` and not `type="number"`: 18.1.2 is a version,
            not a number, and a numeric field refuses the second dot. Nothing is
            validated on the way in — the formats genuinely differ per platform,
            so the placeholder carries real examples for THIS one and the field
            takes what it is given. */}
        <input
          type="text"
          inputMode="decimal"
          className="bfp2__exprval"
          aria-label={c.label}
          value={v.value}
          placeholder={c.placeholder}
          title={c.hint}
          onChange={(e) => set({ value: e.target.value })}
        />
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

/* --- The one editor for a profile's details -------------------------------------

   One Edit, and everything about the profile that is not an attribute is behind
   it: its name, what it can read, and how devices enrol.

   There were three before — an Edit on the restriction panel, a Change on the
   overview's reach row, and no way at all to rename — which is three doors into
   one room, each showing a different corner of it. The panels state; this
   changes. That split is the whole point: a page you can read without deciding
   whether you are about to alter it.

   Every control writes through as it is touched, the same as the rest of this
   page, so the action says Done rather than Save. What Done commits is that
   somebody answered — the restriction panel stops showing its empty state from
   here.

   The one exception is the reach, which is the only destructive edit in the
   room: switching to agentless deletes attributes and their settings. It is
   held behind a second press that names them. */
function EditProfileDrawer({
  open,
  profile,
  onChange,
  onClose,
}: {
  open: boolean
  profile: FingerprintProfile
  onChange: (p: FingerprintProfile) => void
  onClose: () => void
}) {
  /* The reach a press is proposing, or null when none is. Not a copy of the
     current value — this is "somebody has asked for a change and not yet
     confirmed it", which is a different thing and reads as one. */
  const [pendingReach, setPendingReach] = useState<ProfileReach | null>(null)
  useEffect(() => {
    if (open) setPendingReach(null)
  }, [open])

  const dropped =
    pendingReach === null
      ? []
      : profile.enabled
          .map((id) => attrOf(profile.mode, id))
          .filter((a): a is Attribute => Boolean(a?.needsAgent && pendingReach !== 'agent'))

  const commitReach = (reach: ProfileReach) => {
    onChange(withReach(profile, reach))
    setPendingReach(null)
  }

  const pressReach = (reach: ProfileReach) => {
    if (reach === profile.reach) return setPendingReach(null)
    /* Only the destructive direction waits. Turning an agent ON adds nothing
       and removes nothing — it makes rows available — so a confirmation there
       would be a dialog about a change with no cost. */
    const loses = profile.enabled.some((id) => attrOf(profile.mode, id)?.needsAgent)
    if (reach === 'agentless' && loses) setPendingReach(reach)
    else commitReach(reach)
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Edit profile"
      caption={profile.name}
      /* 600, not 520. The widest row here is a label and a select reading
         "Users register their own devices", and at 520 the label wrapped to two
         lines and pushed its own tip onto a third — a three-line row for one
         dropdown. */
      width={680}
      actions={
        <Button
          variant="brand"
          onClick={() => {
            onChange({ ...profile, restrictionSet: true })
            onClose()
          }}
        >
          Done
        </Button>
      }
    >
      <div className="bfp2__restform">
        <section>
          <h4>Name</h4>
          <label className="bfp2__field">
            <span className="u-sr-only">Profile name</span>
            <input
              type="text"
              value={profile.name}
              placeholder="Corporate laptops"
              aria-label="Profile name"
              onChange={(e) => onChange({ ...profile, name: e.target.value })}
            />
          </label>
        </section>

        {asksReach(profile.mode) && (
          <section>
            <h4 id="bfp2-reach">
              What it can read
              <TipDot
                label="What it can read"
                text="Hardware identifiers need something installed on the machine. This decides which attributes can arrive at all."
              />
            </h4>
            {/* The section's own <h4> is the visible heading, so a legend would
                print it twice. `aria-labelledby` points at the heading that is
                already there — one label in the accessibility tree instead of
                two saying the same words. */}
            <fieldset className="bfp2__modes" aria-labelledby="bfp2-reach">
              {REACHES.map((r) => {
                const Ico = REACH_ICON[r.id]
                const on = profile.reach === r.id
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
            {profile.reach === 'agent' && pendingReach === null && <AgentPrereq />}

            {/* Named, not counted, and before it happens rather than after.
                "4 attributes" is a number nobody can act on; the names are what
                say whether the ones going are ones you wanted. */}
            {pendingReach && (
              <div className="bfp2__confirm">
                <p className="bfp2__prereq">
                  <AlertTriangle size={13} strokeWidth={2} aria-hidden />
                  <span>
                    Removes {dropped.map((a) => a.name).join(', ')} and everything they are set to.
                    {profile.registration === 'pre-approved' &&
                      ' The approved roster is matched on MAC address, so it will stop matching anything.'}
                  </span>
                </p>
                <div className="bfp2__confirmacts">
                  <Button variant="ghost" size="sm" onClick={() => setPendingReach(null)}>
                    Keep {reachLabel(profile.reach).toLowerCase()}
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => commitReach(pendingReach)}>
                    Switch and remove {dropped.length}
                  </Button>
                </div>
              </div>
            )}
          </section>
        )}

        <section>
          <h4>How devices enrol</h4>
          <EnrolmentFields
            mode={profile.mode}
            reach={profile.reach}
            registration={profile.registration}
            autoRegister={profile.autoRegister}
            maxDevices={profile.maxDevices}
            roster={profile.roster}
            onChange={(p) => onChange({ ...profile, ...p })}
          />
        </section>
      </div>
    </Drawer>
  )
}

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
      width={780}
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

   It has folded into `EditProfileDrawer`, which is now the single door into
   everything about a profile that is not an attribute. Its argument survives
   intact and is applied there: the change waits for a second press, and that
   press NAMES what it will take rather than counting it. What has gone is a
   dialog you reached through a button on a panel that also had an Edit, beside
   a page that had no way to rename anything. */

/* --- The whole profile, stated ------------------------------------------------

   Everything else on this page is an editor. Each panel answers "what would I
   change here", and between them they answer it completely — and none of them
   answers the question you actually have before you touch anything, which is
   what this profile DOES. That question has an audience beyond the person
   editing: it is what you paste into a change request, and what somebody who
   did not build it reads before deciding whether it covers their fleet.

   So: no controls, in reading order, kind first and then every row with what it
   is set to. `valueLabel` is what prints a stored value, so this and the
   controls beside it cannot disagree about what is stored — the failure that
   makes a summary worse than no summary at all. */
function SummaryDrawer({
  open,
  profile,
  chosen,
  platforms,
  onClose,
}: {
  open: boolean
  profile: FingerprintProfile
  chosen: Attribute[]
  platforms: string[]
  onClose: () => void
}) {
  const facts: [string, string][] = [
    ['Decides by', modeLabel(profile)],
    ...(asksReach(profile.mode)
      ? ([['What it can read', reachLabel(profile.reach)]] as [string, string][])
      : []),
    ...(profile.mode === 'os'
      ? ([['Platforms named', platforms.length ? platforms.join(', ') : 'None']] as [string, string][])
      : []),
    ...(profile.restrictionSet
      ? ([
          ['How devices register', REGISTRATION_LABEL[profile.registration]],
          ['Silent enrolment', profile.autoRegister ? 'On' : 'Off'],
          profile.registration === 'pre-approved'
            ? ['Approved roster', profile.roster ? `${profile.roster.fileName} · ${profile.roster.rows} devices` : 'None uploaded']
            : ['Devices per person', String(profile.maxDevices ?? DEFAULT_MAX_DEVICES)],
        ] as [string, string][])
      : []),
  ]

  return (
    <Drawer open={open} onClose={onClose} title={profile.name} caption={describeProfile(profile)} width={560}>
      <div className="bfp2__sum">
        <dl className="bfp2__sumfacts">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>

        {/* Said outright rather than left to be inferred from an empty section.
            A profile nobody has answered the enrolment questions for is running
            on defaults, and defaults are not decisions. */}
        {!profile.restrictionSet && (
          <p className="bfp2__sumnote">
            Nobody has answered how devices register on this profile, so it is running on the
            defaults: self-service, {DEFAULT_MAX_DEVICES} per person, no silent enrolment.
          </p>
        )}

        <h4 className="bfp2__sumhead">
          {profile.mode === 'os' ? 'What it requires' : 'What it watches'}
          <i>{countLabel(profile.mode, chosen.length)}</i>
        </h4>

        {chosen.length === 0 ? (
          <p className="bfp2__sumnote">Nothing. Every device satisfies this profile.</p>
        ) : (
          <ul className="bfp2__sumlist">
            {chosen.map((a) => {
              const set = valueLabel(a, profile.config[a.id])
              return (
                <li key={a.id}>
                  <span className="bfp2__sumname">
                    {a.name}
                    {a.phase === 2 && <i className="bfp2__soon">Not collected yet</i>}
                  </span>
                  <span className="bfp2__sumval">
                    {set && <strong>{set}</strong>}
                    {profile.mode === 'device' && (
                      <em>{tierOf(profile.weights[a.id] ?? a.weight)}</em>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        )}

        {/* A finding rather than a fact, and the only one this drawer makes.
            `fp-kiosk` shipped holding a roster of 24 machines and reading only
            the form factor, so the roster matched nothing — the one setting the
            profile existed for was inert and no surface said so. */}
        {rosterNeedsMac(profile) && (
          <p className="bfp2__sumwarn">
            <AlertTriangle size={13} strokeWidth={2} aria-hidden />
            <span>
              The approved roster is matched on MAC address, and this profile does not read MAC —
              so nothing on the roster can be recognised.
            </span>
          </p>
        )}
      </div>
    </Drawer>
  )
}

/* --- Helpers -------------------------------------------------------------------- */


/* Which policies name this profile, and which of their rules do.

   Zones got this right and fingerprints did not: the profile page said "used by
   3 rules" and stopped, which tells an admin that a change is dangerous without
   telling them where the danger is. Three is not actionable; three *named*
   policies are — you can go and read them before you save.

   It used to say the same shape as `policiesUsing` in ZonesFinal, deliberately.
   It is now literally the same function — see ./usage. */
