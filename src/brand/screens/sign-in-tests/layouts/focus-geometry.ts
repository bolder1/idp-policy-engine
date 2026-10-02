/* -----------------------------------------------------------------------------
   Focus (FocusLayout.tsx): where each moment's card stands, at zoom 1.

   FOCUS — the moment in focus big at the front; the ones before it recede to
   the left, the ones to come wait to the right: smaller, a little lower,
   faded, turned a few degrees towards the front, like windows in space. The
   row slides as a real carousel does — it never runs past its ends, so the
   first card hugs the left and the last (the outcome, once landed) the
   right, which leaves the most room for what came before it.

   OVERVIEW — every card side by side, small, in reading order, the outcome
   the biggest at the end: the run at a glance.

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
}

/** How a card recedes, by its distance from the focus. */
const DEPTH: readonly { scale: number; opacity: number; drop: number; turn: number }[] = [
  { scale: 1, opacity: 1, drop: 0, turn: 0 },
  { scale: 0.8, opacity: 0.94, drop: 18, turn: 5 },
  { scale: 0.68, opacity: 0.82, drop: 32, turn: 8 },
  { scale: 0.58, opacity: 0.66, drop: 44, turn: 10 },
]
const GAP = 18
const EDGE = 4

/** The card's base width for a world this wide: the focus and three receded cards on one side, where they fit. */
export function cardWidth(worldW: number): number {
  const fit = (worldW - 3 * GAP - 2 * EDGE) / (1 + 0.8 + 0.68 + 0.58)
  return Math.round(Math.min(440, Math.max(360, fit)))
}

export function focusPlaces(n: number, focus: number, worldW: number, base: readonly number[], top: number): Place[] {
  const centre: number[] = new Array(n).fill(0)
  const depth = (i: number) => DEPTH[Math.min(Math.abs(i - focus), DEPTH.length - 1)]
  const width = (i: number) => (base[i] ?? 400) * depth(i).scale
  for (let i = focus + 1; i < n; i++) centre[i] = centre[i - 1] + width(i - 1) / 2 + GAP + width(i) / 2
  for (let i = focus - 1; i >= 0; i--) centre[i] = centre[i + 1] - width(i + 1) / 2 - GAP - width(i) / 2
  const reach = (i: number) => Math.abs(i - focus) < DEPTH.length
  /* Slide the row so it never runs past an end: the focus in the middle, unless an end would leave room empty. */
  let anchor = worldW / 2
  const shown = centre.map((_, i) => i).filter(reach)
  const lo = Math.min(...shown.map((i) => centre[i] - width(i) / 2))
  const hi = Math.max(...shown.map((i) => centre[i] + width(i) / 2))
  /* Only at an end: the last card (the answer, once landed) hugs the right and the first the left; between them the focus keeps the middle. */
  if (focus === n - 1 && anchor + hi < worldW - EDGE && anchor + lo < EDGE) anchor += Math.min(worldW - EDGE - (anchor + hi), EDGE - (anchor + lo))
  else if (focus === 0 && anchor + lo > EDGE && anchor + hi > worldW - EDGE) anchor -= Math.min(anchor + lo - EDGE, anchor + hi - (worldW - EDGE))
  return centre.map((c, i) => {
    const d = depth(i)
    const side = Math.sign(i - focus)
    const cx = anchor + c
    const w = width(i)
    const hidden = !reach(i) || cx - w / 2 < -2 || cx + w / 2 > worldW + 2
    return {
      x: cx - (base[i] ?? 400) / 2,
      y: top + d.drop,
      scale: d.scale,
      opacity: hidden ? 0 : d.opacity,
      rotateY: side * -d.turn,
      z: 20 - Math.abs(i - focus),
      hidden,
    }
  })
}

/* Overview: the cards in a row, the outcome biggest; when they do not fit at
   a readable size, in rows (reading order), the outcome beside them all. */
export function overviewPlaces(n: number, worldW: number, base: readonly number[], top: number, heights: readonly number[], bandH: number): Place[] {
  if (n === 0) return []
  const cw = base[0] ?? 400
  const outB = base[n - 1] ?? cw
  const outK = Math.min(0.9, (worldW * 0.42) / outB)
  const outW = outB * outK
  const rest = n - 1
  const room = worldW - outW - GAP * 2 - EDGE * 2
  let rows = 1
  let k = rest > 0 ? Math.min(0.62, (room - GAP * (rest - 1)) / (rest * cw)) : 0
  while (rest > 0 && k < 0.46 && rows < 3) {
    rows += 1
    const cols = Math.ceil(rest / rows)
    k = Math.min(0.62, (room - GAP * (cols - 1)) / (cols * cw))
  }
  const cols = rest > 0 ? Math.ceil(rest / rows) : 0
  const rowH: number[] = []
  for (let r = 0; r < rows; r++) {
    let h = 0
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c
      if (i < rest) h = Math.max(h, (heights[i] ?? 200) * k)
    }
    rowH.push(h)
  }
  const gridW = cols * cw * k + GAP * Math.max(0, cols - 1)
  const total = gridW + (rest > 0 ? GAP * 2 : 0) + outW
  const x0 = Math.max(EDGE, (worldW - total) / 2)
  const gridH = rowH.reduce((a, b) => a + b, 0) + GAP * Math.max(0, rows - 1)
  const outH = (heights[n - 1] ?? 360) * outK
  const y0 = top + Math.max(0, (Math.min(bandH, Math.max(gridH, outH)) - gridH) / 2)
  const places: Place[] = []
  for (let i = 0; i < rest; i++) {
    const r = Math.floor(i / cols)
    const c = i % cols
    const cx = x0 + c * (cw * k + GAP) + (cw * k) / 2
    const y = y0 + rowH.slice(0, r).reduce((a, b) => a + b, 0) + GAP * r
    places.push({ x: cx - cw / 2, y, scale: k, opacity: 1, rotateY: 0, z: 10, hidden: false })
  }
  const ocx = x0 + (rest > 0 ? gridW + GAP * 2 : 0) + outW / 2
  places.push({ x: ocx - outB / 2, y: top + Math.max(0, (Math.min(bandH, Math.max(gridH, outH)) - outH) / 2), scale: outK, opacity: 1, rotateY: 0, z: 12, hidden: false })
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
