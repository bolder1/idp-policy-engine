/* -----------------------------------------------------------------------------
   One app, three lines (owner, 19 Nov 2026: "based on the sign-in or based on choosing a role, the user can see the
   experience ... we can manage everything from one place").

     design    the owner's exploration: everything dev has today
     handoff   the developers' build
     tester    the phase 1 tester build (tester.ts)

   The sign-in screen (SignIn.tsx) takes an email and the email decides the line. Design is locked: reaching it, from
   the sign-in or from the profile menu's Roles, asks for the owner's passphrase (DesignLock.tsx). Every attempt is
   written to an access log the Design line can read. The line is read once, at load, so every flag that reads it is a
   plain constant; signing in, switching and signing out all reload.

   This is a prototype lock, not security: one public bundle carries all the code, and the log lives in this browser.
   -------------------------------------------------------------------------- */

export type Line = 'design' | 'handoff' | 'tester'

export const LINE_NAMES: Record<Line, string> = {
  design: 'Design',
  handoff: 'Dev handoff',
  tester: 'Tester',
}

const LINE_KEY = 'idp.line'
const EMAIL_KEY = 'idp.line-email'
const LOG_KEY = 'idp.design-log'

/** Seed sign-ins. No passwords for Dev handoff and Tester: the email is the whole sign-in. */
export const SEED_EMAILS: Record<string, Line> = {
  'design@prototype.test': 'design',
  'dev@prototype.test': 'handoff',
  'tester@prototype.test': 'tester',
}

/**
 * Which line an email signs in to, or null when the email is refused.
 * The email arrives as typed: any case, maybe with spaces around it.
 */
export function lineForEmail(email: string): Line | null {
  const clean = email.trim().toLowerCase()
  return SEED_EMAILS[clean] ?? lineForDomain(clean)
}

/**
 * Emails not in the seed list: which line, if any, a whole domain gets.
 * `clean` is already trimmed and lower case. Return null to refuse.
 */
function lineForDomain(clean: string): Line | null {
  // TODO(human)
  void clean
  return null
}

/**
 * The views a sign-in may open, its own first (owner, 19 Nov 2026: "the developers cannot see the tester view, only
 * the designer can; the tester can't see the dev view"). Design is offered to everyone, behind the passphrase.
 * `home` is who signed in (the email's line), not the view open now.
 */
export function linesFor(home: Line): Line[] {
  if (home === 'design') return ['design', 'handoff', 'tester']
  if (home === 'handoff') return ['handoff', 'design']
  return ['tester', 'design']
}

/** Whether opening `to` asks for the passphrase: Design does, unless a designer signed in. */
export function needsLock(home: Line | null, to: Line): boolean {
  return to === 'design' && home !== 'design'
}

/**
 * The view a load opens: the stored one when this sign-in may open it, otherwise its own.
 * No home (no email, or one the rules now refuse) means the sign-in screen.
 */
export function resolveLine(home: Line | null, stored: Line | null): Line | null {
  if (!home) return null
  return stored && linesFor(home).includes(stored) ? stored : home
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* Private window or blocked storage: the sign-in lasts until reload. */
  }
}

const isLine = (v: string | null): v is Line => v === 'design' || v === 'handoff' || v === 'tester'

/* The tester deploy (`build:tester`) is always the tester line and needs no sign-in. */
export const FORCED_TESTER = import.meta.env.MODE === 'tester'

const stored = read(LINE_KEY)

/** The email this load signed in with, for the profile menu and the log. */
export const LINE_EMAIL: string = read(EMAIL_KEY) ?? ''

/** Who signed in: the line the email decides. It sets what the profile menu's Role offers. */
export const HOME_LINE: Line | null = FORCED_TESTER ? 'tester' : LINE_EMAIL ? lineForEmail(LINE_EMAIL) : null

/** The view open for this load, or null on the sign-in screen. */
export const LINE: Line | null = FORCED_TESTER ? 'tester' : resolveLine(HOME_LINE, isLine(stored) ? stored : null)

export function signIn(email: string, line: Line) {
  write(EMAIL_KEY, email.trim().toLowerCase())
  write(LINE_KEY, line)
  location.reload()
}

export function switchLine(line: Line) {
  write(LINE_KEY, line)
  location.reload()
}

export function signOut() {
  write(LINE_KEY, null)
  write(EMAIL_KEY, null)
  location.reload()
}

/* ---- The Design lock --------------------------------------------------------------------------------------------
   The passphrase is never in the code. The owner sets it in .env.local (gitignored), and a Vite env var carries only
   its SHA-256 hex: VITE_DESIGN_HASH. With no hash set, Design cannot be unlocked at all. */

const DESIGN_HASH: string = (import.meta.env.VITE_DESIGN_HASH ?? '').trim().toLowerCase()

export const DESIGN_LOCK_SET = DESIGN_HASH.length === 64

async function sha256(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function passphraseMatches(phrase: string): Promise<boolean> {
  if (!DESIGN_LOCK_SET) return false
  return (await sha256(phrase)) === DESIGN_HASH
}

/* ---- The access log --------------------------------------------------------------------------------------------- */

export type Attempt = { at: number; email: string; from: Line | 'sign-in'; passed: boolean }

export function readLog(): Attempt[] {
  try {
    const raw = JSON.parse(read(LOG_KEY) ?? '[]')
    return Array.isArray(raw) ? (raw as Attempt[]) : []
  } catch {
    return []
  }
}

export function logAttempt(a: Omit<Attempt, 'at'>) {
  const next = [{ ...a, at: Date.now() }, ...readLog()].slice(0, 200)
  write(LOG_KEY, JSON.stringify(next))
}

export function clearLog() {
  write(LOG_KEY, null)
}
