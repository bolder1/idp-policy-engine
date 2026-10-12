import { motion, useReducedMotion } from 'motion/react'

import type { ArtKind } from './finding-card'

/* -----------------------------------------------------------------------------
   A finding's picture (owner, 6 Oct 2026: "add animated illustrations to
   showcase, highlight and draw attention"), at the right of its card, looping
   slowly — what is going on, seen before it is read:

     policies   two policy cards, one over the other: the one under it peeks
                out and slides back — it covers the person too, and is not used
     rules      three rules: the one that also applies rises towards the top,
                where the fix would put it, and settles back

   SVG attributes moved by Motion (never a CSS transform on a motion element);
   still under reduced motion. Colours are tokens, by class (journey.css
   `.tj-art`). Decorative: hidden from assistive tech, the card's words say it.
   -------------------------------------------------------------------------- */

const LOOP = { duration: 2.8, ease: 'easeInOut', repeat: Infinity, repeatDelay: 0.6 } as const

export function FindingArt({ kind }: { kind: ArtKind }) {
  const still = useReducedMotion() === true
  return (
    <svg className="tj-art" viewBox="0 0 88 64" width="88" height="64" aria-hidden focusable="false">
      {kind === 'policies' ? (
        <>
          {/* The one that covers them too, under the one that applies. */}
          <motion.rect
            className="tj-art__card is-also"
            x="26"
            width="54"
            height="30"
            rx="6"
            initial={false}
            animate={still ? { y: 6 } : { y: [14, 4, 4, 14] }}
            transition={still ? { duration: 0 } : { ...LOOP, times: [0, 0.35, 0.7, 1] }}
          />
          <rect className="tj-art__card is-win" x="8" y="24" width="54" height="32" rx="6" />
          <rect className="tj-art__line" x="16" y="33" width="26" height="4" rx="2" />
          <rect className="tj-art__line" x="16" y="42" width="38" height="4" rx="2" />
          <motion.circle
            className="tj-art__ring"
            cx="58"
            cy="26"
            initial={false}
            animate={still ? { r: 5, opacity: 1 } : { r: [4, 9, 4], opacity: [1, 0, 1] }}
            transition={still ? { duration: 0 } : LOOP}
          />
          <circle className="tj-art__dot" cx="58" cy="26" r="4" />
        </>
      ) : (
        <>
          <rect className="tj-art__row" x="8" y="6" width="72" height="12" rx="4" />
          <rect className="tj-art__row" x="8" y="26" width="72" height="12" rx="4" />
          {/* The rule that also applies, rising to where the fix puts it. */}
          <motion.rect
            className="tj-art__row is-also"
            x="8"
            width="72"
            height="12"
            rx="4"
            initial={false}
            animate={still ? { y: 46 } : { y: [46, 2, 2, 46] }}
            transition={still ? { duration: 0 } : { ...LOOP, times: [0, 0.4, 0.7, 1] }}
          />
        </>
      )}
    </svg>
  )
}
