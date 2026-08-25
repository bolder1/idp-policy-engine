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
  'display-token': { kind: 'token', label: 'Token serial', placeholder: 'Printed on the back' },
  rsa: { kind: 'token', label: 'RSA token serial', placeholder: 'Printed on the back' },

  // --- The browser's own ceremony -------------------------------------------
  fido2: { kind: 'passkey' },

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
    'otp-email': { email: 'mehak.d@acme.com' },
    fido2: {},
  },
}
