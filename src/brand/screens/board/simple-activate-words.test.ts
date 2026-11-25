import { describe, expect, it, vi } from 'vitest'

/* Simple's Activate policy, on the Design line (rollout.ts `simpleActivateWords`): the confirm and the toast name the
   press. The words are read once at load, so the flag is mocked before the module is imported. */
vi.mock('../../rollout', async (original) => ({ ...(await original<typeof import('../../rollout')>()), shows: (change: string) => change === 'simpleActivateWords' }))

const { SAVE_ASK, SAVE_AND_ACTIVATE, simpleSaveToast } = await import('./draft-model')

describe('Simple: Activate policy words (Design)', () => {
  it('asks "Activate this policy?" above the Activate policy button', () => {
    expect(SAVE_ASK).toBe('Activate this policy?')
    expect(SAVE_AND_ACTIVATE).toBe('Activate policy')
  })

  it('says the policy is active, whatever it was before', () => {
    for (const before of ['draft', 'inactive', 'active'] as const) {
      expect(simpleSaveToast({ status: before }, { name: 'Slack access', status: 'active', appIds: ['slack'] })).toBe('Slack access is active')
    }
  })

  it('keeps the no-application toast', () => {
    expect(simpleSaveToast({ status: 'draft' }, { name: 'Slack access', status: 'inactive', appIds: [] })).toBe('Slack access saved. It is inactive until it has an application.')
  })
})
