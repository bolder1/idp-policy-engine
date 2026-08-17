import { useState } from 'react'

import { Zones } from './Zones'
import { ZonesV2 } from './ZonesV2'

/* Both versions of the zones screen, side by side behind a switch, so the two
   can be compared on the same data rather than from memory.

   v1 is the spec rendered faithfully: two numbered sections, a drawn AND, a
   validation list. v2 keeps that model and rebuilds the operating surface —
   a list with per-row actions, a labelled name field, inline add/edit/delete
   on every entry, and a confirmed delete. */
export function ZonesPage() {
  const [v, setV] = useState<'v2' | 'v1'>('v2')

  return (
    <>
      <div className="bzver">
        <span>Zones design</span>
        <div className="bviewswitch" role="tablist" aria-label="Zones design version">
          <button
            role="tab"
            aria-selected={v === 'v2'}
            className={v === 'v2' ? 'is-on' : ''}
            onClick={() => setV('v2')}
          >
            v2 · workbench
          </button>
          <button
            role="tab"
            aria-selected={v === 'v1'}
            className={v === 'v1' ? 'is-on' : ''}
            onClick={() => setV('v1')}
          >
            v1 · sections
          </button>
        </div>
      </div>

      {v === 'v2' ? <ZonesV2 /> : <Zones />}
    </>
  )
}
