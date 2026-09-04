import { Split, Trash2 } from 'lucide-react'

import { Button } from '../../kit'
import { Picker } from '../../picker'
import { CONDITION_CATALOGUE, conditionType, type Rule } from '../../data'
import { useBrand, useNameLookup } from '../../store'
import type { Diagnostic } from '../diagnostics'
import { ValueControl } from '../value-control'
import { branchSays, type Branch, type CondNode, type PredGraph } from '../../when-graph'

/* -----------------------------------------------------------------------------
   The one editor on the canvas.

   Nodes are read-only, so everything a person changes about a condition happens
   here: what it checks, how it compares, and what it compares against. That is
   the answer to "a canvas will add clicks" — it does not, because the panel is
   already open and a condition added from the palette arrives selected with its
   value control focused.

   With nothing selected the panel explains the model rather than going blank,
   and it is the place the two-level answer lives. Somebody who has just tried
   to drag a branch inside another branch is looking here for why it did not
   work, and a toast would have gone by the time they looked.
   -------------------------------------------------------------------------- */

export function CanvasPanel({
  rule,
  graph,
  node,
  branch,
  findings,
  shortcuts,
  onPatchValues,
  onPatchOperator,
  onRetype,
  onRemoveNode,
  onSplitOut,
  onRenameBranch,
  onRemoveBranch,
}: {
  rule: Rule
  graph: PredGraph
  node?: CondNode
  branch?: Branch
  findings: Diagnostic[]
  shortcuts: [string, string][]
  onPatchValues: (id: string, values: string[]) => void
  onPatchOperator: (id: string, operator: string) => void
  onRetype: (id: string, typeId: string) => void
  onRemoveNode: (id: string) => void
  onSplitOut: (id: string) => void
  onRenameBranch: (id: string, label: string) => void
  onRemoveBranch: (id: string) => void
}) {
  const store = useBrand()
  const resolve = useNameLookup()

  return (
    <aside className="cv__panel" aria-label="What is selected">
      {node ? (
        <NodePane
          node={node}
          graph={graph}
          findings={findings}
          store={store}
          resolve={resolve}
          onPatchValues={onPatchValues}
          onPatchOperator={onPatchOperator}
          onRetype={onRetype}
          onRemove={onRemoveNode}
          onSplitOut={onSplitOut}
        />
      ) : branch ? (
        <BranchPane branch={branch} graph={graph} onRename={onRenameBranch} onRemove={onRemoveBranch} />
      ) : (
        <ShapePane rule={rule} graph={graph} shortcuts={shortcuts} />
      )}
    </aside>
  )
}

function NodePane({
  node,
  graph,
  findings,
  store,
  resolve,
  onPatchValues,
  onPatchOperator,
  onRetype,
  onRemove,
  onSplitOut,
}: {
  node: CondNode
  graph: PredGraph
  findings: Diagnostic[]
  store: ReturnType<typeof useBrand>
  resolve: ReturnType<typeof useNameLookup>
  onPatchValues: (id: string, values: string[]) => void
  onPatchOperator: (id: string, operator: string) => void
  onRetype: (id: string, typeId: string) => void
  onRemove: (id: string) => void
  onSplitOut: (id: string) => void
}) {
  const t = conditionType(node.typeId)
  const home = graph.branches.map((b) => graph.branchById[b]).find((b) => b.members.includes(node.id))
  const alone = (home?.members.length ?? 0) < 2
  const finding = findings.find((d) => d.id.includes(node.id))

  return (
    <>
      <header className="cv__panelhead">
        <b>{t.label}</b>
        <em>{t.hint}</em>
      </header>

      <div className="cv__field">
        <label>What to check</label>
        {/* Changing the attribute resets the operator and the value, because
            carrying them over produces a condition naming an operator its type
            does not have — which the linter cannot describe and the evaluator
            reads as never matching. */}
        <Picker
          label="Attribute"
          width="fill"
          searchable
          value={node.typeId}
          options={CONDITION_CATALOGUE.map((c) => ({ value: c.id, label: c.label, meta: c.group }))}
          onChange={(id) => onRetype(node.id, id)}
        />
      </div>

      <div className="cv__field">
        <label>How</label>
        <Picker
          label={`${t.label} operator`}
          width="fill"
          value={node.operator}
          options={t.operators.map((o) => ({ value: o, label: o }))}
          onChange={(o) => onPatchOperator(node.id, o)}
        />
      </div>

      <div className="cv__field">
        <label>What to compare against</label>
        <div className="cv__value">
          <ValueControl
            type={t}
            values={node.values}
            store={store}
            resolve={resolve}
            autoOpen={false}
            onChange={(v) => onPatchValues(node.id, v)}
          />
        </div>
      </div>

      {finding && (
        <p className={`cv__finding is-${finding.severity}`}>
          <b>{finding.title}</b>
          {finding.detail}
        </p>
      )}

      <footer className="cv__panelfoot">
        {/* Absent when it would do nothing. Splitting a condition that is
            already the only one in its branch produces the same predicate with
            a different branch id, so the writer refuses it — and a button that
            refuses is what taught people the last editor was broken. */}
        {!alone && (
          <Button variant="secondary" size="sm" onClick={() => onSplitOut(node.id)}>
            <Split size={13} strokeWidth={2} aria-hidden /> Move to its own branch
          </Button>
        )}
        <Button variant="danger" size="sm" onClick={() => onRemove(node.id)}>
          <Trash2 size={13} strokeWidth={2} aria-hidden /> Remove
        </Button>
      </footer>
    </>
  )
}

