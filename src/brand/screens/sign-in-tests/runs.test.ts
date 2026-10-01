import { describe, expect, it } from 'vitest'

import { showcaseTenant, showcaseTenantHrmsOn, type Tenant } from '../../fixtures'
import { EMPTY_RISK_PROFILE, riskScale } from '../../risk-signals'
import { showcasePolicies, showcaseProfiles, showcaseSavedSignIns, showcaseZones } from '../../showcase-seed'
import { simEnvOf } from '../sim-env'
import { savedRows } from '../testing/selectors'
import {
  LIVE_RUN_ID,
  RUN_EMPTY,
  allRuns,
  blockedItem,
  changedItem,
  defaultFilter,
  fixtureRuns,
  itemsWithSaved,
  liveRun,
  relativeTime,
  runColumns,
  runItemsOf,
  runMeta,
  runShares,
  runTiles,
  triggerTitle,
  type RunNames,
} from './runs'
import { RUNS_FIXTURE } from './runs-fixture'

/* The Runs tab's report: the live run from the store, the fixture's week
   before it, and the tiles that are its filter. "Now" is a parameter, so
   every relative time here is pinned. */

const NOW = new Date('2026-09-28T12:00:00Z')
const hoursBefore = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString()

const envOf = (t: Tenant) =>
  simEnvOf({ ...t, users: t.directory.people, riskScale: riskScale(t.riskProfiles.find((p) => p.id === t.activeRiskProfileId) ?? EMPTY_RISK_PROFILE) })

const names: RunNames = {
  policy: (id) => showcasePolicies.find((p) => p.id === id)?.name,
  zone: (id) => showcaseZones.find((z) => z.id === id)?.name,
  profile: (id) => showcaseProfiles.find((p) => p.id === id)?.name,
}
const SAVED_IDS = new Set(showcaseSavedSignIns.map((s) => s.id))

