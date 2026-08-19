import { useState } from 'react'

import { useBrand } from '../store'

import { Zones } from './Zones'
import { ZonesV2 } from './ZonesV2'
import { ZonesV3 } from './ZonesV3'
import { ZonesV4 } from './ZonesV4'
import { ZonesV5 } from './ZonesV5'
import { ZonesFinal } from './ZonesFinal'

/* All five versions of the zones screen behind a switch, so they can be
   compared on the same data rather than from memory.

   v1 is the spec rendered faithfully: two numbered sections, a drawn AND, a
   validation list.

   v2 keeps that model and rebuilds the operating surface — a list on the left,
   a form on the right, inline add/edit/delete, a confirmed delete.

   v3 collapses the master–detail into one column. Rows open in place, so the
   zone you are editing never moves and never gets covered; creating happens in
   a card above the list that is shaped nothing like a row.

   v4 is the Drive layout: a dense list with a type icon per row, actions that
   appear on hover, and a details panel docked to the right that the list makes
   room for rather than being covered by. Its second tab answers the question
   the count on every other version only hints at — which policies actually use
   this zone.

   v5 answers three things none of the others did: a zone now records what it is
   for (allowed, blocked, or custom) and creation asks for it; two defaults ship
   that can be edited but not deleted; and the two halves of the model — the
   addresses and the locations it ANDs together — are two equal columns on screen
   at once rather than one above the other behind a scroll.
   -------------------------------------------------------------------------- */

type V = 'final' | 'v5' | 'v4' | 'v3' | 'v2' | 'v1'

const TABS: { id: V; label: string }[] = [
  { id: 'final', label: 'Final' },
  { id: 'v5', label: 'v5 · split' },
  { id: 'v4', label: 'v4 · drive' },
  { id: 'v3', label: 'v3 · inline' },
  { id: 'v2', label: 'v2 · workbench' },
  { id: 'v1', label: 'v1 · sections' },
]

export function ZonesPage() {
  const store = useBrand()
  const [v, setV] = useState<V>('final')

  return (
    <>
      {/* Prototype furniture. A watered-down product should not advertise
          that it has six other versions of itself. */}
      {store.features.designSwitcher && (
      <div className="bzver">
        <span>Zones design</span>
        <div className="bviewswitch" role="tablist" aria-label="Zones design version">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={v === t.id}
              className={v === t.id ? 'is-on' : ''}
              onClick={() => setV(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      )}

      {v === 'final' && <ZonesFinal />}
      {v === 'v5' && <ZonesV5 />}
      {v === 'v4' && <ZonesV4 />}
      {v === 'v3' && <ZonesV3 />}
      {v === 'v2' && <ZonesV2 />}
      {v === 'v1' && <Zones />}
    </>
  )
}
