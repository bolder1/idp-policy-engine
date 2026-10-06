import type { AccessDecision } from '../../../data'
import { AUTH_METHODS, type AuthMethod } from '../../../methods'
import { SECURITY_QUESTIONS, enrolShapeFor, type EnrolKind } from '../../../user-methods'
import { maskEmail, promptText, stepLabel, type ScreenStep, type SignInScreens } from '../screens-of'

/* -----------------------------------------------------------------------------
   What they see, played: the pages of one decision (screens-of.ts) turned
   into a short film the person would recognise — the username typing in,
   the password as dots, the code arriving on the phone, the app's home once
   they are in.

   Pure. A script is a list of beats; each beat names the widget that acts
   (the browser, the phone, a mail notification, a security key…), what it
   does (types, presses, arrives, scans), how long it takes, and the whole
   scene as it stands once the beat is over. The player draws the scene and
   animates the one action between it and the beat before, so any beat can
   be jumped to, and reduced motion draws each step's last scene at once.
   A widget that scans draws the scene's finished state only once its scan
   is over; a press that changes a screen (answering the call) leaves the
   change to the beat after it, so the press is seen.

   The chips under the player are the steps: the first factor, the second,
   and where it ends — "Password · Google Authenticator · Signed in", or
   "Password · Duo Push · Not available".

   What is exact is what screens-of says: which first factor, which method
   the rule asks for first, the deny message word for word, the masked
   address. The codes, the phone and the app's home are made up and the
   caption says so.
   -------------------------------------------------------------------------- */

/** The tenant's own sign-in page, where every first page is served. */
export const SIGN_IN_DOMAIN = 'mo.xecurify.com'

// --- What a method is played as ------------------------------------------------------------

/** The film a second factor (or a named first factor) gets. By the method's
    catalogue id where it is one this knows, else by what it asks the person
    for (user-methods.ts), so a new method still plays as its kind. */
export type Play =
  | 'sms-code'
  | 'sms-link'
  | 'call'
  | 'email-code'
  | 'email-link'
  | 'alt-email-code'
  | 'sms-email-code'
  | 'authenticator'
  | 'qr'
  | 'push'
  | 'security-key'
  | 'hardware-token'
  | 'passkey'
  | 'fingerprint'
  | 'smart-card'
  | 'grid'
  | 'questions'
  | 'generic'
  | 'unavailable'

const BY_ID: Record<string, Play> = {
  'otp-sms': 'sms-code',
  'sms-link': 'sms-link',
  'otp-call': 'call',
  'otp-email': 'email-code',
  'email-link': 'email-link',
  'otp-alt-email': 'alt-email-code',
  'otp-sms-email': 'sms-email-code',
  kba: 'questions',
  'google-auth': 'authenticator',
  'ms-auth': 'authenticator',
  authy: 'authenticator',
  'mo-otp': 'authenticator',
  'mo-qr': 'qr',
  'mo-push': 'push',
  'ms-push': 'push',
  yubikey: 'security-key',
  rsa: 'hardware-token',
  'display-token': 'hardware-token',
  fido2: 'passkey',
  'digital-persona': 'fingerprint',
  cac: 'smart-card',
  grid: 'grid',
}

const BY_PROMPT: Record<EnrolKind, Play> = {
  phone: 'sms-code',
  email: 'email-code',
  'alt-email': 'alt-email-code',
  'phone-and-email': 'sms-email-code',
  questions: 'questions',
  authenticator: 'authenticator',
  'push-app': 'push',
  token: 'hardware-token',
  assigned: 'hardware-token',
  passkey: 'passkey',
  none: 'generic',
}

export function playOf(method: AuthMethod | null, prompt: EnrolKind): Play {
  if (!method) return 'unavailable'
  return BY_ID[method.id] ?? BY_PROMPT[prompt]
}

/** The app a phone step opens, as the person knows it. */
function phoneAppOf(method: AuthMethod): string {
  if (method.id.startsWith('mo-')) return 'miniOrange Authenticator'
  if (method.id === 'ms-push') return 'Microsoft Authenticator'
  return method.name
}

/** The same app, as a lock screen's notification heads it. */
function phoneAppShort(method: AuthMethod): string {
  if (method.id.startsWith('mo-')) return 'miniOrange'
  if (method.id === 'ms-push') return 'Microsoft'
  return method.name
}

