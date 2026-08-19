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
      /* The values people actually pick, when the range is wide enough that
         most of it is noise. A 15-to-300 second timeout has 286 settings and
         about three opinions; the slider answers "roughly where" and the box
         answers "exactly what", and neither answers "what do people normally
         use". Omitted where the whole range is small enough to read — nobody
         needs a shortcut to 6 in a range of 4 to 8. */
      presets?: number[]
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
  | {
      kind: 'text'
      value: string
      placeholder?: string
      maxLength?: number
      /** Regex source, anchored, tested against the whole value. */
      pattern?: string
      rule?: string
    }

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

/* What a custom gateway needs before it can send anything.

   SMS and voice ask the same three questions, so they are written once. These
   only exist while the provider is set to *Custom provider* — see `reveals` —
   which is why they are not in the family's settings list: a gateway URL on a
   tenant using the Xecurify default is a field that can only be filled in
   wrongly.

   Deliberately three fields and not a credentials form: the endpoint, how to
   call it, and the key. Anything more (retries, encoding, per-country routing)
   belongs behind a link to the provider's own page, not inlined into a panel
   shared with five other families. */
const gatewaySettings = (channel: 'sms' | 'call'): MfaSetting[] => [
  {
    id: `${channel}-gw-url`,
    label: 'Gateway URL',
    help: 'The endpoint we call to send. Placeholders are substituted before the request.',
    source: '2fa',
    field: {
      kind: 'text',
      value: '',
      placeholder: 'https://gateway.example.com/send?to={phone}&text={code}',
      pattern: '^https://.*',
      rule: 'Must start with https:// — codes are not sent over an unencrypted endpoint.',
    },
  },
  {
    id: `${channel}-gw-method`,
    label: 'Request method',
    help: 'How the gateway expects to be called.',
    source: '2fa',
    field: { kind: 'choice', value: 'POST', options: ['GET', 'POST'] },
  },
  {
    id: `${channel}-gw-auth`,
    label: 'Authorization header',
    help: 'Sent with every request. Stored encrypted and never shown again once saved.',
    source: '2fa',
    field: { kind: 'text', value: '', placeholder: 'Bearer …' },
  },
]

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
    },
  },
  {
    id: 'otp-validity',
    label: 'OTP validity',
    help: 'How long a code stays usable.',
    source: 'prod',
    field: { kind: 'number', value: 3, min: 1, max: 30, unit: 'minutes', presets: [1, 3, 5, 10] },
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
      {
        id: 'sms-sender',
        label: 'Sender name',
        help: 'Shown as the sender on the phone. Carriers restrict this, and some ignore it entirely.',
        source: '2fa',
        field: {
          kind: 'text',
          value: 'Xecurify',
          placeholder: 'Xecurify',
          /* The alphanumeric sender ID limit, which is a carrier rule rather
             than ours. The help line already warned that carriers restrict
             this; saying *how* is the difference between a warning and a
             usable field, because the value that breaks it is rejected at
             delivery time where nobody sees it. */
          maxLength: 11,
          pattern: '^[A-Za-z0-9]*$',
          rule: 'Up to 11 letters and digits. Spaces and punctuation are rejected by most carriers.',
        },
      },
      {
        id: 'sms-provider',
        label: 'SMS provider',
        help: 'The default draws on the purchased balance. A custom gateway bills you directly.',
        source: '2fa',
        field: { kind: 'choice', value: 'Xecurify default', options: ['Xecurify default', 'Custom provider'] },
        reveals: { 'Custom provider': gatewaySettings('sms') },
      },
      {
        id: 'sms-rate',
        label: 'Sends per user per hour',
        help: 'Caps repeated requests. Each send draws on the purchased balance, so this is a spend limit as much as a security one.',
        source: 'new',
        field: { kind: 'number', value: 5, min: 1, max: 20, unit: 'sends', presets: [3, 5, 10] },
      },
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
      {
        id: 'email-subject',
        label: 'Email subject',
        help: 'The subject line of the verification email.',
        source: 'new',
        field: { kind: 'text', value: 'Your login code', placeholder: 'Your login code' },
      },
      {
        id: 'email-magic',
        label: 'Include a one-click link',
        help: 'The email carries the code and a sign-in link. Faster, and the link is forwardable in a way a code is not.',
        source: 'new',
        field: { kind: 'toggle', value: false },
      },
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
      {
        /* Reworded off the live console's Advanced Options, which is broader
           than "send a QR": for miniOrange the setup link goes by SMS or email,
           for the others it is a QR code by email. One switch, both cases. */
        id: 'qr-email',
        label: 'Send authenticator setup instructions',
        help: 'A QR code by email, or a setup link by SMS or email for miniOrange.',
        source: 'advanced',
        field: { kind: 'toggle', value: false },
      },
      {
        /* The live console pairs the switch above with a picker for which app
           the instructions are written for. Without it the instructions cannot
           be produced, so modelling one without the other was a gap. */
        id: 'auth-type',
        label: 'Authenticator type',
        help: 'Which app the setup instructions are written for.',
        source: 'advanced',
        field: {
          kind: 'choice',
          value: 'Google Authenticator',
          options: ['Google Authenticator', 'Microsoft Authenticator', 'Authy Authenticator', 'miniOrange Authenticator'],
        },
      },
      {
        id: 'auth-issuer',
        label: 'Issuer name',
        help: 'What the account is called inside the authenticator app.',
        source: '2fa',
        field: { kind: 'text', value: 'Acme Corp', placeholder: 'Your organisation' },
      },
      {
        id: 'auth-length',
        label: 'Token length',
        source: '2fa',
        field: { kind: 'choice', value: '6 digits', options: ['6 digits', '8 digits'] },
      },
      {
        id: 'auth-validity',
        label: 'Token validity',
        help: 'How long each code stays good before it rotates.',
        source: '2fa',
        field: { kind: 'choice', value: '30 seconds', options: ['30 seconds', '60 seconds'] },
      },
      {
        id: 'backup-codes',
        label: 'Allow backup codes',
        help: 'One-time codes a user can print, for the day the phone is lost. The only way back in without an admin.',
        source: 'new',
        field: { kind: 'toggle', value: false },
      },
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
          {
            id: 'push-timeout',
            label: 'Push timeout',
            help: 'The prompt expires if nobody answers it.',
            source: '2fa',
            field: { kind: 'number', value: 60, min: 15, max: 300, unit: 'seconds', presets: [30, 60, 120] },
          },
          {
            id: 'push-location',
            label: 'Show location in the notification',
            help: 'Where the sign-in came from, in the prompt. It is the detail that makes a stranger obvious.',
            source: 'new',
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
      {
        id: 'call-provider',
        label: 'Call provider',
        source: '2fa',
        field: { kind: 'choice', value: 'Xecurify default', options: ['Xecurify default', 'Custom provider'] },
        reveals: { 'Custom provider': gatewaySettings('call') },
      },
      {
        id: 'call-language',
        label: 'Spoken language',
        help: 'The language the code is read out in.',
        source: '2fa',
        field: { kind: 'choice', value: 'English', options: ['English', 'Spanish', 'French', 'German', 'Hindi'] },
      },
      {
        id: 'call-timeout',
        label: 'Call timeout',
        help: 'How long the call rings before it is abandoned and the attempt fails.',
        source: 'new',
        field: { kind: 'number', value: 45, min: 15, max: 120, unit: 'seconds', presets: [30, 45, 60] },
      },
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
        id: 'token-type',
        label: 'Token type',
        help: 'Time-based rotates on a clock; counter-based advances on each press.',
        source: 'new',
        field: { kind: 'choice', value: 'Time-based (TOTP)', options: ['Time-based (TOTP)', 'Counter-based (HOTP)', 'FIDO2 security key'] },
      },
      {
        id: 'token-drift',
        label: 'Clock drift tolerance',
        help: 'How many steps either side of now still count. Raise it and late codes work; raise it far and replay does too.',
        source: 'new',
        field: { kind: 'number', value: 1, min: 0, max: 10, unit: 'steps' },
      },
      {
        id: 'token-length',
        label: 'Code length',
        help: 'Digits shown on the device.',
        source: 'new',
        field: { kind: 'choice', value: '6 digits', options: ['6 digits', '8 digits'] },
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
        field: { kind: 'number', value: 2, min: 1, max: 5, unit: 'questions' },
      },
      {
        id: 'kba-limit',
        label: 'Questions to configure',
        help: 'How many the user sets during enrolment.',
        source: 'prod',
        field: { kind: 'number', value: 3, min: 1, max: 10, unit: 'questions' },
      },
      {
        id: 'kba-case',
        label: 'Case sensitive answers',
        help: "Off, 'Password' and 'password' are the same answer. On is stricter and locks more people out.",
        source: '2fa',
        field: { kind: 'toggle', value: false },
      },
      {
        id: 'kba-custom',
        label: 'Allow custom questions',
        help: 'Users write their own instead of picking from the pool. More memorable, and easier to answer from a public profile.',
        source: 'new',
        field: { kind: 'toggle', value: false },
      },
      {
        id: 'kba-minlen',
        label: 'Minimum answer length',
        help: 'Short answers are guessable. Long ones get mistyped.',
        source: 'new',
        field: { kind: 'number', value: 3, min: 1, max: 20, unit: 'characters' },
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
        field: { kind: 'number', value: 4, min: 4, max: 8, unit: 'tiles' },
      },
      {
        /* Was in methods.ts as a hand-rolled setting and nowhere in the sheet,
           which made it look like something we invented. It is in the shipping
           product's Advanced Options, so it belongs in the model. */
        id: 'grid-click',
        label: 'Clickable grid',
        help: 'On, users click tiles to enter the pattern. Off, the grid is a reference and they type the values.',
        source: 'advanced',
        field: { kind: 'choice', value: 'Enabled', options: ['Enabled', 'Disabled'] },
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
      {
        id: 'bio-passkeys',
        label: 'Enable passkeys',
        help: 'True passwordless — the user signs in without typing a username first.',
        source: 'new',
        field: { kind: 'toggle', value: false },
      },
      {
        id: 'bio-uv',
        label: 'User verification',
        help: 'Required forces a PIN or a biometric before the key will sign anything.',
        source: '2fa',
        field: { kind: 'choice', value: 'Preferred', options: ['Required', 'Preferred', 'Discouraged'] },
      },
      {
        id: 'bio-attach',
        label: 'Authenticator types',
        help: 'Platform is built in — Touch ID, Windows Hello. Cross-platform is a key you carry.',
        source: '2fa',
        field: { kind: 'choice', value: 'Both', options: ['Platform only', 'Cross-platform only', 'Both'] },
      },
      {
        id: 'bio-attestation',
        label: 'Attestation',
        help: "Checks who made the authenticator. Direct identifies the model, which some privacy regimes object to.",
        source: '2fa',
        field: { kind: 'choice', value: 'None', options: ['None', 'Direct', 'Indirect'] },
      },
      { id: 'bio-fingerprint', label: 'Accept fingerprint', source: 'new', field: { kind: 'toggle', value: true } },
      { id: 'bio-face', label: 'Accept face scan', source: 'new', field: { kind: 'toggle', value: true } },
      { id: 'bio-iris', label: 'Accept iris scan', source: 'new', field: { kind: 'toggle', value: false } },
      {
        id: 'bio-pin',
        label: 'Fall back to a device PIN',
        help: 'Lets the user through with the device passcode when the sensor fails. Convenient, and weaker than the sensor.',
        source: 'new',
        field: { kind: 'toggle', value: true },
      },
    ],
    methods: [
      { id: 'passkey', name: 'FIDO2 / Passkey', blurb: 'A passkey in the device or a security key. Nothing to type and nothing to intercept.', tier: 'Phishing-resistant', enrolled: 438 },
      { id: 'digital-persona', name: 'Digital Persona', blurb: 'Fingerprint readers via the Digital Persona SDK.', tier: 'Phishing-resistant' },
    ],
  },
]

