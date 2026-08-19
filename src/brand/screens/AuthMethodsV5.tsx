import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronRight,
  CreditCard,
  Fingerprint,
  Grid3x3,
  HelpCircle,
  Info,
  KeyRound,
  LifeBuoy,
  Lock,
  Mail,
  MessageSquare,
  Phone,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Star,
  Upload,
  X,
  type LucideIcon,
} from 'lucide-react'

import { Button, Drawer, TipDot, Toggle } from '../kit'
import { AUTH_METHODS, methodBlocker, type AuthMethod, type MethodSetting } from '../methods'
import { useBrand } from '../store'
import { ConfigFields } from './method-forms'
import { configFor, missingFields, setField, type ConfigField } from '../method-config'
import { methodStatus } from '../method-status'
import { SettingField } from '../setting-field'
import {
  configSuppressed,
  familyForChannel,
  familySettingsFor,
  legacySuppressed,
  methodSettingsFor,
  settingKey,
  siblingsOf,
  type MfaValue,
  type MfaValues,
} from '../mfa-join'

/* -----------------------------------------------------------------------------
   V5 · MFA experience.

   A faithful rebuild of the V5 variant on the deployed prototype, read off its
   own DOM rather than from a screenshot: three tiers on the Methods tab and
   lettered sections on Recovery. Spec and the capture it came from are in
   docs/v5-mfa-experience.md.

   Two things about the rebuild are worth stating plainly.

   V5 groups methods into three tiers where our catalogue carries four. The
   mapping is not a guess — Standard MFA is our App-based plus Delivery-based,
   and Fallback & Recovery is Knowledge & tokens — but it is a lossy one, so the
   original tier is still shown on each card rather than thrown away.

   V5 has no Method Sets tab, and this rebuild no longer adds one — the other
   version owns that editor, and two screens both claiming to be where sets are
   edited is worse than one screen not having them.
   -------------------------------------------------------------------------- */

type Tab = 'methods' | 'recovery' | 'tokens'

/* Three tabs. Method Sets and Enrollment were dropped: the first duplicated a
   surface the other version already owns, and rendering the same editor twice
   meant two screens both claiming to be where sets are edited. Enrollment went
   with it — it configured how users join methods, which is a different job from
   deciding which methods exist. */
const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'methods', label: 'Methods', icon: KeyRound },
  { id: 'recovery', label: 'Recovery', icon: LifeBuoy },
  { id: 'tokens', label: 'Hardware Tokens', icon: CreditCard },
]

/* The sheet's families, which are already on the model as `channel`. Eleven of
   them, and seven hold exactly one method — which is the argument for chips
   rather than sections: a section heading over a single row is a heading that
   costs more vertical space than the thing it labels. As a chip row it is one
   line, it filters, and each one carries the logo you would recognise the
   family by anyway. */
const CHANNELS = [
  'SMS',
  'Email',
  'Authenticator App',
  'miniOrange Authenticator',
  'Call Verification',
  'Hardware Token',
  'Security Questions',
  'Grid Pattern',
  'Smart Cards',
  'RSA Authenticator',
  'Biometric',
]

const FAMILY_ICON: Record<string, LucideIcon> = {
  SMS: MessageSquare,
  Email: Mail,
  'Authenticator App': Smartphone,
  'miniOrange Authenticator': Sparkles,
  'Call Verification': Phone,
  'Hardware Token': KeyRound,
  'Security Questions': HelpCircle,
  'Grid Pattern': Grid3x3,
  'Smart Cards': CreditCard,
  'RSA Authenticator': ShieldCheck,
  Biometric: Fingerprint,
}

