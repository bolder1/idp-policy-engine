import { Suspense, lazy, useState } from 'react'

import { useBrand } from '../store'

import { PolicyBar } from './policy-bar'
import { PolicyBuilderMain } from './PolicyBuilderMain'

/* The alternatives load on demand — Main is the default and ships with the
   entry chunk. */
const PolicyBuilderBench = lazy(() =>
  import('./PolicyBuilderBench').then((m) => ({ default: m.PolicyBuilderBench })),
)
const PolicyBuilderLedger = lazy(() =>
  import('./PolicyBuilderLedger').then((m) => ({ default: m.PolicyBuilderLedger })),
)

/* -----------------------------------------------------------------------------
   The builder, in two shapes over one policy.

   These are not versions in the sense the old six-way switcher meant — those
   were layout experiments that had stopped being able to express the model.
   These two disagree about one thing, and it is a real disagreement:

   · **Main** puts the rules in a list you expand in place. A rule opens where
     it sits, so the sequence around it never leaves the screen and two rules
     can be compared by opening one and reading the other's summary beneath it.
     The cost is that a long rule pushes its own outcome below the fold.

   · **Bench** makes the rail the only list and gives the selected rule a pane
     whose top is a fixed verdict header. The outcome cannot be pushed anywhere,
     and the condition canvas owns the only unbounded scroll in the screen. The
     cost is that you see one rule at a time.

   · **Ledger** stops optimising for one rule at all. Seven columns, one per
     part of a rule's grammar, read down rather than across — because four of
     the five things this product is still bad at are RELATIONS between rules
     (compare two, render a finding about a pair, edit several at once, move one
     a long way), and a relation cannot be drawn in a layout that can only show
     one of its ends. The cost is that no single rule is ever fully visible;
     structural edits happen in a sheet capped so it never covers the first
     three columns.

   Both share the model, the evaluator, the linter, the composer and the
   dialogs, so a fix to any of those lands in both. Only the shell differs.
   -------------------------------------------------------------------------- */

type V = 'main' | 'bench' | 'ledger'

const VERSIONS: { id: V; label: string; blurb: string }[] = [
  { id: 'main', label: 'Main', blurb: 'Rules as a list you expand in place — the sequence stays on screen' },
  { id: 'bench', label: 'v2 · bench', blurb: 'One rule at a time, under a verdict header that cannot be scrolled away' },
  { id: 'ledger', label: 'v3 · ledger', blurb: 'The whole policy as one grid — read down columns, compare rules, retune in place' },
]

export function BuilderPage({ policyId, open }: { policyId: string; open?: 'gauntlet' | 'impact' }) {
  const store = useBrand()
  const [v, setV] = useState<V>('main')
  const policy = store.policyById(policyId)

  return (
    <>
      {/* Prototype furniture. A watered-down product should not advertise that
          it has another version of itself. */}
      {store.features.designSwitcher && (
        <div className="bzver">
          <span>Builder design</span>
          <div className="bviewswitch" role="tablist" aria-label="Builder design">
            {VERSIONS.map((o) => (
              <button
                key={o.id}
                role="tab"
                type="button"
                title={o.blurb}
                aria-selected={v === o.id}
                className={v === o.id ? 'is-on' : ''}
                onClick={() => setV(o.id)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Rendered here rather than by each shell, which is what makes the
          three builders agree about what the policy IS. They only disagree
          about how its rules are edited. */}
      {policy && <PolicyBar policy={policy} />}

      {v === 'main' ? (
        <PolicyBuilderMain policyId={policyId} open={open} />
      ) : (
        <Suspense fallback={<p className="bzver__loading">Loading…</p>}>
          {v === 'bench' ? (
            <PolicyBuilderBench policyId={policyId} open={open} />
          ) : (
            <PolicyBuilderLedger policyId={policyId} open={open} />
          )}
        </Suspense>
      )}
    </>
  )
}
