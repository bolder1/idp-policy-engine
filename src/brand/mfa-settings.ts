/* -----------------------------------------------------------------------------
   MFA methods, as the settings sheet describes them.

   Transcribed from "MFA Methods settings.xlsx": eleven families, twenty-two
   methods, and every option the sheet marks for migration — with the place it
   is being migrated *from* recorded, because "moved here from Advanced Options"
   is the sentence that stops somebody looking for it in Advanced Options.

   --- Why this replaces the flat list ------------------------------------------

   The old model was twenty-one methods in one list, grouped by tier
   (phishing-resistant, app-based, delivery-based, knowledge). That grouping is
   defensible for *choosing* a method and useless for *configuring* one, and the
   sheet makes the reason obvious: settings do not belong to methods, they belong
   to families.

   · "Send Authenticator QR code via Email" is listed against Google, Microsoft,
     Microsoft Push and Authy — four rows, one setting.
   · OTP Length and OTP Validity are listed against both OTP over SMS and OTP
     over Email.
   · Biometric and Number Matching are listed against miniOrange Push only.

   A flat list has nowhere to put the first two except on every method that
   shares them, which is how you end up with four copies of one checkbox and a
   form nobody trusts. Families give each setting exactly one home, and the
   sheet's own suggestion column says so out loud: *"Move it under Authenticator
   settings"*.

   Tier is not thrown away — it is still on the method, because it is the right
   answer to a different question — but it no longer drives the layout.
   -------------------------------------------------------------------------- */

/** Where an option lives today, so the migration is legible on the screen. */
export type SettingSource = 'prod' | 'advanced' | '2fa' | 'new'

export const SOURCE_LABEL: Record<SettingSource, string> = {
  prod: 'Moved from Product Settings',
  advanced: 'Moved from Advanced Options',
  '2fa': 'Moved from the 2FA section',
  new: 'New',
}

export type MfaField =
  | {
      kind: 'number'
      value: number
      min: number
      max: number
      unit?: string
      warnAbove?: { value: number; why: string }
      /* The values on offer, and the only ones.

         Every one of these settings has a handful of defensible answers and a
         long tail of numbers nobody should pick: a push timeout of 287 seconds
         is not a considered choice, it is a slider that slipped. Naming the set
         turns each row into a decision between known options instead of an
         invitation to land anywhere in a range.

         `min` and `max` stay because they still describe what the field will
         accept, and the tests check every option and default against them — but
         nothing outside this list is offered. */
      options: number[]
    }
  | { kind: 'toggle'; value: boolean }
  | { kind: 'choice'; value: string; options: string[] }
  /* Free text — a sender name, an issuer, a subject line. Added when the whole
     of the prototype's settings moved here: three of its thirty-three options
     are typed rather than chosen, and a kind no renderer knows about draws as
     an empty row, which is worse than not modelling it. Both renderers were
     updated in the same change.

     The constraints came later, and they are here rather than in the renderer
     because they are facts about the field, not about how it is drawn: an SMS
     sender ID is eleven alphanumeric characters because carriers say so, and a
     twelfth character is not a styling problem. `rule` is the sentence shown
     when the value breaks `pattern` — written as what to do, not what went
     wrong. */
  /* Not a value at all: a way through to a surface this panel does not contain.
     Hardware tokens are assigned to people, which is a table of users and
     serials, and inlining that into a settings row would turn the row into a
     screen. The row says the thing exists and where it lives; `cta` is the
     button's words. */
  | { kind: 'link'; cta: string }
  | {
      kind: 'text'
      value: string
      placeholder?: string
      maxLength?: number
      /** Regex source, anchored, tested against the whole value. */
      pattern?: string
      rule?: string
    }

/* The stored value a field opens on.

   Every kind carries one except `link`, which is a way out of the panel rather
   than a setting: there is nothing to remember about having looked at it. It
   reports an empty string so callers reading a fallback do not each need to
   know that, and nothing ever writes the key back. */
export const fieldValue = (f: MfaField): string | number | boolean =>
  'value' in f ? f.value : ''

export interface MfaSetting {
  id: string
  label: string
  /** One line. Anything longer belongs in documentation. */
  help?: string
  source?: SettingSource
  field: MfaField
  /* Settings that only exist because of what this one is set to, keyed by the
     option that brings them out.

     Modelled rather than hard-coded in a screen because the alternative is what
     was there before: "SMS provider" offered *Custom provider*, you picked it,
     and nothing happened — there was nowhere for a gateway URL to live, so the
     option was a dead end that looked like a feature. A choice that gates
     configuration has to be able to carry it.

     Only `choice` and `toggle` gate anything, and the key is the option's own
     label ('Custom provider') or 'on' for a toggle. */
  reveals?: Record<string, MfaSetting[]>
}

