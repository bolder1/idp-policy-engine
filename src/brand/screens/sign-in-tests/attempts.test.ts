import { describe, expect, it } from 'vitest'

import { showcaseTenant } from '../../fixtures'
import { offeredAppFix, runBreakInOnApp, type AppBreakInResult } from '../break-in-app'
import { GROUP_ORDER, fixButton } from '../break-in-model'
import type { BreakInCounts } from '../gauntlet'
import { envOf } from '../tenant-resolver'
import { whatChangesLine } from '../what-changes'
import { HOLE_GROUPS, atLeast, attemptGroups, attemptOffer, cellTone, isHole, movedSaid, resultSpoken, rowNote, tenantSaid } from './attempts'

/* -----------------------------------------------------------------------------
   Break-in attempts as Access checks reads them (attempts.ts): the panel's
   groups, the cells' tones, what a fix would move, and when a row is asked
   for its fix at all — on the showcase tenant as the page opens on it.

   The deck, its judge and the fixes are break-in-app.ts's, pinned in
   break-in-app.test.ts; this is only the page's reading of them.
   -------------------------------------------------------------------------- */

const t = showcaseTenant()
const env = envOf(t)
const run = (appId: string) => runBreakInOnApp(t.policies, appId, env)
const rowOf = (r: AppBreakInResult, cardId: string) => r.rows.find((x) => x.id === cardId)!

describe('the panel’s groups', () => {
  it('every result but Held under its heading, in GROUP_ORDER, an empty one left out; Held apart, for the fold', () => {
    const { groups, held } = attemptGroups(run('aws').rows)
    expect(groups.map((g) => [g.word, g.rows.map((r) => r.id)])).toEqual([
      ['Got through', ['proxy-finance', 'expired-trust', 'aitm-relay']],
      ['Less than asked', ['after-reset']],
      ['Locked out', ['first-login', 'roaming-unknown-origin']],
      ["Can't tell", ['tor-exec']],
    ])
    expect(held.map((r) => r.id)).toHaveLength(8)
    expect(held.every((r) => r.group === 'held')).toBe(true)
  })

  it('every card is somewhere, once, on every application', () => {
    for (const app of t.apps) {
      const r = run(app.id)
      const { groups, held } = attemptGroups(r.rows)
      const ids = [...groups.flatMap((g) => g.rows), ...held].map((x) => x.id)
      expect(ids.sort(), app.id).toEqual(r.rows.map((x) => x.id).sort())
      const order = groups.map((g) => GROUP_ORDER.indexOf(g.group))
      expect([...order].sort((a, b) => a - b), app.id).toEqual(order)
    }
  })
})

describe('the cells', () => {
  const counts = (over: Partial<BreakInCounts>): BreakInCounts => ({ held: 0, gotThrough: 0, weakerFactor: 0, lessThanAsked: 0, lockedOut: 0, extraPrompts: 0, undecided: 0, skipped: 0, ...over })

  it('a hole that is not 0 in the conflict tone; a 0 quiet; a cost that is not 0 plain', () => {
    const c = counts({ gotThrough: 3, weakerFactor: 1, lockedOut: 2 })
    expect(cellTone('gotThrough', c)).toBe('hole')
    expect(cellTone('weakerFactor', c)).toBe('hole')
    expect(cellTone('lockedOut', c)).toBe('plain')
    expect(cellTone('extraPrompts', c)).toBe('quiet')
    expect(cellTone('gotThrough', counts({}))).toBe('quiet')
  })

  /* The number after only: the one before is the cell's, said once at the panel's head. */
  it('a fix’s move, at its new number — Less than asked too, which has no cell; nothing moved says nothing', () => {
    const now = counts({ gotThrough: 3, lessThanAsked: 2, lockedOut: 2 })
    expect(movedSaid(now, { ...now, gotThrough: 2 })).toBe('Got through now 2')
    expect(movedSaid(now, { ...now, lessThanAsked: 1, lockedOut: 3 })).toBe('Less than asked now 1 · Locked out now 3')
    expect(movedSaid(now, { ...now, held: 9, undecided: 4 })).toBeNull()
  })

  it('a row’s result, read aloud after its name: a threat that held stricter “at least”, nothing decided no “got”', () => {
    const r = run('aws')
    expect(resultSpoken(rowOf(r, 'proxy-finance'))).toBe('Expected Deny, got Allow with 2FA')
    expect(resultSpoken(rowOf(r, 'tor-exec'))).toBe("Expected Deny, can't tell")
    const contractor = rowOf(r, 'unmanaged-contractor')
    expect([contractor.group, atLeast(contractor)]).toEqual(['held', true])
    expect(resultSpoken(contractor)).toBe('Expected at least Allow with 2FA, got Deny')
    /* Held with the answer asked for, and a miss, are as they were. */
    expect(atLeast(rowOf(r, 'no-mfa'))).toBe(false)
    expect(atLeast(rowOf(r, 'proxy-finance'))).toBe(false)
  })
})

