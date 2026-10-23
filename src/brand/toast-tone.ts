import { AlertTriangle, CheckCircle2, Info, Trash2, XCircle, type LucideIcon } from 'lucide-react'

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

/* The mark for each kind of news (22 Sep 2026), beside the tones it marks.

   It lived in Shell.tsx until 22 Oct 2026, when the confirm dialogs started
   reading the same map (kit.tsx `Confirm`, "inherit the toast's icon and tone
   language"). Two copies would drift the first time a tone was added, and the
   kit cannot import from the Shell. It sits here rather than in the kit because
   the kit is a component module, where a non-component export costs fast
   refresh — oxlint says so, and the warning ceiling is 27. */
export const TONE_ICON: Record<ToastTone, LucideIcon> = {
  success: CheckCircle2,
  removed: Trash2,
  warning: AlertTriangle,
  error: XCircle,
  info: Info,
}

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

/* The same marks' geometry, for the one place that draws them instead of
   rendering them: the hero badge (`ToneMark`, tone-mark.tsx).

   The path strings are lucide-react's own icon nodes, copied rather than
   imported, because a Lucide COMPONENT cannot take `pathLength` — the same
   reason focus2-draw.tsx copied ShieldCheck's. They sit beside `TONE_ICON` for
   the reason that map is here at all: two copies of one icon's shape would
   drift the first time a tone was added, and this file is already the single
   answer to "which mark for which news".

   Grouped by what each stroke DOES, not by Lucide's order, because the
   choreography addresses them by role: a lid hinges, a body encloses, bars
   fall. */
export const TONE_PATHS = {
  /* Trash2. The lid is two sub-paths — the bar and the handle — so tilting it
     needs a wrapping group with an explicit origin; `hinge` is the bar's left
     end, so it swings like a real lid rather than from the icon's centre. */
  removed: {
    lid: ['M3 6h18', 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'],
    body: 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6',
    bars: ['M10 11v6', 'M14 11v6'],
    hinge: '3px 6px',
  },
  /* TriangleAlert. `d` starts at the lower right flank, so the outline draws
     right -> apex -> left -> base. `pivot` is the base, so the knock at the end
     rocks the triangle on the ground instead of spinning it. */
  warning: {
    body: 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3',
    bar: 'M12 9v4',
    dot: [12, 17],
    pivot: '12px 21px',
  },
  /* CircleCheck: the tick draws in the direction a hand writes it. */
  success: { tick: 'm9 12 2 2 4-4' },
  /* CircleX, drawn a tenth of a second apart. Struck together the two strokes
     read as a scribble; in sequence they read as a cross being made. */
  error: { down: 'm15 9-6 6', up: 'm9 9 6 6' },
  /* Info's stem is reversed from Lucide's own `M12 16v-4` so it grows DOWN from
     the dot rather than up into it. */
  info: { stem: 'M12 12v4', dot: [12, 8] },
} as const

/* The badge's own spring (kit.tsx) settles about here, so the mark starts after
   it: a glyph drawing itself while the disc is still arriving reads as two
   animations, not one. */
export const MARK_AFTER = 0.18

/* The JS twin of --ease-standard, under the name focus2-draw.tsx already gave
   it. A token cannot be read from a Motion transition, so this is the one
   restatement the rule allows — keep the two in step. */
export const MARK_EASE = [0.2, 0, 0, 1] as const
