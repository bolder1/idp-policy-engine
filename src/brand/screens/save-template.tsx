import { useState, type ReactNode } from 'react'

import type { Policy } from '../data'
import { openForEditing } from '../policy-draft'
import { useBrand, useNameLookup } from '../store'
import { scenarioFromPolicy } from '../template-from-policy'
import { SaveTemplateDialog } from './builder-dialogs'

/* -----------------------------------------------------------------------------
   Save as template, from wherever it is offered.

   The Policies list's row menu had it alone (it still draws its own copy, in `Policies.tsx`); the board's bar and an
   application's Policies tab ask for it too (owner, 27 Oct 2026: "add an option for save as template", then the audit
   of every place a policy can become one). One hook, so each place opens the same dialog, saves the same fields in the
   same way (template-from-policy.ts says what a template keeps) and says the same thing afterwards.

   `open(policy)` takes the policy as the caller wants it saved. The Policies list and the application tab hand over the
   stored policy, so it is what a builder would open: a saved draft if there is one. The board hands over what is on its
   canvas, with no saved draft, so the template is what the admin is looking at, edits included.
   -------------------------------------------------------------------------- */

export function useSaveAsTemplate(): { open: (policy: Policy) => void; dialog: ReactNode } {
  const store = useBrand()
  const resolve = useNameLookup()
  /* Kept after it closes, so the dialog can animate out holding the policy it was opened for. */
  const [held, setHeld] = useState<{ policy: Policy; open: boolean } | null>(null)

  const dialog = held ? (
    <SaveTemplateDialog
      open={held.open}
      policy={openForEditing(held.policy)}
      onClose={() => setHeld({ ...held, open: false })}
      onSave={(t) => {
        store.addScenario(scenarioFromPolicy(held.policy, t, Date.now(), resolve))
        setHeld({ ...held, open: false })
        store.showToast(`${t.name.trim()} saved as a template`)
      }}
    />
  ) : null

  return { open: (policy) => setHeld({ policy, open: true }), dialog }
}
