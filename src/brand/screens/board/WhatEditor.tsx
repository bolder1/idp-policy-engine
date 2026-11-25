import { useId, useRef, useState } from 'react'
import { useEffect } from 'react'
import {
  AlertTriangle,
  KeyRound,
  Layers,
  Link2,
  ListChecks,
  Lock,
  type LucideIcon,
  Mail,
  MessageSquare,
  Minus,
  ShieldAlert,
  UserCheck,
  UserCog,
  UserRound,
  Users,
  XCircle,
} from 'lucide-react'

import { CheckRow, Toggle } from '../../kit'
import { SHOWCASE } from '../../showcase'
import { Picker } from '../../picker'
import { DENIAL_REASONS } from '../sign-in-tests/phase'
import { DENY_ACTION_SUGGESTION, denyReasonOfRule } from '../testing/deny-reason'
import { DEFAULT_DENY_MESSAGE, DENY_ALERT_EVENTS, DENY_EXTRA_MAX, DENY_MESSAGE_MAX, type AccessDecision, type DenyAlertEvent, type Rule } from '../../data'
import { shows } from '../../rollout'
import { methodById } from '../../methods'
import { METHOD_ICON as SHARED_METHOD_ICON } from '../../method-icons'
import { PUSH_OPTIONS_IN_POLICY } from '../../mfa-settings'
import { METHODS } from '../rule-form'
import { METHOD_PREFIX, firstFactorPatch, firstFactorValue } from './first-factor'
import { isPristine } from './parts'
import { Prop, Seg } from './Section'
import { useShows } from './builder-version'
import { gapText, useRuleGaps } from './rule-gaps'

/* Deny's email alerts (rollout.ts `denyAlerts`), read once. */
const DENY_ALERTS = shows('denyAlerts')

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
/* Each is a card with its one line (owner, 22 Sep 2026: "stackable cards with
   a one-liner — two in a row, and after that they stack"). The line says what
   the answer DOES, so the choice is made on its consequence rather than on a
   word. */
const TILES: { id: AccessDecision; label: string; tone: string; icon: typeof UserCheck; hint: string }[] = [
  { id: '1fa', label: 'Allow', tone: 'allow', icon: UserCheck, hint: 'Let the sign-in through, after the factors below.' },
  { id: 'deny', label: 'Deny', tone: 'deny', icon: ShieldAlert, hint: 'Block the sign-in and show a message.' },
]
/* A third card, "Next rule · Coming soon", stood beside Allow and Deny: a rule
   that matched and handed the login on, drawn as the shape the choice was going
   to take (owner, 22 Sep 2026). Removed on 23 Sep — "remove this". A disabled
   card is a third of this row spent on something you cannot pick, on the pane
   where the rule's one real decision is made, and the two that work now sit
   side by side with nothing between them. The outcome model never gained the
   answer, so nothing else goes with it.  */


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

/* A mark per method: method-icons.ts, shared with a trusted device's Registration MFA method. */
const METHOD_ICON: Record<string, LucideIcon> = { ...SHARED_METHOD_ICON }
/* Magic link starts a session in place of the password, so it is offered as a FIRST factor only, and the second-factor
   lists do not carry it (owner, 26 Oct 2026, with its two options below). Named as the catalogue names it. */
