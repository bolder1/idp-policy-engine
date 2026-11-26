import { shows } from './rollout'

/* -----------------------------------------------------------------------------
   Device profile with a risk level (rollout.ts `profileRisk`; owner, 26 Nov 2026: "device profile select, then there
   will be =", "manage the risk score … to high, medium, low. The user can only select device profile and also can select
   its high, medium, low risk score together", then of four options "One level only", and "is" for the operator).

   The condition reads "Device profile is Corporate devices · High risk": the profile, and at most one risk level, which
   the device's 0–100 risk score must fall in. Any (no level) is the profile alone, as every rule written before. The
   bands are the thresholds the seeded rules already used (40 and 70).
   -------------------------------------------------------------------------- */

export type RiskLevel = 'low' | 'medium' | 'high'

export const RISK_LEVELS: readonly { value: RiskLevel; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
]

/** Device profile reads "is" and carries one risk level; Device risk score leaves the menu (rollout `profileRisk`). */
export const PROFILE_RISK: boolean = shows('profileRisk')

/** The band a 0–100 device risk score falls in: Low below 40, Medium 40 to 69, High 70 and up. */
export function riskBand(score: number): RiskLevel {
  if (score >= 70) return 'high'
  if (score >= 40) return 'medium'
  return 'low'
}

/** "High risk", for the summary and the card. */
export const riskWords = (level: RiskLevel): string => `${RISK_LEVELS.find((l) => l.value === level)?.label ?? level} risk`
