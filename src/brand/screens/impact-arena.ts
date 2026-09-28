import type { AccessDecision, Policy, Rule } from '../data'
import { AUTH_METHODS } from '../methods'
import { FACTOR_RANK, ruleFactor, type FactorStrength } from './factor-strength'
import {
  AUTH_STATES,
  DEVICE_FACTS,
  DEVICE_OPTIONS,
  PLACES,
  RISKS,
  SIM_USERS,
  chipFacts,
  decide,
  fallbackOf,
  type SimContext,
  type SimEnv,
} from './simulate'
import { governingPolicy, type ResolveOptions } from './tenant-resolver'

/* -----------------------------------------------------------------------------
   The Impact arena — the "what does this change" function, made visible.

   A rule's `matchEstimate` is seed data, honestly labelled as an estimate. That
   is the wrong answer for the question this screen asks — *what does publishing
   this change do* — because you cannot subtract two estimates and present the
   difference as a consequence.

   So this module does not estimate anything. It enumerates the situation space
   the simulator can actually model — every combination of person, origin,
   device, auth state and risk signal — and runs the real evaluator over all of
   it, twice: once for the saved policy and once for the draft. The difference
   between the two runs is then an exact statement, with a stated scope:

     "Of 1,440 modelled sign-in situations, 212 change treatment."

   Exact about the model, silent about the world. That is a claim that survives
   being checked, which "≈ 18% of users affected" is not.
   -------------------------------------------------------------------------- */

export interface Situation {
  index: number
  userId: string
  groupName: string
  place: string
  device: string
  authState: string
  risk: string
}

/* The axes, enumerated in a fixed order so a situation's index is stable across
   runs. The dot grid draws them in this order, which means the same dot is the
   same situation before and after — without that, watching the grid change
   would be watching noise. */
export const SITUATIONS: Situation[] = (() => {
  const out: Situation[] = []
  let index = 0
  for (const u of SIM_USERS)
    for (const place of PLACES)
      for (const device of DEVICE_OPTIONS)
        for (const authState of AUTH_STATES)
          for (const risk of RISKS)
            out.push({ index: index++, userId: u.id, groupName: u.groupName, place, device, authState, risk })
  return out
})()

/** The axes, for printing the scope of the claim next to the number. */
/* The auth-state axis is kept, and it is inert: no condition in the catalogue
   reads an auth state, and no sign-in fact carries one, so every result on this
   grid repeats four times — once per auth state. Dropping it would make the
   grid a quarter the size and every count four times more honest, and it is
   not dropped here because "1,440 = 4 × 5 × 6 × 4 × 3" is printed beside the
   number; that copy changes with it, in a later phase. `SWEEP_INERT_AXES`
   names it so a test holds the claim until then. */
export const SWEEP_AXES = [
  { name: 'People', values: SIM_USERS.map((u) => u.name) },
  { name: 'Origin', values: PLACES },
  { name: 'Device', values: DEVICE_OPTIONS },
  { name: 'Auth state', values: AUTH_STATES },
  { name: 'Risk signal', values: RISKS },
]

/** The sweep axes no condition reads. Every result repeats once per value of each. */
export const SWEEP_INERT_AXES: readonly string[] = ['Auth state']

/** Times of day the sweep can be run at. Time is a control rather than a sixth
    axis: averaging a working-hours rule across midnight would hide exactly the
    thing that rule exists to do. */
export const SWEEP_TIMES = [
  { label: '03:00', minutes: 180, caption: 'Middle of the night' },
  { label: '09:30', minutes: 570, caption: 'Working hours' },
  { label: '21:00', minutes: 1260, caption: 'Late evening' },
]

export type Lane = AccessDecision
export const LANES: { id: Lane; label: string; caption: string }[] = [
  { id: '1fa', label: 'Straight in', caption: 'One factor, no further prompt' },
  { id: '2fa', label: 'Verified', caption: 'A second factor is required' },
  { id: 'deny', label: 'Blocked', caption: 'The login is refused' },
]

