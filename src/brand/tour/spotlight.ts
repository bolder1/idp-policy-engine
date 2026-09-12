/* -----------------------------------------------------------------------------
   Where a coach mark goes — the one implementation, for both tours.

   This was inline in `Tour.tsx` while there was one tour. There are two now —
   the trail's and the board's — and they light different screens with cards of
   different heights, which is exactly the situation where a copied algorithm
   starts to drift: one of them gains a viewport clamp, the other gains a beak
   fix, and six months later two walkthroughs place their cards by subtly
   different rules for no reason anybody can name.

   So the RULES live here and the numbers are the caller's. The rules are:

   · beside the anchor on whichever side has room, and below-ish when neither
     side does
   · clamped so the card is never half off a laptop screen
   · the beak level with the ANCHOR's middle, which stops being the card's
     middle the moment the clamp moves the card

   Pure — no React, no JSX — so both callers can keep their own markup, and so
   the placement can be reasoned about without a DOM.
   -------------------------------------------------------------------------- */

export interface Rect {
  top: number
  left: number
  width: number
  height: number
}

export interface Placement {
  centred: boolean
  top: number
  left: number
  /** Which edge of the card the anchor is on, so the beak grows from it. */
  side: 'left' | 'right' | 'none'
  /** Distance from the card's top to the beak. */
  caret: number
}

/** The card's measurements. The caller owns these; the rules above do not. */
export interface CardBox {
  /** Width, which decides whether a side has room. */
  w: number
  /** Height, for the viewport clamp. */
  h: number
  /** How far down the card the anchor's middle should sit. */
  lead: number
}

/** Breathing room between the lit element and the hole cut around it. */
export const ANCHOR_PAD = 8
/** The gap between the hole and the card, and the card and the viewport edge. */
export const GAP = 18

/* The lit element's box, padded — or null when the stop names no anchor, or
   names one that is not on this screen.

   Null rather than a throw for the missing case, deliberately: an anchor can go
   missing because a panel is closed or a rule was deleted, and a tour that
   crashes when the thing it wanted to point at is absent is worse than one that
   centres its card and carries on. `board-tour.test.ts` is what catches an
   anchor that was renamed away for good. */
export function measureAnchor(anchor: string | undefined, pad = ANCHOR_PAD): Rect | null {
  if (!anchor || typeof document === 'undefined') return null
  const el = document.querySelector<HTMLElement>(`[data-tour="${anchor}"]`)
  if (!el) return null
  const r = el.getBoundingClientRect()
  /* A zero box is an element that is in the DOM and not laid out — mid-exit, or
     inside a collapsed panel. Pointing at it would put the card in the
     top-left corner with a beak aimed at nothing. */
  if (r.width === 0 && r.height === 0) return null
  return { top: r.top - pad, left: r.left - pad, width: r.width + pad * 2, height: r.height + pad * 2 }
}

export function place(rect: Rect | null, box: CardBox): Placement {
  if (typeof window === 'undefined') return { centred: true, top: 0, left: 0, side: 'none', caret: 0 }

  const vw = window.innerWidth
  const vh = window.innerHeight

  /* No anchor — or one that is not on this screen — so the card goes to the
     middle of the viewport, and the COORDINATES for that are computed here
     rather than left to CSS.

     That is not a style preference. Both cards are `motion.div`s, and motion
     owns the `transform` property on one of those absolutely: it composes its
     own matrix every frame and writes `transform: none` at rest. The obvious
     `top: 50%; left: 50%; transform: translate(-50%, -50%)` is therefore
     silently discarded, which put the card's top-left CORNER at the centre of
     the screen and half the card off the bottom-right of it. Measured, not
     guessed: top was exactly 50% of the viewport height with `transform: none`
     computed on the element.

     Returning real numbers means there is nothing for motion to overwrite, and
     its entrance animation stays free to use `y` and `scale`. */
  if (!rect) {
    return {
      centred: true,
      top: Math.max(GAP, (vh - box.h) / 2),
      left: Math.max(GAP, (vw - box.w) / 2),
      side: 'none',
      caret: 0,
    }
  }
  const roomRight = vw - (rect.left + rect.width)
  const roomLeft = rect.left

  let left: number
  let side: Placement['side']
  if (roomRight >= box.w + GAP) {
    left = rect.left + rect.width + GAP
    side = 'left'
  } else if (roomLeft >= box.w + GAP) {
    left = rect.left - box.w - GAP
    side = 'right'
  } else {
    left = Math.max(GAP, Math.min(vw - box.w - GAP, rect.left))
    side = 'none'
  }

  const top = Math.max(GAP, Math.min(vh - box.h, rect.top + rect.height / 2 - box.lead))

  /* Kept off the rounded corners at both ends: a beak growing out of a radius
     reads as a rendering fault rather than as a pointer. */
  const caret = Math.max(22, Math.min(box.h - 42, rect.top + rect.height / 2 - top))
  return { centred: false, top, left, side, caret }
}