/* --- The settings that are not about one method ------------------------------

   The sheet's last block. These sit outside the families because they govern
   the whole second factor rather than any one way of proving it — which is also
   the answer to the sheet's open question about where the default method goes.
   -------------------------------------------------------------------------- */

export interface GeneralSetting {
  id: string
  label: string
  help?: string
  source?: SettingSource
  value: boolean
}

export const ALTERNATE_SETTINGS: GeneralSetting[] = [
  { id: 'forgot-phone', label: 'Enable Forgot Phone', help: 'Users who cannot reach their enrolled device get a recovery path.', value: true },
  { id: 'user-select', label: 'Let users pick their own method at sign-in', help: 'Otherwise they get the default and nothing else.', value: true },
  { id: 'security-codes', label: 'Let users sign in with security codes', value: true },
]

export const ADMIN_SETTINGS: GeneralSetting[] = [
  { id: 'admin-mfa', label: 'Require MFA for additional admin accounts', help: 'Applies at login, on top of whatever the policy says.', source: 'prod', value: true },
  {
    id: 'passkey-first',
    label: 'Allow passkey as a first factor',
    help: 'Signs the user in outright rather than as a second step. Moves to the policy engine later.',
    source: 'prod',
    value: false,
  },
]

/* Flattened views, for the places that still want one. */
export const ALL_METHODS = FAMILIES.flatMap((f) => f.methods.map((m) => ({ ...m, familyId: f.id, familyName: f.name })))

export const familyOf = (methodId: string) => FAMILIES.find((f) => f.methods.some((m) => m.id === methodId))

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
