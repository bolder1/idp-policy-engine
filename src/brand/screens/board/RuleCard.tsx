import { AnimatePresence, motion } from 'motion/react'
import { useId, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import {
  ArrowRight,
  ArrowUpRight,
  Asterisk,
  Braces,
  Check,
  ChevronsDownUp,
  ChevronsUpDown,
  GripVertical,
  Lock,
  Minus,
  Split,
  Users,
  X,
} from 'lucide-react'

import { type Rule } from '../../data'
import { FaceStack, type FaceItem } from '../../faces'
import { RowMenu, Toggle } from '../../kit'
import { ruleMenu } from './rule-menu'
import { cardJoin, cardLetter, leafCount, topJoin } from '../../predicate'
import { hasWho, normaliseWho, whoSummary } from '../../rule-who'
import type { NameLookup } from '../predicate-prose'
import type { RuleState } from '../rule-form'
import type { CardState } from '../testing/evidence'
import type { CardTone } from '../testing/trace-pills'
import { useCardHighlighted, type CardHighlight } from './card-highlight'
import { DECISION_NAME, TONE, type Part } from './model'
import { ActionRow, CondReadout, IfBlock, IfChip, IfKw } from './IfBlock'
import { isPristine, stateLabel } from './parts'

/* -----------------------------------------------------------------------------
   A card on the chain — one rule, read whole, or read short.

   Zapier's card shows an app mark, a number and a name, and hides what the
   step does behind a click. A rule cannot afford that by default: what it
   checks and what it decides ARE the rule, and a chain of five names says
   nothing about which sign-in falls where. So the card reads its WHEN as
   brackets and its THEN as the journey the person will walk, at a size you can
   scan at 70% zoom.

   But "read whole" stops paying at about six rules. A policy of eight, each
   with four conditions, is a column taller than any screen — and the question
   you have at that point is usually the ORDER, not the contents: which rule
   catches this before that one. Reading the order should not mean scrolling
   past everything you are not asking about.

   So the body folds. Collapsed, the card keeps its number, its name and its
   state, and trades the brackets for one line saying how many
   conditions there are and what they decide — enough to keep the chain
   readable as a chain. Expanded, it is the card it always was.

   The fold is CSS, not Motion, and that is deliberate: `grid-template-rows`
   from `0fr` to `1fr` animates height without measuring anything, so the
   siblings below simply reflow — no projection, no snapshot, nothing for the
   chain's own `layout` animation to fight. See the note on `.bb__fold`. */


/* The card in one line, for when the body is folded away.

   It says the two things the brackets would have said and the head does not:
   how much test there is, and what the test decides. A count rather than the
   conditions themselves, because the point of folding is to stop reading them
   — and "3 conditions" is still enough to tell a broad rule from a narrow one
   while you are scanning for order.

   Two kinds of card fold, and only one of them can be empty by accident. An
   ordinary rule with no who and no conditions is a rule nobody has finished
   writing, and the line says so. The default's predicate is empty because the
   default's test was never written in a predicate at all — so the same silence
   means the opposite thing there, and the two are told apart before anything
   is counted. */
function CardSummary({ rule, resolve, terminal }: { rule: Rule; resolve?: NameLookup; terminal?: boolean }) {
  /* The default, which has no conditions and never will.

     `fallbackRule` builds it on the always-true predicate and the builder never
     offers to edit it — "everything above missed" is a position in the list,
     not something anybody could write in a condition card. So the reading
     below found no who and no conditions, concluded the rule was unconfigured,
     and printed "Nothing set yet" on the one row whose outcome is always set.
     Folded, the default read "Nothing else matched / Nothing set yet" under a
     head saying "Always on" and "Locked", and over a body saying "always". One
     card, three parts, one of them denying the other two.

     What it says now is what the body says, in the shape every folded card
     uses: the branch mark, what is tested, an arrow, what is decided. `always`
     takes the count's place because that IS the test here, and the decision
     chip is the one of the three facts the head has not already given you.

     `terminal` rather than a check for "no conditions", and it is the same prop
     `IfBlock` takes for the same reason: this is not a rule that happens to be
     empty, it is the rule whose condition is where it sits. */
  if (terminal)
    return (
      <div className="bb__cardsum">
        <span className="bb__ifbranch" aria-hidden>
          <Split size={11} strokeWidth={2} />
        </span>
        <IfKw>always</IfKw>
        <ArrowRight size={11} strokeWidth={2} aria-hidden />
        <IfChip tone={TONE[rule.decision]}>{DECISION_NAME[rule.decision]}</IfChip>
      </div>
    )

  /* Every condition in the WHEN. People and groups are the rule's `who`, not
     conditions, so they are never in this count. */
  const n = leafCount(rule.when)
  /* From `rule.who`, whatever shape the cards have, and nothing for everyone. */
  const who = hasWho(rule.who) ? whoSummary(rule.who, (kind, id) => resolve?.(kind, id), 2) : ''
  /* The same rule the expanded body follows: nothing is reported until it has
     been answered.

     This line said "everyone · any sign-in → Let in, then verify" on a rule
     somebody had just added — three defaults read back as decisions, and the
     folded card contradicting its own body, which said "Nothing set yet" two
     pixels below. Whichever of the two you believed, the card was wrong. */
  const configured = who !== '' || n > 0

  /* Untouched: nothing to report. Answered with no who and no conditions — an
     outcome chosen on a new rule, say — it catches every sign-in that reaches
     it, and the line says that rather than "Nothing set yet". */
  if (!configured && isPristine(rule)) {
    return (
      <div className="bb__cardsum">
        <span className="bb__ifkw is-blank">Nothing set yet</span>
      </div>
    )
  }
  if (!configured) {
    return (
      <div className="bb__cardsum">
        <span className="bb__ifbranch" aria-hidden>
          <Split size={11} strokeWidth={2} />
        </span>
        <span className="bb__cardsum__n">Every sign-in</span>
        <ArrowRight size={11} strokeWidth={2} aria-hidden />
        <IfChip tone={TONE[rule.decision]}>{DECISION_NAME[rule.decision]}</IfChip>
      </div>
    )
  }

  return (
    <div className="bb__cardsum">
      {/* Who first, because it is the subject — and only when there is one.
          A folded card said how much test there was and what it decided, and
          never who it was about, which is the one of the three you cannot
          infer from the others. */}
      {who !== '' && (
        <>
          <Users size={11} strokeWidth={2} aria-hidden />
          <span className="bb__cardsum__n">{who}</span>
        </>
      )}
      {n > 0 && (
        <>
          <span className="bb__ifbranch" aria-hidden>
            <Split size={11} strokeWidth={2} />
          </span>
          <span className="bb__cardsum__n">{`${n} condition${n === 1 ? '' : 's'}`}</span>
        </>
      )}
      <ArrowRight size={11} strokeWidth={2} aria-hidden />
      <IfChip tone={TONE[rule.decision]}>{DECISION_NAME[rule.decision]}</IfChip>
    </div>
  )
}

/* Try a sign-in's reading of one card (try-sign-in.ts builds it, Board draws
   it, Policy testing V4 §2.3): a row of check pills under the head, the
   rule's outcome and its standing word on the head's right, the marker when
   it stands here, and the card's tone — lit where the sign-in matched, missed
   where it was asked and did not, dim where it never came. The card's body
   stays folded in test mode — the pills are what is being read. */
export interface CardRoute {
  state: CardState
  /** Null while the marker has not reached the card on a run that travels. */
  tone: CardTone | null
  /** The check pills, one per condition. */
  checks: ReactNode
  /** The outcome pill and the grey standing word, on the head's right. */
  head: ReactNode
  /** The marker, when it stands on this card. */
  marker?: ReactNode
}

/* Blue edge where the marker stands; the tone's class for trace.css. A rule
   that is switched off is already drawn as one (`is-off`). */
const routeClass = (route: CardRoute | undefined): string =>
  !route ? '' : `is-routed${route.marker ? ' is-marked' : ''}${route.tone ? ` is-${route.tone}` : ''}`

export function RuleCard({
  rule,
  index,
  openPart,
  state,
  stateNote,
  unreachable = false,
  route,
  shadowed,
  dragging,
  expanded,
  resolve,
  canUp,
  canDown,
  onOpen,
  onToggleExpand,
  onToggle,
  onMove,
  onDuplicate,
  onDelete,
  onGrip,
  onHover,
  cardRef,
  flash = false,
  source,
  traced = false,
  highlight,
}: {
  rule: Rule
  index: number
  /* Which part of this rule the panel is showing, or null when this card does
     not own the panel. One prop rather than a boolean and a part: `selected`
     is derived from it below, so nothing in the render path can claim the card
     is selected while naming no part. */
  openPart: Part | null
  state: RuleState
  /** Why the pill says what it does — the first finding's title. Shown on hover. */
  stateNote?: string
  /** Another rule always matches first, so this one never runs. */
  unreachable?: boolean
  /** Try a sign-in's reading of this card, while the board is in test mode. */
  route?: CardRoute
  shadowed: boolean
  dragging: boolean
  /** Whether the WHEN/THEN body is unfolded. Owned by the host, not the card. */
  expanded: boolean
  resolve: NameLookup
  canUp: boolean
  canDown: boolean
  onOpen: (part: Part) => void
  onToggleExpand: () => void
  onToggle: (on: boolean) => void
  onMove: (dir: -1 | 1) => void
  onDuplicate: () => void
  onDelete: () => void
  onGrip: (e: ReactPointerEvent<HTMLElement>) => void
  onHover: (on: boolean) => void
  cardRef: (el: HTMLDivElement | null) => void
  /** Shown from a guard page: an outline that fades. CSS only — this is a motion element. */
  flash?: boolean
  /* The words this card was written from, by Describe it — shown under the
     title until the policy is next saved (describe spec, §3.8). */
  source?: string
  /** An answer in Describe it that wrote this card is under the pointer: a 1px ring, border only. */
  traced?: boolean
  /** Test mode: the card a hovered row in the test panel lands on (card-highlight.ts). */
  highlight?: CardHighlight
}) {
  const tone = TONE[rule.decision]
  const titleId = `bb-rule-${rule.id}-title`
  const ringed = useCardHighlighted(highlight, rule.id) || traced
  const selected = openPart !== null
  /* The ⋯ menu is open: holds the trail out while the pointer is in the menu. */
  const [menuOpen, setMenuOpen] = useState(false)
  const kindClass = routeClass(route)

  return (
    <motion.div
      ref={cardRef}
      /* No `layout` here any more. The wrapper in Board owns this card's place
         in the chain and animates it; a second projection on the child fought
         the first — each measured a position the other was mid-way through
         changing, which is the small shiver a reorder used to end on. One
         element animates the move, and it is the one that moves. */
      className={`bb__card is-${tone} ${expanded ? 'is-open' : ''} ${selected ? 'is-selected' : ''} ${rule.enabled ? '' : 'is-off'} ${shadowed ? 'is-shadowed' : ''} ${dragging ? 'is-dragging' : ''} ${menuOpen ? 'is-menu' : ''} ${flash ? 'is-flash' : ''} ${ringed ? 'is-traced' : ''} ${kindClass}`}
      /* No style prop while dragging, deliberately. Board writes this element's
         transform directly on every pointer move; a `style` React manages would
         be reset to a stale offset on the next re-render, which is the classic
         "card snaps back mid-drag". `layout` is off for the same reason —
         Motion must not own this transform while the pointer does. */
      /* Not a button, and not focusable.

         It was `role="button" tabIndex={0}` with an Enter/Space handler, which
         cost more than it bought. A role of button makes every descendant
         presentational, so the six real controls inside — move up, move down,
         duplicate, delete, the on/off switch and the grip — were announced as
         nothing at all; and the Enter/Space handler ran on events that had
         bubbled up from those controls, so pressing Delete with the keyboard
         selected the card instead of deleting the rule. Six controls were
         unreachable to make one gesture reachable.

         The clickable surface stays — a pointer can still select a rule by
         hitting anywhere on it — but the keyboard path is the title button in
         the head, which is a real button, in the tab order, and announces the
         rule it opens. `aria-labelledby` keeps the group named for anyone
         arrowing through the region. */
      role="group"
      aria-labelledby={titleId}
      /* Clicking the card opens Who. It is what was asked for, and it is what
         the panel already argues for itself: writing a rule starts with a
         person, and the form used to open on the second clause. */
      onClick={() => onOpen('who')}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      data-index={index}
    >
      {route?.marker}
      <div className="bb__cardhead">
        {/* The index is the grip. It is the one thing on the card that says
            "this is a position", so it is the thing you drag to change it.

            The two are drawn in two places. The number stays in the head, where
            it is the rule's position and is worth reading at rest; the grip
            appears OUTSIDE the card's left edge on hover, where a handle
            belongs and where it is not covering the thing it moves. They are
            one button, so there is one drag handler, one accessible name and
            one keyboard target — the arrow keys still reorder from either. */}
        <button
          type="button"
          className="bb__idx"
          aria-label={`Reorder rule ${index + 1} — drag, or use the arrow keys`}
          onPointerDown={(e) => {
            e.stopPropagation()
            onGrip(e)
          }}
          onClick={(e) => e.stopPropagation()}
          /* `window` owns the arrows on this board, so a control that handles
             one has to stop it as well as prevent it. Without the stop this
             fired `onMove` AND the board's own `pick` on a single keypress —
             the rule moved and the selection walked to the rule it had just
             swapped with. */
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp' && canUp) {
              e.preventDefault()
              e.stopPropagation()
              onMove(-1)
            } else if (e.key === 'ArrowDown' && canDown) {
              e.preventDefault()
              e.stopPropagation()
              onMove(1)
            }
          }}
        >
          <span className="bb__idx__n">{index + 1}</span>
          <span className="bb__idx__grip" aria-hidden>
            <GripVertical size={14} strokeWidth={2} />
          </span>
        </button>

        {/* The fold is not here any more. It is the first mark in the hover
            trail above the card — see `.bb__acts` below (owner, 18 Sep 2026:
            "remove the expand button from the card and move it to the small
            icon button trail").

            It stood at the leading edge beside the index, on the argument that
            the two structural controls — where a rule sits, and how much of it
            you can see — belong together at the start of the row. What that
            missed is that only ONE of them is read at rest. The index is a
            fact about the rule and is worth a permanent slot; the fold is
            something you DO to it, like duplicating or moving it, and every
            other thing you do to a card already lives in one trail that
            arrives when you reach for the card. A seventh action drawn
            permanently inside the head was the only one of the seven charging
            the resting card for its existence. */}

        {/* The title is the keyboard path to the rule.

            One real button, in the tab order, whose accessible name is the rule
            it opens — replacing the whole-card `role="button"` that hid every
            other control on the card. `aria-expanded` because pressing it opens
            the panel that edits this rule. */}
        <div className="bb__title">
          <span className="bb__titlerow">
            <button
              type="button"
              id={titleId}
              className="bb__titlebtn"
              aria-expanded={selected}
              /* The same place the body click goes. This is the keyboard path
                 to the rule, and a keyboard path landing somewhere different
                 from the pointer path is a second model to learn. */
              onClick={(e) => {
                e.stopPropagation()
                onOpen('who')
              }}
            >
              <strong>{rule.name.trim() || 'Untitled rule'}</strong>
            </button>
            {/* The state belongs to the rule, so it sits with the rule's name.

                It was the first item in the meta cluster on the right, which
                put a read-only INDICATOR at the head of a row of controls —
                between the title and the buttons, reading as the first of them.
                People pressed it. Beside the name it is what it is: a fact
                about this rule, next to the thing it is a fact about. */}
            {/* In test mode the head says what the rule decides instead: the
                sign-in is being read against it, and Ready is not news. */}
            {route ? (
              <span className="bb__tout">{route.head}</span>
            ) : (
              <span className={`bb__state ${rule.enabled ? `is-${state}` : 'is-off'}`} title={rule.enabled ? stateNote : undefined}>
                {stateLabel(state, rule.enabled, unreachable)}
              </span>
            )}
          </span>
          {source && (
            <p className="bb__card__from" title={`From your text: “${source}”`}>
              From your text: “{source}”
            </p>
          )}
        </div>

        <div className="bb__cardmeta" onClick={(e) => e.stopPropagation()}>
          <span className="bb__acts">
            {/* How much of the card you can see — first, because it is the one
                action in this trail that changes nothing about the rule. */}
            <button
              type="button"
              className={`bb__act bb__fold__btn ${expanded ? 'is-open' : ''}`}
              aria-expanded={expanded}
              aria-controls={`bb-rule-${rule.id}-body`}
              aria-label={expanded ? `Hide what rule ${index + 1} checks` : `Show what rule ${index + 1} checks`}
              title={expanded ? 'Fold this rule' : 'Show what it checks'}
              onClick={(e) => {
                e.stopPropagation()
                onToggleExpand()
              }}
            >
              {expanded ? <ChevronsDownUp size={13} strokeWidth={2.2} /> : <ChevronsUpDown size={13} strokeWidth={2.2} />}
            </button>
            {/* Two actions out, the rest behind one ⋯ (owner, 21 Sep 2026:
                "only keep these two as a primary action and move all the other
                into 3 dot, and add a real toggle as we have").

                On/off is the kit's switch — the one the panel's rule head
                carries — rather than the toggle GLYPH that stood here, so the
                card and the panel show the same control for the same fact. */}
            <Toggle
              size="sm"
              checked={rule.enabled}
              onChange={onToggle}
              label={`Rule ${index + 1} ${rule.enabled ? 'on' : 'off'}`}
            />
            {/* Move, duplicate and delete: the things done to a rule less
                often, in the kit's row menu. It portals, so the trail is held
                open by `is-menu` on the card while it is up — the pointer
                leaving the card for the menu would otherwise fold the trail
                away under it. */}
            <RowMenu
              label={`Actions for rule ${index + 1}`}
              items={ruleMenu(canUp, canDown)}
              onOpenChange={setMenuOpen}
              onSelect={(id) => {
                if (id === 'up') onMove(-1)
                else if (id === 'down') onMove(1)
                else if (id === 'dup') onDuplicate()
                else if (id === 'del') onDelete()
              }}
            />
          </span>
        </div>
      </div>

      {/* The summary line is back, and the parts row has gone to the panel.

          That row was three facts and two doors in one control, on every card
          on the canvas. The doors are tabs on the form now — where the editing
          happens, and where they cost the chain nothing — so what belongs here
          is what belonged here before: a reading of the rule, which is all a
          folded card ever needed to be. */}
      {/* One fold, and no summary line above it.

          A folded card carried "Finance +4 · 1 condition → Deny" — a
          compressed restatement of the body directly beneath it, which the
          chevron reveals in full and in the shape a rule is actually written
          in. It answered no question the head does not: the name says which
          rule this is, the state pip says whether it is ready, and anybody who
          wants to know what it checks is one press away from the thing itself.
          A second, worse reading of the same rule is not a summary, it is
          duplication that has to be kept in step.

          So the counterweight goes with it and one disclosure is left. Still
          continuous, still nothing measured; the card simply grows, which is
          what a disclosure does.

          It stays MOUNTED at zero height rather than being conditionally
          rendered. `grid-template-rows` has nothing to animate from if the
          content arrives in the same frame as the class, so unmounting it
          would make the first press of the chevron jump and every press after
          it glide.

          `inert={!expanded}` — a real boolean. Written as `inert: ''` first,
          which React 19 reports as "an empty string for a boolean attribute"
          and treats as FALSE, so the folded half kept every one of its buttons
          in the tab order: Tab walked into a zero-height region and focus went
          somewhere invisible. */}
      <div className="bb__fold bb__fold--body" id={`bb-rule-${rule.id}-body`} inert={!expanded}>
        <div>
          {/* Not in test mode: every card is folded there and cannot be
              unfolded (the chevron is hidden), so a rule's body is drawn for
              nobody — and it was most of what a marker's hop redrew. It is
              back, still at zero height, the moment test mode closes, so the
              first press of the chevron after it still glides. */}
          <div className="bb__cardbody">{!route && <IfBlock rule={rule} resolve={resolve} />}</div>
        </div>
      </div>

      {/* What the sign-in being tried made of this rule: one pill per check. */}
      {route?.checks}
    </motion.div>
  )
}