const setting = (m: AuthMethod | null, id: string) => m?.settings?.find((s) => s.id === id)?.value

// --- The scene ---------------------------------------------------------------------------------

export interface Remember {
  days: number
  ticked: boolean
}

/** What a waiting page shows beside its words. */
export type WaitIcon = 'phone' | 'mail' | 'key' | 'fingerprint' | 'card'

/** The page in the browser window. */
export type Page =
  /** Username, then Next: every sign-in starts here, a passkey's aside. */
  | { kind: 'identify'; username: string }
  | { kind: 'password'; username: string; password: string }
  | { kind: 'passkey-start' }
  | { kind: 'code'; title: string; ask: string; code: string; length: number; remember: Remember | null }
  /** Nothing to type here: the person acts somewhere else — the phone, a mailbox, a key. */
  | { kind: 'wait'; title: string; ask: string; icon: WaitIcon; number: string | null; remember: Remember | null; done: boolean }
  | { kind: 'qr'; ask: string; remember: Remember | null; done: boolean }
  | { kind: 'questions'; items: { question: string; answer: string }[]; remember: Remember | null }
  | { kind: 'grid'; size: number; pattern: number[]; lit: number; remember: Remember | null }
  | { kind: 'key-otp'; ask: string; otp: string; remember: Remember | null }
  | { kind: 'continue'; title: string; ask: string; button: string; remember: Remember | null; done: boolean }
  | { kind: 'unavailable'; name: string }
  | { kind: 'signed-in' }
  | { kind: 'denied'; message: string; action?: string; contact?: string }

export type PhoneScreen =
  | { kind: 'sms'; from: string; text: string; code: string | null; link: string | null; approved: boolean }
  | { kind: 'call'; answered: boolean; code: string }
  | { kind: 'authenticator'; app: string; issuer: string; account: string; code: string }
  | { kind: 'push'; app: string; short: string; account: string; phase: 'notice' | 'ask' | 'biometric' | 'approved'; number: string | null; typed: string }
  | { kind: 'scan'; app: string; done: boolean }

/** What is beside the browser, on the right. */
export type Device =
  | { kind: 'phone'; screen: PhoneScreen }
  | { kind: 'token'; label: string; code: string }
  | { kind: 'key'; touched: boolean }
  | { kind: 'card'; inserted: boolean; person: string }
  | { kind: 'reader'; read: boolean }

/** A mail notification over the top of the stage. */
export interface Toast {
  subject: string
  body: string
  /** The code in it, said in bold. */
  code: string | null
  /** A link or button in it the person presses. */
  action: string | null
  pressed: boolean
}

/** The browser's own sheet, over the page. */
export type Sheet = { kind: 'passkey'; account: string; done: boolean } | { kind: 'certificate'; person: string; chosen: boolean }

export type End = 'signed-in' | 'denied' | 'stuck'

export interface Scene {
  page: Page
  device: Device | null
  toast: Toast | null
  sheet: Sheet | null
  end: End | null
}

// --- Beats -----------------------------------------------------------------------------------

export type Widget = 'browser' | 'phone' | 'toast' | 'sheet' | 'token' | 'key' | 'card' | 'reader'

/** The field a typing beat fills, character by character. */
export type FieldKey = 'username' | 'password' | 'code' | 'number' | 'answer-0' | 'answer-1' | 'grid' | 'otp'

/** What a press lands on, so the player can give it the small press. */
export type PressTarget = 'primary' | 'phone-approve' | 'phone-answer' | 'phone-link' | 'toast' | 'key' | 'card' | 'reader' | 'sheet'

export type Action =
  | { kind: 'show' }
  | { kind: 'type'; field: FieldKey; count: number }
  | { kind: 'press'; target: PressTarget }
  | { kind: 'arrive' }
  | { kind: 'tick' }
  | { kind: 'scan' }
  /** What the step before left in front — its sheet, its mail, its device — goes, before this step's page comes in. */
  | { kind: 'leave' }
  | { kind: 'end' }

export interface Beat {
  /** Which chip it belongs to. */
  step: number
  widget: Widget
  action: Action
  ms: number
  /** The scene once the beat is over. */
  scene: Scene
}

export interface Script {
  decision: AccessDecision
  /** One per step: the first factor, the second, where it ends. */
  chips: string[]
  beats: Beat[]
  end: End
  /** End to end, in ms. */
  total: number
}

