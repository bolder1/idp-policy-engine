import { useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  CreditCard,
  Fingerprint,
  Grid3x3,
  HelpCircle,
  KeyRound,
  Link2,
  Lock,
  Mail,
  MessageSquare,
  Phone,
  ArrowUpRight,
  Search,
  Pencil,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Star,
  type LucideIcon,
} from 'lucide-react'

import { Button, Drawer, Modal, Toggle } from '../kit'
import { methodBlocker, type AuthMethod } from '../methods'
import { useBrand } from '../store'
import { NoResults } from '../empty'
import type { Policy } from '../data'
import { MethodIcon, RecoveryTab } from './recovery'
import { SettingField } from '../setting-field'
import { ConfigFields } from './method-forms'
import { configFor, isMissing, missingFields, setField, type ConfigField } from '../method-config'
import { familySettingsFor, methodSettingsFor, mfaMethodFor, settingKey, type MfaValue, type MfaValues } from '../mfa-join'
import { fieldValue, type MfaSetting } from '../mfa-settings'

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
export interface Family {
  channel: string
  blurb: string
  icon: LucideIcon
  tint: string
  /* Newly added to the product. Drives the pill and the position — a new
     integration nobody scrolls to is a new integration nobody knows about. The
     row itself stays white; see the note in the stylesheet for why.

     Worth saying out loud because it is the trap this kind of marker falls
     into: `isNew` has no end date, so it stays true until somebody remembers to
     delete it. Six months of that and every row is new, which is the same as no
     row being new. It wants an expiry — `newUntil: '2026-11-01'` — before more
     than one family carries it. */
  isNew?: boolean
}

export const FAMILIES: Family[] = [
  { channel: 'SMS', blurb: 'One-time codes and links sent to the phone number on the account.', icon: MessageSquare, tint: 'green' },
  { channel: 'Email', blurb: 'One-time codes and links sent to a mailbox the user already reads.', icon: Mail, tint: 'blue' },
  { channel: 'Authenticator App', blurb: 'Time-based codes from Google, Microsoft or Authy — no network needed.', icon: Smartphone, tint: 'teal' },
  { channel: 'miniOrange Authenticator', blurb: 'Our own app: push approval, a code, or a barcode scan.', icon: Sparkles, tint: 'indigo' },
  { channel: 'RSA Authenticator', blurb: 'SecurID tokencodes, softtokens and push, via RSA Authentication Manager.', icon: ShieldCheck, tint: 'slate', isNew: true },
  { channel: 'Call Verification', blurb: 'An automated voice call reading the code aloud.', icon: Phone, tint: 'amber' },
  { channel: 'Hardware Token', blurb: 'A physical device the user carries and the tenant assigns.', icon: KeyRound, tint: 'slate' },
  { channel: 'Security Questions', blurb: 'Answers the user set at enrolment. Weak alone, useful as a fallback.', icon: HelpCircle, tint: 'slate' },
  { channel: 'Biometric', blurb: 'Bound to the device and the origin. Nothing to type, nothing to intercept.', icon: Fingerprint, tint: 'indigo' },
  { channel: 'Grid Pattern', blurb: 'A personal grid card; the user reads a remembered path off it.', icon: Grid3x3, tint: 'teal' },
  { channel: 'Smart Cards', blurb: 'A certificate on a physical card, presented by the browser.', icon: CreditCard, tint: 'blue' },
]

/* Which method the tenant starts on, and where it falls back to.

   Email first because a mailbox is the one delivery channel every account
   already has — an SMS default needs a phone number on file, and a tenant that
   has not collected them defaults to something that cannot reach anybody. The
   rest of the order is the same argument, weakest assumption first. */
const DEFAULT_PREFERENCE = ['otp-email', 'email-link', 'otp-sms', 'otp-call']

/* The seeded default, and the replacement when the current one is switched off.
   `exclude` is the method being disabled: `setEnabled` runs this against the
   state as it was BEFORE the write, so the one on its way out has to be named. */
