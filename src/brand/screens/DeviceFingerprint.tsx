import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useMemo, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Copy,
  Cpu,
  Gauge,
  Globe,
  ListChecks,
  MousePointerClick,
  Plus,
  Search,
  ShieldCheck,
  Sliders,
  Trash2,
} from 'lucide-react'

import { Button, IconButton, Modal, Toggle, TipDot } from '../kit'
import { useBrand } from '../store'
import {
  ATTRIBUTES,
  CATEGORIES,
  DEFAULT_BANDS,
  bandOf,
  ceilingOf,
  scoreOf,
  unreachableBands,
  type AttrCategory,
  type Attribute,
  type FingerprintProfile,
  type ProfileMode,
} from '../fingerprint'

/* -----------------------------------------------------------------------------
   Device fingerprint.

   Renamed from "Device Posture", which described a different product. Posture
   asks whether a device is healthy — encrypted, patched, enrolled. This asks
   whether it is the *same device as last time*, by remembering attribute values
   and comparing them on the next sign-in. The old tab collected disk encryption
   and screen-lock timeouts; the spreadsheet behind this one collects BIOS UUIDs
   and canvas fingerprints. Two different questions wearing one name.

   The flow, and why it forks before anything else happens:

     New profile → pick how it decides → build it

   The two ways of deciding are not a setting inside one editor, because they do
   not share an editor. Attribute match has a tolerance and an outcome; risk
   score has weights, bands and a total. Presenting them as a toggle on one form
   would mean half the controls were always inert, and the choice would look
   reversible when in practice it is a rewrite. So it is a fork at creation —
   Heidi's two-card modal — and the builder that follows is the builder for the
   answer you gave.

   The attribute matrix is 15Five's grammar: a category heading, one row per
   attribute, the switch on the right, and a Configure control only on the rows
   that actually have something to configure. Rows without configuration do not
   get a disabled button — an affordance that is always there and never works
   teaches people to stop looking.
   -------------------------------------------------------------------------- */

const CAT_ICON: Record<AttrCategory, typeof Cpu> = {
  Hardware: Cpu,
  Browser: Globe,
  Security: ShieldCheck,
  Network: Globe,
  Behaviour: MousePointerClick,
}

const MODES: {
  id: ProfileMode
  name: string
  blurb: string
  icon: typeof ListChecks
  points: string[]
  recommended?: boolean
}[] = [
  {
    id: 'match',
    name: 'Attribute match',
    blurb: 'The attributes either still match or they do not.',
    icon: ListChecks,
    recommended: true,
    points: [
      'Pick the attributes that identify a device',
      'Set how many may drift before it counts as new',
      'One outcome when the tolerance is exceeded',
      'Explains in a sentence — no arithmetic',
    ],
  },
  {
    id: 'risk',
    name: 'Risk score',
    blurb: 'Every attribute carries a weight. Changes add up.',
    icon: Gauge,
    points: [
      'Each attribute has a weight from 5 to 30',
      'Changed attributes total a score out of 100',
      'Three bands: allow, challenge, deny',
      'More expressive, harder to reason about',
    ],
  },
]

