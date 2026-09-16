import { motion, useReducedMotion } from 'motion/react'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useEffect } from 'react'
import {
  ArrowLeft,
  BellRing,
  Check,
  ChevronRight,
  CreditCard,
  Fingerprint,
  Grid3x3,
  HelpCircle,
  KeyRound,
  LifeBuoy,
  type LucideIcon,
  Mail,
  MessageSquare,
  Pencil,
  Phone,
  RectangleEllipsis,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Star,
} from 'lucide-react'

import { Badge, Button, Callout, Drawer, IconButton, MenuButton, Modal, SearchBox, TipDot, Toggle } from '../kit'
import { methodBlocker, type AuthMethod } from '../methods'
import { useBrand, type Role } from '../store'
import { EmptyState, NoMatches } from '../empty'
import { MethodIcon, RecoveryTab } from './recovery'
import { UserMethodCard } from './user-config'
import { activateIn, enrolIssue, enrolShapeFor, readyFor, type UserEnrolment } from '../user-methods'
import { ActiveMethod } from './active-method'
import { SettingField } from '../setting-field'
import { ConfigFields } from './method-forms'
import { configFor, invalidFields, missingFields, setField, storeSecrets, type ConfigField } from '../method-config'
import { familySettingsFor, methodSettingsFor, settingKey, type MfaValue, type MfaValues } from '../mfa-join'
import { fieldValue, type MfaSetting } from '../mfa-settings'
import {
  LINK_SCREENS,
  backLabel,
  canServeAsDefault,
  clampVerify,
  familyEnrolled,
  familyRow,
  firstDefaultable,
  hasConfigPage,
  noBalanceWarning,
  pageKey,
  resolveDefault,
  rowTarget,
  setupTargetFor,
  tokenButtonLabel,
  turnOffPlan,
  type FamilyRow,
  type PanelPage,
} from './auth-panel'
import { DISPLAY_TOKEN_METHOD_ID, assignedCount, tokensOf } from '../hardware-tokens'
import { NPS_SERVERS, setupCardFor, setupReady } from '../setup-guide'
import { AppSetupCard, NpsSetupCard } from './setup-card'
import { useLeaveGuard } from '../leave-guard'

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

