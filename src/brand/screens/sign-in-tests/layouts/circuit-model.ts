import type { CheckRow, EnginePolicy, EngineRun } from '../engine-run'
import { checkPhase, policyFound, policyPhase, rulePhase } from '../engine-run'

/* -----------------------------------------------------------------------------
   The board's state at a step (CircuitLayout.tsx), pure, from the plan and
   `s` alone: which traces the current has reached and which it runs NOW,
   where each switch stands, what the LED shows.

   Traces (circuit-geometry.ts):  src · bus:i · pin:i · pthru:i (the
   selector) · pout · feed:r · lin:r · w:r:k · w:r:end (the rule circuits) ·
   out (into the LED).

   Tones: work blue (the engine is on it) · ok green · bad red · warn amber
   (can't tell, conflict) · dead (energised, the circuit did not close) ·
   idle (not reached).
   -------------------------------------------------------------------------- */

export type Tone = 'ok' | 'bad' | 'warn' | 'none'

/** The landed path's one tone: green an allow on any number of factors, red a deny, amber Depends. */
export function pathToneOf(plan: Pick<EngineRun, 'outcome'>): Tone {
  const o = plan.outcome
  if (o.status === 'decided' && o.decision) return o.decision === 'deny' ? 'bad' : 'ok'
  return o.status === 'depends' ? 'warn' : 'none'
}

export function isLanded(plan: EngineRun, s: number): boolean {
  return s >= plan.steps.length - 1 || (plan.at.outcome >= 0 && s >= plan.at.outcome)
}

export interface Flow {
  /** Each step's front: the traces the current runs during it, in order. */
  byStep: Map<number, string[]>
  /** The step a trace is reached at. */
  at: Map<string, number>
  /** The traces the current takes to the answer. */
  live: Set<string>
}

/* Where the current goes, step by step: down the bus to the policy asked,
   into its switch; through the one that covers, across to rule 1; along
   each lane switch by switch; down the feed to the next rule when one stays
   open; out of the lane that closes into the LED. */
export function flowOf(plan: EngineRun): Flow {
  const byStep = new Map<number, string[]>()
  const at = new Map<string, number>()
  const put = (s: number, ids: string[]) => {
    const fresh = ids.filter((id) => !at.has(id))
    if (fresh.length === 0) return
    fresh.forEach((id) => at.set(id, s))
    byStep.set(s, [...(byStep.get(s) ?? []), ...fresh])
  }
  let lastRow = 0
  plan.steps.forEach((st, s) => {
    switch (st.kind) {
      case 'find':
        put(s, ['src'])
        break
      case 'scan': {
        const i = st.policy ?? 0
        const ids: string[] = []
        if (!at.has('src')) ids.push('src')
        for (let b = lastRow + 1; b <= i; b++) ids.push(`bus:${b}`)
        ids.push(`pin:${i}`)
        lastRow = Math.max(lastRow, i)
        put(s, ids)
        break
      }
      case 'found':
        if (st.policy !== undefined) put(s, [`pthru:${st.policy}`])
        break
      case 'expand':
        put(s, ['pout'])
        break
      case 'rule': {
        const r = st.rule ?? 0
        if (r > 0) {
          const ids: string[] = []
          for (let f = 1; f <= r; f++) ids.push(`feed:${f}`)
          if (plan.rules[r]?.state !== 'off') ids.push(`lin:${r}`)
          put(s, ids)
        }
        break
      }
      case 'check':
        if (st.rule !== undefined && st.check !== undefined) put(s, [`w:${st.rule}:${st.check}`])
        break
      case 'rule-end': {
        const r = st.rule !== undefined ? plan.rules[st.rule] : undefined
        if (r && (r.state === 'match' || r.state === 'possible')) put(s, [`w:${st.rule}:end`])
        break
      }
      case 'deciding':
        put(s, ['out'])
        break
      default:
        break
    }
  })

  const live = new Set<string>()
  const d = plan.policies.findIndex((p) => p.decides)
  if (d >= 0) {
    live.add('src')
    for (let b = 1; b <= d; b++) live.add(`bus:${b}`)
    live.add(`pin:${d}`)
    live.add(`pthru:${d}`)
    const L = plan.landing
    if (L !== null && plan.rules[L]) {
      live.add('pout')
      for (let f = 1; f <= L; f++) live.add(`feed:${f}`)
      if (L > 0) live.add(`lin:${L}`)
      plan.rules[L].checks.forEach((_, k) => live.add(`w:${L}:${k}`))
      live.add(`w:${L}:end`)
      live.add('out')
    }
  }
  return { byStep, at, live }
}

