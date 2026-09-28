import type { AccessDecision } from '../data'
import { DECISION_PHRASE, WOULD_WORDS, strictestFirst } from '../decision-words'
import type { TenantResolution, WatchedResult } from './tenant-resolver'

/* -----------------------------------------------------------------------------
   What a monitoring policy would have done with a sign-in, in words.

   A monitoring policy decides nothing, so it is never a decision badge. It is
   an info badge saying what it WOULD decide — "Would allow with 2FA" — beside
   the policy that does decide, and grey "Can't tell" when the facts reach more
   than one answer. When turning it on would still leave another policy
   deciding, that is said too: a monitor on the DEFAULT group beside a custom
   group's policy would watch forever and never apply.

   Try a sign-in's Which policy stage, Policy testing's Which policy list, the
   Decision stage's monitor line and the guard pages all say it this way.
   -------------------------------------------------------------------------- */

export interface WatchingWords {
  /** "Would allow with 2FA" — the badge. Null when it cannot be told. */
  would: string | null
  /* What it could decide when it cannot be told, strictest first, for the one
     Can't tell every surface draws (decision-badge.tsx): "Can't tell · Deny or
     Allow with 2FA". Strictest first rather than in rule order, because these
     sit in a column, one per policy, and should read the same way round. */
  reach: AccessDecision[]
  /** "When on: HRMS access from corporate offices applies first", or null. */
  yields: string | null
}

export function watchingWords(w: WatchedResult): WatchingWords {
  return {
    would: w.decision ? WOULD_WORDS[w.decision] : null,
    reach: w.decision ? [] : strictestFirst(w.possible.map((o) => o.decision)),
    yields: !w.wouldDecide && w.yieldsTo ? `When on: ${w.yieldsTo.policyName} applies first` : null,
  }
}

/* The monitors worth a line under the decision: the ones that, turned on,
   would decide this sign-in themselves, and decide it differently — or could
   not say how. One that would agree, or would still yield to another policy,
   changes nothing and says nothing there. */
export function differingWatch(res: Pick<TenantResolution, 'watching' | 'decision'>): WatchedResult[] {
  return res.watching.filter((w) => w.wouldDecide && !(w.decision !== null && w.decision === res.decision))
}

/* The same fact as a sentence, for a screen reader and for Check a person's
   muted line: "Monitoring: HRMS access from corporate offices would allow
   with 2FA". */
export function watchingSentence(w: WatchedResult): string {
  if (w.decision) return `Monitoring: ${w.policyName} would ${DECISION_PHRASE[w.decision]}`
  const reach = strictestFirst(w.possible.map((o) => o.decision)).map((d) => DECISION_PHRASE[d])
  return `Monitoring: ${w.policyName} can't tell (${reach.join(' or ')})`
}