/* Each tab carries an icon, as the zone page's tabs do: one tab spec across the product. */
const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'methods', label: 'Methods', icon: ShieldCheck },
  { id: 'recovery', label: 'Recovery', icon: LifeBuoy },
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
    icon: BellRing,
    tint: 'indigo',
  },
  {
    channel: 'RSA Authenticator',
    blurb: 'SecurID tokencodes, softtokens and push, via RSA Authentication Manager.',
    detail:
      'Accepts whichever the user holds: a SecurID tokencode, an RSA display token, or a push. Codes are checked by RSA Authentication Manager, so the connection to it has to be set up before anything can be verified.',
    icon: RectangleEllipsis,
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

/* Which method the tenant starts on, and where it falls back to, is
   `firstDefaultable` and `resolveDefault` in auth-panel.ts: Email first, because
   a mailbox is the one delivery channel every account already has. */

/** Security Questions' "Questions to configure", as the person's form reads it. */
const KBA_LIMIT_KEY = settingKey('family', 'Security Questions', 'kba-limit')
const KBA_VERIFY_KEY = settingKey('family', 'Security Questions', 'kba-verify')

export function AuthMethods({ role = 'admin' }: { role?: Role }) {
  const store = useBrand()
  const isUser = role === 'user'

  /* One list, and the two axes that narrow it.

     `use` is the filter: primary, second factor, recovery. Recovery is a filter
     VALUE rather than a fourth kind, because a method can be a second factor and
     a way back in at the same time. `use` says what a method is; `alsoRecovery`
     says what it can also do, and a row can honestly appear under both. */
  const [use, setUse] = useState<UseFilter>('all')

  const [tab, setTab] = useState<Tab>('methods')
  /* The slider, as a stack of pages — a family, its settings, or a method's
     setup — deepest last. Empty closes it. See `PanelPage`. */
  const [panel, setPanel] = useState<PanelPage[]>([])

  /* Which end a settings row wears: the chevron, or a gear with the switch
     moved out to the edge beside it. See `gearRows` below. Deliberately not
     persisted: it is a comparison being made now, not a preference. */
  const [gearEnds, setGearEnds] = useState(false)

  /* Arriving by a link that unmounted with its page — the Display tokens back
     link, above all — focus is on <body>. It goes to the Hardware Token row
     that page was opened from, or else the heading (15 Sep 2026). Only on
     arrival, and only when nothing has focus: a rail click keeps its row. */
  const heading = useRef<HTMLHeadingElement | null>(null)
  const cameFrom = store.screen.name === 'methods' ? store.screen.from : undefined
  useEffect(() => {
    const active = document.activeElement
    if (active && active !== document.body) return
    const row =
      cameFrom === 'display-tokens'
        ? document.querySelector<HTMLElement>('[data-channel="Hardware Token"] .bm8__open, [data-channel="Hardware Token"] button')
        : null
    ;(row ?? heading.current)?.focus({ preventScroll: true })
    // Arrival only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* From the store, not the screen. The screen unmounts on every tab change and
     every navigation; the catalogue, the tenant's settings and the person's own
     enrolment all commit as they change, so they have to outlive it. */
  const {
    methods,
    setMethods,
    enrolment,
    setEnrolment,
    mfaBehaviour: behaviour,
    setMfaBehaviour,
    methodConfig: savedConfig,
    setMethodConfig,
    setupChoice,
    setSetupChoice,
  } = store

  /* The tenant-wide default: the method a user is sent to when nothing else has
     been chosen for them. One at a time, so it is an id rather than a flag per
     method. A default that can no longer run moves on by the same rule that
     picks the first one (see `resolveDefault`), and the store is kept in step so
     the choice does not move again behind anybody's back. */
  const defaultMethod = resolveDefault(store.defaultMethodId, methods)
  const { defaultMethodId, setDefaultMethodId } = store
  useEffect(() => {
    if (defaultMethodId !== defaultMethod) setDefaultMethodId(defaultMethod)
  }, [defaultMethod, defaultMethodId, setDefaultMethodId])

  /* Turning a method off, when rules name it or it is the default nothing can
     replace, asks first. Kept after closing so the dialog's words hold while it
     animates out. */
  const [off, setOff] = useState<{ id: string; name: string; lines: string[] } | null>(null)
  const [offOpen, setOffOpen] = useState(false)

  const applyEnabled = (id: string, on: boolean) => {
    const m = methods.find((x) => x.id === id)
    if (!m) return
    /* Enabling writes both fields. `methodBlocker` reads `active` AND `allowed`,
       so writing only one leaves a method reporting "Not offered to end users"
       with nothing on this screen able to clear it. */
    setMethods((all) => all.map((x) => (x.id === id ? { ...x, active: on, allowed: on } : x)))
    if (on) {
      const warning = noBalanceWarning(m)
      if (defaultMethod === null && canServeAsDefault({ ...m, active: true, allowed: true })) {
        setDefaultMethodId(id)
        store.showToast(`Default is now ${m.name}`)
      } else if (warning) {
        store.showToast(warning)
      }
      return
    }
    /* Switching off the default moves it on rather than leaving it pointing at
       something that cannot run, and says where it went. */
    if (defaultMethod === id) {
      const replacement = firstDefaultable(methods, id)
      setDefaultMethodId(replacement)
      const r = methods.find((x) => x.id === replacement)
      store.showToast(r ? `Default is now ${r.name}` : 'No default method')
    }
  }

  const setEnabled = (id: string, on: boolean) => {
    /* Display Token cannot be switched on while nobody holds a token: every code
       would be rejected. Its row shows Set up then, not a switch, so this only
       stops a stale control from getting through. */
    if (on && id === DISPLAY_TOKEN_METHOD_ID && assignedCount(store.hardwareTokens) === 0) return
    if (!on) {
      const plan = turnOffPlan(methods, id, defaultMethod, store.policies)
      const m = methods.find((x) => x.id === id)
      if (plan.confirm && m) {
        const replacement = plan.replacement ? methods.find((x) => x.id === plan.replacement) : undefined
        setOff({
          id,
          name: m.name,
          lines: [
            ...(plan.rules > 0 ? [`Used in ${plan.rules} policy ${plan.rules === 1 ? 'rule' : 'rules'}.`] : []),
            ...(plan.wasDefault
              ? [replacement ? `${replacement.name} becomes the default.` : 'No other method can be the default.']
              : []),
          ],
        })
        setOffOpen(true)
        return
      }
    }
    applyEnabled(id, on)
  }

  /* "Set up" opens the integration's own form, as a page in the slider. From a
     row on the list the form is the slider's first page; from inside a family it
     is pushed over that family, and Back returns to it. Display Token's setup is
     the Display tokens page rather than a form — see `setupTargetFor` — so its
     button leaves this screen, through the leave guard like any navigation. */
  const openSetup = (m: AuthMethod) => {
    const to = setupTargetFor(m)
    if (to.kind === 'screen') store.go(to.screen)
    else setPanel([to.page])
  }
  const pushSetup = (m: AuthMethod) => {
    const to = setupTargetFor(m)
    if (to.kind === 'screen') store.go(to.screen)
    else setPanel((s) => [...s, to.page])
  }
  const back = () => setPanel((s) => s.slice(0, -1))

  /* Saving marks the method configured, which is what the rest of the screen
     reads to decide between a Set up button and a toggle, and keeps what the
     form was saved with so it reopens on it. Secrets are held, not kept. */
  const finishSetup = (m: AuthMethod, fields: ConfigField[]) => {
    const first = !m.configured
    setMethodConfig((prev) => ({ ...prev, [m.id]: storeSecrets(fields) }))
    setMethods((all) => all.map((x) => (x.id === m.id ? { ...x, configured: true } : x)))
    back()
    store.showToast(first ? `${m.name} is set up. Turn it on to use it.` : `${m.name} updated`)
  }

  /* What a setup card chose, per method — Microsoft Push's server, so its card
     reopens on it. A code app keeps nothing: the code it showed is checked and
     spent. */
  const finishCard = (m: AuthMethod, server: string) => {
    const card = setupCardFor(m.id)
    if (card?.kind === 'nps') setSetupChoice((prev) => ({ ...prev, [m.id]: server }))
    setMethods((all) => all.map((x) => (x.id === m.id ? { ...x, configured: true } : x)))
    back()
    const via = card?.kind === 'nps' ? NPS_SERVERS.find((x) => x.id === server)?.name : undefined
    store.showToast(via ? `${m.name} will send through ${via}` : `${m.name} is set up`)
  }

  /* What this viewer may see at all. A person's catalogue is the tenant's with
     everything blocked removed, and without the primaries: Password, Passkeys
     and Magic link are how a session STARTS, decided by an admin for everybody,
     and this page is about the second step. */
  const reachable = isUser ? methods.filter((m) => m.use !== 'primary' && !methodBlocker(m)) : methods

  /* Which rows the gear variant reaches, read off the same primitives the list
     uses: a family that narrows to ONE method and has settings. */
  const gearRows = useMemo(
    () =>
      FAMILIES.flatMap((f) => {
        const inside = reachable.filter((m) => m.use === 'second' && m.channel === f.channel && matchesUse(m, use))
        const shape = familyRow(f.channel, inside)
        return !shape.opens && rowTarget(shape)?.kind === 'settings' ? [shape.method.name] : []
      }),
    [reachable, use],
  )

  /* --- The person's side ---------------------------------------------------------- */

  /* Display Tokens are assigned by an admin, so holding one is this person's
     enrolment in Display Token. */
  const held = tokensOf(store.hardwareTokens, store.viewerId).length
  const heldFor = (id: string) => (id === DISPLAY_TOKEN_METHOD_ID ? held : 0)
  /** Methods this person has set up (or holds a token for). */
  const configuredIds = reachable
    .filter((m) => enrolment.configured.includes(m.id) || heldFor(m.id) > 0)
    .map((m) => m.id)
  /** Methods this person could switch on now. */
  const readyIds = reachable.filter((m) => readyFor(m.id, enrolment, heldFor(m.id))).map((m) => m.id)

  const activate = (id: string, on: boolean) => {
    /* One active method at a time, and never none once something is set up:
       switching off the active one hands over to another, or stays on. */
    /* A method the person set up takes over before one that needs nothing. */
    const handover = [...readyIds.filter((x) => configuredIds.includes(x)), ...readyIds.filter((x) => !configuredIds.includes(x))]
    const { next, handedTo, kept } = activateIn(enrolment, id, on, handover)
    if (kept) {
      store.showToast('Turn on another method first')
      return
    }
    setEnrolment(next)
    const shown = methods.find((x) => x.id === (on ? id : handedTo))
    if (shown) store.showToast(`${shown.name} is now your active method`)
  }

  const saveEnrolment = (id: string, values: Record<string, string>) => {
    const first = !enrolment.configured.includes(id)
    setEnrolment((e) => ({
      ...e,
      configured: e.configured.includes(id) ? e.configured : [...e.configured, id],
      values: { ...e.values, [id]: values },
      /* The first method set up becomes the active one — and so does this one
         when the active method is no longer offered to the person. */
      active: e.active && reachable.some((m) => m.id === e.active) ? e.active : id,
    }))
    const m = methods.find((x) => x.id === id)
    if (m) store.showToast(first ? `${m.name} is set up` : `${m.name} updated`)
  }

  /* The open card's form, held here rather than in the form, so the one leave
     guard can see it: opening another card, closing the panel and leaving the
     page all ask before throwing typed details away. Cancel is the discard. */
  const [openCard, setOpenCard] = useState<string | null>(null)
  const [cardDraft, setCardDraft] = useState<Record<string, string>>({})
  const questions = Number(behaviour[KBA_LIMIT_KEY] ?? 3)
  const cardIssue = openCard ? enrolIssue(enrolShapeFor(openCard).kind, cardDraft, questions) : null
  const cardDirty = !!openCard && !sameValues(cardDraft, enrolment.values[openCard] ?? {})

  /* Opening another card, or closing this one from its Edit button, asks first
     when something was typed. Cancel is the one discard that does not ask. */
  const openEnrol = (id: string | null) => {
    if (id === openCard) return
    store.requestLeave(() => {
      setOpenCard(id)
      setCardDraft(id ? (enrolment.values[id] ?? {}) : {})
    })
  }
  const cancelEnrol = () => {
    setOpenCard(null)
    setCardDraft({})
  }
  const saveCard = (): boolean => {
    if (!openCard || cardIssue) return false
    saveEnrolment(openCard, cardDraft)
    setOpenCard(null)
    setCardDraft({})
    return true
  }
  const enrol: EnrolBinding = {
    ready: readyIds,
    configured: configuredIds,
    held,
    questions,
    openCard,
    onOpenCard: openEnrol,
    onCancelCard: cancelEnrol,
    draft: cardDraft,
    onDraft: (k, v) => setCardDraft((d) => ({ ...d, [k]: v })),
    onSave: () => {
      saveCard()
    },
    onActivate: activate,
    active: enrolment.active,
    guard: {
      dirty: cardDirty,
      save: saveCard,
      blocked: cardIssue ? cardIssue.message || 'Fill in every field to save.' : null,
    },
  }

  const closePanel = () => {
    setPanel([])
    setOpenCard(null)
    setCardDraft({})
  }

  return (
    /* Compact on both tabs and for both roles. The family, its settings and a
       setup form all open in the slider, over the compact page. */
    <div className="bpage bpage--compact bm8">
      <header className="bm8__head">
        <div>
          <h1 ref={heading} tabIndex={-1}>
            {isUser ? 'Two-step verification' : 'Authentication methods'}
          </h1>
          <p>{isUser ? 'How you prove it is you.' : 'How people prove who they are.'}</p>
        </div>

        {/* The comparison switch. A person's page never shows it: their rows all
            open onto an enrolment form and none carries a switch. */}
        {!isUser && gearRows.length > 0 && (
          <div className="bm8__variant">
            <Toggle size="sm" checked={gearEnds} onChange={setGearEnds} label="Gear on settings rows" />
            <span>
              Gear on settings rows
              <i>{gearRows.join(', ')}</i>
            </span>
          </div>
        )}
      </header>

      {/* Recovery is a tenant policy rather than a personal setting, so a person
          does not get the tab — and a single-tab tab bar is furniture. */}
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
                closePanel()
              }}
            >
              <t.icon size={14} strokeWidth={1.9} aria-hidden />
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Inside a `bv5` wrapper: recovery.css writes some rules as `.bv5 .bv5__x`. */}
      {tab === 'recovery' && !isUser && (
        <div className="bv5">
          <RecoveryTab methods={methods} />
        </div>
      )}

      {(tab === 'methods' || isUser) && (
        <>
          {/* Nothing can be the default. Said once, above the list, because the
              Default chip it replaces is simply absent. */}
          {!isUser && defaultMethod === null && (
            <Callout tone="notice">No default method. Turn on a method that can be the default.</Callout>
          )}

          <CategoryList
            methods={reachable}
            onOpen={(channel) => setPanel([{ kind: 'family', channel }])}
            onSettings={(channel) => setPanel([{ kind: 'settings', channel }])}
            gearEnds={gearEnds}
            defaultMethod={defaultMethod}
            use={use}
            onUse={setUse}
            isUser={isUser}
            headcount={store.users.length + store.unlistedUsers}
            onToggle={setEnabled}
            onSetup={openSetup}
            onMakeDefault={setDefaultMethodId}
            enrolment={enrolment}
            configuredIds={configuredIds}
          />

          <CategoryDrawer
            pages={panel}
            methods={reachable}
            onBack={back}
            onClose={closePanel}
            onToggle={setEnabled}
            defaultMethod={defaultMethod}
            onSetup={pushSetup}
            onMakeDefault={setDefaultMethodId}
            saved={savedConfig}
            onSaveSetup={finishSetup}
            choices={setupChoice}
            onSaveCard={finishCard}
            behaviour={behaviour}
            onBehaviour={(p) => setMfaBehaviour((v) => ({ ...v, ...p }))}
            use={use}
            isUser={isUser}
            enrol={enrol}
          />
        </>
      )}

      <Modal
        open={offOpen}
        onClose={() => setOffOpen(false)}
        title={off ? `Turn off ${off.name}?` : ''}
        width={440}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOffOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="brand"
              onClick={() => {
                if (off && offOpen) applyEnabled(off.id, false)
                setOffOpen(false)
              }}
            >
              Turn off
            </Button>
          </>
        }
      >
        <div className="bx-confirm">
          {(off?.lines ?? []).map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </Modal>
    </div>
  )
}

