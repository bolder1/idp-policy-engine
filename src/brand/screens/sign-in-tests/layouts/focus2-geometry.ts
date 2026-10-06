/* -----------------------------------------------------------------------------
   Focus (Focus2Layout.tsx): where each beat's card stands, at zoom 1.

   The open card is big at the front and ALWAYS at the centre of the room; the
   beats before it recede to one side and the ones to come wait on the other —
   smaller, a little lower, veiled and blurred by distance, turned a few
   degrees towards the front, like windows in space. A card that does not fit
   whole is a sliver behind its neighbour; the landed answer is never let go
   of — where it would not fit it peeks at the far edge.

   WHAT WAS WRONG BEFORE. v1 slid the whole row whenever an end would leave
   room empty, so the card in focus was only near the middle. Measured on 4 Oct
   at the landing: the answer's centre sat at x 962 against a canvas centre of
   672 at 1280, and 1080 against 720 at 1440 — the eye had to find the answer
   instead of being handed it. The anchor slide and both end-hugging branches
   do not exist here. The open card's centre is `roomW / 2` in every state:
   while the run plays, once it has landed, stepped back, and in Text mode. An
   empty side is fine, and is the normal case for a story that goes deeper.

   WHY THIS FILE CARRIES ITS OWN NUMBERS. v1's focus-geometry.ts has the same
   depth table, but v1 is archived and nobody works on it, so it is not a
   dependency v2 should take: the numbers here are the ones v2's stylesheet
   must match, and they are exported so the layout, the CSS and this file's
   tests all read one table rather than three copies that can drift apart.

   Every card hangs from the same top line (the transform scales about its top
   centre), so a card growing as its checks arrive grows downwards and moves
   nothing else.
   -------------------------------------------------------------------------- */

/** One step away from the open card: how it stands, and how far away it reads. */
export interface Focus2Depth {
  scale: number
  /** How much lower than the top line it hangs, px. */
  drop: number
  /** Its Y rotation, degrees — unsigned here; a place's `turn` carries the side. */
  turn: number
  /** The stage-coloured veil over the card (focus2's CSS, by `data-depth`). */
  veil: number
  /** Its resting blur, px. */
  blur: number
  /** The motion slot's opacity. */
  opacity: number
}

/* How a card recedes, by its distance from the open one — turned further each step, so the row bends round the card
   in front (owner, 3 Oct 2026: "bend the cards a little more to add some depth").

   The fade by distance is NOT opacity. With opacity, a stacked card showed through the one in front of it, which is
   the first thing that made the stack unreadable; so each card's surface stays opaque and the distance is told by a
   veil in the stage's own colour over the card, plus a blur. Depth 3 is the only row that also takes the slot's
   opacity down, and a sliver — a card stacked behind its neighbour, whatever its own distance — reads at depth 3. */
export const FOCUS2_DEPTH: readonly Focus2Depth[] = [
  { scale: 1, drop: 0, turn: 0, veil: 0, blur: 0, opacity: 1 },
  { scale: 0.8, drop: 18, turn: 16, veil: 0.22, blur: 0.6, opacity: 1 },
  { scale: 0.68, drop: 32, turn: 24, veil: 0.5, blur: 1.6, opacity: 1 },
  { scale: 0.58, drop: 44, turn: 30, veil: 0.7, blur: 3, opacity: 0.9 },
]
/** The furthest drawn depth: beyond it a card is a sliver or hidden. */
export const MAX_DEPTH = FOCUS2_DEPTH.length - 1

/** The eye's distance for the turn: near enough that the turn reads as depth. */
export const PERSPECTIVE = 1100
/** The open card stands this much higher than the receded row: lifted towards the eye. */
export const LIFT = 8
/** Depth 1 stands this far from the open card. */
export const NEAR_GAP = 24
/** Where a side has too little room, depth 1 shifts towards the open card by up to this share of its scaled width. */
export const TUCK = 0.18
/** A small room: further, up to this share, so it is still drawn at all (its tile and title start stay clear). */
export const TUCK_MAX = 0.6
/** A card that does not fit whole stacks behind the nearer one, only this much of its far edge showing. */
export const SLIVER = 12
/** At most this many slivers a side; anything beyond them is hidden, and counted on that side's edge pill. */
export const MAX_SLIVERS = 2
/** How much of the kept answer shows when it would not fit: its near edge, pressable (world px). */
export const PEEK = 64
/** Between two cards drawn whole. */
export const GAP = 18
/** The least a drawn card's near edge keeps from the room's edge. */
export const EDGE = 4
/** The band's mask fades over this much each side; the edge pill sits at that fade (focus2's CSS reads it from here). */
export const EDGE_FADE = 32
/** Below this much room the receded cards take their compact far face, so a neighbour shows each side. */
export const COMPACT_ROOM = 1000
export const FAR_COMPACT = 220
/** The landed answer is the one wide card: its words stand beside What they see. */
export const ANSWER_WIDE = 1.52

