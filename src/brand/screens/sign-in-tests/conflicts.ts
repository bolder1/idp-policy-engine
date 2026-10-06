import { FALLBACK_NAME, enforces, memberGroupIds, ruleExpired, type AccessDecision, type Policy, type Rule, type RuleWho, type User } from '../../data'
import { CANT_TELL, DECISION_PHRASE, DECISION_WORDS, factWords } from '../../decision-words'
import { listNames, normaliseWho, whoPasses, whoSummary } from '../../rule-who'
import { journeyOf, type JourneyStep } from '../board/model'
import { personOf, tracePolicy, traceRule, type FactKey, type SignInFacts, type SimEnv, type SimUser } from '../simulate'
import { audienceNames, evaluatedList, resolveSignIn, tierOf, type PolicyTier, type StandingKind, type TenantResolution } from '../tenant-resolver'

/* -----------------------------------------------------------------------------
   What ELSE would apply to this person (TESTING-V4 §13.1) — the troubleshooting
   question.

   The owner's case: Maya Iyer is in Engineering AND Finance. On GitHub the
   Developer tools policy lets Engineering in on a password (rule 1) and asks
   Finance for a second factor (rule 3). The engine takes the first rule that
   matches, so Maya gets the password — and nothing on the screen said why, or
   that the Finance rule was ever in play. This answers it, beside the
   resolver's answer and never instead of it.

   How the engine decides, in the order it decides (tenant-resolver.ts):

     1. Which policy. Of the live App Access policies on the application, the
        ones that govern the person (their audience names one of the person's
        groups, or the person) are the candidates. A policy bound to a GROUP
        beats one for everyone (the DEFAULT group), whatever the list order;
        within a tier, the one higher in the list decides — the stand-in for
        the product's undocumented weight. None: the Global Default decides.
        Switched off, draft and monitoring policies never decide.
     2. Which rule. Inside the deciding policy, top to bottom, the FIRST rule
        whose who and conditions hold decides. A who is a union of groups and
        named people, minus its exceptions; an exception always wins. Nothing
        matched: the policy's last row decides — the policy never hands the
        sign-in on to another policy.

   So everything a person-in-two-groups can run into is one of these, and each
   is reported here with the words the troubleshooting run says:

     rule conflicts     a later rule of the deciding policy that also matches,
                        reached ANOTHER way (another group, or by name), with a
                        different answer — "Rule 3 also applies to Maya Iyer ·
                        via Finance". Kinds: the person's other group
                        ('rule-conflict'), the person named in a later rule
                        ('named-later'), a Deny that came first ('deny-first')
     exceptions         an earlier rule the person IS in by one group and is
                        taken out of by another (or by name) — "Contractors is
                        an exception on rule 1"
     policy conflicts   the live policies on the application after the one that
                        decides that also cover the person, with what each
                        would decide and why it lost (the list, or the tier)
     off                a switched-off or draft policy that covers the person,
                        and what turning it on would change
     depends            a fact not stated, and the answers it could lead to
     not covered        the live policies on the application whose audience the
                        person is outside of, when the Global Default decides
     as each group      `asEachGroup`: the answer as a member of each group
                        alone, and as the person — "As Engineering: Allow on 1
                        factor · As Finance: Allow with 2FA · As Maya (both):
                        Allow on 1 factor — Engineering's rule comes first"

   Nothing here decides anything on its own. Every rule's match is the
   resolver's own trace (`tracePolicy` traces every rule, even past the one
   that decided); a losing policy is traced by the same `tracePolicy`; which
   policies lost, and why, is the resolver's `standings`; a what-if (a policy
   turned on, a person in one group) is `resolveSignIn` itself, asked again. A
   fact that is not stated is what it is everywhere else: `unknown`, never a
   pass — a later rule that could only match on it is reported as "might"
   (`match: 'unknown'`), never as a conflict it has not earned.

   Conflict, or also matches. A different decision alone is not a conflict:
   Developer tools puts "in the office" (a password) before "working remotely"
   (a push) for the SAME people on purpose — the narrower rule first — and Arun
   in the office must never be told to move rule 2 above rule 1, which would
   make rule 1 unreachable. So a conflict is a different decision reached
   ANOTHER WAY: through a group the rule that decided does not let in on its
   own (a member of just Finance is not in "Engineering, DevOps"), or by name
   when the rule that decided does not name them (naming somebody singles them
   out, and a broader rule above it silently wins). Everything else that also
   matches is "also matches", quiet. Nobody in one group, named nowhere, ever
   has a conflict — that is the person-is-the-problem test.
   -------------------------------------------------------------------------- */

// --- People and groups --------------------------------------------------------

export interface GroupRef {
  id: string
  name: string
}

const groupName = (id: string, env: SimEnv) => env.library?.groups.find((g) => g.id === id)?.name ?? env.groupName(id)
const userName = (id: string, env: SimEnv) => env.library?.people.find((u) => u.id === id)?.name ?? env.userName?.(id) ?? id
const appNameOf = (id: string | undefined, env: SimEnv) => (id ? (env.appName?.(id) ?? id) : '')

/** The person's groups, by name, first group first: the chips on the Person node. [] for nobody. */
export function personGroupsOf(person: Pick<SimUser, 'groupId' | 'alsoGroupIds'> | null, env: SimEnv): GroupRef[] {
  if (!person) return []
  return memberGroupIds(person).map((id) => ({ id, name: groupName(id, env) }))
}

/** "Contractors' rule", "Engineering's rule". */
const possessive = (name: string) => (name.endsWith('s') ? `${name}'` : `${name}'s`)
/* The rule a group let the person into, said by its groups: "Engineering's
   rule" for one, "the rule for Engineering and DevOps" for more — a pair
   never takes a possessive. Null when no group of theirs let them in (by
   name, for everyone). The line on the answer and the person's row in As
   each group both say it from here, from the rule that decided. */
function ruleOfGroups(via: Via): string | null {
  if (via.kind !== 'groups' || via.groups.length === 0) return null
  return via.groups.length === 1 ? `${possessive(via.groups[0].name)} rule` : `the rule for ${via.label}`
}
const names = (gs: readonly GroupRef[]) => listNames(gs.map((g) => g.name), Infinity)
/** "Allow on 1 factor, Allow with 2FA or Deny": each decision once, in the order given. */
const decisionsList = (ds: readonly AccessDecision[]) => {
  const ws = [...new Set(ds)].map((d) => DECISION_WORDS[d])
  return ws.length <= 1 ? (ws[0] ?? '') : `${ws.slice(0, -1).join(', ')} or ${ws[ws.length - 1]}`
}
const firstName = (name: string) => name.split(' ')[0] || name

// --- Via ------------------------------------------------------------------------