/* Three steps: one factor, two factors, deny. It measures how much a rule
   DOES about a sign-in, because that is what says whether a change loosened
   something. (It had a fourth, `warn`, between a bare allow and a second
   factor; the decision is gone from the model and so is the step.)

   Two versions that decide the same thing can still move: a second factor
   moved from a passkey to an email code is 2 factors before and after, and
   looser. `compare` reads that from `Sweep.factors`, as a second axis. */
const STRICTNESS: Record<AccessDecision, number> = { '1fa': 0, '2fa': 1, deny: 2 }

export interface Sweep {
  /** One decision per situation, in SITUATIONS order. */
  decisions: AccessDecision[]
  /** Which rule won each situation. Null means nothing matched, or the policy does not govern it. */
  winners: (number | null)[]
  counts: Record<Lane, number>
  /** How many situations each rule index actually wins. Exact over the grid. */
  reach: number[]
  /** Governed situations no rule claimed, so the policy's last row decided them. */
  fellThrough: number
  total: number
  /** Per situation: the policy does not govern this person, so another policy decided. */
  outside: boolean[]
  outsideCount: number
  /** Per situation: how strong the second factor is, when the decision is 2 factors. */
  factors: (FactorStrength | null)[]
}

function contextOf(s: Situation, nowMinutes: number): SimContext {
  return {
    user: SIM_USERS.find((u) => u.id === s.userId)!,
    place: s.place,
    device: s.device,
    authState: s.authState,
    risk: s.risk,
    nowMinutes,
  }
}

/* One situation's decision, and the rule that made it.

   Governed: this policy's own rules, first match wins, else its last row.

   Not governed: NOT this policy's last row. A policy scoped to Finance says
   nothing about a contractor, and counting the contractor under its Deny is
   how a scoped policy used to read as though it locked out the whole tenant.
   With the tenant's policies on the env, the resolver picks the policy that
   does govern this person on this policy's first application — another
   custom-group policy, a DEFAULT-group one, the Global Default — and that
   policy decides, on the same chip reading as every other situation on the
   grid. With no policies to consult (the test estates on `rawEnv`), the last
   row stands in, exactly as before, so their counts do not move.

   `governing` remembers the deciding policy per person for one sweep. Which
   policy governs depends on the person and the application alone — never on
   the origin, device, clock or risk — and a sweep holds the application
   fixed, so four people need four answers, not one per out-of-audience
   situation (up to 1,080 of 1,440). Without it the resolver was most of the
   cost of a sweep on a large tenant, and a board edit runs several. */
function decideSituation(
  policy: Policy,
  ctx: SimContext,
  env: SimEnv,
  governing: Map<string, Policy | null> = new Map(),
): { decision: AccessDecision; hitIndex: number | null; outOfAudience: boolean; by: Rule | null } {
  const d = decide(policy, ctx, env)
  if (!d.outOfAudience) return { ...d, by: d.hitIndex === null ? (policy.fallback ?? null) : policy.rules[d.hitIndex] }
  const policies = env.library?.policies
  if (policies) {
    let decider = governing.get(ctx.user.id)
    if (decider === undefined) {
      decider = governingPolicy(policies, { ...chipFacts(ctx, env), appId: policy.appIds[0], personId: ctx.user.id }, env, { substitute: policy }).decider
      governing.set(ctx.user.id, decider)
    }
    if (decider) {
      const other = decide(decider, ctx, env)
      const by = other.hitIndex === null ? (decider.fallback ?? null) : decider.rules[other.hitIndex]
      return { decision: other.decision, hitIndex: null, outOfAudience: true, by }
    }
  }
  return { decision: fallbackOf(policy), hitIndex: null, outOfAudience: true, by: policy.fallback ?? null }
}

