import { describe, expect, it } from 'vitest'

import { showcaseTenant, tenantAt } from '../../fixtures'
import { initialSession, sessionReducer, type TestingSessionState } from './session-state'
import { defaultBoardForm, defaultForm, typedAddressPatch } from './sign-in-form'

const t = showcaseTenant()
const TODAY = '2026-09-28'
const start = (): TestingSessionState => initialSession(defaultForm(t.directory.people, t.apps, TODAY))
const hrmsBase = defaultBoardForm(t.policies.find((p) => p.id === 'sc-hrms-office')!, t.directory.people, t.apps, TODAY)

describe('the testing session', () => {
  it('opens on Try, with the first open counted as a run', () => {
    const s = start()
    expect([s.view, s.runId, s.lastEdited]).toEqual(['try', 1, null])
    expect(s.breakIn).toEqual({ policyId: null, open: false })
    expect(s.boardForms).toEqual({})
  })

  it('never plays a run while somebody types', () => {
    /* The marker travels on a run; a patch is typing, so it updates in place. */
    const s = sessionReducer(start(), { type: 'patch', patch: typedAddressPatch('192.0.2.10'), field: 'address' })
    expect(s.form.address).toBe('192.0.2.10')
    expect([s.runId, s.lastEdited]).toEqual([1, 'address'])
  })

  it('plays a run on load and on replay, and forgets what changed on load', () => {
    const typed = sessionReducer(start(), { type: 'patch', patch: { risk: '48' }, field: 'risk' })
    const loaded = sessionReducer(typed, { type: 'load', form: start().form })
    expect([loaded.runId, loaded.lastEdited, loaded.form.risk]).toEqual([2, null, ''])
    expect(sessionReducer(loaded, { type: 'replay' }).runId).toBe(3)
  })

  it('keeps one board form per policy, starting from its default', () => {
    let s = sessionReducer(start(), { type: 'patch-board', policyId: 'sc-hrms-office', base: hrmsBase, patch: { risk: '48' }, field: 'risk' })
    expect(s.boardForms['sc-hrms-office']).toEqual({ ...hrmsBase, risk: '48' })
    /* The base only counts the first time: the second patch builds on the first. */
    s = sessionReducer(s, { type: 'patch-board', policyId: 'sc-hrms-office', base: hrmsBase, patch: { time: '19:20' }, field: 'when' })
    expect(s.boardForms['sc-hrms-office']).toMatchObject({ risk: '48', time: '19:20' })
    /* The page's own form is not the board's. */
    expect(s.form).toEqual(start().form)
    expect(s.lastEdited).toBe('when')
  })

  it('loads a whole sign-in into one policy’s board form, forgetting what changed it', () => {
    const typed = sessionReducer(start(), { type: 'patch-board', policyId: 'sc-hrms-office', base: hrmsBase, patch: { risk: '48' }, field: 'risk' })
    const saved = { ...hrmsBase, personId: 'u-sales-1', address: '192.0.2.10' }
    const s = sessionReducer(typed, { type: 'load-board', policyId: 'sc-hrms-office', form: saved })
    expect(s.boardForms['sc-hrms-office']).toEqual(saved)
    expect(s.lastEdited).toBeNull()
    /* The board plays its own run; the page's run and form are untouched. */
    expect([s.runId, s.form]).toEqual([typed.runId, typed.form])
  })

  it('moves between views without touching the sign-in', () => {
    const s = sessionReducer(start(), { type: 'view', view: 'saved' })
    expect(s.view).toBe('saved')
    expect(s.form).toEqual(start().form)
    expect(sessionReducer(s, { type: 'view', view: 'saved' })).toBe(s)
  })

  it('opens and closes the Break-in test on a policy', () => {
    const open = sessionReducer(start(), { type: 'open-break-in', policyId: 'sc-hrms-office' })
    expect(open.breakIn).toEqual({ policyId: 'sc-hrms-office', open: true })
    const closed = sessionReducer(open, { type: 'close-break-in' })
    /* Closing keeps the policy, so opening again lands on the same one. */
    expect(closed.breakIn).toEqual({ policyId: 'sc-hrms-office', open: false })
    expect(sessionReducer(closed, { type: 'close-break-in' })).toBe(closed)
  })

  it('starts again for another tenant, forgetting every board form and the view', () => {
    let s = sessionReducer(start(), { type: 'patch-board', policyId: 'sc-hrms-office', base: hrmsBase, patch: { risk: '48' }, field: 'risk' })
    s = sessionReducer(s, { type: 'view', view: 'saved' })
    s = sessionReducer(s, { type: 'open-break-in', policyId: 'sc-hrms-office' })
    const legacy = tenantAt('medium')
    const fresh = defaultForm(legacy.directory.people, legacy.apps, TODAY)
    expect(sessionReducer(s, { type: 'reset', form: fresh })).toEqual(initialSession(fresh))
  })
})
