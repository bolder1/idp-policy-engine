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
  Clock,
  Copy,
  Cpu,
  Eye,
  Gauge,
  Globe,
  Hash,
  IdCard,
  Languages,
  Lock,
  MapPin,
  Link2,
  Microchip,
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

import { Button, Drawer, Modal, NumberStepper, TipDot, Toggle } from '../kit'
import {
  ATTRIBUTES,
  DEFAULT_MAX_DEVICES,
  REGISTRATION_LABEL,
  TIER_WEIGHT,
  byId,
  isRuleValue,
  modeLabel,
  tierOf,
  type Attribute,
  type AttrConfigValue,
  type AttrRuleValue,
  type FingerprintProfile,
  type Priority,
  type ProfileMode,
  type ProfileReach,
  type Registration,
} from '../fingerprint'
import { useBrand } from '../store'
import { EmptyState } from '../empty'
import type { Policy } from '../data'
import { policiesUsing, rulesUsing } from './usage'
import { UsedByList } from './used-by'

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
              const uses = rulesUsing('fingerprint', p.id, policies)
              return (
              <div className="bfp2__trow" role="row" key={p.id}>
                {/* One cell, as on the zones table — the icon belongs to the
                    name rather than to a column of its own. */}
                <span role="cell" className="bfp2__tname">
                  <span className={`bfp2__tile bfp2__tile--sm is-${p.mode}`} aria-hidden>
                    {p.mode === 'risk' ? (
                      <Gauge size={13} strokeWidth={1.9} />
                    ) : (
                      <Sliders size={13} strokeWidth={1.9} />
                    )}
                  </span>
                  <button type="button" className="bfp2__gname" onClick={() => onOpen(p.id)}>
                    {p.name}
                  </button>
                </span>
                <span role="cell">
                  <i className={`bfp2__modechip is-${p.mode}`}>{modeLabel(p)}</i>
                </span>
                <span role="cell" className="bfp2__tnum">{p.enabled.length}</span>
                <span role="cell" className={`bfp2__tuses ${uses === 0 ? 'is-quiet' : ''}`}>
                  {uses === 0 ? '—' : `${uses} rule${uses === 1 ? '' : 's'}`}
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

const MODES: { id: ProfileMode; label: string; blurb: string; icon: typeof Sliders }[] = [
  {
    id: 'match',
    label: 'Attribute based',
    blurb: 'Compare the signals to last time. Too many changed and it is treated as a new device.',
    icon: Sliders,
  },
  {
    id: 'risk',
    label: 'Risk based',
    blurb: 'Each signal carries a weight. What changed adds up to a score, and the score picks the outcome.',
    icon: Gauge,
  },
]

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
function AttrPicker({
  picked,
  setPicked,
  reach,
}: {
  picked: string[]
  setPicked: (ids: string[]) => void
  /* An agentless profile cannot collect five of these, and does not see them.

     They used to be shown and refused — a greyed row carrying its reason, on the
     argument that "why is TPM ID not in the list" is a support ticket. That was
     the right trade over thirty-eight, where five more greyed rows cost nothing
     you would otherwise be reading. Over fourteen it is a third of the list
     rendered to be refused, and the refusal is not even actionable from here:
     the answer is to change the reach, which is a different panel. A list where
     five of fourteen cannot be picked reads as a broken list. */
  reach: ProfileReach
}) {
  const [q, setQ] = useState('')

  const offered = ATTRIBUTES.filter((a) => !(reach === 'agentless' && a.needsAgent))
  const needle = q.trim().toLowerCase()
  const rows = offered.filter(
    (a) =>
      !needle ||
      a.name.toLowerCase().includes(needle) ||
      a.purpose.toLowerCase().includes(needle),
  )

  const toggle = (id: string) =>
    setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id])

  /* Acts on what is SHOWN, so with a search running it takes the matches
     rather than everything behind them. */
  const shownIds = rows.map((a) => a.id)
  const allShownOn = shownIds.length > 0 && shownIds.every((id) => picked.includes(id))

  return (
    <div className="bfp2__pick">
      <div className="bfp2__filter">
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

        <div className="bfp2__filteractions">
          <span className={`bfp2__pickcount ${picked.length ? 'is-on' : ''}`}>
            {picked.length} of {offered.length} selected
          </span>
          {shownIds.length > 0 && (
            <button
              type="button"
              className="bfp2__selectall"
              onClick={() =>
                setPicked(
                  allShownOn
                    ? picked.filter((x) => !shownIds.includes(x))
                    : [...new Set([...picked, ...shownIds])],
                )
              }
            >
              {allShownOn ? 'Clear these' : 'Select all shown'}
            </button>
          )}
          {picked.length > 0 && (
            <button type="button" className="bfp2__clear" onClick={() => setPicked([])}>
              Clear all
            </button>
          )}
        </div>
      </div>

      <div className="bfp2__pickpane">
        {rows.length === 0 ? (
          <p className="bfp2__none">Nothing matches that.</p>
        ) : (
          <div className="bfp2__grid">
            {rows.map((a) => {
              const isOn = picked.includes(a.id)
              const AIcon = ATTR_ICON[a.id] ?? ShieldCheck
              return (
                <button
                  key={a.id}
                  type="button"
                  aria-pressed={isOn}
                  className={`bfp2__opt ${isOn ? 'is-on' : ''}`}
                  /* The purpose is a tip rather than a second line. Fourteen
                     sentences stacked is still a wall of prose in front of a
                     choice you make from the names. */
                  title={a.purpose}
                  onClick={() => toggle(a.id)}
                >
                  <span className="bfp2__optbox" aria-hidden>
                    <Check size={11} strokeWidth={3.2} />
                  </span>
                  {/* Falls back to a generic mark, so an attribute added to the
                      master without one gets an icon rather than a hole in the
                      column. */}
                  <span className="bfp2__optico" aria-hidden>
                    <AIcon size={14} strokeWidth={1.8} />
                  </span>
                  <span className="bfp2__optname">{a.name}</span>
                  {/* Marked here rather than only on the inner page. Whether a
                      signal is collected at all is part of deciding to include
                      it, and learning it afterwards is learning it too late. */}
                  {a.phase === 2 && (
                    <span
                      className="bfp2__soonico"
                      role="img"
                      aria-label="Not collected yet"
                      title="Not collected yet"
                    >
                      <Clock size={12} strokeWidth={2} />
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

/* Two steps, because they are two different questions.

   Step one is the profile itself — what it is called and which of the two
   arithmetics it runs. Both answers are short, both are about the profile
   rather than its contents, and neither needs more than a narrow dialog.

   Step two is the master, and it takes the full width. Thirty-eight attributes
   shown a few at a time is a list you scroll rather than a set you choose, and
   the sentence explaining each one only fits once the attributes have stopped
   sharing a dialog with two unrelated questions. */
function CreateModal({
  open,
  onClose,
  onCreate,
}: {
  open: boolean
  onClose: () => void
  onCreate: (p: FingerprintProfile) => void
}) {
  /* Two steps, restored.

     The picker was moved out of here and the profile seeded with six agentless
     defaults instead, on the argument that a new profile should arrive working.
     It arrived working and wrong: six attributes nobody chose, on a profile
     whose whole point is choosing what identifies a device. Naming a thing and
     saying what it watches are two decisions, and the second one is the profile.

     One requirement per step, which is also where the boundary is. */
  const [step, setStep] = useState<1 | 2>(1)
  const [name, setName] = useState('')
  const [mode, setMode] = useState<ProfileMode>('match')
  const [picked, setPicked] = useState<string[]>([])

  /* Cleared on the way IN, not on the way out.

     The dialog never unmounts, so something has to blank it between uses. Doing
     it on close means either a visible snap back to step one while the dialog
     is still animating away, or a timer to outlast the animation — and a timer
     races the user: close on step two, re-open inside the delay, and the
     pending reset fires under an open dialog. Clearing on open has neither
     problem. The copy of the form on its way out keeps showing what you left,
     which is what it should show. */
  useEffect(() => {
    if (!open) return
    setStep(1)
    setName('')
    setMode('match')
    setPicked([])
  }, [open])

  /* A rule names a profile, so a nameless one cannot be referred to. Nothing
     ticked is not a profile either — it would watch no signals, and every
     device would look identical to every other. */
  const named = name.trim().length > 0
  const canSave = named && picked.length > 0

  const save = () => {
    if (!canSave) return
    onCreate({
      id: `fp-${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`,
      name: name.trim(),
      mode,
      /* Exactly what was ticked. The profile arrives watching what you chose
         and nothing else, which is the difference between a profile you made
         and a profile that was made for you. */
      enabled: picked,
      config: {},
      weights: {},
      reach: 'agentless',
      registration: 'self',
      maxDevices: DEFAULT_MAX_DEVICES,
      roster: null,
      autoRegister: false,
      /* The values above are defaults, not answers. Until somebody opens the
         panel and says so, the section shows an empty state rather than
         presenting "agentless, self-service, three devices" as a decision. */
      restrictionSet: false,
      usedIn: 0,
    })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={step === 1 ? 'Create a device profile' : `What identifies a device — ${name.trim()}`}
      width={step === 1 ? 620 : 900}
      footer={
        <>
          <span className="bfp2__footnote">
            {step === 1
              ? named
                ? 'Next: choose what it watches.'
                : 'Name the profile to continue.'
              : picked.length > 0
                ? `${picked.length} attribute${picked.length === 1 ? '' : 's'} — the rest is set inside.`
                : 'Pick at least one. A profile that watches nothing cannot tell devices apart.'}
          </span>
          {step === 1 ? (
            <>
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="brand" disabled={!named} onClick={() => setStep(2)}>
                Next
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button variant="brand" disabled={!canSave} onClick={save}>
                Create profile
              </Button>
            </>
          )}
        </>
      }
    >
      {step === 2 ? (
        /* Agentless, because a profile being created has no reach yet and
           agentless is what it will start as — so the picker greys the
           eighteen attributes an agent would be needed for rather than
           offering them and failing later. */
        <AttrPicker picked={picked} setPicked={setPicked} reach="agentless" />
      ) : (
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
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={mode === m.id}
              className={`bfp2__mode-card ${mode === m.id ? 'is-on' : ''}`}
              onClick={() => setMode(m.id)}
            >
              <span className="bfp2__mode-ico" aria-hidden>
                <m.icon size={17} strokeWidth={1.8} />
              </span>
              <span className="bfp2__mode-body">
                <strong>{m.label}</strong>
                <em>{m.blurb}</em>
              </span>
              {mode === m.id && (
                <Check size={15} strokeWidth={2.6} className="bfp2__mode-tick" aria-hidden />
              )}
            </button>
          ))}
        </fieldset>
      </div>
      )}
    </Modal>
  )
}

/* --- The two reaches -------------------------------------------------------------
   Blurbs are the console's own. The third line on the agent card is not: the
   console puts "Windows only" in the third bullet of a callout that appears
   AFTER agent-based has been chosen, which is one screen too late to be a
   decision input. A platform limit is a property of the choice. */

const REACHES: {
  id: ProfileReach
  label: string
  blurb: string
  note?: string
  icon: typeof Globe
}[] = [
  {
    id: 'agentless',
    label: 'Agentless',
    blurb:
      'Browser, network and geolocation attributes establish device identity. Nothing to install.',
    icon: Globe,
  },
  {
    id: 'agent',
    label: 'Agent-based',
    blurb:
      'An installed agent adds hardware identifiers — TPM, motherboard, disk — for high-assurance access.',
    note: 'Windows only. Users without the agent cannot sign in.',
    icon: Microchip,
  },
]

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
  const [showUses, setShowUses] = useState(false)
  const chosen = profile.enabled.map(byId).filter((a): a is Attribute => Boolean(a))
  const uses = rulesUsing('fingerprint', profile.id, policies)
  const users = policiesUsing('fingerprint', profile.id, policies)

  const setConfig = (id: string, v: AttrConfigValue) =>
    onChange({ ...profile, config: { ...profile.config, [id]: v } })

  const setWeight = (id: string, w: number) =>
    onChange({ ...profile, weights: { ...profile.weights, [id]: w } })

  const drop = (id: string) =>
    onChange({ ...profile, enabled: profile.enabled.filter((x) => x !== id) })

  return (
    <>
      <button type="button" className="bfp2__back" onClick={onBack}>
        <ArrowLeft size={14} strokeWidth={2} aria-hidden />
        All profiles
      </button>

      <header className="bfp2__head">
        <div className="bfp2__pagehead">
          <span className={`bfp2__tile bfp2__tile--lg is-${profile.mode}`} aria-hidden>
            {profile.mode === 'risk' ? (
              <Gauge size={24} strokeWidth={1.7} />
            ) : (
              <Sliders size={24} strokeWidth={1.7} />
            )}
          </span>
          <div>
            <h1>{profile.name}</h1>
            <p>
              {modeLabel(profile)} · {chosen.length} attribute{chosen.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>

        {/* Carries the count, so "does anything depend on this" is answered on
            the page and opening it is only needed for WHICH. */}
        <Button variant="secondary" size="sm" onClick={() => setShowUses(true)}>
          <Link2 size={14} strokeWidth={1.9} aria-hidden />
          Used by
          <i className="bfp2__usecount">{uses}</i>
        </Button>
      </header>

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
            <DetailRow
              icon={profile.reach === 'agent' ? Microchip : Globe}
              label="What it can read"
              tip={
                profile.reach === 'agent'
                  ? 'An installed agent adds hardware identifiers — TPM, motherboard, disk. Windows only, and users without the agent cannot sign in.'
                  : 'Browser, network and geolocation only. Nothing to install, and the five hardware attributes never arrive.'
              }
              value={profile.reach === 'agent' ? 'Agent-based' : 'Agentless'}
              lead
            />

            <DetailRow
              icon={UserRound}
              label="How devices register"
              tip={
                profile.autoRegister
                  ? 'The first sign-in from a new machine enrols it silently — convenient, and it means an attacker\u2019s machine registers itself.'
                  : 'A new machine is challenged before it is trusted.'
              }
              value={REGISTRATION_LABEL[profile.registration]}
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
            blurb="What this profile may read, how a device gets registered, and how many each person may keep."
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
        <h3>Attributes</h3>
        <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
          <Plus size={14} strokeWidth={2.2} aria-hidden />
          Add attributes
        </Button>
      </div>

      {chosen.length === 0 ? (
        <p className="bfp2__none">
          Every attribute has been removed. A profile with none watches nothing — add at least one.
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

                      {/* One control, and which one depends on what the
                          profile is FOR.

                          A risk profile asks one question per attribute — how
                          much does this one count — and it asks it of all
                          fourteen. Putting the match configuration beside it
                          offered a second question that scoring never reads: a
                          weighted profile does not care whether the OS is at
                          least Windows 10, it cares that the OS changed and by
                          how much that should move the number. Two controls
                          where one is inert is the row telling you to set
                          something that does nothing.

                          So: risk gets the weight, match gets the
                          configuration, and neither gets the other's. */}
                      <div className="bfp2__attctl">
                        {profile.mode === 'risk' ? (
                          <WeightPick attr={a} profile={profile} onChange={setWeight} />
                        ) : a.config ? (
                          <AttrControl attr={a} profile={profile} onChange={setConfig} />
                        ) : (
                          <span className="bfp2__nocfg">Nothing to tune</span>
                        )}
                      </div>

                      <button
                        type="button"
                        className="bfp2__drop"
                        aria-label={`Remove ${a.name}`}
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
        onSave={(ids) => {
          onChange({ ...profile, enabled: ids })
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
  profile,
  onChange,
}: {
  attr: Attribute
  profile: FingerprintProfile
  onChange: (id: string, v: AttrConfigValue) => void
}) {
  const c = attr.config!
  const raw = profile.config[attr.id]

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
}: {
  icon: typeof Sliders
  label: string
  tip: string
  value: string
  /* The one answer the others follow from. Reach decides which attributes can
     arrive at all — an agentless profile cannot hold five of the fourteen, and
     cannot use a roster — so it is the first thing to read and the only one
     that gets the brand. Spending it on all four would be spending it on
     none. */
  lead?: boolean
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
        <strong className={`bfp2__detailval ${lead ? 'is-lead' : ''}`}>{value}</strong>
      </div>
    </div>
  )
}

/* One labelled row, for the settings that are questions rather than attributes. */
function FormRow({
  icon: Icon,
  label,
  help,
  children,
}: {
  icon: typeof Sliders
  label: string
  help: string
  children: React.ReactNode
}) {
  return (
    <div className="bfp2__attrow">
      <span className="bfp2__attico" aria-hidden>
        <Icon size={15} strokeWidth={1.8} />
      </span>
      <div className="bfp2__attmain">
        <span className="bfp2__attname">{label}</span>
        <span className="bfp2__attpurpose">{help}</span>
      </div>
      <div className="bfp2__attctl">{children}</div>
    </div>
  )
}

/* The sheet's four stops, and the master's own value as the starting point.
   Printed as the number rather than a word, because the number is what the
   score adds up — "High" beside an invisible sum is the console's mistake. */
const TIERS: Priority[] = ['High', 'Medium', 'Low']

function WeightPick({
  attr,
  profile,
  onChange,
}: {
  attr: Attribute
  profile: FingerprintProfile
  onChange: (id: string, w: number) => void
}) {
  /* Three words, not four numbers.

     It offered the sheet's raw weights — 5, 10, 20, 30 — which asked a person
     to hold a scale in their head to answer a question they think about in
     words. The score is still the sum of numbers; choosing between them is not
     where the arithmetic belongs.

     Seeded from the master's own weight, so a profile that has never been
     touched still scores exactly as the sheet does. */
  const tier = tierOf(profile.weights[attr.id] ?? attr.weight)
  return (
    /* Three pills, not a dropdown.

       A select is the right control for a list you have to go and look at. This
       is three words, all of which fit on the row — so the dropdown was hiding
       two thirds of a decision behind a click, and showing the third in the
       grey of a form field. On a screen whose entire per-attribute question is
       this one, the answer should be readable without opening anything.

       No caption either. It read "Weight Low" on every one of fourteen rows,
       which is the same word repeated down a column beside the only control on
       the row. The group keeps its accessible name, which is where the word was
       doing work.

       Hot to cool — red, amber, green — and only on the chosen one. Read as
       "how hard does this one push the score", not as approval: red is the
       attribute that moves it most. A hue you can name from a single row beats
       three shades of one colour here, because you see one of these per row and
       fourteen rows apart, never side by side. */
    <div className="bfp2__tiers" role="radiogroup" aria-label={`${attr.name} weight`}>
      {TIERS.map((t) => (
        <button
          key={t}
          type="button"
          role="radio"
          aria-checked={tier === t}
          className={`bfp2__tier is-${t.toLowerCase()} ${tier === t ? 'is-on' : ''}`}
          onClick={() => onChange(attr.id, TIER_WEIGHT[t])}
        >
          {t}
        </button>
      ))}
    </div>
  )
}

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
     only an agent can read. On an agentless profile it would match nothing, so
     it is refused rather than warned about. */
  const rosterPossible = profile.reach === 'agent'

  /* Switching to agentless drops the attributes that can no longer arrive.
     Keeping them would leave the profile reading as stronger than it is —
     watching a TPM that never reports is watching nothing. */
  const setReach = (reach: ProfileReach) => {
    const enabled =
      reach === 'agentless' ? profile.enabled.filter((id) => !byId(id)?.needsAgent) : profile.enabled
    onChange({
      ...profile,
      reach,
      enabled,
      registration: reach === 'agentless' ? 'self' : profile.registration,
      maxDevices:
        reach === 'agentless' ? (profile.maxDevices ?? DEFAULT_MAX_DEVICES) : profile.maxDevices,
    })
  }

  const wouldDrop = profile.enabled.filter((id) => byId(id)?.needsAgent).length

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Device restriction"
      caption={profile.name}
      width={520}
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
        <section>
          <h4 id="bfp2-reach">What it can read</h4>
          <p className="bfp2__stephint">
            Hardware identifiers need something installed on the machine. This decides which
            attributes can arrive at all, so it is first.
          </p>
          {/* The section's own <h4> is the visible heading, so the legend would
              print it twice. Removed rather than hidden: `aria-labelledby` on
              the fieldset points at the heading that is already there, which is
              one label in the accessibility tree instead of two saying the same
              words. */}
          <fieldset className="bfp2__modes" aria-labelledby="bfp2-reach">
            {REACHES.map((r) => (
              <button
                key={r.id}
                type="button"
                role="radio"
                aria-checked={profile.reach === r.id}
                className={`bfp2__mode-card ${profile.reach === r.id ? 'is-on' : ''}`}
                onClick={() => setReach(r.id)}
              >
                <span className="bfp2__mode-ico" aria-hidden>
                  <r.icon size={17} strokeWidth={1.8} />
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
                {profile.reach === r.id && (
                  <Check size={15} strokeWidth={2.6} className="bfp2__mode-tick" aria-hidden />
                )}
              </button>
            ))}
          </fieldset>

          {/* Said before it happens, not after. */}
          {profile.reach === 'agent' && wouldDrop > 0 && (
            <p className="bfp2__prereq">
              <AlertTriangle size={13} strokeWidth={2} aria-hidden />
              <span>
                Switching to agentless would drop {wouldDrop} attribute
                {wouldDrop === 1 ? '' : 's'} that only an agent can read.
              </span>
            </p>
          )}
        </section>

        <section>
          <h4>How devices register</h4>
          <p className="bfp2__stephint">
            {rosterPossible
              ? 'Either people enrol their own machines, or you supply the list.'
              : 'An agentless profile cannot use a roster: a roster is matched on MAC address, and MAC is one of the attributes only an agent can read.'}
          </p>
          <div className="bfp2__rows bfp2__rows--form">
            <FormRow
              icon={UserRound}
              label="How a device gets registered"
              help={
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
          <h4>{profile.registration === 'self' ? 'How many' : 'Which ones'}</h4>
          <p className="bfp2__stephint">
            {profile.registration === 'self'
              ? 'The allowance, and whether phones count against it.'
              : 'The roster replaces the per-person allowance rather than sitting beside it.'}
          </p>
          <div className="bfp2__rows bfp2__rows--form">
            {/* One or the other. This is the branch the third step used to
                carry, and it is still a branch — just not a page. */}
            {profile.registration === 'self' ? (
              <FormRow
                icon={Smartphone}
                label="Devices per person"
                help="How many they may register before the next one is refused."
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
  onSave: (ids: string[]) => void
}) {
  const [picked, setPicked] = useState<string[]>(profile.enabled)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Attributes in this profile"
      width={1000}
      footer={
        <>
          <span className="bfp2__footnote">{picked.length} selected</span>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="brand" disabled={picked.length === 0} onClick={() => onSave(picked)}>
            Save
          </Button>
        </>
      }
    >
      <AttrPicker picked={picked} setPicked={setPicked} reach={profile.reach} />
    </Modal>
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
