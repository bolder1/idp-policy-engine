import { describe, expect, it } from 'vitest'
import { ROLLOUT } from './rollout'

/* Entries that list the lines a lock applies to, not the lines that see a change. */
const LOCKS = ['railLock', 'lockApps']

describe('the rollout table', () => {
  it('names only real lines, and every change reaches Design first', () => {
    for (const [change, lines] of Object.entries(ROLLOUT)) {
      for (const l of lines) expect(['design', 'handoff', 'tester'], change).toContain(l)
      /* Locks are the changes Design never gets: they lock what Design is still exploring. */
      if (!LOCKS.includes(change)) expect(lines, change).toContain('design')
      else expect(lines, change).not.toContain('design')
    }
  })
})
