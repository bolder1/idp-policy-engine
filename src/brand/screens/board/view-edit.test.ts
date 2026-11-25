import { describe, expect, it } from 'vitest'

import { blankPolicy, type Policy, type PolicyDraft } from '../../data'
import { openForEditing, withSavedDraft } from '../../policy-draft'
import { detachViewEdit, withAppsViewEdit } from '../app-policies'
import { statusOptions } from '../status-options'
import { draftActivates } from '../use-status-change'
import { draftAppsOf, removeLeavesActiveEmpty } from './draft-model'

/* "View and edit" (rollout.ts `viewEdit`; owner and stakeholders, 24 Nov 2026). The pure rules under the builder,
   the application page and the Policies list. The screens themselves render Today in tests (server render). */

const policy = (over: Partial<Policy> = {}): Policy => ({ ...blankPolicy('Contractor access', ['spare-trello']), status: 'active', ...over })

describe('View and edit: an active policy keeps its application', () => {
  it('refuses to take the only application off an active policy', () => {
    expect(removeLeavesActiveEmpty(policy(), 'spare-trello')).toBe(true)
    expect(detachViewEdit(policy(), 'spare-trello')).toBeNull()
    expect(withAppsViewEdit(policy(), [])).toBeNull()
  })

  it('takes one of two off and keeps the status', () => {
    const two = policy({ appIds: ['spare-trello', 'spare-webex'] })
    expect(removeLeavesActiveEmpty(two, 'spare-trello')).toBe(false)
    expect(detachViewEdit(two, 'spare-trello')).toMatchObject({ appIds: ['spare-webex'], status: 'active' })
  })

  it('turns an inactive policy that loses its last application back into a draft', () => {
    const off = policy({ status: 'inactive', pendingDraft: { rules: [], savedAt: 'Just now', savedBy: 'You' } })
    const after = detachViewEdit(off, 'spare-trello')
    expect(after).toMatchObject({ appIds: [], status: 'draft' })
    expect(after?.pendingDraft).toBeUndefined()
    expect(withAppsViewEdit(off, [])).toMatchObject({ appIds: [], status: 'draft' })
  })
})

describe('View and edit: the draft holds the applications', () => {
  it('saves a draft list beside the live one, and opens on it', () => {
    const live = policy()
    const saved = withSavedDraft(live, { rules: live.rules, fallback: live.fallback, appIds: [] })
    expect(saved.appIds).toEqual(['spare-trello'])
    expect(saved.pendingDraft?.appIds).toEqual([])
    expect(draftAppsOf(saved)).toEqual([])
    expect(openForEditing(saved).appIds).toEqual([])
  })

  it('keeps nothing when the draft matches live, applications included', () => {
    const live = policy()
    expect(withSavedDraft(live, { rules: live.rules, fallback: live.fallback, appIds: ['spare-trello'] }).pendingDraft).toBeUndefined()
  })

  it('holds a published policy’s new name in the draft until a publish', () => {
    const live = policy()
    const saved = withSavedDraft(live, { rules: live.rules, fallback: live.fallback, name: 'Contractors only' })
    expect(saved.name).toBe('Contractor access')
    expect(saved.pendingDraft?.name).toBe('Contractors only')
    expect(openForEditing(saved).name).toBe('Contractors only')
    expect(withSavedDraft(live, { rules: live.rules, fallback: live.fallback, name: 'Contractor access' }).pendingDraft).toBeUndefined()
  })

  it('writes the list into a policy that is still a draft', () => {
    const draft = policy({ status: 'draft', appIds: [] })
    expect(withSavedDraft(draft, { rules: draft.rules, appIds: ['spare-webex'] }).appIds).toEqual(['spare-webex'])
  })
})

describe('View and edit: a saved draft follows applications changed outside it', () => {
  const saved: PolicyDraft = { rules: [], savedAt: 'Just now', savedBy: 'You' }
  it('takes a removed application off the draft list too', () => {
    const p = policy({ appIds: ['spare-trello', 'spare-webex'], pendingDraft: { ...saved, appIds: ['spare-trello', 'spare-webex', 'spare-coupa'] } })
    expect(detachViewEdit(p, 'spare-trello')?.pendingDraft?.appIds).toEqual(['spare-webex', 'spare-coupa'])
  })

  it('drops the draft list once it matches the policy again', () => {
    const p = policy({ appIds: ['spare-trello', 'spare-webex'], pendingDraft: { ...saved, appIds: ['spare-webex'] } })
    expect(detachViewEdit(p, 'spare-trello')?.pendingDraft?.appIds).toBeUndefined()
  })

  it('adds an application assigned outside to the draft list', () => {
    const p = policy({ pendingDraft: { ...saved, appIds: [] } })
    expect(withAppsViewEdit(p, ['spare-trello', 'spare-webex'])?.pendingDraft?.appIds).toEqual(['spare-webex'])
  })
})

describe('View and edit: Make active on a draft', () => {
  it('never publishes a migrated draft that is still in review', () => {
    const moved = policy({ status: 'draft', movedFrom: ['old-1'] } as Partial<Policy>)
    expect(statusOptions(moved, { draftActivates: true })).toEqual([])
    expect(draftActivates(moved, 'active', true)).toBe(false)
  })

  it('is offered for a sign-in draft with an application, and not without one', () => {
    expect(statusOptions({ status: 'draft', isSystem: false, appIds: ['spare-trello'] }, { draftActivates: true }).map((o) => o.target)).toEqual(['active'])
    expect(statusOptions({ status: 'draft', isSystem: false, appIds: [] }, { draftActivates: true })).toEqual([])
    /* Today and Fix: a draft has no switch (the pinned rulings). */
    expect(statusOptions({ status: 'draft', isSystem: false, appIds: ['spare-trello'] })).toEqual([])
  })

  it('publishes through the switch only where the model is on', () => {
    const draft = policy({ status: 'draft' })
    expect(draftActivates(draft, 'active', true)).toBe(true)
    expect(draftActivates(draft, 'active', false)).toBe(false)
    expect(draftActivates({ ...draft, appIds: [] }, 'active', true)).toBe(false)
    expect(draftActivates(draft, 'inactive', true)).toBe(false)
  })
})
