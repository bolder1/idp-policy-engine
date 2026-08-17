import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  Check,
  CreditCard,
  Fingerprint,
  KeyRound,
  Layers,
  LifeBuoy,
  Search,
  Settings2,
  ShieldCheck,
  UserPlus,
  X,
  type LucideIcon,
} from 'lucide-react'

import { Button, Callout, Toggle, TipDot } from '../kit'
import {
  AUTH_METHODS,
  DEFAULT_METHOD_ID,
  METHOD_TIERS,
  methodBlocker,
  methodById,
  type AuthMethod,
  type MethodSetting,
  type MethodTier,
} from '../methods'
import { configFor } from '../method-config'
import { useBrand } from '../store'
import { ConfigureMethodDialog } from './method-forms'

/* -----------------------------------------------------------------------------
   Authentication methods, v6 — one catalogue and one inspector.

   The two screens before this one both filed the subject into tabs: Methods,
   Enrolment, Recovery, Hardware Tokens, and in ours also Method Sets. Five
   tabs, and the complaint that produced this version is the right one — those
   are not five topics. They are one lifecycle seen from five angles:

     a user ENROLS in a method, USES it, and RECOVERS when it fails,
     and a hardware method needs a physical thing before any of that.

   Tabs make that look like five unrelated screens, and they make the question
   the original consolidation set out to answer — "why can't this user pick
   Google Authenticator?" — take four of them and a guess.

   So: the method is the object, and everything else hangs off it.

   · **The left is one catalogue.** Methods grouped by assurance, then the sets
     that reference them, then the three tenant-wide surfaces as peers in the
     same list rather than as tabs above it. One place to point at.
   · **The right answers for whatever is selected.** For a method that means all
     four of its states in the order they have to be fixed, its own settings,
     and — new here — its REACH: which sets carry it, whether recovery leans on
     it, what balance it draws down. That is the question, answered on one
     surface.
   · **The figures are filters.** "9 never configured" is not a statistic to
     read and forget; clicking it shows the nine.

   Aesthetics are V5's — the figure strip, the enrolment split bar, the band
   blurbs, the strength chip. The depth is the current screen's: four states per
   method, per-method settings, the dependency blocking in recovery, the token
   inventory, the sets. Nothing was dropped to make the layout work.
   -------------------------------------------------------------------------- */

type Selection =
  | { kind: 'method'; id: string }
  | { kind: 'set'; id: string }
  | { kind: 'enrolment' }
  | { kind: 'recovery' }
  | { kind: 'tokens' }

type Filter = 'all' | 'live' | 'setup' | 'resistant'

const TIER_ICON: Record<MethodTier, LucideIcon> = {
  'Phishing-resistant': Fingerprint,
  'App-based': ShieldCheck,
  'Delivery-based': KeyRound,
  'Knowledge & tokens': CreditCard,
}

/* The tone each tier carries wherever it appears — the rail dot, the inspector
   crest, the split bar. Assurance is the thing being decided, so it is the
   thing that gets the colour. Never `negative`: a delivery-based factor is
   weaker than a passkey, not a danger. */
const TIER_TONE: Record<MethodTier, string> = {
  'Phishing-resistant': 'positive',
  'App-based': 'info',
  'Delivery-based': 'notice',
  'Knowledge & tokens': 'neutral',
}

