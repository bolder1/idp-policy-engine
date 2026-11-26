/* -----------------------------------------------------------------------------
   The proposed User Dashboard's demo state (spec 2026-11-26-user-dashboard-design.md). One slice on the brand store,
   changed only through `reduceUserDash`, so the end-user side and the admin's Requests read the same record and it
   survives the account menu's role switch. In memory: a reload starts the demo again. PURE.
   -------------------------------------------------------------------------- */

/** A trip the person tells the company about: one place, ISO dates. */
export interface Trip {
  id: string
  /** A `places.ts` place id (country or city). */
  placeId: string
  start: string
  end: string
}

export type RequestKind = 'app' | 'travel' | 'report'
export type RequestStatus = 'pending' | 'approved' | 'declined' | 'reviewed'

export interface UserRequest {
  id: string
  kind: RequestKind
  personId: string
  /** ISO date it was made. */
  at: string
  status: RequestStatus
  appId?: string
  tripId?: string
  /** Travel: the policies that refused the trip. Admin side only; never drawn for the person. */
  policyIds?: string[]
  signInId?: string
  note?: string
}

export interface UserNote {
  id: string
  text: string
  at: string
  read: boolean
}

export interface PersonalSignIn {
  id: string
  appId: string
  /** "Today 09:10". */
  when: string
  /** Approximate, from the network: "Pune, India". */
  place: string
  device: string
  result: 'allowed' | 'asked' | 'blocked'
}

export interface PersonalDevice {
  id: string
  name: string
  kind: 'laptop' | 'phone' | 'tablet'
  lastUsed: string
  current: boolean
}

export interface UserDashState {
  favourites: string[]
  hidden: string[]
  recent: string[]
  trips: Trip[]
  requests: UserRequest[]
  notes: UserNote[]
  devices: PersonalDevice[]
  signIns: PersonalSignIn[]
  reported: string[]
  /** Apps an admin added for her through an app request. */
  granted: string[]
  /** Days since she last changed her password. */
  passwordAgeDays: number
}

export type UserDashAction =
  | { type: 'favourite' | 'hide' | 'open'; appId: string }
  | { type: 'add-trip'; trip: Trip }
  | { type: 'ask'; request: UserRequest }
  | { type: 'decide'; id: string; status: RequestStatus; note: string; reason?: string }
  | { type: 'report'; signInId: string }
  | { type: 'sign-out-device'; deviceId: string }
  | { type: 'restore-device'; device: PersonalDevice; at: number }
  | { type: 'read-all' }
  | { type: 'password-changed' }

export const RECENT_MAX = 6

const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

/** The same request again: one travel request per trip, one app request per app, until an admin declines it. */
const sameAsk = (a: UserRequest, b: UserRequest) =>
  a.status !== 'declined' && a.kind === b.kind && a.personId === b.personId && (b.kind === 'travel' ? a.tripId === b.tripId : a.appId === b.appId)

export function reduceUserDash(s: UserDashState, a: UserDashAction): UserDashState {
  switch (a.type) {
    case 'favourite':
      return { ...s, favourites: toggle(s.favourites, a.appId) }
    case 'hide':
      return { ...s, hidden: toggle(s.hidden, a.appId) }
    case 'open':
      return { ...s, recent: [a.appId, ...s.recent.filter((x) => x !== a.appId)].slice(0, RECENT_MAX) }
    case 'add-trip':
      return { ...s, trips: [...s.trips, a.trip] }
    case 'ask':
      if (a.request.kind !== 'report' && s.requests.some((r) => sameAsk(r, a.request))) return s
      return { ...s, requests: [...s.requests, a.request] }
    case 'decide': {
      const req = s.requests.find((r) => r.id === a.id)
      /* Decided once: a second click, or Approve then Decline, changes nothing. */
      if (!req || req.status !== 'pending' || a.status === 'pending') return s
      const requests = s.requests.map((r) => (r.id === a.id ? { ...r, status: a.status, note: a.reason ?? r.note } : r))
      /* A report is the admin's to close; the person is told about the requests they made. */
      const notes = req.kind === 'report' ? s.notes : [{ id: `n${s.notes.length}-${a.id}`, text: a.note, at: 'Just now', read: false }, ...s.notes]
      const granted = req.kind === 'app' && a.status === 'approved' && req.appId && !s.granted.includes(req.appId) ? [...s.granted, req.appId] : s.granted
      return { ...s, requests, notes, granted }
    }
    case 'report':
      if (s.reported.includes(a.signInId)) return s
      return {
        ...s,
        reported: [...s.reported, a.signInId],
        requests: [...s.requests, { id: `report-${a.signInId}`, kind: 'report', personId: 'priya', at: 'Just now', status: 'pending', signInId: a.signInId }],
      }
    case 'sign-out-device':
      return { ...s, devices: s.devices.filter((d) => d.current || d.id !== a.deviceId) }
    case 'restore-device':
      if (s.devices.some((d) => d.id === a.device.id)) return s
      return { ...s, devices: [...s.devices.slice(0, a.at), a.device, ...s.devices.slice(a.at)] }
    case 'password-changed':
      return { ...s, passwordAgeDays: 0 }
    case 'read-all':
      return { ...s, notes: s.notes.map((n) => (n.read ? n : { ...n, read: true })) }
  }
}
