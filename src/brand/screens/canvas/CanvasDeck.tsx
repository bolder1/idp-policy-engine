import { Plus, Split } from 'lucide-react'

import type { Rule } from '../../data'
import type { NameLookup } from '../predicate-prose'
import type { Diagnostic } from '../diagnostics'
import { DECISION_NAME } from '../board/model'
import { branchSays, canDrop, trunkSays, type Dragged, type DropTarget, type Placed, type PredGraph } from '../../when-graph'
import { CondNodeCard } from './CondNode'
import type { Selected } from './ConditionCanvas'

/* -----------------------------------------------------------------------------
   The deck: a trunk that fans into branches, and rejoins.

   **The fan is CSS, not SVG.** There is no data-driven edge anywhere in this
   codebase — the five `<svg>` elements in it are progress rings, a tour mask and
   two illustrations — and a fixed-width branch makes the fan exactly
   expressible with borders: one horizontal rule inset by half a branch at each
   end, and a vertical drop from it per branch. The chain's own connector
   already works this way.

   **Nothing here computes a coordinate.** Branches are a flex row of
   fixed-width columns and conditions are a column inside one, so a drag can
   never make the rule `dirty` and undo can never strand a node somewhere the
   model does not describe. It also keeps `offsetWidth` and `offsetHeight`
   honest, which is the whole reason Fit can work on both axes.
   -------------------------------------------------------------------------- */

