import { useState } from 'react'

import { useBrand } from '../store'
import { ZonesFinal } from './ZonesFinal'
import { ZonesV2 } from './ZonesV2'

/* Two designs over one store.

   The wrapper carried a switcher once, lost it when the alternatives were
   deleted, and kept a note saying this is where a future variant would go. This
   is that variant.

   The difference is a model decision, not a layout one. v1's zone has two
   halves — networks and places — evaluated together, and its shape is whatever
   you happened to fill in. v2 asks which kind a zone is when you name it, and
   then only offers that one: one column in the table, one section on the inner
   page, no tabs, no "Any location" on rows that were never about location.

   They share the store on purpose. Both read the same zones, both write through
   the same actions, and v2 only ever edits the half a zone declares — so you
   can make a zone in one, open it in the other, and nothing is lost in the
   round trip. That is what makes the comparison worth anything: the two screens
   disagree about the model, not about the data.

   Gated like the methods switcher: prototype furniture, and a watered-down
   product should not advertise that it has another version of itself. */

type V = 'v1' | 'v2'

const VERSIONS: { id: V; label: string; blurb: string }[] = [
  { id: 'v2', label: 'v2 · one kind', blurb: 'A zone is networks or places, chosen when it is named' },
  { id: 'v1', label: 'v1 · two halves', blurb: 'A zone is networks AND places, both evaluated together' },
]

export function ZonesPage() {
  const store = useBrand()
  /* v2 is the proposal, so it is what opens. */
  const [v, setV] = useState<V>('v2')

  return (
    <>
      {store.features.designSwitcher && store.role === 'admin' && (
        <div className="bzver">
          <span>Zones design</span>
          <div className="bviewswitch" role="tablist" aria-label="Zones version">
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

      {v === 'v2' ? <ZonesV2 /> : <ZonesFinal />}
    </>
  )
}
