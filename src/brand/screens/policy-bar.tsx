import { Grid3x3, Pencil, Users } from 'lucide-react'

import { StatusPill } from '../kit'
import { reach, type Policy } from '../data'
import { useBrand } from '../store'
import { AudienceBar } from './audience-drawer'

import './policy-bar.css'

/* -----------------------------------------------------------------------------
   The policy, above whichever builder is showing.

   Its three facts — the name, what it protects, who it governs — were scattered
   across three surfaces and, in one case, disguised as something else: the
   audience sat as a numbered card at the top of the rules list, which made the
   frame the rules are written inside look like the first step of writing them.

   It is not a step. It is the standing description of the policy, so it is one
   strip above the work, identical in all three builders, with one way to change
   any of it. Rendered by `BuilderPage` rather than by each shell, which is what
   makes "identical" true rather than aspirational.
   -------------------------------------------------------------------------- */

export function PolicyBar({ policy }: { policy: Policy }) {
  const store = useBrand()
  const empty = !policy.audience.everyone && policy.audience.groupIds.length === 0 && policy.audience.userIds.length === 0
  const apps = policy.allApps ? 'All applications' : `${policy.appIds.length} application${policy.appIds.length === 1 ? '' : 's'}`

  return (
    <header className="bpbar">
      <div className="bpbar__id">
        <h1>{policy.name}</h1>
        <StatusPill status={policy.status} />
        <span className="bpbar__type">{policy.type}</span>
      </div>

      <dl className="bpbar__facts">
        <div className="bpbar__fact">
          <dt>
            <Grid3x3 size={12} strokeWidth={1.9} aria-hidden />
            Protects
          </dt>
          <dd>
            {policy.appIds.length === 0 && !policy.allApps ? <em>No applications yet</em> : apps}
          </dd>
        </div>

        <div className={`bpbar__fact ${empty ? 'is-empty' : ''}`}>
          <dt>
            <Users size={12} strokeWidth={1.9} aria-hidden />
            Governs
          </dt>
          <dd>
            {empty ? (
              <em>Nobody — these rules cannot run</em>
            ) : (
              <>
                <AudienceBar audience={policy.audience} groups={store.groups} users={store.users} max={4} />
                <span className="bpbar__count">
                  {reach(policy.audience, store.groups, store.users).toLocaleString()} people
                </span>
              </>
            )}
          </dd>
        </div>
      </dl>

      {/* One button for all three facts. Three separate affordances — rename
          here, apps behind a dialog, audience in a drawer — was three places to
          remember for one idea: what this policy IS, as opposed to what its
          rules do. */}
      <button type="button" className="bpbar__edit" onClick={() => store.go({ name: 'policy-details', policyId: policy.id })}>
        <Pencil size={12} strokeWidth={2} aria-hidden />
        Edit details
      </button>
    </header>
  )
}
