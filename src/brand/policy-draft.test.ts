import { describe, expect, it } from 'vitest'

import { blankRule, fallbackRule, type Policy } from './data'
import {
  asStored,
  changedBeyondStamp,
  committed,
  differsFromLive,
  hasUnsavedChanges,
  lastSaved,
  openForEditing,
  published,
  turnOnBlocker,
  withSavedDraft,
} from './policy-draft'

const live = (status: Policy['status'] = 'active'): Policy => ({
  id: 'p1',
  name: 'Finance',
  type: 'App Access',
  appIds: ['a1'],
  audience: { everyone: true, groupIds: [], userIds: [] },
  rules: [blankRule('Live rule')],
  fallback: fallbackRule('1fa'),
  status,
  lastModified: 'Yesterday',
  modifiedBy: 'Admin',
})

describe('draft mode', () => {
  it('keeps edits to a published policy beside the live rules, not over them', () => {
    const p = live('active')
    const edit = { rules: [blankRule('Edited rule')], fallback: p.fallback }
    const saved = withSavedDraft(p, edit)
    expect(saved.rules).toBe(p.rules)
    expect(saved.pendingDraft?.rules).toBe(edit.rules)
    expect(saved.status).toBe('active')
  })

  it('writes straight into a policy that is still a draft', () => {
    const p = live('draft')
    const edit = { rules: [blankRule('Edited rule')], fallback: p.fallback }
    const saved = withSavedDraft(p, edit)
    expect(saved.rules).toBe(edit.rules)
    expect(saved.pendingDraft).toBeUndefined()
    expect(saved.status).toBe('draft')
  })

  it('reopens on the saved draft, and measures unsaved changes against it', () => {
    const p = withSavedDraft(live(), { rules: [blankRule('Edited rule')], fallback: fallbackRule('1fa') })
    const opened = openForEditing(p)
    expect(opened.rules).toBe(p.pendingDraft!.rules)
    expect(hasUnsavedChanges(p, opened)).toBe(false)
    expect(differsFromLive(p, opened)).toBe(true)
    expect(lastSaved(p).rules).toBe(p.pendingDraft!.rules)
  })

  it('drops a draft saved identical to what is live', () => {
    const p = live()
    expect(withSavedDraft(p, { rules: p.rules, fallback: p.fallback }).pendingDraft).toBeUndefined()
  })

  it('ends the draft on publish', () => {
    const p = withSavedDraft(live(), { rules: [blankRule('Edited rule')], fallback: fallbackRule('1fa') })
    expect(published(openForEditing(p)).pendingDraft).toBeUndefined()
  })
})

describe('committing a policy', () => {
  const draftPolicy = (): Policy => ({ ...live('draft'), status: 'draft' })

  it('keeps a policy with no applications as a draft, whatever was asked', () => {
    const p = { ...draftPolicy(), appIds: [] }
    expect(committed(p, p, 'turn-on').status).toBe('draft')
    const active = { ...live('active'), appIds: [] }
    expect(committed(active, active).status).toBe('draft')
  })

  it('publishes a draft switched off unless asked to turn it on', () => {
    const p = draftPolicy()
    expect(committed(p, p).status).toBe('inactive')
    expect(committed(p, p, 'turn-on').status).toBe('active')
  })

  it('keeps the saved status of a published policy, not the builder copy', () => {
    const saved = live('inactive')
    const staleDraft = { ...saved, status: 'active' as const }
    expect(committed(saved, staleDraft).status).toBe('inactive')
  })

  it('clears a saved draft on commit', () => {
    const saved = withSavedDraft(live(), { rules: [blankRule('Edited rule')], fallback: fallbackRule('1fa') })
    expect(committed(saved, openForEditing(saved)).pendingDraft).toBeUndefined()
  })

  it('says why a policy cannot be turned on', () => {
    expect(turnOnBlocker(live('draft'), 0)).toMatch(/draft/)
    expect(turnOnBlocker({ ...live('inactive'), appIds: [] }, 0)).toMatch(/application/)
    expect(turnOnBlocker(live('inactive'), 2)).toMatch(/2 errors/)
    const withDraft = withSavedDraft(live('inactive'), { rules: [blankRule('Edited rule')], fallback: fallbackRule('1fa') })
    expect(turnOnBlocker(withDraft, 1)).toBe('Fix the error in its live rules first.')
    expect(turnOnBlocker(live('inactive'), 0)).toBeNull()
    expect(turnOnBlocker({ ...live('always-on'), appIds: [], isSystem: true }, 0)).toBeNull()
  })

  it('ignores the audit stamp when asking whether anything changed', () => {
    const p = live()
    expect(changedBeyondStamp(p, { ...p, lastModified: 'Just now', modifiedBy: 'You' })).toBe(false)
    expect(changedBeyondStamp(p, { ...p, name: 'Other' })).toBe(true)
  })

  it('folds a saved draft into a policy that became a draft', () => {
    const p = withSavedDraft(live(), { rules: [blankRule('Edited rule')], fallback: fallbackRule('deny') })
    const demoted = asStored({ ...p, status: 'draft', appIds: [] })
    expect(demoted.pendingDraft).toBeUndefined()
    expect(demoted.rules[0].name).toBe('Edited rule')
    expect(asStored(p)).toBe(p)
  })
})
