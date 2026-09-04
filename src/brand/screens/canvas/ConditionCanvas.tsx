import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Check, Maximize2, Minus, Plus, Redo2, Undo2, X } from 'lucide-react'

import { Button } from '../../kit'
import { conditionType, type Predicate, type Rule } from '../../data'
import { useNameLookup } from '../../store'
import { useCanvasView } from '../canvas-view'
import { ConditionPicker } from '../rule-form'
import type { Diagnostic } from '../diagnostics'
import {
  addBranch,
  addCondition,
  flipBranchJoin,
  flipTrunkJoin,
  freshCondition,
  mergeBranches,
  moveBranch,
  moveCondition,
  patchCondition,
  removeBranch,
  removeCondition,
  renameBranch,
  retypeCondition,
  splitOut,
} from '../../when-ops'
import { canDrop, layout, toGraph, type Dragged, type DropTarget } from '../../when-graph'
import { CanvasDeck } from './CanvasDeck'
import { CanvasPalette } from './CanvasPalette'
import { CanvasPanel } from './CanvasPanel'

import './canvas.css'

/* -----------------------------------------------------------------------------
   The condition canvas.

   One rule's WHEN, on a pan-and-zoom stage: a trunk that fans into branches,
   each branch a column of conditions, joined by one settable word per level.
   It is the only place a person edits conditions now — the panels on both
   builders read the predicate and hand off to this.

   **A layer, not a route and not a Modal.**

   Not a route, because the draft is component-local state in the builder and
   `store.go` swaps which component renders, destroying it and all sixty undo
   states. Worse, the leave guard is consulted on the way IN with no
   destination, so pressing "Edit conditions" on a dirty draft would raise
   "Leave without publishing?" — asking somebody to discard the work they are
   trying to edit.

   Not a kit `Modal`, because a modal is a box with a max height and a scrolling
   body, and a canvas inside a scroll container is a canvas whose own
   `preventDefault` wheel handler kills the scroll it is sitting in.

   So: a fixed layer with `role="dialog" aria-modal="true"`, and the builder's
   root goes `inert` behind it. The role is not decoration — the board's key
   handler already bails on `document.querySelector('[role="dialog"]')`, so all
   eleven of its bindings die the instant this mounts. Without that, ↑↓, ⌘D,
   Del and `e` would keep editing the chain behind the canvas.
   -------------------------------------------------------------------------- */

const CANVAS_SHORTCUTS: [string, string][] = [
  ['⌥↑ ⌥↓', 'Move the selected condition within its branch'],
  ['Del', 'Remove the selected condition'],
  ['⌘Z ⇧⌘Z', 'Undo, redo — the policy, not the field'],
  ['Esc', 'Close the canvas'],
]

export type Selected = { kind: 'none' } | { kind: 'node'; id: string } | { kind: 'branch'; id: string }

