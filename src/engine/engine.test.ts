import { describe, expect, it } from 'vitest'

import { evaluatePolicy, ipInCidr } from './evaluate'
import { emptyAdaptive, firstFactorSupports, newPolicy, type Policy, type SignInContext } from './model'
import { describeConjunction, summarizePolicy } from './summarize'
import { resolve, weighPolicy } from './weight'
import { apps, groups, ipRanges, locations, policies } from '../data/seed'

const baseCtx: SignInContext = {
  userId: 'priya',
  appId: 'salesforce',
  ip: '10.1.2.3',
  locationId: 'pune',
  locationLabel: 'Pune, IN',
  deviceKnown: true,
  deviceRegistered: true,
  deviceRiskScore: 10,
  isMobile: false,
  timeOfDay: 11 * 60,
  dayOfWeek: 2,
  timestamp: 'now',
}

const ctx = (over: Partial<SignInContext> = {}): SignInContext => ({ ...baseCtx, ...over })

function withAdaptive(over: Partial<ReturnType<typeof emptyAdaptive>>): Policy {
  const p = newPolicy('salesforce', 'finance', 'test')
  p.adaptive = { ...emptyAdaptive(), enabled: true, ...over }
  return p
}

describe('ipInCidr', () => {
  it('matches inside a /8 and rejects outside it', () => {
    expect(ipInCidr('10.255.1.1', '10.0.0.0/8')).toBe(true)
    expect(ipInCidr('11.0.0.1', '10.0.0.0/8')).toBe(false)
  })

  it('matches a /24 boundary correctly', () => {
    expect(ipInCidr('192.168.1.255', '192.168.1.0/24')).toBe(true)
    expect(ipInCidr('192.168.2.0', '192.168.1.0/24')).toBe(false)
  })

  it('treats a bare address as an exact match', () => {
    expect(ipInCidr('8.8.8.8', '8.8.8.8')).toBe(true)
    expect(ipInCidr('8.8.4.4', '8.8.8.8')).toBe(false)
  })
})

describe('conjunction across four blocks', () => {
  const allFour = {
    conjunction: 'all' as const,
    ip: { enabled: true, rangeIds: ['hq'], inlineEntries: [], rangeAction: 'allow' as const },
    device: { ...emptyAdaptive().device, enabled: true, riskThreshold: 50 },
    location: {
      enabled: true,
      entries: [{ locationId: 'pune', distance: 50, unit: 'KMS' as const, action: 'allow' as const }],
    },
    time: { ...emptyAdaptive().time, enabled: true, action: 'allow' as const },
    action: 'challenge' as const,
  }

  it('ALL requires every block to trigger', () => {
    const policy = withAdaptive(allFour)
    // Inside HQ, registered, in Pune, during hours — nothing triggers.
    const t = evaluatePolicy(policy, ctx(), ipRanges, locations)
    expect(t.conditions).toHaveLength(4)
    expect(t.conditionsMet).toBe(false)
    expect(t.outcome).toBe('allow')
  })

  it('ALL fires only when all four trigger together', () => {
    const policy = withAdaptive(allFour)
    const t = evaluatePolicy(
      policy,
      ctx({
        ip: '8.8.8.8',
        locationId: 'london',
        locationLabel: 'London, UK',
        deviceRegistered: false,
        deviceRiskScore: 90,
        timeOfDay: 3 * 60,
        dayOfWeek: 6,
      }),
      ipRanges,
      locations,
    )
    expect(t.conditions.every((c) => c.triggered)).toBe(true)
    expect(t.conditionsMet).toBe(true)
    expect(t.outcome).toBe('challenge')
  })

  it('ANY fires on a single trigger where ALL would not', () => {
    const offNetwork = ctx({ ip: '8.8.8.8' })

    const all = evaluatePolicy(withAdaptive(allFour), offNetwork, ipRanges, locations)
    expect(all.conditionsMet).toBe(false)

    const any = evaluatePolicy(
      withAdaptive({ ...allFour, conjunction: 'any' }),
      offNetwork,
      ipRanges,
      locations,
    )
    expect(any.conditionsMet).toBe(true)
    expect(any.outcome).toBe('challenge')
  })

  it('reports the first unsatisfied condition and only that one', () => {
    // Off-network triggers IP, but device/location/time do not.
    const t = evaluatePolicy(withAdaptive(allFour), ctx({ ip: '8.8.8.8' }), ipRanges, locations)
    expect(t.conditionsMet).toBe(false)
    expect(t.firstUnsatisfied).not.toBeNull()
    expect(t.firstUnsatisfied!.key).toBe('device')
  })

  it('treats an adaptive policy with no enabled blocks as no behaviour to detect', () => {
    const t = evaluatePolicy(withAdaptive({ action: 'deny' }), ctx(), ipRanges, locations)
    expect(t.conditions).toHaveLength(0)
    expect(t.conditionsMet).toBe(false)
    expect(t.outcome).toBe('allow')
  })
})

