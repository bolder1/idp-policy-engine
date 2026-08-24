import { AUTH_METHODS, type AuthMethod } from './methods'
import { FAMILIES, type MfaFamily, type MfaMethod, type MfaSetting } from './mfa-settings'

/* -----------------------------------------------------------------------------
   Joining the catalogue to the sheet.

   Two models describe the same twenty-one methods and neither was written with
   the other in mind. `methods.ts` is what the screens render — it has a
   `channel` string per method and knows about enrolments, balances and blockers.
   `mfa-settings.ts` is the MFA settings spreadsheet, modelled: families that own
   settings, methods that own settings, and where each setting is being migrated
   from. This file is the join, kept out of the screens because getting it wrong
   is silent — a lookup that misses returns undefined and the setting simply does
   not render.

   Everything here is hand-written rather than derived. Lowercasing both sides
   and hoping would connect nine of eleven families and then quietly drop the
   two that matter, which is exactly the failure mode a join like this invites.
   -------------------------------------------------------------------------- */

export type MfaValue = string | number | boolean
export type MfaValues = Record<string, MfaValue>

/* The key has to carry the scope AND the owner, not just the setting id.

   Two independent collisions make the naive key wrong. `otpSettings()` is a
   function invoked once for SMS and once for Email, so 'otp-length' exists
   twice with the same id — key by id alone and changing the SMS code length
   silently changes Email's too. Separately, three ids are used as both a family
   and a method id ('kba', 'grid', 'rsa'), so owner alone is not enough either.
   Scope plus owner plus id is the smallest key that survives both. */
export function settingKey(scope: 'family' | 'method', owner: string, id: string): string {
  return `${scope}:${owner}:${id}`
}

/* `channel` on the catalogue is a display name; the sheet's families have ids.
   Four match exactly, five more match if you ignore case, and two have no string
   relation at all — "Security Questions" is the sheet's "Knowledge questions",
   and "RSA Authenticator" is its "RSA". Those two are the reason this is a table
   and not a `toLowerCase()`. */
export const FAMILY_OF_CHANNEL: Record<string, string> = {
  SMS: 'sms',
  Email: 'email',
  'Authenticator App': 'authenticator',
  'miniOrange Authenticator': 'miniorange',
  'Call Verification': 'call',
  'Hardware Token': 'hardware',
  'Security Questions': 'kba',
  'Grid Pattern': 'grid',
  'Smart Cards': 'smartcard',
  'RSA Authenticator': 'rsa',
  Biometric: 'biometric',
}

/* Method ids agree fifteen times out of twenty-one. The six that disagree are
   all the same shape — the two halves of the name in the other order, or an
   abbreviation — which is precisely why matching them by algorithm would look
   like it worked right up until it matched the wrong pair. */
export const MFA_METHOD_ID: Record<string, string> = {
  fido2: 'passkey',
  'otp-sms': 'sms-otp',
  'otp-sms-email': 'sms-email-otp',
  'otp-email': 'email-otp',
  'otp-alt-email': 'email-alt',
  'otp-call': 'call-otp',
}

export function familyForChannel(channel: string): MfaFamily | undefined {
  const id = FAMILY_OF_CHANNEL[channel]
  return id ? FAMILIES.find((f) => f.id === id) : undefined
}

export function mfaMethodFor(v5Id: string): MfaMethod | undefined {
  const target = MFA_METHOD_ID[v5Id] ?? v5Id
  for (const f of FAMILIES) {
    const hit = f.methods.find((m) => m.id === target)
    if (hit) return hit
  }
  return undefined
}

/** Settings that belong to this method alone. Only miniOrange Push has any. */
export function methodSettingsFor(v5Id: string): MfaSetting[] {
  return mfaMethodFor(v5Id)?.settings ?? []
}

/** Settings shared by every method in the family. */
export function familySettingsFor(channel: string): MfaSetting[] {
  return familyForChannel(channel)?.settings ?? []
}

/* The other methods a family setting also changes.

   Read off the CATALOGUE, never off `FAMILIES[].methods`. The sheet carries two
   methods the catalogue does not — Vasco OTP and Digital Persona — and naming a
   sibling that has no row on the table sends the admin looking for something
   that is not there. The count has to match what they can actually see. */
export function siblingsOf(
  m: Pick<AuthMethod, 'id' | 'channel'>,
  all: AuthMethod[] = AUTH_METHODS,
): { id: string; name: string }[] {
  return all.filter((x) => x.channel === m.channel && x.id !== m.id).map((x) => ({ id: x.id, name: x.name }))
}

/* -----------------------------------------------------------------------------
   What the sheet supersedes.

   Three models describe some of the same settings, and wiring the sheet in
   without saying which one wins would put "Number matching" in the miniOrange
   Push drawer three times and "Pattern length" in the Grid drawer three times.

   The sheet wins, because the whole point of it is that these are tenant
   settings being migrated out of Product Settings and Advanced Options into one
   place. Where an entry below removes something, the sheet has an equivalent
   that replaces it — never a straight deletion.
   -------------------------------------------------------------------------- */

/* The table grew when the whole of the prototype's settings moved into the
   sheet. Anything an admin now tunes on the Settings tab is removed from the
   Connection form, which keeps only what it should ever have held: credentials
   and endpoints. A gateway's API key belongs there. A sender name does not. */



