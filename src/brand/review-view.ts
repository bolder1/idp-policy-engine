import { useSyncExternalStore } from 'react'

/* -----------------------------------------------------------------------------
   How Review changes lays a draft out: before and after, or a list.

   Two previews of the same dialog behind one switch in its header (owner,
   17 Sep 2026: "give me a 2nd version where we don't show the before values").
   BEFORE & AFTER is a column each for what is saved and what will be. LIST is
   what will be saved, and nothing else — the shape the device profile wizard's
   Review uses too, since a new profile has no before.

   One value for every page's review, remembered per viewer like the page
   width. Nothing about saving depends on it.
   -------------------------------------------------------------------------- */

export type ReviewView = 'compare' | 'list'

export const REVIEW_VIEW_KEY = 'idp.reviewView'

/** Only the exact stored value turns before-and-after on; anything else is the list. */
export function parseReviewView(value: unknown): ReviewView {
  return value === 'compare' ? 'compare' : 'list'
}

export function readReviewView(): ReviewView {
  try {
    return parseReviewView(window.localStorage.getItem(REVIEW_VIEW_KEY))
  } catch {
    /* No window (tests), a private window, or storage blocked by policy. */
    return 'list'
  }
}

let current: ReviewView = readReviewView()
const listeners = new Set<() => void>()

export function applyReviewView(view: ReviewView): void {
  current = view
  try {
    window.localStorage.setItem(REVIEW_VIEW_KEY, view)
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

export function useReviewView(): [ReviewView, (v: ReviewView) => void] {
  const view = useSyncExternalStore(
    subscribe,
    () => current,
    () => 'list' as ReviewView,
  )
  return [view, applyReviewView]
}
