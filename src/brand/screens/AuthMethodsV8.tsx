import { useMemo, useState } from 'react'
import {
  ChevronRight,
  CreditCard,
  Fingerprint,
  Grid3x3,
  HelpCircle,
  KeyRound,
  Mail,
  MessageSquare,
  Phone,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'

import { Button, Drawer, Toggle } from '../kit'
import { methodBlocker, type AuthMethod } from '../methods'
import { useBrand } from '../store'
import type { Policy } from '../data'
import { MethodIcon, RecoveryTab } from './AuthMethodsV5'
import { SettingField } from '../setting-field'
import { familySettingsFor, methodSettingsFor, settingKey, type MfaValue, type MfaValues } from '../mfa-join'
import type { MfaSetting } from '../mfa-settings'

/* -----------------------------------------------------------------------------
   Authentication methods · final.

   Two decisions separate this from every earlier version, and both came from
   looking at two real screens side by side.

   FIRST, the shape. The shipping console files eleven families down a vertical
   rail and then shows you every method in the tenant at once; our V5 put
   twenty-one methods in one flat table. Both make you read the whole catalogue
   to answer a question about one family. Here the Methods tab is a list of
   ELEVEN CATEGORIES and nothing else — you pick the family you came for, and
   the methods inside it slide over. Eleven rows you can take in at a glance
   beats twenty-one you have to filter.

   SECOND, the depth. Enable and disable live in the slide-over, next to the
   method they act on, not on the category. A toggle on a category would have to
   mean "all of them", which is a decision nobody wants to make by accident.

   The visual language is lifted from the deployed prototype's V2 — 72px rows, a
   36px colour tile, the usage line under the name, the count chip in the
   section head, and the slide-over the variation is named after — with the tab
   bar turned horizontal, which is the one change the brief asked for. Colours come from the tint tokens rather than inline
   hex, because the prototype's palette is light-theme only.

   Two tabs, because the brief says two: Methods and Recovery. Recovery renders
   V5's component unchanged.
   -------------------------------------------------------------------------- */

type Tab = 'methods' | 'recovery'

const TABS: { id: Tab; label: string }[] = [
  { id: 'methods', label: 'Methods' },
  { id: 'recovery', label: 'Recovery' },
]

/* The eleven families, in the order the shipping console's rail lists them, so
   an admin moving between the two screens finds them in the same place. */
interface Family {
  channel: string
  blurb: string
  icon: LucideIcon
  tint: string
}

const FAMILIES: Family[] = [
  { channel: 'SMS', blurb: 'One-time codes and links sent to the phone number on the account.', icon: MessageSquare, tint: 'green' },
  { channel: 'Email', blurb: 'One-time codes and links sent to a mailbox the user already reads.', icon: Mail, tint: 'blue' },
  { channel: 'Authenticator App', blurb: 'Time-based codes from Google, Microsoft or Authy — no network needed.', icon: Smartphone, tint: 'teal' },
  { channel: 'miniOrange Authenticator', blurb: 'Our own app: push approval, a code, or a barcode scan.', icon: Sparkles, tint: 'indigo' },
  { channel: 'Call Verification', blurb: 'An automated voice call reading the code aloud.', icon: Phone, tint: 'amber' },
  { channel: 'Hardware Token', blurb: 'A physical device the user carries and the tenant assigns.', icon: KeyRound, tint: 'slate' },
  { channel: 'Security Questions', blurb: 'Answers the user set at enrolment. Weak alone, useful as a fallback.', icon: HelpCircle, tint: 'slate' },
  { channel: 'Biometric', blurb: 'Bound to the device and the origin. Nothing to type, nothing to intercept.', icon: Fingerprint, tint: 'indigo' },
  { channel: 'Grid Pattern', blurb: 'A personal grid card; the user reads a remembered path off it.', icon: Grid3x3, tint: 'teal' },
  { channel: 'RSA Authenticator', blurb: 'SecurID tokencodes, softtokens and push, via RSA Authentication Manager.', icon: ShieldCheck, tint: 'slate' },
  { channel: 'Smart Cards', blurb: 'A certificate on a physical card, presented by the browser.', icon: CreditCard, tint: 'blue' },
]

export function AuthMethodsV8() {
  const store = useBrand()
  const [tab, setTab] = useState<Tab>('methods')
  /* The open category, by channel. Null closes the slide-over. */
  const [openChannel, setOpenChannel] = useState<string | null>(null)
  /* From the store, not the module: enrolment counts move with the tenant,
     and a screen holding its own copy would keep the old tenant's numbers the
     moment the persona changes underneath it. */
  const { methods, setMethods } = useBrand()
  /* The sheet's settings. Flat and keyed by scope+owner+id, because 'otp-length'
     exists under both SMS and Email and a bare id would make them share one. */
  const [behaviour, setBehaviour] = useState<MfaValues>({})

  /* Enabling writes both fields. `methodBlocker` reads `active` AND `allowed`,
     so writing only one leaves a method reporting "Not offered to end users"
     with nothing on this screen able to clear it. */
  const setEnabled = (id: string, on: boolean) =>
    setMethods((all) => all.map((m) => (m.id === id ? { ...m, active: on, allowed: on } : m)))

  const open = openChannel ? FAMILIES.find((f) => f.channel === openChannel) ?? null : null

  return (
    <div className="bpage bm8">
      <header className="bm8__head">
        <h1>Authentication methods</h1>
        <p>Choose how people prove who they are. Anything you enable here can be named by a policy rule.</p>
      </header>

      {/* Horizontal, per the brief. V5 ran these down the left, which reads as
          navigation between screens; across the top they read as two views of
          one screen, which is what they are. */}
      <div className="bm8__tabbar" role="tablist" aria-label="Authentication methods">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            className={`bm8__tab ${tab === t.id ? 'is-on' : ''}`}
            onClick={() => {
              setTab(t.id)
              setOpenChannel(null)
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Rendered inside a `bv5` wrapper on purpose.

          Recovery is V5's component unchanged, and six rules in
          auth-methods-v5.css are written as `.bv5 .bv5__x` rather than
          `.bv5__x` — a deliberate specificity bump there, and a silent
          style regression here if the ancestor is missing. Handing the
          component the scope it was written under is cheaper and safer than
          auditing which of its nested inputs happen to need it today, and it
          cannot drift when that file changes. */}
      {tab === 'recovery' && (
        <div className="bv5">
          <RecoveryTab methods={methods} />
        </div>
      )}

      {/* The list stays put and the category slides over it.

          It was an inner page for one commit, and a page is the wrong weight
          for this: opening a category is a peek at three or four rows, and
          making it a navigation event means the eleven you were comparing
          disappear to show you a list that fits in a corner of them. The
          slide-over keeps the wall of categories on screen behind it, so
          closing costs nothing and there is no "where was I". */}
      {tab === 'methods' && (
        <>
          <CategoryList methods={methods} onOpen={setOpenChannel} />
          <CategoryDrawer
            family={open}
            methods={methods}
            policies={store.policies}
            onClose={() => setOpenChannel(null)}
            onToggle={setEnabled}
            behaviour={behaviour}
            onBehaviour={(p) => setBehaviour((v) => ({ ...v, ...p }))}
          />
        </>
      )}
    </div>
  )
}

/* --- The category list -------------------------------------------------------- */

function CategoryList({
  methods,
  onOpen,
}: {
  methods: AuthMethod[]
  onOpen: (channel: string) => void
}) {
  const [q, setQ] = useState('')

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return FAMILIES.map((f) => {
      const inside = methods.filter((m) => m.channel === f.channel)
      const live = inside.filter((m) => !methodBlocker(m))
      return {
        f,
        total: inside.length,
        live: live.length,
        enrolled: inside.reduce((n, m) => n + (m.enrolled ?? 0), 0),
      }
    }).filter(
      (r) =>
        !needle ||
        r.f.channel.toLowerCase().includes(needle) ||
        /* Searching for a method should find the family holding it — otherwise
           typing "passkey" on a screen of eleven categories finds nothing and
           reads as "we do not have that". */
        methods.some((m) => m.channel === r.f.channel && m.name.toLowerCase().includes(needle)),
    )
  }, [methods, q])

  const liveFamilies = rows.filter((r) => r.live > 0).length

  return (
    <div className="bm8__pane">
      <div className="bm8__sechead">
        <div>
          <h2>Categories</h2>
          <p>Eleven ways to prove an identity. Open one to turn its methods on or off.</p>
        </div>
        <span className="bm8__chip">
          {liveFamilies} of {FAMILIES.length} in use
        </span>
      </div>

      <label className="bm8__search">
        <Search size={15} strokeWidth={1.9} aria-hidden />
        <input
          type="text"
          value={q}
          placeholder="Search categories or methods…"
          aria-label="Search categories or methods"
          onChange={(e) => setQ(e.target.value)}
        />
      </label>

      <div className="bm8__list">
        {rows.map(({ f, total, live, enrolled }) => (
          <button
            key={f.channel}
            type="button"
            className={`bm8__card ${live === 0 ? 'is-off' : ''}`}
            onClick={() => onOpen(f.channel)}
          >
            <span className={`bm8__tile ${live > 0 ? `is-${f.tint}` : ''}`} aria-hidden>
              <f.icon size={19} strokeWidth={1.7} />
            </span>

            <span className="bm8__info">
              <span className="bm8__name">{f.channel}</span>
              <span className="bm8__desc">{f.blurb}</span>
              {/* The number that decides whether this row needs attention, said
                  in words rather than left as a bare fraction. */}
              <span className={`bm8__usage ${live === 0 ? 'is-quiet' : ''}`}>
                {live === 0
                  ? `Nothing enabled · ${total} available`
                  : `${live} of ${total} enabled`}
              </span>
            </span>

            <span className="bm8__right">
              {enrolled > 0 && <span className="bm8__enrolled">{enrolled.toLocaleString()} enrolled</span>}
              <ChevronRight size={17} strokeWidth={2} aria-hidden />
            </span>
          </button>
        ))}
      </div>

      {rows.length === 0 && (
        <p className="bm8__empty">
          Nothing matches “{q}”.{' '}
          <button type="button" className="bm8__link" onClick={() => setQ('')}>
            Clear
          </button>
        </p>
      )}
    </div>
  )
}

