import { describe, expect, it } from 'vitest'

import { playsLanding } from './focus2-draw-model'

const base = { instant: false, landed: true, deciding: false, outcomeOpen: true, flown: null, key: '1:a' }

describe('the verdict landing flourish', () => {
  it('plays once for a presented landing', () => {
    expect(playsLanding(base)).toBe(true)
  })
  it('is skipped when the run lands at once, or under reduced motion (both are `instant`)', () => {
    expect(playsLanding({ ...base, instant: true })).toBe(false)
  })
  it('waits for the answer to be on screen', () => {
    expect(playsLanding({ ...base, landed: false })).toBe(false)
    expect(playsLanding({ ...base, deciding: true })).toBe(false)
    expect(playsLanding({ ...base, outcomeOpen: false })).toBe(false)
  })
  it('does not replay on a browse back to the card, but does for a new run', () => {
    expect(playsLanding({ ...base, flown: '1:a' })).toBe(false)
    expect(playsLanding({ ...base, flown: '0:a' })).toBe(true)
  })
})