/* The pinned default. It is a rule — it decides sign-ins and has an outcome —
   whose condition is "everything above missed". Three things stay fixed: its
   name, its place, and the fact that it exists. */
export function TerminalCard({
  rule,
  resolve,
  selected,
  route,
  expanded,
  onSelect,
  onToggleExpand,
  cardRef,
  flash = false,
  traced = false,
  highlight,
  onHover,
}: {
  rule: Rule
  resolve: NameLookup
  selected: boolean
  /** Try a sign-in's reading of the last row, while the board is in test mode. */
  route?: CardRoute
  expanded: boolean
  onSelect: () => void
  onToggleExpand: () => void
  cardRef: (el: HTMLDivElement | null) => void
  /** Shown from a guard page: an outline that fades. CSS only — this is a motion element. */
  flash?: boolean
  /** Describe it: the answer under the pointer wrote this row. A border colour, never a transform. */
  traced?: boolean
  /** Describe it: the pointer is over this row. */
  onHover?: (on: boolean) => void
  /** Test mode: the card a hovered row in the test panel lands on. */
  highlight?: CardHighlight
}) {
  const tone = TONE[rule.decision]
  const ringed = useCardHighlighted(highlight, 'fallback') || traced
  return (
    <motion.div
      ref={cardRef}
      /* Position only while a route is read: the evidence under the head
         changes the card's height, and a size animation stretches its text. */
      layout={route ? 'position' : true}
      transition={{ type: 'spring', stiffness: 520, damping: 40 }}
      className={`bb__card is-terminal is-${tone} ${expanded ? 'is-open' : ''} ${selected ? 'is-selected' : ''} ${flash ? 'is-flash' : ''} ${ringed ? 'is-traced' : ''} ${routeClass(route)}`}
      /* The same shape as every other card: a group named by its title
         button. It has no inner controls to hide, so the old whole-card button
         cost nothing here — but `aria-pressed` is a toggle's attribute and
         this is not a toggle, and two kinds of card that behave differently
         under the keyboard is one kind too many. */
      role="group"
      aria-labelledby="bb-terminal-title"
      onClick={onSelect}
      onMouseEnter={onHover && (() => onHover(true))}
      onMouseLeave={onHover && (() => onHover(false))}
    >
      {route?.marker}
      <div className="bb__cardhead">
        <span className="bb__idx is-home" aria-hidden>
          <span>
            <Asterisk size={13} strokeWidth={2} />
          </span>
        </span>

        {/* The fold moved into the hover trail with every other card's, and
            this card grew a trail to hold it (18 Sep 2026).

            The argument for this card carrying no buttons is about the POLICY:
            move, duplicate, delete and the switch would each promise a change
            the default cannot make. Folding promises nothing — it changes how
            much of the card is drawn and not one thing about the rule — so a
            trail of exactly one mark is honest, and it keeps this card's
            disclosure at the same x as every other card's. */}
        <div className="bb__title">
          {/* The state and the padlock ride beside the heading, where every
              other card in the chain carries its state pill — not at the far
              edge of the row, where they read as belonging to a different card. */}
          <div className="bb__titlerow">
            <button
              type="button"
              id="bb-terminal-title"
              className="bb__titlebtn"
              aria-expanded={selected}
              onClick={(e) => {
                e.stopPropagation()
                onSelect()
              }}
            >
              <strong>Nothing else matched</strong>
            </button>
            <div className="bb__cardmeta">
              {/* Says the two things that are true of this row and of no other:
                  it always runs, and it cannot be removed. The rest of the card's
                  controls — move, duplicate, delete, the on/off switch — are absent
                  rather than disabled, because a row of greyed-out buttons invites
                  somebody to work out why. */}
              {route ? <span className="bb__tout">{route.head}</span> : <span className="bb__state">Always on</span>}
              {/* A mark, not a pill with a word in it.

                  The row read `Always on` · `Locked` · fold: two labelled pills and a
                  button, three things wide, on the one card in the chain that has
                  nothing you can do to it. `Locked` was the least useful of the
                  three — it explains why the buttons this card does NOT have are
                  missing, which is a footnote, not a status. A padlock says it at a
                  glance and the sentence is still there on hover and in the
                  accessible name.

                  `role="img"` with an `aria-label`, because a bare `title` is
                  unreachable by keyboard and this is not a control that can take
                  focus. */}
              <span
                className="bb__lockmark"
                role="img"
                aria-label="Locked. This rule cannot be deleted, reordered or switched off — but what it does is yours."
                title="This rule cannot be deleted, reordered or switched off — but what it does is yours"
              >
                <Lock size={11} strokeWidth={2.2} aria-hidden />
              </span>
            </div>
          </div>
          <em>Every sign-in that no rule above caught</em>
        </div>

        {/* One mark, in the same trail and at the same x as every other card's.
            See the note where the fold used to stand. */}
        <div className="bb__cardmeta" onClick={(e) => e.stopPropagation()}>
          <span className="bb__acts">
            <button
              type="button"
              className={`bb__act bb__fold__btn ${expanded ? 'is-open' : ''}`}
              aria-expanded={expanded}
              aria-controls="bb-terminal-body"
              aria-label={expanded ? 'Hide what the default does' : 'Show what the default does'}
              title={expanded ? 'Fold this rule' : 'Show what it does'}
              onClick={(e) => {
                e.stopPropagation()
                onToggleExpand()
              }}
            >
              {expanded ? <ChevronsDownUp size={13} strokeWidth={2.2} /> : <ChevronsUpDown size={13} strokeWidth={2.2} />}
            </button>
          </span>
        </div>
      </div>
      <div className="bb__fold bb__fold--sum" aria-hidden={expanded} inert={expanded}>
        <div>
          {!route && <CardSummary terminal rule={rule} />}
        </div>
      </div>
      <div className="bb__fold bb__fold--body" id="bb-terminal-body" inert={!expanded}>
        <div>
          <div className="bb__cardbody">{!route && <IfBlock terminal rule={rule} resolve={resolve} />}</div>
        </div>
      </div>
      {route?.checks}
    </motion.div>
  )
}

