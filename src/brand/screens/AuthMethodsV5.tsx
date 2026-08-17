import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CreditCard,
  Fingerprint,
  HelpCircle,
  Info,
  KeyRound,
  Layers,
  LifeBuoy,
  Lock,
  Mail,
  MessageSquare,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  Smartphone,
  Star,
  Upload,
  UserPlus,
  X,
  type LucideIcon,
} from 'lucide-react'

import { Button, Drawer, TipDot, Toggle } from '../kit'
import { AUTH_METHODS, methodBlocker, type AuthMethod, type MethodSetting, type MethodTier } from '../methods'
import { useBrand } from '../store'
import { MethodSetsTab } from './method-sets'
import { ConfigFields } from './method-forms'
import { configFor, missingFields, setField, type ConfigField } from '../method-config'
import { methodStatus } from '../method-status'

/* -----------------------------------------------------------------------------
   V5 · MFA experience.

   A faithful rebuild of the V5 variant on the deployed prototype, read off its
   own DOM rather than from a screenshot: four tabs, three tiers on the Methods
   tab, and lettered sections on Enrollment and Recovery. Spec and the capture it
   came from are in docs/v5-mfa-experience.md.

   Two things about the rebuild are worth stating plainly.

   V5 groups methods into three tiers where our catalogue carries four. The
   mapping is not a guess — Standard MFA is our App-based plus Delivery-based,
   and Fallback & Recovery is Knowledge & tokens — but it is a lossy one, so the
   original tier is still shown on each card rather than thrown away.

   V5 has no Method Sets tab. Recreating it as-is therefore drops a surface we
   already built, which is why this ships beside the existing screen behind a
   switch instead of replacing it.
   -------------------------------------------------------------------------- */

type Tab = 'methods' | 'sets' | 'enrollment' | 'recovery' | 'tokens'

/* Method Sets is the tab the deployed screen does not have — this rebuild was
   faithful to it, which meant dropping a surface the product already owns and
   which the nav item on the left is named after. It is added here rather than
   reimplemented: `MethodSetsTab` is the same component the other version
   renders, so set editing has one implementation and cannot drift between two
   screens that both claim to own it. It brings its own look with it, which is
   the honest trade — a second copy in V5's idiom would be two editors. */
const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'methods', label: 'Methods', icon: KeyRound },
  { id: 'sets', label: 'Method Sets', icon: Layers },
  { id: 'enrollment', label: 'Enrollment', icon: UserPlus },
  { id: 'recovery', label: 'Recovery', icon: LifeBuoy },
  { id: 'tokens', label: 'Hardware Tokens', icon: CreditCard },
]

/* V5's three bands over our four tiers. */
const BANDS: { name: string; blurb: string; tiers: MethodTier[] }[] = [
  {
    name: 'Phishing-Resistant',
    blurb: 'Cryptographically bound credentials. Cannot be replayed or intercepted.',
    tiers: ['Phishing-resistant'],
  },
  {
    name: 'Standard MFA',
    blurb: 'One-time codes and push notifications. Effective but susceptible to phishing.',
    tiers: ['App-based', 'Delivery-based'],
  },
  {
    name: 'Fallback & Recovery',
    blurb: 'Something remembered, or a code from a separate device. Useful as a fallback, weak alone.',
    tiers: ['Knowledge & tokens'],
  },
]

export function AuthMethodsV5() {
  const store = useBrand()
  const [tab, setTab] = useState<Tab>('methods')
  const [banner, setBanner] = useState(true)

  /* One source of truth for every toggle on the page. The prototype's V5 keeps
     these in component state too — nothing here is persisted — but they are
     lifted so Enrollment and Recovery can read what Methods did, which is the
     dependency the real console gets wrong. */
  const [methods, setMethods] = useState<AuthMethod[]>(AUTH_METHODS)
  const setActive = (id: string, on: boolean) =>
    setMethods((all) => all.map((m) => (m.id === id ? { ...m, active: on, allowed: on && m.allowed } : m)))
  /* The drawer writes more than `active` — it saves a configuration and it
     edits the method's own settings — so it gets a general patch rather than a
     second single-purpose setter. */
  const patch = (id: string, p: Partial<AuthMethod>) =>
    setMethods((all) => all.map((m) => (m.id === id ? { ...m, ...p } : m)))

  const enabledIds = useMemo(() => new Set(methods.filter((m) => !methodBlocker(m)).map((m) => m.id)), [methods])

  return (
    <div className="bpage bv5">
      <header className="bv5__head">
        <h1>Authentication methods</h1>
        <p>Manage authentication factors, how users enroll, and recovery options — all in one place.</p>
      </header>

      {/* The sections read down the side rather than across the top. Five of
          them plus a page title is a lot of horizontal furniture above the
          thing you came to read, and a vertical rail keeps the current section
          in view while the pane beside it scrolls. */}
      <div className="bv5__work">
        <nav className="bv5__tabs" role="tablist" aria-label="Authentication methods">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={tab === t.id}
              className={`bv5__tab ${tab === t.id ? 'is-on' : ''}`}
              onClick={() => setTab(t.id)}
            >
              <t.icon size={17} strokeWidth={1.8} aria-hidden />
              {t.label}
            </button>
          ))}
        </nav>

        <div className="bv5__content">

      {banner && (
        <div className="bv5__banner">
          <span className="bv5__banner-accent" aria-hidden />
          <Info size={16} strokeWidth={1.6} aria-hidden />
          <span className="bv5__banner-text">
            Methods you enable here appear in your policy rules. Enrollee and policy-rule counts are
            live data.
          </span>
          <button type="button" className="bv5__link" onClick={() => store.go({ name: 'policies' })}>
            Go to Policy Builder <ArrowRight size={13} strokeWidth={2} aria-hidden />
          </button>
          <button type="button" className="bv5__banner-x" aria-label="Dismiss" onClick={() => setBanner(false)}>
            <X size={16} strokeWidth={1.6} />
          </button>
        </div>
      )}

        {tab === 'methods' && <MethodsTab methods={methods} onToggle={setActive} onPatch={patch} />}
        {tab === 'sets' && (
          <div className="bv5__pane bv5__pane--sets">
            <MethodSetsTab />
          </div>
        )}
        {tab === 'enrollment' && <EnrollmentTab methods={methods} enabled={enabledIds} />}
        {tab === 'recovery' && <RecoveryTab methods={methods} />}
        {tab === 'tokens' && <TokensTab />}
        </div>
      </div>
    </div>
  )
}

