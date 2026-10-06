import { describe, expect, it } from 'vitest'

import { showcaseTenant } from '../../fixtures'
import { envOf, resolveSignIn } from '../tenant-resolver'
import { BLOCKED_MAX, blockedSignIns } from './blocked'

const TODAY = new Date('2026-09-28T09:30:00Z')

describe('blockedSignIns', () => {
  const t = showcaseTenant()
  const env = envOf(t)
  const all = blockedSignIns(t.policies, env, TODAY, t.apps)

  it('lists only sign-ins the tenant refuses, and each one is refused when played again', () => {
    expect(all.length).toBeGreaterThan(0)
    expect(all.length).toBeLessThanOrEqual(BLOCKED_MAX)
    for (const r of all) {
      const res = resolveSignIn(t.policies, r.facts, env)
      expect([res.status, res.decision], r.id).toEqual(['decided', 'deny'])
    }
  })

  it('finds a person by name and nobody by a name that is not there', () => {
    const who = all[0].who
    const found = blockedSignIns(t.policies, env, TODAY, t.apps, who.toUpperCase())
    expect(found.length).toBeGreaterThan(0)
    expect(found.every((r) => r.who === who || `${r.app} ${r.from}`.toLowerCase().includes(who.toLowerCase()))).toBe(true)
    expect(blockedSignIns(t.policies, env, TODAY, t.apps, 'zzz-nobody')).toEqual([])
  })

  it('has unique ids', () => {
    expect(new Set(all.map((r) => r.id)).size).toBe(all.length)
  })
})
