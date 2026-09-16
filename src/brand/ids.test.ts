import { describe, expect, it } from 'vitest'

import {
  POLICY_STATUSES,
  apps,
  enforces,
  evaluates,
  lastUpdatedAt,
  nameTaken,
  newId,
  policies,
  slugOf,
  uniqueName,
  type Policy,
  type PolicyStatus,
} from './data'

/* -----------------------------------------------------------------------------
   Ids, copy names and the status set: small helpers that every library screen
   and the store lean on, so a mistake here reaches every list at once.
   -------------------------------------------------------------------------- */

describe('policy statuses', () => {
  const withStatus = (status: PolicyStatus): Policy => ({ ...policies[1], status })

  it('are Draft, Active, Inactive and Always on, and nothing else', () => {
    expect([...POLICY_STATUSES].sort()).toEqual(['active', 'always-on', 'draft', 'inactive'])
  })

  it('enforce only when Active or Always on', () => {
    for (const status of POLICY_STATUSES) {
      expect(enforces(withStatus(status)), status).toBe(status === 'active' || status === 'always-on')
      expect(evaluates(withStatus(status)), status).toBe(enforces(withStatus(status)))
    }
  })

  it('keep the system catch-all enforcing', () => {
    expect(enforces(policies.find((p) => p.isSystem)!)).toBe(true)
  })
})

describe('newId', () => {
  it('uses the name when it is free', () => {
    expect(newId('z', ['z-office'], 'Branch Office')).toBe('z-branch-office')
  })

  it('never returns an id that is taken, even after a delete', () => {
    // Create "Dup" twice, delete the first, create "Dup" again.
    let taken = ['z-a', 'z-b']
    const first = newId('z', taken, 'Dup')
    taken = [...taken, first]
    const second = newId('z', taken, 'Dup')
    taken = [...taken, second]
    taken = taken.filter((id) => id !== 'z-a')
    const third = newId('z', taken, 'Dup')
    expect(new Set([first, second, third]).size).toBe(3)
    expect(taken).not.toContain(third)
  })

  it('falls back to the prefix when the name has no letters or digits', () => {
    expect(newId('rp', [], '— !')).toBe('rp')
    expect(newId('rp', ['rp'], '')).toBe('rp-2')
  })
})

describe('slugOf', () => {
  it('has no leading, trailing or repeated hyphens', () => {
    expect(slugOf('  --Office  Network!! ')).toBe('office-network')
    expect(slugOf('***')).toBe('')
  })
})

describe('uniqueName', () => {
  it('numbers repeat copies instead of repeating the name', () => {
    const taken = ['Payroll — Finance']
    const one = uniqueName('Payroll — Finance', taken)
    const two = uniqueName('Payroll — Finance', [...taken, one])
    expect(one).toBe('Payroll — Finance (copy)')
    expect(two).toBe('Payroll — Finance (copy 2)')
  })

  it('copies a copy as the next number, not "(copy) (copy)"', () => {
    expect(uniqueName('X (copy)', ['X', 'X (copy)'])).toBe('X (copy 2)')
  })

  it('stays within the limit', () => {
    const base = 'A'.repeat(50)
    const taken = [base]
    for (let i = 0; i < 12; i += 1) {
      const next = uniqueName(base, taken, 50)
      expect(next.length, next).toBeLessThanOrEqual(50)
      expect(nameTaken(next, taken)).toBe(false)
      taken.push(next)
    }
  })
})

describe('nameTaken', () => {
  it('ignores case and surrounding spaces, and never matches an empty name', () => {
    expect(nameTaken('  office network ', ['Office Network'])).toBe(true)
    expect(nameTaken('Office', ['Office Network'])).toBe(false)
    expect(nameTaken('   ', ['   '])).toBe(false)
  })
})

describe('lastUpdatedAt', () => {
  it('reads every seeded app', () => {
    for (const a of apps) expect(lastUpdatedAt(a), `${a.name}: ${a.lastUpdated}`).toBeGreaterThan(0)
  })

  it('orders by date, not by position in the list', () => {
    const aug14 = lastUpdatedAt({ lastUpdated: 'Aug 14, 2026, 14:25:51' })
    const aug02 = lastUpdatedAt({ lastUpdated: 'Aug 02, 2026, 09:11:04' })
    const jun09 = lastUpdatedAt({ lastUpdated: 'Jun 09, 2026, 08:52:19' })
    expect(aug14).toBeGreaterThan(aug02)
    expect(aug02).toBeGreaterThan(jun09)
  })

  it('sorts anything it cannot read first', () => {
    expect(lastUpdatedAt({ lastUpdated: '' })).toBe(0)
    expect(lastUpdatedAt({ lastUpdated: 'yesterday' })).toBe(0)
  })
})
