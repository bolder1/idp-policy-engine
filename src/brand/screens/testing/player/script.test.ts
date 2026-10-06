import { describe, expect, it } from 'vitest'

import { showcaseTenant, showcaseTenantHrmsOn } from '../../../fixtures'
import { AUTH_METHODS } from '../../../methods'
import { envOf, resolveSignIn } from '../../tenant-resolver'
import { screensOf, stepLabel, type SignInScreens } from '../screens-of'
import { defaultBoardForm, factsOf, typedAddressPatch, type SignInForm } from '../sign-in-form'
import { combinations, PERSON } from './combinations'
import { NOT_AVAILABLE, PACE, digitsFor, pageStepOf, playOf, sayOf, scriptOf, stepEnd, stepEntry, stepStarts, type Beat, type Page, type Scene, type Script } from './script'

/* The film of each sign-in (script.ts): every combination screens-of can
   produce plays, in 5–9 s, and ends where its decision says — signed in,
   denied with the message word for word, or stuck on a method nobody can be
   offered. Then the scenes the showcase tenant gives, read end to end. */

const ctx = { appName: 'HRMS', person: PERSON }
const all = combinations()
const film = (s: SignInScreens) => scriptOf(s, ctx)
const fieldValue = (p: Page, field: string): string => {
  switch (field) {
    case 'username':
      return p.kind === 'identify' || p.kind === 'password' ? p.username : ''
    case 'password':
      return p.kind === 'password' ? p.password : ''
    case 'code':
      return p.kind === 'code' ? p.code : ''
    case 'otp':
      return p.kind === 'key-otp' ? p.otp : ''
    case 'answer-0':
    case 'answer-1':
      return p.kind === 'questions' ? p.items[Number(field.slice(-1))].answer : ''
    case 'grid':
      return p.kind === 'grid' ? 'x'.repeat(p.lit) : ''
    default:
      return ''
  }
}

describe('every combination', () => {
  it('is a long list: each first factor × each second × remembering or not, and the denials', () => {
    const second = AUTH_METHODS.filter((m) => m.use === 'second').length
    expect(second).toBe(22)
    /* 13 first factors: the password, Passkeys, Magic link, the nine rule methods, one the catalogue does not know. */
    expect(all.filter((c) => c.key.startsWith('1fa/'))).toHaveLength(13)
    expect(all.filter((c) => c.key.startsWith('2fa/'))).toHaveLength(13 * (second + 3) * 2)
  })

  it.each(all.map((c) => [c.key, c] as const))('%s plays to its end', (_, c) => {
    const s = film(c.screens)
    expect(s.beats.length).toBeGreaterThan(0)
    expect(s.end).toBe(c.end)
    expect(s.beats.at(-1)!.scene.end).toBe(c.end)
    const lastPage = s.beats.at(-1)!.scene.page.kind
    expect(lastPage).toBe(c.end === 'signed-in' ? 'signed-in' : c.end === 'denied' ? 'denied' : 'unavailable')
    /* Paced: 5–9 s, every beat takes time, and the steps run in order. */
    expect(s.total).toBeGreaterThanOrEqual(PACE.min)
    expect(s.total).toBeLessThanOrEqual(PACE.max)
    expect(s.beats.every((b) => b.ms > 0)).toBe(true)
    expect(s.beats.map((b) => b.step)).toEqual([...s.beats.map((b) => b.step)].sort((a, b) => a - b))
    /* One chip per step, each with its beats. */
    expect(new Set(s.beats.map((b) => b.step)).size).toBe(s.chips.length)
    expect(stepStarts(s).every((i) => i >= 0)).toBe(true)
    /* A typing beat types exactly what its field ends up holding. */
    for (const b of s.beats) if (b.action.kind === 'type' && b.action.field !== 'number') expect(fieldValue(b.scene.page, b.action.field)).toHaveLength(b.action.count)
    /* Signed in, everything beside the browser has gone. */
    if (c.end === 'signed-in') expect(s.beats.at(-1)!.scene).toMatchObject({ device: null, toast: null, sheet: null })
  })

  it('names its steps after the pages: the first factor, the method, where it ends', () => {
    for (const c of all) {
      const s = film(c.screens)
      const labels = c.screens.steps.map(stepLabel)
      if (c.end === 'denied') expect(s.chips).toEqual(['Username', 'Access denied'])
      else if (c.end === 'stuck') expect(s.chips).toEqual([...labels, NOT_AVAILABLE])
      else expect(s.chips).toEqual([...labels, 'Signed in'])
    }
  })
})