export interface ScriptContext {
  appName: string
  person: { name: string; email: string } | null
}

// --- Pace --------------------------------------------------------------------------------------

/** The film is 5–9 s end to end: a sign-in slow enough to follow and short enough to watch twice. */
export const PACE = { min: 5000, max: 9000 } as const

const MS = {
  show: 600,
  page: 460,
  char: 62,
  dot: 64,
  press: 420,
  arrive: 1150,
  read: 650,
  digit: 115,
  tick: 480,
  scan: 950,
  done: 420,
  leave: 360,
  end: 1500,
} as const

// --- Made-up values, stable per sign-in ---------------------------------------------------------

/** FNV-1a: the same person and method get the same code on every play. */
function hash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}

export function digitsFor(seed: string, length: number): string {
  let out = ''
  let h = hash(seed)
  while (out.length < length) {
    out += String(h % 10)
    h = Math.floor(h / 10) || hash(`${seed}${out}`)
  }
  return out
}

const MODHEX = 'cbdefghijklnrtuv'
function modhexFor(seed: string, length: number): string {
  let out = ''
  let h = hash(seed)
  while (out.length < length) {
    out += MODHEX[h % 16]
    h = Math.floor(h / 16) || hash(`${seed}${out}`)
  }
  return out
}

const DOTS = (n: number) => '•'.repeat(n)

// --- The builder ---------------------------------------------------------------------------------

function film(start: Page) {
  let scene: Scene = { page: start, device: null, toast: null, sheet: null, end: null }
  let step = 0
  const beats: Beat[] = []
  const add = (widget: Widget, action: Action, ms: number, patch: Partial<Scene> = {}) => {
    scene = { ...scene, ...patch }
    beats.push({ step, widget, action, ms: Math.round(ms), scene })
  }
  return {
    add,
    get scene() {
      return scene
    },
    /** A change to the page as it stands. */
    page: <K extends Page['kind']>(patch: Partial<Extract<Page, { kind: K }>>) => ({ ...scene.page, ...patch }) as Page,
    next: () => {
      step++
    },
    beats,
  }
}
type Film = ReturnType<typeof film>

const typeMs = (n: number, each: number) => Math.max(360, n * each)

/** Tick "Don't ask again on this device" where the rule offers it. */
function tick(f: Film, remember: Remember | null) {
  if (!remember) return
  f.add('browser', { kind: 'tick' }, MS.tick, { page: f.page({ remember: { ...remember, ticked: true } }) })
}

const verify = (f: Film) => f.add('browser', { kind: 'press', target: 'primary' }, MS.press)

/** The code page, and the code typed into it off whatever brought it. */
function typeCode(f: Film, code: string, remember: Remember | null) {
  f.add('browser', { kind: 'type', field: 'code', count: code.length }, typeMs(code.length, MS.digit), { page: f.page<'code'>({ code }) })
  tick(f, remember)
  verify(f)
}

interface Factor {
  method: AuthMethod | null
  name: string
  prompt: EnrolKind
  ask: string
  masked: string
  remember: Remember | null
}

/* One factor, played: the page, the thing that brings the code or asks for
   the approval, and the press that finishes it. Used for the second factor,
   and for a first factor the rule names in place of the password. */