export function DeviceFingerprint() {
  /* The profiles live in the store, not here: policy rules name them, so the
     linter and the simulator have to resolve one whether or not this page is
     mounted. Editing here is the same write the rest of the app reads. */
  const store = useBrand()
  const profiles = store.fingerprints
  const [openId, setOpenId] = useState<string | null>(null)
  const [choosing, setChoosing] = useState(false)
  const [q, setQ] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<FingerprintProfile | null>(null)

  const open = profiles.find((p) => p.id === openId) ?? null
  const list = profiles.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()))

  /* Counted off the rules rather than read from the record, for the reason the
     zones screen learned the hard way: a stored count and a real one disagree
     the moment somebody edits a rule, and the stored one is the liar. */
  const usage = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of profiles) {
      m.set(
        p.id,
        store.policies.filter((pol) =>
          pol.rules.some((r) => r.conditions.some((c) => c.typeId === 'fingerprint' && c.values.includes(p.id))),
        ).length,
      )
    }
    return m
  }, [profiles, store.policies])
  const uses = (id: string) => usage.get(id) ?? 0

  function create(mode: ProfileMode) {
    const p: FingerprintProfile = {
      id: `fp${Date.now()}`,
      name: mode === 'match' ? 'New match profile' : 'New risk profile',
      mode,
      /* Seeded with the strongest signals that actually collect today rather
         than with nothing. An empty profile is a profile that matches every
         device, which is the one starting point nobody wants. */
      enabled: mode === 'match' ? ['tpm', 'bios', 'motherboard'] : ['tpm', 'bios', 'ip', 'geo', 'browser'],
      config: {},
      weights: {},
      tolerance: mode === 'match' ? 1 : 2,
      onMismatch: 'challenge',
      bands: { ...DEFAULT_BANDS },
      usedIn: 0,
    }
    store.addFingerprint(p)
    setChoosing(false)
    setOpenId(p.id)
  }

  const save = (next: FingerprintProfile) => {
    store.updateFingerprint(next)
    store.showToast(`${next.name} saved`)
  }

  if (open) {
    return (
      <Builder
        profile={open}
        onBack={() => setOpenId(null)}
        onChange={save}
        onDelete={() => setConfirmDelete(open)}
      />
    )
  }

  return (
    <div className="bpage bfp">
      <header className="bfp__head">
        <div>
          <h1>Device fingerprint</h1>
          <p>
            Which attributes identify a device, and what happens when they stop matching. Policy rules reference these
            profiles by name.
          </p>
        </div>
        <Button variant="brand" onClick={() => setChoosing(true)}>
          <Plus size={15} strokeWidth={2.2} aria-hidden /> New profile
        </Button>
      </header>

      <div className="bfp__bar">
        <span className="bfp__search">
          <Search size={15} strokeWidth={1.9} aria-hidden />
          <input
            type="search"
            placeholder="Search profiles"
            aria-label="Search profiles"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </span>
        <span className="bfp__count">
          {list.length} profile{list.length === 1 ? '' : 's'}
        </span>
      </div>

      <ul className="bfp__rows">
        {list.map((p) => (
          <li key={p.id} className="bfp__row">
            <button type="button" className="bfp__rowmain" onClick={() => setOpenId(p.id)}>
              <span className={`bfp__mode is-${p.mode}`} aria-hidden>
                {p.mode === 'match' ? <ListChecks size={16} strokeWidth={1.8} /> : <Gauge size={16} strokeWidth={1.8} />}
              </span>
              <span className="bfp__rowname">
                {p.name}
                <em>{p.mode === 'match' ? 'Attribute match' : 'Risk score'}</em>
              </span>
              <span className="bfp__rowsum">{describe(p)}</span>
              <span className="bfp__rowuse">
                {uses(p.id) > 0 ? `${uses(p.id)} polic${uses(p.id) === 1 ? 'y' : 'ies'}` : '—'}
              </span>
            </button>
            <span className="bfp__rowacts">
              <IconButton
                icon={Copy}
                label="Duplicate"
                size="sm"
                tone="ghost"
                onClick={() => store.addFingerprint({ ...p, id: `fp${Date.now()}`, name: `${p.name} (copy)`, usedIn: 0 })}
              />
              <IconButton icon={Trash2} label="Delete" size="sm" tone="danger" onClick={() => setConfirmDelete(p)} />
            </span>
          </li>
        ))}
      </ul>

      {list.length === 0 && <p className="bfp__empty">No profile matches “{q}”.</p>}

      <ModeChooser open={choosing} onClose={() => setChoosing(false)} onPick={create} />

      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title={`Delete ${confirmDelete?.name ?? ''}?`}
        width={430}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (!confirmDelete) return
                store.removeFingerprint(confirmDelete.id)
                if (openId === confirmDelete.id) setOpenId(null)
                setConfirmDelete(null)
              }}
            >
              Delete profile
            </Button>
          </>
        }
      >
        <p className="bfp__confirm">
          {confirmDelete && uses(confirmDelete.id) > 0
            ? `${uses(confirmDelete.id)} polic${uses(confirmDelete.id) === 1 ? 'y' : 'ies'} reference this profile. Their conditions stop matching once it is gone.`
            : 'No policy references this profile, so nothing else changes.'}
        </p>
      </Modal>
    </div>
  )
}

