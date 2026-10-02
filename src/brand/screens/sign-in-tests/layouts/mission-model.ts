import { DECISION_WORDS } from '../../../decision-words'
import type { LineStatus } from '../../testing/evidence'
import { policyFound, policyPhase, type CheckRow, type EnginePolicy, type EngineRule, type EngineRun } from '../engine-run'
import { traceResult } from '../journey'
import { stepMs } from '../use-engine-run'
import { deciderVia, failingOf, type Tone } from './mission-intents'

/* -----------------------------------------------------------------------------
   The launch poll's model (MissionLayout.tsx), pure: what every station calls
   at step `s`, the mission log's lines and their mission-elapsed times, and how
   far the flight has got along its arc. Everything is read from the plan
   (engine-run.ts) and the helpers beside it (journey.ts); nothing here decides.
   -------------------------------------------------------------------------- */

/** A policy station at step `s`. */
export type StationState = 'standby' | 'unpolled' | 'polling' | 'go' | 'nogo' | 'off' | 'also'

export function policyStation(p: EnginePolicy, s: number, landed: boolean, also: ReadonlySet<string>): StationState {
  if (policyFound(p, s)) return 'go'
  const ph = policyPhase(p, s)
  if (ph === 'working') return 'polling'
  if (ph === 'waiting') return 'standby'
  if (p.decides) return 'go'
  if (landed && also.has(p.policyId)) return 'also'
  if (p.scanned) return /is not in (it|this policy)$/.test(p.reason) || /not in/i.test(p.reason) ? 'nogo' : 'off'
  /* Never asked: switched off or a draft, before the one that decides; or after it, standing by. */
  const on = p.status === 'active' || p.status === 'always-on'
  return on ? (landed ? 'unpolled' : 'standby') : 'off'
}

/** The station's readout: its call, and the few words after it. */
export function policyReadout(p: EnginePolicy, st: StationState, plan: EngineRun, first: string): { call: string; words: string } {
  switch (st) {
    case 'polling':
      return { call: 'Polling', words: '' }
    case 'go': {
      if (p.isGlobalDefault) return { call: 'GO', words: plan.policies.length > 1 ? 'none above is GO' : 'the only one' }
      const via = deciderVia(plan)
      return { call: 'GO', words: via?.say || `covers ${first}` }
    }
    case 'nogo':
      return { call: 'NO-GO', words: 'not in it' }
    case 'off':
      return { call: 'Off', words: p.reason && !/^not reached$/i.test(p.reason) ? lower(p.reason) : 'not on' }
    case 'also': {
      const c = plan.conflicts?.policies.find((x) => x.policyId === p.policyId)
      return { call: 'Also GO', words: c?.via.say ? `${c.via.say} · not used` : 'not used' }
    }
    case 'unpolled':
      return { call: 'Not polled', words: '' }
    default:
      return { call: 'Standing by', words: '' }
  }
}

const lower = (t: string) => (t ? t.charAt(0).toLowerCase() + t.slice(1) : t)

/** A rule station at step `s`. */
export type RuleStationState = 'standby' | 'polling' | 'go' | 'scrub' | 'nogo' | 'hold' | 'ifnot' | 'off' | 'unpolled' | 'also'

export function ruleStation(r: EngineRule, s: number, landed: boolean, clash: ReadonlySet<string>): RuleStationState {
  const res = traceResult(r, s)
  switch (res) {
    case 'reading':
      return 'polling'
    case 'matched':
      return r.decision === 'deny' ? 'scrub' : 'go'
    case 'missed':
    case 'folded':
      return 'nogo'
    case 'unknown':
      return 'hold'
    case 'possible':
      return 'ifnot'
    case 'off':
      return 'off'
    case 'not-reached':
      return landed && clash.has(r.id) ? 'also' : 'unpolled'
    default:
      return landed && r.state === 'not-reached' ? (clash.has(r.id) ? 'also' : 'unpolled') : 'standby'
  }
}

export function ruleReadout(r: EngineRule, st: RuleStationState): { call: string; words: string } {
  switch (st) {
    case 'polling':
      return { call: 'Polling', words: '' }
    case 'go':
      return { call: 'GO', words: DECISION_WORDS[r.decision] }
    case 'scrub':
      return { call: 'SCRUB', words: r.index === null ? 'nothing else matched' : 'matches · Deny' }
    case 'nogo': {
      const c = failingOf(r)
      return { call: 'NO-GO', words: c ? c.word : '' }
    }
    case 'hold': {
      const c = r.checks.find((x) => x.status === 'unknown')
      return { call: 'HOLD', words: c ? `can't tell the ${c.word.toLowerCase()}` : "can't tell" }
    }
    case 'ifnot':
      return { call: 'If not', words: DECISION_WORDS[r.decision] }
    case 'off':
      return { call: 'Off', words: 'switched off' }
    case 'also':
      return { call: 'Also GO', words: 'not used' }
    case 'unpolled':
      return { call: 'Not polled', words: '' }
    default:
      return { call: 'Standing by', words: '' }
  }
}

/** A telemetry line's call. */
export const CALL: Record<LineStatus, string> = { pass: 'GO', fail: 'NO-GO', unknown: 'HOLD' }
export const CALL_TONE: Record<LineStatus, Tone> = { pass: 'positive', fail: 'negative', unknown: 'notice' }

