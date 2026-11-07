import { motion, useReducedMotion } from 'motion/react'

/* -----------------------------------------------------------------------------
   The last fortnight's picture (owner, 4 Nov 2026: "a triangle attention kind of cartoonish
   SVG"). A fat warning triangle with a "!" that hops and wobbles on its shadow, a few
   little marks flicking round it like a cartoon alarm. `hurry` is the last week: the same
   picture, quicker. One ink for the outlines, the stage's own tint for the fill. Motion
   props only; reduced motion draws it still.
   -------------------------------------------------------------------------- */

export function AlertArt({ hurry = false }: { hurry?: boolean }) {
  const still = useReducedMotion()
  const beat = hurry ? 0.9 : 1.5
  return (
    <svg className="bmalert" viewBox="0 0 140 110" role="img" aria-label="Time is nearly up">
      {/* The shadow, squashing as the triangle lands */}
      <motion.ellipse
        className="bmalert__shadow"
        cx="70"
        cy="100"
        rx="30"
        ry="5"
        style={{ originX: '70px', originY: '100px' }}
        initial={false}
        animate={still ? undefined : { scaleX: [1, 0.7, 1], opacity: [0.5, 0.25, 0.5] }}
        transition={still ? undefined : { duration: beat, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.g
        style={{ originX: '70px', originY: '92px' }}
        initial={false}
        animate={still ? undefined : { y: [0, -12, 0, 0], rotate: [0, -6, 5, 0] }}
        transition={still ? undefined : { duration: beat, repeat: Infinity, ease: 'easeInOut', times: [0, 0.4, 0.75, 1] }}
      >
        <path className="bmalert__tri" d="M70 14 C74 14 76 16 78 19 L108 80 C111 86 108 92 101 92 H39 C32 92 29 86 32 80 L62 19 C64 16 66 14 70 14 Z" />
        <path className="bmalert__shine" d="M60 34 L48 60" />
        <path className="bmalert__bang" d="M70 40 V64" />
        <circle className="bmalert__dot" cx="70" cy="77" r="4.5" />
      </motion.g>
      {/* The marks round it, flicking on and off in turn */}
      {[
        'M28 30 l-9 -6',
        'M22 52 h-10',
        'M112 30 l9 -6',
        'M118 52 h10',
      ].map((d, i) => (
        <motion.path
          key={d}
          className="bmalert__mark"
          d={d}
          initial={false}
          animate={still ? { opacity: 1 } : { opacity: [0, 1, 0] }}
          transition={still ? undefined : { duration: beat, delay: (i % 2) * (beat / 2), repeat: Infinity }}
        />
      ))}
    </svg>
  )
}