/*   groups    one or more of the person's groups is named
     person    the person is named, by name (wins over a group that is also named)
     everyone  the who names nobody: everyone the policy governs (or everyone
               but the exceptions, and the person is not one)
     none      the person is outside it, left out by an exception, or unknown */
export type ViaKind = 'groups' | 'person' | 'everyone' | 'none'

export interface Via {
  /** The who (or the audience) lets this person in. */
  matches: boolean
  kind: ViaKind
  /** Of the person's groups, the ones it names — in the person's order. Filled whether or not they are also named. */
  groups: GroupRef[]
  /** The person is named in it. */
  named: boolean
  /** "Finance", "Engineering and Finance", "Maya Iyer", "Everyone"; '' when it does not let them in. */
  label: string
  /** "via Finance", "by name", "for everyone"; '' when it does not let them in. */
  say: string
}

type ViaPerson = Pick<SimUser, 'id' | 'name' | 'groupId' | 'alsoGroupIds'>

const NO_VIA: Via = { matches: false, kind: 'none', groups: [], named: false, label: '', say: '' }
const EVERYONE_VIA: Via = { matches: true, kind: 'everyone', groups: [], named: false, label: 'Everyone', say: 'for everyone' }

function viaOfWho(groupIds: readonly string[], userIds: readonly string[], person: ViaPerson, env: SimEnv): Via {
  const groups = memberGroupIds(person)
    .filter((g) => groupIds.includes(g))
    .map((id) => ({ id, name: groupName(id, env) }))
  const named = userIds.includes(person.id)
  if (named) return { matches: true, kind: 'person', groups, named, label: person.name, say: 'by name' }
  if (groups.length > 0) {
    const label = names(groups)
    return { matches: true, kind: 'groups', groups, named, label, say: `via ${label}` }
  }
  return EVERYONE_VIA
}

/* Which of the person's groups — or their name — made this rule's who let them
   in. The who alone: the policy's audience is asked by `audienceViaOf`, and a
   rule with no who is "for everyone" the policy governs. */
export function viaOf(rule: Pick<Rule, 'who'>, person: ViaPerson | null, env: SimEnv): Via {
  if (!person) return NO_VIA
  const w = normaliseWho(rule.who)
  if (!w) return EVERYONE_VIA
  if (!whoPasses(w, person)) return NO_VIA
  return viaOfWho(w.groupIds, w.userIds, person, env)
}

/** The same question of a policy's audience: "First policy on GitHub that covers Maya Iyer · via Engineering". */
export function audienceViaOf(policy: Pick<Policy, 'audience'>, person: ViaPerson | null, env: SimEnv): Via {
  if (!person) return NO_VIA
  const a = policy.audience
  if (a.everyone) return EVERYONE_VIA
  const via = viaOfWho(a.groupIds, a.userIds, person, env)
  /* An audience that names nobody governs nobody — never "everyone". */
  return via.kind === 'everyone' ? NO_VIA : via
}

// --- Routes: the ways a person gets into a who -----------------------------------

/* One group of the person's, or their name. A person in Engineering and
   Finance has two routes into "Engineering, Finance"; Thomas Byrne, named in a
   rule, has his name. */
type Route = { kind: 'group'; id: string } | { kind: 'person'; id: string }

const routesOf = (v: Via, personId: string): Route[] => [
  ...v.groups.map((g): Route => ({ kind: 'group', id: g.id })),
  ...(v.named ? [{ kind: 'person' as const, id: personId }] : []),
]

const PROBE_ID = '\u0000member'

/* Would this who let in somebody who has ONLY this route?

   A group: a member of just that group, named nowhere — "Engineering, DevOps"
   does not let in a member of just Finance. A name: the who names them. A who
   for everyone singles nobody out, so a later rule that NAMES the person is
   always reached another way: that is what naming somebody is for. */
function admitsAlone(who: RuleWho | undefined, route: Route): boolean {
  if (route.kind === 'person') return normaliseWho(who)?.userIds.includes(route.id) ?? false
  return whoPasses(who, { id: PROBE_ID, groupId: route.id })
}

// --- What a rule asks for -----------------------------------------------------------

export interface RuleAsk {
  decision: AccessDecision
  /** "Allow on 1 factor", "Allow with 2FA", "Deny". */
  words: string
  /** The first factor as the board's card says it: "Password"; null on a Deny. */
  first: string | null
  /** The second factor: "Google Authenticator", "miniOrange Push"; null unless 2FA. */
  second: string | null
  /** The card's then-flow, step by step: Password → Google Authenticator → Signed in (board/model `journeyOf`). */
  flow: JourneyStep[]
}

export function askOfRule(rule: Rule): RuleAsk {
  const flow = journeyOf(rule)
  return {
    decision: rule.decision,
    words: DECISION_WORDS[rule.decision],
    first: flow.find((s) => s.kind === 'first')?.label ?? null,
    second: flow.find((s) => s.kind === 'second')?.label ?? null,
    flow,
  }
}

const flowKey = (a: RuleAsk) => a.flow.map((s) => `${s.kind}:${s.label}:${s.sub ?? ''}`).join('|')

/* Deny is strictest, then 2FA, then 1 factor: a later rule moved above the one
   that decided loosens access when it ranks lower. */
const STRICTNESS: Record<AccessDecision, number> = { deny: 2, '2fa': 1, '1fa': 0 }
export type Strictness = 'stricter' | 'looser' | 'same'
const strictnessOf = (later: AccessDecision, landed: AccessDecision): Strictness =>
  STRICTNESS[later] > STRICTNESS[landed] ? 'stricter' : STRICTNESS[later] < STRICTNESS[landed] ? 'looser' : 'same'

/** "ask Finance for 2FA", "let Engineering in on 1 factor", "refuse Thomas Byrne". */
function toPhrase(decision: AccessDecision, who: string): string {
  return decision === '2fa' ? `ask ${who} for 2FA` : decision === '1fa' ? `let ${who} in on 1 factor` : `refuse ${who}`
}

// --- The model --------------------------------------------------------------------------

/** The rule that decided, as the conflicts are measured against it. */
export interface LandingRule {
  ruleId: string
  /** 0-based position in the policy. */
  index: number
  /** 1-based: "Rule 1". */
  number: number
  name: string
  ask: RuleAsk
  via: Via
}

/*   conflict      a different decision, reached another way (another group, or by name)
     also-matches  the same decision, or the same people layered: quiet */
export type ConflictKind = 'conflict' | 'also-matches'

