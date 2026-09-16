import { describe, expect, it } from 'vitest'

import { RISK_SCORE, SIM_USERS, evalRule, type SimContext, type SimEnv } from './screens/simulate'
import { blankRule, card, cond, when } from './data'
import {
  CATEGORY_TONE,
  EMPTY_RISK_PROFILE,
  PLATFORMS,
  RISK_SIGNALS,
  SIGNAL_CATEGORIES,
  blankRiskProfile,
  weightFor,
  shippedWeightFor,
  countOn,
  isOn,
  riskChangeNames,
  riskProfileNameProblem,
  riskProfileProblem,
  riskReviewRows,
  riskScale,
  sameRiskProfile,
  sameTuning,
  setSignalOn,
  setSignalTier,
  tierFor,
  tierKey,
  type RiskTuning,
} from './risk-signals'

/* -----------------------------------------------------------------------------
   The risk signal profile owns the only numeric seam in risk evaluation, so
   the property that matters most is the one about NOT moving: a tenant who has
   never opened the screen must grade exactly as they did before it existed.
   -------------------------------------------------------------------------- */

const profile = (over: Partial<RiskTuning> = {}): RiskTuning => ({ ...EMPTY_RISK_PROFILE, ...over })

describe('the shipped configuration', () => {
  /* The whole migration argument in one assertion. `RISK_SCORE` was a constant
     in simulate.ts and is now derived; if these disagree, every seeded policy
     silently re-grades on the release that added a settings screen nobody
     touched. */
  it('reproduces the constant it replaced, exactly', () => {
    expect(riskScale(EMPTY_RISK_PROFILE)).toEqual(RISK_SCORE)
  })

  it('starts with every signal on', () => {
    expect(countOn(EMPTY_RISK_PROFILE)).toBe(RISK_SIGNALS.length)
    expect(RISK_SIGNALS.every((s) => isOn(EMPTY_RISK_PROFILE, s.id))).toBe(true)
  })

  it('weighs exactly what the catalogue ships, on both platforms', () => {
    for (const p of PLATFORMS) expect(weightFor(EMPTY_RISK_PROFILE, p.id)).toBe(shippedWeightFor(p.id))
  })

  /* Stored as the difference from the catalogue, so a signal added later
     arrives on at its shipped weight rather than invisible behind a snapshot. */
  it('reads a signal the profile has never heard of at its catalogue tier', () => {
    const s = RISK_SIGNALS[0]
    expect(tierFor(EMPTY_RISK_PROFILE, s, s.on[0])).toBe(s.tier)
  })
})

describe('switching signals off lowers what a sign-in can score', () => {
  it('drops the band the rules compare against', () => {
    const strict = riskScale(EMPTY_RISK_PROFILE)
    const relaxed = riskScale(profile({ off: RISK_SIGNALS.filter((s) => s.tier === 'High').map((s) => s.id) }))
    expect(relaxed.High).toBeLessThan(strict.High)
    expect(relaxed.Medium).toBeLessThan(strict.Medium)
  })

  it('bottoms out at zero rather than going negative', () => {
    const none = riskScale(profile({ off: RISK_SIGNALS.map((s) => s.id) }))
    expect(none).toEqual({ Low: 0, Medium: 0, High: 0 })
  })
})

