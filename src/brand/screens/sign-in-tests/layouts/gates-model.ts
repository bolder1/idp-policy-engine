import { createContext, useContext } from 'react'

import type { CheckRow, EnginePolicy, EngineRule } from '../engine-run'
import type { Finding, PolicyConflict, Via } from '../conflicts'
import { policyFound, policyPhase } from '../engine-run'
import { traceResult } from '../journey'

/* The gates' small model (GatesLayout.tsx): the one note open, and where a
   gate or a turnstile stands at a step — pure, from the plan. */

export interface GatesNotes {
  open: string | null
  toggle: (id: string, from: HTMLElement) => void
  /** The person's groups, said: "Engineering, Finance" — the fact a Who that failed is read against. */
  whoIn: string
}
export const GatesNoteCtx = createContext<GatesNotes>({ open: null, toggle: () => {}, whoIn: '' })
export const useWhoIn = () => useContext(GatesNoteCtx).whoIn
export const useGatesNote = (id: string) => {
  const n = useContext(GatesNoteCtx)
  return { isOpen: n.open === id, toggle: (from: HTMLElement) => n.toggle(id, from) }
}

export const noteDomId = (id: string) => `rl-gates-note-${id.replace(/[^a-zA-Z0-9_-]/g, '-')}`

/** A Who's fact, beside the person: the way in when it passed ("via Engineering"), their groups when it did not ("in Engineering, Finance"). */
export const viaOf = (c: CheckRow, via?: Via, whoIn = ''): string =>
  c.category !== 'who' ? '' : c.status === 'pass' && via?.matches ? via.say : c.status !== 'pass' && whoIn ? `in ${whoIn}` : ''

export type GateState = 'waiting' | 'asking' | 'barred' | 'open' | 'also' | 'quiet'

export interface GateCtx {
  appName: string
  first: string
  deciderName: string
  deciderVia: string
  ruleWhy: string
  findings: readonly Finding[]
  covers: ReadonlyMap<string, PolicyConflict>
  conflictIds: ReadonlySet<string>
}

export function gateState(p: EnginePolicy, v: number, landed: boolean, also: boolean): GateState {
  if (p.scanned || p.decides) {
    const ph = policyPhase(p, v)
    if (ph === 'waiting') return 'waiting'
    if (ph === 'working' || policyFound(p, v)) return 'asking'
    return p.decides ? 'open' : 'barred'
  }
  return landed && also ? 'also' : 'quiet'
}

export type StileState = 'waiting' | 'reading' | 'open' | 'locked' | 'unknown' | 'possible' | 'off' | 'also' | 'quiet'

export function stileState(r: EngineRule, v: number, landed: boolean, clash: boolean): StileState {
  const t = traceResult(r, v)
  switch (t) {
    case 'reading':
      return 'reading'
    case 'matched':
      return 'open'
    case 'missed':
    case 'folded':
      return 'locked'
    case 'unknown':
      return 'unknown'
    case 'possible':
      return 'possible'
    case 'off':
      return 'off'
    default:
      if (r.index === null && r.visited && t !== 'waiting') return 'open'
      return landed && clash ? 'also' : r.visited ? 'waiting' : 'quiet'
  }
}
