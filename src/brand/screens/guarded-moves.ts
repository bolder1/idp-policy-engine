import type { BrandScreen } from '../store'

/* -----------------------------------------------------------------------------
   Moves off a page that change something on the way: Check access loads the
   testing session (a policy's past sign-in loads its board's), and a drawer's
   link closes the drawer. Both wait for the
   leave guard's answer (store.tsx `requestLeave`), and the change goes inside
   the guarded run — loaded before the answer, Keep editing over an unsaved
   Basic left Access checks holding a person nobody ran, and the drawer shut
   on a page that never moved (review 10 Oct 2026, #9). ApplicationPage's New
   policy and Add a copy keep the same rule.
   -------------------------------------------------------------------------- */

export interface Mover {
  requestLeave: (run: () => void) => void
  go: (s: BrandScreen) => void
}

/** Moves to `to` with `load` done first, once the leave guard lets the move go ahead; `close` (the drawer it was pressed in) runs only then too. */
export function loadAndGo(store: Mover, load: () => void, to: BrandScreen, close?: () => void): void {
  store.requestLeave(() => {
    close?.()
    load()
    store.go(to)
  })
}

/** Opens Access checks with `load` done first, once the leave guard lets the move go ahead; `close` (the drawer it was pressed in) runs only then too. */
export function checkAccessFrom(store: Mover, load: () => void, close?: () => void): void {
  loadAndGo(store, load, { name: 'sign-in-tests' }, close)
}

/** A drawer's link to `to`: the drawer closes only when the move goes ahead.
    A link to the application whose Users tab the drawer is open on (`here`)
    is a place on that page, not a way off it — a tab moves in place there —
    so it only closes the drawer: no leave dialog, and no remount that would
    lose the tab's search and filters, or Discard the unsaved Basic (#10). */
export function followLink(store: Mover, to: BrandScreen, close: () => void, here?: string): void {
  if (here !== undefined && to.name === 'application' && to.appId === here) {
    close()
    return
  }
  store.requestLeave(() => {
    close()
    store.go(to)
  })
}
