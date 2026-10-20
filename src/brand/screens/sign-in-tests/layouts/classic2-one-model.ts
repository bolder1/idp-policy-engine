import type { AccessDecision, Rule } from '../../../data'
import { decisionsOr } from '../../../decision-words'
import type { EngineRule, EngineRun } from '../engine-run'
import { ALSO_WORDS, NOT_REACHED, plainReason, viaWords, walkEnd, type CardHead, type HeadMeta, type OutcomeView, type RuleRowState } from './classic2-model'

/* -----------------------------------------------------------------------------
   ONE POLICY, ONE CARD (phase.ts ONE_POLICY_CARD; owner, 20 Oct 2026: "only one
   policy per app, mostly. So we can merge the whole thing — the policy, and add
   their rules inside, so maybe one card"). The words of the merged Policy card,
   PURE, so they are pinned without drawing them (classic2-one-model.test.ts);
   classic2-one.tsx draws the pieces that are new, classic2-chain.tsx the card.

   An application has one sign-in policy at most (14 Oct 2026), so the engine's
   "which policy" is the application's own when it is on and covers the person,
   else the Global Default. The Policies card's search over two rows, "Policy 1
   of 2 applies" and its applies / not reached list said that with a lot of
   ceremony; the merged card says it once:

     kicker   always "Policy"
     title    the policy that decides — the application's own, the builder's
              draft, or the Global Default
     meta     the row that decided: "✓ Rule 1 · Low risk — password", "– No rule
              matched", "? Can't tell · Device not stated"; the spinner and
              "Reading rules" while the walk plays
     reason   only when the Global Default decides: why the application's own
              did not ("No sign-in policy on Salesforce", "HRMS access from
              corporate offices · Inactive", "Outside AWS access")
     rows     the decider's rules in order, each with its outcome (the app
              Policies tab's 1:1 change, 20 Oct), Nothing else matched last
     foot     only when the application's own decided: the Global Default as a
              quiet line, and another policy on the application where the data
              really has one

   `oneWhy` reads the plan alone — each policy row's kind, status and whether it
   is the tenant's default — so the engine (engine-run.ts) is not changed.
   -------------------------------------------------------------------------- */

/** The cards the merged chain draws after its first node: the Policy card and the outcome. */
export const ONE_CARDS = ['policy', 'outcome'] as const

export const ONE_KICKER = 'Policy'
export const ONE_READING = 'Reading rules'
export const ONE_NO_RULE = 'No rule matched'
export const ONE_NO_POLICY = 'No policy decides'
/** A later rule of the same policy that also applies to the person, with another answer (a conflict). */
export const ONE_ALSO_RULE = 'Also matches · not used'
/** The Global Default's line at the foot of the application's own policy. */
export const ONE_OUTSIDE_HERE = 'Outside this policy'
/** The policies list's own status words (app-policies.ts `OFF_WORD`). */
export const ONE_STATUS = { inactive: 'Inactive', draft: 'Draft', monitoring: 'Monitoring' } as const
export const noSignInPolicy = (app: string): string => `No sign-in policy on ${app}`
/** The app Policies tab's word for the people its policy leaves to the Global Default. */
export const outsideOf = (policy: string): string => `Outside ${policy}`

/*   own         the application's own policy decides (in the builder: the policy being built)
     none        nothing decides
     no-policy   the Global Default decides, and the application has no sign-in policy
     inactive    … its policy is switched off
     draft       … its policy is a draft
     monitoring  … its policy only watches
     outside     … the person is outside its policy (or it lost another way) */
export type OneWhyKind = 'own' | 'none' | 'no-policy' | 'inactive' | 'draft' | 'monitoring' | 'outside'

export interface OneWhy {
  kind: OneWhyKind
  /** The application's own policy: the one deciding, or the one the reason names. Null for none and no-policy. */
  policyId: string | null
  name: string | null
}

/* Why the card is the policy it is. `inPolicy` is the builder's: the policy being built is "own" even when it is the
   Global Default itself, and when another decides, the reason names it rather than the first row. */
