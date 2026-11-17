import { describe, expect, it } from 'vitest'

import {
  blankProfile,
  profileIssue,
  profileReview,
  remediationIssue,
  remediationLabel,
  stepsFor,
  tidyRemediation,
  type Remediation,
} from './fingerprint'
import { wizardSteps } from './screens/device-profile-wizard-model'

const shown = (patch: Partial<Remediation>): Remediation => ({ show: true, grace: 'none', dueDate: '', days: '', ...patch })

describe('device health remediation (V1)', () => {
  it('adds the Remediation step only for health, only at V1', () => {
    expect(stepsFor('os')).toEqual(['Profile', 'Checks'])
    expect(stepsFor('os', true)).toEqual(['Profile', 'Checks', 'Remediation'])
    expect(stepsFor('device', true)).toEqual(['Profile', 'Devices', 'Signals'])
    expect(wizardSteps('os', 'inline', true).map((s) => s.id)).toEqual(['profile', 'items', 'remediation', 'review'])
    expect(wizardSteps('os', 'inline').map((s) => s.id)).toEqual(['profile', 'items', 'review'])
  })

  it('keeps only the answers that apply', () => {
    expect(tidyRemediation(shown({ grace: 'days', days: '14', dueDate: '2026-12-01' }))).toEqual(shown({ grace: 'days', days: '14' }))
    expect(tidyRemediation({ show: false, grace: 'date', dueDate: '2026-12-01', days: '3' })).toEqual({ show: false, grace: 'none', dueDate: '', days: '' })
  })

  it('holds a grace period that has no date or days', () => {
    const p = { mode: 'os' as const }
    expect(remediationIssue({ ...p, remediation: shown({ grace: 'date' }) })).toBe('Select a due date.')
    expect(remediationIssue({ ...p, remediation: shown({ grace: 'days', days: '0' }) })).toBe('Enter the number of days.')
    expect(remediationIssue({ ...p, remediation: shown({ grace: 'days', days: '7' }) })).toBeNull()
    expect(remediationIssue({ ...p, remediation: { show: false, grace: 'date', dueDate: '', days: '' } })).toBeNull()
    expect(remediationIssue({ mode: 'device', remediation: shown({ grace: 'date' }) })).toBeNull()
  })

  it('says it in the review, and says nothing when untouched', () => {
    const before = blankProfile('Laptops', 'os')
    const after = { ...before, remediation: shown({ grace: 'days', days: '14' }) }
    expect(profileReview(before, before)).toEqual([])
    const row = profileReview(before, after).find((r) => r.label === 'Remediation instructions')
    expect(row).toMatchObject({ before: 'Hidden', after: 'Shown, 14 days to fix' })
    expect(remediationLabel(shown({}))).toBe('Shown')
    expect(profileIssue({ ...after, enabled: ['os-windows'], remediation: shown({ grace: 'date' }), name: 'Laptops' }, [])).toBe('Select a due date.')
  })
})
