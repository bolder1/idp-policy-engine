import { describe, expect, it } from 'vitest'

import {
  blankProfile,
  compareVersions,
  decidingCheck,
  healthMatches,
  profileMatches,
  trustedMatches,
  type FingerprintProfile,
} from './fingerprint'
import { showcaseProfiles } from './showcase-seed'
import { CHIP_DEVICES, type SignInDevice } from './screens/sign-in-facts'

/* -----------------------------------------------------------------------------
   A device against a device profile, row by row.

   The evaluator graded every device profile on one bit — whether the chip said
   the device was recognised — so an Android 12 handset passed "Android ≥ 13"
   and no floor, integrity rung, screen lock or device limit was ever read.
   These pin each row's reading, and the two rules that make the reading
   honest: a signal the device REPORTS absent fails, a signal nobody stated is
   undecided, and a row about another platform does not apply.
   -------------------------------------------------------------------------- */

const health = (enabled: string[], config: FingerprintProfile['config'] = {}): FingerprintProfile => ({
  ...blankProfile('Health', 'os'),
  id: 'fp-test',
  enabled,
  config,
})

const phone = (over: Partial<SignInDevice> = {}): SignInDevice => ({
  source: 'stated',
  platform: 'android',
  osVersion: '14',
  formFactor: 'Mobile',
  integrity: { rooted: false, tampered: false, emulated: false },
  screenLock: 'pin',
  authenticatorVersion: '6.5',
  ...over,
})

const laptop = (over: Partial<SignInDevice> = {}): SignInDevice => ({
  source: 'stated',
  platform: 'windows',
  osVersion: '10.0.22631',
  formFactor: 'Laptop',
  integrity: null,
  screenLock: null,
  authenticatorVersion: null,
  agentInstalled: true,
  agentVersion: '4.3',
  ...over,
})

const row = (p: FingerprintProfile, d: SignInDevice | undefined, id: string) => healthMatches(p, d).checks.find((c) => c.id === id)!

describe('compareVersions', () => {
  it('reads a Windows build against the marketing release it belongs to', () => {
    expect(compareVersions('10.0.22631', '11', 'windows')).toBe(1)
    expect(compareVersions('10.0.22000', '11', 'windows')).toBe(0)
    expect(compareVersions('10.0.19045', '11', 'windows')).toBe(-1)
    expect(compareVersions('10.0.19045', '10', 'windows')).toBe(1)
    expect(compareVersions('6.3.9600', '8.1', 'windows')).toBe(0)
  })

  it('pads with zeros, so 17 and 17.0 are the same release', () => {
    expect(compareVersions('17', '17.0')).toBe(0)
    expect(compareVersions('17.5', '17')).toBe(1)
    expect(compareVersions('6.4', '6.4.1')).toBe(-1)
    expect(compareVersions('131', '120')).toBe(1)
  })

  it('does not translate "11" off Windows', () => {
    expect(compareVersions('10.0.22631', '11')).toBe(-1)
  })

  it('refuses to compare what is not a version', () => {
    expect(compareVersions('Windows 11', '11', 'windows')).toBeNull()
    expect(compareVersions('14', '')).toBeNull()
  })
})

