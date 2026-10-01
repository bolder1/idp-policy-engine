import { describe, expect, it } from 'vitest'

import type { Policy } from '../../data'
import { showcaseTenant } from '../../fixtures'
import { envOf } from '../tenant-resolver'
import { hopMs } from '../testing/route-marker'
import { defaultBoardForm, factsOf, originPatch, typedAddressPatch, type SignInForm } from '../testing/sign-in-form'
import { columnsFor, routeOf, runColumns } from './try-sign-in'
import {
  ENTRY_DELAY,
  FIRST_RUN,
  RETURN_MS,
  firstTrack,
  landingMs,
  nextTrack,
  openRun,
  replayRun,
  revealKeepsWhich,
  revealKey,
  runAfterPatch,
  travelStops,
  type Track,
} from './try-sign-in-run'

/* The run on the board, render by render: what starts one, what is only an
   update, when "Changed by" is said and cleared, and where the marker stands.
   The hook feeds these the clock and the store; here they are fed the
   showcase tenant's own routes, one render at a time. */

const t = showcaseTenant()
const env = envOf(t)
const TODAY = '2026-09-28'
const hrms = t.policies.find((p) => p.id === 'sc-hrms-office')!
const office = defaultBoardForm(hrms, t.directory.people, t.apps, TODAY)
const at = (patch: Partial<SignInForm>): SignInForm => ({ ...office, ...patch })

function routeFor(form: SignInForm, draft: Policy = hrms) {
  const { facts } = factsOf(form, t.zones)
  const right = runColumns(columnsFor(hrms, draft, form.appId), t.policies, facts, env).at(-1)!
  return routeOf(right, draft, facts, env, t.policies)
}

/** One render: the track the hook would keep after it. */
const render = (track: Track, form: SignInForm, run: number, { draft = hrms, travels = true } = {}) =>
  nextTrack(track, { form, draft, route: routeFor(form, draft), run, travels })

describe('what starts a run', () => {
  it('opens test mode as a run that waits for the panel, and Replay as one that waits for the marker to be back', () => {
    expect(openRun(FIRST_RUN)).toEqual({ id: 1, travel: true, delay: ENTRY_DELAY })
    expect(replayRun(openRun(FIRST_RUN))).toEqual({ id: 2, travel: true, delay: RETURN_MS })
    /* The move back to the start is one hop, and a hop is never longer. */
    expect(RETURN_MS).toBeGreaterThanOrEqual(hopMs(1))
  })

  it('plays a run for an origin chip, and for nothing else the form is patched with', () => {
    const r = openRun(FIRST_RUN)
    expect(runAfterPatch(r, originPatch('home'))).toEqual({ id: 2, travel: true, delay: RETURN_MS })
    /* The same object: no new run, nothing to re-render. */
    expect(runAfterPatch(r, typedAddressPatch('192.0.2.50'))).toBe(r)
    expect(runAfterPatch(r, { personId: 'u-sales-1' })).toBe(r)
    expect(runAfterPatch(r, { risk: '48' })).toBe(r)
  })
})

describe('an update, after a run', () => {
  const start = render(firstTrack(office, hrms, null, 0), office, 1)

  it('begins a run with nothing changed and nothing said until it lands', () => {
    expect(start).toMatchObject({ run: 1, changed: null, motion: 'travel', said: '' })
  })

  it('settles: the same render twice keeps the same track', () => {
    expect(render(start, office, 1)).toBe(start)
  })

  it('names a typed address that moved the answer, and says so once', () => {
    const home = render(start, at(typedAddressPatch('192.0.2.50')), 1)
    expect(home).toMatchObject({ changed: 'address', motion: 'update', said: 'Now Deny. Changed by IP address.' })
  })

  it('keeps what it said when a later update leaves the answer where it is', () => {
    const home = render(start, at(typedAddressPatch('192.0.2.50')), 1)
    const next = render(home, at(typedAddressPatch('192.0.2.51')), 1)
    expect(next).toMatchObject({ changed: 'address', said: 'Now Deny. Changed by IP address.' })
  })

  it('names nothing for an update that did not move the answer', () => {
    /* The branch office's network is in the zone too: still Allow with 2FA. */
    const branch = render(start, at(typedAddressPatch('198.51.100.20')), 1)
    expect(branch).toMatchObject({ changed: null, motion: 'update', said: '' })
  })

  it('names the board when an edit on it moved the answer', () => {
    const off = { ...hrms, rules: hrms.rules.map((r) => ({ ...r, enabled: false })) }
    expect(render(start, office, 1, { draft: off })).toMatchObject({ changed: 'edits', motion: 'update', said: 'Now Deny. Changed by your edits.' })
  })

  it('clears "Changed by" when Replay starts a run', () => {
    const home = render(start, at(typedAddressPatch('192.0.2.50')), 1)
    expect(render(home, home.form, 2)).toMatchObject({ run: 2, changed: null, motion: 'travel', said: '' })
  })
})