/** A telemetry line's fact, as the sign-in showed it. For a Who that let them in: by which group. Never the rule's requirement. */
export function telemetryFact(c: CheckRow, via: EngineRule['via']): string {
  if (c.missing || c.status === 'unknown') return c.value && c.value !== 'Not stated' && !c.missing ? c.value : 'Not stated'
  if (c.category === 'who' && c.status === 'pass' && via?.matches && via.say) return via.say
  return c.value || '—'
}

/** What the rule needs, said after the fact: "needs Engineering, DevOps". */
export function telemetryNeed(c: CheckRow): string {
  if (!c.requirement) return ''
  const r = c.requirement
  return `needs ${/^(Not|Below|Above|Between|Before|After|Any) /.test(r) ? r.charAt(0).toLowerCase() + r.slice(1) : r}`
}

// --- Mission-elapsed time -----------------------------------------------------------------

/** When step `k` starts, from the poll's open, in ms (at the pace it plays). */
export function elapsedAt(plan: EngineRun, k: number): number {
  let t = 0
  for (let i = 0; i < k && i < plan.steps.length; i++) t += stepMs(plan, i)
  return t
}

/** "T+00:02.4" */
export function met(ms: number): string {
  const tenths = Math.max(0, Math.round(ms / 100))
  const m = Math.floor(tenths / 600)
  const sec = Math.floor((tenths % 600) / 10)
  const d = tenths % 10
  return `T+${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${d}`
}

// --- The mission log ------------------------------------------------------------------------

export interface LogLine {
  key: string
  /** The step it is called at. */
  at: number
  /** What is called: "Rule 1 · NO-GO · Who". */
  text: string
  tone: Tone | 'working'
  /** What it is about (data-mx). */
  node: string | null
}

const toneOfCall = (st: RuleStationState | StationState): Tone => (st === 'go' ? 'positive' : st === 'scrub' || st === 'nogo' ? 'negative' : st === 'hold' || st === 'ifnot' || st === 'also' ? 'notice' : 'neutral')

export function logLines(plan: EngineRun, first: string, callWords: { call: string; sub: string }): LogLine[] {
  if (plan.empty) return []
  const out: LogLine[] = []
  const open = Math.max(0, plan.at.which)
  out.push({ key: 'open', at: open, text: `Poll open · ${plan.appName} · ${plan.policies.length} ${plan.policies.length === 1 ? 'station' : 'stations'}`, tone: 'working', node: null })
  for (const p of plan.policies) {
    if (!p.scanned) continue
    const st: StationState = p.decides ? 'go' : policyStation(p, p.settleAt, false, new Set())
    const r = policyReadout(p, st, plan, first)
    out.push({ key: `p:${p.policyId}`, at: p.settleAt, text: `Policy ${p.order} · ${r.call}${r.words ? ` · ${r.words}` : ''}`, tone: toneOfCall(st), node: p.node })
  }
  for (const r of plan.rules) {
    if (!r.visited || r.startAt < 0) continue
    const st = ruleStation(r, Math.max(r.endAt, r.startAt) + 1, true, new Set())
    const rr = ruleReadout(r, st)
    const name = r.index === null ? 'Nothing else matched' : `Rule ${r.index + 1}`
    out.push({ key: `r:${r.id}`, at: Math.max(r.startAt, r.endAt), text: `${name} · ${rr.call}${rr.words ? ` · ${rr.words}` : ''}`, tone: toneOfCall(st), node: r.node })
  }
  if (plan.at.outcome >= 0) out.push({ key: 'call', at: plan.at.outcome, text: `${callWords.call}${callWords.sub ? ` · ${callWords.sub}` : ''}`, tone: callTone(plan), node: 'outcome' })
  return out.sort((a, b) => a.at - b.at)
}

export function callTone(plan: EngineRun): Tone {
  const o = plan.outcome
  if (o.status === 'decided' && o.decision) return o.decision === 'deny' ? 'negative' : 'positive'
  return o.status === 'depends' ? 'notice' : 'neutral'
}

// --- The flight ------------------------------------------------------------------------------

/* How far along the arc the flight is at step `s`, 0–1: the station poll lifts
   it off the pad, each rule polled carries it on, and the call puts it in
   orbit — or stops it short (a scrub), or holds it (can't tell). */
export function flightAt(plan: EngineRun, s: number, landed: boolean): number {
  if (plan.empty) return 0
  const o = plan.outcome
  if (landed) {
    if (o.status === 'decided' && o.decision) return o.decision === 'deny' ? 0.74 : 1
    if (o.status === 'depends') return 0.64
    return 0.18
  }
  const di = plan.policies.findIndex((p) => p.decides)
  const upTo = di >= 0 ? di + 1 : plan.policies.length
  const settled = plan.policies.slice(0, upTo).filter((p) => s >= p.settleAt).length
  let k = 0.04 + 0.22 * (upTo > 0 ? settled / upTo : 0)
  const L = plan.landing ?? -1
  if (L >= 0) {
    const read = plan.rules.slice(0, L + 1).filter((r) => r.startAt >= 0 && s >= r.endAt).length
    k += 0.44 * (read / (L + 1))
  }
  if (plan.at.outcome >= 0 && s >= plan.at.outcome - 1) k = Math.max(k, 0.72)
  return Math.min(0.72, k)
}