export function sweep(policy: Policy, env: SimEnv, nowMinutes: number): Sweep {
  const decisions: AccessDecision[] = new Array(SITUATIONS.length)
  const winners: (number | null)[] = new Array(SITUATIONS.length)
  const outside: boolean[] = new Array(SITUATIONS.length)
  const factors: (FactorStrength | null)[] = new Array(SITUATIONS.length)
  const reach = new Array(policy.rules.length).fill(0)
  const counts: Record<Lane, number> = { '1fa': 0, '2fa': 0, deny: 0 }
  const methods = env.library?.methods ?? AUTH_METHODS
  const governing = new Map<string, Policy | null>()
  let fellThrough = 0
  let outsideCount = 0

  for (const s of SITUATIONS) {
    const { decision, hitIndex, outOfAudience, by } = decideSituation(policy, contextOf(s, nowMinutes), env, governing)
    decisions[s.index] = decision
    winners[s.index] = hitIndex
    outside[s.index] = outOfAudience
    factors[s.index] = decision === '2fa' && by ? ruleFactor({ ...by, decision }, methods) : null
    counts[decision] += 1
    if (outOfAudience) outsideCount += 1
    else if (hitIndex === null) fellThrough += 1
    else reach[hitIndex] += 1
  }

  return { decisions, winners, counts, reach, fellThrough, total: SITUATIONS.length, outside, outsideCount, factors }
}

/* --- The tenant, swept -------------------------------------------------------

   `sweep` asks one policy, and asks the resolver only for the people that
   policy does not govern. The checks before a change is made ask the other
   question: across the tenant, on one application, who decides each modelled
   situation and what do they decide. A policy switched off hands its people to
   whichever policy governs them next, and that hand-over is most of what
   switching it off does.

   On the grid without its auth-state axis, which no condition reads: every
   result repeated four times would count every change four times. 360
   situations per application — four people, five origins, six devices, three
   risk levels — each asked once.

   Which policy decides depends on the person and the application only, so it
   is asked once per person, as `decideSituation` does. That policy then
   decides on the same chip reading as every other sweep. With no policy to
   decide (no Global Default, say) the situation is null, and a comparison
   passes over it. `opts.substitute` is the resolver's own: this version of a
   policy, as though it were the one in force. */
export const TENANT_SITUATIONS: Situation[] = SITUATIONS.filter((s) => s.authState === AUTH_STATES[0])

export interface TenantSweep {
  appId: string
  /** One per `TENANT_SITUATIONS` entry, in its order; null where no policy decides. */
  decisions: (AccessDecision | null)[]
  /** The second factor's strength, where the decision is 2 factors. */
  factors: (FactorStrength | null)[]
  /** The deciding policy's id. */
  deciders: (string | null)[]
}

export function sweepTenant(policies: readonly Policy[], appId: string, env: SimEnv, nowMinutes: number, opts: ResolveOptions = {}): TenantSweep {
  const methods = env.library?.methods ?? AUTH_METHODS
  const governing = new Map<string, Policy | null>()
  const decisions: (AccessDecision | null)[] = []
  const factors: (FactorStrength | null)[] = []
  const deciders: (string | null)[] = []
  for (const s of TENANT_SITUATIONS) {
    const ctx = contextOf(s, nowMinutes)
    let decider = governing.get(s.userId)
    if (decider === undefined) {
      decider = governingPolicy(policies, { ...chipFacts(ctx, env), appId, personId: s.userId }, env, opts).decider
      governing.set(s.userId, decider)
    }
    if (!decider) {
      decisions.push(null)
      factors.push(null)
      deciders.push(null)
      continue
    }
    const d = decide(decider, ctx, env)
    const by = d.hitIndex === null ? decider.fallback : decider.rules[d.hitIndex]
    decisions.push(d.decision)
    factors.push(d.decision === '2fa' && by ? ruleFactor({ ...by, decision: d.decision }, methods) : null)
    deciders.push(decider.id)
  }
  return { appId, decisions, factors, deciders }
}

export type Move = 'same' | 'stricter' | 'looser'

