import type { ReactNode } from 'react'

import { Button, DeleteButton, Modal } from '../kit'
import { ChangeState } from '../leave-guard'
import { useBrand } from '../store'
import type { DeleteImpact, PolicyUse } from './usage'

/* One delete confirmation for everything the Policies area can delete: a policy,
   a zone, a device profile, a risk profile, a hook.

   Two outcomes, never a third:
   - A live policy still uses it: the delete is refused and the dialog lists
     the rules to change first. Deleting would make those rules stop matching
     without anyone publishing anything.
   - Otherwise: Cancel or Delete. Anything not live that uses it is named, and
     its rules are flagged until they point at something else. */

export function ConfirmDelete({
  open,
  name,
  noun,
  impact,
  detail,
  onCancel,
  onConfirm,
}: {
  open: boolean
  /** The object's own name, as the admin knows it. */
  name: string
  /** Lower case: 'zone', 'device profile', 'policy'. */
  noun: string
  /** Omit for objects no rule can reference, such as a policy. */
  impact?: DeleteImpact
  /** One extra fact about the object itself, such as the apps a policy protects. */
  detail?: ReactNode
  onCancel: () => void
  onConfirm: () => void
}) {
  const blocked = !!impact && impact.live.length > 0

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={blocked ? `Can't delete ${name}` : `Delete ${name}?`}
      width={480}
      footer={
        blocked ? (
          <Button variant="secondary" onClick={onCancel}>
            Close
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <DeleteButton size="md" onClick={onConfirm} />
          </>
        )
      }
    >
      <div className="bx-confirm">
        {detail && <p>{detail}</p>}
        {blocked ? (
          <>
            <p>Live policies use this {noun}. Remove it from these rules first.</p>
            <UseList uses={impact.live} onOpen={onCancel} />
          </>
        ) : impact && impact.later.length > 0 ? (
          <>
            <p>These rules will need another {noun} before their policy can go live.</p>
            <UseList uses={impact.later} onOpen={onCancel} />
          </>
        ) : impact ? (
          <p>No policy uses this {noun}.</p>
        ) : null}
      </div>
    </Modal>
  )
}

function UseList({ uses, onOpen }: { uses: PolicyUse[]; onOpen: () => void }) {
  const store = useBrand()
  return (
    <ul className="bx-confirm__uses">
      {uses.map((u) => (
        <li key={u.policy.id}>
          <button
            type="button"
            className="bx-confirm__policy"
            onClick={() => {
              onOpen()
              store.go({ name: 'board', policyId: u.policy.id })
            }}
          >
            {u.policy.name}
          </button>
          <span className="bx-confirm__rules">{u.rules.map((r) => r.name).join(', ')}</span>
          {u.draft && <ChangeState unsaved={false} draft />}
        </li>
      ))}
    </ul>
  )
}
