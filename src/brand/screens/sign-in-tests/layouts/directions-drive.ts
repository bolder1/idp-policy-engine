import { animate as tween, useMotionValue, type MotionValue } from 'motion/react'
import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react'

import type { EngineRun } from '../engine-run'
import { stepMs } from '../use-engine-run'
import type { MapGeo, RoutePath } from './directions-geometry'
import { landedAt } from './directions-model'

/* -----------------------------------------------------------------------------
   The drive (directions-map.tsx): how far along the route the engine is at
   step `s`, the route line grown that far, the vehicle at its tip, and the
   map's camera — close on the vehicle while the engine works, the whole
   route once it arrives (landing = fit), close on what is pressed after.
   Everything is set by hand on the SVG and the camera's motion values: no
   CSS transform or transition on anything that moves.
   -------------------------------------------------------------------------- */

const EASE = [0.4, 0, 0.2, 1] as const
/** How close the camera rides while the engine works, and on what is pressed. */
export const RIDE_ZOOM = 1.2
export const LOOK_ZOOM = 1.25

/** How far along the route the engine is at step `s`. */
export function tipAlong(plan: EngineRun, s: number, geo: MapGeo, path: RoutePath): number {
  if (landedAt(plan, s)) return path.length
  const st = plan.steps[s]
  if (!st) return 0
  const d = plan.policies.findIndex((p) => p.decides)
  const sy = geo.start.y
  const toJunction = (i: number) => {
    const j = geo.junctions[Math.min(i, geo.junctions.length - 1)]
    return j ? path.along(0, j.y - sy) : 0
  }
  switch (st.kind) {
    case 'find':
      return path.along(0, 34)
    case 'scan':
      return toJunction(st.policy ?? 0)
    case 'found':
    case 'decides':
    case 'expand':
      return toJunction(d >= 0 ? d : (st.policy ?? 0))
    case 'rule':
    case 'check':
    case 'checked':
    case 'rule-end':
    case 'compact': {
      const gx = geo.gates[st.rule ?? 0]
      return gx === undefined ? toJunction(d) : path.along(1, gx - geo.avenue.x)
    }
    case 'deciding':
    case 'outcome':
    case 'done':
      return path.length
    default:
      return 0
  }
}

export interface Camera {
  zoom: MotionValue<number>
  fx: MotionValue<number>
  fy: MotionValue<number>
}

export function useCamera(): Camera {
  const zoom = useMotionValue(1)
  const fx = useMotionValue(0)
  const fy = useMotionValue(0)
  return useMemo(() => ({ zoom, fx, fy }), [zoom, fx, fy])
}

/** The camera's frame onto the map world: scale and offset, the map's edges never inside the card. */
export function frame(cam: Camera, W: number, H: number, cw: number, ch: number) {
  const z = cam.zoom.get()
  const x = Math.min(0, Math.max(cw - W * z, cw / 2 - cam.fx.get() * z))
  const y = Math.min(0, Math.max(ch - H * z, ch / 2 - cam.fy.get() * z))
  return { z, x, y }
}

interface DriveInput {
  plan: EngineRun
  s: number
  runKey: number
  geo: MapGeo
  path: RoutePath
  /** Motion is allowed and a run is playing. */
  animate: boolean
  /** Jump: reduced motion, Skip, a revisit. */
  instant: boolean
  /** Something is pressed: the camera looks at it, not the vehicle. */
  look: { x: number; y: number } | null
  routeRef: RefObject<SVGPathElement | null>
  carRef: RefObject<SVGGElement | null>
  worldRef: RefObject<HTMLDivElement | null>
  /** Drive it again: each new number replays the vehicle along the settled route (motion allowed, landed). */
  replay: number
  /** The replay is over. */
  onReplayed: () => void
}