/* --- The trace: a card read by a sign-in test --------------------------------

   The same card, read-only (TESTING-V4 §13.2, §14.3): Sign-in tests draws the
   deciding policy's rules with it, so a run reads in the builder's own
   grammar — number, title, who / if / then with the same chips, faces, zone
   chips and then-flow — and each card says what the sign-in made of it.

     reading      the body open, a spinner on the row being read, the rows
                  read so far marked ✓ ✕
     matched      the green ring, ✓ on every row that held
     missed       the rows read, the failing one ✕ — for a beat, before it folds
     folded       ONE line under the title naming the failing row, in red
     not-reached  its title, quiet
     off          its title, quiet, "Switched off"

   Colour says what happened (owner, 30 Sep): blue only for the engine at
   work — the row being read, its spinner; green for what matched or held;
   red for what failed; amber for what cannot be told, and for a rule that
   would also apply (a conflict). Not reached is grey.

   Nothing on it edits: no grip, no switch, no ⋯. It folds, as the builder's
   card does (owner, 30 Sep: "make the cards collapsible like we have in the
   policy builder"): given `onFold`, the head carries the builder's fold
   control — the same button, glyph and tooltip — and a folded card opens on
   a press anywhere on it; its title is the disclosure, and Open rule beside
   the fold opens the rule in its policy's builder. Without `onFold` a press
   opens the rule, as before. The body shows what its state shows unless
   `open` says otherwise. The foot is a slot for a notice — "Also applies to
   …" — that a conflicting rule carries; a card with one is drawn whole
   (`full`), and its notice stays even when the card is folded.

   The rows are the builder's, one line each — the keyword, then what it
   answers, then the mark — so an open card reads at the folded card's
   density rather than as a block of sections.

   Motion owns the body's height (`.bb__tbody`) and a mark's pop
   (`.bb__tmark`); board.css gives neither a transform nor a transition. The
   card itself is a plain element, so its ring eases in CSS. */

