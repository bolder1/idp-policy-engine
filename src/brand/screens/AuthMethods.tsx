import { motion, useReducedMotion } from 'motion/react'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  Check,
  ChevronDown,
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
  Pencil,
  Settings,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Star,
  type LucideIcon,
} from 'lucide-react'

import { Button, Drawer, IconButton, MenuButton, TipMark, Toggle } from '../kit'
import { methodBlocker, type AuthMethod } from '../methods'
import { useBrand, type Role } from '../store'
import { NoResults } from '../empty'
import type { Policy } from '../data'
import { MethodIcon, RecoveryTab } from './recovery'
import { UserMethodCard } from './user-config'
import { SEED_ENROLMENT, type UserEnrolment } from '../user-methods'
import { ActiveMethod } from './active-method'
import { SettingField } from '../setting-field'
import { ConfigFields } from './method-forms'
import { configFor, isMissing, missingFields, setField, type ConfigField } from '../method-config'
import { familySettingsFor, methodSettingsFor, mfaMethodFor, settingKey, type MfaValue, type MfaValues } from '../mfa-join'
import { fieldValue, type MfaSetting } from '../mfa-settings'
import { familyRow, hasConfigPage, pageKey, rowTarget, type FamilyRow, type PanelPage } from './auth-panel'
import { NPS_SERVERS, setupCardFor, setupReady } from '../setup-guide'
import { AppSetupCard, NpsSetupCard } from './setup-card'

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
  /* What sits in the tip beside the name: what the family holds, what it needs
     and what it costs. Every row carries its `blurb` as a line and this as the
     detail — the line to scan by, the detail for the row a reader stops on. */
  detail: string
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

