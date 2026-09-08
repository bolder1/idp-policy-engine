import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  AlertTriangle,
  AppWindow,
  ArrowLeft,
  BadgeCheck,
  Brush,
  Activity,
  Check,
  CircuitBoard,
  Copy,
  Cpu,
  Eye,
  Fingerprint,
  Wifi,
  Globe,
  Hash,
  IdCard,
  Languages,
  Lock,
  MapPin,
  Link2,
  Microchip,
  ListChecks,
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

import { Button, Drawer, MenuButton, Modal, NumberStepper, TipDot, Toggle } from '../kit'
import { TierPick } from '../tier-pick'
import {
  CATEGORIES,
  DEFAULT_MAX_DEVICES,
  MODES,
  MODE_META,
  REACHES,
  REACH_META,
  REGISTRATION_LABEL,
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

      <CreateModal open={creating} onClose={() => setCreating(false)} onCreate={create} />
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

/* --- The picker ----------------------------------------------------------------
   Thirty-eight checkboxes, filtered rather than filed. */
const CAT_META: Record<string, { tint: string; icon: typeof Cpu }> = {
  Hardware: { tint: 'slate', icon: Cpu },
  /* 'lime', not 'teal'. The tints resolve to the kit's feedback ramps and there
     is no teal one — the class said teal while the colour came out green,
     which is the kind of quiet disagreement that gets read as a bug in the
     ramp rather than in the name. */
  Browser: { tint: 'lime', icon: Globe },
  Security: { tint: 'indigo', icon: ShieldCheck },
  Network: { tint: 'blue', icon: Wifi },
  Behaviour: { tint: 'amber', icon: Activity },
}

const metaOf = (id: string) => CAT_META[id] ?? { tint: 'slate', icon: Cpu }

/* --- The catalogue, as the step that picks from it -----------------------------

   ONE component where there were two, and it is also where the values are now
   set rather than only the rows chosen.

   `AttrPicker` (five rows, flat) and `RiskAttrPicker` (thirty-eight, railed)
   were separate because the two catalogues are genuinely different sizes, and
   that argument still holds — five things do not need a filing scheme and
   thirty-eight do. What did not hold is everything else being duplicated with
   it: two search boxes, two select-alls, two counts, two definitions of what a
   row looks like, drifting. The rail is now a branch inside one component
   instead of the reason for a second one.

   Two things are new, and both come from the same requirement — that the wizard
   leave you with a FINISHED profile rather than a scoped one:

   · A ticked row opens its settings underneath itself. That is why the row is a
     `<div>` with a `<button>` inside it rather than a `<button>`: a `<select>`
     cannot be nested inside a button, so `.bfp2__opt` could never have grown a
     control and stayed what it was. It is deleted rather than extended.
   · Attributes an agent would be needed for are not rendered as greyed rows.
     They were, over thirty-eight, on the argument that "why is TPM ID not in
     the list" is a support ticket — which was right when the reach lived on
     another screen and the refusal was unactionable from here. It is actionable
     now: the reach was answered one step ago. So the blocked ones collapse to
     one line per category that NAMES three of them and offers the way back.
   -------------------------------------------------------------------------- */

function AttrStep({
  mode,
  reach,
  picked,
  setPicked,
  config,
  weights,
  onValue,
  onWeight,
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
  /** Absent on the detail page, where there is no step to go back to. */
  onBack?: () => void
}) {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<AttrCategory>(CATEGORIES[0].id)

  const offered = offeredAttributes(mode, reach)
  const blocked = blockedAttributes(mode, reach)
  /* Counted against what is OFFERED, never against the whole catalogue. "6 of
     38 selected" on an agentless profile names a denominator eighteen of whose
     rows are not on the screen and cannot be reached from it. */
  const chosen = picked.filter((id) => offered.some((a) => a.id === id))

  const needle = q.trim().toLowerCase()
  const hits = (a: Attribute) =>
    !needle ||
    a.name.toLowerCase().includes(needle) ||
    a.purpose.toLowerCase().includes(needle) ||
    (a.category ?? '').toLowerCase().includes(needle)

  const toggle = (id: string) =>
    setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id])

  const row = (a: Attribute) => (
    <AttrPickRow
      key={a.id}
      attr={a}
      mode={mode}
      on={picked.includes(a.id)}
      config={config}
      weights={weights}
      onToggle={() => toggle(a.id)}
      onValue={onValue}
      onWeight={onWeight}
    />
  )

  /* --- The small catalogue: no rail, no search, no counting -----------------

     Five rows, all of them on screen, every one of them a condition somebody is
     about to state. A search box over five rows is a control that can only ever
     hide four of them. */
  if (!asksReach(mode) && offered.length <= 8) {
    return <div className="bfp2__pickrows">{offered.map(row)}</div>
  }

  const groups = CATEGORIES.map((c) => ({
    cat: c,
    rows: offered.filter((a) => a.category === c.id && hits(a)),
    blocked: blocked.filter((a) => a.category === c.id),
  })).filter((g) => (needle ? g.rows.length > 0 : g.cat.id === cat))

  return (
    <div className="bfp2__pick">
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
        <span className={`bfp2__pickcount ${chosen.length ? 'is-on' : ''}`}>
          {chosen.length} of {offered.length} selected
        </span>
        {/* No select-all here. Each category header carries its own, acting on
            what that category is showing — two select-alls on one pane, one
            scoped to the group and one to everything visible, is a pair nobody
            can tell apart at a glance. */}
        {chosen.length > 0 && (
          <button type="button" className="bfp2__clear" onClick={() => setPicked([])}>
            Clear all
          </button>
        )}
      </div>

      <div className="bfp2__pickbody">
        <nav className="bfp2__rail" aria-label="Attribute categories">
          {CATEGORIES.map((c) => {
            const all = offered.filter((a) => a.category === c.id)
            const on = all.filter((a) => picked.includes(a.id)).length
            const locked = all.length === 0
            const dim = needle ? !all.some(hits) : false
            const here = !needle && cat === c.id
            const { tint, icon: Icon } = metaOf(c.id)
            return (
              <button
                key={c.id}
                type="button"
                aria-current={here || undefined}
                title={c.blurb}
                className={`bfp2__railitem is-${tint} ${here ? 'is-on' : ''} ${dim ? 'is-dim' : ''} ${locked ? 'is-locked' : ''}`}
                onClick={() => {
                  setQ('')
                  setCat(c.id)
                }}
              >
                <span className="bfp2__railico" aria-hidden>
                  {locked ? <Lock size={13} strokeWidth={2} /> : <Icon size={13} strokeWidth={1.9} />}
                </span>
                <span className="bfp2__raillabel">{c.label}</span>
                {/* Progress, never hit count — so it means the same thing with
                    a search running as without one. A category an agentless
                    profile cannot reach at all reads 0/0 rather than 0/4, which
                    is the honest denominator. */}
                <span className={`bfp2__railcount ${on > 0 ? 'is-on' : ''}`}>
                  {on}/{all.length}
                </span>
              </button>
            )
          })}
        </nav>

        <div className="bfp2__pane">
          {groups.length === 0 ? (
            <p className="bfp2__none">Nothing matches that.</p>
          ) : (
            groups.map((g) => (
              <section key={g.cat.id} className={`bfp2__pang is-${metaOf(g.cat.id).tint}`}>
                <header className="bfp2__panghead">
                  {(() => {
                    const Ico = metaOf(g.cat.id).icon
                    return <Ico size={13} strokeWidth={2} aria-hidden />
                  })()}
                  <h4>{g.cat.label}</h4>
                  <span>
                    {g.rows.filter((a) => picked.includes(a.id)).length}/{g.rows.length}
                  </span>
                  {/* Acts on what is VISIBLE, so with a search running it takes
                      the matches rather than the whole category behind them. */}
                  <button
                    type="button"
                    className="bfp2__selectall"
                    onClick={() => {
                      const ids = g.rows.map((a) => a.id)
                      const full = ids.every((id) => picked.includes(id))
                      setPicked(
                        full
                          ? picked.filter((x) => !ids.includes(x))
                          : [...new Set([...picked, ...ids])],
                      )
                    }}
                  >
                    {g.rows.every((a) => picked.includes(a.id)) ? 'Clear these' : 'Select all'}
                  </button>
                </header>
                {g.rows.length === 0 ? (
                  <EmptyState
                    compact
                    icon={Lock}
                    title="Nothing here without an agent"
                    blurb={`${g.cat.label} is read by software on the machine. ${g.blocked
                      .slice(0, 3)
                      .map((a) => a.name)
                      .join(', ')} all need one.`}
                    action={
                      onBack && (
                        <Button variant="secondary" size="sm" onClick={onBack}>
                          Change what it reads
                        </Button>
                      )
                    }
                  />
                ) : (
                  <div className="bfp2__pickrows">{g.rows.map(row)}</div>
                )}

                {/* Named, not counted. "4 more need an agent" is a number you
                    cannot act on; the names are what tell you whether the ones
                    you are missing are ones you wanted. */}
                {g.rows.length > 0 && g.blocked.length > 0 && (
                  <p className="bfp2__locked">
                    <Lock size={12} strokeWidth={2} aria-hidden />
                    <span>
                      {g.blocked.length} more need an agent —{' '}
                      {g.blocked
                        .slice(0, 3)
                        .map((a) => a.name)
                        .join(', ')}
                      {g.blocked.length > 3 && ` and ${g.blocked.length - 3} others`}.
                    </span>
                    {onBack && (
                      <button type="button" className="bfp2__clear" onClick={onBack}>
                        Change what it reads
                      </button>
                    )}
                  </p>
                )}
              </section>
            ))
          )}
        </div>
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
  onToggle,
  onValue,
  onWeight,
}: {
  attr: Attribute
  mode: ProfileMode
  on: boolean
  config: Record<string, AttrConfigValue>
  weights: Record<string, number>
  onToggle: () => void
  onValue: (id: string, v: AttrConfigValue) => void
  onWeight: (id: string, w: number) => void
}) {
  const Icon = ATTR_ICON[attr.id] ?? ShieldCheck
  return (
    <div className={`bfp2__pickrow ${on ? 'is-on' : ''}`}>
      <button type="button" className="bfp2__picktoggle" aria-pressed={on} onClick={onToggle}>
        <span className="bfp2__picktick" aria-hidden>
          <Check size={11} strokeWidth={3.2} />
        </span>
        <span className="bfp2__pickico" aria-hidden>
          <Icon size={15} strokeWidth={1.8} />
        </span>
        <span className="bfp2__pickmain">
          <span className="bfp2__pickname">
            {attr.name}
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

      {on && (
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

/* --- The mode mark, in one place ---------------------------------------------- */
const renderModeIcon = (mode: ProfileMode, size: number) => {
  const Ico = MODE_ICON[mode]
  return <Ico size={size} strokeWidth={1.7} />
}

/* Where you are, and how much is left.

   Words, not numerals. Two or three is few enough to name every step rather
   than count them, which is the difference between a progress bar and a table
   of contents — and it is the only honest way to draw a wizard whose LENGTH
   depends on an answer inside it. A dot-counter would have to say "1 of 2" and
   then "1 of 3" for the same screen.

   No brand. This is orientation, not an affirmative choice, and the brand on
   this screen is spent on the one pill per panel that states the profile's
   kind. A stepper wearing it competes with the thing it is a frame around. */
function WizSteps({ steps, at }: { steps: string[]; at: number }) {
  return (
    <>
      <ol className="bfp2__wizsteps">
        {steps.map((label, i) => (
          <li
            key={label}
            className={`bfp2__wizstep ${i === at ? 'is-on' : ''} ${i < at ? 'is-done' : ''}`}
          >
            {i < at && <Check size={12} strokeWidth={2.6} aria-hidden />}
            {label}
          </li>
        ))}
      </ol>
      {/* `Modal` moves focus once, when it opens (`kit.tsx`), so nothing else
          announces a step change to a screen reader — the dialog's title is
          re-rendered but not re-read. */}
      <p className="u-sr-only" aria-live="polite">{`Step ${at + 1} of ${steps.length} — ${steps[at]}`}</p>
    </>
  )
}

/* --- Create ------------------------------------------------------------------

   Two steps, or three, and which one you get is a property of the KIND rather
   than a step somebody skips.

   · **OS and version** — name it, then say what a device must be running. Two.
     Everything this kind reads arrives with the request, so there is no
     collection question to ask: `asksReach('os')` is false because nothing in
     that catalogue carries `needsAgent`, and a question whose two answers lead
     to the same list is not a question.
   · **Device attributes** — name it, say what the collector can read, then pick
     and tune. Three, and the middle one is load-bearing: it decides which
     attributes EXIST at the step after it.

   That middle step used to be the first row of a panel on the detail page,
   which put it AFTER the attributes it governs. You chose eighteen signals and
   discovered, on a different surface, that half of them never arrive — and the
   picker had no way to say so, because the answer had not been given yet.

   The last step now sets values as well as choosing rows, which is the other
   half of the same idea: a wizard should hand back a finished profile. It used
   to hand back a scoped one — ticked attributes, every value at its default,
   and a detail page you had to visit to make it mean anything.
   -------------------------------------------------------------------------- */
function CreateModal({
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
     and the whole reason it moved to a step of its own is that it is an answer
     somebody gives rather than a setting that happens to have a value. */
  const [reach, setReach] = useState<ProfileReach | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [config, setConfig] = useState<Record<string, AttrConfigValue>>({})
  const [weights, setWeights] = useState<Record<string, number>>({})

  /* Cleared on the way IN, not on the way out.

     The dialog never unmounts, so something has to blank it between uses. Doing
     it on close means either a visible snap back to step one while the dialog
     is still animating away, or a timer to outlast the animation — and a timer
     races the user: close on the last step, re-open inside the delay, and the
     pending reset fires under an open dialog. Clearing on open has neither
     problem. The copy on its way out keeps showing what you left, which is what
     it should show. */
  useEffect(() => {
    if (!open) return
    setAt(0)
    setName('')
    setMode('os')
    setReach(null)
    setPicked([])
    setConfig({})
    setWeights({})
  }, [open])

  const steps = stepsFor(mode)
  const last = steps.length - 1

  /* A permissive draft and a strict write.

     `picked` is never filtered as you move between steps, so going back from
     the attributes to the collector, flipping to agentless and returning HIDES
     the agent-only rows and flipping back RESTORES them — which is what a Back
     button is for. What gets written is `offeredPicked`, so no incoherent
     profile can be created even transiently, and nothing is silently deleted
     from under you on the way past. */
  const offered = offeredAttributes(mode, reach)
  const offeredPicked = picked.filter((id) => offered.some((a) => a.id === id))

  const named = name.trim().length > 0
  const canAdvance = at === 0 ? named : at === 1 && steps.length === 3 ? reach !== null : true
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
        registration: 'self',
        maxDevices: DEFAULT_MAX_DEVICES,
        roster: null,
        autoRegister: false,
        /* Enrolment is still unanswered — three questions this dialog does not
           ask, and until somebody does the panel shows an empty state rather
           than presenting "self-service, three devices" as a decision. */
        restrictionSet: false,
        usedIn: 0,
      }),
    )
  }

  const title =
    at === 0
      ? 'Create a device profile'
      : at === 1 && steps.length === 3
        ? `What ${name.trim()} can read`
        : mode === 'os'
          ? `What a device must be running — ${name.trim()}`
          : `What identifies a device — ${name.trim()}`

  /* 620 for the two questions, wider for the catalogue — and 760 rather than
     900 for the five. A row is a name, a sentence and a control now; at 900 the
     control ends up a third of a screen from the name it belongs to. */
  const width = at === 0 || (at === 1 && steps.length === 3) ? 620 : mode === 'os' ? 760 : 1000

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width={width}
      footer={
        /* No footnote. It said "Name the profile to continue", then "Next: what
           the collector can read", then a count — three sentences narrating a
           form that is on the screen above them. The name field is empty and
           focused, which is what says the name is missing; the step ladder at
           the top of the body says where Next goes. */
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
                       the count in the footer is never briefly a lie. */
                    setMode(m.id)
                    setPicked([])
                    setConfig({})
                    setWeights({})
                    setReach(null)
                  }}
                >
                  <span className="bfp2__mode-ico" aria-hidden>
                    <Ico size={17} strokeWidth={1.8} />
                  </span>
                  <span className="bfp2__mode-body">
                    <strong>{m.label}</strong>
                    <em>{m.blurb}</em>
                    <i className="bfp2__mode-steps">
                      {stepsFor(m.id).length} steps · {attributesFor(m.id).length} attributes
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

      {at === 1 && steps.length === 3 && (
        <div className="bfp2__form">
          <p className="bfp2__stephint">
            This decides which attributes exist at the next step. Hardware identifiers — the TPM,
            the motherboard, the disk — need software running on the machine. Everything else
            arrives with the request.
          </p>

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
                  onClick={() => setReach(r.id)}
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

          {/* The size of the difference, as a number that moves when you click.
              The card says what agent-based costs and the hint says what the
              question decides; this says what the answer is worth — which is the
              one thing the old panel could never show, because it was chosen on
              the same surface as everything else and had no next step to
              describe. */}
          {reach && (
            <p className="bfp2__reachstat">
              <strong>{offered.length}</strong> of {attributesFor(mode).length} attributes available
              {blockedAttributes(mode, reach).length > 0 && (
                <em>{blockedAttributes(mode, reach).length} need an agent</em>
              )}
            </p>
          )}
        </div>
      )}

      {at === last && at > 0 && (
        <>
          <p className="bfp2__stephint">
            {mode === 'os'
              ? 'Each one you tick is a condition, and they all have to hold. A platform you do not name is not checked at all.'
              : 'Tick what this profile watches, then say how much each one counts. A ticked attribute opens its settings under its name.'}
          </p>
          <AttrStep
            mode={mode}
            reach={reach}
            picked={picked}
            setPicked={setPicked}
            config={config}
            weights={weights}
            onValue={(id, v) => setConfig((c) => ({ ...c, [id]: v }))}
            onWeight={(id, w) => setWeights((c) => ({ ...c, [id]: w }))}
            onBack={steps.length === 3 ? () => setAt(1) : undefined}
          />
        </>
      )}
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
  const [restricting, setRestricting] = useState(false)
  const [reaching, setReaching] = useState(false)
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

  return (
    <>
      <button type="button" className="bfp2__back" onClick={onBack}>
        <ArrowLeft size={14} strokeWidth={2} aria-hidden />
        All profiles
      </button>

      <header className="bfp2__head">
        <div className="bfp2__pagehead">
          <span className="bfp2__tile bfp2__tile--lg" aria-hidden>
            {renderModeIcon(profile.mode, 24)}
          </span>
          <div>
            <h1>{profile.name}</h1>
            {/* No subtitle at all, which took two attempts to arrive at.

                It was `modeLabel · N attributes`, then the whole of
                `describeProfile`, then the kind as a chip — and every version
                was the same information the Overview panel states sixty pixels
                below it, as rows, with a tip on each one. A header that
                summarises the thing directly beneath it is a header that has to
                be kept in step with it for no reader's benefit.

                The name is the identity and the tile carries the kind as a
                mark. `describeProfile` has a home where there is no panel to
                repeat: the summary's caption. */}
          </div>
        </div>

        {/* Carries the count, so "does anything depend on this" is answered on
            the page and opening it is only needed for WHICH.

            Policies, not rules, matching the column on the list — a rule is not
            a thing anybody navigates to, and the two counts disagreeing on the
            same object is worse than either being wrong. */}
        <div className="bfp2__headacts">
          {/* The whole profile, stated. Everything below this header is an
              editor — the panels answer "what would I change" — and there is no
              surface that answers "what does this thing DO", which is the
              question you have before you touch it and the one you have to
              answer to somebody else afterwards. */}
          <Button variant="secondary" size="sm" onClick={() => setSummarising(true)}>
            <ScrollText size={14} strokeWidth={1.9} aria-hidden />
            Summary
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setShowUses(true)}>
            <Link2 size={14} strokeWidth={1.9} aria-hidden />
            Used by
            <i className="buse__count">{users.length}</i>
          </Button>
        </div>
      </header>

      {/* --- Overview ----------------------------------------------------------

          The facts that decide how everything under them reads, and none of them
          repeated from a panel below.

          `Decides by` is the lead — it takes the one brand pill on the page —
          because it settles the other two: it picks the catalogue, it picks the
          arithmetic, and it decides whether the collector question exists at
          all. Reach used to be the lead, on the argument that it decides what
          can arrive; that is still true, and it is now true of only half the
          profiles, which is exactly why it cannot be the thing everything else
          follows from.

          `Platforms named` is the sharpest row here and the screen could not
          say it before. An OS profile holding only a form factor checks no
          platform at all — a Mac signing in satisfies every condition on it —
          and the old subtitle printed that state as "Attribute match · 1
          attribute", which reads like a configured profile. */}
      <div className="bfp2__panelhead bfp2__panelhead--page">
        <h3>Overview</h3>
      </div>
      <section className="bfp2__panel">
        <div className="bfp2__rows">
          <DetailRow
            icon={MODE_ICON[profile.mode]}
            label="Decides by"
            tip={`${MODE_META[profile.mode].blurb} A profile's kind is fixed: the two do not share a catalogue, so changing it would discard every attribute. Duplicate and re-create instead.`}
            value={modeLabel(profile)}
            lead
          />

          {asksReach(profile.mode) && (
            <DetailRow
              icon={REACH_ICON[profile.reach]}
              label="What it can read"
              tip={`${REACH_META[profile.reach].blurb}${REACH_META[profile.reach].note ? ` ${REACH_META[profile.reach].note}` : ''}`}
              value={reachLabel(profile.reach)}
              action={
                <Button variant="secondary" size="sm" onClick={() => setReaching(true)}>
                  Change
                </Button>
              }
            />
          )}

          {profile.mode === 'os' && (
            <DetailRow
              icon={MonitorSmartphone}
              label="Platforms named"
              tip="A platform this profile does not name is not checked. Nothing stops a device running it from signing in."
              value={platforms.length > 0 ? platforms.join(', ') : 'None'}
              warn={platforms.length === 0}
            />
          )}

          <DetailRow
            icon={ListChecks}
            label={profile.mode === 'os' ? 'Requires' : 'Watches'}
            tip={
              chosen.some((a) => a.phase === 2)
                ? 'Attributes marked “Not collected yet” are modelled but not gathered, so they never mismatch and never move the score.'
                : 'Everything this profile checks on every sign-in that reaches it.'
            }
            value={
              countLabel(profile.mode, chosen.length) +
              (chosen.filter((a) => a.phase === 2).length > 0
                ? ` · ${chosen.filter((a) => a.phase === 2).length} not collected yet`
                : '')
            }
          />
        </div>
      </section>

      {/* Device restriction — the console's own panel, and the half of this
          feature the screen never had.

          The attributes above decide whether this is the SAME device. These
          decide whether it is allowed to become a known one at all: what can be
          read, how a device gets registered, and how many a person may keep.

          A section with two states rather than a sentence with a button. It was
          one line — "Agent-based · Users register their own devices · 3 devices
          per person" — which reads as a summary of something you can go and see,
          except there was nowhere to go: the only way to read the sixth setting
          was to open the editor and page through it. So the page holds the
          answers now, all of them, and the editor is for changing them.

          The empty state is the reason `restrictionSet` exists. Every field has
          a working default, so a profile nobody has opened looks exactly like
          one deliberately set to those defaults — and printing "Agentless ·
          self-service · 3 per person" as a configuration is a claim the screen
          cannot support until somebody has actually said so. */}
      <div className="bfp2__panelhead bfp2__panelhead--page">
        <h3>Device restriction</h3>
        {profile.restrictionSet && (
          <Button variant="secondary" size="sm" onClick={() => setRestricting(true)}>
            <Sliders size={14} strokeWidth={2} aria-hidden />
            Edit
          </Button>
        )}
      </div>

      {profile.restrictionSet ? (
        <section className="bfp2__panel">
          {/* The same row the attributes below use — mark, label, answer on the
              right — rather than a grid of its own.

              It WAS a grid of its own: a two-column definition list, each entry
              a small-caps label over a value over a sentence of consequence.
              Every one of those choices was defensible and together they made a
              block that belonged to no other part of the page: caps nothing
              else on the screen uses, three type sizes per entry, and a column
              of grey explanation that has to be read past to reach the next
              answer.

              This is four rows in the page's own shape. The consequence has not
              gone — it is on the tip beside each label, which is where this
              screen already puts the sentence you want once and not every
              time. */}
          <div className="bfp2__rows">
            {/* The reach row has gone up to Overview. It is ANSWERED at
                creation now, and an answered question printed inside a panel
                that shows an empty state when its own questions are unanswered
                is the incoherence `restrictionSet` exists to prevent. */}
            <DetailRow
              icon={UserRound}
              lead
              label="How devices register"
              tip="Either people enrol their own machines, or only the ones on an uploaded roster may sign in."
              value={REGISTRATION_LABEL[profile.registration]}
            />

            {/* Its own row, at last. It was visible only as a change in ANOTHER
                row's tip text — so a security-relevant boolean was hidden
                behind a hover, on a label it does not belong to. */}
            <DetailRow
              icon={Repeat}
              label="Silent enrolment"
              tip={
                profile.autoRegister
                  ? 'The first sign-in from a new machine enrols it silently — convenient, and it means an attacker\u2019s machine registers itself.'
                  : 'A new machine is challenged before it is trusted.'
              }
              value={profile.autoRegister ? 'On' : 'Off'}
              warn={profile.autoRegister}
            />

            {/* One row or the other, never both — a roster REPLACES the
                allowance rather than sitting beside it. */}
            {profile.registration === 'pre-approved' ? (
              <DetailRow
                icon={Server}
                label="Approved roster"
                tip={
                  profile.roster
                    ? `${profile.roster.rows} devices, uploaded ${profile.roster.uploadedAt}.`
                    : 'Nothing can sign in against this profile until a roster is uploaded.'
                }
                value={profile.roster ? profile.roster.fileName : 'None uploaded'}
              />
            ) : (
              <DetailRow
                icon={Smartphone}
                label="Devices per person"
                tip="How many machines one person may register before the next is refused."
                value={String(profile.maxDevices ?? DEFAULT_MAX_DEVICES)}
              />
            )}
          </div>
        </section>
      ) : (
        <section className="bfp2__panel">
          {/* The product's own empty state rather than a bespoke one. It was a
              hand-built panel with the button under the paragraph, which put
              the action in the middle of a left-aligned block and made it read
              as part of the sentence. */}
          <EmptyState
            compact
            icon={ShieldOff}
            title="Nothing decided yet"
            blurb="How a device gets registered, whether the first sign-in enrols it silently, and how many each person may keep."
            action={
              <Button variant="secondary" size="sm" onClick={() => setRestricting(true)}>
                <Sliders size={14} strokeWidth={2} aria-hidden />
                Configure
              </Button>
            }
          />
        </section>
      )}

      <RestrictionDrawer
        open={restricting}
        profile={profile}
        onChange={onChange}
        onClose={() => setRestricting(false)}
      />

      <div className="bfp2__panelhead bfp2__panelhead--page">
        <h3>{profile.mode === 'os' ? 'What it requires' : 'What it watches'}</h3>
        <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
          <Plus size={14} strokeWidth={2.2} aria-hidden />
          Edit {ITEM_NOUN[profile.mode].many}
        </Button>
      </div>

      {chosen.length === 0 ? (
        <p className="bfp2__none">
          {profile.mode === 'os'
            ? 'Every requirement has been removed. A profile that requires nothing lets every device through — add at least one.'
            : 'Every attribute has been removed. A profile that watches nothing cannot tell one device from another — add at least one.'}
        </p>
      ) : (
        <section className="bfp2__panel">
          <div className="bfp2__rows">
            {chosen.map((a) => {
              const AIcon = ATTR_ICON[a.id] ?? ShieldCheck
              return (
                <div className="bfp2__attrow" key={a.id}>
                  <span className="bfp2__attico" aria-hidden>
                    <AIcon size={15} strokeWidth={1.8} />
                  </span>

                  <div className="bfp2__attmain">
                    <span className="bfp2__attname">
                      {a.name}
                      {a.phase === 2 && <i className="bfp2__soon">Not collected yet</i>}
                    </span>
                    <span className="bfp2__attpurpose">{a.purpose}</span>
                  </div>

                  {/* Both controls on a device row, where there are two to
                      show — and this reverses an argument that stood here for a
                      long time.

                      It said a weight and a configuration on one row meant one
                      of them was inert, because "a weighted profile does not
                      care whether the OS is at least Windows 10". That is
                      right, and it is right about the OS catalogue's configs:
                      a version floor is a CONDITION and a score has no
                      conditions. It is wrong about the device catalogue's,
                      which are all precision — "Match on: Family only" decides
                      whether a Chrome update counts as a change at all. One
                      says whether something changed; the other says what that
                      costs. Neither answers the other.

                      The one row where the two really were the same question —
                      `device-type`'s "Treat a change as: Significant / Minor /
                      Ignore", which is High / Low / untick in different words —
                      has had its config deleted from the catalogue rather than
                      hidden here. */}
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
                    /* Says what else goes. Removing a row now removes what it
                       was set to, which is the right behaviour and the kind of
                       thing a label has to admit to. */
                    aria-label={`Remove ${a.name} and its settings`}
                    onClick={() => drop(a.id)}
                  >
                    <Trash2 size={14} strokeWidth={1.9} />
                  </button>
                </div>
              )
            })}
          </div>
        </section>
      )}

      <ReachDialog
        open={reaching}
        profile={profile}
        onChange={onChange}
        onClose={() => setReaching(false)}
      />

      <SummaryDrawer
        open={summarising}
        profile={profile}
        chosen={chosen}
        platforms={platforms}
        onClose={() => setSummarising(false)}
      />

      {/* "Used by" is a panel now, not a section — the same move zones made,
          for the same reason. It is the question you ask BEFORE editing
          ("is this safe to change") and the answer is a count; WHICH rules is
          the follow-up, and a follow-up does not need to sit at the bottom of
          the page taking a heading and a card. The count is on the header
          button, so the first half of the answer never needs a click. */}
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

      <AddModal
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
/* One answered row, for the configuration a page states rather than asks. Same
   three columns as an attribute row, so a profile reads as one list of rows
   whichever half of it you are looking at. */
function DetailRow({
  icon: Icon,
  label,
  tip,
  value,
  lead,
  warn,
  action,
}: {
  icon: typeof Sliders
  label: string
  tip: string
  value: string
  /* The one answer the others follow from, and the only pill on its panel that
     takes the brand. Spending it on all four would be spending it on none.

     It was the reach, which decided what could arrive at all. It is the KIND
     now: the reach is asked of only half the profiles, and the thing everything
     follows from cannot be a thing that is sometimes absent. */
  lead?: boolean
  /* A stated value that is worth a second look — no platform named, silent
     enrolment on. Not an error: both are legitimate, and both are states people
     arrive in without meaning to. */
  warn?: boolean
  /* The rare row that can still be changed from here. Two of the seven can;
     the rest are stated because they are answered somewhere with more room. */
  action?: React.ReactNode
}) {
  return (
    <div className="bfp2__attrow">
      <span className="bfp2__attico" aria-hidden>
        <Icon size={15} strokeWidth={1.8} />
      </span>
      <div className="bfp2__attmain">
        <span className="bfp2__attname">
          {label}
          <TipDot label={label} text={tip} />
        </span>
      </div>
      <div className="bfp2__attctl">
        <strong className={`bfp2__detailval ${lead ? 'is-lead' : ''} ${warn ? 'is-warn' : ''}`}>
          {value}
        </strong>
        {action}
      </div>
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

/* --- Device restriction, in a slide-over ----------------------------------------

   It was a three-step dialog, and the steps were not arbitrary — they were the
   dependency order, asked so that each question only appeared while it was
   still open:

     1  what it can READ      agentless or agent, which decides whether a roster
                              is even possible, since a roster matches on MAC
                              and MAC is agent-only
     2  how devices REGISTER  self-service or a roster
     3  the LIMIT             whichever of those the last answer left

   The dependency is real and it stays. What went is the paging. Three steps buy
   their sequencing at the price of never showing you the shape of the thing:
   six settings, one screen apart from each other, with a Next between you and
   the answer you came to change. That is a good trade for a first run and a bad
   one every time after, and this panel is opened to EDIT far more often than to
   fill in.

   So: one surface, in dependency order down the page, and a question that no
   longer applies is not disabled or greyed — it is not rendered. That is what
   the steps were protecting, and a section that disappears when a roster
   replaces it says the same thing a skipped step did, without the paging.

   A slide-over rather than a dialog because it sits beside the profile it
   edits. A centred modal covers the page, so "what does this profile watch"
   and "what may it read" cannot be read together, and they are two halves of
   one question. */
function RestrictionDrawer({
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
  /* A roster is matched on MAC address, and MAC is one of the eighteen things
     only an agent can read — and it is in the device catalogue only. So an
     OS-and-version profile cannot use a roster either, for the same reason and
     one step earlier: it has no MAC to match on at any reach.

     `setReach` and `wouldDrop` have gone with the section above. The writer is
     `withReach` in the model now, called from `ReachDialog` — and it does the
     half this copy missed, which was pruning the VALUES of the attributes it
     dropped. Switching to agentless removed MAC from `enabled` and left its
     weight behind, so switching back restored a tier nobody re-approved. */
  const rosterPossible = profile.mode === 'device' && profile.reach === 'agent'

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Device restriction"
      caption={profile.name}
      /* 600, not 520. The widest row here is a label and a select reading
         "Users register their own devices", and at 520 the label wrapped to two
         lines and pushed its own tip onto a third — a three-line row for one
         dropdown. The extra 80px is what it takes for every label to sit on one
         line, which is the only reason it is not the default 460. */
      width={600}
      actions={
        /* Done, not Save. Every control here writes through as it is touched,
           the same as the rest of this page, so there is nothing held back to
           commit and a Save button would imply there was. What it does commit
           is the fact that somebody answered: the section stops showing its
           empty state from here. */
        <Button variant="brand" onClick={() => {
          onChange({ ...profile, restrictionSet: true })
          onClose()
        }}>
          Done
        </Button>
      }
    >
      <div className="bfp2__restform">
        {/* The reach section stood here.

            It is asked at CREATION now, and changed from the Overview panel's
            own control — which is the whole point of moving it. It was the
            first question on this panel because it decides what the others can
            be, and being first on a panel is not the same as being first: the
            attributes were already chosen by the time anybody opened this.

            It also could not state its own cost here. Flipping to agentless
            deleted attributes the moment you clicked the card, and the warning
            beside it described the OTHER direction. `ReachDialog` holds the
            change until it has said what it will take. */}
        <section>
          <h4>How devices register</h4>
          {/* Only where it explains something the screen cannot: why the roster
              option is greyed out. The other branch said "either people enrol
              their own machines, or you supply the list", which is the two
              options in the dropdown directly below it, read aloud. */}
          {!rosterPossible && (
            <p className="bfp2__stephint">
              {profile.mode === 'os'
                ? 'An OS and version profile cannot use a roster: a roster is matched on MAC address, which is not one of the things it reads.'
                : 'An agentless profile cannot use a roster: a roster is matched on MAC address, and MAC is one of the attributes only an agent can read.'}
            </p>
          )}
          <div className="bfp2__rows bfp2__rows--form">
            <FormRow
              icon={UserRound}
              label="How a device gets registered"
              /* The select beside it already reads "Users register their own
                 devices". This was that sentence again in the third person. */
              tip={
                profile.registration === 'self'
                  ? 'People enrol their own machines, up to a limit.'
                  : 'Only devices on the uploaded roster may sign in.'
              }
            >
              <select
                className="bfp2__select"
                aria-label="How a device gets registered"
                value={profile.registration}
                onChange={(e) => {
                  const registration = e.target.value as Registration
                  onChange({
                    ...profile,
                    registration,
                    /* The console's own branch: a roster REPLACES the allowance
                       rather than sitting beside it. */
                    maxDevices:
                      registration === 'pre-approved'
                        ? null
                        : (profile.maxDevices ?? DEFAULT_MAX_DEVICES),
                  })
                }}
              >
                {(Object.keys(REGISTRATION_LABEL) as Registration[]).map((r) => (
                  <option key={r} value={r} disabled={r === 'pre-approved' && !rosterPossible}>
                    {REGISTRATION_LABEL[r]}
                  </option>
                ))}
              </select>
            </FormRow>

            <FormRow
              icon={Repeat}
              label="Register silently on first sign-in"
              /* Worth stating rather than leaving to be discovered: the
                 convenience and the hole it opens are the same sentence. */
              help="Convenient, and it means an attacker's machine registers itself."
            >
              <Toggle
                checked={profile.autoRegister}
                onChange={(autoRegister) => onChange({ ...profile, autoRegister })}
                label="Register silently on first sign-in"
                size="sm"
              />
            </FormRow>
          </div>
        </section>

        <section>
          <h4>
            {profile.registration === 'self' ? 'How many' : 'Which ones'}
            {/* The self branch's hint — "the allowance, and whether phones count
                against it" — described a mobile row that no longer exists, and
                the half that was still true restated the heading. The roster
                branch says something real, so it keeps it on a tip. */}
            {profile.registration !== 'self' && (
              <TipDot
                label="Which ones"
                text="The roster replaces the per-person allowance rather than sitting beside it."
              />
            )}
          </h4>
          <div className="bfp2__rows bfp2__rows--form">
            {/* One or the other. This is the branch the third step used to
                carry, and it is still a branch — just not a page. */}
            {profile.registration === 'self' ? (
              <FormRow
                icon={Smartphone}
                label="Devices per person"
                /* The name, restated, beside a stepper showing the number. */
                tip="How many they may register before the next one is refused."
              >
                <NumberStepper
                  label="Devices per person"
                  value={profile.maxDevices ?? DEFAULT_MAX_DEVICES}
                  min={1}
                  max={20}
                  onChange={(maxDevices) => onChange({ ...profile, maxDevices })}
                />
              </FormRow>
            ) : (
              <FormRow
                icon={Server}
                label="Approved device roster"
                help="A CSV of device name, user email and MAC address."
              >
                {profile.roster ? (
                  <span className="bfp2__roster">
                    <strong>{profile.roster.fileName}</strong>
                    <em>
                      {profile.roster.rows} devices · {profile.roster.uploadedAt}
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
        </section>
      </div>
    </Drawer>
  )
}

function AddModal({
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

     It held only `enabled`, which is why re-opening this dialog and saving used
     to drop nothing and change nothing else — the values were somewhere the
     dialog could not see. Now that a row carries its settings, the dialog has
     to carry them too, or ticking an attribute here and setting it here would
     write one and discard the other. */
  const [picked, setPicked] = useState<string[]>(profile.enabled)
  const [config, setConfig] = useState(profile.config)
  const [weights, setWeights] = useState(profile.weights)

  /* On `open` alone, deliberately — the same argument as `CreateModal`'s reset.
     A draft that re-synced while the dialog was open would throw away what you
     had just ticked every time the page behind it re-rendered. */
  useEffect(() => {
    if (!open) return
    setPicked(profile.enabled)
    setConfig(profile.config)
    setWeights(profile.weights)
  }, [open])

  const noun = ITEM_NOUN[profile.mode]

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`What ${profile.name} ${noun.verb}`}
      width={profile.mode === 'os' ? 760 : 1000}
      footer={
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
      />
    </Modal>
  )
}

/* --- Changing the reach afterwards ---------------------------------------------

   The one destructive edit on this page, and the only one held behind a
   confirmation.

   Not un-editable: an admin who rolls the agent out to their fleet has to be
   able to upgrade a profile, and refusing that means "duplicate it, re-pick
   twenty attributes, re-tune eight, and re-point every policy rule".

   Not inline either, which is what the restriction panel did — two radio cards
   that deleted attributes on click, with a warning underneath describing the
   direction you had not chosen. A control that destroys has to say what it will
   take BEFORE it takes it, and it has to name the casualties rather than count
   them: "4 attributes" is a number you cannot act on; the names are what tell
   you whether the ones going are ones you wanted. */
function ReachDialog({
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
  /* Held, not written. The whole point of this dialog is that the change does
     not happen until it has said what it will take — so `pending` is local, and
     it syncs from the profile on open only. */
  const [pending, setPending] = useState<ProfileReach>(profile.reach)
  useEffect(() => {
    if (open) setPending(profile.reach)
  }, [open])

  const dropped = profile.enabled
    .map((id) => attrOf(profile.mode, id))
    .filter((a): a is Attribute => Boolean(a?.needsAgent && pending !== 'agent'))
  const changed = pending !== profile.reach

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`What ${profile.name} can read`}
      width={560}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={dropped.length > 0 ? 'danger' : 'brand'}
            disabled={!changed}
            onClick={() => {
              onChange(withReach(profile, pending))
              onClose()
            }}
          >
            {pending === 'agentless' ? 'Switch to agentless' : 'Switch to agent-based'}
          </Button>
        </>
      }
    >
      <p className="bfp2__stephint">
        This decides which attributes can arrive at all. Hardware identifiers — the TPM, the
        motherboard, the disk — need software running on the machine.
      </p>

      <fieldset className="bfp2__modes" aria-label="What it can read">
        {REACHES.map((r) => {
          const Ico = REACH_ICON[r.id]
          return (
            <button
              key={r.id}
              type="button"
              role="radio"
              aria-checked={pending === r.id}
              className={`bfp2__mode-card ${pending === r.id ? 'is-on' : ''}`}
              onClick={() => setPending(r.id)}
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
              {pending === r.id && (
                <Check size={15} strokeWidth={2.6} className="bfp2__mode-tick" aria-hidden />
              )}
            </button>
          )
        })}
      </fieldset>

      {dropped.length > 0 && (
        <p className="bfp2__prereq">
          <AlertTriangle size={13} strokeWidth={2} aria-hidden />
          <span>
            Removes {dropped.map((a) => a.name).join(', ')} and everything they are set to.
            {profile.registration === 'pre-approved' &&
              ' The approved roster is matched on MAC address, so it will stop matching anything.'}
          </span>
        </p>
      )}
    </Modal>
  )
}

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
    <Drawer open={open} onClose={onClose} title={profile.name} caption={describeProfile(profile)} width={520}>
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
