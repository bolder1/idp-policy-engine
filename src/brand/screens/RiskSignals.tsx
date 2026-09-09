import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  AppWindow,
  ArrowLeft,
  Bug,
  Copy,
  Crosshair,
  Eye,
  FileWarning,
  House,
  Info,
  MonitorSmartphone,
  Pencil,
  Plus,
  Puzzle,
  Route,
  Search,
  Server,
  ShieldOff,
  Smartphone,
  Trash2,
  Unlock,
  Waypoints,
  Wrench,
  type LucideIcon,
} from 'lucide-react'

import { PageHead } from '../Shell'
import { Badge, Button, MenuButton, Modal, SaveBar, Toggle } from '../kit'
import { Picker } from '../picker'
import { TierPick } from '../tier-pick'
import { PlatformMark } from '../logos/PlatformMark'
import { useBrand } from '../store'
import {
  EMPTY_RISK_PROFILE,
  PLATFORMS,
  RISK_SIGNALS,
  SIGNAL_CATEGORIES,
  blankRiskProfile,
  countOn,
  isOn,
  riskScale,
  tierFor,
  tierKey,
  type RiskProfile,
  type RiskSignal,
  type RiskTuning,
} from '../risk-signals'

import './risk-signals.css'

/* A mark per signal, tinted by the family it belongs to.

   Two jobs, and the second is the one that earns it. A distinct glyph makes a
   row recognisable in a table of sixteen that are all one sentence of grey text
   under one name of dark text — but a glyph alone is decoration. The TONE
   carries the category, which matters precisely when the category heading is
   not on screen: searching flattens the list, and until now the only thing
   saying which family a hit came from was a 10px line of muted text under the
   sentence.

   Never `negative`. Red means danger in this kit, and every one of these
   signals is about danger — if they were all red the tone would carry nothing,
   and the two that genuinely warrant alarm (a rooted handset, a known attack
   source) would stop standing out. The severity is the weight column's job.

   Sixteen distinct glyphs, and the distinctness is the point rather than a
   flourish. The first pass reused one for both emulator and simulator, one for
   both rooted and jailbroken, and one for both VPN and residential proxy —
   three pairs that a reader scanning the column would have taken for the same
   thing twice. Those are exactly the pairs worth telling apart: they differ by
   platform, and the platform is the next column along. */