/* --- Methods ---------------------------------------------------------------- */
/* The Methods tab.

   V5 stacks twenty-one full-width cards, each repeating a description, a chip
   row and a pair of links. It reads as a feed, and a feed is the wrong shape
   for a control surface: the admin's questions are "what is on", "what is
   nobody using", and "what is half-configured", none of which a list of equal
   cards answers.

   Rebuilt on the shape enterprise consoles actually use for this — Stripe's
   Connect dashboard puts a figure strip and one actionable notice above the
   list; Ramp's comparison table keeps rows dense and aligned; Vercel filters
   its integrations rather than scrolling them.

   The numbers are the ones we hold, stated as what they are. Enrolments are
   counted per method, so they are labelled enrolments and not users — the same
   person with a passkey and an authenticator app is two of them, and calling
   that "users" would overstate coverage by exactly the amount that matters. */

type Filter = 'all' | 'live' | 'setup' | 'unused'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'live', label: 'Live' },
  { id: 'setup', label: 'Needs setup' },
  { id: 'unused', label: 'No enrolments' },
]

function MethodsTab({
  methods,
  onToggle,
  onPatch,
}: {
  methods: AuthMethod[]
  onToggle: (id: string, on: boolean) => void
  onPatch: (id: string, p: Partial<AuthMethod>) => void
}) {
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  /* Configuration is a page, not a dialog.

     Every one of the 21 methods has a schema in method-config.ts, and V5 had no
     way to reach any of them — the "Needs setup" pill named a state the screen
     could not change. A modal would have worked for the short forms and fought
     the long ones: FIDO2 alone is six fields including a list, and a passkey
     relying-party id is not something to fill in over the top of the list you
     were reading. So the row opens inward. */
  const [openId, setOpenId] = useState<string | null>(null)
  const open = openId ? methods.find((m) => m.id === openId) ?? null : null

  const stats = useMemo(() => {
    const live = methods.filter((m) => !methodBlocker(m))
    const enrolments = methods.reduce((n, m) => n + (m.enrolled ?? 0), 0)
    const phishing = methods.filter((m) => m.tier === 'Phishing-resistant' && !methodBlocker(m))
    const phishingEnrol = phishing.reduce((n, m) => n + (m.enrolled ?? 0), 0)
    return {
      live: live.length,
      total: methods.length,
      enrolments,
      phishingEnrol,
      phishingShare: enrolments ? Math.round((phishingEnrol / enrolments) * 100) : 0,
      unconfigured: methods.filter((m) => !m.configured).length,
      inUse: methods.filter((m) => (m.enrolled ?? 0) > 0).length,
      /* Live, but nobody uses it. The most actionable row on the page and the
         one no console surfaces: it is a factor you are maintaining for zero
         users, and either it needs promoting or switching off. */
      idle: live.filter((m) => (m.enrolled ?? 0) === 0).length,
    }
  }, [methods])

  const shown = useMemo(
    () =>
      methods.filter((m) => {
        if (q && !m.name.toLowerCase().includes(q.toLowerCase())) return false
        const blocked = methodBlocker(m)
        if (filter === 'live') return !blocked
        if (filter === 'setup') return !m.configured
        if (filter === 'unused') return !blocked && (m.enrolled ?? 0) === 0
        return true
      }),
    [methods, filter, q],
  )

  return (
    <div className="bv5__pane">
      {/* --- Figures ---------------------------------------------------- */}
      <div className="bv5__figures">
        <div className="bv5__fig">
          <span>Methods live</span>
          <strong>
            {stats.live}
            <em>/ {stats.total}</em>
          </strong>
        </div>
        <div className="bv5__fig">
          <span>Phishing-resistant share</span>
          <strong>
            {stats.phishingShare}
            <em>%</em>
          </strong>
        </div>
        <div className={`bv5__fig ${stats.unconfigured ? 'is-warn' : ''}`}>
          <span>Never configured</span>
          <strong>{stats.unconfigured}</strong>
        </div>
      </div>

      {/* One notice, and only when it has something to say. */}
      {stats.idle > 0 && (
        <div className="bv5__notice">
          <AlertTriangle size={15} strokeWidth={1.9} aria-hidden />
          <span>
            <strong>
              {stats.idle} method{stats.idle === 1 ? ' is' : 's are'} switched on with no enrolments.
            </strong>{' '}
            A factor nobody has enrolled in cannot be used by a policy — promote it or switch it off.
          </span>
          <button type="button" className="bv5__link" onClick={() => setFilter('unused')}>
            Review <ArrowRight size={12} strokeWidth={2} aria-hidden />
          </button>
        </div>
      )}

      {/* --- Toolbar ----------------------------------------------------- */}
      <div className="bv5__toolbar bv5__toolbar--flat">
        <div className="bv5__filters" role="tablist" aria-label="Filter methods">
          {FILTERS.map((f) => {
            const n =
              f.id === 'all'
                ? methods.length
                : f.id === 'live'
                  ? stats.live
                  : f.id === 'setup'
                    ? stats.unconfigured
                    : stats.idle
            return (
              <button
                key={f.id}
                role="tab"
                type="button"
                aria-selected={filter === f.id}
                className={`bv5__filter ${filter === f.id ? 'is-on' : ''}`}
                onClick={() => setFilter(f.id)}
              >
                {f.label} <em>{n}</em>
              </button>
            )
          })}
        </div>
        <span className="bv5__spacer" />
        <span className="bv5__search">
          <Search size={14} strokeWidth={1.9} aria-hidden />
          <input
            type="text"
            value={q}
            placeholder="Search methods…"
            aria-label="Search methods"
            onChange={(e) => setQ(e.target.value)}
          />
        </span>
      </div>

      {/* --- The rows ---------------------------------------------------- */}
      {BANDS.map((band) => {
        const list = shown.filter((m) => band.tiers.includes(m.tier))
        if (list.length === 0) return null
        const on = list.filter((m) => !methodBlocker(m)).length
        return (
          <section key={band.name} className="bv5__group">
            <header className="bv5__group-head">
              <h3>
                {band.name}
                {band.name === 'Phishing-Resistant' && (
                  <span className="bv5__phish">
                    <ShieldCheck size={11} strokeWidth={2} aria-hidden /> Strongest
                  </span>
                )}
              </h3>
              <span className="bv5__count">
                {on} of {list.length} on
              </span>
            </header>

            <div className="bv5__rows" role="table">
              <div className="bv5__rowhead" role="row">
                <span role="columnheader">Method</span>
                <span role="columnheader">Status</span>
                <span role="columnheader" className="bv5__ta-right">
                  Enrolments
                </span>
                <span role="columnheader" className="bv5__ta-right">
                  Enabled
                </span>
              </div>
              {list.map((m) => (
                <MethodRow key={m.id} m={m} onToggle={onToggle} onOpen={() => setOpenId(m.id)} />
              ))}
            </div>
          </section>
        )
      })}

      {shown.length === 0 && (
        <p className="bv5__empty-state">
          No method matches {q ? `“${q}”` : 'this filter'}.{' '}
          <button type="button" className="bv5__link" onClick={() => { setQ(''); setFilter('all') }}>
            Clear
          </button>
        </p>
      )}

      <MethodDrawer m={open} onClose={() => setOpenId(null)} onToggle={onToggle} onPatch={onPatch} />
    </div>
  )
}

