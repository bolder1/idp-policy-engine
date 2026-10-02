import type { AccessDecision } from '../../../data'
import type { CheckRow, EnginePolicy, EngineRule, EngineRun } from '../engine-run'
import { checkPhase, policyFound, policyOpen, policyPhase } from '../engine-run'
import { traceResult } from '../journey'

/* -----------------------------------------------------------------------------
   The network's state at a step (SynapseLayout.tsx): which neurons are lit,
   which synapses carry, which pulse NOW. Pure, from the plan and `s` alone.

   Neurons:  in:<input>     the sign-in's facts (in:person, in:from, …)
             pol:<i>        the application's policies, in engine order
             ck:<r>:<k>     a check row the engine read (rule r, row k)
             ru:<r>         the deciding policy's rules (and the last row)
             out:<d>        the decisions possible here, and Depends / none
   Tones:    work blue (the engine is on it) · ok green · bad red · warn
             amber (conflict, can't tell) · off grey (settled, not used) ·
             faint (never needed) · idle (there, not reached yet) · hidden.
   -------------------------------------------------------------------------- */

export type InputId = 'person' | 'from' | 'device' | 'when' | 'risk'
export type Tone = 'hidden' | 'idle' | 'work' | 'ok' | 'soft' | 'bad' | 'warn' | 'off' | 'faint'
export type OutId = AccessDecision | 'depends' | 'none'

const CAT_INPUT: Record<CheckRow['category'], InputId> = { other: 'person', app: 'person', who: 'person', network: 'from', place: 'from', device: 'device', time: 'when', risk: 'risk' }

/** The input neuron a check row reads, among those on screen (the person when its own is absent). */
export function inputOf(c: Pick<CheckRow, 'category'>, inputs: ReadonlySet<InputId>): InputId {
  const id = CAT_INPUT[c.category] ?? 'person'
  return inputs.has(id) ? id : 'person'
}

/** The landed route's one tone: green an allow, red a deny, amber Depends, grey nothing. */
export function routeTone(plan: Pick<EngineRun, 'outcome'>): Tone {
  const o = plan.outcome
  if (o.status === 'decided' && o.decision) return o.decision === 'deny' ? 'bad' : 'ok'
  return o.status === 'depends' ? 'warn' : 'off'
}

export const decisionTone = (d: AccessDecision): Tone => (d === 'deny' ? 'bad' : 'ok')

export function isLanded(plan: EngineRun, s: number): boolean {
  return s >= plan.steps.length - 1 || (plan.at.outcome >= 0 && s >= plan.at.outcome)
}

/** The rows of rule r the engine read: to the failing one, or all. */
export const readRows = (r: EngineRule): CheckRow[] => (r.visited ? r.checks.slice(0, Math.max(0, r.checked)) : [])

// --- Policies ---------------------------------------------------------------------------------

export type PolKind = 'idle' | 'scan' | 'found' | 'covers' | 'passed' | 'also' | 'quiet'

export function polKind(p: EnginePolicy, s: number, landed: boolean, also: ReadonlySet<string>): PolKind {
  if (policyFound(p, s)) return 'found'
  const ph = policyPhase(p, s)
  if (ph === 'waiting') return landed ? (also.has(p.policyId) ? 'also' : 'quiet') : 'idle'
  if (ph === 'working') return 'scan'
  if (p.decides) return 'covers'
  if (landed && also.has(p.policyId)) return 'also'
  return p.scanned ? 'passed' : 'quiet'
}

export function polTone(k: PolKind, landed: boolean, route: Tone, conflict: boolean): Tone {
  switch (k) {
    case 'scan':
    case 'found':
      return 'work'
    case 'covers':
      return landed ? route : 'ok'
    case 'passed':
      return 'off'
    case 'also':
      return conflict ? 'warn' : 'off'
    case 'quiet':
      return 'faint'
    default:
      return 'idle'
  }
}

// --- Rules and checks ---------------------------------------------------------------------------

export function ruleTone(r: EngineRule, s: number, landed: boolean, route: Tone, isLanding: boolean): Tone {
  const res = traceResult(r, s, true)
  switch (res) {
    case 'waiting':
      return 'idle'
    case 'reading':
      return 'work'
    case 'matched':
      return landed && isLanding ? route : decisionTone(r.decision)
    case 'missed':
    case 'folded':
      return 'bad'
    case 'unknown':
      return 'warn'
    case 'possible':
      return landed ? 'warn' : 'idle'
    case 'off':
      return 'off'
    default:
      return 'faint'
  }
}

