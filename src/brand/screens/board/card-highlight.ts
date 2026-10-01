import { useSyncExternalStore } from 'react'

/* -----------------------------------------------------------------------------
   The card a hovered row in the test panel lands on, outside React's state.

   It was a `useState` in BoardBuilder, so every row the pointer crossed in
   Saved sign-ins or Past sign-ins re-rendered the builder, the board, every
   card and the panel — 20 ms and more a row on a production build, and the
   list dropped frames as the pointer swept down it (review, 29 Sep 2026).
   What changes on a hover is one ring on at most two cards: the one it
   leaves and the one it lands on. So the id lives here, the rows write it,
   and each card reads only whether it is the one (`useCardHighlighted`) —
   a hover re-renders those two cards and nothing else.

   `set` is stable for the life of the store, so a row can be handed it
   without re-rendering when the builder does.
   -------------------------------------------------------------------------- */

export type HighlightTarget = string | 'fallback' | null

export interface CardHighlight {
  get: () => HighlightTarget
  set: (target: HighlightTarget) => void
  subscribe: (listener: () => void) => () => void
}

export function createCardHighlight(): CardHighlight {
  let current: HighlightTarget = null
  const listeners = new Set<() => void>()
  return {
    get: () => current,
    set: (target) => {
      if (target === current) return
      current = target
      for (const l of listeners) l()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

const NONE = () => () => {}
const NO = () => false

/** Whether the card `id` is the one a hovered row lands on. Nothing, without a store. */
export function useCardHighlighted(store: CardHighlight | undefined, id: string): boolean {
  return useSyncExternalStore(
    store ? store.subscribe : NONE,
    store ? () => store.get() === id : NO,
    NO,
  )
}
