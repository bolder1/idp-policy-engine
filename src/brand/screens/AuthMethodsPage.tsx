import { useState } from 'react'

import { useBrand } from '../store'
import { AuthMethods } from './AuthMethods'
import { AuthMethodsV2 } from './AuthMethodsV2'

/* Two layouts over one screen, behind the same switch the builder uses.

   They are not two implementations. v2 imports the primary sign-in block, the
   default-method picker, the method card, the settings pane and the setup form
   from v1 — everything you can DO is literally the same code, and the only
   thing that differs is where the detail sits: a slide-over over the list in
   v1, a pane beside it in v2.

   That is what makes the comparison worth having. A difference in arrangement
   is legible when nothing else moved. */

type V = 'v1' | 'v2'

const VERSIONS: { id: V; label: string; blurb: string }[] = [
  { id: 'v2', label: 'v2 · split', blurb: 'All methods on the left, the detail beside them on the same background' },
  { id: 'v1', label: 'v1 · slide-over', blurb: 'A list of eleven cards that opens a panel over itself' },
]

export function AuthMethodsPage() {
  const store = useBrand()
  /* v2 is the proposal, so it is what opens. */
  const [v, setV] = useState<V>('v2')

  return (
    <>
      {/* Prototype furniture, gated the same way the builder's is: a
          watered-down product should not advertise that it has another version
          of itself. */}
      {store.features.designSwitcher && (
        <div className="bzver">
          <span>Methods design</span>
          <div className="bviewswitch" role="tablist" aria-label="Methods version">
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

      {v === 'v2' ? <AuthMethodsV2 /> : <AuthMethods />}
    </>
  )
}