describe('under reduced motion', () => {
  it('lands a run at once and says it at once, again on each Replay', () => {
    const first = render(firstTrack(office, hrms, null, 0), office, 1, { travels: false })
    expect(first.said).toBe('Allow with 2FA. HRMS access from corporate offices, Rule 1 · In a corporate office. ')
    const again = render(first, office, 2, { travels: false })
    /* The same answer, a different string: a screen reader says it again. */
    expect(again.said).toBe('Allow with 2FA. HRMS access from corporate offices, Rule 1 · In a corporate office.')
  })
})

describe('the marker', () => {
  it('leaves for each stage a hop apart after the run’s delay, and lets go at the last hop', () => {
    const hop = hopMs(3)
    expect(travelStops(3, ENTRY_DELAY)).toEqual([
      { ms: ENTRY_DELAY, at: 1, reached: 0 },
      { ms: ENTRY_DELAY + hop, at: 2, reached: 1 },
      { ms: ENTRY_DELAY + 2 * hop, at: null, reached: 2 },
    ])
    expect(travelStops(0, 0)).toEqual([])
  })

  it('reveals a stage when the marker arrives there, a hop after it set off — never as it leaves', () => {
    const hop = hopMs(4)
    const stops = travelStops(4, 0)
    for (let stage = 1; stage <= 3; stage++) {
      const leaves = stops.find((s) => s.at === stage)!.ms
      const arrives = stops.find((s) => s.reached === stage)!.ms
      expect(arrives - leaves).toBe(hop)
    }
    /* The landing — the outcome, the status sentence — one hop after the last departure. */
    expect(landingMs(4, 0)).toBe(stops.at(-1)!.ms + hop)
  })

  it('lands any route in 1.1 s at most, a hop at 180 ms at most', () => {
    expect(landingMs(3, 0)).toBe(540)
    for (const hops of [1, 6, 12, 40]) expect(landingMs(hops, 0)).toBeLessThanOrEqual(1100)
  })
})

/* The Decision gate is shown again whenever this key changes (Board.tsx). */
describe('when the board shows the answer again', () => {
  const office2fa = routeFor(office).decision
  const home = routeFor(at(typedAddressPatch('192.0.2.50'))).decision
  /* The branch office is in the zone too: a re-run with the same answer. */
  const branch = routeFor(at(typedAddressPatch('198.51.100.20'))).decision

  it('waits for the landing: nothing while the marker travels', () => {
    expect(revealKey(false, null, office2fa, 0)).toBeNull()
    expect(revealKey(true, null, office2fa, 0)).not.toBeNull()
  })

  it('moves for a new answer, and for what moved it', () => {
    expect(revealKey(true, null, home, 0)).not.toBe(revealKey(true, null, office2fa, 0))
    expect(revealKey(true, 'IP address', home, 0)).not.toBe(revealKey(true, null, home, 0))
  })

  it('stays put for a re-run that leaves the answer where it was', () => {
    expect(branch).toEqual(office2fa)
    expect(revealKey(true, null, branch, 0)).toBe(revealKey(true, null, office2fa, 0))
  })

  /* Opening Which policy's list by hand pushes the gate down by the list's
     height with the answer unchanged; closing it pulls it back. Both are a
     turn, and each shows the gate again. */
  it('moves for each turn of the Which policy list, on the same answer', () => {
    const keys = [0, 1, 2].map((turns) => revealKey(true, null, office2fa, turns))
    expect(new Set(keys).size).toBe(3)
    expect(revealKey(false, null, office2fa, 1)).toBeNull()
  })

  /* A turn and nothing else keeps the row that was pressed in the stage; a
     landing or a new answer reveals the gate in full. */
  it('keeps the Which policy row for a turn, and only for a turn', () => {
    const k = (turns: number, d = office2fa, changed: string | null = null) => revealKey(true, changed, d, turns)!
    expect(revealKeepsWhich(k(0), k(1))).toBe(true)
    expect(revealKeepsWhich(k(1), k(2))).toBe(true)
    expect(revealKeepsWhich(null, k(0))).toBe(false)
    expect(revealKeepsWhich(k(0), k(0, home))).toBe(false)
    expect(revealKeepsWhich(k(0), k(0, office2fa, 'IP address'))).toBe(false)
    expect(revealKeepsWhich(k(0), k(1, home))).toBe(false)
  })
})
