import { useSyncExternalStore } from 'react'

/* -----------------------------------------------------------------------------
   How the console draws its switches: a PENDING DECISION, not a setting.

   Owner, 1 Oct 2026: "For the toggle I want some options. One is the blue one,
   the green one, one grayscale, and you can find some more better options; we
   will select and then choose one."

   Six styles of the same `Toggle`, chosen with the "Toggle style" switch on
   Authentication methods (admin only) and drawn by one `html[data-toggle-style]`
   block each in kit.css, plus one off state the four colours share. The value sits on <html>, so every switch on every page changes
   together, and it is remembered per viewer the way the width switch is.

   Unlike the other preview switches it shows in the showcase build too: the
   owner is choosing between these, so they have to be seen to be chosen.

   Blue is today's look and stays the default until one is chosen. This file,
   the switch and the six blocks all go once the owner picks.
   -------------------------------------------------------------------------- */

export type ToggleStyle = 'blue' | 'green' | 'grayscale' | 'navy' | 'outlined' | 'glyph'

/** The six, in the order the switch offers them. Blue, today's look, first. */
export const TOGGLE_STYLES: { value: ToggleStyle; label: string }[] = [
  { value: 'blue', label: 'Blue' },
  { value: 'green', label: 'Green' },
  { value: 'grayscale', label: 'Grayscale' },
  { value: 'navy', label: 'Navy' },
  { value: 'outlined', label: 'Outlined' },
  { value: 'glyph', label: 'Icons' },
]

export const TOGGLE_STYLE_KEY = 'idp.toggle-style'

/** Today's look, until the owner picks another. */
export const DEFAULT_TOGGLE_STYLE: ToggleStyle = 'blue'

const IDS = new Set<string>(TOGGLE_STYLES.map((s) => s.value))

/** Only one of the six exact ids is a style; anything else is today's blue. */
export function parseToggleStyle(value: unknown): ToggleStyle {
  return typeof value === 'string' && IDS.has(value) ? (value as ToggleStyle) : DEFAULT_TOGGLE_STYLE
}

export function readToggleStyle(): ToggleStyle {
  try {
    return parseToggleStyle(window.localStorage.getItem(TOGGLE_STYLE_KEY))
  } catch {
    /* No window (tests), a private window, or storage blocked by policy. */
    return DEFAULT_TOGGLE_STYLE
  }
}

/** Puts the style on <html>, where kit.css reads it. main.tsx calls this before the first paint. */
export function markToggleStyle(style: ToggleStyle): void {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-toggle-style', style)
}

let current: ToggleStyle = readToggleStyle()
const listeners = new Set<() => void>()

/** Draws every switch in the console in this style, remembers it, and tells the switch. */
export function chooseToggleStyle(style: ToggleStyle): void {
  current = style
  markToggleStyle(style)
  try {
    window.localStorage.setItem(TOGGLE_STYLE_KEY, style)
  } catch {
    /* It still applies for this session; it just will not be remembered. */
  }
  listeners.forEach((l) => l())
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

/** The style in force, and the setter the switch uses. */
export function useToggleStyle(): [ToggleStyle, (s: ToggleStyle) => void] {
  const style = useSyncExternalStore(
    subscribe,
    () => current,
    () => DEFAULT_TOGGLE_STYLE,
  )
  return [style, chooseToggleStyle]
}