export interface RuleConflict {
  ruleId: string
  index: number
  number: number
  name: string
  ask: RuleAsk
  via: Via
  /* 'yes'      it matches this sign-in on its own
     'unknown'  nothing it reads failed, and a fact it reads is not stated: it
                might (the answer Depends on it, as everywhere else) */
  match: 'yes' | 'unknown'
  /** Its decision is not the landing rule's. */
  decisionDiffers: boolean
  /** The same decision, a different flow (another second factor, another first). */
  factorsDiffer: boolean
  /** The person reaches it through a group the landing rule does not let in on its own, or by a name it does not name. */
  otherRoute: boolean
  kind: ConflictKind
  /** Moved above the landing rule, would it tighten or loosen what this person gets. */
  strictness: Strictness
  /** "Not used — rule 1 matched first". */
  notUsed: string
  /** "Move it above rule 1 to ask Finance for 2FA"; '' unless a conflict. */
  fix: string
  /** Set when the fix loosens access: "It would let in people rule 1 refuses today". '' otherwise. */
  caution: string
}

/* A rule the person IS in by one group (or for everyone) and is taken out of
   by another group, or by name: why a rule did not apply to somebody who is in
   its group. Only rules before the one that decided (all of them when the last
   row did): a rule after it could not have decided anyway. */
export interface RuleException {
  ruleId: string
  index: number
  number: number
  name: string
  ask: RuleAsk
  /** How the rule's include list lets them in: "via Engineering", "for everyone". */
  includedBy: Via
  /** Their groups that are exceptions, in the person's order. */
  exceptGroups: GroupRef[]
  /** Their name is an exception. */
  exceptNamed: boolean
  /** "Contractors", "Leo Fernandes". */
  exceptLabel: string
  /** The rule's conditions, without its who, on this sign-in. */
  conditions: 'yes' | 'no' | 'unknown'
  /** Its conditions hold: without the exception, it would have decided this sign-in. */
  wouldHaveDecided: boolean
  /** "Rule 1 is for Engineering, DevOps except Contractors. Leo Fernandes is in Engineering and in Contractors — an exception always wins." */
  why: string
  /** "Add a rule that names Leo Fernandes above rule 1"; '' unless it would have decided. */
  fix: string
}

export interface PolicyConflict {
  policyId: string
  policyName: string
  tier: PolicyTier
  /** The resolver's standing: 'same-app-and-group' or 'default-group-yields'. */
  standing: StandingKind
  /** How its audience covers the person. */
  via: Via
  /** How the deciding policy's audience covers the person. */
  deciderVia: Via
  /** It covers the person through a group the deciding policy covers them by too. */
  sameGroup: boolean
  /** 'depends' when the facts given reach more than one decision in it. */
  status: 'decided' | 'depends'
  /** Set only when 'decided'. */
  decision: AccessDecision | null
  /** Every decision it could reach, in rule order, once each. */
  possible: AccessDecision[]
  /** Where its walk would stop under the definite reading: 1-based, or null for its last row. */
  ruleNumber: number | null
  /** That rule's name, or "Nothing else matched". */
  ruleName: string
  /** What it would decide is not what the one that decides does. */
  decisionDiffers: boolean
  /** "Not used — Developer tools — office and device checks comes first". */
  notUsed: string
  /** Why the one that decides wins, in plain words. */
  why: string
  /* What the admin can do, on the board, in the policy that decides — a
     rule, since nothing in this build edits who a policy covers; '' when the
     order is by design (a group's policy before everyone's). */
  fix: string
  /** Set when the fix would refuse people who get in today: "It would refuse everyone in Finance who gets in today". '' otherwise. */
  caution: string
}

/* A switched-off or draft policy on the application that covers the person:
   what turning it on (it alone) would do. Monitoring policies are the
   resolver's `watching`, not these. */
export interface OffPolicy {
  policyId: string
  policyName: string
  status: 'inactive' | 'draft'
  via: Via
  /** Turned on, it would be the one deciding. */
  wouldDecide: boolean
  /** Turned on, what this person would get. */
  then: { status: 'decided' | 'depends' | 'incomplete'; decision: AccessDecision | null; possible: AccessDecision[]; policyId: string | null; policyName: string | null; ruleNumber: number | null; ruleName: string }
  /** Turned on, the answer would not be today's. */
  changes: boolean
  /** "Switched off — on, it would decide Allow with 2FA (rule 1)", "Draft — on, it would change nothing: Developer tools comes first". */
  say: string
}

/** A fact left unstated, and the answers it leads to. Null unless the answer depends. */
export interface DependsOn {
  facts: FactKey[]
  /** "Device", "IP address": the form's own labels, each once. */
  factWords: string[]
  outcomes: { decision: AccessDecision; words: string; ruleNumber: number | null; ruleName: string }[]
  /** "Depends on the device: Allow on 1 factor, Allow with 2FA or Deny". */
  say: string
  /** "State the device to see which rule decides". */
  fix: string
}

/** A live policy on the application whose audience the person is outside of. */
export interface MissedPolicy {
  policyId: string
  policyName: string
  /** "Engineering, DevOps, Contractors". */
  audience: string
  /** "Covers Engineering, DevOps, Contractors". */
  say: string
}

/* One thing the troubleshooting run says, in the order it says them. Everything
   above, flattened and ranked: what gives the person a different answer first
   ('conflict'), then what is worth knowing ('info'). */
export type FindingKind =
  | 'rule-conflict'
  | 'named-later'
  | 'deny-first'
  | 'exception'
  | 'policy-conflict'
  | 'same-group-policy'
  | 'group-policy-first'
  | 'off-would-change'
  | 'off-no-change'
  | 'depends'
  | 'not-covered'
  | 'also-matches'

export interface Finding {
  kind: FindingKind
  tone: 'conflict' | 'info'
  /** The chip or row title: "Rule 3 also applies to Maya Iyer · via Finance". */
  title: string
  /** The line under the outcome: "Maya Iyer is in Engineering and Finance — Engineering's rule applies first". */
  line: string
  /** Why it was not used (or why it matters), in plain words. */
  why: string
  /** What the admin can do, in one line; '' when nothing needs doing. */
  fix: string
  /** Set when the fix loosens access, or would refuse people who get in today. */
  caution: string
  /** What it is about: the policy, and the rule when there is one. */
  target: { policyId: string; ruleId: string | null }
  /* Where the fix is made — the rule to move, or the one to add a rule
     above, in the policy that decides; the policy to turn on. Not always
     `target`: a policy that lost is fixed in the one that won. Null without
     a fix. */
  fixAt: { policyId: string; ruleId: string | null } | null
}

