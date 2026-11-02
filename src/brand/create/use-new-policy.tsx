import { useState, type ReactNode } from 'react'

import { NewPolicyDialog, type NewPolicyAsk } from './NewPolicyDialog'

/* -----------------------------------------------------------------------------
   New policy, from wherever it is offered: both Policies tabs, an application's page, the unsaved application's, its Post
   sign-in tab, the Applications list's Protection panel, and a template's Use. One hook, so each one asks for the name
   the same way and none can keep a policy before it has a rule. The caller says what to do with the answer, because
   where it goes next differs.
   -------------------------------------------------------------------------- */

export function useNewPolicy(): { ask: (a: NewPolicyAsk) => void; dialog: ReactNode } {
  /* Kept after it closes, so the popup can animate out holding what it asked. */
  const [held, setHeld] = useState<{ ask: NewPolicyAsk; open: boolean } | null>(null)
  const dialog = held ? <NewPolicyDialog open={held.open} ask={held.ask} onClose={() => setHeld({ ...held, open: false })} /> : null
  return { ask: (a) => setHeld({ ask: a, open: true }), dialog }
}
