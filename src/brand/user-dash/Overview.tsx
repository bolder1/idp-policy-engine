import { CircleCheck, CircleDashed } from 'lucide-react'

import { Button } from '../kit'
import { useBrand } from '../store'
import { useCheckup } from './use-configured'

/* -----------------------------------------------------------------------------
   My account's Overview: the account checkup (one action per open item), then two doors to the pages people act on
   most. A figure shown in the checkup is not repeated in the doors (one number, once).
   -------------------------------------------------------------------------- */

export function Overview() {
  const { go, userDash } = useBrand()
  const { items } = useCheckup()
  const last = userDash.signIns[0]
  const trip = userDash.trips[userDash.trips.length - 1]

  return (
    <div className="bud-ov">
      <header className="bud-head">
        <h1>My account</h1>
        <p>Your sign-in methods, devices and trips.</p>
      </header>

      <section className="bud-card" aria-labelledby="bud-checkup">
        <h2 id="bud-checkup">Account checkup</h2>
        <ul className="bud-check">
          {items.map((i) => (
            <li key={i.id} className={`bud-check__row${i.done ? ' is-done' : ''}`}>
              {i.done ? <CircleCheck size={18} strokeWidth={1.9} aria-hidden className="bud-check__ok" /> : <CircleDashed size={18} strokeWidth={1.9} aria-hidden />}
              <span className="bud-check__label">{i.label}</span>
              {i.done ? (
                <span className="bud-quiet">Done</span>
              ) : (
                <Button size="sm" variant="link" onClick={() => go(i.action.to)}>
                  {i.action.label}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <div className="bud-ov__doors">
        <section className="bud-card">
          <h2>Recent sign-ins</h2>
          <p className="bud-quiet">{last ? `Last: ${last.when}, ${last.place}` : 'No sign-ins yet'}</p>
          <Button size="sm" variant="link" onClick={() => go({ name: 'account', page: 'sign-ins' })}>
            Review sign-ins
          </Button>
        </section>
        <section className="bud-card">
          <h2>Travel</h2>
          <p className="bud-quiet">{trip ? 'Your next trip is planned' : 'Check your apps before you travel'}</p>
          <Button size="sm" variant="link" onClick={() => go({ name: 'account', page: 'travel' })}>
            {trip ? 'Open travel' : 'Add trip'}
          </Button>
        </section>
      </div>
    </div>
  )
}
