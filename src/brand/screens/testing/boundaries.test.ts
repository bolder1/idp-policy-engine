import { describe, expect, it } from 'vitest'

import { card, cond, fallbackRule, rule, when, type Policy } from '../../data'
import { showcaseTenantHrmsOn } from '../../fixtures'
import { clock } from '../simulate'
import { envOf, resolveSignIn } from '../tenant-resolver'
import { boundariesOf } from './boundaries'
import { rowsRead } from './rows-read'
import { defaultBoardForm, factsOf, originPatch, type SignInForm } from './sign-in-form'

/* The edges each control prints, and the decision under each band, on the
   showcase tenant (Spec A §8: "the track prints 40 and 71", "the track prints
   25 km"). */

/* These scenes read HRMS deciding, so they run on the tenant once it is
   turned on; the seed opens with HRMS Inactive (Phase 4). */
const t = showcaseTenantHrmsOn()
const env = envOf(t)
const lib = { zones: t.zones, fingerprints: t.fingerprints }
const TODAY = '2026-09-28'
const policy = (id: string) => t.policies.find((p) => p.id === id)!
const board = (p: Policy, patch: Partial<SignInForm> = {}) => ({ ...defaultBoardForm(p, t.directory.people, t.apps, TODAY), ...patch })
const bounds = (p: Policy, form: SignInForm, substitute?: Policy) =>
  boundariesOf(form, rowsRead(t.policies, substitute ?? p, form.appId, lib), substitute ? { substitute } : {}, t.policies, env, t.zones)
const bands = (b: { bands: { from: number; to: number; decision: string | null }[] } | undefined) =>
  b?.bands.map((x) => `${x.from}–${x.to} ${x.decision ?? "can't tell"}`)

describe('the risk score', () => {
  const devices = policy('sc-corporate-devices')

  it('prints 40 and 71, with a decision per band, for Emily on her registered laptop', () => {
    const b = bounds(devices, board(devices, { personId: 'u-sales-3' }))
    expect(b.risk?.edges).toEqual([40, 71])
    expect(bands(b.risk)).toEqual(['0–39 1fa', '40–70 2fa', '71–100 deny'])
  })

  it('asks the whole tenant: somebody the policy is not for gets the Global Default in every band', () => {
    const b = bounds(devices, board(devices, { personId: 'u-hr-1' }))
    expect(bands(b.risk)).toEqual(['0–39 1fa', '40–70 1fa', '71–100 1fa'])
  })

  it("says Can't tell where the rest of the sign-in cannot be told, and no further", () => {
    /* No device: below 71 the answer turns on whether it is a corporate one.
       From 71 it does not — the high-risk rule and the last row both deny. */
    const b = bounds(devices, board(devices, { personId: 'u-sales-3', device: { kind: 'none' } }))
    expect(bands(b.risk)).toEqual(["0–39 can't tell", "40–70 can't tell", '71–100 deny'])
  })
})

describe('the distance ruler', () => {
  const hrms = policy('sc-hrms-office')

  it('prints the 25 km range, inside to 25 and outside from 26', () => {
    const b = bounds(hrms, board(hrms))
    expect(b.distance).toMatchObject({ zoneId: 'corp-offices', rangeIndex: 0, centre: 'Pune', edge: 25, max: 100 })
    expect(bands(b.distance)).toEqual(['0–25 2fa', '26–100 deny'])
  })

  it('gets, at the edge and the kilometre after, what the two bands print', () => {
    /* The bands are read at their lower bounds; the edge is the upper bound of
       the inside one, so it is asked here on its own. */
    const f = board(hrms)
    const b = bounds(hrms, f).distance!
    const at = (km: number) => {
      const r = resolveSignIn(t.policies, factsOf({ ...f, place: { kind: 'distance', zoneId: b.zoneId, rangeIndex: b.rangeIndex, km } }, t.zones).facts, env)
      return r.status === 'decided' ? r.decision : null
    }
    expect([at(b.edge), at(b.edge + 1)]).toEqual([b.bands[0].decision, b.bands[1].decision])
  })

  it('stands where the sign-in is, and says when the band under it is not its answer', () => {
    expect(bounds(hrms, board(hrms)).distance).toMatchObject({ now: 0, agrees: true })
    /* Bengaluru is 728 km out, past the ruler, but in the zone by name: 2FA,
       where the band past the edge says Deny. */
    const branch = bounds(hrms, board(hrms, originPatch('branch'))).distance!
    expect(branch.now).toBeGreaterThan(branch.max)
    expect(branch.agrees).toBe(false)
    /* An anonymiser has no place, so no distance. */
    expect(bounds(hrms, board(hrms, originPatch('tor'))).distance).toMatchObject({ now: null, agrees: false })
    /* A point on the ruler is its band's answer by construction. */
    expect(bounds(hrms, board(hrms, { place: { kind: 'distance', zoneId: 'corp-offices', rangeIndex: 0, km: 60 } })).distance).toMatchObject({
      now: 60,
      agrees: true,
    })
  })

  it('prints nothing on an application no range is read on', () => {
    const compliance = policy('sc-device-compliance')
    expect(bounds(compliance, board(compliance, { appId: 'outlook' })).distance).toBeUndefined()
  })
})

describe('the time ruler', () => {
  const hrms = policy('sc-hrms-office')
  /* Office hours in London, on a board in Kolkata. */
  const london: Policy = {
    ...hrms,
    rules: [rule({ name: 'London hours', when: when(card({ ...cond('time', 'between', ['09:00', '17:00']), tz: 'Europe/London' })), decision: '2fa' })],
    fallback: fallbackRule('deny'),
  }

  it('moves the window onto the sign-in’s clock, summer time included when there is a date', () => {
    const b = bounds(hrms, board(hrms), london)
    /* 28 Sep 2026: London is on BST, 4 h 30 min behind Kolkata. */
    expect(b.time?.edges.map(clock)).toEqual(['13:30', '21:31'])
    expect(b.time?.timeZone).toBe('Asia/Kolkata')
    expect(bands(b.time)).toEqual(['0–809 deny', '810–1290 2fa', '1291–1439 deny'])
  })

  it('reads standard time when no date is given', () => {
    const b = bounds(hrms, board(hrms, { date: '' }), london)
    expect(b.time?.edges.map(clock)).toEqual(['14:30', '22:31'])
  })
})

describe('what is not read', () => {
  it('prints no edges on a board whose rules read no score, time or distance', () => {
    const compliance = policy('sc-device-compliance')
    expect(bounds(compliance, board(compliance))).toEqual({})
  })
})
