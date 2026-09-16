import { describe, expect, it } from 'vitest'

import { applyTheme, parseTheme, readTheme } from './theme-mode'

describe('theme mode', () => {
  it('turns dark on only for the exact stored value', () => {
    expect(parseTheme('dark')).toBe('dark')
    for (const value of [null, undefined, '', 'Dark', 'light', 'true', 1]) {
      expect(parseTheme(value), String(value)).toBe('light')
    }
  })

  it('falls back to light where there is no storage to read', () => {
    expect(readTheme()).toBe('light')
  })

  it('does nothing, rather than throwing, where there is no document', () => {
    expect(() => applyTheme('dark')).not.toThrow()
  })
})