export interface Movement {
  /** One verdict per situation, aligned to SITUATIONS. */
  moves: Move[]
  same: number
  stricter: number
  looser: number
  changed: number
  /** Where the movement went, as from→to lane pairs with counts. Decision changes only. */
  flows: { from: Lane; to: Lane; n: number }[]
  /** The biggest named groups that moved, for the "who" readout. */
  cohorts: { label: string; n: number; move: Exclude<Move, 'same'> }[]
  /** Situations that kept 2 factors but changed how strong the second factor is. */
  factorOnly: number
}

export function compare(before: Sweep, after: Sweep): Movement {
  const moves: Move[] = new Array(SITUATIONS.length)
  const flow = new Map<string, number>()
  const cohort = new Map<string, { label: string; n: number; move: Exclude<Move, 'same'> }>()
  let same = 0
  let stricter = 0
  let looser = 0
  let factorOnly = 0

  for (const s of SITUATIONS) {
    const b = before.decisions[s.index]
    const a = after.decisions[s.index]
    /* A person this policy governs neither before nor after is decided by some
       other policy both times, and nothing about this change reached them. */
    const untouched = before.outside[s.index] && after.outside[s.index]
    const fb = before.factors[s.index]
    const fa = after.factors[s.index]
    /* Same decision, different second factor: 2 factors both times, and one of
       them is easier to get past. It moves — stricter or looser by rank — and
       is counted as a change, but it is not a flow: "Verified → Verified" is
       not a lane change, and drawing it as one would read as nonsense. */
    const factorMove = !untouched && b === '2fa' && a === '2fa' && fb !== null && fa !== null && FACTOR_RANK[fb] !== FACTOR_RANK[fa]
    if (untouched || (b === a && !factorMove)) {
      moves[s.index] = 'same'
      same += 1
      continue
    }
    const move: Exclude<Move, 'same'> = factorMove
      ? FACTOR_RANK[fa!] > FACTOR_RANK[fb!]
        ? 'stricter'
        : 'looser'
      : STRICTNESS[a] > STRICTNESS[b]
        ? 'stricter'
        : 'looser'
    moves[s.index] = move
    if (move === 'stricter') stricter += 1
    else looser += 1

    if (factorMove) factorOnly += 1
    else {
      const fk = `${b}→${a}`
      flow.set(fk, (flow.get(fk) ?? 0) + 1)
    }

    /* Bucketed by the two axes an administrator thinks in — who, and where
       from. Device and risk are the reason a bucket moved, not the name of the
       people in it, and a cohort list keyed on all five axes would just be the
       situation list again with extra steps.

       And by the direction it moved. One bucket used to hold both directions
       under one label and call the lot "stricter" once any of it was, so a
       cohort where one situation tightened and twelve loosened was reported as
       thirteen tighter. Now it is two entries with true counts, under the same
       label. */
    const label = `${s.groupName} · ${s.place}`
    const ck = `${label}|${move}`
    const cur = cohort.get(ck)
    if (!cur) cohort.set(ck, { label, n: 1, move })
    else cur.n += 1
  }

  const flows = [...flow.entries()]
    .map(([k, n]) => {
      const [from, to] = k.split('→') as [Lane, Lane]
      return { from, to, n }
    })
    .sort((x, y) => y.n - x.n)

  const cohorts = [...cohort.values()]
    .map(({ label, n, move }) => ({ label, n, move }))
    .sort((x, y) => y.n - x.n)
    .slice(0, 6)

  return { moves, same, stricter, looser, changed: stricter + looser, flows, cohorts, factorOnly }
}

/* --- Badges ------------------------------------------------------------------

   Every badge is a claim about the sweep that can be checked by reading the
   grid, and every one of them can be LOST. A badge that only ever gets awarded
   is decoration; these are assertions, and the failure text names the rule or
   the situation that broke it so the badge is a route to the fix.
   -------------------------------------------------------------------------- */

export interface Badge {
  id: string
  label: string
  /** What the badge asserts, in one line. */
  claim: string
  earned: boolean
  /** Present when not earned: what specifically broke it. */
  detail?: string
}

