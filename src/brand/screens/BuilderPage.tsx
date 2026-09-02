import { useBrand } from '../store'

import { PolicyBar } from './policy-bar'
import { PolicyBuilderMain } from './PolicyBuilderMain'

/* -----------------------------------------------------------------------------
   The builder.

   There were three shells here — a list you expand in place, a bench that gave
   the selected rule its own pane, and a ledger that drew the whole policy as a
   grid. They were an argument about which shape the work wants, and the
   argument is settled: the rules are a panel on the left and the rule being
   edited is a playground on the right, which is the bench's answer to "the
   outcome must not be scrollable" and the list's answer to "the sequence must
   stay on screen", without either one's cost.

   Keeping the losers around cost more than the option was worth: three shells
   sharing a model means every change to the model is made three times, and the
   switcher above them told anyone who opened the screen that the team had not
   decided. So this is a thin wrapper now — the policy's own facts above, the
   builder below — and it stays a component because that split is real: the bar
   describes the policy, the shell edits its rules.
   -------------------------------------------------------------------------- */

export function BuilderPage({ policyId, open }: { policyId: string; open?: 'gauntlet' | 'impact' }) {
  const store = useBrand()
  const policy = store.policyById(policyId)

  return (
    <>
      {policy && <PolicyBar policy={policy} />}
      <PolicyBuilderMain policyId={policyId} open={open} />
    </>
  )
}
