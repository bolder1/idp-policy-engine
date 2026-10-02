import { DECISION_WORDS } from '../../../decision-words'
import { stepLabel, type SignInScreens } from '../../testing/screens-of'
import type { Via } from '../conflicts'
import { activeNode, policyPhase, type EngineRule, type EngineRun } from '../engine-run'
import { traceResult } from '../journey'

/* -----------------------------------------------------------------------------
   Directions (DirectionsLayout.tsx): the run as turn-by-turn directions, the
   way a maps app gives them. Pure: every step is drawn from the plan and `s`.

     Start · Maya Iyer                     Engineering, Finance · Office network …
     Head into AWS Console's 4 policies    the first that covers Maya applies
     Pass …                                doesn't cover her (one per policy passed)
     Take AWS for engineering teams        policy 1 · via Engineering
     Rule 1 · Contractors away …           no entry: Maya Iyer is not in Contractors
     Rule 2 · Engineers on a compliant …   turn in
     Arrive · signed in on 1 factor        Password

   A step appears as the engine reaches it — the engine does not know how far
   it will read, so neither does the list. Arrive waits at the bottom from
   the first frame: the place the route is going.
   -------------------------------------------------------------------------- */

export type DirTone = 'work' | 'ok' | 'bad' | 'warn' | 'quiet' | 'wait' | 'plain'
export type DirIcon = 'start' | 'head' | 'pass' | 'take' | 'noentry' | 'turn' | 'unknown' | 'off' | 'arrive' | 'deny' | 'depends'
export type DirKind = 'start' | 'head' | 'pass' | 'take' | 'rule' | 'arrive'

export interface AlsoLine {
  policyId: string
  text: string
  conflict: boolean
}

export interface DirStep {
  key: string
  kind: DirKind
  /** The map's element for it: `sign-in`, `which`, `policy:<id>`, `rule:<id>`, `outcome`. */
  node: string
  /** The step of the plan it is reached at. */
  at: number
  title: string
  sub: string
  /** "1 check", "2 checks": quiet, on the right. */
  dist: string
  tone: DirTone
  icon: DirIcon
  /** Index into plan.policies (pass, take) or plan.rules (rule). */
  policy?: number
  /** Several policies passed as one step. */
  policies?: number[]
  rule?: number
  also?: AlsoLine[]
}

export type Tone = 'ok' | 'bad' | 'warn' | 'quiet'

/** The landed answer's one colour: green for an allow (any factors), red for a deny, amber while it can't be told. */
export function toneOf(plan: Pick<EngineRun, 'outcome'>): Tone {
  const o = plan.outcome
  if (o.status === 'decided' && o.decision) return o.decision === 'deny' ? 'bad' : 'ok'
  return o.status === 'depends' ? 'warn' : 'quiet'
}

export const landedAt = (plan: EngineRun, s: number): boolean => s >= plan.steps.length - 1 || (plan.at.outcome >= 0 && s >= plan.at.outcome)

export const firstName = (name: string): string => name.trim().split(/\s+/)[0] || name
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/* "Ravi Menon is not in it" in a few words. */
export function reasonWords(reason: string, first: string): string {
  if (/ is not in (it|this policy)$/.test(reason)) return `Doesn’t cover ${first}`
  return reason || 'Passed'
}

/** The rule as a road sign: "Rule 2 · Engineers on a compliant device", the last row by its name. */
export const ruleTitle = (r: Pick<EngineRule, 'index' | 'name'>): string => (r.index === null ? 'Nothing else matched' : `Rule ${r.index + 1} · ${r.name}`)
export const ruleShort = (r: Pick<EngineRule, 'index'>): string => (r.index === null ? 'Last rule' : `Rule ${r.index + 1}`)