function playFactor(f: Film, x: Factor, ctx: ScriptContext, seed: string): End | null {
  const play = playOf(x.method, x.prompt)
  const who = ctx.person?.email ?? ''
  const app = ctx.appName
  const title = 'Verify it’s you'
  const remember = x.remember
  const codePage = (length: number, ask = x.ask): Page => ({ kind: 'code', title, ask, code: '', length, remember })
  const code6 = digitsFor(`${seed}|code`, 6)
  const phone = (screen: PhoneScreen): Partial<Scene> => ({ device: { kind: 'phone', screen } })

  switch (play) {
    /* The page that says so; scriptOf closes the film on it, under its own chip. */
    case 'unavailable':
      f.add('browser', { kind: 'show' }, MS.page, { page: { kind: 'unavailable', name: x.name } })
      return 'stuck'

    case 'sms-code': {
      f.add('browser', { kind: 'show' }, MS.page, { page: codePage(6) })
      f.add('phone', { kind: 'arrive' }, MS.arrive, phone({ kind: 'sms', from: 'miniOrange', text: `is your ${app} sign-in code.`, code: code6, link: null, approved: false }))
      typeCode(f, code6, remember)
      return null
    }

    case 'sms-email-code': {
      f.add('browser', { kind: 'show' }, MS.page, { page: codePage(6) })
      f.add('toast', { kind: 'arrive' }, MS.read, { toast: { subject: `Your ${app} sign-in code`, body: '', code: code6, action: null, pressed: false } })
      f.add('phone', { kind: 'arrive' }, MS.read, phone({ kind: 'sms', from: 'miniOrange', text: `is your ${app} sign-in code.`, code: code6, link: null, approved: false }))
      typeCode(f, code6, remember)
      return null
    }

    case 'sms-link': {
      const link = `${SIGN_IN_DOMAIN}/a/${modhexFor(seed, 4)}`
      f.add('browser', { kind: 'show' }, MS.page, {
        page: { kind: 'wait', title: 'Check your phone', ask: 'Open the link sent to your phone', icon: 'phone', number: null, remember, done: false },
      })
      tick(f, remember)
      f.add('phone', { kind: 'arrive' }, MS.arrive, phone({ kind: 'sms', from: 'miniOrange', text: `Approve your ${app} sign-in:`, code: null, link, approved: false }))
      f.add('phone', { kind: 'press', target: 'phone-link' }, MS.press)
      f.add('phone', { kind: 'show' }, MS.done, { ...phone({ kind: 'sms', from: 'miniOrange', text: `Approve your ${app} sign-in:`, code: null, link, approved: true }), page: f.page<'wait'>({ done: true }) })
      return null
    }

    case 'call': {
      const code4 = digitsFor(`${seed}|call`, 4)
      f.add('browser', { kind: 'show' }, MS.page, { page: codePage(4, 'Answer the call and enter the code you hear') })
      f.add('phone', { kind: 'arrive' }, MS.read, phone({ kind: 'call', answered: false, code: code4 }))
      f.add('phone', { kind: 'press', target: 'phone-answer' }, MS.press)
      f.add('phone', { kind: 'show' }, MS.read, phone({ kind: 'call', answered: true, code: code4 }))
      typeCode(f, code4, remember)
      return null
    }

    case 'email-code':
    case 'alt-email-code': {
      const alt = play === 'alt-email-code'
      f.add('browser', { kind: 'show' }, MS.page, { page: codePage(6) })
      f.add('toast', { kind: 'arrive' }, MS.arrive, {
        toast: { subject: `Your ${app} sign-in code`, body: alt ? 'Sent to your alternate email' : '', code: code6, action: null, pressed: false },
      })
      typeCode(f, code6, remember)
      return null
    }

    case 'email-link': {
      f.add('browser', { kind: 'show' }, MS.page, {
        page: { kind: 'wait', title: 'Check your email', ask: x.masked ? `Open the link sent to ${x.masked}` : 'Open the link sent to your email', icon: 'mail', number: null, remember, done: false },
      })
      tick(f, remember)
      f.add('toast', { kind: 'arrive' }, MS.arrive, { toast: { subject: `Sign-in request for ${app}`, body: 'Is this you signing in?', code: null, action: 'Accept', pressed: false } })
      f.add('toast', { kind: 'press', target: 'toast' }, MS.press, { toast: { ...(f.scene.toast as Toast), pressed: true } })
      f.add('browser', { kind: 'show' }, MS.done, { toast: null, page: f.page<'wait'>({ done: true }) })
      return null
    }

    case 'authenticator': {
      const m = x.method!
      f.add('browser', { kind: 'show' }, MS.page, { page: codePage(6) })
      f.add('phone', { kind: 'arrive' }, MS.arrive, phone({ kind: 'authenticator', app: m.name, issuer: 'miniOrange', account: who, code: code6 }))
      typeCode(f, code6, remember)
      return null
    }

    case 'qr': {
      const m = x.method!
      f.add('browser', { kind: 'show' }, MS.page, { page: { kind: 'qr', ask: `Scan this with ${phoneAppOf(m)}`, remember, done: false } })
      tick(f, remember)
      f.add('phone', { kind: 'arrive' }, MS.read, phone({ kind: 'scan', app: phoneAppOf(m), done: false }))
      f.add('phone', { kind: 'scan' }, MS.scan, phone({ kind: 'scan', app: phoneAppOf(m), done: true }))
      f.add('browser', { kind: 'show' }, MS.done, { page: f.page<'qr'>({ done: true }) })
      return null
    }

    case 'push': {
      const m = x.method!
      const number = setting(m, 'number-match') === true ? String(10 + (hash(`${seed}|n`) % 90)) : null
      const biometric = setting(m, 'biometric') === true
      const push = (phase: Extract<PhoneScreen, { kind: 'push' }>['phase'], typed = '') => phone({ kind: 'push', app: phoneAppOf(m), short: phoneAppShort(m), account: who, phase, number, typed })
      f.add('browser', { kind: 'show' }, MS.page, {
        page: {
          kind: 'wait',
          title: 'Check your phone',
          /* The app the phone shows, as the product's own page names it — not the method's console name. */
          ask: number ? `Enter this number in ${phoneAppOf(m)}` : `Approve the request in ${phoneAppOf(m)}`,
          icon: 'phone',
          number,
          remember,
          done: false,
        },
      })
      tick(f, remember)
      f.add('phone', { kind: 'arrive' }, MS.read, push('notice'))
      f.add('phone', { kind: 'show' }, MS.page, push('ask'))
      if (number) f.add('phone', { kind: 'type', field: 'number', count: number.length }, typeMs(number.length, 180), push('ask', number))
      f.add('phone', { kind: 'press', target: 'phone-approve' }, MS.press)
      if (biometric) f.add('phone', { kind: 'scan' }, MS.scan, push('biometric', number ?? ''))
      f.add('phone', { kind: 'show' }, MS.done, { ...push('approved', number ?? ''), page: f.page<'wait'>({ done: true }) })
      return null
    }

    case 'security-key': {
      const otp = `cccc${modhexFor(`${seed}|id`, 8)}${modhexFor(`${seed}|otp`, 32)}`
      f.add('browser', { kind: 'show' }, MS.page, { page: { kind: 'key-otp', ask: `Insert your ${x.name.replace(/ Token$/, '')} and touch it`, otp: '', remember } })
      tick(f, remember)
      f.add('key', { kind: 'arrive' }, MS.read, { device: { kind: 'key', touched: false } })
      f.add('key', { kind: 'press', target: 'key' }, MS.press, { device: { kind: 'key', touched: true } })
      f.add('browser', { kind: 'type', field: 'otp', count: otp.length }, typeMs(otp.length, 14), { page: f.page<'key-otp'>({ otp }) })
      return null
    }

    case 'hardware-token': {
      const m = x.method!
      f.add('browser', { kind: 'show' }, MS.page, { page: codePage(6) })
      f.add('token', { kind: 'arrive' }, MS.arrive, { device: { kind: 'token', label: m.id === 'rsa' ? 'SecurID' : 'Token', code: code6 } })
      typeCode(f, code6, remember)
      return null
    }

    case 'passkey': {
      f.add('browser', { kind: 'show' }, MS.page, { page: { kind: 'continue', title, ask: x.ask, button: 'Continue', remember, done: false } })
      tick(f, remember)
      verify(f)
      f.add('sheet', { kind: 'arrive' }, MS.read, { sheet: { kind: 'passkey', account: who, done: false } })
      f.add('sheet', { kind: 'scan' }, MS.scan, { sheet: { kind: 'passkey', account: who, done: true } })
      f.add('sheet', { kind: 'show' }, MS.done)
      return null
    }

    case 'fingerprint': {
      f.add('browser', { kind: 'show' }, MS.page, {
        page: { kind: 'wait', title, ask: 'Place your finger on the reader', icon: 'fingerprint', number: null, remember, done: false },
      })
      tick(f, remember)
      f.add('reader', { kind: 'arrive' }, MS.read, { device: { kind: 'reader', read: false } })
      f.add('reader', { kind: 'scan' }, MS.scan, { device: { kind: 'reader', read: true } })
      f.add('browser', { kind: 'show' }, MS.done, { page: f.page<'wait'>({ done: true }) })
      return null
    }

    case 'smart-card': {
      const person = ctx.person?.name ?? who
      f.add('browser', { kind: 'show' }, MS.page, {
        page: { kind: 'wait', title, ask: `Insert your ${x.name}`, icon: 'card', number: null, remember, done: false },
      })
      tick(f, remember)
      f.add('card', { kind: 'arrive' }, MS.read, { device: { kind: 'card', inserted: false, person } })
      f.add('card', { kind: 'press', target: 'card' }, MS.press, { device: { kind: 'card', inserted: true, person } })
      f.add('sheet', { kind: 'arrive' }, MS.read, { sheet: { kind: 'certificate', person, chosen: false } })
      f.add('sheet', { kind: 'press', target: 'sheet' }, MS.press, { sheet: { kind: 'certificate', person, chosen: true } })
      return null
    }

    case 'grid': {
      const size = Number(String(setting(x.method, 'grid-size') ?? '5x5').split('x')[0]) || 5
      const length = Number(setting(x.method, 'grid-len') ?? 5) || 5
      const cells = size * size
      const pattern: number[] = []
      for (let i = 0, h = hash(`${seed}|grid`); pattern.length < Math.min(length, cells); i++, h = hash(`${seed}|grid|${i}`)) {
        const c = h % cells
        if (!pattern.includes(c)) pattern.push(c)
      }
      f.add('browser', { kind: 'show' }, MS.page, { page: { kind: 'grid', size, pattern, lit: 0, remember } })
      f.add('browser', { kind: 'type', field: 'grid', count: pattern.length }, typeMs(pattern.length, 200), { page: f.page<'grid'>({ lit: pattern.length }) })
      tick(f, remember)
      verify(f)
      return null
    }

    case 'questions': {
      /* Two of the preset questions, the ones short enough to read whole on a page this size. */
      const qs = [SECURITY_QUESTIONS[2], SECURITY_QUESTIONS[5]]
      const answers = [DOTS(8), DOTS(6)]
      const items = (n: number) => qs.map((question, i) => ({ question, answer: i < n ? answers[i] : '' }))
      f.add('browser', { kind: 'show' }, MS.page, { page: { kind: 'questions', items: items(0), remember } })
      f.add('browser', { kind: 'type', field: 'answer-0', count: answers[0].length }, typeMs(answers[0].length, MS.dot), { page: f.page<'questions'>({ items: items(1) }) })
      f.add('browser', { kind: 'type', field: 'answer-1', count: answers[1].length }, typeMs(answers[1].length, MS.dot), { page: f.page<'questions'>({ items: items(2) }) })
      tick(f, remember)
      verify(f)
      return null
    }

    case 'generic': {
      f.add('browser', { kind: 'show' }, MS.page, { page: { kind: 'continue', title, ask: x.ask, button: 'Continue', remember, done: false } })
      tick(f, remember)
      verify(f)
      f.add('browser', { kind: 'show' }, MS.done, { page: f.page<'continue'>({ done: true }) })
      return null
    }
  }
}