/* Situations whose origin is an anonymising network, by index.

   By ORIGIN, not by zone membership. It was "every origin the chip table puts
   in the zone called `anon`", which is a fact about one test estate: a tenant
   whose anonymiser zone has another id — or that has none — would have lost
   the badge's whole population, and the badge would then pass by having
   nothing to check. The two origins are the same two it always named. */
export const ANON_SITUATIONS = SITUATIONS.filter((s) => s.place === 'Tor exit node' || s.place === 'Known proxy').map((s) => s.index)
/** Situations on a device the fingerprint does not recognise. */
const UNRECOGNISED_SITUATIONS = SITUATIONS.filter((s) => DEVICE_FACTS[s.device]?.recognised === false).map((s) => s.index)

export function badges(
  policy: Policy,
  after: Sweep,
  movement: Movement | null,
  errorCount: number,
): Badge[] {
  const out: Badge[] = []

  const dead = policy.rules
    .map((r, i) => ({ r, i }))
    .filter(({ r, i }) => r.enabled && after.reach[i] === 0)
  out.push({
    id: 'every-rule-fires',
    label: 'Every rule earns its place',
    claim: 'Each enabled rule wins at least one of the modelled situations.',
    earned: dead.length === 0,
    detail:
      dead.length > 0
        ? `${dead.map(({ r, i }) => `Rule ${i + 1} · ${r.name}`).join(', ')} never wins a situation in this sweep. Either the conditions cannot be met, or the sweep does not model the signal they read.`
        : undefined,
  })

  const anonLeak = ANON_SITUATIONS.filter((i) => after.decisions[i] === '1fa')
  out.push({
    id: 'anon-gated',
    label: 'Anonymised traffic is gated',
    claim: 'No login from Tor or a known proxy gets in on one factor.',
    earned: anonLeak.length === 0,
    detail:
      anonLeak.length > 0
        ? `${anonLeak.length} of ${ANON_SITUATIONS.length} anonymised situations log in on a single factor.`
        : undefined,
  })

  const deviceLeak = UNRECOGNISED_SITUATIONS.filter((i) => after.decisions[i] === '1fa')
  out.push({
    id: 'device-recognised',
    label: 'Unrecognised devices are stopped',
    claim: 'No device the fingerprint does not recognise gets in on one factor.',
    earned: deviceLeak.length === 0,
    detail:
      deviceLeak.length > 0
        ? `${deviceLeak.length} of ${UNRECOGNISED_SITUATIONS.length} situations on an unrecognised device log in on a single factor.`
        : undefined,
  })

  out.push({
    id: 'no-errors',
    label: 'No broken rules',
    claim: 'The linter finds no rule that can never run or never match.',
    earned: errorCount === 0,
    detail: errorCount > 0 ? `${errorCount} error${errorCount === 1 ? '' : 's'} still open in Checks.` : undefined,
  })

  out.push({
    id: 'attached',
    label: 'Actually in force',
    claim: 'An application is attached, so the rules are evaluated at all.',
    earned: policy.appIds.length > 0 || policy.isSystem === true,
    detail: 'No applications, so these rules never run.',
  })

  if (movement) {
    out.push({
      id: 'no-silent-loosening',
      label: 'Nothing quietly loosened',
      claim: 'No situation is treated more leniently after this change than before it.',
      earned: movement.looser === 0,
      detail:
        movement.looser > 0
          ? `${movement.looser} situation${movement.looser === 1 ? '' : 's'} get a weaker treatment than before. That is the direction worth being sure about.`
          : undefined,
    })
  }

  return out
}

/** Share of the sweep that ends in something stronger than a bare password. */
export const guardedShare = (s: Sweep) => Math.round(((s.counts['2fa'] + s.counts.deny) / s.total) * 100)
/** Share that signs in with no extra step. The other half of the trade. */
export const openShare = (s: Sweep) => Math.round((s.counts['1fa'] / s.total) * 100)
