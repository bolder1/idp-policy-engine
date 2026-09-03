import type { AccessDecision, Rule } from '../../data'
import type { SimContext, TraceResult } from '../simulate'

/* -----------------------------------------------------------------------------
   The board's own vocabulary — the few types every part of it shares.

   Kept out of the components so the inspector, the stage and the tabs can all
   agree on what "selected" means without importing each other.
   -------------------------------------------------------------------------- */

/** What the inspector is looking at. The start node selects the policy. */
/* What the inspector is looking at.

   By id, not by index, and that difference is two bugs rather than a
   preference. A position is only meaningful against one particular ordering of
   one particular list, and both of those move underneath it: reordering rules
   left the selection pointing at whatever had taken that slot — so dragging
   rule 1 to the bottom swapped the panel onto rule 2 without anybody asking —
   and undo could shorten the list past the stored index, leaving the header
   naming a rule that no longer existed.

   An id needs no arithmetic. It survives reordering because it travels with
   the rule, and when the rule goes the id resolves to nothing, which is
   already the "show the library" case. */
export type Selection = { kind: 'none' } | { kind: 'rule'; id: string } | { kind: 'fallback' }

export type Tab = 'rule' | 'check' | 'impact'

/* One rehearsed sign-in, and where it landed.

   `runId` changes on every run so the stage can replay the cascade for the
   same context twice — a person who presses "Try again" to watch it a second
   time should get a second time. */
export interface Trace {
  ctx: SimContext
  result: TraceResult
  runId: number
}

/* How a decision is named on this surface.

   The model's labels count factors — "1 factor", "2 factors". These name what
   the person signing in experiences, which is the thing an administrator is
   actually choosing between. The MODEL keeps its three values untouched. */
export const DECISION_NAME: Record<AccessDecision, string> = {
  '1fa': 'Let in',
  '2fa': 'Let in, then verify',
  deny: 'Deny',
}

export const DECISION_SHORT: Record<AccessDecision, string> = {
  '1fa': 'Let in',
  '2fa': 'Verify',
  deny: 'Deny',
}

/** Tone class suffix for a decision — shared with the flow rail's colours. */
export const TONE: Record<AccessDecision, 'allow' | 'mfa' | 'deny'> = { '1fa': 'allow', '2fa': 'mfa', deny: 'deny' }

/* The journey a rule produces, as steps a person walks.

   Drawn on the card and in the inspector from the same function, so the two
   cannot disagree about what a rule does to somebody. */
export interface JourneyStep {
  id: string
  label: string
  /** A second line — "or TOTP", "for 30 days". */
  sub?: string
  kind: 'first' | 'second' | 'remember' | 'end' | 'stop'
}

export function journeyOf(rule: Rule): JourneyStep[] {
  if (rule.decision === 'deny') return [{ id: 'stop', label: 'Refused', sub: 'No prompt, no way round', kind: 'stop' }]

  const first: JourneyStep = {
    id: 'first',
    label: rule.firstFactor === 'Specific' ? (rule.firstFactorMethod ?? 'A chosen method') : rule.firstFactor === 'Any' ? 'Any first factor' : 'Password',
    kind: 'first',
  }
  const out: JourneyStep[] = [first]

  if (rule.decision === '2fa') {
    const methods = rule.secondFactorMethods ?? []
    const chain = rule.methodChain ?? []
    const second: JourneyStep =
      rule.secondFactor === 'specific'
        ? {
            id: 'second',
            label: methods[0] ?? 'Nothing chosen',
            sub: methods.length > 1 ? `or ${methods.length - 1} other${methods.length > 2 ? 's' : ''}` : methods.length === 0 ? 'cannot be completed' : undefined,
            kind: 'second',
          }
        : rule.secondFactor === 'chain'
          ? { id: 'second', label: chain.join(' → ') || 'Empty chain', sub: 'every step, in order', kind: 'second' }
          : rule.secondFactor === 'preferred'
            ? { id: 'second', label: 'Their preferred method', sub: rule.preferredFallback ? `else ${rule.preferredFallback}` : undefined, kind: 'second' }
            : { id: 'second', label: 'Any enrolled method', kind: 'second' }
    out.push(second)
    if (rule.rememberMfa) {
      out.push({
        id: 'remember',
        label: rule.forceMfaEachLogin ? 'Asked every time' : `Remembered ${rule.rememberDays ?? 30} days`,
        sub: rule.forceMfaEachLogin ? 'even on a trusted device' : 'on this device',
        kind: 'remember',
      })
    }
  }

  out.push({ id: 'end', label: 'Signed in', kind: 'end' })
  return out
}

/** The three preset clocks the sweeps and rehearsals run at. */
export const CLOCKS = [
  { label: '03:00', minutes: 180, caption: 'Night' },
  { label: '09:30', minutes: 570, caption: 'Working hours' },
  { label: '21:00', minutes: 1260, caption: 'Evening' },
] as const

/** A stable, human short label for a situation axis value. */
export const shortPlace = (p: string) =>
  ({ 'Any location': 'Anywhere', 'Office Network': 'Office', 'Outside all zones': 'Off-network', 'Tor exit node': 'Tor', 'Known proxy': 'Proxy' })[p] ?? p

export const shortDevice = (d: string) =>
  ({ 'New / unknown': 'New device', 'Known < 90 days': 'Known < 90d', 'Known > 90 days': 'Known > 90d', 'Expired trust': 'Expired', 'Managed (MDM)': 'Managed', 'Changed fingerprint': 'Changed' })[d] ?? d

export const shortAuth = (a: string) =>
  ({ 'Normal returning user': 'Returning', 'First time login': 'First login', 'MFA recently reset': 'MFA reset', 'No MFA configured': 'No MFA' })[a] ?? a
