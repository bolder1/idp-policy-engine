import { useBrand } from '../../store'

import { PolicyBar } from '../policy-bar'
import { BoardBuilder } from './BoardBuilder'

/* -----------------------------------------------------------------------------
   Builder v2 — the board.

   The same thin split as BuilderPage: the policy's standing facts above, the
   work below. The bar is shared with the trail on purpose — whichever builder
   you are in, the policy is described the same way, in the same place.
   -------------------------------------------------------------------------- */

export function BoardPage({ policyId, open }: { policyId: string; open?: 'gauntlet' | 'impact' }) {
  const store = useBrand()
  const policy = store.policyById(policyId)

  return (
    <>
      {policy && <PolicyBar policy={policy} />}
      {/* `gauntlet` is the route's word and `check` is the sheet's. Translated
          here rather than renaming either: the route matches the trail's
          spelling so one caller can hand off to whichever builder is primary
          without knowing which it got, and the sheet keeps the name its own
          tab strip prints. */}
      <BoardBuilder policyId={policyId} openSheet={open === 'gauntlet' ? 'check' : open} />
    </>
  )
}
