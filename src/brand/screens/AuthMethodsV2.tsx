import { useMemo, useState } from 'react'
import { Search, ShieldAlert, ShieldCheck, Star } from 'lucide-react'

import { NoResults } from '../empty'
import { Button } from '../kit'
import type { Policy } from '../data'
import type { ConfigField } from '../method-config'
import { methodBlocker, type AuthMethod } from '../methods'
import { familySettingsFor, methodSettingsFor, type MfaValues } from '../mfa-join'
import { useBrand } from '../store'
import {
  FAMILIES,
  MethodCard,
  PrimarySignIn,
  SettingsPane,
  SetupModal,
  firstDefaultable,
  type Family,
} from './AuthMethods'
import { MethodIcon, RecoveryTab } from './recovery'
import { UserMethodCard } from './user-config'
import { SEED_ENROLMENT, enrolShapeFor, type UserEnrolment } from '../user-methods'

/* -----------------------------------------------------------------------------
   Authentication methods · v2 — master and detail.

   Same screen, same eleven families, same everything you can do. One change,
   and it is to where the detail lives.

   V1 is a list of eleven cards that opens a slide-over. That shape has two
   costs the brief names directly. The list is a single column of full-width
   rows on a wide screen, so most of the page is margin — eleven cards and a lot
   of nothing either side. And the panel that holds the actual work covers the
   list it came from, so comparing two families means closing one to open the
   other and holding the first in your head.

   Here the categories are a rail on the left and the detail is a pane on the
   right, on the same background. Nothing is covered, the selection is always
   visible, and moving between families is one click with no dismissing. The
   width that was margin is now the pane doing the work.

   What is NOT different: the primary sign-in block, the default-method picker,
   the setup form, the per-method toggles, the family and method settings, the
   search, and the Recovery tab. All of it is the same code — `PrimarySignIn`,
   `MethodCard`, `SettingsPane` and `SetupModal` are
   imported from v1 rather than copied, so a fix to either lands in both and the
   comparison stays honest. Only the arrangement is new, and the tab bar is
   part of that arrangement — see TABS for why “Methods” became two tabs.
   -------------------------------------------------------------------------- */

type Tab = 'primary' | 'other' | 'recovery'

/* Three tabs, each named by the decision it holds.

   “Methods” used to hold two unrelated tenant decisions stacked on one page:
   how a session may START, and which second factors a rule may ASK FOR. The
   first sat on top of the second as a preamble to scroll past, and neither of
   their names was ever on the tab bar — it said “Methods” for both of them, and
   then “Recovery” for a third thing that is also a set of methods.

   Separate questions, asked at separate times, so separate tabs. The order is
   the order a sign-in comes apart in: how you get in, what is asked after that,
   and what happens when neither of those works. */
const TABS: { id: Tab; label: string }[] = [
  { id: 'primary', label: 'Primary sign-in methods' },
  { id: 'other', label: 'Other sign-in methods' },
  { id: 'recovery', label: 'Recovery methods' },
]

/* The states a method can be in, from the tenant's side. `off` is deliberately
   "connected but not reaching anyone" rather than "not enabled": a method that
   was never configured has not been switched off, it has not been started. */
type Status = 'all' | 'enabled' | 'off' | 'setup'

/* The type lives on the store now, because the role decides the chrome too.
   Re-exported here so callers already importing it from this screen keep
   working. */
import type { Role } from '../store'
export type { Role }

