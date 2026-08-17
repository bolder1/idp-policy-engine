/* ---------------------------------------------------------------------------
   Plain-English rendering.

   Generated deterministically from the model — never by an LLM, never by
   re-describing the UI. The condition vocabulary is small and closed, so a
   template renderer gives a sentence that is always correct, instant, and
   diffable.

   This exists because of a specific bug in the previous prototype: a rule
   configured as "outside Office Network AND 9-5 OR device is mobile" was
   rendered back to the admin in the Review & Save dialog as "... AND 9-5 AND
   device is mobile". The one artefact an admin reads before committing was
   silently wrong. Here the sentence is produced from the same structure the
   evaluator reads, and `describeConjunction` is the single place the AND/OR
   wording is decided.
   --------------------------------------------------------------------------- */

import { formatMinutes } from './evaluate'
import {
  type AdaptivePolicy,
  type App,
  type Group,
  type IpRange,
  type NamedLocation,
  type Policy,
  type RestrictionKey,
  CHALLENGE_TYPE_LABEL,
  MFA_METHOD_LABEL,
  enabledRestrictions,
} from './model'

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export interface Clause {
  key: RestrictionKey
  text: string
}

/**
 * One readable clause per enabled restriction block.
 *
 * Rule: a clause never contains a free-standing "and" or "or". Lists inside a
 * clause are comma-separated, and any internal disjunction is pushed into a
 * parenthetical. That leaves exactly one free-standing conjunction in the whole
 * sentence — the policy's own — so it cannot be misread as binding to only part
 * of the condition set.
 */
export function describeConditions(
  a: AdaptivePolicy,
  ranges: IpRange[],
  locations: NamedLocation[],
): Clause[] {
  const clauses: Clause[] = []

  if (a.ip.enabled) {
    const names = a.ip.rangeIds
      .map((id) => ranges.find((r) => r.id === id)?.name)
      .filter(Boolean) as string[]
    const inline = a.ip.inlineEntries.map((e) => e.value)
    const all = [...names, ...inline]
    if (all.length === 0) {
      clauses.push({ key: 'ip', text: 'their IP address is unrestricted' })
    } else if (a.ip.rangeAction === 'allow') {
      clauses.push({
        key: 'ip',
        text: `they connect from outside your allowed ranges (${all.join(', ')})`,
      })
    } else {
      clauses.push({ key: 'ip', text: `they connect from a blocked range (${all.join(', ')})` })
    }
  }

  if (a.device.enabled) {
    const reasons = [
      a.device.restrictMobile ? 'mobile' : null,
      'unregistered',
      `Risk Engine ${a.device.riskThreshold}+`,
    ].filter(Boolean) as string[]
    clauses.push({
      key: 'device',
      text: `their device fails the trust check (${reasons.join(', ')})`,
    })
  }

  if (a.location.enabled) {
    const allow = a.location.entries.filter((e) => e.action === 'allow')
    const deny = a.location.entries.filter((e) => e.action === 'deny')
    const nameOf = (id: string) => locations.find((l) => l.id === id)?.name ?? id
    if (allow.length > 0) {
      clauses.push({
        key: 'location',
        text: `they are outside your permitted locations (${allow.map((e) => nameOf(e.locationId)).join(', ')})`,
      })
    } else if (deny.length > 0) {
      clauses.push({
        key: 'location',
        text: `they are in a denied location (${deny.map((e) => nameOf(e.locationId)).join(', ')})`,
      })
    } else {
      clauses.push({ key: 'location', text: 'their location is unrestricted' })
    }
  }

  if (a.time.enabled) {
    const window = `${formatMinutes(a.time.start)}–${formatMinutes(a.time.end)}`
    const days =
      a.time.days.length === 0 || a.time.days.length === 7
        ? 'any day'
        : a.time.days.map((d) => DAY_NAMES[d]).join(', ')
    clauses.push({
      key: 'time',
      text:
        a.time.action === 'allow'
          ? `they sign in outside ${window} (${days})`
          : `they sign in during ${window} (${days})`,
    })
  }

  return clauses
}

/**
 * The single place the conjunction is turned into words. Everything that
 * renders a summary goes through here, so the sentence and the evaluator can
 * never disagree about AND vs OR.
 */
export function describeConjunction(a: AdaptivePolicy): {
  joiner: string
  preface: string
} {
  return a.conjunction === 'all'
    ? { joiner: ' and ', preface: 'all of these are true' }
    : { joiner: ' or ', preface: 'any of these is true' }
}

export function describeOutcome(a: AdaptivePolicy): string {
  switch (a.action) {
    case 'allow':
      return 'let them straight through'
    case 'deny':
      return 'block access'
    case 'challenge':
      return `challenge them with ${CHALLENGE_TYPE_LABEL[a.challengeType]}`
  }
}

export function describeSignIn(policy: Policy): string {
  const base =
    policy.firstFactor === 'password'
      ? 'a password'
      : policy.firstFactor === 'passwordless'
        ? 'passwordless sign-in'
        : 'a magic link'

  if (!policy.mfa.enabled || policy.firstFactor === 'magic-link') return base

  const methods = policy.mfa.methods.map((m) => MFA_METHOD_LABEL[m])
  if (methods.length === 0) return `${base} plus a second factor`
  if (methods.length === 1) return `${base} plus ${methods[0]}`
  return `${base} plus one of (${methods.join(', ')})`
}

/** The full sentence shown live in the builder and on the review dialog. */
export function summarizePolicy(
  policy: Policy,
  app: App,
  group: Group,
  ranges: IpRange[],
  locations: NamedLocation[],
): string {
  const audience = group.isDefault ? 'Anyone' : `Anyone in ${group.name}`
  const head = `${audience} signing in to ${app.name} uses ${describeSignIn(policy)}.`

  const a = policy.adaptive
  if (!a.enabled) return head

  const clauses = describeConditions(a, ranges, locations)
  if (clauses.length === 0) return head

  const { joiner } = describeConjunction(a)
  const conditionText = clauses.map((c) => c.text).join(joiner)
  return `${head} If ${conditionText}, ${describeOutcome(a)}.`
}

/** Compact form for a coverage-grid tooltip or a table row. */
export function summarizeShort(policy: Policy, group: Group): string {
  const a = policy.adaptive
  if (!a.enabled) return `${describeSignIn(policy)} · no adaptive conditions`
  const n = enabledRestrictions(a).length
  const verb = a.action === 'challenge' ? 'Challenge' : a.action === 'deny' ? 'Deny' : 'Allow'
  return `${group.name} · ${n} condition${n === 1 ? '' : 's'} → ${verb}`
}