const beatsOf = (s: Script, step: number): Beat[] => s.beats.filter((b) => b.step === step)
const pick = (key: string) => all.find((c) => c.key === key)!.screens

describe('the password', () => {
  const s = film(pick('1fa/password'))

  it('types the username in, character by character, then the password as dots, and presses', () => {
    const acts = beatsOf(s, 0).map((b) => (b.action.kind === 'type' ? `type ${b.action.field} ${b.action.count}` : b.action.kind === 'press' ? `press ${b.action.target}` : b.action.kind))
    expect(acts).toEqual(['show', 'type username 14', 'press primary', 'show', 'type password 9', 'press primary'])
    expect(beatsOf(s, 0).at(-1)!.scene.page).toEqual({ kind: 'password', username: 'kavya.m@mo.com', password: '•••••••••' })
  })

  it('ends on the app’s home', () => {
    expect(s.chips).toEqual(['Password', 'Signed in'])
    expect(s.beats.at(-1)!.scene.page).toEqual({ kind: 'signed-in' })
  })
})

describe('a code', () => {
  it('arrives on the phone by text, and the same code is typed in', () => {
    const s = film(pick('2fa/password/otp-sms'))
    const arrive = s.beats.find((b) => b.widget === 'phone' && b.action.kind === 'arrive')!
    const sms = arrive.scene.device
    expect(sms?.kind === 'phone' && sms.screen.kind === 'sms' ? sms.screen.code : null).toMatch(/^\d{6}$/)
    const typed = s.beats.find((b) => b.action.kind === 'type' && b.action.field === 'code')!
    expect(typed.scene.page.kind === 'code' ? typed.scene.page.code : '').toBe(sms?.kind === 'phone' && sms.screen.kind === 'sms' ? sms.screen.code : '')
  })

  it('arrives by email in a notification, to the masked address the page names', () => {
    const s = film(pick('2fa/password/otp-email'))
    expect(beatsOf(s, 1)[0].scene.page).toMatchObject({ kind: 'code', ask: 'Enter the code sent to k••••@mo.com', length: 6 })
    expect(s.beats.find((b) => b.widget === 'toast')!.scene.toast).toMatchObject({ subject: 'Your HRMS sign-in code' })
  })

  it('is four digits on a call, read out once it is answered', () => {
    const s = film(pick('2fa/password/otp-call'))
    const beats = beatsOf(s, 1)
    expect(beats.map((b) => `${b.widget} ${b.action.kind}`)).toEqual(['browser show', 'phone arrive', 'phone press', 'phone show', 'browser type', 'browser press'])
    expect(beats[0].scene.page).toMatchObject({ kind: 'code', length: 4 })
    /* Answer is pressed on the ringing call; the code is read out on the beat after, so the press is seen. */
    const answered = (b: Beat) => (b.scene.device?.kind === 'phone' && b.scene.device.screen.kind === 'call' ? b.scene.device.screen.answered : null)
    expect(beats.slice(1, 4).map(answered)).toEqual([false, false, true])
  })

  it('shows in the authenticator app, under the tenant, beside the person’s address', () => {
    const s = film(pick('2fa/password/google-auth'))
    const phone = s.beats.find((b) => b.widget === 'phone')!.scene.device
    expect(phone).toMatchObject({ kind: 'phone', screen: { kind: 'authenticator', app: 'Google Authenticator', issuer: 'miniOrange', account: 'kavya.m@mo.com' } })
  })

  it('is the same code on every play', () => {
    expect(digitsFor('a|b', 6)).toBe(digitsFor('a|b', 6))
    expect(digitsFor('a|b', 6)).toMatch(/^\d{6}$/)
    expect(film(pick('2fa/password/otp-sms'))).toEqual(film(pick('2fa/password/otp-sms')))
  })
})

describe('a push', () => {
  it('asks for the number on the page when number matching is on, then a fingerprint, then approves', () => {
    const s = film(pick('2fa/password/mo-push'))
    const page = beatsOf(s, 1)[0].scene.page
    expect(page).toMatchObject({ kind: 'wait', title: 'Check your phone', ask: 'Enter this number in miniOrange Authenticator' })
    const number = page.kind === 'wait' ? page.number : null
    expect(number).toMatch(/^\d{2}$/)
    const typed = s.beats.find((b) => b.action.kind === 'type' && b.action.field === 'number')!
    expect(typed.scene.device).toMatchObject({ screen: { typed: number } })
    expect(beatsOf(s, 1).map((b) => b.action.kind)).toEqual(['show', 'arrive', 'show', 'type', 'press', 'scan', 'show'])
  })

  it('is a plain Approve without number matching', () => {
    const s = film(pick('2fa/password/ms-push'))
    /* The page names the app the phone shows, not the method's console name. */
    expect(beatsOf(s, 1)[0].scene.page).toMatchObject({ number: null, ask: 'Approve the request in Microsoft Authenticator' })
    expect(beatsOf(s, 1).map((b) => b.action.kind)).toEqual(['show', 'arrive', 'show', 'press', 'show'])
  })
})

