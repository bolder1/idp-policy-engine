import { useState } from 'react'

import { useBrand } from '../store'
import { DeviceFingerprint } from './DeviceFingerprint'
import { DeviceFingerprintV2 } from './DeviceFingerprintV2'

/* Two versions of the fingerprint screen on the same store, behind a switch —
   the same arrangement Zones and Authentication methods already use, so a
   version can be compared rather than remembered.

   v1 builds a profile on one surface: choose a mode, then meet all forty-six
   attributes and their tolerances at once.

   v2 splits that into the two questions it actually is. Creation is a popup
   that asks for a name, the kind, and which attributes are in — nothing is
   configured there. Saving drops you inside the profile, and that is where each
   attribute you picked gets tuned. */

type V = 'v2' | 'v1'

const TABS: { id: V; label: string; blurb: string }[] = [
  { id: 'v2', label: 'v2 · profiles', blurb: 'Create in a popup, configure inside the profile' },
  { id: 'v1', label: 'v1 · builder', blurb: 'One surface: mode, attributes and tuning together' },
]

export function FingerprintPage() {
  const store = useBrand()
  const [v, setV] = useState<V>('v2')

  return (
    <>
      {/* Prototype furniture, hidden in the watered-down edition for the same
          reason Zones hides its own: a product should not advertise that it has
          other versions of itself. */}
      {store.features.designSwitcher && (
        <div className="bzver">
          <span>Device fingerprint design</span>
          <div className="bviewswitch" role="tablist" aria-label="Device fingerprint version">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                title={t.blurb}
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

      {v === 'v2' ? <DeviceFingerprintV2 /> : <DeviceFingerprint />}
    </>
  )
}
