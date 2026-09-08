import { Activity, ChevronLeft, ChevronRight, ListChecks, Pencil, Users } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button, StatusPill } from '../../kit'
import { audienceSummary, initials, type Policy } from '../../data'
import { AppLogo } from '../../logos/AppLogo'
import { useBrand } from '../../store'
import { Peek } from '../peek'

/* -----------------------------------------------------------------------------
   The board's top row.

   The policy's header used to FLOAT over the canvas — 76px of opaque strip laid
   across the top of the stage, with a focus mode that slid it away so you could
   have the space back. That bought the canvas its full height and cost
   something worse: nothing on this screen had a fixed home. The header covered
   the chain's first node until you panned; the publishing cluster hovered in
   the top-right corner and stepped sideways whenever the panel opened; and the
   one way to see the whole board was to learn that a button in the zoom toolbar
   hid the title.

   So the strip stops floating and starts being a region. It is 48px, flat, and
   in the flow — a breadcrumb on the left, the publishing verbs on the right,
   one rule underneath it — and the canvas below it is a region of its own with
   the config panel beside it rather than on top of it. Three bands, three
   jobs, and no piece of chrome standing on another piece's work.

   Not `PolicyBar` with a `slim` prop. Two reasons, and both are about what the
   bar CONTAINS rather than how tall it is: everything the board's bar gained —
   Discard, Review & publish, the Check and What-changes readings — closes over
   `BoardBuilder`'s draft state, which a component shared with the trail cannot
   reach; and the trail's bar is the anchor for a tour stop that a test asserts
   by name. Leaving it alone is the version of this change that breaks nothing.

   Where the space came from, since 48px is a third of what the old strip used:

   · The application stops being a labelled FACT and becomes the first crumb.
     "APPLICATION / Workday" under a title is the same word twice — a policy
     protects an application, so the application is what the policy hangs off,
     and a 16px mark with a name after it says that without a label.
   · `policy.type` goes. "App Access" is true of almost every policy here and
     is not a thing anybody navigates by; it is one click away in Edit details.
   · The two 10px uppercase `dt` labels go with it. A glyph carries "governs"
     for a sighted reader and the button's own `aria-label` carries it for
     everyone else.
   -------------------------------------------------------------------------- */

export function BoardBar({
  policy,
  actions,
}: {
  policy: Policy
  /* The publishing verbs, which belong to the builder's draft rather than to
     the policy. Passed in rather than reached for: this component knows what a
     policy IS, and the host knows what is unsaved about it. */
  actions?: ReactNode
}) {
  const store = useBrand()
  const { label, total, showTotal, nobody } = audienceSummary(policy.audience, store.groups, store.users)
  /* The system policy is the one that has no application and covers all of
     them — every other policy protects exactly one. */
  const app = policy.appId ? store.appById(policy.appId) : null

  return (
    <header className="bbtop">
      <nav className="bbtop__crumbs" aria-label="Where this policy sits">
        <button type="button" className="bbtop__back" aria-label="Back to policies" onClick={() => store.go({ name: 'policies' })}>
          <ChevronLeft size={16} strokeWidth={2} aria-hidden />
        </button>
        <button type="button" className="bbtop__crumb" onClick={() => store.go({ name: 'policies' })}>
          Policies
        </button>

        <ChevronRight size={13} strokeWidth={2} className="bbtop__sl" aria-hidden />

        {/* The application, as the crumb the policy hangs off.

            The empty case keeps its warning and its colour. A policy naming no
            application is a set of rules no sign-in can ever reach, which is
            the one fact in this bar worth interrupting for — so it is never
            the thing that gets truncated. */}
        {policy.isSystem ? (
          <span className="bbtop__crumb is-static">Every application</span>
        ) : app ? (
          <span className="bbtop__crumb is-static">
            <AppLogo appId={app.id} size={16} />
            {app.name}
          </span>
        ) : (
          <span className="bbtop__crumb is-warn">Not chosen — these rules never run</span>
        )}

        <ChevronRight size={13} strokeWidth={2} className="bbtop__sl" aria-hidden />

        {/* The policy itself, and the way to change what it IS.

            One control for all three standing facts — the name, the
            application, the audience — because they are one idea: what this
            policy is, as opposed to what its rules do. It was a separate
            "Edit details" button in the old strip's action row, which put a
            navigation among the publishing verbs.

            `from: 'board'` is load-bearing. Policy details sends you back to
            whichever builder you came from, and defaults to the trail for
            callers that predate the board — without it, editing the name is a
            one-way door out of the board you were working in. */}
        <button
          type="button"
          className="bbtop__name"
          title="Edit the policy's name, application and audience"
          onClick={() => store.go({ name: 'policy-details', policyId: policy.id, from: 'board' })}
        >
          <b>{policy.name}</b>
          <Pencil size={12} strokeWidth={2} aria-hidden />
        </button>

        <StatusPill status={policy.status} />
      </nav>

      {/* Who it governs — a glyph, a phrase and a count, with the list behind
          it. `Peek` portals its panel and measures its own placement, so a
          48px bar is no different to it than the 88px strip it used to hang
          under. */}
      <span className={`bbtop__gov ${nobody ? 'is-warn' : ''}`}>
        {nobody ? (
          <>
            <Users size={13} strokeWidth={1.9} aria-hidden />
            Governs nobody — these rules cannot run
          </>
        ) : policy.audience.everyone ? (
          /* Nothing to look inside. "Everyone" has no list behind it, so it
             does not pretend to be a control. */
          <>
            <Users size={13} strokeWidth={1.9} aria-hidden />
            Everyone
            <em>{total.toLocaleString()} people</em>
          </>
        ) : (
          <Peek
            className="bbtop__peek"
            label={
              <>
                <Users size={13} strokeWidth={1.9} aria-hidden />
                {label}
                {showTotal && <em>{total.toLocaleString()} people</em>}
              </>
            }
          >
            <AudienceList policy={policy} />
          </Peek>
        )}
      </span>

      <div className="bbtop__acts">{actions}</div>
    </header>
  )
}

