import { useRef, useState } from 'react'
import { AlertTriangle, Flag, Plus, ShieldAlert, Trash2, UserCheck, X, XCircle } from 'lucide-react'

import { Toggle } from '../../kit'
import { Picker } from '../../picker'
import { restConditions, whoIds } from '../../audience-ops'
import type { AccessDecision, Rule } from '../../data'
import { METHODS } from '../rule-form'
import { Prop } from './Section'

/* -----------------------------------------------------------------------------
   THEN — what happens when the rule matches.

   Two outcomes and a ladder of steps, which is a different shape from the three
   tiles that stood here, and the reason is that one of the three was never an
   outcome.

   "Let in", "Let in then verify" and "Deny" asked one question that is really
   two. Whether somebody gets in is the decision; how many times they prove who
   they are is a property of getting in. Presenting them as three peers meant
   the second and third rows of this panel — first factor, second factor —
   restated in settings what the tile above had already claimed, and the two
   could disagree: a rule could say "Let in, then verify" while naming no second
   factor at all, which is a rule nobody can satisfy. Twenty-nine of the
   thirty-three two-factor rules in the seeded estate are in exactly that shape.

   So: Allow or Deny, and under Allow the steps a person walks, numbered. Adding
   a second step is what makes a rule two-factor. `Rule.decision` still holds all
   three values — nothing downstream changes, the linter and the simulator and
   the cards all read it as they always did — but it is written by the ladder
   rather than typed into it, so the tile and the settings can no longer say
   different things.
   -------------------------------------------------------------------------- */

/* Three, and the third is the one this pane once held a greyed placeholder
   for.

   The placeholder said "Coming soon · Not decided yet" and was deleted on the
   grounds that a promise is not a control. It is a control now. `Flag` writes
   `decision: 'warn'`: the person signs in on their first factor and the attempt
   is raised, which is the only honest answer for a device that is out of
   compliance without being dangerous — an estate one release behind its OS
   floor is too far back to ignore and not far enough to lock somebody out of
   their own inbox over. Without this tile the two answers available were both
   wrong for that case.

   It sits between Allow and Deny because that is where it sits on the ladder
   of severity the row is read along, and because arrowing right should walk
   from the mildest outcome to the hardest without doubling back.

   The tone key is `flag`, not `warn`. `is-warn` means "something is wrong
   here" everywhere else in this console; see the note on `TONE` in model.ts. */
const TILES: { id: AccessDecision; label: string; tone: string; icon: typeof UserCheck; hint: string }[] = [
  { id: '1fa', label: 'Allow', tone: 'allow', icon: UserCheck, hint: 'Sign-in proceeds through the factors below.' },
  { id: 'warn', label: 'Flag', tone: 'flag', icon: Flag, hint: 'Sign-in proceeds on the first factor, and the attempt is raised for review.' },
  { id: 'deny', label: 'Deny', tone: 'deny', icon: ShieldAlert, hint: 'Sign-in refused. No fallback path.' },
]

/* How the second factor is proved. Four modes, named the way an IdP names
   them — a sentence per option was a sentence read four times to choose one. */
