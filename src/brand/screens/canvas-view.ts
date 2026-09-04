import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'

/* -----------------------------------------------------------------------------
   A pan-and-zoom viewport, without the thing being viewed.

   Lifted out of the board's stage so the condition canvas can be a canvas
   without writing a second one. The two surfaces show different things — an
   ordered chain of rules, and one rule's predicate as a graph — but the
   viewport is the same object in both: a world moved by one transform, a dot
   grid that follows it, a wheel that zooms about the cursor, a drag that pans,
   and a Fit that measures.

   The rules this file exists to preserve, all of them learned on the board:

   **The view is a ref, never state.** It used to be state, so a pan wrote it on
   every pointermove and a wheel on every tick. Each write re-rendered the host,
   which re-rendered every card, and the cards carry Motion `layout` — so Motion
   measured and re-projected the whole chain twice a frame to move a background.
   Nothing branches on the view: its only readers are one transform, three
   custom properties and a percentage. So it lives here and is written straight
   to the DOM, one batched write per animation frame.

   **The host still seeds the transform during render** from `viewRef.current`,
   which keeps this self-healing — a re-render for any other reason repaints the
   current view rather than reverting to a stale one.

   **Glide, do not jump.** A jump from 77% to 100% gives no sense of which way
   the canvas went. Cubic ease-out and no spring: a spring overshoots, and an
   overshoot on a whole canvas reads as a wobble rather than as life.

   What is NOT in here is the part that differs: what the world contains, how
   wide it is, and what counts as background. Those come in through `opts`.
   -------------------------------------------------------------------------- */

export interface View {
  x: number
  y: number
  z: number
}

/* Read once, at module load. Every glide checks it, and a canvas that animates
   when somebody has asked it not to is worse than one that never animated. */
const REDUCED =
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : ({ matches: false } as MediaQueryList)

export interface CanvasViewOpts {
  /* The world's unscaled content box.

     Measured by the host rather than here, because "how big is the thing"
     is the one question this file cannot answer generically. The board reads
     `world.offsetWidth`, which is honest only because its chain is ordinary
     flow layout — a bounding rect would return the width AT the current zoom
     and Fit would converge on whatever it already was. */
  bounds: () => { w: number; h: number }
  /* What the host's own floating panels take out of the stage.

     The board reaches for `.bb__insp` — the only place its canvas code looked
     outside its own subtree — so an unmodified lift would have carried board
     class names into every reuse. It comes in as a callback instead, evaluated
     at the moment Fit runs, which is also what keeps it correct during a
     drag of the panel's edge. */
  reserve?: () => { right: number; bottom: number }
  /* A chain fits its WIDTH and is panned down: fitted to the height of a
     laptop screen, eight rules are eight unreadable cards. A graph is short and
     wide and wants both axes. */
  axis?: 'width' | 'both'
  /** Which elements the background drag may start on. */
  isPannableTarget: (t: HTMLElement) => boolean
  /** A press that did not become a drag, on the background. */
  onBackgroundClick?: () => void
  zMin?: number
  zMax?: number
  /* The prefix for the three custom properties the dot grid follows. The board
     was already shipping `--bb-x/y/z` in its stylesheet, so this is how it
     keeps them rather than renaming a working background. */
  cssPrefix?: string
  /** Width to hold back on the opening Fit, for a panel not yet on screen. */
  reserveOnOpen?: number
  /** Padding kept around the world when fitting. */
  pad?: number
}

