import { describe, expect, it } from 'vitest'

import { lineForEmail, linesFor, needsLock, resolveLine } from './lines'

/* Who may open which view (owner, 19 Nov 2026): the designer sees all three; developers never see Tester; testers
   never see Dev handoff; Design is offered to everyone behind the passphrase. */

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

  it('offers Design to everyone, locked for all but the designer', () => {
    for (const home of ['design', 'handoff', 'tester'] as const) expect(linesFor(home)).toContain('design')
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
    expect(resolveLine('handoff', 'design')).toBe('design')
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
