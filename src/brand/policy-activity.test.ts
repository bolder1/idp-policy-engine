import { describe, expect, it } from 'vitest'
import { activityLabel, lastActivity, stampAgo } from './policy-activity'

const NOW = new Date(2026, 10, 3, 18, 0).getTime()
const H = 3_600_000

describe('a policy’s last activity', () => {
  it('reads the seed’s relative stamps', () => {
    expect(stampAgo('Just now')).toBe(0)
    expect(stampAgo('2 hours ago')).toBe(2 * H)
    expect(stampAgo('Yesterday')).toBe(24 * H)
    expect(stampAgo('3 days ago')).toBe(72 * H)
    expect(stampAgo('Sep 3')).toBeNull()
  })

  it('takes what this visit logged over the seed', () => {
    const p = { id: 'p1', lastModified: '3 days ago' }
    expect(activityLabel(lastActivity(p, {}, NOW), NOW)).toBe('Edited 3 days ago')
    expect(activityLabel(lastActivity(p, { p1: { kind: 'opened', at: NOW - 5 * 60_000 } }, NOW), NOW)).toBe('Opened 5 min ago')
  })

  it('reads the console’s own stamp as an edit', () => {
    expect(activityLabel(lastActivity({ id: 'p', lastModified: 'Sep 05, 2026, 22:00:00' }, {}, NOW), NOW)).toBe('Edited Sep 5, 2026')
  })

  it('falls back to the day it was added, then to a dash', () => {
    expect(activityLabel(lastActivity({ id: 'p', lastModified: '', addedOn: '2026-09-22' }, {}, NOW), NOW)).toBe('Added Sep 22, 2026')
    expect(activityLabel(lastActivity({ id: 'p', lastModified: '' }, {}, NOW), NOW)).toBe('—')
  })

  it('says just now, hours, yesterday and days, then the date', () => {
    const at = (ago: number) => activityLabel({ kind: 'added', at: NOW - ago }, NOW)
    expect(at(10_000)).toBe('Added just now')
    expect(at(H)).toBe('Added 1 hour ago')
    expect(at(30 * H)).toBe('Added yesterday')
    expect(at(5 * 24 * H)).toBe('Added 5 days ago')
    expect(at(10 * 24 * H)).toBe('Added Oct 24, 2026')
  })
})
