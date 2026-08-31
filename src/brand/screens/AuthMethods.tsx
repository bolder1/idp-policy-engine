import { useMemo, useState } from 'react'
import {
  Check,
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
  Sliders,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Star,
  type LucideIcon,
} from 'lucide-react'

import { Button, Drawer, MenuButton, Modal, TipDot, Toggle } from '../kit'
import { methodBlocker, type AuthMethod } from '../methods'
import { useBrand, type Role } from '../store'
import { NoResults } from '../empty'
import type { Policy } from '../data'
import { MethodIcon, RecoveryTab } from './recovery'
import { UserMethodCard } from './user-config'
import { SEED_ENROLMENT, type UserEnrolment } from '../user-methods'
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
  /* Whether the blurb earns a line on the card, or goes on a tip beside the
     name.

     The test is whether it says something the NAME does not. "SMS — one-time
     codes and links sent to the phone number on the account" is the word SMS
     spelled out. "Grid Pattern — a personal grid card; the user reads a
     remembered path off it" is the only way to know what a grid pattern is.

     Everything went to the tip for one revision and it read worse, which is the
     useful thing this flag now records: a list of eleven names and nothing else
     is tidy and tells you nothing, and the rows that needed explaining were
     exactly the ones a reader stops on. Uniform row height is not worth a list
     you cannot read. */
  explains?: true
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
  /* Eleven. There is no Password family, and briefly there was.

     Grouping exists because SMS holds three methods that share a gateway, a
     balance and an OTP length — open the card and you are configuring one
     thing. The three ways a session starts share none of that: a password, a
     passkey and a mailed link have nothing in common except the moment they
     happen. A card called Password holding all three would be a bundle whose
     only member in common is the position of the row.

     So they are rows, beside the cards rather than inside one. */
  { channel: 'SMS', blurb: 'One-time codes and links sent to the phone number on the account.', icon: MessageSquare, tint: 'green' },
  { channel: 'Email', blurb: 'One-time codes and links sent to a mailbox the user already reads.', icon: Mail, tint: 'blue' },
  { channel: 'Authenticator App', blurb: 'Time-based codes from Google, Microsoft or Authy — no network needed.', icon: Smartphone, tint: 'teal' , explains: true },
  { channel: 'miniOrange Authenticator', blurb: 'Our own app: push approval, a code, or a barcode scan.', icon: Sparkles, tint: 'indigo' , explains: true },
  { channel: 'RSA Authenticator', blurb: 'SecurID tokencodes, softtokens and push, via RSA Authentication Manager.', icon: ShieldCheck, tint: 'slate', isNew: true , explains: true },
  { channel: 'Call Verification', blurb: 'An automated voice call reading the code aloud.', icon: Phone, tint: 'amber' },
  { channel: 'Hardware Token', blurb: 'A physical device the user carries and the tenant assigns.', icon: KeyRound, tint: 'slate' },
  { channel: 'Security Questions', blurb: 'Answers the user set at enrolment. Weak alone, useful as a fallback.', icon: HelpCircle, tint: 'slate' , explains: true },
  { channel: 'Biometric', blurb: 'Bound to the device and the origin. Nothing to type, nothing to intercept.', icon: Fingerprint, tint: 'indigo' , explains: true },
  { channel: 'Grid Pattern', blurb: 'A personal grid card; the user reads a remembered path off it.', icon: Grid3x3, tint: 'teal' , explains: true },
  { channel: 'Smart Cards', blurb: 'A certificate on a physical card, presented by the browser.', icon: CreditCard, tint: 'blue' , explains: true },
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

