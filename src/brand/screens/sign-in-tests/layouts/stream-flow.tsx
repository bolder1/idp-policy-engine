import { useEffect, useLayoutEffect, useRef } from 'react'

import type { Pt } from './stream-geometry'
import type { Sampled } from './stream-path'

/* -----------------------------------------------------------------------------
   The stream itself (StreamLayout.tsx): one canvas over the world, a ribbon
   along the route as far as the engine has reached and the particles flowing
   in it — blue while the engine works, the outcome's colour once it lands —
   and, at the gate being tested, a few that glance off it (a policy that
   does not cover the person) or press against it (a rule being read).

   requestAnimationFrame only while something moves: a run playing, the
   stream draining into its pool once it lands (then the particles fade and
   the loop stops), or a local re-pour. Settled, and under reduced motion,
   one still frame: the route as a solid lit ribbon. ≤ 240 particles.
   Colours are read from the layout's own custom properties (light or dark
   stage) through hidden swatches, never written here.
   -------------------------------------------------------------------------- */

export type FlowMode = 'idle' | 'work' | 'landed'
export type FlowTone = 'positive' | 'negative' | 'notice' | 'neutral'

export interface FlowProps {
  width: number
  height: number
  route: Sampled
  /** How far along the route the stream has reached (px). */
  reach: number
  /** How long the front takes to get there (the step's own length). */
  reachMs: number
  /** The gate being tested now, as its stub (from the trunk to the gate), and how. */
  probe: { pts: readonly Pt[]; kind: 'glance' | 'press' } | null
  mode: FlowMode
  tone: FlowTone
  /** Motion allowed (a run playing, not reduced, not skipped). */
  animate: boolean
  /** A new run, a what-if, a re-pour: the stream starts over from the source. */
  pour: string
  /** Re-read the colours (the stage changed). */
  theme: string
}

interface Inks {
  work: string
  tone: Record<FlowTone, string>
}

const SPEED = 170
const DRAIN_MS = 1500
const FADE_MS = 500
const MAX_PARTICLES = 240

function readInks(host: HTMLElement | null): Inks {
  const fallback = '#888'
  const of = (cls: string) => {
    const el = host?.querySelector<HTMLElement>(`.rl-stream__ink.is-${cls}`)
    return el ? getComputedStyle(el).color || fallback : fallback
  }
  return { work: of('work'), tone: { positive: of('positive'), negative: of('negative'), notice: of('notice'), neutral: of('neutral') } }
}

const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3)

