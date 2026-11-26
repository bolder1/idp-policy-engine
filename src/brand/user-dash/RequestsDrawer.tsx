import { useState } from 'react'
import { Inbox } from 'lucide-react'

import { CharCount } from '../CharCount'
import { Badge, Button, Drawer, Field, Modal, Tip } from '../kit'
import { AppLogo } from '../logos/AppLogo'
import { TEMP_ACCESS_REASON_MAX, dateSaid } from '../screens/sign-in-tests/temp-access'
import { ADMIN_ACCOUNT, useBrand } from '../store'
import { approveTravel } from './admin-requests'
import type { Trip, UserRequest } from './state'
import { placeName } from './trip'

/* -----------------------------------------------------------------------------
   Requests (spec goal 5): where the admin sees what people asked for from the User Dashboard — app requests, travel
   requests and "This wasn't me" reports — and decides. Approving a trip says plainly what it grants: in from anywhere
   until the trip's last day (owner's call, 26 Nov 2026). Design only, behind the top bar's Requests button.
   -------------------------------------------------------------------------- */

const KIND: Record<UserRequest['kind'], string> = { app: 'App request', travel: 'Travel', report: 'Reported sign-in' }

export function ApproveTravelBody({ person, trip, reason, onReason, tried, nothingToGrant = false }: { person: string; trip: Trip; reason: string; onReason: (v: string) => void; tried: boolean; nothingToGrant?: boolean }) {
  /* Every policy that refused the trip has gone since she asked: approving would grant nothing, so it is not offered. */
  if (nothingToGrant)
    return (
      <p className="bud-modal__text" role="alert">
        Nothing to grant: the policies that refused this trip no longer exist. Decline it and ask {person} to check the trip again.
      </p>
    )
  return (
    <div className="bud bud-form">
      <p className="bud-modal__text">
        Lets {person} in from anywhere until {dateSaid(trip.end)}. It ends by itself.
      </p>
      <Field label="Reason" htmlFor="bud-approve-reason">
        <input id="bud-approve-reason" type="text" maxLength={TEMP_ACCESS_REASON_MAX} value={reason} aria-invalid={tried && !reason.trim()} onChange={(e) => onReason(e.target.value)} />
        <CharCount value={reason} max={TEMP_ACCESS_REASON_MAX} />
      </Field>
      {tried && !reason.trim() && (
        <p className="bud-err" role="alert">
          Enter a reason
        </p>
      )}
    </div>
  )
}

function useRequestsView() {
  const store = useBrand()
  const { userDash } = store
  const person = (id: string) => store.users.find((u) => u.id === id)?.name ?? id
  const app = (id?: string) => store.apps.find((a) => a.id === id)
  const trip = (id?: string) => userDash.trips.find((t) => t.id === id)
  const signIn = (id?: string) => userDash.signIns.find((s) => s.id === id)
  const policy = (id: string) => store.policies.find((p) => p.id === id)?.name
  return { store, person, app, trip, signIn, policy }
}

export function RequestsButton() {
  const { userDash } = useBrand()
  const [open, setOpen] = useState(false)
  const pending = userDash.requests.some((r) => r.status === 'pending')
  return (
    <>
      <Tip text="Requests">
        <button type="button" className="bshell__icon bud-req__btn" aria-label={pending ? 'Requests, waiting' : 'Requests'} onClick={() => setOpen(true)}>
          <Inbox size={20} strokeWidth={1.7} />
          {pending && <span className="bud-req__dot" aria-hidden />}
        </button>
      </Tip>
      <RequestsDrawer open={open} onClose={() => setOpen(false)} />
    </>
  )
}

