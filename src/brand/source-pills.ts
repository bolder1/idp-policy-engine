import { useSyncExternalStore } from 'react'

/* -----------------------------------------------------------------------------
   The pills: the start cards' By miniOrange and Your organization tabs, and the template cards' category tab.

   Owner, 3 Nov 2026: first "add these pills we used to have, as of now just in localhost only"; then "by default make
   the pills hidden and add a shortcut like Ctrl+T to show the pills back". So they are hidden on every build, the
   Vercel link included, until Alt+T shows them, and Alt+T again hides them. Ctrl+T is the browser's own new tab, and
   Chrome never hands it to a page; plain T is test mode in the builder. Alt+T is read by its key position (`code`),
   since on a Mac Option+T types a character instead.

   Not kept: a reload hides them again. Static markup (the tests) never draws them.
   -------------------------------------------------------------------------- */

let shown = false
const listeners = new Set<() => void>()

function onKey(e: KeyboardEvent) {
  if (!(e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.code === 'KeyT')) return
  e.preventDefault()
  /* A held Alt+T repeats: one press, one change. */
  if (e.repeat) return
  shown = !shown
  listeners.forEach((l) => l())
}

/* The keys are listened for while anything that draws a pill is on screen: the start cards or the template store. */
function subscribe(listener: () => void) {
  if (listeners.size === 0) window.addEventListener('keydown', onKey)
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) window.removeEventListener('keydown', onKey)
  }
}

/** Whether the pills are showing: false until Alt+T. */
export function usePills(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => shown,
    () => false,
  )
}
