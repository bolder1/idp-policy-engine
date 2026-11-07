import { describe, expect, it } from 'vitest'
import { POLICY_NAME_MAX } from '../policy-name'
import { showcaseTenant } from '../fixtures'
import { allOn } from '../methods'
import { blockedReason, mergeOffers, planMove, type MoveContext } from './plan'
import { scaleApps, scaleLegacy } from './scale-seed'

const t = showcaseTenant()
const ctx: MoveContext = {
  apps: [...t.apps, ...scaleApps],
  groups: t.groups,
  users: t.directory.people,
  zones: t.zones,
  policies: t.policies,
  methods: allOn(t.methods).map((m) => m.name),
}
const movable = scaleLegacy.policies.filter((lp) => !blockedReason(lp, ctx))
const plan = planMove(movable, scaleLegacy, ctx, mergeOffers(movable).map((o) => o.key))
const policyFor = (appId: string) => plan.policies.find((p) => p.appIds.includes(appId))!

describe('Move policies at scale', () => {
  it('has about a hundred old rows, and refuses the deleted group and application', () => {
    expect(scaleLegacy.policies.length).toBeGreaterThanOrEqual(90)
    const refused = scaleLegacy.policies.filter((lp) => blockedReason(lp, ctx)).map((lp) => [lp.id, blockedReason(lp, ctx)])
    expect(refused).toContainEqual(['lp-gone-group', 'Its group no longer exists'])
    expect(refused).toContainEqual(['lp-gone-app', 'Its application no longer exists'])
  })

  it('offers the ten identical applications as one policy, not 45 pairs', () => {
    const offers = mergeOffers(movable)
    const big = offers.find((o) => o.appIds.includes('m365'))
    expect(big?.appIds).toHaveLength(10)
    expect(policyFor('m365').appIds).toHaveLength(10)
    expect(policyFor('m365').policy.name).toBe('Microsoft 365 and 9 more sign-in')
  })

  it('makes one zone for the contractor network however many rows name it, and "India 2" beside the India zone', () => {
    const names = plan.zones.map((z) => z.name)
    expect(names.filter((n) => n === 'Contractor network')).toHaveLength(1)
    expect(names).toContain('India 2')
  })

  it('keeps the first of two rows for one group and names the second', () => {
    expect(policyFor('notion').leftOut.map((l) => l.before)).toContain('Same group as Notion Sales')
    expect(policyFor('notion').policy.rules.filter((r) => r.name === 'Sales')).toHaveLength(1)
  })

  it('renames old methods, and falls back where the tenant has none', () => {
    const changes = plan.policies.flatMap((p) => p.changes)
    expect(changes.some((c) => c.before === 'RSA MFA' && c.after === 'RSA MFA (SecurID)')).toBe(true)
    expect(changes.some((c) => c.before === 'FIDO2 (Biometric)' && c.after === 'FIDO2 / Passkey')).toBe(true)
    expect(changes.some((c) => c.before === 'Grid Token' && c.after === 'Any enabled method')).toBe(true)
  })

  it('turns a device-count restriction into a Trusted device profile its rule asks for', () => {
    const p = plan.policies.find((x) => x.moves.some((l) => l.name.startsWith('Admin devices')))!
    const fp = plan.profiles.find((f) => f.name.startsWith('Admin devices'))!
    expect(fp.mode).toBe('device')
    expect(JSON.stringify(p.policy.rules)).toContain(fp.id)
  })

  it('joins OR restrictions into cards that need every one to fail', () => {
    const sales = plan.policies.flatMap((p) => p.policy.rules).find((r) => r.name.endsWith('Sales on the road not met'))!
    expect(sales.when.cards.length).toBe(2)
    expect(sales.when.cards.every((k) => k.conditions.length === 2)).toBe(true)
  })

  it('cuts a long application name to fit, at a word', () => {
    const p = policyFor('erp-prod')
    expect(p.policy.name.length).toBeLessThanOrEqual(POLICY_NAME_MAX)
    expect(p.policy.name.endsWith('…')).toBe(true)
  })

  it('traces every new rule back to the old row it came from', () => {
    for (const p of plan.policies) {
      for (const r of p.policy.rules) expect(p.sourceIds).toContain(p.ruleSource[r.id]?.source)
    }
  })
})
