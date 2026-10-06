/* -----------------------------------------------------------------------------
   Focus (FocusLayout.tsx): where each moment's card stands, at zoom 1.

   FOCUS — the moment in focus big at the front, always at the centre; the
   ones before it recede to the left, the ones to come wait to the right:
   smaller, a little lower, veiled and blurred by distance (focus.css, by
   `depth`), turned a few degrees towards the front, like windows in space. A
   receded card shows its FAR FACE (focus-far.tsx), narrower in a small room;
   one that does not fit whole is a sliver behind its neighbour; the landed
   answer is never let go of — when it would not fit it peeks at the right.

   OVERVIEW — every card's far face, in rows in reading order: the run at a
   glance, its titles still readable.

   Every card hangs from the same top line (scaled from its top centre), so a
   card growing as its checks arrive grows downwards and moves nothing else.
   -------------------------------------------------------------------------- */

export interface Place {
  /** The card's left edge, its unscaled box (the transform scales about its top centre). */
  x: number
  y: number
  scale: number
  opacity: number
  rotateY: number
  z: number
  /** Not drawn: out of reach of the view. */
  hidden: boolean
  /** The unscaled width the place was worked out for (Focus: a card's face is wider in focus than receded). */
  w?: number
  /** Pinned at the right edge, only its near edge in view: the landed answer, kept on stage. */
  peek?: boolean
  /** How many moments from the focus (0: the focus). */
  depth?: number
  /** Stacked behind the nearer card, only its far edge in view. */
  sliver?: boolean
}

/** How a card recedes, by its distance from the focus — turned further each step, so the row bends round the
    card in front (owner, 3 Oct 2026: "bend the cards a little more to add some depth"). The fade by distance is not
    opacity (stacked cards would show through one another) but a veil and a blur on the card (focus.css, by depth). */
const DEPTH: readonly { scale: number; opacity: number; drop: number; turn: number }[] = [
  { scale: 1, opacity: 1, drop: 0, turn: 0 },
  { scale: 0.8, opacity: 1, drop: 18, turn: 16 },
  { scale: 0.68, opacity: 1, drop: 32, turn: 24 },
  { scale: 0.58, opacity: 0.9, drop: 44, turn: 30 },
]
/** The eye's distance for the turn: near enough that the turn reads as depth. */
export const PERSPECTIVE = 1100
const GAP = 18
const EDGE = 4
/** The card in focus stands this much higher than the receded row: lifted towards the eye. */
export const LIFT = 8
/** Depth 1 stands this far from the card in focus. */
export const NEAR_GAP = 24
/** Where a side has too little room, depth 1 tucks under the card in focus by up to this share of its width. */
export const TUCK = 0.18
/** A small room: further, up to this share, so it is still drawn (its tile and title start always clear). */
const TUCK_MAX = 0.6
/** A card that does not fit whole stacks behind the nearer one, only this much of its far edge showing. */
export const SLIVER = 12
const MAX_SLIVERS = 2
/** How much of the kept answer shows when it would not fit: its near edge, pressable (world px). */
export const PEEK = 64
/** Below this much room the receded cards take their compact far face, so a neighbour shows each side. */
export const COMPACT_ROOM = 1000
export const FAR_COMPACT = 220

/** The card's base width for a world this wide: the focus and three receded cards on one side, where they fit. */
export function cardWidth(worldW: number): number {
  const fit = (worldW - 3 * GAP - 2 * EDGE) / (1 + 0.8 + 0.68 + 0.58)
  return Math.round(Math.min(440, Math.max(360, fit)))
}

/** One step of the carousel in world px, for a drag: the hand moves this far, the focus moves one moment. */
export const stepPx = (cw: number): number => cw * 0.8 + GAP

/** A place's depth, for its veil and blur: 0 the focus … 3 the furthest drawn (a sliver). */
export const depthOf = (p: Pick<Place, 'depth' | 'sliver'>): number => (p.sliver ? 3 : Math.min(3, p.depth ?? 0))

/** FOCUS (owner, 4 Oct 2026: "the card in focus in the CENTRE of the main screen … the rest a little more blurry"):
    the card in focus always stands at the world's centre, lifted — while the run plays, once it has landed, stepped
    back, and in Text mode. Time reads left to right: past moments on the left, later ones on the right; an empty side
    is fine.
    `base`: each card's unscaled width with this card in focus (the one in focus is wider: its full face).
    `keep`: the card never let go of (the landed answer): when it would not be drawn whole, it peeks at the right edge.
    Depth 1 stands NEAR_GAP from the focus — tucked a little under it on the left where that side is short (its tile
    and title start stay clear); depth 2 and 3 are drawn whole where they fit, else as SLIVERs stacked behind the
    nearer card (two a side at most); the rest are hidden. */
