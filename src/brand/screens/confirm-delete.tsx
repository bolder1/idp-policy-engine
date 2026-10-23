import { type ReactNode } from 'react'
import { Trash2 } from 'lucide-react'

import { Confirm, type ConfirmRow } from '../kit'
import { ChangeState } from '../leave-guard'
import { useBrand } from '../store'
import { DELETE_WORD, asksForDeleteTick, asksForDeleteWord, type DeleteImpact, type PolicyUse } from './usage'

/* One delete confirmation for everything the Policies area can delete: a policy,
   a zone, a device profile, a risk profile, a hook, a display token.

   A HARD delete, every time (owner, 21 Sep 2026: "make a hard delete, no soft
   delete"). Nothing is archived and nothing comes back, so the dialog is built
   as a decision rather than a notice, and reads top to bottom in the order the
   admin has to weigh it:

     1. It is permanent.
     2. What it does to the policies that use it.
     3. Type DELETE — only when (2) changes who can sign in, or when the
        caller says the object is one nobody deletes in passing
        (`requireTyped`: a Protected saved sign-in).

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
  requireTyped,
  tickCount,
  onCancel,
  onConfirm,
}: {
  open: boolean
  /** The object's own name, as the admin knows it. */
  name: string
  /** Lower case: 'zone', 'device profile', 'policy'. */
  noun: string
  /* Omit for objects no rule can reference, such as a policy — nothing points
     AT a policy, so there is no usage list to draw. It still asks for the typed
     word: deleting a live policy hands its applications to the Global Default,
     which changes who can sign in, and that is the test this dialog applies
     (owner, 22 Oct 2026: "make this as well a hard-delete version, like we have
     in zones and device profiles"). The three policy call sites pass
     `requireTyped` for exactly that reason. */
  impact?: DeleteImpact
  /** One extra fact about the object itself, such as the apps a policy protects. */
  detail?: ReactNode
  /** Ask for the typed word even though no live sign-in changes. */
  requireTyped?: boolean
  /* Ask for a tick instead, where nothing points at the object but the delete
     is still worth stopping at — several things going at once. A count is its
     own kind of stake: taking three tokens out of the inventory in one press is
     not the same decision as taking one, and the ladder's middle rung is where
     that belongs. Ignored when the word is already being asked for. */
  tickCount?: number
  onCancel: () => void
  onConfirm: () => void
}) {
  const store = useBrand()
  const live = impact?.live ?? []
  const later = impact?.later ?? []
  const stuck = impact?.stuck ?? []
  const refused = stuck.length > 0
  const typeToConfirm = asksForDeleteWord(impact, requireTyped)
  const tickToConfirm = asksForDeleteTick(impact, requireTyped) || (!typeToConfirm && !refused && (tickCount ?? 0) > 1)

  /* The typed word, its field, the reset between subjects and the focus now
     belong to the kit's `Confirm` (22 Oct 2026). They were duplicated here and
     nowhere else, which is exactly how sixteen confirms ended up each owning a
     slightly different version of the same decision. `deleteConfirmed` and this
     component's own arming test were character-for-character the same, so the
     move changed no behaviour.

     `confirm` keeps only the refusal guard: `Confirm` disables its own button
     and gates Enter until the word matches, so it cannot be reached unarmed. */
  const confirm = () => {
    if (refused) return
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

  /* The policies a delete touches, each row a way out of the decision: opening
     one closes this dialog and goes to its rules, where the admin can point them
     at something else instead of deleting at all. */
  const asRows = (uses: PolicyUse[]): ConfirmRow[] =>
    uses.map((u) => ({
      id: u.policy.id,
      name: u.policy.name,
      tag: u.draft ? <ChangeState unsaved={false} draft /> : undefined,
      /* Named as rules: under a policy name a bare "Japan trip window" read as a
         description of the policy, not as the rule that changes. */
      detail: `${u.rules.length === 1 ? 'Rule' : 'Rules'}: ${u.rules.map((r) => r.name).join(', ')}`,
      onOpen: () => {
        onCancel()
        store.go({ name: 'board', policyId: u.policy.id })
      },
    }))

  /* Refused, not offered-then-rejected: a system policy cannot move to draft, so
     there is nothing to confirm and the dialog says so with one Close.
     `tone="error"` because that is what this is — and it is the toast's own
     reading of the words: `toastTone` classes "Can't …" as an error. */
  if (refused) {
    return (
      <Confirm
        open={open}
        onClose={onCancel}
        tone="error"
        blocked
        title={`Can't delete ${name}`}
        sections={[{ id: 'stuck', rows: asRows(stuck) }]}
      >
        System policies can't move to draft, and {stuck.length === 1 ? 'this one uses' : 'these use'} this {noun}. Change{' '}
        {stuck.length === 1 ? 'its rule' : 'their rules'} first.
      </Confirm>
    )
  }

  /* `tone="removed"` carries the Trash2 mark and the negative colour — the same
     pair the toast uses for a removal, which is the whole point of inheriting
     its language rather than inventing a dialog palette. */
  /* HERO WHEN THERE IS NOTHING TO LIST (owner, 22 Oct 2026: "a good delete with
     animated svg and good background and a good card"). The two shapes split on
     content, which is what POPUPS.md says they are for: a dialog whose whole
     body is one sentence takes the spotlight, and a dialog with names to show
     keeps them — the hero has nowhere to put a list and drops one silently.
     So a zone nobody uses gets the card, and a zone four live policies depend
     on gets the four names. */
  const bare = live.length === 0 && later.length === 0 && stuck.length === 0

  return (
    <Confirm
      open={open}
      onClose={onCancel}
      tone="removed"
      shape={bare ? 'hero' : 'rows'}
      title={`Delete ${name}?`}
      /* NO STANDING CALLOUT (owner, 22 Oct 2026, choosing C2). It restated the
         title — "Delete X?" then "This permanently deletes the X" — and its
         second clause is true of every delete in this console, so it was a
         constant rather than news, in red, above the one line that actually
         said what changes. The permanence moved to the field label, which is
         read at the moment of arming; where there is no field, `detail` and the
         section headings carry it. */
      typeWord={typeToConfirm ? DELETE_WORD : undefined}
      typeLabel={
        typeToConfirm ? (
          <>
            Type <strong>{DELETE_WORD}</strong> to delete this {noun} for good
          </>
        ) : undefined
      }
      /* What there is to agree to, and it has to be something that is only true
         if the admin goes through with it. "This can't be undone" is true
         whether they press Delete or Cancel, so it would be the body again with
         a box beside it; work they are taking on is not. */
      ack={
        !tickToConfirm
          ? undefined
          : later.length > 0
            ? `I know ${count(later.length, 'policy needs', 'policies need')} another ${noun}, and nothing points ${later.length === 1 ? 'it' : 'them'} at one.`
            : `I know all ${count(tickCount ?? 0, noun, `${noun}s`)} leave for good.`
      }
      confirmLabel="Delete"
      confirmIcon={Trash2}
      onConfirm={confirm}
      sections={[
        ...(live.length > 0
          ? [
              {
                id: 'live',
                title: `${count(live.length, 'live policy', 'live policies')} ${live.length === 1 ? 'moves' : 'move'} to draft`,
                caption: `${live.length === 1 ? 'It stops' : 'They stop'} deciding sign-ins until ${live.length === 1 ? 'its rules use' : 'their rules use'} another ${noun}.`,
                rows: asRows(live),
              },
            ]
          : []),
        ...(later.length > 0
          ? [
              {
                id: 'later',
                title: `${count(later.length, live.length > 0 ? 'other policy' : 'policy', live.length > 0 ? 'other policies' : 'policies')} ${
                  later.length === 1 ? 'needs' : 'need'
                } another ${noun}`,
                rows: asRows(later),
              },
            ]
          : []),
      ]}
      more={impact && live.length === 0 && later.length === 0 ? `No policy uses this ${noun}.` : undefined}
    >
      {detail}
    </Confirm>
  )
}



const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
