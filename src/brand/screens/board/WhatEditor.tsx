import { useState } from 'react'
import {
  AlertTriangle,
  BellRing,
  Fingerprint,
  HelpCircle,
  KeyRound,
  Layers,
  ListChecks,
  Lock,
  Mail,
  MessageSquare,
  ShieldAlert,
  Timer,
  Usb,
  UserCheck,
  UserRound,
  XCircle,
  type LucideIcon,
} from 'lucide-react'

import { Toggle } from '../../kit'
import { Picker } from '../../picker'
import { restConditions, whoIds } from '../../audience-ops'
import type { AccessDecision, Rule } from '../../data'
import { METHODS } from '../rule-form'
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

/* THREE outcomes, and they are exactly the three values `AccessDecision` holds.

   The pane went through two shapes to get here. First: three peers where one of
   them — Flag — was not an outcome at all, and the settings below could
   contradict the tile above them. Then: two tiles, Allow and Deny, with a
   second factor added by a dashed button underneath, on the reasoning that
   whether somebody gets in is the decision and how many times they prove it is
   a property of getting in.

   That reasoning is sound and the drawing was still wrong. The button sat below
   the tiles as a third thing you could press, so the panel offered three
   choices while presenting two — and the one it hid was the commonest answer a
   real policy gives. Three tiles say what the rule can do in one row, and the
   row maps one-to-one onto the field it writes, so nothing here can disagree
   with anything below it.

   Allow, second factor, Deny: the ladder of severity, so arrowing right walks
   from the mildest outcome to the hardest without doubling back. It also puts
   the two that let somebody in next to each other, which is the distinction a
   reader is actually making. */
const TILES: { id: AccessDecision; label: string; tone: string; icon: typeof UserCheck; hint: string }[] = [
  { id: '1fa', label: 'Allow', tone: 'allow', icon: UserCheck, hint: 'Signed in on the first factor alone.' },
  { id: '2fa', label: 'Require a second factor', tone: 'mfa', icon: KeyRound, hint: 'Signed in only after proving a second time.' },
  { id: 'deny', label: 'Deny', tone: 'deny', icon: ShieldAlert, hint: 'Sign-in refused. No fallback path.' },
]

/* How the second factor is proved — four modes, NAMED rather than described.

   They were "One of these", "All of these, in order" and "User preference":
   phrases that only mean anything once you know what "these" refers to, which
   is a list that appears after you choose. Every other enterprise IdP names
   these as things — a method, a chain, a preference — and so does the rest of
   this console. A dropdown holds names; the sentence explaining one belongs on
   the option, not in place of it. */
