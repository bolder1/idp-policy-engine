import type { AccessDecision, Policy } from '../data'
import { AUTH_METHODS } from '../methods'
import {
  acceptanceOptions,
  applyBreakInFix,
  breakInRow,
  changedCounts,
  countsMoved,
  fixFor,
  fixToast,
  secondFactorSaid,
  type Accepted,
  type BreakInFix,
  type BreakInRow,
  type CountKey,
} from './break-in-model'
import { TYPED_DECK, countRounds, judgeAttempt, type AttemptRound, type BreakInCounts, type TypedChallenge } from './gauntlet'
import { sweepTenant } from './impact-arena'
import { personOf, tracePolicy, type MatchOptions, type PolicyTrace, type SignInFacts, type SimEnv } from './simulate'
import { evaluatedList, resolveSignIn, tierOf, type PolicyTier, type TenantResolution } from './tenant-resolver'
import { loosens, whatChangesLine, type WhatChangesLine } from './what-changes'

/* -----------------------------------------------------------------------------
   Break-in attempts on an application, across the tenant.

   The Break-in test asked one policy: deal the fifteen scripted sign-ins at it
   and count what came back. That was the builder's question, and the builder
   keeps it hidden (board/test-mode.ts). Access checks asks the tenant's: of
   every policy here, which one decides this person on this application, and
   what does it decide. The owner wanted the deck there (1 Oct 2026: "can we
   implement it in the check part? as a suggestion inside conflicts or
   somewhere else" — then "go with your picks, start building"), and asking it
   there changes what a card is asked.

   So each card goes through `resolveSignIn` on the application exactly as a
   normal access check does: the first policy that covers the person decides,
   then its first matching rule. No card is skipped. A policy that does not
   govern the person hands them on, and somebody always decides — the Global
   Default at worst, which is itself the finding: an executive from a Tor exit
   decided by the tenant's catch-all is a hole in the application's policies,
   not in the catch-all. The round is judged with the deciding policy's rules
   and the deciding policy's acceptances (`judgeAttempt`, the same judge the
   builder's run uses), so a result accepted in the builder is not counted
   again here.

   A card can have no decider: in a tenant with no Global Default, where
   nobody covers the person (`resolveSignIn` says 'incomplete'). It is read as can't
   tell, with no policy named and no possible outcome — not skipped, because
   "nothing decides this sign-in" is not an answer to leave out — and the
   engine does not guess at what the missing policy would have said.

   Counts, never a grade (owner, 25 Sep 2026): the four cells, Less than asked
   and Can't tell, with `skipped` always 0. And conflicts are about one person,
   break-ins about one application, so nothing here is mixed into the Why
   panel's conflicts: it is its own section under them.

   Pure, and memoised per (policies, application, env) in `breakInOnApp`, so
   the strip, the Why section and the attempts panel read one run. It is
   asked once the run has landed, never during the animation.
   -------------------------------------------------------------------------- */

export interface AppBreakInOptions {
  /* The tenant's acceptances, by policy id then card id — the store's
     `breakInAccepted`. Each card is read with the acceptances of the policy
     that decided it. */
  accepted?: Readonly<Record<string, Accepted>>
  deck?: TypedChallenge[]
  /* A policy in place of its stored twin, as though it were live: the
     resolver's own option. The fix preview runs the deck with the fixed
     policy here. */
  substitute?: Policy
  /** How device-health client rows are read; see `MatchOptions`. */
  match?: MatchOptions
}

/** One card on the application, read in the policy that decided it. */
export interface AppBreakInRow extends BreakInRow {
  personId: string
  /** The card's one line: "A contractor signs in from their own laptop, never enrolled in MDM." */
  story: string
  /** The policy that decided it; null only when none can (no Global Default). */
  policyId: string | null
  policyName: string | null
  isGlobalDefault: boolean
  /* The resolver's word for it: 'decided', 'depends' (the deciding policy
     could reach more than one decision — the row is can't tell, the policy
     still named) or 'incomplete' (nobody decides). */
  status: TenantResolution['status']
}