/** A check neuron: its spinner while read, then its mark's own colour (✓ green, ✕ red, ? amber). */
export function checkTone(r: EngineRule, k: number, s: number): Tone {
  const ph = checkPhase(r, k, s)
  if (ph === 'hidden') return 'hidden'
  if (ph === 'working') return 'work'
  const st = r.checks[k]?.status
  return st === 'fail' ? 'bad' : st === 'unknown' ? 'warn' : 'ok'
}

// --- Outputs ---------------------------------------------------------------------------------------

const ORDER: AccessDecision[] = ['1fa', '2fa', 'deny']

/** The decisions possible here, in one order; Depends when it can't be told; "none" when no policy decides. */
export function outputsOf(plan: EngineRun): OutId[] {
  const ds = new Set<AccessDecision>(plan.rules.map((r) => r.decision))
  if (plan.outcome.decision) ds.add(plan.outcome.decision)
  plan.outcome.possible.forEach((d) => ds.add(d))
  const out: OutId[] = ORDER.filter((d) => ds.has(d))
  if (plan.outcome.status === 'depends') out.push('depends')
  if (out.length === 0) out.push('none')
  return out
}

/** The output the run lands on. */
export function chosenOf(plan: EngineRun): OutId {
  const o = plan.outcome
  if (o.status === 'decided' && o.decision) return o.decision
  return o.status === 'depends' ? 'depends' : 'none'
}

export function outTone(id: OutId, plan: EngineRun, s: number, landed: boolean): Tone {
  const at = plan.at
  if (!landed && (at.expand < 0 || s < at.expand)) return plan.policies.length === 0 ? 'idle' : 'hidden'
  const chosen = chosenOf(plan)
  const landing = plan.landing !== null ? plan.rules[plan.landing] : undefined
  if (!landed) {
    const k = plan.steps[s]?.kind
    if (k === 'deciding' && landing && (id === landing.decision || id === chosen)) return 'work'
    return 'idle'
  }
  if (id === chosen) return routeTone(plan)
  if (chosen === 'depends' && id !== 'none' && plan.outcome.possible.includes(id as AccessDecision)) return 'warn'
  return 'faint'
}

// --- The frame (the deciding policy, opened) ---------------------------------------------------------

export function frameOpen(plan: EngineRun, s: number): boolean {
  const d = plan.policies.find((p) => p.decides)
  return !!d && (policyOpen(d, s) || isLanded(plan, s))
}

// --- The beat: what pulses and what fires on step s -------------------------------------------------

export interface Beat {
  /** Synapse id → the light that runs it on this step. */
  pulses: Map<string, Tone>
  /** Neuron id → it fires on this step, in this tone. */
  fires: Map<string, Tone>
}

export function beatOf(plan: EngineRun, s: number): Beat {
  const pulses = new Map<string, Tone>()
  const fires = new Map<string, Tone>()
  const step = plan.steps[s]
  if (!step) return { pulses, fires }
  const pi = step.policy
  const ri = step.rule
  const ki = step.check
  const r = ri !== undefined ? plan.rules[ri] : undefined
  switch (step.kind) {
    case 'scan':
    case 'found':
      if (pi !== undefined) pulses.set(`p:${pi}`, 'work')
      break
    case 'decides':
      if (pi !== undefined) {
        pulses.set(`p:${pi}`, 'ok')
        fires.set(`pol:${pi}`, 'ok')
      }
      break
    case 'expand':
      pulses.set('open', 'work')
      break
    case 'check':
      if (ri !== undefined && ki !== undefined) pulses.set(`c:${ri}:${ki}`, 'work')
      break
    case 'checked': {
      if (!r || ri === undefined || ki === undefined) break
      const st = r.checks[ki]?.status
      const tone: Tone = st === 'fail' ? 'bad' : st === 'unknown' ? 'warn' : 'ok'
      pulses.set(`r:${ri}:${ki}`, tone)
      fires.set(`ck:${ri}:${ki}`, tone)
      /* A failing row of a run of ANDs ends its rule on this beat: inhibited. */
      if (st === 'fail' && r.failing === ki && s >= r.endAt - 1) fires.set(`ru:${ri}`, 'bad')
      break
    }
    case 'rule-end':
      if (!r || ri === undefined) break
      if (r.state === 'match') fires.set(`ru:${ri}`, decisionTone(r.decision))
      else if (r.state === 'unknown' || r.state === 'possible') fires.set(`ru:${ri}`, 'warn')
      else if (r.state === 'no-match') fires.set(`ru:${ri}`, 'bad')
      break
    case 'deciding':
      if (plan.landing !== null) pulses.set(`o:${plan.landing}`, 'work')
      break
    case 'outcome': {
      const tone = routeTone(plan)
      if (plan.landing !== null) pulses.set(`o:${plan.landing}`, tone)
      pulses.set('stem', tone)
      fires.set(`out:${chosenOf(plan)}`, tone)
      break
    }
    default:
      break
  }
  return { pulses, fires }
}

