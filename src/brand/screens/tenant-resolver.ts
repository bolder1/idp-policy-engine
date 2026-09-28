import { enforces, type AccessDecision, type Policy, type User } from '../data'
import { DECISION_PHRASE, strictestFirst } from '../decision-words'
import type { Tenant } from '../fixtures'
import { EMPTY_RISK_PROFILE, riskScale } from '../risk-signals'
import { personOf, tracePolicy, type EvalLibrary, type FactKey, type PolicyTrace, type PossibleOutcome, type SignInFacts, type SimEnv, type SimUser } from './simulate'

/* -----------------------------------------------------------------------------
   Which policy decides a sign-in — across the whole tenant.

   `tracePolicy` answers "what would THIS policy do". That was the only question
   the evaluator could answer, so every surface asked it of whichever policy it
   had open, and a person the policy did not govern got that policy's own last
   row: an HRMS policy for Finance refused a salesperson HRMS, when in the
   product the salesperson never meets that policy at all. This answers the
   question before it: of every policy in the tenant, which one governs this
   person on this application — and then asks that one.

   A person outside a policy's audience moves on to the next policy that could
   govern them, and in the end to the Global Default. A policy's Deny never
   applies to somebody it does not govern.
   -------------------------------------------------------------------------- */

/* Three tiers, in the order the documented rule ranks them. */
export type PolicyTier = 'custom' | 'default-group' | 'global-default'

export type StandingKind =
  | 'decides'
  | 'not-app-access'
  | 'inactive'
  | 'draft'
  | 'other-app'
  | 'not-in-audience'
  | 'default-group-yields'
  | 'same-app-and-group'
  | 'not-reached'
  /* Checks this sign-in and decides nothing. Never a candidate, so never
     struck through: it did not lose, it is only watching. */
  | 'monitoring'

/** Where one policy stands for this sign-in, and why, in one line. */
export interface PolicyStanding {
  policyId: string
  policyName: string
  tier: PolicyTier
  kind: StandingKind
  reason: string
}

export interface PolicyRef {
  policyId: string
  policyName: string
  isGlobalDefault: boolean
}

/* A monitoring policy's would-be result: what it decides for this sign-in on
   its own rules, and whether turning it on would make it the one deciding. */
export interface WatchedResult {
  policyId: string
  policyName: string
  /** Set only when `status` is 'decided'. */
  decision: AccessDecision | null
  possible: PossibleOutcome[]
  status: 'decided' | 'depends'
  trace: PolicyTrace
  /** Turned on alone, it would decide this sign-in. */
  wouldDecide: boolean
  /** Who still decides when it is on, if not itself. Null when it would decide. */
  yieldsTo: PolicyRef | null
}

export interface TenantResolution {
  /* decided    one decision, whatever the undecided facts turn out to be
     depends    the deciding policy could reach more than one decision
     incomplete no app, no person, or no global default to fall back to */
  status: 'decided' | 'depends' | 'incomplete'
  /** What would make an 'incomplete' resolution complete; [] otherwise. */
  missing: FactKey[] | ['a global default policy']
  appId: string | null
  personId: string | null
  decidedBy: PolicyRef | null
  trace: PolicyTrace | null
  /** Set only when status is 'decided'. */
  decision: AccessDecision | null
  possible: PossibleOutcome[]
  /* Every tenant policy, in list order, once the app and the person are known.
     While either is missing, only the standings that can be read without it:
     a Session policy is "not an app access policy" whoever signs in. */
  standings: PolicyStanding[]
  /* Every monitoring policy that governs this sign-in, in list order, each
     assessed as if it alone were turned on. [] while the resolution is
     incomplete: with no decider there is nothing for it to differ from. */
  watching: WatchedResult[]
}

export interface ResolveOptions {
  /** Evaluate this policy in place of the stored one with the same id, as though
      it were live (it counts as enforcing whatever its status). Used for "what if
      this draft went live". A substitute with no stored twin joins the end of the list. */
  substitute?: Policy
}