export type TraceState = 'waiting' | 'reading' | 'matched' | 'missed' | 'folded' | 'unknown' | 'possible' | 'off' | 'not-reached'

export interface TraceRowMark {
  status: 'pass' | 'fail' | 'unknown'
  /** Being read: a spinner where the mark will land. */
  working: boolean
}

export interface TraceMarks {
  who: TraceRowMark | null
  /** By condition id; absent while a row is not read. */
  conds: Record<string, TraceRowMark>
  /** Never read: an earlier row ended the rule. `who` for the who row. */
  skipped: readonly string[]
}

const TRACE_WORD: Record<TraceState, string> = {
  waiting: '',
  reading: 'Checking',
  matched: 'Matched',
  missed: 'No match',
  folded: 'No match',
  unknown: 'Can’t tell',
  possible: 'If not',
  off: 'Switched off',
  'not-reached': 'Not reached',
}

/** A later rule that would also apply to this person, differently: its pill. */
const CONFLICT_WORD = 'Also applies'

const NO_TRACE_MARKS: TraceMarks = { who: null, conds: {}, skipped: [] }

/** Decelerating: what arrives. */
const TRACE_OUT = [0.2, 0, 0, 1] as const
/** A drawer opening. */
const TRACE_OPEN = [0.32, 0.72, 0, 1] as const
const TRACE_IN_OUT = [0.4, 0, 0.2, 1] as const

