import { describe, expect, it } from 'vitest'

import type { Policy } from '../data'
import { showcaseTenantHrmsOn } from '../fixtures'
import { TENANT_SITUATIONS, sweepTenant, type TenantSweep } from './impact-arena'
import { AUTH_STATES } from './simulate'
import { envOf } from './tenant-resolver'
import { WHAT_CHANGES, loosens, whatChangesLine, whatChangesSaid } from './what-changes'

/* -----------------------------------------------------------------------------
   What changes across the tenant: the sweep on each application, and the four
   moves between two of them, looser first — pinned on the showcase numbers
   the guard and the Break-in preview print (spec D §8: A2, A6).
   -------------------------------------------------------------------------- */

/* These scenes read HRMS deciding, so they run on the tenant once it is
   turned on; the seed opens with HRMS Inactive (Phase 4). */
const t = showcaseTenantHrmsOn()
const env = envOf(t)
const HRMS = 'sc-hrms-office'
const swap = (id: string, change: Partial<Policy>) => t.policies.map((p) => (p.id === id ? { ...p, ...change } : p))
const hrms = t.policies.find((p) => p.id === HRMS)!
const swept = (policies: readonly Policy[]) => sweepTenant(policies, 'hrms', env, 570)

describe('sweepTenant', () => {
  it('asks each modelled situation once, without the auth-state axis no condition reads', () => {
    expect(TENANT_SITUATIONS).toHaveLength(360)
    expect(new Set(TENANT_SITUATIONS.map((s) => s.authState))).toEqual(new Set([AUTH_STATES[0]]))
    const s = swept(t.policies)
    expect(s.decisions).toHaveLength(360)
    expect(s.factors).toHaveLength(360)
    expect(s.deciders).toHaveLength(360)
  })

  it('hands a switched-off policy’s people to whichever policy governs them next', () => {
    const on = swept(t.policies)
    const off = swept(swap(HRMS, { status: 'inactive' }))
    expect(on.deciders).toContain(HRMS)
    expect(off.deciders).not.toContain(HRMS)
  })

  it('tries a version as though it were in force', () => {
    const off = swap(HRMS, { status: 'inactive' })
    const asIfOn = sweepTenant(off, 'hrms', env, 570, { substitute: hrms })
    expect(asIfOn.decisions).toEqual(swept(t.policies).decisions)
  })
})

describe('whatChangesLine', () => {
  /* 18 and 72 until 30 Sep 2026, against a Global Default that let everybody
     in on one factor. Its baseline now refuses Austin and the proxy itself
     and can't tell a sign-in it cannot place, so HRMS turned on moves only
     the office sign-ins on a corporate laptop, from one factor to 2FA. */
  it('reads turning HRMS on as 3 more asked for 2FA and none denied, all of them Priya (A6)', () => {
    const line = whatChangesLine([swept(swap(HRMS, { status: 'inactive' }))], [swept(t.policies)], env)
    expect(whatChangesSaid(line)).toBe('Of 360 modelled sign-ins: Now allowed 0 · Now on 1 factor 0 · Now asked for 2FA 3 · Now denied 0')
    expect(line.nowAskedFor2fa).toEqual([{ personId: 'priya', label: 'Priya Sharma (Finance)', origins: ['Office network'] }])
    expect(line.nowDenied).toEqual([])
    expect(line.appNames).toEqual(['HRMS'])
    expect(line.total).toBe(360)
    expect(loosens(line)).toBe(false)
  })

  it('reads a last row moved to Allow on 1 factor as 72 now allowed, and as loosening (A2)', () => {
    const line = whatChangesLine([swept(t.policies)], [swept(swap(HRMS, { fallback: { ...hrms.fallback!, decision: '1fa' } }))])
    expect(line.counts).toEqual({ nowAllowed: 72, nowOn1Factor: 0, nowAskedFor2fa: 0, nowDenied: 0 })
    expect(line.nowAllowed.map((n) => n.label)).toEqual(['Priya Sharma (Finance)'])
    expect(loosens(line)).toBe(true)
  })

  it('counts the four moves, and a weaker second factor apart from them', () => {
    const n = TENANT_SITUATIONS.length
    const blank = (): TenantSweep => ({ appId: 'x', decisions: new Array(n).fill(null), factors: new Array(n).fill(null), deciders: new Array(n).fill(null) })
    const b = blank()
    const a = blank()
    type Cell = [TenantSweep['decisions'][number], TenantSweep['factors'][number]]
    const pairs: [Cell, Cell][] = [
      [['deny', null], ['2fa', 'standard']],
      [['2fa', 'standard'], ['1fa', null]],
      [['1fa', null], ['2fa', 'weak']],
      [['2fa', 'weak'], ['deny', null]],
      [['2fa', 'phishing-resistant'], ['2fa', 'standard']],
      [['1fa', null], [null, null]],
    ]
    pairs.forEach(([was, now], i) => {
      ;[b.decisions[i], b.factors[i]] = was
      ;[a.decisions[i], a.factors[i]] = now
    })
    const line = whatChangesLine([b], [a])
    expect(line.counts).toEqual({ nowAllowed: 1, nowOn1Factor: 1, nowAskedFor2fa: 1, nowDenied: 1 })
    expect(line.weakerFactor).toBe(1)
    expect(loosens({ counts: { nowAllowed: 0, nowOn1Factor: 0, nowAskedFor2fa: 1, nowDenied: 1 }, weakerFactor: 1 })).toBe(true)
    expect(loosens({ counts: { nowAllowed: 0, nowOn1Factor: 0, nowAskedFor2fa: 1, nowDenied: 1 }, weakerFactor: 0 })).toBe(false)
  })

  it('says the looser moves first', () => {
    expect(WHAT_CHANGES.map((m) => m.word)).toEqual(['Now allowed', 'Now on 1 factor', 'Now asked for 2FA', 'Now denied'])
  })

  it('pairs sweeps by application, and passes over one with nothing to compare', () => {
    const on = swept(t.policies)
    const none = whatChangesLine([on], [{ ...on, appId: 'other' }])
    expect(none.total).toBe(0)
    expect(whatChangesSaid(none)).toBe('No modelled sign-ins')
  })

  /* The unit once, before the four counts, and the thousands grouped: three
     applications are 1,080 sign-ins, not "1080". */
  it('says what the counts are of, once, before them', () => {
    const counts = { nowAllowed: 1, nowOn1Factor: 0, nowAskedFor2fa: 0, nowDenied: 2 }
    const said = whatChangesSaid({ counts, total: 1080 })
    expect(said).toBe('Of 1,080 modelled sign-ins: Now allowed 1 · Now on 1 factor 0 · Now asked for 2FA 0 · Now denied 2')
    expect(said.match(/modelled/g)).toHaveLength(1)
  })
})