describe('the scale is the weaker of the two platforms', () => {
  /* A rule cannot ask which mobile OS somebody is on, so the score it relies on
     has to be the one both platforms can reach. Weakening ONE platform must
     therefore move the scale, or a rule would be trusting a number that half
     the estate cannot produce. */
  it('follows the platform that can reach least', () => {
    /* Weaken iOS only. Android is untouched and still weighs everything, so a
       scale that averaged, or that read one platform, would not move at all. */
    const iosOnly = RISK_SIGNALS.filter((s) => s.on.includes('ios') && !s.on.includes('android'))
    expect(iosOnly.length).toBeGreaterThan(0)
    const p = profile({ off: iosOnly.map((s) => s.id) })
    expect(weightFor(p, 'android')).toBe(shippedWeightFor('android'))
    expect(weightFor(p, 'ios')).toBeLessThan(shippedWeightFor('ios'))
    const ratio = weightFor(p, 'ios') / shippedWeightFor('ios')
    expect(riskScale(p).High).toBe(Math.round(86 * ratio))
  })

  it('rises when a signal is weighted up, and stops at the top of the scale', () => {
    const allHigh: Record<string, 'High'> = {}
    for (const s of RISK_SIGNALS) for (const pl of s.on) allHigh[tierKey(s.id, pl)] = 'High'
    const scale = riskScale(profile({ tiers: allHigh }))
    expect(scale.High).toBeGreaterThanOrEqual(86)
    expect(scale.High).toBeLessThanOrEqual(100)
    expect(scale.Low).toBeGreaterThan(12)
  })
})

describe('the catalogue', () => {
  it('gives every signal at least one platform that can collect it', () => {
    for (const s of RISK_SIGNALS) expect(s.on.length).toBeGreaterThan(0)
  })

  it('has no duplicate ids', () => {
    expect(new Set(RISK_SIGNALS.map((s) => s.id)).size).toBe(RISK_SIGNALS.length)
  })

  /* An override is keyed by signal AND platform, so the same signal can be
     worth more on the platform that reports it more reliably. */
  it('keeps per-platform overrides independent', () => {
    const s = RISK_SIGNALS.find((x) => x.on.length === 2)!
    const p = profile({ tiers: { [tierKey(s.id, 'android')]: 'Low' } })
    expect(tierFor(p, s, 'android')).toBe('Low')
    expect(tierFor(p, s, 'ios')).toBe(s.tier)
  })
})

/* -----------------------------------------------------------------------------
   The connection, asserted rather than claimed.

   Everything above is arithmetic on a profile. This is the part that makes the
   screen a setting rather than a decoration: the same rule, the same sign-in,
   two different tenant profiles, two different answers.
   -------------------------------------------------------------------------- */
describe('the profile decides what a rule catches', () => {
  const env = (profile: RiskTuning): SimEnv => ({
    zoneName: (id) => id,
    fingerprintName: (id) => id,
    groupName: (id) => id,
    riskScale: riskScale(profile),
  })

  const ctx: SimContext = {
    user: SIM_USERS[0],
    place: 'Office Network',
    device: 'Known < 90 days',
    authState: 'Normal returning user',
    risk: 'High',
    nowMinutes: 570,
  }

  /* "Risk score above 60", against a High-risk sign-in. Under the
     shipped scale High is 86, so it fires. */
  const rule = { when: when(card(cond('device-risk', 'above', ['60']))) }

  it('fires on the shipped weighting', () => {
    const r = evalRule({ ...blankRule(), ...rule }, ctx, env(EMPTY_RISK_PROFILE))
    expect(r.match).toBe(true)
  })

  it('stops firing once the tenant says those signals do not matter', () => {
    /* Switch off instrumentation — hooking, debugger, tampered request,
       intercepted connection. High falls below the rule's threshold, so the
       same sign-in is no longer caught. That is the consequence of the choice,
       and it is why the weighting had to own RISK_SCORE rather than sit beside
       it. */
    const quiet: RiskTuning = {
      off: RISK_SIGNALS.filter((s) => s.category === 'Instrumentation').map((s) => s.id),
      tiers: {},
    }
    expect(riskScale(quiet).High).toBeLessThan(60)
    const r = evalRule({ ...blankRule(), ...rule }, ctx, env(quiet))
    expect(r.match).toBe(false)
  })
})

describe('category tones', () => {
  it('gives every category its own tone, and none of them red', () => {
    const tones = SIGNAL_CATEGORIES.map((c) => CATEGORY_TONE[c])
    expect(tones.every(Boolean)).toBe(true)
    expect(new Set(tones).size).toBe(SIGNAL_CATEGORIES.length)
    expect(tones).not.toContain('negative')
  })
})

