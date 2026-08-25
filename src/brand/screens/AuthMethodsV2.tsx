import { useMemo, useState } from 'react'
import { Search, Star } from 'lucide-react'

import { NoResults } from '../empty'
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
import { RecoveryTab } from './recovery'
import { UserMethodCard } from './user-config'
import { SEED_ENROLMENT, type UserEnrolment } from '../user-methods'

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
   comparison stays honest. Only the arrangement is new.
   -------------------------------------------------------------------------- */

type Tab = 'methods' | 'recovery'

/* The type lives on the store now, because the role decides the chrome too.
   Re-exported here so callers already importing it from this screen keep
   working. */
import type { Role } from '../store'
export type { Role }

export function AuthMethodsV2({ role = 'admin' }: { role?: Role }) {
  const store = useBrand()
  const { methods, setMethods } = useBrand()
  const [tab, setTab] = useState<Tab>('methods')
  const [q, setQ] = useState('')

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

  /* What a person is allowed to see. `methodBlocker` already answers exactly
     this question — it returns a reason whenever a method is unconfigured,
     switched off, or not offered to end users — so the user view is the
     catalogue with everything blocked removed, and nothing else. */
  const visible = useMemo(
    () => (isUser ? methods.filter((m) => !methodBlocker(m)) : methods),
    [methods, isUser],
  )

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
        hit:
          !needle ||
          f.channel.toLowerCase().includes(needle) ||
          inside.some((m) => m.name.toLowerCase().includes(needle)),
      }
      /* A family the admin has emptied is not a family with nothing in it, it
         is a family that does not apply here. */
    }).filter((r) => r.hit && (r.total > 0 || !isUser))
  }, [visible, q, defaultMethod, isUser, enrolment.active])

  /* The selected family, but only if the viewer can actually see it.

     `channel` starts at the first family in the catalogue, which is SMS — and
     an end user whose tenant does not offer SMS was landed on a pane headed
     "SMS · 0 of 0 set up · No methods in this group yet", for a family with no
     row in their own rail to explain where it came from. The fallback is the
     first family they DO have, and it also covers an admin disabling the last
     method in whatever family happens to be open.

     Keyed on what is reachable rather than on the filtered rows: those are
     narrowed by the search box too, and falling back on those would yank the
     detail pane to a different family as you typed. */
  const reachable = FAMILIES.filter((f) => !isUser || visible.some((m) => m.channel === f.channel))
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
          than found inside it. The live page puts this line in the same place,
          and it is the answer to the only question most visits are asking. */}
      {isUser && (
        <p className="bmu__active">
          Active method
          <strong>{methods.find((m) => m.id === enrolment.active)?.name ?? 'None yet'}</strong>
        </p>
      )}

      {/* Recovery is a tenant policy, not a personal setting, so a person does
          not get the tab at all — a single-tab tab bar is furniture describing a
          choice that no longer exists. */}
      {!isUser && (
      <div className="bm8__tabbar" role="tablist" aria-label="Authentication methods">
        {(['methods', 'recovery'] as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={tab === t}
            className={`bm8__tab ${tab === t ? 'is-on' : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'methods' ? 'Methods' : 'Recovery'}
          </button>
        ))}
      </div>
      )}

      {tab === 'methods' || isUser ? (
        <div className="bm8__pane">
          {/* Both tenant-wide, so both stay full width above the split. They
              are not properties of a category and putting them in either column
              would file them under one — and neither is a person's to set. */}
          {!isUser && <PrimarySignIn />}

          <div className="bm2__split">
            {/* Spans the split, because it is a fact about the whole
                catalogue rather than about the selected family — but it sits
                INSIDE it, under the same argument as v1: the fallback cannot be
                understood before the things it falls back to. */}
            {/* "All methods", not "Categories": the rail is the catalogue,
                and naming it after the filing scheme made eleven rows sound
                like a layer to get past rather than the thing itself. */}
            <nav className="bm2__rail" aria-label="All methods">
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
                role={role}
                enrolment={enrolment}
                openCard={openCard}
                onOpenCard={setOpenCard}
                onActivate={activate}
                onSaveEnrolment={saveEnrolment}
              />
            </section>
          </div>
        </div>
      ) : (
        <div className="bm8__pane">
          <RecoveryTab methods={methods} />
        </div>
      )}

      <SetupModal
        method={setupOf}
        saved={savedConfig}
        onClose={() => setSetupOf(null)}
        onSave={finishSetup}
      />
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
          <div className="bm8__list">
            {inside.map((m) =>
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
