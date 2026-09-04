import { Fragment } from 'react'
import { PencilLine, Split } from 'lucide-react'

import { Button } from '../../kit'
import { conditionType, type Rule } from '../../data'
import { cardJoin, topJoin } from '../../predicate'
import type { NameLookup } from '../predicate-prose'
import { GROUP_TONE, groupIcon } from './tones'

/* -----------------------------------------------------------------------------
   The predicate, read rather than edited.

   The panel used to hold the whole condition editor. It does not any more —
   conditions are edited on the canvas, in one place, which is what "from one
   place only" asked for. What is left here has to be genuinely readable,
   because it is now the only view of the predicate that sits beside the rest of
   the rule: the name, the outcome and the settings a person changes in the same
   sitting.

   So this is not a summary and not a truncation. Every condition is drawn, with
   its value, grouped by branch and joined by the words the rule actually holds
   — read through `cardJoin` and `topJoin` rather than assumed, because the
   model spans four shapes and a readout that prints "or" between boxes is
   simply wrong on two of them.
   -------------------------------------------------------------------------- */

export function WhenReadout({ rule, resolve, onEdit }: { rule: Rule; resolve: NameLookup; onEdit: () => void }) {
  const cards = rule.when.cards
  const trunk = topJoin(rule.when)

  return (
    <div className="bb__readout">
      <div className="bb__readout__top">
        <span className="bb__readout__what">
          {cards.length === 0 ? 'Catches everything that reaches it' : `${count(rule)} across ${cards.length} branch${cards.length === 1 ? '' : 'es'}`}
        </span>
        <Button variant="secondary" size="sm" onClick={onEdit}>
          <PencilLine size={13} strokeWidth={2} aria-hidden /> Edit conditions
        </Button>
      </div>

      {cards.length === 0 ? (
        /* Not an empty state with a shrug. A rule with no conditions is not
           unfinished — it is a catch-all, which is the one shape that makes
           every rule below it unreachable, so it says what it does. */
        <p className="bb__readout__none">
          No conditions, so every sign-in that gets this far is decided here and nothing below it runs.
        </p>
      ) : (
        <div className="bb__readout__branches">
          {cards.map((k, i) => (
            <Fragment key={k.id}>
              {i > 0 && (
                <div className="bb__readout__trunk">
                  <b>{trunk}</b>
                </div>
              )}
              <div className={`bb__readout__branch ${k.grouped ? 'is-grouped' : ''}`}>
                <div className="bb__readout__head">
                  <Split size={11} strokeWidth={2} aria-hidden />
                  <span>{k.label || `Branch ${String.fromCharCode(65 + i)}`}</span>
                </div>
                {k.conditions.length === 0 ? (
                  <p className="bb__readout__empty">Empty, so this branch matches everything.</p>
                ) : (
                  k.conditions.map((c, j) => {
                    const t = conditionType(c.typeId)
                    const Ico = groupIcon(t.group)
                    const unset = c.values.filter(Boolean).length === 0
                    return (
                      <Fragment key={c.id}>
                        {j > 0 && <span className="bb__readout__join">{cardJoin(k)}</span>}
                        <div className={`bb__readout__cond is-tone-${GROUP_TONE[t.group] ?? 'neutral'}`}>
                          <i aria-hidden>
                            <Ico size={10} strokeWidth={2} />
                          </i>
                          <span className="bb__readout__label">{t.label}</span>
                          <em>{c.operator}</em>
                          <b className={unset ? 'is-unset' : ''}>{valueOf(c.typeId, c.values, resolve)}</b>
                        </div>
                      </Fragment>
                    )
                  })
                )}
              </div>
            </Fragment>
          ))}
        </div>
      )}
    </div>
  )
}

const count = (rule: Rule) => {
  const n = rule.when.cards.reduce((sum, k) => sum + k.conditions.length, 0)
  return `${n} condition${n === 1 ? '' : 's'}`
}

/* The same reading the card and the node use, so one condition says one thing
   everywhere it appears. */
function valueOf(typeId: string, values: string[], resolve: NameLookup) {
  const t = conditionType(typeId)
  if (values.filter(Boolean).length === 0) return 'Needs a value'
  if (t.valueKind === 'zone' || t.valueKind === 'fingerprint' || t.valueKind === 'hook' || t.valueKind === 'group' || t.valueKind === 'user') {
    return values.map((v) => resolve(t.valueKind as 'zone', v) ?? v).join(', ')
  }
  if (t.valueKind === 'time') return `${values[0] ?? '09:00'} – ${values[1] ?? '17:00'}`
  return values.join(', ')
}
