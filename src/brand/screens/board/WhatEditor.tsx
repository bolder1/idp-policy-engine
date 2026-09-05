import { useRef, useState } from 'react'
import { AlertTriangle, Check, Plus, ShieldAlert, Sparkles, UserCheck, X, XCircle } from 'lucide-react'

import { Toggle } from '../../kit'
import { Picker } from '../../picker'
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

/* Two, and a third that says it is not here yet.

   The placeholder is disabled and labelled, rather than left out. An outcome
   picker with two tiles reads as a finished binary; the same picker with a
   greyed third says the shape is going to grow, which is true and is cheaper to
   say now than to explain later when a row appears where nobody expected one. */
const TILES: { id: AccessDecision | 'soon'; label: string; tone: string; icon: typeof UserCheck; hint: string }[] = [
  { id: '1fa', label: 'Allow', tone: 'allow', icon: UserCheck, hint: 'Let the sign-in through, after the steps below.' },
  { id: 'deny', label: 'Deny', tone: 'deny', icon: ShieldAlert, hint: 'Refuse it. No prompt and no way round.' },
  { id: 'soon', label: 'Coming soon', tone: 'soon', icon: Sparkles, hint: 'A third outcome is on the way. Not decided yet.' },
]

/* How a second step is proved, as four choices rather than a mode plus a mode's
   settings. Each carries what it needs underneath it and nothing else. */
