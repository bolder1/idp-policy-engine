import { describe, expect, it } from 'vitest'

import { FLAT, TILT, TILT_SWING, YAW_SWING, layerShift, projector, settled, springStep, tiltTarget, type Spring } from './jarvis1-tilt'

/* -----------------------------------------------------------------------------
   The circle's 3D maths (jarvis1-tilt.ts), pinned: the flat layer stands where
   the CSS draws the disc, and the pointer's lean stays within its few degrees
   and settles. The chips' placing was pinned here too; the sign-in left the
   circle (4 Oct 2026), so there are no chips and nothing to pin.
   -------------------------------------------------------------------------- */

describe('jarvis1-tilt: the circle in perspective', () => {
  it('projects as the CSS does: rotateX tilts the top away, nearer layers stand a touch larger', () => {
    const P = projector(TILT, 0)
    expect(P(0, 0, 0)).toEqual({ x: 0, y: 0 })
    /* The top of the ring recedes: it comes up shorter than its radius. */
    const top = P(0, -124, 0)
    expect(top.x).toBe(0)
    expect(top.y).toBeGreaterThan(-124)
    expect(top.y).toBeLessThan(-100)
    /* The front comes toward the viewer: a little longer than the back. */
    expect(Math.abs(P(0, 124, 0).y)).toBeGreaterThan(Math.abs(top.y))
    /* A point raised in z rises on the page (the top tilts away from it). */
    expect(P(0, 0, 30).y).toBeLessThan(0)
    /* Whole pixels only: words placed by it are never blurred. */
    for (const q of [P(37.3, 81.9, 14), P(-91.2, 12.4, 24)]) {
      expect(Number.isInteger(q.x)).toBe(true)
      expect(Number.isInteger(q.y)).toBe(true)
    }
  })

  it('puts every layer centre on the disc centre once it is slid by layerShift', () => {
    const P = projector(TILT, 0)
    expect(layerShift(0)).toBe(0)
    for (const z of [-24, 0, 4, 8, 10, 18, 20, 26]) {
      const q = P(0, layerShift(z), z)
      expect(Math.abs(q.x), `x at z ${z}`).toBe(0)
      expect(Math.abs(q.y), `y at z ${z}`).toBe(0)
    }
  })

  it('is flat under reduced motion: no tilt, no depth', () => {
    expect(FLAT(12.4, -80.6, 30)).toEqual({ x: 12, y: -81 })
    expect(projector(0, 0)(50, 50, 0)).toEqual({ x: 50, y: 50 })
  })

  it('leans toward the pointer by at most 4° of tilt and 6° of yaw', () => {
    expect(tiltTarget(0, 0)).toEqual({ tilt: TILT, yaw: 0 })
    expect(tiltTarget(1, -1)).toEqual({ tilt: TILT + TILT_SWING, yaw: YAW_SWING })
    expect(tiltTarget(-5, 5)).toEqual({ tilt: TILT - TILT_SWING, yaw: -YAW_SWING })
  })

  it('settles back to rest on its spring, without running away on a stalled frame', () => {
    let s: Spring = { v: TILT + TILT_SWING, vel: 0 }
    let frames = 0
    while (!settled(s, TILT) && frames < 600) {
      s = springStep(s, TILT, 1 / 60)
      frames++
    }
    expect(settled(s, TILT)).toBe(true)
    /* About 0.6–1.5 s at 60 fps. */
    expect(frames).toBeLessThan(120)
    const once = springStep({ v: 0, vel: 0 }, 10, 5)
    expect(Math.abs(once.v)).toBeLessThan(10)
  })
})