/** Username, then Next. */
function identify(f: Film, username: string) {
  f.add('browser', { kind: 'show' }, MS.show)
  if (username) f.add('browser', { kind: 'type', field: 'username', count: username.length }, typeMs(username.length, MS.char), { page: { kind: 'identify', username } })
  f.add('browser', { kind: 'press', target: 'primary' }, MS.press)
}

/* The first factor. A password, a passkey or a magic link as screens-of
   names them; any other method the rule names in place of the password is
   played as that method, after the username. */
function playFirst(f: Film, step: Extract<ScreenStep, { kind: 'password' | 'first-method' }>, ctx: ScriptContext, seed: string): End | null {
  const username = ctx.person?.email ?? (step.kind === 'password' ? step.username : '')
  if (step.kind === 'password') {
    identify(f, username)
    const pw = DOTS(9)
    f.add('browser', { kind: 'show' }, MS.page, { page: { kind: 'password', username, password: '' } })
    f.add('browser', { kind: 'type', field: 'password', count: pw.length }, typeMs(pw.length, MS.dot), { page: { kind: 'password', username, password: pw } })
    f.add('browser', { kind: 'press', target: 'primary' }, MS.press)
    return null
  }
  if (step.prompt === 'passkey') {
    f.add('browser', { kind: 'show' }, MS.show, { page: { kind: 'passkey-start' } })
    f.add('browser', { kind: 'press', target: 'primary' }, MS.press)
    f.add('sheet', { kind: 'arrive' }, MS.read, { sheet: { kind: 'passkey', account: username, done: false } })
    f.add('sheet', { kind: 'scan' }, MS.scan, { sheet: { kind: 'passkey', account: username, done: true } })
    f.add('sheet', { kind: 'show' }, MS.done)
    return null
  }
  identify(f, username)
  const masked = maskEmail(username)
  if (step.prompt === 'link') {
    f.add('browser', { kind: 'show' }, MS.page, {
      page: { kind: 'wait', title: 'Check your email', ask: masked ? `We sent a sign-in link to ${masked}` : 'We sent you a sign-in link', icon: 'mail', number: null, remember: null, done: false },
    })
    f.add('toast', { kind: 'arrive' }, MS.arrive, { toast: { subject: `Sign in to ${ctx.appName}`, body: 'Your sign-in link', code: null, action: 'Sign in', pressed: false } })
    f.add('toast', { kind: 'press', target: 'toast' }, MS.press, { toast: { ...(f.scene.toast as Toast), pressed: true } })
    f.add('browser', { kind: 'show' }, MS.done, { toast: null, page: f.page<'wait'>({ done: true }) })
    return null
  }
  /* Found by the console's name, it asks what it asks as a second factor;
     a name the catalogue does not hold is a plain "Sign in with …". */
  const method = AUTH_METHODS.find((m) => m.name === step.method)
  if (!method) return playFactor(f, { method: { id: '', name: step.method } as AuthMethod, name: step.method, prompt: 'none', ask: promptText(step), masked, remember: null }, ctx, seed)
  const prompt = enrolShapeFor(method.id).kind
  const ask = promptText({ kind: 'second', method, name: method.name, prompt, masked, rememberDays: null })
  return playFactor(f, { method, name: method.name, prompt, ask, masked, remember: null }, ctx, seed)
}

