import { useRef, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  BellRing,
  Check,
  Fingerprint,
  HelpCircle,
  KeyRound,
  Plus,
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
  X,
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
  { value: 'any', label: 'Any enabled method', meta: 'Whatever the tenant allows', icon: Layers },
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

/* --- Options shown, not hidden ---------------------------------------------------

   Every factor choice on this pane was a `Picker`, which is a control that hides
   its own answers: to know a rule could ask for a hardware token you had to open
   a dropdown and read it. That is the right trade for a filter, where the list is
   long and the answer is usually one you already know the name of. It is the
   wrong one here — the whole question a rule author is asking is "what CAN I
   require", and a closed dropdown answers it with a single word.

   So the options are on the panel. Each is a button carrying the mark of its
   family and its name, and the chosen one is filled.

   SCALE is the reason this is a grid and not the row-with-a-sentence that the
   consumer 2FA screens use. `METHODS` is data: seven today, and a tenant that
   has bought more sees more — one estate might offer two, another twelve. A
   fixed two-up or three-up layout is a decision about a number nobody controls,
   so the grid is `auto-fill` with a floor: as many columns as the panel can hold
   at a readable width, one when it is narrow, without a breakpoint per count.

   `radio` is the semantic, not the paint. A single-select gallery is a radio
   group and reads to a screen reader as one; the multi-select is a group of
   checkboxes. The tick a person sees is the same square the rest of the console
   uses for a chosen thing. */
function OptionGallery({
  label,
  options,
  value,
  onChange,
  multiple,
  detail,
}: {
  label: string
  options: { value: string; label: string; icon?: LucideIcon; hint?: string; tone?: string }[]
  /** A string when single, a list when multiple. */
  value: string | string[]
  onChange: (v: string) => void
  multiple?: boolean
  /** Extra controls for the chosen option, rendered inside its own row. */
  detail?: (v: string) => ReactNode
}) {
  const chosen = (v: string) => (Array.isArray(value) ? value.includes(v) : value === v)
  return (
    <div className={`bb__opts ${multiple ? 'is-many' : ''}`} role={multiple ? 'group' : 'radiogroup'} aria-label={label}>
      {options.map((o) => {
        const on = chosen(o.value)
        const Ico = o.icon
        const more = on && detail ? detail(o.value) : null
        return (
          <div key={o.value} className={`bb__opt ${on ? 'is-on' : ''} ${o.tone ? `is-${o.tone}` : ''}`}>
            <button
              type="button"
              className="bb__opt__btn"
              role={multiple ? undefined : 'radio'}
              aria-checked={multiple ? undefined : on}
              aria-pressed={multiple ? on : undefined}
              onClick={() => onChange(o.value)}
            >
              {/* A box on EVERY row, or no box at all — that is the difference,
                  and it is structural rather than decorative.

                  Two shapes were tried here and both were wrong for the same
                  reason. The kit's square tick on every row reads as "pick as
                  many as you like", which three of these groups do not allow. A
                  round dot in its place is the same column of empty controls
                  with the corners taken off — it still says "here are N things
                  you may each answer".

                  What actually says one-of is that the unchosen rows carry
                  nothing. There is no column of empty marks to mistake for a
                  column of checkboxes: the rows are plain, and the one that is
                  chosen says so. */}
              {multiple && (
                <span className="bx-tick" aria-hidden>
                  <Check size={10} strokeWidth={3.2} />
                </span>
              )}
              {Ico && (
                <span className="bb__opt__ico" aria-hidden>
                  <Ico size={15} strokeWidth={1.8} />
                </span>
              )}
              <span className="bb__opt__txt">
                <b>{o.label}</b>
                {o.hint && <em>{o.hint}</em>}
              </span>
              {/* The chosen one, at the end of its own row. A bare glyph and not
                  a filled box: one check on one row cannot be read as a control
                  you could also tick on the rows above and below it, because
                  they have nothing in that column. */}
              {!multiple && on && (
                <span className="bb__opt__on" aria-hidden>
                  <Check size={14} strokeWidth={2.6} />
                </span>
              )}
            </button>
            {/* Only under the chosen row, and inside it.

                The first factor's method dropdown sat AFTER the group as a row
                of its own, which put the answer to "which one" a full option
                below the option that asked. Indented under its own row, the two
                read as one answer — and nothing else on the list moves, because
                the rows that are not chosen have nothing to show. */}
            {more && <div className="bb__opt__more">{more}</div>}
          </div>
        )
      })}
    </div>
  )
}

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

  const pick = (id: AccessDecision) => {
    if (id === 'deny') return onPatch({ decision: 'deny', ...noSecondStep })
    /* Allow returns whichever Allow this rule last was. */
    onPatch({ decision: lastAllow.current })
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
  const [answered, setAnswered] = useState(
    () => rule.decision !== '2fa' || whoIds(rule.when, 'group').length > 0 || whoIds(rule.when, 'user').length > 0 || restConditions(rule.when).length > 0,
  )

  /* The chosen outcome's mark, for the rung beside the dropdown. */
  const chosen = answered ? TILES.find((t) => t.id === active) : undefined

  return (
    <div className="bb__thenparts">
      {/* The outcome comes FIRST, and it answers one question.

          It was moved BELOW the first factor once, on the reasoning that a rule
          is written the way it is spoken — one factor, then allowed or refused.
          That reading is right about a rule that has already been written and
          wrong about one being written now: the first thing an author decides is
          whether this sign-in gets through at all, and under Deny every factor
          control on the panel is dead. Drawing a dead control above the switch
          that killed it is the panel explaining itself backwards.

          So: outcome, then — only if it lets anybody in — what they prove, and
          then whether they prove it twice.

          The dropdown replaced three tiles, and that part stands: one choice
          from a short list is what a dropdown is for, and three bordered, tinted
          buttons were the largest object in a 400px panel. What it carries now
          is the TONE — the chosen outcome tints its own trigger, which is the
          one place on this pane where colour IS the meaning rather than
          decoration, and the console's rule reserves the feedback ramps for
          exactly that. */}
      <div className={`bb__part bb__outcome is-${active}`}>
        <div className="bb__part__head">
          <span className="bb__part__n" aria-hidden>
            {chosen ? <chosen.icon size={12} strokeWidth={2.2} /> : null}
          </span>
          <b>Outcome</b>
        </div>
        <div className="bb__part__body">
          {/* Two cards, Allow and Deny, which is what this was before it became
              a dropdown — and the dropdown was right about one thing and wrong
              about the rest. Right: three options, one of which ("Require a
              second factor") was an Allow wearing a peer's clothes, is a list
              that should not be three tiles. Wrong: with that third option gone
              there are TWO answers, and a two-option dropdown is a control that
              hides one answer to show the other.

              They carry the tone here rather than on the card's head, so the
              colour is on the thing you press and appears once. Allow and Deny
              are the one place on this pane where colour IS the meaning — the
              console's rule spends the feedback ramps on exactly that and
              nothing else. */}
          <OptionGallery
            label="What happens when this rule matches"
            value={answered ? active : ''}
            options={TILES.map((t) => ({ value: t.id, label: t.label, hint: t.hint, icon: t.icon, tone: t.tone }))}
            onChange={(v) => {
              setAnswered(true)
              pick(v as AccessDecision)
            }}
          />
        </div>
      </div>

      {/* Deny is complete the moment it is chosen: there is nothing to ask and
          nothing to prove, so the panel says so in a line instead of showing
          controls that cannot run. */}
      {!walksFactors ? (
        <p className="bb__addnote">Refused outright. No factor is ever asked for.</p>
      ) : (
        <>
          {/* The first factor, shown rather than hidden.

              It was one `Picker` holding Password, Any enabled method and the
              seven specific methods under a group heading — which asked the
              question well and answered it invisibly. The two broad answers and
              the specific ones are two KINDS of answer, so they are two
              galleries with a word between them rather than one list with a
              heading inside a popup. */}
          {/* Three cards down the section, one recipe: a head naming the part
              and a body holding its controls. The outcome and the first factor
              were loose rows beside a bordered second-factor card, so the
              section read as two settings and a panel rather than as the three
              parts of one answer. */}
          <div className="bb__part">
            <div className="bb__part__head">
              <span className="bb__part__n" aria-hidden>
                1
              </span>
              <b>First factor</b>
            </div>
            <div className="bb__part__body">

            {/* Three answers, and the third opens the list rather than being
                the list.

                The seven methods were a second gallery under a lower-case
                "or one specific method", which put nine tiles on a panel to
                answer a question that is usually Password. "A specific method"
                is one of the three answers now, and the methods appear only
                once it is the answer — which is the shape this pane had before
                the galleries, and the right one HERE for a reason the galleries
                are still right about elsewhere: this is a single choice out of a
                long list, and a single choice is what a dropdown is for. The
                second factor's Methods stay open, because choosing several out
                of a list is a question about the whole list. */}
            <OptionGallery
              label="First factor"
              value={rule.firstFactor}
              options={[
                { value: 'Password', label: 'Password', icon: Lock },
                { value: 'Any', label: 'Any enabled method', icon: Layers },
                { value: 'Specific', label: 'A specific method', icon: KeyRound },
              ]}
              onChange={(v) =>
                v === 'Specific'
                  ? onPatch({ firstFactor: 'Specific' })
                  : onPatch({ firstFactor: v as Rule['firstFactor'], firstFactorMethod: undefined })
              }
              detail={(v) =>
                v === 'Specific' ? (
                  <Picker
                    label="Which method"
                    width="fill"
                    value={rule.firstFactorMethod ?? ''}
                    placeholder="Choose a method"
                    options={METHODS.map(methodOption)}
                    onChange={(firstFactorMethod) => onPatch({ firstFactorMethod })}
                  />
                ) : null
              }
            />
            </div>
          </div>

          {/* Add, rather than choose.

              A three-option dropdown offered "Require a second factor" beside
              Deny, which made the number of factors and the outcome one gesture.
              They are two decisions and this is the second one: the rule already
              lets somebody in, and this says they have to prove it again.

              It is an action and it is drawn as one — a quiet full-width button
              under the first factor, in the place the card it opens will take. */}
          {!twoStep ? (
            <button type="button" className="bb__addsecond" onClick={() => onPatch({ decision: '2fa' })}>
              <Plus size={13} strokeWidth={2.4} aria-hidden />
              Add second factor
            </button>
          ) : (
        <>

          <div className="bb__second">
              <div className="bb__second__head">
                <span className="bb__second__n" aria-hidden>
                  2
                </span>
                <b>Second factor</b>
                {/* Back, and it has to be.

                    This close was removed when the outcome held three options:
                    "Allow" was then how you dropped a second factor, so a second
                    control for it inside the card was a duplicate. The outcome
                    has two options again and neither of them means "one factor"
                    — so without this there was NO way to undo Add second factor
                    once it had been pressed. */}
                <button
                  type="button"
                  className="bb__second__drop"
                  aria-label="Remove the second factor"
                  title="Remove the second factor — this becomes single-factor"
                  onClick={() => onPatch({ decision: '1fa', ...noSecondStep })}
                >
                  <X size={13} strokeWidth={2.2} />
                </button>
              </div>

              <div className="bb__second__body">
                {/* The three ways a second factor can be proved — and each one
                    that needs a follow-up carries it inside its own row, the
                    same way the first factor's "A specific method" does.

                    The two follow-ups used to be fields BELOW this list, which
                    meant the card read as three questions when it holds one: a
                    "Methods" block that appeared out of nowhere under an option
                    two rows up, and a "Fallback" block that did the same. Inside
                    the row, the option and its detail are one answer. */}
                <div className="bb__subfield">
                  <b>Prove it with</b>
                  <OptionGallery
                    label="How the second factor is proved"
                    value={rule.secondFactor}
                    options={SECOND.map((x) => ({ value: x.value as string, label: x.label, icon: x.icon }))}
                    onChange={(v) => onPatch({ secondFactor: v as Rule['secondFactor'] })}
                    detail={(v) =>
                      v === 'specific' ? (
                        <>
                          {/* A multi-select DROPDOWN, not the open list it was.

                              Open was right while this sat in the card's own
                              column: "which of these count" is a question about
                              the whole catalogue, and a closed field reading "2
                              selected" answers it badly. Inside an option row it
                              is a different trade — seven ticked rows nested one
                              indent deep under a row that is itself one of
                              three turns the card into a tree, and the thing
                              being chosen is no longer the thing in focus. The
                              field names what is chosen and opens to the same
                              ticks.

                              `multiple` on `Picker`, which keeps the list open
                              across clicks and carries its own count. */}
                          <Picker
                            multiple
                            label="Methods accepted"
                            width="fill"
                            placeholder="Choose methods"
                            value={methods}
                            options={METHODS.map(methodOption)}
                            onChange={(m) =>
                              onPatch({
                                secondFactorMethods: methods.includes(m)
                                  ? methods.filter((x) => x !== m)
                                  : [...methods, m],
                              })
                            }
                          />
                          {/* Under the control it is about. It was the first
                              thing in the card once, which put "No method
                              selected" a card's height above the empty field it
                              described. */}
                          {unsatisfiable && (
                            <p className="bb__diag is-error" role="alert">
                              <XCircle size={13} strokeWidth={2} aria-hidden />
                              <span>
                                <b>No method selected.</b> Nobody can satisfy this rule.
                              </span>
                            </p>
                          )}
                        </>
                      ) : v === 'preferred' ? (
                        <Picker
                          label="Fallback method"
                          width="fill"
                          value={rule.preferredFallback ?? ''}
                          placeholder="Choose a fallback"
                          options={METHODS.map(methodOption)}
                          onChange={(preferredFallback) => onPatch({ preferredFallback })}
                        />
                      ) : null
                    }
                  />
                </div>

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

