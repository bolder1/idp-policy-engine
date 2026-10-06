import { useEffect, useRef, useState, type RefObject } from 'react'

/* -----------------------------------------------------------------------------
   THE CIRCLE's 3D (jarvis1-hub.tsx, owner 4 Oct 2026: "make it 3D and visually
   better"): the circle is layered rings tilted in perspective, each layer at
   its own depth; every WORD stays on a flat layer, placed at its 3D anchor's
   projected point, so text is never scaled or blurred.

   The chips' own maths lived here too — factSlots, chipRight and spread, the
   facts' angles on the orbit and how they kept clear of the person's orb. The
   owner took the sign-in back out of the circle, so there are no chips to
   place and all three are gone.

     layerShift(z)            how far down a layer at depth z is slid so its
                              centre lands on the disc's centre (one centre)
     projector(tilt, yaw, P)  the same maths the CSS does —
                              perspective P about the circle's centre, then
                              rotateX(tilt) rotateY(yaw) translateZ(z) —
                              a point (x, y, z) on the disc → its flat offset
     springStep(…)            the pointer's spring, one frame (pure)
     useHubTilt(ref, on)      the tilt and yaw now: the disc eases toward the
                              pointer over its own box, and settles back

   Angles are degrees clockwise from 12 o'clock (jarvis1-geometry.ts); x right,
   y down, z toward the viewer, all from the circle's centre.
   -------------------------------------------------------------------------- */

/** At rest: the top of the disc recedes. */
export const TILT = 22
export const YAW = 0
export const PERSPECTIVE = 1000
/** How far the pointer may lean it: ±4° of tilt, ±6° of yaw. */
export const TILT_SWING = 4
export const YAW_SWING = 6

export interface Flat {
  x: number
  y: number
}
export type Projector = (x: number, y: number, z?: number) => Flat

const rad = (d: number) => (d * Math.PI) / 180

/**
 * One centre (5 Oct 2026). A layer pushed back or forward by z has its centre projected off the disc's: the
 * projector's y2 = y·cos t − z·sin t is zero only where y = z·tan t, so a layer at depth z is drawn at
 * translate3d(0, layerShift(z), z) and, at rest, every ring's centre lands on the one point. (The pointer's
 * lean moves the tilt a few degrees off rest; the layers keep their rest shift.)
 */
export function layerShift(z: number, tilt = TILT): number {
  return z * Math.tan(rad(tilt))
}

/** A point on the disc (x, y, at depth z) → where it lands on the flat page, rounded to whole px. */
export function projector(tilt: number, yaw: number, P = PERSPECTIVE): Projector {
  const a = rad(tilt)
  const b = rad(yaw)
  const ca = Math.cos(a)
  const sa = Math.sin(a)
  const cb = Math.cos(b)
  const sb = Math.sin(b)
  return (x, y, z = 0) => {
    const x1 = x * cb + z * sb
    const z1 = -x * sb + z * cb
    const y2 = y * ca - z1 * sa
    const z2 = y * sa + z1 * ca
    const s = P / (P - z2)
    return { x: Math.round(x1 * s), y: Math.round(y2 * s) }
  }
}

/** Reduced motion: no depth at all — the disc is drawn flat and a point is where it is. */
export const FLAT: Projector = (x, y) => ({ x: Math.round(x), y: Math.round(y) })

export interface Spring {
  v: number
  vel: number
}

/** One frame of a damped spring toward `to` (semi-implicit Euler; dt in seconds, capped so a stalled tab never flings it). */
export function springStep(s: Spring, to: number, dt: number, stiffness = 120, damping = 20): Spring {
  const h = Math.min(dt, 1 / 30)
  const acc = stiffness * (to - s.v) - damping * s.vel
  const vel = s.vel + acc * h
  return { v: s.v + vel * h, vel }
}

export const settled = (s: Spring, to: number): boolean => Math.abs(s.v - to) < 0.01 && Math.abs(s.vel) < 0.01

/** The pointer's target, from where it is over the hub's box (nx, ny in −1…1): tilt 22 − 4·ny, yaw 6·nx. */
export function tiltTarget(nx: number, ny: number): { tilt: number; yaw: number } {
  const c = (v: number) => Math.max(-1, Math.min(1, v))
  return { tilt: TILT - TILT_SWING * c(ny), yaw: YAW + YAW_SWING * c(nx) }
}

/**
 * The tilt and yaw now. Over the circle's own box (`box`) the disc eases toward the pointer (a few degrees)
 * and settles back to rest as it leaves; never during a drag. Off (reduced motion): 0 and 0 — the disc is
 * flat. The pointer is heard on the world the circle stands in, not on the disc, so the segments' own hit
 * strokes never swallow it.
 */
export function useHubTilt(box: RefObject<HTMLElement | null>, on: boolean): { tilt: number; yaw: number } {
  const [now, setNow] = useState({ tilt: TILT, yaw: YAW })
  const target = useRef({ tilt: TILT, yaw: YAW })
  const springs = useRef({ tilt: { v: TILT, vel: 0 }, yaw: { v: YAW, vel: 0 } })
  useEffect(() => {
    if (!on) return
    springs.current = { tilt: { v: TILT, vel: 0 }, yaw: { v: YAW, vel: 0 } }
    target.current = { tilt: TILT, yaw: YAW }
    const el = box.current
    const world = el?.closest<HTMLElement>('.rl-jarvis__world') ?? null
    if (!el || !world) return
    let raf = 0
    let last = 0
    const tick = (t: number) => {
      const dt = last ? (t - last) / 1000 : 1 / 60
      last = t
      const s = springs.current
      const to = target.current
      s.tilt = springStep(s.tilt, to.tilt, dt)
      s.yaw = springStep(s.yaw, to.yaw, dt)
      const done = settled(s.tilt, to.tilt) && settled(s.yaw, to.yaw)
      if (done) {
        s.tilt = { v: to.tilt, vel: 0 }
        s.yaw = { v: to.yaw, vel: 0 }
      }
      setNow({ tilt: Math.round(s.tilt.v * 100) / 100, yaw: Math.round(s.yaw.v * 100) / 100 })
      raf = done ? 0 : window.requestAnimationFrame(tick)
      if (done) last = 0
    }
    const aim = (to: { tilt: number; yaw: number }) => {
      const t = target.current
      if (Math.abs(t.tilt - to.tilt) < 0.05 && Math.abs(t.yaw - to.yaw) < 0.05) return
      target.current = to
      if (!raf) raf = window.requestAnimationFrame(tick)
    }
    const rest = { tilt: TILT, yaw: YAW }
    const onMove = (e: PointerEvent) => {
      if (e.buttons !== 0) {
        aim(rest)
        return
      }
      const r = el.getBoundingClientRect()
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
      if (!inside || r.width === 0) {
        aim(rest)
        return
      }
      aim(tiltTarget(((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1))
    }
    const onLeave = () => aim(rest)
    world.addEventListener('pointermove', onMove)
    world.addEventListener('pointerleave', onLeave)
    return () => {
      world.removeEventListener('pointermove', onMove)
      world.removeEventListener('pointerleave', onLeave)
      window.cancelAnimationFrame(raf)
    }
  }, [box, on])
  return on ? now : { tilt: 0, yaw: 0 }
}
