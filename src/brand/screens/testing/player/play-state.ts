import { createContext, useContext, useEffect, useState } from 'react'

import type { Action, FieldKey, PressTarget, Widget } from './script'

/* -----------------------------------------------------------------------------
   What the beat on screen is doing, for the widgets that draw it: which
   field is typing and how far it has got, which control is being pressed,
   what is scanning. Every widget reads it from here rather than being handed
   it, so a phone deep in the stage presses its Approve without the stage
   knowing there is one.
   -------------------------------------------------------------------------- */

export interface PlayState {
  /** The beat's action while it plays; null when the film holds or motion is reduced. */
  action: Action | null
  widget: Widget | null
  /** How many characters of the typing field are in so far. */
  shown: number
  /** New with every beat played, so a press or a scan starts its motion again. */
  key: string
  reduced: boolean
}

export const HELD: PlayState = { action: null, widget: null, shown: 0, key: 'held', reduced: false }

export const PlayContext = createContext<PlayState>(HELD)

export const usePlay = () => useContext(PlayContext)

/** A field's text as it stands this frame: all of it, or as far as the typing has got. */
export function useTyped(field: FieldKey, value: string): { text: string; typing: boolean } {
  const p = usePlay()
  if (p.action?.kind === 'type' && p.action.field === field) return { text: value.slice(0, p.shown), typing: true }
  return { text: value, typing: false }
}

/** How many of a typing field's characters are in: `count` of them over `ms`, one at a time. */
export function useReveal(count: number, ms: number, key: string, run: boolean): number {
  const [at, setAt] = useState<{ key: string; n: number }>({ key, n: 0 })
  useEffect(() => {
    if (!run || count <= 0) return
    let n = 0
    const every = Math.max(12, ms / count)
    const id = window.setInterval(() => {
      n += 1
      setAt({ key, n })
      if (n >= count) window.clearInterval(id)
    }, every)
    return () => window.clearInterval(id)
  }, [key, run, count, ms])
  if (!run) return count
  return at.key === key ? at.n : 0
}

export const isPressing = (p: PlayState, target: PressTarget) => p.action?.kind === 'press' && p.action.target === target

export const isScanning = (p: PlayState, widget: Widget) => p.action?.kind === 'scan' && p.widget === widget

/** The press every pressed control gets: a small dip and back. Motion's scale, never a stylesheet's. */
export const PRESS = { scale: [1, 0.94, 1] }
export const PRESS_T = { duration: 0.32, times: [0, 0.45, 1] }

/** Decelerating: what arrives. */
export const EASE_OUT = [0.2, 0, 0, 1] as const
