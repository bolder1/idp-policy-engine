import { describe, expect, it } from 'vitest'

import { fallbackRule, type Policy } from '../data'
import { detailsChanges } from './policy-details-review'

const NAMES: Record<string, string> = { salesforce: 'Salesforce', workday: 'Workday', github: 'GitHub' }
const appName = (id: string) => NAMES[id] ?? id

const policy = (over: Partial<Policy> = {}): Policy => ({
  id: 'p1',
  name: 'Payroll — Finance',
  type: 'App Access',
  appIds: ['salesforce', 'workday'],
  audience: { everyone: true, groupIds: [], userIds: [] },
  rules: [],
  fallback: fallbackRule('1fa'),
  status: 'active',
  lastModified: 'Yesterday',
  modifiedBy: 'Admin',
  ...over,
})

describe('detailsChanges', () => {
  it('finds nothing when only whitespace or order changed', () => {
    const saved = policy()
    const c = detailsChanges(saved, { name: ' Payroll — Finance  ', appIds: ['workday', 'salesforce'] }, appName)
    expect(c.changes).toEqual([])
    expect(c.rows).toEqual([])
    expect(c.becomesDraft).toBe(false)
  })

  it('names a rename, trimmed', () => {
    const c = detailsChanges(policy(), { name: ' Payroll — HR ', appIds: ['salesforce', 'workday'] }, appName)
    expect(c.changes).toEqual(['Name'])
    expect(c.rows).toEqual([{ label: 'Name', before: 'Payroll — Finance', after: 'Payroll — HR' }])
  })

  it('lists each application added and removed', () => {
    const c = detailsChanges(policy(), { name: 'Payroll — Finance', appIds: ['salesforce', 'github'] }, appName)
    expect(c.changes).toEqual(['Applications'])
    expect(c.rows).toEqual([
      { label: 'Applications: added GitHub', before: '', after: 'GitHub' },
      { label: 'Applications: removed Workday', before: 'Workday', after: '' },
    ])
  })

  it('says a published policy left with no applications goes back to draft', () => {
    const c = detailsChanges(policy({ status: 'inactive' }), { name: 'Payroll — Finance', appIds: [] }, appName)
    expect(c.becomesDraft).toBe(true)
    expect(c.rows.at(-1)).toEqual({ label: 'Status', before: 'Inactive', after: 'Draft' })
  })

  it('says the saved draft replaces the published rules when the policy goes back to draft', () => {
    const drafted = policy({ pendingDraft: { rules: [], fallback: fallbackRule('2fa'), savedAt: 'Just now', savedBy: 'You' } })
    const c = detailsChanges(drafted, { name: 'Payroll — Finance', appIds: [] }, appName)
    expect(c.takesSavedDraft).toBe(true)
    expect(c.rows.at(-1)).toEqual({ label: 'Rules', before: 'Published rules', after: 'Saved draft' })
    const kept = detailsChanges(drafted, { name: 'Payroll — HR', appIds: ['salesforce'] }, appName)
    expect(kept.takesSavedDraft).toBe(false)
    expect(kept.rows.map((r) => r.label)).toEqual(['Name', 'Applications: removed Workday'])
  })

  it('does not demote a draft, or list the status without a change beside it', () => {
    expect(detailsChanges(policy({ status: 'draft' }), { name: 'Payroll — Finance', appIds: [] }, appName).becomesDraft).toBe(false)
    const untouched = detailsChanges(policy({ appIds: [] }), { name: 'Payroll — Finance', appIds: [] }, appName)
    expect(untouched.rows).toEqual([])
    expect(untouched.changes).toEqual([])
  })

  it('never edits the system policy applications', () => {
    const system = policy({ isSystem: true, appIds: [], status: 'always-on' })
    const c = detailsChanges(system, { name: 'Payroll — Finance', appIds: ['salesforce'] }, appName)
    expect(c.changes).toEqual([])
    expect(c.becomesDraft).toBe(false)
  })
})
