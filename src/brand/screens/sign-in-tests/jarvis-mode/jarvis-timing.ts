/* -----------------------------------------------------------------------------
   Jarvis's way in and out, in time (JarvisMode.tsx draws it; the page,
   SignInTests.tsx, swaps the layout at MID and clears the transition at END).

     ENTER  0 ─ the page dims to navy from the Jarvis button's corner
            · the iris opens, the scan sweeps, the grid comes up
            · JARVIS decodes, "Access analysis online"
       MID  ─ the run is redrawn as Jarvis underneath, fully covered
            · the overlay dissolves outward in rings; the HUD boots under it
       END
     EXIT   0 ─ the HUD collapses into the iris as the rings close in
            · "Standing down"
       MID  ─ the layout it came from, underneath
            · the iris folds, the light returns into the button
       END

   The layout hears about both (it boots as the overlay dissolves, and stands
   down as the rings close in): the entrance by when it started, the exit by
   an event — so neither needs a prop the host does not have.
   -------------------------------------------------------------------------- */

/** When the layout under the transition is swapped, and when the transition is done. */
export const JARVIS_MID_MS = 820
export const JARVIS_END_MS = 1700
/** When, on the way in, the overlay starts to dissolve. */
export const JARVIS_DISSOLVE_MS = 1080

export type JarvisPhase = 'enter' | 'exit'

/** The exit, said to the HUD on screen. */
export const JARVIS_EXIT_EVENT = 'idp-jarvis-standing-down'

let enteredAt = Number.NEGATIVE_INFINITY

/** The transition has started: the entrance is noted, the exit is said. */
export function signalJarvis(phase: JarvisPhase): void {
  if (typeof window === 'undefined') return
  if (phase === 'enter') enteredAt = performance.now()
  else window.dispatchEvent(new Event(JARVIS_EXIT_EVENT))
}

/** How far into the entrance we are, in ms — or null when no entrance is playing. */
export function jarvisEntering(): number | null {
  if (typeof performance === 'undefined') return null
  const t = performance.now() - enteredAt
  return t >= 0 && t < JARVIS_END_MS ? t : null
}