function AudienceList({ policy }: { policy: Policy }) {
  const store = useBrand()
  const { groupIds, userIds } = policy.audience
  return (
    <>
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
    </>
  )
}

/* --- The readings, and the verbs ---------------------------------------------

   Two pips that carry their own answer — "Check · A · 2 through" is a finding,
   where a pip that only opens a panel is a menu item — and then the two things
   that end a draft. Both pips are withheld in the lite edition, which is why
   the divider before them is conditional: rendered unconditionally it became
   the row's FIRST child, a hairline dividing nothing from Discard.
   -------------------------------------------------------------------------- */

export function BoardBarActions({
  test,
  movement,
  sheet,
  dirty,
  blockers,
  onSheet,
  onDiscard,
  onReview,
}: {
  test: { grade: string; gradeReason: string; breaches: number } | null
  movement: { changed: number; stricter: number; looser: number } | null
  sheet: 'check' | 'impact' | null
  dirty: boolean
  blockers: number
  onSheet: (t: 'check' | 'impact') => void
  onDiscard: () => void
  onReview: () => void
}) {
  const features = useBrand().features
  return (
    <>
      {features.gauntlet && (
        <button
          type="button"
          className={`bb__pip ${sheet === 'check' ? 'is-on' : ''}`}
          title={test ? test.gradeReason : 'No rules are switched on, so there is nothing to grade'}
          onClick={() => onSheet('check')}
        >
          <ListChecks size={13} strokeWidth={2} aria-hidden />
          Check
          {test ? (
            <>
              <span className={`bb__grade is-${test.grade}`}>{test.grade}</span>
              {test.breaches > 0 && <span className="bb__n">{test.breaches} through</span>}
            </>
          ) : (
            <span className="bb__n">—</span>
          )}
        </button>
      )}
      {features.blastRadius && (
        <button
          type="button"
          className={`bb__pip ${sheet === 'impact' ? 'is-on' : ''} ${movement && movement.looser > 0 ? 'is-looser' : ''}`}
          title={movement ? `${movement.stricter} stricter · ${movement.looser} looser, of 1,440 modelled situations` : 'Nothing unsaved to compare'}
          onClick={() => onSheet('impact')}
        >
          <Activity size={13} strokeWidth={2} aria-hidden />
          What changes
          <span className="bb__n">{movement ? movement.changed.toLocaleString() : '—'}</span>
        </button>
      )}
      {(features.gauntlet || features.blastRadius) && <span className="bbtop__sep" />}

      {dirty && (
        <Button variant="ghost" size="sm" onClick={onDiscard}>
          Discard
        </Button>
      )}
      {/* The same two labels the trail uses, chosen the same way. Lite has no
          publish gate, so the button says what it actually does there rather
          than promising a review step that does not exist. */}
      <Button
        variant="brand"
        size="sm"
        disabled={!dirty}
        title={blockers > 0 ? `${blockers} error${blockers === 1 ? '' : 's'} to fix first` : undefined}
        onClick={onReview}
      >
        {features.publish ? 'Review & publish' : 'Review & Save'}
      </Button>
    </>
  )
}