/** Which cards a policy decided, in tenant order. */
export interface AppDecider {
  policyId: string
  policyName: string
  isGlobalDefault: boolean
  /** Card ids, in deck order. */
  cardIds: string[]
}

export interface AppBreakInResult {
  appId: string
  /** One per card, in deck order. */
  rounds: AttemptRound[]
  /** One per card, in deck order. `groupRows` puts them under their headings. */
  rows: AppBreakInRow[]
  /** `skipped` is always 0: no card is skipped on an application. */
  counts: BreakInCounts
  /** The policies that decided at least one card, in tenant order. */
  deciders: AppDecider[]
}

/* The sign-in a card scripts, on an application: its own facts, that app and
   its person. The run asks it, and pressing a row plays it — through
   `formOf` into the page's form — so the two can never ask different things. */
export function attemptFacts(card: Pick<TypedChallenge, 'facts' | 'personId'>, appId: string): SignInFacts {
  return { ...card.facts, appId, personId: card.personId }
}

/* No policy, no trace: the resolution was incomplete. Settled is false — it
   is not one decision — and there is nothing it could reach. */
const noTrace = (): PolicyTrace => ({
  policyId: '',
  outOfAudience: false,
  audienceKnown: true,
  steps: [],
  lastRow: null,
  hitIndex: null,
  decision: null,
  settled: false,
  possible: [],
  unknowns: [],
})

/* No rules to read a row's rule in. A can't tell row reads none, and that is
   the only row a card with no decider makes. */
const NO_RULES: Pick<Policy, 'rules'> = { rules: [] }

/* The deck on one application, in tenant order. */
export function runBreakInOnApp(policies: readonly Policy[], appId: string, env: SimEnv, opts: AppBreakInOptions = {}): AppBreakInResult {
  const deck = opts.deck ?? TYPED_DECK
  const e: SimEnv = opts.match ? { ...env, deviceMatch: opts.match } : env
  const methods = e.library?.methods ?? AUTH_METHODS
  const list = evaluatedList(policies, opts.substitute)
  const byId = new Map(list.map((p) => [p.id, p]))
  /* One policy's acceptances as run options, asked once per policy. */
  const readings = new Map<string, ReturnType<typeof acceptanceOptions>>()
  const readingOf = (policyId: string) => {
    let r = readings.get(policyId)
    if (!r) {
      r = acceptanceOptions(opts.accepted?.[policyId])
      readings.set(policyId, r)
    }
    return r
  }

  const rounds: AttemptRound[] = []
  const rows: AppBreakInRow[] = []
  const decided = new Map<string, string[]>()
  for (const card of deck) {
    const res = resolveSignIn(policies, attemptFacts(card, appId), e, opts.substitute ? { substitute: opts.substitute } : {})
    const decider = res.decidedBy ? byId.get(res.decidedBy.policyId) : undefined
    const base = { personId: card.personId, story: card.story, status: res.status }
    if (!decider || !res.trace) {
      const round: AttemptRound = { challenge: card, want: card.want, trace: noTrace(), decision: null, factor: null, outcome: 'undecided', outcomes: [] }
      rounds.push(round)
      rows.push({ ...breakInRow(round, NO_RULES), ...base, policyId: null, policyName: null, isGlobalDefault: false })
      continue
    }
    const accepted = opts.accepted?.[decider.id]
    const round = judgeAttempt(card, decider, res.trace, readingOf(decider.id), methods)
    rounds.push(round)
    rows.push({ ...breakInRow(round, decider, accepted), ...base, policyId: decider.id, policyName: decider.name, isGlobalDefault: decider.isSystem === true })
    decided.set(decider.id, [...(decided.get(decider.id) ?? []), card.id])
  }

  /* In the order the resolver asks them: by tier — custom, then the DEFAULT
     group, then the Global Default, the last resort — and list order inside
     a tier, as the resolver reads it (the sort is stable). The stored list
     alone put the Global Default first where it sits first in the list
     (review, 1 Oct 2026). */
  const deciders: AppDecider[] = list
    .filter((p) => decided.has(p.id))
    .sort((a, b) => TIER_RANK[tierOf(a)] - TIER_RANK[tierOf(b)])
    .map((p) => ({ policyId: p.id, policyName: p.name, isGlobalDefault: p.isSystem === true, cardIds: decided.get(p.id)! }))
  return { appId, rounds, rows, counts: countRounds(rounds), deciders }
}