describe('a row’s note', () => {
  it('a Weaker factor row says the factor — its badges are the same; a can’t tell row what would settle it; no other row says anything', () => {
    const github = run('github')
    const relay = rowOf(github, 'aitm-relay')
    expect([relay.group, relay.expected, relay.got]).toEqual(['weaker-factor', '2fa', '2fa'])
    expect(rowNote(relay, t.policies)).toBe('Second factor: miniOrange Push · standard · needs phishing-resistant')
    const tor = rowOf(run('aws'), 'tor-exec')
    expect(tor.group).toBe('cant-tell')
    expect(rowNote(tor, t.policies)).toMatch(/^Needs: \S/)
    for (const app of t.apps) {
      for (const row of run(app.id).rows) {
        if (row.group !== 'weaker-factor' && row.group !== 'cant-tell') expect(rowNote(row, t.policies), `${app.id} ${row.id}`).toBeNull()
      }
    }
  })
})

describe('a row’s fix', () => {
  it('only a hole asks: never a row that held, can’t be told or costs', () => {
    expect(HOLE_GROUPS).toEqual(['got-through', 'weaker-factor', 'less-than-asked'])
    const r = run('outlook')
    for (const row of r.rows.filter((x) => !isHole(x))) expect(attemptOffer(r, row, t.policies, env), row.id).toBeNull()
  })

  it('is the engine’s offer, asked once per run and kept: the same object the second time, a new run asks again', () => {
    const r = run('aws')
    const row = rowOf(r, 'proxy-finance')
    const offer = attemptOffer(r, row, t.policies, env)
    expect(offer).not.toBeNull()
    expect(attemptOffer(r, row, t.policies, env)).toBe(offer)
    /* The engine's own, asked again: the same fix (a new rule's id is minted each time) and the same preview. */
    const again = offeredAppFix(row, t.policies, 'aws', env, r.counts)!
    expect([offer!.policy.id, offer!.fix.kind, fixButton(offer!.fix, offer!.policy), offer!.preview.counts, offer!.preview.line.counts]).toEqual([
      again.policy.id,
      again.fix.kind,
      fixButton(again.fix, again.policy),
      again.preview.counts,
      again.preview.line.counts,
    ])
    expect(fixButton(offer!.fix, offer!.policy)).toBe('Add this rule')
    expect(movedSaid(r.counts, offer!.preview.counts)).toBe('Got through now 2')
    expect(attemptOffer(run('aws'), row, t.policies, env)).not.toBe(offer)
  })

  it('none for the Global Default: a finance user’s high risk let in on Box by its rule 1 has no fix from here', () => {
    const r = run('box')
    const row = rowOf(r, 'risk-inside')
    expect([row.group, row.isGlobalDefault]).toEqual(['got-through', true])
    expect(attemptOffer(r, row, t.policies, env)).toBeNull()
  })

  it('the tenant line only when something there moves, and only what moves — never a zero', () => {
    const r = run('aws')
    const offer = attemptOffer(r, rowOf(r, 'proxy-finance'), t.policies, env)!
    expect(offer.preview.line.counts).toMatchObject({ nowAllowed: 0, nowOn1Factor: 0, nowAskedFor2fa: 0 })
    expect(tenantSaid(offer.preview.line)).toBe(`Of 360 modelled sign-ins: Now denied ${offer.preview.line.counts.nowDenied}`)
    expect(offer.preview.line.counts.nowDenied).toBeGreaterThan(0)
    expect(tenantSaid({ ...offer.preview.line, counts: { nowAllowed: 0, nowOn1Factor: 0, nowAskedFor2fa: 3, nowDenied: 48 }, total: 720 })).toBe('Of 720 modelled sign-ins: Now asked for 2FA 3 · Now denied 48')
    expect(tenantSaid(whatChangesLine([], [], env))).toBeNull()
  })
})