describe('a device-health profile', () => {
  it('draws an OS floor only under the platform it names', () => {
    const p = health(['os-android', 'os-ios'], { 'os-android': { op: 'gte', value: '13' } })
    expect(row(p, phone({ osVersion: '12' }), 'os-android')).toMatchObject({ status: 'fail', actual: '12', required: '≥ 13' })
    expect(row(p, phone({ osVersion: '13' }), 'os-android').status).toBe('pass')
    expect(row(p, phone(), 'os-ios')).toMatchObject({ status: 'not applicable', actual: 'Android' })
    expect(healthMatches(p, phone()).status).toBe('pass')
  })

  it('honours every operator the catalogue offers', () => {
    const at = (op: string, v: string) => row(health(['os-android'], { 'os-android': { op, value: '13' } }), phone({ osVersion: v }), 'os-android').status
    expect([at('gt', '13'), at('gt', '14')]).toEqual(['fail', 'pass'])
    expect([at('lt', '13'), at('lt', '12')]).toEqual(['fail', 'pass'])
    expect([at('lte', '13'), at('lte', '14')]).toEqual(['pass', 'fail'])
    expect([at('eq', '13'), at('eq', '13.1')]).toEqual(['pass', 'fail'])
    expect([at('ne', '13'), at('ne', '12')]).toEqual(['fail', 'pass'])
  })

  it('grades against the master default when the profile stores no value, as the overview prints it', () => {
    /* `os-android` defaults to ≥ 13 in the catalogue. */
    expect(row(health(['os-android']), phone({ osVersion: '12' }), 'os-android')).toMatchObject({ status: 'fail', required: '≥ 13' })
  })

  it('waits on the platform, then on the version, when neither is stated', () => {
    const p = health(['os-android'])
    expect(healthMatches(p, { source: 'stated' })).toMatchObject({ status: 'unknown', missing: ['device.platform', 'device.osVersion'] })
    expect(healthMatches(p, { source: 'stated', platform: 'android' })).toMatchObject({ status: 'unknown', missing: ['device.osVersion'] })
  })

  it('climbs the integrity ladder one class of device at a time', () => {
    const at = (rung: string, integrity: SignInDevice['integrity']) => row(health(['integrity'], { integrity: rung }), phone({ integrity }), 'integrity').status
    const tampered = { rooted: false, tampered: true, emulated: false }
    const emulated = { rooted: false, tampered: false, emulated: true }
    expect(at('Not rooted or jailbroken', { rooted: true, tampered: false, emulated: false })).toBe('fail')
    expect(at('Not rooted or jailbroken', tampered)).toBe('pass')
    expect(at('Not rooted, jailbroken or tampered', tampered)).toBe('fail')
    expect(at('Not rooted, jailbroken or tampered', emulated)).toBe('pass')
    expect(at('Not rooted, tampered or emulated', emulated)).toBe('fail')
  })

  it('fails a signal the device reports absent, and waits on one nobody stated', () => {
    const p = health(['integrity', 'screen-lock', 'mo-authenticator'])
    expect(row(p, phone({ integrity: null }), 'integrity')).toMatchObject({ status: 'fail', actual: 'not reported' })
    expect(row(p, phone({ authenticatorVersion: null }), 'mo-authenticator')).toMatchObject({ status: 'fail', actual: 'not installed' })
    expect(row(p, phone({ screenLock: null }), 'screen-lock').status).toBe('fail')
    const unstated = healthMatches(p, phone({ integrity: undefined }))
    expect(unstated.status).toBe('unknown')
    expect(unstated.missing).toEqual(['device.integrity'])
    /* Installed, with no version stated: undecided, and waiting on the version. */
    const noVersion = healthMatches(p, phone({ authenticatorVersion: '' }))
    expect(noVersion.checks.find((c) => c.id === 'mo-authenticator')).toMatchObject({ status: 'unknown', actual: 'not stated' })
    expect(noVersion.missing).toEqual(['device.authenticatorVersion'])
  })

  it('maps each screen lock onto the three requirements', () => {
    const at = (want: string, screenLock: SignInDevice['screenLock']) =>
      row(health(['screen-lock'], { 'screen-lock': want }), phone({ screenLock }), 'screen-lock').status
    expect([at('A screen lock is set', 'none'), at('A screen lock is set', 'pattern')]).toEqual(['fail', 'pass'])
    /* A pattern is a screen lock and not a PIN; biometric unlock has a passcode behind it. */
    expect([at('PIN, passcode or password', 'pattern'), at('PIN, passcode or password', 'pin'), at('PIN, passcode or password', 'biometric')]).toEqual([
      'fail',
      'pass',
      'pass',
    ])
    expect([at('Biometric unlock', 'pin'), at('Biometric unlock', 'biometric')]).toEqual(['fail', 'pass'])
  })

  it('does not ask a laptop for what only the handset app reports, nor a phone for the desktop agent', () => {
    const p = health(['integrity', 'screen-lock', 'mo-authenticator', 'mo-agent'])
    const onLaptop = healthMatches(p, laptop())
    expect(onLaptop.checks.map((c) => [c.id, c.status])).toEqual([
      ['integrity', 'not applicable'],
      ['screen-lock', 'not applicable'],
      ['mo-authenticator', 'not applicable'],
      ['mo-agent', 'pass'],
    ])
    expect(onLaptop.status).toBe('pass')
    expect(row(p, phone(), 'mo-agent').status).toBe('not applicable')
  })

  it('asks every device every row when told to, so a laptop fails integrity', () => {
    const p = health(['integrity'])
    expect(healthMatches(p, laptop(), { clientRows: 'every-device' }).status).toBe('fail')
    expect(healthMatches(p, phone({ agentInstalled: false }), { clientRows: 'every-device' }).status).toBe('pass')
    expect(healthMatches(health(['mo-agent']), phone({ agentInstalled: false }), { clientRows: 'every-device' }).status).toBe('fail')
  })

  it('cannot fail a handset-only row without knowing the device is a handset', () => {
    const r = healthMatches(health(['integrity']), { source: 'stated', integrity: null })
    expect(r.status).toBe('unknown')
    expect(r.missing).toEqual(['device.platform'])
    expect(healthMatches(health(['integrity']), { source: 'stated', integrity: { rooted: false, tampered: false, emulated: false } }).status).toBe('pass')
  })

  it('reads a browser floor only for the family it names', () => {
    const p = health(['browser-chrome'], { 'browser-chrome': { op: 'gte', value: '126' } })
    expect(row(p, laptop({ browser: { family: 'chrome', version: '120.0.6099' } }), 'browser-chrome').status).toBe('fail')
    expect(row(p, laptop({ browser: { family: 'chrome', version: '128' } }), 'browser-chrome').status).toBe('pass')
    expect(row(p, laptop({ browser: { family: 'firefox', version: '90' } }), 'browser-chrome').status).toBe('not applicable')
    expect(healthMatches(p, laptop()).missing).toEqual(['device.browser'])
  })

  it('reads the form factor off a desktop platform, and waits on it for a handset platform', () => {
    const p = health(['device-type'], { 'device-type': 'Laptop' })
    expect(row(p, { source: 'stated', platform: 'macos' }, 'device-type')).toMatchObject({ status: 'pass', actual: 'Laptop' })
    expect(healthMatches(p, { source: 'stated', platform: 'android' })).toMatchObject({ status: 'unknown', missing: ['device.formFactor'] })
    expect(row(p, phone({ formFactor: 'Tablet' }), 'device-type').status).toBe('fail')
  })

  it('is undecided on every row with no device at all', () => {
    const compliant = showcaseProfiles.find((p) => p.id === 'fp-compliant')!
    const r = healthMatches(compliant, undefined)
    expect(r.status).toBe('unknown')
    expect(r.checks.every((c) => c.status === 'unknown')).toBe(true)
    expect(r.checks.map((c) => c.id)).toEqual(['os-windows', 'os-android', 'os-ios', 'os-macos', 'integrity', 'screen-lock', 'mo-authenticator'])
  })

  it('never reads registration or the device limit, which an OS profile does not have', () => {
    const p = { ...health(['os-android']), maxDevices: 1, restrictMobile: true }
    expect(healthMatches(p, phone({ registeredToPerson: false, registeredCount: 9 })).status).toBe('pass')
  })
})

