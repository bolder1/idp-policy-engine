import { useEffect, useRef, type RefObject } from 'react'

/* -----------------------------------------------------------------------------
   Dialog chrome: the stack of open dialogs, and what every surface with a scrim
   owes a keyboard.

   Kept out of kit.tsx on purpose. kit.tsx exports components only, so a hook or
   a plain function exported from it would cost fast refresh for every component
   in that file. Screens that need to know whether a dialog is open (a window
   Escape or undo shortcut) or that draw their own sheet import from here.
   -------------------------------------------------------------------------- */

/* Every dialog currently open, innermost last.

   Module-level rather than a context because it answers a window-level question
   — "who owns Escape right now" — and the dialogs that stack are not always in
   one another's DOM: a Modal portals to the app root, so a confirmation opened
   from a drawer sits beside the drawer in the DOM and inside it in React. */
const openDialogs: symbol[] = []

/** True while any kit dialog (Modal, Drawer, or a sheet using useDialogChrome) is open. */
export function hasOpenDialog(): boolean {
  return openDialogs.length > 0
}

/** Where portalled surfaces go: the app root, so the kit's resets and type apply. */
export function appRoot(): HTMLElement {
  return (document.querySelector<HTMLElement>('.brand-root') ?? document.body)
}

/* Portalled layers a dialog can open on top of itself: menus, the picker's
   list, and non-modal popups such as the applications peek. Focus inside one of
   these is still "in" the dialog as far as Tab is concerned. A modal surface
   (another drawer, say) is not one of them. */
const POPUP_LAYER = '[role="menu"], [role="listbox"], .bx-picker__pop, [role="dialog"]:not([aria-modal="true"])'

export const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/* The nearest place to put focus back when the control that opened a surface
   has gone. Walks a few ancestors up from where the trigger was, and takes the
   first one that is still in the page AND still holds something focusable — the
   first connected one alone can be an empty wrapper (removing the last policy
   from the protection panel leaves exactly that), which drops focus to <body>. */
export function nearestFocusable(trail: HTMLElement[], exclude?: Node | null): HTMLElement | null {
  for (const el of trail) {
    if (!el.isConnected) continue
    const hit = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).find((c) => !exclude?.contains(c))
    if (hit) return hit
  }
  return null
}

export interface TabState {
  /** Another handler already routed this Tab (a row menu closing onto its kebab). */
  prevented: boolean
  shift: boolean
  /** Focusable controls inside the surface. */
  count: number
  inPanel: boolean
  /** Focus is in a portalled popup the surface opened: a menu, a picker's list, a peek. */
  inPopup: boolean
  onPanel: boolean
  atFirst: boolean
  atLast: boolean
}

/* Where Tab sends focus inside a dialog, or null to let the browser (or the
   popup that owns it) move it.

   - Already handled: leave it. Moving it again undoes what that handler did.
   - Nothing focusable: hold focus on the panel.
   - Focus outside the panel (a click behind a transparent gap, a popover that
     closed) comes back in at the near end — unless it is in a popup this surface
     opened, which is portalled rather than wandered off and owns its own Tab.
   - At either end, wrap. */
export function tabMove(s: TabState): 'first' | 'last' | 'panel' | null {
  if (s.prevented) return null
  if (s.count === 0) return 'panel'
  if (!s.inPanel) return s.inPopup ? null : s.shift ? 'last' : 'first'
  if (s.shift && (s.atFirst || s.onPanel)) return 'last'
  if (!s.shift && s.atLast) return 'first'
  return null
}

/* Escape ownership, a focus trap and focus restoration.

   - Escape closes only the innermost open surface, so it peels one layer.
   - Tab stays inside the innermost surface. An outer drawer does not trap Tab
     while a dialog is open over it: the dialog is portalled, so it is not inside
     the drawer's DOM, and a drawer trap would pull focus out of the dialog.
   - Closing restores focus to the control that opened the surface, or to the
     nearest focusable thing where it sat. */
