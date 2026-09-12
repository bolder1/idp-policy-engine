import { describe, expect, test } from 'vitest'

import { AUTH_METHODS } from '../methods'
import { familyRow, hasConfigPage, pageKey, rowTarget } from './auth-panel'

/* The catalogue's second factors in one family — what the list counts a row by. */
const inside = (channel: string) =>
  AUTH_METHODS.filter((m) => m.use === 'second' && m.channel === channel)

const WITH_VARIANTS = ['SMS', 'Email', 'Authenticator App', 'miniOrange Authenticator', 'Hardware Token']
const OF_ONE = ['RSA Authenticator', 'Call Verification', 'Security Questions', 'Grid Pattern', 'Smart Cards', 'Biometric']

describe('familyRow', () => {
  test('a family with variants opens the slider', () => {
    for (const channel of WITH_VARIANTS) {
      expect(familyRow(channel, inside(channel)), channel).toEqual({ opens: true })
    }
  })

  test('a family of one carries its only method on the row', () => {
    for (const channel of OF_ONE) {
      const row = familyRow(channel, inside(channel))
      expect(row.opens, channel).toBe(false)
      if (!row.opens) expect(row.method.channel, channel).toBe(channel)
    }
  })

  test('only the families of one that have settings say so', () => {
    const offering = OF_ONE.filter((channel) => {
      const row = familyRow(channel, inside(channel))
      return !row.opens && row.settings
    })
    expect(offering.sort()).toEqual(['Grid Pattern', 'Security Questions'])
  })

  test('RSA is set up from its row, because it is the one that ships unconfigured', () => {
    const row = familyRow('RSA Authenticator', inside('RSA Authenticator'))
    expect(row).toMatchObject({ opens: false, settings: false, method: { id: 'rsa', configured: false } })
  })

  test('a filter that leaves one method in a family narrows the row with it', () => {
    const row = familyRow('SMS', inside('SMS').slice(0, 1))
    /* SMS settings belong to the family, so they survive the narrowing. */
    expect(row).toMatchObject({ opens: false, settings: true })
  })
})

describe('rowTarget', () => {
  const target = (channel: string) => rowTarget(familyRow(channel, inside(channel)))

  test('a family with variants opens onto the family', () => {
    for (const channel of WITH_VARIANTS) expect(target(channel), channel).toEqual({ kind: 'family' })
  })

  test('a family of one with settings opens onto them, so it needs no Settings button', () => {
    for (const channel of ['Security Questions', 'Grid Pattern']) {
      expect(target(channel), channel).toEqual({ kind: 'settings' })
    }
  })

  test('a family of one with nothing behind it goes nowhere, and ends in its switch', () => {
    for (const channel of ['Call Verification', 'Smart Cards', 'Biometric']) {
      expect(target(channel), channel).toBeNull()
    }
  })

  test('RSA goes nowhere until it is set up, and then opens its configuration', () => {
    const [rsa] = inside('RSA Authenticator')
    expect(rowTarget(familyRow('RSA Authenticator', [rsa]))).toBeNull()
    const live = { ...rsa, configured: true }
    expect(rowTarget(familyRow('RSA Authenticator', [live]))).toEqual({ kind: 'setup', method: live })
  })

  test('only RSA has a configuration worth returning to', () => {
    expect(AUTH_METHODS.filter(hasConfigPage).map((m) => m.id)).toEqual(['rsa'])
  })
})

describe('pageKey', () => {
  test('a family and its settings page are different pages', () => {
    expect(pageKey({ kind: 'family', channel: 'Grid Pattern' })).not.toBe(
      pageKey({ kind: 'settings', channel: 'Grid Pattern' }),
    )
  })

  test('setup is keyed by method, so two setups in a row still swap', () => {
    expect(pageKey({ kind: 'setup', methodId: 'rsa' })).not.toBe(pageKey({ kind: 'setup', methodId: 'display-token' }))
  })
})