/* The resolver's three tiers, in the order it asks them (as conflicts.ts ranks them). */
const TIER_RANK: Record<PolicyTier, number> = { custom: 0, 'default-group': 1, 'global-default': 2 }

/* The run, once per (policies, application, env, acceptances, device
   reading). By identity: the store hands the same arrays and env until
   something changes, and a change is a new run. Only the default deck with no
   substitute is kept — the preview's runs are its own, and one-off. */
type Kept = { accepted: AppBreakInOptions['accepted']; result: AppBreakInResult }
const KEPT = new WeakMap<readonly Policy[], WeakMap<SimEnv, Map<string, Kept>>>()

export function breakInOnApp(
  policies: readonly Policy[],
  appId: string,
  env: SimEnv,
  opts: Pick<AppBreakInOptions, 'accepted' | 'match'> = {},
): AppBreakInResult {
  let byEnv = KEPT.get(policies)
  if (!byEnv) {
    byEnv = new WeakMap()
    KEPT.set(policies, byEnv)
  }
  let byKey = byEnv.get(env)
  if (!byKey) {
    byKey = new Map()
    byEnv.set(env, byKey)
  }
  const key = `${appId}␟${opts.match?.clientRows ?? ''}`
  const kept = byKey.get(key)
  if (kept && kept.accepted === opts.accepted) return kept.result
  const result = runBreakInOnApp(policies, appId, env, { accepted: opts.accepted, match: opts.match })
  byKey.set(key, { accepted: opts.accepted, result })
  return result
}

// --- What the Why panel and the strip say -------------------------------------------

/** The attempts let in more easily than their cards ask: the strip's question. */
export const holesOf = (c: Pick<BreakInCounts, 'gotThrough' | 'weakerFactor' | 'lessThanAsked'>): number => c.gotThrough + c.weakerFactor + c.lessThanAsked

export interface AppBreakInSummary {
  appId: string
  /** "AWS", for "Break-in attempts on AWS". */
  appName: string
  counts: BreakInCounts
  /* Got through + weaker factor + less than asked. Above 0, and no louder
     finding for the person, the outcome strip says so; never as a number —
     the Why section's cells say the numbers, once. */
  holes: number
}

export function breakInSummary(result: Pick<AppBreakInResult, 'appId' | 'counts'>, env: Pick<SimEnv, 'appName'>): AppBreakInSummary {
  return { appId: result.appId, appName: env.appName?.(result.appId) ?? result.appId, counts: result.counts, holes: holesOf(result.counts) }
}

/** The Why section's label: "Break-in attempts on AWS". */
export const attemptsOnSaid = (appName: string): string => `Break-in attempts on ${appName}`

/** The outcome strip, when attempts get through and nothing louder is said: "Break-in attempts get through on AWS". */
export const attemptsGetThroughSaid = (appName: string): string => `Break-in attempts get through on ${appName}`

/** The link the Why section and the strip end in. */
export const REVIEW_ATTEMPTS = 'Review attempts'

/** The quiet link on an outcome with no finding and no hole, where the quiet Why? sits. */
export const ATTEMPTS_LINK = 'Break-in attempts'

/* "Decided by AWS for engineering teams · Rule 2", "Decided by Global Default
   Policy · Last row", or the policy alone when which rule can't be told. A
   card nobody decides says that instead. */
