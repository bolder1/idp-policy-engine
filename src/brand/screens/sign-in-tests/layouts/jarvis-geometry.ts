import { checkPhase, type EngineRule, type EngineRun } from '../engine-run'
import { traceResult } from '../journey'

/* -----------------------------------------------------------------------------
   Where everything on the HUD stands (JarvisLayout.tsx), at zoom 1, from the
   plan alone — so the world is the landed run's size from its first frame and
   never grows (and re-centres) under the eye as the run plays.

   It reads the way the engine does, top to bottom: WHO, then the CONDITIONS
   of the whole sign-in, then the DECISION, left to right.

     (MI) Analysing access                                                   ROW 1
          Maya Iyer  [Engineering] [Finance]  → AWS Console
     Conditions  [Network · Office network] [Device · Windows 11 …] ───────  ROW 2
        ╭─ 1 ─╮ ── 1 AWS for engi…  ━━  ┌ Rules ───────┐  ┌ Verdict ┐       ROW 3
       ( core )  2 ── 2 AWS billing…     │ 1 ✕           │━━│ Allow …  │
        ╰─ 3 ─╯ ── 3 …                   │ 2 ✓ open      │  └─────────┘
                                         └───────────────┘

   Angles are degrees clockwise from 12 o'clock. The policies take the ring's
   right half, in reading order from the top. Rows of the analysis panel have
   fixed heights (the CSS takes them from here), so its tallest moment in the
   run is known in advance.
   -------------------------------------------------------------------------- */

/** Row 1, who: the identity header. */
export const ID_H = 54
export const FACE_R = 25
/** Row 2, the conditions: a strip across the whole chart. */
export const STRIP_TOP = ID_H + 10
export const STRIP_H = 34
/** Row 3, the decision: where the ring's ticks and the panels' tops start. */
export const TOP = STRIP_TOP + STRIP_H + 14

export const R = 104
export const CX = R + 34
export const LABEL_X = CX + R + 28
export const LABEL_W = 212
export const PANEL_X = LABEL_X + LABEL_W + 34
export const PANEL_W = 384
export const VERDICT_X = PANEL_X + PANEL_W + 34
export const VERDICT_W = 272
export const WORLD_W = VERDICT_X + VERDICT_W
export const CY = TOP + 22 + R
/** The engine core at the ring's centre, and the two rings round it. */
export const CORE_R = 20
export const RING_A = 34
export const RING_B = 48
/** Where the sweep's wedge starts and ends. */
export const SWEEP_IN = 56
export const SWEEP_OUT = R + 14
/** The ring's lowest point, its ticks included. */
export const RING_BOTTOM = CY + R + 26

/* The analysis panel's rows. */
export const PANEL_HEAD = 50
export const QUIET_H = 40
export const HEAD_H = 38
export const SUB_H = 20
export const CHECK_H = 44
export const THEN_H = 32
export const ROW_PAD = 8
export const ROW_GAP = 6
export const PANEL_PAD = 10

export interface Pt {
  x: number
  y: number
}

const rad = (deg: number) => (deg * Math.PI) / 180

export function polar(deg: number, r: number, cx = CX, cy = CY): Pt {
  return { x: cx + r * Math.sin(rad(deg)), y: cy - r * Math.cos(rad(deg)) }
}

/** An arc of radius r from a0 to a1 (clockwise). */
export function arcPath(a0: number, a1: number, r: number, cx = CX, cy = CY): string {
  const p0 = polar(a0, r, cx, cy)
  const p1 = polar(a1, r, cx, cy)
  const large = a1 - a0 > 180 ? 1 : 0
  return `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`
}

