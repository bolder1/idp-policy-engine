import { createContext } from 'react'

import type { CheckRow } from '../engine-run'
import type { Via } from '../conflicts'

/* What Focus's cards share (FocusLayout.tsx), kept apart from the components
   so fast refresh keeps working: the ease things arrive on, the one note open
   at a time, and how a Who that passed lets the person in. */

export const EASE_OUT = [0.2, 0, 0, 1] as const

export interface NoteState {
  open: string | null
  toggle: (id: string) => void
  /** The card is receded: nothing inside it is pressed. */
  inert: boolean
}
export const NoteCtx = createContext<NoteState>({ open: null, toggle: () => {}, inert: false })

export const viaOf = (c: CheckRow, working: boolean, via?: Via): string => (c.category === 'who' && c.status === 'pass' && !working && via?.matches ? via.say : '')

/* What the assistant is pointing at (assistant/intents.ts `Target`): 'person',
   'policy:<id>', 'rule:<id>', 'check:<ruleId>:<category>', 'outcome',
   'screens' — the card or the row it names draws lit. */
export const LitCtx = createContext<string | null>(null)