type PlayedStep = Exclude<ScreenStep, { kind: 'deny' }>

/** One step of the pages, played: a second factor, or the first factor. */
function playStep(f: Film, step: PlayedStep, ctx: ScriptContext, seed: string): End | null {
  if (step.kind !== 'second') return playFirst(f, step, ctx, `${seed}|first`)
  return playFactor(
    f,
    {
      method: step.method,
      name: step.name,
      prompt: step.prompt,
      ask: promptText(step),
      masked: step.masked,
      remember: step.rememberDays !== null ? { days: step.rememberDays, ticked: false } : null,
    },
    ctx,
    `${seed}|${step.method?.id ?? step.name}`,
  )
}

/** The devices a step brings in front, played on its own to find out. */
function devicesOf(step: PlayedStep, ctx: ScriptContext, seed: string): Set<Device['kind']> {
  const dry = film({ kind: 'identify', username: '' })
  playStep(dry, step, ctx, seed)
  return new Set(dry.beats.flatMap((b) => (b.scene.device ? [b.scene.device.kind] : [])))
}

/* Each step starts from a clean scene. What the step before left in front
   leaves on a short beat of its own, ahead of the new page: its sheet and
   its mail always (a sheet or a mail this step needs arrives anew), its
   device unless this step uses the same one, which stays where it is. The
   beat is the new step's, so the step before still ends on its last scene
   and reduced motion draws that. */
