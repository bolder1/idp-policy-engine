import { describe, expect, it, vi } from 'vitest'

/* The wizard's review with the always-on signals locked, as every line has them (rollout.ts `lockedSignals`), so what
   `withAlways` adds can be told apart from what was there anyway. device-profile-wizard.test.ts reads it unlocked. */
vi.mock('./device-profile-phase', () => ({
  AGENT_REACH: true,
  SIGNALS_STEP: true,
  ENROL_OPTIONS: true,
  REGISTRATION_MFA: false,
  LOCKED_SIGNALS: true,
  REVIEW_ALWAYS_ON: true,
}))

import { alwaysOn } from '../fingerprint'
import { initialWizard, liveSections, reviewSections, type ReviewSection, type WizardState } from './device-profile-wizard-model'

const state = (over: Partial<WizardState> = {}): WizardState => ({ ...initialWizard(), ...over })
const signals = (secs: ReviewSection[]) => secs.find((x) => x.step === 'items')?.facts.map((f) => f.label) ?? []

describe('the always-on signals on the Review step (owner, 25 Nov 2026: "here only in step 4")', () => {
  const s = state({ name: 'Fleet', mode: 'device', reach: 'agent', picked: ['mac'] })
  const fixed = new Set(alwaysOn('device').map((a) => a.name))
  const without = signals(reviewSections(s, 'inline'))
  const withFixed = signals(reviewSections(s, 'inline', false, true))

  it('lists the fixed signals with the chosen ones when the Review step asks', () => {
    const added = withFixed.filter((n) => !without.includes(n))
    expect(added.length).toBeGreaterThan(0)
    expect(added.every((n) => fixed.has(n))).toBe(true)
    expect(without.some((n) => fixed.has(n))).toBe(false)
    /* The count says every row the list holds. */
    expect(reviewSections(s, 'inline', false, true).find((x) => x.step === 'items')?.summary).toBe(`${withFixed.length} signals`)
  })

  it('keeps them out of the live preview beside the other steps', () => {
    expect(signals(liveSections(s, 'inline'))).toEqual(without)
  })
})
