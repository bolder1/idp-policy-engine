import type { PointerEvent as ReactPointerEvent } from 'react'
import { motion } from 'motion/react'
import { ArrowDown, ArrowUp, Copy, GripVertical, Home, Lock, Trash2 } from 'lucide-react'

import { Toggle } from '../../kit'
import { conditionType, type Condition, type Rule } from '../../data'
import type { NameLookup } from '../predicate-prose'
import type { StepKind } from '../simulate'
import type { RuleState } from '../rule-form'
import { TONE } from './model'
import { IfBlock, type NextRule } from './IfBlock'
import { GROUP_TONE, groupIcon } from './tones'

/* -----------------------------------------------------------------------------
   A card on the chain — one rule, read whole.

   Zapier's card shows an app mark, a number and a name, and hides what the
   step does behind a click. A rule cannot afford that: what it checks and what
   it decides ARE the rule, and a chain of five names says nothing about which
   sign-in falls where. So the card reads its WHEN as brackets and its THEN as
   the journey the person will walk, at a size you can scan at 70% zoom.
   -------------------------------------------------------------------------- */

const STATE_LABEL: Record<RuleState, string> = { ready: 'Ready', setup: 'Needs setup', warn: 'Check' }

/** One condition, as a chip. Shared by the card and the inspector's readback. */
export function CondChip({ c, resolve }: { c: Condition; resolve: NameLookup }) {
  const t = conditionType(c.typeId)
  const Ico = groupIcon(t.group)
  const unset = c.values.filter(Boolean).length === 0
  const value = unset
    ? 'no value'
    : t.valueKind === 'zone' || t.valueKind === 'fingerprint' || t.valueKind === 'hook' || t.valueKind === 'group' || t.valueKind === 'user'
      ? c.values.map((v) => resolve(t.valueKind as 'zone', v) ?? v).join(', ')
      : t.valueKind === 'time'
        ? `${c.values[0] ?? '09:00'}–${c.values[1] ?? '17:00'}`
        : c.values.join(', ')
  return (
    <span className={`bb__cond is-tone-${GROUP_TONE[t.group] ?? 'neutral'} ${unset ? 'is-unset' : ''}`} title={`${t.label} ${c.operator} ${value}`}>
      <i aria-hidden>
        <Ico size={10} strokeWidth={2} />
      </i>
      {t.label}
      <em>{c.operator}</em>
      <b>{value}</b>
    </span>
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
  resolve,
  canUp,
  canDown,
  onSelect,
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
  resolve: NameLookup
  canUp: boolean
  canDown: boolean
  onSelect: () => void
  onToggle: (on: boolean) => void
  onMove: (dir: -1 | 1) => void
  onDuplicate: () => void
  onDelete: () => void
  onGrip: (e: ReactPointerEvent<HTMLElement>) => void
  onHover: (on: boolean) => void
  cardRef: (el: HTMLDivElement | null) => void
}) {
  const tone = TONE[rule.decision]
  const kindClass = traceKind === 'hit' ? 'is-hit' : traceKind === 'miss' ? 'is-miss' : traceKind === 'unreached' || traceKind === 'off' ? 'is-unreached' : ''

  return (
    <motion.div
      ref={cardRef}
      /* No `layout` here any more. The wrapper in Board owns this card's place
         in the chain and animates it; a second projection on the child fought
         the first — each measured a position the other was mid-way through
         changing, which is the small shiver a reorder used to end on. One
         element animates the move, and it is the one that moves. */
      className={`bb__card is-${tone} ${selected ? 'is-selected' : ''} ${rule.enabled ? '' : 'is-off'} ${shadowed ? 'is-shadowed' : ''} ${dragging ? 'is-dragging' : ''} ${kindClass}`}
      /* No style prop while dragging, deliberately. Board writes this element's
         transform directly on every pointer move; a `style` React manages would
         be reset to a stale offset on the next re-render, which is the classic
         "card snaps back mid-drag". `layout` is off for the same reason —
         Motion must not own this transform while the pointer does. */
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`Rule ${index + 1}: ${rule.name}`}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      data-index={index}
    >
      <div className="bb__cardhead">
        {/* The index is the grip. It is the one thing on the card that says
            "this is a position", so it is the thing you drag to change it. */}
        <span
          className="bb__idx"
          role="button"
          tabIndex={0}
          aria-label={`Drag to reorder rule ${index + 1}, or use the arrows`}
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
        </span>

        <div className="bb__title">
          <strong>{rule.name || 'Untitled rule'}</strong>
          {rule.description ? <em>{rule.description}</em> : null}
        </div>

        <div className="bb__cardmeta" onClick={(e) => e.stopPropagation()}>
          <span className={`bb__state ${rule.enabled ? `is-${state}` : 'is-off'}`}>{rule.enabled ? STATE_LABEL[state] : 'Off'}</span>
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
  onSelect,
  cardRef,
}: {
  rule: Rule
  resolve: NameLookup
  selected: boolean
  landed: boolean
  /** Whether the rehearsal fell through to here. Null when nothing is running. */
  reached: boolean | null
  onSelect: () => void
  cardRef: (el: HTMLDivElement | null) => void
}) {
  const tone = TONE[rule.decision]
  return (
    <motion.div
      ref={cardRef}
      layout
      transition={{ type: 'spring', stiffness: 520, damping: 40 }}
      className={`bb__card is-terminal is-${tone} ${selected ? 'is-selected' : ''} ${reached === true ? 'is-hit' : reached === false ? 'is-unreached' : ''}`}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label="Nothing else matched — the default"
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
    >
      <div className="bb__cardhead">
        <span className="bb__idx is-home" aria-hidden>
          <span>
            <Home size={13} strokeWidth={2} />
          </span>
        </span>
        <div className="bb__title">
          <strong>Nothing else matched</strong>
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
        </div>
      </div>
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
    </motion.div>
  )
}