describe('remembering the device', () => {
  it('ticks the box for the rule’s days before the last press, and only when the rule offers it', () => {
    for (const c of all.filter((x) => x.key.startsWith('2fa/') && x.end === 'signed-in')) {
      const s = film(c.screens)
      const ticks = s.beats.filter((b) => b.action.kind === 'tick')
      expect(`${c.key}: ${ticks.length}`).toBe(`${c.key}: ${c.key.endsWith('/remember') ? 1 : 0}`)
      if (ticks.length) expect(ticks[0].scene.page).toMatchObject({ remember: { days: 7, ticked: true } })
    }
  })
})

describe('the ends that are not signed in', () => {
  it('types the username, then shows the deny message word for word', () => {
    const s = film(pick('deny/verbatim'))
    expect(s.beats.map((b) => b.action.kind)).toEqual(['show', 'type', 'press', 'end'])
    expect(s.beats.at(-1)!.scene.page).toEqual({ kind: 'denied', message: 'HRMS opens only from a corporate office. Contact IT if you need access from elsewhere.' })
  })

  it('adds the rule’s next step and contact under the message, and only when it sets them', () => {
    const base = pick('deny/verbatim')
    const step = base.steps[0]
    if (step.kind !== 'deny') throw new Error('expected a deny step')
    const withExtra = { ...base, steps: [{ ...step, action: 'Connect from the office.', contact: 'IT help desk' }] }
    expect(film(withExtra).beats.at(-1)!.scene.page).toEqual({ kind: 'denied', message: step.message, action: 'Connect from the office.', contact: 'IT help desk' })
    expect(film(base).beats.at(-1)!.scene.page).toEqual({ kind: 'denied', message: step.message })
  })

  it('stops on the page that says the method is not available, and closes on a chip that says so', () => {
    const s = film(pick('2fa/password/unavailable'))
    expect(s.chips).toEqual(['Password', 'Duo Push', 'Not available'])
    expect(beatsOf(s, 1).map((b) => b.scene.page)).toEqual([{ kind: 'unavailable', name: 'Duo Push' }])
    expect(beatsOf(s, 2).map((b) => b.action.kind)).toEqual(['end'])
    expect(s.beats.at(-1)!.scene).toMatchObject({ page: { kind: 'unavailable', name: 'Duo Push' }, end: 'stuck' })
  })

  it('says the whole film in one line, and what the page it ends on says', () => {
    expect(sayOf(film(pick('2fa/password/google-auth')))).toBe('Password, then Google Authenticator, then Signed in')
    expect(sayOf(film(pick('deny/verbatim')))).toBe('Username, then Access denied: HRMS opens only from a corporate office. Contact IT if you need access from elsewhere.')
    expect(sayOf(film(pick('2fa/password/unavailable')))).toBe('Password, then Duo Push, then Not available: Duo Push is not available')
  })
})

describe('a scan', () => {
  /* The scan's beat holds the finished scene (reduced motion draws it); the
     widget waits for the scan to end before it shows the tick (player-ui). A
     passkey's sheet then holds on its tick for a beat of its own, as the
     step would otherwise end the moment the finger is read. */
  it('holds the passkey sheet on its tick after the scan, first factor or second', () => {
    expect(beatsOf(film(pick('2fa/password/fido2')), 1).map((b) => `${b.widget} ${b.action.kind}`)).toEqual(['browser show', 'browser press', 'sheet arrive', 'sheet scan', 'sheet show'])
    expect(beatsOf(film(pick('1fa/first:Passkeys')), 0).map((b) => `${b.widget} ${b.action.kind}`)).toEqual(['browser show', 'browser press', 'sheet arrive', 'sheet scan', 'sheet show'])
  })

  it('shows the phone’s tick and the page’s together once the code is read', () => {
    const s = film(pick('2fa/password/mo-qr'))
    const at = s.beats.findIndex((b) => b.action.kind === 'scan')
    expect(s.beats[at + 1]).toMatchObject({ widget: 'browser', action: { kind: 'show' }, scene: { page: { kind: 'qr', done: true } } })
  })
})

