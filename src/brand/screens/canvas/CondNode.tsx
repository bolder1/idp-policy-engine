import { AlertTriangle, GripVertical } from 'lucide-react'

import { conditionType } from '../../data'
import type { NameLookup } from '../predicate-prose'
import type { Diagnostic } from '../diagnostics'
import { GROUP_TONE, groupIcon } from '../board/tones'
import type { CondNode } from '../../when-graph'

/* -----------------------------------------------------------------------------
   One condition, as a node.

   Read-only. Every value is edited in the panel, and that is a decision rather
   than an omission: the pickers in this product are portalled and positioned
   `fixed`, re-placed only on scroll and resize — and pan and zoom are neither,
   so a picker opened inside a scaled world detaches from its chip the moment
   the canvas moves and draws at full size beside a half-size node. Read-only
   nodes remove that by construction instead of by patching the positioner, and
   they keep the two-live-copies hazard away that the inspector already refuses.

   So a node shows what it checks and says whether it is finished. The grip is
   the only interactive thing on it besides selection.
   -------------------------------------------------------------------------- */

export function CondNodeCard({
  node,
  resolve,
  selected,
  dragging,
  dropping,
  finding,
  onSelect,
  onGrab,
}: {
  node: CondNode
  resolve: NameLookup
  selected: boolean
  dragging: boolean
  dropping: boolean
  finding?: Diagnostic
  onSelect: () => void
  onGrab: () => void
}) {
  const t = conditionType(node.typeId)
  const Ico = groupIcon(t.group)
  const unset = node.values.filter(Boolean).length === 0

  /* The same reading the card on the stage uses, so a condition says the same
     thing in both places. `values: []` is a first-class state — it means the
     author has not answered yet — and it is named rather than left blank,
     because a blank reads as "nothing to see" when it means "this cannot
     match". */
  const value = unset
    ? 'Needs a value'
    : t.valueKind === 'zone' || t.valueKind === 'fingerprint' || t.valueKind === 'hook' || t.valueKind === 'group' || t.valueKind === 'user'
      ? node.values.map((v) => resolve(t.valueKind as 'zone', v) ?? v).join(', ')
      : t.valueKind === 'time'
        ? `${node.values[0] ?? '09:00'} – ${node.values[1] ?? '17:00'}`
        : node.values.join(', ')

  return (
    <div
      className={`cv__node is-tone-${GROUP_TONE[t.group] ?? 'neutral'} ${selected ? 'is-selected' : ''} ${dragging ? 'is-dragging' : ''} ${
        dropping ? 'is-over' : ''
      } ${unset ? 'is-unset' : ''}`}
      data-canvas-solid
    >
      <button
        type="button"
        className="cv__grip"
        aria-label={`Move ${t.label}`}
        onPointerDown={(e) => {
          e.stopPropagation()
          onGrab()
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical size={13} strokeWidth={2} aria-hidden />
      </button>

      {/* A real button, so the node is reachable and operable by keyboard. The
          card is not a button — that would make every control inside it
          presentational, which is the mistake the rule card documents undoing. */}
      <button type="button" className="cv__nodebtn" aria-pressed={selected} onClick={onSelect}>
        <span className="cv__nodehead">
          <i aria-hidden>
            <Ico size={11} strokeWidth={2} />
          </i>
          {t.label}
        </span>
        <span className="cv__nodebody">
          <em>{node.operator}</em>
          <b className={unset ? 'is-unset' : ''}>{value}</b>
        </span>
      </button>

      {finding && (
        <span className={`cv__flag is-${finding.severity}`} title={finding.detail}>
          <AlertTriangle size={11} strokeWidth={2.2} aria-hidden />
          <span className="cv__sr">{finding.title}</span>
        </span>
      )}
    </div>
  )
}