const SIGNAL_ICON: Record<string, LucideIcon> = {
  // Device integrity — the handset is not what it claims to be.
  emulator: MonitorSmartphone, // a handset drawn on a desktop
  simulator: AppWindow, // Xcode's window
  rooted: Unlock,
  jailbroken: ShieldOff,
  cloned: Copy,
  'dev-mode': Wrench,

  // Instrumentation — something is interfering with the running app.
  hooking: Puzzle, // a piece slotted into the app as it runs
  debugger: Bug,
  'tampered-request': FileWarning,
  mitm: Eye, // something is reading the traffic

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

   This was ONE weighting for the whole tenant, edited in place on a single
   page. It is a library now: a table, a create flow, and an inner page per
   profile. The shape is the one Zones and Device profiles already use, which is
   most of the argument for it — three libraries in one console that are browsed
   three different ways is three things to learn.

   The thing that makes any of this a settings screen rather than a decoration
   is the scale. `device-risk` — "Risk score above 60" — is the one condition in
   the product that compares a rule's threshold against a number, and that
   number comes from here. So the strip on the inner page is not a summary of
   the page, it is the page's output, and it moves while you edit.

   Which forces the one decision a library creates: with several profiles,
   something has to say which one the evaluator reads. Exactly one is IN USE,
   and the rest are alternatives somebody is drafting. The reasoning for that
   rather than per-rule references is on `activeRiskProfileId` in the store.
   -------------------------------------------------------------------------- */

const ALL = 'All'

export function RiskSignals() {
  const store = useBrand()
  const [openId, setOpenId] = useState<string | null>(null)
  const [naming, setNaming] = useState(false)
  const open = openId ? (store.riskProfiles.find((p) => p.id === openId) ?? null) : null

  const create = (name: string) => {
    const id = `rp-${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'profile'}-${store.riskProfiles.length}`
    store.addRiskProfile(blankRiskProfile(name.trim(), id))
    setNaming(false)
    /* Straight inside, the way creating a zone lands you in the zone. A profile
       that has been named and not tuned is not finished, and the list is where
       you go to compare finished things. */
    setOpenId(id)
  }

  const duplicate = (p: RiskProfile, open = false) => {
    const copy: RiskProfile = {
      ...p,
      id: `rp-${p.id}-copy-${store.riskProfiles.length}`,
      name: `${p.name} (copy)`,
      /* Copied, not aliased. The shallow spread left both rows pointing at one
         `off` array and one `tiers` object — nothing writes through the alias
         today because every writer replaces rather than mutates, which is a
         property of the current code and not of the data. */
      off: [...p.off],
      tiers: { ...p.tiers },
    }
    store.addRiskProfile(copy)
    store.showToast(`${copy.name} created`)
    if (open) setOpenId(copy.id)
  }

  const remove = (p: RiskProfile) => {
    store.removeRiskProfile(p.id)
    store.showToast(`${p.name} deleted`)
  }

  return (
    <div className="bpage brs">
      {open ? (
        /* Keyed, and the key is load-bearing: the inner page holds a draft in
           `useState`, so opening a second profile without remounting would hand
           it a new prop while keeping the first one's unsaved edits. */
        <RiskProfileDetail
          key={open.id}
          profile={open}
          inUse={open.id === store.activeRiskProfileId}
          onBack={() => setOpenId(null)}
          onSave={(p) => {
            store.updateRiskProfile(p)
            store.showToast(`${p.name} saved`)
          }}
          onDuplicate={(p) => duplicate(p, true)}
          onDelete={(p) => {
            remove(p)
            setOpenId(null)
          }}
        />
      ) : (
        <RiskProfileList
          profiles={store.riskProfiles}
          activeId={store.activeRiskProfileId}
          onOpen={setOpenId}
          onCreate={() => setNaming(true)}
          onUse={(p) => {
            store.useRiskProfile(p.id)
            store.showToast(`Risk scores now come from ${p.name}`)
          }}
          onDuplicate={(p) => duplicate(p)}
          onDelete={remove}
        />
      )}

      <NameRiskProfileModal open={naming} onClose={() => setNaming(false)} onCreate={create} />
    </div>
  )
}

/* --- The list --------------------------------------------------------------

   Four columns, and the third is the one worth arguing for. A profile's name
   says what somebody meant by it and the signal count says how much it listens
   to, but neither answers the question you actually bring to this table, which
   is "what would switching to this DO to my rules". `High` is that answer: it
   is the number `Risk score above 60` is compared against, so a profile scoring
   High at 43 silently stops every rule with a threshold above 43 from firing.
   Putting it in the row means the consequence is visible before anybody opens
   anything. */
function RiskProfileList({
  profiles,
  activeId,
  onOpen,
  onCreate,
  onUse,
  onDuplicate,
  onDelete,
}: {
  profiles: RiskProfile[]
  activeId: string
  onOpen: (id: string) => void
  onCreate: () => void
  onUse: (p: RiskProfile) => void
  onDuplicate: (p: RiskProfile) => void
  onDelete: (p: RiskProfile) => void
}) {
  /* No `menuFor` state here, unlike the zones and policies tables.

     Those two draw their own popup and so have to track which row's is open;
     `MenuButton` owns that itself, closes on select, and closes on an outside
     click. Mirroring their bookkeeping would have been a second source of truth
     for a thing this component already knows. */
  return (
    <div>
      <PageHead
        title="Risk signal profiles"
        caption="What a suspicious sign-in is worth. One profile is in use; the rest are alternatives you can build and compare before switching."
        actions={
          <Button variant="brand" onClick={onCreate}>
            <Plus size={14} strokeWidth={2.2} aria-hidden />
            Create profile
          </Button>
        }
      />

      {/* Said once, plainly, rather than implied by a column of dashes. */}
      <p className="brs__gap">
        <Info size={13} strokeWidth={2} aria-hidden />
        <span>
          These signals come from the mobile SDKs. A sign-in from a browser carries none of them, so its risk verdict is
          whatever the rest of the policy decides — no profile here changes it.
        </span>
      </p>

      <div className="btable-wrap">
        <table className="btable">
          <thead>
            <tr>
              <th>Profile</th>
              <th>Listening to</th>
              <th>Scores High at</th>
              <th className="btable__right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => {
              const inUse = p.id === activeId
              const on = countOn(p)
              const scale = riskScale(p)
              return (
                <tr key={p.id}>
                  <td className="btable__primary">
                    <button type="button" className="btable__link" onClick={() => onOpen(p.id)}>
                      {p.name}
                    </button>
                    <span className="btable__marks">
                      {/* Not a status pill. "In use" is not a state this profile
                          is IN, it is a relationship between it and the tenant —
                          exactly one row can carry it, and that is the whole
                          information. */}
                      {inUse && <Badge tone="system">In use</Badge>}
                    </span>
                  </td>
                  <td>
                    {on} of {RISK_SIGNALS.length} signals
                    {p.off.length > 0 && <i className="brs__listoff"> · {p.off.length} off</i>}
                  </td>
                  {/* Tabular, because the whole point of the column is comparing
                      it down the table. */}
                  <td className="brs__listscore">{scale.High}</td>
                  <td className="btable__right" onClick={(e) => e.stopPropagation()}>
                    <MenuButton
                      iconOnly
                      size="sm"
                      align="end"
                      label={`Actions for ${p.name}`}
                      items={[
                        /* Absent on the row that already carries it, rather
                           than present and disabled: a menu item whose only
                           outcome is nothing happening is a menu item to read
                           and skip every time. */
                        ...(inUse ? [] : [{ id: 'use', label: 'Use this profile' }]),
                        { id: 'duplicate', label: 'Duplicate' },
                        /* The tenant must always have a scale, so the profile
                           producing it cannot be deleted. Withheld rather than
                           disabled for the same reason, and the row says why by
                           carrying the badge. */
                        ...(inUse ? [] : [{ id: 'delete', label: 'Delete', danger: true }]),
                      ]}
                      onSelect={(id) => {
                        if (id === 'use') onUse(p)
                        if (id === 'duplicate') onDuplicate(p)
                        if (id === 'delete') onDelete(p)
                      }}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* --- Naming a new one ------------------------------------------------------

   One question, then the profile. The same shape zones use, and for the same
   reason: a profile that exists is something you can tune, compare and throw
   away, and a wizard that asked about sixteen signals before creating anything
   would be asking them in the abstract. */
function NameRiskProfileModal({
  open,
  onClose,
  onCreate,
}: {
  open: boolean
  onClose: () => void
  onCreate: (name: string) => void
}) {
  const [name, setName] = useState('')
  useEffect(() => {
    if (open) setName('')
  }, [open])

  const ok = name.trim().length > 0

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
          <Button variant="brand" disabled={!ok} onClick={() => ok && onCreate(name)}>
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
            placeholder="Remote workforce"
            aria-label="Profile name"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && ok) onCreate(name)
            }}
          />
        </label>
        <p>
          It starts at the shipped weighting — every signal on, nothing retuned — and changes nothing until you put it
          in use.
        </p>
      </div>
    </Modal>
  )
}