export type SegState = 'idle' | 'on' | 'live' | 'dead'

/* A trace at step `s`: not reached, carrying the engine's current (blue),
   or, once its circuit has settled, the live path or a dead branch. */
export function segState(id: string, plan: EngineRun, flow: Flow, s: number, landed: boolean): SegState {
  const a = flow.at.get(id)
  if (a === undefined || a > s) return 'idle'
  if (landed) return flow.live.has(id) ? 'live' : 'dead'
  const [kind, x] = id.split(':')
  if (kind === 'pin') {
    const p = plan.policies[Number(x)]
    if (p && !p.decides && policyPhase(p, s) === 'settled') return 'dead'
  }
  if (kind === 'w' || kind === 'lin') {
    const r = plan.rules[Number(x)]
    if (r && rulePhase(r, s) === 'settled' && r.state !== 'match' && r.state !== 'possible') return 'dead'
  }
  return 'on'
}

// --- Switches ---------------------------------------------------------------------------------

export type SwitchState = 'idle' | 'testing' | 'closing' | 'closed' | 'open' | 'unknown' | 'skipped' | 'off' | 'also'

/** A rule's check, as a switch in its circuit, at step `s`. */
export function checkSwitch(plan: EngineRun, r: number, k: number, s: number): SwitchState {
  const rule = plan.rules[r]
  if (!rule) return 'idle'
  if (rule.state === 'off') return 'off'
  const ph = checkPhase(rule, k, s)
  if (ph === 'working') return 'testing'
  if (ph === 'settled') {
    const c: CheckRow | undefined = rule.checks[k]
    return c?.status === 'pass' ? 'closed' : c?.status === 'fail' ? 'open' : 'unknown'
  }
  if (rule.visited && k >= rule.checked && rulePhase(rule, s) === 'settled') return 'skipped'
  return 'idle'
}

/** A policy's coverage switch at step `s`: tested by the scan, closed on the one that covers. */
export function policySwitch(p: EnginePolicy, s: number, landed: boolean, also: boolean): SwitchState {
  if (policyFound(p, s)) return 'closing'
  const ph = policyPhase(p, s)
  if (ph === 'working') return 'testing'
  if (ph === 'waiting') return landed && also ? 'also' : 'idle'
  if (p.decides) return 'closed'
  if (landed && also) return 'also'
  if (p.status === 'inactive' || /switched off/i.test(p.reason)) return 'off'
  return p.scanned ? 'open' : 'idle'
}

/** The lever closes on the one that covers as its light goes round — before it settles. */
export const policyClosing = (p: EnginePolicy, s: number): boolean => policyFound(p, s)

export type LedState = 'dark' | 'charging' | 'lit'

export function ledState(plan: EngineRun, s: number, landed: boolean): LedState {
  if (landed) return 'lit'
  return plan.steps[s]?.kind === 'deciding' ? 'charging' : 'dark'
}

/** The fact a check reads, as the source's terminal for it. */
export function factOf(c: Pick<CheckRow, 'category'>): 'person' | 'from' | 'device' | 'when' | 'risk' {
  switch (c.category) {
    case 'network':
    case 'place':
      return 'from'
    case 'device':
      return 'device'
    case 'time':
      return 'when'
    case 'risk':
      return 'risk'
    default:
      return 'person'
  }
}
