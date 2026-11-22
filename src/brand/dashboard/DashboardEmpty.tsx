import { LayoutDashboard } from 'lucide-react'

import { EmptyState } from '../empty'
import { DashboardArt } from '../empty-art'
import { Button } from '../kit'
import { PageHead } from '../Shell'
import { useBrand } from '../store'

/* The Dashboard on the empty tenant (owner, 20 Nov 2026: "give an empty state of the dashboard"). Its tiles are modelled
   sign-ins that would read as real numbers on a tenant with nothing in it, so the page is one empty state instead. Part
   of the empty-tenant review tool (empty-tenant.ts), so it goes when that does. */
export function DashboardEmpty() {
  const { go } = useBrand()
  return (
    <div className="bpage">
      <PageHead title="Dashboard" caption="Your tenant at a glance." />
      <EmptyState
        icon={LayoutDashboard}
        art={<DashboardArt />}
        title="Nothing to show yet"
        blurb="Sign-ins and policy health show here once an application signs people in."
        action={
          <Button variant="brand" onClick={() => go({ name: 'application-new' })}>
            Add application
          </Button>
        }
      />
    </div>
  )
}
