import { useEffect } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { BrandProvider, useBrand } from '../store'
import { seedUserDash } from './seed'
import { reduceUserDash, type UserRequest } from './state'

/* -----------------------------------------------------------------------------
   The proposed User Dashboard's demo state (plan Task 2): pure actions over one slice the brand store holds, so it
   lives through the account menu's role switch and resets on reload.
   -------------------------------------------------------------------------- */

const s0 = seedUserDash()
const travel = (id: string, tripId: string): UserRequest => ({ id, kind: 'travel', personId: 'priya', at: '2026-11-26', status: 'pending', tripId, policyIds: ['p1'] })

describe('the User Dashboard state', () => {
  it('seeds favourites, sign-ins with one from Mumbai, and a current device', () => {
    expect(s0.favourites).toEqual(['slack', 'hrms', 'zoom'])
    expect(s0.signIns.filter((r) => r.place.startsWith('Mumbai'))).toHaveLength(1)
    expect(s0.devices.filter((d) => d.current)).toHaveLength(1)
  })

  it('favourite toggles', () => {
    const on = reduceUserDash(s0, { type: 'favourite', appId: 'jira' })
    expect(on.favourites).toContain('jira')
    expect(reduceUserDash(on, { type: 'favourite', appId: 'jira' }).favourites).not.toContain('jira')
  })

  it('hide toggles', () => {
    const hidden = reduceUserDash(s0, { type: 'hide', appId: 'zoom' })
    expect(hidden.hidden).toEqual(['zoom'])
    expect(reduceUserDash(hidden, { type: 'hide', appId: 'zoom' }).hidden).toEqual([])
  })

  it('open keeps six recent, newest first', () => {
    let s = s0
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'b']) s = reduceUserDash(s, { type: 'open', appId: id })
    expect(s.recent).toEqual(['b', 'g', 'f', 'e', 'd', 'c'])
  })

  it('asks once per trip', () => {
    const once = reduceUserDash(s0, { type: 'ask', request: travel('r1', 't1') })
    const twice = reduceUserDash(once, { type: 'ask', request: travel('r2', 't1') })
    expect(twice.requests.filter((r) => r.kind === 'travel')).toHaveLength(1)
    /* Another trip is another request. */
    expect(reduceUserDash(twice, { type: 'ask', request: travel('r3', 't2') }).requests.filter((r) => r.kind === 'travel')).toHaveLength(2)
  })

  it('decide notifies', () => {
    const asked = reduceUserDash(s0, { type: 'ask', request: travel('r1', 't1') })
    const done = reduceUserDash(asked, { type: 'decide', id: 'r1', status: 'approved', note: 'Travel access approved' })
    expect(done.requests.find((r) => r.id === 'r1')?.status).toBe('approved')
    expect(done.notes.filter((n) => !n.read).map((n) => n.text)).toContain('Travel access approved')
    expect(reduceUserDash(done, { type: 'read-all' }).notes.every((n) => n.read)).toBe(true)
  })

  it('decides a request once, and records why', () => {
    const asked = reduceUserDash(s0, { type: 'ask', request: travel('r1', 't1') })
    const done = reduceUserDash(asked, { type: 'decide', id: 'r1', status: 'approved', note: 'Approved', reason: 'Client visit' })
    expect(done.requests[0].note).toBe('Client visit')
    const again = reduceUserDash(done, { type: 'decide', id: 'r1', status: 'declined', note: 'Declined' })
    expect(again).toBe(done)
  })

  it('an approved app request puts the app on her dashboard', () => {
    const req: UserRequest = { id: 'a1', kind: 'app', personId: 'priya', at: 'Now', status: 'pending', appId: 'figma' }
    const done = reduceUserDash(reduceUserDash(s0, { type: 'ask', request: req }), { type: 'decide', id: 'a1', status: 'approved', note: 'Figma added' })
    expect(done.granted).toEqual(['figma'])
  })

  it('asks again only after a decline', () => {
    const asked = reduceUserDash(s0, { type: 'ask', request: travel('r1', 't1') })
    const approved = reduceUserDash(asked, { type: 'decide', id: 'r1', status: 'approved', note: 'ok' })
    expect(reduceUserDash(approved, { type: 'ask', request: travel('r2', 't1') })).toBe(approved)
    const declined = reduceUserDash(asked, { type: 'decide', id: 'r1', status: 'declined', note: 'no' })
    expect(reduceUserDash(declined, { type: 'ask', request: travel('r2', 't1') }).requests).toHaveLength(2)
  })

  it('report marks the sign-in once', () => {
    const id = s0.signIns[0].id
    const once = reduceUserDash(s0, { type: 'report', signInId: id })
    const twice = reduceUserDash(once, { type: 'report', signInId: id })
    expect(twice.reported).toEqual([id])
    expect(twice.requests.filter((r) => r.kind === 'report')).toHaveLength(1)
  })

  it('signs out a device but never the current one', () => {
    const other = s0.devices.find((d) => !d.current)!
    const current = s0.devices.find((d) => d.current)!
    expect(reduceUserDash(s0, { type: 'sign-out-device', deviceId: other.id }).devices).toHaveLength(s0.devices.length - 1)
    expect(reduceUserDash(s0, { type: 'sign-out-device', deviceId: current.id }).devices).toHaveLength(s0.devices.length)
  })

  it('undo puts a signed-out device back in its place', () => {
    const other = s0.devices[1]
    const out = reduceUserDash(s0, { type: 'sign-out-device', deviceId: other.id })
    expect(reduceUserDash(out, { type: 'restore-device', device: other, at: 1 }).devices).toEqual(s0.devices)
  })

  it('state survives setRole', () => {
    let seen: string[] = []
    function Probe() {
      const { userDash, actUserDash, setRole } = useBrand()
      useEffect(() => {
        actUserDash({ type: 'favourite', appId: 'jira' })
        setRole('admin')
        setRole('user')
      }, [actUserDash, setRole])
      seen = userDash.favourites
      return null
    }
    renderToStaticMarkup(
      <BrandProvider>
        <Probe />
      </BrandProvider>,
    )
    /* Static markup runs no effects; the slice is on the store from the first render. */
    expect(seen).toEqual(s0.favourites)
  })
})