export function AuthMethodsV6() {
  const store = useBrand()
  const reduce = useReducedMotion()

  const [methods, setMethods] = useState<AuthMethod[]>(AUTH_METHODS)
  const [defaultId, setDefaultId] = useState(DEFAULT_METHOD_ID)
  const [sel, setSel] = useState<Selection>({ kind: 'method', id: 'fido2' })
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [configuring, setConfiguring] = useState<AuthMethod | null>(null)
  const [banner, setBanner] = useState(true)

  const patch = (id: string, p: Partial<AuthMethod>) =>
    setMethods((all) => all.map((m) => (m.id === id ? { ...m, ...p } : m)))

  const live = methods.filter((m) => !methodBlocker(m))
  const enrolled = methods.reduce((n, m) => n + (m.enrolled ?? 0), 0)
  const resistant = live.filter((m) => m.tier === 'Phishing-resistant')
  const resistantShare = enrolled
    ? Math.round((resistant.reduce((n, m) => n + (m.enrolled ?? 0), 0) / enrolled) * 100)
    : 0
  const unconfigured = methods.filter((m) => !m.configured)

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return methods.filter((m) => {
      if (needle && !`${m.name} ${m.channel} ${m.tier}`.toLowerCase().includes(needle)) return false
      if (filter === 'live') return !methodBlocker(m)
      if (filter === 'setup') return !m.configured
      if (filter === 'resistant') return m.tier === 'Phishing-resistant'
      return true
    })
  }, [methods, q, filter])

  /* Three of these narrow the catalogue to the rows they counted. The fourth
     counts people rather than methods, so there is nothing for it to filter to
     — it is a figure, and it does not pretend to be a button. */
  const FIGURES: { id: Filter | null; label: string; value: string; sub?: string; tone?: string }[] = [
    { id: 'live', label: 'Available to users', value: `${live.length}`, sub: `of ${methods.length}` },
    { id: null, label: 'Enrolments', value: enrolled.toLocaleString() },
    { id: 'resistant', label: 'Phishing-resistant', value: `${resistantShare}`, sub: '%', tone: resistantShare < 50 ? 'warn' : 'good' },
    { id: 'setup', label: 'Never configured', value: `${unconfigured.length}`, tone: unconfigured.length ? 'warn' : 'good' },
  ]

  return (
    <div className="bpage ba6">
      {/* --- Head, and the figures that are also the filters ------------------ */}
      <header className="ba6__head">
        <div className="ba6__headtext">
          <h1>Authentication methods</h1>
          <p>What users can prove themselves with, how they get set up, and what happens when it fails.</p>
        </div>
        <Button variant="brand" onClick={() => store.showToast('Changes saved')}>
          Save changes
        </Button>
      </header>

      <div className="ba6__figures" role="group" aria-label="Filter the catalogue">
        {FIGURES.map((f) => {
          const id = f.id
          const body = (
            <>
              <span className="ba6__figlabel">{f.label}</span>
              <strong>
                {f.value}
                {f.sub && <em>{f.sub}</em>}
              </strong>
            </>
          )
          if (!id) {
            return (
              <div key={f.label} className={`ba6__fig is-static ${f.tone ? `is-${f.tone}` : ''}`}>
                {body}
              </div>
            )
          }
          return (
            <button
              key={f.label}
              type="button"
              aria-pressed={filter === id}
              className={`ba6__fig ${filter === id ? 'is-on' : ''} ${f.tone ? `is-${f.tone}` : ''}`}
              onClick={() => setFilter(filter === id ? 'all' : id)}
            >
              {body}
            </button>
          )
        })}
      </div>

      <AnimatePresence initial={false}>
        {banner && (
          <motion.div
            className="ba6__banner"
            initial={{ opacity: 0, height: reduce ? 'auto' : 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: reduce ? 'auto' : 0 }}
            transition={{ duration: reduce ? 0 : 0.18 }}
          >
            <span aria-hidden />
            <p>Everything enabled here is selectable in a policy rule. Enrolment counts are live.</p>
            <button type="button" onClick={() => store.go({ name: 'policies' })}>
              Open the policy builder →
            </button>
            <button type="button" className="ba6__bannerx" aria-label="Dismiss" onClick={() => setBanner(false)}>
              <X size={15} strokeWidth={1.8} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- The two panes --------------------------------------------------- */}
      <div className="ba6__work">
        <Rail
          methods={shown}
          total={methods.length}
          sel={sel}
          onSelect={setSel}
          q={q}
          onQ={setQ}
          filter={filter}
          onClearFilter={() => setFilter('all')}
          defaultId={defaultId}
        />

        <section className="ba6__panel" aria-live="polite">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={`${sel.kind}-${'id' in sel ? sel.id : ''}`}
              initial={{ opacity: 0, y: reduce ? 0 : 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduce ? 0 : -8 }}
              transition={{ duration: reduce ? 0 : 0.16, ease: [0.2, 0, 0, 1] }}
            >
              {sel.kind === 'method' && (
                <MethodPanel
                  method={methods.find((m) => m.id === sel.id) ?? methods[0]}
                  methods={methods}
                  isDefault={sel.id === defaultId}
                  onDefault={() => setDefaultId(sel.id)}
                  onPatch={patch}
                  onConfigure={setConfiguring}
                  onSelect={setSel}
                />
              )}
              {sel.kind === 'set' && <SetPanel id={sel.id} methods={methods} onSelect={setSel} />}
              {sel.kind === 'enrolment' && <EnrolmentPanel methods={methods} enrolled={enrolled} onSelect={setSel} />}
              {sel.kind === 'recovery' && <RecoveryPanel methods={methods} onSelect={setSel} />}
              {sel.kind === 'tokens' && <TokensPanel methods={methods} onSelect={setSel} />}
            </motion.div>
          </AnimatePresence>
        </section>
      </div>

      <ConfigureMethodDialog
        open={configuring !== null}
        method={configuring}
        onClose={() => setConfiguring(null)}
        onSave={(id, configured) => {
          patch(id, { configured })
          setConfiguring(null)
          store.showToast(`${methodById(id)?.name} configured`)
        }}
      />
    </div>
  )
}

