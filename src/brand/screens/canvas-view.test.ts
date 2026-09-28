import { describe, expect, it } from 'vitest'

import { createViewMover, FOCUS_EDGE, lockedView, revealY, type Frames, type View } from './canvas-view'

/* The board's canvas is a single column read top to bottom: no sideways pan,
   always centred, and scrolling that stops at both ends of the chain.

   Pinned as arithmetic because the browser cannot be trusted to show it. The
   view is painted on animation frames, and a hidden preview pane delivers none —
   so a live check of "is the column centred" can read a view that was never
   painted and report a working lock as broken. This is the rule itself, with the
   DOM taken out. */

const size = { stageW: 600, stageH: 800, worldW: 680, worldH: 2000 }
const zoom = { min: 0.5, max: 1.4 }

describe('the locked board canvas', () => {
  it('centres the column at every zoom, whatever x it was handed', () => {
    for (const z of [0.5, 0.81, 1, 1.4]) {
      expect(lockedView({ x: 999, y: 0, z }, size, zoom).x).toBeCloseTo((600 - 680 * z) / 2)
    }
  })

  it('ignores a sideways pan entirely', () => {
    const a = lockedView({ x: 80, y: -100, z: 1 }, size, zoom)
    const b = lockedView({ x: -500, y: -100, z: 1 }, size, zoom)
    expect(a.x).toBe(b.x)
  })

  it('cannot be pulled down past the top of the stage', () => {
    expect(lockedView({ x: 0, y: 400, z: 1 }, size, zoom).y).toBe(0)
  })

  it('cannot be scrolled past the end of the chain', () => {
    // 2000px of world at 100% in an 800px stage: the lowest the top can go is -1200.
    expect(lockedView({ x: 0, y: -9999, z: 1 }, size, zoom).y).toBe(-1200)
    // Anywhere in between is left exactly where the reader put it.
    expect(lockedView({ x: 0, y: -600, z: 1 }, size, zoom).y).toBe(-600)
  })

  it('keeps a chain shorter than the stage pinned to the top, where a list is read from', () => {
    const short = { ...size, worldH: 300 }
    expect(lockedView({ x: 0, y: -50, z: 1 }, short, zoom).y).toBe(0)
    expect(lockedView({ x: 0, y: 50, z: 1 }, short, zoom).y).toBe(0)
  })

  it('clamps the zoom before centring on it', () => {
    const v = lockedView({ x: 0, y: 0, z: 9 }, size, zoom)
    expect(v.z).toBe(1.4)
    expect(v.x).toBeCloseTo((600 - 680 * 1.4) / 2)
  })
})

/* Try a sign-in's Decision gate sits at the foot of the chain, and the view
   dock floats over the foot of the stage. At 1280 × 860 the gate landed
   behind the dock (owner, 26 Sep 2026), so the view brings it above the
   dock's floor — by as little as it can, and never past the band's own top. */
describe('revealing a band of the chain', () => {
  const stageH = 760
  const floor = 58

  it('moves nothing when the band is already in view', () => {
    expect(revealY({ x: 0, y: 0, z: 1 }, { top: 100, bottom: 500 }, stageH, floor)).toBeNull()
    expect(revealY({ x: 0, y: -200, z: 1 }, { top: 300, bottom: 800 }, stageH, floor)).toBeNull()
  })

  it('lifts a band behind the floor until its bottom sits on it', () => {
    // The HRMS gate: 699–781 in the world, so 79 px under the 702 px of room.
    expect(revealY({ x: 0, y: 0, z: 1 }, { top: 699, bottom: 781 }, stageH, floor)).toBe(702 - 781)
  })

  it('reads the band at the zoom it is drawn at', () => {
    expect(revealY({ x: 0, y: 0, z: 0.5 }, { top: 1400, bottom: 1600 }, stageH, floor)).toBe(702 - 800)
  })

  it('keeps the top of a band taller than the room in view', () => {
    expect(revealY({ x: 0, y: 0, z: 1 }, { top: 600, bottom: 1500 }, stageH, floor)).toBe(-600)
  })

  it('brings a band scrolled above the stage back down to the top', () => {
    expect(revealY({ x: 0, y: -900, z: 1 }, { top: 700, bottom: 780 }, stageH, floor)).toBe(-700)
  })
})

/* Opening Which policy's list by hand pushes the gate down by the list's
   height. The reveal that follows a turn keeps the row that was pressed — and
   the focus on it — inside the stage (28 Sep 2026). The numbers are the
   board's at 1,120 × 860: a 760 px stage, a 58 px floor for the dock. */
