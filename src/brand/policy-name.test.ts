import { describe, expect, it } from 'vitest'

import { freeName, policyNameIssue, POLICY_NAME_MAX } from './policy-name'

const policies = [
  { id: 'p1', name: 'Payroll — Finance' },
  { id: 'p2', name: 'Salesforce — India and US only' },
]

describe('policyNameIssue', () => {
  it('asks for a name when there is none', () => {
    expect(policyNameIssue('', policies)).toBe('A policy needs a name.')
    expect(policyNameIssue('   ', policies)).toBe('A policy needs a name.')
  })

  it('refuses a name another policy has, trimmed and in any case', () => {
    expect(policyNameIssue('payroll — finance ', policies)).toBe('A policy with this name already exists.')
    expect(policyNameIssue('Payroll', policies)).toBeNull()
  })

  it('lets a policy keep its own name', () => {
    expect(policyNameIssue('Payroll — Finance', policies, 'p1')).toBeNull()
    expect(policyNameIssue('Payroll — Finance', policies, 'p2')).toBe('A policy with this name already exists.')
  })
})

describe('freeName', () => {
  it('keeps a name nothing else has', () => {
    expect(freeName('  Require MFA for all users ', ['Payroll'])).toBe('Require MFA for all users')
  })

  it('numbers a name that is taken, skipping numbers in use', () => {
    expect(freeName('Require MFA', ['require mfa'])).toBe('Require MFA 2')
    expect(freeName('Require MFA', ['Require MFA', 'Require MFA 2'])).toBe('Require MFA 3')
  })

  it('fits the cap, number included', () => {
    const long = 'x'.repeat(60)
    expect(freeName(long, [])).toHaveLength(POLICY_NAME_MAX)
    const taken = [long.slice(0, POLICY_NAME_MAX)]
    const next = freeName(long, taken)
    expect(next.length).toBeLessThanOrEqual(POLICY_NAME_MAX)
    expect(next.endsWith(' 2')).toBe(true)
  })
})
