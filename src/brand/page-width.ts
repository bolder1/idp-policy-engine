import { useSyncExternalStore } from 'react'

/* -----------------------------------------------------------------------------
   How wide the library pages sit: compact or full.

   Two previews of the same pages, side by side behind one switch (owner, 16 Sep
   2026). COMPACT is how Zones, Device profiles, Risk signal profiles and
   Authentication methods have looked since 14 Sep: every block in columns 2 to 9
   of the page grid, a column of air each side. FULL is how Policies sits: the
   whole grid, edge to edge.

   One value for all of them, so flipping it on one page and walking to the next
   compares like with like. Remembered per viewer the way the theme and the
   Rebrand switch are, and nothing about any page's behaviour depends on it.
   -------------------------------------------------------------------------- */

export type PageWidth = 'compact' | 'full'

export const PAGE_WIDTH_KEY = 'idp.pageWidth'

/** Only the exact stored value turns full width on; anything else is compact. */
export function parsePageWidth(value: unknown): PageWidth {
  return value === 'full' ? 'full' : 'compact'
}

export function readPageWidth(): PageWidth {
  try {
    return parsePageWidth(window.localStorage.getItem(PAGE_WIDTH_KEY))
  } catch {
    /* No window (tests), a private window, or storage blocked by policy. */
    return 'compact'
  }
}

let current: PageWidth = readPageWidth()
const listeners = new Set<() => void>()

/** Sets the width for every library page, remembers it, and tells each switch. */
export function applyPageWidth(width: PageWidth): void {
  current = width
  try {
    window.localStorage.setItem(PAGE_WIDTH_KEY, width)
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

/** The width, and the setter the switch uses. */
export function usePageWidth(): [PageWidth, (w: PageWidth) => void] {
  const width = useSyncExternalStore(
    subscribe,
    () => current,
    () => 'compact' as PageWidth,
  )
  return [width, applyPageWidth]
}

/** The class a library page adds while its list shows, for the width in force. */
export function compactClass(width: PageWidth): string {
  return width === 'compact' ? ' bpage--compact' : ''
}
