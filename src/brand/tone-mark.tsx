import { motion, useReducedMotion } from 'motion/react'

import { MARK_AFTER as AFTER, MARK_EASE as EASE, TONE_PATHS as P, type ToastTone } from './toast-tone'

/* --- The tone mark, drawn ----------------------------------------------------

   The confirm hero's 64px badge, with its glyph drawn stroke by stroke instead
   of printed (owner, 22 Oct 2026: "add a lottie style svg for the icons … a
   good delete with animated svg").

   NO LOTTIE. A player is 168-306 KB and a JSON asset to keep in step with an
   icon set we already own; this is five `motion.path`s and costs nothing new.
   The mechanism is the one focus2-draw.tsx established for the Focus canvas —
   Lucide's own path strings, copied so they can be `motion.path`s, because a
   Lucide component cannot take `pathLength`.

   THE HERO ONLY. The rows shape marks severity with a 34px chip at icon size
   17, where none of this reads — it keeps the plain Lucide component. One
   animation, at the one size that can carry it.

   WHY EVERY DRAW ALSO CARRIES `opacity`. Motion implements `pathLength` as a
   dash pattern, so a path waiting out its delay sits at `stroke-dasharray: 0 1`
   — and a ROUND-capped stroke of zero length renders a full dot at its start
   point, which is what the SVG spec says it should do. Without the opacity a
   delayed stroke parks a 2px blob in the middle of the badge until its turn.
   The 10ms opacity is a switch, not a fade; focus2-route.tsx drives its lines
   the same way, for the same reason.

   WHY `reduce` SHORT-CIRCUITS TO NOTHING. Motion's own reduced-motion only
   flattens positional values — the transform props, width, height, the insets.
   `pathLength` is none of those, so under `prefers-reduced-motion` a draw-on
   keeps running unless it is gated by hand. A glyph assembling itself is a
   change of apparent shape and the lid tilt is movement, so both go and the
   finished icon is simply rendered. Same choice the rings and the badge already
   make in the kit.

   THE TRANSFORM RULE. Nothing here sets a CSS `transform`: Motion composes its
   own into the inline style and would overwrite it. `transform-origin` is not
   `transform` and is safe, which is how the lid gets a hinge. On an SVG motion
   element `y` is a TRANSFORM, not the attribute — `attrY` would move a path's
   anchor and bend the icon out of shape.
   -------------------------------------------------------------------------- */

/** A stroke that draws itself, `at` seconds after the badge has landed. */
const draw = (at: number, ms: number, reduce: boolean) =>
  reduce
    ? ({ initial: false } as const)
    : ({
        initial: { pathLength: 0, opacity: 0 },
        animate: { pathLength: 1, opacity: 1 },
        transition: {
          pathLength: { delay: AFTER + at, duration: ms / 1000, ease: EASE },
          opacity: { delay: AFTER + at, duration: 0.01 },
        },
      } as const)

/* A dot is never drawn. `M12 17h.01` is a hundredth of a unit long, so drawing
   it either pops it whole or never shows it at all; a disc that springs in
   reads as a dot being set down. (focus2-draw.tsx does this for the key's
   notch, and for the same reason.) */
function Dot({ at, reduce, cx, cy }: { at: number; reduce: boolean; cx: number; cy: number }) {
  return (
    <motion.circle
      cx={cx}
      cy={cy}
      r={1}
      fill="currentColor"
      stroke="none"
      style={{ transformOrigin: `${cx}px ${cy}px` }}
      initial={reduce ? false : { opacity: 0, scale: 0 }}
      animate={reduce ? undefined : { opacity: 1, scale: 1 }}
      transition={{ delay: AFTER + at, type: 'spring', stiffness: 700, damping: 18 }}
    />
  )
}

/* The enclosing ring the three circular marks share, started at twelve
   o'clock. A circle draws from three o'clock by default; `pathOffset` moves
   where the dash begins, and it is set in both initial and animate so Motion
   holds it rather than animating it. */
