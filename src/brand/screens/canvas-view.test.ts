import { describe, expect, it } from 'vitest'

import { lockedView } from './canvas-view'

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
