import { describe, expect, it } from 'vitest'

import { showcaseTenant } from '../../fixtures'
import { CHIP_DEVICES, TENANT_TZ } from '../sign-in-facts'
import { envOf, resolveSignIn } from '../tenant-resolver'
import { DEVICE_PRESETS, devicePreset, presetOf, type DevicePresetId } from './device-presets'

const t = showcaseTenant()
const env = envOf(t)
const when = { date: '2026-09-28', time: '09:30', timeZone: TENANT_TZ, source: 'stated' } as const
const on = (id: DevicePresetId, personId: string, appId: string, risk = 12) =>
  resolveSignIn(t.policies, { personId, appId, when, device: devicePreset(id).facts, risk: { score: risk, source: 'stated' } }, env).decision

describe('the device presets', () => {
  it('are seven, in picker order, each stated', () => {
    expect(DEVICE_PRESETS.map((p) => p.id)).toEqual([
      'android-12',
      'android-14',
      'iphone',
      'win11-registered',
      'win11-unregistered',
      'win11-no-agent',
      'win10',
    ])
    for (const p of DEVICE_PRESETS) expect(p.facts.source, p.id).toBe('stated')
    for (const p of DEVICE_PRESETS) expect(p.facts.platform, p.id).toBe(p.platform)
  })

  it('are the chip devices where they share a name, stated instead of assumed', () => {
    /* One table of what "the registered laptop" is, not two that drift. */
    expect(devicePreset('win11-registered').facts).toEqual({ ...CHIP_DEVICES['Managed (MDM)'], source: 'stated' })
    expect(devicePreset('win11-unregistered').facts).toEqual({ ...CHIP_DEVICES['Changed fingerprint'], source: 'stated' })
    expect(devicePreset('iphone').facts).toEqual({ ...CHIP_DEVICES['Known < 90 days'], source: 'stated' })
    expect(devicePreset('win10').facts).toEqual({ ...CHIP_DEVICES['Known > 90 days'], source: 'stated' })
  })

  it('differ from each other by what their labels say', () => {
    const a12 = devicePreset('android-12').facts
    expect({ ...devicePreset('android-14').facts, osVersion: '12' }).toEqual(a12)
    const reg = devicePreset('win11-registered').facts
    expect({ ...devicePreset('win11-unregistered').facts, registeredToPerson: true }).toEqual(reg)
  })
})

describe('presetOf', () => {
  it('finds every preset from its facts, whatever the source says', () => {
    for (const p of DEVICE_PRESETS) {
      expect(presetOf(p.facts)).toBe(p.id)
      expect(presetOf({ ...p.facts, source: 'assumed' })).toBe(p.id)
    }
  })

  it('calls a preset with one detail changed nobody', () => {
    expect(presetOf({ ...devicePreset('win11-registered').facts, agentVersion: '4.2' })).toBeNull()
    /* Not stated and stated absent are two devices. */
    expect(presetOf({ ...devicePreset('win11-registered').facts, screenLock: undefined })).toBeNull()
  })

  it('does not care what order a nested fact was written in', () => {
    const a14 = devicePreset('android-14').facts
    expect(presetOf({ ...a14, integrity: { emulated: false, tampered: false, rooted: false }, browser: { version: '128', family: 'chrome' } })).toBe('android-14')
  })
})

describe('on the showcase', () => {
  it('lets a compliant phone into Outlook and refuses the one under the floor', () => {
    expect(on('android-12', 'devon', 'outlook')).toBe('deny')
    expect(on('android-14', 'devon', 'outlook')).toBe('1fa')
    expect(on('iphone', 'devon', 'outlook')).toBe('1fa')
  })

  it('lets only the registered corporate laptop into Google Workspace', () => {
    expect(on('win11-registered', 'u-sales-1', 'google-workspace')).toBe('1fa')
    expect(on('win11-unregistered', 'u-sales-1', 'google-workspace')).toBe('deny')
    expect(on('win11-no-agent', 'u-sales-2', 'google-workspace')).toBe('deny')
  })
})
