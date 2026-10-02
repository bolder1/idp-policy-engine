import { animate, type AnimationPlaybackControls } from 'motion/react'
import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode, type Ref } from 'react'
import { Maximize, ZoomIn, ZoomOut } from 'lucide-react'

import { Tip } from '../../../kit'
import './run-stage.css'

/* -----------------------------------------------------------------------------
   The ground every layout of the run stands on (run-layout.ts): the builder's
   canvas, as the column's is — no scrollbar, a drag on the ground pans, the
   wheel pans, Ctrl/⌘ with the wheel (a pinch) zooms about the pointer — and
   the builder's view dock under it: whatever the layout adds, then Fit and
   zoom out and in.

   The world is drawn at its natural size and scaled by a CSS `zoom`, so its
   scroll extents follow the scale; the room around it — the engine line over
   it, the dock under it, a margin each side — is the scroller's own padding,
   which no zoom shrinks. A world smaller than the view sits in its middle.

   A layout drives the view through its handle (`ref`):
     fit()         the whole world in view, zoomed out as far as `min`, never
                   past `max` (1 by default: words keep their size)
     follow(el)    the element brought into view, one glide of the scroll —
                   where the engine is working, as a run plays
     zoomBy(k), zoomTo(z), zoom()
                   the dock's zoom, for a layout that docks its own
                   (`externalDock`, the assistant dock: assistant/), which
                   hears the zoom through `onZoom` and is drawn over the
                   stage through `overlay`
   A press or the wheel on the ground stops any glide. Reduced motion jumps.
   The ground's dots follow the pan and the zoom (`--bb-x`, `--bb-y`, `--bb-z`
   on the region), as the builder's do.
   -------------------------------------------------------------------------- */

export interface FitOptions {
  /** The least zoom fit may use. Default the dock's least, 0.5. */
  min?: number
  /** The most. Default 1: fitting never enlarges past the words' size. */
  max?: number
  /** Jump, no glide. */
  jump?: boolean
}

export interface FollowOptions {
  /** Where across the view the element lands: 0 its left edge at the view's left, 0.5 centred. Default 0.5. */
  x?: number
  /** Where down the view: 0 top, 0.5 centred. Default 0.5. */
  y?: number
  /** Only move when the element is not already wholly in view. Default true. */
  lazy?: boolean
  jump?: boolean
}

export interface StageView {
  fit: (opts?: FitOptions) => void
  follow: (el: Element | null | undefined, opts?: FollowOptions) => void
  /** The zoom on screen. */
  zoom: () => number
  /** Zoom by a factor about the view's middle (one short glide; a jump under reduced motion), within ZOOM_MIN–ZOOM_MAX. */
  zoomBy: (k: number) => void
  /** Zoom to a level about the view's middle, likewise. */
  zoomTo: (z: number) => void
}

/** The dock's zoom range and step: an outside dock (`externalDock`) disables its buttons at the ends. */
export const ZOOM_MIN = 0.5
export const ZOOM_MAX = 1.4
export const ZOOM_STEP = 1.15
const clamp = (z: number, lo = ZOOM_MIN, hi = ZOOM_MAX) => Math.round(Math.min(hi, Math.max(lo, z)) * 100) / 100
const GLIDE = { duration: 0.6, ease: [0.4, 0, 0.2, 1] as const }

/* What a drag never starts on: anything pressed, typed in or read — a card,
   a control. Only the ground between and around them pans. */
const NO_PAN = 'button, a, input, select, textarea, label, [role="button"], [contenteditable], [data-card], .bb__card, .tj-out, .tj-engine'

export interface RunStageProps {
  children: ReactNode
  reduced: boolean
  /** The handle a layout drives the view by. */
  ref?: Ref<StageView>
  className?: string
  /** What the layout adds to the dock, before Fit — Expand all, say. */
  dock?: ReactNode
  /** The room around the world, unzoomed (px): over it the engine line, under it the dock. */
  pad?: { top?: number; right?: number; bottom?: number; left?: number }
  /** The stage's accessible name. */
  label?: string
  /** The layout draws its own dock (the assistant dock): the stage's is not drawn; drive zoom and fit through the handle. */
  externalDock?: boolean
  /** Drawn over the stage, outside the zoomed world (an outside dock): positioned by its own CSS against the stage. */
  overlay?: ReactNode
  /** The zoom on screen, each time it settles (a glide's end, a wheel step, fit, the dock). */
  onZoom?: (z: number) => void
}

