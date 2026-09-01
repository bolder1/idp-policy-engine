import { ChevronRight } from 'lucide-react'

import { DecisionChip, StatusPill } from '../kit'
import { Peek } from './peek'
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

/* --- The same answer, behind a count ------------------------------------------
   A table cell reading "2 policies" states a size and hides the answer. Which
   two is almost always the question, and the only way to find out was to open
   the zone, read its Used by panel, and come back.

   POLICIES, not rules. The column counted rules first, and that is the wrong
   unit for the question it answers: a rule is not a thing an admin manages or
   navigates to, and "3 rules" spread across two policies reads as three places
   to go when there are two. What breaks when you rename this zone is a set of
   policies; how many rules inside each is detail, and it belongs in the panel.

   The panel's full card form would be too much for a hover — a card per policy
   with a rule list inside it is a page element. This is the compact form: one
   row per policy, its status, and how many of its rules name the object. */
export function UsedByPeek({ users }: { users: PolicyUse[] }) {
  const n = users.length
  const label = n === 0 ? '—' : `${n} polic${n === 1 ? 'y' : 'ies'}`

  /* Nothing to look inside. Plain text rather than a dead button: an em dash
     that highlights on hover and opens nothing is a worse answer than an em
     dash. */
  if (n === 0) return <span className="bz7__tuses is-quiet">{label}</span>

  return (
    <Peek label={label} className="bz7__usespeek">
      <p className="brpk__head">Policies that name this</p>
      <ol className="brpk__stack">
        {users.map((u) => (
          <li key={u.policy.id} className="brpk__row">
            {/* A dot, not a pill. The pill spelled "Active" beside every name
                and the word was the same on every row — a status that never
                varies is decoration. The dot keeps the one case that does vary
                visible without taking a third of the line. */}
            <i className={`brpk__dot is-${u.policy.status}`} aria-hidden />
            <span className="brpk__name">{u.policy.name}</span>
          </li>
        ))}
      </ol>
    </Peek>
  )
}