export function focusPlaces(n: number, focus: number, worldW: number, base: readonly number[], top: number, keep = -1): Place[] {
  if (n === 0) return []
  const out: Place[] = new Array<Place>(n)
  const depth = (i: number) => Math.min(Math.abs(i - focus), DEPTH.length - 1)
  const b = (i: number) => base[i] ?? 400
  const sw = (i: number) => b(i) * DEPTH[depth(i)].scale
  const place = (i: number, cx: number, extra: Partial<Place> = {}): Place => {
    const d = DEPTH[depth(i)]
    const sliver = !!extra.sliver
    return {
      x: cx - b(i) / 2,
      y: i === focus ? Math.max(0, top - LIFT) : top + d.drop,
      scale: d.scale,
      opacity: sliver ? DEPTH[DEPTH.length - 1].opacity : d.opacity,
      rotateY: Math.sign(i - focus) * -d.turn,
      z: i === focus ? 20 : 20 - Math.abs(i - focus) - (sliver ? 4 : 0),
      hidden: false,
      w: b(i),
      depth: Math.abs(i - focus),
      ...extra,
    }
  }
  const hide = (p: Place): Place => ({ ...p, hidden: true, opacity: 0, sliver: false })
  const cx0 = worldW / 2
  out[focus] = place(focus, cx0)
  const fl = cx0 - sw(focus) / 2
  const fr = cx0 + sw(focus) / 2

  /* The left: depth 1 tucks under the focus where the side is short; then whole cards, then slivers. */
  let near = fl
  let slivers = 0
  for (let i = focus - 1; i >= 0; i--) {
    const w = sw(i)
    if (i === focus - 1) {
      /* Room kept for the slivers of the cards beyond it, so they show past the band's soft edge. */
      const beyond = Math.min(MAX_SLIVERS, i) * SLIVER
      let tuck = Math.min(TUCK * w, Math.max(0, w + 2 * NEAR_GAP + beyond - fl))
      let left = fl - NEAR_GAP + tuck - w
      if (left < EDGE) {
        const more = Math.max(0, Math.min(EDGE - left, TUCK_MAX * w - tuck))
        tuck += more
        left += more
      }
      const p = place(i, left + w / 2)
      out[i] = left < -2 ? hide(p) : p
      near = left
      continue
    }
    const whole = near - GAP - w
    if (slivers === 0 && !out[i + 1].hidden && whole >= EDGE) {
      out[i] = place(i, whole + w / 2)
      near = whole
    } else if (slivers < MAX_SLIVERS && !out[i + 1].hidden && near - SLIVER >= 0) {
      const left = near - SLIVER
      out[i] = place(i, left + w / 2, { sliver: true })
      near = left
      slivers++
    } else out[i] = hide(place(i, near - w / 2))
  }

  /* The right: depth 1 beside the focus — its tile and title start are never under it, so it may run on under the
     band's soft edge instead; then whole cards, then slivers. */
  near = fr
  slivers = 0
  for (let i = focus + 1; i < n; i++) {
    const w = sw(i)
    if (i === focus + 1) {
      const left = fr + NEAR_GAP
      const p = place(i, left + w / 2)
      /* At least its tile, its title's start and some of its line in view. */
      out[i] = worldW - left < Math.min(w, PEEK * 2.5) ? hide(p) : p
      near = left + w
      continue
    }
    const whole = near + GAP
    if (slivers === 0 && !out[i - 1].hidden && whole + w <= worldW - EDGE) {
      out[i] = place(i, whole + w / 2)
      near = whole + w
    } else if (slivers < MAX_SLIVERS && !out[i - 1].hidden && near + SLIVER <= worldW) {
      const right = near + SLIVER
      out[i] = place(i, right - w / 2, { sliver: true })
      near = right
      slivers++
    } else out[i] = hide(place(i, near + w / 2))
  }

  /* The kept card (the landed answer), when it would not be drawn whole: its near edge at the right edge, so the
     answer never leaves the stage; anything that would stand under it gives way. */
  if (keep > focus && keep < n && (out[keep].hidden || out[keep].sliver)) {
    const w = sw(keep)
    out[keep] = { ...place(keep, worldW - PEEK + w / 2), opacity: 1, z: 20 - depth(keep), peek: true }
    const lim = worldW - PEEK - GAP / 2
    for (let i = focus + 1; i < keep; i++) {
      const p = out[i]
      if (p.hidden) continue
      const right = p.x + b(i) / 2 + (b(i) * p.scale) / 2
      if (right > lim) out[i] = hide(p)
    }
    for (let i = keep + 1; i < n; i++) out[i] = hide(out[i])
  }
  return out
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t

/** Between two focuses (a drag): each card's centre, depth, turn and fade blended, so cards turn and grow as they
    cross the middle. `w` is each card's unscaled width as drawn now; a card hidden at both ends stays hidden. */
export function blendPlaces(a: readonly Place[], b: readonly Place[], t: number, w: readonly number[]): Place[] {
  return a.map((pa, i) => {
    const pb = b[i] ?? pa
    const ca = pa.x + (pa.w ?? w[i] ?? 0) / 2
    const cb = pb.x + (pb.w ?? w[i] ?? 0) / 2
    const width = w[i] ?? pa.w ?? 0
    const hidden = pa.hidden && pb.hidden
    return {
      x: mix(ca, cb, t) - width / 2,
      y: mix(pa.y, pb.y, t),
      scale: mix(pa.scale, pb.scale, t),
      opacity: hidden ? 0 : mix(pa.hidden ? 0 : pa.opacity, pb.hidden ? 0 : pb.opacity, t),
      rotateY: mix(pa.rotateY, pb.rotateY, t),
      z: t < 0.5 ? pa.z : pb.z,
      hidden,
      w: width,
      peek: t < 0.5 ? pa.peek : pb.peek,
      depth: t < 0.5 ? pa.depth : pb.depth,
      sliver: t < 0.5 ? pa.sliver : pb.sliver,
    }
  })
}

/** Every place moved sideways (the rubber band past an end). */
export const shiftPlaces = (places: readonly Place[], dx: number): Place[] => places.map((p) => ({ ...p, x: p.x + dx }))

/* Overview: every card's far face, in rows in reading order, at a scale its titles can be read at (at least
   OVERVIEW_MIN_K: a far face's 20 px title renders at 12.4 px or more); as large as the room allows. */
export const OVERVIEW_MIN_K = 0.62
export function overviewPlaces(n: number, worldW: number, far: number, top: number, heights: readonly number[], bandH: number): Place[] {
  if (n === 0) return []
  const h = Math.max(120, ...heights.slice(0, n).map((x) => x || 0))
  const roomH = Math.max(120, bandH - top)
  let best = { rows: 1, cols: n, k: 0 }
  for (let rows = 1; rows <= n; rows++) {
    const cols = Math.ceil(n / rows)
    const kw = (worldW - 2 * EDGE - GAP * (cols - 1)) / (cols * far)
    const kh = (roomH - GAP * (rows - 1)) / (rows * h)
    const k = Math.min(1, kw, kh)
    if (k > best.k + 0.001) best = { rows, cols, k }
  }
  const { rows, cols } = best
  /* Never below readable: a grid that would need it overflows the band a little instead (the stage still pans). */
  const k = Math.max(best.k, Math.min(OVERVIEW_MIN_K, (worldW - 2 * EDGE - GAP * (cols - 1)) / (cols * far)))
  const gridW = cols * far * k + GAP * (cols - 1)
  const gridH = rows * h * k + GAP * (rows - 1)
  const x0 = Math.max(EDGE, (worldW - gridW) / 2)
  const y0 = top + Math.max(0, (roomH - gridH) / 2)
  const places: Place[] = []
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols)
    const c = i % cols
    const cx = x0 + c * (far * k + GAP) + (far * k) / 2
    places.push({ x: cx - far / 2, y: y0 + r * (h * k + GAP), scale: k, opacity: 1, rotateY: 0, z: 10, hidden: false, w: far, depth: 0 })
  }
  return places
}

/* LIFTED — the assistant's thread open over the lower canvas: the cards rise
   (and, only when rising is not enough, shrink about their top centres) so
   every card in reach stands above the thread's top, `limit`. The thread is
   a caption to the card it brings into focus, so that card is never under
   it. `heights` are the cards' unscaled heights, in the order of `places`. */
export function liftPlaces(places: readonly Place[], heights: readonly number[], limit: number, floor = EDGE): Place[] {
  const on = places.map((p, i) => ({ p, h: heights[i] ?? 0 })).filter((x) => !x.p.hidden)
  if (on.length === 0) return places as Place[]
  const y0 = Math.min(...on.map((x) => x.p.y))
  const y1 = Math.max(...on.map((x) => x.p.y + x.h * x.p.scale))
  if (y1 <= limit) return places as Place[]
  const rise = y1 - limit
  if (y0 - rise >= floor) return places.map((p) => ({ ...p, y: p.y - rise }))
  const k = Math.max(0.5, Math.min(1, (limit - floor) / Math.max(1, y1 - y0)))
  return places.map((p) => ({ ...p, y: floor + (p.y - y0) * k, scale: p.scale * k }))
}
