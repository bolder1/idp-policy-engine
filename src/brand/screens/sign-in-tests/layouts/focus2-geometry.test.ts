import { describe, expect, it } from 'vitest'

import {
  ANSWER_WIDE,
  EDGE,
  FOCUS2_DEPTH,
  GAP,
  LIFT,
  MAX_DEPTH,
  MAX_SLIVERS,
  NEAR_GAP,
  PEEK,
  PERSPECTIVE,
  SLIVER,
  TUCK,
  TUCK_MAX,
  answerWidth,
  cardWidth,
  depthOf,
  focus2Places,
  type Focus2Place,
} from './focus2-geometry'

/* -----------------------------------------------------------------------------
   Focus's placement maths (focus2-geometry.ts). Pure numbers, so these are
   arithmetic, not renders: every claim the spec makes about where a card
   stands is checked at the widths the console actually runs at, and at the
   boundaries of each fallback.

   The claim that matters most is the first one. v1 slid the row so an end
   never left the room empty, which put the landed answer's centre at x 962
   against a canvas centre of 672 at 1280. Here the open card's centre is
   roomW / 2 in every state, so that defect is a one-line assertion repeated
   over every room, every count and every step the story can be at.
   -------------------------------------------------------------------------- */

/** The widths the console runs at, plus the ones that break a layout: a 0-wide room is what jsdom hands it. */
const ROOMS = [0, 1, 240, 320, 360, 480, 600, 640, 720, 900, 976, 1000, 1024, 1120, 1280, 1366, 1440, 1600, 1920, 4000]

const TOP = 100
/** A receded card's far face, as the layout measures it. */
const FAR = 335

/** The open card's centre: its unscaled box's left edge plus half its width (it scales about its top centre). */
const centreOf = (p: Focus2Place) => p.x + p.w / 2
/** What a card actually covers in the room, after its scale. */
const edgesOf = (p: Focus2Place) => {
  const c = centreOf(p)
  const half = (p.w * p.scale) / 2
  return { left: c - half, right: c + half, width: p.w * p.scale }
}
/** Each card's unscaled width with `f` open: the open one shows its full face, the rest their far face. */
const widthsAt = (n: number, f: number, cw: number, wide = -1) => Array.from({ length: n }, (_, i) => (i === f ? (i === wide ? answerWidth(cw) : cw) : FAR))

describe('the open card is centred, always', () => {
  it('its centre is roomW / 2 at every room, count and step — the end-hugging branches are gone', () => {
    for (const roomW of ROOMS) {
      const cw = cardWidth(roomW)
      for (const n of [1, 2, 3, 5, 8]) {
        for (const f of [0, Math.floor((n - 1) / 2), n - 1]) {
          const { places } = focus2Places({ n, focus: f, roomW, base: widthsAt(n, f, cw), top: TOP })
          expect(centreOf(places[f])).toBeCloseTo(roomW / 2, 9)
        }
      }
    }
  })

  it('landed, with the answer kept on stage, the answer is centred and not pushed to the right edge', () => {
    for (const roomW of [1280, 1366, 1440]) {
      const cw = cardWidth(roomW)
      const n = 7
      const f = n - 1
      const { places } = focus2Places({ n, focus: f, roomW, base: widthsAt(n, f, cw, f), top: TOP, keep: f })
      /* The measured v1 defect: 962 against a canvas centre of 672 at 1280. */
      expect(centreOf(places[f])).toBeCloseTo(roomW / 2, 9)
      expect(places[f].hidden).toBe(false)
      expect(places[f].peek).toBe(false)
    }
  })

  it('stepped back with the answer kept, the open card still holds the centre', () => {
    const roomW = 1280
    const cw = cardWidth(roomW)
    const n = 7
    for (const f of [0, 1, 3, 5]) {
      const { places } = focus2Places({ n, focus: f, roomW, base: widthsAt(n, f, cw), top: TOP, keep: n - 1 })
      expect(centreOf(places[f])).toBeCloseTo(roomW / 2, 9)
    }
  })

  it('in Text mode, where every card is a far face, the centre does not move', () => {
    for (const roomW of [1280, 1440]) {
      const n = 6
      const f = 2
      const { places } = focus2Places({ n, focus: f, roomW, base: Array.from({ length: n }, () => FAR), top: TOP })
      expect(centreOf(places[f])).toBeCloseTo(roomW / 2, 9)
    }
  })

  it('an empty side is fine: with nothing earlier, nothing is drawn or counted on that side', () => {
    const { places, earlier } = focus2Places({ n: 3, focus: 0, roomW: 1440, base: widthsAt(3, 0, cardWidth(1440)), top: TOP })
    expect(earlier).toBe(0)
    expect(centreOf(places[0])).toBeCloseTo(720, 9)
  })
})

