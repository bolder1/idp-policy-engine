import { describe, expect, it } from 'vitest'

import { lineForEmail, linesFor, needsLock, resolveLine } from './lines'

/* Who may open which view (owner, 19 Nov 2026): the designer sees all three; developers never see Tester; testers
   never see Dev handoff; neither is offered Design (19 Nov 2026). */

describe('the views each sign-in may open', () => {
  it('gives the designer all three', () => {
    expect(linesFor('design')).toEqual(['design', 'handoff', 'tester'])
  })

  it('never shows a developer the Tester view', () => {
    expect(linesFor('handoff')).not.toContain('tester')
    expect(linesFor('handoff')[0]).toBe('handoff')
  })

  it('never shows a tester the Dev handoff view', () => {
    expect(linesFor('tester')).not.toContain('handoff')
    expect(linesFor('tester')[0]).toBe('tester')
  })

  it('never offers Design to a developer or a tester (19 Nov 2026)', () => {
    expect(linesFor('handoff')).toEqual(['handoff'])
    expect(linesFor('tester')).toEqual(['tester'])
  })

  it('locks Design for all but the designer', () => {
    expect(needsLock('handoff', 'design')).toBe(true)
    expect(needsLock('tester', 'design')).toBe(true)
    expect(needsLock(null, 'design')).toBe(true)
    expect(needsLock('design', 'design')).toBe(false)
    expect(needsLock('design', 'tester')).toBe(false)
  })
})

describe('the view a load opens', () => {
  it('keeps a stored view this sign-in may open', () => {
    expect(resolveLine('design', 'tester')).toBe('tester')
    expect(resolveLine('design', 'handoff')).toBe('handoff')
  })

  it('sends a developer or tester who had Design stored back to their own view', () => {
    expect(resolveLine('handoff', 'design')).toBe('handoff')
    expect(resolveLine('tester', 'design')).toBe('tester')
  })

  it('falls back to its own view when the stored one is off limits', () => {
    expect(resolveLine('handoff', 'tester')).toBe('handoff')
    expect(resolveLine('tester', 'handoff')).toBe('tester')
    expect(resolveLine('tester', null)).toBe('tester')
  })

  it('shows the sign-in screen with no one signed in', () => {
    expect(resolveLine(null, 'design')).toBeNull()
  })
})

describe('the seed sign-ins', () => {
  it('map each email to its line, whatever the case or spaces', () => {
    expect(lineForEmail('design@prototype.test')).toBe('design')
    expect(lineForEmail('  DEV@prototype.test ')).toBe('handoff')
    expect(lineForEmail('tester@prototype.test')).toBe('tester')
  })
})
