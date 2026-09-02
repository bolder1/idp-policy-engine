import { Suspense, lazy, useState } from 'react'

import { useBrand } from '../store'

import { PolicyBuilderMain } from './PolicyBuilderMain'

/* The bench is the alternative, not the default, so it loads on demand. */
const PolicyBuilderBench = lazy(() =>
  import('./PolicyBuilderBench').then((m) => ({ default: m.PolicyBuilderBench })),
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

   Both share the model, the evaluator, the linter, the composer and the
   dialogs, so a fix to any of those lands in both. Only the shell differs.
   -------------------------------------------------------------------------- */

type V = 'main' | 'bench'

const VERSIONS: { id: V; label: string; blurb: string }[] = [
  { id: 'main', label: 'Main', blurb: 'Rules as a list you expand in place — the sequence stays on screen' },
  { id: 'bench', label: 'v2 · bench', blurb: 'One rule at a time, under a verdict header that cannot be scrolled away' },
]

export function BuilderPage({ policyId, open }: { policyId: string; open?: 'gauntlet' | 'impact' }) {
  const store = useBrand()
  const [v, setV] = useState<V>('main')

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

      {v === 'main' ? (
        <PolicyBuilderMain policyId={policyId} open={open} />
      ) : (
        <Suspense fallback={<p className="bzver__loading">Loading the bench…</p>}>
          <PolicyBuilderBench policyId={policyId} open={open} />
        </Suspense>
      )}
    </>
  )
}