describe('the lift, and the depth table', () => {
  const roomW = 1440
  const cw = cardWidth(roomW)
  const n = 5
  const f = 4
  const { places } = focus2Places({ n, focus: f, roomW, base: widthsAt(n, f, cw), top: TOP })

  it('the open card stands 8 px higher than the row', () => {
    expect(LIFT).toBe(8)
    expect(places[f].y).toBe(TOP - 8)
  })

  it('a short room never lifts the card out of the band', () => {
    const { places: tight } = focus2Places({ n, focus: f, roomW, base: widthsAt(n, f, cw), top: 4 })
    expect(tight[f].y).toBe(0)
  })

  it('drop, scale and turn by distance: 18/32/44, 0.8/0.68/0.58, 16/24/30°', () => {
    expect(FOCUS2_DEPTH.map((d) => d.drop)).toEqual([0, 18, 32, 44])
    expect(FOCUS2_DEPTH.map((d) => d.scale)).toEqual([1, 0.8, 0.68, 0.58])
    expect(FOCUS2_DEPTH.map((d) => d.turn)).toEqual([0, 16, 24, 30])
    expect(PERSPECTIVE).toBe(1100)
    for (let i = f - 1; i >= 0; i--) {
      const d = FOCUS2_DEPTH[Math.min(f - i, MAX_DEPTH)]
      expect(places[i].y).toBe(TOP + d.drop)
      expect(places[i].scale).toBe(d.scale)
    }
  })

  it('the veil, blur and slot opacity are one table: 0/0.22/0.5/0.7, 0/0.6/1.6/3 px, 1/1/1/0.9', () => {
    expect(FOCUS2_DEPTH.map((d) => d.veil)).toEqual([0, 0.22, 0.5, 0.7])
    expect(FOCUS2_DEPTH.map((d) => d.blur)).toEqual([0, 0.6, 1.6, 3])
    expect(FOCUS2_DEPTH.map((d) => d.opacity)).toEqual([1, 1, 1, 0.9])
    for (const p of places) {
      if (p.hidden) continue
      const d = FOCUS2_DEPTH[depthOf(p)]
      expect(p.veil).toBe(d.veil)
      expect(p.blur).toBe(d.blur)
      expect(p.opacity).toBe(d.opacity)
    }
  })

  it('the open card is clear, and a card that is not drawn carries no opacity', () => {
    expect(places[f].veil).toBe(0)
    expect(places[f].blur).toBe(0)
    expect(places[f].opacity).toBe(1)
    /* A plain 0, never -0: a -0 reaches a style string as "-0deg". */
    expect(places[f].turn).toBe(0)
    const { places: tight } = focus2Places({ n: 6, focus: 5, roomW: 600, base: widthsAt(6, 5, cardWidth(600)), top: TOP })
    const gone = tight.filter((p) => p.hidden)
    expect(gone.length).toBeGreaterThan(0)
    for (const p of gone) {
      expect(p.opacity).toBe(0)
      expect(p.sliver).toBe(false)
    }
  })

  it('a card turns towards the front, each side its own way; a sliver reads at the furthest depth', () => {
    expect(places[f - 1].turn).toBe(16)
    const { places: later } = focus2Places({ n: 3, focus: 0, roomW: 1440, base: widthsAt(3, 0, cardWidth(1440)), top: TOP })
    expect(later[1].turn).toBe(-16)
    expect(depthOf({ depth: 1, sliver: true })).toBe(MAX_DEPTH)
    expect(depthOf({ depth: 9, sliver: false })).toBe(MAX_DEPTH)
    expect(depthOf({ depth: 2, sliver: false })).toBe(2)
  })

  it('the card width and the answer width come from the room', () => {
    expect(ANSWER_WIDE).toBe(1.52)
    expect(cardWidth(1440)).toBe(440)
    expect(cardWidth(320)).toBe(360)
    expect(cardWidth(0)).toBe(360)
    expect(answerWidth(440)).toBe(669)
  })
})

