import { describe, expect, it } from 'vitest'

import { isPublished, liveConfirmBody, offersLiveView, publishToast, reachesSignIns } from './draft-model'

describe('the Fix draft model', () => {
  it('asks before a save only where people sign in with the policy', () => {
    expect(reachesSignIns({ status: 'active' })).toBe(true)
    expect(reachesSignIns({ status: 'inactive' })).toBe(false)
    expect(reachesSignIns({ status: 'draft' })).toBe(false)
    expect(reachesSignIns(undefined)).toBe(false)
  })

  it('offers Live / Draft on a published policy whose copy differs from live', () => {
    expect(offersLiveView({ status: 'active' }, true)).toBe(true)
    expect(offersLiveView({ status: 'inactive' }, true)).toBe(true)
    expect(offersLiveView({ status: 'active' }, false)).toBe(false)
    expect(offersLiveView({ status: 'draft' }, true)).toBe(false)
    expect(isPublished({ status: 'draft' })).toBe(false)
  })

  it('says who the new rules reach, or that the policy becomes inactive', () => {
    expect(liveConfirmBody(['Salesforce'], false)).toBe('Sign-ins to Salesforce will use these rules at once.')
    expect(liveConfirmBody(['Salesforce', 'Slack', 'Zoom'], false)).toBe('Sign-ins to Salesforce and 2 more will use these rules at once.')
    expect(liveConfirmBody([], true)).toMatch(/becomes inactive/)
    expect(liveConfirmBody([], true)).not.toMatch(/turn/i)
  })

  it('says published, with the status a first publish chose (rollout.ts `versionBar`)', () => {
    expect(publishToast({ status: 'active' }, { name: 'HRMS', status: 'active' })).toBe('HRMS published')
    expect(publishToast({ status: 'draft' }, { name: 'HRMS', status: 'inactive' })).toBe('HRMS published. It is inactive.')
    expect(publishToast({ status: 'draft' }, { name: 'HRMS', status: 'active' })).toBe('HRMS published. It is active.')
    expect(publishToast({ status: 'draft' }, { name: 'HRMS', status: 'monitor' })).toBe('HRMS published. It is monitoring.')
    for (const s of ['active', 'inactive', 'monitor'] as const) expect(publishToast({ status: 'draft' }, { name: 'HRMS', status: s })).not.toMatch(/turn|live/i)
  })
})
