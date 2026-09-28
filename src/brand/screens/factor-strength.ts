import type { Rule } from '../data'
import { methodBlocker, type AuthMethod, type MethodTier } from '../methods'

/* -----------------------------------------------------------------------------
   How strong a second factor is — as an attacker would rank it.

   "2 factors" is one decision and it is not one level of protection. A rule
   that steps up to an OTP over email and a rule that steps up to a passkey
   decide the same thing and stop very different attacks, so a surface that
   compares two versions of a policy by decision alone reports "nothing
   changed" about a rule that just moved from a passkey to email. This is the
   second axis: four ranks, by what it takes to get past the factor.

     phishing-resistant  bound to the site; a proxy that relays the sign-in
                         cannot relay the factor (FIDO2, passkeys, smart cards)
     standard            a code or an approval on a device the person
                         registered; phishable by a live relay, not by
                         interception in transit
     weak                a channel the attacker can take over without the
                         device — SIM swap, number port — or a push anyone
                         can approve by tapping once
     below-weak          proof that ends up in an inbox, or in a memory: the
                         mailbox the password reset also goes to, a security
                         question, a grid printed on paper

   A table by method id, because the catalogue's own `tier` groups methods by
   how they are DELIVERED, not by what they resist — Yubikey sits under
   "Knowledge & tokens" beside security questions, and its own description
   says OTP mode is phishable. Ids the table does not know fall back by tier.
   -------------------------------------------------------------------------- */

export type FactorStrength = 'phishing-resistant' | 'standard' | 'weak' | 'below-weak'

/** Higher is stronger. Compared, never shown. */
export const FACTOR_RANK: Record<FactorStrength, number> = { 'below-weak': 0, weak: 1, standard: 2, 'phishing-resistant': 3 }

const BY_ID: Record<string, FactorStrength> = {
  fido2: 'phishing-resistant',
  'passkey-primary': 'phishing-resistant',
  'digital-persona': 'phishing-resistant',
  cac: 'phishing-resistant',

  /* Microsoft enforced number matching on every Authenticator push from
     8 May 2023, so a Microsoft push cannot be approved by a tired tap — it is
     standard without a setting to check. miniOrange Push is standard only when
     its own number-matching setting is on; see `methodStrength`. */
  'ms-push': 'standard',
  'mo-otp': 'standard',
  'mo-qr': 'standard',
  'google-auth': 'standard',
  'ms-auth': 'standard',
  authy: 'standard',
  rsa: 'standard',
  'display-token': 'standard',
  /* Standard, not phishing-resistant: the catalogue's own description says a
     Yubikey in OTP mode is still phishable, and OTP mode is what this row is. */
  yubikey: 'standard',

  'otp-sms': 'weak',
  'sms-link': 'weak',
  'otp-call': 'weak',

  'otp-email': 'below-weak',
  'email-link': 'below-weak',
  'otp-alt-email': 'below-weak',
  /* Sent to both SMS and email: the email half alone is enough to pass it. */
  'otp-sms-email': 'below-weak',
  kba: 'below-weak',
  grid: 'below-weak',
  'magic-link': 'below-weak',
}

const BY_TIER: Record<MethodTier, FactorStrength> = {
  'Phishing-resistant': 'phishing-resistant',
  'App-based': 'standard',
  'Delivery-based': 'weak',
  'Knowledge & tokens': 'below-weak',
}

/* One method's rank.

   miniOrange Push is the one method whose rank is a setting: with number
   matching the person types the number on the sign-in screen into the app,
   which is what defeats repeated push prompts; without it one tap approves
   whatever prompt arrives. */
export function methodStrength(m: AuthMethod): FactorStrength {
  if (m.id === 'mo-push') {
    const nm = m.settings?.find((s) => s.id === 'number-match')
    return nm?.kind === 'toggle' && nm.value ? 'standard' : 'weak'
  }
  return BY_ID[m.id] ?? BY_TIER[m.tier]
}

const weakest = (ranks: FactorStrength[]): FactorStrength =>
  ranks.reduce<FactorStrength>((lo, s) => (FACTOR_RANK[s] < FACTOR_RANK[lo] ? s : lo), 'phishing-resistant')

/* The second factors a person can actually be offered: second-factor methods
   that are configured, switched on and offered (`methodBlocker` says none of
   those is missing). */
const available = (methods: readonly AuthMethod[]) => methods.filter((m) => m.use === 'second' && methodBlocker(m) === null)

/* The weakest second factor a rule lets a person through with.

   Null unless the rule decides 2 factors — a rule that denies or lets in on
   one factor has no second factor to rank.

   The WEAKEST, because the question is what an attacker faces, and an
   attacker takes the easiest door the rule leaves open:

     specific   the weakest of the named methods. A name the tenant does not
                have, or no names at all, is read as "any", because that is
                what the person would then be offered
     any        the weakest method the tenant has on and offered
     chain      the weakest step of the chain — the model does not say which
                step a relayed sign-in meets, so every step counts
     preferred  the weakest of everything on offer plus the named fallback,
                for the same reason

   With nothing available at all the rank is below-weak: a second factor that
   cannot be delivered is not protecting anything. */
export function ruleFactor(rule: Pick<Rule, 'decision' | 'secondFactor' | 'secondFactorMethods' | 'methodChain' | 'preferredFallback'>, methods: readonly AuthMethod[]): FactorStrength | null {
  if (rule.decision !== '2fa') return null
  const named = (names: readonly string[] | undefined) =>
    (names ?? []).map((n) => methods.find((m) => m.name === n)).filter((m): m is AuthMethod => m !== undefined)
  const anyOf = () => {
    const on = available(methods)
    return on.length === 0 ? 'below-weak' : weakest(on.map(methodStrength))
  }

  if (rule.secondFactor === 'specific') {
    const names = rule.secondFactorMethods ?? []
    const picked = named(names)
    if (picked.length === 0) return anyOf()
    /* A name the tenant does not have stands for "any", beside the ones it does. */
    return weakest([...picked.map(methodStrength), ...(picked.length < names.length ? [anyOf()] : [])])
  }
  if (rule.secondFactor === 'chain') {
    const steps = named(rule.methodChain)
    return steps.length === 0 ? anyOf() : weakest(steps.map(methodStrength))
  }
  if (rule.secondFactor === 'preferred') {
    const pool = [...available(methods), ...named(rule.preferredFallback ? [rule.preferredFallback] : [])]
    return pool.length === 0 ? 'below-weak' : weakest(pool.map(methodStrength))
  }
  return anyOf()
}
