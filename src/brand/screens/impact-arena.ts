import type { AccessDecision, Policy } from '../data'
import {
  AUTH_STATES,
  DEVICE_FACTS,
  DEVICE_OPTIONS,
  PLACES,
  PLACE_FACTS,
  RISKS,
  SIM_USERS,
  decide,
  type SimContext,
  type SimEnv,
} from './simulate'

/* -----------------------------------------------------------------------------
   The Impact arena — the "what does this change" function, made visible.

   `impactOf()` in diagnostics.ts answers per-rule impact from `matchEstimate`,
   which is seed data and honestly labelled as an estimate. That is the right
   answer for a number sitting next to a rule while you edit it. It is the wrong
   answer for the question this screen asks — *what does publishing this change
   do* — because you cannot subtract two estimates and present the difference as
   a consequence.

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
export const SWEEP_AXES = [
  { name: 'People', values: SIM_USERS.map((u) => u.name) },
  { name: 'Origin', values: PLACES },
  { name: 'Device', values: DEVICE_OPTIONS },
  { name: 'Auth state', values: AUTH_STATES },
  { name: 'Risk signal', values: RISKS },
]

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
  { id: 'deny', label: 'Blocked', caption: 'The sign-in is refused' },
]

const STRICTNESS: Record<AccessDecision, number> = { '1fa': 0, '2fa': 1, deny: 2 }

export interface Sweep {
  /** One decision per situation, in SITUATIONS order. */
  decisions: AccessDecision[]
  /** Which rule won each situation. Null means nothing matched. */
  winners: (number | null)[]
  counts: Record<Lane, number>
  /** How many situations each rule index actually wins. Exact over the grid. */
  reach: number[]
  /** Situations no rule claimed, so the engine default decided them. */
  fellThrough: number
  total: number
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

export function sweep(policy: Policy, env: SimEnv, nowMinutes: number): Sweep {
  const decisions: AccessDecision[] = new Array(SITUATIONS.length)
  const winners: (number | null)[] = new Array(SITUATIONS.length)
  const reach = new Array(policy.rules.length).fill(0)
  const counts: Record<Lane, number> = { '1fa': 0, '2fa': 0, deny: 0 }
  let fellThrough = 0

  for (const s of SITUATIONS) {
    const { decision, hitIndex } = decide(policy, contextOf(s, nowMinutes), env)
    decisions[s.index] = decision
    winners[s.index] = hitIndex
    counts[decision] += 1
    if (hitIndex === null) fellThrough += 1
    else reach[hitIndex] += 1
  }

  return { decisions, winners, counts, reach, fellThrough, total: SITUATIONS.length }
}

export type Move = 'same' | 'stricter' | 'looser'

export interface Movement {
  /** One verdict per situation, aligned to SITUATIONS. */
  moves: Move[]
  same: number
  stricter: number
  looser: number
  changed: number
  /** Where the movement went, as from→to lane pairs with counts. */
  flows: { from: Lane; to: Lane; n: number }[]
  /** The biggest named groups that moved, for the "who" readout. */
  cohorts: { label: string; n: number; move: Exclude<Move, 'same'> }[]
}

export function compare(before: Sweep, after: Sweep): Movement {
  const moves: Move[] = new Array(SITUATIONS.length)
  const flow = new Map<string, number>()
  const cohort = new Map<string, { n: number; move: Exclude<Move, 'same'> }>()
  let same = 0
  let stricter = 0
  let looser = 0

  for (const s of SITUATIONS) {
    const b = before.decisions[s.index]
    const a = after.decisions[s.index]
    if (b === a) {
      moves[s.index] = 'same'
      same += 1
      continue
    }
    const move: Exclude<Move, 'same'> = STRICTNESS[a] > STRICTNESS[b] ? 'stricter' : 'looser'
    moves[s.index] = move
    if (move === 'stricter') stricter += 1
    else looser += 1

    const fk = `${b}→${a}`
    flow.set(fk, (flow.get(fk) ?? 0) + 1)

    /* Bucketed by the two axes an administrator thinks in — who, and where
       from. Device and risk are the reason a bucket moved, not the name of the
       people in it, and a cohort list keyed on all five axes would just be the
       situation list again with extra steps. */
    const ck = `${s.groupName} · ${s.place}`
    const cur = cohort.get(ck)
    if (!cur) cohort.set(ck, { n: 1, move })
    else cohort.set(ck, { n: cur.n + 1, move: cur.move === move ? move : 'stricter' })
  }

  const flows = [...flow.entries()]
    .map(([k, n]) => {
      const [from, to] = k.split('→') as [Lane, Lane]
      return { from, to, n }
    })
    .sort((x, y) => y.n - x.n)

  const cohorts = [...cohort.entries()]
    .map(([label, v]) => ({ label, n: v.n, move: v.move }))
    .sort((x, y) => y.n - x.n)
    .slice(0, 6)

  return { moves, same, stricter, looser, changed: stricter + looser, flows, cohorts }
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

/** Situations whose origin is an anonymising network, by index. */
const ANON_SITUATIONS = SITUATIONS.filter((s) => (PLACE_FACTS[s.place]?.zonesIn ?? []).includes('anon')).map((s) => s.index)
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
    claim: 'No sign-in from Tor or a known proxy gets in on one factor.',
    earned: anonLeak.length === 0,
    detail:
      anonLeak.length > 0
        ? `${anonLeak.length} of ${ANON_SITUATIONS.length} anonymised situations sign in on a single factor.`
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
        ? `${deviceLeak.length} of ${UNRECOGNISED_SITUATIONS.length} situations on an unrecognised device sign in on a single factor.`
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
    claim: 'At least one application is attached, so the rules are evaluated at all.',
    earned: policy.allApps === true || policy.appIds.length > 0,
    detail: 'No apps assigned — these rules are saved but never evaluated.',
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
