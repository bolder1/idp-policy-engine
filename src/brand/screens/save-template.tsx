import type { ReactNode } from 'react'

import type { Policy } from '../data'
import { narrowToAudience } from './board/apply-template'
import { useBrand, useNameLookup } from '../store'
import { scenarioFromPolicy } from '../template-from-policy'
import { shows } from '../rollout'
import { isDraftPolicy } from './status-options'

/* A draft becomes a template as it stands, even with no rule yet (rollout.ts `draftTemplates`, 20 Nov 2026). */
const DRAFT_TEMPLATES: boolean = shows('draftTemplates')

/* -----------------------------------------------------------------------------
   Mark as template, from wherever it is offered (owner, 18 Nov 2026: "we don't need this [dialog] any more, call it mark
   as template, so the user selects Mark as template and we flag this one under Templates. That's it.").

   One click: the policy goes onto the Templates page under its own name (numbered if a template has it), its rules as
   the policy holds them, no category. No name, description or category to fill in, so no dialog. A toast says so and
   offers Undo. Marking a policy that is already a template says so and adds nothing. It is the same flag the reuse
   picker's bookmark sets (`fromPolicy`, create/TemplateSheet.tsx), so the two agree on what is marked.

   The old dialog (`SaveTemplateDialog`, builder-dialogs.tsx) is kept for the legacy builder that still draws it.

   `open(policy)` takes the policy as the caller wants it kept: the Policies list and the application tab hand over the
   stored policy; the board hands over what is on its canvas, edits included. `dialog` is null, kept so callers that
   render it need no change.
   -------------------------------------------------------------------------- */

export function useSaveAsTemplate(): {
  open: (policy: Policy) => void
  /** Several at once (the Policies bulk bar, rollout.ts `bulkLive`): one toast for the lot, with one Undo. */
  markMany: (policies: Policy[]) => void
  marked: (policyId: string) => boolean
  unmark: (policy: Policy) => void
  dialog: ReactNode
} {
  const store = useBrand()
  const resolve = useNameLookup()

  /** Why a policy cannot be marked, in the dialog's words, or null when it can. */
  const refusal = (policy: Policy): string | null => {
    const already = store.scenarios.find((s) => !s.provided && s.fromPolicy === policy.id)
    if (already) return `${already.name} is already a template`
    /* A template whose rules apply to nobody would offer nothing to use, so it is refused here in the dialog's words. */
    const emptyDraft = DRAFT_TEMPLATES && isDraftPolicy(policy) && policy.rules.length === 0
    if (policy.rules.length === 0 && !emptyDraft) return 'Add a rule before marking this policy as a template.'
    if (!emptyDraft && !policy.rules.some((r) => narrowToAudience(r, policy.audience, store.users) !== null)) return 'None of these rules apply to anyone in this policy.'
    return null
  }
  /** Marks one; `taken` holds the names already used, this batch's included. */
  const mark = (policy: Policy, taken: Set<string>): { id: string; name: string } => {
    let name = policy.name
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${policy.name} (${n})`
    taken.add(name.toLowerCase())
    const id = store.addScenario({
      ...scenarioFromPolicy(policy, { name, description: '', category: 'Uncategorized' }, Date.now(), resolve),
      fromPolicy: policy.id,
    })
    return { id, name }
  }

  const open = (policy: Policy) => {
    const why = refusal(policy)
    if (why) {
      store.showToast(why)
      return
    }
    const { id, name } = mark(policy, new Set(store.scenarios.map((s) => s.name.toLowerCase())))
    store.showToast(`${name} marked as a template`, { label: 'Undo', run: () => store.removeScenario(id) })
  }

  const markMany = (policies: Policy[]) => {
    const taken = new Set(store.scenarios.map((s) => s.name.toLowerCase()))
    const ids = policies.filter((p) => refusal(p) === null).map((p) => mark(p, taken).id)
    const skipped = policies.length - ids.length
    if (ids.length === 0) {
      store.showToast(skipped === 1 ? (refusal(policies[0]) ?? 'Nothing to mark') : 'None of these can be marked as templates')
      return
    }
    const done = ids.length === 1 ? '1 policy marked as a template' : `${ids.length} policies marked as templates`
    store.showToast(skipped > 0 ? `${done}. ${skipped} skipped.` : done, { label: 'Undo', run: () => ids.forEach((id) => store.removeScenario(id)) })
  }

  /* Marked from the row and unmarked from the same row (owner, 18 Nov 2026: "add an icon in the row … and the user can
     remove it from the same place … no need to add any specific template page"). */
  const marked = (policyId: string) => store.scenarios.some((s) => !s.provided && s.fromPolicy === policyId)

  const unmark = (policy: Policy) => {
    const gone = store.scenarios.filter((s) => !s.provided && s.fromPolicy === policy.id)
    if (gone.length === 0) return
    for (const s of gone) store.removeScenario(s.id)
    store.showToast(`${policy.name} removed from templates`, { label: 'Undo', run: () => gone.forEach((s) => store.addScenario(s)) })
  }

  return { open, markMany, marked, unmark, dialog: null }
}

/* Whether a policy is marked as a template: the row's mark reads it. */
export function useMarkedAsTemplate(policyId: string): boolean {
  const { scenarios } = useBrand()
  return scenarios.some((s) => !s.provided && s.fromPolicy === policyId)
}