/** Where a rule stands at step `s`, as the directions say it. */
export type GateState = 'waiting' | 'reading' | 'open' | 'closed' | 'unknown' | 'off' | 'not-reached'
export function gateState(r: EngineRule, s: number): GateState {
  const t = traceResult(r, s)
  switch (t) {
    case 'reading':
      return 'reading'
    case 'matched':
      return 'open'
    case 'missed':
    case 'folded':
      return 'closed'
    case 'unknown':
    case 'possible':
      return 'unknown'
    case 'off':
      return 'off'
    case 'not-reached':
      return 'not-reached'
    default:
      return 'waiting'
  }
}

/* What a rule that let the person through says: the person's own facts, each
   once — "via Engineering · Windows 11 laptop meets Compliant devices". */
function passedWords(r: EngineRule): string {
  const parts: string[] = []
  for (const c of r.checks.slice(0, Math.max(1, r.checked))) {
    if (c.status !== 'pass') continue
    if (c.category === 'who') {
      if (r.via?.matches && r.via.say) parts.push(r.via.say)
    } else if (c.line) parts.push(c.line)
  }
  return parts.join(' · ')
}

function missWords(r: EngineRule): string {
  const c = r.failing !== null ? r.checks[r.failing] : undefined
  return c?.line || r.miss || 'A check fails'
}

/** What the person is asked for, or refused with: "Password", "Password, then miniOrange Push". */
export function askedWords(plan: EngineRun, screens: readonly SignInScreens[]): { factors: string[]; deny: string } {
  const o = plan.outcome
  const decided = o.status === 'decided' ? o.decision : null
  const sc = decided ? (screens.find((x) => x.decision === decided) ?? screens[0]) : undefined
  const steps = sc?.steps ?? []
  const d = steps.find((x) => x.kind === 'deny')
  return { factors: steps.filter((x) => x.kind !== 'deny').map(stepLabel), deny: d && d.kind === 'deny' ? d.message : '' }
}

export interface DirContext {
  person: string
  first: string
  /** "Engineering, Finance · Office network · Windows 11 laptop · registered". */
  startSub: string
  /** How the deciding policy covers them. */
  via: Via | null
  /** Later policies that also cover them, by id: true for a conflict. */
  also: ReadonlyMap<string, { name: string; conflict: boolean }>
  screens: readonly SignInScreens[]
}

