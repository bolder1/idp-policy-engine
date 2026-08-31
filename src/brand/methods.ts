/* ---------------------------------------------------------------------------
   The authentication catalogue, read off the live console — Setup 2FA for
   Admin, 2FA Options For EndUsers, and Alternate 2FA Login Methods.

   The console spreads these 21 methods across five pages grouped three
   different ways, and gives each method FOUR independent states that no single
   screen ever shows together:

     configured — set up with a provider or credentials. Without it the rest is
                  moot, and it is the state buried behind an "Edit" link.
     active     — switched on for the tenant at all.
     allowed    — users may self-select it during enrolment.
     default    — auto-assigned to new users before they enrol in anything.

   "Why can't this user pick Google Authenticator?" currently takes two pages
   and a guess. Holding all four on the method is the point of consolidating.

   Grouping is by ASSURANCE, not by delivery channel the way the console does
   it. Channel is an implementation detail; how phishable a factor is is the
   decision the admin is actually making. The channel is kept alongside because
   admins already know the product by it.
   --------------------------------------------------------------------------- */

export type MethodTier = 'Phishing-resistant' | 'App-based' | 'Delivery-based' | 'Knowledge & tokens'

export type MethodSetting =
  | { kind: 'toggle'; id: string; label: string; help?: string; value: boolean }
  | { kind: 'select'; id: string; label: string; help?: string; value: string; options: string[] }

/* What a method is FOR, which is the axis the screen now sorts on.

   The catalogue used to hold only second factors, and the three ways a session
   can START — password, passkeys, magic link — lived as local state in a
   component, because they were drawn as a block above the list rather than as
   part of it. That made them unsearchable, unfilterable, and absent from every
   count on the page: "21 methods" was never the number of ways into this
   tenant.

   They are catalogue entries now, marked by use. Recovery is deliberately NOT
   one of these values — a method can be a second factor AND a way back in, and
   three of them are, so it stays the separate `alsoRecovery` flag it always
   was. `use` says what a method IS; `alsoRecovery` says what it can also do. */
export type MethodUse = 'primary' | 'second'

export interface AuthMethod {
  id: string
  name: string
  use: MethodUse
  tier: MethodTier
  /** The console's own channel grouping, kept because admins know it. */
  channel: string
  description: string
  configured: boolean
  active: boolean
  allowed: boolean
  enrolled?: number
  /** Only methods needing no prior enrolment can be a tenant-wide default. */
  canBeDefault?: boolean
  /** Shared with the Recovery configuration, so turning it off has reach. */
  alsoRecovery?: boolean
  /** Lives on the method, not in a shared "Advanced Options" list. */
  settings?: MethodSetting[]
  /** SMS, email and voice draw down a purchased balance. */
  balance?: { label: string; remaining: number }
  /* On for everyone and not the tenant's to change — password, and nothing
     else. The row says so in words rather than showing a switch it would have
     to refuse. */
  locked?: boolean
}

export const METHOD_TIERS: { name: MethodTier; blurb: string }[] = [
  {
    name: 'Phishing-resistant',
    blurb: 'Cryptographically bound to the site. Cannot be replayed, intercepted, or handed over by a user who was asked nicely.',
  },
  {
    name: 'App-based',
    blurb: 'A code or prompt on a device the user already registered. Not interceptable in transit, though a convincing prompt can still be approved.',
  },
  {
    name: 'Delivery-based',
    blurb: 'Sent over SMS, email, or voice. Familiar and effective, but the channel itself can be intercepted, redirected, or SIM-swapped.',
  },
  {
    name: 'Knowledge & tokens',
    blurb: 'Something remembered, or a code from a separate device. Useful as a fallback, weak as a primary factor.',
  },
]