export function CanvasDeck({
  rule,
  graph,
  placed,
  findings,
  resolve,
  selected,
  drag,
  onSelect,
  onDrag,
  onFlipTrunk,
  onFlipBranch,
  onAddInto,
  onNewBranchAt,
}: {
  rule: Rule
  graph: PredGraph
  placed: Placed[]
  findings: Diagnostic[]
  resolve: NameLookup
  selected: Selected
  drag: { what: Dragged; over: DropTarget | null } | null
  onSelect: (s: Selected) => void
  onDrag: (d: { what: Dragged; over: DropTarget | null } | null) => void
  onFlipTrunk: () => void
  onFlipBranch: (id: string) => void
  onAddInto: (branchId: string) => void
  onNewBranchAt: () => void
}) {
  const many = placed.length > 1

  /* Only a target the writer would accept lights up.

     The affordance and the handler read the same `canDrop`, which is the half
     the editor being replaced got wrong: it drew "move into its own group" on
     every row while the writer refused whenever the row was alone, so the first
     row of every card had a control that visibly did nothing. */
  const lit = (t: DropTarget) => {
    if (!drag) return false
    const v = canDrop(graph, drag.what, t)
    return v.ok
  }
  const over = (t: DropTarget) => {
    const o = drag?.over
    if (!o) return false
    if (o.kind !== t.kind) return false
    if (o.kind === 'trunk' && t.kind === 'trunk') return o.at === t.at
    if (o.kind === 'branch' && t.kind === 'branch') return o.branchId === t.branchId && o.at === t.at
    if (o.kind === 'branch-head' && t.kind === 'branch-head') return o.branchId === t.branchId
    return false
  }

  return (
    <div className="cv__deck">
      <div className="cv__start" data-canvas-solid>
        A sign-in reaches this rule
      </div>

      {/* The trunk joiner, said in words.

          "OR" between two boxes does not say whether any branch is enough or
          every branch is required, and that is the entire meaning of the
          setting. The word is on the pill; the sentence is beside it. */}
      {many && (
        <div className="cv__trunkjoin" data-canvas-solid>
          <button
            type="button"
            className={`cv__join is-${graph.join}`}
            aria-label={`${trunkSays(graph.join, placed.length)}. Switch to ${graph.join === 'or' ? 'AND' : 'OR'}.`}
            onClick={onFlipTrunk}
          >
            {graph.join}
          </button>
          <em>{trunkSays(graph.join, placed.length)}</em>
        </div>
      )}

      <div className={`cv__fan ${many ? 'is-many' : ''}`}>
        {placed.map((p) => {
          const headTarget: DropTarget = { kind: 'branch-head', branchId: p.branch.id }
          return (
            <div className="cv__stem" key={p.branch.id}>
              <section
                className={`cv__branch ${selected.kind === 'branch' && selected.id === p.branch.id ? 'is-selected' : ''} ${
                  drag?.what.kind === 'branch' && drag.what.id === p.branch.id ? 'is-dragging' : ''
                } ${lit(headTarget) ? 'can-merge' : ''} ${over(headTarget) ? 'is-over' : ''}`}
                data-canvas-solid
                aria-label={p.branch.label ? `Branch ${p.branch.letter}, ${p.branch.label}` : `Branch ${p.branch.letter}`}
                onPointerEnter={() => drag && onDrag({ ...drag, over: headTarget })}
              >
                {/* The header is the branch's only drag handle, and it has
                    exactly two legal drops, both on the trunk. That is the
                    geometry that refuses nesting: there is nowhere to put a
                    branch except beside another one. */}
                <header
                  className="cv__branchhead"
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    onDrag({ what: { kind: 'branch', id: p.branch.id }, over: null })
                  }}
                  onClick={() => onSelect({ kind: 'branch', id: p.branch.id })}
                >
                  <span className="cv__letter">{p.branch.letter}</span>
                  <span className="cv__branchname">{p.branch.label ?? <em>Unnamed</em>}</span>
                  {p.nodes.length > 1 && (
                    <button
                      type="button"
                      className={`cv__join is-${p.branch.join} is-sm`}
                      aria-label={`${branchSays(p.branch.join, p.nodes.length)}. Switch to ${p.branch.join === 'and' ? 'OR' : 'AND'}.`}
                      onClick={(e) => {
                        e.stopPropagation()
                        onFlipBranch(p.branch.id)
                      }}
                    >
                      {p.branch.join}
                    </button>
                  )}
                </header>

                <div className="cv__nodes">
                  {p.nodes.length === 0 && (
                    /* An empty branch is not nothing — it matches everything,
                       which is what makes it dangerous. The linter says the
                       same thing at the same moment; this is the friendly half
                       of a finding that also blocks publishing. */
                    <p className="cv__empty">Nothing here yet, so this branch matches every sign-in.</p>
                  )}
                  {p.nodes.map((n) => {
                    const t: DropTarget = { kind: 'branch', branchId: p.branch.id, at: n.at }
                    return (
                      <div key={n.node.id} onPointerEnter={() => drag && lit(t) && onDrag({ ...drag, over: t })}>
                        {n.at > 0 && (
                          /* Printed, not a control. One joiner per level means
                             one setting shown between each pair, not one per
                             gap — but a reader in the middle of a long branch
                             should not have to scroll to its head to learn what
                             joins it. */
                          <span className="cv__nodejoin" aria-hidden>
                            {p.branch.join}
                          </span>
                        )}
                        <CondNodeCard
                          node={n.node}
                          resolve={resolve}
                          selected={selected.kind === 'node' && selected.id === n.node.id}
                          dragging={drag?.what.kind === 'node' && drag.what.id === n.node.id}
                          dropping={over(t)}
                          finding={findings.find((d) => d.id.includes(n.node.id))}
                          onSelect={() => onSelect({ kind: 'node', id: n.node.id })}
                          onGrab={() => onDrag({ what: { kind: 'node', id: n.node.id }, over: null })}
                        />
                      </div>
                    )
                  })}

                  <button type="button" className="cv__add" onClick={() => onAddInto(p.branch.id)}>
                    <Plus size={12} strokeWidth={2.4} aria-hidden />
                    Add condition
                  </button>
                </div>
              </section>
            </div>
          )
        })}

        {/* The only structural verb, and it is on the TRUNK rather than in the
            palette. A branch's only possible parent is the root, so the refusal
            of nesting is geometric rather than validated. */}
        <div
          className={`cv__stem cv__stem--new ${lit({ kind: 'trunk', at: placed.length }) ? 'can-drop' : ''} ${
            over({ kind: 'trunk', at: placed.length }) ? 'is-over' : ''
          }`}
          onPointerEnter={() => drag && lit({ kind: 'trunk', at: placed.length }) && onDrag({ ...drag, over: { kind: 'trunk', at: placed.length } })}
        >
          <button type="button" className="cv__newbranch" data-canvas-solid onClick={onNewBranchAt}>
            <Split size={13} strokeWidth={2} aria-hidden />
            New branch
            <em>Another way this rule can match</em>
          </button>
        </div>
      </div>

      <div className="cv__end" data-canvas-solid>
        then <b>{DECISION_NAME[rule.decision]}</b>
      </div>
    </div>
  )
}