function MethodRow({
  m,
  onToggle,
  onOpen,
}: {
  m: AuthMethod
  onToggle: (id: string, on: boolean) => void
  onOpen: () => void
}) {
  const reduce = useReducedMotion()
  const blocked = methodBlocker(m)
  const idle = !blocked && (m.enrolled ?? 0) === 0
  const status = methodStatus(m, blocked !== null, idle)

  return (
    <div className={`bv5__row2 ${blocked ? 'is-off' : ''}`} role="row">
      <div className="bv5__cell-main" role="cell">
        <MethodIcon name={m.name} size={30} />
        {/* The name is the way in. A separate "Configure" button in a fifth
            column would be a fifth column on every row for the sake of the two
            that need it today. */}
        <button type="button" className="bv5__cell-open" onClick={onOpen}>
          <span className="bv5__cell-text">
            <span className="bv5__cell-name">
              {m.name}
              {m.tier === 'Phishing-resistant' && (
                <ShieldCheck size={12} strokeWidth={2} className="bv5__phish-ico" aria-label="Phishing-resistant" />
              )}
            </span>
            <span className="bv5__cell-sub">{m.description}</span>
          </span>
        </button>
      </div>

      <div className="bv5__cell-status" role="cell">
        {/* One pill, one line, every row the same height.

            An empty balance used to hang under the pill as a second line of red
            text, which made two rows in twenty-one taller than the rest and put
            the most urgent fact on the page in the least prominent position on
            the row. It is not a footnote to the status — for a method that
            sends over a paid channel it IS the status, so it takes the pill.
            Rox, Customer.io and Fresha all resolve it the same way: the problem
            goes in the badge, with an icon, and the row stays one line. */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={status.key}
            className={`bv5__pill is-${status.tone}`}
            title={status.detail}
            initial={{ opacity: 0, y: reduce ? 0 : -4, scale: reduce ? 1 : 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: reduce ? 0 : 4, scale: reduce ? 1 : 0.94 }}
            transition={{ duration: reduce ? 0 : 0.16, ease: [0.2, 0, 0, 1] }}
          >
            <status.icon size={12} strokeWidth={2.2} aria-hidden />
            {status.label}
          </motion.span>
        </AnimatePresence>
      </div>

      <div className="bv5__cell-num" role="cell">
        {m.enrolled !== undefined ? m.enrolled.toLocaleString() : <span className="bv5__dash">—</span>}
      </div>

      <div className="bv5__cell-act" role="cell">
        <Toggle
          checked={!blocked}
          onChange={(v) => onToggle(m.id, v)}
          label={`Enable ${m.name}`}
          disabled={!m.configured}
        />
      </div>
    </div>
  )
}

/* --- Offered in the portal, as a transfer ---------------------------------------

   Two panels: everything on the left, what is offered on the right.

   It was one grid of nineteen checkboxes, which answers "is Authy ticked?" and
   not the question an admin actually has — "what do my users see?" That answer
   was spread across nineteen rows in reading order with the six that matter
   interleaved among the thirteen that are off. Here the right-hand panel IS the
   answer, in the order it will be offered, and it is never longer than the thing
   it describes.

   Methods switched off in the Methods tab stay visible on the left rather than
   being filtered out, because "why can I not offer Authy" is a question this
   panel should answer rather than one it should hide.

   `layout` on the rows means a method visibly crosses from one side to the
   other, which is the whole reason a transfer reads better than a checkbox: the
   thing you clicked moved somewhere, and you can see where. */

function MethodTransfer({
  methods,
  enabled,
  allowed,
  onAllowed,
}: {
  methods: AuthMethod[]
  enabled: Set<string>
  allowed: Set<string>
  onAllowed: (next: Set<string>) => void
}) {
  const reduce = useReducedMotion()
  const [q, setQ] = useState('')

  const offered = methods.filter((m) => allowed.has(m.id) && enabled.has(m.id))
  const available = methods.filter((m) => !allowed.has(m.id) || !enabled.has(m.id))

  const hit = (m: AuthMethod) => !q || `${m.name} ${m.channel} ${m.tier}`.toLowerCase().includes(q.toLowerCase())

  const add = (id: string) => {
    const n = new Set(allowed)
    n.add(id)
    onAllowed(n)
  }
  const remove = (id: string) => {
    const n = new Set(allowed)
    n.delete(id)
    onAllowed(n)
  }
  const addGroup = (ids: string[]) => {
    const n = new Set(allowed)
    ids.forEach((id) => n.add(id))
    onAllowed(n)
  }

  return (
    <div className="bv5__xfer">
      <div className="bv5__xfersearch">
        <Search size={13} strokeWidth={1.9} aria-hidden />
        <input
          type="search"
          value={q}
          placeholder="Search methods…"
          aria-label="Search methods"
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="bv5__xferpanes">
        {/* --- Everything ------------------------------------------------- */}
        <section className="bv5__xferpane">
          <header>
            <h4>Available</h4>
            <span>{available.length}</span>
          </header>
          <div className="bv5__xferbody">
            {BANDS.map((band) => {
              const rows = available.filter((m) => band.tiers.includes(m.tier) && hit(m))
              if (rows.length === 0) return null
              const addable = rows.filter((m) => enabled.has(m.id)).map((m) => m.id)
              return (
                <div className="bv5__xfergroup" key={band.name}>
                  <h5>
                    {band.name}
                    {addable.length > 1 && (
                      <button type="button" onClick={() => addGroup(addable)}>
                        Offer all {addable.length}
                      </button>
                    )}
                  </h5>
                  {rows.map((m) => {
                    const off = !enabled.has(m.id)
                    return (
                      <motion.button
                        key={m.id}
                        layout={!reduce}
                        transition={{ type: 'spring', stiffness: 520, damping: 40 }}
                        type="button"
                        disabled={off}
                        className={`bv5__xferrow ${off ? 'is-blocked' : ''}`}
                        onClick={() => add(m.id)}
                        title={off ? 'Switched off in the Methods tab' : `Offer ${m.name}`}
                      >
                        <MethodIcon name={m.name} size={22} />
                        <span className="bv5__xfername">{m.name}</span>
                        {off ? (
                          <span className="bv5__xfernote">Off in Methods</span>
                        ) : (
                          <span className="bv5__xferadd" aria-hidden>
                            <Plus size={13} strokeWidth={2.4} />
                          </span>
                        )}
                      </motion.button>
                    )
                  })}
                </div>
              )
            })}
            {available.filter(hit).length === 0 && <p className="bv5__xferempty">Everything is offered.</p>}
          </div>
        </section>

        {/* --- The answer -------------------------------------------------- */}
        <section className="bv5__xferpane is-picked">
          <header>
            <h4>Offered to users</h4>
            <span>{offered.length}</span>
          </header>
          <div className="bv5__xferbody">
            {offered.filter(hit).map((m) => (
              <motion.button
                key={m.id}
                layout={!reduce}
                transition={{ type: 'spring', stiffness: 520, damping: 40 }}
                type="button"
                className="bv5__xferrow is-on"
                onClick={() => remove(m.id)}
                title={`Stop offering ${m.name}`}
              >
                <MethodIcon name={m.name} size={22} />
                <span className="bv5__xfername">{m.name}</span>
                <span className="bv5__xfernum">{m.enrolled ? m.enrolled.toLocaleString() : '—'}</span>
                <span className="bv5__xferx" aria-hidden>
                  <X size={13} strokeWidth={2.2} />
                </span>
              </motion.button>
            ))}
            {offered.length === 0 && (
              <p className="bv5__xferempty">
                Nothing is offered. Users get their default method and cannot change it themselves.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

/* --- Configuration, in a drawer ------------------------------------------------

   One method's configuration and its own settings, over the list rather than
   instead of it. The list stays visible behind, so closing the panel puts you
   back where you were rather than at the top of a page you have to find your
   row in again.

   The form is `ConfigFields` over `configFor(id)` — the same schema and the same
   renderer the other version puts in a dialog. All 21 methods have one; V5 had
   no door to any of them, so "Needs setup" was a state the screen could name and
   not change.

   Saving an incomplete form is allowed and does not mark the method configured.
   Blocking the save would lose work on a form whose credentials usually have to
   be fetched from somewhere this panel cannot reach.

   `Drawer` is the kit's, not a second one built here: it already owns the scrim,
   the spring, Escape-to-close and the header, and a drawer that behaves
   differently from every other drawer in the product is a bug with a nice
   animation. */

function MethodDrawer({
  m,
  onClose,
  onToggle,
  onPatch,
}: {
  m: AuthMethod | null
  onClose: () => void
  onToggle: (id: string, on: boolean) => void
  onPatch: (id: string, p: Partial<AuthMethod>) => void
}) {
  const store = useBrand()
  const base = useMemo(() => (m ? configFor(m.id) : null), [m])
  const [fields, setFields] = useState<ConfigField[]>(base?.fields ?? [])

  // Opening a different method must not carry the previous one's values.
  useEffect(() => setFields(base?.fields ?? []), [base])

  const blocked = m ? methodBlocker(m) : null
  const missing = missingFields(fields)
  const ready = missing.length === 0

  /* The panel opens at a width the form warrants rather than one width for all
     twenty-one. A method with two fields and a method with six — one of them a
     list of origins and a three-option radio — are not the same panel, and
     opening both at 560 makes one of them empty and the other cramped.

     Counted from the schema, not hand-assigned: a kind that needs room asks for
     it, and a form that is simply long asks for a little. The drag handle is
     there for when the guess is wrong. */
  const roomy = fields.filter((f) => f.kind === 'list' || f.kind === 'textarea' || f.kind === 'radio').length
  const openWidth = Math.min(760, 480 + roomy * 90 + Math.max(0, fields.length - 3) * 20)

  return (
    <Drawer
      open={m !== null}
      onClose={onClose}
      resizable
      minWidth={420}
      maxWidth={820}
      width={openWidth}
      title={m?.name ?? ''}
      caption={
        m
          ? `${m.tier} · ${m.channel}${m.enrolled !== undefined ? ` · ${m.enrolled.toLocaleString()} enrolled` : ''}`
          : undefined
      }
      actions={
        base ? (
          <>
            <span className="bmc__foot">
              {ready ? (
                <>
                  <Check size={13} strokeWidth={2.6} aria-hidden /> Everything required is filled in.
                </>
              ) : (
                <>
                  <AlertTriangle size={13} strokeWidth={2} aria-hidden />
                  {missing.length} required field{missing.length === 1 ? '' : 's'} still blank —{' '}
                  {missing.map((f) => f.label).join(', ')}
                </>
              )}
            </span>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button
              variant="brand"
              onClick={() => {
                if (!m) return
                onPatch(m.id, { configured: ready })
                store.showToast(ready ? `${m.name} configured` : `${m.name} draft saved`)
              }}
            >
              {ready ? 'Save and mark configured' : 'Save draft'}
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        )
      }
    >
      {m && (
        <div className="bv5__dw">
          <header className="bv5__dwhead">
            <MethodIcon name={m.name} size={38} />
            <p>{m.description}</p>
            <span className="bv5__dwstate">
              <span>{blocked ? 'Not in use' : 'Live'}</span>
              <Toggle
                checked={!blocked}
                onChange={(v) => onToggle(m.id, v)}
                label={`Enable ${m.name}`}
                disabled={!m.configured}
              />
            </span>
          </header>

          {blocked && (
            <p className="bv5__inline-warn">
              <AlertTriangle size={14} strokeWidth={1.9} aria-hidden />
              <span>
                <strong>{blocked}.</strong> No policy rule can ask for this method until it is resolved.
              </span>
            </p>
          )}

          <p className="bmc__blurb">
            {base?.blurb ?? 'This method has nothing to connect — it is ready as soon as it is switched on.'}
          </p>
          {base && <ConfigFields fields={fields} onChange={(id, v) => setFields((f) => setField(f, id, v))} />}

          {m.settings && m.settings.length > 0 && (
            <>
              <p className="bv5__sublabel">Settings</p>
              <div className="bv5__dsettings">
                {m.settings.map((opt) => (
                  <div className="bv5__dsetting" key={opt.id}>
                    <div>
                      <p>{opt.label}</p>
                      {opt.help && <span>{opt.help}</span>}
                    </div>
                    {opt.kind === 'toggle' ? (
                      <Toggle
                        checked={opt.value}
                        label={opt.label}
                        onChange={(v) => onPatch(m.id, { settings: setSetting(m.settings!, opt.id, v) })}
                      />
                    ) : (
                      <select
                        className="bv5__dselect"
                        aria-label={opt.label}
                        value={opt.value}
                        onChange={(e) => onPatch(m.id, { settings: setSetting(m.settings!, opt.id, e.target.value) })}
                      >
                        {opt.options.map((o) => (
                          <option key={o}>{o}</option>
                        ))}
                      </select>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {m.balance && (
            <p className="bv5__dbalance">
              {m.balance.remaining.toLocaleString()} {m.balance.label} remaining — this method draws down a
              purchased balance every time it sends.
            </p>
          )}
        </div>
      )}
    </Drawer>
  )
}

/* Spreading over a discriminated union widens it, so each kind is narrowed
   before the value is written. */
function setSetting(all: MethodSetting[], id: string, value: boolean | string): MethodSetting[] {
  return all.map((x) => {
    if (x.id !== id) return x
    if (x.kind === 'toggle') return { ...x, value: Boolean(value) }
    return { ...x, value: String(value) }
  })
}

/* --- Method identity --------------------------------------------------------
   A real logo where a real vendor exists, and a channel icon everywhere else.

   Deliberately not a logo for all of them: there is no "SMS logo" or "security
   questions logo", and inventing a mark for a delivery channel would be
   decoration pretending to be identification. The vendors we genuinely ship
   logos for are miniOrange, Google and Microsoft; the rest get an icon that
   says what the channel is, which is the honest amount of information.

   Shared by every tab, so a method looks the same wherever it appears. */
const VENDOR_LOGO: { match: RegExp; src: string; name: string }[] = [
  { match: /minioranges?|mo /i, src: '/logos/miniorange.png', name: 'miniOrange' },
  { match: /google/i, src: '/logos/google.ico', name: 'Google' },
  { match: /microsoft/i, src: '/logos/m365.ico', name: 'Microsoft' },
]

const CHANNEL_ICON: { match: RegExp; icon: LucideIcon }[] = [
  { match: /passkey|fido|webauthn|biometric/i, icon: Fingerprint },
  { match: /smart ?card|cac|piv/i, icon: CreditCard },
  { match: /sms|text/i, icon: MessageSquare },
  { match: /email|mail/i, icon: Mail },
  { match: /call|voice|phone/i, icon: Phone },
  { match: /question|kba|grid/i, icon: HelpCircle },
  { match: /token|yubikey|display|hardware/i, icon: KeyRound },
  { match: /push|authenticator|otp|totp|qr/i, icon: Smartphone },
]

export function MethodIcon({ name, size = 24 }: { name: string; size?: number }) {
  const vendor = VENDOR_LOGO.find((v) => v.match.test(name))
  if (vendor) {
    return (
      <img
        className="bv5__mico bv5__mico--logo"
        src={vendor.src}
        alt=""
        aria-hidden
        loading="lazy"
        width={size}
        height={size}
        /* Sized by style, not by the width/height attributes alone. Attributes
           are presentational hints and lose to `.bv5__mico`s own width, so a
           logo asked for at 30px rendered at the class default of 26 next to a
           30px icon — which is why every list here kept needing its own size
           override. */
        style={{ width: size, height: size }}
        title={vendor.name}
      />
    )
  }
  const Ico = CHANNEL_ICON.find((c) => c.match.test(name))?.icon ?? ShieldCheck
  return (
    <span className="bv5__mico" aria-hidden style={{ width: size, height: size }}>
      <Ico size={Math.round(size * 0.68)} strokeWidth={1.8} />
    </span>
  )
}

/* --- Enrollment --------------------------------------------------------------
   Settings on the left, the rollout they produce on the right.

   V5 stacks four lettered cards — A, B, C, D — down the full width. The letters
   are arbitrary (nothing references them), and a full-width card for a single
   toggle wastes the half of the screen where the consequences of that toggle
   could be shown instead. So the controls keep their order but lose the
   lettering, and the space buys a panel that answers the question the settings
   raise: how is the rollout actually going.

   The panel refuses to state one number it cannot know. Enrolments are counted
   per method, so summing them gives enrolments, not people — the directory size
   is shown beside it as context and the ratio is labelled as a ratio, rather
   than dressing the two up as a coverage percentage that would be wrong. */
function EnrollmentTab({ methods, enabled }: { methods: AuthMethod[]; enabled: Set<string> }) {
  const store = useBrand()
  const [enforce, setEnforce] = useState(true)
  const [grace, setGrace] = useState(7)
  const [selfEnroll, setSelfEnroll] = useState(true)
  const [allowed, setAllowed] = useState<Set<string>>(
    new Set(methods.filter((m) => !methodBlocker(m) && m.tier !== 'Phishing-resistant').map((m) => m.id)),
  )
  const [fallback, setFallback] = useState('')

  const selectable = methods.filter((m) => m.tier !== 'Phishing-resistant')
  const defaults = methods.filter((m) => m.canBeDefault)
  const directory = 1240

  const ranked = useMemo(
    () =>
      methods
        .filter((m) => (m.enrolled ?? 0) > 0)
        .sort((a, b) => (b.enrolled ?? 0) - (a.enrolled ?? 0))
        .slice(0, 6),
    [methods],
  )
  const enrolments = methods.reduce((n, m) => n + (m.enrolled ?? 0), 0)
  const peak = ranked[0]?.enrolled ?? 1
  const openToSelf = [...allowed].filter((id) => enabled.has(id)).length

  return (
    <div className="bv5__pane">
      {/* The rollout numbers, which used to be the first card in a right-hand
          rail. They are the shape of the page's subject, so they read across the
          top where the Methods tab puts its own — not in a column beside the
          settings they describe. */}
      <div className="bv5__figures">
        <div className="bv5__fig">
          <span>Enrolments</span>
          <strong>{enrolments.toLocaleString()}</strong>
        </div>
        <div className="bv5__fig">
          <span>People</span>
          <strong>{directory.toLocaleString()}</strong>
        </div>
        <div className="bv5__fig">
          <span>Per person</span>
          <strong>{(enrolments / directory).toFixed(1)}</strong>
        </div>
        <div className="bv5__fig">
          <span>Offered in the portal</span>
          <strong>
            {openToSelf}
            <em>/ {selectable.length}</em>
          </strong>
        </div>
      </div>
      {/* The number this strip deliberately does not show, and why. */}
      <p className="bv5__caveat">
        Enrolments are counted per method, so this is not a headcount — someone with a passkey and an
        authenticator app is two of them.
      </p>

      {/* One list, not a grid of cards. Every one of these is the same shape —
          a named setting, a sentence about it, and one control — so they read as
          rows of a list rather than as four boxes that happen to contain rows.
          The section labels are the only structure that earns a line. */}
      <div className="bv5__list">
        <Group icon={ShieldCheck} title="Enforcement" note={enforce ? `${grace}-day grace` : 'Off'}>
          <Row
            name="Require 2FA at first sign-in"
            desc="Users who have not enrolled must do so before they can finish signing in."
            on={enforce}
            onChange={setEnforce}
          />
          {enforce && (
            <div className="bv5__inset">
              <div className="bv5__inset-line">
                <label htmlFor="v5-grace">Grace period</label>
                <input
                  id="v5-grace"
                  type="number"
                  min={0}
                  max={90}
                  value={grace}
                  onChange={(e) => setGrace(Math.max(0, Math.min(90, Number(e.target.value))))}
                />
                <span>days</span>
              </div>
            </div>
          )}
          {/* Under the setting it is about. In the rail it was three columns
              away from the toggle and the number it describes, which is how a
              warning ends up read as decoration. */}
          {enforce && (
            <p className="bv5__inline-warn">
              <AlertTriangle size={14} strokeWidth={1.9} aria-hidden />
              <span>
                Anyone who has not enrolled after{' '}
                <strong>
                  {grace} day{grace === 1 ? '' : 's'}
                </strong>{' '}
                is blocked at sign-in. Check the offered methods cover every group before the period ends.
              </span>
            </p>
          )}
        </Group>

        <Group
          icon={UserPlus}
          title="Self-enrolment"
          note={selfEnroll ? `${openToSelf} method${openToSelf === 1 ? '' : 's'} offered` : 'Off'}
        >
          <Row
            name="Let users enrol themselves"
            desc="Users can add, remove and switch methods from their self-service portal."
            on={selfEnroll}
            onChange={setSelfEnroll}
          />
          {selfEnroll && (
            <>
              <MethodTransfer
                methods={selectable}
                enabled={enabled}
                allowed={allowed}
                onAllowed={setAllowed}
              />
            </>
          )}
        </Group>

        <Group icon={Star} title="Default method" note={fallback || defaults[0]?.name || 'None'}>
          {/* The options are on the page, not behind a select.

              Seven of twenty-one methods qualify, and which seven is the
              interesting part — a closed select shows one and hides the fact
              that the list is a shortlist at all. Laid out, the constraint is
              visible: these are the methods that work before anybody has
              enrolled in anything. */}
          <p className="bv5__pickhelp">
            Applied tenant-wide before a user has enrolled in anything
            <TipDot text="Only methods that work with no prior enrolment can be a default, which is why this is a shortlist. A policy rule can still ask for something else." />
            <em>
              {defaults.length} of {methods.length} qualify
            </em>
          </p>
          <div className="bv5__picks" role="radiogroup" aria-label="Default authentication method">
            {defaults.map((m) => {
              const on = (fallback || defaults[0]?.name) === m.name
              return (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  className={`bv5__pick ${on ? 'is-on' : ''}`}
                  onClick={() => setFallback(m.name)}
                >
                  <MethodIcon name={m.name} size={24} />
                  <span>{m.name}</span>
                </button>
              )
            })}
          </div>
        </Group>

        <Group icon={Mail} title="Credential delivery" note="Email">
          <Row
            name="Email the enrolment QR code"
            desc="Users receive their QR without having to open the self-service portal first."
            on
            onChange={() => store.showToast('Delivery is configured per email template')}
          />
        </Group>
      </div>

      {/* Where users actually are. Full width, so the bars are long enough to
          compare at a glance — in the rail they were 60px of a 300px column and
          every one of them looked the same length. */}
      <section className="bv5__group2">
        <header className="bv5__group2-head">
          <span className="bv5__group2-ico" aria-hidden>
            <UserPlus size={15} strokeWidth={1.8} />
          </span>
          <h2>Most enrolled</h2>
          <span className="bv5__group2-note">Where users actually are today</span>
        </header>
        <div className="bv5__group2-body">
          <ul className="bv5__rank bv5__rank--wide">
            {ranked.map((m) => (
              <li key={m.id}>
                <MethodIcon name={m.name} size={22} />
                <span className="bv5__rank-name">{m.name}</span>
                <span className="bv5__rank-bar" aria-hidden>
                  <i style={{ width: `${((m.enrolled ?? 0) / peak) * 100}%` }} />
                </span>
                <span className="bv5__rank-n">{(m.enrolled ?? 0).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  )
}

function Group({
  icon: Ico,
  title,
  note,
  children,
}: {
  icon: LucideIcon
  title: string
  note?: string
  children: React.ReactNode
}) {
  return (
    <section className="bv5__group2">
      <header className="bv5__group2-head">
        <span className="bv5__group2-ico" aria-hidden>
          <Ico size={18} strokeWidth={1.8} />
        </span>
        <h2>{title}</h2>
        {note && <span className="bv5__group2-note">{note}</span>}
      </header>
      <div className="bv5__group2-body">{children}</div>
    </section>
  )
}


/* Three options, and what actually separates them is how much proof each one
   asks for. That was buried in a sentence per row; it is a pill now, and the
   sentence is on the tip for anyone who wants the mechanics. */
const RECOVERY_OPTIONS: {
  id: string
  name: string
  sub: string
  icon: LucideIcon
  grade: 'one' | 'two'
}[] = [
  {
    id: 'kba',
    name: 'Security Questions',
    sub: 'Users answer the knowledge-based questions they configured at enrolment.',
    icon: HelpCircle,
    grade: 'one',
  },
  {
    id: 'email',
    name: 'OTP over Alternate Email',
    sub: 'A one-time code sent to the backup email address on the account.',
    icon: Mail,
    grade: 'one',
  },
  {
    id: 'both',
    name: 'Both together',
    sub: 'Questions and a code from the backup address. The hardest to social-engineer, and the slowest for a locked-out user.',
    icon: ShieldCheck,
    grade: 'two',
  },
]

/* The local part of the address, initialled. Two letters where there is a
   separator to split on, one where there is not — never a slice of a surname
   that happens to start the same way. */
function initials(email: string): string {
  const local = email.split('@')[0]
  const parts = local.split(/[._-]+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return local.slice(0, 2).toUpperCase()
}

/* One tone per vendor family, so a column of types is scannable rather than
   three near-identical grey pills. */
function tokenTone(type: string): string {
  if (/yubi/i.test(type)) return 'info'
  if (/display/i.test(type)) return 'accent'
  return 'neutral'
}

function RecoveryTab({ methods }: { methods: AuthMethod[] }) {
  const [forgot, setForgot] = useState(true)
  const [choice, setChoice] = useState('kba')
  const [userPick, setUserPick] = useState(true)
  const [codes, setCodes] = useState(true)

  const kba = methods.find((m) => m.id === 'kba' || m.name.startsWith('Security Question'))
  const kbaOn = kba ? !methodBlocker(kba) : false

  return (
    <div className="bv5__pane">
      <Section letter="A" title="Recovery method">
        <Row
          name="Enable Forgot Phone"
          desc="Let users recover access when they can't use their enrolled device."
          on={forgot}
          onChange={setForgot}
        />
        {forgot && (
          <>
            {/* Three cards across, not three rows down.

                Stacked full-width rows spent a third of the section's height on
                the whitespace either side of three short labels, and made a
                choice between three peers read as a list you work through. Side
                by side they are what they are — three alternatives, compared at
                a glance. The pattern is settled: Descript, User Interviews and
                Sprig all lay a small mutually-exclusive choice out this way, and
                all of them let the card's own border carry the selection rather
                than pairing every card with a radio dot. */}
            <div className="bv5__radios" role="radiogroup" aria-label="Recovery method">
              {RECOVERY_OPTIONS.map((o) => {
                const needsKba = o.id !== 'email'
                const blocked = needsKba && !kbaOn
                const on = choice === o.id
                return (
                  <button
                    key={o.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={blocked}
                    className={`bv5__radio ${on ? 'is-on' : ''} ${blocked ? 'is-blocked' : ''}`}
                    onClick={() => setChoice(o.id)}
                    title={blocked ? `${o.sub} Needs Security Questions, which is switched off in Methods.` : o.sub}
                  >
                    <span className="bv5__radio-ico" aria-hidden>
                      <o.icon size={18} strokeWidth={1.8} />
                    </span>
                    <span className="bv5__radio-body">
                      <strong>{o.name}</strong>
                      <span className={`bv5__grade is-${o.grade}`}>
                        {o.grade === 'two' ? 'Two factors' : 'One factor'}
                      </span>
                    </span>
                    {/* The tick is the only thing that moves. It lands on the
                        card you picked, so the choice registers as an event
                        rather than as two cards quietly swapping tints.

                        One corner, one badge. A card can be both selected and
                        blocked — the saved choice stays put when Security
                        Questions goes off in Methods — and in that state the
                        lock is the fact that matters, so it takes the corner
                        and the border alone carries the selection. */}
                    <AnimatePresence initial={false}>
                      {on && !blocked && (
                        <motion.span
                          className="bv5__radio-tick"
                          aria-hidden
                          initial={{ scale: 0.3, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.3, opacity: 0 }}
                          transition={{ type: 'spring', stiffness: 700, damping: 32 }}
                        >
                          <Check size={11} strokeWidth={3.2} />
                        </motion.span>
                      )}
                    </AnimatePresence>
                    {blocked && (
                      <span className="bv5__radio-lock" aria-hidden>
                        <Lock size={11} strokeWidth={2.2} />
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            {/* One line, stated as fact in whichever direction currently holds,
                because the dependency runs both ways and the console only ever
                mentions one of them. The consequence is on the tip. */}
            <p className={`bv5__dep ${kbaOn ? 'is-ok' : 'is-warn'}`}>
              {kbaOn ? <Check size={13} strokeWidth={2.4} aria-hidden /> : <Lock size={13} strokeWidth={2.2} aria-hidden />}
              Security Questions is <strong>{kbaOn ? 'on' : 'off'}</strong> in Methods
              <TipDot
                text={
                  kbaOn
                    ? 'Both KBA options depend on it. Switching Security Questions off in Methods will grey them out here.'
                    : 'Both KBA options depend on it. Switch Security Questions on in Methods to use either one.'
                }
              />
            </p>
          </>
        )}
      </Section>

      <Section letter="B" title="End user controls" last>
        <Row
          name="Enable end users to select their alternate login method"
          desc="Users choose which recovery method they prefer."
          on={userPick}
          onChange={setUserPick}
        />
        <Row
          name="Enable end users to use security codes to login"
          desc="Static backup codes can be used as a recovery factor."
          on={codes}
          onChange={setCodes}
        />
        {codes && (
          <>
            <p className="bv5__sublabel">Static code generation</p>
            <div className="bv5__stats">
              <div className="bv5__stat">
                <strong>1,240</strong>
                <span>Generated</span>
              </div>
              <div className="bv5__stat is-green">
                <strong>890</strong>
                <span>Unused</span>
              </div>
              <div className="bv5__stat is-amber">
                <strong>350</strong>
                <span>Used</span>
              </div>
            </div>
          </>
        )}
      </Section>
    </div>
  )
}

/* --- Hardware tokens -------------------------------------------------------- */

interface TokenRow {
  user: string
  serial: string
  type: string
}
const SEED_TOKENS: TokenRow[] = [
  { user: 'priya.anand@acme.com', serial: 'YK-5C-0A91F', type: 'Yubikey OTP' },
  { user: 'sam.rivera@acme.com', serial: 'YK-5C-0A93B', type: 'Yubikey OTP' },
  { user: 'mehak.garg@acme.com', serial: 'DT-2200-4417', type: 'Display Token' },
  { user: 'jaspreet.t@acme.com', serial: 'VS-GO6-88201', type: 'Vasco' },
]

function TokensTab() {
  const store = useBrand()
  const [sub, setSub] = useState<'assignments' | 'inventory'>('assignments')
  const [rows, setRows] = useState(SEED_TOKENS)
  const [q, setQ] = useState('')

  const shown = rows.filter(
    (r) => !q || r.user.toLowerCase().includes(q.toLowerCase()) || r.serial.toLowerCase().includes(q.toLowerCase()),
  )

  return (
    <div className="bv5__pane">
      <p className="bv5__hint">
        Serial-number–based hardware tokens (Yubikey OTP, Display Token, Vasco). Assign physical
        tokens to users and manage inventory. Cross-referenced from Methods → Hardware OTP Tokens.
      </p>

      <div className="bv5__subtabs" role="tablist" aria-label="Hardware tokens">
        {(['assignments', 'inventory'] as const).map((s) => (
          <button
            key={s}
            role="tab"
            type="button"
            aria-selected={sub === s}
            className={`bv5__subtab ${sub === s ? 'is-on' : ''}`}
            onClick={() => setSub(s)}
          >
            {s === 'assignments' ? 'Assignments' : 'Token Management'}
          </button>
        ))}
      </div>

      <div className="bv5__panel">
        <div className="bv5__toolbar">
          <span className="bv5__search">
            <Search size={14} strokeWidth={1.9} aria-hidden />
            <input
              type="text"
              value={q}
              placeholder="Search user or serial…"
              aria-label="Search tokens"
              onChange={(e) => setQ(e.target.value)}
            />
          </span>
          <span className="bv5__spacer" />
          <Button size="sm" onClick={() => store.showToast('CSV accepts user, serial and token type')}>
            <Upload size={13} strokeWidth={1.9} aria-hidden /> Upload CSV
          </Button>
          <Button size="sm" variant="brand" onClick={() => store.showToast('Assign opens the user picker')}>
            Assign token
          </Button>
        </div>

        {sub === 'assignments' ? (
          <table className="bv5__table">
            <thead>
              <tr>
                <th>User</th>
                <th>Serial</th>
                <th>Type</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.serial}>
                  <td>
                    {/* A face for the row. Four columns of text read as a
                        spreadsheet; the one column that names a person should
                        look like it names a person. */}
                    <span className="bv5__who">
                      <span className="bv5__avatar" aria-hidden>
                        {initials(r.user)}
                      </span>
                      {r.user}
                    </span>
                  </td>
                  <td>
                    <span className="bv5__serial">{r.serial}</span>
                  </td>
                  <td>
                    <span className={`bv5__type is-${tokenTone(r.type)}`}>
                      <Fingerprint size={12} strokeWidth={2} aria-hidden />
                      {r.type}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="bv5__unassign"
                      onClick={() => {
                        setRows((all) => all.filter((x) => x.serial !== r.serial))
                        store.showToast(`${r.serial} unassigned from ${r.user}`)
                      }}
                    >
                      Unassign
                    </button>
                  </td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={4} className="bv5__empty">
                    {q ? `No token matches “${q}”.` : 'No tokens assigned.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        ) : (
          <div className="bv5__inventory">
            <div className="bv5__stats">
              <div className="bv5__stat">
                <strong>{rows.length}</strong>
                <span>Assigned</span>
              </div>
              <div className="bv5__stat is-green">
                <strong>46</strong>
                <span>In stock</span>
              </div>
              <div className="bv5__stat is-amber">
                <strong>3</strong>
                <span>Lost or revoked</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* --- Shared bits ------------------------------------------------------------ */

function Section({
  letter,
  title,
  children,
  last,
}: {
  letter: string
  title: string
  children: React.ReactNode
  last?: boolean
}) {
  return (
    <section className={`bv5__sec ${last ? 'is-last' : ''}`}>
      <p className="bv5__seclabel">
        <span>{letter}</span> {title}
      </p>
      <div className="bv5__seccard">{children}</div>
    </section>
  )
}

/* The setting, and nothing else on the line.

   Every row carried a sentence explaining itself, which on a page of eight rows
   is eight sentences competing with the eight controls they describe. The
   sentence is not deleted — it is one gesture away on the name, where somebody
   who needs it will look and somebody who does not will not read it. */
function Row({
  name,
  desc,
  on,
  onChange,
}: {
  name: string
  desc: string
  on: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="bv5__row">
      <span className="bv5__rn">
        {name}
        <TipDot text={desc} />
      </span>
      <Toggle checked={on} onChange={onChange} label={name} />
    </div>
  )
}