// --- The library, from a tenant -----------------------------------------------

/** The tenant objects the evaluator reads, in the shape it reads them. */
export function libraryOf(
  t: Pick<Tenant, 'zones' | 'fingerprints' | 'groups' | 'methods' | 'policies'> & { directory: { people: User[] } },
): EvalLibrary {
  return {
    zones: t.zones,
    fingerprints: t.fingerprints,
    people: t.directory.people,
    groups: t.groups,
    methods: t.methods,
    policies: t.policies,
  }
}

/* An evaluation env for a whole tenant: every name from the tenant's own
   objects, the risk scale from its active risk profile, and the library, so
   zones are read from their entries rather than from the chip table. What the
   store's screens build from the live store, this builds from a tenant value —
   for tests, and for anything that holds a tenant rather than the store. */
export function envOf(t: Tenant): SimEnv {
  const active = t.riskProfiles.find((p) => p.id === t.activeRiskProfileId)
  return {
    zoneName: (id) => t.zones.find((z) => z.id === id)?.name ?? id,
    fingerprintName: (id) => t.fingerprints.find((p) => p.id === id)?.name ?? id,
    groupName: (id) => t.groups.find((g) => g.id === id)?.name ?? id,
    userName: (id) => t.directory.people.find((u) => u.id === id)?.name ?? id,
    appName: (id) => t.apps.find((a) => a.id === id)?.name ?? id,
    hasZone: (id) => t.zones.some((z) => z.id === id),
    hasFingerprint: (id) => t.fingerprints.some((p) => p.id === id),
    riskScale: riskScale(active ?? EMPTY_RISK_PROFILE),
    library: libraryOf(t),
  }
}

/* The tier a policy sits in.

   `audience.everyone` stands for the product's DEFAULT group — the group every
   user is in. A named-people audience (`userIds`, with or without groups) is
   custom: the product binds a policy to groups, and the prototype's binding
   to named people has no documented tier, so it is ranked with the groups it
   most resembles. */
export function tierOf(p: Policy): PolicyTier {
  if (p.isSystem) return 'global-default'
  return p.audience.everyone ? 'default-group' : 'custom'
}

const refOf = (p: Policy): PolicyRef => ({ policyId: p.id, policyName: p.name, isGlobalDefault: p.isSystem === true })

const governs = (p: Policy, person: SimUser) =>
  p.audience.everyone || p.audience.groupIds.includes(person.groupId) || p.audience.userIds.includes(person.id)

/* "Human Resources, Finance" — the audience a person is outside of, by name.
   Exported for the break-in deck, which skips a card with the same words. */
export function audienceNames(p: Policy, env: SimEnv): string {
  const groups = p.audience.groupIds.map((id) => env.library?.groups.find((g) => g.id === id)?.name ?? env.groupName(id))
  const people = p.audience.userIds.map((id) => env.library?.people.find((u) => u.id === id)?.name ?? env.userName?.(id) ?? id)
  const names = [...groups, ...people]
  return names.length === 0 ? 'nobody chosen' : names.join(', ')
}

// --- Which policy governs ---------------------------------------------------------

export interface Governing {
  /** The policy that decides, or null when nothing can (no system policy, or a fact is missing). */
  decider: Policy | null
  standings: PolicyStanding[]
  missing: FactKey[] | ['a global default policy']
  /** Monitoring policies that govern this sign-in, in list order. Never candidates. */
  watched: Policy[]
  /** The policies as evaluated: the stored list with any substitute in place. */
  list: Policy[]
}

