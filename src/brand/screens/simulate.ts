import { conditionType, type AccessDecision, type Condition, type Policy, type Rule } from '../data'
import { blame, cardJoin, cardName, credit, leaves, predicatePasses, topJoin } from '../predicate'

/* -----------------------------------------------------------------------------
   The simulation core.

   Lifted verbatim out of builder-test.tsx so that every surface which claims to
   say what a policy would do — the Test dialog, the Gauntlet, the Impact arena —
   answers from ONE evaluator. Three implementations of "would this rule match"
   is three chances for two screens to contradict each other in front of an
   administrator, and the moment that happens none of them are believed again.

   The honest limit, repeated wherever this is surfaced: the map from a context
   option to a condition value is a fixed table, not the engine. What is real is
   the ORDER of evaluation, the first-match-wins stop, and the decision that
   results.
   -------------------------------------------------------------------------- */

export interface SimUser {
  id: string
  name: string
  email: string
  groupId: string
  groupName: string
  userType: string
  role: string
}

export const SIM_USERS: SimUser[] = [
  { id: 'priya', name: 'Priya Sharma', email: 'priya@mo.com', groupId: 'finance', groupName: 'Finance', userType: 'Employee', role: 'Member' },
  { id: 'arun', name: 'Arun Patel', email: 'arun@mo.com', groupId: 'engineering', groupName: 'Engineering', userType: 'Employee', role: 'Member' },
  { id: 'mehak', name: 'Mehak Garg', email: 'mehak@mo.com', groupId: 'executives', groupName: 'Executives', userType: 'Employee', role: 'Admin' },
  { id: 'devon', name: 'Devon Rao', email: 'devon@ext.com', groupId: 'contractors', groupName: 'Contractors', userType: 'Contractor', role: 'Member' },
]

export const PLACES = ['Any location', 'Office Network', 'Outside all zones', 'Tor exit node', 'Known proxy']
export const DEVICE_OPTIONS = ['New / unknown', 'Known < 90 days', 'Known > 90 days', 'Expired trust', 'Managed (MDM)', 'Changed fingerprint']
export const AUTH_STATES = ['Normal returning user', 'First time login', 'MFA recently reset', 'No MFA configured']
export const RISKS = ['Low', 'Medium', 'High']

/* `zonesIn: null` is the whole reason "Any location" is not a free pass. An
   unspecified origin cannot decide a zone test either way, so those rules come
   back undecided rather than silently passing — which is what tells the author
   to pin the axis down. Every other option names its zones exactly, so
   "not in zone X" is definite for all X. */
export interface PlaceFacts {
  zonesIn: string[] | null
  country: string | null
  state: string | null
  city: string | null
}

export const PLACE_FACTS: Record<string, PlaceFacts> = {
  'Any location': { zonesIn: null, country: null, state: null, city: null },
  'Office Network': { zonesIn: ['office'], country: 'India', state: 'Maharashtra', city: 'Pune' },
  'Outside all zones': { zonesIn: [], country: 'United States', state: 'Texas', city: 'Austin' },
  'Tor exit node': { zonesIn: ['anon'], country: null, state: null, city: null },
  'Known proxy': { zonesIn: ['anon'], country: 'Germany', state: null, city: null },
}

export interface DeviceFacts {
  /* Whether the fingerprint still matches — not whether the device is
     healthy. A device can be perfectly recognisable and badly configured. */
  recognised: boolean
  mdm: string
  registration: string
  trustDays: number
}

export const DEVICE_FACTS: Record<string, DeviceFacts> = {
  'New / unknown': { recognised: false, mdm: 'Not enrolled', registration: 'Unregistered', trustDays: 0 },
  'Known < 90 days': { recognised: true, mdm: 'Not enrolled', registration: 'Registered', trustDays: 34 },
  'Known > 90 days': { recognised: true, mdm: 'Not enrolled', registration: 'Registered', trustDays: 214 },
  'Expired trust': { recognised: false, mdm: 'Not enrolled', registration: 'Pending', trustDays: 402 },
  'Managed (MDM)': { recognised: true, mdm: 'Enrolled', registration: 'Registered', trustDays: 120 },
  'Changed fingerprint': { recognised: false, mdm: 'Not enrolled', registration: 'Registered', trustDays: 61 },
}