export function AuthMethodsV2({ role = 'admin' }: { role?: Role }) {
  const store = useBrand()
  const { methods, setMethods } = useBrand()
  const [tab, setTab] = useState<Tab>('primary')
  const [q, setQ] = useState('')
  /* The one axis the search cannot reach. Search matches names; this matches
     state, which is the question an admin actually arrives with — what is off,
     and what have we never finished connecting. */
  const [status, setStatus] = useState<Status>('all')

  /* The selected family, by channel. Never null — a master-detail layout with
     nothing selected is a page with a permanent hole in it, and there is always
     a sensible first answer. */
  const [channel, setChannel] = useState<string>(FAMILIES[0].channel)

  const [behaviour, setBehaviour] = useState<MfaValues>({})
  const [defaultMethod, setDefaultMethod] = useState<string | null>(() =>
    firstDefaultable(methods),
  )
  const [setupOf, setSetupOf] = useState<AuthMethod | null>(null)
  const [savedConfig, setSavedConfig] = useState<Record<string, ConfigField[]>>({})

  /* The person's own enrolment, which is a different thing from the tenant's
     configuration and is why this cannot be one piece of state with a flag on
     it. The admin decides a method may exist; this records whether THIS person
     has set it up and which one of theirs actually runs. */
  const [enrolment, setEnrolment] = useState<UserEnrolment>(SEED_ENROLMENT)
  /* One card open at a time, matching the live end-user page. */
  const [openCard, setOpenCard] = useState<string | null>(null)

  const isUser = role === 'user'

  /* Which pane is on screen. A person has no tab bar to change it with and no
     business in either of the other two — both are tenant policy — so their
     side is pinned to the catalogue rather than left following a `tab` they can
     neither see nor set. */
  const showing: Tab = isUser ? 'other' : tab

  /* What a person is allowed to see. `methodBlocker` already answers exactly
     this question — it returns a reason whenever a method is unconfigured,
     switched off, or not offered to end users — so the user view is the
     catalogue with everything blocked removed, and nothing else. */
  const visible = useMemo(
    () => (isUser ? methods.filter((m) => !methodBlocker(m)) : methods),
    [methods, isUser],
  )

  /* Read off methodBlocker rather than re-derived, so the filter and the reason
     a card shows as unavailable can never disagree. */
  const passes = (m: AuthMethod) => {
    if (status === 'all') return true
    if (status === 'setup') return !m.configured
    if (status === 'enabled') return methodBlocker(m) === null
    /* Configured, so somebody finished the connection, but not reaching anyone
       — switched off for the tenant or not offered to end users. */
    return m.configured && methodBlocker(m) !== null
  }

  const activate = (id: string, on: boolean) => {
    /* One active method at a time. Switching one on switches the last one off
       rather than adding to a set — the live page names a single "Active
       Method" above the list, and two actives would make that line a lie. */
    setEnrolment((e) => ({ ...e, active: on ? id : e.active === id ? null : e.active }))
    const m = methods.find((x) => x.id === id)
    if (m) store.showToast(on ? `${m.name} is now your active method` : `${m.name} switched off`)
  }

  const saveEnrolment = (id: string, values: Record<string, string>) => {
    const first = !enrolment.configured.includes(id)
    setEnrolment((e) => ({
      ...e,
      configured: first ? [...e.configured, id] : e.configured,
      values: { ...e.values, [id]: values },
      /* Your first method becomes the active one on its own. Finishing setup
         and still not being covered is a state nobody wants to be left in. */
      active: e.active ?? id,
    }))
    const m = methods.find((x) => x.id === id)
    if (m) store.showToast(first ? `${m.name} is set up` : `${m.name} updated`)
  }

  const setEnabled = (id: string, on: boolean) => {
    setMethods((all) => all.map((m) => (m.id === id ? { ...m, active: on, allowed: on } : m)))
    if (!on && defaultMethod === id) setDefaultMethod(firstDefaultable(methods, id))
  }

  const finishSetup = (m: AuthMethod, fields: ConfigField[]) => {
    const first = !m.configured
    setSavedConfig((prev) => ({ ...prev, [m.id]: fields }))
    setMethods((all) => all.map((x) => (x.id === m.id ? { ...x, configured: true } : x)))
    setSetupOf(null)
    store.showToast(
      first ? `${m.name} configured — it can be switched on now` : `${m.name} settings updated`,
    )
  }

  /* One row per family, with the two numbers the rail has room for. Search
     matches the family name and the methods inside it, so "yubikey" finds
     Hardware Token without the admin knowing which family it is filed under. */
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return FAMILIES.map((f) => {
      const inside = visible.filter((m) => m.channel === f.channel)
      return {
        f,
        total: inside.length,
        live: inside.filter((m) => !methodBlocker(m)).length,
        /* The starred family is whichever holds "the one" — and "the one"
           is a different method for each role. An admin is looking for the
           tenant default a rule falls back to; a person is looking for the
           method that actually runs when they sign in. Same mark, same
           meaning (this is the one), different underlying fact. */
        holdsDefault: inside.some((m) => m.id === (isUser ? enrolment.active : defaultMethod)),
        /* Search and filter narrow the same way: a family survives if it
           still holds a method that satisfies both. */
        hit:
          (!needle ||
            f.channel.toLowerCase().includes(needle) ||
            inside.some((m) => m.name.toLowerCase().includes(needle))) &&
          inside.some(passes),
      }
      /* A family the admin has emptied is not a family with nothing in it, it
         is a family that does not apply here. */
    }).filter((r) => r.hit && (r.total > 0 || !isUser))
  }, [visible, q, status, defaultMethod, isUser, enrolment.active])

  /* The selected family, but only if the viewer can actually see it.

     `channel` starts at the first family in the catalogue, which is SMS — and
     an end user whose tenant does not offer SMS was landed on a pane headed
     "SMS · 0 of 0 set up · No methods in this group yet", for a family with no
     row in their own rail to explain where it came from. The fallback is the
     first family they DO have, and it also covers an admin disabling the last
     method in whatever family happens to be open.

     Keyed on role and filter, but NOT on the search. A filter is one
     deliberate choice, so moving the pane to a family that still has matches is
     help; the search fires per keystroke, and following that would yank the
     pane around as you typed. */
  const reachable = FAMILIES.filter(
    (f) => visible.some((m) => m.channel === f.channel && passes(m)) || (!isUser && status === 'all'),
  )
  const family = reachable.find((f) => f.channel === channel) ?? reachable[0] ?? FAMILIES[0]

  return (
    <div className="bpage bm8 bm2">
      <header className="bm8__head">
        <h1>{isUser ? 'Two-step verification' : 'Authentication methods'}</h1>
        <p>
          {isUser
            ? 'How you prove it is you, after your password. Set up as many as you like — one of them runs.'
            : 'Choose how people prove who they are. Anything you enable here can be named by a policy rule.'}
        </p>
      </header>

      {/* The person's one active method, stated before the catalogue rather
          than found inside it. The live page puts it in the same place, and it
          is the answer to the only question most visits are asking. */}
      {isUser && (
        <ActiveMethod
          methods={methods}
          enrolment={enrolment}
          onManage={(m) => {
            /* Select the family that holds it and open its card, so the panel
               is a way into the list rather than a label above it. No card to
               open where the method asks for nothing — opening one on an
               empty form is a click that lands on nothing. */
            setChannel(m.channel)
            setOpenCard(enrolShapeFor(m.id).kind === 'none' ? null : m.id)
          }}
        />
      )}

      {/* Every tab on this bar is the tenant’s, so a person gets none of the
          bar. Primary sign-in and recovery are both tenant policy, and what is
          left on their side is the one catalogue of their own methods — a tab
          bar holding a single tab is furniture describing a choice that no
          longer exists. */}
      {!isUser && (
        <div className="bm8__tabbar" role="tablist" aria-label="Authentication methods">
          {TABS.map((t) => (
            <button
              key={t.id}
              id={`bm8tab-${t.id}`}
              role="tab"
              type="button"
              aria-selected={tab === t.id}
              aria-controls={`bm8pane-${t.id}`}
              className={`bm8__tab ${tab === t.id ? 'is-on' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* One pane whichever tab is showing, and it names the tab it belongs to.
          That wiring is what lets the sections inside drop their own headings:
          the tab is the heading now, and a screen reader arrives in the pane
          already told which one it landed in. */}
      <div
        className="bm8__pane"
        role={isUser ? undefined : 'tabpanel'}
        id={isUser ? undefined : `bm8pane-${showing}`}
        aria-labelledby={isUser ? undefined : `bm8tab-${showing}`}
      >
        {/* Tenant-wide, and a tab of its own rather than a block stacked above
            the catalogue. It was never a property of a category — which is why
            it could not go in either column — but sitting on top of eleven of
            them made the tenant’s first decision read as a preamble to scroll
            past on the way to the list. */}
        {showing === 'primary' && <PrimarySignIn heading={false} />}

        {showing === 'other' && (
          <>
            {/* The section head is gone, and the controls that narrowed what
                sat under it are all that is left of the row.

                The heading went first: the tab above says “Other sign-in
                methods” already. That left a sentence explaining the heading
                and a chip counting it, both describing a title no longer on
                screen — two lines of preamble answering a question the tab had
                answered before the pane opened.

                The search stays, and stays here rather than in the rail, where
                it read as though it searched the families. It does not: it
                matches method names as well, so “yubikey” finds Hardware
                Token. */}
            <div className="bm8__sectools">
              <label className="bm2__search">
                <Search size={14} strokeWidth={1.9} aria-hidden />
                <input
                  type="text"
                  value={q}
                  placeholder="Search methods…"
                  aria-label="Search methods"
                  onChange={(e) => setQ(e.target.value)}
                />
              </label>

              {/* Admin only. The states it names — never configured, switched
                  off for the tenant — are the tenant's, and a person cannot see
                  a method in either of them anyway. */}
              {!isUser && (
                <select
                  aria-label="Filter by status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as Status)}
                  className={`btoolbar__select ${status !== 'all' ? 'is-set' : ''}`}
                >
                  <option value="all">All statuses</option>
                  <option value="enabled">Enabled</option>
                  <option value="off">Switched off</option>
                  <option value="setup">Needs setup</option>
                </select>
              )}

              {/* Only once something is filtered — a permanent Clear that
                  clears nothing is one more thing to read. */}
              {(status !== 'all' || q) && (
                <button
                  type="button"
                  className="btoolbar__clear"
                  onClick={() => {
                    setStatus('all')
                    setQ('')
                  }}
                >
                  Clear
                </button>
              )}
            </div>

            <div className="bm2__split">
              {/* "All methods", not "Categories": the rail is the catalogue,
                  and naming it after the filing scheme made eleven rows sound
                  like a layer to get past rather than the thing itself. */}
              {/* The accessible name follows the same rule the visible heading
                  does: "other" only means something against a primary, and a
                  person is not shown one. Leaving it here would put the problem
                  one layer down, where only a screen reader hits it. */}
              <nav className="bm2__rail" aria-label={isUser ? 'Your sign-in methods' : 'Other sign-in methods'}>
                {rows.length === 0 ? (
                  <NoResults>Nothing matches “{q}”.</NoResults>
                ) : (
                  /* Compared against the EFFECTIVE family, not the raw `channel`
                     state: when the stored channel is one this viewer cannot
                     reach, the pane falls back to another and the rail has to
                     agree with it, or the list renders with nothing selected
                     beside a pane that is clearly showing something. */
                  rows.map(({ f, total, live, holdsDefault }) => (
                    <button
                      key={f.channel}
                      type="button"
                      aria-current={f.channel === family.channel || undefined}
                      className={`bm2__railitem ${f.channel === family.channel ? 'is-on' : ''}`}
                      onClick={() => setChannel(f.channel)}
                    >
                      <span className={`bm8__tile bm8__tile--sm is-${f.tint}`} aria-hidden>
                        <f.icon size={15} strokeWidth={1.8} />
                      </span>
                      <span className="bm2__railname">
                        {f.channel}
                        {f.isNew && <i className="bm8__new">New</i>}
                      </span>
                      {/* The default lives in exactly one family, and knowing
                          which one without opening anything is the whole reason
                          the rail carries marks at all. */}
                      {holdsDefault && (
                        <Star size={11} strokeWidth={2.4} className="bm2__raildefault" aria-hidden />
                      )}
                      <i className={`bm2__railcount ${live > 0 ? 'is-on' : ''}`}>
                        {live}/{total}
                      </i>
                    </button>
                  ))
                )}
              </nav>

              <section className="bm2__detail" aria-live="polite">
                <FamilyDetail
                  family={family}
                  methods={visible}
                  policies={store.policies}
                  defaultMethod={defaultMethod}
                  behaviour={behaviour}
                  onBehaviour={setBehaviour}
                  onToggle={setEnabled}
                  onSetup={setSetupOf}
                  onMakeDefault={setDefaultMethod}
                  passes={passes}
                  role={role}
                  enrolment={enrolment}
                  openCard={openCard}
                  onOpenCard={setOpenCard}
                  onActivate={activate}
                  onSaveEnrolment={saveEnrolment}
                />
              </section>
            </div>
          </>
        )}

        {/* The one tab the brief left alone, rendered rather than rebuilt. */}
        {showing === 'recovery' && <RecoveryTab methods={methods} />}
      </div>

      <SetupModal
        method={setupOf}
        saved={savedConfig}
        onClose={() => setSetupOf(null)}
        onSave={finishSetup}
      />
    </div>
  )
}

/* -----------------------------------------------------------------------------
   The one method that runs.

   This was a line: the words “Active method” and the name in a pill, above the
   catalogue. It named the right thing and then said nothing else about it —
   and it is the answer to the question almost every visit to this page is
   actually asking, sitting at a weight below the search box.

   So it is a section now, carrying the three facts the list underneath cannot
   state about the one method that matters:

     · WHICH — the vendor mark and the name, at the size of a decision rather
       than a caption, with the phishing-resistant badge where the method earns
       it.
     · WHERE — the address or serial this person actually enrolled. A code is
       no use going to a mailbox they stopped reading, and nobody opens a card
       to check something they believe is already right.
     · WHAT IF NOT — whether anything else is set up. One method and no backup
       is a lockout waiting for a lost phone, and it is invisible in a list
       where every enrolled card looks the same.

   Nothing active is not a quieter version of this panel, it is the opposite of
   it, so it does not render as an empty value in the same frame — same shape,
   notice colours, and a sentence saying what that leaves standing in front of
   the account.
   -------------------------------------------------------------------------- */

/* The shapes whose stored value is an ADDRESS — where a challenge is sent, or
   which token is yours. Security Questions keeps its answers under the same
   key, and the whole point of an answer is that it is not printed across the
   top of the page; the enrolment ceremonies keep codes there. Neither is shown,
   because neither is a fact about where the method reaches you. */
const ADDRESS_SHAPES = new Set(['phone', 'email', 'alt-email', 'phone-and-email', 'token'])

function ActiveMethod({
  methods,
  enrolment,
  onManage,
}: {
  methods: AuthMethod[]
  enrolment: UserEnrolment
  onManage: (m: AuthMethod) => void
}) {
  const m = methods.find((x) => x.id === enrolment.active) ?? null

  /* Counted against the catalogue, not against the enrolment list alone: a
     method the admin has withdrawn since is still in `configured` and is not
     something anyone can fall back on. */
  const backups = enrolment.configured.filter(
    (id) => id !== enrolment.active && methods.some((x) => x.id === id),
  ).length

  const shape = m ? enrolShapeFor(m.id) : null
  const address =
    m && shape && ADDRESS_SHAPES.has(shape.kind)
      ? Object.values(enrolment.values[m.id] ?? {})
          .filter(Boolean)
          .join(' · ')
      : ''

  if (!m) {
    return (
      <div className="bmu__hero bmu__hero--none">
        <span className="bmu__heroalert" aria-hidden>
          <ShieldAlert size={26} strokeWidth={1.7} />
        </span>
        <div className="bmu__herobody">
          <p className="bmu__heroeyebrow">Active method</p>
          <h2 className="bmu__heroname">Nothing runs yet</h2>
          <p className="bmu__heroblurb">
            Set one of these up and switch it on. Until you do, your password is the only thing
            standing in front of this account.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="bmu__hero">
      {/* The same mark the card below carries, at four times the size. A method
          should look like itself wherever it appears, and this is the one place
          on the page with room to say so properly. */}
      <span className="bm8__tile bm8__tile--logo bmu__herotile" aria-hidden>
        <MethodIcon name={m.name} size={56} />
      </span>

      <div className="bmu__herobody">
        <p className="bmu__heroeyebrow">
          <i className="bmu__herodot" aria-hidden />
          Active method
        </p>

        <h2 className="bmu__heroname">
          {m.name}
          {m.tier === 'Phishing-resistant' && (
            <i className="bm8__badge">
              <ShieldCheck size={11} strokeWidth={2.2} aria-hidden />
              Phishing-resistant
            </i>
          )}
        </h2>
        <p className="bmu__heroblurb">{m.description}</p>

        <dl className="bmu__herofacts">
          {address && (
            <div>
              <dt>{shape?.label ?? 'Sent to'}</dt>
              <dd>{address}</dd>
            </div>
          )}
          {/* Stated whichever way it falls. “Nothing else” is the more useful
              of the two answers and the one a list of identical cards hides. */}
          <div className={backups === 0 ? 'is-warn' : undefined}>
            <dt>Backup</dt>
            <dd>
              {backups === 0
                ? 'Nothing else is set up'
                : `${backups} other method${backups === 1 ? '' : 's'} ready`}
            </dd>
          </div>
        </dl>
      </div>

      <div className="bmu__heroside">
        <Button size="sm" variant="secondary" onClick={() => onManage(m)}>
          Manage
        </Button>
      </div>
    </div>
  )
}

/* The right-hand pane: everything the v1 slide-over held, minus the slide-over.

   Same header block, same Methods/Settings tabs, same rows — it is the drawer's
   body with the drawer taken off, which is the point of the comparison. */
function FamilyDetail({
  family,
  methods,
  policies,
  defaultMethod,
  behaviour,
  onBehaviour,
  onToggle,
  onSetup,
  onMakeDefault,
  passes,
  role,
  enrolment,
  openCard,
  onOpenCard,
  onActivate,
  onSaveEnrolment,
}: {
  family: Family
  methods: AuthMethod[]
  policies: Policy[]
  defaultMethod: string | null
  behaviour: MfaValues
  onBehaviour: (p: MfaValues) => void
  onToggle: (id: string, on: boolean) => void
  onSetup: (m: AuthMethod) => void
  onMakeDefault: (id: string) => void
  passes: (m: AuthMethod) => boolean
  role: Role
  enrolment: UserEnrolment
  openCard: string | null
  onOpenCard: (id: string | null) => void
  onActivate: (id: string, on: boolean) => void
  onSaveEnrolment: (id: string, values: Record<string, string>) => void
}) {
  const isUser = role === 'user'
  const [pane, setPane] = useState<'methods' | 'settings'>('methods')
  const inside = methods.filter((m) => m.channel === family.channel)
  const live = inside.filter((m) => !methodBlocker(m)).length
  const enrolled = inside.reduce((n, m) => n + (m.enrolled ?? 0), 0)
  const unconfigured = inside.filter((m) => !m.configured).length

  /* What the family has left to spend, which v2 was dropping on the floor.

     v1 puts this on the category row: a tag reading "No transactions left" in
     the corner of every family that costs money to send through. It is the one
     fact on that screen that can make a switched-on, fully configured method
     silently do nothing, and it did not survive the move to a rail — eleven
     names, two counts and a star already fill that column, and a fourth thing
     on it would push the name to wrap.

     So it moves here, where there is width for it and where a person has
     already said which family they are asking about.

     Bought as a pool, and one pool is spent through several methods — OTP over
     SMS and SMS Link both draw on "SMS transactions" — so it is keyed by the
     pool's own name and counted once rather than once per method that can
     spend it. Families that cost nothing to send have no pool and get no tag,
     which is why this is a list and not a number that is sometimes zero. */
  const pools = new Map<string, number>()
  for (const m of inside) if (m.balance) pools.set(m.balance.label, m.balance.remaining)

  const shown = inside.filter(passes)
  const mine = inside.filter((m) => enrolment.configured.includes(m.id)).length
  const holdsActive = inside.some((m) => m.id === enrolment.active)

  const famSettings = familySettingsFor(family.channel)
  const ownSettings = inside
    .map((m) => ({ m, settings: methodSettingsFor(m.id) }))
    .filter((x) => x.settings.length > 0)
  /* Family and per-method settings are the tenant's configuration — retry
     limits, token length, which gateway. None of it is a person's to change,
     so the Settings tab does not exist on their side. */
  const hasSettings = !isUser && (famSettings.length > 0 || ownSettings.length > 0)

  return (
    <>
      <div className={`bm8__dwhead is-${family.tint}`}>
        <span className="bm8__dwtile" aria-hidden>
          <family.icon size={22} strokeWidth={1.7} />
        </span>
        <div className="bm8__dwtext">
          <h2>{family.channel}</h2>
          <p>{family.blurb}</p>
          {/* Two different questions, so two different readouts. An admin is
              asking how much of this family is in play across the tenant; a
              person is asking which of these they have set up and whether one
              of them is the one that runs. Showing an admin's counts to a
              person would be showing them somebody else's numbers. */}
          <div className="bm8__dwstats">
            {isUser ? (
              <>
                <span>
                  <strong>{mine}</strong> of {inside.length} set up
                </span>
                {holdsActive && <span className="is-live">Your active method is here</span>}
              </>
            ) : (
              <>
                <span>
                  <strong>{live}</strong> of {inside.length} enabled
                </span>
                <span>
                  <strong>{enrolled.toLocaleString()}</strong> enrolled
                </span>
                {unconfigured > 0 && (
                  <span className="is-warn">
                    <strong>{unconfigured}</strong> need setup
                  </span>
                )}

                {/* Last, and the only one of these that is coloured, because it
                    is the only one that can be an emergency: the other three
                    describe how much of the family is set up, and this one says
                    whether any of it can actually send tonight.

                    The pool is named only where a family has more than one, so
                    the usual case keeps v1's wording rather than repeating the
                    family name that is already the heading above it. */}
                {[...pools].map(([label, remaining]) => {
                  const what = pools.size > 1 ? label : 'transactions'
                  return (
                    <span
                      key={label}
                      title={label}
                      className={`bm8__txn ${
                        remaining === 0 ? 'is-empty' : remaining <= 50 ? 'is-low' : ''
                      }`}
                    >
                      {remaining === 0
                        ? `No ${what} left`
                        : `${remaining.toLocaleString()} ${what} left`}
                    </span>
                  )
                })}
              </>
            )}
          </div>
        </div>
      </div>

      {hasSettings && (
        <div className="bm8__dwtabs" role="tablist" aria-label={`${family.channel} panes`}>
          <button
            role="tab"
            type="button"
            aria-selected={pane === 'methods'}
            className={`bm8__dwtab ${pane === 'methods' ? 'is-on' : ''}`}
            onClick={() => setPane('methods')}
          >
            Methods <em>{inside.length}</em>
          </button>
          <button
            role="tab"
            type="button"
            aria-selected={pane === 'settings'}
            className={`bm8__dwtab ${pane === 'settings' ? 'is-on' : ''}`}
            onClick={() => setPane('settings')}
          >
            Settings{' '}
            <em>{famSettings.length + ownSettings.reduce((n, x) => n + x.settings.length, 0)}</em>
          </button>
        </div>
      )}

      {pane === 'methods' || !hasSettings ? (
        <>
          {/* The filter narrows the CARDS, not the counts above them. "0 of 3
              enabled" is a fact about the family and stays true whatever is
              being filtered for; showing 0 of 0 while three rows exist would be
              the readout describing the filter instead of the family. */}
          <div className="bm8__list">
            {shown.map((m) =>
              isUser ? (
                <UserMethodCard
                  key={m.id}
                  m={m}
                  enrolled={enrolment.configured.includes(m.id)}
                  isActive={enrolment.active === m.id}
                  values={enrolment.values[m.id] ?? {}}
                  open={openCard === m.id}
                  onOpen={(o) => onOpenCard(o ? m.id : null)}
                  onActivate={(on) => onActivate(m.id, on)}
                  onSave={(v) => onSaveEnrolment(m.id, v)}
                />
              ) : (
                <MethodCard
                  key={m.id}
                  m={m}
                  policies={policies}
                  onToggle={onToggle}
                  isDefault={defaultMethod === m.id}
                  onSetup={onSetup}
                  onMakeDefault={onMakeDefault}
                />
              ),
            )}
          </div>
          {inside.length === 0 && <NoResults>No methods in this group yet.</NoResults>}
          {inside.length > 0 && shown.length === 0 && (
            <NoResults>Nothing in this group matches the filter.</NoResults>
          )}
        </>
      ) : (
        <SettingsPane
          family={family}
          famSettings={famSettings}
          ownSettings={ownSettings}
          behaviour={behaviour}
          onBehaviour={onBehaviour}
        />
      )}
    </>
  )
}