/** A width to fall back on when the caller's `base` is short — only reached by a layout one card ahead of its list. */
const FALLBACK_W = 400
/** Every scale in the table: the open card and one of each receding step, which is what a room has to hold. */
const SCALE_SUM = FOCUS2_DEPTH.reduce((sum, d) => sum + d.scale, 0)

/** The card's base width for a room this wide: the open card and three receded ones on a side, where they fit. */
export function cardWidth(roomW: number): number {
  const fit = (roomW - MAX_DEPTH * GAP - 2 * EDGE) / SCALE_SUM
  return Math.round(Math.min(440, Math.max(360, fit)))
}

/** The landed answer's width, from the card width. */
export const answerWidth = (cw: number): number => Math.round(cw * ANSWER_WIDE)

/** Where a card stands, and how far away it reads. */
export interface Focus2Place {
  /** The card's left edge, its unscaled box (the transform scales about its top centre). */
  x: number
  y: number
  scale: number
  /** The Y rotation in degrees, with its side: an earlier card turns one way, a later one the other. */
  turn: number
  /** The slot's stacking order: the open card over its neighbours, each step behind the last. */
  z: number
  /** How many beats from the open card (0: the open card). What it is DRAWN at is `depthOf` — a sliver reads at 3. */
  depth: number
  /** The veil over the card, from the table by drawn depth. Never opacity: a stacked card would show through. */
  veil: number
  /** The resting blur on the card, px — the layout puts it on the turn element, never on the motion slot. */
  blur: number
  /** The motion slot's opacity: 1 until depth 3, and 0 for a card that is not drawn. */
  opacity: number
  /** Not drawn: out of reach of the room. */
  hidden: boolean
  /** Stacked behind the nearer card, only SLIVER px of its far edge in view. */
  sliver: boolean
  /** Pinned at the far edge, only PEEK px in view: the landed answer, kept on stage. */
  peek: boolean
  /** The unscaled width the place was worked out for (a card's face is wider open than receded). */
  w: number
}

export interface Focus2PlacesInput {
  /** How many cards are on stage: the beats reached. */
  n: number
  /** Which one is open. Clamped into the row, so a layout a step ahead of its own list never throws. */
  focus: number
  /** The room's width in world px (RunStage's). In jsdom it is 0, and that must still come out finite. */
  roomW: number
  /** Each card's unscaled width with this card open — the open one is wider: its full face. */
  base: readonly number[]
  /** The top line every card hangs from. */
  top: number
  /** The card never let go of (the landed answer), or -1 for none. */
  keep?: number
}

export interface Focus2Placement {
  places: Focus2Place[]
  /** The edge pills' N ("‹ 4 earlier", "2 later ›"): the cards on that side not drawn whole — slivers and hidden. */
  earlier: number
  later: number
}

/** A place's drawn depth, for its veil and blur: 0 the open card … 3 the furthest drawn, which a sliver reads as. */
export const depthOf = (p: Pick<Focus2Place, 'depth' | 'sliver'>): number => (p.sliver ? MAX_DEPTH : Math.min(MAX_DEPTH, p.depth))

/** Where every card stands, with the open one centred, and what each side's edge pill counts.

    Pure: the same input gives the same output, and `base` is only read.

    The open card is at `roomW / 2`, lifted. Depth 1 stands NEAR_GAP from it, shifted towards it where that side is
    short — by up to TUCK of its scaled width, and in a room too small for that, up to TUCK_MAX, which still leaves
    its tile and the start of its title clear. Depth 2 and 3 are drawn whole where they fit, else as SLIVERs stacked
    behind the nearer card (MAX_SLIVERS a side); the rest are hidden. `keep` — the landed answer — is never hidden:
    where it would not be drawn whole it peeks PEEK px in from the far edge, and whatever would stand under it gives
    way. */
