import { describe, expect, it } from 'vitest'

import {
  blankProfile,
  profileChangeParts,
  profileReview,
  seedProfiles,
  withReach,
  type FingerprintProfile,
} from '../fingerprint'
import { draftOf, initialWizard } from './device-profile-wizard-model'
import { basicDetailsSet, basicSetupIssue } from './device-profile-basic'

const seed = (id: string) => seedProfiles.find((p) => p.id === id) as FingerprintProfile
const kiosk = seed('fp-kiosk')
const unmanaged = seed('fp-unmanaged')

/* Whether basic details have been answered — the flag the Basic details tab
   sets with its first answer (16 Sep 2026). */
describe('whether basic details are set up', () => {
  it('reads the answered flag, not the values', () => {
    expect(basicDetailsSet(kiosk)).toBe(true)
    /* On every default, and still not set up: nobody chose them. */
    expect(basicDetailsSet(unmanaged)).toBe(false)
    expect(basicDetailsSet({ ...unmanaged, restrictionSet: true })).toBe(true)
  })

  it('is not set up on a profile straight out of the name dialog', () => {
    expect(basicDetailsSet(blankProfile('Laptops', 'device'))).toBe(false)
  })

  it('is set up on a trusted device the wizard made, because its Devices step asked', () => {
    expect(basicDetailsSet(draftOf({ ...initialWizard(), name: 'Laptops', mode: 'device', reach: 'agent' }))).toBe(true)
  })
})

/* Unfinished means draft: a new trusted device waits for an answer on the Basic details tab. */
describe('creating a profile whose basic details are not set up', () => {
  const fresh = blankProfile('Laptops', 'device')

  it('blocks a new trusted device until basic details are answered, even on every default', () => {
    expect(basicSetupIssue(fresh, true)).toBe('Set up basic details.')
    expect(basicSetupIssue({ ...fresh, restrictionSet: true }, true)).toBeNull()
  })

  it('does not block saving a stored profile nobody set up, or a health profile', () => {
    expect(basicSetupIssue(unmanaged, false)).toBeNull()
    expect(basicSetupIssue(blankProfile('Laptops', 'os'), true)).toBeNull()
  })
})

/* Apply on the defaults changes no value and must still reach the footer. */
describe('setting up basic details, as a change', () => {
  it('is a review row and a footer part of its own', () => {
    const applied = { ...unmanaged, restrictionSet: true }
    expect(profileReview(unmanaged, applied)).toEqual([
      { label: 'Basic details', before: 'Not set up', after: 'Set up', group: 'Basic details', kind: 'changed' },
    ])
    expect(profileChangeParts(unmanaged, applied)).toEqual(['Basic details'])
  })

  it('is not named in the footer beside the parts it covers', () => {
    const applied = { ...withReach(unmanaged, 'agent'), restrictionSet: true }
    expect(profileChangeParts(unmanaged, applied)).toEqual(['Device restriction type'])
    expect(profileReview(unmanaged, applied).map((r) => r.label)).toEqual(['Basic details', 'Device restriction type'])
  })

  /* Review changes files every setup answer under Basic details, and an answer
     going from none to a number is a setting that changed, not an addition. */
  it('files every setup answer under Basic details as a change', () => {
    const applied = {
      ...unmanaged,
      restrictionSet: true,
      maxDevices: null,
      autoRegister: !unmanaged.autoRegister,
      restrictMobile: !unmanaged.restrictMobile,
    }
    const rows = profileReview(unmanaged, applied)
    expect(rows.map((r) => r.label)).toEqual([
      'Basic details',
      'Allowed device registrations',
      'Mobile device restriction',
      'Device auto-registration',
    ])
    for (const r of rows) expect(r).toMatchObject({ group: 'Basic details', kind: 'changed' })
    expect(rows.every((r) => r.item === undefined && r.effect === undefined)).toBe(true)
    expect(profileReview(applied, unmanaged).find((r) => r.label === 'Allowed device registrations')).toMatchObject({
      before: '',
      kind: 'changed',
    })
  })

  it('is not a change on a health profile, which has no basic details to set up', () => {
    const os = seed('fp-corp')
    expect(profileReview({ ...os, restrictionSet: false }, os)).toEqual([])
    expect(profileChangeParts({ ...os, restrictionSet: false }, os)).toEqual([])
  })
})
