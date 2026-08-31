import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  Activity,
  AlertTriangle,
  AppWindow,
  ArrowLeft,
  BadgeCheck,
  Battery,
  Binary,
  Box,
  Brush,
  Building2,
  Cable,
  Check,
  CircuitBoard,
  Clock,
  Copy,
  Cpu,
  Database,
  Eye,
  FileCode,
  Gauge,
  Globe,
  HardDrive,
  Hash,
  IdCard,
  KeyRound,
  Keyboard,
  Languages,
  Lock,
  MapPin,
  MemoryStick,
  Microchip,
  Monitor,
  MousePointerClick,
  Network,
  Plus,
  Puzzle,
  RadioTower,
  Repeat,
  Scan,
  Search,
  Server,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Sliders,
  Smartphone,
  Timer,
  Trash2,
  UserRound,
  UsersRound,
  Wifi,
} from 'lucide-react'

import { Button, Modal, NumberStepper, Toggle } from '../kit'
import {
  ATTRIBUTES,
  CATEGORIES,
  DEFAULT_BANDS,
  DEFAULT_MAX_DEVICES,
  REGISTRATION_LABEL,
  byId,
  ceilingOf,
  modeLabel,
  type Attribute,
  type FingerprintProfile,
  type ProfileMode,
  type ProfileReach,
  type Registration,
} from '../fingerprint'
import { useBrand } from '../store'
import { EmptyState, DeviceArt } from '../empty'
import type { Policy } from '../data'
import { policiesUsing, rulesUsing } from './usage'

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
          <h1>Device fingerprint</h1>
          <p>
            A profile is a set of device signals and what to do when they change. Policy rules name
            a profile the way they name a zone.
          </p>
        </div>
        <Button variant="brand" onClick={onCreate}>
          <Plus size={15} strokeWidth={2.2} aria-hidden />
          Create new profile
        </Button>
      </header>

      {profiles.length === 0 ? (
        <EmptyState
          art={<DeviceArt />}
          title="No profiles yet"
          blurb="A profile decides which signals identify a device, and whether a change is worth challenging. Nothing is watched until one exists."
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

/* An icon and a tint per category, and no sentence.

   The category blurbs read fine on the inner page, where there is one of them.
   Five of them stacked down a rail is five paragraphs to skim before making a
   choice the labels already describe — so the rail carries a mark instead: an
   icon says which family this is at a glance, and the tint ties it to the
   group heading and to the fill on a card you have ticked. That is the only
   thing colour can usefully encode here; priority is already a ramp, and
   selected-vs-not is carried by the fill existing at all. */
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

/* An icon per attribute, keyed off the master.

   With the purpose off the row there is one line to tell thirty-eight things
   apart, and a column of identical checkboxes gives the eye nothing to land on.
   A mark per attribute makes the row scannable by shape before it is read, and
   it makes a half-remembered attribute findable — you recall the padlock or the
   pin faster than you recall "Secure Boot and certificates".

   Kept literal rather than clever: a battery is a battery, a map pin is
   geolocation. An icon that needs explaining is worse than no icon. */
const ATTR_ICON: Record<string, typeof Cpu> = {
  // Hardware
  'device-type': Smartphone,
  manufacturer: Building2,
  mac: Network,
  os: Monitor,
  'os-install': Binary,
  tpm: Lock,
  cpu: Microchip,
  screen: Monitor,
  ram: MemoryStick,
  battery: Battery,
  motherboard: CircuitBoard,
  bios: KeyRound,
  disk: HardDrive,
  'ram-serial': MemoryStick,
  'machine-sid': IdCard,
  // Browser
  browser: AppWindow,
  'user-agent': FileCode,
  plugins: Puzzle,
  locale: Languages,
  canvas: Brush,
  // Security
  root: ShieldAlert,
  vm: Box,
  'secure-boot': BadgeCheck,
  'app-integrity': Scan,
  // Network
  hostname: Server,
  ip: Hash,
  isp: RadioTower,
  geo: MapPin,
  vpn: ShieldOff,
  conn: Cable,
  domain: UsersRound,
  // Behaviour
  typing: Keyboard,
  mouse: MousePointerClick,
  'login-freq': Repeat,
  session: Timer,
  time: Clock,
  resource: Database,
  role: UserRound,
}

/* The picker, as a rail and a pane.

   It was an accordion in a 320px scroller in a 720px modal, sitting under a
   name field and two mode cards. That is a scrollbar inside a scrollbar, one
   category visible at a time, and — because the whole master was competing
   with two other questions for the same 720px — an attribute reduced to a
   chip, with the sentence saying what it is for hidden on a `title` tooltip
   that touch and keyboard users never see.

   Given a step of its own it becomes two columns: the categories down the
   left, that category's attributes across the right, two cards wide, each card
   carrying its sentence. Nothing nests, so there is exactly one scrollbar and
   it is on the pane — the only thing here whose length is not known in
   advance.

   Search is the other way in, and it searches everything: the pane shows every
   match grouped under its category, and the rail dims the categories with
   none. Clicking a category is browsing, so it clears the search. The two are
   alternatives rather than filters that compose, which is one rule to hold
   instead of four states. */
function AttrPicker({
  picked,
  setPicked,
  reach,
}: {
  picked: string[]
  setPicked: (ids: string[]) => void
  /* An agentless profile cannot collect eighteen of these, so they are shown
     and refused rather than hidden: "why is TPM ID not in the list" is a
     support ticket, and a greyed row with a reason is the answer. */
  reach: ProfileReach
}) {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<string>(CATEGORIES[0]?.id ?? '')

  const needle = q.trim().toLowerCase()
  const matches = (a: Attribute) =>
    !needle ||
    a.name.toLowerCase().includes(needle) ||
    a.purpose.toLowerCase().includes(needle) ||
    a.category.toLowerCase().includes(needle)

  const toggle = (id: string) =>
    setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id])

  /* One group while browsing, every group with a hit while searching. */
  const groups = CATEGORIES.map((c) => ({
    cat: c,
    rows: ATTRIBUTES.filter((a) => a.category === c.id && matches(a)),
  })).filter((g) => (needle ? g.rows.length > 0 : g.cat.id === cat))

  return (
    <div className="bfp2__pick">
      <div className="bfp2__pickbar">
        <label className="bfp2__search">
          <Search size={14} strokeWidth={1.9} aria-hidden />
          <input
            type="search"
            value={q}
            placeholder={`Search all ${ATTRIBUTES.length} attributes…`}
            aria-label="Search attributes"
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <span className={`bfp2__pickcount ${picked.length ? 'is-on' : ''}`}>
          {picked.length} of {ATTRIBUTES.length} selected
        </span>
        {picked.length > 0 && (
          <button type="button" className="bfp2__clear" onClick={() => setPicked([])}>
            Clear all
          </button>
        )}
      </div>

      <div className="bfp2__pickbody">
        <nav className="bfp2__rail" aria-label="Attribute categories">
          {CATEGORIES.map((c) => {
            const all = ATTRIBUTES.filter((a) => a.category === c.id)
            const on = all.filter((a) => picked.includes(a.id)).length
            /* The count is always progress and never hit count, so it means
               the same thing whether or not a search is running. A category the
               search cannot reach is dimmed rather than re-labelled. */
            const dim = needle ? !all.some(matches) : false
            const here = !needle && cat === c.id
            const { tint, icon: Icon } = metaOf(c.id)
            return (
              <button
                key={c.id}
                type="button"
                aria-current={here || undefined}
                /* The blurb stays on the tip rather than the row: available if
                   you want it, not five paragraphs deep if you do not. */
                title={c.blurb}
                className={`bfp2__railitem is-${tint} ${here ? 'is-on' : ''} ${dim ? 'is-dim' : ''}`}
                onClick={() => {
                  setQ('')
                  setCat(c.id)
                }}
              >
                <span className="bfp2__railico" aria-hidden>
                  <Icon size={15} strokeWidth={1.9} />
                </span>
                <strong>{c.label}</strong>
                <span className={`bfp2__railcount ${on > 0 ? 'is-on' : ''}`}>
                  {on}/{all.length}
                </span>
              </button>
            )
          })}
        </nav>

        <div className="bfp2__pane">
          {groups.length === 0 ? (
            <p className="bfp2__none">No attribute matches “{q.trim()}”.</p>
          ) : (
            groups.map(({ cat: c, rows }) => {
              const on = rows.filter((a) => picked.includes(a.id)).length
              const full = on === rows.length
              const { tint, icon: Icon } = metaOf(c.id)
              return (
                <section key={c.id} className={`bfp2__pang is-${tint}`}>
                  <header className="bfp2__panghead">
                    <Icon size={13} strokeWidth={2} aria-hidden />
                    <h4>{c.label}</h4>
                    <span>
                      {on}/{rows.length}
                    </span>
                    {/* Select-all acts on what is visible, so with a search
                        running it takes the matches rather than the whole
                        category behind them. */}
                    <button
                      type="button"
                      className="bfp2__selectall"
                      onClick={() =>
                        setPicked(
                          full
                            ? picked.filter((x) => !rows.some((a) => a.id === x))
                            : [
                                ...new Set([
                                  ...picked,
                                  ...rows
                                    .filter((a) => !(reach === 'agentless' && a.needsAgent))
                                    .map((a) => a.id),
                                ]),
                              ],
                        )
                      }
                    >
                      {full ? 'Clear these' : 'Select all'}
                    </button>
                  </header>

                  <div className="bfp2__grid">
                    {rows.map((a) => {
                      const isOn = picked.includes(a.id)
                      /* Shown and refused, not hidden. "Why is TPM ID missing"
                         is a support ticket; a greyed row carrying its reason
                         is the answer to it. */
                      const blocked = reach === 'agentless' && Boolean(a.needsAgent)
                      const AIcon = ATTR_ICON[a.id] ?? Icon
                      return (
                        <button
                          key={a.id}
                          type="button"
                          aria-pressed={isOn}
                          disabled={blocked}
                          className={`bfp2__opt ${isOn ? 'is-on' : ''} ${blocked ? 'is-blocked' : ''}`}
                          /* The purpose is a tip rather than a second line. It
                             is worth having, but thirty-eight of them on the
                             page is a wall of prose in front of a choice you
                             make from the names. */
                          title={blocked ? `${a.name} — only an agent can read this` : a.purpose}
                          onClick={() => toggle(a.id)}
                        >
                          <span className="bfp2__optbox" aria-hidden>
                            <Check size={11} strokeWidth={3.2} />
                          </span>
                          {/* Falls back to the category's mark, so an attribute
                              added to the master without one still gets an icon
                              rather than a hole in the column. */}
                          <span className="bfp2__optico" aria-hidden>
                            <AIcon size={14} strokeWidth={1.8} />
                          </span>
                          <span className="bfp2__optname">{a.name}</span>
                          {/* Marked here rather than only on the inner page.
                              Whether a signal is collected at all is part of
                              deciding to include it, and learning it afterwards
                              is learning it too late. */}
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
                          <i className={`bfp2__pri is-${a.priority.toLowerCase()}`}>{a.priority}</i>
                        </button>
                      )
                    })}
                  </div>
                </section>
              )
            })
          )}
        </div>
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
      tolerance: 1,
      onMismatch: 'challenge',
      bands: { ...DEFAULT_BANDS },
      reach: 'agentless',
      registration: 'self',
      maxDevices: DEFAULT_MAX_DEVICES,
      roster: null,
      mobileRestriction: true,
      autoRegister: false,
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
              <span className={`bfp2__mode-ico is-${m.id}`} aria-hidden>
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
  const chosen = profile.enabled.map(byId).filter((a): a is Attribute => Boolean(a))
  const uses = rulesUsing('fingerprint', profile.id, policies)
  const users = policiesUsing('fingerprint', profile.id, policies)

  const setConfig = (id: string, v: string | number) =>
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
              {modeLabel(profile)} · {chosen.length} attribute{chosen.length === 1 ? '' : 's'} ·{' '}
              {uses === 0 ? 'not used by any rule' : `used by ${uses} rule${uses === 1 ? '' : 's'}`}
            </p>
          </div>
        </div>
      </header>

      {/* How it decides — the mode's own settings, and the section this screen
          was missing entirely.

          Choosing "Attribute based" on the create dialog used to promise a
          decision rule that nothing ever asked about: `tolerance` and
          `onMismatch` were written once at creation and had no control
          anywhere. Risk had half of one — the bands were editable, the
          per-attribute weights were not, so `weights` was a field the score
          read and no screen could write.

          Both now have a home, and it is a section rather than a step: a
          decision rule is something you come back to when the helpdesk calls,
          not something you pass through once. */}
      <div className="bfp2__panelhead bfp2__panelhead--page">
        <h3>How it decides</h3>
        <i className={`bfp2__modechip is-${profile.mode}`}>{modeLabel(profile)}</i>
      </div>
      <section className="bfp2__panel">
        {profile.mode === 'risk' ? (
          <RiskBands profile={profile} onChange={onChange} />
        ) : (
          <div className="bfp2__rows bfp2__rows--form">
            <FormRow
              icon={Sliders}
              label="Attributes that may drift"
              help={`Out of ${chosen.length} watched. Above this, the device stops counting as known.`}
            >
              <NumberStepper
                label="Attributes that may drift"
                value={Math.min(profile.tolerance, Math.max(chosen.length, 1))}
                min={0}
                max={Math.max(chosen.length, 1)}
                onChange={(tolerance) => onChange({ ...profile, tolerance })}
              />
            </FormRow>
            <FormRow
              icon={ShieldAlert}
              label="When more than that changes"
              help="What happens to a sign-in from a device that no longer matches."
            >
              <select
                className="bfp2__select"
                aria-label="When more than that changes"
                value={profile.onMismatch}
                onChange={(e) =>
                  onChange({ ...profile, onMismatch: e.target.value as 'deny' | 'challenge' | 'allow' })
                }
              >
                <option value="allow">Allow anyway</option>
                <option value="challenge">Challenge</option>
                <option value="deny">Deny</option>
              </select>
            </FormRow>
          </div>
        )}
      </section>

      {/* Device restriction — the console's own panel, and the half of this
          feature the screen never had.

          The attributes above decide whether this is the SAME device. These
          decide whether it is allowed to become a known one at all: what can be
          read, how a device gets registered, and how many a person may have.

          Behind a button rather than stacked on the page, and stepped rather
          than flat, because the six settings are not six independent choices —
          agentless cannot use a roster, and a roster replaces the per-person
          allowance rather than sitting beside it. Laid out flat, the page shows
          you controls that your earlier answers have already decided. Stepped,
          each question is only asked when it is still open. */}
      <div className="bfp2__panelhead bfp2__panelhead--page">
        <h3>Device restriction</h3>
        <Button variant="secondary" size="sm" onClick={() => setRestricting(true)}>
          <Sliders size={14} strokeWidth={2} aria-hidden />
          Configure
        </Button>
      </div>
      <section className="bfp2__panel">
        {/* The answers, in a sentence, so the page still states them without
            holding the controls that set them. */}
        <p className="bfp2__restsummary">
          <strong>{profile.reach === 'agent' ? 'Agent-based' : 'Agentless'}</strong>
          <span>·</span>
          <strong>{REGISTRATION_LABEL[profile.registration]}</strong>
          <span>·</span>
          <strong>
            {profile.registration === 'pre-approved'
              ? profile.roster
                ? `${profile.roster.rows} on the roster`
                : 'No roster uploaded'
              : `${profile.maxDevices ?? DEFAULT_MAX_DEVICES} device${(profile.maxDevices ?? DEFAULT_MAX_DEVICES) === 1 ? '' : 's'} per person`}
          </strong>
          {profile.autoRegister && (
            <>
              <span>·</span>
              <em>registers silently</em>
            </>
          )}
        </p>
      </section>

      <RestrictionModal
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
        CATEGORIES.map((c) => {
          const rows = chosen.filter((a) => a.category === c.id)
          if (rows.length === 0) return null
          const { tint, icon: Icon } = metaOf(c.id)
          return (
            <section key={c.id} className={`bfp2__panel bfp2__cat is-${tint}`}>
              {/* The same mark the picker used, so the group you configure
                  under is the group you chose under. The blurb stays here —
                  there is one per section on a full page, not five in a rail. */}
              <div className="bfp2__cathead">
                <Icon size={13} strokeWidth={2} aria-hidden />
                <h4>{c.label}</h4>
                <span>{rows.length}</span>
                <em>{c.blurb}</em>
              </div>

              <div className="bfp2__rows">
                {rows.map((a) => (
                  <div className="bfp2__attrow" key={a.id}>
                    <div className="bfp2__attmain">
                      <span className="bfp2__attname">
                        {a.name}
                        <i className={`bfp2__pri is-${a.priority.toLowerCase()}`}>{a.priority}</i>
                        {a.phase === 2 && <i className="bfp2__soon">Not collected yet</i>}
                      </span>
                      <span className="bfp2__attpurpose">{a.purpose}</span>
                    </div>

                    <div className="bfp2__attctl">
                      {a.config ? (
                        <AttrControl attr={a} profile={profile} onChange={setConfig} />
                      ) : (
                        profile.mode !== 'risk' && <span className="bfp2__nocfg">Nothing to tune</span>
                      )}
                      {/* Risk mode only, and the reason `weights` stopped being
                          dead code: the score read it and nothing could write
                          it, so every risk profile ran on master defaults. */}
                      {profile.mode === 'risk' && (
                        <WeightPick attr={a} profile={profile} onChange={setWeight} />
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
                ))}
              </div>
            </section>
          )
        })
      )}

      {/* Used by — the named list, not the count.

          Last on the page rather than first, because it is what you read before
          you leave, not before you edit. Every rule name is here because "which
          policy" is only half the answer: a profile referenced by one rule in a
          six-rule policy and a profile referenced by all six are different
          amounts of danger wearing the same policy name. */}
      <div className="bfp2__panelhead bfp2__panelhead--page">
        <h3>Used by</h3>
        <span className="bfp2__usecount">
          {uses === 0 ? 'nothing' : `${uses} rule${uses === 1 ? '' : 's'}`}
        </span>
      </div>

      {users.length === 0 ? (
        <p className="bfp2__none">
          No rule references this profile. It can be changed or deleted without affecting any sign-in.
        </p>
      ) : (
        <section className="bfp2__panel">
          <ul className="bfp2__uses">
            {users.map((u) => (
              <li key={u.policy.id}>
                <strong>{u.policy.name}</strong>
                <span>{u.rules.join(' · ')}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

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

/* The bands, on one line.

   The ceiling is the number that keeps them honest: if every attribute in the
   profile changed at once, that is the highest score reachable. Set a band
   above it and the band can never fire — configured-looking and inert. */
function RiskBands({
  profile,
  onChange,
}: {
  profile: FingerprintProfile
  onChange: (p: FingerprintProfile) => void
}) {
  const ceiling = ceilingOf(profile)
  const dead =
    profile.bands.challenge >= ceiling
      ? 'Deny'
      : profile.bands.allow >= ceiling
        ? 'Challenge and Deny'
        : null

  const band = (key: 'allow' | 'challenge', label: string) => (
    <label className="bfp2__band">
      <span>{label}</span>
      <input
        type="number"
        min={0}
        max={100}
        value={profile.bands[key]}
        aria-label={label}
        onChange={(e) =>
          onChange({ ...profile, bands: { ...profile.bands, [key]: Number(e.target.value) } })
        }
      />
    </label>
  )

  return (
    <section className={`bfp2__bands ${dead ? 'is-warn' : ''}`} aria-label="Score bands">
      {band('allow', 'Allow below')}
      <span className="bfp2__bandsep" aria-hidden />
      {band('challenge', 'Challenge below')}
      <span className="bfp2__bandsep" aria-hidden />
      <span className="bfp2__bandnote">
        {dead ? (
          <>
            <AlertTriangle size={13} strokeWidth={2} aria-hidden />
            <strong>{dead} can never fire.</strong> Everything changing at once scores {ceiling}.
          </>
        ) : (
          <>Everything changing at once scores {ceiling} of 100. Above {profile.bands.challenge}, deny.</>
        )}
      </span>
    </section>
  )
}

function AttrControl({
  attr,
  profile,
  onChange,
}: {
  attr: Attribute
  profile: FingerprintProfile
  onChange: (id: string, v: string | number) => void
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

  /* A list is edited on the inner page, but not in a row this narrow — it gets
     the count and opens where there is room. Kept honest: the count is the
     real length, not a placeholder. */
  return <span className="bfp2__nocfg">{c.values.length} entries</span>
}

/* Re-picking the set, on the same picker step two uses — same decision, same
   surface, so it gets the same width to make it in. */
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
const WEIGHTS = [5, 10, 20, 30]

function WeightPick({
  attr,
  profile,
  onChange,
}: {
  attr: Attribute
  profile: FingerprintProfile
  onChange: (id: string, w: number) => void
}) {
  const value = profile.weights[attr.id] ?? attr.weight
  return (
    <label className="bfp2__weight">
      <span>Weight</span>
      <select
        value={value}
        aria-label={`${attr.name} weight`}
        onChange={(e) => onChange(attr.id, Number(e.target.value))}
      >
        {WEIGHTS.map((w) => (
          <option key={w} value={w}>
            {w}
          </option>
        ))}
      </select>
    </label>
  )
}

/* Device restriction: what can be read, and how a device becomes a known one. */
/* --- Device restriction, as three questions ------------------------------------

   The order is the dependency order, which is the only order that works:

     1  what it can READ      agentless or agent — decides whether a roster is
                              even possible, since a roster matches on MAC and
                              MAC is agent-only
     2  how a device REGISTERS  self-service or a roster — decides whether the
                              next question is a number or a file
     3  the LIMIT             a per-person allowance, or the roster itself

   Flat, the panel showed all six at once and greyed the ones your earlier
   answers had ruled out. Stepped, they are simply not asked. */
function RestrictionModal({
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
  const [step, setStep] = useState<1 | 2 | 3>(1)

  useEffect(() => {
    if (open) setStep(1)
  }, [open])

  const STEPS = ['What it can read', 'How devices register', 'How many, and which'] as const

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Device restriction"
      width={640}
      footer={
        <>
          <span className="bfp2__footnote">
            Step {step} of 3 — {STEPS[step - 1]}
          </span>
          {step > 1 && (
            <Button variant="ghost" onClick={() => setStep((n) => (n - 1) as 1 | 2)}>
              Back
            </Button>
          )}
          {step < 3 ? (
            <Button variant="brand" onClick={() => setStep((n) => (n + 1) as 2 | 3)}>
              Next
            </Button>
          ) : (
            /* Done, not Save. Every control here writes through onChange as it
               is touched, the same as the rest of this page — so there is
               nothing held back to commit, and a Save button would imply there
               was. */
            <Button variant="brand" onClick={onClose}>
              Done
            </Button>
          )}
        </>
      }
    >
      <ol className="bfp2__steps" aria-label="Device restriction steps">
        {STEPS.map((label, i) => (
          <li key={label} className={i + 1 === step ? 'is-on' : i + 1 < step ? 'is-done' : ''}>
            <span aria-hidden>{i + 1 < step ? <Check size={11} strokeWidth={3} /> : i + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      <RestrictionSection profile={profile} onChange={onChange} step={step} />
    </Modal>
  )
}

function RestrictionSection({
  profile,
  onChange,
  step,
}: {
  profile: FingerprintProfile
  onChange: (p: FingerprintProfile) => void
  step: 1 | 2 | 3
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

  if (step === 1)
    return (
      <>
        <p className="bfp2__stephint">
          Hardware identifiers need something installed on the machine. This decides which
          attributes can arrive at all, so it is asked first.
        </p>
      <fieldset className="bfp2__modes">
        <legend>What it can read</legend>
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
      </>
    )

  // --- step 2: how a device gets registered ---------------------------------
  if (step === 2)
    return (
      <>
        <p className="bfp2__stephint">
          {rosterPossible
            ? 'Either people enrol their own machines, or you supply the list. A roster is matched on MAC address, which only the agent can read — so it is offered here because you chose agent-based.'
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
          /* Worth stating rather than leaving to be discovered: the convenience
             and the hole it opens are the same sentence. */
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
      </>
    )

  // --- step 3: the limit, whichever kind this turned out to be --------------
  return (
    <>
      <p className="bfp2__stephint">
        {profile.registration === 'self'
          ? 'The allowance, and whether phones count against it.'
          : 'The roster replaces the per-person allowance rather than sitting beside it.'}
      </p>
      <div className="bfp2__rows bfp2__rows--form">
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

        <FormRow
          icon={Smartphone}
          label="Include phones and tablets"
          help="Holds mobile devices to this profile as well as computers."
        >
          <Toggle
            checked={profile.mobileRestriction}
            onChange={(mobileRestriction) => onChange({ ...profile, mobileRestriction })}
            label="Include phones and tablets"
            size="sm"
          />
        </FormRow>

      </div>
    </>
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
