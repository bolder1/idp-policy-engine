import { describe, expect, it } from 'vitest'
import { ROLLOUT } from './rollout'

describe('the rollout table', () => {
  it('names only real lines, and every change reaches Design first', () => {
    for (const [change, lines] of Object.entries(ROLLOUT)) {
      for (const l of lines) expect(['design', 'handoff', 'tester'], change).toContain(l)
      /* The rail lock is the one change Design never gets: it locks what Design is still exploring. */
      if (change !== 'railLock') expect(lines, change).toContain('design')
    }
  })
})
