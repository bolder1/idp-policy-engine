import { Fragment, type MouseEvent, type ReactNode } from 'react'
import { ArrowRight, CornerDownRight, Split } from 'lucide-react'

import { conditionType, type Condition, type Rule } from '../../data'
import { cardJoin, topJoin } from '../../predicate'
import type { NameLookup } from '../predicate-prose'
import { DECISION_NAME, TONE, journeyOf } from './model'
import { GROUP_TONE, groupIcon } from './tones'

/* -----------------------------------------------------------------------------
   The rule, as a conditional.

   Figma's prototype conditional is the grammar administrators already read:

       ⑂ if   [value] != [value]
          └   Set …
       else
          └   Add action

   A rule IS that shape — if these things are true, decide this; else the next
   rule gets it — so it is drawn that way, once, and used by the card on the
   board and the editor in the inspector. The block is a dark surface on
   purpose: it is logic, and logic reads as code.
   -------------------------------------------------------------------------- */

/** The rule that inherits a sign-in this one lets past. Null is the default. */
export type NextRule = { index: number; name: string } | null

export function IfKw({ children, tone }: { children: ReactNode; tone?: 'and' | 'or' | 'op' }) {
  return <span className={`bb__ifkw ${tone ? `is-${tone}` : ''}`}>{children}</span>
}

export function IfChip({
  icon,
  tone,
  muted,
  unset,
  title,
  ariaLabel,
  onClick,
  children,
}: {
  icon?: ReactNode
  tone?: string
  muted?: boolean
  unset?: boolean
  title?: string
  /* Required in spirit whenever `onClick` deletes something.

     A value chip's text is the value, so a chip that removes "Engineering" on
     press announced itself as "Engineering" — the name of the thing, with no
     hint that pressing it destroys it. The visible text stays the value; the
     accessible name says what the button does to it. */
  ariaLabel?: string
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void
  children: ReactNode
}) {
  const cls = `bb__ifchip ${tone ? `is-tone-${tone}` : ''} ${muted ? 'is-muted' : ''} ${unset ? 'is-unset' : ''}`
  if (onClick)
    return (
      <button type="button" className={cls} title={title} aria-label={ariaLabel} onClick={onClick}>
        {icon && <i aria-hidden>{icon}</i>}
        {children}
      </button>
    )
  return (
    <span className={cls} title={title}>
      {icon && <i aria-hidden>{icon}</i>}
      {children}
    </span>
  )
}

/** A row indented under a keyword, with the └ connector. */
export function IfSub({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={`bb__ifsub ${className ?? ''}`}>
      <span className="bb__ifelbow" aria-hidden>
        <CornerDownRight size={12} strokeWidth={2} />
      </span>
      {children}
    </div>
  )
}

/** The value(s) of a condition, as chips. */
function valueChips(c: Condition, resolve: NameLookup): { text: string; unset: boolean }[] {
  const t = conditionType(c.typeId)
  const vals = c.values.filter(Boolean)
  if (vals.length === 0) return [{ text: 'no value', unset: true }]
  if (t.valueKind === 'time') return [{ text: `${c.values[0] ?? '09:00'} – ${c.values[1] ?? '17:00'}`, unset: false }]
  if (t.valueKind === 'zone' || t.valueKind === 'fingerprint' || t.valueKind === 'hook' || t.valueKind === 'group' || t.valueKind === 'user')
    return vals.map((v) => ({ text: resolve(t.valueKind as 'zone', v) ?? v, unset: false }))
  return vals.map((v) => ({ text: v, unset: false }))
}

/** One condition, read-only: [attribute] operator [value]… */
export function CondReadout({ c, resolve }: { c: Condition; resolve: NameLookup }) {
  const t = conditionType(c.typeId)
  const Ico = groupIcon(t.group)
  const tone = GROUP_TONE[t.group] ?? 'neutral'
  return (
    <>
      <IfChip tone={tone} icon={<Ico size={9} strokeWidth={2.2} />} title={t.group}>
        {t.label}
      </IfChip>
      <IfKw tone="op">{c.operator}</IfKw>
      {valueChips(c, resolve).map((v, i) => (
        <IfChip key={i} unset={v.unset}>
          {v.text}
        </IfChip>
      ))}
    </>
  )
}

