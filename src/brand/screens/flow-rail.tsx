import { Fragment, useEffect, useRef, useState } from 'react'
import { LayoutGroup, motion, useReducedMotion } from 'motion/react'
import {
  AlertTriangle,
  Asterisk,
  GripVertical,
  KeyRound,
  LogIn,
  PanelLeftClose,
  Plus,
  ShieldAlert,
  UserCheck,
  XCircle,
} from 'lucide-react'

import type { AccessDecision, Policy } from '../data'
import { Badge } from '../kit'
import { ruleState } from './rule-form'
import type { Diagnostic } from './diagnostics'
import { useNameLookup } from '../store'
import { ruleLabel, ruleSummary } from './predicate-prose'

/* -----------------------------------------------------------------------------
   The flow — v1's left side, brought forward.

   v4 shipped a flat list of rules in a 236px rail. It was smaller than v1's
   canvas and worse at the one job the left side has: showing that a sign-in
   falls *through* an ordered sequence until something catches it. v1 drew that
   — a start node, a spine, a landing — and drew the insert point between two
   rules as a control rather than as an "add" button at the bottom.

   What is kept from v1: the dot-grid stage, the start node, the connector with
   its `+`, the decision-coloured tile, the index that doubles as the drag grip,
   and the pinned default at the end.

   What is dropped: the zoom control and the Branch view. Both belong to a
   canvas you navigate; this is a rail you pick from, and it is already the
   width it wants to be.
   -------------------------------------------------------------------------- */

/* A flag, and not the triangle.

   `AlertTriangle` is this console's word for "something is wrong HERE", and it
   is spent on that everywhere else — on a rail of tiles it would read as a rule
   with a problem rather than a rule that raises one. A flag is the mark you
   plant on something to come back to, which is what this outcome does. */
const TILE = { deny: ShieldAlert, '2fa': KeyRound, '1fa': UserCheck } as const
const TONE = { deny: 'deny', '2fa': 'mfa', '1fa': 'allow' } as const

/** Said as a consequence, not as a setting — this row is read far more than set. */
export const FALLBACK_SUB: Record<AccessDecision, string> = {
  '1fa': 'logs in on one factor',
  '2fa': 'is asked for a second factor',
  deny: 'is refused',
}