export function focus2Places({ n, focus, roomW, base, top, keep = -1 }: Focus2PlacesInput): Focus2Placement {
  if (n <= 0) return { places: [], earlier: 0, later: 0 }
  const f = Math.max(0, Math.min(n - 1, Math.round(focus)))
  const places: Focus2Place[] = new Array<Focus2Place>(n)
  const away = (i: number) => Math.abs(i - f)
  const step = (i: number) => FOCUS2_DEPTH[Math.min(away(i), MAX_DEPTH)]
  const b = (i: number) => base[i] ?? FALLBACK_W
  /** A card's scaled width: what it actually takes up in the room. */
  const sw = (i: number) => b(i) * step(i).scale
  const at = (i: number, cx: number, extra: { sliver?: boolean; peek?: boolean } = {}): Focus2Place => {
    const d = step(i)
    const sliver = extra.sliver === true
    /* A sliver keeps its own size and turn — it is still at its own distance — but reads at the furthest depth,
       because all the eye has of it is a 12 px edge. */
    const read = sliver ? FOCUS2_DEPTH[MAX_DEPTH] : d
    return {
      x: cx - b(i) / 2,
      /* The lift is clamped at the band's top: in a short room the open card stays in the band rather than riding
         out of it. */
      y: i === f ? Math.max(0, top - LIFT) : top + d.drop,
      scale: d.scale,
      turn: i === f ? 0 : i < f ? d.turn : -d.turn,
      z: i === f ? 20 : 20 - away(i) - (sliver ? 4 : 0),
      depth: away(i),
      veil: read.veil,
      blur: read.blur,
      opacity: read.opacity,
      hidden: false,
      sliver,
      peek: extra.peek === true,
      w: b(i),
    }
  }
  const hide = (p: Focus2Place): Focus2Place => ({ ...p, hidden: true, opacity: 0, sliver: false })

  const cx0 = roomW / 2
  places[f] = at(f, cx0)
  const fl = cx0 - sw(f) / 2
  const fr = cx0 + sw(f) / 2

  /* The earlier side: depth 1 shifts under the open card where the side is short; then whole cards, then slivers. */
  let near = fl
  let slivers = 0
  for (let i = f - 1; i >= 0; i--) {
    const w = sw(i)
    if (i === f - 1) {
      /* Room kept for the slivers of the cards beyond it, so they still show past the band's soft edge. */
      const beyond = Math.min(MAX_SLIVERS, i) * SLIVER
      let tuck = Math.min(TUCK * w, Math.max(0, w + 2 * NEAR_GAP + beyond - fl))
      let left = fl - NEAR_GAP + tuck - w
      if (left < EDGE) {
        const more = Math.max(0, Math.min(EDGE - left, TUCK_MAX * w - tuck))
        tuck += more
        left += more
      }
      const p = at(i, left + w / 2)
      places[i] = left < -2 ? hide(p) : p
      near = left
      continue
    }
    const whole = near - GAP - w
    if (slivers === 0 && !places[i + 1].hidden && whole >= EDGE) {
      places[i] = at(i, whole + w / 2)
      near = whole
    } else if (slivers < MAX_SLIVERS && !places[i + 1].hidden && near - SLIVER >= 0) {
      const left = near - SLIVER
      places[i] = at(i, left + w / 2, { sliver: true })
      near = left
      slivers++
    } else places[i] = hide(at(i, near - w / 2))
  }

  /* The later side: depth 1 stands beside the open card — its tile and title start are never under it, so it may run
     on under the band's soft edge instead; then whole cards, then slivers. */
  near = fr
  slivers = 0
  for (let i = f + 1; i < n; i++) {
    const w = sw(i)
    if (i === f + 1) {
      const left = fr + NEAR_GAP
      const p = at(i, left + w / 2)
      /* At least its tile, the start of its title and some of its line in view, or it is not worth drawing. */
      places[i] = roomW - left < Math.min(w, PEEK * 2.5) ? hide(p) : p
      near = left + w
      continue
    }
    const whole = near + GAP
    if (slivers === 0 && !places[i - 1].hidden && whole + w <= roomW - EDGE) {
      places[i] = at(i, whole + w / 2)
      near = whole + w
    } else if (slivers < MAX_SLIVERS && !places[i - 1].hidden && near + SLIVER <= roomW) {
      const right = near + SLIVER
      places[i] = at(i, right - w / 2, { sliver: true })
      near = right
      slivers++
    } else places[i] = hide(at(i, near + w / 2))
  }

  /* The kept card (the landed answer), when it would not be drawn whole: its near edge PEEK in from the far edge, so
     the answer never leaves the stage. It keeps its distance's veil and blur — it is still a far card — but the
     slot's opacity goes back to 1, so it reads as kept rather than as fading off. Anything that would stand under it
     gives way, and nothing is drawn beyond it. */
  if (keep > f && keep < n && (places[keep].hidden || places[keep].sliver)) {
    const w = sw(keep)
    /* Its stacking order is the furthest step's, not its true distance: a long story would otherwise put the answer
       further back with every beat the admin steps away from it, for no gain — nothing stands over it anyway. */
    places[keep] = { ...at(keep, roomW - PEEK + w / 2, { peek: true }), opacity: 1, z: 20 - Math.min(away(keep), MAX_DEPTH) }
    const lim = roomW - PEEK - GAP / 2
    for (let i = f + 1; i < keep; i++) {
      const p = places[i]
      if (p.hidden) continue
      const right = p.x + b(i) / 2 + sw(i) / 2
      if (right > lim) places[i] = hide(p)
    }
    for (let i = keep + 1; i < n; i++) places[i] = hide(places[i])
  }

  /* The edge pills: the cards each side that are not drawn whole. A peeking card is drawn, so it is not one of them. */
  let earlier = 0
  let later = 0
  for (let i = 0; i < n; i++) {
    if (i === f || !(places[i].hidden || places[i].sliver)) continue
    if (i < f) earlier++
    else later++
  }
  return { places, earlier, later }
}