const MAGIC_LINK = methodById('magic-link')?.name ?? 'Magic link'
const PUSH = 'miniOrange Push'
METHOD_ICON[MAGIC_LINK] = Link2
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

  /* Push can also be the FIRST factor (a rule signing people in with a tap alone). The rule holds one pair of Push
     options, so they are drawn once: under the First factor when it is Push, otherwise with the second factor that
     names it. Whatever clears them with the second step must leave them while the first factor still needs them. */
  const pushFirst = rule.firstFactor === 'Specific' && rule.firstFactorMethod === PUSH
  const dropPush = pushFirst ? {} : { pushBiometric: undefined, pushNumberMatching: undefined }

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
    ...dropPush,
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

  /* Pressing an outcome answers it: the new rule's open Then is closed with the same patch (rule-gaps.ts). */
  const answer = rule.outcomeOpen ? { outcomeOpen: undefined } : {}
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
          pushBiometric: rule.pushBiometric,
          pushNumberMatching: rule.pushNumberMatching,
        }
      }
      return onPatch({ decision: 'deny', ...noSecondStep, ...answer })
    }
    /* A new rule holds `2fa` without anybody having chosen it; Allow on it
       means Allow, and a second factor is added below. */
    if (!answered) return onPatch({ decision: '1fa', ...answer })
    /* Allow returns whichever Allow this rule last was, with its settings. */
    const restore = rule.decision === 'deny' ? beforeDeny.current : null
    beforeDeny.current = null
    onPatch({ decision: lastAllow.current, ...(restore ?? {}), ...answer })
  }

  const unsatisfiable = twoStep && rule.secondFactor === 'specific' && methods.length === 0
  /* miniOrange Push's two options show while the rule NAMES it (owner, 26 Oct 2026: "when the user selects miniOrange
     Push this should be visible"): picked in Specific methods, or the step of a chain a rule arrived holding. Not under
     "Any enabled method", which names nobody. */
  const pushSecond = twoStep && ((rule.secondFactor === 'specific' && methods.includes(PUSH)) || (rule.secondFactor === 'chain' && (rule.methodChain ?? []).includes(PUSH)))
  const pushOptions = (
    /* Checks with their sentences under them, as the device profile's rows are (owner, 27 Oct 2026: "add check and
       subheading … same for all the other options inside policy builder"). The sentences are the info dots' own words,
       promoted, so nothing here is new copy. */
    <div className="bb__opts">
      <CheckRow
        label="Require biometric to approve"
        hint="The tap has to be confirmed with a fingerprint or face."
        checked={rule.pushBiometric ?? true}
        onChange={(pushBiometric) => onPatch({ pushBiometric })}
      />
      <CheckRow
        label="Number matching"
        hint="The user picks the number shown, so no push is approved by reflex."
        checked={rule.pushNumberMatching ?? true}
        onChange={(pushNumberMatching) => onPatch({ pushNumberMatching })}
      />
    </div>
  )

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
  /* A new rule's Then stays open until Allow or Deny is pressed, whatever else is set on it (`outcomeOpen`, rule-gaps.ts):
     the optional decision the note above asks for, as a flag beside `decision`. */
  /* Derived, not only remembered: an undo that brings `outcomeOpen` back closes the tiles again (23 Nov 2026 audit). */
  const [pressed, setPressed] = useState(() => !!terminal || !isPristine(rule))
  const answered = !!terminal || (!rule.outcomeOpen && pressed)
  /* The reasons a refused save left under this rule's fields (rule-gaps.ts). */
  const shownGaps = useRuleGaps()
  const at = terminal ? 'fallback' : rule.id
  const outcomeGap = gapText(shownGaps, at, 'outcome')
  const firstGap = gapText(shownGaps, at, 'first-factor')
  const methodsGap = gapText(shownGaps, at, 'methods')



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
        {/* Two cards to a row, and the rest wrap under them — never one card
            per line down the panel. */}
        <div className="bb__outcards" role="radiogroup" aria-label="What happens when this rule matches">
          {TILES.map((t) => {
            const on = answered && active === t.id
            return (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={on}
                className={`bb__outcard is-${t.tone}${on ? ' is-on' : ''}`}
                onClick={() => {
                  pick(t.id)
                  setPressed(true)
                }}
              >
                <span className="bb__outcard__ico" aria-hidden>
                  <t.icon size={16} strokeWidth={2} />
                </span>
                <span className="bb__outcard__text">
                  <b>{t.label}</b>
                  <em>{t.hint}</em>
                </span>
              </button>
            )
          })}
        </div>
        {outcomeGap && (
          <p className="bb__gap" role="alert" tabIndex={-1}>
            {outcomeGap}
          </p>
        )}
      </div>

      {/* Nothing under the tiles until one is pressed (owner, 22 Sep 2026: "don't
          show the first factor and second factor until the user chooses Allow or
          Deny"). The factors are Allow's questions; showing them first answered
          Allow on the user's behalf.

          Deny is complete the moment it is chosen: there is nothing to ask and
          nothing to prove, so the panel says so in a line instead of showing
          controls that cannot run. */}
      {!answered ? null : !walksFactors ? (
        /* The card above already says what Deny does; the message is what is
           left to set. */
        <DenyMessage rule={rule} onPatch={onPatch} at={at} />
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
                ...[...METHODS, MAGIC_LINK].map((m) => ({ ...methodOption(m), value: METHOD_PREFIX + m, group: 'A specific method' })),
              ]}
              /* Choosing what is already chosen writes nothing, so Magic link's two options are not reset by it. Leaving
                 Push as the first factor takes its options along unless the second factor still names it. */
              onChange={(v) =>
                v !== firstFactorValue(rule) &&
                onPatch({ ...firstFactorPatch(v), ...(pushFirst && !pushSecond ? { pushBiometric: undefined, pushNumberMatching: undefined } : {}) })
              }
            />
            {firstGap && (
              <p className="bb__gap" role="alert" tabIndex={-1}>
                {firstGap}
              </p>
            )}
            {PUSH_OPTIONS_IN_POLICY && pushFirst && pushOptions}
            {rule.firstFactor === 'Specific' && rule.firstFactorMethod === MAGIC_LINK && (
              <div className="bb__opts">
                {/* The live console's two options for this first factor, in its words (owner, 26 Oct 2026). Off until ticked, as
                    its boxes are. */}
                <CheckRow
                  label="Enable sign-in from other IPs"
                  hint="When enabled, users can open the magic link from a different IP address than where it was requested."
                  checked={rule.magicLinkOtherIps ?? false}
                  onChange={(magicLinkOtherIps) => onPatch({ magicLinkOtherIps })}
                />
                <CheckRow
                  label="Enable sign-in from other devices"
                  hint="When enabled, users can open the magic link from a different device than where it was requested."
                  checked={rule.magicLinkOtherDevices ?? false}
                  onChange={(magicLinkOtherDevices) => onPatch({ magicLinkOtherDevices })}
                />
              </div>
            )}
            {/* Only reachable by a rule saved before the merge: no choice in the
                picker above can leave Specific without a method. */}
            {!SHOWCASE && rule.firstFactor === 'Specific' && !rule.firstFactorMethod && (
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
                  : onPatch({ decision: '2fa', secondFactor: v as Rule['secondFactor'], ...(v === 'specific' ? {} : dropPush) })
              }
            />

          </div>

          {/* Its own field with its own label (owner, 22 Sep 2026: "dedicated
              label for this — Methods"). It hung under the Second factor
              picker with only a placeholder to say what it was, so the two
              dropdowns read as one control twice. */}
          {twoStep && rule.secondFactor === 'specific' && (
            <div className="bb__thenfield">
              <span className="bb__thenlabel">Methods</span>
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
                    /* Taking Push off the list takes its options with it: nothing on screen would show them. */
                    ...(m === PUSH && methods.includes(PUSH) ? dropPush : {}),
                  })
                }
              />
              {methodsGap && (
                <p className="bb__gap" role="alert" tabIndex={-1}>
                  {methodsGap}
                </p>
              )}
              {/* Hidden in the showcase, with the panel's other findings. */}
              {!SHOWCASE && unsatisfiable && (
                <p className="bb__diag is-error" role="alert">
                  <XCircle size={13} strokeWidth={2} aria-hidden />
                  <span>
                    <b>No method selected.</b> Nobody can satisfy this rule.
                  </span>
                </p>
              )}
            </div>
          )}

          {/* miniOrange Push's two options, on the rule (owner, 26 Oct 2026). They were the tenant's Settings tab. */}
          {PUSH_OPTIONS_IN_POLICY && pushSecond && !pushFirst && (
            <div className="bb__thenfield">
              <span className="bb__thenlabel">{PUSH}</span>
              {pushOptions}
            </div>
          )}

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
      {/* Checks with a sentence under each, as the device profile's rows are (owner, 27 Oct 2026). The first two sentences
          are new: these three never had one. The label stays the console's, word for word. */}
      <CheckRow
        label="Remember MFA"
        hint="Don't ask for the second factor again on the same device for a number of days."
        more="After someone passes the second factor, that browser on that device is trusted for the number of days you set. Until then they sign in with the first factor only. A new device, another browser or cleared cookies asks again. Force MFA on each login overrides this."
        checked={rule.rememberMfa}
        onChange={(rememberMfa) => onPatch({ rememberMfa })}
      />
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
        </>
      )}
      {/* Its own switch, at the same level as Remember MFA and not inside it (owner, 26 Oct 2026: "make Remember MFA and
          Force MFA independent, not inside one"). It was the second row under Remember MFA, so it could only be reached
          by turning that on, and read as a sub-setting of it. The two are separate answers: whether a device is
          remembered, and whether MFA is asked at every sign-in regardless. */}
      <CheckRow
        label="Force MFA on each login"
        hint="Ask for the second factor at every sign-in, even on a device that is remembered."
        more="Every sign-in this rule matches asks for the second factor, with no trusted devices and no days off. It works whether Remember MFA is on or not, and wins when both are ticked. Use it for sensitive applications."
        checked={rule.forceMfaEachLogin ?? false}
        onChange={(forceMfaEachLogin) => onPatch({ forceMfaEachLogin })}
      />
      <CheckRow
        label="Allow end users to disable 2FA"
        hint="People can turn off two-step verification for their own account."
        more="People get a switch in their own account settings to turn off the second factor. Once they turn it off, this rule signs them in with the first factor only, until they turn it back on. Leave it unticked where a second factor is required."
        checked={rule.allowDisable2fa}
        onChange={(allowDisable2fa) => onPatch({ allowDisable2fa })}
      />
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
function DenyMessage({ rule, onPatch, at }: { rule: Rule; onPatch: (p: Partial<Rule>) => void; at: string }) {
  const denyExtras = useShows('denyExtras')
  const id = useId()
  const value = rule.denyMessage ?? ''
  if (DENY_ALERTS) return <DenyOutcome rule={rule} onPatch={onPatch} at={at} />
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
        onChange={(e) => onPatch({ denyMessage: e.target.value.trim() === '' ? undefined : e.target.value })}
      />
      <span className="bb__denycount" id={`${id}-count`}>
        {value.length}/{DENY_MESSAGE_MAX}
      </span>
      {DENIAL_REASONS && denyExtras && (
        <>
          <label className="bb__thenlabel" htmlFor={`${id}-action`}>
            Next step
          </label>
          <input
            id={`${id}-action`}
            type="text"
            maxLength={DENY_EXTRA_MAX}
            value={rule.denyAction ?? ''}
            placeholder="What they can do, for example connect from the office"
            onChange={(e) => onPatch({ denyAction: e.target.value.trim() === '' ? undefined : e.target.value })}
          />
          {!rule.denyAction && (
            <button type="button" className="bb__denysuggest" onClick={() => onPatch({ denyAction: DENY_ACTION_SUGGESTION[denyReasonOfRule(rule)] })}>
              Use “{DENY_ACTION_SUGGESTION[denyReasonOfRule(rule)]}”
            </button>
          )}
          <label className="bb__thenlabel" htmlFor={`${id}-contact`}>
            Contact
          </label>
          <input
            id={`${id}-contact`}
            type="text"
            maxLength={DENY_EXTRA_MAX}
            value={rule.denyContact ?? ''}
            placeholder="Who to ask, for example the IT help desk"
            onChange={(e) => onPatch({ denyContact: e.target.value.trim() === '' ? undefined : e.target.value })}
          />
        </>
      )}
    </div>
  )
}

