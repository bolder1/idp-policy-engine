import type { Seg, Shape, Track } from './pulse-model'

/* -----------------------------------------------------------------------------
   Pulse's geometry (PulseLayout.tsx): where every seg of the trace stands,
   and where each card hangs, at zoom 1. Nothing is measured: the cards'
   widths are fixed (pulse-model `CARD_W`), so the trace is stretched only
   where a card would run into the one before it on the same side — the line
   is a time line, and a longer flat between two beats says nothing false.

   Two layouts are made, full and with the beats that found nothing folded
   away ("Findings only"); the layout eases between them (`lerpPlaced`).
   -------------------------------------------------------------------------- */

/** Where a card's pin stands, from its left edge. */
export const PIN = 30
/** The least room between two cards on one side. */
const CARD_GAP = 12
/** A folded run of beats: a short flat with its marker. */
export const FOLD_W = 22
/** The least width of the policies' section: its name on the rail. */
const SECTION_MIN = 184
/** The sign-in card, the trace's start. */
export const SIGN_W = 196
/** The trace leaves the sign-in this far after its edge, and enters the answer at its edge. */
const LEAD_IN = 8

export interface Placed {
  /** Per seg: where its run starts (after the card it may wait for), where its shape starts, and its end. */
  from: number[]
  x0: number[]
  x1: number[]
  /** Per seg: folded away. */
  gone: boolean[]
  /** Per stop id: its card's left edge and its pin's x. */
  card: Record<string, { left: number; pin: number }>
  /** Folded runs: where each marker stands and how many beats it holds. */
  folds: { x: number; n: number }[]
  /** The answer's card. */
  outLeft: number
  width: number
}

