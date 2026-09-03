import { useBrand } from '../../store'

import { PolicyBar } from '../policy-bar'
import { BoardBuilder } from './BoardBuilder'

/* -----------------------------------------------------------------------------
   Builder v2 — the board.

   The same thin split as BuilderPage: the policy's standing facts above, the
   work below. The bar is shared with the trail on purpose — whichever builder
   you are in, the policy is described the same way, in the same place.
   -------------------------------------------------------------------------- */

export function BoardPage({ policyId }: { policyId: string }) {
  const store = useBrand()
  const policy = store.policyById(policyId)

  return (
    <>
      {policy && <PolicyBar policy={policy} />}
      <BoardBuilder policyId={policyId} />
    </>
  )
}
