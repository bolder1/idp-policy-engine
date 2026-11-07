import type { ReactNode } from 'react'
import './stack-art.css'

/* -----------------------------------------------------------------------------
   The old pages' banner picture (owner, 5 Nov 2026: "make the right side static,
   premium, with good visuals"). Still, isometric, in the Walkthrough's language: the
   two old pages as dashed slabs, App Login under Adaptive Access, wired into one solid
   blue policy slab. Nothing moves.
   -------------------------------------------------------------------------- */

const C = 0.866
const S = 0.5
type P = [number, number]
const iso = (x: number, y: number, z = 0): P => [170 + (x - y) * C, 100 + (x + y) * S - z]
const pts = (a: P[]) => a.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')

function Slab({ x, y, z = 0, w, d, h = 7, tone, children }: { x: number; y: number; z?: number; w: number; d: number; h?: number; tone: 'old' | 'new'; children?: ReactNode }) {
  const top = [iso(x, y, z + h), iso(x + w, y, z + h), iso(x + w, y + d, z + h), iso(x, y + d, z + h)]
  const front = [iso(x, y + d, z + h), iso(x + w, y + d, z + h), iso(x + w, y + d, z), iso(x, y + d, z)]
  const side = [iso(x + w, y, z + h), iso(x + w, y + d, z + h), iso(x + w, y + d, z), iso(x + w, y, z)]
  const [tx, ty] = iso(x, y, z + h)
  return (
    <g className={`bsa__slab is-${tone}`}>
      <polygon points={pts(front)} className="bsa__front" />
      <polygon points={pts(side)} className="bsa__side" />
      <polygon points={pts(top)} className="bsa__top" />
      {children && <g transform={`matrix(${C},${S},${-C},${S},${tx.toFixed(1)},${ty.toFixed(1)})`}>{children}</g>}
    </g>
  )
}

export function StackArt() {
  const wire = [iso(-20, 40, 4), iso(16, 40, 4), iso(16, -40, 4), iso(50, -40, 4)]
  return (
    <svg className="bsa" viewBox="0 0 380 170" role="img" aria-label="App Login and Adaptive Access policies becoming one policy">
      <defs>
        <filter id="bsa-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="b" />
          <feColorMatrix in="b" type="matrix" values="0 0 0 0 0.05  0 0 0 0 0.43  0 0 0 0 0.99  0 0 0 0.45 0" />
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {/* the old pages, stacked */}
      <Slab x={-120} y={10} w={100} d={64} tone="old">
        <text x={8} y={56} className="bsa__t">App Login</text>
      </Slab>
      <Slab x={-120} y={10} z={34} w={100} d={64} tone="old">
        <text x={8} y={56} className="bsa__t">Adaptive Access</text>
      </Slab>
      {/* the wire */}
      <path d={`M${wire.map((p) => p.join(' ')).join(' L')}`} className="bsa__wire" />
      <circle cx={wire[3][0]} cy={wire[3][1]} r={3} className="bsa__dot" />
      {/* the new policy */}
      <g filter="url(#bsa-glow)">
        <Slab x={50} y={-70} w={96} d={62} h={10} tone="new">
          <path d="M14 18 L22 15 L30 18 V24 C30 29 26 32 22 34 C18 32 14 29 14 24 Z" className="bsa__shield" />
          <text x={38} y={28} className="bsa__t is-new">One policy</text>
          <text x={14} y={50} className="bsa__t is-sub">per application</text>
        </Slab>
      </g>
    </svg>
  )
}
