/* -----------------------------------------------------------------------------
   The same catalogue, from the person's side of it.

   Measured off login.xecurify.com/moas/showenduserconfiguration — the end-user
   "Setup 2FA" page — rather than invented, because the admin console and the
   end-user page are two views of one catalogue and the differences between them
   are the whole point of this file.

   WHAT THE END-USER PAGE DOES DIFFERENTLY

   · Two independent states per method, not one. `Configured` says the person has
     enrolled — given a phone number, scanned a QR, answered the questions.
     Active/Inactive says which enrolled method actually runs. The live page shows
     all three Email methods as Configured with only one of them Active, so these
     genuinely are separate facts and neither implies the other.
   · One active method at a time, named above the list: "Active Method — OTP over
     Email". Turning one on turns the others off.
   · Configuration is small. Most methods want one piece of identity: a phone
     number or an email address. The interesting exceptions are Security
     Questions, the authenticator apps, and the ones that want nothing at all —
     the CAC Card row has a toggle and no Edit control, because there is nothing
     about it for a person to fill in.

   WHAT THE ADMIN DECIDES AND THE PERSON DOES NOT

   The admin's toggle says a method may exist for this tenant. Nothing here can
   override that, and a method the admin has switched off does not appear on this
   side at all — so the shapes below describe only what a person is asked for
   once a method has been made available to them.
   -------------------------------------------------------------------------- */

/** What the inline form on a method's card asks for. */
export type EnrolKind =
  /** A phone number, and nothing else. SMS and voice. */
  | 'phone'
  /** An email address. */
  | 'email'
  /** A second address, deliberately not the primary one. */
  | 'alt-email'
  /** Both, because the method falls back from one to the other. */
  | 'phone-and-email'
  /** Two questions off a list plus one of your own, each with an answer. */
  | 'questions'
  /** Scan a QR in an app, then type back the code it shows. */
  | 'authenticator'
  /** Register the app on a device so it can be pushed to. */
  | 'push-app'
  /** A hardware token, identified by its serial. */
  | 'token'
  /** Issued by an admin, who assigns it on the tokens page. Nothing for the person to enter. */
  | 'assigned'
  /** The browser's own credential ceremony — Face ID, a security key. */
  | 'passkey'
  /** Nothing to fill in. The card has a toggle and no Edit. */
  | 'none'

export interface EnrolShape {
  kind: EnrolKind
  /** The line the live page puts above the field, where it has one. */
  changeLink?: string
  /** Field label, singular, as the live page words it. */
  label?: string
  placeholder?: string
  /** Shown instead of a form when there is nothing to fill in. */
  note?: string
}

/* Keyed by the catalogue id in methods.ts, so the two stay joined by id rather
   than by name — names drift, and the live page and this prototype already
   disagree on one ("RSA MFA (SecurID)" here, "RSA Authenticator (SecurID)"
   there). */
const SHAPES: Record<string, EnrolShape> = {
  // --- SMS and voice: a phone number ----------------------------------------
  'otp-sms': { kind: 'phone', changeLink: 'Click here to update your phone number', label: 'Phone', placeholder: '+1' },
  'sms-link': { kind: 'phone', changeLink: 'Click here to update your phone number', label: 'Phone', placeholder: '+1' },
  'otp-call': { kind: 'phone', changeLink: 'Click here to update your phone number', label: 'Phone', placeholder: '+1' },

  // --- Email ----------------------------------------------------------------
  'otp-email': { kind: 'email', changeLink: 'Click here to update your email', label: 'Email', placeholder: 'you@company.com' },
  'email-link': { kind: 'email', changeLink: 'Click here to update your email', label: 'Email', placeholder: 'you@company.com' },
  'otp-alt-email': {
    kind: 'alt-email',
    changeLink: 'Click here to update your alternate email',
    label: 'Alternate email',
    placeholder: 'you@personal.com',
  },

  // --- Both, because the method sends to both -------------------------------
  'otp-sms-email': { kind: 'phone-and-email' },

  // --- Knowledge ------------------------------------------------------------
  kba: { kind: 'questions' },

  // --- Authenticator apps: scan, then confirm -------------------------------
  'google-auth': { kind: 'authenticator' },
  'ms-auth': { kind: 'authenticator' },
  authy: { kind: 'authenticator' },
  'mo-otp': { kind: 'authenticator' },
  'mo-qr': { kind: 'authenticator' },

  // --- Push: the app has to be registered to a device -----------------------
  'mo-push': { kind: 'push-app' },
  'ms-push': { kind: 'push-app' },

  // --- Hardware -------------------------------------------------------------
  yubikey: { kind: 'token', label: 'Token serial', placeholder: 'Tap the token to fill this' },
  /* Not a serial the person types. An admin adds each display token and
     assigns it to the person who carries it (Authentication methods > Display
     Token), so the card says so instead of offering a form that would claim a
     token nobody assigned. */
  'display-token': { kind: 'assigned', note: 'Your admin assigns this token.' },
  rsa: { kind: 'token', label: 'RSA token serial', placeholder: 'Printed on the back' },

  // --- The browser's own ceremony -------------------------------------------
  fido2: { kind: 'passkey' },

  /* A reader on the desk, like CAC's card: nothing for the person to type.
     Off for this tenant (21 Sep 2026), so no person sees it yet. */
  'digital-persona': { kind: 'none', note: 'Nothing to set up. Scan your finger on the reader when you are asked.' },

  /* Nothing to fill in. The live page gives this row a toggle and no Edit at
     all — the certificate comes off the card, so there is no question to ask. */
  cac: { kind: 'none', note: 'Nothing to set up. Tap your card when you are asked for it.' },

  /* Not on the live end-user page — this tenant has it switched off — so the
     shape is inferred from what the method is rather than measured. */
  grid: { kind: 'none', note: 'Your grid is issued to you. There is nothing to fill in here.' },
}