/* A row's answer, at the row's right end: the spinner while it is read, then
   the mark with the least overshoot; "Not checked" for a row never read. */
function TraceMarkView({ mark, skipped = false, pop }: { mark: TraceRowMark | null | undefined; skipped?: boolean; pop: boolean }) {
  if (skipped) return <span className="bb__tskip">Not checked</span>
  if (!mark) return null
  if (mark.working)
    return (
      <span className="bb__tmark is-working" aria-hidden>
        <span className="bb__tspin" />
      </span>
    )
  const glyph = mark.status === 'pass' ? <Check size={12} strokeWidth={2.6} /> : mark.status === 'fail' ? <X size={12} strokeWidth={2.6} /> : <Minus size={12} strokeWidth={2.4} />
  const said = mark.status === 'pass' ? 'Held' : mark.status === 'fail' ? 'Did not hold' : 'Can’t tell'
  return (
    <>
      <motion.span
        className={`bb__tmark is-${mark.status}`}
        aria-hidden
        initial={pop ? { scale: 0.55, opacity: 0 } : false}
        animate={{ scale: 1, opacity: 1 }}
        transition={pop ? { scale: { type: 'spring', stiffness: 620, damping: 26 }, opacity: { duration: 0.1 } } : { duration: 0 }}
      >
        {glyph}
      </motion.span>
      <span className="u-sr-only">{said}</span>
    </>
  )
}