export function ConditionCanvas({
  rule,
  index,
  findings,
  onChange,
  onUndo,
  onRedo,
  onClose,
}: {
  rule: Rule
  index: number
  findings: Diagnostic[]
  onChange: (when: Predicate) => void
  onUndo: () => void
  onRedo: () => void
  onClose: () => void
}) {
  const resolve = useNameLookup()
  const stage = useRef<HTMLDivElement | null>(null)
  const world = useRef<HTMLDivElement | null>(null)
  const [sel, setSel] = useState<Selected>({ kind: 'none' })
  const [adding, setAdding] = useState<{ into: string | 'new' } | null>(null)
  const [drag, setDrag] = useState<{ what: Dragged; over: DropTarget | null } | null>(null)

  const g = toGraph(rule.when)
  const placed = layout(g)

  /* Resolved every render rather than held.

     Undo can take the branch or the condition out from under an open panel, and
     a selection pointing at something gone is the same state as nothing
     selected — which is already a state this panel draws. Keying by id and
     re-resolving is the same discipline the board's own `Selection` uses, and
     for the same reason. */
  const selNode = sel.kind === 'node' ? g.nodeById[sel.id] : undefined
  const selBranch = sel.kind === 'branch' ? g.branchById[sel.id] : undefined

  const { viewRef, zoomLabel, panning, fit, zoomBy, onPointerDown, onPointerMove, onPointerUp } = useCanvasView(stage, world, {
    bounds: () => ({ w: world.current?.offsetWidth ?? 0, h: world.current?.offsetHeight ?? 0 }),
    /* No reserve, and that is the difference between this canvas and the board's.

       The board's inspector FLOATS over its stage, so its width has to be
       subtracted by hand. Here the palette and the panel are grid columns, so
       `stage.clientWidth` has already excluded both — subtracting the panel
       again took a third of the usable width off a 605px stage and pinned Fit
       to its floor on any rule with more than two branches. */
    /* A predicate is short and wide where a rule chain is long and narrow, so
       this fits both axes. A branch taller than the stage still crops, which is
       what the pan is for. */
    axis: 'both',
    isPannableTarget: (t) => !!t.closest('[data-canvas-surface]') && !t.closest('[data-canvas-solid]'),
    onBackgroundClick: () => setSel({ kind: 'none' }),
    zMin: 0.4,
    zMax: 1.25,
  })

  /* Escape, and nothing else from the board.

     Guarded on an open scrim the same way the board guards its own, so backing
     out of the condition catalogue closes the catalogue and not the canvas
     underneath it. ⌘Z is deliberately NOT handled here: it reaches the
     builder's history, which is right, because there is one policy and one
     stack. The bottom bar carries explicit Undo and Redo so the boundary
     between undoing the policy and undoing your typing is findable rather than
     a trap. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
      if (e.key === 'Escape' && !document.querySelector('.bx-scrim')) {
        e.preventDefault()
        onClose()
        return
      }
      if (typing) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel.kind === 'node') {
        e.preventDefault()
        onChange(removeCondition(rule.when, sel.id))
        setSel({ kind: 'none' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onChange, onClose, rule.when, sel])

  /* Focus lands on the panel, not on the first node.

     The canvas opens with nothing selected, and the panel is where the answer
     to "what is this" lives — including the sentence explaining why a rule has
     two levels. Starting on a node would skip it. */
  const layerRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const id = requestAnimationFrame(() => layerRef.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [])

  const insert = (typeId: string) => {
    const t = conditionType(typeId)
    const c = freshCondition(typeId, t.operators[0])
    const into = adding?.into ?? (g.branches.length === 1 ? g.branches[0] : 'new')
    onChange(addCondition(rule.when, into, c))
    /* Selected, so the panel lands on its value control. A condition arriving
       unset with no prompt is how a rule quietly acquires a check that matches
       nothing. */
    setSel({ kind: 'node', id: c.id })
    setAdding(null)
  }

  const drop = () => {
    if (!drag || !drag.over) return setDrag(null)
    const v = canDrop(g, drag.what, drag.over)
    if (!v.ok) return setDrag(null)
    const t = drag.over
    if (drag.what.kind === 'node') {
      if (t.kind === 'branch') onChange(moveCondition(rule.when, drag.what.id, t.branchId, t.at))
      else if (t.kind === 'trunk') onChange(splitOut(rule.when, drag.what.id))
    } else if (drag.what.kind === 'branch') {
      if (t.kind === 'trunk') onChange(moveBranch(rule.when, g.branches.indexOf(drag.what.id), t.at))
      else if (t.kind === 'branch-head') onChange(mergeBranches(rule.when, drag.what.id, t.branchId))
    }
    setDrag(null)
  }

  const title = `Conditions · rule ${index + 1}${rule.name ? ` · ${rule.name}` : ''}`

  return (
    <div
      ref={layerRef}
      className="cv"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      tabIndex={-1}
      onPointerUp={drop}
    >
      <header className="cv__bar">
        <div className="cv__bar__what">
          <b>{rule.name || `Rule ${index + 1}`}</b>
          <em>When does this rule apply?</em>
        </div>
        <div className="cv__bar__acts">
          <button type="button" className="cv__act" aria-label="Undo" title="Undo (⌘Z)" onClick={onUndo}>
            <Undo2 size={14} strokeWidth={2} />
          </button>
          <button type="button" className="cv__act" aria-label="Redo" title="Redo (⇧⌘Z)" onClick={onRedo}>
            <Redo2 size={14} strokeWidth={2} />
          </button>
          <span className="cv__sep" />
          <Button variant="brand" size="sm" onClick={onClose}>
            <Check size={14} strokeWidth={2.2} aria-hidden /> Done
          </Button>
        </div>
      </header>

      <div className="cv__body">
        <CanvasPalette
          destination={adding?.into ?? (g.branches.length === 1 ? g.branches[0] : 'new')}
          branchLetter={g.branches.length === 1 ? g.branchById[g.branches[0]]?.letter : undefined}
          onAdd={insert}
          onNewBranch={() => {
            const next = addBranch(rule.when)
            onChange(next)
            const made = next.cards[next.cards.length - 1]
            setSel({ kind: 'branch', id: made.id })
          }}
        />

        <div
          ref={stage}
          className={`cv__stage ${panning ? 'is-panning' : ''}`}
          data-canvas-surface
          style={{ '--cv-x': `${viewRef.current.x}px`, '--cv-y': `${viewRef.current.y}px`, '--cv-z': viewRef.current.z } as CSSProperties}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div
            ref={world}
            className="cv__world"
            style={{ transform: `translate3d(${viewRef.current.x}px, ${viewRef.current.y}px, 0) scale(${viewRef.current.z})` }}
          >
            <CanvasDeck
              rule={rule}
              graph={g}
              placed={placed}
              findings={findings}
              resolve={resolve}
              selected={sel}
              drag={drag}
              onSelect={setSel}
              onDrag={setDrag}
              onFlipTrunk={() => onChange(flipTrunkJoin(rule.when))}
              onFlipBranch={(id) => onChange(flipBranchJoin(rule.when, id))}
              onAddInto={(into) => setAdding({ into })}
              onNewBranchAt={() => setAdding({ into: 'new' })}
            />
          </div>

          <div className="cv__float cv__float--br" role="group" aria-label="Zoom">
            <button type="button" className="cv__act" aria-label="Fit the rule in view" title="Fit" onClick={fit}>
              <Maximize2 size={14} strokeWidth={2} />
            </button>
            <span className="cv__sep" />
            <button type="button" className="cv__act" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.15)}>
              <Minus size={14} strokeWidth={2} />
            </button>
            <span className="cv__zoom" ref={zoomLabel}>
              {Math.round(viewRef.current.z * 100)}%
            </span>
            <button type="button" className="cv__act" aria-label="Zoom in" onClick={() => zoomBy(1.15)}>
              <Plus size={14} strokeWidth={2} />
            </button>
          </div>
        </div>

        <CanvasPanel
          rule={rule}
          graph={g}
          node={selNode}
          branch={selBranch}
          findings={findings}
          shortcuts={CANVAS_SHORTCUTS}
          onPatchValues={(id, values) => onChange(patchCondition(rule.when, id, { values }))}
          onPatchOperator={(id, operator) => onChange(patchCondition(rule.when, id, { operator }))}
          onRetype={(id, typeId) => onChange(retypeCondition(rule.when, id, typeId, conditionType(typeId).operators[0]))}
          onRemoveNode={(id) => {
            onChange(removeCondition(rule.when, id))
            setSel({ kind: 'none' })
          }}
          onSplitOut={(id) => onChange(splitOut(rule.when, id))}
          onRenameBranch={(id, label) => onChange(renameBranch(rule.when, id, label))}
          onRemoveBranch={(id) => {
            onChange(removeBranch(rule.when, id))
            setSel({ kind: 'none' })
          }}
        />
      </div>

      {/* The catalogue is the trail's dialog, reused rather than re-implemented.

          The board deleted its own anchored copy of this once already, on the
          argument that two pickers over one catalogue drift: an attribute added
          to the model shows up in both, but a fix to the search ranking or the
          keyboard cursor lands in whichever one the person was looking at. A
          palette with its own list would have been the third. */}
      <ConditionPicker open={adding !== null} title="Add a condition" onClose={() => setAdding(null)} onPick={insert} />
    </div>
  )
}

/** The close affordance the header does not carry, for narrow layouts. */
export function CanvasClose({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" className="cv__act" aria-label="Close the canvas" title="Close (Esc)" onClick={onClose}>
      <X size={15} strokeWidth={2} />
    </button>
  )
}
