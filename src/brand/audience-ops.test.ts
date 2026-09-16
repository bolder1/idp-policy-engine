import { describe, expect, it } from 'vitest'

import { EVERYONE, audienceOf, users } from './data'
import { outsideAudience, outsideAudienceOf } from './audience-ops'

/* -----------------------------------------------------------------------------
   A rule's who can only narrow the policy's audience.

   The audience is checked before any rule, so a group or a person the policy
   does not govern is somebody the rule can never apply to. These are the
   rows the picker marks "Outside this policy" and the linter reports as PE151.
   -------------------------------------------------------------------------- */

describe('outsideAudience', () => {
  it('reports nothing for a policy that governs everyone', () => {
    expect(outsideAudience(EVERYONE, ['contractors'], ['devon'], users)).toEqual({ groups: [], users: [] })
  })

  it('reports a group the policy does not govern', () => {
    expect(outsideAudience(audienceOf(['finance']), ['finance', 'contractors'], [], users).groups).toEqual(['contractors'])
  })

  it('does not report a person whose group the policy governs', () => {
    expect(outsideAudience(audienceOf(['finance']), [], ['priya'], users).users).toEqual([])
  })

  it('reports a person outside the governed groups, unless named on the policy', () => {
    expect(outsideAudience(audienceOf(['finance']), [], ['mehak'], users).users).toEqual(['mehak'])
    expect(outsideAudience(audienceOf(['finance'], ['mehak']), [], ['mehak'], users).users).toEqual([])
  })

  it('leaves a person it cannot find unflagged', () => {
    expect(outsideAudience(audienceOf(['finance']), [], ['nobody-here'], users).users).toEqual([])
  })
})

describe('outsideAudienceOf a rule who', () => {
  it('reads the included lists, never the exceptions', () => {
    const who = { groupIds: ['contractors'], userIds: [], exceptGroupIds: ['legal'] }
    expect(outsideAudienceOf(audienceOf(['finance']), who, users)).toEqual({ groups: ['contractors'], users: [] })
  })

  it('reports nothing for a rule with no who', () => {
    expect(outsideAudienceOf(audienceOf(['finance']), undefined, users)).toEqual({ groups: [], users: [] })
  })
})
