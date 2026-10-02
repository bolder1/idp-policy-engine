import type { EngineRun } from '../engine-run'
import type { Stop, Track } from './pulse-model'
import { readChecks } from './pulse-words'

/* -----------------------------------------------------------------------------
   Pulse's heights (PulseLayout.tsx): how tall the run stands, from the plan
   alone, so the world is its landed size from the first frame and never
   grows (and re-centres) under the eye. A card above the trace is reserved
   its OPEN height (it grows up, and nothing scrolls above the world's top);
   one below grows down past the world's foot, and the camera follows it.
   -------------------------------------------------------------------------- */

/** A card's head row, and its padding. */
const HEAD = 30
const PAD = 18
const LINE = 20
const FACT = 38
const PART = 24

/** The gap between the trace's baseline and a card above it (its bottom). */
export const ABOVE = 96
/** The rail of sections, right under the trace: its top, below the baseline, and its height. */
export const RAIL_TOP = 54
export const RAIL_H = 44
/** A card below hangs under the rail: its top, below the baseline. */
export const BELOW = RAIL_TOP + RAIL_H + 10
/** The answer's card: its top, above the baseline (the line enters at its verdict). */
export const OUT_UP = 30

/** A card's height, short or open. */
export function cardHeight(plan: EngineRun, st: Stop, open: boolean): number {
  if (st.kind === 'unread') return open ? 22 + st.unread!.length * LINE + 12 : 0
  if (st.kind === 'policy') return HEAD + PAD + LINE + (open ? 3 * LINE + 24 : 0)
  if (st.kind === 'rule' && st.rule !== undefined) {
    const r = plan.rules[st.rule]
    if (!r) return HEAD + PAD + LINE
    if (st.also || r.state === 'off') return HEAD + PAD + LINE + (open ? 3 * LINE + 24 : 0)
    const read = readChecks(r)
    if (!open) return HEAD + PAD + Math.max(1, read.length) * LINE + 4
    const parts = read.reduce((n, c) => n + (c.subs.filter((x) => x.label || x.actual || x.required).length > 1 ? c.subs.length : 0), 0)
    return HEAD + PAD + LINE /* the name, wrapped */ + read.length * FACT + parts * PART + LINE + 16
  }
  return 0
}

/** The answer's card, about. */
export function outHeight(plan: EngineRun): number {
  const o = plan.outcome
  let h = 136
  if (o.status === 'depends') h += o.view.outcomes.length * 22 + 26
  if (o.status === 'decided' && o.decision === 'deny') h += 24
  return h
}

export interface Rows {
  /** The trace's baseline. */
  base: number
  /** The rail's top. */
  rail: number
  height: number
}

export function rowsOf(plan: EngineRun, track: Track, signH: number): Rows {
  let up = 0
  let down = 0
  for (const st of track.stops) {
    /* Above: its open height, less what the room over a fitted world takes (it is never scrolled to). */
    if (st.side === 'above') up = Math.max(up, cardHeight(plan, st, false), cardHeight(plan, st, true) - 110)
    if (st.side === 'below') down = Math.max(down, cardHeight(plan, st, false))
  }
  const base = Math.max(ABOVE + up + 8, OUT_UP + 8, signH / 2 + 8)
  const rail = base + RAIL_TOP
  const foot = Math.max(base + BELOW + down + 16, base - OUT_UP + outHeight(plan) + 16, base + signH / 2 + 16, rail + RAIL_H + 8)
  return { base, rail, height: foot }
}
