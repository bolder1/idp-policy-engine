import { useRef } from 'react'
import { AlertTriangle, Check, KeyRound, Plus, ShieldAlert, UserCheck, X, XCircle } from 'lucide-react'

import { Toggle } from '../../kit'
import { Picker } from '../../picker'
import type { AccessDecision, Rule } from '../../data'
import { METHODS } from '../rule-form'
import { DECISION_NAME, TONE } from './model'
import { Prop, Seg } from './Section'

/* -----------------------------------------------------------------------------
   WHAT — the decision, and the settings that shape it.

   Three tiles, one row, each named for what the PERSON experiences rather than
   how many factors the engine counts. Under them, the settings that shape the
   outcome, as property rows.

   The journey used to be drawn here too — the steps the person walks, from the
   same `journeyOf` the card reads. It has gone, and the reason is that the card
   never stopped drawing it. Every rule on the stage carries its journey, and
   the panel only ever opens BESIDE the stage, so the two were on screen at once
   showing the same four lines from the same function. The panel is 400px of
   scarce column and the editing is what it is for; a second copy of a picture
   already visible six inches to the left was the cheapest thing in it to lose.
   `journeyOf` stays where it was — IfBlock is the one caller now.
   -------------------------------------------------------------------------- */

/* No captions.

   "A password is enough", "Ask for a second step", "Refuse outright" restated
   the three labels above them in more words, on a control where the labels are
   already the plainest thing on the screen and the card beside it shows the
   actual consequence step by step. Three lines of prose to say what one word
   and a diagram already said. */
const TILES: { id: AccessDecision; label: string; icon: typeof UserCheck }[] = [
  { id: '1fa', label: 'Let in', icon: UserCheck },
  { id: '2fa', label: 'Let in, then verify', icon: KeyRound },
  { id: 'deny', label: 'Deny', icon: ShieldAlert },
]