export function place(track: Track, fold: boolean, outW: number): Placed {
  const { segs, stops } = track
  const bySeg = new Map(stops.map((s) => [s.seg, s]))
  const from: number[] = []
  const x0: number[] = []
  const x1: number[] = []
  const gone: boolean[] = []
  const card: Placed['card'] = {}
  const folds: Placed['folds'] = []
  const right = { above: SIGN_W - 40, below: SIGN_W - 40 }
  let x = SIGN_W + LEAD_IN
  let foldRun: { x: number; n: number } | null = null
  let polFrom: number | null = null
  let polDone = false
  segs.forEach((g, i) => {
    const off = fold && g.foldable
    gone[i] = off
    if (off) {
      /* The first of a folded run keeps a short flat, its marker in the middle. */
      if (!foldRun) {
        foldRun = { x: x + FOLD_W / 2, n: 0 }
        folds.push(foldRun)
        from[i] = x
        x0[i] = x
        x += FOLD_W
        x1[i] = x
      } else {
        from[i] = x
        x0[i] = x
        x1[i] = x
      }
      foldRun.n += g.nodes ? g.nodes.length : 1
      return
    }
    foldRun = null
    /* The policies' section is wide enough for its name on the rail. */
    if (polFrom === null && g.section === 'pol') polFrom = x
    if (polFrom !== null && !polDone && g.section !== 'pol' && g.section !== 'lead') {
      polDone = true
      if (x - polFrom < SECTION_MIN) x = polFrom + SECTION_MIN
    }
    from[i] = x
    const st = bySeg.get(i)
    let w = g.w
    if (st && st.side !== 'end' && st.cardW > 0) {
      /* Centred on its pin where there is room; else slid right, the pin kept PIN inside its left edge; else the line waits. */
      const side = st.side
      const pin = x + w * st.at
      const floor = right[side] + CARD_GAP
      const need = floor - (pin - PIN)
      if (need > 0) x += need
      const at = x + w * st.at
      const left = Math.max(floor, at - st.cardW / 2)
      card[st.id] = { left, pin: at }
      right[side] = left + st.cardW
    } else if (st && st.side === 'below' && st.cardW === 0) {
      card[st.id] = { left: x, pin: x + w * st.at }
    } else if (st && st.side === 'end') {
      /* The answer: the trace's last beat ends where every card before it has ended. */
      const need = Math.max(right.above, right.below) + 12 - (x + w)
      if (need > 0) x += need
      w = g.w
    }
    x0[i] = x
    x += w
    x1[i] = x
    if (st && st.side === 'end') card[st.id] = { left: x, pin: x0[i] + w * st.at }
  })
  const outLeft = segs.length > 0 ? x1[segs.length - 1] : x
  return { from, x0, x1, gone, card, folds, outLeft, width: outLeft + outW }
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k

/** Between two layouts, k of the way (0 full, 1 folded). */
export function lerpPlaced(a: Placed, b: Placed, k: number): Placed {
  if (k <= 0) return a
  if (k >= 1) return b
  const card: Placed['card'] = {}
  for (const id of Object.keys(a.card)) {
    const p = a.card[id]
    const q = b.card[id] ?? p
    card[id] = { left: lerp(p.left, q.left, k), pin: lerp(p.pin, q.pin, k) }
  }
  return {
    from: a.from.map((v, i) => lerp(v, b.from[i] ?? v, k)),
    x0: a.x0.map((v, i) => lerp(v, b.x0[i] ?? v, k)),
    x1: a.x1.map((v, i) => lerp(v, b.x1[i] ?? v, k)),
    gone: b.gone,
    card,
    folds: b.folds,
    outLeft: lerp(a.outLeft, b.outLeft, k),
    width: lerp(a.width, b.width, k),
  }
}

// --- The shapes ---------------------------------------------------------------------------------

/** How far a beat leaves the line (px; up is negative). */
export const AMP = { spike: 74, complex: 92, tick: 16, dip: 38, blip: 15, notch: 11 }

export type Pt = readonly [number, number]

/* A beat as the monitor draws it: straight strokes, round joins — the line
   flat into it, the beat, flat out. Points relative to the baseline. The
   `bump` range is the part that takes the beat's colour. */
export function shapeOf(shape: Shape, x0: number, w: number): { pts: Pt[]; bump: [number, number] } {
  const at = (f: number, y: number): Pt => [x0 + w * f, y]
  switch (shape) {
    case 'spike':
      return { pts: [at(0, 0), at(0.3, 0), at(0.38, 7), at(0.5, -AMP.spike), at(0.62, 13), at(0.7, 0), at(1, 0)], bump: [1, 5] }
    case 'complex':
      return { pts: [at(0, 0), at(0.14, 0), at(0.24, -9), at(0.32, 0), at(0.42, 9), at(0.54, -AMP.complex), at(0.66, 17), at(0.76, 0), at(1, 0)], bump: [1, 7] }
    case 'tick':
      return { pts: [at(0, 0), at(0.28, 0), at(0.5, -AMP.tick), at(0.72, 0), at(1, 0)], bump: [1, 3] }
    case 'dip':
      return { pts: [at(0, 0), at(0.3, 0), at(0.5, AMP.dip), at(0.7, 0), at(1, 0)], bump: [1, 3] }
    case 'blip':
      return { pts: [at(0, 0), at(0.3, 0), at(0.46, -AMP.blip), at(0.6, 6), at(0.7, 0), at(1, 0)], bump: [1, 4] }
    case 'notch':
      return { pts: [at(0, 0), at(0.36, 0), at(0.5, -AMP.notch), at(0.64, 0), at(1, 0)], bump: [1, 3] }
    default:
      return { pts: [at(0, 0), at(1, 0)], bump: [0, 0] }
  }
}

/** The tip of a beat: where its mark sits and its pin leaves from (relative to the baseline). */
export function tipOf(shape: Shape, x0: number, w: number): Pt {
  const { pts } = shapeOf(shape, x0, w)
  let best: Pt = pts[0]
  for (const p of pts) if (Math.abs(p[1]) > Math.abs(best[1])) best = p
  return best
}

/** The whole trace as one polyline, in order (for the cursor's dot to ride on). */
export function tracePoints(segs: readonly Seg[], p: Placed): Pt[] {
  const out: Pt[] = []
  segs.forEach((g, i) => {
    if (p.from[i] < p.x0[i]) out.push([p.from[i], 0])
    const w = p.x1[i] - p.x0[i]
    if (w <= 0) return
    for (const pt of shapeOf(p.gone[i] ? 'flat' : g.shape, p.x0[i], w).pts) out.push(pt)
  })
  return out
}

/** The trace's height at x. */
export function yAt(pts: readonly Pt[], x: number): number {
  if (pts.length === 0) return 0
  if (x <= pts[0][0]) return pts[0][1]
  let lo = 0
  let hi = pts.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (pts[mid][0] <= x) lo = mid
    else hi = mid
  }
  const a = pts[lo]
  const b = pts[hi]
  if (x >= b[0]) return b[1]
  const dx = b[0] - a[0]
  return dx <= 0 ? b[1] : a[1] + ((b[1] - a[1]) * (x - a[0])) / dx
}

export const poly = (pts: readonly Pt[], base: number): string => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)} ${(base + p[1]).toFixed(1)}`).join(' ')