export const enrolShapeFor = (methodId: string): EnrolShape => SHAPES[methodId] ?? { kind: 'none' }

/** The preset half of the Security Questions form. The live page offers two of
    these plus one question of your own. */
export const SECURITY_QUESTIONS = [
  'What was the name of your first school?',
  'What was the model of your first car?',
  'In what city were you born?',
  "What is your mother's maiden name?",
  'What was the name of your first pet?',
  'What street did you grow up on?',
]

/* --- The person's own state --------------------------------------------------
   Seeded to exercise all three states a card can be in — enrolled and active,
   enrolled and idle, and not enrolled at all — using methods this tenant
   actually offers end users.

   The account the research was done on had all three Email methods enrolled
   with one active, which is the shape this seed originally copied. It cannot be
   copied here: in this prototype's seed the tenant offers only one of the three
   Email methods to end users, so two of those enrolments would have been for
   methods the person can never see. Passkey stands in as the second enrolment
   instead. */
export interface UserEnrolment {
  /** Method ids the person has completed setup for. */
  configured: string[]
  /** The one that runs. Null only before the first method is enrolled. */
  active: string | null
  /** What they gave us, per method id. */
  values: Record<string, Record<string, string>>
}

export const SEED_ENROLMENT: UserEnrolment = {
  /* Every id here MUST be a method end users can actually reach — configured
     by the tenant, switched on, and offered to end users. A person cannot have
     enrolled in something the admin never offered them, and seeding one is how
     you get a card that claims to be set up on a screen that cannot show it.
     enrolment.test.ts asserts exactly this, because the first version of this
     seed got it wrong: it listed all three Email methods when the tenant only
     offers one. */
  configured: ['otp-email', 'fido2'],
  active: 'otp-email',
  values: {
    'otp-email': { email: 'priya@mo.com' },
    fido2: {},
  },
}

/* --- Whether a card can be switched on ------------------------------------------ */

/** Ready to use: enrolled, nothing to set up, or a token the admin assigned to this person. */
export function readyFor(methodId: string, e: Pick<UserEnrolment, 'configured'>, heldTokens = 0): boolean {
  const kind = enrolShapeFor(methodId).kind
  return e.configured.includes(methodId) || kind === 'none' || (kind === 'assigned' && heldTokens > 0)
}

/** Switching a method on or off. One method is active at a time, and the last one cannot be switched off: turning off the active method hands over to the first other ready method, or leaves it on (`kept`). */
export function activateIn(
  e: UserEnrolment,
  id: string,
  on: boolean,
  ready: string[],
): { next: UserEnrolment; handedTo: string | null; kept: boolean } {
  if (on) return { next: { ...e, active: id }, handedTo: null, kept: false }
  if (e.active !== id) return { next: e, handedTo: null, kept: false }
  const other = ready.find((x) => x !== id) ?? null
  if (!other) return { next: e, handedTo: null, kept: true }
  return { next: { ...e, active: other }, handedTo: other, kept: false }
}

/* --- Validating what a person types ---------------------------------------------- */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE = /^\+?[0-9 ()-]{7,}$/

export const isEmail = (v: string) => EMAIL.test(v.trim())
export const isPhone = (v: string) => PHONE.test(v.trim()) && v.replace(/\D/g, '').length >= 7

/** How the Security Questions form splits the admin's "Questions to configure": presets from the list, the rest the person writes. */
export function questionPlan(total: number): { presets: number; custom: number } {
  const n = Math.max(2, Math.round(total))
  const presets = Math.min(n - 1, SECURITY_QUESTIONS.length)
  return { presets, custom: n - presets }
}

export type EnrolIssue = { field: string; message: string }

/** The first thing wrong with a form, or null when it can be saved. Blank fields are "missing" rather than wrong: `message` is empty for those, and Save is simply off. */
export function enrolIssue(kind: EnrolKind, draft: Record<string, string>, questions = 3): EnrolIssue | null {
  const v = (k: string) => (draft[k] ?? '').trim()
  const blank = (field: string): EnrolIssue => ({ field, message: '' })
  const email = (k: string): EnrolIssue | null =>
    !v(k) ? blank(k) : isEmail(v(k)) ? null : { field: k, message: 'Enter a valid email address.' }
  const phone = (k: string): EnrolIssue | null =>
    !v(k) ? blank(k) : isPhone(v(k)) ? null : { field: k, message: 'Enter a phone number with country code.' }

  switch (kind) {
    case 'phone':
      return phone('phone')
    case 'email':
    case 'alt-email':
      return email('email')
    case 'phone-and-email':
      return phone('phone') ?? email('email')
    case 'token':
      return v('serial') ? null : blank('serial')
    case 'authenticator':
      return v('code').length === 6 ? null : blank('code')
    case 'questions': {
      const { presets, custom } = questionPlan(questions)
      const asked: string[] = []
      for (let i = 0; i < presets + custom; i++) {
        if (!v(`q${i}`)) return blank(`q${i}`)
        if (!v(`a${i}`)) return blank(`a${i}`)
        const q = v(`q${i}`).toLowerCase()
        if (asked.includes(q)) return { field: `q${i}`, message: 'Pick different questions.' }
        asked.push(q)
      }
      return null
    }
    default:
      return null
  }
}
