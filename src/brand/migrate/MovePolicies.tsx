import { PageHead } from '../Shell'
import { useBrand } from '../store'
import { MovingStage } from './moving-stage'
import { MovePick } from './MoveDialog'
import '../screens/device-profile-wizard.css'
import './move-policies.css'
import './move-done.css'

/* -----------------------------------------------------------------------------
   Move policies, a page of its own (owner, 5 Nov 2026: "open the Move policy in a new
   page instead of a popup"). The intro ends here, and so does every Start migration.

   The form: what does not change, then every old policy that moves, view only, with the
   old pages each came from (App Login, Adaptive). Move starts it in the background and
   goes back to Policies, whose banner carries it; Review opens there as a popup once it
   is done. While a move runs, this page shows it running instead.
   -------------------------------------------------------------------------- */

export function MovePolicies({ pick }: { pick?: string[] }) {
  const store = useBrand()
  const running = store.moveJob?.status === 'running'
  return (
    <div className="bpage bmv">
      <PageHead
        title="Move policies"
        caption="Old App Login and Adaptive Access policies become new policies, as drafts."
        docs
        crumb={{ label: 'Policies', onClick: () => store.go({ name: 'policies' }) }}
      />
      {running ? <MovingStage onReview={store.openReview} /> : <MovePick pick={pick} onDone={() => store.go({ name: 'policies' })} />}
    </div>
  )
}