export function useDrive({ plan, s, runKey, geo, path, animate, instant, look, routeRef, carRef, worldRef, replay, onReplayed }: DriveInput) {
  const dist = useMotionValue(0)
  const cam = useCamera()
  const landed = landedAt(plan, s)
  const lookRef = useRef(look)
  const paint = useRef<() => void>(() => {})

  /* One frame: the line, the vehicle, the camera. Kept current before any effect runs. */
  useLayoutEffect(() => {
    lookRef.current = look
    paint.current = () => {
      const v = Math.max(0, Math.min(path.length, dist.get()))
      const el = routeRef.current
      if (el) {
        el.style.strokeDasharray = `${path.length} ${path.length}`
        el.style.strokeDashoffset = String(path.length - v)
      }
      let p = geo.start
      let angle = 90
      if (el && path.length > 0) {
        try {
          const a = el.getPointAtLength(v)
          const b = el.getPointAtLength(Math.min(path.length, v + 2))
          const c = v + 2 > path.length ? el.getPointAtLength(Math.max(0, v - 2)) : null
          p = { x: a.x, y: a.y }
          angle = c ? (Math.atan2(a.y - c.y, a.x - c.x) * 180) / Math.PI : (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
        } catch {
          /* Not laid out yet. */
        }
      }
      carRef.current?.setAttribute('transform', `translate(${p.x} ${p.y}) rotate(${angle + 90})`)
      if (!lookRef.current) {
        cam.fx.set(p.x)
        cam.fy.set(p.y)
      }
      const w = worldRef.current
      if (w) {
        const f = frame(cam, geo.W, geo.H, geo.W, geo.H)
        w.style.transform = `translate(${f.x}px, ${f.y}px) scale(${f.z})`
      }
    }
  })
  useEffect(() => {
    const go = () => paint.current()
    const u = [dist.on('change', go), cam.zoom.on('change', go), cam.fx.on('change', go), cam.fy.on('change', go)]
    return () => u.forEach((f) => f())
  }, [dist, cam])

  /* A new run starts at the start; the camera comes close as it sets off. */
  useLayoutEffect(() => {
    dist.jump(instant ? tipAlong(plan, s, geo, path) : 0)
    cam.zoom.jump(1)
    paint.current()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a new run only
  }, [runKey])

  /* The tip goes where step `s` is, in the step's own time. */
  const target = tipAlong(plan, s, geo, path)
  useEffect(() => {
    /* The route only ever grows: anything that would take it back (a run beginning again) jumps. */
    if (instant || !animate || target < dist.get() - 0.5) {
      dist.jump(target)
      paint.current()
      return
    }
    const ms = Math.max(160, stepMs(plan, s) * 0.92)
    const c = animate_(dist, target, ms / 1000)
    return () => c.stop()
  }, [target, instant, animate, plan, s, dist])

  /* The camera: close while the engine drives; the whole route once it lands; on what is pressed after. */
  useEffect(() => {
    const ride = animate && !instant && !landed
    const z = look ? LOOK_ZOOM : ride ? RIDE_ZOOM : 1
    if (look) {
      if (instant) {
        cam.fx.jump(look.x)
        cam.fy.jump(look.y)
      } else {
        animate_(cam.fx, look.x, 0.7)
        animate_(cam.fy, look.y, 0.7)
      }
    }
    if (instant) {
      cam.zoom.jump(z)
      paint.current()
      return
    }
    const c = animate_(cam.zoom, z, landed && !look ? 0.9 : 0.7)
    return () => c.stop()
  }, [look, animate, instant, landed, cam, runKey])

  /* The geometry changed under a settled map (a wider canvas): paint again. */
  useLayoutEffect(() => {
    paint.current()
  }, [geo, path])

  /* Drive it again: the vehicle from the start along the whole route, the camera riding, then back to the whole route. Local, and it stops. */
  const done = useRef(onReplayed)
  useLayoutEffect(() => {
    done.current = onReplayed
  })
  useEffect(() => {
    if (!replay || !landed) return
    if (instant) {
      done.current()
      return
    }
    dist.jump(0)
    cam.fx.jump(geo.start.x)
    cam.fy.jump(geo.start.y)
    paint.current()
    const z = animate_(cam.zoom, RIDE_ZOOM, 0.5)
    const secs = Math.min(4.2, Math.max(2.2, path.length / 300))
    const c = tween(dist, path.length, {
      duration: secs,
      ease: [0.45, 0, 0.25, 1],
      onComplete: () => {
        animate_(cam.zoom, 1, 0.9)
        done.current()
      },
    })
    return () => {
      z.stop()
      c.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- each press replays once
  }, [replay])

  return { dist, cam }
}

function animate_(mv: MotionValue<number>, to: number, duration: number) {
  return tween(mv, to, { duration, ease: EASE })
}
