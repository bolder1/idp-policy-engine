/// <reference types="vite/client" />
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { combinations, PERSON } from './combinations'
import { HELD, PlayContext, type PlayState } from './play-state'
import { scriptOf, stepEnd, type Script } from './script'
import { SignInPlayer } from './SignInPlayer'
import { Stage } from './Stage'
import playerCss from './player.css?raw'

/* The player and its widgets, drawn without a browser: every step of every
   combination renders, each widget says what its step is about — the code
   the text brought, the number to match, the deny message word for word —
   and the sheet keeps the rules the console's stylesheets keep. */

const all = combinations()
const html = (node: ReactNode) => renderToStaticMarkup(node)
const text = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
const film = (key: string) => scriptOf(all.find((c) => c.key === key)!.screens, { appName: 'HRMS', person: PERSON })
const still = (s: Script, beat: number, play: Partial<PlayState> = {}) =>
  html(
    <PlayContext.Provider value={{ ...HELD, reduced: true, ...play }}>
      <Stage appId="hrms" appName="HRMS" person={PERSON} scene={s.beats[beat].scene} pageKey={`${s.beats[beat].step}`} />
    </PlayContext.Provider>,
  )
const endOf = (s: Script, step: number) => still(s, stepEnd(s, step))
const find = (s: Script, pred: (b: Script['beats'][number]) => boolean) => s.beats.findIndex(pred)

describe('every step of every combination', () => {
  /* Remembering the device changes one box on a page the password's rows
     already draw, so it is drawn there and nowhere else. */
  it('draws, and never an orange button', { timeout: 30_000 }, () => {
    for (const c of all.filter((x) => !x.key.endsWith('/remember') || x.key.startsWith('2fa/password/'))) {
      const s = scriptOf(c.screens, { appName: 'HRMS', person: PERSON })
      for (let step = 0; step < s.chips.length; step++) {
        const out = endOf(s, step)
        expect(out).toContain('tpw')
        expect(out).not.toContain('bx-btn--brand')
      }
    }
  })
})

describe('the player', () => {
  const screens = all.find((c) => c.key === '2fa/password/google-auth')!.screens

  it('opens on the empty sign-in page, its steps under it, and says the whole film in one label', () => {
    const out = html(<SignInPlayer screens={screens} appId="hrms" appName="HRMS" />)
    expect(out).toContain('role="img" aria-label="Password, then Google Authenticator, then Signed in"')
    expect(text(out)).toContain('mo.xecurify.com Sign in to HRMS Username Next')
    expect(text(out)).toContain('Password Google Authenticator Signed in')
    expect(out).toContain('aria-label="Replay"')
  })

  /* The label says the whole film from its first frame, not what the frame on screen happens to show. */
  it('names the deny message in its label, word for word, from the first frame', () => {
    const deny = all.find((c) => c.key === 'deny/verbatim')!.screens
    const out = html(<SignInPlayer screens={deny} appId="hrms" appName="HRMS" />)
    expect(out).toContain('aria-label="Username, then Access denied: HRMS opens only from a corporate office. Contact IT if you need access from elsewhere."')
  })

  it('says where a method cannot be offered, and closes on a chip that says so', () => {
    const stuck = all.find((c) => c.key === '2fa/password/unavailable')!.screens
    const out = html(<SignInPlayer screens={stuck} appId="hrms" appName="HRMS" />)
    expect(out).toContain('aria-label="Password, then Duo Push, then Not available: Duo Push is not available"')
    expect(text(out)).toContain('Password Duo Push Not available')
  })
})