export function RequestsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { store, person, app, trip, signIn, policy } = useRequestsView()
  const { userDash, actUserDash, savePolicy, showToast } = store
  const [approving, setApproving] = useState<UserRequest | null>(null)
  const [reason, setReason] = useState('')
  const [tried, setTried] = useState(false)
  const list = [...userDash.requests].sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending'))

  const decide = (r: UserRequest, status: UserRequest['status'], note: string, why?: string) => actUserDash({ type: 'decide', id: r.id, status, note, reason: why })

  const approveTrip = () => {
    setTried(true)
    const t = trip(approving?.tripId)
    if (!approving || !t || nothing || !reason.trim()) return
    const who = { id: approving.personId, name: person(approving.personId) }
    for (const p of approveTravel(store.policies, approving, t, who, reason.trim(), ADMIN_ACCOUNT.name)) savePolicy(p)
    decide(approving, 'approved', `Travel access to ${placeName(t.placeId)} approved, until ${dateSaid(t.end)}`, reason.trim())
    showToast(`${who.name} can sign in from anywhere until ${dateSaid(t.end)}`)
    setApproving(null)
    setReason('')
    setTried(false)
  }

  const body = (r: UserRequest) => {
    if (r.kind === 'travel') {
      const t = trip(r.tripId)
      const names = (r.policyIds ?? []).map(policy).filter(Boolean)
      return (
        <>
          <strong>{t ? `${placeName(t.placeId)}, ${dateSaid(t.start)} to ${dateSaid(t.end)}` : 'Trip'}</strong>
          {names.length > 0 && <span className="bud-quiet">Refused by {names.join(', ')}</span>}
        </>
      )
    }
    if (r.kind === 'app') {
      const a = app(r.appId)
      return (
        <>
          <strong className="bud-req__app">
            {a && <AppLogo appId={a.id} name={a.name} size={20} />}
            {a?.name ?? r.appId}
          </strong>
          {r.note && <span className="bud-quiet">“{r.note}”</span>}
        </>
      )
    }
    const s = signIn(r.signInId)
    return (
      <>
        <strong>{s ? `${app(s.appId)?.name ?? s.appId}, ${s.when}` : 'A sign-in'}</strong>
        {s && <span className="bud-quiet">{`${s.place} · ${s.device}`}</span>}
      </>
    )
  }

  const actions = (r: UserRequest) => {
    if (r.status !== 'pending') return <Badge tone={r.status === 'declined' ? 'neutral' : 'positive'}>{r.status === 'reviewed' ? 'Reviewed' : r.status === 'approved' ? 'Approved' : 'Declined'}</Badge>
    if (r.kind === 'report')
      return (
        <Button size="sm" variant="neutral" onClick={() => decide(r, 'reviewed', 'Reviewed')}>
          Mark as reviewed
        </Button>
      )
    const label = r.kind === 'app' ? `${app(r.appId)?.name ?? 'The app'}` : 'Travel access'
    return (
      <span className="bud-actions">
        <Button size="sm" variant="neutral" onClick={() => decide(r, 'declined', `${label} was declined`)}>
          Decline
        </Button>
        <Button size="sm" variant="neutral" onClick={() => (r.kind === 'travel' ? setApproving(r) : decide(r, 'approved', `${label} was added to your apps`))}>
          Approve
        </Button>
      </span>
    )
  }

  const t = trip(approving?.tripId)
  /* Nothing left to grant when every policy that refused the trip is gone. */
  const nothing = approving !== null && !(approving.policyIds ?? []).some((id) => store.policies.some((p) => p.id === id))
  return (
    <>
      <Drawer open={open} onClose={onClose} title="Requests" caption="From the User Dashboard">
        <div className="bud bud-req">
          {list.length === 0 ? (
            <p className="bud-quiet">Nothing waiting</p>
          ) : (
            <ul className="bud-req__list">
              {list.map((r) => (
                <li key={r.id} className="bud-req__row">
                  <span className="bud-req__kind">
                    {KIND[r.kind]} · {person(r.personId)}
                  </span>
                  <span className="bud-req__body">{body(r)}</span>
                  <span className="bud-req__end">{actions(r)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Drawer>
      <Modal
        open={approving !== null}
        onClose={() => setApproving(null)}
        title="Approve travel access"
        width={480}
        footer={
          <>
            <Button variant="neutral" onClick={() => setApproving(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={approveTrip} disabled={nothing}>
              Approve
            </Button>
          </>
        }
      >
        {approving && t && <ApproveTravelBody person={person(approving.personId)} trip={t} reason={reason} onReason={setReason} tried={tried} nothingToGrant={nothing} />}
      </Modal>
    </>
  )
}
