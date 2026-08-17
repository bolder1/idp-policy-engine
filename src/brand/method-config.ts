import { methodById } from './methods'

/* -----------------------------------------------------------------------------
   What "configured" actually means, per method.

   `methodBlocker()` reports "Not configured yet" as the first thing to fix, and
   until now nothing in the product let you fix it — the flag was readable and
   unreachable. Every method needs different things before it can issue a
   factor, and those differences are the point: an SMS method needs a gateway
   and a sender id, a passkey needs a relying-party id and an attestation
   policy, a hardware token needs a validation server and a client secret.
   One generic "settings" form would have to be the union of all of them, which
   is how you end up with a page of fields that are blank for every method.

   So configuration is a schema per method, rendered by one component. Thirteen
   distinct shapes cover the catalogue's twenty-one methods, because methods
   that share a provider genuinely share a form — the three miniOrange delivery
   variants are one app, and the three TOTP apps are one algorithm.

   Field kinds are deliberately varied because the underlying data is: a secret
   must never render as plain text, a template needs room to be read, a
   question pool is a list you add to, and "which authenticators do you accept"
   is a choice between three named positions rather than a free string.
   -------------------------------------------------------------------------- */

export type ConfigField =
  | { kind: 'text'; id: string; label: string; help?: string; placeholder?: string; required?: boolean; value: string }
  /* `stored` means a value is already saved and is not readable back.

     A configured integration whose secret renders as an empty required field
     tells the admin their working gateway is broken, and the natural response —
     retyping a key they may not have to hand — is how a live integration gets
     taken down while being inspected. Stored secrets show as held, with an
     explicit path to replace them. */
  | { kind: 'secret'; id: string; label: string; help?: string; required?: boolean; stored?: boolean; value: string }
  | { kind: 'select'; id: string; label: string; help?: string; options: string[]; value: string }
  | { kind: 'number'; id: string; label: string; help?: string; min: number; max: number; unit?: string; value: number }
  | { kind: 'toggle'; id: string; label: string; help?: string; value: boolean }
  | { kind: 'radio'; id: string; label: string; help?: string; options: { value: string; label: string; help?: string }[]; value: string }
  | { kind: 'textarea'; id: string; label: string; help?: string; rows?: number; value: string }
  | { kind: 'list'; id: string; label: string; help?: string; itemLabel: string; value: string[] }

export interface MethodConfig {
  /** One line on what this configuration is actually connecting to. */
  blurb: string
  fields: ConfigField[]
}

// --- Shared shapes -----------------------------------------------------------

const totp = (_live: boolean, issuer = 'Acme Corp'): MethodConfig => ({
  blurb: 'Time-based codes are generated on the device from a shared secret. These settings must match what the app expects, or every code it produces will be rejected.',
  fields: [
    { kind: 'text', id: 'issuer', label: 'Issuer label', required: true, value: issuer, placeholder: 'Acme Corp', help: 'Shown above the code in the user’s authenticator app.' },
    { kind: 'select', id: 'digits', label: 'Code length', options: ['6 digits', '8 digits'], value: '6 digits' },
    { kind: 'select', id: 'period', label: 'Rotation', options: ['30 seconds', '60 seconds'], value: '30 seconds' },
    {
      kind: 'number', id: 'drift', label: 'Accepted drift', min: 0, max: 10, unit: 'periods', value: 1,
      help: 'How many periods either side of now are accepted. Zero rejects a phone whose clock is a few seconds out; anything above two widens the window an intercepted code stays valid in.',
    },
  ],
})

