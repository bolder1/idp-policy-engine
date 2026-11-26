import { describe, expect, it, vi } from 'vitest'

/* Simple first (rollout.ts `simpleFirst`; owner, 26 Nov 2026: "the simple will be the version that we are going for now
   on … whenever the policy lands for the first time, make sure the simple version will be activated from the dropdown",
   and Simple while locked too). Switched on for this file alone, with the Draft model changes it stands on. */
vi.mock('../../rollout', async (original) => ({
  ...(await original<typeof import('../../rollout')>()),
  shows: (change: string) => ['draftModels', 'viewEdit', 'simpleDraft', 'simpleFirst'].includes(change),
}))

/* A browser that picked Today before 26 Nov, under the old key, with the builder unlocked. */
const stored = new Map<string, string>([
  ['idp.builder.draft-model', 'today'],
  ['idp.builder.unlocked', '1'],
])
vi.stubGlobal('localStorage', {
  getItem: (k: string) => stored.get(k) ?? null,
  setItem: (k: string, v: string) => void stored.set(k, v),
  removeItem: (k: string) => void stored.delete(k),
})
vi.stubGlobal('window', globalThis)

const { setDraftModel, simpleDraftOn, viewEditOn } = await import('./draft-model')
const { isBuilderUnlocked, lockBuilder } = await import('./builder-version')

describe('Simple first', () => {
  it('lands on Simple, whatever an older pick said', () => {
    expect(isBuilderUnlocked()).toBe(true)
    expect(simpleDraftOn()).toBe(true)
    expect(viewEditOn()).toBe(true)
  })

  it('keeps a pick made after that, under its own key', () => {
    setDraftModel('today')
    expect(simpleDraftOn()).toBe(false)
    expect(viewEditOn()).toBe(false)
    expect(stored.get('idp.builder.draft-model.2')).toBe('today')
  })

  it('is Simple while locked, whatever was picked', () => {
    lockBuilder()
    expect(isBuilderUnlocked()).toBe(false)
    expect(simpleDraftOn()).toBe(true)
    expect(viewEditOn()).toBe(true)
  })
})
