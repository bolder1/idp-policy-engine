import { checkPhase, type EngineRule, type EngineRun } from '../engine-run'
import { traceResult } from '../journey'

/* -----------------------------------------------------------------------------
   Where everything on the Jarvis HUD stands (JarvisLayout.tsx), at zoom 1,
   from the plan alone — so the world is the landed run's size from its first
   frame and never grows (and re-centres) under the eye as the run plays.

   (A copy of jarvis-geometry.ts, which Jarvis v2 still imports. For one day
   — 4 Oct 2026 — the circle was the sign-in as well, and this file kept the
   room that cost; the owner reversed it, so the circle is the engine's again
   and the sign-in is stated by the run line above the canvas. A rule row can
   still be OPENED from outside — "why not rule 1?".)

              ╭─────────╮ 1 ── 1 AWS for engi…  ━━  ┌ Rules ─────┐  ┌ Verdict ┐
              ( (core)  ) 2 ── 2 AWS billing…       │ 1 ✕         │━━│ Allow … │
              ╰─────────╯ 3 ── 3 …                  │ 2 ✓ open    │  └─────────┘

   Angles are degrees clockwise from 12 o'clock. The policies take the ring's
   right half, in reading order from the top. Rows of the analysis panel have
   fixed heights (the CSS takes them from here), so its tallest moment in the
   run is known in advance.
   -------------------------------------------------------------------------- */

/** The decision: where the panels' tops start (room above for a reticle's corners). */
export const TOP = 14

/* THE CIRCLE (jarvis1-hub.tsx): the engine's own — the core at its centre, her presence round it, the
   policies on the outer band's right half. For one day (4 Oct 2026) it was the sign-in too, and CX and CY
   were set for the room that cost. Measured on screen after the reversal that is little: the 3D box starts
   CX − HUB_HALF = 30 px from the world's left edge (38 px to the first drawn pixel, the far ring at r = 176),
   and CY − HUB_HALF = 4 px below its top — there is no headroom to trim, and the far ring would clip if CY fell. */
export const R = 124
export const CX = 214
export const LABEL_X = CX + R + 20
/* Widths: the whole HUD (1184) fits a 1280-wide window's canvas at 100% (1216 less 16 each side). */
export const LABEL_W = 172
export const PANEL_X = LABEL_X + LABEL_W + 20
export const PANEL_W = 358
export const VERDICT_X = PANEL_X + PANEL_W + 20
export const VERDICT_W = 256
export const WORLD_W = VERDICT_X + VERDICT_W
export const CY = TOP + R + 50
/* The core: the engine's own disc at the circle's centre. It was a 38 px ORB holding the person while the
   circle was the sign-in (4 Oct 2026); the sign-in went back to the row above the canvas, so the centre is
   the engine again — 20 against R 104 before the hub, the same proportion (20 / 104 = 0.192) at R 124 = 24.
   Everything drawn inside it keeps its old share of it too: the spinner's arcs at 70 % of the radius (14 / 20),
   the dot at 22.5 % running (4.5 / 20) and 30 % landed (6 / 20). */
export const CORE_R = Math.round((20 / 104) * R)
export const CORE_ARC_R = CORE_R * 0.7
export const CORE_DOT_R = CORE_R * 0.225
export const CORE_DOT_LANDED_R = CORE_R * 0.3
/** The ring between the presence and the band (it carried the facts' chips until 4 Oct). */
export const ORBIT_R = 84
/** Aruna's presence: the two rings round the core. */
export const PRES_A = 50
export const PRES_B = 60
/** The 3D disc's box: a square this far each way from the hub's centre. */
export const HUB_HALF = 184
/** Where the sweep's wedge starts and ends. */
export const SWEEP_IN = PRES_B + 2
export const SWEEP_OUT = R + 16
/** The circle's lowest point at rest: the nameplate under it starts clear of this. */
export const RING_BOTTOM = CY + R + 10

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

/** How a rule row is drawn at step s, and how many of its checks are on it; `opened` unfolds a folded miss. */
export function rowLook(r: EngineRule, s: number, all = false, opened = false): { look: RowLook; checks: number; then: boolean } {
  /* Opened from outside (an answer about this rule): a folded miss shows its checks again. */
  const res = traceResult(r, s, opened)
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

/** The verdict panel's height, generous: its words, the ifs of a Depends, what the copilot noticed and its press. */
export function verdictHeight(plan: Pick<EngineRun, 'outcome'>, notice: boolean, press = false): number {
  const o = plan.outcome
  const ifs = o.status === 'depends' ? o.view.outcomes.length * 24 + 12 : 0
  return 232 + ifs + (notice ? 84 : 0) + (notice && press ? 34 : 0)
}

/** The companion's nameplate under the ring (jarvis1-presence.tsx): the room the world keeps for it. */
export const NAMEPLATE_H = 76

/* --- The narrow world (3 Oct 2026) ---------------------------------------------------------------
   With the Configure panel open the canvas is ~620–780 px wide, and the wide world (1182) would fit at
   53–66%: its words at 6–8 px. Below STACK_BELOW the world STACKS instead — the ring and its labels, then
   the rules, then the verdict, in one column at the words' size — and the routes run down its right edge
   as brackets. The camera frames the piece at work (the answer, once landed); the rest is a pan away. */

/** The stacked column: the ring and its labels' width; the rules and the verdict take the same. */
export const STACK_COL = LABEL_X + LABEL_W
/** Between the ring's row, the rules and the verdict. */
export const STACK_GAP = 28
/** How far right of the column a route's bracket reaches. */
export const STACK_REACH = 14
export const STACK_W = STACK_COL + STACK_REACH + 8
/** The canvas width (px, the stage's padding included) below which the wide world would fit under 0.9. */
export const STACK_BELOW = Math.ceil(WORLD_W * 0.9) + 32

export function stackedAt(canvasW: number): boolean {
  return canvasW > 0 && canvasW < STACK_BELOW
}

/** A route down the column's right edge: out of one piece's edge, down, and into the next's (its corners rounded). */
export function bracket(x: number, y0: number, y1: number, reach = STACK_REACH): string {
  if (Math.abs(y1 - y0) < 1) return `M ${x} ${y0} H ${x + reach} H ${x}`
  const xr = x + reach
  const r = Math.min(6, Math.abs(y1 - y0) / 2, reach / 2)
  const dy = y1 > y0 ? 1 : -1
  return `M ${x} ${y0} H ${xr - r} Q ${xr} ${y0} ${xr} ${y0 + dy * r} V ${y1 - dy * r} Q ${xr} ${y1} ${xr - r} ${y1} H ${x}`
}