const FAMILIES: Family[] = [
  /* Eleven. There is no Password family, and briefly there was.

     Grouping exists because SMS holds three methods that share a gateway, a
     balance and an OTP length — open the card and you are configuring one
     thing. The three ways a session starts share none of that: a password, a
     passkey and a mailed link have nothing in common except the moment they
     happen. A card called Password holding all three would be a bundle whose
     only member in common is the position of the row.

     So they are rows, beside the cards rather than inside one. */
  {
    channel: 'SMS',
    blurb: 'One-time codes and links sent to the phone number on the account.',
    detail:
      'A 4 to 8 digit code, a link to accept or deny the sign-in, or one code sent by text and email at once. Each message draws on the SMS transactions, and a text is the easiest factor to intercept.',
    icon: MessageSquare,
    tint: 'green',
  },
  {
    channel: 'Email',
    blurb: 'One-time codes and links sent to a mailbox the user already reads.',
    detail:
      'A 4 to 8 digit code, a link to accept or deny the sign-in, or a code to the backup address, which also works for recovery. Only ever as strong as the mailbox behind it.',
    icon: Mail,
    tint: 'blue',
  },
  {
    channel: 'Authenticator App',
    blurb: 'Time-based codes from Google, Microsoft or Authy — no network needed.',
    detail:
      'The user scans a QR code once, then the app makes a new 6-digit code every 30 seconds on the phone, so nothing is sent at sign-in. Microsoft Push is the exception: it sends an approval through an Azure NPS server.',
    icon: Smartphone,
    tint: 'teal',
  },
  {
    channel: 'miniOrange Authenticator',
    blurb: 'Our own app: push approval, a code, or a barcode scan.',
    detail:
      'A push to accept or deny in one tap, a 6 to 8 digit code, or a barcode scanned off the sign-in screen. The one app where both ends are ours, so its push can require a fingerprint or number matching.',
    icon: Sparkles,
    tint: 'indigo',
  },
  {
    channel: 'RSA Authenticator',
    blurb: 'SecurID tokencodes, softtokens and push, via RSA Authentication Manager.',
    detail:
      'Accepts whichever the user holds: a SecurID tokencode, an RSA display token, or a push. Codes are checked by RSA Authentication Manager, so the connection to it has to be set up before anything can be verified.',
    icon: ShieldCheck,
    tint: 'slate',
    isNew: true,
  },
  {
    channel: 'Call Verification',
    blurb: 'An automated voice call reading the code aloud.',
    detail:
      'Calls the phone number on the account and reads out a 4-digit code. Useful where a text does not arrive, and each call draws on the call transactions.',
    icon: Phone,
    tint: 'amber',
  },
  {
    channel: 'Hardware Token',
    blurb: 'A physical device the user carries and the tenant assigns.',
    detail:
      'A Yubikey that types a one-time key, or a keyfob showing a rotating code. A token does nothing until it is assigned to a user by serial number.',
    icon: KeyRound,
    tint: 'slate',
  },
  {
    channel: 'Security Questions',
    blurb: 'Answers the user set at enrolment. Weak alone, useful as a fallback.',
    detail:
      'The user answers the questions they chose at enrolment. Answers can often be guessed or looked up, so it is best kept as a fallback, and the same questions are used for recovery.',
    icon: HelpCircle,
    tint: 'slate',
  },
  {
    channel: 'Biometric',
    blurb: 'Bound to the device and the origin. Nothing to type, nothing to intercept.',
    detail:
      'A passkey on the device or a FIDO2 security key, unlocked with a fingerprint, face or PIN. Bound to the site it was made for, so a lookalike page cannot use it.',
    icon: Fingerprint,
    tint: 'indigo',
  },
  {
    channel: 'Grid Pattern',
    blurb: 'A personal grid card; the user reads a remembered path off it.',
    detail:
      'At setup the user picks a sequence of squares on a grid, then repeats it to sign in. Changing the grid size or the pattern length makes everyone set their pattern again.',
    icon: Grid3x3,
    tint: 'teal',
  },
  {
    channel: 'Smart Cards',
    blurb: 'A certificate on a physical card, presented by the browser.',
    detail:
      'The user taps a CAC or PIV card and picks the certificate the browser presents. Trust comes from the issuing CA, so a revocation check is what stops a lost card from working.',
    icon: CreditCard,
    tint: 'blue',
  },
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
function firstDefaultable(all: AuthMethod[], exclude?: string): string | null {
  const ok = (m: AuthMethod) =>
    m.id !== exclude && Boolean(mfaMethodFor(m.id)?.canBeDefault) && !methodBlocker(m)
  for (const id of DEFAULT_PREFERENCE) {
    const hit = all.find((m) => m.id === id && ok(m))
    if (hit) return hit.id
  }
  return all.find(ok)?.id ?? null
}

/** The first sentence, without its full stop. Everything after it is the tail. */
function lede(text: string): string {
  const cut = text.search(/\.\s/)
  return cut === -1 ? text : text.slice(0, cut + 1)
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
  /* The slider, as a stack of pages — a family, its settings, or a method's
     setup — deepest last. Empty closes it. See `PanelPage`. */
  const [panel, setPanel] = useState<PanelPage[]>([])

  /* Which end a settings row wears: the chevron it has always worn, or a gear
     with the switch moved out to the edge beside it. See `GEAR_ROWS` below for
     the two rows this actually reaches and why it is only those two.

     A piece of state and not a build flag, because the point of it is to be
     flipped while looking at the list. It is deliberately NOT persisted: this
     is a comparison being made now, not a preference somebody holds — a
     variant that survives a reload is a variant people forget they are in. */
  const [gearEnds, setGearEnds] = useState(false)

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

  /* "Set up" opens the integration's own form, as a page in the slider.

     It used to toast the destination, because there was no form to open. There
     is now: `configFor` has carried a field list per method all along, and the
     RSA one was extended from the console's own dialog.

     It was a centred modal, and opening it closed the slider underneath — so the
     family you were working through was gone by the time you pressed Save. From
     a row on the list the form is now the slider's first page; from inside a
     family it is pushed over that family, and Back returns to it. */
  const openSetup = (m: AuthMethod) => setPanel([{ kind: 'setup', methodId: m.id }])
  const pushSetup = (m: AuthMethod) => setPanel((s) => [...s, { kind: 'setup', methodId: m.id }])
  const back = () => setPanel((s) => s.slice(0, -1))

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
    back()
    store.showToast(
      first ? `${m.name} configured — it can be switched on now` : `${m.name} settings updated`,
    )
  }

  /* What a setup card chose, per method — Microsoft Push's server, so its card
     reopens on it. A code app keeps nothing: the code it showed is checked and
     spent. */
  const [setupChoice, setSetupChoice] = useState<Record<string, string>>({})

  const finishCard = (m: AuthMethod, server: string) => {
    const card = setupCardFor(m.id)
    if (card?.kind === 'nps') setSetupChoice((prev) => ({ ...prev, [m.id]: server }))
    setMethods((all) => all.map((x) => (x.id === m.id ? { ...x, configured: true } : x)))
    back()
    const via = card?.kind === 'nps' ? NPS_SERVERS.find((x) => x.id === server)?.name : undefined
    store.showToast(via ? `${m.name} will send through ${via}` : `${m.name} is set up`)
  }

  /* What this viewer may see at all.

     `methodBlocker` answers most of it — it returns a reason whenever a method
     is unconfigured, switched off, or not offered to end users — so a person's
     catalogue is the tenant's with everything blocked removed.

     The primaries come out too, and that is a different kind of exclusion. They
     are not blocked; they are not this person's to see. Password, Passkeys and
     Magic link are how the tenant lets a session START, decided once by an
     admin for everybody — and this page is headed "Two-step verification" and
     tells the reader to set up as many as they like. A row nobody can act on,
     under a heading about a second step, is a promise the screen cannot keep.
     They stay in full on the admin side, where they are a real decision. */
  const reachable = isUser
    ? methods.filter((m) => m.use !== 'primary' && !methodBlocker(m))
    : methods

  /* Which rows the gear variant actually reaches, by name.

     Read off the same three primitives the list itself uses — `FAMILIES`,
     `familyRow`, `rowTarget` — rather than typed out, because the set is two
     rows today and is a consequence of the data: a family has to narrow to ONE
     method (so its switch is on the row) and that family has to have settings
     (so the row has a page to open). Add a second Grid method and Grid Pattern
     leaves this list on its own; give Call Verification a setting and it joins.
     A hard-coded pair would go quietly wrong on either. */
  const gearRows = useMemo(
    () =>
      FAMILIES.flatMap((f) => {
        const inside = reachable.filter(
          (m) => m.use === 'second' && m.channel === f.channel && matchesUse(m, use),
        )
        const shape = familyRow(f.channel, inside)
        return !shape.opens && rowTarget(shape)?.kind === 'settings' ? [shape.method.name] : []
      }),
    [reachable, use],
  )

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
      {/* Title wrapped, so this head is structurally the same object as the
          Zones and Device-profiles heads: a title block on the left, room for
          an action on the right. It had bare children, which is why it was the
          one page head that could not grow a button without being rebuilt. */}
      <header className="bm8__head">
        <div>
          <h1>{isUser ? 'Two-step verification' : 'Authentication methods'}</h1>
          <p>{isUser ? 'How you prove it is you.' : 'How people prove who they are.'}</p>
        </div>

        {/* The comparison switch, in the slot this head was rebuilt to have.

            It is the one control on this screen that is about the screen rather
            than about authentication, which is a thing the console's copy rule
            otherwise forbids — so it is labelled as narrowly as it can be and
            says which rows it reaches, because two of eleven is not something
            anybody would find by flipping it and looking.

            A person's own Two-step verification page never shows it: their rows
            all open onto an enrolment form and none of them carries a switch,
            so there is no row here for the variant to change. */}
        {!isUser && gearRows.length > 0 && (
          <div className="bm8__variant">
            <Toggle size="sm" checked={gearEnds} onChange={setGearEnds} label="Gear on settings rows" />
            {/* Not a `<label>`: `Toggle` renders a `<button role="switch">`, and
                a label does not forward a click to a button — it would have
                looked like a hit target and been dead. The switch carries its
                own accessible name and these words are the visible copy. */}
            <span>
              Gear on settings rows
              <i>{gearRows.join(' · ')}</i>
            </span>
          </div>
        )}
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
                setPanel([])
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
            onOpen={(channel) => setPanel([{ kind: 'family', channel }])}
            onSettings={(channel) => setPanel([{ kind: 'settings', channel }])}
            gearEnds={gearEnds}
            defaultMethod={defaultMethod}
            use={use}
            onUse={setUse}
            isUser={isUser}
            policies={store.policies}
            onToggle={setEnabled}
            onSetup={openSetup}
            onMakeDefault={setDefaultMethod}
            enrolment={enrolment}
            openCard={openCard}
            onOpenCard={setOpenCard}
            onActivate={activate}
            onSaveEnrolment={saveEnrolment}
          />

          <CategoryDrawer
            pages={panel}
            methods={reachable}
            policies={store.policies}
            onBack={back}
            onClose={() => setPanel([])}
            onToggle={setEnabled}
            defaultMethod={defaultMethod}
            onSetup={pushSetup}
            onMakeDefault={setDefaultMethod}
            saved={savedConfig}
            onSaveSetup={finishSetup}
            choices={setupChoice}
            onSaveCard={finishCard}
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

type UseFilter = 'all' | 'primary' | 'second' | 'recovery' | 'resistant'

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
   already on this screen.

   "Other" is not one of them. It named this group by what it is not, next to
   two options that name themselves by what they are — and every method in it
   is a real, deliberate way to sign in, not a remainder. */
const USES: { id: UseFilter; label: string }[] = [
  { id: 'all', label: 'All methods' },
  { id: 'primary', label: 'Primary sign-in methods' },
  { id: 'second', label: 'Alternate sign-in methods' },
  { id: 'recovery', label: 'Recovery methods' },
  /* In the same menu as the other four, not beside it.

     It was a toggle that ANDed with this list, which could express "primary AND
     phishing-resistant" — a real question, and one this menu can no longer ask.
     Two controls on the bar to ask one thing was the worse trade: the second
     one read as a second filter of the same kind, and nothing on the bar said
     the two multiplied. One list, one answer. */
  { id: 'resistant', label: 'Phishing-resistant' },
]

const matchesUse = (m: AuthMethod, f: UseFilter) =>
  f === 'all'
    ? true
    : f === 'recovery'
      ? Boolean(m.alsoRecovery)
      : f === 'resistant'
        ? isResistant(m)
        : m.use === f

/** Declared above `matchesUse`, which now reads it for the fifth filter. */
const isResistant = (m: AuthMethod) => m.tier === 'Phishing-resistant'


const GROUPS: { id: 'connect' | 'policy' | 'advanced'; label: string; blurb: string }[] = [
  { id: 'connect', label: 'Connection', blurb: 'What this console needs to reach the server.' },
  { id: 'policy', label: 'Policy', blurb: 'Which rule it applies once it can.' },
  { id: 'advanced', label: 'Advanced', blurb: 'Working defaults. Change these only for an unusual deployment.' },
]

/* --- Setting an integration up ------------------------------------------------------
   The form behind the Set up button, as a page in the slider.

   It was a modal, on the argument that a page for one of eleven categories loses
   the list somebody is working through. The argument was right and the modal
   did not honour it: opening it closed the slider, so the family was lost
   anyway. A page pushed inside the slider keeps both — the list behind the
   scrim, and the family one Back away.

   Required fields decide the primary button, not a validation pass on submit:
   the console's own dialog lets you press Save on an empty form and then tells
   you off, which is a round trip to learn something the button already knew. */

/* The form's working copy. Held by the slider rather than by the form, because
   the Save button that reads it lives in the slider's footer. */
function useSetupDraft(
  method: AuthMethod | null,
  saved: Record<string, ConfigField[]>,
  /* What a setup card chose last time, per method — see `finishCard`. */
  chosen: Record<string, string>,
) {
  const [fields, setFields] = useState<ConfigField[]>([])
  const [seeded, setSeeded] = useState<string | null>(null)
  /* Which sections are collapsed. Advanced starts closed because its
     seventeen fields all ship with working defaults; the other two start open
     because nothing can be saved until they are filled in. */
  const [shut, setShut] = useState<string[]>(['advanced'])
  /* A setup card's input: the code an app showed, or Microsoft Push's server. */
  const [passcode, setPasscode] = useState('')
  const [server, setServer] = useState('')

  /* Re-seed when the page opens on a different method, the same way the other
     forms on this screen do — keyed on the id, because the object identity
     changes on every store write without the subject changing. */
  const subject = method?.id ?? null
  if (subject !== seeded) {
    setSeeded(subject)
    /* What was entered last time beats the schema's defaults — an edit form
       that opens on defaults is not an edit form. */
    setFields(subject ? saved[subject] ?? configFor(subject)?.fields ?? [] : [])
    setShut(['advanced'])
    setPasscode('')
    setServer(subject ? chosen[subject] ?? '' : '')
  }

  return {
    fields,
    setFields,
    shut,
    setShut,
    missing: missingFields(fields),
    cfg: method ? configFor(method.id) : null,
    passcode,
    setPasscode,
    server,
    setServer,
  }
}

type SetupDraft = ReturnType<typeof useSetupDraft>

function SetupForm({ draft }: { draft: SetupDraft }) {
  const { cfg, fields, setFields, shut, setShut } = draft
  if (!cfg) return null

  return (
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
  onSettings,
  onMakeDefault,
  enrolment,
  openCard,
  onOpenCard,
  onActivate,
  onSaveEnrolment,
  gearEnds = false,
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
  /** A family of one's settings, opened straight from its row. */
  onSettings: (channel: string) => void
  onMakeDefault: (id: string) => void
  enrolment: UserEnrolment
  openCard: string | null
  onOpenCard: (id: string | null) => void
  onActivate: (id: string, on: boolean) => void
  onSaveEnrolment: (id: string, values: Record<string, string>) => void
  /** The variant switch in the page head. See `gearEnds` on the screen. */
  gearEnds?: boolean
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
      /* Whether the row opens the slider or carries its one method's controls.
         A person's rows all open: what sits in their panel is an enrolment form,
         not a switch, and it does not fit on a row. */
      const shape: FamilyRow = isUser ? { opens: true } : familyRow(f.channel, inside)
      return {
        f,
        shape,
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
  }, [methods, q, use, isUser])

  const countOf = (f: UseFilter) => methods.filter((m) => matchesUse(m, f)).length
  /* Recovery is a tenant policy, and the primaries are not in a person's
     catalogue at all — so neither is offered as a filter over their own
     methods. A filter that can only ever return nothing is a dead option. */
  const offered = USES.filter((u) => !(isUser && (u.id === 'recovery' || u.id === 'primary')))
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

      {/* The one method that runs, stated before the catalogue rather than
          found inside it.

          A person opening this page is almost always asking one question — what
          happens when I sign in — and the list answers it only by making them
          read every row until they find the enrolled one. The line says it
          outright.

          Only on the person's side. An admin has no active method here; a
          tenant has a default, and the star on the row already says which. */}
      {isUser && <ActiveMethod methods={methods} enrolment={enrolment} />}

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

      {/* `is-gear` on the LIST, not on the rows it changes. The end of every row
          reserves one width so the enrolment figures beside them read as a
          column, and a gear is wider than the chevron it stands in for — so the
          reservation has to move for all eleven rows or the two that grow a gear
          would push their own figures out of line with the other nine. */}
      <div className={`bm8__list ${isUser ? 'is-person' : ''} ${gearEnds ? 'is-gear' : ''}`}>
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

        {rows.map(({ f, live, enrolled, txns, shape }) => {
          /* A family of one is named for its method — "CAC Card", not "Smart
             Cards" — because that is the thing the switch on the row turns on.
             The family rides beside it as a chip, so the word an admin scans the
             list for is still on the row. */
          const single = shape.opens ? null : shape.method
          /* A row named for its method wears Default only for that method. A
             filter can leave a family showing one method while the default is
             another it has hidden, and the chip beside a method name reads as
             that method's. */
          const holdsDefault = single
            ? defaultMethod === single.id
            : defaultMethod !== null && methods.some((m) => m.id === defaultMethod && m.channel === f.channel)
          const title = single ? single.name : f.channel
          /* Where the row goes, if anywhere: its family, its settings, or a
             configuration worth returning to. See `rowTarget`. */
          const target = rowTarget(shape)
          const open = !target
            ? null
            : target.kind === 'family'
              ? () => onOpen(f.channel)
              : target.kind === 'settings'
                ? () => onSettings(f.channel)
                : () => onSetup(target.method)
          return (
            <div
              key={f.channel}
              className={`bm8__card bm8__card--family ${open ? 'is-link' : ''} ${live === 0 ? 'is-off' : ''}`}
            >
              {/* Brand on every tile, live or not.

                  `f.tint` was here and had not resolved to anything for a while —
                  the per-family hues were deleted from the sheet and the class
                  kept being emitted, so every tile fell back to grey whatever its
                  state. It was briefly conditional on `live > 0`, which made the
                  tile a second copy of a status the row already states twice: the
                  toggle on the right, and the enrolment figure beside it. The
                  mark is identity, and identity does not switch off. */}
              <span className="bm8__tile is-brand" aria-hidden>
                <f.icon size={19} strokeWidth={1.7} />
              </span>

              <span className="bm8__info">
                <span className="bm8__name">
                  {/* The row's one link, stretched over the whole row by its
                      `::after`, so the row opens from anywhere while the switch
                      at its end stays a control of its own. The row cannot be
                      the button: a switch inside a button is a button inside a
                      button, which is invalid HTML. */}
                  {open ? (
                    <button type="button" className="bm8__open" aria-haspopup="dialog" onClick={open}>
                      {title}
                    </button>
                  ) : (
                    title
                  )}
                  {single && single.name !== f.channel && (
                    <i className="bm8__badge bm8__badge--use">{f.channel}</i>
                  )}
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
                  {/* The detail, one hover away: what the family holds, what it
                      needs and what it costs — worth knowing before switching it
                      on, and too long to carry on every row. */}
                  {/* TipMark, not TipDot: a focusable dot on every row would be
                      eleven more tab stops. The same words follow in the row's
                      text for a screen reader instead. */}
                  <TipMark text={f.detail} />
                </span>
                {/* One line on every row. Some rows went without one, on the
                    argument that their name already said it, and the list read
                    as two kinds of row; a line each is what lets it be scanned. */}
                <span className="bm8__desc">{f.blurb}</span>
                <span className="u-sr-only">{f.detail}</span>
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

                {/* The end of the row: its switch, then its chevron, against the
                    edge. With no chevron the switch takes the edge itself, rather
                    than sitting beside an empty place for one.

                    --- The gear variant ------------------------------------------

                    `gear` is true on exactly the rows that have BOTH: a switch of
                    their own, because the family narrowed to one method, AND a
                    settings page to open. Not a family row — those have no switch
                    to move. Not a switch-only row — those have nowhere to go, so
                    a gear would open nothing. Not RSA's `setup` target, which is
                    a configuration form rather than the settings page. Two rows
                    in the shipped catalogue satisfy that; the head names them.

                    When it is on, the order inverts. The switch goes LAST and so
                    takes the row's right edge — which is where every switch-only
                    row already puts its switch, so in this variant every switch
                    in the list lines up rather than two of them sitting a
                    chevron's width short of the rest.

                    The gear is a real button and the row still opens. That looks
                    like the "separate Settings button" this list was told not to
                    grow, and it is a different thing: the chevron it replaces was
                    already only a SIGN — `aria-hidden`, unclickable, with the
                    row's own stretched `::after` taking the press. Making that
                    sign pressable adds an entrance; it does not add a
                    destination, and it does not take the 870px target away from
                    the row. */}
                {(() => {
                  const gear = Boolean(gearEnds && single && target?.kind === 'settings' && open)
                  const ctl = single && (
                    <span className="bm8__rowctl">
                      <MethodControls
                        compact
                        m={single}
                        isDefault={defaultMethod === single.id}
                        onToggle={onToggle}
                        onSetup={onSetup}
                        onMakeDefault={open ? undefined : onMakeDefault}
                      />
                    </span>
                  )
                  return (
                    <span className={`bm8__rowend ${gear ? 'is-gear' : ''}`}>
                      {gear ? (
                        <>
                          <span className="bm8__rowgear">
                            <IconButton
                              icon={Settings}
                              label={`${title} settings`}
                              size="sm"
                              tone="ghost"
                              /* `gear` is only true where `open` is set, but the
                                 flag is a boolean and cannot narrow it. */
                              onClick={open ?? undefined}
                            />
                          </span>
                          {ctl}
                        </>
                      ) : (
                        <>
                          {ctl}
                          {open && (
                            <span className="bm8__rowchev" aria-hidden>
                              <ChevronRight size={17} strokeWidth={2} />
                            </span>
                          )}
                        </>
                      )}
                    </span>
                  )
                })()}
              </span>
            </div>
          )
        })}
      </div>

      {/* A "nothing matches" line stood here, and it was firing on a list with
          rows on it: `rows` is the family cards, and the three primaries are
          not families, so filtering to Primary sign-in methods emptied every
          card and tripped the message underneath three visible rows — with an
          empty query in the quotation marks, because there was no search. */}
    </div>
  )
}

