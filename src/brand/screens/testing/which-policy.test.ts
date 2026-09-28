import { describe, expect, it } from 'vitest'

import type { Policy, PolicyStatus } from '../../data'
import { showcaseTenantHrmsOn } from '../../fixtures'
import { envOf, resolveSignIn, type ResolveOptions } from '../tenant-resolver'
import { defaultBoardForm, factsOf, type SignInForm } from './sign-in-form'
import { whichPolicyRows, type WhichRow } from './which-policy'

/* The Which policy list for the showcase's HRMS scenes, including the ones
   the final spec adds for Monitor (Spec A §A.10.4, Spec B new check 28). */

/* These scenes read HRMS deciding, so they run on the tenant once it is
   turned on; the seed opens with HRMS Inactive (Phase 4). */
const t = showcaseTenantHrmsOn()
const env = envOf(t)
const TODAY = '2026-09-28'
const hrms = t.policies.find((p) => p.id === 'sc-hrms-office')!
const withHrms = (status: PolicyStatus) => t.policies.map((p) => (p.id === hrms.id ? { ...p, status } : p))
const form = (patch: Partial<SignInForm> = {}) => ({ ...defaultBoardForm(hrms, t.directory.people, t.apps, TODAY), ...patch })

function rows(policies: readonly Policy[], f: SignInForm, opts: ResolveOptions & { assumedId?: string } = {}) {
  const res = resolveSignIn(policies, factsOf(f, t.zones).facts, env, opts.substitute ? { substitute: opts.substitute } : {})
  return whichPolicyRows(res, policies, f.appId, opts)
}
const said = (r: WhichRow) => `${r.name} · ${r.kind}${r.struck ? ' · struck' : ''}${r.monitoring ? ' · Monitoring' : ''}${r.assumed ? ' · Assumed on' : ''} · ${r.reason}`

describe('before an application is chosen', () => {
  it('lists no policy as on it: the ones outside the audience are elsewhere', () => {
    const r = rows(t.policies, form({ appId: null }))
    expect(r.on).toEqual([])
    expect(r.off.map((x) => [x.name, x.kind])).toEqual([
      ['Access the app through corporate devices only', 'elsewhere'],
      ['Developer tools — office and device checks', 'elsewhere'],
    ])
  })
})

describe('HR in the office', () => {
  const r = rows(t.policies, form())

  it('lists the Global Default and HRMS on HRMS, in list order, with HRMS deciding', () => {
    expect(r.on.map(said)).toEqual([
      'Global Default Policy · lost · An app policy applies',
      'HRMS access from corporate offices · decides · Decides this sign-in',
    ])
  })

  it('folds the policies on other applications away, without "Does not cover HRMS"', () => {
    expect(r.off.map((x) => [x.name, x.showReason])).toEqual([
      ['Access the app through corporate devices only', false],
      ['Device compliance for Outlook and Dropbox', false],
      ['Developer tools — office and device checks', false],
    ])
  })
})

describe('somebody the policy is not for', () => {
  it('strikes HRMS through with the audience it missed', () => {
    const r = rows(t.policies, form({ personId: 'u-sales-1' }))
    expect(r.on.map(said)).toEqual([
      'Global Default Policy · decides · Decides this sign-in',
      'HRMS access from corporate offices · lost · struck · Not in audience: Human Resources, Finance',
    ])
  })
})

describe('HRMS monitoring', () => {
  const policies = withHrms('monitor')

  it('lists HRMS with the Monitoring pill and what it would decide, never struck', () => {
    const r = rows(policies, form())
    const row = r.on.find((x) => x.policyId === hrms.id)!
    expect(said(row)).toBe('HRMS access from corporate offices · watching · Monitoring · Monitoring: would allow with 2FA')
    expect(row.watched).toMatchObject({ decision: '2fa', wouldDecide: true })
  })

  it('keeps the pill and what it would decide when the board asks it as though on', () => {
    /* The board's Stored version column: HRMS stands in, set active, and
       decides — and the list still says it is only monitoring, with the
       would-be decision the tenant as it stands reports for it. */
    const today = resolveSignIn(policies, factsOf(form(), t.zones).facts, env)
    const asIfOn = { ...policies.find((p) => p.id === hrms.id)!, status: 'active' as const }
    const res = resolveSignIn(policies, factsOf(form(), t.zones).facts, env, { substitute: asIfOn })
    const row = whichPolicyRows(res, policies, 'hrms', { substitute: asIfOn, watching: today.watching }).on.find((x) => x.policyId === hrms.id)!
    expect(said(row)).toBe('HRMS access from corporate offices · decides · Monitoring · Decides this sign-in')
    expect(row.watched).toMatchObject({ decision: '2fa', wouldDecide: true })
    expect(row.struck).toBe(false)
  })

  it('does not strike a monitor through for somebody outside its audience either', () => {
    const r = rows(policies, form({ personId: 'u-sales-1' }))
    expect(said(r.on.find((x) => x.policyId === hrms.id)!)).toBe(
      'HRMS access from corporate offices · lost · Monitoring · Not in audience: Human Resources, Finance',
    )
  })
})

describe('HRMS switched off', () => {
  const policies = withHrms('inactive')

  it('keeps it on the list in plain text, with Assume on offered', () => {
    const row = rows(policies, form()).on.find((x) => x.policyId === hrms.id)!
    expect([row.kind, row.struck, row.assumable, row.reason]).toEqual(['waiting', false, true, 'Inactive'])
  })

  it('reads it as deciding once it is assumed on', () => {
    const off = policies.find((p) => p.id === hrms.id)!
    const row = rows(policies, form(), { substitute: off, assumedId: hrms.id }).on.find((x) => x.policyId === hrms.id)!
    expect(said(row)).toBe('HRMS access from corporate offices · decides · Assumed on · Decides this sign-in')
  })

  it('strikes an assumed policy that still loses, as it would if it were on', () => {
    const off = policies.find((p) => p.id === hrms.id)!
    const row = rows(policies, form({ personId: 'u-sales-1' }), { substitute: off, assumedId: hrms.id }).on.find((x) => x.policyId === hrms.id)!
    expect([row.kind, row.struck, row.assumed]).toEqual(['lost', true, true])
  })
})