describe('depth 1: the near gap, and the tuck when the side is short', () => {
  /* One earlier card, so no room is kept for slivers beyond it and the threshold is the spec's plainest form:
     depth 1 tucks once its side has less than its own scaled width + 24 + 24. With a 400 px open card and a 300 px
     far face (240 px scaled), that is a 976 px room exactly. */
  const base = [300, 400]
  const w = 300 * FOCUS2_DEPTH[1].scale
  const at = (roomW: number) => {
    const { places } = focus2Places({ n: 2, focus: 1, roomW, base, top: TOP })
    const fl = roomW / 2 - 400 / 2
    const e = edgesOf(places[0])
    return { p: places[0], fl, gap: fl - e.right, shift: e.left - (fl - NEAR_GAP - w) }
  }

  it('with room, depth 1 stands exactly 24 px from the open card and does not tuck', () => {
    expect(NEAR_GAP).toBe(24)
    for (const roomW of [976, 1000, 1280, 1440, 1920]) {
      const { gap, shift } = at(roomW)
      expect(gap).toBeCloseTo(NEAR_GAP, 9)
      expect(shift).toBeCloseTo(0, 9)
    }
  })

  it('one pixel narrower than the threshold, it has tucked by exactly that pixel', () => {
    const { gap, shift } = at(974)
    expect(shift).toBeCloseTo(1, 9)
    expect(gap).toBeCloseTo(NEAR_GAP - 1, 9)
  })

  it('the tuck is at most 18 % of its scaled width while the card still fits from the edge', () => {
    expect(TUCK).toBe(0.18)
    for (const roomW of [900, 880, 870, 860, 850]) {
      const { shift, p } = at(roomW)
      expect(p.hidden).toBe(false)
      expect(shift).toBeGreaterThan(0)
      expect(shift).toBeLessThanOrEqual(TUCK * w + 1e-9)
    }
  })

  it('in a room too small for that, it tucks further — up to 60 % — rather than not be drawn', () => {
    expect(TUCK_MAX).toBe(0.6)
    const { shift, p } = at(640)
    expect(p.hidden).toBe(false)
    expect(shift).toBeCloseTo(TUCK_MAX * w, 9)
    /* Its near edge is held at the room's edge rather than run off it. */
    expect(edgesOf(p).left).toBeCloseTo(0, 9)
  })

  it('however far it tucks, its tile and the start of its title stay clear', () => {
    for (const roomW of ROOMS) {
      const { places } = focus2Places({ n: 2, focus: 1, roomW, base, top: TOP })
      const p = places[0]
      if (p.hidden) continue
      const fl = roomW / 2 - 200
      /* The open card can never cover more than TUCK_MAX of it: 24 px plus 40 % of its width always shows. */
      expect(fl - edgesOf(p).left).toBeGreaterThanOrEqual(NEAR_GAP + (1 - TUCK_MAX) * w - 1e-9)
    }
  })

  it('past the tuck it is not drawn at all, and the side counts it', () => {
    const over = at(636)
    expect(over.p.hidden).toBe(false)
    expect(edgesOf(over.p).left).toBeCloseTo(-2, 9)
    const { places, earlier } = focus2Places({ n: 2, focus: 1, roomW: 634, base, top: TOP })
    expect(places[0].hidden).toBe(true)
    expect(earlier).toBe(1)
  })

  it('room is kept for the slivers behind it, so a deeper stack tucks a little sooner', () => {
    /* Three earlier cards, so two of them could be slivers: 24 px of the side is held back for their edges, and
       depth 1 starts tucking with that much more side room — 48 px of the room, which has two sides (976 + 48). */
    const deep = Array.from({ length: 4 }, (_, i) => (i === 3 ? 400 : 300))
    const shiftAt = (roomW: number) => {
      const { places } = focus2Places({ n: 4, focus: 3, roomW, base: deep, top: TOP })
      return edgesOf(places[2]).left - (roomW / 2 - 200 - NEAR_GAP - w)
    }
    expect(shiftAt(1024)).toBeCloseTo(0, 9)
    expect(shiftAt(1022)).toBeCloseTo(1, 9)
    /* Past the threshold the tuck is exactly what the side is short by, which is half of what the room is short by. */
    expect(shiftAt(1000)).toBeCloseTo((1024 - 1000) / 2, 9)
  })
})