describe('a first factor in place of the password', () => {
  it('opens on a passkey with no username typed', () => {
    const s = film(pick('1fa/first:Passkeys'))
    expect(s.beats.some((b) => b.action.kind === 'type')).toBe(false)
    expect(s.beats.map((b) => b.widget)).toContain('sheet')
  })

  it('sends a magic link, and the link in the mail is pressed', () => {
    const s = film(pick('1fa/first:Magic link'))
    expect(beatsOf(s, 0).map((b) => `${b.widget} ${b.action.kind}`)).toEqual(['browser show', 'browser type', 'browser press', 'browser show', 'toast arrive', 'toast press', 'browser show'])
  })

  it('plays a named method as that method, after the username', () => {
    const s = film(pick('1fa/first:OTP over SMS'))
    expect(s.chips).toEqual(['OTP over SMS', 'Signed in'])
    expect(beatsOf(s, 0).map((b) => b.widget)).toContain('phone')
  })
})

describe('each step starts from a clean scene', () => {
  /* What a step leaves in front — the passkey sheet, a mail, the phone, a key —
     is gone by the first beat of the next step, unless that step uses the same
     one: a phone from a push stays for a text, and leaves before a security key.
     A sheet or a mail the next step needs arrives anew, so neither ever carries. */
  const PARTS = ['sheet', 'toast', 'device'] as const
  type Part = (typeof PARTS)[number]
  const kindOf = (sc: Scene, part: Part): string | null =>
    part === 'sheet' ? (sc.sheet?.kind ?? null) : part === 'toast' ? (sc.toast ? 'mail' : null) : (sc.device?.kind ?? null)
  /* The step brings that one in itself: an arrive of the same widget, the same kind. */
  const uses = (beats: Beat[], part: Part, kind: string) =>
    beats.some((b) => b.action.kind === 'arrive' && b.widget === (part === 'device' ? kind : part) && kindOf(b.scene, part) === kind)

  it.each(all.map((c) => [c.key, c] as const))('%s', (_, c) => {
    const s = film(c.screens)
    for (let n = 0; n + 1 < s.chips.length; n++) {
      const before = s.beats[stepEnd(s, n)].scene
      const first = s.beats[stepStarts(s)[n + 1]]
      const next = beatsOf(s, n + 1)
      for (const part of PARTS) {
        const k = kindOf(before, part)
        if (!k) continue
        const carried = kindOf(first.scene, part)
        if (part !== 'device' || !uses(next, part, k)) {
          expect(`step ${n + 1} opens with ${part} ${carried}`).toBe(`step ${n + 1} opens with ${part} null`)
        } else if (carried) {
          /* Kept, it is kept as it was: the same device, until the step's own beat changes it. */
          expect(first.scene.device).toBe(before.device)
        }
      }
      /* Something left: on a short beat of its own, over the page the step before ended on. */
      if (first.action.kind === 'leave') {
        expect(first.ms).toBeLessThanOrEqual(360)
        expect(first.scene.page).toBe(before.page)
        expect(s.beats[stepEntry(s, n + 1)].action.kind).not.toBe('leave')
      } else expect(stepEntry(s, n + 1)).toBe(stepStarts(s)[n + 1])
    }
    /* And nothing leaves that was not there. */
    for (const [i, b] of s.beats.entries()) if (b.action.kind === 'leave') expect(PARTS.some((p) => kindOf(s.beats[i - 1].scene, p) && !kindOf(b.scene, p))).toBe(true)
  })

  const acts = (s: Script, step: number) => beatsOf(s, step).map((b) => `${b.widget} ${b.action.kind}`)

  it('takes the passkey sheet away before the second factor’s page, and still ends the passkey’s step on it', () => {
    const s = film(pick('2fa/first:Passkeys/otp-sms'))
    expect(acts(s, 1).slice(0, 3)).toEqual(['sheet leave', 'browser show', 'phone arrive'])
    expect(beatsOf(s, 1).every((b) => b.scene.sheet === null)).toBe(true)
    /* Reduced motion draws each step's last scene: the passkey's still has its sheet, ticked. */
    expect(s.beats[stepEnd(s, 0)].scene.sheet).toEqual({ kind: 'passkey', account: 'kavya.m@mo.com', done: true })
    /* The leave beat still shows the passkey's page; a picked chip starts past it. */
    const leave = stepStarts(s)[1]
    expect(pageStepOf(s, leave)).toBe(0)
    expect(stepEntry(s, 1)).toBe(leave + 1)
    expect(pageStepOf(s, leave + 1)).toBe(1)
  })

  it('takes a push’s phone away before a key, a card or a token, and keeps it for a text', () => {
    for (const second of ['fido2', 'cac', 'rsa', 'yubikey', 'digital-persona']) {
      const s = film(pick(`2fa/first:miniOrange Push/${second}`))
      expect(`${second}: ${acts(s, 1)[0]}`).toBe(`${second}: phone leave`)
      expect(beatsOf(s, 1).some((b) => b.scene.device?.kind === 'phone')).toBe(false)
    }
    const kept = film(pick('2fa/first:miniOrange Push/otp-sms'))
    expect(acts(kept, 1).slice(0, 2)).toEqual(['browser show', 'phone arrive'])
    expect(kept.beats[stepStarts(kept)[1]].scene.device).toMatchObject({ kind: 'phone', screen: { kind: 'push', phase: 'approved' } })
  })

  it('takes a mail away before the next page, even when that step sends one of its own', () => {
    const s = film(pick('2fa/first:OTP over Email/otp-email'))
    expect(acts(s, 1).slice(0, 3)).toEqual(['toast leave', 'browser show', 'toast arrive'])
    expect(beatsOf(s, 1)[1].scene.toast).toBeNull()
  })

  it('adds nothing where the step before leaves nothing in front', () => {
    for (const c of all.filter((x) => x.key.startsWith('2fa/password/'))) expect(film(c.screens).beats.some((b) => b.action.kind === 'leave')).toBe(false)
  })
})

