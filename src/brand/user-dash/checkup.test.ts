import { describe, expect, it } from 'vitest'

import { configuredMethodIds } from '../user-methods'
import { checkup } from './checkup'

describe("the person's set-up methods (shared with Setup 2FA)", () => {
  it('counts an enrolled method, a held token, and a method the profile already feeds', () => {
    const ids = configuredMethodIds([{ id: 'google-auth' }, { id: 'otp-sms' }, { id: 'display-token' }, { id: 'yubikey' }], { configured: ['google-auth'] }, (id) => (id === 'display-token' ? 1 : 0))
    expect(ids).toEqual(['google-auth', 'otp-sms', 'display-token'])
  })

  it('leaves out a method the profile cannot feed', () => {
    expect(configuredMethodIds([{ id: 'otp-alt-email' }], { configured: [] }, () => 0)).toEqual([])
  })
})

/* The account checkup on My account's Overview (plan Task 4): four items, each done or one action away. */

const todo = (configured: string[], age: number) => checkup(configured, age).todo.map((i) => i.id)

describe('the account checkup', () => {
  it('asks for everything but the password when nothing is set up', () => {
    expect(todo([], 20)).toEqual(['second', 'backup', 'passkey'])
  })

  it('asks for a backup and a passkey after one method', () => {
    expect(todo(['otp-email'], 20)).toEqual(['backup', 'passkey'])
  })

  it('asks for a new password after 90 days', () => {
    expect(todo(['otp-email', 'fido2'], 120)).toEqual(['password'])
    expect(todo(['otp-email', 'fido2'], 90)).toEqual([])
  })

  it('names the items in order with an action each', () => {
    const { items } = checkup([], 20)
    expect(items.map((i) => i.label)).toEqual(['Second method', 'Backup method', 'Passkey', 'Password'])
    expect(items.every((i) => i.action.label.length > 0)).toBe(true)
  })
})
