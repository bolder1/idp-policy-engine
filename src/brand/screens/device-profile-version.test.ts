import { describe, expect, it } from 'vitest'

import { CREATE_VERSIONS, parseCreateVersion, readCreateVersion, writeCreateVersion } from './device-profile-version'

describe('the create profile version switch', () => {
  it('offers the shipped flow first, then the three proposals, each named and explained', () => {
    expect(CREATE_VERSIONS.map((v) => v.id)).toEqual(['current', 'full', 'name', 'values'])
    expect(CREATE_VERSIONS.map((v) => v.label)).toEqual(['Current', 'Version 1', 'Version 2', 'Version 3'])
    for (const v of CREATE_VERSIONS) {
      /* A short name the switch can drop to when the header is narrow. One or
         two words, and `Slide-over` is hyphenated, so the shape is looser than
         the two-word rule this asserted while every name happened to be two. */
      expect(v.name, v.id).toMatch(/^[A-Z][A-Za-z-]*( [a-z]+)?$/)
      expect(v.tip.trim(), v.id).not.toBe('')
    }
  })

  /* Current is the fallback, not Version 1: it is the flow the product shipped,
     and the other three are proposals measured against it. A stored id from
     before Current existed still reads back as itself. */
  it('reads only a stored version id, and anything else as Current', () => {
    for (const id of ['current', 'full', 'name', 'values'] as const) expect(parseCreateVersion(id)).toBe(id)
    for (const value of [null, undefined, '', 'Full', 'v2', 2, {}]) {
      expect(parseCreateVersion(value), String(value)).toBe('current')
    }
  })

  it('falls back to Current, and does not throw, where there is no storage', () => {
    expect(readCreateVersion()).toBe('current')
    expect(() => writeCreateVersion('values')).not.toThrow()
  })
})