describe('depth 2 and 3: whole where they fit, then slivers, then nothing', () => {
  const n = 6
  const f = 5
  const base = Array.from({ length: n }, (_, i) => (i === f ? 400 : FAR))

  it('at most two slivers a side, and they are 12 px of the far edge', () => {
    expect(SLIVER).toBe(12)
    expect(MAX_SLIVERS).toBe(2)
    const { places } = focus2Places({ n, focus: f, roomW: 1000, base, top: TOP })
    const slivers = places.filter((p) => p.sliver)
    expect(slivers).toHaveLength(MAX_SLIVERS)
    for (let i = 0; i < n - 1; i++) {
      if (!places[i].sliver) continue
      /* Each sliver shows SLIVER px past the card nearer the open one. */
      expect(edgesOf(places[i + 1]).left - edgesOf(places[i]).left).toBeCloseTo(SLIVER, 9)
    }
  })

  it('the row never goes back: whole cards, then slivers, then hidden, going away from the open card', () => {
    for (const roomW of ROOMS) {
      const { places } = focus2Places({ n, focus: f, roomW, base, top: TOP })
      let worst = 0
      for (let i = f - 1; i >= 0; i--) {
        const p = places[i]
        const state = p.hidden ? 2 : p.sliver ? 1 : 0
        expect(state).toBeGreaterThanOrEqual(worst)
        worst = state
      }
      expect(places.filter((p) => p.sliver).length).toBeLessThanOrEqual(MAX_SLIVERS)
    }
  })

  it('the cards that fit are drawn whole, 18 px apart, inside the room', () => {
    expect(GAP).toBe(18)
    const deep = Array.from({ length: 4 }, (_, i) => (i === 3 ? 440 : FAR))
    const { places, earlier } = focus2Places({ n: 4, focus: 3, roomW: 4000, base: deep, top: TOP })
    expect(earlier).toBe(0)
    for (const p of places) expect(p.sliver || p.hidden).toBe(false)
    /* Between two receded cards the gap is GAP; depth 1 keeps NEAR_GAP from the open card instead. */
    for (let i = 1; i >= 0; i--) expect(edgesOf(places[i + 1]).left - edgesOf(places[i]).right).toBeCloseTo(GAP, 9)
    expect(edgesOf(places[0]).left).toBeGreaterThanOrEqual(EDGE)
  })

  it('at 1920 a 440 px card and 335 px far faces leave room for three whole, and the fourth is a sliver', () => {
    /* Worth writing down: one side holds 24 + 268 + 18 + 227.8 = 537.8 of its 740, and the next card needs 212.3
       more than is left — so a four-deep story is already stacking at the console's widest. */
    const deep = Array.from({ length: 4 }, (_, i) => (i === 3 ? 440 : FAR))
    const { places, earlier } = focus2Places({ n: 4, focus: 3, roomW: 1920, base: deep, top: TOP })
    expect(places.map((p) => p.sliver)).toEqual([true, false, false, false])
    expect(places.some((p) => p.hidden)).toBe(false)
    expect(earlier).toBe(1)
  })

  it('a narrow room hides the rest, and the pill counts every card not drawn whole', () => {
    const { places, earlier, later } = focus2Places({ n, focus: f, roomW: 1000, base, top: TOP })
    expect(places.filter((p) => p.hidden)).toHaveLength(2)
    expect(earlier).toBe(4)
    expect(later).toBe(0)
    expect(earlier).toBe(places.filter((p, i) => i < f && (p.hidden || p.sliver)).length)
  })

  it('both sides are counted on their own', () => {
    const mid = 4
    const { places, earlier, later } = focus2Places({ n: 9, focus: mid, roomW: 900, base: Array.from({ length: 9 }, (_, i) => (i === mid ? 400 : FAR)), top: TOP })
    expect(earlier).toBe(places.filter((p, i) => i < mid && (p.hidden || p.sliver)).length)
    expect(later).toBe(places.filter((p, i) => i > mid && (p.hidden || p.sliver)).length)
    expect(earlier).toBeGreaterThan(0)
    expect(later).toBeGreaterThan(0)
  })
})