/* The synapses that carried the decision, once it landed: the person to the
   policy that applies, it to its rules, the facts into the landing rule's
   checks, those into it, it to its decision, and that to the card. */
export function routeOf(plan: EngineRun): Set<string> {
  const out = new Set<string>()
  const d = plan.policies.findIndex((p) => p.decides)
  if (d < 0) return out
  out.add(`p:${d}`)
  out.add('open')
  const li = plan.landing
  if (li === null) return out
  const r = plan.rules[li]
  if (!r) return out
  readRows(r).forEach((_, k) => {
    out.add(`c:${li}:${k}`)
    out.add(`r:${li}:${k}`)
  })
  out.add(`o:${li}`)
  out.add('stem')
  return out
}

// --- The re-fire: the landed run fired again in one sweep (a what-if, or back) -------------------

export interface Wave {
  /** Synapse id → its light and when it sets off (s). */
  pulses: Map<string, { tone: Tone; delay: number }>
  /** Neuron id → it fires, and when (s). */
  fires: Map<string, { tone: Tone; delay: number }>
  /** How long the sweep lasts (s): the card blooms at its end. */
  end: number
}

/* Layer by layer, as the engine read them: the person into the policies read
   (the one that applies in green), it into its rules; each rule read in turn,
   its checks fed by the facts and firing ✓ or ✕ into it; the rule that
   matched into its decision, and that into the card. */
export function waveOf(plan: EngineRun): Wave {
  const pulses: Wave['pulses'] = new Map()
  const fires: Wave['fires'] = new Map()
  const route = routeTone(plan)
  const d = plan.policies.findIndex((p) => p.decides)
  let t = 0
  plan.policies.forEach((p, i) => {
    if (!p.scanned && !p.decides) return
    const at = Math.min(i, 5) * 0.07
    pulses.set(`p:${i}`, { tone: p.decides ? 'ok' : 'off', delay: at })
    if (p.decides) fires.set(`pol:${i}`, { tone: route === 'off' ? 'ok' : route, delay: at + 0.42 })
    t = Math.max(t, at + 0.42)
  })
  if (d < 0) return { pulses, fires, end: t + 0.3 }
  pulses.set('open', { tone: 'work', delay: t })
  t += 0.32
  plan.rules.forEach((r, ri) => {
    const rows = readRows(r)
    if (rows.length === 0 && r.state !== 'match') return
    rows.forEach((c, k) => {
      const tone: Tone = c.status === 'fail' ? 'bad' : c.status === 'unknown' ? 'warn' : 'ok'
      pulses.set(`c:${ri}:${k}`, { tone: 'work', delay: t })
      pulses.set(`r:${ri}:${k}`, { tone, delay: t + 0.34 })
      fires.set(`ck:${ri}:${k}`, { tone, delay: t + 0.34 })
    })
    const ruleTone: Tone = r.state === 'match' ? decisionTone(r.decision) : r.state === 'unknown' || r.state === 'possible' ? 'warn' : 'bad'
    fires.set(`ru:${ri}`, { tone: ruleTone, delay: t + 0.58 })
    t += 0.4
  })
  if (plan.landing !== null) {
    pulses.set(`o:${plan.landing}`, { tone: route, delay: t + 0.2 })
    pulses.set('stem', { tone: route, delay: t + 0.6 })
  }
  fires.set(`out:${chosenOf(plan)}`, { tone: route, delay: t + 0.55 })
  return { pulses, fires, end: t + 0.7 }
}