export const RISK_SCORE: Record<string, number> = { Low: 12, Medium: 48, High: 86 }

export interface SimContext {
  user: SimUser
  place: string
  device: string
  authState: string
  risk: string
  /** Captured once per run so the trace cannot shift under a re-render. */
  nowMinutes: number
}

export interface SimEnv {
  zoneName: (id: string) => string
  fingerprintName: (id: string) => string
  groupName: (id: string) => string
}

// --- Evaluation --------------------------------------------------------------

export type CondState = 'pass' | 'fail' | 'unknown'

export const clock = (mins: number) =>
  `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map((n) => Number(n))
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0)
}

export function condPhrase(c: Condition, env: SimEnv): string {
  const t = conditionType(c.typeId)
  const vals = c.values.filter((v) => v.trim() !== '')
  const shown =
    t.valueKind === 'zone'
      ? vals.map(env.zoneName).join(', ')
      : t.valueKind === 'fingerprint'
        ? vals.map(env.fingerprintName).join(', ')
        : t.valueKind === 'time'
          ? `${vals[0] ?? '—'}–${vals[1] ?? '—'}`
          : vals.join(', ')
  return `${t.label} ${c.operator} ${shown || '…'}`
}

/* One condition against one context. `unknown` is deliberately NOT treated as a
   pass: a signal this sim cannot derive is reported as unmet, because claiming
   a match on a fact we never had is the one failure mode that would make the
   whole trace untrustworthy. */
export function evalCond(c: Condition, ctx: SimContext): { state: CondState; detail: string } {
  const t = conditionType(c.typeId)
  const vals = c.values.filter((v) => v.trim() !== '')
  if (vals.length === 0) return { state: 'unknown', detail: 'the condition has no value set' }

  const negated = c.operator.includes('not')
  const place = PLACE_FACTS[ctx.place]
  const device = DEVICE_FACTS[ctx.device]
  const decide = (hit: boolean, detail: string): { state: CondState; detail: string } => ({
    state: (negated ? !hit : hit) ? 'pass' : 'fail',
    detail,
  })
  const unknown = (detail: string): { state: CondState; detail: string } => ({ state: 'unknown', detail })

  switch (t.id) {
    case 'zone': {
      if (!place.zonesIn) return unknown('“Any location” does not fix an origin, so zone membership is undecided')
      const inside = vals.some((v) => place.zonesIn!.includes(v))
      const where = place.zonesIn.length === 0 ? 'this sign-in is in no zone at all' : `this sign-in is in ${ctx.place}`
      return decide(inside, where)
    }
    case 'country':
      return place.country === null
        ? unknown(`“${ctx.place}” does not fix a country`)
        : decide(vals.includes(place.country), `the connection geolocates to ${place.country}`)
    case 'state':
      return place.state === null
        ? unknown(`“${ctx.place}” does not fix a state`)
        : decide(vals.includes(place.state), `the connection geolocates to ${place.state}`)
    case 'city':
      return place.city === null
        ? unknown(`“${ctx.place}” does not fix a city`)
        : decide(vals.includes(place.city), `the connection geolocates to ${place.city}`)

    case 'fingerprint':
      return decide(
        device.recognised,
        `the device fingerprint ${device.recognised ? 'matches the profile' : 'does not match the profile'}`,
      )
    case 'mdm':
      return decide(vals.includes(device.mdm), `the device is ${device.mdm.toLowerCase()} in MDM`)
    case 'device-reg':
      return decide(vals.includes(device.registration), `the device is ${device.registration.toLowerCase()}`)
    case 'trust-age': {
      const limit = Number(vals[0])
      if (!Number.isFinite(limit)) return unknown('the trust-age limit is not a number')
      const hit = c.operator === 'under' ? device.trustDays < limit : device.trustDays > limit
      // Handled directly rather than through decide() — "under"/"over" carry
      // the comparison, so the generic negation flip does not apply.
      return { state: hit ? 'pass' : 'fail', detail: `this device has been trusted for ${device.trustDays} days` }
    }

    case 'ml-risk':
      return decide(vals.includes(ctx.risk), `the risk signal is ${ctx.risk}`)
    case 'device-risk': {
      const limit = Number(vals[0])
      if (!Number.isFinite(limit)) return unknown('the risk threshold is not a number')
      const score = RISK_SCORE[ctx.risk]
      const hit = c.operator === 'above' ? score > limit : score < limit
      return { state: hit ? 'pass' : 'fail', detail: `${ctx.risk} risk scores ${score}` }
    }

    case 'auth-state':
      return decide(vals.includes(ctx.authState), `the auth state is ${ctx.authState.toLowerCase()}`)
    case 'user-type':
      return decide(vals.includes(ctx.user.userType), `${ctx.user.name} is a ${ctx.user.userType.toLowerCase()}`)
    case 'user-role':
      return decide(vals.includes(ctx.user.role), `${ctx.user.name} has the ${ctx.user.role} role`)
    /* Keyed by group ID, not display name.

       It used to compare against `groupName`, which meant renaming a group in
       the directory silently stopped every rule that named it from matching.
       The catalogue entry now carries no hardcoded options at all — the picker
       reads live groups — so ids are the only stable key. */
    case 'group':
      return decide(vals.includes(ctx.user.groupId), `${ctx.user.name} is in ${ctx.user.groupName}`)
    /* New, and load-bearing: with the audience hoisted to the policy, naming a
       person or a group inside a rule is the ONLY way to narrow within a
       policy. It has to actually evaluate, or the first thing an admin reaches
       for after the hoist returns "unknown". */
    case 'user':
      return decide(vals.includes(ctx.user.id), `this sign-in is ${ctx.user.name}`)

    case 'time': {
      const from = toMinutes(vals[0] ?? '00:00')
      const to = toMinutes(vals[1] ?? '23:59')
      // A window that wraps midnight is an OR, not an AND.
      const inside = from <= to ? ctx.nowMinutes >= from && ctx.nowMinutes <= to : ctx.nowMinutes >= from || ctx.nowMinutes <= to
      return decide(inside, `it is ${clock(ctx.nowMinutes)} right now`)
    }

    default:
      return unknown(`this simulation does not model ${t.label.toLowerCase()}`)
  }
}

/* What an unmatched sign-in gets. Optional on the model so every existing
   policy literal keeps working, and `1fa` here is the behaviour those policies
   already had — so reading it is a no-op for them and a real answer for
   anything that has set it. */
export const fallbackOf = (p: Policy): AccessDecision => p.fallback?.decision ?? '1fa'

export interface RuleVerdict {
  match: boolean
  reason: string
  /** Which card carried the match, or came closest to it. Null when there are no cards. */
  card: number | null
}

/* One rule against one context.

   The audience test that used to sit at the top of this function is gone — it
   is a policy-level fact now, short-circuited once in `walk` rather than
   re-asked for every rule. What is left is the predicate, and the predicate is
   a disjunction: the rule matches when ANY card has every one of its conditions
   met.

   `unknown` is not a pass, here as in `evalCond`. A card the simulator cannot
   fully decide does not carry the match. */
export function evalRule(rule: Rule, ctx: SimContext, env: SimEnv): RuleVerdict {
  const p = rule.when

  if (p.cards.length === 0) {
    return { match: true, reason: 'No conditions — this step catches everything that reaches it', card: null }
  }

  const results = new Map<string, { state: CondState; detail: string }>()
  for (const c of leaves(p)) results.set(c.id, evalCond(c, ctx))
  const passed = (c: Condition) => results.get(c.id)?.state === 'pass'

  /* Asked of the whole predicate. `credit` names the card that carried it,
     but with the cards joined by AND one passing card is not a match — every
     card has to hold, and returning on the first would report a match the
     engine would not make. */
  const won = predicatePasses(p, passed) ? credit(p, passed) : null
  if (won) {
    const n = won.card.conditions.length
    const oneRun = p.cards.length === 1
    /* "All N conditions met" is only true when there is one card. With
       alternatives it is false — the other card's conditions were NOT met —
       and a trace that overstates what it checked is a trace nobody believes
       the second time. */
    return {
      match: true,
      reason: oneRun
        ? cardJoin(won.card) === 'or'
          ? `One of ${n} condition${n === 1 ? '' : 's'} met`
          : `All ${n} condition${n === 1 ? '' : 's'} met`
        : topJoin(p) === 'and'
          ? `All ${p.cards.length} groups met`
          : `Matched ${cardName(won.card, won.index)}`,
      card: won.index,
    }
  }

  /* One reason, not a list — but "the first thing that failed" is meaningless
     across three alternatives that each failed differently. The useful answer
     is the alternative that came closest. */
  const near = blame(p, passed)
  if (!near) return { match: false, reason: 'No card could be satisfied', card: null }
  const detail = results.get(near.condition.id)?.detail ?? ''
  const prefix = p.cards.length > 1 ? `Closest was ${cardName(near.card, near.index)}: ` : ''
  return { match: false, reason: `${prefix}${condPhrase(near.condition, env)} — ${detail}`, card: near.index }
}

/** Does this policy govern the person signing in? Asked once, above the rules. */
export function inAudience(policy: Policy, ctx: SimContext): boolean {
  const a = policy.audience
  return a.everyone || a.groupIds.includes(ctx.user.groupId) || a.userIds.includes(ctx.user.id)
}

export type StepKind = 'off' | 'miss' | 'hit' | 'unreached'

export interface TraceStep {
  index: number
  rule: Rule
  kind: StepKind
  reason: string
}

export interface TraceResult {
  steps: TraceStep[]
  hitIndex: number | null
  decision: AccessDecision
  /* The policy did not govern this person at all, so no rule ran.

     Distinct from "every rule missed": the surfaces that count what the engine
     decided must not fold these together, or a policy scoped to Finance reads
     as though it evaluated — and let through — every contractor in the tenant. */
  outOfAudience: boolean
}

export function walk(policy: Policy, ctx: SimContext, env: SimEnv): TraceResult {
  const steps: TraceStep[] = []
  let hitIndex: number | null = null

  /* The audience, asked once. It used to be re-asked inside every rule, which
     produced a trace where five rules each explained separately that they were
     not for this person. The policy either governs somebody or it does not. */
  if (!inAudience(policy, ctx)) {
    return { steps, hitIndex: null, decision: fallbackOf(policy), outOfAudience: true }
  }

  for (let i = 0; i < policy.rules.length; i++) {
    const rule = policy.rules[i]
    if (hitIndex !== null) {
      steps.push({ index: i, rule, kind: 'unreached', reason: 'Evaluation had already stopped' })
      continue
    }
    if (!rule.enabled) {
      steps.push({ index: i, rule, kind: 'off', reason: 'This step is switched off' })
      continue
    }
    const verdict = evalRule(rule, ctx, env)
    steps.push({ index: i, rule, kind: verdict.match ? 'hit' : 'miss', reason: verdict.reason })
    if (verdict.match) hitIndex = i
  }

  // No hit falls through to the engine default, which lets the sign-in proceed
  // on the first factor alone. There is no 'allow' decision in the model.
  return {
    steps,
    hitIndex,
    decision: hitIndex === null ? fallbackOf(policy) : policy.rules[hitIndex].decision,
    outOfAudience: false,
  }
}

/** The decision only — used by the situation sweep, which runs thousands of
    walks and would otherwise allocate a trace array for every one of them. */
export function decide(
  policy: Policy,
  ctx: SimContext,
  env: SimEnv,
): { decision: AccessDecision; hitIndex: number | null; outOfAudience: boolean } {
  /* Same gate as `walk`, and it has to be here too. The sweep runs 1,440
     situations through this function; without the gate, every person outside
     the audience is counted as "the engine looked and let them through", which
     inflates the fell-through lane on every scoped policy and corrupts the
     blast-radius numbers the review stage is built on. */
  if (!inAudience(policy, ctx)) return { decision: fallbackOf(policy), hitIndex: null, outOfAudience: true }

  for (let i = 0; i < policy.rules.length; i++) {
    const rule = policy.rules[i]
    if (!rule.enabled) continue
    if (evalRule(rule, ctx, env).match) return { decision: rule.decision, hitIndex: i, outOfAudience: false }
  }
  return { decision: fallbackOf(policy), hitIndex: null, outOfAudience: false }
}

/** A stand-in environment for callers with no store — tests, mostly. */
export const rawEnv: SimEnv = {
  zoneName: (id) => id,
  fingerprintName: (id) => id,
  groupName: (id) => id,
}
