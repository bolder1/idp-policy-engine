import { createContext } from 'react'

/* The stream's one open note (stream-parts.tsx's Peek): which, and whether a press pinned it. */
export interface PeekState {
  open: { id: string; pinned: boolean } | null
  show: (id: string) => void
  hide: (id: string) => void
  toggle: (id: string, from: HTMLElement) => void
}

export const PeekCtx = createContext<PeekState>({ open: null, show: () => {}, hide: () => {}, toggle: () => {} })