export interface MfaMethod {
  id: string
  name: string
  blurb: string
  /** Kept from the old model — right answer to "how strong is this", wrong one
      to "where do I configure it". */
  tier: 'Phishing-resistant' | 'App-based' | 'Delivery-based' | 'Knowledge & tokens'
  /** Only methods needing no prior enrolment can be a tenant-wide default. */
  canBeDefault?: boolean
  enrolled?: number
  /** Draws down a purchased balance. */
  balance?: { label: string; remaining: number }
  /** Settings that genuinely belong to this method alone. */
  settings?: MfaSetting[]
}

export interface MfaFamily {
  id: string
  name: string
  blurb: string
  /** Shared by every method in the family. The sheet's actual shape. */
  settings?: MfaSetting[]
  methods: MfaMethod[]
  /** A note from the sheet's Suggestions column, where it constrains design. */
  note?: string
}

/* OTP length and validity appear twice in the sheet — once for SMS, once for
   Email — with the same bounds. Written once and shared, which is the whole
   argument for family-level settings in miniature. */
const otpSettings = (): MfaSetting[] => [
  {
    id: 'otp-length',
    label: 'OTP length',
    help: 'Digits in the code sent to the user.',
    source: 'prod',
    field: {
      kind: 'number',
      value: 6,
      min: 4,
      max: 8,
      unit: 'digits',
      /* Straight from the sheet: "Radius allows 6 digit OTP, so need to confirm
         before giving the option". A warning rather than a hard cap, because
         tenants that do not front RADIUS are entitled to longer codes. */
      warnAbove: { value: 6, why: 'RADIUS accepts a 6-digit OTP. Anything longer will fail for users signing in through it.' },
      options: [4, 5, 6, 7, 8],
    },
  },
  {
    id: 'otp-validity',
    label: 'OTP validity',
    help: 'How long a code stays usable.',
    source: 'prod',
    field: { kind: 'number', value: 3, min: 1, max: 30, unit: 'minutes', options: [1, 3, 5, 10, 15, 30] },
  },
]