describe('revealing a band while keeping a pressed row in the stage', () => {
  const stageH = 760
  const floor = 58

  it('lifts no further than puts the row at the focus edge', () => {
    // The row at 100, the band 200 px under the room: the lift stops at 76.
    expect(revealY({ x: 0, y: 0, z: 1 }, { top: 800, bottom: 902 }, stageH, floor, 100)).toBe(FOCUS_EDGE - 100)
  })

  it('moves nothing when the row is at the edge already, and leaves the band for later', () => {
    // As landed at 1,120 × 860: the row 24 px under the stage's top, the list open under it.
    expect(revealY({ x: 0, y: -300, z: 1 }, { top: 1100, bottom: 1190 }, stageH, floor, 324)).toBeNull()
    // Nor pushes a row sitting between the stage's top and the edge down to it.
    expect(revealY({ x: 0, y: -310, z: 1 }, { top: 1100, bottom: 1190 }, stageH, floor, 324)).toBeNull()
  })

  it('lifts in full when the band and the row both fit', () => {
    expect(revealY({ x: 0, y: 0, z: 1 }, { top: 699, bottom: 781 }, stageH, floor, 300)).toBe(702 - 781)
  })

  it('brings a row above the stage back down to the edge, even with the band in view', () => {
    expect(revealY({ x: 0, y: -400, z: 1 }, { top: 700, bottom: 780 }, stageH, floor, 324)).toBe(FOCUS_EDGE - 324)
  })

  it('moves nothing with the band and the row both in view', () => {
    expect(revealY({ x: 0, y: 0, z: 1 }, { top: 400, bottom: 500 }, stageH, floor, 100)).toBeNull()
  })

  it('reads the row at the zoom it is drawn at', () => {
    expect(revealY({ x: 0, y: 0, z: 0.5 }, { top: 1600, bottom: 1800 }, stageH, floor, 200)).toBe(FOCUS_EDGE - 100)
  })
})

/* The view's motion with a fake frame clock: the order of a jump, a glide and
   a world resize, which the browser cannot be trusted to show (a hidden pane
   delivers no frames). */
describe('moving the view', () => {
  const zoom = { min: 0.5, max: 1.4 }
  function rig(worldH: number, reduced = false) {
    let now = 0
    let id = 0
    const queue = new Map<number, (t: number) => void>()
    const frames: Frames = {
      request: (cb) => {
        queue.set(++id, cb)
        return id
      },
      cancel: (n) => void queue.delete(n),
      now: () => now,
    }
    const world = { h: worldH }
    const painted: View[] = []
    const mover = createViewMover(
      { x: 0, y: 0, z: 1 },
      {
        clamp: (v) => lockedView(v, { stageW: 600, stageH: 800, worldW: 600, worldH: world.h }, zoom),
        paint: (v) => void painted.push(v),
        reduced: () => reduced,
        frames,
      },
    )
    const step = (ms = 16) => {
      now += ms
      const due = [...queue.values()]
      queue.clear()
      for (const cb of due) cb(now)
    }
    const settle = () => {
      for (let i = 0; i < 100 && queue.size; i++) step()
    }
    return { mover, world, painted, step, settle }
  }

  /* The bug it pins: the list opens, the chain grows in the same frame the
     board glides to show the gate, and the world's resize re-clamped the view
     through a jump — which cancelled the glide after one frame. */
  it('lets a glide land when the world resizes under it', () => {
    const r = rig(800)
    r.world.h = 1100
    r.mover.glide({ y: -300 })
    r.step()
    r.mover.worldResized()
    expect(r.mover.gliding()).toBe(true)
    r.settle()
    expect(r.mover.view.current.y).toBe(-300)
  })

  it('lands inside the world as it is when the glide ends', () => {
    const r = rig(2000)
    r.mover.glide({ y: -1000 })
    r.step()
    r.world.h = 1000
    r.mover.worldResized()
    r.settle()
    expect(r.mover.view.current.y).toBe(-200)
    expect(r.painted.at(-1)?.y).toBe(-200)
  })

  it('re-clamps at once when the world resizes with nothing in flight', () => {
    const r = rig(2000)
    r.mover.apply((v) => ({ ...v, y: -1200 }))
    r.world.h = 900
    r.mover.worldResized()
    expect(r.mover.view.current.y).toBe(-100)
  })

  it('stops a glide for a jump: a wheel or a drag outranks it', () => {
    const r = rig(2000)
    r.mover.glide({ y: -800 })
    r.step()
    r.mover.apply((v) => ({ ...v, y: -50 }))
    expect(r.mover.gliding()).toBe(false)
    r.settle()
    expect(r.mover.view.current.y).toBe(-50)
  })

  it('jumps and paints at once under reduced motion', () => {
    const r = rig(2000, true)
    r.mover.glide({ y: -400 })
    expect(r.mover.gliding()).toBe(false)
    expect(r.mover.view.current.y).toBe(-400)
    expect(r.painted).toEqual([{ x: 0, y: -400, z: 1 }])
  })
})
