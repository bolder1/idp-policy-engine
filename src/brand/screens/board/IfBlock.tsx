import { Fragment, type MouseEvent, type ReactNode } from 'react'
import { ArrowRight, Braces, Split, Users } from 'lucide-react'

import { isWho, whoEditable, whoIds } from '../../audience-ops'
import { AvatarStack } from './Avatar'
import { conditionType, type Condition, type Rule } from '../../data'
import { cardJoin, cardLetter, topJoin } from '../../predicate'
import type { NameLookup } from '../predicate-prose'
import { DECISION_NAME, TONE, journeyOf } from './model'
import { conditionIcon, conditionTone } from './tones'

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
  variant,
  muted,
  unset,
  title,
  ariaLabel,
  onClick,
  children,
}: {
  icon?: ReactNode
  tone?: string
  /* Which half of the sentence this is. The attribute names the axis and the
     value is the answer, and the editor already draws them at two weights —
     the card was drawing both identically, so a row of three chips gave no
     clue which one you would go and change. */
  variant?: 'attr' | 'val'
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
  const cls = `bb__ifchip ${tone ? `is-tone-${tone}` : ''} ${variant ? `is-${variant}` : ''} ${muted ? 'is-muted' : ''} ${unset ? 'is-unset' : ''}`
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

/* Everything that belongs UNDER a keyword.

   The card used to run its keywords inline with their content: `if` opened the
   first condition's row, `who` opened the avatar stack, and only `then` stood on
   a line of its own with its outcome indented beneath it. So of the three parts
   a rule has, one was drawn as a heading over a body and two were drawn as the
   first words of a sentence — and a five-condition rule read as five sibling
   lines with no sign that four of them were arguments to the first word on the
   first one.

   `then` had it right. All three do it now: the keyword takes a line, and what
   answers it is indented under a guide, so the shape of a rule is visible before
   any of it is read.

   The `└` elbow that used to mark the single indented row has gone with the
   change. It reads as "one thing follows"; the guide reads as "everything here
   belongs to the word above", which is what is true of all three sections and
   was never true of just the outcome. */
export function IfSub({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`bb__ifbody ${className ?? ''}`}>{children}</div>
}

/* How many values a card prints before the rest become a count.

   Four, the same cap the Who summary uses and for the same reason: a card is a
   SUMMARY, and a condition naming eleven zones filled three lines of it with
   names nobody reads at that size. The panel beside it lists all of them, which
   is where a list belongs. */
const VALUES = 4

/** The value(s) of a condition, as chips. */
function valueChips(c: Condition, resolve: NameLookup): { text: string; unset: boolean }[] {
  const t = conditionType(c.typeId)
  const vals = c.values.filter(Boolean)
  if (vals.length === 0) return [{ text: 'no value', unset: true }]
  if (t.valueKind === 'time') return [{ text: `${c.values[0] ?? '09:00'} – ${c.values[1] ?? '17:00'}`, unset: false }]
  if (t.valueKind === 'zone' || t.valueKind === 'fingerprint' || t.valueKind === 'group' || t.valueKind === 'user')
    return vals.map((v) => ({ text: resolve(t.valueKind as 'zone', v) ?? v, unset: false }))
  return vals.map((v) => ({ text: v, unset: false }))
}

/** One condition, read-only: [attribute] operator [value]… */
export function CondReadout({ c, resolve }: { c: Condition; resolve: NameLookup }) {
  const t = conditionType(c.typeId)
  const Ico = conditionIcon(t.id, t.group)
  const tone = conditionTone(t.id, t.group)
  const chips = valueChips(c, resolve)
  const shown = chips.slice(0, VALUES)
  const rest = chips.length - shown.length
  return (
    <>
      <IfChip tone={tone} variant="attr" icon={<Ico size={11} strokeWidth={2.2} />} title={t.group}>
        {t.label}
      </IfChip>
      <IfKw tone="op">{c.operator}</IfKw>
      {/* Four names, then how many more.

          Every value was a chip, so a condition naming eleven zones drew
          eleven — three wrapped lines inside a card whose whole job is to be
          read at a glance, and the eleventh name is no more useful than the
          fifth at that size. The overflow is honest about being a count: it
          says how many are not shown rather than trailing off, and the full
          list is on the chip's title and in the panel. */}
      {shown.map((v, i) => (
        <IfChip key={i} variant="val" unset={v.unset}>
          {v.text}
        </IfChip>
      ))}
      {rest > 0 && (
        <IfChip variant="val" title={chips.map((v) => v.text).join(', ')}>
          +{rest}
        </IfChip>
      )}
      {/* Which half of the zone, when it is narrower than the zone as written.

          A zone is an AND of a network section and a geographic one, and a
          condition can now ask about either alone. Two rules that differ only
          in that read as the same rule on the canvas without this — the one
          thing a card must never do — and the card is where somebody decides
          whether they need to open the panel at all. Absent when it is both,
          because that is what the zone already means. */}
      {c.scope && <IfKw tone="op">{c.scope === 'ip' ? 'on the network only' : 'by location only'}</IfKw>}
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

/* `ElseRow` stood here — the `else → Rule 3 · Executive step-up decides
   instead` line at the foot of every card.

   It is the arrow the chain draws BETWEEN two cards, printed again inside the
   first of them. On a scrolling form that repetition earned its place; on a
   canvas where the next card sits directly below and joined by a line, it is
   the same fact told twice, in the half of the card with the least room for
   it.

   `NextRule` stays exported. `Board` still works out which rule follows which,
   and the chain still draws it — that is the version of this fact that was
   worth keeping. */

/* --- The read-only block, for the card ------------------------------------- */

export function IfBlock({ rule, resolve, token, terminal }: { rule: Rule; resolve: NameLookup; token?: ReactNode; terminal?: boolean }) {
  /* The who-conditions are drawn by the card's own `Who` button now, not here
     among the circumstances.

     This is the correctness fix the split owes. `WhenEditor` has hidden them
     from the If list since groups became a step of their own, while this went
     on drawing them as conditions — one rule described two ways, on two
     surfaces that are on screen together, which is the exact thing the comment
     below says a card must never do.

     Same predicate, so the card, the Condition editor and the Who pane cannot
     disagree about which rows belong to which question. On an OR predicate they
     come back, because then this is the only place they can be seen — and a
     card left with no conditions at all is dropped rather than drawn as an
     empty bracket. `whoEditable` is only true for a single AND-run, so the
     filtering can never renumber an alternative's letter. */
  const cards = whoEditable(rule.when)
    ? rule.when.cards
        .map((k) => ({ ...k, conditions: k.conditions.filter((c) => !isWho(c)) }))
        .filter((k) => k.conditions.length > 0)
    : rule.when.cards
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

  /* The who, as the first row of the reading.

     The card printed `if … then … else` and never said who the rule was about,
     because the who-conditions were being drawn among the circumstances — where
     they read as one more thing to check rather than as the subject. Filtering
     them out of the `if` list left the card silent about them, which is worse:
     the fact did not move, it vanished.

     So it gets a row of its own, in the same shape as `if` and `then`, above
     both. Only when the pane can own it — on an OR-shaped rule the who belongs
     to each alternative and is drawn inside them, exactly as it was. */
  const whoNames = whoEditable(rule.when)
    ? [
        ...whoIds(rule.when, 'group').map((id) => resolve('group', id) ?? id),
        ...whoIds(rule.when, 'user').map((id) => resolve('user', id) ?? id),
      ]
    : []

  /* Nothing is drawn until it has been ANSWERED.

     A rule you had just added carried four rows and eleven words before you
     touched it: `who everyone`, `if any sign-in reaches it`, `then Let in,
     then verify · Password → Any enrolled method → Signed in`, and an `else`
     naming the default. Every one of those was a DEFAULT reported as though it
     were a decision — so the emptiest rule on the board was also the busiest
     card on it, and the card whose whole job is to say what a rule does was
     saying it loudest about the rule that does nothing.

     They appear in the order a rule is written: who, then the circumstances,
     and the outcome LAST, once there is something for it to be the outcome of.
     A `then` above two blank rows answers a question nobody has asked yet. */
  const hasWho = whoNames.length > 0
  const hasIf = cards.length > 0
  const configured = hasWho || hasIf

  return (
    <div className="bb__if">
      {!configured && (
        /* One quiet line rather than a skeleton of the rule. The two doors that
           fix it are on the panel, which this card opens. */
        <div className="bb__ifrow">
          <span className="bb__ifkw is-blank">Nothing set yet</span>
        </div>
      )}
      {hasWho && (
        <>
          <div className="bb__ifrow">
            <span className="bb__ifbranch" aria-hidden>
              <Users size={12} strokeWidth={2} />
            </span>
            <span className="bb__ifkw">who</span>
          </div>
          {/* A stack, not a chip per name. It was one chip each, which is four
              lines of them at eighteen people inside a rule somebody is trying
              to read at a glance — and a real tenant has thousands. Five marks,
              the first name in words and a count: the same width whatever it
              holds. */}
          <IfSub className="bb__ifwho">
            <AvatarStack names={whoNames} />
          </IfSub>
        </>
      )}
      {hasIf && (
        <div className="bb__ifrow">
          <span className="bb__ifbranch" aria-hidden>
            <Split size={12} strokeWidth={2} />
          </span>
          <IfKw>if</IfKw>
        </div>
      )}
      {hasIf && (
        <div className="bb__ifbody">
        {cards.map((k, i) => {
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
          <Fragment key={k.id}>
            {/* The RULE's operator, between the members it joins — outside the
                group, because it is not the group's.

                It was drawn as the first keyword INSIDE the group's box, which
                put the word that says how this bracket joins the one above it
                in the one place that reads as part of this bracket. On a rule
                with two groups the card said `(AND … OR …)` where the AND
                belonged to neither.

                Its own row, at the group's left edge, in the gap — which is
                where the editor puts it too, so the two surfaces draw one
                operator in one place. */}
            {i > 0 && (
              <div className="bb__ifrow bb__ifjoin">
                <IfKw tone={top}>{top}</IfKw>
              </div>
            )}
            {/* A frame means a group somebody MADE, and this drew one round
                every card unconditionally — so a rule whose conditions were
                simply typed one after another came back wearing a bracket its
                author had not asked for. The editor has told these two states
                apart since groups became a thing; the card went on showing them
                the same, which meant the canvas and the panel described the
                same rule differently.

                `grouped` is the field that says which is which, and it is
                exactly what it is for. */}
            <div className={k.grouped ? 'bb__ifgroup' : 'bb__ifplain'}>
            {/* The group's name, on the card, in words.

                It was a `title` attribute — invisible, unreachable by keyboard,
                and gone on touch. Meanwhile the editor beside this card draws
                the same group with a visible heading and its operator in
                words, so the two surfaces described one group two ways and
                only one of them could be read. `Group A` is the fallback the
                linter and the change log already use. */}
            {k.grouped && (
              <div className="bb__ifgrouptag">
                <Braces size={10} strokeWidth={2.2} aria-hidden />
                <b>{k.label?.trim() || `Group ${cardLetter(i)}`}</b>
                {/* `· all must match` stood here and has gone with the change
                    above it. Every gap inside this box now carries the operator
                    on a line of its own, so the caption was the third telling of
                    one fact — said once in the heading, then again in each of
                    the group's internal joins. The heading names the group; the
                    joins say how it holds together. */}
              </div>
            )}
            {k.conditions.map((c, j) => (
              /* Each condition is its own row with its own edge, rather than a
                 line in an undivided block. Reading a five-condition rule off
                 the card meant finding where one ended and the next began in a
                 run of chips of whatever width their contents happened to be —
                 the operator that starts each row is the only mark, and at
                 11px it is easy to lose. A rule per row makes the count
                 readable at a glance, which is the whole job of the card. */
              <Fragment key={c.id}>
                {/* The operator between two conditions, on a line of its own.

                    It used to be the first word of the SECOND one's row, which
                    made `and` a property of the condition after it. It is not:
                    `and` joins the two and belongs to neither, and this is the
                    same misattribution that was fixed one level up when the
                    rule's own operator was lifted out of the group box it was
                    being drawn inside. Both levels are drawn the same way now,
                    which is also how the editor beside this card draws them.

                    Two things fall out of it. Every condition row now starts
                    with its attribute glyph at the same x, so the guide line
                    has one hard edge under it instead of one that jogged in on
                    every row after the first. And an operator can no longer
                    wrap: a five-chip condition that ran onto a second line used
                    to leave the `and` stranded above a fragment of the
                    condition it introduced.

                    `is-run` is what keeps the two levels apart. The operator
                    between MEMBERS carries a hairline out to the block's right
                    edge, because a member boundary is the bigger break; the
                    operator between conditions of one member is the bare pill.
                    One mark per level, which is what the hairline in every gap
                    was removed for. */}
                {j > 0 && (
                  <div className="bb__ifrow bb__ifjoin is-run">
                    <IfKw tone={join}>{join}</IfKw>
                  </div>
                )}
                <div className="bb__ifrow is-cond">
                  <CondReadout c={c} resolve={resolve} />
                </div>
              </Fragment>
            ))}
          </div>
          </Fragment>
          )
        })}
        </div>
      )}
      {/* The outcome, last, and only once there is something above it to be
          the outcome OF. */}
      {configured && <ActionRow rule={rule} token={token} />}
    </div>
  )
}