describe('the widgets', () => {
  it('the password page: the account, the dots, Sign in', () => {
    const out = text(endOf(film('1fa/password'), 0))
    expect(out).toBe('mo.xecurify.com Sign in to HRMS KM kavya.m@mo.com Password ••••••••• Sign in')
  })

  it('a text: the code on the lock screen is the code in the boxes', () => {
    const s = film('2fa/password/otp-sms')
    const out = text(endOf(s, 1))
    const code = out.match(/(\d{6}) is your HRMS sign-in code\./)![1]
    expect(out).toContain(`Verify it’s you Enter the code sent to your phone ${code.split('').join(' ')} Verify`)
    expect(out).toContain('Messages')
  })

  it('an email: a notification over the bar, the code in it', () => {
    const s = film('2fa/password/otp-email')
    const out = text(still(s, find(s, (b) => b.widget === 'toast')))
    expect(out).toMatch(/Your HRMS sign-in code \d{6}/)
    expect(out).toContain('Enter the code sent to k••••@mo.com')
  })

  it('a push with number matching: the number on the page, typed on the phone, then Approve', () => {
    const s = film('2fa/password/mo-push')
    const typed = find(s, (b) => b.action.kind === 'type' && b.action.field === 'number')
    const out = text(still(s, typed))
    const n = out.match(/Enter this number in miniOrange Authenticator (\d{2})/)![1]
    expect(out).toContain(`Are you trying to sign in? Enter the number shown ${n} Approve Deny`)
    expect(text(endOf(s, 1))).toContain('Approved')
  })

  it('an authenticator app: the tenant, the address, the code and its ring', () => {
    const s = film('2fa/password/ms-auth')
    const out = still(s, find(s, (b) => b.widget === 'phone'))
    expect(text(out)).toMatch(/Microsoft Authenticator miniOrange kavya\.m@mo\.com \d{3} \d{3}/)
    expect(out).toContain('tpp__ring')
  })

  it('a call: Answer pressed on the ringing call, then the code read out', () => {
    const s = film('2fa/password/otp-call')
    const press = find(s, (b) => b.action.kind === 'press' && b.action.target === 'phone-answer')
    const pressing = still(s, press, { reduced: false, action: s.beats[press].action, widget: 'phone' })
    expect(text(pressing)).toContain('miniOrange Incoming call')
    expect(pressing).toContain('tpp__round is-answer is-pressed')
    expect(text(still(s, find(s, (b) => b.widget === 'phone' && b.action.kind === 'show')))).toMatch(/miniOrange Your code is \d \d \d \d/)
  })

  /* Each scan's beat carries the scene it ends on; while the scan plays, the
     widget still draws what it is scanning — the tick waits for the scan. */
  it('a scan: the code, the finger, the pad while it scans, and the tick only after', () => {
    const scanning = (key: string, widget: 'phone' | 'sheet' | 'reader') => {
      const s = film(key)
      const at = find(s, (b) => b.action.kind === 'scan' && b.widget === widget)
      return { during: still(s, at, { reduced: false, action: s.beats[at].action, widget }), after: still(s, at) }
    }
    const qr = scanning('2fa/password/mo-qr', 'phone')
    expect(qr.during).toContain('tpp__scanline')
    expect(qr.during).not.toContain('tpp__finder is-done')
    expect(qr.after).toContain('tpp__finder is-done')
    const passkey = scanning('2fa/password/fido2', 'sheet')
    expect(passkey.during).toContain('tps__ring')
    expect(passkey.during).not.toContain('tps__print is-done')
    expect(passkey.during).toContain('lucide-fingerprint')
    expect(passkey.after).toContain('tps__print is-done')
    const reader = scanning('2fa/password/digital-persona', 'reader')
    expect(reader.during).toContain('tph__glow')
    expect(reader.during).not.toContain('tph__pad is-done')
    expect(reader.after).toContain('tph__pad is-done')
  })

  it('a phone screen carries its own surface, the status row on it', () => {
    const s = film('2fa/password/mo-push')
    const lock = still(s, find(s, (b) => b.scene.device?.kind === 'phone'))
    expect(lock).toMatch(/<div class="tpp"><span class="tpp__notch"[^>]*><\/span><div class="tpp__screen is-lock"[^>]*><div class="tpp__status"><\/div><div class="tpp__body">/)
    expect(endOf(s, 1)).toMatch(/<div class="tpp__screen"[^>]*><div class="tpp__status">9:41<\/div>/)
  })

  it('a passkey: the browser’s sheet, then its tick', () => {
    const s = film('2fa/password/fido2')
    expect(text(still(s, find(s, (b) => b.widget === 'sheet')))).toContain('Use your passkey for mo.xecurify.com kavya.m@mo.com')
  })

  it('the hardware: a token’s code, a key, a card and its certificate, a reader', () => {
    expect(text(still(film('2fa/password/rsa'), find(film('2fa/password/rsa'), (b) => b.widget === 'token')))).toMatch(/\d{6} SecurID/)
    const key = film('2fa/password/yubikey')
    expect(still(key, find(key, (b) => b.widget === 'key'))).toContain('tph--key')
    const cac = film('2fa/password/cac')
    expect(text(still(cac, find(cac, (b) => b.widget === 'sheet')))).toContain('Select a certificate Kavya Menon OK')
    const reader = film('2fa/password/digital-persona')
    expect(still(reader, find(reader, (b) => b.widget === 'reader'))).toContain('tph--reader')
  })

  it('remembering the device: the box, ticked, for the rule’s days', () => {
    const s = film('2fa/password/otp-sms/remember')
    expect(text(still(s, find(s, (b) => b.action.kind === 'tick')))).toContain('Don’t ask again on this device for 7 days')
  })

  it('the ends: the app’s home with their face, the deny page, the method nobody can be offered', () => {
    /* Signed in, the bar shows an address — a stand-in built from the app, drawn quieter — never the app's name. */
    const home = endOf(film('1fa/password'), 1)
    expect(text(home)).toBe('hrms.app HRMS KM Signed in to HRMS Kavya Menon')
    expect(home).toContain('<span class="tpw__domain is-app">hrms.app</span>')
    expect(home).toContain('lucide-lock')
    expect(text(endOf(film('deny/verbatim'), 1))).toBe(
      'mo.xecurify.com Sign in to HRMS Access denied HRMS opens only from a corporate office. Contact IT if you need access from elsewhere. Back to sign in',
    )
    expect(text(endOf(film('2fa/password/unavailable'), 1))).toContain('Duo Push is not available Contact your administrator. Back to sign in')
    expect(text(endOf(film('2fa/password/unavailable'), 2))).toContain('Duo Push is not available Contact your administrator. Back to sign in')
  })

  it('types what the beat has typed so far, with a caret', () => {
    const s = film('1fa/password')
    const typing = find(s, (b) => b.action.kind === 'type' && b.action.field === 'username')
    const out = still(s, typing, { reduced: false, action: s.beats[typing].action, widget: 'browser', shown: 5 })
    expect(text(out)).toContain('Username kavya Next')
    expect(out).toContain('tpw__caret')
  })
})