describe('the fixture', () => {
  it('holds six to eight runs, newest first, across the last week', () => {
    expect(RUNS_FIXTURE.length).toBeGreaterThanOrEqual(6)
    expect(RUNS_FIXTURE.length).toBeLessThanOrEqual(8)
    const hours = RUNS_FIXTURE.map((r) => r.hoursAgo)
    expect([...hours].sort((a, b) => a - b)).toEqual(hours)
    expect(Math.max(...hours)).toBeLessThan(7 * 24)
    expect(new Set(RUNS_FIXTURE.map((r) => r.id)).size).toBe(RUNS_FIXTURE.length)
  })

  it('names only real saved sign-ins, each once a run', () => {
    for (const run of RUNS_FIXTURE) {
      for (const i of run.items) expect(SAVED_IDS.has(i.savedId), `${run.id}: ${i.savedId}`).toBe(true)
      expect(new Set(run.items.map((i) => i.savedId)).size, run.id).toBe(run.items.length)
    }
  })

  it('names a real policy, zone or device profile for every trigger', () => {
    for (const run of RUNS_FIXTURE) {
      const t = run.trigger
      if (t.verb === 'Nightly check') continue
      expect(names[t.kind](t.id), `${run.id}: ${t.kind} ${t.id}`).toBeDefined()
    }
  })

  it('touches only sign-ins on the applications the change is about', () => {
    const appOf = (id: string) => showcaseSavedSignIns.find((s) => s.id === id)!.facts.appId
    for (const run of RUNS_FIXTURE) {
      if (run.trigger.verb === 'Nightly check' || run.trigger.kind !== 'policy') continue
      const policy = showcasePolicies.find((p) => p.id === (run.trigger as { id: string }).id)!
      /* The Global Default names no application: it covers every one (30 Sep
         2026, its baseline edit is a run of its own), so any app is its. */
      if (policy.isSystem) continue
      for (const i of run.items) expect(policy.appIds, `${run.id}: ${i.savedId}`).toContain(appOf(i.savedId))
    }
  })

  it('is run by named admins, and System only for the nightly check, which changes nothing', () => {
    const who = new Set(RUNS_FIXTURE.map((r) => r.who))
    expect([...who].sort()).toEqual(['Anika Rao', 'Jaspreet Toor', 'Rahul Verma', 'System'])
    for (const run of RUNS_FIXTURE) {
      const nightly = run.trigger.verb === 'Nightly check'
      expect(run.who === 'System', run.id).toBe(nightly)
      if (nightly) expect(run.items.some(changedItem), run.id).toBe(false)
    }
  })

  /* The live run sits right above the fixture's newest, so the two must tell
     one story: a save two hours ago that "moved" Kavya to 2FA, over a live
     run where she gets one factor, read as a contradiction (V4 review P7). */
  it('agrees with the tenant as seeded: each sign-in’s latest After is what it gets now', () => {
    const t = showcaseTenant()
    const now = new Map(liveRun(savedRows(t.savedSignIns, t.policies, envOf(t)), NOW).items.map((i) => [i.savedId, i.after]))
    const latest = new Map<string, string>()
    for (const run of RUNS_FIXTURE) for (const i of run.items) if (!latest.has(i.savedId)) latest.set(i.savedId, i.after)
    for (const [id, after] of latest) expect(after, id).toBe(now.get(id))
  })

  it('carries each sign-in from one run to the next: a Before is what the run before it left', () => {
    const oldestFirst = [...RUNS_FIXTURE].reverse()
    const left = new Map<string, string>()
    for (const run of oldestFirst) {
      for (const i of run.items) {
        const was = left.get(i.savedId)
        if (was !== undefined) expect(i.before, `${run.id}: ${i.savedId}`).toBe(was)
        left.set(i.savedId, i.after)
      }
    }
  })

  it('has changes worth opening: something changed and something newly blocked across the week', () => {
    const items = RUNS_FIXTURE.flatMap((r) => r.items)
    expect(items.some(changedItem)).toBe(true)
    expect(items.some(blockedItem)).toBe(true)
  })
})

describe('the fixture’s runs, placed before now', () => {
  const older = fixtureRuns(RUNS_FIXTURE, NOW, names, SAVED_IDS)

  it('titles each by what set it off, with the object’s current name', () => {
    /* Newest first: the Global Default's baseline an hour ago (30 Sep 2026),
       which took the place of the week's second nightly check. */
    expect(older.map((r) => r.title)).toEqual([
      'Editing Global Default Policy',
      'Saving HRMS access from corporate offices',
      'Editing zone Corporate offices',
      'Turning on Developer tools — office and device checks',
      'Turning on Device compliance for Outlook and Dropbox',
      'Editing Access the app through corporate devices only',
      'Nightly check',
      'Editing device profile Corporate devices',
    ])
  })

  it('says who and when, relative to the now it is given', () => {
    expect(older.map((r) => runMeta(r, NOW))).toEqual([
      'Jaspreet Toor · 1 h ago',
      'Jaspreet Toor · 2 h ago',
      'Rahul Verma · 20 h ago',
      'Anika Rao · Yesterday',
      'Anika Rao · 3 days ago',
      'Jaspreet Toor · 4 days ago',
      'System · 5 days ago',
      'Rahul Verma · 6 days ago',
    ])
    expect(older[0].at).toBe(hoursBefore(1))
    expect(older.every((r) => !r.live)).toBe(true)
  })

  it('drops a deleted sign-in from every run, and a run left with none', () => {
    const without = new Set([...SAVED_IDS].filter((id) => id !== 'ssi-aisha-laptop' && id !== 'ssi-vikram-laptop'))
    const runs = fixtureRuns(RUNS_FIXTURE, NOW, names, without)
    expect(runs.some((r) => r.id === 'run-profile-corp')).toBe(false)
    expect(runs.flatMap((r) => r.items).some((i) => i.savedId === 'ssi-aisha-laptop')).toBe(false)
    expect(runs.find((r) => r.id === 'run-nightly-5')?.items.map((i) => i.savedId)).toEqual(['ssi-kavya-office', 'ssi-ravi-hrms'])
  })

  it('says a deleted object by its kind', () => {
    const gone: RunNames = { policy: () => undefined, zone: () => undefined, profile: () => undefined }
    expect(triggerTitle({ verb: 'Saving', kind: 'policy', id: 'x' }, gone)).toBe('Saving a policy that was deleted')
    expect(triggerTitle({ verb: 'Editing', kind: 'zone', id: 'x' }, gone)).toBe('Editing a zone that was deleted')
    expect(triggerTitle({ verb: 'Editing', kind: 'profile', id: 'x' }, gone)).toBe('Editing a device profile that was deleted')
    expect(triggerTitle({ verb: 'Nightly check' }, gone)).toBe('Nightly check')
  })
})

