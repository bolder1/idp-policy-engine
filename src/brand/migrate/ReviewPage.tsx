import { useState } from 'react'
import { PageHead } from '../Shell'
import { useBrand } from '../store'
import { ReviewSplit } from './review-split'
import { MoveDoneDialog } from './done-dialog'
import '../screens/device-profile-wizard.css'
import './move-policies.css'
import './move-done.css'

/* -----------------------------------------------------------------------------
   Review moved policies, a page of its own (owner, 5 Nov 2026: "move this to a new
   page"). Opened from the Policies banner's Review, the ready-to-review toast and the
   move's own page. One look (owner, 5 Nov 2026: "V1 is the main version, remove the
   rest"): the new policy on the left, its old policies on the right (review-split).
   Finish opens What next.
   -------------------------------------------------------------------------- */

export function ReviewPage() {
  const store = useBrand()
  const [done, setDone] = useState(false)
  const finish = () => setDone(true)
  return (
    <div className="bpage brvp is-v1">
      <PageHead title="Review moved policies" caption="Approve each one into Policies as a draft." crumb={{ label: 'Policies', onClick: () => store.go({ name: 'policies' }) }} />
      <ReviewSplit onFinish={finish} />
      <MoveDoneDialog open={done} onClose={() => setDone(false)} />
    </div>
  )
}
