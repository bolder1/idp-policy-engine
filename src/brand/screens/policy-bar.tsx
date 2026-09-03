import { AppWindow, ArrowLeft, Pencil, Users } from 'lucide-react'

import { StatusPill } from '../kit'
import { initials, reach, type Policy } from '../data'
import { AppLogo } from '../logos/AppLogo'
import { useBrand } from '../store'
import { Peek } from './peek'

import './policy-bar.css'

/* -----------------------------------------------------------------------------
   The policy, above the builder.

   Its three facts — the name, the applications it covers, the people it governs
   — were scattered across three surfaces, and one of them was disguised as
   something else: the audience sat as a numbered card at the top of the rules
   list, which made the frame the rules are written inside look like the first
   step of writing them.

   It is not a step. It is the standing description of the policy, so it is one
   strip above the work with one way to change any of it.

   Both facts are now a NAME with a list behind it, not a measurement.

   "Protects: 1 application" answered a question nobody has. Which application
   is the question, and the answer was one click away in Edit details — so the
   applications are named and shown with their marks, and the audience is one
   count you can look inside rather than a row of chips that grows the strip
   every time somebody adds a group.
   -------------------------------------------------------------------------- */

export function PolicyBar({ policy }: { policy: Policy }) {
  const store = useBrand()

  const { everyone, groupIds, userIds } = policy.audience
  const nobody = !everyone && groupIds.length === 0 && userIds.length === 0
  const total = reach(policy.audience, store.groups, store.users)

  /* One phrase for the selection, one number for its size. Two groups and a
     named person is "2 groups · 1 person", and how many people that actually
     reaches is the muted half — the count is context for the selection, not the
     other way round. */
  const parts = [
    groupIds.length > 0 && `${groupIds.length} group${groupIds.length === 1 ? '' : 's'}`,
    userIds.length > 0 && `${userIds.length} ${userIds.length === 1 ? 'person' : 'people'}`,
  ].filter(Boolean) as string[]
  const audienceLabel = everyone ? 'Everyone' : parts.join(' · ')
  /* Suppressed when the selection is only named individuals: "3 people · 3
     people" is a number restating itself. */
  const showTotal = everyone || groupIds.length > 0

  /* The system policy is the one that has no application and covers all of
     them — every other policy protects exactly one. */
  const app = policy.appId ? store.appById(policy.appId) : null

  return (
    <header className="bpbar">
      <div className="bpbar__id">
        {/* With the heading, not in a toolbar of its own. The builder's top bar
            is about the rules; leaving `back` there meant a bar that existed
            for one arrow on any policy that had none. */}
        <button type="button" className="bpbar__back" aria-label="Back to policies" onClick={() => store.go({ name: 'policies' })}>
          <ArrowLeft size={16} strokeWidth={1.9} aria-hidden />
        </button>
        <h1>{policy.name}</h1>
        <StatusPill status={policy.status} />
        <span className="bpbar__type">{policy.type}</span>
      </div>

      <dl className="bpbar__facts">
        <div className={`bpbar__fact ${!app && !policy.isSystem ? 'is-empty' : ''}`}>
          <dt>
            <AppWindow size={12} strokeWidth={1.9} aria-hidden />
            Application
          </dt>
          <dd>
            {policy.isSystem ? (
              <span className="bpbar__app">Every application</span>
            ) : app ? (
              /* Named, with its mark. A count answered a question nobody has —
                 WHICH application is the question, and the answer used to be a
                 click away in Edit details. */
              <span className="bpbar__app">
                <AppLogo appId={app.id} size={16} />
                {app.name}
              </span>
            ) : (
              <em>Not chosen — these rules never run</em>
            )}
          </dd>
        </div>

        <div className={`bpbar__fact ${nobody ? 'is-empty' : ''}`} data-tour="audience">
          <dt>
            <Users size={12} strokeWidth={1.9} aria-hidden />
            Governs
          </dt>
          <dd>
            {nobody ? (
              <em>Nobody — these rules cannot run</em>
            ) : everyone ? (
              /* Nothing to look inside. "Everyone" has no list behind it, so it
                 does not pretend to be a control. */
              <span className="bpbar__app">
                Everyone
                <span className="bpbar__count">{total.toLocaleString()} people</span>
              </span>
            ) : (
              <Peek
                className="bpbar__peek"
                label={
                  <>
                    {audienceLabel}
                    {showTotal && <span className="bpbar__count">{total.toLocaleString()} people</span>}
                  </>
                }
              >
                {groupIds.length > 0 && (
                  <>
                    <p className="brpk__head">Groups</p>
                    <ul className="bpbar__alist">
                      {groupIds.map((id) => {
                        const g = store.groupById(id)
                        return (
                          <li key={id}>
                            <span className="bpbar__ai" aria-hidden>
                              <Users size={11} strokeWidth={2} />
                            </span>
                            <strong>{g.name}</strong>
                            <em>{g.memberCount.toLocaleString()}</em>
                          </li>
                        )
                      })}
                    </ul>
                  </>
                )}

                {userIds.length > 0 && (
                  <>
                    <p className="brpk__head">Named people</p>
                    <ul className="bpbar__alist">
                      {userIds.map((id) => {
                        const u = store.userById(id)
                        return (
                          <li key={id}>
                            <span className="bpbar__ai is-person" aria-hidden>
                              {initials(u?.name ?? id)}
                            </span>
                            <strong>{u?.name ?? id}</strong>
                            {u && <em>{store.groupById(u.groupId).name}</em>}
                          </li>
                        )
                      })}
                    </ul>
                  </>
                )}
              </Peek>
            )}
          </dd>
        </div>
      </dl>

      <div className="bpbar__acts">
        {/* Two builders over one policy — the trail and the board. The switch
            lives on this bar because the bar is the one thing both share, and
            a layout choice belongs beside the policy rather than inside either
            layout's own toolbar. */}
        <div className="bpbar__view" role="group" aria-label="Builder layout">
          <button
            type="button"
            className={store.screen.name === 'builder' ? 'is-on' : ''}
            aria-pressed={store.screen.name === 'builder'}
            onClick={() => store.go({ name: 'builder', policyId: policy.id })}
          >
            Trail
          </button>
          <button
            type="button"
            className={store.screen.name === 'board' ? 'is-on' : ''}
            aria-pressed={store.screen.name === 'board'}
            onClick={() => store.go({ name: 'board', policyId: policy.id })}
          >
            Board
          </button>
        </div>

        {/* One button for all three facts. Three separate affordances — rename
            here, apps behind a dialog, audience in a drawer — was three places
            to remember for one idea: what this policy IS, as opposed to what
            its rules do. */}
        <button type="button" className="bpbar__edit" onClick={() => store.go({ name: 'policy-details', policyId: policy.id })}>
          <Pencil size={12} strokeWidth={2} aria-hidden />
          Edit details
        </button>
      </div>
    </header>
  )
}
