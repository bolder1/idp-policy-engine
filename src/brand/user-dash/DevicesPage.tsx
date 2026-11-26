import { Laptop, Smartphone, Tablet } from 'lucide-react'

import { Badge, Button } from '../kit'
import { useBrand } from '../store'
import type { PersonalDevice } from './state'

/* -----------------------------------------------------------------------------
   Devices (spec goal 2): the devices signed in to your account. Sign out of any but the one you are on; Undo brings it
   back.
   -------------------------------------------------------------------------- */

const ICON = { laptop: Laptop, phone: Smartphone, tablet: Tablet } as const

export function DeviceList({ devices, onSignOut }: { devices: readonly PersonalDevice[]; onSignOut: (d: PersonalDevice) => void }) {
  return (
    <ul className="bud-devices">
      {devices.map((d) => {
        const Icon = ICON[d.kind]
        return (
          <li key={d.id} className="bud-device">
            <Icon size={20} strokeWidth={1.7} aria-hidden />
            <span className="bud-device__text">
              <span className="bud-device__name">{d.name}</span>
              <span className="bud-quiet">Last used {d.lastUsed}</span>
            </span>
            {d.current ? (
              <Badge tone="info">This device</Badge>
            ) : (
              <Button size="sm" variant="neutral" onClick={() => onSignOut(d)}>
                Sign out
              </Button>
            )}
          </li>
        )
      })}
    </ul>
  )
}

export function DevicesPage() {
  const { userDash, actUserDash, showToast } = useBrand()
  const signOut = (d: PersonalDevice) => {
    const at = userDash.devices.findIndex((x) => x.id === d.id)
    actUserDash({ type: 'sign-out-device', deviceId: d.id })
    showToast(`Signed out of ${d.name}`, { label: 'Undo', run: () => actUserDash({ type: 'restore-device', device: d, at }) })
  }
  return (
    <div className="bud-page">
      <header className="bud-head">
        <h1>Devices</h1>
        <p>Devices signed in to your account.</p>
      </header>
      <section className="bud-card">
        <DeviceList devices={userDash.devices} onSignOut={signOut} />
      </section>
    </div>
  )
}