/* --- Deny: an Email alerts card, then a Deny message card -----------------------------------

   The live console's "Email Alerts and Custom Error Message" card (Configure Adaptive Policy), brought onto the rule
   that denies (owner, 23 Nov 2026: "add the whole Email part in the deny"), its fields and order kept.

   Shaped over four looks the same day. Kept: two cards, Email alerts with its switch in the head and Deny message
   apart ("I like the older toggle one ... segregate both"); inside, the events as the builder's check rows, the way
   Allow's options are. Redone twice: who is emailed. Plain checks hid what each choice adds; recipient cards that opened
   were boxes in a box with a check inside a check. Now it is one answer on the builder's segmented control
   (Administrators, End users, Both): administrators add their address field under it, end users add the last event,
   "Number of device registrations exceeded allowed count", to the list (owner: "for end user add one last in the
   row"). The events carry no line under them; their words say it ("self-explanatory enough").

   Switching alerts off clears them from the rule, as Deny clears Allow's factors. Switching on picks administrators,
   the console's own first box. */
const ALERTS_OFF: Partial<Rule> = { denyAlertAdmins: undefined, denyAlertUsers: undefined, denyAlertEmail: undefined, denyAlertOn: undefined }

function DenyOutcome({ rule, onPatch, at }: { rule: Rule; onPatch: (p: Partial<Rule>) => void; at: string }) {
  return (
    <div className="bb__thenfield bb__denyx">
      <DenyAlerts rule={rule} onPatch={onPatch} at={at} />
      <DenyMessageCard rule={rule} onPatch={onPatch} />
    </div>
  )
}

