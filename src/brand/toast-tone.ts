/* -----------------------------------------------------------------------------
   What kind of news a toast is, for its colour and its mark.

   Owner, 22 Sep 2026: "change the toast system — colour based on the task
   performed, with an icon, and a timeline at the end of the card". The toast
   was one dark pill for everything, so "Draft saved", "Rule deleted" and
   "Could not copy the key" looked alike.

   Read off the message, because seventy-odd call sites say what happened in
   their own words and every one of them already says it plainly. A caller can
   still name the tone outright (`showToast(text, action, { tone })`), and that
   wins. Order matters: a failure is checked before a removal ("Could not delete
   …" is a failure), and a removal before a success ("… deleted. Press Ctrl+Z
   to undo" is not a success).
   -------------------------------------------------------------------------- */

export type ToastTone = 'success' | 'info' | 'warning' | 'error' | 'removed'

const FAILED = /\b(could not|couldn't|cannot|can't|failed|not allowed|refused)\b/i
const HOLD_ON = /^(turn on|no changes|please|nothing)\b|\boutside the scope\b|\bfirst\.?$/i
const REMOVED = /\b(removed|deleted|discarded)\b/i
const DONE =
  /\b(saved|created|added|uploaded|copied|restored|duplicated|synced|applied|exported|started|is now|is back|now come)\b/i

export function toastTone(text: string): ToastTone {
  if (FAILED.test(text)) return 'error'
  if (HOLD_ON.test(text)) return 'warning'
  if (REMOVED.test(text)) return 'removed'
  if (DONE.test(text)) return 'success'
  return 'info'
}

/* How long a toast stays: long enough to read, and with an action long enough
   to decide and reach it. The bar along its foot runs for exactly this. */
export const toastDuration = (hasAction: boolean) => (hasAction ? 6000 : 3200)
