import type { PointerEvent as ReactPointerEvent } from 'react'
import { motion } from 'motion/react'
import { ArrowDown, ArrowRight, ArrowUp, ChevronDown, Copy, GripVertical, Home, Lock, Split, Trash2 } from 'lucide-react'

import { Toggle } from '../../kit'
import { type Rule } from '../../data'
import type { NameLookup } from '../predicate-prose'
import type { StepKind } from '../simulate'
import type { RuleState } from '../rule-form'
import { DECISION_NAME, TONE } from './model'
import { IfBlock, IfChip, type NextRule } from './IfBlock'

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

   So the body folds. Collapsed, the card keeps its number, its name, its state
   and its switch, and trades the brackets for one line saying how many
   conditions there are and what they decide — enough to keep the chain
   readable as a chain. Expanded, it is the card it always was.

   The fold is CSS, not Motion, and that is deliberate: `grid-template-rows`
   from `0fr` to `1fr` animates height without measuring anything, so the
   siblings below simply reflow — no projection, no snapshot, nothing for the
   chain's own `layout` animation to fight. See the note on `.bb__fold`. */

const STATE_LABEL: Record<RuleState, string> = { ready: 'Ready', setup: 'Needs setup', warn: 'Check' }

/* The card in one line, for when the body is folded away.

   It says the two things the brackets would have said and the head does not:
   how much test there is, and what the test decides. A count rather than the
   conditions themselves, because the point of folding is to stop reading them
   — and "3 conditions" is still enough to tell a broad rule from a narrow one
   while you are scanning for order.

   "any sign-in" rather than "0 conditions" for the empty case: a rule with no
   conditions does not test less, it tests nothing, and it catches everything
   that reaches it. That is the fact worth putting on a folded card. */
function CardSummary({ rule }: { rule: Rule }) {
  const n = rule.when.cards.reduce((sum, k) => sum + k.conditions.length, 0)
  return (
    <div className="bb__cardsum">
      <span className="bb__ifbranch" aria-hidden>
        <Split size={11} strokeWidth={2} />
      </span>
      <span className="bb__cardsum__n">{n === 0 ? 'any sign-in' : `${n} condition${n === 1 ? '' : 's'}`}</span>
      <ArrowRight size={11} strokeWidth={2} aria-hidden />
      <IfChip tone={TONE[rule.decision]}>{DECISION_NAME[rule.decision]}</IfChip>
    </div>
  )
}