export function firstDefaultable(all: AuthMethod[], exclude?: string): string | null {
  const ok = (m: AuthMethod) =>
    m.id !== exclude && Boolean(mfaMethodFor(m.id)?.canBeDefault) && !methodBlocker(m)
  for (const id of DEFAULT_PREFERENCE) {
    const hit = all.find((m) => m.id === id && ok(m))
    if (hit) return hit.id
  }
  return all.find(ok)?.id ?? null
}

export function AuthMethods() {
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
  /* The tenant-wide default: the method a user is sent to when nothing else has
     been chosen for them. One at a time, so it is held as an id rather than a
     flag per method — two defaults is not a state the product has. */
  /* Seeded rather than null.

     "No default" was an option in this dropdown and the value every tenant
     started on — a selected state whose meaning was "this is not configured".
     It reads as a choice and it is not one: a rule that asks for a second
     factor without naming a method has nowhere to send the user, so the tenant
     that leaves it alone is the tenant it fails on. The list now holds only
     methods that can actually serve, and Email is picked to begin with. */
  const [defaultMethod, setDefaultMethod] = useState<string | null>(() =>
    firstDefaultable(methods),
  )

  const setEnabled = (id: string, on: boolean) => {
    setMethods((all) => all.map((m) => (m.id === id ? { ...m, active: on, allowed: on } : m)))
    /* Switching off the default moves it on rather than clearing it. A default
       pointing at something disabled reads as configured and cannot run — and
       with "No default" gone there is no longer a value that means "none", so
       clearing it would leave the dropdown showing something not in its own
       list. Null only survives when nothing qualifies at all, which the empty
       state below already handles. */
    if (!on && defaultMethod === id) setDefaultMethod(firstDefaultable(methods, id))
  }

  /* "Set up" opens the integration's own form.

     It used to toast the destination, because there was no form to open. There
     is now: `configFor` has carried a field list per method all along, and the
     RSA one was extended from the console's own dialog. */
  const [setupOf, setSetupOf] = useState<AuthMethod | null>(null)

  const goToSetup = (m: AuthMethod) => {
    setOpenChannel(null)
    setSetupOf(m)
  }

  /* Saving marks the method configured, which is what the rest of the screen
     reads to decide between a Set up button and a toggle. The values
     themselves are the form's own state — this prototype has no backend to
     send them to, and pretending otherwise by storing them somewhere would
     imply a round trip that does not happen. */
  /* What the form was saved with, per method id.

     Needed for the preview on the card: a summary built from the schema's
     defaults would describe a configuration nobody entered. Screen state, so it
     lasts the session and claims nothing beyond it — there is no backend here
     and storing it anywhere else would imply a round trip that does not
     happen. */
  const [savedConfig, setSavedConfig] = useState<Record<string, ConfigField[]>>({})

  const finishSetup = (m: AuthMethod, fields: ConfigField[]) => {
    /* The same form now serves first-time setup and a later edit, so the
       confirmation has to know which one happened. */
    const first = !m.configured
    setSavedConfig((prev) => ({ ...prev, [m.id]: fields }))
    setMethods((all) => all.map((x) => (x.id === m.id ? { ...x, configured: true } : x)))
    setSetupOf(null)
    store.showToast(
      first ? `${m.name} configured — it can be switched on now` : `${m.name} settings updated`,
    )
  }

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
          recovery.css are written as `.bv5 .bv5__x` rather than
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
          <CategoryList
            methods={methods}
            onOpen={setOpenChannel}
            defaultMethod={defaultMethod}
          />
          <SetupModal
            method={setupOf}
            saved={savedConfig}
            onClose={() => setSetupOf(null)}
            onSave={finishSetup}
          />

          <CategoryDrawer
            family={open}
            methods={methods}
            policies={store.policies}
            onClose={() => setOpenChannel(null)}
            onToggle={setEnabled}
            defaultMethod={defaultMethod}
            onSetup={goToSetup}
            onMakeDefault={setDefaultMethod}
            behaviour={behaviour}
            onBehaviour={(p) => setBehaviour((v) => ({ ...v, ...p }))}
          />
        </>
      )}
    </div>
  )
}

