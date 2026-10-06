/* -----------------------------------------------------------------------------
   Aruna's way in and out, in time (JarvisMode.tsx draws it, aruna-entry-film.ts
   moves it; the page, SignInTests.tsx, swaps the layout at MID and clears the
   transition at END). "The same run, many views; this is hers" (4 Oct 2026):

     ENTER  0 ─ the press: a ping and a flare at the porthole; the view
              lifts off the canvas as a rounded sheet
            · it steps back, and parallel copies of it fan out into depth
              over Aruna's warm black; her iris leaves the porthole
            · every copy falls away into the depth, the iris arriving
       MID  ─ full cover: the layout is swapped to Aruna underneath
            · ARUNA decodes; the iris travels onto her reactor
   DISSOLVE ─ the ground dissolves outward from the reactor; the HUD boots
       END
     EXIT   0 ─ Aruna becomes a sheet, the copies fold in behind it, and it
              flies into the porthole
       MID  ─ the layout it came from, underneath
            · the dark withdraws into the porthole, which flares once
       END

   The layout hears about both (it boots as the overlay dissolves, and stands
   down as the sheet lifts): the entrance by when it started, the exit by
   an event — so neither needs a prop the host does not have.
   -------------------------------------------------------------------------- */

/** When the layout under the transition is swapped, and when the transition is done. */
export const JARVIS_MID_MS = 1000
export const JARVIS_END_MS = 2000
/** When, on the way in, the overlay starts to dissolve (the HUD boots 60 ms before). */
export const JARVIS_DISSOLVE_MS = 1400
/** Under reduced motion: a crossfade through the ground, swapped at its middle (for a host that plays one). */
export const JARVIS_REDUCED_MID_MS = 100
export const JARVIS_REDUCED_END_MS = 200

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

/* Entered from the bar (its button, or the v1/v2 switch) — under reduced motion there is no film to time it by.
   A HUD mounted just after is a revisit of the run on screen, not a run fresh from Run: it greets, it does not re-narrate. */
let pressedAt = Number.NEGATIVE_INFINITY
export function noteJarvisEntry(): void {
  if (typeof performance !== 'undefined') pressedAt = performance.now()
}
export function jarvisJustEntered(): boolean {
  return typeof performance !== 'undefined' && performance.now() - pressedAt < 2500
}