function leave(f: Film, keep: ReadonlySet<Device['kind']>) {
  const { sheet, toast, device } = f.scene
  const stays = device && keep.has(device.kind) ? device : null
  if (!sheet && !toast && device === stays) return
  const widget: Widget = sheet ? 'sheet' : toast ? 'toast' : device!.kind
  f.add(widget, { kind: 'leave' }, MS.leave, { sheet: null, toast: null, device: stays })
}

/** The last chip, where the method the rule asks for cannot be offered. */
export const NOT_AVAILABLE = 'Not available'

/** The film for one decision's pages. */
export function scriptOf(screens: SignInScreens, ctx: ScriptContext): Script {
  const seed = `${ctx.person?.email ?? ''}|${screens.ruleName}|${screens.decision}`
  const username = ctx.person?.email ?? ''
  const f = film({ kind: 'identify', username: '' })
  const chips: string[] = []
  let end: End = 'signed-in'
  let stopped = false

  for (const step of screens.steps) {
    if (stopped) break
    if (chips.length > 0) f.next()
    if (step.kind === 'deny') {
      if (chips.length === 0) {
        chips.push('Username')
        identify(f, username)
        f.next()
      }
      chips.push(stepLabel(step))
      f.add('browser', { kind: 'end' }, MS.end, { page: { kind: 'denied', message: step.message, action: step.action, contact: step.contact }, device: null, toast: null, sheet: null, end: 'denied' })
      end = 'denied'
      stopped = true
      continue
    }
    chips.push(stepLabel(step))
    if (chips.length > 1) leave(f, devicesOf(step, ctx, seed))
    const ended = playStep(f, step, ctx, seed)
    if (ended) {
      end = ended
      stopped = true
      /* A method nobody can be offered: it ends there, and says so, as a denial does. */
      if (ended === 'stuck') {
        f.next()
        chips.push(NOT_AVAILABLE)
        f.add('browser', { kind: 'end' }, MS.end, { device: null, toast: null, sheet: null, end: 'stuck' })
      }
    }
  }

  if (!stopped) {
    f.next()
    chips.push('Signed in')
    f.add('browser', { kind: 'end' }, MS.end, { page: { kind: 'signed-in' }, device: null, toast: null, sheet: null, end: 'signed-in' })
  }
  return paced({ decision: screens.decision, chips, beats: f.beats, end, total: 0 })
}