/* --- The fork ----------------------------------------------------------------
   Two cards, a feature list each, one recommended, Continue below. The choice
   is made before the builder opens because the two builders are not the same
   builder — presenting it as a setting would make it look reversible. */

function ModeChooser({
  open,
  onClose,
  onPick,
}: {
  open: boolean
  onClose: () => void
  onPick: (m: ProfileMode) => void
}) {
  const [picked, setPicked] = useState<ProfileMode>('match')
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="How should this profile decide?"
      width={720}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="brand" iconRight={ArrowRight} onClick={() => onPick(picked)}>
            Continue
          </Button>
        </>
      }
    >
      <p className="bfp__choosesub">
        Both use the same attributes. They differ in what they do when one stops matching — and that difference is
        hard to change later, so it is asked first.
      </p>
      <div className="bfp__modes" role="radiogroup" aria-label="How this profile decides">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={picked === m.id}
            className={`bfp__modecard ${picked === m.id ? 'is-on' : ''}`}
            onClick={() => setPicked(m.id)}
          >
            {m.recommended && <span className="bfp__ribbon">Recommended</span>}
            <span className="bfp__modehead">
              <span className={`bfp__mode is-${m.id}`} aria-hidden>
                <m.icon size={17} strokeWidth={1.8} />
              </span>
              <strong>{m.name}</strong>
            </span>
            <em>{m.blurb}</em>
            <ul>
              {m.points.map((pt) => (
                <li key={pt}>
                  <Check size={12} strokeWidth={2.6} aria-hidden />
                  {pt}
                </li>
              ))}
            </ul>
          </button>
        ))}
      </div>
    </Modal>
  )
}

/* --- The builder -------------------------------------------------------------
   A page, not a drawer. Thirty-eight attributes across five categories is not a
   side-panel amount of content, and the outcome panel has to stay visible while
   you work down the list — which is what makes it sticky rather than a footer. */

