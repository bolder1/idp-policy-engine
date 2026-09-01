import { ChevronRight } from 'lucide-react'

import { DecisionChip, StatusPill } from '../kit'
import { useBrand } from '../store'
import type { PolicyUse } from './usage'

/* -----------------------------------------------------------------------------
   What depends on this object, drawn.

   `policiesUsing` answers the question; this renders the answer, and it is one
   component for the same reason the query is one function. Zones, device
   profiles and hooks all ask "what breaks if I change this", and each of them
   had printed the answer as a policy name on the left of a row with its rule
   names run together on the right — `Finance Team – High Security   Block
   compromised devices`. Two facts on one line, no relationship stated between
   them, and at three policies of two rules each it is a paragraph of proper
   nouns you have to parse to find out you are looking at six things.

   The card is the template gallery's move: show the thing itself rather than
   its name. What you actually want to know before editing a profile is not
   which policies mention it — it is what those policies DO when they match,
   because "one rule denies access" and "one rule asks for a second factor" are
   different amounts of danger. So each rule is a row with its decision on it,
   in the same green/amber/red the builder and the gallery use, numbered in the
   policy's own running order so the card reads like the stack it came from.

   A disabled rule is called out rather than dropped. It still names the object,
   so it still constrains a rename or a delete — but it is not deciding anything
   today, and a list that showed it identically to a live rule would overstate
   what is at stake.
   -------------------------------------------------------------------------- */

export function UsedByList({ users }: { users: PolicyUse[] }) {
  const store = useBrand()

  return (
    <ul className="buse">
      {users.map((u) => (
        <li key={u.policy.id} className="buse__card">
          {/* The name is the button, not the card. A card wrapping the whole
              thing would be the bigger target, and it would also be a <button>
              containing a list — flow content inside phrasing content, which is
              the invalid nesting that has already broken hydration once on this
              screen. The row is full width and ends in a chevron, so it reads
              as the affordance it is. */}
          <button
            type="button"
            className="buse__open"
            onClick={() => store.go({ name: 'builder', policyId: u.policy.id })}
            title={`Open ${u.policy.name}`}
          >
            <strong>{u.policy.name}</strong>
            <StatusPill status={u.policy.status} />
            <ChevronRight size={15} strokeWidth={2} aria-hidden />
          </button>

          <ol className="buse__rules">
            {u.rules.map((r) => (
              <li key={r.id} className={r.enabled ? '' : 'is-off'}>
                {/* Its position in the policy, not in this list. The number is
                    only worth printing if it matches what the builder shows —
                    otherwise it is a bullet that looks like an index. */}
                <span className="buse__n" aria-hidden>
                  {u.policy.rules.indexOf(r) + 1}
                </span>
                <span className="buse__rname">{r.name}</span>
                {!r.enabled && <em className="buse__off">Off</em>}
                <DecisionChip decision={r.decision} size="sm" />
              </li>
            ))}
          </ol>
        </li>
      ))}
    </ul>
  )
}