export function RunStage({ children, reduced, ref, className = '', dock, pad, label = 'Sign-in run', externalDock = false, overlay, onZoom }: RunStageProps) {
  const root = useRef<HTMLDivElement | null>(null)
  const scroller = useRef<HTMLDivElement | null>(null)
  const world = useRef<HTMLDivElement | null>(null)
  const zoomNow = useRef(1)
  const [zoom, setZoom] = useState(1)
  const glide = useRef<AnimationPlaybackControls | null>(null)
  const P = { top: pad?.top ?? 64, right: pad?.right ?? 48, bottom: pad?.bottom ?? 76, left: pad?.left ?? 48 }

  /* The ground's dots, with the view. */
  const paintGround = useCallback(() => {
    const sc = scroller.current
    const region = root.current?.closest<HTMLElement>('.bb')
    if (!sc || !region) return
    region.style.setProperty('--bb-x', `${-sc.scrollLeft}px`)
    region.style.setProperty('--bb-y', `${-sc.scrollTop}px`)
    region.style.setProperty('--bb-z', String(zoomNow.current))
  }, [])
  useEffect(() => {
    const region = root.current?.closest<HTMLElement>('.bb')
    return () => {
      region?.style.removeProperty('--bb-x')
      region?.style.removeProperty('--bb-y')
      region?.style.setProperty('--bb-z', '1')
    }
  }, [])

  /* One frame of a zoom about a point (client px), the point kept still. */
  const applyZoom = useCallback(
    (z: number, at: { x: number; y: number } | null) => {
      const z0 = zoomNow.current
      zoomNow.current = z
      world.current?.style.setProperty('zoom', String(z))
      const sc = scroller.current
      if (sc && at && z0 !== z) {
        const r = sc.getBoundingClientRect()
        const px = at.x - r.left
        const py = at.y - r.top
        const k = z / z0
        sc.scrollLeft = Math.max(0, (sc.scrollLeft + px - P.left) * k + P.left - px)
        sc.scrollTop = Math.max(0, (sc.scrollTop + py - P.top) * k + P.top - py)
      }
      paintGround()
    },
    [P.left, P.top, paintGround],
  )
  const stop = useCallback(() => {
    if (!glide.current) return
    glide.current.stop()
    glide.current = null
    setZoom(zoomNow.current)
  }, [])
  useEffect(() => () => glide.current?.stop(), [])

  /* The zoom and the scroll in one glide (a jump under reduced motion). */
  const glideTo = useCallback(
    (z1: number, left1: number | null, top1: number | null, jump = false) => {
      const sc = scroller.current
      if (!sc) return
      glide.current?.stop()
      glide.current = null
      const z0 = zoomNow.current
      const l0 = sc.scrollLeft
      const t0 = sc.scrollTop
      /* Where the scroll must go is known only at the new zoom: measure there, then glide from here. */
      applyZoom(z1, null)
      const maxL = Math.max(0, sc.scrollWidth - sc.clientWidth)
      const maxT = Math.max(0, sc.scrollHeight - sc.clientHeight)
      const l1 = left1 === null ? Math.min(l0, maxL) : Math.min(maxL, Math.max(0, Math.round(left1)))
      const t1 = top1 === null ? Math.min(t0, maxT) : Math.min(maxT, Math.max(0, Math.round(top1)))
      if (jump || reduced || (Math.abs(z1 - z0) < 0.005 && Math.abs(l1 - l0) < 2 && Math.abs(t1 - t0) < 2)) {
        sc.scrollLeft = l1
        sc.scrollTop = t1
        setZoom(z1)
        paintGround()
        return
      }
      applyZoom(z0, null)
      sc.scrollLeft = l0
      sc.scrollTop = t0
      glide.current = animate(0, 1, {
        ...GLIDE,
        onUpdate: (k) => {
          applyZoom(z0 + (z1 - z0) * k, null)
          sc.scrollLeft = l0 + (l1 - l0) * k
          sc.scrollTop = t0 + (t1 - t0) * k
          paintGround()
        },
        onComplete: () => {
          glide.current = null
          setZoom(z1)
        },
      })
    },
    [applyZoom, paintGround, reduced],
  )

  /* The world's natural size and an element's box in it, at zoom 1. */
  const natural = useCallback(() => {
    const w = world.current
    if (!w) return null
    const r = w.getBoundingClientRect()
    const z = zoomNow.current || 1
    return { width: r.width / z, height: r.height / z, rect: r }
  }, [])

  const fit = useCallback(
    (opts: FitOptions = {}) => {
      const sc = scroller.current
      const n = natural()
      if (!sc || !n || n.width <= 0 || n.height <= 0) return
      const roomW = sc.clientWidth - P.left - P.right
      const roomH = sc.clientHeight - P.top - P.bottom
      if (roomW <= 0 || roomH <= 0) return
      const z = clamp(Math.min(opts.max ?? 1, roomW / n.width, roomH / n.height), opts.min ?? ZOOM_MIN, ZOOM_MAX)
      /* At that zoom, the world's middle at the view's middle (it sits there by itself when it fits). */
      const left = P.left + (n.width * z) / 2 - (P.left + roomW / 2)
      const top = P.top + (n.height * z) / 2 - (P.top + roomH / 2)
      glideTo(z, left, top, opts.jump)
    },
    [P.bottom, P.left, P.right, P.top, glideTo, natural],
  )

  const follow = useCallback(
    (el: Element | null | undefined, opts: FollowOptions = {}) => {
      const sc = scroller.current
      const n = natural()
      if (!sc || !n || !el) return
      const z = zoomNow.current || 1
      const e = el.getBoundingClientRect()
      const v = sc.getBoundingClientRect()
      /* Its box in the view now, and the room the view has between the engine line and the dock. */
      const inX = e.left >= v.left + P.left / 2 && e.right <= v.right - P.right / 2
      const inY = e.top >= v.top + P.top && e.bottom <= v.bottom - P.bottom
      if ((opts.lazy ?? true) && inX && inY) return
      const roomW = sc.clientWidth - P.left - P.right
      const roomH = sc.clientHeight - P.top - P.bottom
      const ax = opts.x ?? 0.5
      const ay = opts.y ?? 0.5
      /* The element's place in the scroll, at this zoom. */
      const ex = sc.scrollLeft + (e.left - v.left)
      const ey = sc.scrollTop + (e.top - v.top)
      const left = ax === 0 ? ex - P.left : ex + e.width / 2 - (P.left + roomW * ax)
      const top = ay === 0 ? ey - P.top : ey + e.height / 2 - (P.top + roomH * ay)
      glideTo(z, inX && (opts.lazy ?? true) ? null : left, inY && (opts.lazy ?? true) ? null : top, opts.jump)
    },
    [P.bottom, P.left, P.right, P.top, glideTo, natural],
  )

  /* The dock's zoom, about the view's middle. */
  const zoomTo = useCallback((z: number) => {
    const sc = scroller.current
    if (!sc || !Number.isFinite(z)) return
    const r = sc.getBoundingClientRect()
    const z1 = clamp(z)
    if (reduced) {
      applyZoom(z1, { x: r.left + r.width / 2, y: r.top + r.height / 2 })
      setZoom(z1)
      return
    }
    glide.current?.stop()
    const z0 = zoomNow.current
    const at = { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    glide.current = animate(z0, z1, {
      duration: 0.28,
      ease: [0.2, 0, 0, 1],
      onUpdate: (v) => applyZoom(v, at),
      onComplete: () => {
        glide.current = null
        setZoom(z1)
      },
    })
  }, [applyZoom, reduced])
  const zoomBy = useCallback((k: number) => zoomTo(zoomNow.current * k), [zoomTo])

  useImperativeHandle(ref, () => ({ fit, follow, zoom: () => zoomNow.current, zoomBy, zoomTo }), [fit, follow, zoomBy, zoomTo])

  /* The zoom, told once it settles. */
  const onZoomRef = useRef(onZoom)
  useLayoutEffect(() => {
    onZoomRef.current = onZoom
  }, [onZoom])
  useEffect(() => {
    onZoomRef.current?.(zoom)
  }, [zoom])

  /* Ctrl/⌘ + wheel zooms about the pointer; the wheel alone pans, natively. Not passive: the page's own zoom is what it stops. */
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      stop()
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      const z1 = clamp(zoomNow.current * Math.exp(-e.deltaY * 0.0025))
      applyZoom(z1, { x: e.clientX, y: e.clientY })
      setZoom(z1)
    }
    const onScroll = () => paintGround()
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('scroll', onScroll)
    }
  }, [applyZoom, paintGround, stop])
  useLayoutEffect(() => {
    world.current?.style.setProperty('zoom', String(zoomNow.current))
    paintGround()
  })

  /* A drag on the ground pans: a mouse's, from anywhere that is not a card or a control. Touch scrolls natively. */
  const drag = useRef<{ id: number; x: number; y: number; left: number; top: number } | null>(null)
  const [panning, setPanning] = useState(false)
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    stop()
    if (e.button !== 0 || e.pointerType !== 'mouse') return
    const sc = scroller.current
    const t = e.target
    if (!sc || !(t instanceof Element) || t.closest(NO_PAN)) return
    e.preventDefault()
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, left: sc.scrollLeft, top: sc.scrollTop }
    e.currentTarget.setPointerCapture(e.pointerId)
    setPanning(true)
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    const sc = scroller.current
    if (!d || d.id !== e.pointerId || !sc) return
    sc.scrollLeft = d.left - (e.clientX - d.x)
    sc.scrollTop = d.top - (e.clientY - d.y)
  }
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== e.pointerId) return
    drag.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    setPanning(false)
  }

  return (
    <div ref={root} className={`rstage${panning ? ' is-panning' : ''}${className ? ` ${className}` : ''}`}>
      <div
        ref={scroller}
        className="rstage__scroll"
        tabIndex={-1}
        aria-label={label}
        style={{ '--rs-pt': `${P.top}px`, '--rs-pr': `${P.right}px`, '--rs-pb': `${P.bottom}px`, '--rs-pl': `${P.left}px` } as CSSProperties}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div ref={world} className="rstage__world">
          {children}
        </div>
      </div>
      {overlay}
      {/* The builder's view dock: the layout's own controls, then fit and zoom — unless the layout docks its own. */}
      {!externalDock && <div className="bb__dock rstage__dock">
        <div className="bb__float bb__dockbar" role="toolbar" aria-label="View">
          {dock}
          {dock && <span className="bb__float__sep" />}
          <div className="bb__zoomgrp">
            <Tip text="Fit to view" placement="top">
              <button type="button" className="bb__act" aria-label="Fit to view" onClick={() => fit({ max: 1 })}>
                <Maximize size={14} strokeWidth={2} />
              </button>
            </Tip>
            <span className="bb__float__sep" />
            <Tip text="Zoom out" placement="top">
              <button type="button" className="bb__act" aria-label="Zoom out" disabled={zoom <= ZOOM_MIN} onClick={() => zoomBy(1 / ZOOM_STEP)}>
                <ZoomOut size={15} strokeWidth={2} />
              </button>
            </Tip>
            <Tip text="Zoom in" placement="top">
              <button type="button" className="bb__act" aria-label="Zoom in" disabled={zoom >= ZOOM_MAX} onClick={() => zoomBy(ZOOM_STEP)}>
                <ZoomIn size={15} strokeWidth={2} />
              </button>
            </Tip>
          </div>
        </div>
      </div>}
    </div>
  )
}