const SECOND: { value: Rule['secondFactor']; label: string; meta: string; icon: LucideIcon }[] = [
  { value: 'any', label: 'Any enrolled method', meta: 'Whatever they have set up', icon: Layers },
  { value: 'specific', label: 'Specific methods', meta: 'Any one from a list you choose', icon: ListChecks },
  /* `Method chain` — every method in a set order — stood here and is gone.

     Nothing in the seeded estate used it, and it was the one mode that needed
     an ordering control: the multi-select below says WHICH methods, and the
     order you tick them is a weak answer to "in what order". The model keeps
     the value (`Rule.secondFactor` still has it, and the trail builder still
     offers it), so a rule that arrives holding it is not broken — this pane
     simply does not mint new ones. */
  { value: 'preferred', label: 'User preference', meta: 'Their default, with a fallback', icon: UserRound },
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
  const pick = (id: AccessDecision) => {
    if (id === '2fa') return onPatch({ decision: '2fa' })
    onPatch({ decision: id, ...noSecondStep })
  }

  const unsatisfiable = twoStep && rule.secondFactor === 'specific' && methods.length === 0

  const active: string = rule.decision

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
  const [answered, setAnswered] = useState(
    () => rule.decision !== '2fa' || whoIds(rule.when, 'group').length > 0 || whoIds(rule.when, 'user').length > 0 || restConditions(rule.when).length > 0,
  )

  return (
    <div className="bb__thenparts">
        {/* The first factor is a plain row; the second is a CARD.

            They were two rungs of one numbered ladder, which said they were
            two of a kind. They are not. The first factor is always there and
            has one setting — which method. The second is optional, and
            choosing it opens four more decisions: the mode, the methods,
            whether the device is remembered, whether a user may opt out.
            Drawn as peers, the second rung's four followers hung off the
            bottom of the ladder as loose rows with nothing saying they
            belonged to it, and "Add second factor" sat between them as a
            third rung — an action in a list of settings.

            So: one row for the first factor, and a bordered card for the
            second holding everything that is about the second. The card is
            the one box this section draws, and it earns it by containing
            something. */}
        <ol className="bb__ladder">
          <li className="bb__rung">
            <span className="bb__rung__n" aria-hidden>
              1
            </span>
            <span className="bb__rung__body">
              <b>First factor</b>
              <Picker
                label="First step"
                width="fill"
                value={rule.firstFactor === 'Specific' ? (rule.firstFactorMethod ?? 'Specific') : rule.firstFactor}
                /* One picker, not a segment plus a conditional picker beneath
                   it. "Specific" was never an answer — it was a promise to
                   answer, and the row it revealed asked the same question
                   again one line down. The methods are in this list. */
                options={[
                  { value: 'Password', label: 'Password', icon: Lock },
                  { value: 'Any', label: 'Any enrolled method', icon: Layers },
                  ...METHODS.map((m) => ({ ...methodOption(m), group: 'Specific method' })),
                ]}
                onChange={(v) =>
                  v === 'Password' || v === 'Any'
                    ? onPatch({ firstFactor: v as Rule['firstFactor'], firstFactorMethod: undefined })
                    : onPatch({ firstFactor: 'Specific', firstFactorMethod: v })
                }
              />
            </span>
          </li>

        </ol>

      {/* The decision comes AFTER the first factor.

          It was first, on the reasoning that whether somebody gets in is the
          bigger question and the steps are its detail. That is true of the
          MODEL and false of the writing: you decide what a sign-in has to prove
          before you decide what happens when it does, and a rule is read the
          same way — one factor, then allowed or refused, then a second factor
          if the first was not enough.

          Which is also why the first factor is drawn under Deny, where it does
          not run. It is the question that was already answered, not a setting
          this outcome has; the line under the tiles says so rather than the
          control vanishing and taking its value with it. */}
      <div className="bb__decide" role="radiogroup" aria-label="What happens when this rule matches">
        {TILES.map((t, i) => {
          const on = answered && t.id === active
          const Ico = t.icon
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={on}
              /* With nothing lit the roving tabindex has no home, so the
                 first tile takes it — otherwise the whole group drops out of
                 the tab order exactly when it most needs to be reachable. */
              tabIndex={on || (!answered && i === 0) ? 0 : -1}
              className={`is-${t.tone} ${on ? 'is-on' : ''}`}
              title={t.hint}
              onClick={() => {
                setAnswered(true)
                pick(t.id)
              }}
              onKeyDown={(e) => {
                const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key as 'ArrowRight']
                if (!d) return
                e.preventDefault()
                const at = TILES.findIndex((x) => x.id === active)
                pick(TILES[(at + d + TILES.length) % TILES.length].id)
              }}
            >
              <Ico size={16} strokeWidth={1.9} aria-hidden />
              <strong>{t.label}</strong>
            </button>
          )
        })}
      </div>

      {/* One line under the two simple answers; the settings under the third.

          Allow and Deny are complete the moment they are pressed — the first
          factor above is the whole of what Allow does, and Deny does nothing at
          all. A sentence confirming that is the right amount of panel for
          them. The second-factor tile is the only one with anything left to
          decide, so it is the only one that opens. */}
      {!walksFactors ? (
        <p className="bb__addnote">Refused outright. The factor above is never asked for.</p>
      ) : !twoStep ? (
        <p className="bb__addnote">Signed in on the first factor above. Nothing more is asked.</p>
      ) : (
        <>
          {unsatisfiable && (
            <p className="bb__diag is-error" role="alert">
              <XCircle size={13} strokeWidth={2} aria-hidden />
              <span>
                <b>No method selected.</b> Nobody can satisfy this rule.
              </span>
            </p>
          )}


          <div className="bb__second">
              <div className="bb__second__head">
                <span className="bb__second__n" aria-hidden>
                  2
                </span>
                <b>Second factor</b>
                {/* The card's own close stood here, undoing the choice back to
                    a plain Allow. The tile above does that now — pressing
                    `Allow` is how you drop the second factor — and a second
                    control for it inside the thing it removes was the older
                    shape, from when the second factor was added by a button
                    rather than chosen. */}
              </div>

              <div className="bb__second__body">
                <span className="bb__subrow">
                  <b>Prove it with</b>
                  <Picker
                    label="Second step"
                    width="fill"
                    value={rule.secondFactor}
                    options={SECOND.map((x) => ({ value: x.value, label: x.label, meta: x.meta, icon: x.icon }))}
                    onChange={(v) => onPatch({ secondFactor: v as Rule['secondFactor'] })}
                  />
                </span>

                {/* ONE multi-select, and it replaced three shapes.

                    A wall of twenty-one toggle chips — every method the
                    catalogue holds, rendered whether or not anybody wanted it.
                    Then a list of dropdowns with an `Add method` button, which
                    scaled but asked you to add a row and then say what it was:
                    two gestures per method, and a fresh row arrived holding a
                    method nobody had picked.

                    A multi-select asks once. The list is the catalogue, the
                    ticks are the answer, and adding a fourth method is the same
                    gesture as adding the first. */}
                {rule.secondFactor === 'specific' && (
                  <span className="bb__subrow">
                    <b>Methods</b>
                    <Picker
                      label="Methods accepted"
                      width="fill"
                      multiple
                      value={methods}
                      options={METHODS.map(methodOption)}
                      onChange={(v) =>
                        onPatch({
                          secondFactorMethods: methods.includes(v) ? methods.filter((x) => x !== v) : [...methods, v],
                        })
                      }
                    />
                  </span>
                )}

                {rule.secondFactor === 'preferred' && (
                  <span className="bb__subrow">
                    <b>Fallback</b>
                    <Picker
                      label="Fallback method"
                      width="fill"
                      value={rule.preferredFallback ?? ''}
                      options={METHODS.map((m) => ({ value: m, label: m }))}
                      onChange={(preferredFallback) => onPatch({ preferredFallback })}
                    />
                  </span>
                )}

                {/* Inside the card, because both toggles are about the second
                    factor and nothing else. They used to sit below the ladder as
                    two loose rows, so "Remember this device" read as a property
                    of the whole rule — which it is not: a single-factor rule has
                    nothing to remember, and the rows vanished when the second
                    factor did, without ever having said why they were there. */}
                <RememberBlock rule={rule} onPatch={onPatch} />
              </div>
          </div>
        </>
      )}

      {/* `terminal` is the default rule at the foot of the chain. It has no
          conditions and nothing falls past it, so there is nothing to say about
          what happens next — and the sentence that used to run here on EVERY
          rule ("Matched sign-ins stop here… everyone else falls to rule 3") is
          gone from all of them. First-match is what the chain on the canvas
          draws, arrow by arrow, six inches to the left; restating it in prose
          under every outcome was the same fact told twice, in the half of the
          panel that has the least room for it. */}
      {terminal && <p className="bb__secnote">Whatever reaches this far.</p>}
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
function RememberBlock({ rule, onPatch }: { rule: Rule; onPatch: (p: Partial<Rule>) => void }) {
  const [days, setDays] = useState(rule.rememberDays ?? 30)
  return (
    <div className="bb__after">
      <Prop label="Remember this device">
        <Toggle checked={rule.rememberMfa} onChange={(rememberMfa) => onPatch({ rememberMfa })} label="Remember this device" size="sm" />
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
                value={days}
                onChange={(e) => {
                  const n = Number(e.target.value)
                  setDays(n)
                  /* Only a usable number reaches the rule. Typing over the field
                     empties it for a keystroke, and `Number('') || 30` snapped
                     it back to 30 mid-edit — so clearing it to type 90 wrote 30
                     and moved the cursor. */
                  if (Number.isFinite(n) && n >= 1) onPatch({ rememberDays: n })
                }}
              />
              <span className="bb__unit">days</span>
            </span>
          </Prop>
          <Prop label="Force at every sign-in" indent>
            <Toggle checked={rule.forceMfaEachLogin ?? false} onChange={(forceMfaEachLogin) => onPatch({ forceMfaEachLogin })} label="Force at every sign-in" size="sm" />
          </Prop>
        </>
      )}
      <Prop label="Allow user opt-out">
        <Toggle checked={rule.allowDisable2fa} onChange={(allowDisable2fa) => onPatch({ allowDisable2fa })} label="Let users disable their second factor" size="sm" />
      </Prop>
      {rule.allowDisable2fa && (
        <p className="bb__diag is-warning">
          {/* The icon is not decoration here — `.bb__diag` colours only its
              `> svg`, so a diagnostic without one renders as plain body text
              and the tone says nothing. */}
          <AlertTriangle size={13} strokeWidth={2} aria-hidden />
          <span>
            <b>Opt-outs leave coverage.</b> This rule stops applying to them.
          </span>
        </p>
      )}
    </div>
  )
}