const smsGateway = (live: boolean): MethodConfig => ({
  blurb: 'Messages are handed to a gateway, which bills per message and can reject a sender id it has not registered.',
  fields: [
    { kind: 'select', id: 'gateway', label: 'Gateway', options: ['miniOrange (default)', 'Twilio', 'AWS SNS', 'Custom HTTP'], value: 'miniOrange (default)' },
    { kind: 'text', id: 'sender', label: 'Sender id', required: true, value: live ? 'ACMEID' : '', placeholder: 'ACMEID', help: 'Six alphanumeric characters in most regions. India requires a registered header.' },
    { kind: 'secret', id: 'key', label: 'API key', required: true, stored: live, value: '', help: live ? 'A key is stored. Leave blank to keep it, or paste a new one to replace it.' : undefined },
    {
      kind: 'textarea', id: 'template', label: 'Message template', rows: 3,
      value: 'Your {{brand}} verification code is {{otp}}. It expires in {{minutes}} minutes.',
      help: '{{otp}} is required. Some gateways reject messages containing a URL.',
    },
    { kind: 'number', id: 'expiry', label: 'Code expires after', min: 1, max: 30, unit: 'minutes', value: 5 },
  ],
})

const emailSender = (_live: boolean): MethodConfig => ({
  blurb: 'Sent through the tenant’s mail configuration. A from-address on a domain you have not authenticated will be filed as spam, which reads to the user as a factor that simply never arrives.',
  fields: [
    { kind: 'text', id: 'from', label: 'From address', required: true, value: 'no-reply@acme.com', placeholder: 'no-reply@acme.com' },
    { kind: 'text', id: 'fromName', label: 'From name', value: 'Acme Security' },
    { kind: 'text', id: 'replyTo', label: 'Reply-to', value: '', help: 'Optional. Leave blank to discard replies.' },
    {
      kind: 'textarea', id: 'template', label: 'Message body', rows: 4,
      value: 'Your verification code is {{otp}}.\n\nIf you did not request this, someone has your password. Change it now.',
      help: 'The second line matters: an OTP mail is often the only warning a user gets that their password has leaked.',
    },
    { kind: 'number', id: 'expiry', label: 'Code expires after', min: 1, max: 60, unit: 'minutes', value: 10 },
  ],
})

const hardwareToken = (label: string, live: boolean): MethodConfig => ({
  blurb: `${label} codes are verified against a validation server, not by this console. Without credentials for it, every code is rejected.`,
  fields: [
    { kind: 'text', id: 'server', label: 'Validation server', required: true, value: live ? 'https://api.yubico.com/wsapi/2.0/verify' : '', placeholder: 'https://api.yubico.com/wsapi/2.0/verify' },
    { kind: 'text', id: 'client', label: 'Client id', required: true, value: live ? '84291' : '' },
    { kind: 'secret', id: 'secret', label: 'Secret key', required: true, stored: live, value: '' },
    { kind: 'toggle', id: 'inventory', label: 'Require an assigned token', value: true, help: 'On, a user with no token on the Hardware tokens tab cannot use this method however the policy is written.' },
  ],
})

const miniOrangeApp = (_live: boolean): MethodConfig => ({
  blurb: 'The miniOrange app is already bound to this tenant. These settings change what the prompt looks like and how long it stands.',
  fields: [
    {
      kind: 'toggle', id: 'matching', label: 'Number matching', value: true,
      help: 'The user types a number shown on the sign-in screen. Without it, a push prompt can be approved by reflex — which is the whole of MFA fatigue as an attack.',
    },
    { kind: 'number', id: 'timeout', label: 'Prompt expires after', min: 15, max: 300, unit: 'seconds', value: 60 },
    { kind: 'number', id: 'retries', label: 'Prompts per sign-in', min: 1, max: 5, unit: 'attempts', value: 3, help: 'A high number is what makes fatigue attacks practical.' },
    { kind: 'text', id: 'brand', label: 'Name shown in the app', value: 'Acme Corp' },
  ],
})

// --- Per-method -------------------------------------------------------------

