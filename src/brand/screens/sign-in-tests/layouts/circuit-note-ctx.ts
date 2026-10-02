import { createContext } from 'react'

/* The board's one open note (circuit-note.tsx): which, and whether a press pinned it or a hover peeks. */
export interface NoteState {
  open: { id: string; pin: boolean } | null
  peek: (id: string | null) => void
  pin: (id: string, from: HTMLElement) => void
}
export const NoteCtx = createContext<NoteState>({ open: null, peek: () => {}, pin: () => {} })

/* The rule's requirement after "needs": "below 40", "not in Corporate offices". */
export const lowerFirst = (t: string): string => (/^(Not|Below|Above|Between|Before|After) /.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t)