export function oneWhy(plan: Pick<EngineRun, 'decider' | 'policies'>, inPolicy: string | null = null): OneWhy {
  const d = plan.decider
  if (!d) return { kind: 'none', policyId: null, name: null }
  if (!d.isGlobalDefault || d.id === inPolicy) return { kind: 'own', policyId: d.id, name: d.name }
  const others = plan.policies.filter((p) => !p.isGlobalDefault && !p.decides)
  const own = (inPolicy !== null ? others.find((p) => p.policyId === inPolicy) : undefined) ?? others[0]
  if (!own) return { kind: 'no-policy', policyId: null, name: null }
  const named = { policyId: own.policyId, name: own.name }
  if (own.kind === 'watching' || own.status === 'monitor') return { kind: 'monitoring', ...named }
  if (own.kind === 'waiting') return { kind: own.status === 'draft' ? 'draft' : 'inactive', ...named }
  return { kind: 'outside', ...named }
}

/** The reason line, in three runs: the words before the policy's name, the name (a press where the page allows), the words after. */
export interface OneReasonWords {
  before: string
  name: string | null
  after: string
}

/* The one line under the head when the Global Default decides; null when the application's own decides, or none. */
export function oneReasonWords(why: OneWhy, app: string): OneReasonWords | null {
  switch (why.kind) {
    case 'no-policy':
      return { before: noSignInPolicy(app), name: null, after: '' }
    case 'inactive':
    case 'draft':
    case 'monitoring':
      return { before: '', name: why.name, after: ` · ${ONE_STATUS[why.kind]}` }
    case 'outside':
      return why.name ? { before: 'Outside ', name: why.name, after: '' } : null
    default:
      return null
  }
}

/** The merged card's head: the Overview's three lines, and whether the engine is still reading its rules. */
export interface OneHead extends CardHead {
  reading: boolean
}

/* The head at step `s`: the deciding row, said once — the rows carry the numbers, so neither "Rule 1 of 3" nor
   "Policy 1 of 2 applies" is drawn. */
export function oneHead(plan: Pick<EngineRun, 'decider' | 'rules' | 'landing' | 'outcome' | 'at' | 'steps'>, s: number): OneHead {
  const title = plan.decider?.name ?? ONE_NO_POLICY
  if (!plan.decider) return { kicker: ONE_KICKER, title, meta: null, reading: false }
  if (s < walkEnd(plan)) return { kicker: ONE_KICKER, title, meta: { tone: 'work', mark: 'spin', text: ONE_READING }, reading: true }
  return { kicker: ONE_KICKER, title, meta: oneMeta(plan), reading: false }
}

function oneMeta(plan: Pick<EngineRun, 'rules' | 'landing' | 'outcome'>): HeadMeta {
  if (plan.outcome.status === 'depends') {
    /* The rule card's own words for a row that can't be told (classic2-model.ts `ruleMeta`), on its first one. */
    const r = plan.rules.find((x) => x.index !== null && x.state === 'unknown')
    const word = r?.checks.find((c) => c.status === 'unknown')?.word ?? ''
    return { tone: 'warn', mark: 'help', text: word ? `Can’t tell · ${word} not stated` : 'Can’t tell' }
  }
  const land = plan.landing !== null ? plan.rules[plan.landing] : undefined
  if (!land || land.index === null) return { tone: 'plain', mark: 'dash', text: ONE_NO_RULE }
  return { tone: 'ok', mark: 'check', text: `Rule ${land.index + 1} · ${land.name.trim() || 'Untitled rule'}` }
}

/** A quiet line at the card's foot: a policy named, what is news about it, and whether it would answer otherwise. */
export interface OneLine {
  policyId: string
  name: string
  words: string
  /** It would give this person another answer: amber. */
  conflict: boolean
}

/* Another policy on the application, where the data really has one (legacy data, a session's draft): at most one line,
   a policy that also covers the person first (`policyRows`' own rule for when it is a conflict), else the first other
   row that is neither the decider nor the reason's policy. Never the Global Default: it has a line of its own. */
export function oneAlso(plan: Pick<EngineRun, 'policies' | 'conflicts'>, why: OneWhy): OneLine | null {
  const c = plan.conflicts?.policies?.[0]
  if (c) return { policyId: c.policyId, name: c.policyName, words: ALSO_WORDS, conflict: c.decisionDiffers && c.standing !== 'default-group-yields' }
  const other = plan.policies.find((p) => !p.isGlobalDefault && !p.decides && p.policyId !== why.policyId)
  if (!other) return null
  const words =
    other.kind === 'watching' || other.status === 'monitor'
      ? ONE_STATUS.monitoring
      : other.kind === 'waiting'
        ? other.status === 'draft'
          ? ONE_STATUS.draft
          : ONE_STATUS.inactive
        : plainReason(other.reason) || NOT_REACHED
  return { policyId: other.policyId, name: other.name, words, conflict: false }
}

