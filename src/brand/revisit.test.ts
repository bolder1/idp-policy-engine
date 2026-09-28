import { describe, expect, it } from 'vitest'

import { isRevisit } from './revisit'

/* `go` bumps `visit` on a revisit, and the screen remounts. A remount under the
   Policies list's own slider would throw away its search, filters and sort. */

describe('a revisit', () => {
  it('is the rail item for the open screen, pressed again', () => {
    expect(isRevisit({ name: 'policies' }, { name: 'policies' })).toBe(true)
    expect(isRevisit({ name: 'zones' }, { name: 'zones' })).toBe(true)
    expect(isRevisit({ name: 'display-tokens', tab: 'tokens' }, { name: 'display-tokens' })).toBe(true)
  })

  it('is never another screen, or a screen with a policy', () => {
    expect(isRevisit({ name: 'zones' }, { name: 'policies' })).toBe(false)
    expect(isRevisit({ name: 'board', policyId: 'p' }, { name: 'board', policyId: 'p', open: 'try' })).toBe(false)
  })

  it('is not a tab named on the same screen', () => {
    expect(isRevisit({ name: 'display-tokens' }, { name: 'display-tokens', tab: 'tokens' })).toBe(false)
  })
})