describe('the landed answer is never let go of', () => {
  const roomW = 1408
  const cw = cardWidth(roomW)
  const n = 7

  it('stepped back to the first card, it peeks 64 px in from the far edge, drawn and pressable', () => {
    expect(PEEK).toBe(64)
    const base = Array.from({ length: n }, (_, i) => (i === 0 ? cw : FAR))
    const { places, later } = focus2Places({ n, focus: 0, roomW, base, top: TOP, keep: n - 1 })
    const out = places[n - 1]
    expect(out.hidden).toBe(false)
    expect(out.peek).toBe(true)
    expect(out.opacity).toBe(1)
    expect(out.turn).toBeLessThan(0)
    expect(roomW - edgesOf(out).left).toBeCloseTo(PEEK, 9)
    /* It is still a far card, so it keeps its distance's veil and blur. */
    expect(out.veil).toBe(FOCUS2_DEPTH[MAX_DEPTH].veil)
    /* The cards between it and the open one that do not fit stay hidden, never drawn under the peek. */
    expect(places.slice(1, n - 1).some((p) => p.hidden)).toBe(true)
    expect(later).toBe(places.filter((p, i) => i > 0 && (p.hidden || p.sliver)).length)
  })

  it('it is drawn in every room, however little there is', () => {
    for (const roomW2 of ROOMS) {
      const base = Array.from({ length: n }, (_, i) => (i === 0 ? cardWidth(roomW2) : FAR))
      const { places } = focus2Places({ n, focus: 0, roomW: roomW2, base, top: TOP, keep: n - 1 })
      expect(places[n - 1].hidden).toBe(false)
    }
  })

  it('without a kept card, nothing out of reach is drawn', () => {
    const { places } = focus2Places({ n, focus: 0, roomW, base: Array.from({ length: n }, () => cw), top: TOP })
    expect(places[n - 1].hidden).toBe(true)
    expect(places.some((p) => p.peek)).toBe(false)
  })

  it('one step back it stands whole at depth 1, with no peek', () => {
    const f = n - 2
    const base = Array.from({ length: n }, (_, i) => (i === f ? cw : FAR))
    const { places } = focus2Places({ n, focus: f, roomW, base, top: TOP, keep: n - 1 })
    const out = places[n - 1]
    expect(out.hidden).toBe(false)
    expect(out.peek).toBe(false)
    expect(out.depth).toBe(1)
    expect(out.scale).toBe(FOCUS2_DEPTH[1].scale)
  })

  it('open, it is the wide card at the centre', () => {
    const f = n - 1
    const base = widthsAt(n, f, cw, f)
    const { places } = focus2Places({ n, focus: f, roomW, base, top: TOP, keep: f })
    expect(places[f].w).toBe(answerWidth(cw))
    expect(places[f].w).toBe(669)
    expect(centreOf(places[f])).toBeCloseTo(roomW / 2, 9)
  })
})

describe('it answers whatever it is handed', () => {
  it('no cards: nothing placed, nothing counted', () => {
    expect(focus2Places({ n: 0, focus: 0, roomW: 1440, base: [], top: TOP })).toEqual({ places: [], earlier: 0, later: 0 })
  })

  it('one card: centred, lifted, clear', () => {
    const { places, earlier, later } = focus2Places({ n: 1, focus: 0, roomW: 1440, base: [440], top: TOP })
    expect(places).toHaveLength(1)
    expect(centreOf(places[0])).toBe(720)
    expect(places[0].veil).toBe(0)
    expect(earlier + later).toBe(0)
  })

  it('a step outside the row is clamped, not thrown', () => {
    const base = Array.from({ length: 4 }, () => FAR)
    expect(() => focus2Places({ n: 4, focus: 9, roomW: 1440, base, top: TOP })).not.toThrow()
    expect(focus2Places({ n: 4, focus: 9, roomW: 1440, base, top: TOP }).places[3].depth).toBe(0)
    expect(focus2Places({ n: 4, focus: -3, roomW: 1440, base, top: TOP }).places[0].depth).toBe(0)
  })

  it('a 0-wide room (jsdom, where the shared render test runs it) comes out finite', () => {
    const n = 7
    const base = Array.from({ length: n }, () => FAR)
    const { places } = focus2Places({ n, focus: 3, roomW: 0, base, top: 0, keep: n - 1 })
    for (const p of places) {
      for (const v of [p.x, p.y, p.scale, p.turn, p.z, p.depth, p.veil, p.blur, p.opacity, p.w]) expect(Number.isFinite(v)).toBe(true)
    }
    expect(centreOf(places[3])).toBe(0)
  })

  it('a short base list is filled in rather than read past its end', () => {
    const { places } = focus2Places({ n: 4, focus: 1, roomW: 1440, base: [FAR, 440], top: TOP })
    for (const p of places) expect(Number.isFinite(p.w)).toBe(true)
  })

  it('it is pure: the same input gives the same answer, and the widths are only read', () => {
    const base = Object.freeze([FAR, FAR, 440, FAR, FAR]) as readonly number[]
    const input = { n: 5, focus: 2, roomW: 1280, base, top: TOP, keep: 4 }
    const once = focus2Places(input)
    const twice = focus2Places(input)
    expect(once).toEqual(twice)
    expect(once.places).not.toBe(twice.places)
    expect(base).toEqual([FAR, FAR, 440, FAR, FAR])
  })

  it('the stacking order puts the open card over its neighbours', () => {
    const { places } = focus2Places({ n: 5, focus: 2, roomW: 1440, base: widthsAt(5, 2, 440), top: TOP })
    expect(places[2].z).toBeGreaterThan(places[1].z)
    expect(places[2].z).toBeGreaterThan(places[3].z)
    expect(places[1].z).toBeGreaterThan(places[0].z)
  })
})