/** Two sets of typed values are the same when every field reads the same, blank or absent alike. */
function sameValues(a: Record<string, string>, b: Record<string, string>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const k of keys) if ((a[k] ?? '') !== (b[k] ?? '')) return false
  return true
}

/* Everything the person's cards need, in one object: which methods are set up
   and ready, the open form, and the guard the slider registers for it. */
interface EnrolBinding {
  ready: string[]
  configured: string[]
  held: number
  questions: number
  active: string | null
  openCard: string | null
  onOpenCard: (id: string | null) => void
  /** Cancel: closes the open form and drops what was typed, without asking. */
  onCancelCard: () => void
  draft: Record<string, string>
  onDraft: (key: string, value: string) => void
  onSave: () => void
  onActivate: (id: string, on: boolean) => void
  guard: { dirty: boolean; save: () => boolean; blocked: string | null }
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


const GROUPS: { id: 'connect' | 'policy' | 'advanced'; label: string }[] = [
  { id: 'connect', label: 'Connection' },
  { id: 'policy', label: 'Policy' },
  { id: 'advanced', label: 'Advanced' },
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
  /* A setup card's input: the code an app showed, or Microsoft Push's server. */
  const [passcode, setPasscode] = useState('')
  const [server, setServer] = useState('')
  /* What the form opened with, so closing it knows whether anything was typed. */
  const [initial, setInitial] = useState<{ fields: ConfigField[]; server: string }>({ fields: [], server: '' })

  /* Re-seed when the page opens on a different method, the same way the other
     forms on this screen do — keyed on the id, because the object identity
     changes on every store write without the subject changing. */
  const subject = method?.id ?? null
  if (subject !== seeded) {
    setSeeded(subject)
    /* What was entered last time beats the schema's defaults — an edit form
       that opens on defaults is not an edit form. */
    /* The method's live state decides whether a never-saved form opens as a
       running integration or a blank one — RSA set up this session is
       configured in the store, not in the static catalogue. */
    const seedFields = subject ? (saved[subject] ?? configFor(subject, method?.configured)?.fields ?? []) : []
    const seedServer = subject ? chosen[subject] ?? '' : ''
    setFields(seedFields)
    setPasscode('')
    setServer(seedServer)
    setInitial({ fields: seedFields, server: seedServer })
  }

  const dirty =
    !!subject && (passcode !== '' || server !== initial.server || JSON.stringify(fields) !== JSON.stringify(initial.fields))

  return {
    dirty,
    fields,
    setFields,
    missing: missingFields(fields),
    invalid: invalidFields(fields),
    cfg: method ? configFor(method.id, method.configured) : null,
    passcode,
    setPasscode,
    server,
    setServer,
  }
}

type SetupDraft = ReturnType<typeof useSetupDraft>

function SetupForm({ draft }: { draft: SetupDraft }) {
  const { cfg, fields, setFields } = draft
  if (!cfg) return null

  return (
    <div className="bm8__setup">
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

      {/* One straight form, top to bottom. Grouped under plain headings when
          the integration says so, flat when it does not.

          The groups were bordered panels that each collapsed, with a tinted
          header, a blurb and a count pill — Advanced shut by default. On the
          owner's word (15 Sep 2026) that was too boxy: every field shows, the
          headings are just words, and the head's "N required fields left" is
          the one place outstanding work is counted. */}
      {GROUPS.filter((g) => fields.some((f) => (f.group ?? 'connect') === g.id)).length > 1 ? (
        GROUPS.map((g) => {
          const own = fields.filter((f) => (f.group ?? 'connect') === g.id)
          if (own.length === 0) return null
          return (
            <section key={g.id} className="bm8__setupgroup" aria-labelledby={`bm8-setup-${g.id}`}>
              <h3 id={`bm8-setup-${g.id}`} className="bm8__setuphead">
                {g.label}
              </h3>
              <ConfigFields fields={own} onChange={(id, value) => setFields((f) => setField(f, id, value))} />
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
  headcount,
  onToggle,
  onSetup,
  onSettings,
  onMakeDefault,
  enrolment,
  configuredIds,
  gearEnds = false,
}: {
  methods: AuthMethod[]
  onOpen: (channel: string) => void
  defaultMethod: string | null
  use: UseFilter
  onUse: (u: UseFilter) => void
  isUser: boolean
  /** People in the tenant, the ceiling for an enrolment figure. */
  headcount: number
  onToggle: (id: string, on: boolean) => void
  onSetup: (m: AuthMethod) => void
  /** A family of one's settings, opened straight from its row. */
  onSettings: (channel: string) => void
  onMakeDefault: (id: string) => void
  enrolment: UserEnrolment
  /** The person's set-up methods, for the Configured pill on their rows. */
  configuredIds: string[]
  /** The variant switch in the page head. See `gearEnds` on the screen. */
  gearEnds?: boolean
}) {
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()

  const rows = useMemo(() => {
    return FAMILIES.map((f) => {
      /* Narrowed by the filter before anything is counted, so a row's numbers
         describe what opening it will actually show. */
      const inside = methods.filter((m) => m.use === 'second' && m.channel === f.channel && matchesUse(m, use))
      const live = inside.filter((m) => !methodBlocker(m))
      /* Transactions are bought as a pool and a family can spend from one pool
         through several methods, so the balance is counted once per pool. */
      const pools = new Map<string, number>()
      for (const m of inside) if (m.balance) pools.set(m.balance.label, m.balance.remaining)
      /* A person's rows all open: what sits in their panel is an enrolment form. */
      const shape: FamilyRow = isUser ? { opens: true } : familyRow(f.channel, inside)
      return {
        f,
        shape,
        inside,
        total: inside.length,
        live: live.length,
        enrolled: familyEnrolled(inside, headcount),
        txns: pools.size ? [...pools.values()].reduce((a, b) => a + b, 0) : null,
      }
    })
      /* A family the filter has emptied is a family this filter does not reach. */
      .filter((r) => r.total > 0)
      .filter(
        (r) =>
          !needle ||
          r.f.channel.toLowerCase().includes(needle) ||
          /* Searching for a method finds the family holding it — among the
             methods the filter left, so a hidden method cannot bring its row back. */
          r.inside.some((m) => m.name.toLowerCase().includes(needle)),
      )
  }, [methods, needle, use, isUser, headcount])

  /* Recovery is a tenant policy, the primaries are not in a person's catalogue,
     and every method a person sees is a second factor — so none of those three
     is offered as a filter over their own methods. */
  const offered = USES.filter((u) => !(isUser && (u.id === 'recovery' || u.id === 'primary' || u.id === 'second')))
  const current = offered.find((u) => u.id === use) ?? offered[0]

  /* The primaries answer to the same search and the same filter as the families,
     and sit first: a session starts with one of these. A person has none. */
  const primaries = isUser
    ? []
    : methods
        .filter((m) => m.use === 'primary' && matchesUse(m, use))
        .filter((m) => !needle || m.name.toLowerCase().includes(needle) || m.description.toLowerCase().includes(needle))
        .sort((a, b) => PRIMARY_ORDER.indexOf(a.id) - PRIMARY_ORDER.indexOf(b.id))

  type Item = { kind: 'primary'; m: AuthMethod } | { kind: 'family'; row: (typeof rows)[number] }
  const items: Item[] = [
    ...primaries.map((m) => ({ kind: 'primary' as const, m })),
    ...rows.map((row) => ({ kind: 'family' as const, row })),
  ]
  /* The whole list, not paged. Zones, device and risk profiles page theirs;
     the methods are one catalogue of about fifteen, and the owner wants it read
     top to bottom on one scroll. */

  /* Nothing a person can use at all: not a search that missed, an empty page. */
  if (isUser && methods.length === 0) {
    return (
      <EmptyState icon={ShieldCheck} title="No methods available" blurb="Your admin hasn't turned any on." />
    )
  }

  return (
    <>
      {/* The one method that runs, stated before the catalogue rather than
          found inside it. Only on the person's side. */}
      {isUser && <ActiveMethod methods={methods} enrolment={enrolment} anySetUp={configuredIds.length > 0} />}

      <div className="bm8__bar">
        <SearchBox value={q} onChange={setQ} placeholder="Search methods" label="Search methods" />

        {/* The kit's own menu, anchored to the trigger's right edge so it does
            not run off the page. No count on the trigger: the list says how
            many it holds. */}
        <MenuButton
          size="sm"
          align="end"
          label={current.label}
          items={offered.map((u) => ({
            id: u.id,
            label: u.label,
            icon: u.id === use ? Check : undefined,
          }))}
          onSelect={(id) => onUse(id as UseFilter)}
        />
      </div>

      {items.length === 0 ? (
        <NoMatches
          noun="methods"
          query={q}
          filtered={use !== 'all'}
          onClear={() => {
            setQ('')
            onUse('all')
          }}
        />
      ) : (
        <>
          {/* `is-gear` on the LIST, not on the rows it changes: the end of every
              row reserves one width so the figures beside them read as a column. */}
          <ul
            aria-label={isUser ? 'Your methods' : 'Methods'}
            className={`bm8__list bm8__list--oneline ${isUser ? 'is-person' : ''} ${gearEnds ? 'is-gear' : ''}`}
          >
            {items.map((item) =>
              item.kind === 'primary' ? (
                <MethodCard
                  key={item.m.id}
                  as="li"
                  m={item.m}
                  onToggle={onToggle}
                  isDefault={defaultMethod === item.m.id}
                  onSetup={onSetup}
                  onMakeDefault={onMakeDefault}
                />
              ) : (
                <FamilyListRow
                  key={item.row.f.channel}
                  row={item.row}
                  isUser={isUser}
                  gearEnds={gearEnds}
                  defaultMethod={defaultMethod}
                  configured={item.row.inside.some((m) => configuredIds.includes(m.id))}
                  onOpen={onOpen}
                  onSettings={onSettings}
                  onToggle={onToggle}
                  onSetup={onSetup}
                  onMakeDefault={onMakeDefault}
                />
              ),
            )}
          </ul>
        </>
      )}
    </>
  )
}

/* One family on the list. A family of one is named for its method and carries
   its controls; a family with variants opens the slider. */
function FamilyListRow({
  row,
  isUser,
  gearEnds,
  defaultMethod,
  configured,
  onOpen,
  onSettings,
  onToggle,
  onSetup,
  onMakeDefault,
}: {
  row: { f: Family; shape: FamilyRow; inside: AuthMethod[]; live: number; enrolled: number; txns: number | null }
  isUser: boolean
  gearEnds: boolean
  defaultMethod: string | null
  /** The person has set up a method in this family. */
  configured: boolean
  onOpen: (channel: string) => void
  onSettings: (channel: string) => void
  onToggle: (id: string, on: boolean) => void
  onSetup: (m: AuthMethod) => void
  onMakeDefault: (id: string) => void
}) {
  const { f, shape, inside, live, enrolled, txns } = row
  /* A family of one is named for its method — "CAC Card", not "Smart Cards" —
     because that is the thing the switch on the row turns on. */
  const single = shape.opens ? null : shape.method
  /* Tenant facts are the admin's. A person's row says only whether they have
     set something up here. */
  const holdsDefault =
    !isUser && (single ? defaultMethod === single.id : defaultMethod !== null && inside.some((m) => m.id === defaultMethod))
  const title = single ? single.name : f.channel
  const target = rowTarget(shape)
  const open = !target
    ? null
    : target.kind === 'family'
      ? () => onOpen(f.channel)
      : target.kind === 'settings'
        ? () => onSettings(f.channel)
        : () => onSetup(target.method)
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
    <li
      className={`bm8__card bm8__card--family ${open ? 'is-link' : ''} ${live === 0 ? 'is-off' : ''}`}
      data-channel={f.channel}
    >
      <span className="bm8__tile is-brand" aria-hidden>
        <f.icon size={19} strokeWidth={1.7} />
      </span>

      <span className="bm8__info">
        <span className="bm8__name">
          {/* The row's one link, stretched over the whole row by its `::after`,
              so the row opens from anywhere while the switch at its end stays a
              control of its own. */}
          {open ? (
            <button type="button" className="bm8__open" aria-haspopup="dialog" onClick={open}>
              {title}
            </button>
          ) : (
            title
          )}
          {single && single.name !== f.channel && <i className="bm8__badge bm8__badge--use">{f.channel}</i>}
          {f.isNew && <i className="bm8__new">New</i>}
          {holdsDefault && (
            <i className="bm8__defchip">
              <Star size={10} strokeWidth={2.4} aria-hidden />
              Default
            </i>
          )}
          {/* What the family is, holds and costs, on the tip beside the name
              rather than as a line under it. A focusable mark, as on a method
              row, so a keyboard reaches the words too. */}
          <TipDot text={`${f.blurb} ${f.detail}`} label={`About ${title}`} />
        </span>
      </span>

      <span className="bm8__right">
        {!isUser && txns !== null && (
          <span className={`bm8__txn ${txns === 0 ? 'is-empty' : txns <= 50 ? 'is-low' : ''}`}>
            {txns === 0 ? 'No transactions left' : `${txns.toLocaleString()} left`}
          </span>
        )}

        {isUser ? (
          configured && <Badge tone="positive">Configured</Badge>
        ) : (
          /* Reserved even at zero, so the figure stays in one column. */
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
        )}

        {/* The end of the row: its switch, then its chevron, against the edge.
            In the gear variant the order inverts, so every switch in the list
            lines up at the right edge. */}
        <span className={`bm8__rowend ${gear ? 'is-gear' : ''}`}>
          {gear ? (
            <>
              <span className="bm8__rowgear">
                {/* Sliders, not a cog, and at the full control size: the cog
                    read as app settings, and at 14px it was the smallest thing
                    on a row whose switch beside it is 40px wide. */}
                <IconButton icon={SlidersHorizontal} label={`${title} settings`} tone="ghost" onClick={open ?? undefined} />
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
      </span>
    </li>
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
  enrol,
}: {
  pages: PanelPage[]
  methods: AuthMethod[]
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
  /** The person's cards: what is set up, the open form and its guard. */
  enrol: EnrolBinding
}) {
  const reduce = useReducedMotion()
  const { go } = useBrand()
  const top = pages.length > 0 ? pages[pages.length - 1] : null
  const under = pages.length > 1 ? pages[pages.length - 2] : null
  const key = top ? pageKey(top) : 'closed'

  const setupOf = top?.kind === 'setup' ? (methods.find((m) => m.id === top.methodId) ?? null) : null
  /* Setup belongs to a family too — it is what the head names when there is no
     Back to name it. A primary has no family, and gets no line. */
  const channel = top === null ? null : top.kind === 'setup' ? (setupOf?.channel ?? null) : top.channel
  const family = channel ? (FAMILIES.find((f) => f.channel === channel) ?? null) : null
  const backTo = backLabel(under)

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
  /* Every second factor in the family, whatever the filter shows: a family
     setting reaches all of them, so the note has to name all of them. */
  const wholeFamily = family ? methods.filter((m) => m.channel === family.channel && m.use === 'second') : []
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

  /* A settings row that is a way through to another screen: token assignment
     opens the Display tokens page on its Assignments tab. Through `go`, so the
     leave guard below still gets its say. */
  const openLink = (settingId: string) => {
    const to = LINK_SCREENS[settingId]
    if (to) go(to)
  }

  const slide = {
    initial: { opacity: 0, x: reduce ? 0 : 24 * dir },
    animate: { opacity: 1, x: 0 },
    transition: { duration: reduce ? 0 : 0.2, ease: PAGE_EASE },
  }
  /* A card has no required fields; what its Save needs is `setupReady`. */
  const missing = card ? 0 : draft.missing.length
  const invalid = card ? 0 : draft.invalid.length
  /* A configured integration saved again unchanged is not an update. */
  const unchanged = !!setupOf?.configured && !draft.dirty
  const canSaveSetup = !!setupOf && !unchanged && (card ? setupReady(card, draft) : missing === 0 && invalid === 0)

  /* Typed setup is not thrown away by Esc, a click outside or Back — the shared
     leave dialog asks first. Cancel stays an explicit discard. Saving from the
     dialog already steps back a page (see finishSetup), so a Back that was
     waiting on it must not step back a second time. */
  const savedFromLeave = useRef(false)

  const confirmLeave = useLeaveGuard({
    /* The person's open enrolment form reports through this guard too: the
       store holds one guard, and the cards live in this panel. */
    dirty: setupOf ? draft.dirty : enrol.guard.dirty,
    save: () => {
      if (!setupOf) return enrol.guard.save()
      if (!canSaveSetup) return false
      savedFromLeave.current = true
      if (card) onSaveCard(setupOf, draft.server)
      else onSaveSetup(setupOf, draft.fields)
      return true
    },
    blocked: !setupOf
      ? enrol.guard.blocked
      : canSaveSetup
        ? null
        : card
          ? 'Finish the setup to save.'
          : missing > 0
            ? `Fill in ${missing} required ${missing === 1 ? 'field' : 'fields'} to save.`
            : invalid > 0
              ? 'Fix the highlighted field to save.'
              : null,
  })
  const leaveThen = (run: () => void, stepsBack: boolean) =>
    confirmLeave(() => {
      const alreadyBack = stepsBack && savedFromLeave.current
      savedFromLeave.current = false
      if (!alreadyBack) run()
    })

  return (
    <Drawer
      open={top !== null}
      onClose={() => leaveThen(onClose, false)}
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
              <button type="button" className="bm8__back" onClick={() => leaveThen(onBack, true)}>
                <ArrowLeft size={14} strokeWidth={2} aria-hidden />
                {backTo}
              </button>
            )}
            {setupOf ? (
              <div className="bm8__dwhead">
                <span className="bm8__dwtile bm8__dwtile--logo" aria-hidden>
                  <MethodIcon name={setupOf.name} size={32} />
                </span>
                <h2 className="bm8__dwtitle">{setupOf.name}</h2>
                {/* Why Save is dead, stated where it stays in view: the head does
                    not scroll, and a scrolled-past section says it to nobody. */}
                {missing > 0 ? (
                  <Badge tone="notice">
                    {missing} required {missing === 1 ? 'field' : 'fields'} left
                  </Badge>
                ) : invalid > 0 ? (
                  <Badge tone="notice">
                    {invalid} {invalid === 1 ? 'field' : 'fields'} to fix
                  </Badge>
                ) : null}
              </div>
            ) : family ? (
              <div className={`bm8__dwhead is-${family.tint}`}>
                <span className="bm8__dwtile" aria-hidden>
                  <family.icon size={20} strokeWidth={1.8} />
                </span>
                <h2 className="bm8__dwtitle">{single ? single.name : family.channel}</h2>
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
              disabled={!canSaveSetup}
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
        {/* No overview card at the top of any page. It restated the method's
            description, a status the head and the list already carry, and the
            group the Back button already names — a grey block to read past
            before the form. Removed on the owner's word, 15 Sep 2026. */}
        {setupOf ? (
          <div className="bm8__dw">
            {card?.kind === 'app' ? (
              <AppSetupCard method={setupOf} card={card} passcode={draft.passcode} onPasscode={draft.setPasscode} />
            ) : card?.kind === 'nps' ? (
              <NpsSetupCard servers={NPS_SERVERS} value={draft.server} onChange={draft.setServer} />
            ) : (
              <SetupForm draft={draft} />
            )}
          </div>
        ) : family && top?.kind === 'settings' ? (
          <div className="bm8__dw">
            <SettingsPane
              family={family}
              methods={wholeFamily}
              famSettings={famSettings}
              ownSettings={ownSettings}
              behaviour={behaviour}
              onBehaviour={onBehaviour}
              onLink={openLink}
            />
          </div>
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
                  <ShieldCheck size={14} strokeWidth={1.9} aria-hidden />
                  Methods
                </button>
                <button
                  role="tab"
                  type="button"
                  aria-selected={pane === 'settings'}
                  className={`bm8__dwtab ${pane === 'settings' ? 'is-on' : ''}`}
                  onClick={() => setPane('settings')}
                >
                  <SlidersHorizontal size={14} strokeWidth={1.9} aria-hidden />
                  Settings
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
                {inside.length === 0 ? (
                  <EmptyState
                    compact
                    icon={ShieldCheck}
                    title="No methods in this group"
                    blurb={isUser ? "Your admin hasn't turned any on." : 'Set the filter to All methods to see them.'}
                  />
                ) : (
                  <div className="bm8__list">
                    {inside.map((m) =>
                      isUser ? (
                        <UserMethodCard
                          key={m.id}
                          m={m}
                          enrolled={enrol.configured.includes(m.id)}
                          ready={enrol.ready.includes(m.id)}
                          isActive={enrol.active === m.id}
                          open={enrol.openCard === m.id}
                          onOpen={(o) => enrol.onOpenCard(o ? m.id : null)}
                          onCancel={enrol.onCancelCard}
                          onActivate={(on) => enrol.onActivate(m.id, on)}
                          draft={enrol.openCard === m.id ? enrol.draft : {}}
                          onDraft={enrol.onDraft}
                          onSave={enrol.onSave}
                          questions={enrol.questions}
                        />
                      ) : (
                        <MethodCard
                          key={m.id}
                          m={m}
                          onToggle={onToggle}
                          isDefault={defaultMethod === m.id}
                          onSetup={onSetup}
                          onMakeDefault={onMakeDefault}
                        />
                      ),
                    )}
                  </div>
                )}
              </>
            ) : (
              <SettingsPane
                family={family}
                methods={wholeFamily}
                famSettings={famSettings}
                ownSettings={ownSettings}
                behaviour={behaviour}
                onBehaviour={onBehaviour}
                onLink={openLink}
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
  methods,
  famSettings,
  ownSettings,
  behaviour,
  onBehaviour,
  onLink,
}: {
  family: Family
  /** The methods the family's shared settings reach — named in the note and the section. */
  methods: AuthMethod[]
  famSettings: MfaSetting[]
  ownSettings: { m: AuthMethod; settings: MfaSetting[] }[]
  behaviour: MfaValues
  onBehaviour: (p: MfaValues) => void
  /** A row that is a way through to a page, rather than a value, was pressed. */
  onLink?: (settingId: string) => void
}) {
  const read = (key: string, fallback: MfaValue): MfaValue => behaviour[key] ?? fallback

  /* Who a change here reaches, said once at the top of the pane in its own note,
     naming the methods rather than leaving the reader to count them. A family
     whose only "setting" is a way through to another page changes nothing
     itself, so it gets no note and no "Shared settings" heading. */
  const onlyLinks = famSettings.length > 0 && famSettings.every((s) => s.field.kind === 'link')
  const names = methods.map((m) => m.name)
  const named = names.length <= 1 ? (names[0] ?? family.channel) : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  const notes = [
    famSettings.length > 0 &&
      !onlyLinks &&
      (methods.length > 1
        ? `Shared settings apply to every ${family.channel} method: ${named}.`
        : `These settings apply to everyone who uses ${named}.`),
    ownSettings.length > 0 && methods.length > 1 && "Settings under a method's name apply to that method only.",
  ].filter((x): x is string => Boolean(x))

  /* Security Questions: "Questions to verify" can't be more than "Questions to
     configure". Lowering the limit brings verify down with it, and verify only
     offers what the limit allows. */
  const writeFamily = (id: string, v: MfaValue) => {
    const key = settingKey('family', family.channel, id)
    if (key !== KBA_LIMIT_KEY) return onBehaviour({ [key]: v })
    const verifySetting = famSettings.find((x) => x.id === 'kba-verify')
    if (!verifySetting || verifySetting.field.kind !== 'number') return onBehaviour({ [key]: v })
    const verify = Number(read(KBA_VERIFY_KEY, fieldValue(verifySetting.field)))
    const next = clampVerify(verify, Number(v), verifySetting.field.options)
    onBehaviour(next === verify ? { [key]: v } : { [key]: v, [KBA_VERIFY_KEY]: next })
  }
  const limitSetting = famSettings.find((x) => x.id === 'kba-limit')
  const kbaLimit = limitSetting ? Number(read(KBA_LIMIT_KEY, fieldValue(limitSetting.field))) : null
  const shown = (setting: MfaSetting): MfaSetting =>
    setting.id === 'kba-verify' && kbaLimit !== null && setting.field.kind === 'number'
      ? { ...setting, field: { ...setting.field, options: setting.field.options.filter((n) => n <= kbaLimit) } }
      : setting

  return (
    <div className="bm8__settings">
      {notes.length > 0 && (
        <section className="bm8__setnote" aria-label="Note">
          <Callout tone="info" title="Note">
            {notes.map((n) => (
              <p key={n}>{n}</p>
            ))}
          </Callout>
        </section>
      )}

      {famSettings.length > 0 && (
        <section>
          <h3 className="bm8__setlabel">{methods.length > 1 && !onlyLinks ? 'Shared settings' : 'Settings'}</h3>
          <div className="bm8__setlist">
            {famSettings.map((s) => {
              const key = settingKey('family', family.channel, s.id)
              return (
                <SettingField
                  key={s.id}
                  setting={shown(s)}
                  value={read(key, fieldValue(s.field))}
                  onChange={(v) => (s.field.kind === 'link' ? onLink?.(s.id) : writeFamily(s.id, v))}
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
          <h3 className="bm8__setlabel">{m.name}</h3>
          <div className="bm8__setlist">
            {settings.map((s) => {
              const key = settingKey('method', m.id, s.id)
              return (
                <SettingField
                  key={s.id}
                  setting={s}
                  value={read(key, fieldValue(s.field))}
                  onChange={(v) => (s.field.kind === 'link' ? onLink?.(s.id) : onBehaviour({ [key]: v }))}
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
  onToggle,
  isDefault,
  onSetup,
  onMakeDefault,
  as: Tag = 'div',
}: {
  m: AuthMethod
  onToggle: (id: string, on: boolean) => void
  isDefault: boolean
  onSetup: (m: AuthMethod) => void
  onMakeDefault: (id: string) => void
  /** `li` on the page's list, `div` inside the slider's. */
  as?: 'div' | 'li'
}) {
  const blocked = methodBlocker(m)

  return (
    <Tag className={`bm8__card bm8__card--method ${blocked ? 'is-off' : ''}`}>
      <span className="bm8__tile bm8__tile--logo" aria-hidden>
        <MethodIcon name={m.name} size={36} />
      </span>

      <div className="bm8__info">
        <span className="bm8__name">
          {m.name}
          {/* Recovery keeps its chip, because nothing else on the row says it: a
              method can be a second factor and a way back in at once. */}
          {m.alsoRecovery && <i className="bm8__badge bm8__badge--use">Recovery</i>}
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
          {/* The description is a tip beside the name, not a line under it. How
              many rules use a method is said where it matters: when it is
              turned off. */}
          <TipDot text={m.description} label={`About ${m.name}`} />
        </span>
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
    </Tag>
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
  const canBeDefault = canServeAsDefault(m)

  /* Edit only where the configuration is worth returning to — see
     `hasConfigPage`. A compact row opens that page itself, so it carries no
     button for it. */
  const canEdit = hasConfigPage(m) && !compact
  /* "Manage tokens" once Display Token is configured; null for every other method. */
  const tokenLabel = m.configured ? tokenButtonLabel(m) : null

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
            {/* Display Token's inventory, beside its switch once a token is
                assigned — the same page its Set up opened. */}
            {tokenLabel && (
              <Button variant="secondary" size="sm" onClick={() => onSetup(m)}>
                {tokenLabel}
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
        /* "Configure", as a blue text button (owner, 16 Sep 2026). A boxed
           "Set up" was the heaviest thing on an unconfigured row — heavier than
           the switches on the configured rows around it, for the rows that do
           the least. The word matches the gear on configured rows: both open the
           method's configuration. */
        <Button variant="link" size="sm" onClick={() => onSetup(m)}>
          Configure
        </Button>
      )}
    </>
  )
}

/* `PrimarySignIn` stood here — a block stating the two passwordless starts and
   the tenant default, written to be composed by both layouts. Password,
   Passkeys and Magic link are catalogue entries now and render as their own
   rows at the top of the list, so nothing had rendered this in a while; v2 was
   the last thing importing it, and v2 is gone. */

