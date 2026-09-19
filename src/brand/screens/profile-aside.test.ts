import { describe, expect, it } from 'vitest'

import { attrOf } from '../fingerprint'
import { checkLine } from './profile-aside'

const attr = (mode: 'os' | 'device', id: string) => {
  const a = attrOf(mode, id)
  if (!a) throw new Error(`no attribute ${id}`)
  return a
}

/* `summarise` and `chosenChecks` were tested here too, until the side panels
   became fixed copy (18 Sep 2026) and both were deleted with them. */
describe('one check as a line', () => {
  it('reads a version comparison as words, using the release name where there is one', () => {
    const win = attr('os', 'os-windows')
    expect(checkLine(win, { op: 'gte', value: '10.0.22631' })).toBe('Windows 11 · 23H2 or later.')
    expect(checkLine(win, { op: 'lt', value: '11' })).toBe('Earlier than Windows 11.')
    expect(checkLine(attr('os', 'browser-chrome'), { op: 'gte', value: '126' })).toBe('Chrome 126 or later.')
    expect(checkLine(attr('os', 'browser-chrome'), { op: 'gte', value: ' ' })).toBe('Chrome version is not set.')
    expect(checkLine(attr('os', 'integrity'), undefined)).toBe('Device integrity: not rooted or jailbroken.')
    expect(checkLine(attr('os', 'screen-lock'), 'PIN, passcode or password')).toBe(
      'Screen lock: PIN, passcode or password.',
    )
  })
})
