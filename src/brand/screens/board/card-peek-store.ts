import { useSyncExternalStore } from 'react'

import { shows } from '../../rollout'

/* -----------------------------------------------------------------------------
   Card peeks (rollout.ts `cardPeeks`; owner, 26 Nov 2026: "whenever the user wants to hover or click on any of these, a
   small widget will open in the canvas and showcase what's inside this … the who part, the if part for all the
   conditions … the then part", and of two options "Hover previews, click pins").

   Which peek is open, for the whole canvas: one at a time, so a hover over the next chip moves it rather than stacking
   a second. `pinned` is a click's: a pinned peek ignores hovers until Esc, a click elsewhere or its chip again.
   -------------------------------------------------------------------------- */

/** Peeks are drawn on this line. */
export const CARD_PEEKS: boolean = shows('cardPeeks')

export type OpenPeek = { id: string; pinned: boolean } | null

let open: OpenPeek = null
const listeners = new Set<() => void>()

export function setPeek(next: OpenPeek) {
  open = next
  listeners.forEach((l) => l())
}

export const getPeek = (): OpenPeek => open

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

/** The open peek. Server render: none. */
export const usePeek = (): OpenPeek => useSyncExternalStore(subscribe, () => open, () => null)