export function RuleCard({
  rule,
  index,
  next,
  selected,
  state,
  traceKind,
  traceReason,
  landed,
  shadowed,
  dragging,
  expanded,
  resolve,
  canUp,
  canDown,
  onSelect,
  onToggleExpand,
  onToggle,
  onMove,
  onDuplicate,
  onDelete,
  onGrip,
  onHover,
  cardRef,
}: {
  rule: Rule
  index: number
  next: NextRule
  selected: boolean
  state: RuleState
  traceKind: StepKind | null
  traceReason: string | null
  /** The sign-in token has landed here. */
  landed: boolean
  shadowed: boolean
  dragging: boolean
  /** Whether the WHEN/THEN body is unfolded. Owned by the host, not the card. */
  expanded: boolean
  resolve: NameLookup
  canUp: boolean
  canDown: boolean
  onSelect: () => void
  onToggleExpand: () => void
  onToggle: (on: boolean) => void
  onMove: (dir: -1 | 1) => void
  onDuplicate: () => void
  onDelete: () => void
  onGrip: (e: ReactPointerEvent<HTMLElement>) => void
  onHover: (on: boolean) => void
  cardRef: (el: HTMLDivElement | null) => void
}) {
  const tone = TONE[rule.decision]
  const titleId = `bb-rule-${rule.id}-title`
  const kindClass = traceKind === 'hit' ? 'is-hit' : traceKind === 'miss' ? 'is-miss' : traceKind === 'unreached' || traceKind === 'off' ? 'is-unreached' : ''

  return (
    <motion.div
      ref={cardRef}
      /* No `layout` here any more. The wrapper in Board owns this card's place
         in the chain and animates it; a second projection on the child fought
         the first — each measured a position the other was mid-way through
         changing, which is the small shiver a reorder used to end on. One
         element animates the move, and it is the one that moves. */
      className={`bb__card is-${tone} ${expanded ? 'is-open' : ''} ${selected ? 'is-selected' : ''} ${rule.enabled ? '' : 'is-off'} ${shadowed ? 'is-shadowed' : ''} ${dragging ? 'is-dragging' : ''} ${kindClass}`}
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
      onClick={onSelect}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      data-index={index}
    >
      <div className="bb__cardhead">
        {/* The index is the grip. It is the one thing on the card that says
            "this is a position", so it is the thing you drag to change it. */}
        <button
          type="button"
          className="bb__idx"
          aria-label={`Reorder rule ${index + 1} — drag, or use the arrow keys`}
          onPointerDown={(e) => {
            e.stopPropagation()
            onGrip(e)
          }}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp' && canUp) {
              e.preventDefault()
              onMove(-1)
            } else if (e.key === 'ArrowDown' && canDown) {
              e.preventDefault()
              onMove(1)
            }
          }}
        >
          <span>{index + 1}</span>
          <GripVertical size={14} strokeWidth={2} aria-hidden />
        </button>

        {/* The title is the keyboard path to the rule.

            One real button, in the tab order, whose accessible name is the rule
            it opens — replacing the whole-card `role="button"` that hid every
            other control on the card. `aria-expanded` because pressing it opens
            the panel that edits this rule. */}
        <div className="bb__title">
          <button
            type="button"
            id={titleId}
            className="bb__titlebtn"
            aria-expanded={selected}
            onClick={(e) => {
              e.stopPropagation()
              onSelect()
            }}
          >
            <strong>{rule.name || 'Untitled rule'}</strong>
          </button>
          {rule.description ? <em>{rule.description}</em> : null}
        </div>

        <div className="bb__cardmeta" onClick={(e) => e.stopPropagation()}>
          <span className={`bb__state ${rule.enabled ? `is-${state}` : 'is-off'}`}>{rule.enabled ? STATE_LABEL[state] : 'Off'}</span>
          {/* The fold, on the card rather than only on the toolbar.

              The toolbar switch sets the whole chain, which is the right
              control for "show me the order" and the wrong one for "show me
              THIS one" — the common move is to fold everything and then open
              the two rules you are comparing. So the card carries its own, and
              the host remembers it as an override of whatever the toolbar last
              said. `aria-expanded` names the region it opens. */}
          <button
            type="button"
            className="bb__act bb__fold__btn"
            aria-expanded={expanded}
            aria-controls={`bb-rule-${rule.id}-body`}
            aria-label={expanded ? `Hide what rule ${index + 1} checks` : `Show what rule ${index + 1} checks`}
            title={expanded ? 'Fold' : 'Unfold'}
            onClick={onToggleExpand}
          >
            <ChevronDown size={13} strokeWidth={2} />
          </button>
          <span className="bb__acts">
            <button type="button" className="bb__act" aria-label="Move up" disabled={!canUp} onClick={() => onMove(-1)}>
              <ArrowUp size={13} strokeWidth={2} />
            </button>
            <button type="button" className="bb__act" aria-label="Move down" disabled={!canDown} onClick={() => onMove(1)}>
              <ArrowDown size={13} strokeWidth={2} />
            </button>
            <button type="button" className="bb__act" aria-label="Duplicate rule" onClick={onDuplicate}>
              <Copy size={13} strokeWidth={2} />
            </button>
            <button type="button" className="bb__act is-danger" aria-label="Delete rule" onClick={onDelete}>
              <Trash2 size={13} strokeWidth={2} />
            </button>
          </span>
          <Toggle checked={rule.enabled} onChange={onToggle} label={`Rule ${index + 1} is ${rule.enabled ? 'on' : 'off'}`} size="sm" />
        </div>
      </div>

      {/* Two folds, opposite ways round.

          The summary shrinks as the body grows, so the card never shows both
          readings of itself at once and never jumps: one grid row goes 1fr→0fr
          while the other goes 0fr→1fr, on the same curve, and the height
          between them is continuous.

          Both stay MOUNTED at zero height rather than being conditionally
          rendered. `grid-template-rows` has nothing to animate from if the
          content arrives in the same frame as the class, so unmounting the
          folded half would make the first press of the chevron jump and every
          press after it glide. Mounted, hidden by `overflow` and taken out of
          the tab order by `inert`, both directions animate identically.

          `inert={expanded}` — a real boolean. Written as `inert: ''` first,
          which React 19 reports as "an empty string for a boolean attribute"
          and treats as FALSE, so the folded half kept every one of its buttons
          in the tab order: Tab walked into a zero-height region and focus went
          somewhere invisible. The cast that silenced the type error was the
          tell that the value was wrong. */}
      <div className="bb__fold bb__fold--sum" aria-hidden={expanded} inert={expanded}>
        <div>
          <CardSummary rule={rule} />
        </div>
      </div>
      <div className="bb__fold bb__fold--body" id={`bb-rule-${rule.id}-body`} inert={!expanded}>
        <div>
          <div className="bb__cardbody">
            <IfBlock
              rule={rule}
              next={next}
              resolve={resolve}
              token={
                landed ? (
                  <motion.span layoutId="bb-token" className="bb__token" aria-hidden transition={{ type: 'spring', stiffness: 380, damping: 32 }}>
                    ●
                  </motion.span>
                ) : undefined
              }
            />
          </div>
        </div>
      </div>

      {traceKind && traceKind !== 'unreached' && traceReason && (
        <motion.p className={`bb__verdict ${traceKind === 'hit' ? 'is-hit' : ''}`} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}>
          <strong>{traceKind === 'hit' ? 'Matched' : traceKind === 'off' ? 'Switched off' : 'Did not match'}</strong>
          <span>{traceReason}</span>
        </motion.p>
      )}
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
  landed,
  reached,
  expanded,
  onSelect,
  onToggleExpand,
  cardRef,
}: {
  rule: Rule
  resolve: NameLookup
  selected: boolean
  landed: boolean
  /** Whether the rehearsal fell through to here. Null when nothing is running. */
  reached: boolean | null
  expanded: boolean
  onSelect: () => void
  onToggleExpand: () => void
  cardRef: (el: HTMLDivElement | null) => void
}) {
  const tone = TONE[rule.decision]
  return (
    <motion.div
      ref={cardRef}
      layout
      transition={{ type: 'spring', stiffness: 520, damping: 40 }}
      className={`bb__card is-terminal is-${tone} ${expanded ? 'is-open' : ''} ${selected ? 'is-selected' : ''} ${reached === true ? 'is-hit' : reached === false ? 'is-unreached' : ''}`}
      /* The same shape as every other card: a group named by its title
         button. It has no inner controls to hide, so the old whole-card button
         cost nothing here — but `aria-pressed` is a toggle's attribute and
         this is not a toggle, and two kinds of card that behave differently
         under the keyboard is one kind too many. */
      role="group"
      aria-labelledby="bb-terminal-title"
      onClick={onSelect}
    >
      <div className="bb__cardhead">
        <span className="bb__idx is-home" aria-hidden>
          <span>
            <Home size={13} strokeWidth={2} />
          </span>
        </span>
        <div className="bb__title">
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
          <em>Every sign-in that no rule above caught</em>
        </div>
        <div className="bb__cardmeta">
          {/* Says the two things that are true of this row and of no other:
              it always runs, and it cannot be removed. The rest of the card's
              controls — move, duplicate, delete, the on/off switch — are absent
              rather than disabled, because a row of greyed-out buttons invites
              somebody to work out why. */}
          <span className="bb__state">Always on</span>
          <span className="bb__lock" title="This rule cannot be deleted, reordered or switched off — but what it does is yours">
            <Lock size={10} strokeWidth={2.2} aria-hidden />
            Locked
          </span>
          {/* A view control, so it is allowed here.

              The argument for this card carrying no buttons is about the
              POLICY: move, duplicate, delete and the switch would all promise
              a change the default cannot make. Folding changes nothing about
              the rule, only how much of it is drawn — and a chain set to
              Outline with one card still at full height reads as a card that
              did not hear the instruction. */}
          <button
            type="button"
            className="bb__act bb__fold__btn"
            aria-expanded={expanded}
            aria-controls="bb-terminal-body"
            aria-label={expanded ? 'Hide what the default does' : 'Show what the default does'}
            title={expanded ? 'Fold' : 'Unfold'}
            onClick={(e) => {
              e.stopPropagation()
              onToggleExpand()
            }}
          >
            <ChevronDown size={13} strokeWidth={2} />
          </button>
        </div>
      </div>
      <div className="bb__fold bb__fold--sum" aria-hidden={expanded} inert={expanded}>
        <div>
          <CardSummary rule={rule} />
        </div>
      </div>
      <div className="bb__fold bb__fold--body" id="bb-terminal-body" inert={!expanded}>
        <div>
          <div className="bb__cardbody">
            <IfBlock
              terminal
              rule={rule}
              next={null}
              resolve={resolve}
              token={
                landed ? (
                  <motion.span layoutId="bb-token" className="bb__token" aria-hidden transition={{ type: 'spring', stiffness: 380, damping: 32 }}>
                    ●
                  </motion.span>
                ) : undefined
              }
            />
          </div>
        </div>
      </div>
    </motion.div>
  )
}