export function AuthMethods({ role = 'admin' }: { role?: Role }) {
  const store = useBrand()
  const isUser = role === 'user'

  /* One list, and the two axes that narrow it.

     `use` is the filter: primary, second factor, recovery. It replaces both the
     tab bar and the eleven category cards — the tabs split one catalogue into
     three screens you could not compare across, and the categories split what
     was left into eleven cards you had to open one at a time to see anything at
     all. What an admin arrives asking is "what can somebody sign in with", and
     that question was answerable on none of the three.

     Recovery is a filter VALUE rather than a fourth kind, because a method can
     be a second factor and a way back in at the same time — three of them are.
     `use` says what a method is; `alsoRecovery` says what it can also do, and a
     row can honestly appear under both. */
  const [use, setUse] = useState<UseFilter>('all')

  const [tab, setTab] = useState<Tab>('methods')
  /* The open category, by channel. Null closes the slide-over. */
  const [openChannel, setOpenChannel] = useState<string | null>(null)

  /* The person's own enrolment, which is a different fact from the tenant's
     configuration. The admin decides a method may exist; this records whether
     THIS person has set it up and which one of theirs actually runs. */
  const [enrolment, setEnrolment] = useState<UserEnrolment>(SEED_ENROLMENT)
  const [openCard, setOpenCard] = useState<string | null>(null)
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

  /* What this viewer may see at all. `methodBlocker` already answers exactly
     this — it returns a reason whenever a method is unconfigured, switched off,
     or not offered to end users — so a person's catalogue is the tenant's with
     everything blocked removed, and nothing else. */
  const reachable = isUser ? methods.filter((m) => !methodBlocker(m)) : methods

  const openFamily = openChannel ? FAMILIES.find((f) => f.channel === openChannel) ?? null : null

  const activate = (id: string, on: boolean) => {
    /* One active method at a time. Switching one on switches the last one off
       rather than adding to a set. */
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
      active: e.active ?? id,
    }))
    const m = methods.find((x) => x.id === id)
    if (m) store.showToast(first ? `${m.name} is set up` : `${m.name} updated`)
  }

  return (
    <div className="bpage bm8">
      <header className="bm8__head">
        <h1>{isUser ? 'Two-step verification' : 'Authentication methods'}</h1>
        <p>
          {isUser
            ? 'How you prove it is you. Set up as many as you like — one of them runs.'
            : 'Choose how people prove who they are. Anything you enable here can be named by a policy rule.'}
        </p>
      </header>

      {/* Horizontal, per the brief. V5 ran these down the left, which reads as
          navigation between screens; across the top they read as two views of
          one screen, which is what they are.

          Recovery is a tenant policy rather than a personal setting, so a person
          does not get the tab — and a single-tab tab bar is furniture describing
          a choice that no longer exists. */}
      {!isUser && (
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
      )}

      {/* Rendered inside a `bv5` wrapper on purpose: recovery.css writes some of
          its rules as `.bv5 .bv5__x`, and handing the component the scope it was
          written under is cheaper than auditing which of its nested inputs
          happen to need it today. */}
      {tab === 'recovery' && !isUser && (
        <div className="bv5">
          <RecoveryTab methods={methods} />
        </div>
      )}

      {/* The list stays put and the category slides over it. Opening a category
          is a peek at three or four rows, and making that a navigation event
          means the eleven you were comparing disappear to show you a list that
          fits in a corner of them. */}
      {(tab === 'methods' || isUser) && (
        <>
          <CategoryList
            methods={reachable}
            onOpen={setOpenChannel}
            defaultMethod={defaultMethod}
            use={use}
            onUse={setUse}
            isUser={isUser}
            policies={store.policies}
            onToggle={setEnabled}
            onSetup={goToSetup}
            onMakeDefault={setDefaultMethod}
            enrolment={enrolment}
            openCard={openCard}
            onOpenCard={setOpenCard}
            onActivate={activate}
            onSaveEnrolment={saveEnrolment}
          />

          <SetupModal
            method={setupOf}
            saved={savedConfig}
            onClose={() => setSetupOf(null)}
            onSave={finishSetup}
          />

          <CategoryDrawer
            family={openFamily}
            methods={reachable}
            policies={store.policies}
            onClose={() => setOpenChannel(null)}
            onToggle={setEnabled}
            defaultMethod={defaultMethod}
            onSetup={goToSetup}
            onMakeDefault={setDefaultMethod}
            behaviour={behaviour}
            onBehaviour={(p) => setBehaviour((v) => ({ ...v, ...p }))}
            use={use}
            isUser={isUser}
            enrolment={enrolment}
            openCard={openCard}
            onOpenCard={setOpenCard}
            onActivate={activate}
            onSaveEnrolment={saveEnrolment}
          />
        </>
      )}
    </div>
  )
}