function BranchPane({
  branch,
  graph,
  onRename,
  onRemove,
}: {
  branch: Branch
  graph: PredGraph
  onRename: (id: string, label: string) => void
  onRemove: (id: string) => void
}) {
  return (
    <>
      <header className="cv__panelhead">
        <b>Branch {branch.letter}</b>
        <em>{branchSays(branch.join, branch.members.length)}</em>
      </header>

      <div className="cv__field">
        <label htmlFor="cv-branch-name">Name</label>
        {/* The one model field with exactly one editor in the whole product
            before this, and no board surface has ever shown it. A branch a
            person named is a branch the trace, the linter and the change list
            can all refer to by that name instead of by a letter. */}
        <input
          id="cv-branch-name"
          className="cv__input"
          value={branch.label ?? ''}
          placeholder="Corporate laptops"
          onChange={(e) => onRename(branch.id, e.target.value)}
        />
        <p className="cv__hint">Optional. Used wherever this branch is named — findings, the readback, the trace.</p>
      </div>

      <footer className="cv__panelfoot">
        {/* Removing the only branch would leave a rule that catches every
            sign-in reaching it, which is a real thing to want and a dangerous
            thing to do by accident — so it stays available and the readback
            says what it did. */}
        <Button variant="danger" size="sm" onClick={() => onRemove(branch.id)}>
          <Trash2 size={13} strokeWidth={2} aria-hidden /> Remove branch
        </Button>
        {graph.branches.length === 1 && <p className="cv__hint">This is the only branch, so the rule would catch everything that reaches it.</p>}
      </footer>
    </>
  )
}

/* Nothing selected, so the panel says what the shape is.

   Not an empty state. This is where the answer to "why can I not put a branch
   inside a branch" lives, and it has to be somewhere a person can go and READ
   it — a toast fired at the moment of a refused drag is gone before anybody
   looks for the reason. */
function ShapePane({ rule, graph, shortcuts }: { rule: Rule; graph: PredGraph; shortcuts: [string, string][] }) {
  const branches = graph.branches.length
  const conditions = Object.keys(graph.nodeById).length

  return (
    <>
      <header className="cv__panelhead">
        <b>This rule</b>
        <em>
          {conditions === 0
            ? 'No conditions yet, so it catches every sign-in that reaches it.'
            : `${conditions} condition${conditions === 1 ? '' : 's'} across ${branches} branch${branches === 1 ? '' : 'es'}.`}
        </em>
      </header>

      <div className="cv__shape">
        <h3>Two levels, on purpose</h3>
        <p>
          A rule is branches, and a branch is conditions. That is as deep as it goes — a branch cannot hold another
          branch, which is why there is nowhere to drop one.
        </p>
        <p>
          It is a limit worth having: every check that decides whether a rule can ever run — whether two conditions
          cancel out, whether one rule hides another — is built on a branch being a plain run. Allow nesting and those
          checks go quiet exactly where they are needed.
        </p>
        <p>
          Anything you can express with nesting, you can express here. Drag a branch onto another branch’s header to
          fold them together; drag a condition onto the trunk to give it a branch of its own.
        </p>
      </div>

      <div className="cv__keys">
        <h3>Keys</h3>
        <dl>
          {shortcuts.map(([k, what]) => (
            <div key={k}>
              <dt>
                {k.split(' ').map((part) => (
                  <kbd key={part}>{part}</kbd>
                ))}
              </dt>
              <dd>{what}</dd>
            </div>
          ))}
        </dl>
      </div>

      <p className="cv__hint">
        Changes here go straight into the draft, so Discard and Undo on the board still cover them. Nothing is published
        until you publish it — this rule decides <b>{rule.decision === 'deny' ? 'Deny' : rule.decision === '2fa' ? 'Let in, then verify' : 'Let in'}</b>.
      </p>
    </>
  )
}
