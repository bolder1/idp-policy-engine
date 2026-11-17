import { useState } from 'react'
import { SearchBox } from '../kit'
import { useBrand } from '../store'
import { groupName } from './plan'
import { OldLoginTable } from './OldPolicies'
import './old-policies.css'

/* -----------------------------------------------------------------------------
   Policies, Old policies tab. Since 9 Nov 2026 (owner: "the table we have in policy before migration, same table
   after migration in the Old policies tab"), the old App Login Policies table itself: Policy Name, Group Name,
   Application Name, First Factor, 2FA and Adaptive, with its search. View only: no Action column, no status.
   -------------------------------------------------------------------------- */

export function OldPoliciesTab() {
  const store = useBrand()
  const [q, setQ] = useState('')
  const ctx = { groups: store.groups }
  const appName = (id: string) => store.moveApps.find((a) => a.id === id)?.name ?? id
  const key = q.trim().toLowerCase()
  const rows = store.legacy.policies.filter((lp) => !key || `${lp.name} ${appName(lp.appId)} ${groupName(lp.groupId, ctx)}`.toLowerCase().includes(key))
  return (
    <>
      <div className="bold__bar-row">
        <SearchBox value={q} onChange={setQ} placeholder="Search Policy" label="Search old policies" />
      </div>
      <OldLoginTable rows={rows} viewOnly />
    </>
  )
}