function Builder({
  profile,
  onBack,
  onChange,
  onDelete,
}: {
  profile: FingerprintProfile
  onBack: () => void
  onChange: (p: FingerprintProfile) => void
  onDelete: () => void
}) {
  const reduce = useReducedMotion()
  const [draft, setDraft] = useState<FingerprintProfile>(profile)
  const [openCat, setOpenCat] = useState<AttrCategory | null>('Hardware')
  const [changed, setChanged] = useState<string[]>([])

  const set = (patch: Partial<FingerprintProfile>) => setDraft({ ...draft, ...patch })
  const dirty = JSON.stringify(profile) !== JSON.stringify(draft)
  const isRisk = draft.mode === 'risk'

  const toggle = (id: string) =>
    set({ enabled: draft.enabled.includes(id) ? draft.enabled.filter((x) => x !== id) : [...draft.enabled, id] })

  const score = scoreOf(draft, changed)
  const band = bandOf(draft, score)
  const dead = useMemo(() => (isRisk ? unreachableBands(draft) : []), [isRisk, draft])

  return (
    <div className="bpage bfp bfp--build">
      <header className="bfp__bhead">
        <IconButton icon={ArrowLeft} label="Back to profiles" tone="ghost" onClick={onBack} />
        <input
          className="bfp__bname"
          aria-label="Profile name"
          value={draft.name}
          onChange={(e) => set({ name: e.target.value })}
        />
        <span className={`bfp__pill is-${draft.mode}`}>
          {draft.mode === 'match' ? <ListChecks size={12} strokeWidth={2} /> : <Gauge size={12} strokeWidth={2} />}
          {draft.mode === 'match' ? 'Attribute match' : 'Risk score'}
        </span>
        <span className="bfp__bspace" />
        <IconButton icon={Trash2} label="Delete profile" size="sm" tone="danger" onClick={onDelete} />
        <Button variant="ghost" disabled={!dirty} onClick={() => setDraft(profile)}>
          Revert
        </Button>
        <Button variant="brand" disabled={!dirty} onClick={() => onChange(draft)}>
          Save profile
        </Button>
      </header>

      <div className="bfp__body">
        <main className="bfp__matrix">
          <div className="bfp__matrixhead">
            <h2>Attributes</h2>
            <p>
              {draft.enabled.length} of {ATTRIBUTES.length} on
            </p>
          </div>

          {CATEGORIES.map((c) => {
            const rows = ATTRIBUTES.filter((a) => a.category === c.id)
            const on = rows.filter((a) => draft.enabled.includes(a.id)).length
            const isOpen = openCat === c.id
            const Ico = CAT_ICON[c.id]
            return (
              <section key={c.id} className={`bfp__cat ${isOpen ? 'is-open' : ''}`}>
                <button
                  type="button"
                  className="bfp__cathead"
                  aria-expanded={isOpen}
                  onClick={() => setOpenCat(isOpen ? null : c.id)}
                >
                  <motion.span
                    className="bfp__chev"
                    aria-hidden
                    initial={false}
                    animate={{ rotate: isOpen ? 180 : 0 }}
                    transition={{ duration: reduce ? 0 : 0.18 }}
                  >
                    <ChevronDown size={15} strokeWidth={2} />
                  </motion.span>
                  <Ico size={15} strokeWidth={1.8} aria-hidden />
                  <strong>{c.label}</strong>
                  <em>{c.blurb}</em>
                  <span className={`bfp__catcount ${on > 0 ? 'is-on' : ''}`}>
                    {on}/{rows.length}
                  </span>
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: reduce ? 'auto' : 0, opacity: reduce ? 1 : 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: reduce ? 'auto' : 0, opacity: 0 }}
                      transition={{ duration: reduce ? 0 : 0.24, ease: [0.2, 0, 0, 1] }}
                      style={{ overflow: 'hidden' }}
                    >
                      <div className="bfp__attrs">
                        {rows.map((a) => (
                          <AttrRow
                            key={a.id}
                            attr={a}
                            on={draft.enabled.includes(a.id)}
                            isRisk={isRisk}
                            weight={draft.weights[a.id] ?? a.weight}
                            configValue={draft.config[a.id]}
                            simChanged={changed.includes(a.id)}
                            onToggle={() => toggle(a.id)}
                            onWeight={(w) => set({ weights: { ...draft.weights, [a.id]: w } })}
                            onConfig={(v) => set({ config: { ...draft.config, [a.id]: v } })}
                            onSim={() =>
                              setChanged((c2) => (c2.includes(a.id) ? c2.filter((x) => x !== a.id) : [...c2, a.id]))
                            }
                          />
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </section>
            )
          })}
        </main>

        <aside className="bfp__side">
          {isRisk ? (
            <RiskPanel
              draft={draft}
              set={set}
              score={score}
              band={band}
              changed={changed}
              dead={dead}
              onClear={() => setChanged([])}
              reduce={!!reduce}
            />
          ) : (
            <MatchPanel draft={draft} set={set} />
          )}
        </aside>
      </div>
    </div>
  )
}

/* One attribute. The switch is the row's job; Configure appears only where
   there is something to configure, and the weight only in risk mode. */
function AttrRow({
  attr,
  on,
  isRisk,
  weight,
  configValue,
  simChanged,
  onToggle,
  onWeight,
  onConfig,
  onSim,
}: {
  attr: Attribute
  on: boolean
  isRisk: boolean
  weight: number
  configValue?: string | number
  simChanged: boolean
  onToggle: () => void
  onWeight: (w: number) => void
  onConfig: (v: string | number) => void
  onSim: () => void
}) {
  const [showConfig, setShowConfig] = useState(false)
  const cfg = attr.config

  return (
    <div className={`bfp__attr ${on ? 'is-on' : ''}`}>
      <div className="bfp__attrmain">
        <span className="bfp__attrname">
          {attr.name}
          <TipDot text={attr.purpose} />
          {attr.phase === 2 && <i className="bfp__phase">Phase 2</i>}
        </span>

        <span className={`bfp__prio is-${attr.priority.toLowerCase()}`}>{attr.priority}</span>

        {isRisk ? (
          <label className="bfp__weight">
            <span className="u-sr-only">Weight for {attr.name}</span>
            <input
              type="number"
              min={0}
              max={50}
              value={weight}
              disabled={!on}
              onChange={(e) => onWeight(Number(e.target.value))}
            />
          </label>
        ) : (
          <span className="bfp__weight is-blank" aria-hidden />
        )}

        {cfg ? (
          <button
            type="button"
            className={`bfp__cfgbtn ${showConfig ? 'is-open' : ''}`}
            disabled={!on}
            aria-expanded={showConfig}
            onClick={() => setShowConfig((v) => !v)}
          >
            <Sliders size={13} strokeWidth={2} aria-hidden />
            Configure
          </button>
        ) : (
          /* No disabled button here. An affordance that is always present and
             never works teaches people to stop reading the column. */
          <span className="bfp__cfgblank" aria-hidden />
        )}

        {/* Risk mode gets a simulator: tick a row as "changed" and watch the
            score move. A weight model you cannot poke is a number people
            copy from the last profile. */}
        {isRisk && (
          <button
            type="button"
            className={`bfp__sim ${simChanged ? 'is-on' : ''}`}
            disabled={!on}
            aria-pressed={simChanged}
            onClick={onSim}
            title="Simulate this attribute changing"
          >
            {simChanged ? 'Changed' : 'Simulate'}
          </button>
        )}

        <Toggle checked={on} onChange={onToggle} label={attr.name} size="sm" />
      </div>

      <AnimatePresence initial={false}>
        {showConfig && cfg && on && (
          <motion.div
            className="bfp__cfg"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div className="bfp__cfginner">
              <span>{cfg.label}</span>
              {cfg.kind === 'choice' && (
                <div className="bfp__seg" role="radiogroup" aria-label={cfg.label}>
                  {cfg.options.map((o) => (
                    <button
                      key={o}
                      type="button"
                      role="radio"
                      aria-checked={(configValue ?? cfg.value) === o}
                      className={(configValue ?? cfg.value) === o ? 'is-on' : ''}
                      onClick={() => onConfig(o)}
                    >
                      {o}
                    </button>
                  ))}
                </div>
              )}
              {cfg.kind === 'tolerance' && (
                <span className="bfp__num">
                  <input
                    type="number"
                    min={cfg.min}
                    max={cfg.max}
                    value={Number(configValue ?? cfg.value)}
                    onChange={(e) => onConfig(Number(e.target.value))}
                  />
                  {cfg.unit}
                </span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* --- Outcome panels ----------------------------------------------------------
   The two modes differ here and nowhere else, which is the argument for having
   forked at creation: everything above this point is shared, and everything in
   here would have been half-disabled on a combined form. */

function MatchPanel({
  draft,
  set,
}: {
  draft: FingerprintProfile
  set: (p: Partial<FingerprintProfile>) => void
}) {
  const n = draft.enabled.length
  return (
    <div className="bfp__panel">
      <h3>
        <ListChecks size={15} strokeWidth={1.8} aria-hidden />
        When attributes stop matching
      </h3>

      <label className="bfp__ctl">
        <span>
          How many may drift
          <TipDot text="Attributes change for innocent reasons — a browser updates, a laptop moves to Wi-Fi. Zero tolerance on a wide profile challenges everybody every day." />
        </span>
        <span className="bfp__num">
          <input
            type="number"
            min={0}
            max={Math.max(0, n)}
            value={draft.tolerance}
            onChange={(e) => set({ tolerance: Number(e.target.value) })}
          />
          of {n}
        </span>
      </label>

      <label className="bfp__ctl">
        <span>Then</span>
        <div className="bfp__seg" role="radiogroup" aria-label="Outcome when the tolerance is exceeded">
          {(['allow', 'challenge', 'deny'] as const).map((o) => (
            <button
              key={o}
              type="button"
              role="radio"
              aria-checked={draft.onMismatch === o}
              className={draft.onMismatch === o ? 'is-on' : ''}
              onClick={() => set({ onMismatch: o })}
            >
              {o[0].toUpperCase() + o.slice(1)}
            </button>
          ))}
        </div>
      </label>

      <p className="bfp__sentence">{describe(draft)}</p>

      {draft.tolerance === 0 && n > 4 && (
        <p className="bfp__warn">
          Zero tolerance across {n} attributes will fire on ordinary things — a browser update alone changes two of
          them.
        </p>
      )}
    </div>
  )
}

function RiskPanel({
  draft,
  set,
  score,
  band,
  changed,
  dead,
  onClear,
  reduce,
}: {
  draft: FingerprintProfile
  set: (p: Partial<FingerprintProfile>) => void
  score: number
  band: 'allow' | 'challenge' | 'deny'
  changed: string[]
  dead: ('allow' | 'challenge' | 'deny')[]
  onClear: () => void
  reduce: boolean
}) {
  const ceiling = ceilingOf(draft)
  return (
    <div className="bfp__panel">
      <h3>
        <Gauge size={15} strokeWidth={1.8} aria-hidden />
        Score and bands
      </h3>

      {/* The simulator's readout. It is the only place the weight model becomes
          a number somebody can argue with. */}
      <div className={`bfp__score is-${band}`}>
        <motion.strong
          key={score}
          initial={{ scale: reduce ? 1 : 0.9, opacity: reduce ? 1 : 0.4 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 600, damping: 30 }}
        >
          {score}
        </motion.strong>
        <span>
          <b>{band === 'allow' ? 'Allow' : band === 'challenge' ? 'Challenge' : 'Deny'}</b>
          <em>
            {changed.length === 0
              ? `Nothing changed. Highest possible is ${ceiling}.`
              : `${changed.length} attribute${changed.length === 1 ? '' : 's'} changed, out of ${ceiling} possible.`}
          </em>
        </span>
        {changed.length > 0 && (
          <Button size="sm" variant="ghost" onClick={onClear}>
            Reset
          </Button>
        )}
      </div>

      <div className="bfp__track" aria-hidden>
        <span className="is-allow" style={{ width: `${draft.bands.allow}%` }} />
        <span className="is-challenge" style={{ width: `${draft.bands.challenge - draft.bands.allow}%` }} />
        <span className="is-deny" style={{ width: `${100 - draft.bands.challenge}%` }} />
        <motion.i
          className="bfp__marker"
          initial={false}
          animate={{ left: `${score}%` }}
          transition={{ type: reduce ? 'tween' : 'spring', stiffness: 500, damping: 34 }}
        />
      </div>

      <label className="bfp__ctl">
        <span>Allow up to</span>
        <span className="bfp__num">
          <input
            type="number"
            min={0}
            max={draft.bands.challenge - 1}
            value={draft.bands.allow}
            onChange={(e) => set({ bands: { ...draft.bands, allow: Number(e.target.value) } })}
          />
        </span>
      </label>
      <label className="bfp__ctl">
        <span>Challenge up to</span>
        <span className="bfp__num">
          <input
            type="number"
            min={draft.bands.allow + 1}
            max={100}
            value={draft.bands.challenge}
            onChange={(e) => set({ bands: { ...draft.bands, challenge: Number(e.target.value) } })}
          />
        </span>
      </label>
      <p className="bfp__hint">Anything above {draft.bands.challenge} is denied.</p>

      {dead.length > 0 && (
        <p className="bfp__warn">
          Even if every enabled attribute changed at once the score would only reach {ceiling}, so{' '}
          {dead.length === 2 ? 'the challenge and deny bands' : `the ${dead[0]} band`} can never be reached. Add weight
          or lower the threshold.
        </p>
      )}
    </div>
  )
}

/* One sentence for the list and the match panel. The rule this screen writes is
   simple enough to say out loud, and saying it is the cheapest review there
   is. */
function describe(p: FingerprintProfile): string {
  const n = p.enabled.length
  if (n === 0) return 'No attributes — matches every device'
  if (p.mode === 'risk') {
    return `${n} attribute${n === 1 ? '' : 's'} · allow ≤${p.bands.allow}, challenge ≤${p.bands.challenge}, then deny`
  }
  const verb = p.onMismatch === 'deny' ? 'deny' : p.onMismatch === 'allow' ? 'allow' : 'challenge'
  return p.tolerance === 0
    ? `${n} attribute${n === 1 ? '' : 's'} · any change and ${verb}`
    : `${n} attribute${n === 1 ? '' : 's'} · more than ${p.tolerance} change${p.tolerance === 1 ? '' : 's'} and ${verb}`
}