/* --- What a method is for, as a filter -------------------------------------- */

type UseFilter = 'all' | 'primary' | 'second' | 'recovery'

/* Password first, then the two that replace it. The catalogue's order, stated
   here so it survives a reorder of the array. */
const PRIMARY_ORDER = ['password', 'passkey-primary', 'magic-link']

/* The four the dropdown offers. The words are the page's own — they are the
   headings that used to sit above each block — so somebody who knew the old
   screen finds the same three names doing the same job.

   Names only. Each carried a line of explanation for one revision, and a
   four-item menu where every item is a heading over a paragraph is a menu you
   read rather than pick from: the descriptions were three times the height of
   the choices and pushed the last option off the fold. The names say enough —
   "Primary sign-in methods" is not a term that needs defining to somebody
   already on this screen. */
const USES: { id: UseFilter; label: string }[] = [
  { id: 'all', label: 'All methods' },
  { id: 'primary', label: 'Primary sign-in methods' },
  { id: 'second', label: 'Other sign-in methods' },
  { id: 'recovery', label: 'Recovery methods' },
]

const matchesUse = (m: AuthMethod, f: UseFilter) =>
  f === 'all' ? true : f === 'recovery' ? Boolean(m.alsoRecovery) : m.use === f


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
  use,
  onUse,
  isUser,
  policies,
  onToggle,
  onSetup,
  onMakeDefault,
  enrolment,
  openCard,
  onOpenCard,
  onActivate,
  onSaveEnrolment,
}: {
  methods: AuthMethod[]
  onOpen: (channel: string) => void
  defaultMethod: string | null
  use: UseFilter
  onUse: (u: UseFilter) => void
  isUser: boolean
  /* The primaries are rows rather than a card, so this list renders methods as
     well as families and needs everything a method row does. */
  policies: Policy[]
  onToggle: (id: string, on: boolean) => void
  onSetup: (m: AuthMethod) => void
  onMakeDefault: (id: string) => void
  enrolment: UserEnrolment
  openCard: string | null
  onOpenCard: (id: string | null) => void
  onActivate: (id: string, on: boolean) => void
  onSaveEnrolment: (id: string, values: Record<string, string>) => void
}) {
  const [q, setQ] = useState('')

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return FAMILIES.map((f) => {
      /* Narrowed by the filter before anything is counted, so a card's numbers
         describe what opening it will actually show. A count that survives the
         filter is a count you cannot act on. */
      const inside = methods.filter(
        (m) => m.use === 'second' && m.channel === f.channel && matchesUse(m, use),
      )
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
    })
      /* A family the filter has emptied is not a family with nothing in it, it
         is a family this filter does not reach. */
      .filter((r) => r.total > 0)
      .filter(
        (r) =>
          !needle ||
          r.f.channel.toLowerCase().includes(needle) ||
          /* Searching for a method should find the family holding it —
             otherwise typing "passkey" on a screen of category cards finds
             nothing and reads as "we do not have that". */
          methods.some((m) => m.channel === r.f.channel && m.name.toLowerCase().includes(needle)),
      )
  }, [methods, q, use])

  const countOf = (f: UseFilter) => methods.filter((m) => matchesUse(m, f)).length
  /* Recovery is a tenant policy, so a person is not offered it as a filter over
     their own methods. */
  const offered = USES.filter((u) => !(isUser && u.id === 'recovery'))
  const current = offered.find((u) => u.id === use) ?? offered[0]

  /* The primaries answer to the same search and the same filter as the cards
     — they are in the list, not above it, so a query that excludes them has to
     exclude them. */
  const needle = q.trim().toLowerCase()
  const primaries = methods
    .filter((m) => m.use === 'primary' && matchesUse(m, use))
    .filter(
      (m) => !needle || m.name.toLowerCase().includes(needle) || m.description.toLowerCase().includes(needle),
    )
    /* Pinned above the cards whatever else is showing. Not because they are
       more important than the eleven, but because they happen first: a session
       starts with one of these and is then stepped up by the rest. A list of
       ways in that put the second step above the first would read backwards. */
    .sort((a, b) => PRIMARY_ORDER.indexOf(a.id) - PRIMARY_ORDER.indexOf(b.id))

  return (
    <div className="bm8__pane">
      {/* `PrimarySignIn` and the "All methods" section head stood here — a
          block of three rows, a heading with a count chip, and a paragraph,
          between the page title and the catalogue.

          Password, Passkeys and Magic link are catalogue entries now, filed by
          channel like everything else, so the block was a second list of things
          that are already in the first one. What separated them was never a
          property of the method, it was what the method is FOR — and that is a
          filter, not a divider. It costs one row instead of a section, it
          narrows the whole catalogue rather than sitting above part of it, and
          nothing on the page is now above or below a line it cannot cross.

          The heading went with it. "All methods" over the only list on the tab,
          with a sentence explaining that the rows are groups, was a title for
          something already unambiguous. */}

      {/* What to look at, and what to look for, on one row. */}
      <div className="bm8__bar">
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

        {/* The kit's own menu, not a native select.

            A `<select>` renders as the operating system draws it — a different
            control on every platform, no room for a description under an
            option, and no way to mark which one is current beyond the collapsed
            label. This one is the same object the rest of the console uses for
            a group of related choices, which means it also arrives with the
            keyboard handling, the outside-click dismissal and the roving cursor
            already written.

            The tip that sat beside it is gone and has not been replaced. Its
            sentences moved into the options for a revision and made the menu
            three times taller than its four choices — a control you read
            instead of picking from. The names carry it: somebody on this screen
            already knows what a primary sign-in method is.

            The count stays on the trigger, so "how many are primary" is
            answered without opening anything. */}
        <MenuButton
          size="sm"
          /* Anchored to the trigger's RIGHT edge. The control sits at the right
             of the bar, so a menu growing rightwards from its left edge runs
             off the page and takes the horizontal scrollbar with it. */
          align="end"
          label={`${current.label} · ${countOf(current.id)}`}
          items={offered.map((u) => ({
            id: u.id,
            label: u.label,
            /* A tick on the one that is running. The trigger already names it;
               this is so the open menu does not make you re-read the trigger to
               find out where you are. */
            icon: u.id === use ? Check : undefined,
          }))}
          onSelect={(id) => onUse(id as UseFilter)}
        />
      </div>

      <div className="bm8__list">
        {/* The three ways a session starts, as rows.

            They are method rows, not cards, so they carry what a method row
            carries — the phishing-resistant badge where the method earns it,
            the default star, the description, and the control on the right. A
            family card cannot show any of that, because a family is not
            phishing-resistant; the methods inside it are, individually. */}
        {primaries.map((m) =>
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
                {/* The sentence, where the name does not carry it. A tip
                    rather than a deletion: somebody meeting "Grid Pattern" for
                    the first time still needs telling, and somebody who already
                    knows what SMS is should not have to read it eleven times to
                    get down the list.

                    Everything went to the tip for one revision, on the argument
                    that a list where some rows are two lines and some are one
                    has no rhythm to scan down. The rhythm was real and the
                    price was not worth it: eleven names and nothing else is
                    tidy and mute, and the rows that lost their line were the
                    ones a reader stops on. */}
                {!f.explains && <TipDot label={f.channel} text={f.blurb} />}
              </span>
              {f.explains && <span className="bm8__desc">{f.blurb}</span>}

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
  use,
  isUser,
  enrolment,
  openCard,
  onOpenCard,
  onActivate,
  onSaveEnrolment,
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
  /* The same filter the cards were counted under. A panel that opens showing
     more than the card said it held is a card that lied. */
  use: UseFilter
  isUser: boolean
  enrolment: UserEnrolment
  openCard: string | null
  onOpenCard: (id: string | null) => void
  onActivate: (id: string, on: boolean) => void
  onSaveEnrolment: (id: string, values: Record<string, string>) => void
}) {
  const [pane, setPane] = useState<'methods' | 'settings'>('methods')
  const inside = family
    ? methods.filter((m) => m.channel === family.channel && matchesUse(m, use))
    : []
  const live = inside.filter((m) => !methodBlocker(m)).length
  const enrolled = inside.reduce((n, m) => n + (m.enrolled ?? 0), 0)
  const unconfigured = inside.filter((m) => !m.configured).length

  /* Settings from the MFA sheet. Two scopes: some belong to the whole family —
     an OTP length is a property of SMS, not of any one SMS method — and a few
     belong to a single method. */
  /* The tenant's configuration — retry limits, token length, which gateway.
     None of it is a person's to change, so their panel has no Settings pane at
     all rather than a greyed one. */
  const famSettings = family && !isUser ? familySettingsFor(family.channel) : []
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
              {/* Same list, same panel, and a row that means two different
                  things depending on who opened it. The admin's toggle enables
                  a method for the tenant; the person's picks the one that runs
                  for them, and Edit opens their own details inline rather than
                  the tenant's connection to a provider. */}
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
  onSettings,
}: {
  m: AuthMethod
  policies: Policy[]
  onToggle: (id: string, on: boolean) => void
  isDefault: boolean
  onSetup: (m: AuthMethod) => void
  onMakeDefault: (id: string) => void
  /* Only where the method has settings of its own. Absent is not "disabled" —
     the control is not drawn at all, because a row that offers a panel holding
     nothing is worse than a row that offers nothing. */
  onSettings?: () => void
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
          {/* Which kind of method this is, where the row is not already
              surrounded by its own kind. A primary row sits above eleven cards
              of second factors with no heading between them, so it says what it
              is; and a method that is also a way back in says that, because
              nothing else on the row would. */}
          {m.use === 'primary' && <i className="bm8__badge bm8__badge--use">Primary sign-in</i>}
          {m.alsoRecovery && (
            <i className="bm8__badge bm8__badge--use is-quiet">Recovery</i>
          )}
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
        {/* No switch on the one method that is not a choice. A disabled toggle
            was here to say "on, but not yours to change" — and a control you
            cannot operate is still a control: it invites the click it then
            refuses. The chip says the same thing in words and cannot be misread
            as broken. */}
        {m.locked ? (
          <i className="bm8__always">Always on</i>
        ) : m.configured ? (
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
              {/* The method's own behaviour — retry limits, token length, which
                  gateway. It reached these through the category panel before,
                  which meant opening a family to change one method's settings. */}
              {onSettings && (
                <Button variant="ghost" size="sm" onClick={onSettings}>
                  <Sliders size={13} strokeWidth={2} aria-hidden />
                  Settings
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

export function PrimarySignIn({ heading = true }: { heading?: boolean }) {
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
        {/* Dropped whole where the section already has a name above it. v2
            gives this block a tab of its own, so the heading was the tab's six
            words printed twice — and once that goes the sentence under it is a
            gloss on a title that is no longer there, explaining "primary" to a
            reader who just clicked the word. Three rows that say "Always on",
            "Passkeys" and "Magic link" do not need introducing. */}
        {heading && (
          <div className="bm8__sechead">
            <div>
              <h2>Primary sign-in methods</h2>
              <p>How a session starts. Password is on for everyone; the passwordless options are yours to allow.</p>
            </div>
          </div>
        )}

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

