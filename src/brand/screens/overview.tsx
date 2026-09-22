import { useState } from 'react'
import { Asterisk, ListX, LogIn } from 'lucide-react'

import { Badge, Button, DecisionChip, Modal } from '../kit'
import { FALLBACK_NAME, fallbackRule, type AccessDecision, type Policy, type Rule } from '../data'
import { EmptyState } from '../empty'
import { shadowedBy, type Diagnostic } from './diagnostics'
import { predicateSentence, ruleLabel, whoSentence, type NameLookup } from './predicate-prose'

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

/* One renderer, shared with every other surface that prints a rule. This used
   to be a fifth private implementation of "condition, joiner, condition" — and
   like the others it flattened the joiners, so it printed the wrong predicate
   for any rule that mixed them.

   Who comes first and on its own, never inside the predicate, in the words
   `ruleIfLine` and the review's WHO / IF lines use: "For Finance, if in zone
   Office" · "For Finance, any sign-in" · "If in zone Office". */
function RuleLine({ rule, resolve }: { rule: Rule; resolve: NameLookup }) {
  const named = whoSentence(rule.who, resolve)
  /* Mid-sentence: "For everyone except Contractors", not "For Everyone …". */
  const who = named?.startsWith('Everyone') ? `everyone${named.slice('Everyone'.length)}` : named
  const p = rule.when
  const iff = p.cards.length === 0 ? null : predicateSentence(p, resolve)
  if (!who) {
    return <p>{iff ? <>If <em>{iff}</em></> : <em>Any login that reaches this rule</em>}</p>
  }
  return (
    <p>
      For <em>{who}</em>, {iff ? <>if <em>{iff}</em></> : 'any login'}
    </p>
  )
}

const tone = (d: AccessDecision) => (d === 'deny' ? 'deny' : d === '2fa' ? 'mfa' : 'allow')

export function PolicyOverview({
  open,
  policy,
  resolve,
  diagnostics,
  onClose,
  onJump,
}: {
  open: boolean
  policy: Policy
  resolve: NameLookup
  diagnostics: Diagnostic[]
  onClose: () => void
  onJump: (index: number) => void
}) {
  const [hover, setHover] = useState<number | null>(null)
  const fallback = policy.fallback ?? fallbackRule()
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
      width={780}
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
            <h3>A user attempts to log in</h3>
          </div>
        </article>

        {policy.rules.length === 0 && (
          <EmptyState compact icon={ListX} title="No rules yet" blurb="Every login gets the default outcome." />
        )}

        {policy.rules.length > 0 && (
        <ol className="bov__list">
          {policy.rules.map((r, i) => {
            const mine = diagnostics.filter((d) => d.ruleIndex === i)
            const hasErrors = mine.some((d) => d.severity === 'error')
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
                  <span className={`bov__n is-${tone(r.decision)}`}>
                    {i + 1}
                  </span>
                  <div>
                    <span className="bov__eyebrow">
                      Rule
                      {!r.enabled && <Badge tone="neutral">Off</Badge>}
                      {dead.has(i) ? (
                        <Badge tone="negative">Never runs</Badge>
                      ) : (
                        hasErrors && <Badge tone="negative">Needs fixing</Badge>
                      )}
                    </span>
                    <h3>{ruleLabel(r)}</h3>
                    <RuleLine rule={r} resolve={resolve} />
                  </div>
                  <DecisionChip decision={r.decision} size="sm" />
                </button>
              </li>
            )
          })}
        </ol>
        )}

        {/* The policy's own last rule, drawn like the rows above. It used to
            say one factor whatever the fallback did. */}
        <article className="bov__step is-fallback">
          <span className={`bov__n is-${tone(fallback.decision)}`} aria-hidden>
            <Asterisk size={14} strokeWidth={2} />
          </span>
          <div>
            <span className="bov__eyebrow">Otherwise</span>
            <h3>{FALLBACK_NAME}</h3>
            <p>
              If <em>no rule above matched</em>
            </p>
          </div>
          <DecisionChip decision={fallback.decision} size="sm" />
        </article>
      </div>
    </Modal>
  )
}
