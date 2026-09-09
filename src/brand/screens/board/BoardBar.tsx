import { Activity, ChevronLeft, ChevronRight, ListChecks, Pencil } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button, StatusPill } from '../../kit'
import { appsOf, type Policy } from '../../data'
import { AppLogo } from '../../logos/AppLogo'
import { useBrand } from '../../store'

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
   · The audience goes too. It was the last labelled fact standing, and it is
     the one thing in the row that is neither where you are nor what you can do
     to the draft — a reading, in a bar whose job is to be quiet. Edit details
     holds it, and each rule's Who pane says who that rule covers, which is
     where the narrowing is actually done.
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
  /* The system policy is the one that names no application and covers all of
     them. Every other policy names a list, and the bar has room for one mark —
     so the first, with the count carrying the rest. */
  const named = appsOf(policy, store.apps)
  const app = named[0] ?? null

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

        {/* One crumb, not two, and the mark is what merged them.

            The application had a crumb of its own — a 16px mark, its name, and
            a chevron before the policy — on the argument that a policy hangs
            off the thing it protects. True, and it read as a stutter, because
            most policies here are NAMED after the application they govern:
            "Production Monitoring › Production Monitoring — On-Call Override"
            is one word said twice with a chevron between the halves.

            So the mark comes across onto the policy's own chip and the crumb
            goes. The mark is the application: it carries its name as a title,
            it is the same glyph the policy list and the picker use, and the
            place that spells the application out in words is one click away
            behind this very chip.

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
          title={app ? `${app.name} — edit the policy's name, application and audience` : "Edit the policy's name, application and audience"}
          onClick={() => store.go({ name: 'policy-details', policyId: policy.id, from: 'board' })}
        >
          {app && <AppLogo appId={app.id} name={app.name} size={16} />}
          {named.length > 1 && <i className="bbar__appmore">+{named.length - 1}</i>}
          <b>{policy.name}</b>
          <Pencil size={12} strokeWidth={2} aria-hidden />
        </button>

        {/* The two cases the mark cannot draw, kept as words after the name.

            A policy naming no application is a set of rules no sign-in can ever
            reach — the one fact in this bar worth interrupting for, so it keeps
            its red and it never truncates. The system policy is the opposite
            case and needs saying for the same reason: it is the only one here
            that is not about a single application. */}
        {policy.isSystem && <span className="bbtop__crumb is-static">Every application</span>}
        {!policy.isSystem && !app && <span className="bbtop__crumb is-warn">No application — these rules never run</span>}

        <StatusPill status={policy.status} />
      </nav>

      {/* Who it governs stood here — a glyph, a phrase, a count and a hover
          panel listing the groups. Removed: it is the one thing in this row
          that is neither where you are nor what you can do to the draft, and
          the bar is meant to be quiet. It is still a click away behind the
          name chip, and the rules themselves say who they cover on the Who
          pane, per rule, which is where the narrowing actually happens. */}

      <div className="bbtop__acts">{actions}</div>
    </header>
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
