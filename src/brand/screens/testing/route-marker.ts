/* -----------------------------------------------------------------------------
   The route marker's timing — one clock for the board's dot and the page's bar.

   The marker travels the route a sign-in takes: which policy, who, each rule
   it reached, the decision. That travel is the one piece of motion that
   explains something — the order the engine reads a policy in — so it has one
   budget everywhere it is drawn: at most 180 ms a hop, and at most 1.1 s for
   the whole route, however long the route is. Two layouts that timed it their
   own way would teach two speeds for one engine.

   It travels on three things only: opening, a sample or saved sign-in loaded,
   and Replay. Everything else — a typed address, a slider, an edit to the
   policy — moves it straight to where it lands, because motion while somebody
   types is motion they did not ask for.

   Kept apart from RouteMarker.tsx so it can be read without React, and so the
   component file exports only the component.
   -------------------------------------------------------------------------- */

/** One hop: at most 180 ms, and never more than 1.1 s for the route. */
export const hopMs = (hops: number): number => Math.min(180, Math.floor(1100 / Math.max(1, hops)))

/** The console's own standard curve (`--ease-standard`), as motion takes it. */
export const MARKER_EASE = [0.2, 0, 0, 1] as const

/** A stage on the bar's track: where it starts and how tall it is, in px from the track's top. */
export interface Stop {
  top: number
  height: number
}

/** The bar's keyframes: its top and height at each stop passed, when each is reached (0–1), and the whole run in seconds. */
export interface BarTravel {
  top: number[]
  height: number[]
  times: number[]
  duration: number
}

/* From one stop to another through every stop between, in either direction.
   The same stop, or no stops, is a jump: one frame, no time. */
export function barTravel(stops: readonly Stop[], from: number, to: number): BarTravel {
  if (stops.length === 0) return { top: [0], height: [0], times: [0], duration: 0 }
  const clamp = (i: number) => Math.max(0, Math.min(stops.length - 1, i))
  const a = clamp(from)
  const b = clamp(to)
  const step = a <= b ? 1 : -1
  const path: number[] = []
  for (let i = a; i !== b + step; i += step) path.push(i)
  const hops = path.length - 1
  return {
    top: path.map((i) => stops[i].top),
    height: path.map((i) => stops[i].height),
    times: hops === 0 ? [0] : path.map((_, i) => i / hops),
    duration: (hops * hopMs(hops)) / 1000,
  }
}
