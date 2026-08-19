import { useState } from 'react'
import { AlertTriangle, Check, LogIn } from 'lucide-react'

import { Button, DecisionChip, Modal } from '../kit'
import { conditionType, type Policy } from '../data'
import { shadowedBy, type Diagnostic } from './diagnostics'
import type { SimEnv } from './simulate'

/* -----------------------------------------------------------------------------
   Reading the policy.

   v3's numbered steps were the best thing about it and its worst decision was
   making them an editing surface — a rule in this model is ~1,400px of form,
   and opening that inside the sequence pushes the sequence off screen. Split
   the two jobs and both get better: the order rail picks a rule, and this reads
   the policy end to end.

   Read-only on purpose. Nothing here writes, so nothing here needs a save bar,
   a dirty check or a form; the whole surface can be given over to the one thing
   it is for, which is seeing the sequence as a sequence. The only interaction
   is "take me to that rule", because the moment you want to change something
   you want the form, not this.

   The shadow toggle is the reason this exists at all. First-match-wins means a
   broad rule silently kills every narrower rule beneath it, and that is a
   property of the SEQUENCE — invisible while you are looking at any one rule.
   -------------------------------------------------------------------------- */

function predicate(policy: Policy, index: number, env: SimEnv): string {
  const r = policy.rules[index]
  if (r.conditions.length === 0) return 'everyone who reaches it'
  return r.conditions
    .map((c, i) => {
      const t = conditionType(c.typeId)
      const shown =
        t.valueKind === 'zone'
          ? c.values.map(env.zoneName).join(', ')
          : t.valueKind === 'fingerprint'
            ? c.values.map(env.fingerprintName).join(', ')
            : t.valueKind === 'time'
              ? c.values.filter(Boolean).join('–')
              : c.values.filter(Boolean).join(', ')
      const body = `${t.label} ${c.operator} ${shown || '…'}`
      return i === 0 ? body : `${c.joiner} ${body}`
    })
    .join(' ')
}

export function PolicyOverview({
  open,
  policy,
  env,
  diagnostics,
  onClose,
  onJump,
}: {
  open: boolean
  policy: Policy
  env: SimEnv
  diagnostics: Diagnostic[]
  onClose: () => void
  onJump: (index: number) => void
}) {
  const [hover, setHover] = useState<number | null>(null)
  const shadowed = hover === null ? [] : shadowedBy(policy, hover)

  /* Every rule that is out of reach from ANY rule above it, not just the one
     under the cursor. Hovering explains a single relationship; this marks the
     ones that are dead no matter where you are looking. */
  const dead = new Set<number>()
  policy.rules.forEach((_, i) => shadowedBy(policy, i).forEach((j) => dead.add(j)))

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={policy.name}
      width={720}
      padded={false}
      footer={
        <>
          <span className="bov__foot">
            Evaluated top to bottom, first match wins. Hover a rule to see what it puts out of reach.
          </span>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      <div className="bov">
        <article className="bov__step is-trigger">
          <span className="bov__n is-trigger" aria-hidden>
            <LogIn size={14} strokeWidth={1.9} />
          </span>
          <div>
            <span className="bov__eyebrow">Trigger</span>
            <h3>A user attempts to sign in</h3>
          </div>
        </article>

        {policy.rules.length === 0 && (
          <p className="bov__empty">
            No rules. Every sign-in falls straight through to the engine default.
          </p>
        )}

        <ol className="bov__list">
          {policy.rules.map((r, i) => {
            const mine = diagnostics.filter((d) => d.ruleIndex === i)
            const errors = mine.filter((d) => d.severity === 'error')
            return (
              <li key={r.id}>
                <button
                  type="button"
                  className={`bov__step ${r.enabled ? '' : 'is-off'} ${shadowed.includes(i) ? 'is-dimmed' : ''} ${dead.has(i) ? 'is-dead' : ''}`}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  onClick={() => onJump(i)}
                >
                  <span className={`bov__n is-${r.decision === 'deny' ? 'deny' : r.decision === '2fa' ? 'mfa' : 'allow'}`}>
                    {i + 1}
                  </span>
                  <div>
                    <span className="bov__eyebrow">
                      Rule {i + 1}
                      {!r.enabled && <b className="bov__tag">off</b>}
                      {dead.has(i) && <b className="bov__tag is-dead">never runs</b>}
                      {errors.length > 0 && (
                        <b className="bov__tag is-error">
                          <AlertTriangle size={10} strokeWidth={2.4} aria-hidden />
                          {errors.length}
                        </b>
                      )}
                    </span>
                    <h3>{r.name}</h3>
                    <p>
                      When <em>{predicate(policy, i, env)}</em>
                    </p>
                    {r.description && <p className="bov__why">{r.description}</p>}
                  </div>
                  <DecisionChip decision={r.decision} size="sm" />
                </button>
              </li>
            )
          })}
        </ol>

        <article className="bov__step is-fallback">
          <span className="bov__n is-allow" aria-hidden>
            <Check size={14} strokeWidth={2.2} />
          </span>
          <div>
            <span className="bov__eyebrow">Otherwise</span>
            <h3>Everyone else signs in on one factor</h3>
            <p>The engine default. It cannot be removed or reordered.</p>
          </div>
        </article>
      </div>
    </Modal>
  )
}