export function useCanvasView(
  stage: RefObject<HTMLDivElement | null>,
  world: RefObject<HTMLDivElement | null>,
  opts: CanvasViewOpts,
) {
  const { axis = 'width', zMin = 0.5, zMax = 1.4, cssPrefix = 'cv', reserveOnOpen = 0, pad = 40 } = opts

  /* Everything the frame loop reads goes through a ref.

     The callbacks below are memoised on `paint` alone so that a host which
     re-renders — and the board re-renders on rules, selection and drag slots —
     does not re-register the wheel listener or re-create the pan handlers. The
     options change on every render because hosts pass inline closures, so they
     are read through here rather than captured. */
  const o = useRef(opts)
  o.current = opts

  const viewRef = useRef<View>({ x: 80, y: 24, z: 1 })
  const zoomLabel = useRef<HTMLSpanElement | null>(null)
  const frame = useRef(0)
  const glideFrame = useRef(0)
  const [panning, setPanning] = useState(false)
  const pan = useRef<{ px: number; py: number; x: number; y: number } | null>(null)

  const clampView = useCallback(
    (v: View): View => ({ ...v, z: Math.min(o.current.zMax ?? zMax, Math.max(o.current.zMin ?? zMin, v.z)) }),
    [zMax, zMin],
  )

  const paint = useCallback(() => {
    frame.current = 0
    const w = world.current
    const s = stage.current
    if (!w || !s) return
    const v = viewRef.current
    /* translate3d, not translate: it keeps the world on its own compositor
       layer, so a pan is a layer move rather than a repaint of every node. */
    w.style.transform = `translate3d(${v.x}px, ${v.y}px, 0) scale(${v.z})`
    const p = o.current.cssPrefix ?? cssPrefix
    s.style.setProperty(`--${p}-x`, `${v.x}px`)
    s.style.setProperty(`--${p}-y`, `${v.y}px`)
    s.style.setProperty(`--${p}-z`, `${v.z}`)
    if (zoomLabel.current) zoomLabel.current.textContent = `${Math.round(v.z * 100)}%`
  }, [cssPrefix, stage, world])

  const apply = useCallback(
    (next: (v: View) => View) => {
      cancelAnimationFrame(glideFrame.current)
      viewRef.current = clampView(next(viewRef.current))
      if (!frame.current) frame.current = requestAnimationFrame(paint)
    },
    [clampView, paint],
  )

  const glide = useCallback(
    (to: Partial<View>, ms = 240) => {
      cancelAnimationFrame(glideFrame.current)
      const from = { ...viewRef.current }
      const target = clampView({ ...from, ...to })
      if (REDUCED.matches || ms === 0) {
        viewRef.current = target
        paint()
        return
      }
      const t0 = performance.now()
      const tick = (t: number) => {
        const p = Math.min(1, (t - t0) / ms)
        const e = 1 - Math.pow(1 - p, 3)
        viewRef.current = {
          x: from.x + (target.x - from.x) * e,
          y: from.y + (target.y - from.y) * e,
          z: from.z + (target.z - from.z) * e,
        }
        paint()
        if (p < 1) glideFrame.current = requestAnimationFrame(tick)
      }
      glideFrame.current = requestAnimationFrame(tick)
    },
    [clampView, paint],
  )

  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current)
      cancelAnimationFrame(glideFrame.current)
    },
    [],
  )

  /* --- Fit ----------------------------------------------------------------- */
  const fitTo = useCallback(
    (ms: number, openingReserve = 0) => {
      const s = stage.current
      if (!s) return
      const { w: ww, h: wh } = o.current.bounds()
      if (!ww) return
      const held = o.current.reserve?.() ?? { right: 0, bottom: 0 }
      /* `openingReserve` is the panel that is not there YET.

         Measuring is right for the Fit button — it fits what is on screen. It
         is wrong once, on mount, when the host opens with its panel closed and
         the first click puts one over what was just centred without it. */
      const right = held.right || openingReserve
      const sw = s.clientWidth - right
      const sh = s.clientHeight - held.bottom
      const p = o.current.pad ?? pad
      const byW = (sw - p) / ww
      const z = Math.min(
        1,
        Math.max(
          o.current.zMin ?? zMin,
          (o.current.axis ?? axis) === 'both' && wh ? Math.min(byW, (sh - p) / wh) : byW,
        ),
      )
      glide(
        {
          x: Math.max(0, (sw - ww * z) / 2),
          /* A chain is read from the top and panned down, so fitting its width
             pins y at 0. A graph fitted on both axes is centred. */
          y: (o.current.axis ?? axis) === 'both' && wh ? Math.max(0, (sh - wh * z) / 2) : 0,
          z,
        },
        ms,
      )
    },
    [axis, glide, pad, stage, zMin],
  )

  const fit = useCallback(() => fitTo(280), [fitTo])

  useLayoutEffect(() => {
    // Once, on mount, and instantly — an opening animation on the first paint
    // is a canvas that arrives late rather than one that arrives.
    const id = requestAnimationFrame(() => fitTo(0, reserveOnOpen))
    return () => cancelAnimationFrame(id)
    // Mount only. `reserveOnOpen` is a panel width the host can change, but
    // this effect is the opening frame and must not re-run for that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* --- Keeping focus inside the stage ---------------------------------------

     The stage is `overflow: clip` so the browser cannot scroll a focused node
     into view — which is what it used to do on the board, taking every floating
     toolbar out of the viewport with no way back. That leaves the job here,
     where it is done to the VIEW rather than to a scroll offset, so Fit and the
     zoom readout still describe what is on screen afterwards.

     Only the axis actually out of range moves, and only far enough to clear the
     edge: a keyboard walk should feel like the canvas keeping up, not like it
     re-centring on every Tab. */
  useEffect(() => {
    const s = stage.current
    if (!s) return
    const onFocusIn = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null
      if (!el || !s.contains(el)) return
      const r = el.getBoundingClientRect()
      const box = s.getBoundingClientRect()
      const edge = 24
      let dx = 0
      let dy = 0
      if (r.top < box.top + edge) dy = box.top + edge - r.top
      else if (r.bottom > box.bottom - edge) dy = box.bottom - edge - r.bottom
      if (r.left < box.left + edge) dx = box.left + edge - r.left
      else if (r.right > box.right - edge) dx = box.right - edge - r.right
      if (!dx && !dy) return
      const v = viewRef.current
      glide({ x: v.x + dx, y: v.y + dy }, 180)
    }
    s.addEventListener('focusin', onFocusIn)
    return () => s.removeEventListener('focusin', onFocusIn)
  }, [glide, stage])

  /* --- Pan ----------------------------------------------------------------- */
  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return
      if (!o.current.isPannableTarget(e.target as HTMLElement)) return
      const v = viewRef.current
      pan.current = { px: e.clientX, py: e.clientY, x: v.x, y: v.y }
      setPanning(true)
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    },
    [],
  )

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const p = pan.current
      if (!p) return
      apply((v) => ({ ...v, x: p.x + (e.clientX - p.px), y: p.y + (e.clientY - p.py) }))
    },
    [apply],
  )

  const onPointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const p = pan.current
    if (!p) return
    pan.current = null
    setPanning(false)
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      /* already released */
    }
    /* A click on the background, not a drag. Measured as "did not move". */
    const moved = Math.hypot(e.clientX - p.px, e.clientY - p.py) > 3
    if (!moved) o.current.onBackgroundClick?.()
  }, [])

  /* --- Zoom, about the cursor. Non-passive so the page does not scroll. ---- */
  useEffect(() => {
    const s = stage.current
    if (!s) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        const r = s.getBoundingClientRect()
        const px = e.clientX - r.left
        const py = e.clientY - r.top
        apply((v) => {
          /* Exponential, and clamped per event.

             It was `1 - deltaY * 0.0018` applied straight. A trackpad pinch
             emits deltas in the hundreds, so one event could ask for a factor
             near zero or a negative scale, and the canvas snapped. `exp` keeps
             zooming in and out symmetrical — the same gesture reversed lands
             back where it started — and the clamp caps any single event at
             ±12%, which is the difference between a ramp and a jump. */
          const k = Math.min(1.12, Math.max(0.89, Math.exp(-e.deltaY * 0.0018)))
          const z = Math.min(o.current.zMax ?? zMax, Math.max(o.current.zMin ?? zMin, v.z * k))
          const kk = z / v.z
          return { x: px - (px - v.x) * kk, y: py - (py - v.y) * kk, z }
        })
      } else {
        /* Shift turns a vertical wheel into a horizontal pan, which is what
           every canvas does and what a mouse with one wheel needs. */
        const dx = e.shiftKey ? e.deltaY : e.deltaX
        const dy = e.shiftKey ? 0 : e.deltaY
        apply((v) => ({ ...v, x: v.x - dx, y: v.y - dy }))
      }
    }
    s.addEventListener('wheel', onWheel, { passive: false })
    return () => s.removeEventListener('wheel', onWheel)
  }, [apply, stage, zMax, zMin])

  const zoomBy = useCallback(
    (k: number) => {
      const s = stage.current
      if (!s) return
      const px = s.clientWidth / 2
      const py = s.clientHeight / 2
      const v = viewRef.current
      const z = Math.min(o.current.zMax ?? zMax, Math.max(o.current.zMin ?? zMin, v.z * k))
      const kk = z / v.z
      glide({ x: px - (px - v.x) * kk, y: py - (py - v.y) * kk, z }, 200)
    },
    [glide, stage, zMax, zMin],
  )

  return { viewRef, zoomLabel, panning, paint, apply, glide, fit, fitTo, zoomBy, onPointerDown, onPointerMove, onPointerUp }
}
