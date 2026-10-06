/* The numbers of the verdict's landing flourish (focus2-draw.tsx, focus-outcome.tsx's `v2.land`), kept out of the
   component file so it exports components only. */

/** The outline's draw, in ms (pathLength 0 → 1). */
export const DRAW_MS = 450
/** How long the receding cards stay dimmed while the verdict lands, in ms. */
export const DIM_MS = 600
/** The Deny's one shake: 3 px each way, two cycles in 260 ms, begun as the outline finishes drawing. */
export const SHAKE = { x: [0, -3, 3, -3, 3, 0] }
export const SHAKE_T = { duration: 0.26, delay: DRAW_MS / 1000, ease: 'linear' as const }

/** The flourish plays once per presented landing: not when the run lands at once, not on a browse back to the card. */
export function playsLanding(o: { instant: boolean; landed: boolean; deciding: boolean; outcomeOpen: boolean; flown: string | null; key: string }): boolean {
  return !o.instant && o.landed && !o.deciding && o.outcomeOpen && o.flown !== o.key
}