const BUILDERS: Record<string, (live: boolean) => MethodConfig> = {
  fido2: () => ({
    blurb: 'A passkey is bound to a domain. The relying-party id is that domain, and it cannot be changed later without invalidating every credential already enrolled.',
    fields: [
      { kind: 'text', id: 'rpId', label: 'Relying-party id', required: true, value: 'acme.com', help: 'The registrable domain. Changing this invalidates every existing passkey.' },
      { kind: 'text', id: 'rpName', label: 'Relying-party name', required: true, value: 'Acme Corp', help: 'Shown by the operating system during the prompt.' },
      {
        kind: 'radio', id: 'attachment', label: 'Accepted authenticators', value: 'any',
        options: [
          { value: 'any', label: 'Any', help: 'Platform biometrics and removable security keys both.' },
          { value: 'platform', label: 'Platform only', help: 'Face ID, Windows Hello. Convenient, and tied to one device.' },
          { value: 'cross-platform', label: 'Security keys only', help: 'Portable between devices, and something the user can leave at home.' },
        ],
      },
      { kind: 'select', id: 'uv', label: 'User verification', options: ['Required', 'Preferred', 'Discouraged'], value: 'Required', help: '“Required” is what makes this a second factor rather than a first.' },
      { kind: 'select', id: 'attestation', label: 'Attestation', options: ['None', 'Indirect', 'Direct'], value: 'None', help: 'Direct attestation identifies the authenticator model, and some privacy regimes treat that as personal data.' },
      { kind: 'list', id: 'origins', label: 'Additional origins', itemLabel: 'origin', value: ['https://app.acme.com'], help: 'Sub-domains that may complete a passkey ceremony for this relying party.' },
    ],
  }),
  cac: (live: boolean) => ({
    blurb: 'Smart-card sign-in trusts a certificate chain. Without a revocation source, a card reported lost on Monday still works on Friday.',
    fields: [
      { kind: 'text', id: 'issuer', label: 'Trusted issuing CA', required: true, value: live ? 'CN=Acme Issuing CA' : '', placeholder: 'CN=Acme Issuing CA' },
      { kind: 'text', id: 'crl', label: 'Revocation list (CRL)', value: '', placeholder: 'http://crl.acme.com/issuing.crl' },
      { kind: 'toggle', id: 'ocsp', label: 'Check OCSP at sign-in', value: true, help: 'Live revocation checking. Off means a revoked card is accepted until the CRL is next fetched.' },
      { kind: 'select', id: 'match', label: 'Match certificate to user by', options: ['Subject UPN', 'Email address', 'Serial number'], value: 'Subject UPN' },
    ],
  }),
  'mo-push': miniOrangeApp,
  'mo-otp': miniOrangeApp,
  'mo-qr': miniOrangeApp,
  'google-auth': totp,
  'ms-auth': totp,
  authy: totp,
  'ms-push': (live: boolean) => ({
    blurb: 'Microsoft push goes through an app registration in your Entra tenant. All three values come from that registration.',
    fields: [
      { kind: 'text', id: 'tenant', label: 'Directory (tenant) id', required: true, value: live ? '9f2c1b40-77aa-4e0e-9c31-2c0f1a5b7d10' : '' },
      { kind: 'text', id: 'client', label: 'Application (client) id', required: true, value: live ? 'a71e33c8-5b90-4d2e-8f77-0a4c9b21e556' : '' },
      { kind: 'secret', id: 'secret', label: 'Client secret', required: true, stored: live, value: '' },
      { kind: 'number', id: 'timeout', label: 'Prompt expires after', min: 15, max: 300, unit: 'seconds', value: 60 },
    ],
  }),
  rsa: (live: boolean) => ({
    blurb: 'SecurID codes are validated by an RSA Authentication Manager. This console only forwards them.',
    fields: [
      { kind: 'text', id: 'server', label: 'Authentication Manager URL', required: true, value: live ? 'https://rsa.acme.com/mfa/v1' : '' },
      { kind: 'text', id: 'client', label: 'Client id', required: true, value: live ? 'acme-idp' : '' },
      { kind: 'secret', id: 'secret', label: 'Access key', required: true, stored: live, value: '' },
    ],
  }),
  'otp-sms': smsGateway,
  'sms-link': smsGateway,
  'otp-sms-email': smsGateway,
  'otp-email': emailSender,
  'email-link': emailSender,
  'otp-alt-email': (live: boolean) => ({
    ...emailSender(live),
    blurb: 'Sent to an address the user nominated separately from their primary. It is a recovery path, so it is only as strong as that second mailbox.',
  }),
  'otp-call': (live: boolean) => ({
    blurb: 'An automated call reads the code aloud. Useful where SMS is unreliable, and the least private factor in the catalogue — it can be overheard.',
    fields: [
      { kind: 'text', id: 'account', label: 'Voice account id', required: true, value: live ? 'acme-voice-01' : '' },
      { kind: 'select', id: 'provider', label: 'Voice provider', options: ['miniOrange (default)', 'Twilio Voice', 'Custom SIP'], value: 'miniOrange (default)' },
      { kind: 'select', id: 'language', label: 'Spoken language', options: ['English (UK)', 'English (US)', 'Hindi', 'German', 'French'], value: 'English (UK)' },
      { kind: 'number', id: 'repeat', label: 'Repeat the code', min: 1, max: 5, unit: 'times', value: 2 },
      { kind: 'number', id: 'retries', label: 'Retry a failed call', min: 0, max: 3, unit: 'times', value: 1 },
    ],
  }),
  kba: () => ({
    blurb: 'Knowledge-based answers are the weakest factor here and the one most often used for recovery. The pool matters: an answer that can be found on a public profile is not a secret.',
    fields: [
      { kind: 'number', id: 'required', label: 'Questions to answer', min: 1, max: 5, unit: 'questions', value: 2 },
      { kind: 'number', id: 'enrol', label: 'Questions to set at enrolment', min: 2, max: 8, unit: 'questions', value: 3 },
      {
        kind: 'list', id: 'pool', label: 'Question pool', itemLabel: 'question',
        value: [
          'What was the name of your first school?',
          'What is your oldest cousin’s first name?',
          'What was the model of your first car?',
        ],
        help: 'Avoid anything answerable from a public profile — birthplace, pet names and school names are all commonly published.',
      },
      { kind: 'toggle', id: 'caseSensitive', label: 'Case-sensitive answers', value: false },
    ],
  }),
  grid: () => ({
    blurb: 'The user remembers a path through a grid of characters. Configuration decides how much entropy that path actually has.',
    fields: [
      { kind: 'select', id: 'size', label: 'Grid size', options: ['4 × 4', '5 × 5', '6 × 6'], value: '5 × 5' },
      { kind: 'number', id: 'length', label: 'Pattern length', min: 3, max: 8, unit: 'cells', value: 4, help: 'Below four cells a 5 × 5 grid has fewer combinations than a four-digit PIN.' },
      { kind: 'toggle', id: 'shuffle', label: 'Shuffle characters each time', value: true, help: 'Off, the grid is the same on every sign-in and a shoulder-surfer only needs to see it once.' },
    ],
  }),
  yubikey: (live: boolean) => hardwareToken('Yubikey', live),
  'display-token': (live: boolean) => hardwareToken('Display token', live),
}

