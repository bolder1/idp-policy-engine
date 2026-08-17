/* ---------------------------------------------------------------------------
   Multi-policy resolution — "why this policy won".

   miniOrange's docs state the rule but not the arithmetic:

     "a weight-based algorithm finds the policy with the highest score for the
      login session. Policies with custom groups are given priority over
      policies with the DEFAULT group."

   So the *shape* is documented and the *coefficients* are not. This module
   implements a transparent scoring model with the documented priority rule as
   its dominant term, and — more importantly — returns the full breakdown rather
   than a bare number. Surfacing the breakdown is the point: today an admin
   cannot see why one policy beat another at all, which is the single biggest
   usability liability in the engine.

   Every surface that renders a score labels it as the console's reconstruction,
   not as a value returned by the engine.
   --------------------------------------------------------------------------- */

import {
  type Group,
  type Policy,
  RESTRICTION_LABEL,
  enabledRestrictions,
} from './model'

export interface WeightFactor {
  label: string
  points: number
  detail: string
}

export interface WeightBreakdown {
  policyId: string
  total: number
  factors: WeightFactor[]
}

/** Dominant term: the documented custom-group-beats-DEFAULT rule. */
const CUSTOM_GROUP_POINTS = 100
/** Each configured restriction block makes a policy more specific. */
const PER_RESTRICTION_POINTS = 10
/** Concrete entries are more specific than an empty block. */
const PER_ENTRY_POINTS = 2
/** A smaller audience is a more deliberate target. */
const MAX_NARROWNESS_POINTS = 8

export function weighPolicy(policy: Policy, group: Group): WeightBreakdown {
  const factors: WeightFactor[] = []

  if (group.isDefault) {
    factors.push({
      label: 'DEFAULT group',
      points: 0,
      detail: 'Policies on the DEFAULT group rank below every custom group.',
    })
  } else {
    factors.push({
      label: 'Custom group',
      points: CUSTOM_GROUP_POINTS,
      detail: `Targets ${group.name} rather than the DEFAULT group.`,
    })
  }

  const keys = policy.adaptive.enabled ? enabledRestrictions(policy.adaptive) : []
  if (keys.length > 0) {
    factors.push({
      label: `${keys.length} condition${keys.length === 1 ? '' : 's'}`,
      points: keys.length * PER_RESTRICTION_POINTS,
      detail: keys.map((k) => RESTRICTION_LABEL[k]).join(', '),
    })
  }

  const entryCount = countEntries(policy)
  if (entryCount > 0) {
    factors.push({
      label: `${entryCount} configured ${entryCount === 1 ? 'entry' : 'entries'}`,
      points: entryCount * PER_ENTRY_POINTS,
      detail: 'Named ranges, locations and inline values narrow the match.',
    })
  }

  // Narrowness: smaller groups score higher, bounded so it can never outweigh
  // the documented custom-vs-DEFAULT rule.
  if (!group.isDefault && group.memberCount > 0) {
    const points = Math.max(
      1,
      Math.round(MAX_NARROWNESS_POINTS - Math.log10(group.memberCount) * 2),
    )
    factors.push({
      label: 'Audience size',
      points,
      detail: `${group.memberCount} members — narrower groups rank higher.`,
    })
  }

  return {
    policyId: policy.id,
    total: factors.reduce((sum, f) => sum + f.points, 0),
    factors,
  }
}

function countEntries(policy: Policy): number {
  const a = policy.adaptive
  if (!a.enabled) return 0
  let n = 0
  if (a.ip.enabled) n += a.ip.rangeIds.length + a.ip.inlineEntries.length
  if (a.location.enabled) n += a.location.entries.length
  if (a.time.enabled) n += 1
  if (a.device.enabled) n += 1
  return n
}

export interface Resolution {
  /** Highest weight first. */
  ranked: { policy: Policy; group: Group; weight: WeightBreakdown }[]
  winner: { policy: Policy; group: Group; weight: WeightBreakdown } | null
  /** Set when two policies tie and the DEFAULT-group rule broke the tie. */
  tiebreak: string | null
}

/**
 * All policies that bind `appId` to any group the user belongs to, ranked.
 * Inactive policies are excluded; shadow policies are included but never win,
 * mirroring what a monitor mode would do.
 */
export function resolve(
  policies: Policy[],
  groups: Group[],
  userGroupIds: string[],
  appId: string,
): Resolution {
  const matching = policies
    .filter((p) => p.appId === appId && userGroupIds.includes(p.groupId))
    .filter((p) => p.status !== 'inactive')
    .map((policy) => {
      const group = groups.find((g) => g.id === policy.groupId)!
      return { policy, group, weight: weighPolicy(policy, group) }
    })

  const ranked = [...matching].sort((a, b) => {
    if (b.weight.total !== a.weight.total) return b.weight.total - a.weight.total
    // Documented rule applied explicitly as the tiebreak.
    if (a.group.isDefault !== b.group.isDefault) return a.group.isDefault ? 1 : -1
    return a.group.memberCount - b.group.memberCount
  })

  const enforcing = ranked.filter((r) => r.policy.status === 'active')
  const winner = enforcing[0] ?? null

  let tiebreak: string | null = null
  if (ranked.length > 1 && ranked[0].weight.total === ranked[1].weight.total) {
    tiebreak = ranked[1].group.isDefault
      ? `Equal weight — ${ranked[0].group.name} wins because policies on custom groups outrank the DEFAULT group.`
      : `Equal weight — ${ranked[0].group.name} wins because it is the narrower audience.`
  }

  return { ranked, winner, tiebreak }
}
