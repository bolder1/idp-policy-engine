import { describe, expect, it } from 'vitest'

import { attrOf, seedProfiles, type FingerprintProfile } from '../fingerprint'
import { checkLine, chosenChecks, summarise } from './profile-aside'

const seed = (id: string): FingerprintProfile => {
  const p = seedProfiles.find((x) => x.id === id)
  if (!p) throw new Error(`no seed ${id}`)
  return p
}

const attr = (mode: 'os' | 'device', id: string) => {
  const a = attrOf(mode, id)
  if (!a) throw new Error(`no attribute ${id}`)
  return a
}

describe('the device profile side column', () => {
  it('says what a health profile checks, one short line each, with no count', () => {
    const s = summarise(seed('fp-corp'))
    expect(s).toEqual(['Laptops only.', 'Windows 10 or later.', 'Other platforms are not checked.'])
    expect(s.join(' ')).not.toMatch(/\d+ checks?/)

    expect(summarise(seed('fp-byod'))).toEqual([
      'Mobile devices only.',
      'Android 13 or later.',
      'iOS 17 or later.',
      'Other platforms are not checked.',
    ])
  })

  it('says nothing for an empty profile, and says so when no OS is named', () => {
    const corp = seed('fp-corp')
    /* The list's empty state says it; the column does not repeat it. */
    expect(summarise({ ...corp, enabled: [], config: {} })).toEqual([])
    expect(summarise({ ...corp, enabled: ['device-type'], config: {} })).toEqual([
      'Laptops only.',
      'Any OS version passes.',
    ])
    expect(summarise({ ...corp, enabled: ['screen-lock', 'integrity'], config: {} })).toEqual([
      'Device integrity: not rooted or jailbroken.',
      'A screen lock is set.',
      'Any OS version passes.',
    ])
    expect(
      summarise({ ...corp, enabled: ['os-macos', 'browser-chrome', 'mo-authenticator'], config: {} }),
    ).toEqual([
      'macOS 14 · Sonoma or later.',
      'Chrome 120 or later.',
      'miniOrange Authenticator 6.4 or later.',
      'Other platforms are not checked.',
      'Other browsers are not checked.',
    ])
  })

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

  it('summarises a trusted device by weight rather than by count', () => {
    const kiosk = seed('fp-kiosk')
    expect(chosenChecks(kiosk).slice(0, 4).every((a) => a.always)).toBe(true)
    const s = summarise(kiosk)
    expect(s[0]).toBe('High weight: MAC address, Machine SID.')
    expect(s).toContain('Low weight: Device type, Browser and version, IP address.')
    expect(s[s.length - 1]).toBe('Each changed signal adds its weight to the score.')

    /* Weights come from the draft, and a long list is cut to three names. */
    const unmanaged = summarise(seed('fp-unmanaged'))
    expect(unmanaged[0]).toBe('No signal has a high weight.')
    expect(unmanaged[1]).toBe('Low weight: Device type, Browser and version, IP address and 4 more.')
    expect(summarise({ ...seed('fp-unmanaged'), weights: { geo: 30 } })[0]).toBe('High weight: Geolocation.')
  })
})