/* The Global Default under the application's own policy (the app Policies tab's foot, 20 Oct 2026): "Outside this
   policy, Global Default Policy · Not reached". Only when the application's own decided — when the Global Default
   decides, it is the card. `gd` is the tenant's (the builder's plan may not list it). */
export function oneGdFoot(plan: Pick<EngineRun, 'decider'>, gd: { id: string; name: string } | null, why: OneWhy): OneLine | null {
  if (why.kind !== 'own' || !gd || plan.decider?.id === gd.id) return null
  return { policyId: gd.id, name: gd.name, words: NOT_REACHED, conflict: false }
}

/* A row's outcome badge (the app Policies tab's 1:1 change: each rule shows what it does). In its tone only on the row
   that decided and on a later row that also applies with another answer — colour where the news is; grey on every
   other, one pill family. None for a rule switched off, or one whose outcome is not set up yet (app-policy-model.ts
   `cardOutcome`'s rule); `rule` is the last row's own for Nothing else matched. */
export function oneRowBadge(
  r: Pick<EngineRule, 'decision' | 'alsoChecks'>,
  rule: Pick<Rule, 'pristine'> | null,
  row: Pick<RuleRowState, 'tone'>,
  walked: boolean,
): { decision: AccessDecision; muted: boolean } | null {
  if (row.tone === 'off' || row.tone === 'waiting') return null
  if (rule?.pristine === true) return null
  const toned = row.tone === 'match' || (walked && !!r.alsoChecks && row.tone === 'not-reached')
  return { decision: r.decision, muted: !toned }
}

/* A row's state word where the merged card says more than the rule card did: "Matches · via Sales" on the row that
   decided (none for a group's own run, which already says the group), and "Also matches · not used" on a later rule
   that also applies. Null: the row's own word (classic2-model.ts `ruleRowState`), as on the rule card. */
export function oneRowWord(r: Pick<EngineRule, 'via' | 'alsoChecks'>, row: Pick<RuleRowState, 'tone' | 'word'>, walked: boolean, asGroup: boolean): { word: string; also: boolean } | null {
  if (walked && r.alsoChecks && row.tone === 'not-reached') return { word: ONE_ALSO_RULE, also: true }
  if (row.tone !== 'match') return null
  const by = asGroup ? '' : viaWords(r.via ?? null)
  return { word: by ? `${row.word} · ${by}` : row.word, also: false }
}

/* The Outcome head's third line under the merged card: what the person goes through, since the Policy card's meta
   already names the rule that decided (numbers once; "Decided by Rule 1" would say it a second time). Undefined: the
   outcome's own head line (classic2-model.ts `outcomeHead`), for what this does not cover. */
export function outcomeMetaOne(view: Pick<OutcomeView, 'tone' | 'decision' | 'factors' | 'message' | 'outcomes'>): HeadMeta | null | undefined {
  if (view.tone === 'depends') return view.outcomes.length > 0 ? { tone: 'plain', mark: null, text: decisionsOr(view.outcomes.map((o) => o.decision)) } : undefined
  if (!view.decision) return undefined
  if (view.decision === 'deny') return view.message ? { tone: 'plain', mark: null, text: `“${view.message}”`, tip: view.message } : null
  return view.factors.length > 0 ? { tone: 'plain', mark: null, text: view.factors.join(', then ') } : undefined
}

/** What the merged card is handed, beside the chain's own data (classic2-run.ts `useChainRun`). */
export interface OneCard {
  why: OneWhy
  head: OneHead
  also: OneLine | null
  gd: OneLine | null
  /** The Outcome head's line (`outcomeMetaOne`); undefined, its own. */
  outcomeMeta: HeadMeta | null | undefined
  /** The builder's policy being built (RunLayoutProps `inPolicy`); null on the page. */
  inPolicy: string | null
  /** The walk through the rules is over: the foot is drawn. */
  walked: boolean
}
