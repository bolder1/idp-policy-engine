import { Plus, Split } from 'lucide-react'

import { CONDITION_CATALOGUE, CONDITION_GROUPS } from '../../data'
import { groupIcon } from '../board/tones'

/* -----------------------------------------------------------------------------
   What you can add, and where it will land.

   The destination is NAMED in the header rather than discovered after the
   click. "Add" has three meanings in this model and always did — into this
   branch, into a new one, into the only one there is — and the editor being
   replaced expressed them as three buttons in three places, which is a choice
   nobody can make correctly without trying it.

   **No Events / Blocks tab split**, and no containers. The reference this was
   modelled on has two tabs because a workflow has events and blocks; a rule has
   one kind of thing to add, and a tab strip with one meaningful tab is a seam.
   The reference's structural rows — Parallel Branch, If/Else Branch, Switch
   Case Branch — are exactly where nesting would come from, and none of them is
   carried over or faked. The one structural verb sits at the end of the fan, on
   the trunk, because a branch's only possible parent is the root.

   Rows are real buttons, not divs with pointer handlers: a palette row adds a
   condition, so it has to be reachable by Tab and fire on Enter.
   -------------------------------------------------------------------------- */

/* The people questions first, under a heading the catalogue does not have.

   With the audience no longer a property of the policy, the first thing a rule
   answers is who it is for — so the four types that answer it are surfaced
   above the rest. It is a grouping over existing catalogue entries; no
   `ConditionType` moves and `CONDITION_GROUPS` is untouched. */
const WHO = ['group', 'user', 'user-type', 'user-role']
const METHOD_GROUPS = new Set(['Phishing-Resistant', 'Standard MFA', 'Fallback & Recovery'])

export function CanvasPalette({
  destination,
  branchLetter,
  onAdd,
  onNewBranch,
}: {
  destination: string | 'new'
  /** The letter of the branch a click would land in, when there is only one. */
  branchLetter?: string
  onAdd: (typeId: string) => void
  onNewBranch: () => void
}) {
  const pool = CONDITION_CATALOGUE.filter((c) => !METHOD_GROUPS.has(c.group))
  const who = pool.filter((c) => WHO.includes(c.id))
  const rest = CONDITION_GROUPS.map((g) => ({
    group: g,
    items: pool.filter((c) => c.group === g && !WHO.includes(c.id)),
  })).filter((s) => s.items.length > 0)

  const where = destination === 'new' ? 'a new branch' : branchLetter ? `branch ${branchLetter}` : 'the branch you choose'

  return (
    <aside className="cv__palette" aria-label="Conditions you can add">
      <div className="cv__palettehead">
        <b>Add a condition</b>
        <em>Lands in {where}.</em>
      </div>

      <div className="cv__palettelist">
        <h3 className="cv__palettegroup">Who</h3>
        {who.map((c) => (
          <Row key={c.id} id={c.id} label={c.label} hint={c.hint} group={c.group} onAdd={onAdd} />
        ))}

        {rest.map((s) => (
          <div key={s.group}>
            <h3 className="cv__palettegroup">{s.group}</h3>
            {s.items.map((c) => (
              <Row key={c.id} id={c.id} label={c.label} hint={c.hint} group={c.group} onAdd={onAdd} />
            ))}
          </div>
        ))}

        <h3 className="cv__palettegroup">Structure</h3>
        <button type="button" className="cv__paletterow is-structure" onClick={onNewBranch}>
          <i aria-hidden>
            <Split size={13} strokeWidth={2} />
          </i>
          <span>
            <b>New branch</b>
            <em>Another way this rule can match.</em>
          </span>
        </button>
      </div>
    </aside>
  )
}

function Row({
  id,
  label,
  hint,
  group,
  onAdd,
}: {
  id: string
  label: string
  hint: string
  group: string
  onAdd: (typeId: string) => void
}) {
  const Ico = groupIcon(group)
  return (
    <button type="button" className="cv__paletterow" onClick={() => onAdd(id)}>
      <i aria-hidden>
        <Ico size={13} strokeWidth={2} />
      </i>
      <span>
        <b>{label}</b>
        <em>{hint}</em>
      </span>
      <Plus size={12} strokeWidth={2.4} aria-hidden className="cv__paletteplus" />
    </button>
  )
}