/* The rule's who / if / then, one row each: the keyword, what answers it
   (the builder's faces, chips and then-flow), and the row's mark at its right
   end — `who` saying which of the person's groups let them in ("via
   Engineering"), the first condition opening with `if` and the rest with
   their join. */
function TraceIf({ rule, resolve, marks, pop, via }: { rule: Rule; resolve: NameLookup; marks: TraceMarks; pop: boolean; via: string }) {
  const cards = rule.when.cards
  const top = topJoin(rule.when)
  const whoName = (kind: 'group' | 'user', id: string) => resolve(kind, id)
  const w = normaliseWho(rule.who)
  const faces: FaceItem[] = w
    ? [
        ...w.groupIds.map((id) => ({ kind: 'group' as const, key: `g:${id}`, name: whoName('group', id) ?? id })),
        ...w.userIds.map((id) => ({ kind: 'user' as const, key: `u:${id}`, name: whoName('user', id) ?? id })),
      ]
    : []
  const except = w ? [...(w.exceptGroupIds ?? []).map((id) => whoName('group', id) ?? id), ...(w.exceptUserIds ?? []).map((id) => whoName('user', id) ?? id)] : []
  const skipped = new Set(marks.skipped)
  const showWho = hasWho(rule.who)
  return (
    <div className="bb__if is-trace">
      {showWho && (
        <div className={`bb__trow is-who${skipped.has('who') ? ' is-skipped' : ''}`}>
          <span className="bb__trow__kw">
            <IfKw>who</IfKw>
          </span>
          <span className="bb__trow__body">
            {faces.length > 0 ? <FaceStack faces={faces} max={6} /> : <span className="bb__ifwho__text">Everyone</span>}
            {except.length > 0 && (
              <span className="bb__ifwho__text" title={whoSummary(rule.who, whoName, Infinity)}>
                except {except.join(', ')}
              </span>
            )}
            {via && <span className="bb__tvia">{via}</span>}
          </span>
          <TraceMarkView mark={marks.who} skipped={skipped.has('who')} pop={pop} />
        </div>
      )}
      {cards.map((k, i) => {
        const join = cardJoin(k)
        return (
          <div key={k.id} className={k.grouped ? 'bb__ifgroup bb__tgroup' : 'bb__tplain'}>
            {k.grouped && (
              <div className="bb__ifgrouptag">
                <Braces size={10} strokeWidth={2.2} aria-hidden />
                <b>{k.label?.trim() || `Group ${cardLetter(i)}`}</b>
              </div>
            )}
            {k.conditions.map((c, j) => (
              <div key={c.id} className={`bb__trow is-cond${skipped.has(c.id) ? ' is-skipped' : ''}`}>
                <span className="bb__trow__kw">{i === 0 && j === 0 ? <IfKw>if</IfKw> : j === 0 ? <IfKw tone={top}>{top}</IfKw> : <IfKw tone={join}>{join}</IfKw>}</span>
                <span className="bb__trow__body">
                  <CondReadout c={c} resolve={resolve} />
                </span>
                <TraceMarkView mark={marks.conds[c.id]} skipped={skipped.has(c.id)} pop={pop} />
              </div>
            ))}
          </div>
        )
      })}
      {!showWho && cards.length === 0 && (
        <div className="bb__trow">
          <span className="bb__trow__kw">
            <IfKw>if</IfKw>
          </span>
          <span className="bb__trow__body">
            <span className="bb__ifjourney">Every sign-in</span>
          </span>
        </div>
      )}
      <div className="bb__trow is-then">
        <ActionRow rule={rule} />
      </div>
    </div>
  )
}