describe('a trusted-device profile', () => {
  const corporate = showcaseProfiles.find((p) => p.id === 'fp-corp-devices')!

  it('recognises a registered Windows machine running the agent', () => {
    const r = trustedMatches(corporate, laptop({ registeredToPerson: true, registeredCount: 1 }), true)
    expect(r.status).toBe('pass')
    expect(r.checks.map((c) => c.id)).toEqual(['agent', 'registration'])
  })

  it('refuses an agent-based profile off Windows, and says the agent runs only there', () => {
    const r = trustedMatches(corporate, phone({ registeredToPerson: true }), true)
    expect(r.status).toBe('fail')
    expect(r.checks.find((c) => c.id === 'agent')).toMatchObject({ status: 'fail', actual: 'Android' })
    expect(trustedMatches(corporate, laptop({ agentInstalled: false, agentVersion: null, registeredToPerson: true }), true).status).toBe('fail')
  })

  it('names the device limit, not registration, for a third device on a two-device profile', () => {
    const r = trustedMatches(corporate, laptop({ registeredToPerson: false, registeredCount: 2 }), true)
    expect(r.status).toBe('fail')
    expect(r.checks.find((c) => c.id === 'limit')).toMatchObject({ status: 'fail', actual: '2 already registered', required: 'at most 2' })
    expect(decidingCheck(corporate, r)?.id).toBe('limit')
  })

  it('lets a new device register itself on first sight, within the limit', () => {
    const auto = { ...corporate, autoRegister: true }
    expect(trustedMatches(auto, laptop({ registeredToPerson: false, registeredCount: 1 }), true).status).toBe('pass')
    expect(trustedMatches(auto, laptop({ registeredToPerson: false, registeredCount: 2 }), true).status).toBe('fail')
    expect(trustedMatches(corporate, laptop({ registeredToPerson: false, registeredCount: 0 }), true).status).toBe('fail')
  })

  it('refuses a phone when mobile devices are restricted', () => {
    const noPhones = { ...corporate, reach: 'agentless' as const, restrictMobile: true }
    expect(trustedMatches(noPhones, phone({ registeredToPerson: true }), true).checks.find((c) => c.id === 'mobile')?.status).toBe('fail')
    expect(trustedMatches(noPhones, laptop({ registeredToPerson: true }), true).status).toBe('pass')
  })

  it('reads a pre-approved roster as registration, with no limit', () => {
    const roster: FingerprintProfile = { ...corporate, registration: 'pre-approved', maxDevices: null }
    expect(trustedMatches(roster, laptop({ registeredToPerson: false }), true).checks.map((c) => c.id)).toEqual(['agent', 'registration'])
    expect(trustedMatches(roster, laptop({ registeredToPerson: false }), true).status).toBe('fail')
  })

  it('waits on the person, and on each fact nobody stated', () => {
    expect(trustedMatches(corporate, laptop({ registeredToPerson: true }), false)).toMatchObject({ status: 'unknown', missing: ['person'] })
    expect(trustedMatches(corporate, laptop(), true)).toMatchObject({ status: 'unknown', missing: ['device.registration', 'device.registeredCount'] })
    expect(trustedMatches(corporate, undefined, true).status).toBe('unknown')
  })
})

describe('profileMatches', () => {
  it('dispatches on the kind of profile', () => {
    const corporate = showcaseProfiles.find((p) => p.id === 'fp-corp-devices')!
    const compliant = showcaseProfiles.find((p) => p.id === 'fp-compliant')!
    expect(profileMatches(corporate, CHIP_DEVICES['Managed (MDM)']).status).toBe('pass')
    expect(profileMatches(corporate, CHIP_DEVICES['Expired trust']).status).toBe('fail')
    expect(profileMatches(compliant, CHIP_DEVICES['Known < 90 days']).status).toBe('pass')
    expect(profileMatches(compliant, CHIP_DEVICES['Known > 90 days']).status).toBe('fail')
    expect(profileMatches(compliant, CHIP_DEVICES['Managed (MDM)'], { clientRows: 'every-device' }).status).toBe('fail')
  })
})