type AlertTo = 'admins' | 'users' | 'both'
const ALERT_TO: { value: AlertTo; label: string; icon: LucideIcon }[] = [
  { value: 'admins', label: 'Administrators', icon: UserCog },
  { value: 'users', label: 'End users', icon: UserRound },
  { value: 'both', label: 'Both', icon: Users },
]

function DenyAlerts({ rule, onPatch, at }: { rule: Rule; onPatch: (p: Partial<Rule>) => void; at: string }) {
  /* A refused save's reason under the events, when alerts are on with none ticked (rule-gaps.ts). */
  const eventsGap = gapText(useRuleGaps(), at, 'alerts')
  const id = useId()
  const on = rule.denyAlertOn ?? []
  const stored = !!(rule.denyAlertAdmins || rule.denyAlertUsers || rule.denyAlertEmail || on.length)
  /* On with nothing picked yet is a state the rule cannot hold, so the switch keeps it here until a pick lands. */
  const [opened, setOpened] = useState(stored)
  const enabled = stored || opened
  const setEnabled = (next: boolean) => {
    setOpened(next)
    onPatch(next ? { denyAlertAdmins: true } : ALERTS_OFF)
  }
  const setEvent = (event: DenyAlertEvent, next: boolean) => {
    const set = next ? [...on, event] : on.filter((e) => e !== event)
    const ordered = DENY_ALERT_EVENTS.map((e) => e.id).filter((e) => set.includes(e))
    onPatch({ denyAlertOn: ordered.length ? ordered : undefined })
  }
  const to: AlertTo = rule.denyAlertAdmins && rule.denyAlertUsers ? 'both' : rule.denyAlertUsers ? 'users' : 'admins'
  /* One answer for who, as the console's two boxes give one between them. Leaving administrators drops their address;
     leaving end users drops the alert only they get. */
  const setTo = (next: AlertTo) => {
    const admins = next !== 'users'
    const users = next !== 'admins'
    const kept = users ? on : on.filter((e) => !DENY_ALERT_EVENTS.find((d) => d.id === e)?.endUsers)
    onPatch({
      denyAlertAdmins: admins || undefined,
      denyAlertUsers: users || undefined,
      denyAlertEmail: admins ? rule.denyAlertEmail : undefined,
      denyAlertOn: kept.length ? kept : undefined,
    })
  }
  const email = (rule.denyAlertEmail ?? '').trim()
  const emailBad = email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  const events = DENY_ALERT_EVENTS.filter((e) => !e.endUsers || rule.denyAlertUsers)
  return (
    <section className="bb__dpanel" aria-labelledby={`${id}-title`}>
      <header className="bb__dpanel__head">
        <span className="bb__dpanel__ico" aria-hidden="true">
          <Mail size={16} />
        </span>
        <span className="bb__dpanel__title" id={`${id}-title`}>
          Email alerts
        </span>
        <Toggle size="sm" checked={enabled} onChange={setEnabled} label="Email alerts" />
      </header>
      {enabled && (
        <div className="bb__dpanel__body">
          <div className="bb__dpanel__group">
            <span className="bb__thenlabel">Send email alerts to</span>
            <Seg label="Send email alerts to" value={to} options={ALERT_TO} onChange={setTo} block />
          </div>
          {rule.denyAlertAdmins && (
            <div className="bb__dpanel__group">
              <label className="bb__thenlabel" htmlFor={`${id}-email`}>
                Administrator’s email address to receive alerts
              </label>
              <input
                id={`${id}-email`}
                className="bb__input"
                type="email"
                value={rule.denyAlertEmail ?? ''}
                placeholder="Enter email address"
                aria-invalid={emailBad}
                aria-describedby={`${id}-email-help${emailBad ? ` ${id}-email-err` : ''}`}
                onChange={(e) => onPatch({ denyAlertEmail: e.target.value.trim() === '' ? undefined : e.target.value })}
              />
              <p className={emailBad ? 'bb__denyy__err' : 'bb__denyhelp'} id={emailBad ? `${id}-email-err` : `${id}-email-help`}>
                {emailBad ? 'Enter a valid email address.' : 'If empty, the main administrator receives the alerts.'}
              </p>
            </div>
          )}
          <div className="bb__after bb__dpanel__group">
            <span className="bb__thenlabel">Send email alerts when</span>
            <div className="bb__opts">
              {events.map((e) => (
                <CheckRow key={e.id} label={e.label} checked={on.includes(e.id)} onChange={(v) => setEvent(e.id, v)} />
              ))}
            </div>
            {eventsGap && (
              <p className="bb__gap" role="alert" tabIndex={-1}>
                {eventsGap}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

function DenyMessageCard({ rule, onPatch }: { rule: Rule; onPatch: (p: Partial<Rule>) => void }) {
  const denyExtras = useShows('denyExtras')
  const id = useId()
  const value = rule.denyMessage ?? ''
  return (
    <section className="bb__dpanel" aria-labelledby={`${id}-title`}>
      <header className="bb__dpanel__head">
        <span className="bb__dpanel__ico" aria-hidden="true">
          <MessageSquare size={16} />
        </span>
        <label className="bb__dpanel__title" id={`${id}-title`} htmlFor={id}>
          Deny message
        </label>
        <span className="bb__dpanel__meta" id={`${id}-count`}>
          {value.length}/{DENY_MESSAGE_MAX}
        </span>
      </header>
      <div className="bb__dpanel__body">
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
          onChange={(e) => onPatch({ denyMessage: e.target.value.trim() === '' ? undefined : e.target.value })}
        />
        {DENIAL_REASONS && denyExtras && (
          <>
            <label className="bb__thenlabel" htmlFor={`${id}-action`}>
              Next step
            </label>
            <input
              id={`${id}-action`}
              type="text"
              maxLength={DENY_EXTRA_MAX}
              value={rule.denyAction ?? ''}
              placeholder="What they can do, for example connect from the office"
              onChange={(e) => onPatch({ denyAction: e.target.value.trim() === '' ? undefined : e.target.value })}
            />
            {!rule.denyAction && (
              <button type="button" className="bb__denysuggest" onClick={() => onPatch({ denyAction: DENY_ACTION_SUGGESTION[denyReasonOfRule(rule)] })}>
                Use “{DENY_ACTION_SUGGESTION[denyReasonOfRule(rule)]}”
              </button>
            )}
            <label className="bb__thenlabel" htmlFor={`${id}-contact`}>
              Contact
            </label>
            <input
              id={`${id}-contact`}
              type="text"
              maxLength={DENY_EXTRA_MAX}
              value={rule.denyContact ?? ''}
              placeholder="Who to ask, for example the IT help desk"
              onChange={(e) => onPatch({ denyContact: e.target.value.trim() === '' ? undefined : e.target.value })}
            />
          </>
        )}
      </div>
    </section>
  )
}