export function RuleTraceCard({
  rule,
  index,
  state,
  marks = NO_TRACE_MARKS,
  miss = '',
  resolve,
  full = false,
  notice,
  active = false,
  animate = false,
  onOpen,
  open: openProp,
  onFold,
  via = '',
  conflict = false,
}: {
  rule: Rule
  /** 0-based; null for the last row, "Nothing else matched". */
  index: number | null
  state: TraceState
  marks?: TraceMarks
  /** The folded line: the failing row, said — "Network · Home broadband is not in Corporate offices". */
  miss?: string
  resolve: NameLookup
  /** Drawn whole whatever its state: a card carrying a notice is never folded by its state. */
  full?: boolean
  /** The slot at the card's foot: "Also applies to … · via Finance — not used, rule 2 matched first". */
  notice?: ReactNode
  /** The engine is reading it. */
  active?: boolean
  /** A run is playing and motion is allowed: the body opens, the marks pop. */
  animate?: boolean
  /** Opens the rule in its policy's builder. */
  onOpen?: () => void
  /** The body shown or folded away, whatever its state would show. Absent, its state's own. */
  open?: boolean
  /** The builder's fold control on its head: folds or opens it. A folded card opens on a press anywhere on it. */
  onFold?: () => void
  /** Which of the person's groups its who let them in by: "via Engineering". */
  via?: string
  /** It would also apply to this person, with another answer: "Also applies", in the notice tone. */
  conflict?: boolean
}) {
  const titleId = useId()
  const bodyId = useId()
  const terminal = index === null
  const tone = TONE[rule.decision]
  const word = conflict ? CONFLICT_WORD : TRACE_WORD[state]
  const own = full || state === 'reading' || state === 'matched' || state === 'missed' || state === 'unknown' || state === 'possible'
  const open = openProp ?? own
  const n = terminal ? null : index + 1
  const name = terminal ? 'Nothing else matched' : rule.name.trim() || 'Untitled rule'
  const onCard = onFold ? () => !open && onFold() : onOpen
  return (
    <div
      className={`bb__card is-trace is-${tone} is-t-${state}${terminal ? ' is-terminal' : ''}${active ? ' is-active' : ''}${open ? ' is-open' : ''}${onFold ? ' is-foldable' : ''}${conflict ? ' is-conflict' : ''}`}
      role="group"
      aria-labelledby={titleId}
      onClick={onCard}
    >
      <div className="bb__cardhead">
        {terminal ? (
          <span className="bb__idx is-home" aria-hidden>
            <span>
              <Asterisk size={13} strokeWidth={2} />
            </span>
          </span>
        ) : (
          <span className="bb__idx" aria-hidden>
            <span className="bb__idx__n">{n}</span>
          </span>
        )}
        <div className="bb__title">
          <span className="bb__titlerow">
            {/* A button only when a press does something: drawn with neither
                a fold nor an Open (the why's card, whose Open rule is in its
                notice), the title is words, and out of the Tab order. */}
            {onFold || onOpen ? (
              <button
                type="button"
                id={titleId}
                className="bb__titlebtn"
                {...(onFold && !terminal ? { 'aria-expanded': open, 'aria-controls': open ? bodyId : undefined } : null)}
                onClick={(e) => {
                  e.stopPropagation()
                  if (onFold) onFold()
                  else onOpen?.()
                }}
              >
                {n !== null && <span className="u-sr-only">Rule {n}: </span>}
                <strong>{name}</strong>
              </button>
            ) : (
              <span id={titleId} className="bb__titlebtn is-static">
                {n !== null && <span className="u-sr-only">Rule {n}: </span>}
                <strong>{name}</strong>
              </span>
            )}
            {/* The last row folded still says what it decides. */}
            {terminal && !open && (
              <span className="bb__tthen">
                <ArrowRight size={11} strokeWidth={2} aria-hidden />
                <IfChip tone={tone}>{DECISION_NAME[rule.decision]}</IfChip>
              </span>
            )}
            {word && <span className={`bb__state bb__tstate is-${conflict ? 'conflict' : state}`}>{word}</span>}
          </span>
          {state === 'folded' && miss && !open ? (
            <em className="bb__tmiss">
              <X size={12} strokeWidth={2.6} aria-hidden />
              <span>{miss}</span>
            </em>
          ) : terminal && open ? (
            <em>Every sign-in that no rule above caught</em>
          ) : null}
        </div>
        {onFold && (
          <div className="bb__cardmeta" onClick={(e) => e.stopPropagation()}>
            <span className="bb__acts">
              <button
                type="button"
                className={`bb__act bb__fold__btn ${open ? 'is-open' : ''}`}
                aria-expanded={open}
                aria-controls={open && !terminal ? bodyId : undefined}
                aria-label={terminal ? (open ? 'Hide what the default does' : 'Show what the default does') : open ? `Hide what rule ${n} checks` : `Show what rule ${n} checks`}
                title={open ? 'Fold this rule' : terminal ? 'Show what it does' : 'Show what it checks'}
                onClick={onFold}
              >
                {open ? <ChevronsDownUp size={13} strokeWidth={2.2} /> : <ChevronsUpDown size={13} strokeWidth={2.2} />}
              </button>
              {onOpen && (
                <button type="button" className="bb__act bb__topen" aria-label={terminal ? 'Open the default in its policy' : `Open rule ${n} in its policy`} title="Open in its policy" onClick={onOpen}>
                  <ArrowUpRight size={13} strokeWidth={2.2} />
                </button>
              )}
            </span>
          </div>
        )}
      </div>
      {terminal ? (
        open && <CardSummary terminal rule={rule} />
      ) : (
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              key="body"
              id={bodyId}
              className="bb__tbody"
              initial={animate ? { height: 0, opacity: 0 } : false}
              animate={{ height: 'auto', opacity: 1, transition: animate ? { height: { duration: 0.26, ease: TRACE_OPEN }, opacity: { duration: 0.18, delay: 0.04, ease: TRACE_OUT } } : { duration: 0 } }}
              exit={{ height: 0, opacity: 0, transition: animate ? { height: { duration: 0.24, ease: TRACE_IN_OUT }, opacity: { duration: 0.12 } } : { duration: 0 } }}
            >
              <div className="bb__cardbody">
                <TraceIf rule={rule} resolve={resolve} marks={marks} pop={animate} via={via} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
      {notice && (
        <div className="bb__tnotice" onClick={(e) => e.stopPropagation()}>
          {notice}
        </div>
      )}
    </div>
  )
}
