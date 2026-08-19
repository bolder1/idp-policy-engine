import { Suspense, lazy, useState } from 'react'

import { useBrand } from '../store'

import { PolicyBuilderV4 } from './PolicyBuilderV4'

/* v4 is the default and ships with the entry. The other five are comparison
   exhibits — kept because comparison is what this prototype is for, opened by
   almost nobody, and each carrying its own layout and stylesheet. Loading them
   on demand keeps the cost of keeping them off the screen that ships. */
const PolicyBuilder = lazy(() => import('./PolicyBuilder').then((m) => ({ default: m.PolicyBuilder })))
const PolicyBuilderV0 = lazy(() => import('./PolicyBuilderV0').then((m) => ({ default: m.PolicyBuilderV0 })))
const PolicyBuilderV2 = lazy(() => import('./PolicyBuilderV2').then((m) => ({ default: m.PolicyBuilderV2 })))
const PolicyBuilderV3 = lazy(() => import('./PolicyBuilderV3').then((m) => ({ default: m.PolicyBuilderV3 })))
const PolicyBuilderV5 = lazy(() => import('./PolicyBuilderV5').then((m) => ({ default: m.PolicyBuilderV5 })))

type V = 'v5' | 'v4' | 'v3' | 'v2' | 'v1' | 'v0'

const VERSIONS: { id: V; label: string; blurb: string }[] = [
  { id: 'v4', label: 'v4 · recommended', blurb: 'The shipping candidate — form on the stage, undo, command bar, publish gate' },
  { id: 'v5', label: 'v5 · mega', blurb: 'The same builder with three switchable workspaces, kept for comparison' },
  { id: 'v3', label: 'v3 · steps', blurb: 'One column of numbered steps that expand in place' },
  { id: 'v2', label: 'v2 · tool layout', blurb: 'Palette, canvas, inspector' },
  { id: 'v1', label: 'v1 · canvas', blurb: 'Canvas and inspector, Spine and Branch views' },
  { id: 'v0', label: 'v0 · deployed', blurb: 'The current prototype, recreated as-is' },
]

/* Six builders over one policy, behind a switch.

   v0 — the deployed prototype, recreated as-is from docs/v0-policy-flow.md:
        flow column, editor, reusable-objects rail.
   v1 — canvas + inspector, resizable split, Spine/Branch views. Still the only
        one that owns the Branch view, and the first to edit the whole factor
        model.
   v2 — the three-zone tool layout (palette / canvas / inspector) that Tines,
        Airtable and V7 converge on.
   v3 — the Zap model: one column of numbered steps that expand in place.
   v4 — the form-first answer to v3's real limit: this model's rule is a long
        form, and a long form cannot open inside the sequence it belongs to.
   v5 — all of the above over one state, because the argument between them was
        never about which is right, only about which is right for the task in
        front of you.

   They share the model, the store, the diagnostics and the simulator, and v0,
   v3, v4 and v5 share the same dialogs, so a fix to Review or Test lands in all
   of them. */
export function BuilderPage({ policyId, open }: { policyId: string; open?: 'gauntlet' | 'impact' }) {
  const store = useBrand()
  const [v, setV] = useState<V>('v4')

  return (
    <>
      {/* Prototype furniture. A watered-down product should not advertise
          that it has six other versions of itself. */}
      {store.features.designSwitcher && (
      <div className="bzver">
        <span>Builder design</span>
        <div className="bviewswitch" role="tablist" aria-label="Builder version">
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

      {v === 'v4' ? (
        <PolicyBuilderV4 policyId={policyId} open={open} />
      ) : (
        <Suspense fallback={<p className="bzver__loading">Loading {v}…</p>}>
          {v === 'v5' ? (
            <PolicyBuilderV5 policyId={policyId} open={open} />
          ) : v === 'v3' ? (
            <PolicyBuilderV3 policyId={policyId} />
          ) : v === 'v2' ? (
            <PolicyBuilderV2 policyId={policyId} />
          ) : v === 'v1' ? (
            <PolicyBuilder policyId={policyId} />
          ) : (
            <PolicyBuilderV0 policyId={policyId} />
          )}
        </Suspense>
      )}
    </>
  )
}
