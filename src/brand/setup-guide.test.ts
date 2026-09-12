import { describe, expect, test } from 'vitest'

import { AUTH_METHODS } from './methods'
import { NPS_SERVERS, QR_SIZE, isPasscode, qrMatrix, secretFor, setupCardFor, setupReady } from './setup-guide'

const CODE_APPS = ['google-auth', 'ms-auth', 'authy']

describe('setupCardFor', () => {
  test('the three code apps each get the install, scan and enter-a-code card', () => {
    for (const id of CODE_APPS) expect(setupCardFor(id)?.kind, id).toBe('app')
  })

  test('Microsoft Push gets the Azure NPS card', () => {
    expect(setupCardFor('ms-push')).toEqual({ kind: 'nps' })
  })

  test('every card belongs to a method on the Authenticator App page, and nothing else has one', () => {
    const withCards = AUTH_METHODS.filter((m) => setupCardFor(m.id))
    expect(withCards.map((m) => m.id).sort()).toEqual([...CODE_APPS, 'ms-push'].sort())
    for (const m of withCards) expect(m.channel, m.id).toBe('Authenticator App')
  })

  test('the install buttons go to the two stores', () => {
    for (const id of CODE_APPS) {
      const card = setupCardFor(id)
      if (card?.kind !== 'app') throw new Error(`${id} has no app card`)
      expect(card.android, id).toMatch(/^https:\/\/play\.google\.com\//)
      expect(card.ios, id).toMatch(/^https:\/\/apps\.apple\.com\//)
    }
  })
})

describe('setupReady', () => {
  const app = setupCardFor('google-auth')!
  const nps = setupCardFor('ms-push')!

  test('a code app is ready once the six digits it showed are in', () => {
    expect(setupReady(app, { passcode: '', server: '' })).toBe(false)
    expect(setupReady(app, { passcode: '12345', server: '' })).toBe(false)
    expect(setupReady(app, { passcode: '123456', server: '' })).toBe(true)
  })

  test('Microsoft Push is ready once a configured server is picked, and never with none configured', () => {
    expect(setupReady(nps, { passcode: '', server: '' })).toBe(false)
    expect(setupReady(nps, { passcode: '', server: 'nps-somewhere-else' })).toBe(false)
    expect(setupReady(nps, { passcode: '', server: NPS_SERVERS[0].id })).toBe(true)
    expect(setupReady(nps, { passcode: '', server: NPS_SERVERS[0].id }, [])).toBe(false)
  })
})

describe('secretFor', () => {
  test('is a base32 key in four groups of four', () => {
    for (const id of CODE_APPS) expect(secretFor(id)).toMatch(/^[A-Z2-7]{4}( [A-Z2-7]{4}){3}$/)
  })

  test('holds still between openings, and differs between apps', () => {
    expect(secretFor('google-auth')).toBe(secretFor('google-auth'))
    expect(new Set(CODE_APPS.map(secretFor)).size).toBe(CODE_APPS.length)
  })
})

describe('qrMatrix', () => {
  test('is square, at the size a version-1 code is', () => {
    const m = qrMatrix('google-auth')
    expect(m).toHaveLength(QR_SIZE)
    for (const row of m) expect(row).toHaveLength(QR_SIZE)
  })

  test('carries the three finder squares, with a quiet separator round each', () => {
    const m = qrMatrix('ms-auth')
    const last = QR_SIZE - 7
    for (const [top, left] of [[0, 0], [0, last], [last, 0]]) {
      expect(m[top][left], `ring at ${top},${left}`).toBe(true)
      expect(m[top + 1][left + 1], `gap at ${top},${left}`).toBe(false)
      expect(m[top + 3][left + 3], `core at ${top},${left}`).toBe(true)
    }
    expect(m[7][7]).toBe(false)
    expect(m[7][last - 1]).toBe(false)
    expect(m[last - 1][7]).toBe(false)
  })

  test('is the same picture every time for one app, and a different one for another', () => {
    expect(qrMatrix('authy')).toEqual(qrMatrix('authy'))
    expect(qrMatrix('authy')).not.toEqual(qrMatrix('google-auth'))
  })
})

describe('isPasscode', () => {
  test('takes six digits and nothing else', () => {
    expect(isPasscode('123456')).toBe(true)
    for (const v of ['', '12345', '1234567', '12 456', 'abcdef', '12345a']) expect(isPasscode(v), v).toBe(false)
  })
})