/* The real engine's cross-policy weight formula is undocumented. The
   documented parts, which this function implements, are:

     1. A policy bound to a custom group beats a policy bound to the DEFAULT
        group.
     2. Only one policy applies per app and group.

   Everything else here is a stand-in. Within a tier, list order decides, as a
   stand-in for the undocumented weight. `audience.everyone` is treated as the
   DEFAULT group. A named-people audience (`userIds`) is treated as custom,
   because the product binds to groups and the prototype's person binding has
   no documented tier. `User.groupId` is singular in this model, so "one policy
   per app and group" is checked against that one group.

   `decidesFor` (app-policies.ts) is deliberately not used. It answers a
   question about the policy list — would a rule in this policy ever fire —
   and a live policy whose only row is its last row still decides every
   sign-in it governs, by that row. Here that policy DOES decide.

   Split from `resolveSignIn` so a caller that only needs the policy (the
   impact sweep, which then asks it on the chip path) does not pay for a trace. */
export function governingPolicy(policies: readonly Policy[], facts: SignInFacts, env: SimEnv, opts: ResolveOptions = {}): Governing {
  const sub = opts.substitute
  const list = sub ? (policies.some((p) => p.id === sub.id) ? policies.map((p) => (p.id === sub.id ? sub : p)) : [...policies, sub]) : [...policies]
  const appId = facts.appId ?? null
  const person = personOf(facts.personId, env)
  const missing: FactKey[] = [...(appId ? [] : (['app'] as const)), ...(person ? [] : (['person'] as const))]
  const appName = (id: string) => env.appName?.(id) ?? id

  const standings: PolicyStanding[] = []
  const candidates: Policy[] = []
  const watched: Policy[] = []
  for (const p of list) {
    const tier = tierOf(p)
    const stand = (kind: StandingKind, reason: string) => standings.push({ policyId: p.id, policyName: p.name, tier, kind, reason })
    const live = p === sub || enforces(p)
    /* The substitute is being asked "what if this went live", whatever its
       status says — so a monitoring policy under substitution decides. */
    const monitoring = p !== sub && p.status === 'monitor'
    if (p.type !== 'App Access') stand('not-app-access', 'Not an app access policy')
    else if (!live && !monitoring) stand(p.status === 'draft' ? 'draft' : 'inactive', p.status === 'draft' ? 'Draft' : 'Inactive')
    else if (appId && !p.isSystem && !p.appIds.includes(appId)) stand('other-app', `Does not cover ${appName(appId)}`)
    else if (person && tier === 'custom' && !governs(p, person)) stand('not-in-audience', `Not in audience: ${audienceNames(p, env)}`)
    else if (monitoring) {
      if (appId && person) watched.push(p)
    } else if (appId && person) candidates.push(p)
    /* Otherwise it waits on the fact that is missing, and has no standing yet. */
  }
  if (missing.length > 0) return { decider: null, standings, missing, watched: [], list }

  const custom = candidates.filter((p) => tierOf(p) === 'custom')
  const byDefault = candidates.filter((p) => tierOf(p) === 'default-group')
  const system = candidates.filter((p) => tierOf(p) === 'global-default')
  const decider = custom[0] ?? byDefault[0] ?? system[0] ?? null

  const why = new Map<string, { kind: StandingKind; reason: string }>()
  for (const p of candidates) {
    const tier = tierOf(p)
    if (p === decider) why.set(p.id, { kind: 'decides', reason: 'Decides this sign-in' })
    else if (tier === 'global-default' && tierOf(decider!) !== 'global-default') why.set(p.id, { kind: 'not-reached', reason: 'An app policy applies' })
    else if (tier === 'default-group' && custom.length > 0)
      why.set(p.id, { kind: 'default-group-yields', reason: 'DEFAULT group, a custom-group policy applies' })
    else why.set(p.id, { kind: 'same-app-and-group', reason: `Same app and group as ${decider!.name}; the earlier policy in the list applies` })
  }

  /* A watched policy is never a candidate, so `why` has no entry for it until
     this. Its reason is only "Monitoring" here; `resolveSignIn`, which traces
     it, says what it would decide. */
  for (const p of watched) why.set(p.id, { kind: 'monitoring', reason: 'Monitoring' })

  /* Every policy once, in list order: the standings found above, and the
     candidates' and watched policies' standings slotted into their places. By
     id through a map, so a large tenant is not searched once per policy. */
  const stood = new Map(standings.map((s) => [s.policyId, s]))
  const ordered: PolicyStanding[] = list.map((p) => {
    const found = stood.get(p.id)
    if (found) return found
    const w = why.get(p.id)!
    return { policyId: p.id, policyName: p.name, tier: tierOf(p), kind: w.kind, reason: w.reason }
  })

  return decider
    ? { decider, standings: ordered, missing: [], watched, list }
    : { decider: null, standings: ordered, missing: ['a global default policy'], watched, list }
}