/** Every step of the directions reached at step `s`, then Arrive. */
export function directionsOf(plan: EngineRun, s: number, ctx: DirContext): DirStep[] {
  const landed = landedAt(plan, s)
  const live = landed ? null : activeNode(plan, s)
  const out: DirStep[] = []
  const appName = plan.appName || 'the application'

  out.push({ key: 'start', kind: 'start', node: 'sign-in', at: 0, title: `Start · ${ctx.person}`, sub: ctx.startSub, dist: '', tone: 'plain', icon: 'start' })
  if (plan.empty) return out

  const n = plan.policies.length
  const di = plan.policies.findIndex((p) => p.decides)
  const firstScan = plan.policies.find((p) => p.scanAt !== null)?.scanAt ?? plan.at.which
  const headAt = Math.max(1, plan.at.which >= 0 ? plan.at.which : (firstScan ?? 1))
  if (n > 0 && (landed || s >= headAt)) {
    out.push({
      key: 'head',
      kind: 'head',
      node: 'which',
      at: headAt,
      title: `Head into ${appName}’s ${plural(n, 'policy', 'policies')}`,
      sub: `The first that covers ${ctx.first} applies`,
      dist: '',
      tone: 'plain',
      icon: 'head',
    })
  }

  /* The policies passed on the way: one step each, or one for many. */
  const passed = plan.policies.map((p, i) => ({ p, i })).filter(({ p, i }) => p.scanned && !p.decides && (di < 0 || i < di) && p.scanAt !== null)
  const reached = passed.filter(({ p }) => landed || s >= (p.scanAt ?? Infinity))
  if (reached.length > 2) {
    const working = reached.some(({ p }) => !landed && policyPhase(p, s) === 'working')
    const same = new Set(reached.map(({ p }) => reasonWords(p.reason, ctx.first)))
    out.push({
      key: 'pass:many',
      kind: 'pass',
      node: reached[0].p.node,
      at: reached[0].p.scanAt ?? 0,
      title: `Pass ${plural(reached.length, 'policy', 'policies')}`,
      sub: same.size === 1 ? [...same][0].replace(/^Doesn’t cover/, 'None covers') : 'None of them covers ' + ctx.first,
      dist: '',
      tone: working ? 'plain' : 'quiet',
      icon: 'pass',
      policies: reached.map(({ i }) => i),
    })
  } else {
    for (const { p, i } of reached) {
      const working = !landed && policyPhase(p, s) === 'working'
      out.push({
        key: `pass:${p.policyId}`,
        kind: 'pass',
        node: p.node,
        at: p.scanAt ?? 0,
        title: `Pass ${p.name}`,
        sub: working ? `Does it cover ${ctx.first}?` : reasonWords(p.reason, ctx.first),
        dist: '',
        tone: working ? 'plain' : 'quiet',
        icon: 'pass',
        policy: i,
      })
    }
  }

  /* The policy taken. */
  const d = di >= 0 ? plan.policies[di] : null
  if (d && (landed || s >= (d.scanAt ?? d.settleAt))) {
    const settled = landed || s >= d.settleAt
    const via = d.isGlobalDefault ? (n > 1 ? `No ${appName} policy covers ${ctx.first}` : `No ${appName} policy`) : ctx.via?.matches && ctx.via.say ? ctx.via.say : ''
    const also: AlsoLine[] = []
    if (landed) {
      for (const [id, a] of ctx.also) also.push({ policyId: id, conflict: a.conflict, text: `${a.name} also goes there · not used` })
    }
    out.push({
      key: `take:${d.policyId}`,
      kind: 'take',
      node: d.node,
      at: d.scanAt ?? d.settleAt,
      title: `Take ${d.name}`,
      sub: settled ? [`Policy ${d.order}`, via].filter(Boolean).join(' · ') : `Does it cover ${ctx.first}?`,
      dist: '',
      tone: settled ? 'ok' : 'plain',
      icon: 'take',
      policy: di,
      also,
    })
  }

  /* The rules, as the engine reads them. */
  const outTone = toneOf(plan)
  plan.rules.forEach((r, i) => {
    if (!(r.visited || r.state === 'off') || r.startAt < 0) return
    if (!landed && s < r.startAt) return
    const g = gateState(r, s)
    const isLanding = plan.landing === i
    const base = {
      key: r.node,
      kind: 'rule' as const,
      node: r.node,
      at: r.startAt,
      title: ruleTitle(r),
      rule: i,
      dist: r.index !== null && r.state !== 'off' ? plural(r.checked, 'check', 'checks') : '',
    }
    if (g === 'reading' || (live === r.node && g === 'waiting')) {
      out.push({ ...base, sub: 'Checking…', tone: 'plain', icon: 'turn' })
    } else if (g === 'open') {
      const deny = r.decision === 'deny'
      const words = r.index === null ? 'No rule above matched' : passedWords(r) || 'Every check passes'
      out.push({ ...base, sub: `${deny ? 'Matches, then Deny' : 'Turn in'} · ${words}`, tone: deny || (isLanding && outTone === 'bad') ? 'bad' : 'ok', icon: deny ? 'deny' : 'turn' })
    } else if (g === 'closed') {
      out.push({ ...base, sub: `No entry · ${missWords(r)}`, tone: 'bad', icon: 'noentry' })
    } else if (g === 'unknown') {
      const c = r.checks.find((x) => x.status === 'unknown')
      out.push({
        ...base,
        sub: r.state === 'possible' ? 'Only if the rules above don’t match' : `Can’t tell · ${c ? `${c.word.toLowerCase()} not stated` : 'a fact is not stated'}`,
        tone: 'warn',
        icon: 'unknown',
      })
    } else if (g === 'off') {
      out.push({ ...base, sub: 'Switched off · passed', tone: 'quiet', icon: 'off', dist: '' })
    }
  })

  /* Arrive: waiting at the bottom from the first frame. */
  const o = plan.outcome
  const asked = askedWords(plan, ctx.screens)
  const arriveAt = plan.at.outcome >= 0 ? plan.at.outcome : plan.steps.length - 1
  if (!landed) {
    out.push({
      key: 'arrive',
      kind: 'arrive',
      node: 'outcome',
      at: arriveAt,
      title: `Arrive at ${appName}`,
      sub: plan.steps[s]?.kind === 'deciding' ? 'Arriving…' : 'Finding the route',
      dist: '',
      tone: 'wait',
      icon: 'arrive',
    })
  } else if (o.status === 'decided' && o.decision) {
    const dec = o.decision
    out.push({
      key: 'arrive',
      kind: 'arrive',
      node: 'outcome',
      at: arriveAt,
      title: dec === 'deny' ? 'Arrive · refused' : dec === '2fa' ? 'Arrive · signed in with 2FA' : 'Arrive · signed in on 1 factor',
      sub: dec === 'deny' ? (asked.deny ? `“${asked.deny}”` : DECISION_WORDS.deny) : asked.factors.join(', then ') || DECISION_WORDS[dec],
      dist: '',
      tone: dec === 'deny' ? 'bad' : 'ok',
      icon: dec === 'deny' ? 'deny' : 'arrive',
    })
  } else if (o.status === 'depends') {
    const needs = o.view.needs.join(' and ').toLowerCase()
    out.push({
      key: 'arrive',
      kind: 'arrive',
      node: 'outcome',
      at: arriveAt,
      title: needs ? `Arrive · depends on the ${needs}` : 'Arrive · depends',
      sub: o.view.outcomes.map((x) => `${x.label}: ${DECISION_WORDS[x.decision]}`).join(' · '),
      dist: '',
      tone: 'warn',
      icon: 'depends',
    })
  } else {
    out.push({ key: 'arrive', kind: 'arrive', node: 'outcome', at: arriveAt, title: 'No route', sub: o.view.line || 'No policy decides', dist: '', tone: 'quiet', icon: 'arrive' })
  }
  return out
}

