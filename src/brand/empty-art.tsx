import { motion, useReducedMotion } from 'motion/react'

/* -----------------------------------------------------------------------------
   Animated drawings for the empty pages (owner, 18 Nov 2026: "for each empty state give an animated svg").

   One small scene per library, drawn in the console's tokens: a line in the muted text colour, a fill in the inset
   surface, and the selection blue for the one thing that moves. Each loops slowly and quietly; with reduced motion it
   is drawn still, at rest. The component name says what it shows; `EmptyState` puts it where the icon circle was.
   -------------------------------------------------------------------------- */

const LINE = 'var(--text-muted)'
const SOFT = 'var(--border-default)'
const FILL = 'var(--surface-inset)'
const ACCENT = 'var(--blue)'

const loop = (duration: number, delay = 0) => ({ duration, delay, repeat: Infinity, ease: 'easeInOut' as const })

/* Zones: a globe and a pin that drops onto it and sends out a ring. No orbit (owner, 18 Nov 2026: "make it minimal"). */
export function ZonesArt() {
  const still = !!useReducedMotion()
  return (
    <svg className="bempty__svg" width="132" height="104" viewBox="0 0 132 104" fill="none" aria-hidden>
      <circle cx="66" cy="58" r="34" fill={FILL} stroke={SOFT} strokeWidth="1.5" />
      <ellipse cx="66" cy="58" rx="14" ry="34" stroke={SOFT} strokeWidth="1.5" />
      <path d="M32 58h68M37 41h58M37 75h58" stroke={SOFT} strokeWidth="1.5" />
      <motion.circle
        cx="78"
        cy="50"
        r="6"
        stroke={ACCENT}
        strokeWidth="1.5"
        fill="none"
        initial={{ scale: 0.4, opacity: 0.9 }}
        animate={still ? { scale: 1, opacity: 0 } : { scale: [0.4, 2.4], opacity: [0.9, 0] }}
        transition={still ? undefined : loop(2.4, 0.6)}
      />
      <motion.g animate={still ? undefined : { y: [-10, 0, 0, -10] }} transition={still ? undefined : { ...loop(2.4), times: [0, 0.25, 0.8, 1] }}>
        <path d="M78 50c0 0-9-9.6-9-16a9 9 0 0 1 18 0c0 6.4-9 16-9 16z" fill={ACCENT} />
        <circle cx="78" cy="34" r="3.2" fill="var(--surface-raised)" />
      </motion.g>
    </svg>
  )
}

/* Device profiles: a phone drawn like the Zones globe, and a shield that drops onto its corner and sends out a ring, in
   the pin's rhythm (owner, 18 Nov 2026: "simplified", then "something like zones"). */
export function DevicesArt() {
  const still = !!useReducedMotion()
  return (
    <svg className="bempty__svg" width="132" height="104" viewBox="0 0 132 104" fill="none" aria-hidden>
      {/* The phone, drawn as the Zones globe is: inset fill, soft edge, a few inner lines, about its size. */}
      <rect x="44" y="24" width="44" height="68" rx="9" fill={FILL} stroke={SOFT} strokeWidth="1.5" />
      <rect x="50" y="34" width="32" height="46" rx="3" stroke={SOFT} strokeWidth="1.5" />
      <path d="M61 29h10M60 86h12" stroke={SOFT} strokeWidth="1.5" strokeLinecap="round" />
      <motion.circle
        cx="80"
        cy="42"
        r="6"
        stroke={ACCENT}
        strokeWidth="1.5"
        fill="none"
        initial={{ scale: 0.4, opacity: 0.9 }}
        animate={still ? { scale: 1, opacity: 0 } : { scale: [0.4, 2.4], opacity: [0.9, 0] }}
        transition={still ? undefined : loop(2.4, 0.6)}
      />
      <motion.g animate={still ? undefined : { y: [-10, 0, 0, -10] }} transition={still ? undefined : { ...loop(2.4), times: [0, 0.25, 0.8, 1] }}>
        <path d="M80 24l9 3.6v6c0 5.4-3.8 9.4-9 11-5.2-1.6-9-5.6-9-11v-6z" fill={ACCENT} />
        <path d="M76.5 34.5l2.6 2.6 4.6-5" stroke="var(--surface-raised)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </motion.g>
    </svg>
  )
}

/* Favorites: three policy cards, the middle one lifting while its star fills. */
export function FavoritesArt() {
  const still = !!useReducedMotion()
  return (
    <svg className="bempty__svg" width="132" height="104" viewBox="0 0 132 104" fill="none" aria-hidden>
      <rect x="10" y="34" width="34" height="44" rx="5" fill={FILL} stroke={SOFT} strokeWidth="1.5" />
      <rect x="88" y="34" width="34" height="44" rx="5" fill={FILL} stroke={SOFT} strokeWidth="1.5" />
      <motion.g animate={still ? undefined : { y: [0, -6, -6, 0] }} transition={still ? undefined : { ...loop(3.2), times: [0, 0.3, 0.75, 1] }}>
        <rect x="44" y="22" width="44" height="58" rx="6" fill="var(--surface-raised)" stroke={LINE} strokeWidth="1.5" />
        <rect x="52" y="58" width="28" height="4" rx="2" fill={SOFT} />
        <rect x="52" y="67" width="18" height="4" rx="2" fill={SOFT} />
        <motion.path
          d="M66 31l3.4 6.9 7.6 1.1-5.5 5.4 1.3 7.6-6.8-3.6-6.8 3.6 1.3-7.6-5.5-5.4 7.6-1.1z"
          stroke={ACCENT}
          strokeWidth="1.5"
          strokeLinejoin="round"
          initial={{ fill: still ? ACCENT : 'rgba(0,0,0,0)' }}
          animate={still ? undefined : { fill: ['rgba(0,0,0,0)', ACCENT, ACCENT, 'rgba(0,0,0,0)'] }}
          transition={still ? undefined : { ...loop(3.2), times: [0.15, 0.35, 0.75, 0.95] }}
        />
      </motion.g>
    </svg>
  )
}