describe('allowlist vs blocklist semantics', () => {
  it('a matching allow entry is a bypass, not a trigger', () => {
    const p = withAdaptive({
      ip: { enabled: true, rangeIds: ['hq'], inlineEntries: [], rangeAction: 'allow' },
      action: 'deny',
    })
    expect(evaluatePolicy(p, ctx({ ip: '10.9.9.9' }), ipRanges, locations).outcome).toBe('allow')
  })

  it('sitting outside an allowlist triggers the block', () => {
    const p = withAdaptive({
      ip: { enabled: true, rangeIds: ['hq'], inlineEntries: [], rangeAction: 'allow' },
      action: 'deny',
    })
    expect(evaluatePolicy(p, ctx({ ip: '8.8.8.8' }), ipRanges, locations).outcome).toBe('deny')
  })

  it('a blocklist only triggers on a hit', () => {
    const p = withAdaptive({
      ip: { enabled: true, rangeIds: ['blocked'], inlineEntries: [], rangeAction: 'deny' },
      action: 'deny',
    })
    expect(evaluatePolicy(p, ctx({ ip: '8.8.8.8' }), ipRanges, locations).outcome).toBe('allow')
    expect(evaluatePolicy(p, ctx({ ip: '185.220.101.5' }), ipRanges, locations).outcome).toBe('deny')
  })
})

describe('weight-based resolution', () => {
  const g = (id: string) => groups.find((x) => x.id === id)!

  it('ranks a custom group above the DEFAULT group', () => {
    const custom = weighPolicy(policies.find((p) => p.id === 'pol_salesforce_finance')!, g('finance'))
    const dflt = weighPolicy(policies.find((p) => p.id === 'pol_salesforce_default')!, g('default'))
    expect(custom.total).toBeGreaterThan(dflt.total)
  })

  it('resolves a user in three groups to a single winner', () => {
    // Priya is in finance, engineering and default — all three have a
    // Salesforce policy, which is exactly the case the engine's weight
    // algorithm exists to settle.
    const r = resolve(policies, groups, ['finance', 'engineering', 'default'], 'salesforce')
    expect(r.ranked).toHaveLength(3)
    expect(r.winner).not.toBeNull()
    expect(r.winner!.policy.id).toBe('pol_salesforce_finance')
  })

  it('orders strictly descending by weight', () => {
    const r = resolve(policies, groups, ['finance', 'engineering', 'default'], 'salesforce')
    const totals = r.ranked.map((x) => x.weight.total)
    expect([...totals].sort((a, b) => b - a)).toEqual(totals)
  })

  it('excludes inactive policies and never lets a shadow policy win', () => {
    const shadowed = policies.map((p) =>
      p.id === 'pol_salesforce_finance' ? { ...p, status: 'shadow' as const } : p,
    )
    const r = resolve(shadowed, groups, ['finance', 'engineering', 'default'], 'salesforce')
    expect(r.ranked.some((x) => x.policy.status === 'shadow')).toBe(true)
    expect(r.winner!.policy.status).toBe('active')
    expect(r.winner!.policy.id).not.toBe('pol_salesforce_finance')
  })

  it('returns no winner when nothing binds the app to the user’s groups', () => {
    const r = resolve(policies, groups, ['contractors'], 'box')
    expect(r.ranked).toHaveLength(0)
    expect(r.winner).toBeNull()
  })

  it('every weight breakdown sums to its stated total', () => {
    for (const p of policies) {
      const group = groups.find((x) => x.id === p.groupId)!
      const w = weighPolicy(p, group)
      expect(w.factors.reduce((s, f) => s + f.points, 0)).toBe(w.total)
    }
  })
})