const GROUPS: { id: 'connect' | 'policy' | 'advanced'; label: string; blurb: string }[] = [
  { id: 'connect', label: 'Connection', blurb: 'What this console needs to reach the server.' },
  { id: 'policy', label: 'Policy', blurb: 'Which rule it applies once it can.' },
  { id: 'advanced', label: 'Advanced', blurb: 'Working defaults. Change these only for an unusual deployment.' },
]

/* --- Setting an integration up ------------------------------------------------------
   The form behind the Set up button, in a modal rather than a page.

   A page would be the right weight if these were long, and two of them are —
   RSA asks for seven fields. But the surrounding task is "walk the catalogue
   and turn things on", and sending someone to a page for one of eleven
   categories loses the list they were working through. The modal keeps it
   behind them.

   Required fields decide the primary button, not a validation pass on submit:
   the console's own dialog lets you press Save on an empty form and then tells
   you off, which is a round trip to learn something the button already knew. */
export function SetupModal({
  method,
  saved,
  onClose,
  onSave,
}: {
  method: AuthMethod | null
  /** What this method was saved with last time, per id. */
  saved: Record<string, ConfigField[]>
  onClose: () => void
  onSave: (m: AuthMethod, fields: ConfigField[]) => void
}) {
  const [fields, setFields] = useState<ConfigField[]>([])
  const [seeded, setSeeded] = useState<string | null>(null)
  /* Which sections are collapsed. Advanced starts closed because its
     seventeen fields all ship with working defaults; the other two start open
     because nothing can be saved until they are filled in. */
  const [shut, setShut] = useState<string[]>(['advanced'])

  /* Re-seed when the modal opens on a different method, the same way the other
     forms on this screen do — keyed on the id, because the object identity
     changes on every store write without the subject changing. */
  const subject = method?.id ?? null
  if (subject !== seeded) {
    setSeeded(subject)
    /* What was entered last time beats the schema's defaults — an edit form
       that opens on defaults is not an edit form. */
    setFields(subject ? saved[subject] ?? configFor(subject)?.fields ?? [] : [])
    setShut(['advanced'])
  }

  const missing = missingFields(fields)
  const cfg = method ? configFor(method.id) : null

  return (
    <Modal
      open={method !== null}
      onClose={onClose}
      title={method ? `${method.name} configuration` : 'Configuration'}
      width={640}
      footer={
        <>
          <span className="bm8__setupnote">
            {missing.length === 0
              ? 'Everything required is filled in.'
              : `${missing.length} required field${missing.length === 1 ? '' : 's'} left: ${missing
                  .map((f) => f.label)
                  .join(', ')}`}
          </span>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="brand"
            disabled={missing.length > 0}
            onClick={() => method && onSave(method, fields)}
          >
            Save
          </Button>
        </>
      }
    >
      {cfg && (
        <div className="bm8__setup">
          <p className="bm8__setupblurb">{cfg.blurb}</p>

          {/* What has to be true elsewhere before any of this can be filled in.

              RSA is the only integration that ships these, and it needs them:
              half its fields are values you can only read off the RSA Security
              Console, so without the list this is a form you cannot complete
              and cannot tell why. First, and open by default — a checklist
              behind a disclosure is a checklist nobody reads. */}
          {cfg.prereqs && cfg.prereqs.length > 0 && (
            <div className="bm8__prereqs">
              <p className="bm8__prereqhead">Before you begin</p>
              <ol>
                {cfg.prereqs.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ol>
            </div>
          )}

          {/* Grouped when the integration says so, flat when it does not.

              RSA is twenty-six fields of which two are required; the rest have
              working defaults. Ungrouped that is one scroll where the two that
              matter look exactly like the twenty-four that do not.

              Each section is its own panel and each one closes, so the form can
              be collapsed down to three headers once it has been filled in —
              and a header carries its own count, so closing one never hides
              whether it is finished. */}
          {GROUPS.filter((g) => fields.some((f) => (f.group ?? 'connect') === g.id)).length > 1 ? (
            GROUPS.map((g) => {
              const own = fields.filter((f) => (f.group ?? 'connect') === g.id)
              if (own.length === 0) return null
              const closed = shut.includes(g.id)
              const gaps = own.filter(isMissing).length
              return (
                <section
                  key={g.id}
                  className={`bm8__setupgroup ${closed ? 'is-shut' : ''} ${gaps ? 'has-gap' : ''}`}
                >
                  <button
                    type="button"
                    className="bm8__setupgrouphead"
                    aria-expanded={!closed}
                    onClick={() =>
                      setShut((cur) =>
                        cur.includes(g.id) ? cur.filter((x) => x !== g.id) : [...cur, g.id],
                      )
                    }
                  >
                    <ChevronDown size={15} strokeWidth={2.2} className="bm8__setupchev" aria-hidden />
                    <span>{g.label}</span>
                    <em>{g.blurb}</em>
                    {/* A closed section still has to say whether anything inside
                        it is outstanding. Without this, collapsing Connection
                        hides the only explanation for why Save is dead. */}
                    <i className={`bm8__setupcount ${gaps ? 'is-gap' : ''}`}>
                      {gaps
                        ? `${gaps} required`
                        : `${own.length} field${own.length === 1 ? '' : 's'}`}
                    </i>
                  </button>
                  {!closed && (
                    <div className="bm8__setupgroupbody">
                      <ConfigFields
                        fields={own}
                        onChange={(id, value) => setFields((f) => setField(f, id, value))}
                      />
                    </div>
                  )}
                </section>
              )
            })
          ) : (
            <ConfigFields
              fields={fields}
              onChange={(id, value) => setFields((f) => setField(f, id, value))}
            />
          )}
        </div>
      )}
    </Modal>
  )
}

/* --- The category list -------------------------------------------------------- */

function CategoryList({
  methods,
  onOpen,
  defaultMethod,
}: {
  methods: AuthMethod[]
  onOpen: (channel: string) => void
  defaultMethod: string | null
}) {
  const [q, setQ] = useState('')

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return FAMILIES.map((f) => {
      const inside = methods.filter((m) => m.channel === f.channel)
      const live = inside.filter((m) => !methodBlocker(m))
      /* Transactions are bought as a pool and a family can spend from one pool
         through several methods — OTP over SMS and SMS Link both draw on "SMS
         transactions". Keyed by the pool's own name so the balance is counted
         once, not once per method that can spend it. Families that cost nothing
         to send have no pool and get no tag. */
      const pools = new Map<string, number>()
      for (const m of inside) if (m.balance) pools.set(m.balance.label, m.balance.remaining)
      return {
        f,
        total: inside.length,
        live: live.length,
        enrolled: inside.reduce((n, m) => n + (m.enrolled ?? 0), 0),
        txns: pools.size ? [...pools.values()].reduce((a, b) => a + b, 0) : null,
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

  /* Counted off the whole catalogue, not off `rows` — `rows` is what the search
     left behind, and a total that shrinks as you type is not a total. */
  const liveMethods = methods.filter((m) => !methodBlocker(m)).length

  /* The primary row answers to the same search box, so a query that plainly is
     not about it does not leave it stranded above an empty list. */
  const needle = q.trim().toLowerCase()
  const showPrimary = !needle || 'password passkeys magic link primary sign-in'.includes(needle)

  return (
    <div className="bm8__pane">
      {/* The primary factor, stated before the catalogue of the rest.

          Password is not one of the eleven and does not belong among them:
          those are methods a tenant chooses between, and this is the one every
          account has whether or not any of them is on. It is set for the whole
          tenant, so there is nothing here to open and nothing to switch.

          It is on the page anyway, because a methods screen that lists eleven
          ways to prove an identity and never mentions the one everybody
          actually uses reads as though passwords had been turned off. Saying
          "always on" out loud is the entire point of the row.

          Its own section rather than a twelfth card, because the count chip
          below would then have to read "3 of 12 in use" about a set containing
          one member nobody can choose. */}
      {showPrimary && <PrimarySignIn />}

      <div className="bm8__sechead">
        <div>
          {/* Beside the heading, not pushed to the far edge of the row.

              It was a solid brand pill in the top-right corner — the loudest
              object on the page, describing a count, sitting about 700px from
              the words it counts. Read left to right you got "Categories", a
              sentence, and then eventually a number with no subject attached.

              Two facts rather than one, because they answer different
              questions: how much of the catalogue is in play, and how many
              methods a user could actually be offered. Five groups in use can
              mean five methods or fifteen. */}
          {/* "Categories" named the filing, not the thing filed. Nobody comes
              to this screen to browse a taxonomy — they come to turn a method
              on — and the word made the eleven rows sound like a layer standing
              between them and that. "All methods" says what the list is: every
              method the tenant has, gathered in one place. The rows are still
              groups; the sentence under the heading is what says so. */}
          <span className="bm8__sectitle">
            <h2>All methods</h2>
            <span className="bm8__chip">
              {liveMethods} method{liveMethods === 1 ? '' : 's'} enabled
            </span>
          </span>
          <p>Grouped by how the challenge reaches someone. Open a group to turn its methods on or off.</p>
        </div>
      </div>

      <label className="bm8__search">
        <Search size={15} strokeWidth={1.9} aria-hidden />
        <input
          type="text"
          value={q}
          placeholder="Search methods…"
          aria-label="Search methods"
          onChange={(e) => setQ(e.target.value)}
        />
      </label>

      <div className="bm8__list">
        {rows.map(({ f, live, enrolled, txns }) => {
          const holdsDefault =
            defaultMethod !== null &&
            methods.some((m) => m.id === defaultMethod && m.channel === f.channel)
          return (
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
              <span className="bm8__name">
                {f.channel}
                {/* The same pill the sidebar already uses for a new section, so
                    "new" looks the same wherever the product says it. */}
                {f.isNew && <i className="bm8__new">New</i>}

                {/* Which category holds the tenant default. On the row rather
                    than only in the dropdown, so the answer is visible while
                    scanning the list instead of only while changing it. */}
                {holdsDefault && (
                  <i className="bm8__defchip">
                    <Star size={10} strokeWidth={2.4} aria-hidden />
                    Default
                  </i>
                )}
              </span>
              <span className="bm8__desc">{f.blurb}</span>

            </span>

            {/* The two numbers the row exists to report, moved out of the text
                and given a column of their own.

                They were a third line of grey under the description and a muted
                string on the right — the same weight as the blurb, which is the
                one thing on the row nobody rereads. Scanning eleven categories
                for "what is on" and "who is on it" meant reading eleven
                paragraphs. Now both are chips and figures at a fixed position,
                so the column can be read straight down. */}
            <span className="bm8__right">
              {/* Funding, above the enrolment figure it qualifies.

                  It was a chip on its own row under the description, which was
                  the right call while the name also carried an "enabled" chip —
                  three chips across the row pushed the name into wrapping. That
                  chip is gone, so the constraint is gone with it, and the
                  transactions belong here: "can it afford to run" and "how many
                  people are on it" are the two numbers this column exists to
                  report, and they are read together. */}
              {txns !== null && (
                <span className={`bm8__txn ${txns === 0 ? 'is-empty' : txns <= 50 ? 'is-low' : ''}`}>
                  {txns === 0 ? 'No transactions left' : `${txns.toLocaleString()} left`}
                </span>
              )}

              {/* Reserved even at zero, so the figure stays in one column down
                  the list rather than sliding about per row. */}
              <span className="bm8__reach">
                {enrolled > 0 ? (
                  <>
                    <b>{enrolled.toLocaleString()}</b>
                    <em>enrolled</em>
                  </>
                ) : (
                  <i>—</i>
                )}
              </span>

              <ChevronRight size={17} strokeWidth={2} aria-hidden />
            </span>
          </button>
          )
        })}
      </div>

      {rows.length === 0 && (
        <NoResults>
          Nothing matches “{q}”.{' '}
          <button type="button" className="bm8__link" onClick={() => setQ('')}>
            Clear
          </button>
        </NoResults>
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
  defaultMethod,
  onSetup,
  onMakeDefault,
  behaviour,
  onBehaviour,
}: {
  family: Family | null
  methods: AuthMethod[]
  policies: Policy[]
  onClose: () => void
  onToggle: (id: string, on: boolean) => void
  defaultMethod: string | null
  onSetup: (m: AuthMethod) => void
  onMakeDefault: (id: string) => void
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
                  <MethodCard
                    key={m.id}
                    m={m}
                    policies={policies}
                    onToggle={onToggle}
                    isDefault={defaultMethod === m.id}
                    onSetup={onSetup}
                    onMakeDefault={onMakeDefault}
                  />
                ))}
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
export function SettingsPane({
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
            <i>changes every method in this group</i>
          </p>
          <div className="bm8__setlist">
            {famSettings.map((s) => {
              const key = settingKey('family', family.channel, s.id)
              return (
                <SettingField
                  key={s.id}
                  setting={s}
                  value={read(key, fieldValue(s.field))}
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
                  value={read(key, fieldValue(s.field))}
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

export function MethodCard({
  m,
  policies,
  onToggle,
  isDefault,
  onSetup,
  onMakeDefault,
}: {
  m: AuthMethod
  policies: Policy[]
  onToggle: (id: string, on: boolean) => void
  isDefault: boolean
  onSetup: (m: AuthMethod) => void
  onMakeDefault: (id: string) => void
}) {
  const blocked = methodBlocker(m)

  /* Whether this method could be the default, on the same rule the section that
     used to own this decision applied: the sheet says which methods qualify, and
     a default that is switched off or not yet configured is a default that
     cannot run.

     The decision moved onto the card because it is a fact ABOUT a method, and it
     was being made in a full-width section of its own that listed the methods
     again in order to ask about them. Two places showing the same catalogue, one
     of them only so you could point at a row in it. Now the row is the control:
     the one that holds it wears the badge, and the handful that could take it
     offer to. */
  const canBeDefault = Boolean(mfaMethodFor(m.id)?.canBeDefault) && !blocked

  /* RSA only.

     Nearly every method in the catalogue has a config schema, so keying this on
     "has a form" put an Edit button on twenty-one rows — and for most of them
     the form is four fields nobody revisits. RSA is the one integration whose
     configuration is genuinely worth returning to: twenty-six fields, half of
     them values you have to read off the RSA Security Console.

     Display Token is the other method that ships unconfigured and gets a Set up
     button; if it should gain Edit too, this is the line to widen. */
  const canEdit = m.id === 'rsa'
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
          {isDefault && (
            <i className="bm8__badge bm8__badge--default">
              <Star size={11} strokeWidth={2.2} aria-hidden />
              Default
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

      {/* Two states, and only one control each.

          A method that has not been configured cannot be switched on, so the
          switch was rendered disabled next to a button that could actually be
          pressed — a dead control sitting above the live one, both competing
          for the same corner. The switch is not "off" in that state, it is
          absent: there is nothing yet to turn on. So the row shows the one
          thing you can do, and earns its switch by being set up.

          The knock-on is that enabling is no longer reachable from this row
          until setup completes, which is the truth the disabled switch was
          only gesturing at. */}
      <div className="bm8__right">
        {m.configured ? (
          <>
            {/* Edit is the same control Set up was, in the same corner.

                It was an underlined word at the end of a line of monospace
                values — which is a link inside a label, not a button, and it
                sat in the text column where nothing else is clickable. Every
                action on this card lives on the right: Set up did before the
                method was configured, and Edit is the same action afterwards.
                Putting it back there costs one row of card height and makes the
                two states read as one control that changes its name. */}
            <div className="bm8__ctlrow">
              {/* Offered only where it is available and not already true. The
                  method that IS the default says so with the badge on its name
                  and needs no button — there is nothing to press. */}
              {canBeDefault && !isDefault && (
                <Button variant="ghost" size="sm" onClick={() => onMakeDefault(m.id)}>
                  <Star size={13} strokeWidth={2} aria-hidden />
                  Make default
                </Button>
              )}
              {canEdit && (
                <Button variant="secondary" size="sm" onClick={() => onSetup(m)}>
                  <Pencil size={13} strokeWidth={2} aria-hidden />
                  Edit
                </Button>
              )}
              <Toggle
                checked={m.active}
                onChange={(v) => onToggle(m.id, v)}
                label={`Enable ${m.name}`}
              />
            </div>
          </>
        ) : (
          <Button variant="secondary" size="sm" onClick={() => onSetup(m)}>
            Set up
            <ArrowUpRight size={14} strokeWidth={2} aria-hidden />
          </Button>
        )}
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

/* --- Shared between the two layouts ------------------------------------------
   Both versions of this screen ask the same two tenant-wide questions before
   they get to the catalogue: how a session may start, and where a rule is sent
   when it names no method. Only the arrangement differs, so these live here and
   both compose them rather than each keeping a copy that drifts. */

export function PrimarySignIn() {
  /* The two passwordless starts, held locally for now.

     Neither has a record in the catalogue that fits: `fido2` exists but is
     filed as a phishing-resistant factor under Biometric, and magic link is
     modelled as "Include a one-click link", a setting on the Email family —
     which is the right home for how the mail is composed and the wrong one for
     whether a link may start a session at all. */
  const [passkeys, setPasskeys] = useState(true)
  const [magicLink, setMagicLink] = useState(false)

  return (
    <>
      <section className="bm8__primary">
        <div className="bm8__sechead">
          <div>
            <h2>Primary sign-in</h2>
            <p>How a session starts. Password is on for everyone; the passwordless options are yours to allow.</p>
          </div>
        </div>

        <div className="bm8__primarylist">
          <div className="bm8__card bm8__card--locked">
            <span className="bm8__tile is-brand" aria-hidden>
              <Lock size={19} strokeWidth={1.7} />
            </span>

            <span className="bm8__info">
              <span className="bm8__name">
                Password
                <i className="bm8__always">Always on</i>
              </span>
              <span className="bm8__desc">
                Standard password sign-in, enabled for every user in this tenant.
              </span>
            </span>

            {/* No switch. A disabled one was here to say "on, but not yours to
                change" — and a control you cannot operate is still a control:
                it invites the click it then refuses. The chip says the same
                thing in words and cannot be misread as broken. */}
          </div>

          {/* The two that replace the password rather than follow it. Unlike
              the row above they are the tenant's call, so they keep a live
              switch — the section is "how a session may start", and only the
              first line of it is fixed. */}
          <div className="bm8__card">
            <span className="bm8__tile is-indigo" aria-hidden>
              <Fingerprint size={19} strokeWidth={1.7} />
            </span>
            <span className="bm8__info">
              <span className="bm8__name">Passkeys</span>
              <span className="bm8__desc">
                Sign in with the device — Face ID, a fingerprint, or a security key. No password
                typed, and nothing a lookalike site can reuse.
              </span>
            </span>
            <span className="bm8__right">
              <Toggle checked={passkeys} onChange={setPasskeys} label="Allow passkeys" />
            </span>
          </div>

          <div className="bm8__card">
            <span className="bm8__tile is-blue" aria-hidden>
              <Link2 size={19} strokeWidth={1.7} />
            </span>
            <span className="bm8__info">
              <span className="bm8__name">Magic link</span>
              <span className="bm8__desc">
                A one-click sign-in link sent to the address on the account. Convenient, and only
                ever as strong as the mailbox behind it.
              </span>
            </span>
            <span className="bm8__right">
              <Toggle checked={magicLink} onChange={setMagicLink} label="Allow magic link" />
            </span>
          </div>
        </div>
      </section>
    </>
  )
}