export function FlowRail({
  policy,
  selected,
  diagnostics,
  shadowed,
  onSelect,
  onInsert,
  onMove,
  onReorder,
  onHover,
  onClose,
  onFallback,
  fallbackOn,
}: {
  policy: Policy
  selected: number
  diagnostics: Diagnostic[]
  /** Rules the hovered rule puts permanently out of reach. */
  shadowed: number[]
  onSelect: (i: number) => void
  onInsert: (at: number) => void
  onMove: (from: number, to: number) => void
  onReorder: (from: number, to: number) => void
  onHover: (i: number | null) => void
  /** The panel floats over the work now, so it needs a way out that is not a pick. */
  onClose?: () => void
  /** Open the terminal rule in the playground. Editable, never deletable. */
  onFallback: () => void
  /** Whether the terminal rule is the one currently open. */
  fallbackOn?: boolean
}) {
  const reduce = useReducedMotion()
  const resolve = useNameLookup()
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null)
  const rules = policy.rules
  const fallback = policy.fallback?.decision ?? '1fa'
  /* The terminal rule's own findings: policy-wide (ruleIndex -1), told apart
     from the audience's by their id. */
  const fallbackState = ruleState(diagnostics.filter((d) => d.ruleIndex === -1 && d.id.endsWith('-fallback')))
  const scroller = useRef<HTMLDivElement | null>(null)

  /* Keep the selected rule in view.

     The rail is the only rule list now, and selection can move from anywhere —
     a diagnostic's "open rule 4", the command palette, adding a rule at a
     position. With twenty rules the tile you just selected is regularly off
     screen, and a list that does not follow its own selection stops being a
     list of where you are. `nearest`, so a tile already visible is not yanked. */
  useEffect(() => {
    const el = scroller.current?.querySelector<HTMLElement>('.bf__node.is-on')
    el?.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' })
  }, [selected, reduce])

  return (
    <section className="bf__flow" data-tour="flow" aria-label="Evaluation order — top to bottom, first match wins">
      {/* The panel titles itself and says what the order MEANS, because this is
          the only place either belongs. Both used to sit in a bar across the
          top of the playground — a heading for the panel, printed over the
          thing the panel is not. */}
      <header className="bf__flowhead">
        <span className="bf__flowtitle">
          <span className="u-label">Evaluation order</span>
          <em>Top to bottom, first match wins</em>
        </span>
        {onClose && (
          <button
            type="button"
            className="bf__flowclose"
            aria-label="Hide the rules panel"
            title="Hide the rules panel"
            onClick={onClose}
          >
            <PanelLeftClose size={15} strokeWidth={1.8} />
          </button>
        )}
      </header>

      <div className="bf__flowscroll" ref={scroller} tabIndex={0} role="region" aria-label="Evaluation order">
        <div className="bf__flowstage">
          {/* The policy audience is not drawn here. It is a property of the
              policy, not the first node of its program, and it has one home:
              the strip above the builder. A rule's own who is part of each
              node's subline. */}
          <p className="bf__flowstart">
            <LogIn size={13} strokeWidth={1.9} aria-hidden />
            A user attempts to log in
          </p>

          <LayoutGroup>
            {rules.map((r, i) => {
              const st = ruleState(diagnostics.filter((d) => d.ruleIndex === i))
              const Tile = TILE[r.decision]
              const name = ruleLabel(r)
              /* After a move the row is keyed by id, but React may re-insert its
                 node to reorder, which blurs the arrow pressed; and at the top
                 or bottom that arrow disables. Either way focus would drop on
                 <body>, so it is put back: the same arrow, else the other one. */
              const moveAndKeepFocus = (to: number) => {
                onMove(i, to)
                const dir = to < i ? 'up' : 'down'
                window.setTimeout(() => {
                  const row = scroller.current?.querySelector<HTMLElement>(`[data-rule-id="${CSS.escape(r.id)}"]`)
                  const same = row?.querySelector<HTMLButtonElement>(`[data-move="${dir}"]:not(:disabled)`)
                  const other = row?.querySelector<HTMLButtonElement>(`[data-move="${dir === 'up' ? 'down' : 'up'}"]:not(:disabled)`)
                  ;(same ?? other ?? row?.querySelector<HTMLElement>('.bf__nodeselect'))?.focus()
                }, 0)
              }
              return (
                <Fragment key={r.id}>
                  <Link label={i === 0 ? undefined : 'No match'} onInsert={() => onInsert(i)} />

                  <motion.div
                    data-rule-id={r.id}
                    layout={!reduce}
                    transition={{ type: 'spring', stiffness: 480, damping: 40 }}
                    className={`bf__node ${selected === i ? 'is-on' : ''} ${r.enabled ? '' : 'is-off'} ${
                      shadowed.includes(i) ? 'is-shadowed' : ''
                    } ${drag?.from === i ? 'is-lifted' : ''} ${
                      drag && drag.over === i && drag.from !== i ? (drag.from < i ? 'is-under' : 'is-over') : ''
                    }`}
                    onMouseEnter={() => onHover(i)}
                    onMouseLeave={() => onHover(null)}
                    onDragOver={(e) => {
                      if (!drag) return
                      e.preventDefault()
                      e.dataTransfer.dropEffect = 'move'
                      if (drag.over !== i) setDrag({ ...drag, over: i })
                    }}
                    onDrop={(e) => {
                      if (!drag) return
                      e.preventDefault()
                      onReorder(drag.from, i)
                      setDrag(null)
                    }}
                  >
                    {/* Only the index starts a drag, so the card stays clickable
                        and its text stays selectable. v1's rule, kept. */}
                    <span
                      className="bf__nodeidx"
                      draggable
                      title="Drag to change the evaluation order"
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'move'
                        // Firefox refuses to start a drag without payload.
                        e.dataTransfer.setData('text/plain', r.id)
                        setDrag({ from: i, over: i })
                      }}
                      onDragEnd={() => setDrag(null)}
                    >
                      <GripVertical size={11} strokeWidth={1.9} aria-hidden />
                      {i + 1}
                    </span>

                    <span className={`bf__nodetile is-${TONE[r.decision]}`} aria-hidden>
                      <Tile size={15} strokeWidth={1.8} />
                    </span>

                    <button type="button" className="bf__nodeselect" aria-pressed={selected === i} onClick={() => onSelect(i)}>
                      <strong title={name}>{name}</strong>
                      {/* Who, then the rule's SHAPE — "Finance · 2 alternatives"
                          tells you who it is for and that there is an OR in
                          there without opening it. */}
                      <em>{ruleSummary(r, resolve)}</em>
                      {st !== 'ready' && (
                        <span className="u-sr-only">{st === 'warn' ? 'Worth a look' : 'Needs fixing'}</span>
                      )}
                    </button>

                    {/* State as a pill or an icon, never a dot. Off is a word;
                        a problem is its icon, named on hover. */}
                    {!r.enabled ? (
                      <Badge tone="neutral">Off</Badge>
                    ) : st === 'setup' ? (
                      <span className="bf__nodestate is-setup" title="Needs fixing" aria-hidden>
                        <XCircle size={14} strokeWidth={2} />
                      </span>
                    ) : st === 'warn' ? (
                      <span className="bf__nodestate is-warn" title="Worth a look" aria-hidden>
                        <AlertTriangle size={14} strokeWidth={2} />
                      </span>
                    ) : null}

                    <span className="bf__nodemove">
                      <button type="button" data-move="up" aria-label={`Move ${name} up`} disabled={i === 0} onClick={() => moveAndKeepFocus(i - 1)}>
                        ↑
                      </button>
                      <button
                        type="button"
                        data-move="down"
                        aria-label={`Move ${name} down`}
                        disabled={i === rules.length - 1}
                        onClick={() => moveAndKeepFocus(i + 1)}
                      >
                        ↓
                      </button>
                    </span>
                  </motion.div>
                </Fragment>
              )
            })}
          </LayoutGroup>

          <Link label={rules.length > 0 ? 'No match' : undefined} onInsert={() => onInsert(rules.length)} always />

          {/* The terminal, and it opens like every other row.

              It carried a ⋯ offering three decisions, which made it the one row
              on this panel edited in a menu rather than in the playground — and
              capped what it could say at those three. Click it and its outcome
              opens where every other outcome does. What stays fixed is its
              name, its place at the bottom, and that it cannot be deleted. */}
          <button
            type="button"
            className={`bf__node is-default ${fallbackOn ? 'is-on' : ''}`}
            aria-current={fallbackOn ? 'true' : undefined}
            onClick={onFallback}
          >
            <span className="bf__nodeidx is-lock" aria-hidden>
              <Asterisk size={12} strokeWidth={1.8} />
            </span>
            <span className={`bf__nodetile is-${TONE[fallback]}`} aria-hidden>
              {(() => {
                const Ico = TILE[fallback]
                return <Ico size={15} strokeWidth={1.8} />
              })()}
            </span>
            <span className="bf__nodeselect as-static">
              <strong>Nothing else matched</strong>
              <em>{FALLBACK_SUB[fallback]}</em>
              {fallbackState !== 'ready' && (
                <span className="u-sr-only">{fallbackState === 'warn' ? 'Worth a look' : 'Needs fixing'}</span>
              )}
            </span>
            {fallbackState === 'setup' ? (
              <span className="bf__nodestate is-setup" title="Needs fixing" aria-hidden>
                <XCircle size={14} strokeWidth={2} />
              </span>
            ) : fallbackState === 'warn' ? (
              <span className="bf__nodestate is-warn" title="Worth a look" aria-hidden>
                <AlertTriangle size={14} strokeWidth={2} />
              </span>
            ) : null}
          </button>
        </div>
      </div>
    </section>
  )
}

function Link({ label, onInsert, always }: { label?: string; onInsert: () => void; always?: boolean }) {
  return (
    <div className={`bf__link ${always ? 'is-always' : ''}`}>
      <span className="bf__linkline" aria-hidden />
      {label && <span className="bf__linklabel">{label}</span>}
      <button type="button" className="bf__linkadd" aria-label="Insert a rule here" title="Insert a rule here" onClick={onInsert}>
        <Plus size={11} strokeWidth={2.6} aria-hidden />
      </button>
    </div>
  )
}