describe('the sheet', () => {
  const rules = [...playerCss.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]*)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim(), body: m[2] }))

  it('gives nothing motion animates a transform or a transition: only the spinner turns, and the ring starts at the top', () => {
    /* The spinner's keyframe and the countdown ring's start: both on plain
       elements motion never touches. */
    const moving = rules.filter((r) => /(transform|translate|rotate|scale|transition)\s*:/.test(r.body)).map((r) => r.selector)
    expect(moving).toEqual(['to', '.tpp__ring'])
  })

  it('uses tokens only: no hex, no rgba, and no type under 12 px', () => {
    const css = playerCss.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(css).not.toMatch(/rgba?\(/i)
    expect(css.match(/font-size:\s*[^;]+/g)!.every((d) => /var\(--fs-/.test(d))).toBe(true)
  })

  /* Owner, 30 Sep 2026: "take the full space — why is there space on the
     right side?" and "the gradient looks a little AI-sloppy". */
  const body = (selector: string) => rules.find((r) => r.selector === selector)!.body

  it('takes the section’s whole width: the stage 16:10 within bounds, the browser across all of it', () => {
    expect(body('.tplay')).toMatch(/container: tplay \/ inline-size/)
    expect(body('.tplay')).not.toMatch(/max-width/)
    expect(body('.tplay__stage')).toMatch(/height: clamp\(288px, 62\.5cqi, 352px\)/)
    expect(body('.tpw')).toMatch(/inset: var\(--space-5\)/)
    expect(body('.tpw')).not.toMatch(/right:/)
  })

  it('puts a phone or a key in front of the browser, and the card steps aside only as far as it must', () => {
    expect(body('.tpdev')).toMatch(/right: var\(--tp-dev-right\); z-index: 1/)
    expect(body('.tpdev')).not.toMatch(/width/)
    expect(body('.tpw')).toMatch(/z-index: 0/)
    expect(body('.tpw__screen.is-sign-in, .tps')).toMatch(/padding-right: clamp\(0px, calc\(2 \* var\(--tp-room, 0px\) \+ var\(--tp-card\) - 100%\), calc\(100% - var\(--tp-card-min\)\)\)/)
    /* The room is the stylesheet's, from the size it draws the device at; motion animates only how far in it is. */
    expect(body('.tpw')).toMatch(/--tp-room: calc\(var\(--tp-in, 0\) \* \(var\(--tp-dev-w, 0px\) \+ var\(--tp-dev-right\)\)\);/)
    expect(body('.tpw__url')).toMatch(/padding-right: max\(var\(--space-4\), calc\(var\(--tp-room\) - var\(--space-5\)\)\);/)
    for (const [kind, sel] of [['phone', '.tpp'], ['token', '.tph--fob'], ['key', '.tph__keybody'], ['card', '.tph--card'], ['reader', '.tph--reader']]) {
      expect(body(`.tpstage.has-${kind}`)).toBe(` --tp-dev-w: var(--tp-w-${kind}); `)
      expect(body(sel)).toMatch(new RegExp(`width: var\\(--tp-w-${kind}\\)`))
    }
    const s = film('2fa/password/mo-push')
    const phone = still(s, find(s, (b) => b.scene.device?.kind === 'phone'))
    expect(phone).toContain('class="tpstage has-phone"')
    expect(phone).toMatch(/class="tpw" style="--tp-in:1"/)
    expect(still(s, 0)).toMatch(/class="tpstage"><div class="tpw" style="--tp-in:0"/)
    const key = film('2fa/password/yubikey')
    expect(still(key, find(key, (b) => b.scene.device?.kind === 'key'))).toContain('class="tpstage has-key"')
  })

  /* Review, 30 Sep 2026: in the board's popover (334 px) the phone covered
     21 px of the card. Under 420 px the phone is slimmer and nearer the
     edge, and the card may narrow a little further; under 460 px, where the
     stage is at its 288 px floor, the card's spacing tightens so the tallest
     pages keep their last line. */
  it('draws a slimmer phone in a narrow section, and a tighter card at the stage’s floor', () => {
    const narrow = (w: number) => playerCss.replace(/\/\*[\s\S]*?\*\//g, '').split(`@container tplay (max-width: ${w}px) {`)[1].split(/\n\}/)[0]
    expect(narrow(420)).toMatch(/\.tplay__stage \{ --tp-w-phone: 120px; --tp-h-phone: 244px; --tp-dev-right: var\(--space-6\); \}/)
    expect(narrow(420)).toMatch(/\.tpw \{ --tp-card-min: 184px; \}/)
    expect(narrow(460)).toMatch(/\.tpw__card \{ padding-top: var\(--space-5\); gap: var\(--space-4\); \}/)
    expect(narrow(460)).toMatch(/\.tpw__grid \{ width: 92px; \}/)
    /* At 334 px the phone's left edge (stage 332 inside its border, less its margin and width) clears the card's text
       (13 px to the browser's view, the card at its narrowest, less its 12 px side). */
    const phoneLeft = 332 - 16 - 120
    const textRight = 13 + 184 - 12
    expect(phoneLeft - textRight).toBeGreaterThanOrEqual(8)
  })

  it('draws flat surfaces: no gradient anywhere, a plain sunken stage, a solid lock screen', () => {
    const css = playerCss.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(css).not.toMatch(/gradient\(/)
    expect(body('.tplay__stage')).toMatch(/background: var\(--surface-sunken\);/)
    expect(body('.tpp__screen.is-lock')).toMatch(/^ background: var\(--shell-bg\);/)
    /* Each screen is a whole surface, stacked in the bezel, so one fades in over the last and the phone is never empty. */
    expect(body('.tpp__screen')).toMatch(/position: absolute; inset: 0;/)
    expect(body('.tpp')).toMatch(/background: var\(--shell-bg\);/)
  })

  it('stops the caret and the spinner under reduced motion', () => {
    expect(playerCss).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.tpw__caret, \.tpw__spin \{ animation: none; \}/)
  })
})