/* Into 5–9 s: a long film is played a little faster, all but its end, and a
   short one holds its end a little longer. */
function paced(s: Script): Script {
  const sum = (bs: readonly Beat[]) => bs.reduce((n, b) => n + b.ms, 0)
  let beats = s.beats
  const last = beats.at(-1)!
  const body = sum(beats) - last.ms
  if (body + last.ms > PACE.max) {
    const k = (PACE.max - last.ms) / body
    beats = beats.map((b, i) => (i === beats.length - 1 ? b : { ...b, ms: Math.max(1, Math.floor(b.ms * k)) }))
  }
  const now = sum(beats)
  if (now < PACE.min) beats = beats.map((b, i) => (i === beats.length - 1 ? { ...b, ms: b.ms + (PACE.min - now) } : b))
  return { ...s, beats, total: sum(beats) }
}

// --- Reading a script --------------------------------------------------------------------------

/** The first beat of each chip. */
export function stepStarts(s: Script): number[] {
  return s.chips.map((_, i) => s.beats.findIndex((b) => b.step === i))
}

/** Where a picked chip plays from: its first beat, past the beat that clears
    the step before, since a jump draws the new scene over whatever is shown. */
export function stepEntry(s: Script, step: number): number {
  const at = s.beats.findIndex((b) => b.step === step)
  return at >= 0 && s.beats[at].action.kind === 'leave' && s.beats[at + 1]?.step === step ? at + 1 : at
}

/** The step whose page a beat shows: a leave beat still shows the page of the step before. */
export function pageStepOf(s: Script, beat: number): number {
  const b = s.beats[beat]
  if (!b) return 0
  return b.action.kind === 'leave' && beat > 0 ? s.beats[beat - 1].step : b.step
}

/** A chip's last beat: what reduced motion draws for it. */
export function stepEnd(s: Script, step: number): number {
  let at = -1
  s.beats.forEach((b, i) => {
    if (b.step === step) at = i
  })
  return at
}

/** How far into the film a beat starts, in ms. */
export function startOf(s: Script, beat: number): number {
  return s.beats.slice(0, beat).reduce((n, b) => n + b.ms, 0)
}

/** How long a chip plays, in ms. */
export function stepMs(s: Script, step: number): number {
  return s.beats.filter((b) => b.step === step).reduce((n, b) => n + b.ms, 0)
}

/* The whole film in one line, for the stage's label: its steps, and what
   the page it ends on says — the deny message word for word, the method
   that is not available. */
export function sayOf(s: Script): string {
  const steps = s.chips.join(', then ')
  const last = s.beats.at(-1)?.scene.page
  if (last?.kind === 'denied') return `${steps}: ${last.message}`
  if (last?.kind === 'unavailable') return `${steps}: ${last.name} is not available`
  return steps
}

/** The scene before the first beat: the sign-in page, empty. */
export const OPENING: Scene = { page: { kind: 'identify', username: '' }, device: null, toast: null, sheet: null, end: null }

/** The scene a beat starts from. */
export const sceneBefore = (s: Script, beat: number): Scene => (beat <= 0 ? OPENING : s.beats[beat - 1].scene)