/** The rule's consequence, in its tone, under a `then` that matches the `if`. */
export function ActionRow({ rule, token, control }: { rule: Rule; token?: ReactNode; control?: ReactNode }) {
  const journey = journeyOf(rule)
  return (
    <>
      {/* The word, said out loud.

          The consequence hung off an unlabelled `└` while the conditions above
          it were introduced by `if` and the fall-through below by `else`. Two
          of the three keywords in a conditional were written and the middle one
          was a glyph — so the card read "if … ⟶ something … else", and the
          "something" was the only part that says what the rule DOES. */}
      <div className="bb__ifrow">
        <IfKw>then</IfKw>
      </div>
      <IfSub className="bb__ifaction">
        {token}
        {control ?? <IfChip tone={TONE[rule.decision]}>{DECISION_NAME[rule.decision]}</IfChip>}
        <span className="bb__ifjourney" aria-label="The sign-in journey this produces">
          {journey.map((s, i) => (
            <Fragment key={s.id}>
              {i > 0 && <ArrowRight size={10} strokeWidth={2} aria-hidden />}
              {/* The second line of a step, which this used to drop on the floor.

                  `journeyOf` has always returned a `sub` for five of its steps —
                  "No prompt, no way round", "every step, in order", "on this
                  device", "else TOTP", "cannot be completed" — and this map read
                  `label` only. That was survivable while the inspector drew the
                  same journey underneath the decision tiles, because its copy
                  rendered both halves. The inspector's copy has gone, so this is
                  the only renderer left, and a step whose sub is dropped here is
                  a sentence the product no longer says anywhere.

                  The costly one is "cannot be completed". A rule asking for a
                  specific second factor with no method chosen reads as "Nothing
                  chosen" without it — which sounds like an empty field rather
                  than what it is, a rule that can never fire. */}
              <span>
                {s.label}
                {s.sub && <em className="bb__ifjsub">{s.sub}</em>}
              </span>
            </Fragment>
          ))}
          </span>
      </IfSub>
    </>
  )
}

export function ElseRow({ next, onJump }: { next: NextRule; onJump?: (i: number) => void }) {
  return (
    <>
      <div className="bb__ifrow">
        <IfKw>else</IfKw>
      </div>
      <IfSub>
        <IfChip muted icon={<ArrowRight size={10} strokeWidth={2.2} />} onClick={next && onJump ? () => onJump(next.index) : undefined}>
          {next ? `Rule ${next.index + 1} · ${next.name}` : 'Nothing else matched · the default'}
        </IfChip>
        <span className="bb__ifjourney">{next ? 'decides instead' : 'decides'}</span>
      </IfSub>
    </>
  )
}

/* --- The read-only block, for the card ------------------------------------- */

export function IfBlock({ rule, next, resolve, token, terminal }: { rule: Rule; next: NextRule; resolve: NameLookup; token?: ReactNode; terminal?: boolean }) {
  const cards = rule.when.cards
  const top = topJoin(rule.when)
  if (terminal)
    return (
      <div className="bb__if">
        <div className="bb__ifrow">
          <span className="bb__ifbranch" aria-hidden>
            <Split size={12} strokeWidth={2} />
          </span>
          <IfKw>always</IfKw>
          <span className="bb__ifjourney">— whatever reached this far</span>
        </div>
        <ActionRow rule={rule} token={token} />
      </div>
    )

  return (
    <div className="bb__if">
      {cards.length === 0 ? (
        <div className="bb__ifrow">
          <span className="bb__ifbranch" aria-hidden>
            <Split size={12} strokeWidth={2} />
          </span>
          <IfKw>if</IfKw>
          <IfChip muted>any sign-in reaches it</IfChip>
        </div>
      ) : (
        cards.map((k, i) => {
          /* Read, not assumed.

             These were the literals 'or' between cards and 'and' inside one,
             which was correct only while those were the only joiners the model
             could hold. Once the editor could flip either, the card on the
             stage went on printing the old words — so the same rule read
             `A and B or C` here and `A or B and C` in the panel beside it.
             A card that disagrees with the editor about the rule it is showing
             is worse than a card that shows less. */
          const join = cardJoin(k)
          return (
          <div key={k.id} className="bb__ifgroup" title={k.label}>
            {k.conditions.map((c, j) => (
              <div key={c.id} className="bb__ifrow">
                {j === 0 ? (
                  <>
                    {i === 0 && (
                      <span className="bb__ifbranch" aria-hidden>
                        <Split size={12} strokeWidth={2} />
                      </span>
                    )}
                    <IfKw tone={i === 0 ? undefined : top}>{i === 0 ? 'if' : top}</IfKw>
                  </>
                ) : (
                  <IfKw tone={join}>{join}</IfKw>
                )}
                <CondReadout c={c} resolve={resolve} />
              </div>
            ))}
          </div>
          )
        })
      )}
      <ActionRow rule={rule} token={token} />
      <ElseRow next={next} />
    </div>
  )
}
