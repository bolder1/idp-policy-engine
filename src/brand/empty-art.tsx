import type { ReactNode } from 'react'
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

/* -----------------------------------------------------------------------------
   The rest of the empty pages, drawn like Zones and Device profiles (owner, 20 Nov 2026: "just like zones and device
   profile I want to update all the other svg for empty states"). Design only (ROLLOUT.emptyArt): a call site passes
   `art={NEW_EMPTY_ART && <PoliciesArt />}` (empty-art-phase.ts), and where it is false the icon circle stays.

   Each scene is one object in the inset fill with a soft edge, and one blue badge that drops onto its corner and sends
   out a ring, in the Zones pin's rhythm. `Drop` is that badge, so every scene moves the same way. Only for a page whose
   whole content the empty state is: a compact section, a search that matched nothing and a "not found" keep the icon.
   -------------------------------------------------------------------------- */

export type ArtBadge = 'plus' | 'check' | 'shield' | 'bolt' | 'clock' | 'publish'

const ON = 'var(--surface-raised)'
const mark = { stroke: ON, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

/* The badge's glyph, drawn around 0,0. */
function Glyph({ kind }: { kind: ArtBadge }) {
  if (kind === 'shield')
    return (
      <>
        <path d="M0 -10.5l9 3.6v6c0 5.4-3.8 9.4-9 11-5.2-1.6-9-5.6-9-11v-6z" fill={ACCENT} />
        <path d="M-3.5 0l2.6 2.6 4.6-5" {...mark} />
      </>
    )
  return (
    <>
      <circle r="9" fill={ACCENT} />
      {kind === 'plus' && <path d="M-4 0h8M0 -4v8" {...mark} />}
      {kind === 'check' && <path d="M-4 0.2l2.7 2.7 5-5.2" {...mark} />}
      {kind === 'bolt' && <path d="M1.2 -5l-5 6h4l-1.4 5 5.2-6.2h-4z" fill={ON} />}
      {kind === 'clock' && <path d="M0 -4.5v4.5l3 2" {...mark} />}
      {kind === 'publish' && <path d="M0 4.5v-8.5M-3.5 -0.5L0 -4l3.5 3.5" {...mark} />}
    </>
  )
}

/* The badge dropping onto x,y and the ring it sends out. The position is a plain SVG attribute on an inner group:
   Motion owns the transform of the group it animates. */
function Drop({ x, y, badge }: { x: number; y: number; badge: ArtBadge }) {
  const still = !!useReducedMotion()
  return (
    <>
      <motion.circle
        cx={x}
        cy={y}
        r="6"
        stroke={ACCENT}
        strokeWidth="1.5"
        fill="none"
        initial={{ scale: 0.4, opacity: 0.9 }}
        animate={still ? { scale: 1, opacity: 0 } : { scale: [0.4, 2.4], opacity: [0.9, 0] }}
        transition={still ? undefined : loop(2.4, 0.6)}
      />
      <motion.g animate={still ? undefined : { y: [-10, 0, 0, -10] }} transition={still ? undefined : { ...loop(2.4), times: [0, 0.25, 0.8, 1] }}>
        <g transform={`translate(${x} ${y})`}>
          <Glyph kind={badge} />
        </g>
      </motion.g>
    </>
  )
}

function Scene({ x, y, badge, children }: { x: number; y: number; badge: ArtBadge; children: ReactNode }) {
  return (
    <svg className="bempty__svg" width="132" height="104" viewBox="0 0 132 104" fill="none" aria-hidden>
      {children}
      <Drop x={x} y={y} badge={badge} />
    </svg>
  )
}

const box = { fill: FILL, stroke: SOFT, strokeWidth: 1.5 }
const line = { stroke: SOFT, strokeWidth: 1.5, strokeLinecap: 'round' as const }
type Props = { badge?: ArtBadge }

/* Policies: a page with a shield at its head and three lines of rules. */
export function PoliciesArt({ badge = 'plus' }: Props) {
  return (
    <Scene x={88} y={26} badge={badge}>
      <rect x="42" y="22" width="48" height="66" rx="6" {...box} />
      <path d="M66 32l10 4v7c0 6-4.3 10.4-10 12-5.7-1.6-10-6-10-12v-7z" {...line} />
      <path d="M52 64h28M52 72h28M52 80h18" {...line} />
    </Scene>
  )
}

/* Applications: a window holding four app tiles. */
export function AppsArt({ badge = 'plus' }: Props) {
  return (
    <Scene x={100} y={28} badge={badge}>
      <rect x="30" y="26" width="72" height="58" rx="7" {...box} />
      <path d="M30 38h72" {...line} />
      <rect x="40" y="46" width="22" height="13" rx="3" {...line} />
      <rect x="70" y="46" width="22" height="13" rx="3" {...line} />
      <rect x="40" y="65" width="22" height="11" rx="3" {...line} />
      <rect x="70" y="65" width="22" height="11" rx="3" {...line} />
    </Scene>
  )
}

/* Users: a card with one person on it. */
export function UsersArt({ badge = 'plus' }: Props) {
  return (
    <Scene x={90} y={26} badge={badge}>
      <rect x="40" y="22" width="52" height="66" rx="8" {...box} />
      <circle cx="66" cy="46" r="10" {...line} />
      <path d="M50 78c0-9 7.2-15 16-15s16 6 16 15" {...line} />
    </Scene>
  )
}

/* Groups: three people, the middle one in front. */
export function GroupsArt({ badge = 'plus' }: Props) {
  return (
    <Scene x={78} y={36} badge={badge}>
      <circle cx="42" cy="52" r="8" {...box} />
      <path d="M28 82c0-8 6-13 14-13s14 5 14 13z" {...box} />
      <circle cx="90" cy="52" r="8" {...box} />
      <path d="M76 82c0-8 6-13 14-13s14 5 14 13z" {...box} />
      <circle cx="66" cy="46" r="11" {...box} />
      <path d="M46 86c0-11 9-18 20-18s20 7 20 18z" {...box} />
    </Scene>
  )
}

/* Roles: an ID card with its photo and lines. */
export function RolesArt({ badge = 'shield' }: Props) {
  return (
    <Scene x={100} y={36} badge={badge}>
      <rect x="58" y="24" width="16" height="10" rx="3" {...line} />
      <rect x="30" y="32" width="72" height="50" rx="7" {...box} />
      <rect x="40" y="44" width="20" height="26" rx="4" {...line} />
      <path d="M68 50h24M68 58h24M68 66h14" {...line} />
    </Scene>
  )
}

/* External hooks: this console and an outside system, joined by a dashed call. */
export function HooksArt({ badge = 'bolt' }: Props) {
  return (
    <Scene x={108} y={38} badge={badge}>
      <rect x="18" y="36" width="40" height="40" rx="8" {...box} />
      <rect x="74" y="36" width="40" height="40" rx="8" {...box} />
      <path d="M60 56h12" {...line} strokeDasharray="3 4" />
      <circle cx="38" cy="56" r="8" {...line} />
      <path d="M84 50h20M84 58h20M84 66h12" {...line} />
    </Scene>
  )
}

/* Display tokens: a key fob with its code screen and button. */
export function TokensArt({ badge = 'plus' }: Props) {
  return (
    <Scene x={86} y={24} badge={badge}>
      <rect x="46" y="20" width="40" height="70" rx="12" {...box} />
      <rect x="53" y="31" width="26" height="16" rx="3" {...line} />
      <path d="M58 39h16" {...line} strokeDasharray="2 3" />
      <circle cx="66" cy="68" r="8" {...line} />
    </Scene>
  )
}

/* Sign-in activity: a list of rows, each a mark and a line. */
export function ActivityArt({ badge = 'check' }: Props) {
  return (
    <Scene x={98} y={28} badge={badge}>
      <rect x="32" y="24" width="68" height="64" rx="7" {...box} />
      <rect x="42" y="36" width="8" height="8" rx="2" {...line} />
      <rect x="42" y="52" width="8" height="8" rx="2" {...line} />
      <rect x="42" y="68" width="8" height="8" rx="2" {...line} />
      <path d="M56 40h32M56 56h32M56 72h20" {...line} />
    </Scene>
  )
}

/* Risk signal profiles: a gauge and its needle. */
export function RiskArt({ badge = 'plus' }: Props) {
  return (
    <Scene x={98} y={46} badge={badge}>
      <path d="M30 82a36 36 0 0 1 72 0z" {...box} />
      <path d="M42 82a24 24 0 0 1 48 0" {...line} />
      <path d="M66 82l13-15" {...line} />
      <circle cx="66" cy="82" r="3" fill={SOFT} />
    </Scene>
  )
}

/* Dashboard: two small tiles above a wide one with a chart line. */
export function DashboardArt({ badge = 'plus' }: Props) {
  return (
    <Scene x={102} y={28} badge={badge}>
      <rect x="28" y="26" width="36" height="26" rx="5" {...box} />
      <rect x="68" y="26" width="36" height="26" rx="5" {...box} />
      <rect x="28" y="56" width="76" height="30" rx="5" {...box} />
      <path d="M36 78l12-8 10 4 14-10 12 6 12-5" {...line} strokeLinejoin="round" />
    </Scene>
  )
}

/* A policy's rules: two rule cards in a chain and an empty slot under them. */
export function RulesArt({ badge = 'plus' }: Props) {
  return (
    <Scene x={92} y={26} badge={badge}>
      <rect x="40" y="22" width="52" height="18" rx="5" {...box} />
      <path d="M48 31h24" {...line} />
      <path d="M66 40v7" {...line} />
      <rect x="40" y="47" width="52" height="18" rx="5" {...box} />
      <path d="M48 56h18" {...line} />
      <path d="M66 65v7" {...line} />
      <rect x="40" y="72" width="52" height="18" rx="5" {...line} strokeDasharray="4 3" />
    </Scene>
  )
}
