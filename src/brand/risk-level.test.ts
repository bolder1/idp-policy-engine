import { describe, expect, it } from 'vitest'

import { RISK_LEVELS, riskBand, riskWords } from './risk-level'

/* Device profile's risk level (rollout.ts `profileRisk`; owner, 26 Nov 2026: one level of Low / Medium / High). The bands
   are the thresholds the seeded rules already used: 40 and 70. */
describe('device risk levels', () => {
  it('bands a 0–100 score at 40 and 70', () => {
    expect(riskBand(0)).toBe('low')
    expect(riskBand(39)).toBe('low')
    expect(riskBand(40)).toBe('medium')
    expect(riskBand(69)).toBe('medium')
    expect(riskBand(70)).toBe('high')
    expect(riskBand(100)).toBe('high')
  })

  it('offers three levels, in order, and names each as a risk', () => {
    expect(RISK_LEVELS.map((l) => l.label)).toEqual(['Low', 'Medium', 'High'])
    expect(riskWords('high')).toBe('High risk')
  })
})
