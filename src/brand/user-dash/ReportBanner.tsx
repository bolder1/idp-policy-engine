import { useState } from 'react'
import { ShieldAlert } from 'lucide-react'

import { Button } from '../kit'
import { useBrand } from '../store'
import { RequestsDrawer } from './RequestsDrawer'

/* -----------------------------------------------------------------------------
   Sign-in activity's line for a "This wasn't me" report (spec goal 5): one line while a report waits, opening Requests.
   The activity rows are worked out by the engine, so the report is not drawn into them.
   -------------------------------------------------------------------------- */

export function ReportBanner() {
  const { userDash } = useBrand()
  const [open, setOpen] = useState(false)
  if (!userDash.requests.some((r) => r.kind === 'report' && r.status === 'pending')) return null
  return (
    <>
      <div className="bud bud-banner" role="status">
        <ShieldAlert size={18} strokeWidth={1.8} aria-hidden />
        <span>A sign-in was reported by its owner</span>
        <Button size="sm" variant="link" onClick={() => setOpen(true)}>
          Review
        </Button>
      </div>
      <RequestsDrawer open={open} onClose={() => setOpen(false)} />
    </>
  )
}
