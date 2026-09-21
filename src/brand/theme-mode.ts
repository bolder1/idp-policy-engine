import { useSyncExternalStore } from 'react'

import { SHOWCASE } from './showcase'

/* -----------------------------------------------------------------------------
   Light or dark, for the whole console and the end-user site alike.

   It lived in the admin shell's own state, so it reset whenever that shell
   remounted (a round trip through the User Dashboard) and on every reload, and
   the end-user side had no control at all. It is one value for the page now,
   remembered the way the Rebrand switch is (brand-mode.ts), and applied as soon
   as this module loads so the first paint is already in the right theme.
   -------------------------------------------------------------------------- */

export type Theme = 'light' | 'dark'

export const THEME_KEY = 'idp.theme'

/** Only the exact stored value turns dark on; anything else is light. */
export function parseTheme(value: unknown): Theme {
  return value === 'dark' ? 'dark' : 'light'
}

export function readTheme(): Theme {
  try {
    return parseTheme(window.localStorage.getItem(THEME_KEY))
  } catch {
    /* No window (tests), a private window, or storage blocked by policy. */
    return 'light'
  }
}

/* The showcase build is light only — dark is not in the product yet (owner,
   14 Sep; its toggle hidden 21 Sep) — whatever an earlier visit stored. */
let current: Theme = SHOWCASE ? 'light' : readTheme()
const listeners = new Set<() => void>()

function paint(theme: Theme): void {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-theme', theme)
}

/** Sets the theme for the page, remembers it, and tells every control showing it. */
export function applyTheme(theme: Theme): void {
  current = theme
  paint(theme)
  try {
    window.localStorage.setItem(THEME_KEY, theme)
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

/** The theme, and the setter every theme control uses. */
export function useTheme(): [Theme, (t: Theme) => void] {
  const theme = useSyncExternalStore(
    subscribe,
    () => current,
    () => 'light' as Theme,
  )
  return [theme, applyTheme]
}

paint(current)
