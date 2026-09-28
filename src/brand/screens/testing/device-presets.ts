import { CHIP_DEVICES, type DevicePlatform, type SignInDevice } from '../sign-in-facts'

/* -----------------------------------------------------------------------------
   The devices a tester picks from, before editing any detail.

   Seven, each a device somebody in the showcase really signs in on, and each
   chosen so it fails at most one check the showcase's profiles make: the
   Android 12 phone is under the Compliant devices floor of 13 and nothing
   else, the unregistered laptop is the registered one without its
   registration. A preset that failed three things at once would teach nothing
   about which one mattered.

   Every preset is STATED. The chip table's devices carry `assumed`, because a
   chip means a device without anybody saying which; a tester who picks a
   preset has said which. The four that are chip devices spread the chip's
   facts and override only the source, so the two tables cannot drift.
   -------------------------------------------------------------------------- */

export type DevicePresetId =
  | 'android-12'
  | 'android-14'
  | 'iphone'
  | 'win11-registered'
  | 'win11-unregistered'
  | 'win11-no-agent'
  | 'win10'

export interface DevicePreset {
  id: DevicePresetId
  label: string
  /** For the platform mark beside the label. */
  platform: DevicePlatform
  facts: SignInDevice
}

const stated = (chip: string): SignInDevice => ({ ...CHIP_DEVICES[chip], source: 'stated' })

/* A handset with the miniOrange Authenticator, a PIN, and nothing wrong with
   it — registered to nobody yet, as a phone first seen at sign-in is. */
const android = (osVersion: string): SignInDevice => ({
  source: 'stated',
  platform: 'android',
  osVersion,
  formFactor: 'Mobile',
  browser: { family: 'chrome', version: '128' },
  integrity: { rooted: false, tampered: false, emulated: false },
  screenLock: 'pin',
  authenticatorVersion: '6.5.0',
  agentInstalled: false,
  agentVersion: null,
  registeredToPerson: false,
  registeredCount: 0,
})

/** In picker order: the phones, then the laptops, newest first. */
export const DEVICE_PRESETS: readonly DevicePreset[] = [
  { id: 'android-12', label: 'Android 12 phone', platform: 'android', facts: android('12') },
  { id: 'android-14', label: 'Android 14 phone', platform: 'android', facts: android('14') },
  { id: 'iphone', label: 'iPhone · iOS 17.5', platform: 'ios', facts: stated('Known < 90 days') },
  { id: 'win11-registered', label: 'Windows 11 laptop · registered', platform: 'windows', facts: stated('Managed (MDM)') },
  { id: 'win11-unregistered', label: 'Windows 11 laptop · not registered', platform: 'windows', facts: stated('Changed fingerprint') },
  {
    id: 'win11-no-agent',
    label: 'Windows 11 laptop · no Device Agent',
    platform: 'windows',
    /* A personal laptop: the handset-only signals stated absent, as on every
       Windows row, and no agent to read the hardware. */
    facts: {
      source: 'stated',
      platform: 'windows',
      osVersion: '10.0.22631',
      formFactor: 'Laptop',
      browser: { family: 'edge', version: '128' },
      integrity: null,
      screenLock: null,
      authenticatorVersion: null,
      agentInstalled: false,
      agentVersion: null,
      registeredToPerson: false,
      registeredCount: 0,
    },
  },
  { id: 'win10', label: 'Windows 10 laptop', platform: 'windows', facts: stated('Known > 90 days') },
]

/** The preset with this id. Every `DevicePresetId` has one. */
export function devicePreset(id: DevicePresetId): DevicePreset {
  return DEVICE_PRESETS.find((p) => p.id === id)!
}

/* The preset a device IS, whatever its source says, or null for a device no
   preset describes. Compared fact by fact, so a preset with one detail edited
   is a custom device — which is what the picker then says. */
export function presetOf(device: SignInDevice): DevicePresetId | null {
  const key = factKey(device)
  return DEVICE_PRESETS.find((p) => factKey(p.facts) === key)?.id ?? null
}

/* Every fact but the source, in a fixed order, as one string. Not stated
   (`undefined`) and stated absent (`null`) stay different — the distinction
   sign-in-facts.ts insists on — and the two nested facts are spelt out, so the
   order their keys were written in cannot make one device two. */
const factKey = (d: SignInDevice): string =>
  JSON.stringify([
    d.platform,
    d.osVersion,
    d.formFactor,
    d.browser && `${d.browser.family} ${d.browser.version}`,
    d.integrity && [d.integrity.rooted, d.integrity.tampered, d.integrity.emulated],
    d.screenLock,
    d.authenticatorVersion,
    d.agentInstalled,
    d.agentVersion,
    d.registeredToPerson,
    d.registeredCount,
  ].map((v) => (v === undefined ? 'not stated' : v)))