/* "Monitoring: would allow with 2FA", or "Monitoring: can't tell (deny or
   allow with 2FA)" when the facts given reach more than one decision —
   strictest first, not in rule order, so two policies that reach the same
   decisions say them the same way round. */
function watchingReason(w: WatchedResult): string {
  if (w.decision) return `Monitoring: would ${DECISION_PHRASE[w.decision]}`
  const reach = strictestFirst(w.possible.map((o) => o.decision)).map((d) => DECISION_PHRASE[d])
  return `Monitoring: can't tell (${reach.join(' or ')})`
}

/* One sign-in, across the tenant: which policy governs it, and what that policy
   decides — or every decision it could reach, when a fact it needs is missing.

   The deciding policy is traced with `tracePolicy`, so a decision here is the
   typed path's, three-valued: 'decided' when every reading agrees, 'depends'
   when the possible outcomes differ.

   Monitoring policies decide nothing, and each is reported in `watching` as
   though it alone were turned on: its own trace, and whether, on, it would be
   the one deciding. Two monitoring policies are never assessed together — each
   answers "what if I were on", not "what if everything watching were". */
export function resolveSignIn(policies: readonly Policy[], facts: SignInFacts, env: SimEnv, opts: ResolveOptions = {}): TenantResolution {
  const g = governingPolicy(policies, facts, env, opts)
  const head = { appId: facts.appId ?? null, personId: facts.personId ?? null }
  if (!g.decider) {
    return { ...head, standings: g.standings, watching: [], status: 'incomplete', missing: g.missing, decidedBy: null, trace: null, decision: null, possible: [] }
  }

  /* The list as the primary pass read it. A substitute counted as live there
     whatever its status; in the pass below it is one policy among the rest, so
     it goes in as on — or a draft being asked "what if this went live" would
     drop out of the question the moment another policy was watching. */
  const sub = opts.substitute
  const base = sub && !enforces(sub) ? g.list.map((p) => (p === sub ? { ...p, status: 'active' as const } : p)) : g.list
  const watching = g.watched.map((p): WatchedResult => {
    const trace = tracePolicy(p, facts, env)
    const on = governingPolicy(base, facts, env, { substitute: { ...p, status: 'active' } }).decider
    const wouldDecide = on?.id === p.id
    return {
      policyId: p.id,
      policyName: p.name,
      decision: trace.settled ? trace.decision : null,
      possible: trace.possible,
      status: trace.settled ? 'decided' : 'depends',
      trace,
      wouldDecide,
      yieldsTo: !wouldDecide && on ? refOf(on) : null,
    }
  })
  const said = new Map(watching.map((w) => [w.policyId, watchingReason(w)]))
  const standings = g.standings.map((s) => {
    const reason = said.get(s.policyId)
    return reason ? { ...s, reason } : s
  })

  const trace = tracePolicy(g.decider, facts, env)
  return {
    ...head,
    standings,
    watching,
    status: trace.settled ? 'decided' : 'depends',
    missing: [],
    decidedBy: refOf(g.decider),
    trace,
    decision: trace.settled ? trace.decision : null,
    possible: trace.possible,
  }
}