/* --- The slide-over ------------------------------------------------------------ */

/* The standard ease, as the tuple motion wants it. */
const PAGE_EASE: [number, number, number, number] = [0.2, 0, 0, 1]

/* The category, as a slide-over: its methods on one pane, and — for the five
   families that have any — the settings the MFA sheet says belong to them.

   One panel with pages rather than a surface per job (see `PanelPage`). A
   method's setup is pushed over its family and Back pops it. A family of one
   opens straight onto its settings or its setup, because its row already
   carries everything a Methods pane would have shown. */
function CategoryDrawer({
  pages,
  methods,
  policies,
  onBack,
  onClose,
  onToggle,
  defaultMethod,
  onSetup,
  onMakeDefault,
  saved,
  onSaveSetup,
  choices,
  onSaveCard,
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
  pages: PanelPage[]
  methods: AuthMethod[]
  policies: Policy[]
  onBack: () => void
  onClose: () => void
  onToggle: (id: string, on: boolean) => void
  defaultMethod: string | null
  /** Pushes a method's setup over the page it was pressed on. */
  onSetup: (m: AuthMethod) => void
  onMakeDefault: (id: string) => void
  /** What each method's setup was last saved with, per id. */
  saved: Record<string, ConfigField[]>
  onSaveSetup: (m: AuthMethod, fields: ConfigField[]) => void
  /** What each method's setup card chose last time — Microsoft Push's server. */
  choices: Record<string, string>
  onSaveCard: (m: AuthMethod, server: string) => void
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
  const reduce = useReducedMotion()
  const top = pages.length > 0 ? pages[pages.length - 1] : null
  const under = pages.length > 1 ? pages[pages.length - 2] : null
  const key = top ? pageKey(top) : 'closed'

  const setupOf = top?.kind === 'setup' ? (methods.find((m) => m.id === top.methodId) ?? null) : null
  /* Setup belongs to a family too — it is what the head names when there is no
     Back to name it. A primary has no family, and gets no line. */
  const channel = top === null ? null : top.kind === 'setup' ? (setupOf?.channel ?? null) : top.channel
  const family = channel ? (FAMILIES.find((f) => f.channel === channel) ?? null) : null
  const backTo = under && under.kind !== 'setup' ? under.channel : null

  /* An authenticator app's one-card setup, where it has one — see setup-guide.ts. */
  const card = setupOf ? setupCardFor(setupOf.id) : null
  const draft = useSetupDraft(setupOf, saved, choices)

  const [pane, setPane] = useState<'methods' | 'settings'>('methods')
  /* A panel opens on Methods. Keyed on the page at the bottom of the stack, not
     the top, so coming Back from a setup lands on the pane it was pressed from. */
  const root = pages.length > 0 ? pageKey(pages[0]) : null
  const [paneFor, setPaneFor] = useState(root)
  if (root !== paneFor) {
    setPaneFor(root)
    setPane('methods')
  }

  /* Deeper pages arrive from the right and Back arrives from the left, so the
     content moves the way the stack does. */
  const depth = pages.length
  const [lastDepth, setLastDepth] = useState(depth)
  const [dir, setDir] = useState(1)
  if (depth !== lastDepth) {
    setLastDepth(depth)
    setDir(depth > lastDepth ? 1 : -1)
  }

  /* Each page starts at its top, and focus follows the page. The button that
     pushed it has just unmounted, and focus left on a detached node falls to
     <body> — outside the panel, where Tab walks the console behind the scrim.

     Not on opening. The dialog moves focus in itself and remembers what to hand
     it back to on close, and focusing the panel first would overwrite that with
     the panel. */
  const pageRef = useRef<HTMLDivElement>(null)
  const lastKey = useRef(key)
  useLayoutEffect(() => {
    const was = lastKey.current
    lastKey.current = key
    const el = pageRef.current
    if (!el || was === key || key === 'closed') return
    el.closest('.bx-drawer__body')?.scrollTo({ top: 0 })
    if (was !== 'closed') el.closest<HTMLElement>('.bx-drawer')?.focus({ preventScroll: true })
  }, [key])

  const inside = family
    ? methods.filter((m) => m.channel === family.channel && matchesUse(m, use))
    : []
  const live = inside.filter((m) => !methodBlocker(m)).length
  const enrolled = inside.reduce((n, m) => n + (m.enrolled ?? 0), 0)
  const unconfigured = inside.filter((m) => !m.configured).length
  /* A family of one is headed by its method, the way its row is named — on the
     admin's list. A person's row keeps the family's name, so their panel does
     too, and its "On" would be the tenant's state above the person's own switch. */
  const single = !isUser && inside.length === 1 ? inside[0] : null

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

  const slide = {
    initial: { opacity: 0, x: reduce ? 0 : 24 * dir },
    animate: { opacity: 1, x: 0 },
    transition: { duration: reduce ? 0 : 0.2, ease: PAGE_EASE },
  }
  /* A card has no required fields; what its Save needs is `setupReady`. */
  const missing = card ? 0 : draft.missing.length

  return (
    <Drawer
      open={top !== null}
      onClose={onClose}
      /* 680, not 620. The settings rows carry an icon, a label, a tip and a
         provenance chip before the control even starts, and a segmented
         control needs its options on one line to be worth using. It is also
         the width the setup modal was, so RSA's form did not have to reflow to
         move in here. */
      width={680}
      title={setupOf ? `${setupOf.name} ${card ? 'setup' : 'configuration'}` : (single?.name ?? family?.channel ?? '')}
      /* One header, not two.

         The panel had the kit's own head (name + count + close) and then a
         banner immediately under it repeating the same two facts beside a tile.
         Merged: the tile, the name, the blurb and the numbers are one block, and
         the segment bar is gone — three grey slabs restated a count that is
         already written next to them in words.

         It moves with the page, so a pushed page never shows the head of the
         one under it. */
      head={
        top ? (
          <motion.div key={key} className="bm8__dwstack" {...slide}>
            {/* Named for where it goes. "Back" alone asks you to remember what
                was under this page; the family's name says it. On the line the
                close button already sits on — the panel's two ways out, level
                with each other. */}
            {backTo && (
              <button type="button" className="bm8__back" onClick={onBack}>
                <ArrowLeft size={14} strokeWidth={2} aria-hidden />
                {backTo}
              </button>
            )}
            {setupOf ? (
              <div className="bm8__dwhead">
                <span className="bm8__dwtile bm8__dwtile--logo" aria-hidden>
                  <MethodIcon name={setupOf.name} size={38} />
                </span>
                <div className="bm8__dwtext">
                  <h2>{setupOf.name}</h2>
                  {/* The family, where there is no Back already naming it — a
                      row that said "RSA Authenticator" opens a page headed with
                      the method's own name, and this is what joins the two. */}
                  {!backTo && family && <p>{family.channel}</p>}
                  <div className="bm8__dwstats">
                    <span>{setupOf.configured ? 'Configured' : 'Not configured yet'}</span>
                    {/* Why Save is dead, stated where it stays in view. Each
                        section says it too, but a closed or scrolled-past
                        section says it to nobody. */}
                    {missing > 0 && (
                      <span className="is-warn">
                        <strong>{missing}</strong> required {missing === 1 ? 'field' : 'fields'} left
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ) : family ? (
              <div className={`bm8__dwhead is-${family.tint}`}>
                <span className="bm8__dwtile" aria-hidden>
                  <family.icon size={22} strokeWidth={1.7} />
                </span>
                <div className="bm8__dwtext">
                  <h2 className="bm8__dwtitle">
                    {single ? single.name : family.channel}
                    {single && single.name !== family.channel && (
                      <i className="bm8__badge bm8__badge--use">{family.channel}</i>
                    )}
                  </h2>
                  <p>{family.blurb}</p>
                  <div className="bm8__dwstats">
                    <span>
                      {single ? <strong>{live ? 'On' : 'Off'}</strong> : <><strong>{live}</strong> of {inside.length} enabled</>}
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
            ) : null}
          </motion.div>
        ) : undefined
      }
      actions={
        setupOf ? (
          <>
            {/* Cancel goes where Back goes when there is somewhere to go back
                to. Closing the whole panel from a pushed page would throw away
                the family along with the form. */}
            <Button variant="ghost" onClick={under ? onBack : onClose}>
              Cancel
            </Button>
            <Button
              variant="brand"
              disabled={card ? !setupReady(card, draft) : missing > 0}
              onClick={() => (card ? onSaveCard(setupOf, draft.server) : onSaveSetup(setupOf, draft.fields))}
            >
              Save
            </Button>
          </>
        ) : (
          <Button variant="brand" onClick={onClose}>
            Done
          </Button>
        )
      }
    >
      <motion.div key={key} ref={pageRef} {...slide}>
        {setupOf ? (
          card?.kind === 'app' ? (
            <AppSetupCard method={setupOf} card={card} passcode={draft.passcode} onPasscode={draft.setPasscode} />
          ) : card?.kind === 'nps' ? (
            <NpsSetupCard servers={NPS_SERVERS} value={draft.server} onChange={draft.setServer} />
          ) : (
            <SetupForm draft={draft} />
          )
        ) : family && top?.kind === 'settings' ? (
          <SettingsPane
            family={family}
            famSettings={famSettings}
            ownSettings={ownSettings}
            behaviour={behaviour}
            onBehaviour={onBehaviour}
          />
        ) : family ? (
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
        ) : null}
      </motion.div>
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

function MethodCard({
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
          {/* A "Primary sign-in" chip stood on the first three rows. It was
              answering a question their position already answers — they are the
              three rows above every family card, in the order a session
              actually happens — and it said the same three words three times
              running down the top of the list. The filter still names them, for
              anyone who wants only those.

              Recovery keeps its chip, because nothing else on the row says it:
              a method can be a second factor and a way back in at once, and
              which ones are is not derivable from where they sit. */}
          {m.alsoRecovery && (
            <i className="bm8__badge bm8__badge--use">Recovery</i>
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
        {/* The first sentence on the row, the rest on hover.

            Every description here is built the same way: what the method is,
            then the security caveat that goes with it — "…and only ever as
            strong as the mailbox behind it". Both are worth having and only one
            of them is worth two lines of every row in a list of twenty-four.
            The row states the method; the caveat is a hover away and rides on
            the row's accessible name for anyone not using a pointer. */}
        <span className="bm8__desc" title={m.description}>
          {lede(m.description)}
        </span>
        {uses > 0 ? (
          <span className="bm8__usage">
            Used in {uses} policy rule{uses === 1 ? '' : 's'}
          </span>
        ) : (
          !m.configured && <span className="bm8__usage is-quiet">Not configured yet</span>
        )}

      </div>

      <div className="bm8__right">
        <MethodControls
          m={m}
          isDefault={isDefault}
          onToggle={onToggle}
          onSetup={onSetup}
          onMakeDefault={onMakeDefault}
        />
      </div>
    </div>
  )
}

/* A method's own controls — the switch, and whatever else it offers beside it.

   On the method row, and on a family row whose family holds only this method
   (see `familyRow`). One component, so a method reads the same wherever its
   controls turn up. */
function MethodControls({
  m,
  isDefault,
  onToggle,
  onSetup,
  onMakeDefault,
  compact,
}: {
  m: AuthMethod
  isDefault: boolean
  onToggle: (id: string, on: boolean) => void
  onSetup: (m: AuthMethod) => void
  /* Absent on a list row that also opens a page: a star, a switch and a
     chevron do not fit the end of one row, and the family it belongs to is
     where that method is made the default. */
  onMakeDefault?: (id: string) => void
  /* On a list row, where it shares a column with the switches down the page:
     "Make default" becomes a star, and there is no Edit — the row itself opens
     the configuration. */
  compact?: boolean
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

  /* Edit only where the configuration is worth returning to — see
     `hasConfigPage`. A compact row opens that page itself, so it carries no
     button for it. */
  const canEdit = hasConfigPage(m) && !compact

  /* Two states, and only one control each.

     A method that has not been configured cannot be switched on, so the
     switch was rendered disabled next to a button that could actually be
     pressed — a dead control sitting above the live one, both competing
     for the same corner. The switch is not "off" in that state, it is
     absent: there is nothing yet to turn on. So the row shows the one
     thing you can do, and earns its switch by being set up.

     The knock-on is that enabling is no longer reachable from this row
     until setup completes, which is the truth the disabled switch was
     only gesturing at. */
  return (
    <>
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
            {canBeDefault &&
              !isDefault &&
              onMakeDefault &&
              (compact ? (
                /* A star rather than the words: on a list row it sits in the
                   column the switches line up in, and "Make default" in text
                   would push the row's figures out of theirs. The label is
                   the tooltip. */
                <IconButton
                  icon={Star}
                  label={`Make ${m.name} the default`}
                  size="sm"
                  tone="ghost"
                  onClick={() => onMakeDefault(m.id)}
                />
              ) : (
                <Button variant="ghost" size="sm" onClick={() => onMakeDefault(m.id)}>
                  <Star size={13} strokeWidth={2} aria-hidden />
                  Make default
                </Button>
              ))}
            {/* The authenticator apps' one-card setup — install and scan, or
                Microsoft Push's server — on a button of its own beside the
                switch, because it is something you do rather than somewhere
                you go. */}
            {setupCardFor(m.id) && (
              <Button variant="secondary" size="sm" onClick={() => onSetup(m)}>
                Set up
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
        </Button>
      )}
    </>
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

/* `PrimarySignIn` stood here — a block stating the two passwordless starts and
   the tenant default, written to be composed by both layouts. Password,
   Passkeys and Magic link are catalogue entries now and render as their own
   rows at the top of the list, so nothing had rendered this in a while; v2 was
   the last thing importing it, and v2 is gone. */