/* --- The slide-over ------------------------------------------------------------ */

/* The category, as a slide-over: its methods on one pane, and — for the five
   families that have any — the settings the MFA sheet says belong to them. */
function CategoryDrawer({
  family,
  methods,
  policies,
  onClose,
  onToggle,
  behaviour,
  onBehaviour,
}: {
  family: Family | null
  methods: AuthMethod[]
  policies: Policy[]
  onClose: () => void
  onToggle: (id: string, on: boolean) => void
  behaviour: MfaValues
  onBehaviour: (p: MfaValues) => void
}) {
  const [pane, setPane] = useState<'methods' | 'settings'>('methods')
  const inside = family ? methods.filter((m) => m.channel === family.channel) : []
  const live = inside.filter((m) => !methodBlocker(m)).length
  const enrolled = inside.reduce((n, m) => n + (m.enrolled ?? 0), 0)
  const unconfigured = inside.filter((m) => !m.configured).length

  /* Settings from the MFA sheet. Two scopes: some belong to the whole family —
     an OTP length is a property of SMS, not of any one SMS method — and a few
     belong to a single method. */
  const famSettings = family ? familySettingsFor(family.channel) : []
  const ownSettings = inside
    .map((m) => ({ m, settings: methodSettingsFor(m.id) }))
    .filter((x) => x.settings.length > 0)

  /* "Where ever needed" — only five of the eleven families have anything to
     configure. A Settings tab on the other six would be a tab onto an empty
     page, which is worse than no tab: it implies the configuration exists and
     you failed to find it. */
  const hasSettings = famSettings.length > 0 || ownSettings.length > 0

  return (
    <Drawer
      open={family !== null}
      onClose={() => {
        setPane('methods')
        onClose()
      }}
      /* 680, not 620. The settings rows carry an icon, a label, a tip and a
         provenance chip before the control even starts, and a segmented
         control needs its options on one line to be worth using. */
      width={680}
      title={family?.channel ?? ''}
      /* One header, not two.

         The panel had the kit's own head (name + count + close) and then a
         banner immediately under it repeating the same two facts beside a tile.
         Merged: the tile, the name, the blurb and the numbers are one block, and
         the segment bar is gone — three grey slabs restated a count that is
         already written next to them in words. */
      head={
        family ? (
          <div className={`bm8__dwhead is-${family.tint}`}>
            <span className="bm8__dwtile" aria-hidden>
              <family.icon size={22} strokeWidth={1.7} />
            </span>
            <div className="bm8__dwtext">
              <h2>{family.channel}</h2>
              <p>{family.blurb}</p>
              <div className="bm8__dwstats">
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
              </div>
            </div>
          </div>
        ) : undefined
      }
      actions={
        <Button variant="brand" onClick={onClose}>
          Done
        </Button>
      }
    >
      {family && (
        <div className="bm8__dw">
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
                Settings <em>{famSettings.length + ownSettings.reduce((n, x) => n + x.settings.length, 0)}</em>
              </button>
            </div>
          )}

          {pane === 'methods' || !hasSettings ? (
            <>
              <div className="bm8__list">
                {inside.map((m) => (
                  <MethodCard key={m.id} m={m} policies={policies} onToggle={onToggle} />
                ))}
              </div>
              {inside.length === 0 && <p className="bm8__empty">No methods in this category yet.</p>}
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
        </div>
      )}
    </Drawer>
  )
}