/* --- The inner page --------------------------------------------------------

   The page this screen used to be, now scoped to one profile and committing
   through a draft rather than writing as it is touched.

   The draft is what the brief asked for and it is also right for this screen
   specifically: every control here moves the scale, and the scale is what every
   `Risk score` condition in the tenant compares against. Live write-through
   meant sixteen toggles were sixteen re-gradings of every rule in the product,
   each one of them a state somebody could stop at. A draft makes the whole
   re-weighting one act.

   It only bites when the profile is IN USE, which is why the strip says so. */
function RiskProfileDetail({
  profile,
  inUse,
  onBack,
  onSave,
  onDuplicate,
  onDelete,
}: {
  profile: RiskProfile
  inUse: boolean
  onBack: () => void
  onSave: (p: RiskProfile) => void
  onDuplicate: (p: RiskProfile) => void
  onDelete: (p: RiskProfile) => void
}) {
  const [draft, setDraft] = useState<RiskProfile>(profile)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<string>(ALL)
  const [deleting, setDeleting] = useState(false)

  const dirty = JSON.stringify(draft) !== JSON.stringify(profile)

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase()
    return RISK_SIGNALS.filter((s) => {
      if (cat !== ALL && s.category !== cat) return false
      if (!n) return true
      /* Searching leaves the category behind, the same way the condition
         catalogue's does: a query that matches nothing in the selected
         category would otherwise show an empty pane with the answer one click
         away. */
      return `${s.name} ${s.purpose} ${s.category}`.toLowerCase().includes(n)
    })
  }, [q, cat])

  const toggle = (s: RiskSignal, on: boolean) =>
    setDraft((d) => ({ ...d, off: on ? d.off.filter((id) => id !== s.id) : [...d.off, s.id] }))

  const setTier = (s: RiskSignal, p: 'android' | 'ios', t: RiskSignal['tier']) =>
    setDraft((d) => ({ ...d, tiers: { ...d.tiers, [tierKey(s.id, p)]: t } }))

  const touched = draft.off.length > 0 || Object.keys(draft.tiers).length > 0
  const onCount = countOn(draft)
  const scale = riskScale(draft)
  const savedScale = riskScale(profile)

  return (
    <>
      <button type="button" className="bfp2__back" onClick={onBack}>
        <ArrowLeft size={14} strokeWidth={2} aria-hidden />
        All risk profiles
      </button>

      <header className="bfp2__head">
        <div className="bfp2__pagehead">
          <EditableProfileName value={draft.name} onChange={(name) => setDraft((d) => ({ ...d, name }))} />
          {inUse && <Badge tone="system">In use</Badge>}
        </div>

        <div className="bfp2__headacts">
          {/* Only once there is something to restore. A button that resets a
              profile nobody has changed is a button whose only outcome is
              nothing happening. */}
          {touched && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setDraft((d) => ({ ...d, ...EMPTY_RISK_PROFILE }))}
            >
              Restore shipped weights
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => onDuplicate(draft)}>
            <Copy size={14} strokeWidth={1.9} aria-hidden />
            Duplicate
          </Button>
          {/* Withheld on the profile in use rather than disabled — deleting it
              would leave the evaluator with no scale, and the badge beside the
              name is what says why the action is not here. */}
          {!inUse && (
            <Button variant="secondary" size="sm" onClick={() => setDeleting(true)}>
              <Trash2 size={14} strokeWidth={1.9} aria-hidden />
              Delete
            </Button>
          )}
        </div>
      </header>

      {/* The output, not a summary.

          Three numbers a rule can be written against, recalculated as the page
          is edited. Somebody switching off half the catalogue should watch
          "High" fall while they do it — that is the consequence of the choice,
          and this is the only place in the product where it is visible.

          It also says whether anything is at stake. A profile in use is
          re-grading every rule in the tenant the moment this saves; one that is
          not is a draft nobody's sign-ins can feel yet, and conflating the two
          would make the page either alarmist or misleading depending on which
          sentence it picked. */}
      <div className="brs__scale" aria-live="polite">
        <div className="brs__scale__what">
          <b>What a risk verdict scores</b>
          <em>
            {inUse ? (
              <>
                Rules compare against these with <strong>Risk score</strong>, the one risk condition. {onCount} of{' '}
                {RISK_SIGNALS.length} signals on.
              </>
            ) : (
              <>
                What rules WOULD compare against, if this profile were in use. {onCount} of {RISK_SIGNALS.length}{' '}
                signals on.
              </>
            )}
          </em>
        </div>
        <dl className="brs__bands">
          {(['Low', 'Medium', 'High'] as const).map((b) => {
            const moved = dirty && scale[b] !== savedScale[b]
            return (
              <div key={b} className={`brs__band is-${b.toLowerCase()} ${moved ? 'is-moved' : ''}`}>
                <dt>{b}</dt>
                <dd>{scale[b]}</dd>
                {/* Where it was, while the change is unsaved. The band moving is
                    the consequence of the edit, and a number that has changed
                    with no record of what it changed FROM is a number you have
                    to remember to compare. */}
                {moved && <i className="brs__was">was {savedScale[b]}</i>}
              </div>
            )
          })}
        </dl>
      </div>

      <div className="btoolbar">
        <label className="brs__search">
          <Search size={14} strokeWidth={2} aria-hidden />
          <input
            type="search"
            value={q}
            placeholder="Search signals…"
            aria-label="Search risk signals"
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <Picker
          label="Filter by category"
          value={cat}
          options={[
            { value: ALL, label: 'All categories', meta: `${RISK_SIGNALS.length} signals` },
            ...SIGNAL_CATEGORIES.map((c) => {
              const n = RISK_SIGNALS.filter((s) => s.category === c).length
              return { value: c, label: c, meta: `${n} signal${n === 1 ? '' : 's'}` }
            }),
          ]}
          onChange={setCat}
        />
      </div>

      {shown.length === 0 ? (
        <p className="brs__none">No signal matches “{q.trim()}”.</p>
      ) : (
        <SignalTable items={shown} profile={draft} onToggle={toggle} onTier={setTier} />
      )}

      <SaveBar
        open={dirty}
        changes={riskChanges(profile, draft)}
        onDiscard={() => setDraft(profile)}
        onSave={() => onSave(draft)}
        /* A name is the one field here that cannot be empty: the list is a
           column of names, and a blank row is a row nobody can identify or
           get back to. */
        blocked={draft.name.trim().length === 0}
      />

      <Modal
        open={deleting}
        onClose={() => setDeleting(false)}
        title={`Delete ${profile.name}?`}
        width={440}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setDeleting(false)
                onDelete(profile)
              }}
            >
              Delete profile
            </Button>
          </>
        }
      >
        <p className="brs__confirm">
          It is not in use, so no rule is being scored against it today. Nothing else references a risk profile — the{' '}
          <strong>Risk score</strong> condition reads whichever profile is in use — so this changes no sign-in.
        </p>
      </Modal>
    </>
  )
}

