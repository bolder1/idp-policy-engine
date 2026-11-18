import type { ReactNode } from 'react'

import type { Policy } from '../data'
import { narrowToAudience } from './board/apply-template'
import { useBrand, useNameLookup } from '../store'
import { scenarioFromPolicy } from '../template-from-policy'

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

export function useSaveAsTemplate(): { open: (policy: Policy) => void; marked: (policyId: string) => boolean; unmark: (policy: Policy) => void; dialog: ReactNode } {
  const store = useBrand()
  const resolve = useNameLookup()

  const open = (policy: Policy) => {
    const already = store.scenarios.find((s) => !s.provided && s.fromPolicy === policy.id)
    if (already) {
      store.showToast(`${already.name} is already a template`)
      return
    }
    /* A template whose rules apply to nobody would offer nothing to use, so it is refused here in the dialog's words. */
    if (policy.rules.length === 0) {
      store.showToast('Add a rule before marking this policy as a template.')
      return
    }
    if (!policy.rules.some((r) => narrowToAudience(r, policy.audience, store.users) !== null)) {
      store.showToast('None of these rules apply to anyone in this policy.')
      return
    }
    const names = new Set(store.scenarios.map((s) => s.name.toLowerCase()))
    let name = policy.name
    for (let n = 2; names.has(name.toLowerCase()); n++) name = `${policy.name} (${n})`
    const id = store.addScenario({
      ...scenarioFromPolicy(policy, { name, description: '', category: 'Uncategorized' }, Date.now(), resolve),
      fromPolicy: policy.id,
    })
    store.showToast(`${name} marked as a template`, { label: 'Undo', run: () => store.removeScenario(id) })
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

  return { open, marked, unmark, dialog: null }
}

/* Whether a policy is marked as a template: the row's mark reads it. */
export function useMarkedAsTemplate(policyId: string): boolean {
  const { scenarios } = useBrand()
  return scenarios.some((s) => !s.provided && s.fromPolicy === policyId)
}
