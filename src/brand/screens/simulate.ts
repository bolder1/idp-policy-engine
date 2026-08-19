import { conditionType, type AccessDecision, type Condition, type Policy, type Rule } from '../data'

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
    case 'group':
      return decide(vals.includes(ctx.user.groupName), `${ctx.user.name} is in ${ctx.user.groupName}`)

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

export interface RuleVerdict {
  match: boolean
  reason: string
}

export function evalRule(rule: Rule, ctx: SimContext, env: SimEnv): RuleVerdict {
  /* The audience is condition zero. A rule scoped to Finance never gets to look
     at its conditions for a contractor, and saying so is far more useful than
     reporting the first condition of a rule that was never in play. */
  if (!rule.appliesTo.includes('all') && !rule.appliesTo.includes(ctx.user.groupId)) {
    const to = rule.appliesTo.map(env.groupName).join(', ')
    return { match: false, reason: `Applies to ${to} — ${ctx.user.name} is in ${ctx.user.groupName}` }
  }

  if (rule.conditions.length === 0) {
    return { match: true, reason: 'No conditions — this step catches everything that reaches it' }
  }

  const results = rule.conditions.map((c) => evalCond(c, ctx))
  // Left to right, no precedence — the same way the builder writes the rule out
  // as a sentence. Anything else would make the UI and the trace disagree.
  let acc = results[0].state === 'pass'
  for (let i = 1; i < results.length; i++) {
    const ok = results[i].state === 'pass'
    acc = rule.conditions[i].joiner === 'OR' ? acc || ok : acc && ok
  }

  if (acc) {
    const n = rule.conditions.length
    return { match: true, reason: `All ${n} condition${n === 1 ? '' : 's'} met` }
  }

  // One reason, not a list. The first thing that failed is the thing to fix.
  const i = results.findIndex((r) => r.state !== 'pass')
  return { match: false, reason: `${condPhrase(rule.conditions[i], env)} — ${results[i].detail}` }
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
}

export function walk(policy: Policy, ctx: SimContext, env: SimEnv): TraceResult {
  const steps: TraceStep[] = []
  let hitIndex: number | null = null

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
  return { steps, hitIndex, decision: hitIndex === null ? '1fa' : policy.rules[hitIndex].decision }
}

/** The decision only — used by the situation sweep, which runs thousands of
    walks and would otherwise allocate a trace array for every one of them. */
export function decide(policy: Policy, ctx: SimContext, env: SimEnv): { decision: AccessDecision; hitIndex: number | null } {
  for (let i = 0; i < policy.rules.length; i++) {
    const rule = policy.rules[i]
    if (!rule.enabled) continue
    if (evalRule(rule, ctx, env).match) return { decision: rule.decision, hitIndex: i }
  }
  return { decision: '1fa', hitIndex: null }
}

/** A stand-in environment for callers with no store — tests, mostly. */
export const rawEnv: SimEnv = {
  zoneName: (id) => id,
  fingerprintName: (id) => id,
  groupName: (id) => id,
}