export function useDialogChrome(open: boolean, onClose: () => void, panel: RefObject<HTMLElement | null>) {
  const returnTo = useRef<HTMLElement | null>(null)

  /* The trigger is read while the surface is FIRST rendered open, not in the
     effect. By the time an effect runs, an `autoFocus` field inside the surface
     has already taken focus, and "restore focus to where it was" would restore
     it to a field that is about to be removed. */
  const armed = useRef(false)
  if (!open) armed.current = false
  else if (!armed.current && typeof document !== 'undefined') {
    armed.current = true
    returnTo.current = document.activeElement as HTMLElement | null
  }

  /* `onClose` is an inline arrow in every caller, so it has a new identity on
     every render of the host. Held in a ref so the effect depends only on
     `open` — otherwise the restore-focus cleanup fired on every keystroke. */
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!open) return
    const panelNode = panel.current
    if (!returnTo.current || panelNode?.contains(returnTo.current)) {
      const active = document.activeElement as HTMLElement | null
      returnTo.current = panelNode?.contains(active) ? null : active
    }
    /* Where the trigger sat, a few levels up. Six, not four: a row's kebab sits
       in a cluster, in a row, in a list, in a section, and deleting the last row
       swaps the list for an empty state — four levels ended inside what had
       gone, and focus fell to <body>. Still short: a trigger that navigated took
       its whole screen with it, and restoring only runs while nothing else has
       taken focus. */
    const trail: HTMLElement[] = []
    for (let el = returnTo.current?.parentElement ?? null; el && trail.length < 6; el = el.parentElement) {
      trail.push(el)
    }

    const me = Symbol('dialog')
    openDialogs.push(me)
    const innermost = () => openDialogs[openDialogs.length - 1] === me

    /* Focus the panel itself rather than its first control. A frame AND a
       timer: requestAnimationFrame does not run in a background tab. */
    const focusPanel = () => {
      const p = panel.current
      if (p && !p.contains(document.activeElement)) p.focus({ preventScroll: true })
    }
    const id = window.requestAnimationFrame(focusPanel)
    const fallback = window.setTimeout(focusPanel, 60)

    const onKey = (e: KeyboardEvent) => {
      if (!innermost()) return
      if (e.key === 'Escape') {
        if (e.defaultPrevented) return
        return onCloseRef.current()
      }
      if (e.key !== 'Tab' || !panel.current) return
      const focusable = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      const on = document.activeElement
      const move = tabMove({
        prevented: e.defaultPrevented,
        shift: e.shiftKey,
        count: focusable.length,
        inPanel: panel.current.contains(on),
        inPopup: on instanceof Element && !!on.closest(POPUP_LAYER),
        onPanel: on === panel.current,
        atFirst: on === focusable[0],
        atLast: on === focusable[focusable.length - 1],
      })
      if (!move) return
      e.preventDefault()
      if (move === 'panel') panel.current.focus()
      else (move === 'first' ? focusable[0] : focusable[focusable.length - 1]).focus()
    }

    window.addEventListener('keydown', onKey)
    return () => {
      window.cancelAnimationFrame(id)
      window.clearTimeout(fallback)
      window.removeEventListener('keydown', onKey)
      const at = openDialogs.indexOf(me)
      if (at !== -1) openDialogs.splice(at, 1)
      /* Only restore to a control that still exists: focus() on a detached
         node silently drops focus to <body>. */
      const back = returnTo.current
      if (back?.isConnected) {
        back.focus({ preventScroll: true })
        return
      }
      /* Only when nothing else has taken focus. A new screen may have put it
         somewhere on purpose, and that beats a guess at where the trigger was. */
      const active = document.activeElement
      const lost = !active || active === document.body || Boolean(panelNode?.contains(active))
      if (lost) nearestFocusable(trail, panelNode)?.focus({ preventScroll: true })
    }
  }, [open, panel])
}
