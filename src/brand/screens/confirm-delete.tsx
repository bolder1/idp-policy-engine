import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'

import { Button, Callout, DeleteButton, Modal } from '../kit'
import { ChangeState } from '../leave-guard'
import { useBrand } from '../store'
import { DELETE_WORD, deleteConfirmed, type DeleteImpact, type PolicyUse } from './usage'

/* One delete confirmation for everything the Policies area can delete: a policy,
   a zone, a device profile, a risk profile, a hook, a display token.

   A HARD delete, every time (owner, 21 Sep 2026: "make a hard delete, no soft
   delete"). Nothing is archived and nothing comes back, so the dialog is built
   as a decision rather than a notice, and reads top to bottom in the order the
   admin has to weigh it:

     1. It is permanent.
     2. What it does to the policies that use it.
     3. Type DELETE — only when (2) changes who can sign in.

   This dialog used to REFUSE while a live policy used the object: "Can't
   delete X", a list, and Close. It read as an error rather than a delete, and
   it left the admin nothing to decide. Live policies are now moved to draft
   instead (see `DeleteImpact.live` for why draft, and not the other two). The
   one refusal left is a SYSTEM policy, which cannot become a draft.

   Typing is asked for only when the delete changes live sign-ins. Deleting a
   zone nobody uses is one click; deleting one that four live policies depend
   on is not, and should not feel like it is. */

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
  const store = useBrand()
  const live = impact?.live ?? []
  const later = impact?.later ?? []
  const stuck = impact?.stuck ?? []
  const refused = stuck.length > 0
  const typeToConfirm = !refused && live.length > 0

  const [typed, setTyped] = useState('')
  const fieldId = useId()
  const box = useRef<HTMLInputElement | null>(null)

  /* A fresh field for every delete. Without this, cancelling "Corporate
     managed" and opening "BYOD phones" would open with the old name typed and
     the button already armed for a different object. */
  useEffect(() => {
    setTyped('')
  }, [open, name])

  /* Straight into the field: an admin who has decided wants to type, not to
     find the box first. The dialog chrome only moves focus to the panel when
     it is not already inside it, so this is not undone. */
  useEffect(() => {
    if (!open || !typeToConfirm) return
    const t = window.setTimeout(() => box.current?.focus(), 0)
    return () => window.clearTimeout(t)
  }, [open, typeToConfirm])

  const armed = !typeToConfirm || deleteConfirmed(typed)

  const confirm = () => {
    if (refused || !armed) return
    /* Demoted BEFORE the object goes, so no render ever shows a live policy
       naming something that has gone. `setPolicyStatus` stamps each one as
       changed by the admin, which it was. */
    for (const u of live) store.setPolicyStatus(u.policy.id, 'draft')
    onConfirm()
    /* The page toasts "<name> deleted" from its own `remove`. The toast is one
       slot and the last write wins, so this replaces it with the whole story
       rather than stacking a second one. */
    if (live.length > 0) {
      store.showToast(`${name} deleted. ${count(live.length, 'policy', 'policies')} moved to draft`)
    }
  }

  if (refused) {
    return (
      <Modal
        open={open}
        onClose={onCancel}
        title={`Can't delete ${name}`}
        width={480}
        footer={
          <Button variant="secondary" onClick={onCancel}>
            Close
          </Button>
        }
      >
        <div className="bx-confirm">
          <p>
            System policies can't move to draft, and {stuck.length === 1 ? 'this one uses' : 'these use'} this {noun}. Change{' '}
            {stuck.length === 1 ? 'its rule' : 'their rules'} first.
          </p>
          <UseList uses={stuck} onOpen={onCancel} />
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={`Delete ${name}?`}
      width={typeToConfirm ? 560 : 480}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <DeleteButton size="md" disabled={!armed} title={armed ? undefined : `Type ${DELETE_WORD} to confirm`} onClick={confirm} />
        </>
      }
    >
      <div className="bx-confirm">
        <Callout tone="negative">
          This permanently deletes the {noun}. You can't undo it.
        </Callout>

        {detail && <p>{detail}</p>}

        {live.length > 0 && (
          <section className="bx-confirm__sec" aria-labelledby={`${fieldId}-live`}>
            <h3 id={`${fieldId}-live`}>
              {count(live.length, 'live policy', 'live policies')} {live.length === 1 ? 'moves' : 'move'} to draft
            </h3>
            <p>
              {live.length === 1 ? 'It stops' : 'They stop'} deciding sign-ins until {live.length === 1 ? 'its rules use' : 'their rules use'} another {noun}.
            </p>
            <UseList uses={live} onOpen={onCancel} />
          </section>
        )}

        {later.length > 0 && (
          <section className="bx-confirm__sec" aria-labelledby={`${fieldId}-later`}>
            <h3 id={`${fieldId}-later`}>
              {count(later.length, live.length > 0 ? 'other policy' : 'policy', live.length > 0 ? 'other policies' : 'policies')}{' '}
              {later.length === 1 ? 'needs' : 'need'} another {noun}
            </h3>
            <UseList uses={later} onOpen={onCancel} />
          </section>
        )}

        {impact && live.length === 0 && later.length === 0 && <p>No policy uses this {noun}.</p>}

        {typeToConfirm && (
          <div className="bx-confirm__type">
            <label htmlFor={fieldId}>
              Type <strong>{DELETE_WORD}</strong> to confirm
            </label>
            <input
              ref={box}
              id={fieldId}
              type="text"
              value={typed}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  confirm()
                }
              }}
            />
          </div>
        )}
      </div>
    </Modal>
  )
}

/* The policies a delete touches, each one a way out of the decision: opening a
   policy closes this dialog and goes to its rules, where the admin can point
   them at something else instead of deleting at all. */
/** The policies using something, each row opening that policy. Shared with the risk profile switch dialog. */
export function UseList({ uses, onOpen }: { uses: PolicyUse[]; onOpen: () => void }) {
  const store = useBrand()
  return (
    <ul className="bx-confirm__uses">
      {uses.map((u) => (
        <li key={u.policy.id} className="bx-confirm__use">
          <button
            type="button"
            className="bx-confirm__policy"
            onClick={() => {
              onOpen()
              store.go({ name: 'board', policyId: u.policy.id })
            }}
          >
            <span className="bx-confirm__name">{u.policy.name}</span>
            {u.draft && <ChangeState unsaved={false} draft />}
            <ChevronRight className="bx-confirm__go" size={15} strokeWidth={2} aria-hidden />
          </button>
          {/* Named as rules: under a policy name a bare "Japan trip window" read
              as a description of the policy, not as the rule that changes. */}
          <span className="bx-confirm__rules">
            {u.rules.length === 1 ? 'Rule' : 'Rules'}: {u.rules.map((r) => r.name).join(', ')}
          </span>
        </li>
      ))}
    </ul>
  )
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