export const FAMILIES: MfaFamily[] = [
  {
    id: 'sms',
    name: 'SMS',
    blurb: 'Codes and links over text. Cheap to run and the easiest factor to intercept.',
    /* The shared OTP pair, plus one that belongs to SMS alone: texts cost money
       per send, so an unbounded retry loop is a bill as well as an attack. */
    settings: [
      ...otpSettings(),
    ],
    methods: [
      { id: 'sms-otp', name: 'OTP over SMS', blurb: 'A 4 to 8 digit code by text message.', tier: 'Delivery-based', canBeDefault: true, enrolled: 512, balance: { label: 'SMS transactions', remaining: 0 } },
      { id: 'sms-link', name: 'SMS Link', blurb: 'A text with a link to accept or deny the sign-in.', tier: 'Delivery-based', canBeDefault: true, balance: { label: 'SMS transactions', remaining: 0 } },
      { id: 'sms-email-otp', name: 'OTP over SMS and Email', blurb: 'The same code by both, so either one gets the user in.', tier: 'Delivery-based', canBeDefault: true },
    ],
  },
  {
    id: 'email',
    name: 'Email',
    blurb: 'Codes and links to the address on the account.',
    settings: [
      ...otpSettings(),
    ],
    methods: [
      { id: 'email-otp', name: 'OTP over Email', blurb: 'A 4 to 8 digit code by email.', tier: 'Delivery-based', canBeDefault: true, enrolled: 612 },
      { id: 'email-link', name: 'Email Link', blurb: 'An email with a link to accept or deny the sign-in.', tier: 'Delivery-based', canBeDefault: true },
      { id: 'email-alt', name: 'OTP over Alternate Email', blurb: 'A code to the backup address. Also offered as a recovery method.', tier: 'Delivery-based', canBeDefault: true },
    ],
  },
  {
    id: 'authenticator',
    name: 'Authenticator app',
    blurb: 'Third-party TOTP apps. The codes are generated on the device and never travel.',
    /* The sheet lists this against all four methods and its Suggestions column
       says to move it under the family. One setting, one home. */
    note: 'The sheet lists the QR-by-email option against all four apps. It is one setting, so it lives here.',
    settings: [
    ],
    methods: [
      { id: 'google-auth', name: 'Google Authenticator', blurb: 'Scan a QR code once; the app then produces a 6-digit code every 30 seconds.', tier: 'App-based', enrolled: 847 },
      { id: 'ms-auth', name: 'Microsoft Authenticator', blurb: 'A 6-digit passcode generated by the Microsoft app.', tier: 'App-based', enrolled: 312 },
      { id: 'ms-push', name: 'Microsoft Push', blurb: 'Push notifications via Azure NPS. Needs the NPS configuration before it can send.', tier: 'App-based' },
      { id: 'authy', name: 'Authy Authenticator', blurb: 'A 6-digit passcode generated by the Authy app.', tier: 'App-based' },
    ],
  },
  {
    id: 'miniorange',
    name: 'miniOrange Authenticator',
    blurb: 'Our own app. The only family where we control both ends, so it carries the extra checks.',
    methods: [
      { id: 'mo-otp', name: 'miniOrange OTP', blurb: 'A 6 to 8 digit code from the miniOrange Authenticator app.', tier: 'App-based', enrolled: 1203 },
      {
        id: 'mo-push',
        name: 'miniOrange Push',
        blurb: 'Push notification to the app, accepted or denied in one tap.',
        tier: 'App-based',
        enrolled: 1203,
        /* Genuinely method-level: neither applies to OTP or QR Verify. */
        settings: [
          {
            id: 'push-biometric',
            label: 'Require biometric to approve',
            help: 'The tap has to be confirmed with a fingerprint or face.',
            source: 'advanced',
            field: { kind: 'toggle', value: true },
          },
          {
            id: 'push-number',
            label: 'Number matching',
            help: 'The sign-in screen shows a number the user has to pick in the app. Without it, a push prompt can be approved by reflex.',
            source: 'advanced',
            field: { kind: 'toggle', value: true },
          },
        ],
      },
      { id: 'mo-qr', name: 'miniOrange QR Verify', blurb: 'Scan a barcode on screen with the app.', tier: 'App-based' },
    ],
  },
  {
    id: 'call',
    name: 'Call verification',
    blurb: 'An automated voice call reading out a code.',
    settings: [
    ],
    methods: [
      { id: 'call-otp', name: 'OTP over Phone Call', blurb: 'An automated voice call reading out a 4-digit code.', tier: 'Delivery-based', canBeDefault: true, balance: { label: 'Call transactions', remaining: 0 } },
    ],
  },
  {
    id: 'hardware',
    name: 'Hardware token',
    blurb: 'A physical device the user carries. Nothing to phish and nothing to intercept.',
    /* The sheet's Suggestions column is explicit: keep assignment where it is.
       Following it rather than absorbing the section. */
    note: 'Token assignment stays its own section under 2FA, which is what the sheet recommends.',
    settings: [
      {
        id: 'token-assign',
        label: 'Assign hardware tokens',
        help: 'Bind a Yubikey, display token or Vasco device to a user. A token does nothing until it is assigned.',
        source: '2fa',
        field: { kind: 'link', cta: 'Open assignment' },
      },
    ],
    methods: [
      { id: 'yubikey', name: 'Yubikey', blurb: 'A hardware key producing a one-time code.', tier: 'Knowledge & tokens' },
      { id: 'display-token', name: 'Display token', blurb: 'A keyfob showing a rotating code.', tier: 'Knowledge & tokens' },
      { id: 'vasco', name: 'Vasco OTP', blurb: 'Vasco/OneSpan hardware tokens.', tier: 'Knowledge & tokens' },
    ],
  },
  {
    id: 'kba',
    name: 'Knowledge questions',
    blurb: 'Something the user remembers. Weak alone, useful as a fallback.',
    settings: [
      {
        id: 'kba-verify',
        label: 'Questions to verify',
        help: 'How many of the configured questions a user must answer to get in.',
        source: 'prod',
        field: { kind: 'number', value: 2, min: 1, max: 5, unit: 'questions', options: [1, 2, 3, 4, 5] },
      },
      {
        id: 'kba-limit',
        label: 'Questions to configure',
        help: 'How many the user sets during enrolment.',
        source: 'prod',
        field: { kind: 'number', value: 3, min: 1, max: 10, unit: 'questions', options: [3, 5, 8, 10] },
      },
      {
        id: 'kba-change',
        label: 'Let users change their questions',
        source: 'prod',
        field: { kind: 'toggle', value: true },
      },
    ],
    methods: [{ id: 'kba', name: 'Security Questions', blurb: 'Users answer the questions they configured at enrolment.', tier: 'Knowledge & tokens' }],
  },
  {
    id: 'grid',
    name: 'Grid pattern',
    blurb: 'A card of characters; the user reads a pattern off it.',
    /* All three read off the live console's Advanced Options rather than the
       spreadsheet, which was short on this family: the sheet had three sizes
       where the product ships five, no clickable option at all, and a pattern
       length starting at 3 where the product starts at 4. */
    settings: [
      {
        id: 'grid-size',
        label: 'Grid size',
        help: 'Changing it forces every user who has already set a pattern to configure it again.',
        source: 'advanced',
        field: { kind: 'choice', value: '5x5', options: ['4x4', '5x5', '6x6', '7x7', '8x8'] },
      },
      {
        id: 'grid-length',
        label: 'Pattern length',
        help: 'How many tiles the user picks. Also forces a reconfigure for anyone already set up.',
        source: 'advanced',
        field: { kind: 'number', value: 4, min: 4, max: 8, unit: 'tiles', options: [4, 5, 6, 7, 8] },
      },
    ],
    methods: [{ id: 'grid', name: 'Grid pattern', blurb: 'A code read off a personal grid card.', tier: 'Knowledge & tokens' }],
  },
  {
    id: 'smartcard',
    name: 'Smart cards',
    blurb: 'A certificate on a physical card, presented by the browser.',
    methods: [{ id: 'cac', name: 'CAC / PIV card', blurb: 'Tap a CAC/PIV card and pick the client certificate.', tier: 'Phishing-resistant' }],
  },
  {
    id: 'rsa',
    name: 'RSA',
    blurb: 'RSA SecurID tokencodes, softtokens and push.',
    note: 'RSA has its own settings modal in the sheet, and it is large. It is a link out rather than an inline form — a form this size inside a family panel would swamp every other family.',
    methods: [{ id: 'rsa', name: 'RSA MFA (SecurID)', blurb: 'A SecurID tokencode, an RSA display token, or a push.', tier: 'Knowledge & tokens' }],
  },
  {
    id: 'biometric',
    name: 'Biometric',
    blurb: 'Bound to the device and to the origin. Cannot be replayed or handed over.',
    /* Three toggles rather than one multi-select control.

       The prototype models the accepted types as a chip group, which is a
       fourth field kind — and a kind that any renderer not updated for it
       draws as nothing at all, which is the silent failure this file keeps
       trying to avoid. Three toggles say the same thing using a kind every
       renderer already handles. */
    settings: [
    ],
    methods: [
      { id: 'passkey', name: 'FIDO2 / Passkey', blurb: 'A passkey in the device or a security key. Nothing to type and nothing to intercept.', tier: 'Phishing-resistant', enrolled: 438 },
      { id: 'digital-persona', name: 'Digital Persona', blurb: 'Fingerprint readers via the Digital Persona SDK.', tier: 'Phishing-resistant' },
    ],
  },
]

/** Every setting on screen, with the level it belongs to. Used by the tests to
    assert nothing from the sheet was dropped in transcription. */
export function allSettings(): { familyId: string; methodId?: string; setting: MfaSetting }[] {
  const out: { familyId: string; methodId?: string; setting: MfaSetting }[] = []

  /* Revealed settings are walked too. They store against the same scope and
     owner as the row that reveals them, so they share its key namespace — and a
     walk that skipped them would quietly exempt them from the collision test
     that is the whole reason this function exists.

     Deduped by id across one parent's branches: two options are never both on,
     so two branches naming the same setting are one setting with one value
     rather than a clash. */
  const walk = (familyId: string, methodId: string | undefined, s: MfaSetting) => {
    out.push({ familyId, methodId, setting: s })
    const seen = new Set<string>()
    for (const branch of Object.values(s.reveals ?? {})) {
      for (const child of branch) {
        if (seen.has(child.id)) continue
        seen.add(child.id)
        walk(familyId, methodId, child)
      }
    }
  }

  for (const f of FAMILIES) {
    for (const s of f.settings ?? []) walk(f.id, undefined, s)
    for (const m of f.methods) for (const s of m.settings ?? []) walk(f.id, m.id, s)
  }
  return out
}