const SECOND: { value: Rule['secondFactor']; label: string }[] = [
  { value: 'any', label: 'Any method they have enrolled' },
  { value: 'specific', label: 'One of these methods' },
  { value: 'chain', label: 'Every one of these, in order' },
  { value: 'preferred', label: 'Whichever they prefer' },
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

  const allowed = rule.decision !== 'deny'
  const twoStep = rule.decision === '2fa'

  /* Which flavour of Allow to return to. Seeded from the rule so switching to
     Deny and back does not silently add or drop a second step; `'1fa'` only
     when the rule genuinely had none. */
  const lastAllow = useRef<AccessDecision>(rule.decision === 'deny' ? '1fa' : rule.decision)
  if (rule.decision !== 'deny') lastAllow.current = rule.decision

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

  const pick = (id: AccessDecision | 'soon') => {
    if (id === 'soon') return
    if (id === 'deny') return onPatch({ decision: 'deny', firstFactor: 'Password', firstFactorMethod: undefined, ...noSecondStep })
    onPatch({ decision: lastAllow.current === 'deny' ? '1fa' : lastAllow.current })
  }

  const unsatisfiable = twoStep && rule.secondFactor === 'specific' && methods.length === 0

  /* Which tile is lit. Both Allow flavours light the one tile — that is the
     point of the merge, and it is why this is not simply `rule.decision`. */
  const active: string = allowed ? '1fa' : 'deny'

  return (
    <div>
      <div className="bb__decide" role="radiogroup" aria-label="What happens when this rule matches">
        {TILES.map((t, i) => {
          const on = t.id === active
          const Ico = t.icon
          const soon = t.id === 'soon'
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={on}
              aria-disabled={soon || undefined}
              disabled={soon}
              tabIndex={on ? 0 : -1}
              className={`is-${t.tone} ${on ? 'is-on' : ''}`}
              title={t.hint}
              onClick={() => pick(t.id)}
              onKeyDown={(e) => {
                const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key as 'ArrowRight']
                if (!d) return
                e.preventDefault()
                /* Skips the placeholder. An arrow key that parks focus on a
                   disabled tile is an arrow key that appears to do nothing. */
                const live = TILES.filter((x) => x.id !== 'soon')
                const at = live.findIndex((x) => x.id === active)
                pick(live[(at + d + live.length) % live.length].id)
              }}
            >
              <Ico size={16} strokeWidth={1.9} aria-hidden />
              <strong>{t.label}</strong>
              {i === 2 && <em>Not decided yet</em>}
            </button>
          )
        })}
      </div>

      {!allowed ? null : (
        <>
          {unsatisfiable && (
            <p className="bb__diag is-error" role="alert">
              <XCircle size={13} strokeWidth={2} aria-hidden />
              <span>
                <b>Nobody can complete this.</b> No method is chosen for the second step.
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
                <b>First step</b>
                <Picker
                  label="First step"
                  width="fill"
                  value={rule.firstFactor === 'Specific' ? (rule.firstFactorMethod ?? 'Specific') : rule.firstFactor}
                  /* One picker, not a segment plus a conditional picker beneath
                     it. "Specific" was never an answer — it was a promise to
                     answer, and the row it revealed asked the same question
                     again one line down. The methods are in this list. */
                  options={[
                    { value: 'Password', label: 'Password', meta: 'The usual first step' },
                    { value: 'Any', label: 'Any method they have enrolled' },
                    ...METHODS.map((m) => ({ value: m, label: m, group: 'A specific method' })),
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
                  <b>Second step</b>
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
                  aria-label="Remove the second step"
                  title="Remove the second step — this becomes a one-step rule"
                  onClick={() => onPatch({ decision: '1fa', ...noSecondStep })}
                >
                  <X size={13} strokeWidth={2.2} />
                </button>
              </li>
            ) : (
              <li className="bb__rung is-add">
                <button type="button" className="bb__addrung" onClick={() => onPatch({ decision: '2fa' })}>
                  <Plus size={13} strokeWidth={2.4} aria-hidden />
                  Add a second step
                </button>
              </li>
            )}

            {twoStep && rule.secondFactor === 'specific' && (
              <li className="bb__rung is-sub">
                <span className="bb__chips" role="group" aria-label="Methods allowed for the second step">
                  {METHODS.map((m) => {
                    const on = methods.includes(m)
                    return (
                      <button
                        key={m}
                        type="button"
                        className={`bb__chip ${on ? 'is-on' : ''}`}
                        aria-pressed={on}
                        onClick={() => onPatch({ secondFactorMethods: on ? methods.filter((x) => x !== m) : [...methods, m] })}
                      >
                        {on && <Check size={11} strokeWidth={2.6} aria-hidden />}
                        {m}
                      </button>
                    )
                  })}
                </span>
              </li>
            )}

            {twoStep && rule.secondFactor === 'chain' && (
              <li className="bb__rung is-sub">
                <div className="bb__chain2">
                  {chain.map((step, si) => (
                    <div className="bb__chainrow" key={si}>
                      <b>{si + 1}</b>
                      <Picker
                        label={`Chain step ${si + 1}`}
                        width="fill"
                        value={step}
                        options={['Password', ...METHODS].map((m) => ({ value: m, label: m }))}
                        onChange={(v) => {
                          const next = [...chain]
                          next[si] = v
                          onPatch({ methodChain: next })
                        }}
                      />
                      <button type="button" className="bb__act is-danger" aria-label={`Remove step ${si + 1}`} onClick={() => onPatch({ methodChain: chain.filter((_, n) => n !== si) })}>
                        <X size={12} strokeWidth={2.2} />
                      </button>
                    </div>
                  ))}
                  <button type="button" className="bb__addrow" onClick={() => onPatch({ methodChain: [...chain, 'miniOrange Push'] })}>
                    <Plus size={12} strokeWidth={2.4} aria-hidden />
                    Add a method
                  </button>
                </div>
              </li>
            )}

            {twoStep && rule.secondFactor === 'preferred' && (
              <li className="bb__rung is-sub">
                <Prop label="If they set no preference" indent>
                  <Picker label="Fallback method" value={rule.preferredFallback ?? ''} options={METHODS.map((m) => ({ value: m, label: m }))} onChange={(preferredFallback) => onPatch({ preferredFallback })} />
                </Prop>
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

/* Remembering a device, folded into one row that grows.

   Three property rows — a toggle, a number, a second toggle — for a setting
   most rules leave off. Two of the three were only ever reachable through the
   first, so they are inside it now. */
function RememberBlock({ rule, onPatch }: { rule: Rule; onPatch: (p: Partial<Rule>) => void }) {
  const [days, setDays] = useState(rule.rememberDays ?? 30)
  return (
    <div className="bb__after">
      <Prop label="Skip the second step on a device that already passed">
        <Toggle checked={rule.rememberMfa} onChange={(rememberMfa) => onPatch({ rememberMfa })} label="Remember this device" size="sm" />
      </Prop>
      {rule.rememberMfa && (
        <>
          <Prop label="For how long" indent>
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
          <Prop label="Ask every time anyway" indent>
            <Toggle checked={rule.forceMfaEachLogin ?? false} onChange={(forceMfaEachLogin) => onPatch({ forceMfaEachLogin })} label="Ask every time anyway" size="sm" />
          </Prop>
        </>
      )}
      <Prop label="Let people switch their own second step off">
        <Toggle checked={rule.allowDisable2fa} onChange={(allowDisable2fa) => onPatch({ allowDisable2fa })} label="Let users disable their second factor" size="sm" />
      </Prop>
      {rule.allowDisable2fa && (
        <p className="bb__diag is-warning">
          {/* The icon is not decoration here — `.bb__diag` colours only its
              `> svg`, so a diagnostic without one renders as plain body text
              and the tone says nothing. */}
          <AlertTriangle size={13} strokeWidth={2} aria-hidden />
          <span>
            <b>Users may opt out.</b> Anyone who does is no longer covered by this rule.
          </span>
        </p>
      )}
    </div>
  )
}