describe('the live run', () => {
  const t = showcaseTenant()
  const live = liveRun(savedRows(t.savedSignIns, t.policies, envOf(t)), NOW)

  it('is every saved sign-in now, Expected against the tenant’s answer', () => {
    expect(live.id).toBe(LIVE_RUN_ID)
    expect(live.live).toBe(true)
    expect(live.title).toBe('All saved sign-ins')
    expect(runMeta(live, NOW)).toBe('As the tenant stands · Now')
    expect(live.items).toHaveLength(t.savedSignIns.length)
    expect(runColumns(live)).toEqual({ before: 'Expected', after: 'Now' })
  })

  it('finds the two HRMS sign-ins the Inactive policy leaves to the Global Default', () => {
    const tiles = runTiles(live)
    expect(tiles).toEqual([
      { filter: 'changed', label: 'Not as expected', count: 2 },
      { filter: 'blocked', label: 'Newly blocked', count: 0 },
      /* Sixteen: the seventeen others, less the two HRMS promises, plus James in
         Austin, whom the Global Default refuses as he was saved to be — and the
         nine troubleshooting cases, each saved as the engine decides it — and
         the owner's two on Box (1 Oct 2026), Tanmay Joshi and Ishita Banerjee. */
      { filter: 'same', label: 'As expected', count: 27 },
    ])
    expect(runItemsOf(live, 'changed')).toEqual([
      { savedId: 'ssi-kavya-office', before: '2fa', after: '1fa' },
      { savedId: 'ssi-neha-home', before: 'deny', after: '1fa' },
    ])
    expect(defaultFilter(live)).toBe('changed')
  })

  it('is all as expected once HRMS is on', () => {
    const on = showcaseTenantHrmsOn()
    const run = liveRun(savedRows(on.savedSignIns, on.policies, envOf(on)), NOW)
    expect(runItemsOf(run, 'changed')).toEqual([])
    expect(defaultFilter(run)).toBe('same')
    expect(runShares(run)).toEqual({ changed: 0, same: 1 })
  })

  it('counts Can’t tell as not as expected, never a pass', () => {
    const t2 = showcaseTenant()
    const rows = savedRows(t2.savedSignIns, t2.policies, envOf(t2)).map((r) =>
      r.saved.id === 'ssi-tom-win10' ? { ...r, res: { ...r.res, status: 'depends' as const, decision: null } } : r,
    )
    const run = liveRun(rows, NOW)
    expect(run.items.find((i) => i.savedId === 'ssi-tom-win10')).toEqual({ savedId: 'ssi-tom-win10', before: 'deny', after: 'unknown' })
    expect(runItemsOf(run, 'changed').map((i) => i.savedId)).toContain('ssi-tom-win10')
  })

  it('tops the list, above the fixture’s runs', () => {
    const runs = allRuns(live, fixtureRuns(RUNS_FIXTURE, NOW, names, SAVED_IDS))
    expect(runs[0].id).toBe(LIVE_RUN_ID)
    expect(runs).toHaveLength(RUNS_FIXTURE.length + 1)
  })
})