export function decidedByLine(row: Pick<AppBreakInRow, 'policyName' | 'ruleLabel'>): string {
  if (row.policyName === null) return 'No policy decides this sign-in'
  return row.ruleLabel ? `Decided by ${row.policyName} · ${row.ruleLabel}` : `Decided by ${row.policyName}`
}

/* What pressing a row plays: the card's name for the run's title, its
   sign-in on this application, and what the answer is held to — so the
   canvas says of the run what the panel said of the row, never the
   opposite (review, 1 Oct 2026).

   The answer's "Expected" is an exact match (EngineJourney.tsx `Answer`),
   and the judge is not: an attacker stopped harder than the card asks has
   held (`classifyAttempt`), and 2FA on a factor the attack beats has not.
   So a row that held with a stricter answer is held to that answer — it
   played as "Deny ⚠ Expected Allow with 2FA" under the panel's Held — and a
   Weaker factor row, whose answer is the one asked for, carries what was
   offered against what the attack needs, for the answer to say in place of
   a plain pass. Every other row is held to its card's answer, an
   acceptance's if there is one. */
export interface AttemptPlay {
  name: string
  facts: SignInFacts
  /** The answer the run should get: the card's, an acceptance's — or, held stricter, the one it held with. */
  expected: AccessDecision
  /** A Weaker factor row's second factor — "miniOrange Push · standard · needs phishing-resistant"; '' when it can't be said; null on every other row. */
  weaker: string | null
}

export function attemptPlay(row: AppBreakInRow, appId: string, policies: readonly Policy[]): AttemptPlay {
  const expected = row.group === 'held' && row.got !== null ? row.got : row.expected
  const policy = row.group === 'weaker-factor' ? policies.find((p) => p.id === row.policyId) : undefined
  const weaker = row.group === 'weaker-factor' ? ((policy && secondFactorSaid(row, policy)) ?? '') : null
  return { name: row.name, facts: attemptFacts(row.round.challenge, appId), expected, weaker }
}

// --- Fixes --------------------------------------------------------------------------

export interface AppFixPreview {
  /** The application's counts with the fix in place, on the same acceptances. */
  counts: BreakInCounts
  /** The cells it moves. */
  changed: CountKey[]
  /** "Locked out now 0." — the cells that moved, for the status region; null when none did. */
  moved: string | null
  /** What changes across the tenant, on every application of the deciding policy. */
  line: WhatChangesLine
}

export interface AppFixOffer {
  fix: BreakInFix
  /** The deciding policy as stored: what `fixLine` and `fixButton` read, and the one "Fix in policy" opens. */
  policy: Policy
  preview: AppFixPreview
}

/* The fix to offer for a row, with what it would do — or none.

   This page has no draft, so nothing is applied here: the preview says what
   would move, and "Fix in policy" opens the deciding policy in the builder
   with the fix applied to its draft there (`fixOnArrival`). None when the
   card names no fix or the round has none (held, can't tell, the costs —
   `fixFor`), when the fix names something the tenant lacks (also `fixFor`),
   when nobody decided, when the Global Default decided — it takes no
   scripted rules from here; the page offers to open it instead — and when
   the fix would loosen anything anywhere on the modelled grid: never a
   looser fix.

   The counts after are the deck run again with the fixed policy standing in
   for the stored one, so the number here is the number applying it gives on
   this application. The tenant line is `previewFix`'s: every application the
   policy covers, swept at 09:30 with the policy as stored, then as fixed. */