export interface SignInConflicts {
  personId: string | null
  personName: string
  /** Every group the person is in, first group first: the Person node's chips. */
  groups: GroupRef[]
  /** The policy that decides, or null when none does. */
  policyId: string | null
  policyName: string | null
  /** The rule that decided, or null when the last row did (or nothing decided). */
  landing: LandingRule | null
  /** Every rule after the landing rule that also matches (or might), in rule order: conflicts and also-matches. */
  rules: RuleConflict[]
  /** Only the conflicts among `rules`. */
  conflicts: RuleConflict[]
  /** Earlier rules the person is in by one group and left out of by an exception. */
  exceptions: RuleException[]
  /** The live policies on the application after the one that decides that also cover the person, in engine order. The Global Default is never one: it is the tenant's fallback, below every app policy by design. */
  policies: PolicyConflict[]
  /** Switched-off and draft policies on the application that cover the person, in list order. */
  off: OffPolicy[]
  /** Set when the answer depends on a fact not stated. */
  depends: DependsOn | null
  /** When the Global Default decides: the live policies on the application the person is outside of. */
  missedBy: MissedPolicy[]
  /** Everything above as the run says it, ranked: conflicts first. */
  findings: Finding[]
  /** The top finding's line, whatever its tone; '' when there is nothing to say. */
  headline: string
  /** The top finding's line when it is a conflict; '' otherwise. "Maya Iyer is in Engineering and Finance — Engineering's rule applies first". */
  line: string
  /** Something gives this person a different answer another way: a finding in the conflict tone. */
  any: boolean
}

export interface ConflictsInput {
  res: TenantResolution
  /** The stored list; with `substitute`, it is looked up in the list as evaluated (as `engineRun` does). */
  policies: readonly Policy[]
  facts: SignInFacts
  env: SimEnv
  substitute?: Policy
}

const TIER_RANK: Record<PolicyTier, number> = { custom: 0, 'default-group': 1, 'global-default': 2 }
/* The order the info-toned findings are said in (the conflicts keep theirs). */
const INFO_RANK: Record<FindingKind, number> = {
  'rule-conflict': 0,
  'named-later': 0,
  'deny-first': 0,
  exception: 0,
  'policy-conflict': 0,
  'same-group-policy': 0,
  depends: 0,
  'off-would-change': 1,
  'not-covered': 2,
  'group-policy-first': 3,
  'also-matches': 4,
  'off-no-change': 5,
}
const LOST: readonly StandingKind[] = ['same-app-and-group', 'default-group-yields']

function distinct<T>(ds: readonly T[]): T[] {
  return [...new Set(ds)]
}

const EMPTY = (person: SimUser | null, env: SimEnv): SignInConflicts => ({
  personId: person?.id ?? null,
  personName: person?.name ?? '',
  groups: personGroupsOf(person, env),
  policyId: null,
  policyName: null,
  landing: null,
  rules: [],
  conflicts: [],
  exceptions: [],
  policies: [],
  off: [],
  depends: null,
  missedBy: [],
  findings: [],
  headline: '',
  line: '',
  any: false,
})

/* The list as a what-if reads it: the input's substitute in place, and on — so
   asking "and if this other policy were on too" never drops the draft being
   tried out of the question (as `resolveSignIn` does for a watched policy). */
function baseList(policies: readonly Policy[], substitute: Policy | undefined): Policy[] {
  const list = evaluatedList(policies, substitute)
  return substitute && !enforces(substitute) ? list.map((p) => (p.id === substitute.id ? { ...p, status: 'active' as const } : p)) : list
}

/** "Device", "IP address" lower-cased for the middle of a sentence, the acronym kept. */
const inSentence = (w: string) => (w === 'IP address' ? w : w.toLowerCase())

/* For a resolved sign-in: what else would apply to this person, and whether
   any of it disagrees. Empty (never a guess) while the resolution is
   incomplete. */