describe('editing a profile draft', () => {
  const saved = { ...blankRiskProfile('Remote workforce', 'rp-remote'), off: ['vpn', 'emulator'] }
  const dual = RISK_SIGNALS.find((s) => s.on.length === 2)!

  it('keeps switched-off signals in catalogue order', () => {
    const t = setSignalOn(setSignalOn(EMPTY_RISK_PROFILE, 'vpn', false), 'emulator', false)
    expect(t.off).toEqual(['emulator', 'vpn'])
  })

  it('treats a signal switched off and on again as no change', () => {
    const draft = setSignalOn(setSignalOn(saved, 'emulator', true), 'emulator', false)
    expect(sameRiskProfile(draft, saved)).toBe(true)
    expect(riskChangeNames(saved, draft)).toEqual([])
  })

  it('drops a weight set back to its shipped value', () => {
    const other = dual.tier === 'High' ? 'Low' : 'High'
    const moved = setSignalTier(EMPTY_RISK_PROFILE, dual, 'android', other)
    expect(moved.tiers).toEqual({ [tierKey(dual.id, 'android')]: other })
    const back = setSignalTier(moved, dual, 'android', dual.tier)
    expect(back.tiers).toEqual({})
    expect(sameTuning(back, EMPTY_RISK_PROFILE)).toBe(true)
  })

  it('reads an override equal to the shipped weight as no override', () => {
    expect(sameTuning({ off: [], tiers: { [tierKey(dual.id, 'ios')]: dual.tier } }, EMPTY_RISK_PROFILE)).toBe(true)
  })

  it('compares names trimmed, the way they are saved', () => {
    expect(sameRiskProfile({ ...saved, name: '  Remote workforce ' }, saved)).toBe(true)
  })
})

describe('what blocks a save', () => {
  const base = blankRiskProfile('Test', 'rp-test')

  it('needs a name', () => {
    expect(riskProfileProblem({ ...base, name: '   ' }, [])).toBe('Enter a profile name.')
    expect(riskProfileNameProblem('', [])).toBe('Enter a profile name.')
  })

  it('refuses a name another profile has, ignoring case and spaces', () => {
    expect(riskProfileProblem({ ...base, name: ' shipped WEIGHTING ' }, ['Shipped weighting'])).toBe(
      'A risk profile with this name already exists.',
    )
    expect(riskProfileNameProblem('Shipped weighting', ['Shipped weighting'])).not.toBeNull()
    expect(riskProfileProblem(base, ['Shipped weighting'])).toBeNull()
  })

  it('refuses a profile that scores every band 0', () => {
    const iosSignals = RISK_SIGNALS.filter((s) => s.on.includes('ios')).map((s) => s.id)
    const p = { ...base, off: iosSignals }
    expect(riskScale(p).High).toBe(0)
    expect(riskProfileProblem(p, [])).toBe('Turn on at least one signal on each platform.')
  })
})

describe('the review of a draft', () => {
  const saved = blankRiskProfile('Test', 'rp-test')
  const dual = RISK_SIGNALS.find((s) => s.on.length === 2)!

  it('names each change with its saved and new value', () => {
    let draft = { ...saved, name: 'Quiet network' }
    draft = setSignalOn(draft, 'tor', false)
    draft = setSignalTier(draft, dual, 'ios', dual.tier === 'Low' ? 'High' : 'Low')
    const rows = riskReviewRows(saved, draft)
    expect(rows[0]).toEqual({ label: 'Name', before: 'Test', after: 'Quiet network' })
    expect(rows).toContainEqual({ label: 'Signal: Tor exit node', before: 'On', after: 'Off' })
    expect(rows).toContainEqual({
      label: `Weight: ${dual.name} on iOS`,
      before: dual.tier,
      after: dual.tier === 'Low' ? 'High' : 'Low',
    })
    expect(rows.some((r) => r.label === 'High risk score')).toBe(true)
    expect(riskChangeNames(saved, draft)).toEqual(['Name', 'Signals', 'Weights'])
  })

  it('is empty when nothing changed', () => {
    expect(riskReviewRows(saved, { ...saved })).toEqual([])
  })
})