/* --- The catalogue ---------------------------------------------------------- */

function Rail({
  methods,
  total,
  sel,
  onSelect,
  q,
  onQ,
  filter,
  onClearFilter,
  defaultId,
}: {
  methods: AuthMethod[]
  total: number
  sel: Selection
  onSelect: (s: Selection) => void
  q: string
  onQ: (v: string) => void
  filter: Filter
  onClearFilter: () => void
  defaultId: string
}) {
  const store = useBrand()

  const TENANT: { kind: Selection['kind']; label: string; sub: string; icon: LucideIcon }[] = [
    { kind: 'enrolment', label: 'Enrolment', sub: 'How users get set up', icon: UserPlus },
    { kind: 'recovery', label: 'Recovery', sub: 'When the factor fails', icon: LifeBuoy },
    { kind: 'tokens', label: 'Hardware tokens', sub: 'Physical inventory', icon: CreditCard },
  ]

  return (
    <nav className="ba6__rail" aria-label="Catalogue">
      <div className="ba6__search">
        <Search size={14} strokeWidth={1.9} aria-hidden />
        <input
          type="search"
          value={q}
          placeholder={`Search ${total} methods…`}
          aria-label="Search methods"
          onChange={(e) => onQ(e.target.value)}
        />
      </div>

      {filter !== 'all' && (
        <button type="button" className="ba6__filterclear" onClick={onClearFilter}>
          Filtered to {methods.length} · clear <X size={11} strokeWidth={2.4} aria-hidden />
        </button>
      )}

      <div className="ba6__raillist">
        {METHOD_TIERS.map((tier) => {
          const mine = methods.filter((m) => m.tier === tier.name)
          if (mine.length === 0) return null
          return (
            <div className="ba6__group" key={tier.name}>
              <h3>
                {tier.name}
                <TipDot text={tier.blurb} />
                <em>{mine.length}</em>
              </h3>
              {mine.map((m) => {
                const blocker = methodBlocker(m)
                const on = sel.kind === 'method' && sel.id === m.id
                const Ico = TIER_ICON[m.tier]
                return (
                  <button
                    key={m.id}
                    type="button"
                    className={`ba6__row ${on ? 'is-on' : ''} ${blocker ? 'is-off' : ''}`}
                    aria-current={on}
                    onClick={() => onSelect({ kind: 'method', id: m.id })}
                  >
                    <span className={`ba6__rowicon is-${TIER_TONE[m.tier]}`} aria-hidden>
                      <Ico size={14} strokeWidth={1.8} />
                    </span>
                    <span className="ba6__rowtext">
                      <strong>
                        {m.name}
                        {m.id === defaultId && <b className="ba6__default">Default</b>}
                      </strong>
                      <em>{blocker ?? `${(m.enrolled ?? 0).toLocaleString()} enrolled`}</em>
                    </span>
                    <span className={`ba6__pip ${blocker ? 'is-off' : 'is-live'}`} aria-hidden />
                  </button>
                )
              })}
            </div>
          )
        })}

        {methods.length === 0 && <p className="ba6__none">Nothing matches. Clear the filter or the search.</p>}

        {/* Sets and tenant rules are peers of the methods, not tabs above them —
            they are the same subject looked at from a different distance. */}
        <div className="ba6__group">
          <h3>
            Method sets
            <TipDot text="A named group of methods that a policy rule can reference by name. Editing the set changes every rule that uses it." />
            <em>{store.methodSets.length}</em>
          </h3>
          {store.methodSets.map((s) => {
            const on = sel.kind === 'set' && sel.id === s.id
            return (
              <button
                key={s.id}
                type="button"
                className={`ba6__row ${on ? 'is-on' : ''}`}
                aria-current={on}
                onClick={() => onSelect({ kind: 'set', id: s.id })}
              >
                <span className="ba6__rowicon is-accent" aria-hidden>
                  <Layers size={14} strokeWidth={1.8} />
                </span>
                <span className="ba6__rowtext">
                  <strong>{s.name}</strong>
                  <em>
                    {s.methods.length} method{s.methods.length === 1 ? '' : 's'} · used by {s.usedIn} rule
                    {s.usedIn === 1 ? '' : 's'}
                  </em>
                </span>
              </button>
            )
          })}
        </div>

        <div className="ba6__group">
          <h3>Tenant rules</h3>
          {TENANT.map((t) => {
            const on = sel.kind === t.kind
            return (
              <button
                key={t.kind}
                type="button"
                className={`ba6__row ${on ? 'is-on' : ''}`}
                aria-current={on}
                onClick={() => onSelect({ kind: t.kind } as Selection)}
              >
                <span className="ba6__rowicon is-neutral" aria-hidden>
                  <t.icon size={14} strokeWidth={1.8} />
                </span>
                <span className="ba6__rowtext">
                  <strong>{t.label}</strong>
                  <em>{t.sub}</em>
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </nav>
  )
}

/* Spreading over a discriminated union widens it — `{...toggle, value: 'x'}`
   type-checks as neither member. Narrowed per kind instead, so a select can
   never be handed a boolean. */
function setValue(all: MethodSetting[], id: string, value: boolean | string): MethodSetting[] {
  return all.map((x) => {
    if (x.id !== id) return x
    if (x.kind === 'toggle') return { ...x, value: Boolean(value) }
    return { ...x, value: String(value) }
  })
}

/* --- A method, answered in full --------------------------------------------- */

const LADDER: { key: keyof AuthMethod; label: string; blurb: string }[] = [
  { key: 'configured', label: 'Configured', blurb: 'Credentials or a provider are set up.' },
  { key: 'active', label: 'Switched on', blurb: 'Enabled for this tenant at all.' },
  { key: 'allowed', label: 'Offered to users', blurb: 'Users may select it while enrolling.' },
]

function MethodPanel({
  method: m,
  methods,
  isDefault,
  onDefault,
  onPatch,
  onConfigure,
  onSelect,
}: {
  method: AuthMethod
  methods: AuthMethod[]
  isDefault: boolean
  onDefault: () => void
  onPatch: (id: string, p: Partial<AuthMethod>) => void
  onConfigure: (m: AuthMethod) => void
  onSelect: (s: Selection) => void
}) {
  const store = useBrand()
  const blocker = methodBlocker(m)
  const Ico = TIER_ICON[m.tier]
  const hasForm = configFor(m.id) !== null

  /* The method's reach. This is the whole reason the tabs came down: a method
     is referenced from three other places, and none of them used to be visible
     from the method itself. */
  const inSets = store.methodSets.filter((s) => s.methods.includes(m.name))
  const recoveryRole = m.alsoRecovery === true
  const tierMates = methods.filter((x) => x.tier === m.tier && x.id !== m.id && !methodBlocker(x))

  return (
    <div className="ba6__detail">
      <header className="ba6__crest">
        <span className={`ba6__cresticon is-${TIER_TONE[m.tier]}`} aria-hidden>
          <Ico size={20} strokeWidth={1.7} />
        </span>
        <div>
          <h2>
            {m.name}
            {isDefault && <span className="ba6__badge is-brand">Default for new users</span>}
          </h2>
          <p>{m.description}</p>
          <span className="ba6__meta">
            {m.tier} · {m.channel}
          </span>
        </div>
      </header>

      {/* --- The four states, in the order they have to be fixed ------------- */}
      <section className="ba6__block">
        <h3 className="u-label">
          Readiness
          <TipDot text="Each step depends on the one before it. A method that is switched on but never configured cannot issue anything, which is why the order matters more than the four toggles do." />
        </h3>

        <ol className="ba6__ladder">
          {LADDER.map((step, i) => {
            const value = m[step.key] as boolean
            const prior = LADDER.slice(0, i).every((s) => m[s.key] as boolean)
            return (
              <li key={step.label} className={value ? 'is-done' : prior ? 'is-next' : 'is-blocked'}>
                <span className="ba6__ladmark" aria-hidden>
                  {value ? <Check size={12} strokeWidth={3} /> : i + 1}
                </span>
                <span className="ba6__ladtext">
                  <strong>{step.label}</strong>
                  <em>{step.blurb}</em>
                </span>
                {step.key === 'configured' && hasForm ? (
                  <Button size="sm" icon={Settings2} onClick={() => onConfigure(m)}>
                    {m.configured ? 'Edit' : 'Set up'}
                  </Button>
                ) : (
                  <Toggle
                    checked={value}
                    disabled={!prior}
                    label={`${step.label} — ${m.name}`}
                    onChange={(v) => onPatch(m.id, { [step.key]: v } as Partial<AuthMethod>)}
                  />
                )}
              </li>
            )
          })}
        </ol>

        {blocker && (
          <p className="ba6__warn">
            <AlertTriangle size={13} strokeWidth={2} aria-hidden />
            {blocker}. No policy rule can ask for this until it is resolved.
          </p>
        )}

        {!blocker && m.canBeDefault && !isDefault && (
          <div className="ba6__settle">
            <span>
              Can be assigned to new users before they enrol in anything.
            </span>
            <Button size="sm" onClick={onDefault}>
              Make it the default
            </Button>
          </div>
        )}
      </section>

      {/* --- Its own settings ------------------------------------------------ */}
      {m.settings && m.settings.length > 0 && (
        <section className="ba6__block">
          <h3 className="u-label">Settings</h3>
          <div className="ba6__settings">
            {m.settings.map((s) => (
              <div className="ba6__setting" key={s.id}>
                <div>
                  <p>{s.label}</p>
                  {s.help && <span>{s.help}</span>}
                </div>
                {s.kind === 'toggle' ? (
                  <Toggle
                    checked={s.value}
                    label={s.label}
                    onChange={(v) => onPatch(m.id, { settings: setValue(m.settings!, s.id, v) })}
                  />
                ) : (
                  <select
                    className="ba6__select"
                    aria-label={s.label}
                    value={s.value}
                    onChange={(e) => onPatch(m.id, { settings: setValue(m.settings!, s.id, e.target.value) })}
                  >
                    {s.options.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* --- Reach. The answer the five tabs used to hide. ------------------- */}
      <section className="ba6__block">
        <h3 className="u-label">
          Where this reaches
          <TipDot text="Everything that changes if you switch this method off. It used to take four tabs to find out." />
        </h3>

        <ul className="ba6__reach">
          <li>
            <span className="ba6__reachn">{(m.enrolled ?? 0).toLocaleString()}</span>
            <span>
              <strong>people have enrolled</strong>
              <em>{m.enrolled ? 'They lose this factor if it is switched off.' : 'Nobody is relying on it yet.'}</em>
            </span>
          </li>

          <li>
            <span className="ba6__reachn">{inSets.length}</span>
            <span>
              <strong>{inSets.length === 1 ? 'method set carries it' : 'method sets carry it'}</strong>
              <em>
                {inSets.length === 0 ? (
                  'No policy rule reaches it through a set.'
                ) : (
                  <>
                    {inSets.map((s, i) => (
                      <button key={s.id} type="button" className="ba6__link" onClick={() => onSelect({ kind: 'set', id: s.id })}>
                        {s.name}
                        {i < inSets.length - 1 ? ', ' : ''}
                      </button>
                    ))}
                  </>
                )}
              </em>
            </span>
          </li>

          {recoveryRole && (
            <li className="is-note">
              <span className="ba6__reachn" aria-hidden>
                <LifeBuoy size={15} strokeWidth={1.9} />
              </span>
              <span>
                <strong>Recovery leans on it</strong>
                <em>
                  Switching it off changes what happens when somebody loses their device.{' '}
                  <button type="button" className="ba6__link" onClick={() => onSelect({ kind: 'recovery' })}>
                    Open recovery
                  </button>
                </em>
              </span>
            </li>
          )}

          {m.balance && (
            <li className="is-note">
              <span className="ba6__reachn">{m.balance.remaining.toLocaleString()}</span>
              <span>
                <strong>{m.balance.label} remaining</strong>
                <em>This method draws down a purchased balance every time it sends.</em>
              </span>
            </li>
          )}

          {blocker && tierMates.length > 0 && (
            <li className="is-note">
              <span className="ba6__reachn" aria-hidden>
                <ShieldCheck size={15} strokeWidth={1.9} />
              </span>
              <span>
                <strong>{tierMates.length} other {m.tier.toLowerCase()} option{tierMates.length === 1 ? '' : 's'} are live</strong>
                <em>
                  {tierMates.map((x, i) => (
                    <button key={x.id} type="button" className="ba6__link" onClick={() => onSelect({ kind: 'method', id: x.id })}>
                      {x.name}
                      {i < tierMates.length - 1 ? ', ' : ''}
                    </button>
                  ))}
                </em>
              </span>
            </li>
          )}
        </ul>
      </section>
    </div>
  )
}

/* --- A set ------------------------------------------------------------------- */

function SetPanel({ id, methods, onSelect }: { id: string; methods: AuthMethod[]; onSelect: (s: Selection) => void }) {
  const store = useBrand()
  const set = store.methodSets.find((s) => s.id === id)
  if (!set) return null

  const members = set.methods.map((name) => methods.find((m) => m.name === name)).filter(Boolean) as AuthMethod[]
  const broken = members.filter((m) => methodBlocker(m))

  return (
    <div className="ba6__detail">
      <header className="ba6__crest">
        <span className="ba6__cresticon is-accent" aria-hidden>
          <Layers size={20} strokeWidth={1.7} />
        </span>
        <div>
          <h2>{set.name}</h2>
          <p>{set.description ?? 'A named group of methods a policy rule can ask for.'}</p>
          <span className="ba6__meta">
            Used by {set.usedIn} rule{set.usedIn === 1 ? '' : 's'}
          </span>
        </div>
      </header>

      {broken.length > 0 && (
        <Callout tone="notice" title={`${broken.length} of these cannot be used right now`}>
          A rule asking for this set falls back to whatever else it allows. Fix the member, or take it out of the
          set so the name stops promising something it cannot deliver.
        </Callout>
      )}

      <section className="ba6__block">
        <h3 className="u-label">Members</h3>
        <ul className="ba6__members">
          {members.map((m) => {
            const blocker = methodBlocker(m)
            const Ico = TIER_ICON[m.tier]
            return (
              <li key={m.id}>
                <button type="button" onClick={() => onSelect({ kind: 'method', id: m.id })}>
                  <span className={`ba6__rowicon is-${TIER_TONE[m.tier]}`} aria-hidden>
                    <Ico size={14} strokeWidth={1.8} />
                  </span>
                  <span className="ba6__rowtext">
                    <strong>{m.name}</strong>
                    <em>{blocker ?? `${m.tier} · ${(m.enrolled ?? 0).toLocaleString()} enrolled`}</em>
                  </span>
                  {blocker && <AlertTriangle size={14} strokeWidth={2} className="ba6__memberwarn" aria-hidden />}
                </button>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}

/* --- Enrolment ---------------------------------------------------------------- */

function EnrolmentPanel({
  methods,
  enrolled,
  onSelect,
}: {
  methods: AuthMethod[]
  enrolled: number
  onSelect: (s: Selection) => void
}) {
  const [enforce, setEnforce] = useState(true)
  const [grace, setGrace] = useState('7')
  const [userChoice, setUserChoice] = useState(false)
  const [instructions, setInstructions] = useState(true)

  const offered = methods.filter((m) => !methodBlocker(m))
  const withEnrolments = methods
    .filter((m) => (m.enrolled ?? 0) > 0)
    .sort((a, b) => (b.enrolled ?? 0) - (a.enrolled ?? 0))
  const top = withEnrolments.slice(0, 5)
  const rest = withEnrolments.slice(5)
  const restTotal = rest.reduce((n, m) => n + (m.enrolled ?? 0), 0)

  return (
    <div className="ba6__detail">
      <header className="ba6__crest">
        <span className="ba6__cresticon is-neutral" aria-hidden>
          <UserPlus size={20} strokeWidth={1.7} />
        </span>
        <div>
          <h2>Enrolment</h2>
          <p>What a user has to do before they can reach an application, and how long they have to do it.</p>
          <span className="ba6__meta">
            {offered.length} method{offered.length === 1 ? '' : 's'} offered · {enrolled.toLocaleString()} enrolments
          </span>
        </div>
      </header>

      {/* V5's split bar, kept — it is the one picture on this subject that says
          something a number cannot: whether the tenant leans on one factor. */}
      <section className="ba6__block">
        <h3 className="u-label">Where enrolments sit</h3>
        <div className="ba6__bar" role="img" aria-label="Share of enrolments by method">
          {top.map((m, i) => (
            <span
              key={m.id}
              className={`ba6__barseg is-${TIER_TONE[m.tier]}`}
              style={{ width: `${((m.enrolled ?? 0) / enrolled) * 100}%`, opacity: 1 - i * 0.12 }}
            />
          ))}
          {restTotal > 0 && <span className="ba6__barseg is-rest" style={{ width: `${(restTotal / enrolled) * 100}%` }} />}
        </div>
        <ul className="ba6__legend">
          {top.map((m, i) => (
            <li key={m.id}>
              <button type="button" onClick={() => onSelect({ kind: 'method', id: m.id })}>
                <i className={`is-${TIER_TONE[m.tier]}`} style={{ opacity: 1 - i * 0.12 }} aria-hidden />
                {m.name} <b>{(m.enrolled ?? 0).toLocaleString()}</b>
              </button>
            </li>
          ))}
          {rest.length > 0 && (
            <li>
              <span className="ba6__legendrest">
                <i className="is-rest" aria-hidden />
                {rest.length} more <b>{restTotal.toLocaleString()}</b>
              </span>
            </li>
          )}
        </ul>
      </section>

      <section className="ba6__block">
        <h3 className="u-label">Rules</h3>
        <div className="ba6__settings">
          <div className="ba6__setting">
            <div>
              <p>Enforce 2FA setup on first login</p>
              <span>Users who have not enrolled must do so before they can reach any app.</span>
            </div>
            <Toggle checked={enforce} label="Enforce 2FA setup on first login" onChange={setEnforce} />
          </div>

          {enforce && (
            <div className="ba6__setting is-sub">
              <div>
                <p>Grace period</p>
                <span>Days before enforcement applies. Prevents a lockout on the day you roll this out.</span>
              </div>
              <span className="ba6__number">
                <select aria-label="Grace period" value={grace} onChange={(e) => setGrace(e.target.value)}>
                  {['0', '3', '7', '14', '30'].map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
                <em>days</em>
              </span>
            </div>
          )}

          {enforce && grace === '0' && (
            <p className="ba6__warn">
              <AlertTriangle size={13} strokeWidth={2} aria-hidden />
              With no grace period, everyone who has not already enrolled is locked out the moment this saves.
            </p>
          )}

          <div className="ba6__setting">
            <div>
              <p>Let users choose their method at sign-in</p>
              <span>Off means they always use their default until they change it in self-service.</span>
            </div>
            <Toggle checked={userChoice} label="Let users choose their method at sign-in" onChange={setUserChoice} />
          </div>

          <div className="ba6__setting">
            <div>
              <p>Send setup instructions</p>
              <span>miniOrange Authenticator gets a setup link; other apps get a QR code by email.</span>
            </div>
            <Toggle checked={instructions} label="Send setup instructions" onChange={setInstructions} />
          </div>
        </div>
      </section>
    </div>
  )
}

/* --- Recovery ------------------------------------------------------------------ */

function RecoveryPanel({ methods, onSelect }: { methods: AuthMethod[]; onSelect: (s: Selection) => void }) {
  const kba = methods.find((m) => m.id === 'kba')!
  const alt = methods.find((m) => m.id === 'otp-alt-email')!
  const [forgotPhone, setForgotPhone] = useState(true)
  const [choice, setChoice] = useState('kba')
  const [backupCodes, setBackupCodes] = useState(true)
  const [codeCount, setCodeCount] = useState('10')

  const options = [
    { id: 'kba', label: 'Security Questions (KBA)', dep: kba },
    { id: 'alt', label: 'OTP over Alternate Email', dep: alt },
    { id: 'both', label: 'Both — highest assurance', dep: null },
  ]

  return (
    <div className="ba6__detail">
      <header className="ba6__crest">
        <span className="ba6__cresticon is-neutral" aria-hidden>
          <LifeBuoy size={20} strokeWidth={1.7} />
        </span>
        <div>
          <h2>Recovery</h2>
          <p>The path back in when somebody's enrolled device is lost, broken, or left at home.</p>
          <span className="ba6__meta">Every option here is a method from the catalogue</span>
        </div>
      </header>

      <section className="ba6__block">
        <div className="ba6__settings">
          <div className="ba6__setting">
            <div>
              <p>Enable Forgot Phone</p>
              <span>Lets users recover access when their enrolled device is unavailable.</span>
            </div>
            <Toggle checked={forgotPhone} label="Enable Forgot Phone" onChange={setForgotPhone} />
          </div>
        </div>
      </section>

      {forgotPhone && (
        <section className="ba6__block">
          <h3 className="u-label">
            Recovery method
            <TipDot text="Each option is a method in the catalogue. If that method is not configured and switched on, the option cannot be selected here — which is the dependency the console leaves you to discover." />
          </h3>
          <div className="ba6__radios">
            {options.map((o) => {
              const blocked = o.dep ? methodBlocker(o.dep) : null
              return (
                <label key={o.id} className={`ba6__radio ${blocked ? 'is-blocked' : ''} ${choice === o.id ? 'is-on' : ''}`}>
                  <input
                    type="radio"
                    name="recovery-v6"
                    checked={choice === o.id}
                    disabled={!!blocked}
                    onChange={() => setChoice(o.id)}
                  />
                  <span>
                    <strong>{o.label}</strong>
                    {blocked && o.dep && (
                      <em>
                        {blocked} —{' '}
                        <button
                          type="button"
                          className="ba6__link"
                          onClick={() => onSelect({ kind: 'method', id: o.dep!.id })}
                        >
                          open {o.dep.name}
                        </button>
                      </em>
                    )}
                  </span>
                </label>
              )
            })}
          </div>
        </section>
      )}

      <section className="ba6__block">
        <div className="ba6__settings">
          <div className="ba6__setting">
            <div>
              <p>Backup codes</p>
              <span>Single-use codes a user can print. The last resort when every other factor is unavailable.</span>
            </div>
            <Toggle checked={backupCodes} label="Backup codes" onChange={setBackupCodes} />
          </div>
          {backupCodes && (
            <div className="ba6__setting is-sub">
              <div>
                <p>Codes issued per user</p>
                <span>Each one works once.</span>
              </div>
              <span className="ba6__number">
                <select aria-label="Codes per user" value={codeCount} onChange={(e) => setCodeCount(e.target.value)}>
                  {['5', '10', '16', '20'].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                <em>codes</em>
              </span>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

/* --- Hardware tokens ------------------------------------------------------------ */

interface TokenRow {
  id: string
  user: string
  serial: string
  type: string
}

function TokensPanel({ methods, onSelect }: { methods: AuthMethod[]; onSelect: (s: Selection) => void }) {
  const store = useBrand()
  const [rows, setRows] = useState<TokenRow[]>([
    { id: 't1', user: 'priya.anand@acme.com', serial: 'YK-5C-0A91F', type: 'Yubikey OTP' },
    { id: 't2', user: 'sam.rivera@acme.com', serial: 'YK-5C-0A93B', type: 'Yubikey OTP' },
  ])

  const hardware = methods.filter((m) => m.channel === 'Hardware Token' || /token|yubikey/i.test(m.name))

  return (
    <div className="ba6__detail">
      <header className="ba6__crest">
        <span className="ba6__cresticon is-neutral" aria-hidden>
          <CreditCard size={20} strokeWidth={1.7} />
        </span>
        <div>
          <h2>Hardware tokens</h2>
          <p>Serial numbers, and who holds them. A user without an assignment cannot use a token however the policy is written.</p>
          <span className="ba6__meta">
            {rows.length} assigned · {hardware.length} hardware method{hardware.length === 1 ? '' : 's'} in the catalogue
          </span>
        </div>
      </header>

      {hardware.length > 0 && (
        <section className="ba6__block">
          <h3 className="u-label">Methods that need one</h3>
          <ul className="ba6__members">
            {hardware.map((m) => {
              const blocker = methodBlocker(m)
              return (
                <li key={m.id}>
                  <button type="button" onClick={() => onSelect({ kind: 'method', id: m.id })}>
                    <span className={`ba6__rowicon is-${TIER_TONE[m.tier]}`} aria-hidden>
                      <CreditCard size={14} strokeWidth={1.8} />
                    </span>
                    <span className="ba6__rowtext">
                      <strong>{m.name}</strong>
                      <em>{blocker ?? 'Live'}</em>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <section className="ba6__block">
        <div className="ba6__blockhead">
          <h3 className="u-label">Inventory</h3>
          <div className="ba6__blockacts">
            <Button size="sm" onClick={() => store.showToast('CSV import is not part of this prototype')}>
              Upload CSV
            </Button>
            <Button size="sm" variant="brand" onClick={() => store.showToast('Assignment is not part of this prototype')}>
              Assign token
            </Button>
          </div>
        </div>

        <div className="btable-wrap">
          <table className="btable">
            <thead>
              <tr>
                <th scope="col">User</th>
                <th scope="col">Serial number</th>
                <th scope="col">Type</th>
                <th scope="col" className="btable__right">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.user}</td>
                  <td className="u-mono">{r.serial}</td>
                  <td>{r.type}</td>
                  <td className="btable__right">
                    <button
                      type="button"
                      className="ba6__link"
                      onClick={() => {
                        setRows((all) => all.filter((x) => x.id !== r.id))
                        store.showToast(`${r.serial} unassigned`)
                      }}
                    >
                      Unassign
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="ba6__empty">
                    No tokens assigned. Nobody can use a hardware method until one is.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