export function offeredAppFix(
  row: Pick<AppBreakInRow, 'round' | 'policyId'>,
  policies: readonly Policy[],
  appId: string,
  env: SimEnv,
  now: BreakInCounts,
  opts: Omit<AppBreakInOptions, 'substitute'> = {},
  nowMinutes = 570,
): AppFixOffer | null {
  if (row.policyId === null) return null
  const policy = policies.find((p) => p.id === row.policyId)
  if (!policy || policy.isSystem) return null
  const fix = fixFor(row.round, policy, env, appId)
  if (!fix) return null
  const fixed = applyBreakInFix(policy, fix)
  const counts = runBreakInOnApp(policies, appId, env, { ...opts, substitute: fixed }).counts
  const before = policy.appIds.map((a) => sweepTenant(policies, a, env, nowMinutes, { substitute: policy }))
  const after = policy.appIds.map((a) => sweepTenant(policies, a, env, nowMinutes, { substitute: fixed }))
  const line = whatChangesLine(before, after, env)
  if (loosens(line)) return null
  return { fix, policy, preview: { counts, changed: changedCounts(now, counts), moved: countsMoved(now, counts), line } }
}

export type ArrivalFix =
  /** The draft with the fix in it, the Undo toast's words, and the rule to select: the one the fix made or changed. */
  | { next: Policy; toast: string; ruleRef: string }
  /** Nothing applied, and a short line for a toast saying why. */
  | { none: string }

/* The builder's half of "Fix in policy": the route carries the card and the
   application (`fix: { card, app }`), and the builder asks this of its own
   draft on arrival.

   Asked again, not carried over. The draft is not what the page tested — a
   saved draft opens in the builder, and the page tests the rules in force —
   so the card is traced against THIS policy on that application, judged with
   this policy's acceptances, and fixed for what it does here. A draft that
   already holds the card, or that a fix no longer fits, is left alone, and
   the toast says so in a line.

   With `policies` (the tenant's list), a fix that would loosen anything on
   the modelled grid is withheld here too, as on the page: the draft can
   differ from what the page previewed. `ruleRef` is the rule as it stands in
   `next` — the inserted rule's own id, a re-aimed rule's, or the row whose
   second factor changed — not `fixRuleRef`'s, which names the rule an insert
   lands above, for looking at the policy before the fix. */
export function fixOnArrival(
  policy: Policy,
  cardId: string,
  appId: string,
  env: SimEnv,
  opts: { accepted?: Accepted; deck?: TypedChallenge[]; match?: MatchOptions; policies?: readonly Policy[] } = {},
): ArrivalFix {
  const card = (opts.deck ?? TYPED_DECK).find((c) => c.id === cardId)
  if (!card) return { none: 'That sign-in is not in the Break-in test.' }
  if (policy.isSystem) return { none: 'The Global Default takes no fixes from here.' }
  const appName = env.appName?.(appId) ?? appId
  if (!policy.appIds.includes(appId)) return { none: `This draft does not cover ${appName}.` }
  const e: SimEnv = opts.match ? { ...env, deviceMatch: opts.match } : env
  const trace = tracePolicy(policy, attemptFacts(card, appId), e)
  if (trace.outOfAudience) return { none: `This draft does not cover ${personOf(card.personId, env)?.name ?? card.personId}.` }
  const round = judgeAttempt(card, policy, trace, acceptanceOptions(opts.accepted), e.library?.methods ?? AUTH_METHODS)
  if (round.outcome === 'held') return { none: 'This draft already holds that sign-in.' }
  if (round.outcome === 'undecided') return { none: "Can't tell on this draft. Nothing changed." }
  const fix = fixFor(round, policy, env, appId)
  if (!fix) return { none: 'No fix fits this draft. Nothing changed.' }
  const next = applyBreakInFix(policy, fix)
  if (opts.policies) {
    const before = policy.appIds.map((a) => sweepTenant(opts.policies!, a, env, 570, { substitute: policy }))
    const after = policy.appIds.map((a) => sweepTenant(opts.policies!, a, env, 570, { substitute: next }))
    if (loosens(whatChangesLine(before, after, env))) return { none: 'That fix would let others in more easily. Nothing changed.' }
  }
  const ruleRef =
    fix.kind === 'rule' ? fix.fix.rule.id : fix.fix.ruleIndex === null ? 'fallback' : (next.rules[fix.fix.ruleIndex]?.id ?? 'fallback')
  return { next, toast: fixToast(fix, policy), ruleRef }
}