/** A ring sector between radii r0 < r1, from a0 to a1. */
export function sectorPath(a0: number, a1: number, r0: number, r1: number, cx = CX, cy = CY): string {
  const o0 = polar(a0, r1, cx, cy)
  const o1 = polar(a1, r1, cx, cy)
  const i1 = polar(a1, r0, cx, cy)
  const i0 = polar(a0, r0, cx, cy)
  const large = a1 - a0 > 180 ? 1 : 0
  return [
    `M ${o0.x.toFixed(2)} ${o0.y.toFixed(2)}`,
    `A ${r1} ${r1} 0 ${large} 1 ${o1.x.toFixed(2)} ${o1.y.toFixed(2)}`,
    `L ${i1.x.toFixed(2)} ${i1.y.toFixed(2)}`,
    `A ${r0} ${r0} 0 ${large} 0 ${i0.x.toFixed(2)} ${i0.y.toFixed(2)}`,
    'Z',
  ].join(' ')
}

export interface Segment {
  a0: number
  a1: number
  mid: number
}

/* The policies' segments: the right half of the ring, in reading order from
   the top, each at most 48° (one policy is not a half-circle), centred on 3
   o'clock, a small gap between. */
export function segmentsOf(n: number): Segment[] {
  if (n <= 0) return []
  const span = Math.min(48, 176 / n)
  const gap = Math.min(4, span * 0.18)
  const start = 90 - (span * n) / 2
  return Array.from({ length: n }, (_, i) => {
    const a0 = start + i * span + gap / 2
    const a1 = start + (i + 1) * span - gap / 2
    return { a0, a1, mid: (a0 + a1) / 2 }
  })
}

/* Callouts in a column, each as near its natural middle as it can be without
   overlapping the one above it: a pass down; then, if the column ran past
   where it may end, a pass back up. */
export function stack(natural: readonly number[], heights: readonly number[], gap: number, minTop: number): number[] {
  const tops: number[] = []
  let floor = minTop
  for (let i = 0; i < natural.length; i++) {
    const t = Math.max(natural[i] - heights[i] / 2, floor)
    tops.push(t)
    floor = t + heights[i] + gap
  }
  return tops
}

// --- The analysis panel's height, step by step --------------------------------------------

export type RowLook = 'quiet' | 'folded' | 'open'

/** How a rule row is drawn at step s, and how many of its checks are on it. */
export function rowLook(r: EngineRule, s: number, all = false): { look: RowLook; checks: number; then: boolean } {
  const res = traceResult(r, s)
  if (res === 'waiting' || res === 'not-reached') return { look: 'quiet', checks: 0, then: false }
  if (res === 'off' || res === 'folded') return { look: 'folded', checks: 0, then: false }
  const shown = r.checks.filter((_, k) => checkPhase(r, k, s) !== 'hidden').length
  const read = res === 'reading' || res === 'missed' ? shown : Math.max(shown, r.checked)
  const checks = all && res === 'matched' ? r.checks.length : read
  return { look: 'open', checks, then: res === 'matched' || res === 'possible' || res === 'unknown' }
}

export function rowHeight(l: { look: RowLook; checks: number; then: boolean }, extra = 0): number {
  if (l.look === 'quiet') return QUIET_H
  if (l.look === 'folded') return HEAD_H + SUB_H + ROW_PAD
  return HEAD_H + l.checks * CHECK_H + (l.then ? THEN_H : 0) + ROW_PAD + extra
}

export function panelHeightAt(rules: readonly EngineRule[], s: number): number {
  if (rules.length === 0) return PANEL_HEAD + QUIET_H + PANEL_PAD
  const rows = rules.reduce((h, r) => h + rowHeight(rowLook(r, s)), 0)
  return PANEL_HEAD + rows + ROW_GAP * (rules.length - 1) + PANEL_PAD
}

/** The panel's tallest moment, from its opening to the end. */
export function panelHeightMax(plan: Pick<EngineRun, 'rules' | 'steps'>): number {
  let h = panelHeightAt(plan.rules, plan.steps.length - 1)
  for (let s = 0; s < plan.steps.length; s++) h = Math.max(h, panelHeightAt(plan.rules, s))
  return h
}

/** The verdict panel's height, generous: its words, the ifs of a Depends, the line under it. */
export function verdictHeight(plan: Pick<EngineRun, 'outcome'>, finding: boolean): number {
  const o = plan.outcome
  const ifs = o.status === 'depends' ? o.view.outcomes.length * 24 + 12 : 0
  return 232 + ifs + (finding ? 52 : 0)
}
