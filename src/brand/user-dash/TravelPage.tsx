import { useMemo, useState } from 'react'
import { Plane, Plus } from 'lucide-react'

import { Button, Field } from '../kit'
import { AppLogo } from '../logos/AppLogo'
import { Picker } from '../picker'
import { PLACES } from '../places'
import { useSimEnv } from '../screens/sim-env'
import { dateSaid } from '../screens/sign-in-tests/temp-access'
import { END_USER_ACCOUNT, useBrand } from '../store'
import { shownOnDashboard } from '../app-setup'
import type { Trip, UserRequest } from './state'
import { placeName, tripIssue, tripOutlook, type AppOutlook } from './trip'

/* -----------------------------------------------------------------------------
   Travel (spec goal 4, the thing competitors lack): tell the company where you are going and when, see which of your
   apps will work there, and ask for access to the ones that will not. The admin approves it as Temporary access. The
   page names apps and outlooks only — never a policy, rule, zone or condition.
   -------------------------------------------------------------------------- */

type Asked = 'no' | 'pending' | 'approved' | 'declined'
type Outlook = { appId: string; outlook: AppOutlook; policyId: string | null }

const GROUPS: { outlook: AppOutlook; title: string }[] = [
  { outlook: 'blocked', title: "Won't work there" },
  { outlook: 'unsure', title: "Can't tell yet" },
  { outlook: 'works', title: 'Works there' },
]

export function TripCard({ trip, outlook, asked, onAsk, primary = true }: { trip: Trip; outlook: readonly Outlook[]; asked: Asked; onAsk: () => void; primary?: boolean }) {
  const { apps } = useBrand()
  const nameOf = (id: string) => apps.find((a) => a.id === id)?.name ?? id
  const blocked = outlook.some((o) => o.outlook === 'blocked')

  return (
    <section className="bud-card bud-trip" aria-label={`Trip to ${placeName(trip.placeId)}`}>
      <header className="bud-trip__head">
        <Plane size={18} strokeWidth={1.8} aria-hidden />
        <h2>{placeName(trip.placeId)}</h2>
        <span className="bud-quiet">
          {dateSaid(trip.start)} to {dateSaid(trip.end)}
        </span>
      </header>
      {GROUPS.map((g) => {
        const list = outlook.filter((o) => o.outlook === g.outlook)
        return (
          list.length > 0 && (
            <div key={g.outlook} className={`bud-trip__group is-${g.outlook}`}>
              <h3>{g.title}</h3>
              <ul>
                {list.map((o) => (
                  <li key={o.appId}>
                    <AppLogo appId={o.appId} name={nameOf(o.appId)} size={22} />
                    {nameOf(o.appId)}
                  </li>
                ))}
              </ul>
            </div>
          )
        )
      })}
      {blocked && (
        <div className="bud-actions">
          {asked === 'pending' ? (
            <Button variant="neutral" disabled>
              Access asked for
            </Button>
          ) : (
            <Button variant={primary ? 'primary' : 'neutral'} onClick={onAsk}>
              {asked === 'declined' ? 'Ask again' : "Ask for access while I'm there"}
            </Button>
          )}
        </div>
      )}
    </section>
  )
}

const today = () => new Date().toISOString().slice(0, 10)
const PLACE_OPTIONS = PLACES.filter((p) => p.kind !== 'state').map((p) => ({ value: p.id, label: p.kind === 'country' ? p.name : `${p.name}, ${p.country}` }))

function AddTrip({ onDone }: { onDone: () => void }) {
  const { actUserDash, userDash } = useBrand()
  const [v, setV] = useState({ placeId: '', start: '', end: '' })
  const [tried, setTried] = useState(false)
  const issue = tried ? tripIssue(v, today()) : null
  const add = () => {
    setTried(true)
    if (tripIssue(v, today())) return
    actUserDash({ type: 'add-trip', trip: { id: `trip-${userDash.trips.length + 1}`, ...v } })
    onDone()
  }
  const err = (f: 'place' | 'start' | 'end') =>
    issue?.field === f && (
      <p className="bud-err" role="alert">
        {issue.text}
      </p>
    )
  return (
    <section className="bud-card bud-form" aria-label="Add trip">
      <h2>Add trip</h2>
      <Field label="Where" htmlFor="bud-trip-place">
        <Picker label="Where" width="fill" size="md" searchable value={v.placeId || null} options={PLACE_OPTIONS} onChange={(id) => setV({ ...v, placeId: id })} />
      </Field>
      {err('place')}
      <div className="bud-trip__dates">
        <Field label="From" htmlFor="bud-trip-start">
          <input id="bud-trip-start" type="date" min={today()} value={v.start} aria-invalid={issue?.field === 'start'} onChange={(e) => setV({ ...v, start: e.target.value })} />
        </Field>
        <Field label="Until" htmlFor="bud-trip-end">
          <input id="bud-trip-end" type="date" min={v.start || today()} value={v.end} aria-invalid={issue?.field === 'end'} onChange={(e) => setV({ ...v, end: e.target.value })} />
        </Field>
      </div>
      {err('start')}
      {err('end')}
      <div className="bud-actions">
        <Button variant="primary" onClick={add}>
          Check my apps
        </Button>
        <Button variant="neutral" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </section>
  )
}

export function TravelPage() {
  const store = useBrand()
  const { userDash, actUserDash, showToast } = store
  const env = useSimEnv()
  const [adding, setAdding] = useState(userDash.trips.length === 0)
  const mine = useMemo(() => store.apps.filter((a) => shownOnDashboard(a.setup) || userDash.granted.includes(a.id)).map((a) => a.id), [store.apps, userDash.granted])

  const askedFor = (trip: Trip): Asked => {
    const r = [...userDash.requests].reverse().find((x) => x.kind === 'travel' && x.tripId === trip.id)
    return !r ? 'no' : r.status === 'pending' ? 'pending' : r.status === 'declined' ? 'declined' : 'approved'
  }

  const ask = (trip: Trip, outlook: readonly Outlook[]) => {
    const policyIds = [...new Set(outlook.filter((o) => o.outlook === 'blocked' && o.policyId).map((o) => o.policyId!))]
    const request: UserRequest = { id: `travel-${trip.id}-${userDash.requests.length}`, kind: 'travel', personId: END_USER_ACCOUNT.id, at: 'Just now', status: 'pending', tripId: trip.id, policyIds }
    actUserDash({ type: 'ask', request })
    showToast('Asked your administrator for access while you travel')
  }

  return (
    <div className="bud-page">
      <header className="bud-head bud-head--row">
        <div>
          <h1>Travel</h1>
          <p>Check your apps before you travel.</p>
        </div>
        {!adding && (
          <Button variant="neutral" icon={Plus} onClick={() => setAdding(true)}>
            Add trip
          </Button>
        )}
      </header>
      {adding && <AddTrip onDone={() => setAdding(false)} />}
      {[...userDash.trips].reverse().map((trip, i) => {
        const outlook = tripOutlook(trip, END_USER_ACCOUNT.id, mine, store.policies, env)
        /* One orange button per view: the newest trip's ask, and none while the Add trip form has its own. */
        return <TripCard key={trip.id} trip={trip} outlook={outlook} asked={askedFor(trip)} onAsk={() => ask(trip, outlook)} primary={!adding && i === 0} />
      })}
    </div>
  )
}