export function conflictsOf(input: ConflictsInput): SignInConflicts {
  const { res, facts, env } = input
  const list = evaluatedList(input.policies, input.substitute)
  const person = personOf(facts.personId, env)
  if (!person || !res.decidedBy || !res.trace) return EMPTY(person, env)
  const decider = list.find((p) => p.id === res.decidedBy!.policyId)
  if (!decider) return EMPTY(person, env)
  const trace = res.trace
  const app = appNameOf(facts.appId, env)
  const groups = personGroupsOf(person, env)

  // --- The rule that decided, and the rules after it ---

  const hit = trace.hitIndex
  const hitRule = hit !== null ? decider.rules[hit] : undefined
  const landing: LandingRule | null =
    hit !== null && hitRule
      ? { ruleId: hitRule.id, index: hit, number: hit + 1, name: hitRule.name, ask: askOfRule(hitRule), via: viaOf(hitRule, person, env) }
      : null

  const rules: RuleConflict[] = []
  if (landing && hitRule) {
    const landedFlow = flowKey(landing.ask)
    decider.rules.forEach((r, i) => {
      /* A grant past its end date is off for this sign-in, as the trace has it (simulate.ts `tracePolicy`). */
      if (i <= landing.index || !r.enabled || ruleExpired(r, facts.when?.date)) return
      const step = trace.steps.find((s) => s.ruleId === r.id)
      if (!step || step.match === 'no') return
      const via = viaOf(r, person, env)
      const ask = askOfRule(r)
      const decisionDiffers = ask.decision !== landing.ask.decision
      const otherRoute = routesOf(via, person.id).some((k) => !admitsAlone(hitRule.who, k))
      const kind: ConflictKind = decisionDiffers && otherRoute && step.match === 'yes' ? 'conflict' : 'also-matches'
      const strictness = strictnessOf(ask.decision, landing.ask.decision)
      const who = via.kind === 'person' ? person.name : via.label
      rules.push({
        ruleId: r.id,
        index: i,
        number: i + 1,
        name: r.name,
        ask,
        via,
        match: step.match,
        decisionDiffers,
        factorsDiffer: !decisionDiffers && flowKey(ask) !== landedFlow,
        otherRoute,
        kind,
        strictness,
        notUsed: `Not used — rule ${landing.number} matched first`,
        fix: kind === 'conflict' ? `Move it above rule ${landing.number} to ${toPhrase(ask.decision, who)}` : '',
        caution: kind === 'conflict' ? cautionOf(landing, ask.decision, via) : '',
      })
    })
  }
  const conflicts = rules.filter((r) => r.kind === 'conflict')

  // --- Exceptions: earlier rules the person is in, and left out of ---

  const exceptions: RuleException[] = []
  const upTo = landing ? landing.index : decider.rules.length
  decider.rules.forEach((r, i) => {
    if (i >= upTo || !r.enabled) return
    const w = normaliseWho(r.who)
    if (!w || (!w.exceptGroupIds?.length && !w.exceptUserIds?.length)) return
    const mine = memberGroupIds(person)
    const includesSome = w.groupIds.length > 0 || w.userIds.length > 0
    const included = !includesSome || mine.some((g) => w.groupIds.includes(g)) || w.userIds.includes(person.id)
    if (!included) return
    const exceptGroups = mine.filter((g) => w.exceptGroupIds?.includes(g)).map((id) => ({ id, name: groupName(id, env) }))
    const exceptNamed = w.exceptUserIds?.includes(person.id) ?? false
    if (exceptGroups.length === 0 && !exceptNamed) return
    const includedBy = includesSome ? viaOfWho(w.groupIds, w.userIds, person, env) : EVERYONE_VIA
    const conditions = traceRule({ ...r, who: undefined }, i, facts, person, env).match
    const exceptLabel = exceptNamed ? person.name : names(exceptGroups)
    const summary = whoSummary(r.who, (kind, id) => (kind === 'group' ? groupName(id, env) : userName(id, env)), Infinity)
    const why = exceptNamed
      ? `Rule ${i + 1} is for ${summary}. ${person.name} is named as an exception.`
      : includedBy.kind === 'groups'
        ? `Rule ${i + 1} is for ${summary}. ${person.name} is in ${includedBy.label} and in ${exceptLabel} — an exception always wins.`
        : includedBy.kind === 'person'
          ? `Rule ${i + 1} is for ${summary}. ${person.name} is named in it, and is in ${exceptLabel} — an exception always wins.`
          : `Rule ${i + 1} is for ${summary}. ${person.name} is in ${exceptLabel} — an exception always wins.`
    exceptions.push({
      ruleId: r.id,
      index: i,
      number: i + 1,
      name: r.name,
      ask: askOfRule(r),
      includedBy,
      exceptGroups,
      exceptNamed,
      exceptLabel,
      conditions,
      wouldHaveDecided: conditions === 'yes',
      why,
      fix: conditions === 'yes' ? `Add a rule that names ${person.name} above rule ${i + 1}` : '',
    })
  })

  // --- The policies after the one that decides ---

  const at = new Map(list.map((p, i) => [p.id, i]))
  const decided = res.status === 'decided' && res.decision ? [res.decision] : distinct(res.possible.map((o) => o.decision))
  const deciderVia = audienceViaOf(decider, person, env)
  const deciderRoutes = new Set(routesOf(deciderVia, person.id).map((r) => `${r.kind}:${r.id}`))
  const policies: PolicyConflict[] = res.standings
    .filter((s) => LOST.includes(s.kind))
    .map((s) => list.find((p) => p.id === s.policyId))
    .filter((p): p is Policy => p !== undefined && !p.isSystem)
    .sort((a, b) => TIER_RANK[tierOf(a)] - TIER_RANK[tierOf(b)] || (at.get(a.id) ?? 0) - (at.get(b.id) ?? 0))
    .map((p) => {
      const t = tracePolicy(p, facts, env)
      const possible = distinct(t.possible.map((o) => o.decision))
      const theirs = t.settled && t.decision ? [t.decision] : possible
      const n = t.hitIndex
      const standing = res.standings.find((s) => s.policyId === p.id)!.kind
      const via = audienceViaOf(p, person, env)
      const shared = via.groups.filter((g) => deciderRoutes.has(`group:${g.id}`))
      const sameGroup = shared.length > 0 || (via.named && deciderRoutes.has(`person:${person.id}`))
      const decision = t.settled ? t.decision : null
      /* The fix is a rule in the policy that decides, above the one that
         decided: nothing in this build edits who a policy covers (the
         board's start pane edits its applications, a rule its who), and no
         policy can be moved up the list. */
      const above = landing ? `, above rule ${landing.number}` : ''
      let why: string
      let fix = ''
      let caution = ''
      if (standing === 'default-group-yields') {
        why = `A policy for ${deciderVia.kind === 'groups' ? deciderVia.label : person.name} comes before a policy for everyone, wherever it is in the list`
      } else if (sameGroup) {
        const sharedLabel = shared.length > 0 ? names(shared) : person.name
        why = `Both cover ${sharedLabel} on ${app}. One policy applies per application and group: the one higher in the list`
        if (shared.length > 0) {
          /* What this policy would give the group, as a rule of the one that
             decides: its decision, and the second factor it asks for. */
          const theirRule = n !== null ? p.rules[n] : p.fallback
          const second = theirRule && decision === '2fa' ? askOfRule(theirRule).second : null
          const does = decision === '2fa' ? `asks for 2FA${second ? ` (${second})` : ''}` : decision === '1fa' ? 'lets them in on 1 factor' : decision === 'deny' ? 'refuses them' : ''
          fix = `Add a rule for ${sharedLabel} to ${decider.name}${above}${does ? `, that ${does}` : ''}`
          /* A rule for the whole group: everyone in it who gets in today would be refused. */
          if (decision === 'deny' && !decided.includes('deny')) caution = `It would refuse everyone in ${sharedLabel} who gets in today`
        } else fix = `Add a rule that names ${person.name} to ${decider.name}${above}`
      } else {
        why = `${person.name} is in ${via.label} for this one and ${deciderVia.label} for ${decider.name}. One policy applies to a person on an application: the one higher in the list`
        fix = `Add a rule that names ${person.name} to ${decider.name}${above}`
      }
      return {
        policyId: p.id,
        policyName: p.name,
        tier: tierOf(p),
        standing,
        via,
        deciderVia,
        sameGroup,
        status: t.settled ? 'decided' : 'depends',
        decision,
        possible,
        ruleNumber: n !== null ? n + 1 : null,
        ruleName: n !== null ? p.rules[n].name : (t.lastRow?.ruleName ?? FALLBACK_NAME),
        decisionDiffers: theirs.length !== decided.length || theirs.some((d) => !decided.includes(d)),
        notUsed: `Not used — ${decider.name} comes first`,
        why,
        fix,
        caution,
      } satisfies PolicyConflict
    })

  // --- Switched off and draft policies that cover the person ---

  const base = baseList(input.policies, input.substitute)
  const off: OffPolicy[] = []
  for (const p of list) {
    if (p.isSystem || p.type !== 'App Access' || (p.status !== 'inactive' && p.status !== 'draft')) continue
    if (p === input.substitute) continue
    if (!facts.appId || !p.appIds.includes(facts.appId)) continue
    const via = audienceViaOf(p, person, env)
    if (!via.matches) continue
    const r = resolveSignIn(base, facts, env, { substitute: { ...p, status: 'active' } })
    const wouldDecide = r.decidedBy?.policyId === p.id
    const thenPolicy = r.decidedBy ? base.find((x) => x.id === r.decidedBy!.policyId) : undefined
    const thenHit = r.trace?.hitIndex ?? null
    const then: OffPolicy['then'] = {
      status: r.status,
      decision: r.decision,
      possible: distinct(r.possible.map((o) => o.decision)),
      policyId: r.decidedBy?.policyId ?? null,
      policyName: r.decidedBy?.policyName ?? null,
      ruleNumber: thenHit !== null ? thenHit + 1 : null,
      ruleName: thenHit !== null && thenPolicy ? (thenPolicy.rules[thenHit]?.name ?? '') : FALLBACK_NAME,
    }
    const nowSet = decided.join()
    const thenSet = (r.status === 'decided' && r.decision ? [r.decision] : then.possible).join()
    const changes = nowSet !== thenSet
    const state = p.status === 'draft' ? 'Draft' : 'Switched off'
    const where = then.ruleNumber !== null ? `rule ${then.ruleNumber}` : 'its last row'
    const answer = r.status === 'decided' && r.decision ? DECISION_WORDS[r.decision] : `${CANT_TELL} (${decisionsList(then.possible)})`
    const say = wouldDecide
      ? changes
        ? `${state} — on, it would decide ${answer} (${where})`
        : `${state} — on, it would decide the same, ${answer} (${where})`
      : `${state} — on, it would change nothing: ${then.policyName ?? 'another policy'} comes first`
    off.push({ policyId: p.id, policyName: p.name, status: p.status, via, wouldDecide, then, changes, say })
  }

  // --- A fact not stated ---

  let depends: DependsOn | null = null
  if (res.status === 'depends') {
    const keys = distinct(trace.unknowns.flatMap((u) => u.missing))
    const words = factWords(keys)
    const seen = new Set<string>()
    const outcomes = res.possible
      .map((o) => ({ decision: o.decision, words: DECISION_WORDS[o.decision], ruleNumber: o.ruleIndex !== null ? o.ruleIndex + 1 : null, ruleName: o.ruleName }))
      .filter((o) => {
        const k = `${o.decision}|${o.ruleNumber}`
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
    const facet = words.length > 0 ? listNames(words.map(inSentence), Infinity) : 'a fact not stated'
    depends = {
      facts: keys,
      factWords: words,
      outcomes,
      say: `Depends on the ${facet}: ${decisionsList(outcomes.map((o) => o.decision))}`,
      fix: `State the ${facet} to see which rule decides`,
    }
  }

  // --- When the Global Default decides: the policies that could have ---

  const missedBy: MissedPolicy[] = []
  if (decider.isSystem) {
    for (const s of res.standings) {
      if (s.kind !== 'not-in-audience') continue
      const p = list.find((x) => x.id === s.policyId)
      if (!p) continue
      const audience = audienceNames(p, env)
      missedBy.push({ policyId: p.id, policyName: p.name, audience, say: `Covers ${audience}` })
    }
  }

  // --- Findings, ranked ---

  const findings: Finding[] = []
  const info: Finding[] = []
  const inGroups = groups.length > 0 ? names(groups) : 'no group'
  const at1 = (policyId: string, ruleId: string | null) => ({ policyId, ruleId })
  for (const c of conflicts) {
    const k: FindingKind = landing!.ask.decision === 'deny' ? 'deny-first' : c.via.kind === 'person' ? 'named-later' : 'rule-conflict'
    const first = ruleOfGroups(landing!.via) ?? `Rule ${landing!.number}`
    const line =
      k === 'named-later'
        ? `${person.name} is named in rule ${c.number} — rule ${landing!.number} applies first`
        : `${person.name} is in ${inGroups} — ${first} applies first`
    const why =
      k === 'named-later'
        ? `Naming ${person.name} does not move a rule up. Rule ${landing!.number} matched first, and the first rule that matches decides`
        : k === 'deny-first'
          ? `Rule ${landing!.number} refuses ${landing!.via.kind === 'groups' ? landing!.via.label : person.name} first, and the first rule that matches decides`
          : `Rule ${landing!.number} matched first${landing!.via.kind === 'groups' ? ` via ${landing!.via.label}` : ''}, and the first rule that matches decides`
    const target = at1(decider.id, c.ruleId)
    findings.push({ kind: k, tone: 'conflict', title: conflictTitle(c.number, person.name, c.via.say), line, why, fix: c.fix, caution: c.caution, target, fixAt: c.fix ? target : null })
  }
  for (const x of exceptions.filter((e) => e.wouldHaveDecided)) {
    findings.push({
      kind: 'exception',
      tone: 'conflict',
      title: `Rule ${x.number} leaves ${person.name} out · ${x.exceptLabel} ${x.exceptNamed ? 'is named as an exception' : `${x.exceptGroups.length > 1 ? 'are exceptions' : 'is an exception'}`}`,
      line: x.exceptNamed
        ? `${person.name} is an exception on rule ${x.number}`
        : `${x.exceptLabel} ${x.exceptGroups.length > 1 ? 'are exceptions' : 'is an exception'} on rule ${x.number}, and ${person.name} is in ${x.exceptLabel}`,
      why: x.why,
      fix: x.fix,
      caution: '',
      target: at1(decider.id, x.ruleId),
      /* The rule that names them goes above the one they were left out of. */
      fixAt: x.fix ? at1(decider.id, x.ruleId) : null,
    })
  }
  for (const p of policies.filter((q) => q.decisionDiffers)) {
    const k: FindingKind = p.standing === 'default-group-yields' ? 'group-policy-first' : p.sameGroup ? 'same-group-policy' : 'policy-conflict'
    const theirs = p.decision ? DECISION_WORDS[p.decision] : `${CANT_TELL} (${decisionsList(p.possible)})`
    const line =
      k === 'group-policy-first'
        ? `${p.policyName} does not apply — a policy for ${deciderVia.kind === 'groups' ? deciderVia.label : person.name} comes first`
        : k === 'same-group-policy'
          ? `Two ${app} policies cover ${p.via.groups.filter((g) => deciderRoutes.has(`group:${g.id}`)).map((g) => g.name).join(' and ') || person.name} — ${decider.name} applies first`
          : `${person.name} is in ${inGroups} — ${decider.name} applies first`
    const into = k === 'group-policy-first' ? info : findings
    into.push({
      kind: k,
      tone: k === 'group-policy-first' ? 'info' : 'conflict',
      title: `${p.policyName} would ${p.decision ? DECISION_PHRASE[p.decision] : `give ${theirs}`} · ${p.via.say}`,
      line,
      why: p.why,
      fix: p.fix,
      caution: p.caution,
      target: at1(p.policyId, null),
      /* Made in the policy that decides, above the rule that decided — not in this one. */
      fixAt: p.fix ? at1(decider.id, landing?.ruleId ?? null) : null,
    })
  }
  for (const o of off) {
    if (o.wouldDecide && !o.changes) continue
    const k: FindingKind = o.wouldDecide ? 'off-would-change' : 'off-no-change'
    const state = o.status === 'draft' ? 'is a draft' : 'is off'
    const line = o.wouldDecide
      ? `${o.policyName} ${state} — on, it would ${o.then.decision ? DECISION_PHRASE[o.then.decision] : 'decide differently'}`
      : `${o.policyName} ${state} — on, it would change nothing`
    const fix = o.wouldDecide && o.then.decision ? `Turn it on to ${toPhrase(o.then.decision, person.name)}` : ''
    info.push({ kind: k, tone: 'info', title: `${o.policyName} · ${o.status === 'draft' ? 'Draft' : 'Switched off'} · ${o.via.say}`, line, why: o.say, fix, caution: '', target: at1(o.policyId, null), fixAt: fix ? at1(o.policyId, null) : null })
  }
  if (depends) {
    const facet = depends.factWords.length > 0 ? listNames(depends.factWords.map(inSentence), Infinity) : 'a fact not stated'
    info.push({ kind: 'depends', tone: 'info', title: depends.say, line: `Depends on the ${facet} — state it to see which rule decides`, why: depends.say, fix: depends.fix, caution: '', target: at1(decider.id, null), fixAt: null })
  }
  if (missedBy.length > 0) {
    const onlyOne = missedBy.length === 1
    /* The person's groups said once, then each policy and who it covers. No
       fix: none of them can take a group in without changing who it covers,
       and nothing in this build edits that — a rule's who only narrows the
       people its policy already covers. */
    info.push({
      kind: 'not-covered',
      tone: 'info',
      title: `${onlyOne ? missedBy[0].policyName : `${missedBy.length} ${app} policies`} ${onlyOne ? 'does' : 'do'} not cover ${person.name}`,
      line: `No ${app} policy covers ${person.name} — the Global Default decides`,
      why: [`${person.name} is in ${inGroups}`, ...missedBy.map((m) => `${m.policyName} covers ${m.audience}`)].join('. '),
      fix: '',
      caution: '',
      target: at1(missedBy[0].policyId, null),
      fixAt: null,
    })
  } else if (decider.isSystem && !list.some((p) => !p.isSystem && p.type === 'App Access' && facts.appId !== undefined && p.appIds.includes(facts.appId))) {
    /* No policy on the application at all, on or off: the Global Default is
       the only one there is, and its own rules decide. */
    info.push({
      kind: 'not-covered',
      tone: 'info',
      title: `No policy on ${app}`,
      line: `No ${app} policy — the Global Default decides`,
      why: `No application policy names ${app}, so the Global Default decides every sign-in to it, by its own rules`,
      fix: '',
      caution: '',
      target: at1(decider.id, null),
      fixAt: null,
    })
  }
  for (const r of rules.filter((x) => x.kind === 'also-matches' && x.otherRoute && x.match === 'yes' && !x.decisionDiffers)) {
    const same = r.factorsDiffer ? `the same decision, asking ${r.ask.second ?? r.ask.first ?? 'another factor'} instead of ${landing!.ask.second ?? landing!.ask.first ?? 'the factor rule ' + landing!.number + ' asks'}` : 'the same decision and factors'
    info.push({
      kind: 'also-matches',
      tone: 'info',
      title: conflictTitle(r.number, person.name, r.via.say),
      line: `Rule ${r.number} also applies ${r.via.say} — ${same}`,
      why: `${r.notUsed}; it would give ${same}`,
      fix: '',
      caution: '',
      target: at1(decider.id, r.ruleId),
      fixAt: null,
    })
  }

  /* What is about THIS sign-in's answer before what is about another
     policy's: a fact to state, a policy that would change it, why no policy
     covers them, a group's policy first, a same-answer rule, and last a draft
     that would change nothing. Stable within a kind. */
  findings.push(...info.map((f, i) => ({ f, i })).sort((a, b) => INFO_RANK[a.f.kind] - INFO_RANK[b.f.kind] || a.i - b.i).map((x) => x.f))
  const top = findings[0]
  return {
    personId: person.id,
    personName: person.name,
    groups,
    policyId: decider.id,
    policyName: decider.name,
    landing,
    rules,
    conflicts,
    exceptions,
    policies,
    off,
    depends,
    missedBy,
    findings,
    headline: top?.line ?? '',
    line: top && top.tone === 'conflict' ? top.line : '',
    any: findings.some((f) => f.tone === 'conflict'),
  }
}

/** "Rule 3 also applies to Maya Iyer · via Finance" — the same words as the engine line (engine-run `conflictText`). */
function conflictTitle(number: number, person: string, via: string): string {
  return [`Rule ${number} also applies${person ? ` to ${person}` : ''}`, via].filter(Boolean).join(' · ')
}

/* What moving the later rule above the one that decided does to everyone
   both rules cover, not only this person: a Deny, or a second factor, taken
   away; or — a Deny for a whole group moved up — people refused who get in
   today. A rule that names only this person reaches nobody else. '' when it
   costs nobody anything. */
function cautionOf(landing: LandingRule, later: AccessDecision, via: Via): string {
  const s = strictnessOf(later, landing.ask.decision)
  if (s === 'looser') {
    return landing.ask.decision === 'deny' ? `It would let in people rule ${landing.number} refuses today` : `It would drop the second factor rule ${landing.number} asks for`
  }
  if (s === 'stricter' && later === 'deny' && via.kind !== 'person') return `It would refuse people rule ${landing.number} lets in today`
  return ''
}

// --- As each group -----------------------------------------------------------------------

/* The answer as a member of each of the person's groups alone, and as the
   person: the per-group comparison (§13 troubleshooting).

   A member of a group alone is somebody in just that group and named nowhere
   — what "Anyone in Finance" tests on the person picker — with the person's
   own type and role, so only the groups differ. Each row is `resolveSignIn`
   itself, asked again with that member signing in, so a row can never say
   something the engine would not. */
export interface AsGroupRow {
  /** `group:<id>` for a group alone, 'person' for the person. */
  key: string
  kind: 'group' | 'person'
  /** "As Engineering", "As Maya (both)", "As Leo (all 3)". */
  label: string
  groups: GroupRef[]
  status: 'decided' | 'depends' | 'incomplete'
  decision: AccessDecision | null
  possible: AccessDecision[]
  /** "Allow on 1 factor", "Can't tell (Allow on 1 factor or Deny)". */
  words: string
  policyId: string | null
  policyName: string | null
  isGlobalDefault: boolean
  /** 1-based; null when the last row decided. */
  ruleNumber: number | null
  ruleName: string
  /** What the deciding rule (or last row) asks for; null when nothing decides. */
  ask: RuleAsk | null
  /** The person's own row decides the same way: the same policy and rule. */
  same: boolean
}

export interface GroupComparison {
  personId: string | null
  personName: string
  groups: GroupRef[]
  /** Each group alone, in the person's order, then the person. [] for nobody. */
  rows: AsGroupRow[]
  /** The groups alone do not all get the same answer. */
  differs: boolean
  /** The groups whose answer (policy and rule) the person gets. [] when none does: the groups together decide otherwise. */
  follows: GroupRef[]
  /** "Engineering's rule comes first", "AWS for engineering teams is higher in the list", "Contractors is an exception on rule 1"; '' for one group. */
  why: string
  /** "As Engineering: Allow on 1 factor · As Finance: Allow with 2FA · As Maya (both): Allow on 1 factor — Engineering's rule comes first"; '' for one group. */
  line: string
}

export interface CompareInput {
  policies: readonly Policy[]
  facts: SignInFacts
  env: SimEnv
  substitute?: Policy
  /** The person's own resolution, when the caller already has it. */
  res?: TenantResolution
}

function rowOf(
  r: TenantResolution,
  list: readonly Policy[],
  key: string,
  kind: AsGroupRow['kind'],
  label: string,
  groups: GroupRef[],
): AsGroupRow {
  const p = r.decidedBy ? list.find((x) => x.id === r.decidedBy!.policyId) : undefined
  const hit = r.trace?.hitIndex ?? null
  const rule = p ? (hit !== null ? p.rules[hit] : p.fallback) : undefined
  const possible = distinct(r.possible.map((o) => o.decision))
  const words =
    r.status === 'decided' && r.decision ? DECISION_WORDS[r.decision] : r.status === 'depends' ? `${CANT_TELL} (${decisionsList(possible)})` : 'No policy decides'
  return {
    key,
    kind,
    label,
    groups,
    status: r.status,
    decision: r.decision,
    possible,
    words,
    policyId: r.decidedBy?.policyId ?? null,
    policyName: r.decidedBy?.policyName ?? null,
    isGlobalDefault: r.decidedBy?.isGlobalDefault ?? false,
    ruleNumber: p && hit !== null ? hit + 1 : null,
    ruleName: p ? (hit !== null ? (p.rules[hit]?.name ?? '') : FALLBACK_NAME) : '',
    ask: rule ? askOfRule(rule) : null,
    same: false,
  }
}

const sameAnswer = (a: AsGroupRow, b: AsGroupRow) =>
  a.policyId === b.policyId && a.ruleNumber === b.ruleNumber && a.status === b.status && a.decision === b.decision && a.possible.join() === b.possible.join()
const answerKey = (r: AsGroupRow) => (r.status === 'decided' ? `d:${r.decision}` : `${r.status}:${r.possible.join()}`)

export function asEachGroup(input: CompareInput): GroupComparison {
  const { facts, env, substitute } = input
  const list = evaluatedList(input.policies, substitute)
  const opts = substitute ? { substitute } : {}
  const person = personOf(facts.personId, env)
  const empty: GroupComparison = { personId: person?.id ?? null, personName: person?.name ?? '', groups: [], rows: [], differs: false, follows: [], why: '', line: '' }
  if (!person) return empty
  const groups = personGroupsOf(person, env)
  const res = input.res ?? resolveSignIn(input.policies, facts, env, opts)
  const n = groups.length
  const personLabel = n >= 3 ? `As ${firstName(person.name)} (all ${n})` : n === 2 ? `As ${firstName(person.name)} (both)` : `As ${person.name}`
  const personRow = { ...rowOf(res, list, 'person', 'person', personLabel, groups), same: true }

  const lib = env.library
  const record = lib?.people.find((u) => u.id === person.id)
  const groupRows: AsGroupRow[] =
    lib && record
      ? groups.map((g) => {
          const probe: User = { id: `${PROBE_ID}:${g.id}`, name: `A member of ${g.name}`, email: '', groupId: g.id, userType: record.userType, role: record.role }
          const env2: SimEnv = {
            ...env,
            library: { ...lib, people: [...lib.people, probe] },
            userName: (id) => (id === probe.id ? probe.name : (env.userName?.(id) ?? id)),
          }
          const r = resolveSignIn(input.policies, { ...facts, personId: probe.id }, env2, opts)
          const row = rowOf(r, list, `group:${g.id}`, 'group', `As ${g.name}`, [g])
          return { ...row, same: sameAnswer(row, personRow) }
        })
      : []

  const differs = new Set(groupRows.map(answerKey)).size > 1
  const follows = groupRows.filter((r) => r.same).map((r) => r.groups[0])
  const rows = [...groupRows, personRow]
  if (n < 2 || groupRows.length < 2) return { personId: person.id, personName: person.name, groups, rows, differs, follows, why: '', line: '' }

  const why = whyOfComparison(personRow, groupRows, follows, list, input, person, env, res)
  const line = `${rows.map((r) => `${r.label}: ${r.words}`).join(' · ')}${why ? ` — ${why}` : ''}`
  return { personId: person.id, personName: person.name, groups, rows, differs, follows, why, line }
}

function whyOfComparison(
  personRow: AsGroupRow,
  groupRows: AsGroupRow[],
  follows: GroupRef[],
  list: readonly Policy[],
  input: CompareInput,
  person: SimUser,
  env: SimEnv,
  res: TenantResolution,
): string {
  if (groupRows.every((r) => sameAnswer(r, personRow))) return 'the same for each group'
  if (personRow.status === 'depends' && res.trace) {
    const words = factWords(distinct(res.trace.unknowns.flatMap((u) => u.missing)))
    return `it depends on the ${words.length > 0 ? listNames(words.map(inSentence), Infinity) : 'facts not stated'}`
  }
  const others = groupRows.filter((r) => !r.same)
  const order = (id: string | null) => list.findIndex((p) => p.id === id)
  const rank = (row: AsGroupRow) => (row.ruleNumber === null ? Infinity : row.ruleNumber)

  /* An earlier rule in the same policy that one group alone reaches, and the
     person does not: an exception took them out of it. */
  const earlierSamePolicy = others.find((o) => o.policyId === personRow.policyId && rank(o) < rank(personRow))
  if (earlierSamePolicy || follows.length === 0) {
    const c = conflictsOf({ res, policies: input.policies, facts: input.facts, env, substitute: input.substitute })
    const x = c.exceptions[0]
    if (x) return `${x.exceptLabel} ${x.exceptNamed ? 'is named as an exception' : x.exceptGroups.length > 1 ? 'are exceptions' : 'is an exception'} on rule ${x.number}`
    const namedLanding = c.landing?.via.kind === 'person'
    if (namedLanding) return `${person.name} is named in rule ${c.landing!.number}`
    return 'the groups together decide differently'
  }

  const g = follows[0]
  const other = others[0]
  if (other.policyId === personRow.policyId) {
    /* The rule that decided, said by the groups that let them into it — the
       answer's line says it the same way. */
    const mine = list.find((p) => p.id === personRow.policyId)
    const hit = res.trace?.hitIndex ?? null
    const rule = mine && hit !== null ? mine.rules[hit] : undefined
    return `${(rule && ruleOfGroups(viaOf(rule, person, env))) ?? `${possessive(g.name)} rule`} comes first`
  }
  const mine = list.find((p) => p.id === personRow.policyId)
  const theirs = list.find((p) => p.id === other.policyId)
  if (!mine) return ''
  if (!theirs || theirs.isSystem) return `${mine.name} covers ${g.name}`
  if (tierOf(mine) !== tierOf(theirs)) return `a policy for ${g.name} comes before one for everyone`
  return order(mine.id) < order(theirs.id) ? `${mine.name} is higher in the list` : `${mine.name} applies first`
}
