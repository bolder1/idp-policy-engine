/* -----------------------------------------------------------------------------
   What a key does in Focus v2's walkthrough (Focus2Layout.tsx).

   The bottom player is gone (owner, 5 Oct 2026): the story is told in Auto and
   nothing else, and the way back through it is the step buttons and the decision
   trail under the open card. What is left of the old player is this one pure
   map, kept in a module of its own so the view's key handler can be tested
   without rendering anything.
   -------------------------------------------------------------------------- */

/** What a key does. 'land' is Skip's effect: everything revealed, the outcome centred. */
export type PlayerAction = { do: 'jump'; index: number } | { do: 'pause' } | { do: 'resume' } | { do: 'land' }

export interface KeyState {
  at: number
  /** How many beats the story has. */
  count: number
  /** The furthest beat reached. Absent: `at`. */
  reached?: number
  landed: boolean
  paused: boolean
}

const clampIndex = (n: number, last: number): number => (Number.isFinite(n) ? Math.min(last, Math.max(0, Math.round(n))) : 0)

/* Modifiers, and a key pressed into a field, are the caller's guard — as they are for the carousel's own keys. */
export function playerKeyAction(key: string, st: KeyState): PlayerAction | null {
  if (st.count === 0) return null
  const last = st.count - 1
  const at = clampIndex(st.at, last)
  const reached = st.landed ? last : Math.max(at, st.reached === undefined ? at : clampIndex(st.reached, last))
  switch (key) {
    case 'ArrowRight':
      return at < reached ? { do: 'jump', index: at + 1 } : null
    case 'ArrowLeft':
      return at > 0 ? { do: 'jump', index: at - 1 } : null
    case ' ':
      /* Space holds the story while it plays, and lets it go again. */
      if (st.landed) return null
      return st.paused ? { do: 'resume' } : { do: 'pause' }
    case 'Escape':
      return st.landed ? null : { do: 'land' }
    case 'Home':
      return at > 0 ? { do: 'jump', index: 0 } : null
    case 'End':
      return at < reached ? { do: 'jump', index: reached } : null
    default:
      return null
  }
}