export const AUTH_METHODS: AuthMethod[] = [
  /* --- How a session starts ------------------------------------------------
     Three entries that were never in this array and should always have been.

     Password is `configured` and `active` and cannot be otherwise: it is the
     one method every account has whether or not anything else is switched on,
     and a screen listing twenty-one ways to prove an identity while never
     mentioning the one everybody actually uses reads as though passwords had
     been turned off. It carries `locked` so the row states the fact instead of
     offering a switch that refuses the click.

     The other two REPLACE the password rather than following it, which is what
     makes them primary and not second factors. */
  {
    id: 'password',
    use: 'primary',
    name: 'Password',
    tier: 'Knowledge & tokens',
    channel: 'Password',
    description: 'Standard password sign-in, enabled for every user in this tenant.',
    configured: true,
    active: true,
    allowed: true,
    locked: true,
  },
  {
    id: 'passkey-primary',
    use: 'primary',
    name: 'Passkeys',
    tier: 'Phishing-resistant',
    /* Same reasoning as the magic link: the ceremony is biometric, the job is
       starting a session. FIDO2 / Passkey stays in Biometric, because that one
       IS a second factor — the two are the same technology doing two jobs, and
       the family says which job. */
    channel: 'Password',
    description:
      'Sign in with the device — Face ID, a fingerprint, or a security key. No password typed, and nothing a lookalike site can reuse.',
    configured: true,
    active: true,
    allowed: true,
  },
  {
    id: 'magic-link',
    use: 'primary',
    name: 'Magic link',
    tier: 'Delivery-based',
    /* Filed under Password rather than Email. It arrives by email, which is
       what the Email family is about — but this one REPLACES the password
       rather than following it, and filing it by delivery would put a way of
       starting a session inside a family of second factors. */
    channel: 'Password',
    description:
      'A one-click sign-in link sent to the address on the account. Convenient, and only ever as strong as the mailbox behind it.',
    configured: true,
    active: false,
    allowed: false,
  },

  // --- Phishing-resistant ---------------------------------------------------
  {
    id: 'fido2',
    use: 'second',
    name: 'FIDO2 / Passkey',
    tier: 'Phishing-resistant',
    channel: 'Biometric',
    description:
      'Device password, PIN, Face ID, fingerprint, or Touch ID. Bound to the origin, so a lookalike site cannot use it.',
    configured: true,
    active: true,
    allowed: true,
    enrolled: 1203,
  },
  {
    id: 'cac',
    use: 'second',
    name: 'CAC Card',
    tier: 'Phishing-resistant',
    channel: 'Smart Cards',
    description: 'Tap a CAC/PIV card and pick the trusted client certificate the browser presents.',
    configured: true,
    active: false,
    allowed: false,
    settings: [
      {
        kind: 'toggle',
        id: 'ca-chain',
        label: 'CA chain uploaded',
        help: 'Required before a card can be validated.',
        value: false,
      },
    ],
  },

  // --- App-based ------------------------------------------------------------
  {
    id: 'mo-push',
    use: 'second',
    name: 'miniOrange Push',
    tier: 'App-based',
    channel: 'miniOrange Authenticator',
    description: 'Push notification to the miniOrange Authenticator app to accept or deny.',
    configured: true,
    active: true,
    allowed: true,
    enrolled: 1203,
    settings: [
      {
        kind: 'toggle',
        id: 'biometric',
        label: 'Require biometric to approve',
        help: 'The user unlocks with a fingerprint or face before the prompt is accepted.',
        value: true,
      },
      {
        kind: 'toggle',
        id: 'number-match',
        label: 'Number matching',
        help: 'The user types a number shown on screen rather than tapping Accept. This is what stops prompt-bombing.',
        value: true,
      },
    ],
  },
  {
    id: 'mo-otp',
    use: 'second',
    name: 'miniOrange OTP',
    tier: 'App-based',
    channel: 'miniOrange Authenticator',
    description: 'A 6 to 8 digit code from the miniOrange Authenticator app.',
    configured: true,
    active: true,
    allowed: true,
    enrolled: 1203,
  },
  {
    id: 'mo-qr',
    use: 'second',
    name: 'miniOrange QR Verify',
    tier: 'App-based',
    channel: 'miniOrange Authenticator',
    description: 'Scan a barcode on screen with the miniOrange Authenticator app.',
    configured: true,
    active: false,
    allowed: false,
  },
  {
    id: 'google-auth',
    use: 'second',
    name: 'Google Authenticator',
    tier: 'App-based',
    channel: 'Authenticator App',
    description: 'Scan a QR code once; the app then produces a 6-digit code every 30 seconds.',
    configured: true,
    active: true,
    allowed: true,
    enrolled: 847,
  },
  {
    id: 'ms-auth',
    use: 'second',
    name: 'Microsoft Authenticator',
    tier: 'App-based',
    channel: 'Authenticator App',
    description: 'A 6-digit passcode generated by the Microsoft Authenticator app.',
    configured: true,
    active: true,
    allowed: true,
    enrolled: 312,
  },
  {
    id: 'ms-push',
    use: 'second',
    name: 'Microsoft Push',
    tier: 'App-based',
    channel: 'Authenticator App',
    description: 'Push notifications via Azure NPS. Needs the NPS configuration before it can send anything.',
    configured: true,
    active: false,
    allowed: false,
  },
  {
    id: 'authy',
    use: 'second',
    name: 'Authy Authenticator',
    tier: 'App-based',
    channel: 'Authenticator App',
    description: 'A 6-digit passcode generated by the Authy app.',
    configured: true,
    active: false,
    allowed: false,
  },
  {
    id: 'rsa',
    use: 'second',
    name: 'RSA MFA (SecurID)',
    tier: 'App-based',
    channel: 'RSA Authenticator',
    description: 'A SecurID tokencode, an RSA display token, or a push — whichever the user holds.',
    configured: false,
    active: false,
    allowed: false,
  },

  // --- Delivery-based -------------------------------------------------------
  {
    id: 'otp-sms',
    use: 'second',
    name: 'OTP over SMS',
    tier: 'Delivery-based',
    channel: 'SMS',
    description: 'A 4 to 8 digit code by text message.',
    configured: true,
    active: false,
    allowed: true,
    enrolled: 512,
    canBeDefault: true,
    balance: { label: 'SMS transactions', remaining: 0 },
  },
  {
    id: 'sms-link',
    use: 'second',
    name: 'SMS Link',
    tier: 'Delivery-based',
    channel: 'SMS',
    description: 'A text with a link to accept or deny the sign-in.',
    configured: true,
    active: false,
    allowed: false,
    canBeDefault: true,
    balance: { label: 'SMS transactions', remaining: 0 },
  },
  {
    id: 'otp-sms-email',
    use: 'second',
    name: 'OTP over SMS and Email',
    tier: 'Delivery-based',
    channel: 'SMS',
    description: 'The same code sent by both text and email, so either one can be used.',
    configured: true,
    active: false,
    allowed: false,
    canBeDefault: true,
  },
  {
    id: 'otp-email',
    use: 'second',
    name: 'OTP over Email',
    tier: 'Delivery-based',
    channel: 'Email',
    description: 'A 4 to 8 digit code by email.',
    configured: true,
    active: true,
    allowed: true,
    enrolled: 612,
    canBeDefault: true,
    balance: { label: 'Email transactions', remaining: 10 },
  },
  {
    id: 'email-link',
    use: 'second',
    name: 'Email Link',
    tier: 'Delivery-based',
    channel: 'Email',
    description: 'An email with a link to accept or deny the sign-in.',
    configured: true,
    active: false,
    allowed: true,
    canBeDefault: true,
  },
  {
    id: 'otp-alt-email',
    use: 'second',
    name: 'OTP over Alternate Email',
    tier: 'Delivery-based',
    channel: 'Email',
    description: 'A code to the backup address on the profile. Also offered as a recovery method.',
    configured: true,
    active: false,
    allowed: false,
    canBeDefault: true,
    alsoRecovery: true,
  },
  {
    id: 'otp-call',
    use: 'second',
    name: 'OTP over Phone Call',
    tier: 'Delivery-based',
    channel: 'Call Verification',
    description: 'An automated voice call reading out a 4-digit code.',
    configured: true,
    active: false,
    allowed: false,
    balance: { label: 'Call transactions', remaining: 0 },
  },

  // --- Knowledge & tokens ---------------------------------------------------
  {
    id: 'kba',
    use: 'second',
    name: 'Security Questions',
    tier: 'Knowledge & tokens',
    channel: 'Security Questions',
    description: 'Knowledge-based answers only the user should know. Shared with the Recovery configuration.',
    configured: true,
    active: true,
    allowed: true,
    enrolled: 390,
    alsoRecovery: true,
  },
  {
    id: 'grid',
    use: 'second',
    name: 'Grid Pattern',
    tier: 'Knowledge & tokens',
    channel: 'Grid Pattern',
    description: 'The user picks a sequence of squares on a grid at setup and repeats it to sign in.',
    configured: true,
    active: false,
    allowed: false,
    settings: [
      {
        kind: 'select',
        id: 'grid-size',
        label: 'Grid size',
        help: 'Changing this forces everyone already enrolled to set their pattern up again.',
        value: '5x5',
        options: ['4x4', '5x5', '6x6', '7x7', '8x8'],
      },
      {
        kind: 'select',
        id: 'grid-len',
        label: 'Pattern length',
        help: 'How many squares the user selects.',
        value: '5',
        options: ['4', '5', '6', '7', '8'],
      },
      {
        kind: 'toggle',
        id: 'grid-click',
        label: 'Clickable grid',
        help: 'Off means the grid is a reference only and the values are typed.',
        value: true,
      },
    ],
  },
  {
    id: 'yubikey',
    use: 'second',
    name: 'Yubikey Token',
    tier: 'Knowledge & tokens',
    channel: 'Hardware Token',
    description:
      'A USB token that types a one-time key. In OTP mode this is still phishable — use it in FIDO2 mode for phishing resistance.',
    configured: true,
    active: false,
    allowed: false,
  },
  {
    id: 'display-token',
    use: 'second',
    name: 'Display Token',
    tier: 'Knowledge & tokens',
    channel: 'Hardware Token',
    description: 'A keyfob showing a rotating code, assigned per user by serial number.',
    configured: false,
    active: false,
    allowed: false,
    canBeDefault: true,
  },
]

/** The tenant-wide default applied before a user enrols in anything. */
export const DEFAULT_METHOD_ID = 'otp-email'

export const methodById = (id: string) => AUTH_METHODS.find((m) => m.id === id)
export const methodByName = (n: string) => AUTH_METHODS.find((m) => m.name === n)

/* Why a method is not available to users, in the order the admin has to fix
   it. Configuration comes first because activating an unconfigured method
   silently does nothing. */
export function methodBlocker(m: AuthMethod): string | null {
  if (!m.configured) return 'Not configured yet'
  if (!m.active) return 'Switched off for this tenant'
  if (!m.allowed) return 'Not offered to end users'
  return null
}
