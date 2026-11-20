import { useId } from 'react'
import type { Line } from './lines'

/* -----------------------------------------------------------------------------
   Who the account menu names on each line, and the badge it shows for them (owner, 20 Nov 2026: "change this based
   on roles and add a 3D svg for tester and for dev to distinguish, and change the name as well … for all 3").

   The badge is a lit sphere with a raised glyph: a top highlight, a darker lower edge and a glyph that casts a small
   shadow, so it reads as an object rather than a flat disc. Each line has its own colour from the tokens (Design
   slate, Dev handoff blue, Tester green; never the orange, which is for the one primary button) and its own glyph
   (a pen nib, code brackets, a magnifier with a check).
   -------------------------------------------------------------------------- */

/* Light, body and deep shade for each line's sphere. */
const TONE: Record<Line, [string, string, string]> = {
  design: ['var(--shell-text-muted)', 'var(--shell-raised)', 'var(--shell-bg-deep)'],
  handoff: ['var(--blue-soft-hover)', 'var(--blue)', 'var(--blue-strong)'],
  tester: ['var(--fb-positive-border)', 'var(--fb-positive-dot)', 'var(--fb-positive-strong-fg)'],
}

/* Each glyph drawn once; it is painted twice, a shadow under the white face, which gives it its height. */
function Glyph({ line, fill, stroke }: { line: Line; fill: string; stroke: string }) {
  if (line === 'design')
    return (
      <g>
        <path d="M20 10.5 L27 18.5 L22.2 28.5 H17.8 L13 18.5 Z" fill={fill} />
        <path d="M20 18.5 V24.5" stroke={stroke} strokeWidth={1.4} strokeLinecap="round" />
        <circle cx={20} cy={18} r={1.7} fill={stroke} />
      </g>
    )
  if (line === 'handoff')
    return (
      <g fill="none" stroke={fill} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
        <path d="M15.5 14.5 L10.5 20 L15.5 25.5" />
        <path d="M24.5 14.5 L29.5 20 L24.5 25.5" />
        <path d="M21.6 12.5 L18.4 27.5" />
      </g>
    )
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      <circle cx={18.5} cy={18.5} r={6.5} stroke={fill} strokeWidth={2.6} />
      <path d="M23.4 23.4 L28.5 28.5" stroke={fill} strokeWidth={3.2} />
      <path d="M15.6 18.7 L17.8 20.8 L21.4 16.6" stroke={fill} strokeWidth={2} />
    </g>
  )
}

/** The line's badge, `size` pixels square. Decorative: the name beside it or the button's label says who it is. */
export function RoleAvatar({ line, size }: { line: Line; size: number }) {
  const id = useId().replace(/:/g, '')
  const [light, body, deep] = TONE[line]
  return (
    <svg className="role-avatar" width={size} height={size} viewBox="0 0 40 40" aria-hidden focusable="false">
      <defs>
        <radialGradient id={`${id}-body`} cx="34%" cy="28%" r="78%">
          <stop offset="0%" style={{ stopColor: light }} />
          <stop offset="45%" style={{ stopColor: body }} />
          <stop offset="100%" style={{ stopColor: deep }} />
        </radialGradient>
        <linearGradient id={`${id}-shine`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity={0.55} />
          <stop offset="100%" stopColor="#fff" stopOpacity={0} />
        </linearGradient>
      </defs>
      {/* The sphere, its rim and the light across its top. */}
      <circle cx={20} cy={20} r={19} fill={`url(#${id}-body)`} />
      <circle cx={20} cy={20} r={18.4} fill="none" stroke="#fff" strokeOpacity={0.22} strokeWidth={1.2} />
      <ellipse cx={17} cy={11} rx={11} ry={6.5} fill={`url(#${id}-shine)`} />
      {/* The glyph: its shadow a step down and right, then its face. */}
      <g transform="translate(0.9 1.4)" opacity={0.35}>
        <Glyph line={line} fill="#000" stroke="#000" />
      </g>
      <Glyph line={line} fill="#fff" stroke={deep} />
    </svg>
  )
}
