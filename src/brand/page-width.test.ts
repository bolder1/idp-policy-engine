import { describe, expect, it } from 'vitest'

import { applyPageWidth, compactClass, parsePageWidth, readPageWidth } from './page-width'

describe('page width', () => {
  it('turns full width on only for the exact stored value', () => {
    expect(parsePageWidth('full')).toBe('full')
    for (const value of [null, undefined, '', 'Full', 'compact', 'wide', 'true', 1]) {
      expect(parsePageWidth(value), String(value)).toBe('compact')
    }
  })

  it('falls back to compact where there is no storage to read', () => {
    expect(readPageWidth()).toBe('compact')
  })

  it('does nothing, rather than throwing, where there is no storage to write', () => {
    expect(() => applyPageWidth('full')).not.toThrow()
    applyPageWidth('compact')
  })

  it('adds the compact class only while compact', () => {
    expect(compactClass('compact')).toBe(' bpage--compact')
    expect(compactClass('full')).toBe('')
  })
})