describe('first factor constraints', () => {
  it('Magic Link permits neither a second factor nor adaptive, and says why', () => {
    const s = firstFactorSupports('magic-link')
    expect(s.mfa).toBe(false)
    expect(s.adaptive).toBe(false)
    expect(s.reason).toBeTruthy()
  })

  it('Password permits both', () => {
    expect(firstFactorSupports('password')).toEqual({ mfa: true, adaptive: true })
  })

  it('Passwordless permits a second factor but not adaptive', () => {
    const s = firstFactorSupports('passwordless')
    expect(s.mfa).toBe(true)
    expect(s.adaptive).toBe(false)
  })
})

describe('plain-English summary tracks the configured logic', () => {
  // This is the regression guard for the bug in the previous prototype, where
  // a rule joined by OR was rendered back to the admin as AND.
  it('uses "or" for ANY and "and" for ALL', () => {
    expect(describeConjunction({ ...emptyAdaptive(), conjunction: 'any' }).joiner).toBe(' or ')
    expect(describeConjunction({ ...emptyAdaptive(), conjunction: 'all' }).joiner).toBe(' and ')
  })

  it('changes the rendered sentence when only the conjunction changes', () => {
    const app = apps.find((a) => a.id === 'salesforce')!
    const group = groups.find((g) => g.id === 'finance')!
    const p = withAdaptive({
      conjunction: 'all',
      ip: { enabled: true, rangeIds: ['hq'], inlineEntries: [], rangeAction: 'allow' },
      device: { ...emptyAdaptive().device, enabled: true },
      action: 'challenge',
    })
    const withAll = summarizePolicy(p, app, group, ipRanges, locations)
    const withAny = summarizePolicy(
      { ...p, adaptive: { ...p.adaptive, conjunction: 'any' } },
      app,
      group,
      ipRanges,
      locations,
    )

    expect(withAll).toContain(' and ')
    expect(withAny).toContain(' or ')
    expect(withAll).not.toEqual(withAny)
  })

  it('names the outcome it will actually apply', () => {
    const app = apps.find((a) => a.id === 'workday')!
    const group = groups.find((g) => g.id === 'finance')!
    const p = policies.find((x) => x.id === 'pol_workday_finance')!
    expect(summarizePolicy(p, app, group, ipRanges, locations)).toContain('block access')
  })
})

describe('obligations', () => {
  it('a denied outcome offers no alternative path', () => {
    const p = withAdaptive({
      device: { ...emptyAdaptive().device, enabled: true },
      action: 'deny',
    })
    const t = evaluatePolicy(p, ctx({ deviceRegistered: false }), ipRanges, locations)
    expect(t.outcome).toBe('deny')
    expect(t.obligations).toEqual(['Access denied'])
  })

  it('a challenge appends a step after the configured sign-in', () => {
    const p = withAdaptive({
      device: { ...emptyAdaptive().device, enabled: true },
      action: 'challenge',
      challengeType: 'kba',
    })
    p.mfa = { enabled: true, methods: ['miniorange-push'], userManaged: false }
    const t = evaluatePolicy(p, ctx({ deviceRegistered: false }), ipRanges, locations)
    expect(t.obligations[0]).toBe('Enter password')
    expect(t.obligations.at(-1)).toContain('security questions')
  })
})
