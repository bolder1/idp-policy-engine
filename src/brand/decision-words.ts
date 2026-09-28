import type { AccessDecision } from './data'
import type { FactorStrength } from './screens/factor-strength'
import type { FactKey } from './screens/sign-in-facts'

/* -----------------------------------------------------------------------------
   The words a decision, a factor and a sign-in fact are said in.

   One vocabulary, in one file, because four surfaces say the same things: Try
   a sign-in on the board, the Policy testing views, the Monitoring page and the
   guard pages. Each of the specs that designed them reached for its own map —
   `DECISION_SAID`, `DECISION_WORD`, `DECISION_WORDS`, `FIELD_LABEL` — and four
   maps of three phrases is how one surface ends up saying "Allow with MFA"
   beside another that says "Allow with 2FA".

   Three decisions, and exactly these words (owner, 25 Sep 2026): Allow on 1
   factor, Allow with 2FA, Deny. `DecisionChip` and `DECISION_LABEL` still print
   the older "Allow / MFA / Deny" and "1 factor / 2 factors"; they move to these
   words in one copy pass once a testing version is chosen, not piecemeal.

   "Can't tell" is not a decision. It is what a surface says when the facts it
   was given reach more than one, and it is grey text, never a badge, so it can
   never be read as a pass.
   -------------------------------------------------------------------------- */

/** A decision, as a badge or a heading says it. */
export const DECISION_WORDS: Record<AccessDecision, string> = {
  '1fa': 'Allow on 1 factor',
  '2fa': 'Allow with 2FA',
  deny: 'Deny',
}

/** Mid-sentence: "Monitoring: would allow with 2FA". */
export const DECISION_PHRASE: Record<AccessDecision, string> = {
  '1fa': 'allow on 1 factor',
  '2fa': 'allow with 2FA',
  deny: 'deny',
}

/** What a policy that is only watching would have decided. */
export const WOULD_WORDS: Record<AccessDecision, string> = {
  '1fa': 'Would allow on 1 factor',
  '2fa': 'Would allow with 2FA',
  deny: 'Would deny',
}

/** The badge tone for each decision. Kit `Badge` tones, so every decision is the one pill family. */
export const DECISION_TONE: Record<AccessDecision, 'positive' | 'notice' | 'negative'> = {
  '1fa': 'positive',
  '2fa': 'notice',
  deny: 'negative',
}

/** Grey text, never a badge: the facts reach more than one decision. */
export const CANT_TELL = "Can't tell"

/** "Allow on 1 factor or Deny": the distinct decisions, each once, in the order
    given. Try a sign-in passes them in rule order, which is the path it draws. */
export function decisionsOr(ds: readonly AccessDecision[]): string {
  return [...new Set(ds)].map((d) => DECISION_WORDS[d]).join(' or ')
}

/* The decisions, strictest first, for a list that follows no path of its own.

   A standing reason — "Monitoring: can't tell (deny or allow with 2FA)" — sits
   in a column of them, one per policy. In rule order the same two outcomes
   would read one way round on one policy and the other way round on the next,
   so the reason fixes the order instead of inheriting it. */
export const STRICTEST_FIRST: readonly AccessDecision[] = ['deny', '2fa', '1fa']

/** The distinct decisions, each once, strictest first. */
export function strictestFirst(ds: readonly AccessDecision[]): AccessDecision[] {
  const given = new Set(ds)
  return STRICTEST_FIRST.filter((d) => given.has(d))
}

/** A second factor's tier, as the Break-in test and the guard say it. */
export const FACTOR_WORDS: Record<FactorStrength, string> = {
  'phishing-resistant': 'phishing-resistant',
  standard: 'standard',
  weak: 'weak',
  'below-weak': 'below weak',
}

/* The fact a condition could not read, named by the control that states it.

   The word is the form's own label, so "Needs: IP address" names the row the
   admin fills in and "Changed by IP address" names the row they just changed.
   The ten device facts collapse to "Device": the form states a device as one
   preset, and a list reading "Needs: Device integrity, Screen lock, Device
   Agent" asks for three answers to what is one choice. */
export const FACT_WORDS: Record<FactKey, string> = {
  app: 'Application',
  person: 'Person',
  address: 'IP address',
  asn: 'IP address',
  location: 'Place',
  'location.city': 'Place',
  'location.coordinates': 'Place',
  date: 'When',
  time: 'When',
  risk: 'Device risk score',
  'device.platform': 'Device',
  'device.osVersion': 'Device',
  'device.formFactor': 'Device',
  'device.browser': 'Device',
  'device.integrity': 'Device',
  'device.screenLock': 'Device',
  'device.authenticatorVersion': 'Device',
  'device.agent': 'Device',
  'device.registration': 'Device',
  'device.registeredCount': 'Device',
}

export type DeviceFactKey = Extract<FactKey, `device.${string}`>

/* The device facts one by one, for the one place that lists them: the Break-in
   test's facts line. The words are the device detail rows' own labels, so the
   line and the form that states the device agree. */
export const DEVICE_FACT_WORDS: Record<DeviceFactKey, string> = {
  'device.platform': 'Platform',
  'device.osVersion': 'OS version',
  'device.formFactor': 'Device type',
  'device.browser': 'Browser',
  'device.integrity': 'Integrity',
  'device.screenLock': 'Screen lock',
  'device.authenticatorVersion': 'miniOrange Authenticator',
  'device.agent': 'Device Agent',
  'device.registration': 'Registered to this person',
  'device.registeredCount': 'Devices already registered',
}

/** The words for some facts, each once, in first-seen order: "IP address, Place". */
export function factWords(keys: readonly FactKey[]): string[] {
  return [...new Set(keys.map((k) => FACT_WORDS[k]))]
}
