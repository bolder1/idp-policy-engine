import { useId, useRef, useState } from 'react'
import { useEffect } from 'react'
import {
  AlertTriangle,
  BellRing,
  Fingerprint,
  HelpCircle,
  KeyRound,
  Layers,
  ListChecks,
  Lock,
  type LucideIcon,
  Mail,
  MessageSquare,
  Minus,
  ShieldAlert,
  Timer,
  Usb,
  UserCheck,
  UserRound,
  XCircle,
} from 'lucide-react'

import { Toggle } from '../../kit'
import { Picker } from '../../picker'
import { DEFAULT_DENY_MESSAGE, DENY_MESSAGE_MAX, type AccessDecision, type Rule } from '../../data'
import { METHODS } from '../rule-form'
import { METHOD_PREFIX, firstFactorPatch, firstFactorValue } from './first-factor'
import { isPristine } from './parts'
import { Prop } from './Section'

/* -----------------------------------------------------------------------------
   THEN — what happens when the rule matches.

   The first factor, then what happens, then the settings the answer needs.

   That is the order a rule is written and the order it is read: you decide what
   a sign-in has to prove before you decide what to do when it does. The panel
   had it the other way round for a long time, with the outcome first and the
   factors as its detail — true of the MODEL, false of the writing.

   Three outcomes, and they are the three values `AccessDecision` holds, one
   tile each. An earlier shape had two tiles and added the second factor with a
   dashed button underneath, which offered three choices while presenting two;
   an earlier one still had a third tile, Flag, that was not an outcome at all —
   see `AccessDecision` in data.ts for why that went.

   The tiles map one-to-one onto the field they write, so the row and the
   settings under it cannot disagree. They used to: a rule could say "Let in,
   then verify" while naming no second factor, which is a rule nobody can
   satisfy, and twenty-nine of the thirty-three two-factor rules in the seeded
   estate were in exactly that shape.
   -------------------------------------------------------------------------- */

/* TWO outcomes on the dropdown — Allow and Deny — and the second factor is
   added under Allow rather than chosen instead of it.

   This is a revert, and the argument it reverses was a good one. A three-option
   dropdown — Allow, Require a second factor, Deny — mapped one-to-one onto the
   three values `AccessDecision` holds, so nothing on the pane could disagree
   with the field it writes. The cost is that it asks one question where a
   reader has two: whether the sign-in gets through, and then how hard it has to
   work to. "Require a second factor" is an ALLOW, and putting it beside Deny as
   a peer makes the reader pick the outcome and the factor count in a single
   move.

   So the dropdown answers the first question only, and `1fa` versus `2fa` is
   settled below it by adding a second factor — which is also the order a rule
   is spoken: let them in, on a password, and then also a code.

   `AccessDecision` still holds three values and this pane still writes all
   three. What changed is that one control no longer writes two decisions. */
const TILES: { id: AccessDecision; label: string; tone: string; icon: typeof UserCheck; hint: string }[] = [
  { id: '1fa', label: 'Allow', tone: 'allow', icon: UserCheck, hint: 'Sign-in proceeds through the factors below.' },
  { id: 'deny', label: 'Deny', tone: 'deny', icon: ShieldAlert, hint: 'Refused outright. No factor is ever asked for.' },
]


/* How the second factor is proved — four modes, NAMED rather than described.

   They were "One of these", "All of these, in order" and "User preference":
   phrases that only mean anything once you know what "these" refers to, which
   is a list that appears after you choose. Every other enterprise IdP names
   these as things — a method, a chain, a preference — and so does the rest of
   this console. A dropdown holds names; the sentence explaining one belongs on
   the option, not in place of it. */
const SECOND: { value: Rule['secondFactor']; label: string; meta: string; icon: LucideIcon }[] = [
  { value: 'any', label: 'Any enabled method', meta: 'Whatever the tenant allows', icon: Layers },
  { value: 'specific', label: 'Specific methods', meta: 'Any one from a list you choose', icon: ListChecks },
  /* `Method chain` — every method in a set order — stood here and is gone.

     Nothing in the seeded estate used it, and it was the one mode that needed
     an ordering control: the multi-select below says WHICH methods, and the
     order you tick them is a weak answer to "in what order". The model keeps
     the value (`Rule.secondFactor` still has it, and the trail builder still
     offers it), so a rule that arrives holding it is not broken — this pane
     simply does not mint new ones. */
  /* No fallback picker behind it any more (owner, 18 Sep 2026: "remove
     fallback from user preference"), so the line no longer promises one. A
     person who has set no preferred method is asked for whatever the tenant
     allows, which is what "Any enabled method" above already means — the
     fallback was a third answer hiding inside the second. `preferredFallback`
     stays on the rule: the trail builder still sets it, the card beside this
     panel still reads it back as "else …", and this pane simply does not mint
     new ones. */
  { value: 'preferred', label: 'User preference', meta: 'Whichever method they have set', icon: UserRound },
]