describe('the tiles and the filter', () => {
  const older = fixtureRuns(RUNS_FIXTURE, NOW, names, SAVED_IDS)
  const devTools = older.find((r) => r.id === 'run-dev-tools-on')!

  it('says Changed, Newly blocked and Unchanged, newly blocked a part of changed', () => {
    expect(runTiles(devTools)).toEqual([
      { filter: 'changed', label: 'Changed', count: 3 },
      { filter: 'blocked', label: 'Newly blocked', count: 1 },
      { filter: 'same', label: 'Unchanged', count: 1 },
    ])
    expect(runItemsOf(devTools, 'blocked')).toEqual([{ savedId: 'ssi-tom-win10', before: '1fa', after: 'deny' }])
    expect(runColumns(devTools)).toEqual({ before: 'Before', after: 'After' })
  })

  it('opens a run on Changed, or on Unchanged when nothing changed', () => {
    expect(defaultFilter(devTools)).toBe('changed')
    expect(defaultFilter(older.find((r) => r.title === 'Nightly check')!)).toBe('same')
  })

  it('counts a refusal that was already a refusal as unchanged, not newly blocked', () => {
    expect(blockedItem({ before: 'deny', after: 'deny' })).toBe(false)
    expect(blockedItem({ before: '2fa', after: 'deny' })).toBe(true)
    expect(blockedItem({ before: 'unknown', after: 'deny' })).toBe(true)
    expect(changedItem({ before: '1fa', after: '1fa' })).toBe(false)
  })

  it('draws the list item’s bar from shares, never from a count', () => {
    expect(runShares(devTools)).toEqual({ changed: 0.75, same: 0.25 })
    expect(runShares({ items: [] })).toEqual({ changed: 0, same: 0 })
  })

  it('says each empty filter plainly', () => {
    expect(RUN_EMPTY).toEqual({ changed: 'Nothing changed', blocked: 'Nobody newly blocked', same: 'Everything changed' })
  })

  it('joins items to their saved sign-ins, dropping any that are gone', () => {
    const joined = itemsWithSaved(devTools.items, showcaseSavedSignIns)
    expect(joined.map((j) => j.saved.name)).toEqual(['Arun Patel in the office', 'Sofia Marchetti in London on an iPhone', 'Tom Whelan on Windows 10', 'Contractor at home on Jira'])
    expect(itemsWithSaved([{ savedId: 'gone', before: '1fa', after: '1fa' }], showcaseSavedSignIns)).toEqual([])
  })
})

describe('relative time', () => {
  it('reads minutes, hours, yesterday and days', () => {
    expect(relativeTime(NOW.toISOString(), NOW)).toBe('Just now')
    expect(relativeTime(new Date(NOW.getTime() - 30_000).toISOString(), NOW)).toBe('Just now')
    expect(relativeTime(new Date(NOW.getTime() - 12 * 60_000).toISOString(), NOW)).toBe('12 min ago')
    expect(relativeTime(hoursBefore(2), NOW)).toBe('2 h ago')
    expect(relativeTime(hoursBefore(23.9), NOW)).toBe('23 h ago')
    expect(relativeTime(hoursBefore(24), NOW)).toBe('Yesterday')
    expect(relativeTime(hoursBefore(47), NOW)).toBe('Yesterday')
    expect(relativeTime(hoursBefore(48), NOW)).toBe('2 days ago')
    expect(relativeTime(hoursBefore(146), NOW)).toBe('6 days ago')
  })

  it('never says a time in the future', () => {
    expect(relativeTime(new Date(NOW.getTime() + 5 * 60_000).toISOString(), NOW)).toBe('Just now')
    expect(relativeTime('not a date', NOW)).toBe('Just now')
  })
})
