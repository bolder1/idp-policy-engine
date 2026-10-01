import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'

import { laneFit, type Orientation } from './journey'

/* -----------------------------------------------------------------------------
   Which orientation a canvas can hold (TESTING-V4 §11.1): the three lanes side
   by side while the canvas is wide enough for them, one column below that
   (journey.ts `laneFit`, with its hysteresis, so a canvas resizing near the
   edge never flaps).

   Measured on the canvas (`.tj-canvas`), never the scroller inside it: the
   scroller's scrollbar comes and goes with what it holds, and would feed the
   answer back into the question. Before the first frame is painted, so a
   narrow canvas never shows the lanes side by side for a frame. The element
   may change under the same ref (the page's Stage 0 canvas, then the
   journey's): it is watched again when it does.

   Not used by the Sign-in tests page since §12.3 (30 Sep): the page is always
   vertical. Kept with the renderer's orientation support, for the policy
   builder's canvas.
   -------------------------------------------------------------------------- */

export function useLaneFit(ref: RefObject<HTMLElement | null>, initial: Orientation = 'horizontal'): Orientation {
  const [orientation, setOrientation] = useState<Orientation>(initial)
  const watched = useRef<HTMLElement | null>(null)
  const observer = useRef<ResizeObserver | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (el === watched.current) return
    watched.current = el
    observer.current?.disconnect()
    observer.current = null
    if (!el) return
    const fit = () => setOrientation((prev) => laneFit(el.clientWidth, prev))
    fit()
    if (typeof ResizeObserver === 'undefined') return
    const o = new ResizeObserver(fit)
    o.observe(el)
    observer.current = o
  })

  useEffect(
    () => () => {
      observer.current?.disconnect()
      observer.current = null
      watched.current = null
    },
    [],
  )

  return orientation
}
