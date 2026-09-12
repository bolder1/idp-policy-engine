import { describe, expect, it } from 'vitest'

import { applyBrand, parseBrand, readBrand } from './brand-mode'

describe('brand mode', () => {
  it('turns the rebrand on only for the exact stored value', () => {
    expect(parseBrand('rebrand')).toBe('rebrand')
    for (const value of [null, undefined, '', 'Rebrand', 'current', 'true', 1]) {
      expect(parseBrand(value), String(value)).toBe('current')
    }
  })

  it('falls back to the current look where there is no storage to read', () => {
    expect(readBrand()).toBe('current')
  })

  it('does nothing, rather than throwing, where there is no document', () => {
    expect(() => applyBrand('rebrand')).not.toThrow()
  })
})