export function StreamFlow(props: FlowProps) {
  const { width, height } = props
  const canvas = useRef<HTMLCanvasElement | null>(null)
  const live = useRef(props)
  live.current = props
  /* The front: where it is, and the glide to where the engine has reached. */
  const front = useRef({ now: 0, from: 0, to: 0, t0: 0, dur: 1 })
  const landedAt = useRef<number | null>(null)
  const raf = useRef(0)
  const inks = useRef<Inks | null>(null)
  const seeds = useRef<{ o: number; v: number; ph: number; r: number }[]>([])

  const draw = (now: number): boolean => {
    const c = canvas.current
    const p = live.current
    if (!c) return false
    const ctx = c.getContext('2d')
    if (!ctx) return false
    const ink = (inks.current ??= readInks(c.parentElement))
    const dpr = c.width / Math.max(1, p.width)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, p.width, p.height)
    const { xs, ys, total } = p.route
    if (total <= 0) return false

    /* The front glides to its target in the step's time. */
    const f = front.current
    if (f.to !== Math.min(p.reach, total)) {
      f.from = f.now
      f.to = Math.min(p.reach, total)
      f.t0 = now
      f.dur = Math.max(160, p.reachMs * 0.85)
    }
    f.now = p.animate ? f.from + (f.to - f.from) * ease((now - f.t0) / f.dur) : f.to
    const reach = Math.max(0, Math.min(total, f.now))
    const moving = p.animate && Math.abs(f.now - f.to) > 0.5

    const landed = p.mode === 'landed'
    if (landed && landedAt.current === null && !moving) landedAt.current = now
    if (!landed) landedAt.current = null
    const since = landedAt.current === null ? 0 : now - landedAt.current
    const settled = landed && (!p.animate || since > DRAIN_MS + FADE_MS)
    const color = landed ? ink.tone[p.tone] : ink.work

    /* The ribbon, as far as the stream has reached: faint while it works, solid once it lands. */
    const n = Math.floor(reach)
    if (n > 1) {
      const path = () => {
        ctx.beginPath()
        ctx.moveTo(xs[0], ys[0])
        for (let L = 3; L < n; L += 3) ctx.lineTo(xs[L], ys[L])
        ctx.lineTo(xs[n], ys[n])
      }
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = color
      const k = landed ? Math.min(1, p.animate ? since / 600 : 1) : 0
      path()
      ctx.globalAlpha = 0.12 + 0.06 * k
      ctx.lineWidth = 10
      ctx.stroke()
      path()
      ctx.globalAlpha = 0.4 + 0.6 * k
      ctx.lineWidth = 2 + k
      ctx.stroke()
      ctx.globalAlpha = 1
    }
    if (settled || !p.animate) return false

    /* The particles, flowing from the source to the front. */
    const t = now / 1000
    const fade = landed ? 1 - Math.min(1, Math.max(0, (since - DRAIN_MS) / FADE_MS)) : 1
    ctx.fillStyle = color
    const cycle = total + 60
    for (const s of seeds.current) {
      const L = (s.o + s.v * t) % cycle
      if (L > reach - 1) continue
      const i = Math.floor(L)
      const j = Math.min(total, i + 2)
      const tx = xs[j] - xs[i]
      const ty = ys[j] - ys[i]
      const tl = Math.hypot(tx, ty) || 1
      const wob = Math.sin(s.ph + t * 4) * 1.8
      const x = xs[i] - (ty / tl) * wob
      const y = ys[i] + (tx / tl) * wob
      const edge = Math.min(1, L / 24, (reach - L) / 18)
      ctx.globalAlpha = Math.max(0, 0.85 * edge * fade)
      ctx.beginPath()
      ctx.arc(x, y, s.r, 0, Math.PI * 2)
      ctx.fill()
    }
    /* The front, while it is out there working: a soft head. */
    if (!landed && reach > 2) {
      ctx.globalAlpha = 0.22
      ctx.beginPath()
      ctx.arc(xs[n], ys[n], 6, 0, Math.PI * 2)
      ctx.fill()
    }

    /* The gate being tested: particles glance off a shut policy gate, press against a rule's. */
    const pr = p.probe
    if (pr && !landed && pr.pts.length >= 2) {
      const a = pr.pts[0]
      const b = pr.pts[pr.pts.length - 1]
      const M = 16
      for (let q = 0; q < M; q++) {
        const u = (t * (pr.kind === 'glance' ? 1.1 : 0.8) + q / M) % 1
        let along: number
        let off = 0
        let alpha = 0.85
        if (pr.kind === 'glance') {
          if (u < 0.55) along = u / 0.55
          else {
            const k = (u - 0.55) / 0.45
            along = 1 - k * 0.6
            off = (q % 2 ? 1 : -1) * k * (6 + (q % 3) * 3)
            alpha = 0.85 * (1 - k)
          }
        } else {
          along = 0.35 + 0.65 * ease(u * 1.6)
          off = Math.sin(q * 1.7 + t * 9) * (1 + along * 2.4)
          alpha = 0.5 + 0.4 * along
        }
        ctx.globalAlpha = alpha
        ctx.beginPath()
        ctx.arc(a.x + (b.x - a.x) * along, a.y + (b.y - a.y) * along + off, 1.7, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.globalAlpha = 1
    return true
  }

  /* Seeds for the particles: spaced along the route, a little uneven. */
  useLayoutEffect(() => {
    const total = props.route.total
    const count = Math.min(MAX_PARTICLES, Math.max(24, Math.floor(total / 7)))
    const cycle = total + 60
    seeds.current = Array.from({ length: count }, (_, i) => ({
      o: (i / count) * cycle + Math.random() * 6,
      v: SPEED * (0.92 + Math.random() * 0.16),
      ph: Math.random() * Math.PI * 2,
      r: 1.4 + Math.random() * 1.1,
    }))
  }, [props.route])

  /* A new pour: the front back at the source. */
  useLayoutEffect(() => {
    front.current = { now: 0, from: 0, to: 0, t0: performance.now(), dur: 1 }
    landedAt.current = null
  }, [props.pour])

  /* The stage changed: read the inks again. */
  useLayoutEffect(() => {
    inks.current = null
  }, [props.theme])

  /* The canvas at the device's pixels. */
  useLayoutEffect(() => {
    const c = canvas.current
    if (!c) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    c.width = Math.max(1, Math.round(width * dpr))
    c.height = Math.max(1, Math.round(height * dpr))
  }, [width, height])

  /* Draw: a loop while it moves, one frame when it is still. */
  useEffect(() => {
    let stopped = false
    const tick = (now: number) => {
      if (stopped) return
      const more = draw(now)
      if (more) raf.current = window.requestAnimationFrame(tick)
    }
    window.cancelAnimationFrame(raf.current)
    raf.current = window.requestAnimationFrame(tick)
    return () => {
      stopped = true
      window.cancelAnimationFrame(raf.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- every prop change redraws or restarts the loop
  }, [props.reach, props.mode, props.tone, props.animate, props.pour, props.theme, props.route, props.probe, width, height])

  return <canvas ref={canvas} className="rl-stream__flow" style={{ width, height }} aria-hidden />
}