function Ring({ reduce }: { reduce: boolean }) {
  if (reduce) return <circle cx="12" cy="12" r="10" />
  return (
    <motion.circle
      cx="12"
      cy="12"
      r="10"
      initial={{ pathLength: 0, pathOffset: 0.75, opacity: 0 }}
      animate={{ pathLength: 1, pathOffset: 0.75, opacity: 1 }}
      transition={{ pathLength: { delay: AFTER, duration: 0.38, ease: EASE }, opacity: { delay: AFTER, duration: 0.01 } }}
    />
  )
}

export function ToneMark({ tone, size = 26, strokeWidth = 1.75 }: { tone: ToastTone; size?: number; strokeWidth?: number }) {
  const reduce = useReducedMotion() === true

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {/* REMOVED — the lid is already open, the can draws itself, the contents
          drop in, the lid shuts. The bars start at y=11 and draw downward, so
          the falling is the drawing; they only need a few pixels of travel on
          top to read as contents rather than as slots. */}
      {tone === 'removed' && (
        <>
          <motion.g
            style={{ transformOrigin: P.removed.hinge }}
            initial={reduce ? false : { rotate: -22 }}
            animate={reduce ? undefined : { rotate: 0 }}
            transition={{ delay: AFTER + 0.34, type: 'spring', stiffness: 420, damping: 16 }}
          >
            <motion.path d={P.removed.lid[0]} {...draw(0, 200, reduce)} />
            <motion.path d={P.removed.lid[1]} {...draw(0.06, 180, reduce)} />
          </motion.g>
          <motion.path d={P.removed.body} {...draw(0.1, 300, reduce)} />
          {P.removed.bars.map((d, i) =>
            reduce ? (
              <path key={d} d={d} />
            ) : (
              <motion.path
                key={d}
                d={d}
                initial={{ pathLength: 0, opacity: 0, y: -3 }}
                animate={{ pathLength: 1, opacity: 1, y: 0 }}
                transition={{
                  pathLength: { delay: AFTER + 0.26 + i * 0.07, duration: 0.19, ease: EASE },
                  opacity: { delay: AFTER + 0.26 + i * 0.07, duration: 0.01 },
                  y: { delay: AFTER + 0.26 + i * 0.07, duration: 0.19, ease: EASE },
                }}
              />
            ),
          )}
        </>
      )}

      {/* WARNING — the outline draws, the bar drops in, the dot lands, then one
          knock from the base. The knock is the console's own shake, turned into
          a rotation so the triangle rocks on its feet instead of sliding. */}
      {tone === 'warning' && (
        <motion.g
          style={{ transformOrigin: P.warning.pivot }}
          initial={false}
          animate={reduce ? undefined : { rotate: [0, -4, 3, -2, 0] }}
          transition={{ rotate: { delay: AFTER + 0.52, duration: 0.34, times: [0, 0.3, 0.55, 0.78, 1], ease: 'linear' } }}
        >
          <motion.path d={P.warning.body} {...draw(0, 420, reduce)} />
          <motion.path d={P.warning.bar} {...draw(0.3, 160, reduce)} />
          <Dot at={0.47} reduce={reduce} cx={P.warning.dot[0]} cy={P.warning.dot[1]} />
        </motion.g>
      )}

      {/* SUCCESS — the ring, then the tick. No pop of its own: the badge behind
          it has already sprung, and two springs on one mark fight. */}
      {tone === 'success' && (
        <>
          <Ring reduce={reduce} />
          <motion.path d={P.success.tick} {...draw(0.3, 220, reduce)} />
        </>
      )}

      {/* ERROR — the ring, then the two strokes a tenth of a second apart. No
          knock: this tone is the refusal, where there is nothing the admin can
          do, and shaking at somebody who has no move to make is a scold. */}
      {tone === 'error' && (
        <>
          <Ring reduce={reduce} />
          <motion.path d={P.error.down} {...draw(0.28, 160, reduce)} />
          <motion.path d={P.error.up} {...draw(0.38, 160, reduce)} />
        </>
      )}

      {/* INFO — the dot is set down first and the stem grows away from it. */}
      {tone === 'info' && (
        <>
          <Ring reduce={reduce} />
          <Dot at={0.26} reduce={reduce} cx={P.info.dot[0]} cy={P.info.dot[1]} />
          <motion.path d={P.info.stem} {...draw(0.34, 150, reduce)} />
        </>
      )}
    </svg>
  )
}
