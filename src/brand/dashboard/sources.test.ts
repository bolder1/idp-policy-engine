import { describe, expect, it } from 'vitest'
import { showcaseTenant } from '../fixtures'
import { envOf } from '../screens/tenant-resolver'
import { signInActivity, type ActivityRow } from '../screens/sign-in-tests/activity'
import { SAMPLE_DAY } from '../screens/monitor-sample'
import { recentMix } from './sources'

const t = showcaseTenant()
const week = [...signInActivity(t.policies, envOf(t), SAMPLE_DAY, t.apps)].sort((a, b) => b.date.localeCompare(a.date) || b.when.localeCompare(a.when))
const order = (r: ActivityRow) => `${r.date} ${r.when.slice(4)}`

describe('recentMix (Recent sign-ins on the dashboard)', () => {
  const mixed = recentMix(week)
  const top = mixed.slice(0, 4)
  /* The most a tile shows: every one a different person, and When reads down in time. */
  const tile = mixed.slice(0, 8)

  it('reads newest first, one person a row, as far as the tallest tile shows', () => {
    expect(new Set(tile.map((r) => r.who)).size).toBe(tile.length)
    expect(tile.map(order)).toEqual([...tile.map(order)].sort().reverse())
  })

  it('keeps every row, once', () => {
    expect(mixed).toHaveLength(week.length)
    expect(new Set(mixed.map((r) => r.id)).size).toBe(week.length)
  })

  it('shows a different person on each of the top rows, newest first', () => {
    expect(new Set(top.map((r) => r.who)).size).toBe(top.length)
    expect(top.map(order)).toEqual([...top.map(order)].sort().reverse())
  })

  it('has a refusal in the top rows when the week has one', () => {
    expect(top.some((r) => r.result === 'blocked')).toBe(true)
  })

  it('needs no refusal when there is none, and copes with nothing', () => {
    const allowed = week.filter((r) => r.result === 'allowed')
    expect(recentMix(allowed).slice(0, 4).every((r) => r.result === 'allowed')).toBe(true)
    expect(recentMix([])).toEqual([])
  })
})
