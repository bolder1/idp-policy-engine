import type { Policy } from '../data'

/* -----------------------------------------------------------------------------
   Undo.

   A plain three-stack over whole drafts. Policies here are small enough that
   structural sharing would be optimising the wrong thing, and a snapshot stack
   has the property that actually matters: undo can never leave the draft in a
   state the editor could not have produced.

   Why an editor for this model needs one at all: rule order IS the policy under
   first-match-wins, and reordering is a single click on an arrow. The most
   dangerous edit available is also the easiest to make by accident, and every
   other builder's only route back is Discard — which throws away the whole
   session to undo one arrow press.
   -------------------------------------------------------------------------- */

export interface History {
  past: Policy[]
  present: Policy
  future: Policy[]
}

/** Deep enough to cover a working session, bounded so a long one cannot grow
    without limit. */
export const HISTORY_LIMIT = 60

export const historyOf = (present: Policy): History => ({ past: [], present, future: [] })

/* A commit that changes nothing is not a commit.

   Without this, every keystroke in the name field that React re-renders through
   would push an identical snapshot, and undo would walk back through dozens of
   states that look identical on screen — which reads as a broken undo rather
   than a precise one. */
export function commit(h: History, next: Policy): History {
  if (JSON.stringify(h.present) === JSON.stringify(next)) return h
  return { past: [...h.past, h.present].slice(-HISTORY_LIMIT), present: next, future: [] }
}

export function undo(h: History): History {
  if (h.past.length === 0) return h
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] }
}

export function redo(h: History): History {
  if (h.future.length === 0) return h
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) }
}

export const canUndo = (h: History) => h.past.length > 0
export const canRedo = (h: History) => h.future.length > 0

/** True when this keystroke should be handled as undo/redo rather than passed
    to the field under the cursor.

    Typing into a text field is deliberately excluded: the browser's own text
    undo is the right behaviour there, and stealing it would break typing to
    solve a problem the user does not have while typing. */
export function historyKey(e: KeyboardEvent): 'undo' | 'redo' | null {
  const target = e.target as HTMLElement | null
  if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return null
  if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return null
  return e.shiftKey ? 'redo' : 'undo'
}