/* The form reflects the method's ACTUAL state.

   A configured integration shows the values it is running on, with its secret
   held rather than blank; an unconfigured one shows what still has to be
   supplied. Building the schema without consulting the catalogue produced the
   contradiction its own test caught — a live SMS gateway rendering an empty
   required API key, which reads as "your working integration is broken", and
   invites the admin to retype a key they may not have to hand. */
export function configFor(id: string): MethodConfig | null {
  const build = BUILDERS[id]
  if (!build) return null
  return build(methodById(id)?.configured ?? false)
}

/** A field the admin must fill before the method can issue anything. A stored
    secret is already supplied — blank here means "unchanged", not "missing". */
export const isMissing = (f: ConfigField) => {
  if (f.kind === 'secret') return !!f.required && !f.stored && f.value.trim() === ''
  return f.kind === 'text' && !!f.required && f.value.trim() === ''
}

/** Which required fields are still blank. Empty means the method is ready. */
export function missingFields(fields: ConfigField[]): ConfigField[] {
  return fields.filter(isMissing)
}

/** Apply a single edit, keeping the union type intact. */
export function setField(fields: ConfigField[], id: string, value: unknown): ConfigField[] {
  return fields.map((f) => (f.id === id ? ({ ...f, value } as ConfigField) : f))
}