/* What is unsaved, named rather than counted. Ordered as the page reads. */
function riskChanges(before: RiskProfile, after: RiskProfile): string[] {
  const parts: string[] = []
  if (before.name !== after.name) parts.push('name')

  const off = after.off.filter((id) => !before.off.includes(id)).length
  const on = before.off.filter((id) => !after.off.includes(id)).length
  if (off > 0) parts.push(`${off} switched off`)
  if (on > 0) parts.push(`${on} switched on`)

  const retuned = Object.keys({ ...before.tiers, ...after.tiers }).filter(
    (k) => before.tiers[k] !== after.tiers[k],
  ).length
  if (retuned > 0) parts.push(`${retuned} reweighted`)

  return parts.length > 0 ? parts : ['changes']
}

/* The name, edited where it is read — the same control the device profile page
   uses, and for the same reason: a card holding one text field below a heading
   that already shows the string is two renderings of one value. */
function EditableProfileName({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const before = useRef(value)

  useEffect(() => {
    if (!editing) return
    before.current = value
    input.current?.focus()
    input.current?.select()
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
      placeholder="Remote workforce"
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

/* Every signal, in one table.

   It was five, one per category, each with a heading carrying a count and its
   own repeated column header. That shape earns its keep when the sections are
   long enough that you lose the header scrolling; sixteen rows is not that, and
   the cost was paid on every read — four extra headings, five extra header
   rows, and the question "which block is Tor in" standing between somebody and
   the row they came for.

   The category is on the row instead, as a pill. It was already rendered there
   whenever a search flattened the list, which is the tell: the information was
   wanted per row, and the headings were how it got there when nothing had been
   typed. */
function SignalTable({
  items,
  profile,
  onToggle,
  onTier,
}: {
  items: RiskSignal[]
  profile: RiskTuning
  onToggle: (s: RiskSignal, on: boolean) => void
  onTier: (s: RiskSignal, p: 'android' | 'ios', t: RiskSignal['tier']) => void
}) {
  return (
    <div className="brs__table" role="table" aria-label="Risk signals">
      <div className="brs__row brs__row--head" role="row">
        <span role="columnheader">Signal</span>
        {/* Mapped from PLATFORMS, like the cells underneath, so a third
            platform cannot arrive as two columns of weights under one heading.
            The marks are the real ones — a row saying "Not collected" is
            answering a question about a PLATFORM, and the platform is quicker
            to recognise by its logo than to read. */}
        {PLATFORMS.map((p) => (
          <span role="columnheader" className="brs__col" key={p.id}>
            <PlatformMark platform={p.id} />
            {p.label}
          </span>
        ))}
        <span role="columnheader" className="brs__col brs__col--on">
          On
        </span>
      </div>

      {items.map((s) => {
        const live = isOn(profile, s.id)
        return (
          <div className={`brs__row ${live ? '' : 'is-off'}`} role="row" key={s.id}>
            <span className="brs__sig" role="cell">
              {/* Outside the text column, so the name and the sentence keep one
                  left edge down the whole table. Inside it, every row's text
                  would start wherever that row's glyph happened to end. */}
              <i className="brs__mark" aria-hidden>
                {(() => {
                  const Ico = signalIcon(s.id)
                  return <Ico size={15} strokeWidth={1.9} />
                })()}
              </i>
              <span className="brs__sigtext">
                <span className="brs__name">
                  <b>{s.name}</b>
                  {/* The heading, per row, in neutral.

                      It carried a hue per category, one of five, matched to the
                      mark on its left — and the argument for that was sound in
                      isolation: searching flattens the list, so once the
                      heading is off screen the tag is the only thing saying
                      which family a hit came from.

                      It does not survive the page. Sixteen rows times a tinted
                      glyph, a tinted tag and two tinted weight controls is four
                      coloured objects per row and five hues down the column,
                      and at that density a hue stops being a signal and becomes
                      the texture of the table. The tag still says the category —
                      in words, which is what it was always reading as. */}
                  <i className="brs__cat">{s.category}</i>
                </span>
                <em>{s.purpose}</em>
              </span>
            </span>

            {PLATFORMS.map((p) => (
              /* `data-label` feeds the narrow layout, where the header row is
                 hidden and each cell prints its own column name. The rule that
                 reads it has been in the stylesheet all along with nothing to
                 read — so under 900px both weight columns were unlabelled and
                 the two dropdowns sat in a row with nothing saying which was
                 Android and which was iOS. */
              <span className="brs__col" role="cell" data-label={p.label} key={p.id}>
                {s.on.includes(p.id) ? (
                  <TierPick value={tierFor(profile, s, p.id)} label={`${s.name} weight on ${p.label}`} onChange={(t) => onTier(s, p.id, t)} />
                ) : (
                  /* A dash, and the words moved to where they can still be
                     had.

                     This said "Not collected" in full, on the argument that a
                     dash is ambiguous between "off", "zero" and "not
                     collected" when only the third is true. The argument was
                     right about the ambiguity and wrong about the cost: two
                     words of grey text repeated down two columns sixteen rows
                     deep drew the eye to the cells that hold nothing, which is
                     the opposite of what a weights table is for. The signals
                     that DO collect are the content, and they were competing
                     with a sentence.

                     So the cell is a dash and the sentence survives as the
                     accessible name — hover it, or reach it with a screen
                     reader, and it still says which of the three it is. An em
                     dash rather than two hyphens, because that is the
                     character this console already uses for "nothing here"
                     wherever a cell has no value. */
                  <span className="bx-tiers--none" title={`Not collected on ${p.label}`}>
                    <span aria-hidden>—</span>
                    <span className="u-sr">Not collected</span>
                  </span>
                )}
              </span>
            ))}

            <span className="brs__col brs__col--on" role="cell">
              <Toggle checked={live} onChange={(v) => onToggle(s, v)} label={`${s.name} is ${live ? 'on' : 'off'}`} size="sm" />
            </span>
          </div>
        )
      })}
    </div>
  )
}
