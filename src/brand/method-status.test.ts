import { describe, expect, it } from 'vitest'

import { AUTH_METHODS, methodBlocker, type AuthMethod } from './methods'
import { channelOf, methodStatus } from './method-status'

const base = (over: Partial<AuthMethod> = {}): AuthMethod => ({
  ...AUTH_METHODS[0],
  configured: true,
  active: true,
  allowed: true,
  ...over,
})

describe('channelOf', () => {
  it('drops the billing noun and keeps the channel', () => {
    expect(channelOf('Call transactions')).toBe('calls')
    expect(channelOf('Email transactions')).toBe('emails')
  })

  it('leaves an acronym alone rather than pluralising it', () => {
    expect(channelOf('SMS transactions')).toBe('SMS')
  })
})

describe('methodStatus', () => {
  it('lets an exhausted balance outrank every other state', () => {
    /* The point of the rule: this method is switched off AND unconfigured AND
       out of credit. Only the last one costs money to clear, so it is the one
       that shows. */
    const m = base({ configured: false, active: false, balance: { label: 'SMS transactions', remaining: 0 } })
    expect(methodStatus(m, true, false).key).toBe('empty')
  })

  it('ignores a balance that still has credit in it', () => {
    const m = base({ balance: { label: 'Email transactions', remaining: 10 } })
    expect(methodStatus(m, false, false).key).toBe('live')
  })

  it('separates never-configured from configured-then-switched-off', () => {
    expect(methodStatus(base({ configured: false }), true, false).key).toBe('setup')
    expect(methodStatus(base({ configured: true }), true, false).key).toBe('paused')
  })

  it('calls an enabled method with no enrollees idle, not live', () => {
    expect(methodStatus(base(), false, true).key).toBe('idle')
  })

  it('fits every label in the status column', () => {
    /* The regression this replaced was a 177px string in a 150px column. Nine
       characters of slack over the longest real label, at ~7px per character
       plus the icon, keeps that from coming back unnoticed. */
    for (const m of AUTH_METHODS) {
      for (const blocked of [true, false]) {
        for (const idle of [true, false]) {
          expect(methodStatus(m, blocked, idle).label.length).toBeLessThanOrEqual(14)
        }
      }
    }
  })

  it('gives every state a detail sentence for the tooltip', () => {
    for (const m of AUTH_METHODS) {
      const s = methodStatus(m, methodBlocker(m) !== null, (m.enrolled ?? 0) === 0)
      expect(s.detail.length).toBeGreaterThan(20)
      expect(s.detail.endsWith('.')).toBe(true)
    }
  })
})