describe('what each method plays as', () => {
  it('reads the catalogue id first, and a method it does not know by what it asks for', () => {
    const by = (id: string) => playOf(AUTH_METHODS.find((m) => m.id === id)!, 'none')
    expect(['otp-sms', 'sms-link', 'otp-call', 'otp-email', 'email-link', 'kba', 'google-auth', 'mo-qr', 'mo-push', 'yubikey', 'rsa', 'fido2', 'digital-persona', 'cac', 'grid'].map(by)).toEqual([
      'sms-code',
      'sms-link',
      'call',
      'email-code',
      'email-link',
      'questions',
      'authenticator',
      'qr',
      'push',
      'security-key',
      'hardware-token',
      'passkey',
      'fingerprint',
      'smart-card',
      'grid',
    ])
    expect(playOf(null, 'none')).toBe('unavailable')
  })
})

describe('reading a script', () => {
  it('starts each step at its first beat, and holds a step on its last', () => {
    const s = film(pick('2fa/password/otp-sms/remember'))
    expect(stepStarts(s)[0]).toBe(0)
    expect(s.beats[stepEnd(s, 1)].action).toEqual({ kind: 'press', target: 'primary' })
  })
})

/* The showcase tenant's own sign-ins, through screens-of and into the film. */
describe('the showcase scenes', () => {
  const TODAY = '2026-09-28'
  const run = (tenant: ReturnType<typeof showcaseTenant>, policyId: string, patch: Partial<SignInForm> = {}) => {
    const p = tenant.policies.find((x) => x.id === policyId)!
    const form = { ...defaultBoardForm(p, tenant.directory.people, tenant.apps, TODAY), ...patch }
    const res = resolveSignIn(tenant.policies, factsOf(form, tenant.zones).facts, envOf(tenant))
    const person = tenant.directory.people.find((u) => u.id === form.personId) ?? null
    return screensOf(res, { policies: tenant.policies, methods: tenant.methods, defaultMethodId: undefined, person }).map((sc) => scriptOf(sc, { appName: 'App', person: sc.person ?? null }))
  }

  it('Kavya in the office: a password, then Google Authenticator, then in', () => {
    const [s] = run(showcaseTenantHrmsOn(), 'sc-hrms-office')
    expect(s.chips).toEqual(['Password', 'Google Authenticator', 'Signed in'])
    expect(s.beats.find((b) => b.action.kind === 'type')!.scene.page).toEqual({ kind: 'identify', username: 'kavya.m@mo.com' })
  })

  it('HRMS from elsewhere: the username, then the deny page', () => {
    const [s] = run(showcaseTenantHrmsOn(), 'sc-hrms-office', typedAddressPatch('192.0.2.50'))
    expect(s.chips).toEqual(['Username', 'Access denied'])
    expect(s.end).toBe('denied')
  })
})
