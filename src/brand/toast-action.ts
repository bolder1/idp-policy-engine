import type { ToastAction } from './store'

/* -----------------------------------------------------------------------------
   A toast's one action (Undo, Monitor), pressed — Shell.tsx `Toast`.

   It runs once. The toast goes as it runs: dismissed first, so a toast the
   action shows in turn ("Restored", the Monitor's own Undo) is the one left
   standing, and one that shows nothing simply closes. A second press, a
   double-click, or a click while the toast slides out is not a second run: an
   Undo that worked ran again, found its policy changed by its own first run,
   and said it could not undo (review 10 Oct 2026, #8).
   -------------------------------------------------------------------------- */

/** Presses `toast`'s action once per toast, remembered in `ran`: `before` (its cue), the toast dismissed, then the action. False when there was nothing to run. */
export function pressToastAction(
  toast: { id: number; action?: ToastAction },
  ran: { current: number | null },
  dismiss: () => void,
  before?: () => void,
): boolean {
  if (!toast.action || ran.current === toast.id) return false
  ran.current = toast.id
  before?.()
  dismiss()
  toast.action.run()
  return true
}
