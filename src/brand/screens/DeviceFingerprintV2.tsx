import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
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
  ChevronRight,
  CircuitBoard,
  Clock,
  Cpu,
  Database,
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

import { Button, Modal } from '../kit'
import {
  ATTRIBUTES,
  CATEGORIES,
  DEFAULT_BANDS,
  byId,
  ceilingOf,
  modeLabel,
  type Attribute,
  type FingerprintProfile,
  type ProfileMode,
} from '../fingerprint'
import { useBrand } from '../store'
import type { Policy } from '../data'

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
}: {
  profiles: FingerprintProfile[]
  policies: Policy[]
  onOpen: (id: string) => void
  onCreate: () => void
}) {
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
        <div className="bfp2__empty">
          <span className="bfp2__empty-ico" aria-hidden>
            <ShieldCheck size={26} strokeWidth={1.6} />
          </span>
          <h2>No profiles yet</h2>
          <p>
            A fingerprint profile decides which signals identify a device — hardware, browser,
            network — and whether a change is worth challenging. Nothing is watched until one
            exists.
          </p>
          <Button variant="brand" onClick={onCreate}>
            <Plus size={15} strokeWidth={2.2} aria-hidden />
            Create your first profile
          </Button>
        </div>
      ) : (
        <div className="bfp2__table" role="table">
            <div className="bfp2__trow bfp2__thead" role="row">
              <span role="columnheader" />
              <span role="columnheader">Profile</span>
              <span role="columnheader">Decides by</span>
              <span role="columnheader">Attributes</span>
              <span role="columnheader">Used by</span>
            </div>
            {profiles.map((p) => {
              const uses = rulesUsing(p.id, policies)
              return (
              <div className="bfp2__trow" role="row" key={p.id}>
                <span role="cell" className={`bfp2__tile bfp2__tile--sm is-${p.mode}`} aria-hidden>
                  {p.mode === 'risk' ? (
                    <Gauge size={13} strokeWidth={1.9} />
                  ) : (
                    <Sliders size={13} strokeWidth={1.9} />
                  )}
                </span>
                <span role="cell">
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
  Browser: { tint: 'teal', icon: Globe },
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
}: {
  picked: string[]
  setPicked: (ids: string[]) => void
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
                            : [...new Set([...picked, ...rows.map((a) => a.id)])],
                        )
                      }
                    >
                      {full ? 'Clear these' : 'Select all'}
                    </button>
                  </header>

                  <div className="bfp2__grid">
                    {rows.map((a) => {
                      const isOn = picked.includes(a.id)
                      const AIcon = ATTR_ICON[a.id] ?? Icon
                      return (
                        <button
                          key={a.id}
                          type="button"
                          aria-pressed={isOn}
                          className={`bfp2__opt ${isOn ? 'is-on' : ''}`}
                          /* The purpose is a tip rather than a second line. It
                             is worth having, but thirty-eight of them on the
                             page is a wall of prose in front of a choice you
                             make from the names. */
                          title={a.purpose}
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
     ticked is not a profile either — it would watch no signals and every device
     would look identical to every other. One requirement per step, which is
     also why the step boundary is where it is. */
  const named = name.trim().length > 0
  const canSave = named && picked.length > 0

  const save = () => {
    if (!canSave) return
    onCreate({
      id: `fp-${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${picked.length}`,
      name: name.trim(),
      mode,
      enabled: picked,
      /* Empty on purpose. Configuration is the inner page's job, and seeding
         overrides here would mean the detail page opens showing values nobody
         chose, which is indistinguishable from values somebody did. */
      config: {},
      weights: {},
      tolerance: 1,
      onMismatch: 'challenge',
      bands: { ...DEFAULT_BANDS },
      usedIn: 0,
    })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create a device profile"
      width={step === 1 ? 620 : 1000}
      footer={
        step === 1 ? (
          <>
            <span className="bfp2__stepcrumb">Step 1 of 2</span>
            <span className="bfp2__footnote">
              {named ? 'Attributes next.' : 'Name the profile to continue.'}
            </span>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="brand" disabled={!named} onClick={() => setStep(2)}>
              Continue
              <ChevronRight size={15} strokeWidth={2.2} aria-hidden />
            </Button>
          </>
        ) : (
          <>
            <span className="bfp2__stepcrumb">Step 2 of 2</span>
            <span className="bfp2__footnote">
              {picked.length === 0
                ? 'Pick at least one attribute.'
                : `${picked.length} attribute${
                    picked.length === 1 ? '' : 's'
                  } selected — you will configure them next.`}
            </span>
            <Button variant="ghost" onClick={() => setStep(1)}>
              <ArrowLeft size={15} strokeWidth={2.2} aria-hidden />
              Back
            </Button>
            <Button variant="brand" disabled={!canSave} onClick={save}>
              Create and configure
            </Button>
          </>
        )
      }
    >
      <AnimatePresence mode="wait">
        {step === 1 ? (
          <motion.div
            key="step1"
            className="bfp2__form"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.14 }}
          >
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
          </motion.div>
        ) : (
          <motion.div
            key="step2"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ duration: 0.14 }}
          >
            <AttrPicker picked={picked} setPicked={setPicked} />
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
  )
}

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
  const chosen = profile.enabled.map(byId).filter((a): a is Attribute => Boolean(a))
  const uses = rulesUsing(profile.id, policies)
  const users = policiesUsing(profile.id, policies)

  const setConfig = (id: string, v: string | number) =>
    onChange({ ...profile, config: { ...profile.config, [id]: v } })

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

      {/* Risk mode only, and a strip rather than the panel it used to be.

          The match-mode equivalent was removed — its tolerance and outcome are
          two fields and did not earn a panel above the thing you came to edit.
          The bands did not go with it, because they are not settings ABOUT the
          attributes, they are what the attributes ADD UP TO: with no bands a
          score means nothing. So they stay, laid out along one line so they
          frame the list below rather than competing with it. */}
      {profile.mode === 'risk' && <RiskBands profile={profile} onChange={onChange} />}

      {/* Grouped by category, not one flat list.

          Seven rows was survivable; a profile with twenty is a scroll with no
          landmarks, and the categories are the landmarks the picker already
          taught you. Same five tints, same order — so the page you configure on
          is organised the way the page you chose on was. */}
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
      <AttrPicker picked={picked} setPicked={setPicked} />
    </Modal>
  )
}

/* --- Helpers -------------------------------------------------------------------- */


/* Which policies name this profile, and which of their rules do.

   Zones got this right and fingerprints did not: the profile page said "used by
   3 rules" and stopped, which tells an admin that a change is dangerous without
   telling them where the danger is. Three is not actionable; three *named*
   policies are — you can go and read them before you save.

   The same shape as `policiesUsing` in ZonesFinal, deliberately, because these
   two pages answer the same question about two different shared objects and an
   admin should not have to learn the answer twice. */
function policiesUsing(profileId: string, policies: Policy[]) {
  return policies
    .map((policy) => ({
      policy,
      rules: policy.rules
        .filter((r) => r.conditions.some((c) => c.typeId === 'fingerprint' && c.values.includes(profileId)))
        .map((r) => r.name),
    }))
    .filter((x) => x.rules.length > 0)
}

function rulesUsing(profileId: string, policies: Policy[]): number {
  return policies.reduce(
    (n, p) =>
      n +
      p.rules.filter((r) =>
        r.conditions.some((c) => c.typeId === 'fingerprint' && c.values.includes(profileId)),
      ).length,
    0,
  )
}