/* The Settings pane.

   No `bv5` wrapper any more: the row moved into its own module with its own
   stylesheet, so it no longer depends on which screen is rendering it.

   Scope is stated rather than implied: a family setting changes every method in
   the family, and an admin editing "OTP length" from a drawer titled SMS has to
   know it lands on all three SMS methods, not just the one they were looking
   at. */
function SettingsPane({
  family,
  famSettings,
  ownSettings,
  behaviour,
  onBehaviour,
}: {
  family: Family
  famSettings: MfaSetting[]
  ownSettings: { m: AuthMethod; settings: MfaSetting[] }[]
  behaviour: MfaValues
  onBehaviour: (p: MfaValues) => void
}) {
  const read = (key: string, fallback: MfaValue): MfaValue => behaviour[key] ?? fallback

  return (
    <div className="bm8__settings">
      {famSettings.length > 0 && (
        <section>
          <p className="bm8__setlabel">
            Shared across {family.channel}
            <i>changes every method in this category</i>
          </p>
          <div className="bm8__setlist">
            {famSettings.map((s) => {
              const key = settingKey('family', family.channel, s.id)
              return (
                <SettingField
                  key={s.id}
                  setting={s}
                  value={read(key, s.field.value)}
                  onChange={(v) => onBehaviour({ [key]: v })}
                  /* Revealed settings store against the same scope as the row
                     that revealed them, so a custom SMS gateway is remembered
                     per family the way every other family setting is. */
                  child={{
                    read: (id, fb) => read(settingKey('family', family.channel, id), fb),
                    write: (id, v) => onBehaviour({ [settingKey('family', family.channel, id)]: v }),
                  }}
                />
              )
            })}
          </div>
        </section>
      )}

      {ownSettings.map(({ m, settings }) => (
        <section key={m.id}>
          <p className="bm8__setlabel">
            {m.name}
            <i>this method only</i>
          </p>
          <div className="bm8__setlist">
            {settings.map((s) => {
              const key = settingKey('method', m.id, s.id)
              return (
                <SettingField
                  key={s.id}
                  setting={s}
                  value={read(key, s.field.value)}
                  onChange={(v) => onBehaviour({ [key]: v })}
                  child={{
                    read: (id, fb) => read(settingKey('method', m.id, id), fb),
                    write: (id, v) => onBehaviour({ [settingKey('method', m.id, id)]: v }),
                  }}
                />
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

function MethodCard({
  m,
  policies,
  onToggle,
}: {
  m: AuthMethod
  policies: Policy[]
  onToggle: (id: string, on: boolean) => void
}) {
  const blocked = methodBlocker(m)
  /* Computed by walking the rules. The catalogue carries a stored count and it
     disagrees with reality. */
  const uses = useMemo(() => rulesUsing(m.name, policies), [m.name, policies])

  return (
    <div className={`bm8__card bm8__card--method ${blocked ? 'is-off' : ''}`}>
      <span className="bm8__tile bm8__tile--logo" aria-hidden>
        <MethodIcon name={m.name} size={36} />
      </span>

      <div className="bm8__info">
        <span className="bm8__name">
          {m.name}
          {m.tier === 'Phishing-resistant' && (
            <i className="bm8__badge">
              <ShieldCheck size={11} strokeWidth={2.2} aria-hidden />
              Phishing-resistant
            </i>
          )}
        </span>
        <span className="bm8__desc">{m.description}</span>
        {uses > 0 ? (
          <span className="bm8__usage">
            Used in {uses} policy rule{uses === 1 ? '' : 's'}
          </span>
        ) : (
          !m.configured && <span className="bm8__usage is-quiet">Not configured yet</span>
        )}
      </div>

      <div className="bm8__right">
        <Toggle
          checked={m.active}
          onChange={(v) => onToggle(m.id, v)}
          label={`Enable ${m.name}`}
          disabled={!m.configured}
        />
        <span className="bm8__enrolled">
          {!m.configured
            ? 'Needs setup'
            : m.enrolled !== undefined
              ? `${m.enrolled.toLocaleString()} enrolled`
              : blocked
                ? 'Disabled'
                : 'No enrolments'}
        </span>
      </div>
    </div>
  )
}

/* How many rules actually name this method.

   Walked, never read off the model — a stored count on this catalogue has been
   wrong before. A rule names a method through one of four fields and it does so
   by NAME, not by id: `firstFactorMethod` when the first factor is Specific,
   `secondFactorMethods` when the second is Specific, `methodChain` when it is a
   chain, and `preferredFallback` for the user who set no preference. There is
   no 'method' condition type, which is what an earlier draft of this function
   assumed — it would have returned zero for all twenty-one and looked correct.

   Worth knowing while reading this screen: the seeded policies barely exercise
   any of it, so most cards show no usage line at all. That is the data being
   thin, not the count being broken. */
function rulesUsing(name: string, policies: Policy[]): number {
  return policies.reduce(
    (n, p) =>
      n +
      p.rules.filter(
        (r) =>
          r.firstFactorMethod === name ||
          r.preferredFallback === name ||
          r.secondFactorMethods?.includes(name) ||
          r.methodChain?.includes(name),
      ).length,
    0,
  )
}