/* A mark per method, so a list of seven is scanned rather than read. The
   families are what the marks distinguish: something you are pushed, something
   you read off a clock, something you plug in or touch, something that arrives
   as a message. */
const METHOD_ICON: Record<string, LucideIcon> = {
  'miniOrange Push': BellRing,
  'TOTP Authenticator': Timer,
  'WebAuthn / FIDO2': Fingerprint,
  'SMS / OTP': MessageSquare,
  'Email OTP': Mail,
  'Hardware Token': Usb,
  'Security Questions': HelpCircle,
}
const methodOption = (m: string) => ({ value: m, label: m, icon: METHOD_ICON[m] ?? KeyRound })

export function WhatEditor({
  rule,
  onPatch,
  terminal,
}: {
  rule: Rule
  onPatch: (p: Partial<Rule>) => void
  terminal?: boolean
}) {
  /* No invented default, and that is the whole point.

     These controls used to show a value the rule did not have —
     `methodChain ?? ['TOTP Authenticator']`, `firstFactorMethod ?? METHODS[0]`.
     None was ever patched on, so the journey on the card beside this panel said
     "Empty chain" while the control here named a specific method: two readings
     of one rule, disagreeing on screen at the same time. */
  const methods = rule.secondFactorMethods ?? []

  /* Does this outcome walk the person through factors? Allow and the
     second-factor tile do; Deny does not. */
  const walksFactors = rule.decision !== 'deny'
  const twoStep = rule.decision === '2fa'

  /* Deny normalises everything that belongs to Allow, and so does removing the
     second step. Without it a rule keeps a remembered-device window and a
     method list that nothing on screen shows and nothing on the rule uses —
     invisible state that reappears the moment somebody adds a step back. */
  const noSecondStep = {
    secondFactor: 'any' as const,
    secondFactorMethods: undefined,
    methodChain: undefined,
    preferredFallback: undefined,
    rememberMfa: false,
    rememberDays: undefined,
    forceMfaEachLogin: undefined,
    allowDisable2fa: false,
  }

  /* One tile, one value, and the tile IS the field.

     `lastAllow` stood here — a ref remembering which flavour of Allow to return
     to when Deny was pressed and unpressed, because the two-factor state had no
     tile of its own and had to be inferred. It has one now, so there is nothing
     left to remember: pressing a tile writes that decision.

     The first factor is never reset. Deny used to blank it, which was invisible
     while the row only rendered under Allow — it is above the tiles now, so
     resetting it would clear a control the user is looking at, and switching
     back from Deny would return a different rule than the one they left. */
  /* Which flavour of Allow to come back to.

     The dropdown has one Allow and the rule has two — `1fa` and `2fa` — so
     pressing Deny and pressing Allow again has to return the rule you left
     rather than silently dropping a second factor somebody configured. The ref
     is the memory the three-option dropdown did not need and this one does; it
     is the same one this pane carried before that change.

     Not state: nothing renders from it, and re-rendering on a value that only
     matters at the moment of a press would be a render per keystroke elsewhere
     in the panel. */
  const lastAllow = useRef<AccessDecision>(rule.decision === '2fa' ? '2fa' : '1fa')
  if (rule.decision === '1fa' || rule.decision === '2fa') lastAllow.current = rule.decision

  /* The factor settings as they were before Deny, so Allow brings them back.

     Deny still clears them from the rule — a Deny rule holds no hidden factor
     state — but pressing Deny and then Allow used to return a second factor on
     "Any enabled method" in place of the specific list somebody had chosen,
     which is a looser rule than the one they left. Held here, for this visit. */
  const beforeDeny = useRef<Partial<Rule> | null>(null)

  const pick = (id: AccessDecision) => {
    if (id === 'deny') {
      /* Nothing chosen yet, so nothing to come back to: Allow afterwards is Allow. */
      if (!answered) {
        lastAllow.current = '1fa'
        beforeDeny.current = null
      } else if (rule.decision !== 'deny') {
        beforeDeny.current = {
          secondFactor: rule.secondFactor,
          secondFactorMethods: rule.secondFactorMethods,
          methodChain: rule.methodChain,
          preferredFallback: rule.preferredFallback,
          rememberMfa: rule.rememberMfa,
          rememberDays: rule.rememberDays,
          forceMfaEachLogin: rule.forceMfaEachLogin,
          allowDisable2fa: rule.allowDisable2fa,
        }
      }
      return onPatch({ decision: 'deny', ...noSecondStep })
    }
    /* A new rule holds `2fa` without anybody having chosen it; Allow on it
       means Allow, and a second factor is added below. */
    if (!answered) return onPatch({ decision: '1fa' })
    /* Allow returns whichever Allow this rule last was, with its settings. */
    const restore = rule.decision === 'deny' ? beforeDeny.current : null
    beforeDeny.current = null
    onPatch({ decision: lastAllow.current, ...(restore ?? {}) })
  }

  const unsatisfiable = twoStep && rule.secondFactor === 'specific' && methods.length === 0

  /* `2fa` IS an Allow, so it lights Allow. The dropdown answers "does this
     sign-in get through"; the card below answers "how many times do they
     prove it". */
  const active: string = rule.decision === 'deny' ? 'deny' : '1fa'

  /* A rule nobody has answered shows no tile lit.

     `blankRule` mints `decision: '2fa'`, so a rule you had just added opened
     with Allow already chosen and a two-step ladder already built — an answer
     presented as yours before you had given one, on the question that decides
     whether a sign-in gets through.

     PRISTINE, not merely untouched: no who, no conditions, and still holding
     the exact decision `blankRule` writes. A rule that genuinely is
     `2fa`-with-nothing-else is indistinguishable from a new one, and lighting
     Allow for it is correct — it IS what that rule says.

     Local, and remounted per rule by the pane's key, so it is a fact about
     this visit rather than something stored. The moment a tile is pressed the
     selection appears and stays: `answered` only ever goes one way.

     The model is untouched, which is the trade this makes. A pristine rule
     still HOLDS `2fa`, so if it is given a who or a condition without an
     outcome ever being chosen, the card will read "Let in, then verify" while
     these tiles show nothing. The card draws no outcome at all until something
     else is set, so the window where the two disagree is narrow — but it is
     real, and the honest fix is an optional `decision`, which is a change to
     what a rule IS. */
  /* The default at the foot of the chain always has an outcome; it is never "new". */
  const [answered, setAnswered] = useState(() => !!terminal || !isPristine(rule))

  const chosen = answered ? TILES.find((t) => t.id === active) : undefined

  return (
    <div className="bb__thenparts">
      {/* THREE FIELDS, no cards.

          It was three bordered parts — Outcome, First factor, Second factor —
          each holding a column of bordered option rows, with an "Add second
          factor" button between the last two and an X to take it away again.
          Eight boxes to answer three questions (owner, 18 Sep 2026: "for the
          Then part I don't want many boxes… two options, Allow and Deny, a
          dropdown with three choices, and another dropdown for the second
          factor — straightforward, simple, to the point").

          So: a label over a control, three times, which is the shape the rest
          of the console's forms use. The outcome keeps VISIBLE options because
          there are two of them and they carry the one colour on this pane that
          is meaning rather than decoration; the other two are one choice out of
          three, which is what a dropdown is for. */}
      {/* No "Outcome" label over it (owner, 18 Sep 2026: "remove"). Allow and
          Deny say what they are, and the section is already headed Then — a
          word between the two was a caption on a control that captions itself.
          The accessible name moves onto the group, where it was doing the only
          job it had left. */}
      <div className="bb__thenfield">
        <div className="bb__outpick" role="radiogroup" aria-label="What happens when this rule matches">
          {TILES.map((t) => {
            const on = answered && active === t.id
            return (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={on}
                className={`bb__outbtn is-${t.tone}${on ? ' is-on' : ''}`}
                onClick={() => {
                  pick(t.id)
                  setAnswered(true)
                }}
              >
                <t.icon size={14} strokeWidth={2} aria-hidden />
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Deny is complete the moment it is chosen: there is nothing to ask and
          nothing to prove, so the panel says so in a line instead of showing
          controls that cannot run. */}
      {!walksFactors ? (
        <>
          <p className="bb__addnote">{chosen?.hint ?? 'Refused outright. No factor is ever asked for.'}</p>
          <DenyMessage rule={rule} onPatch={onPatch} />
        </>
      ) : (
        <>
          <div className="bb__thenfield">
            <span className="bb__thenlabel">First factor</span>
            {/* One picker, not two (21 Sep 2026). The two plain answers first —
                Password is the answer almost every time — then every named
                method under an "A specific method" heading, so choosing one
                IS choosing a specific method. It used to take a second picker
                to say which, and "A specific method" with nothing chosen was a
                state the rule could be left in. See first-factor.ts. */}
            <Picker
              label="First factor"
              width="fill"
              value={firstFactorValue(rule)}
              placeholder="Choose a method"
              options={[
                { value: 'Password', label: 'Password', icon: Lock },
                { value: 'Any', label: 'Any enabled method', icon: Layers },
                ...METHODS.map((m) => ({ ...methodOption(m), value: METHOD_PREFIX + m, group: 'A specific method' })),
              ]}
              onChange={(v) => onPatch(firstFactorPatch(v))}
            />
            {/* Only reachable by a rule saved before the merge: no choice in the
                picker above can leave Specific without a method. */}
            {rule.firstFactor === 'Specific' && !rule.firstFactorMethod && (
              <p className="bb__diag is-error" role="alert">
                <XCircle size={13} strokeWidth={2} aria-hidden />
                <span>
                  <b>No method chosen.</b> Choose a method or pick Password.
                </span>
              </p>
            )}
          </div>

          <div className="bb__thenfield">
            <span className="bb__thenlabel">Second factor</span>
            {/* "None" is the first option rather than a button that adds a card
                and an X that takes it away. Whether a rule asks twice is one
                question with four answers, and a control that has to be created
                before it can be answered is two gestures for one decision. */}
            <Picker
              label="Second factor"
              width="fill"
              value={twoStep ? rule.secondFactor : 'none'}
              options={[
                { value: 'none', label: 'None', meta: 'One factor only', icon: Minus },
                ...SECOND.map((x) => ({ value: x.value as string, label: x.label, meta: x.meta, icon: x.icon })),
              ]}
              onChange={(v) =>
                v === 'none'
                  ? onPatch({ decision: '1fa', ...noSecondStep })
                  : onPatch({ decision: '2fa', secondFactor: v as Rule['secondFactor'] })
              }
            />

            {twoStep && rule.secondFactor === 'specific' && (
              <>
                <Picker
                  multiple
                  label="Methods accepted"
                  width="fill"
                  placeholder="Choose methods"
                  value={methods}
                  options={METHODS.map(methodOption)}
                  onChange={(m) =>
                    onPatch({
                      secondFactorMethods: methods.includes(m) ? methods.filter((x) => x !== m) : [...methods, m],
                    })
                  }
                />
                {unsatisfiable && (
                  <p className="bb__diag is-error" role="alert">
                    <XCircle size={13} strokeWidth={2} aria-hidden />
                    <span>
                      <b>No method selected.</b> Nobody can satisfy this rule.
                    </span>
                  </p>
                )}
              </>
            )}
          </div>

          {/* Only with a second factor, because that is all they are about: a
              single-factor rule has nothing to remember. */}
          {twoStep && <RememberBlock rule={rule} onPatch={onPatch} />}
        </>
      )}
    </div>
  )
}

/* `MethodList` stood here — one dropdown per chosen method, plus an `Add
   method` button that appended a row holding whatever was still free.

   It replaced a wall of toggle chips and was better than them, but it still
   asked for two gestures per method: add a row, then say what it is. The
   control is a multi-select now, in the card above; see the note at the call
   site for what the chain does about order. */

/* Remembering a device, folded into one row that grows.

   Three property rows — a toggle, a number, a second toggle — for a setting
   most rules leave off. Two of the three were only ever reachable through the
   first, so they are inside it now. */
const MAX_REMEMBER_DAYS = 365
const validDays = (n: number) => Number.isInteger(n) && n >= 1 && n <= MAX_REMEMBER_DAYS

function RememberBlock({ rule, onPatch }: { rule: Rule; onPatch: (p: Partial<Rule>) => void }) {
  /* What is typed, as text, so the field can be empty for a keystroke. The rule
     only ever holds a whole number of days from 1 to 365. */
  const stored = rule.rememberDays ?? 30
  const [days, setDays] = useState(String(stored))
  /* Undo and redo change the rule under this field without remounting it. */
  useEffect(() => {
    setDays(String(stored))
  }, [stored])
  const typed = Number(days)
  const invalid = days.trim() === '' || !validDays(typed)
  return (
    <div className="bb__after">
      {/* The live console's names for these three (owner, 21 Sep 2026: "use
          this kind of naming"): Remember MFA, Force MFA on each login, Allow
          end users to disable 2FA. They are also the model's own words —
          `rememberMfa`, `forceMfaEachLogin`, `allowDisable2fa` — so an admin
          who knows the console reads the setting they already know, and the
          label and the field it writes finally say the same thing. Each
          switch's accessible name is its visible label, word for word. */}
      <Prop label="Remember MFA">
        <Toggle checked={rule.rememberMfa} onChange={(rememberMfa) => onPatch({ rememberMfa })} label="Remember MFA" size="sm" />
      </Prop>
      {rule.rememberMfa && (
        <>
          <Prop label="For" indent>
            <span>
              <input
                type="number"
                className="bb__input bb__input--num"
                min={1}
                max={365}
                aria-label="Days to remember"
                step={1}
                aria-invalid={invalid}
                value={days}
                onChange={(e) => {
                  const text = e.target.value
                  setDays(text)
                  /* Only a usable number reaches the rule. Typing over the field
                     empties it for a keystroke, and `Number('') || 30` snapped
                     it back to 30 mid-edit — so clearing it to type 90 wrote 30
                     and moved the cursor. */
                  const n = Number(text)
                  if (text.trim() !== '' && validDays(n)) onPatch({ rememberDays: n })
                }}
                /* Left invalid, the field shows what the rule still holds. */
                onBlur={() => {
                  if (invalid) setDays(String(stored))
                }}
              />
              <span className="bb__unit">days</span>
            </span>
          </Prop>
          {invalid && (
            <p className="bb__diag is-error" role="alert">
              <XCircle size={13} strokeWidth={2} aria-hidden />
              <span>Enter 1 to 365 days.</span>
            </p>
          )}
          <Prop label="Force MFA on each login" indent>
            <Toggle checked={rule.forceMfaEachLogin ?? false} onChange={(forceMfaEachLogin) => onPatch({ forceMfaEachLogin })} label="Force MFA on each login" size="sm" />
          </Prop>
        </>
      )}
      <Prop label="Allow end users to disable 2FA">
        <Toggle checked={rule.allowDisable2fa} onChange={(allowDisable2fa) => onPatch({ allowDisable2fa })} label="Allow end users to disable 2FA" size="sm" />
      </Prop>
      {rule.allowDisable2fa && (
        <p className="bb__diag is-warning">
          {/* The icon is not decoration here — `.bb__diag` colours only its
              `> svg`, so a diagnostic without one renders as plain body text
              and the tone says nothing. */}
          <AlertTriangle size={13} strokeWidth={2} aria-hidden />
          <span>Users can opt out of their second factor.</span>
        </p>
      )}
    </div>
  )
}


/* --- What a denied user is told ---------------------------------------------------

   The console's "Deny message" (owner, 21 Sep 2026), on the rule that denies.
   Empty is the default, said under the label in full so nobody has to guess
   what a blank field sends; typing replaces it. Written as typed, like the
   rule's name, and an emptied field stores nothing rather than "". */
function DenyMessage({ rule, onPatch }: { rule: Rule; onPatch: (p: Partial<Rule>) => void }) {
  const id = useId()
  const value = rule.denyMessage ?? ''
  return (
    <div className="bb__thenfield bb__deny">
      <label className="bb__thenlabel" htmlFor={id}>
        Deny message
      </label>
      <p className="bb__denyhelp" id={`${id}-help`}>
        What the user sees when this rule refuses them. <b>Default:</b> {DEFAULT_DENY_MESSAGE}
      </p>
      <textarea
        id={id}
        rows={3}
        maxLength={DENY_MESSAGE_MAX}
        value={value}
        placeholder="Leave empty to use the default"
        aria-describedby={`${id}-help ${id}-count`}
        onChange={(e) => onPatch({ denyMessage: e.target.value === '' ? undefined : e.target.value })}
      />
      <span className="bb__denycount" id={`${id}-count`}>
        {value.length}/{DENY_MESSAGE_MAX}
      </span>
    </div>
  )
}
