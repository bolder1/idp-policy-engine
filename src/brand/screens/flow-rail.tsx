import { Fragment, useEffect, useRef, useState } from 'react'
import { LayoutGroup, motion, useReducedMotion } from 'motion/react'
import { GripVertical, Home, KeyRound, PanelLeftClose, Plus, ShieldAlert, UserCheck } from 'lucide-react'

import type { AccessDecision, Policy } from '../data'
import { ruleState } from './rule-form'
import type { Diagnostic } from './diagnostics'
import { predicateSummary } from './predicate-prose'

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

const TILE = { deny: ShieldAlert, '2fa': KeyRound, '1fa': UserCheck } as const
const TONE = { deny: 'deny', '2fa': 'mfa', '1fa': 'allow' } as const

/** Said as a consequence, not as a setting — this row is read far more than set. */
export const FALLBACK_SUB: Record<AccessDecision, string> = {
  '1fa': 'signs in on one factor',
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
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null)
  const rules = policy.rules
  const fallback = policy.fallback?.decision ?? '1fa'
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
          <em>Top to bottom · first match wins</em>
        </span>
        <span className="bf__flowcount">{rules.length}</span>
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
          {/* The audience is not drawn here. It is a property of the policy,
              not the first node of its program, and it has one home: the strip
              above the builder, beside the name and the applications. */}
          <p className="bf__flowstart">
            <span aria-hidden />
            A user attempts to sign in
          </p>

          <LayoutGroup>
            {rules.map((r, i) => {
              const st = ruleState(diagnostics.filter((d) => d.ruleIndex === i))
              const Tile = TILE[r.decision]
              return (
                <Fragment key={r.id}>
                  <Link label={i === 0 ? undefined : 'no match'} onInsert={() => onInsert(i)} />

                  <motion.div
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
                      <strong title={r.name}>{r.name}</strong>
                      {/* The rule's SHAPE, not just its size — "2 alternatives"
                          tells you there is an OR in there without opening it,
                          which is the one thing a count could never say. */}
                      <em>
                        {predicateSummary(r.when)}
                        {!r.enabled && ' · off'}
                      </em>
                    </button>

                    <span className={`bf__nodepip is-${st}`} title={st === 'ready' ? 'Nothing to fix' : st === 'warn' ? 'Worth a look' : 'Needs setting up'} />

                    <span className="bf__nodemove">
                      <button type="button" aria-label={`Move ${r.name} up`} disabled={i === 0} onClick={() => onMove(i, i - 1)}>
                        ↑
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${r.name} down`}
                        disabled={i === rules.length - 1}
                        onClick={() => onMove(i, i + 1)}
                      >
                        ↓
                      </button>
                    </span>
                  </motion.div>
                </Fragment>
              )
            })}
          </LayoutGroup>

          <Link label={rules.length > 0 ? 'no match' : undefined} onInsert={() => onInsert(rules.length)} always />

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
              <Home size={12} strokeWidth={1.8} />
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
            </span>
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