const SECOND: { value: Rule['secondFactor']; label: string }[] = [
  { value: 'any', label: 'Any enrolled method' },
  { value: 'specific', label: 'One of these' },
  { value: 'chain', label: 'All of these, in order' },
  { value: 'preferred', label: 'User preference' },
]

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
  const chain = rule.methodChain ?? []
  const methods = rule.secondFactorMethods ?? []

  /* Three states now, and `allowed` is doing a narrower job than its name
     suggests, so it is renamed to the question it actually answers: does this
     outcome walk the person through factors? Allow and Flag both do — the flag
     is raised AFTER a successful sign-in, not instead of one — and Deny does
     not. That is what decides whether the ladder is drawn. */
  const walksFactors = rule.decision !== 'deny'
  const twoStep = rule.decision === '2fa'
  const flagged = rule.decision === 'warn'

  /* Which flavour of Allow to return to. Seeded from the rule so switching to
     Deny and back does not silently add or drop a second step; `'1fa'` only
     when the rule genuinely had none.

     `warn` is excluded on purpose. It is its own tile, so returning to Allow
     from Deny must never land on it — a rule that was flagging, was switched to
     Deny, and is switched back should come back as an allow, and the tile that
     lights should be the tile that was pressed. */
  const lastAllow = useRef<AccessDecision>(rule.decision === '2fa' ? '2fa' : '1fa')
  if (rule.decision === '1fa' || rule.decision === '2fa') lastAllow.current = rule.decision

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

  const pick = (id: AccessDecision) => {
    if (id === 'deny') return onPatch({ decision: 'deny', firstFactor: 'Password', firstFactorMethod: undefined, ...noSecondStep })
    /* Flag normalises the second step for the same reason Deny does: `warn` is
       one factor by definition, so a rule that had a method list and a
       remembered-device window would keep both as state nothing on screen
       shows and nothing on the rule reads. The first factor is left alone —
       a flagged sign-in still walks it, and it is the one setting the ladder
       below still offers. */
    if (id === 'warn') return onPatch({ decision: 'warn', ...noSecondStep })
    onPatch({ decision: lastAllow.current })
  }

  const unsatisfiable = twoStep && rule.secondFactor === 'specific' && methods.length === 0

  /* Which tile is lit. Both Allow flavours light the one tile — that is the
     point of the merge, and it is why this is not simply `rule.decision`.
     `warn` is not one of those flavours: it lights its own. */
  const active: string = rule.decision === 'deny' ? 'deny' : flagged ? 'warn' : '1fa'

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
    <div>
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

      {!walksFactors ? null : (
        <>
          {unsatisfiable && (
            <p className="bb__diag is-error" role="alert">
              <XCircle size={13} strokeWidth={2} aria-hidden />
              <span>
                <b>No method selected.</b> Nobody can satisfy this rule.
              </span>
            </p>
          )}

          {/* The steps, numbered, in the order they are walked.

              First factor and second factor were two settings a screen apart,
              the second gated on a tile above them — so the thing a person
              actually experiences, one step and then maybe another, had to be
              assembled in the reader's head from three controls. It is a ladder
              now, and the ladder IS the rule: a second rung is what makes this
              two-factor, so there is no tile left to contradict. */}
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
                    { value: 'Password', label: 'Password' },
                    { value: 'Any', label: 'Any enrolled method' },
                    ...METHODS.map((m) => ({ value: m, label: m, group: 'Specific method' })),
                  ]}
                  onChange={(v) =>
                    v === 'Password' || v === 'Any'
                      ? onPatch({ firstFactor: v as Rule['firstFactor'], firstFactorMethod: undefined })
                      : onPatch({ firstFactor: 'Specific', firstFactorMethod: v })
                  }
                />
              </span>
            </li>

            {twoStep ? (
              <li className="bb__rung">
                <span className="bb__rung__n" aria-hidden>
                  2
                </span>
                <span className="bb__rung__body">
                  <b>Second factor</b>
                  <Picker
                    label="Second step"
                    width="fill"
                    value={rule.secondFactor}
                    options={SECOND.map((s) => ({ value: s.value, label: s.label }))}
                    onChange={(v) => onPatch({ secondFactor: v as Rule['secondFactor'] })}
                  />
                </span>
                <button
                  type="button"
                  className="bb__rung__drop"
                  aria-label="Remove the second factor"
                  title="Remove the second factor — this becomes single-factor"
                  onClick={() => onPatch({ decision: '1fa', ...noSecondStep })}
                >
                  <X size={13} strokeWidth={2.2} />
                </button>
              </li>
            ) : flagged ? (
              /* No adder under Flag, and a line saying why rather than a
                 disabled button.

                 `warn` and `2fa` are values of one field, so "flag AND verify"
                 is not a rule this model can hold. A greyed adder would offer
                 it and refuse it in the same control; a sentence says what the
                 outcome is and leaves the tiles above as the way to change it. */
              <li className="bb__rung is-note">
                <span className="bb__rung__body">
                  <em>One factor, then the attempt is raised. Choose Allow to add a second factor.</em>
                </span>
              </li>
            ) : (
              <li className="bb__rung is-add">
                <button type="button" className="bb__addrung" onClick={() => onPatch({ decision: '2fa' })}>
                  <Plus size={13} strokeWidth={2.4} aria-hidden />
                  Add second factor
                </button>
              </li>
            )}

            {/* One editor for both list modes: a row of dropdowns, and a way to
                add another.

                `specific` was a wall of twenty-one toggle chips — every method
                the catalogue holds, rendered whether or not anybody wanted it,
                in a 400px panel. It does not scale, and it did not match
                `chain` one line below it, which asked the same question
                (which methods, in what order) with a list that grows.

                The two modes differ in what the list MEANS — any one of these
                versus all of these in order — and that difference is already
                said by the mode above. It has no business also being said by
                two different controls. */}
            {twoStep && (rule.secondFactor === 'specific' || rule.secondFactor === 'chain') && (
              <li className="bb__rung is-sub">
                <MethodList
                  ordered={rule.secondFactor === 'chain'}
                  values={rule.secondFactor === 'chain' ? chain : methods}
                  onChange={(next) =>
                    onPatch(rule.secondFactor === 'chain' ? { methodChain: next } : { secondFactorMethods: next })
                  }
                />
              </li>
            )}

            {twoStep && rule.secondFactor === 'preferred' && (
              <li className="bb__rung is-sub">
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
              </li>
            )}
          </ol>

          {twoStep && (
            <RememberBlock rule={rule} onPatch={onPatch} />
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

/* The methods a second factor accepts — one dropdown per method, and a way to
   add another.

   It replaces two controls that asked one question two ways: a wall of
   twenty-one toggle chips for "one of these", and a list of dropdowns for "all
   of these, in order". The chips do not scale — every method in the catalogue
   is rendered whether or not anybody wants it, and the twenty-second would have
   made it worse — and having two shapes for one question meant switching mode
   changed the CONTROL rather than the meaning.

   `ordered` is the only difference the shapes have any business showing: a
   chain is walked in sequence, so its rows are numbered. Which methods count is
   the same question either way.

   `nextFree` rather than a fixed default: pressing Add twice used to add the
   same method twice, which for "one of these" is a row that means nothing. */
function MethodList({
  ordered,
  values,
  onChange,
}: {
  ordered: boolean
  values: string[]
  onChange: (next: string[]) => void
}) {
  /* Password is a first factor everywhere else in this pane, and a chain is the
     one place it can legitimately appear as a later step. */
  const pool = ordered ? ['Password', ...METHODS] : METHODS
  const nextFree = pool.find((m) => !values.includes(m)) ?? pool[0]

  return (
    <div className="bb__methods">
      {values.map((m, i) => (
        <div className="bb__methodrow" key={i}>
          {ordered && (
            <b className="bb__methodn" aria-hidden>
              {i + 1}
            </b>
          )}
          <Picker
            label={ordered ? `Step ${i + 1}` : `Method ${i + 1}`}
            width="fill"
            value={m}
            options={pool.map((x) => ({ value: x, label: x }))}
            onChange={(v) => onChange(values.map((old, n) => (n === i ? v : old)))}
          />
          <button
            type="button"
            className="bb__act is-danger"
            aria-label={`Remove ${m}`}
            title="Remove"
            onClick={() => onChange(values.filter((_, n) => n !== i))}
          >
            <Trash2 size={13} strokeWidth={2} />
          </button>
        </div>
      ))}

      <button type="button" className="bb__addrow" onClick={() => onChange([...values, nextFree])}>
        <Plus size={12} strokeWidth={2.4} aria-hidden />
        Add method
      </button>
    </div>
  )
}

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