export function WhatEditor({
  rule,
  onPatch,
  terminal,
  focus,
  next,
}: {
  rule: Rule
  onPatch: (p: Partial<Rule>) => void
  terminal?: boolean
  /* Side by side rather than stacked, which changes what needs saying.

     Two of the paragraphs here exist because the panel is a narrow column read
     top to bottom: they restate, in prose, what the control above them already
     did. Full screen the conditions are in the next column and the chain is one
     Escape away, so the same sentences are a wall of text between somebody and
     the two settings they came to change. */
  focus?: boolean
  /* Which rule catches the sign-ins this one lets past.

     This was an `else` row inside the condition block, which put it beside the
     IF as though it were part of the test. It is not — it is the other half of
     what happens, and under first-match it is most of what a rule does. */
  next?: { index: number; name: string } | null
}) {
  /* No invented default here, and that is the whole point.

     These three controls used to show a value the rule did not have —
     `methodChain ?? ['TOTP Authenticator']`, `firstFactorMethod ?? METHODS[0]`,
     `preferredFallback ?? METHODS[0]`. None of them was ever patched onto the
     rule, so the journey on the card beside this panel said "Empty chain" and
     "A chosen method" while the control here named a specific method. Two
     readings of one rule, disagreeing on screen at the same time.

     Showing nothing is the honest version: the chain renders as just "Add a
     step", and the pickers fall through to their own "Choose…" placeholder.
     What is on screen is then what would be saved. */
  const chain = rule.methodChain ?? []
  const methods = rule.secondFactorMethods ?? []

  /* Deny normalises the settings that belong to Allow, so a rule switched to
     Deny does not keep a remembered-device window nobody can see or clear. */
  const lastAllow = useRef<AccessDecision>(rule.decision === 'deny' ? '2fa' : rule.decision)
  if (rule.decision !== 'deny') lastAllow.current = rule.decision
  const pick = (d: AccessDecision) =>
    d === 'deny' ? onPatch({ decision: 'deny', rememberMfa: false, allowDisable2fa: false, secondFactor: 'any' }) : onPatch({ decision: d })

  const unsatisfiable = rule.decision === '2fa' && rule.secondFactor === 'specific' && methods.length === 0

  return (
    <div>
      <div className="bb__decide" role="radiogroup" aria-label="What happens when this rule matches">
        {TILES.map((t, i) => {
          const on = rule.decision === t.id
          const Ico = t.icon
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={on}
              /* A roving tabindex, which `role="radiogroup"` promises and this
                 did not deliver: all three tiles were in the tab order and none
                 answered an arrow key, so the control announced itself as a
                 radio group and then behaved like three unrelated buttons. One
                 stop for the group, arrows to move within it — the same pattern
                 the trail's outcome picker already uses. */
              tabIndex={on ? 0 : -1}
              className={`is-${TONE[t.id]} ${on ? 'is-on' : ''}`}
              onClick={() => pick(t.id)}
              onKeyDown={(e) => {
                const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key as 'ArrowRight']
                if (!d) return
                e.preventDefault()
                pick(TILES[(i + d + TILES.length) % TILES.length].id)
              }}
            >
              <Ico size={16} strokeWidth={1.9} aria-hidden />
              <strong>{t.label}</strong>
            </button>
          )
        })}
      </div>

      {rule.decision === 'deny' ? (
        !focus && <p className="bb__secnote">No prompt and no alternate path. A Deny here is final — the ML engine may escalate other decisions, never soften this one.</p>
      ) : (
        <>
          {unsatisfiable && (
            <p className="bb__diag is-error" role="alert">
              <XCircle size={13} strokeWidth={2} aria-hidden />
              <span>
                <b>Nobody can complete this.</b> No second-factor method is selected, so the rule cannot be satisfied.
              </span>
            </p>
          )}
          {rule.allowDisable2fa && rule.decision === '2fa' && (
            <p className="bb__diag is-warning">
              <AlertTriangle size={13} strokeWidth={2} aria-hidden />
              <span>
                <b>Users may opt out.</b> This rule asks for a second step and also lets people turn theirs off — anyone who does is no longer covered.
              </span>
            </p>
          )}

          <Prop label="First step">
            <Seg
              label="First factor"
              value={rule.firstFactor}
              options={[
                { value: 'Password', label: 'Password' },
                { value: 'Any', label: 'Any' },
                { value: 'Specific', label: 'Specific' },
              ]}
              onChange={(firstFactor) => onPatch({ firstFactor })}
            />
          </Prop>
          {rule.firstFactor === 'Specific' && (
            <Prop label="Which method" indent>
              <Picker label="First-factor method" value={rule.firstFactorMethod ?? ''} options={METHODS.map((m) => ({ value: m, label: m }))} onChange={(firstFactorMethod) => onPatch({ firstFactorMethod })} />
            </Prop>
          )}

          {rule.decision === '2fa' && (
            <>
              <Prop label="Second step" sub="How the person proves it is them">
                <Picker
                  label="Second factor"
                  value={rule.secondFactor}
                  options={[
                    { value: 'any', label: 'Any enrolled method' },
                    { value: 'specific', label: 'Specific methods' },
                    { value: 'chain', label: 'A chain, in order' },
                    { value: 'preferred', label: 'Their preferred method' },
                  ]}
                  onChange={(v) => onPatch({ secondFactor: v as Rule['secondFactor'] })}
                />
              </Prop>

              {rule.secondFactor === 'specific' && (
                <Prop label="Methods they may use" stack indent>
                  <span className="bb__chips" role="group" aria-label="Allowed second-factor methods">
                    {METHODS.map((m) => {
                      const on = methods.includes(m)
                      return (
                        <button key={m} type="button" className={`bb__chip ${on ? 'is-on' : ''}`} aria-pressed={on} onClick={() => onPatch({ secondFactorMethods: on ? methods.filter((x) => x !== m) : [...methods, m] })}>
                          {on && <Check size={11} strokeWidth={2.6} aria-hidden />}
                          {m}
                        </button>
                      )
                    })}
                  </span>
                </Prop>
              )}

              {rule.secondFactor === 'chain' && (
                <Prop label="Every step, in this order" stack indent>
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
                      Add a step
                    </button>
                  </div>
                </Prop>
              )}

              {rule.secondFactor === 'preferred' && (
                <Prop label="If they set no preference" indent>
                  <Picker label="Fallback method" value={rule.preferredFallback ?? ''} options={METHODS.map((m) => ({ value: m, label: m }))} onChange={(preferredFallback) => onPatch({ preferredFallback })} />
                </Prop>
              )}

              <Prop label="Skip the second step on a device that already passed">
                <Toggle checked={rule.rememberMfa} onChange={(rememberMfa) => onPatch({ rememberMfa })} label="Remember this device" size="sm" />
              </Prop>
              {rule.rememberMfa && (
                <>
                  <Prop label="Trust that device for" indent>
                    <span>
                      <input type="number" className="bb__input bb__input--num" min={1} max={365} aria-label="Days to remember" value={rule.rememberDays ?? 30} onChange={(e) => onPatch({ rememberDays: Number(e.target.value) || 30 })} />
                      <span className="bb__unit">days</span>
                    </span>
                  </Prop>
                  <Prop label="Ask every time anyway" sub="Even on a remembered device" indent>
                    <Toggle checked={rule.forceMfaEachLogin ?? false} onChange={(forceMfaEachLogin) => onPatch({ forceMfaEachLogin })} label="Ask every time anyway" size="sm" />
                  </Prop>
                </>
              )}

              <Prop label="Let people switch their own second step off">
                <Toggle checked={rule.allowDisable2fa} onChange={(allowDisable2fa) => onPatch({ allowDisable2fa })} label="Let users disable their second factor" size="sm" />
              </Prop>
            </>
          )}
        </>
      )}

      {!terminal && !focus && (
        <p className="bb__secnote" style={{ marginTop: 10 }}>
          Matched sign-ins stop here — {DECISION_NAME[rule.decision]} is the answer and nothing below runs.
          {next ? (
            <>
              {' '}
              Everyone else falls to rule {next.index + 1}, <b>{next.name}</b>.
            </>
          ) : (
            ' Everyone else falls to the default at the bottom.'
          )}
        </p>
      )}
    </div>
  )
}