/** The step the engine is on at `s`: the one the list lights. */
export function currentKey(steps: readonly DirStep[], plan: EngineRun, s: number): string | null {
  if (landedAt(plan, s)) return null
  const node = activeNode(plan, s)
  if (node) {
    const hit = steps.find((x) => x.node === node || (x.policies?.some((i) => plan.policies[i]?.node === node) ?? false))
    if (hit) return hit.key
  }
  const kind = plan.steps[s]?.kind
  if (kind === 'find') return steps.find((x) => x.kind === 'head')?.key ?? null
  return null
}

export const verdictWords = (plan: EngineRun): string => {
  const o = plan.outcome
  if (o.status === 'decided' && o.decision) return DECISION_WORDS[o.decision]
  if (o.status === 'depends') return 'Depends'
  return o.view.line || 'No policy decides'
}

/* How tall the list stands once the run lands, from the plan alone — so the
   world holds one size while the steps arrive, and nothing jumps. Generous. */
export function listHeight(steps: readonly DirStep[], reroutes: boolean, compact = false): number {
  const lines = (text: string, per: number, max: number) => Math.min(max, Math.max(1, Math.ceil(text.length / per)))
  let h = (compact ? 92 : 104) + (reroutes ? (compact ? 48 : 86) : 0)
  for (const st of steps) {
    h += (compact ? 10 : 16) + lines(st.title, compact ? 44 : 40, compact ? 1 : 3) * 19 + (st.sub ? lines(st.sub, 48, compact ? 1 : 2) * 18 : 0) + (st.also?.length ?? 0) * 17
  }
  return h
}