export function AuthMethodsV5() {
  const store = useBrand()
  const [tab, setTab] = useState<Tab>('methods')
  const [banner, setBanner] = useState(true)

  /* One source of truth for every toggle on the page. The prototype's V5 keeps
     these in component state too — nothing here is persisted — but they are
     lifted so Recovery can read what Methods did, which is the
     dependency the real console gets wrong. */
  const [methods, setMethods] = useState<AuthMethod[]>(AUTH_METHODS)
  /* Exactly one method holds it, which is why it lives here and not on a row's
     own state: setting a new default has to clear the old one. */
  const [defaultId, setDefaultId] = useState<string | null>('otp-email')
  /* One switch, and it writes both fields.

     The row used to carry two: Enabled (the tenant's decision) and For users
     (whether a user may pick it during enrolment). They are genuinely different
     questions, but nothing in the catalogue ever answers them differently —
     every one of the twenty-one methods ships with `active === allowed`, so the
     second column spent a column of every row restating the first.

     Both fields still exist, because `methodBlocker` reads both and v0 still
     shows them separately. Writing them together is what keeps the single
     toggle honest: turn it on and the method is on AND offered, so the blocker
     clears. Writing only `active` would leave anything seeded `allowed: false`
     reporting "Not offered to end users" with no control on the screen able to
     fix it — a dead end this row had once before. */
  const setActive = (id: string, on: boolean) =>
    setMethods((all) => all.map((m) => (m.id === id ? { ...m, active: on, allowed: on } : m)))
  /* The drawer writes more than `active` — it saves a configuration and it
     edits the method's own settings — so it gets a general patch rather than a
     second single-purpose setter. */
  const patch = (id: string, p: Partial<AuthMethod>) =>
    setMethods((all) => all.map((m) => (m.id === id ? { ...m, ...p } : m)))

  /* The sheet's settings live here and not on a method, because half of them do
     not belong to one. OTP length is a property of the SMS family: the three
     SMS methods share it, and a copy per method would let them disagree about a
     number the gateway only has one of.

     Flat, keyed by `settingKey` — scope, owner, id — so a family value and a
     method value cannot collide even when they share an id, which 'kba', 'grid'
     and 'rsa' all do. Absent means "still the sheet's default"; the map only
     holds what an admin actually changed. */
  const [behaviour, setBehaviour] = useState<MfaValues>({})
  const saveBehaviour = (p: MfaValues) => setBehaviour((v) => ({ ...v, ...p }))

  return (
    <div className="bpage bv5">
      <header className="bv5__head">
        <h1>Authentication methods</h1>
        <p>
          Manage authentication factors, how users enroll, and recovery options — all in one place.
        </p>
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
                Methods you enable here appear in your policy rules. Enrollee and policy-rule counts
                are live data.
              </span>
              <button
                type="button"
                className="bv5__link"
                onClick={() => store.go({ name: 'policies' })}
              >
                Go to Policy Builder <ArrowRight size={13} strokeWidth={2} aria-hidden />
              </button>
              <button
                type="button"
                className="bv5__banner-x"
                aria-label="Dismiss"
                onClick={() => setBanner(false)}
              >
                <X size={16} strokeWidth={1.6} />
              </button>
            </div>
          )}

          {tab === 'methods' && (
            <MethodsTab
              methods={methods}
              onToggle={setActive}
              onPatch={patch}
              defaultId={defaultId}
              onDefault={setDefaultId}
              behaviour={behaviour}
              onBehaviour={saveBehaviour}
            />
          )}
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
  defaultId,
  onDefault,
  behaviour,
  onBehaviour,
}: {
  methods: AuthMethod[]
  onToggle: (id: string, on: boolean) => void
  onPatch: (id: string, p: Partial<AuthMethod>) => void
  defaultId: string | null
  onDefault: (id: string) => void
  behaviour: MfaValues
  onBehaviour: (p: MfaValues) => void
}) {
  const [filter, setFilter] = useState<Filter>('all')
  const [channel, setChannel] = useState<string | null>(null)
  const [q, setQ] = useState('')
  /* Configuration is a page, not a dialog.

     Every one of the 21 methods has a schema in method-config.ts, and V5 had no
     way to reach any of them — the "Needs setup" pill named a state the screen
     could not change. A modal would have worked for the short forms and fought
     the long ones: FIDO2 alone is six fields including a list, and a passkey
     relying-party id is not something to fill in over the top of the list you
     were reading. So the row opens inward. */
  const [openId, setOpenId] = useState<string | null>(null)
  const open = openId ? (methods.find((m) => m.id === openId) ?? null) : null

  const stats = useMemo(() => {
    const live = methods.filter((m) => !methodBlocker(m))
    const enrolments = methods.reduce((n, m) => n + (m.enrolled ?? 0), 0)
    const phishingEnrol = methods
      .filter((m) => m.tier === 'Phishing-resistant' && !methodBlocker(m))
      .reduce((n, m) => n + (m.enrolled ?? 0), 0)
    return {
      live: live.length,
      /* Enrolment-weighted, not a count of methods: the share of everyone who
         has enrolled in anything who sits on a factor that cannot be phished.
         It was one of the three figure cards and is the only number they
         carried that is stated nowhere else, so it moves to the table foot
         rather than going with them. */
      phishingShare: enrolments ? Math.round((phishingEnrol / enrolments) * 100) : 0,
      unconfigured: methods.filter((m) => !m.configured).length,
      /* Live, but nobody uses it. The most actionable row on the page and the
         one no console surfaces: it is a factor you are maintaining for zero
         users, and either it needs promoting or switching off. */
      idle: live.filter((m) => (m.enrolled ?? 0) === 0).length,
    }
  }, [methods])

  /* The families, counted in one pass and derived from the data rather than
     read off CHANNELS. That is what stops the filter going stale: add a family
     to methods.ts and it appears here on its own. CHANNELS survives as the
     display order only, so a family the array has never heard of still lists —
     at the end, alphabetically, instead of vanishing. */
  const families = useMemo(() => {
    const by = new Map<string, { id: string; n: number; live: number }>()
    for (const m of methods) {
      const e = by.get(m.channel) ?? { id: m.channel, n: 0, live: 0 }
      e.n += 1
      if (!methodBlocker(m)) e.live += 1
      by.set(m.channel, e)
    }
    const order = new Map(CHANNELS.map((c, i) => [c, i]))
    return [...by.values()].sort(
      (a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99) || a.id.localeCompare(b.id),
    )
  }, [methods])

  /* The family list used to be eleven visible chips, so searching by family was
     never necessary — you could see them all. Behind a select it is, and
     matching the name alone meant typing "sms" or "biometric" found nothing.
     Widened to name + family + strength, which is what V6 already does. */
  const shown = useMemo(
    () =>
      methods.filter((m) => {
        const needle = q.trim().toLowerCase()
        if (needle && !`${m.name} ${m.channel} ${m.tier}`.toLowerCase().includes(needle))
          return false
        if (channel && m.channel !== channel) return false
        const blocked = methodBlocker(m)
        if (filter === 'live') return !blocked
        if (filter === 'setup') return !m.configured
        if (filter === 'unused') return !blocked && (m.enrolled ?? 0) === 0
        return true
      }),
    [methods, filter, channel, q],
  )

  return (
    <div className="bv5__pane">
      {/* The three figure cards used to open this tab. Two of them —
          "Methods live 7/21" and "Never configured 9" — restated numbers the
          filter row underneath already prints on its own tabs, from the very
          same `stats` fields, so they spent 107px repeating the control that
          sits below them. The third carried the only fact they owned; it moved
          to the table foot. */}

      {/* One notice, and only when it has something to say. */}
      {stats.idle > 0 && (
        <div className="bv5__notice">
          <AlertTriangle size={15} strokeWidth={1.9} aria-hidden />
          <span>
            <strong>
              {stats.idle} method{stats.idle === 1 ? ' is' : 's are'} switched on with no
              enrolments.
            </strong>{' '}
            A factor nobody has enrolled in cannot be used by a policy — promote it or switch it
            off.
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

        {/* Category, as a select rather than a row of chips.

            Eleven families wrapped to three lines at the width this tab is
            usually read at, and to two at 1440px — with a twelfth family it
            takes another. A select costs one control at any number of families,
            which is the whole point: the list grows inside it, not down the
            page. Policies.tsx reached the same conclusion about policy types
            and this reuses the control it landed on, `.btoolbar__select`,
            including its `is-set` brand tint so an active filter still looks
            different from a default at a glance.

            What a native select cannot carry is the family glyph. It does not
            need to: every row already prints its own family as an icon + label
            (`.bv5__catchip`), so the glyphs never left the screen — only the
            filter did. The per-family counts follow into the option text. */}
        <label className="bv5__catf">
          <span className="u-sr-only">Filter by category</span>
          <select
            className={`btoolbar__select bv5__catf-sel ${channel ? 'is-set' : ''}`}
            value={channel ?? ''}
            onChange={(e) => setChannel(e.target.value || null)}
          >
            <option value="">All categories ({methods.length})</option>
            {families.map((f) => (
              <option key={f.id} value={f.id}>
                {f.id} — {f.live} of {f.n} on
              </option>
            ))}
          </select>
        </label>

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
      {/* The bordered panel and the table are two elements now. They were one,
          and the foot below would then have been a stray div inside
          `role="table"` — which is not row content, so it either vanishes from
          the accessibility tree or corrupts the table's shape depending on the
          reader. The panel keeps the border; the grid keeps the role. */}
      <div className="bv5__rows">
        <div role="table" aria-label="Authentication methods">
          <div className="bv5__rowhead" role="row">
            <span role="columnheader">Method</span>
            <span role="columnheader">Status</span>
            <span role="columnheader" className="bv5__ta-right">
              Enrolments
            </span>
            <span role="columnheader" className="bv5__ta-right">
              Enable
            </span>
            <span role="columnheader" />
          </div>
          {shown.map((m) => (
            <MethodRow
              key={m.id}
              m={m}
              isDefault={defaultId === m.id}
              onToggle={onToggle}
              onDefault={() => onDefault(m.id)}
              onOpen={() => setOpenId(m.id)}
            />
          ))}
        </div>

        {/* Where the third figure card went. It is a derived, whole-tenant
            number — it does not belong to any row, and stated once under the
            table it is read after the list rather than instead of it. The
            live region is the other thing the chips used to give away: they
            carried `aria-pressed`, so a screen reader heard the filter change.
            A select announces its own value but not what it did to the table,
            so the count says it. */}
        <div className="btable__foot bv5__foot">
          <span aria-live="polite" role="status">
            Showing {shown.length} of {methods.length} methods
          </span>
          <span className="bv5__foot-sep" aria-hidden>
            ·
          </span>
          <span>
            <strong>{stats.phishingShare}%</strong> of enrolments are on a phishing-resistant method
          </span>
        </div>
      </div>

      {shown.length === 0 && (
        <p className="bv5__empty-state">
          {/* Names the filter that is actually hiding things. "this filter" was
              ambiguous while three dimensions were on screen at once, and once
              family moved behind a select it became a dead end: `Clear` reset
              the search and the status tab but never the family, so the one
              filter you could no longer see was the one it would not clear. */}
          No method matches{' '}
          {[q && `“${q}”`, channel, filter !== 'all' && FILTERS.find((f) => f.id === filter)?.label]
            .filter(Boolean)
            .join(' + ') || 'this filter'}
          .{' '}
          <button
            type="button"
            className="bv5__link"
            onClick={() => {
              setQ('')
              setFilter('all')
              setChannel(null)
            }}
          >
            Clear
          </button>
        </p>
      )}

      <MethodDrawer
        m={open}
        onClose={() => setOpenId(null)}
        onToggle={onToggle}
        onPatch={onPatch}
        behaviour={behaviour}
        onBehaviour={onBehaviour}
      />
    </div>
  )
}

function MethodRow({
  m,
  isDefault,
  onToggle,
  onDefault,
  onOpen,
}: {
  m: AuthMethod
  isDefault: boolean
  onToggle: (id: string, on: boolean) => void
  onDefault: () => void
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
        {/* The name is the way in, and it now says so.

            It used to be a bare button: clicking the method name opened the
            panel, but nothing on the row named the action, and its accessible
            name was just the method's. That was survivable while the panel held
            connection settings for the two methods that needed them — the old
            argument here was that a Configure column would be a fifth column
            for the sake of two rows.

            Wiring the sheet in ended that. Every method now has settings behind
            this row, so the action is relevant to all twenty-one, not two. And
            there is a second reason to name it: in the shipping console the
            word on a method card is "Edit", and it opens a QR code or a "change
            your phone number" form — enrolment for the signed-in admin, not
            tenant configuration. An unlabelled row invites exactly that reading.

            "Configure" rides inside the existing button rather than becoming a
            column of its own, so the accessible name reads "FIDO2 / Passkey …
            Configure" — the visible words, in order, which keeps voice control
            working. An aria-label would have replaced the name and broken it. */}
        {/* One line. The description used to sit under every name — twenty-one
            sentences competing with the twenty-one rows they describe, and it
            was the reason the list read as a feed rather than a table. It is
            not deleted, only demoted: one gesture away on the name, where
            somebody who needs it will look and somebody who does not will not
            read it. The category chip comes up onto the name line, which is
            where it was going to have to live once the second line went. */}
        <button type="button" className="bv5__cell-open" onClick={onOpen}>
          <span className="bv5__cell-name">
            {m.name}
            {m.tier === 'Phishing-resistant' && (
              <ShieldCheck
                size={12}
                strokeWidth={2}
                className="bv5__phish-ico"
                aria-label="Phishing-resistant"
              />
            )}
            {isDefault && <i className="bv5__defbadge">Default</i>}
            <i className="bv5__catchip">
              {(() => {
                const Ico = FAMILY_ICON[m.channel] ?? KeyRound
                return <Ico size={10} strokeWidth={2} aria-hidden />
              })()}
              {m.channel}
            </i>
          </span>
          <span className="bv5__cell-go">
            Configure
            <ChevronRight size={13} strokeWidth={2} aria-hidden />
          </span>
        </button>
        <TipDot text={m.description} label={`What ${m.name} is`} />
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
        {/* A keyed remount, not an AnimatePresence swap.

            This was `AnimatePresence mode="wait"`, and it deadlocked: the
            incoming pill is gated on the outgoing one finishing its exit, and
            an exit driven by rAF never finishes in a tab that has stopped
            compositing. Flip Enable in a backgrounded tab and the row un-dimmed
            while the pill stayed on "Switched off" — the two halves of one
            render disagreeing, which is the tell.

            Changing `key` remounts the span and replays initial → animate, so
            the state change still gets its motion. There is no exit to wait on,
            and only ever one pill in the row, so nothing can jump. */}
        <motion.span
          key={status.key}
          className={`bv5__pill is-${status.tone}`}
          title={status.detail}
          initial={{ opacity: 0, y: reduce ? 0 : -4, scale: reduce ? 1 : 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: reduce ? 0 : 0.16, ease: [0.2, 0, 0, 1] }}
        >
          <status.icon size={12} strokeWidth={2.2} aria-hidden />
          {status.label}
        </motion.span>
      </div>

      <div className="bv5__cell-num" role="cell">
        {m.enrolled !== undefined ? (
          m.enrolled.toLocaleString()
        ) : (
          <span className="bv5__dash">—</span>
        )}
      </div>

      {/* One switch. It turns the method on for the tenant and offers it to
          users in the same stroke — see `setActive` for why both fields move
          together. Still disabled until the method is configured, because
          switching on something unconfigured is the console's oldest silent
          no-op. */}
      <div className="bv5__cell-act" role="cell">
        <Toggle
          checked={m.active}
          onChange={(v) => onToggle(m.id, v)}
          label={`Enable ${m.name}`}
          disabled={!m.configured}
        />
      </div>

      {/* Set as default lives in the row, because the row is where you already
          are when you decide. Only methods that work with no prior enrolment
          qualify — the rest cannot be a default however much you want them. */}
      <div className="bv5__cell-more" role="cell">
        {m.canBeDefault && m.configured && m.active && !isDefault && (
          <button type="button" className="bv5__setdef" onClick={onDefault}>
            <Star size={12} strokeWidth={2} aria-hidden />
            Set default
          </button>
        )}
        {isDefault && (
          <span className="bv5__isdef" title="Used before a user has enrolled in anything">
            <Star size={12} strokeWidth={2.4} aria-hidden />
          </span>
        )}
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

function MethodDrawer({
  m,
  onClose,
  onToggle,
  onPatch,
  behaviour,
  onBehaviour,
}: {
  m: AuthMethod | null
  onClose: () => void
  onToggle: (id: string, on: boolean) => void
  onPatch: (id: string, p: Partial<AuthMethod>) => void
  behaviour: MfaValues
  onBehaviour: (p: MfaValues) => void
}) {
  const store = useBrand()
  /* Keyed on the id, not on `m`.

     `m` is recomputed by `methods.find(...)` over an array that every toggle
     replaces wholesale, so it is a new object on each patch even when it is the
     same method. The reset effect below was keyed on `base`, which is memoised
     on `m` — so flipping Enable from inside the drawer changed `m`, recomputed
     `base`, fired the effect and threw away whatever had been typed into the
     form. Keyed on the id it fires when the drawer actually changes method. */
  const mid = m?.id ?? null
  const base = useMemo(() => (mid ? configFor(mid) : null), [mid])

  /* The sheet supersedes some of what the connection form asks for — Grid's
     "Pattern length" is the sheet's grid-length, and the SMS and Email builders
     both ask for a code expiry the sheet now owns as OTP validity. Filtered
     here rather than deleted from method-config.ts, because the other versions
     of this screen still render the full form. */
  const [fields, setFields] = useState<ConfigField[]>(() =>
    (base?.fields ?? []).filter((f) => !configSuppressed(mid ?? '').includes(f.id)),
  )
  useEffect(() => {
    setFields((configFor(mid ?? '')?.fields ?? []).filter((f) => !configSuppressed(mid ?? '').includes(f.id)))
  }, [mid])

  /* Edits are staged in the drawer and committed on save, the same contract the
     connection form already has. `??` and not `||`, so a setting switched off
     is not read as absent and quietly reset to the sheet's default. */
  const [draft, setDraft] = useState<MfaValues>({})
  useEffect(() => setDraft({}), [mid])
  const read = (key: string, fallback: MfaValue): MfaValue => draft[key] ?? behaviour[key] ?? fallback
  const write = (key: string, v: MfaValue) => setDraft((d) => ({ ...d, [key]: v }))

  const family = m ? familyForChannel(m.channel) : undefined
  const famSettings = m ? familySettingsFor(m.channel) : []
  const ownSettings = m ? methodSettingsFor(m.id) : []
  const legacy = (m?.settings ?? []).filter((s) => !legacySuppressed(m?.id ?? '').includes(s.id))
  const kin = m ? siblingsOf(m) : []

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
  const roomy = fields.filter(
    (f) => f.kind === 'list' || f.kind === 'textarea' || f.kind === 'radio',
  ).length
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
                  <Check size={13} strokeWidth={2.6} aria-hidden /> Everything required is filled
                  in.
                </>
              ) : (
                <>
                  <AlertTriangle size={13} strokeWidth={2} aria-hidden />
                  {missing.length} required field
                  {missing.length === 1 ? '' : 's'} still blank —{' '}
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
                /* Family values are committed to the page, not to the method,
                   which is what makes the "also applies to" claim in the shared
                   band true rather than decorative. */
                onBehaviour(draft)
                setDraft({})
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
                <strong>{blocked}.</strong> No policy rule can ask for this method until it is
                resolved.
              </span>
            </p>
          )}

          {/* One line that the live console never says anywhere. Everything
              below configures the method for the whole tenant — the shipping
              "Configure Second Factor" page looks like this and configures the
              signed-in admin's own second factor, so saying which one this is
              is not padding. */}
          <p className="bv5__dwscope">
            <Lock size={12} strokeWidth={2} aria-hidden />
            Tenant-wide. Applies to every user who signs in with this method.
          </p>

          {m.balance && (
            <p className="bv5__dbalance">
              {m.balance.remaining.toLocaleString()} {m.balance.label} remaining — this method draws
              down a purchased balance every time it sends.
            </p>
          )}

          {/* --- This method only ------------------------------------------ */}
          {(ownSettings.length > 0 || legacy.length > 0) && (
            <>
              <p className="bv5__sublabel">This method only</p>
              <div className="bv5__dsettings">
                {ownSettings.map((opt) => (
                  <SettingField
                    key={opt.id}
                    setting={opt}
                    value={read(settingKey('method', m.id, opt.id), opt.field.value)}
                    onChange={(v) => write(settingKey('method', m.id, opt.id), v)}
                    child={{
                      read: (id, fb) => read(settingKey('method', m.id, id), fb),
                      write: (id, v) => write(settingKey('method', m.id, id), v),
                    }}
                  />
                ))}
                {/* What the sheet does not model yet. Two settings survive here
                    — CAC's certificate chain and the grid's clickable mode —
                    and dropping them to make the migration tidy would be losing
                    working controls to make a diagram look better. */}
                {legacy.map((opt) => (
                  <div className="bv5__dsetting" key={opt.id}>
                    <div>
                      <p>{opt.label}</p>
                      {opt.help && <span>{opt.help}</span>}
                    </div>
                    {opt.kind === 'toggle' ? (
                      <Toggle
                        checked={opt.value}
                        label={opt.label}
                        onChange={(v) =>
                          onPatch(m.id, { settings: setSetting(m.settings!, opt.id, v) })
                        }
                      />
                    ) : (
                      <select
                        className="bv5__dselect"
                        aria-label={opt.label}
                        value={opt.value}
                        onChange={(e) =>
                          onPatch(m.id, { settings: setSetting(m.settings!, opt.id, e.target.value) })
                        }
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

          {/* --- Shared across the family ----------------------------------
              Outdented to the panel edges and filled, because the one thing an
              admin must not misread here is scope: these controls change the
              sibling methods too. It says so in words, and then names them —
              a claim you can check beats a claim you have to trust. */}
          {family && famSettings.length > 0 && (
            <section className="bv5__dwband" aria-label={`Shared across ${family.name}`}>
              <p className="bv5__dwband-head">Shared across {family.name}</p>
              <p className="bv5__dwband-scope">
                {kin.length === 0
                  ? `${m.name} is the only method in this family, so these apply to it alone — for now.`
                  : 'Changing these also changes:'}
                {kin.length > 0 && (
                  <span className="bv5__dwband-kin">
                    {kin.map((k) => (
                      <i key={k.id}>{k.name}</i>
                    ))}
                  </span>
                )}
              </p>

              {/* The one method whose family is not where you would guess. It
                  delivers by email as well as SMS but the sheet files it under
                  SMS, so its email leg obeys the SMS code length — not the one
                  set on the Email family. Worth a sentence, because getting it
                  wrong is invisible until a code arrives the wrong length. */}
              {m.id === 'otp-sms-email' && (
                <p className="bv5__dwband-note">
                  This method also sends by email, but it sits in the SMS family — so its email leg
                  follows the SMS length and validity above, not the Email family's.
                </p>
              )}

              <div className="bv5__dsettings">
                {famSettings.map((opt) => (
                  <SettingField
                    key={opt.id}
                    setting={opt}
                    value={read(settingKey('family', family.id, opt.id), opt.field.value)}
                    onChange={(v) => write(settingKey('family', family.id, opt.id), v)}
                    child={{
                      read: (id, fb) => read(settingKey('family', family.id, id), fb),
                      write: (id, v) => write(settingKey('family', family.id, id), v),
                    }}
                  />
                ))}
              </div>

              {family.note && <p className="bv5__dwband-note">{family.note}</p>}
            </section>
          )}

          {/* --- Connection ------------------------------------------------ */}
          <p className="bv5__sublabel">Connection</p>
          <p className="bmc__blurb">
            {base?.blurb ??
              'This method has nothing to connect — it is ready as soon as it is switched on.'}
          </p>
          {base && (
            <ConfigFields
              fields={fields}
              onChange={(id, v) => setFields((f) => setField(f, id, v))}
            />
          )}
        </div>
      )}
    </Drawer>
  )
}

/* One renderer for a sheet setting.

   Deliberately built on the drawer's existing `.bv5__dsetting` row rather than
   a new stylesheet: V7 has its own `.bm7__field` version of this and a third
   look for the same three controls would make the two screens disagree about
   what a setting is. The shape is label + help on the left, control on the
   right, which is what the row already does.

   V7's copy takes `(setting, values, setValues)` and keys internally on
   `setting.id` — the reason SMS and Email share one OTP length there. This one
   is handed a single value and a single setter, so the key is chosen by the
   caller and the component cannot get it wrong. */
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
  {
    match: /minioranges?|mo /i,
    src: '/logos/miniorange.png',
    name: 'miniOrange',
  },
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

function initials(email: string): string {
  const local = email.split('@')[0]
  const parts = local.split(/[._-]+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return local.slice(0, 2).toUpperCase()
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

/* One tone per vendor family, so a column of types is scannable rather than
   three near-identical grey pills. */
function tokenTone(type: string): string {
  if (/yubi/i.test(type)) return 'info'
  if (/display/i.test(type)) return 'accent'
  return 'neutral'
}

/* Exported so the final version can render it rather than own a second copy.

   Recovery is the one tab the brief left alone — "recovery is fine as we have
   in v5" — so the honest way to keep it identical is to render the same
   component, not to reimplement it and hope the two stay in step. */
export function RecoveryTab({ methods }: { methods: AuthMethod[] }) {
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
                    title={
                      blocked
                        ? `${o.sub} Needs Security Questions, which is switched off in Methods.`
                        : o.sub
                    }
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
                          transition={{
                            type: 'spring',
                            stiffness: 700,
                            damping: 32,
                          }}
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
              {kbaOn ? (
                <Check size={13} strokeWidth={2.4} aria-hidden />
              ) : (
                <Lock size={13} strokeWidth={2.2} aria-hidden />
              )}
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
  {
    user: 'mehak.garg@acme.com',
    serial: 'DT-2200-4417',
    type: 'Display Token',
  },
  { user: 'jaspreet.t@acme.com', serial: 'VS-GO6-88201', type: 'Vasco' },
]

function TokensTab() {
  const store = useBrand()
  const [sub, setSub] = useState<'assignments' | 'inventory'>('assignments')
  const [rows, setRows] = useState(SEED_TOKENS)
  const [q, setQ] = useState('')

  const shown = rows.filter(
    (r) =>
      !q ||
      r.user.toLowerCase().includes(q.toLowerCase()) ||
      r.serial.toLowerCase().includes(q.toLowerCase()),
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
          <Button
            size="sm"
            onClick={() => store.showToast('CSV accepts user, serial and token type')}
          >
            <Upload size={13} strokeWidth={1.9} aria-hidden /> Upload CSV
          </Button>
          <Button
            size="sm"
            variant="brand"
            onClick={() => store.showToast('Assign opens the user picker')}
          >
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
