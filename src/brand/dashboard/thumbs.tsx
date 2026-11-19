import type { ReactNode } from 'react'
import type { Kind } from './model'

/* A small picture of each way a widget shows its data, for the library and for the templates' miniature
   boards. Drawn in the current text colour at a few strengths, so it sits in any surface the console has. */

const a = (o: number) => ({ fill: 'currentColor', opacity: o })
const line = (o: number, w = 1.6) => ({ fill: 'none', stroke: 'currentColor', strokeWidth: w, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, opacity: o })

const rows = (n: number, draw: (y: number, i: number) => ReactNode) => Array.from({ length: n }, (_, i) => draw(8 + i * 11, i))

const ART: Record<Kind, ReactNode> = {
  stat: (
    <>
      <rect x="6" y="7" width="20" height="4" rx="2" {...a(0.3)} />
      <rect x="44" y="6" width="14" height="6" rx="3" {...a(0.16)} />
      <rect x="6" y="17" width="26" height="10" rx="2.5" {...a(0.9)} />
      <rect x="6" y="33" width="34" height="3.5" rx="1.75" {...a(0.25)} />
    </>
  ),
  area: (
    <>
      <path d="M4 34C12 34 13 15 22 15s9 12 17 12 9-17 21-17v30H4z" {...a(0.16)} />
      <path d="M4 34C12 34 13 15 22 15s9 12 17 12 9-17 21-17" {...line(0.9)} />
    </>
  ),
  bars: (
    <>
      {[20, 12, 26, 16, 30, 22, 14].map((h, i) => (
        <rect key={i} x={6 + i * 8} y={38 - h} width="5" height={h} rx="1.5" {...a(i === 4 ? 0.9 : 0.5)} />
      ))}
    </>
  ),
  barlist: (
    <>
      {[46, 36, 28, 18].map((w, i) => (
        <rect key={i} x="6" y={6 + i * 9} width={w} height="6" rx="2" {...a(0.9 - i * 0.2)} />
      ))}
    </>
  ),
  donut: (
    <>
      <circle cx="32" cy="22" r="13" {...line(0.2, 6)} />
      <path d="M32 9a13 13 0 1 1-12.4 16.9" {...line(0.9, 6)} strokeLinecap="butt" />
    </>
  ),
  gauge: (
    <>
      <path d="M19.5 33.5a16 16 0 1 1 25 0" {...line(0.2, 5)} />
      <path d="M19.5 33.5a16 16 0 0 1 4-23.6" {...line(0.9, 5)} />
    </>
  ),
  catbar: (
    <>
      <rect x="6" y="12" width="30" height="7" rx="3.5" {...a(0.9)} />
      <rect x="38" y="12" width="12" height="7" rx="2" {...a(0.5)} />
      <rect x="52" y="12" width="6" height="7" rx="3" {...a(0.2)} />
      <rect x="6" y="28" width="14" height="3.5" rx="1.75" {...a(0.3)} />
      <rect x="25" y="28" width="14" height="3.5" rx="1.75" {...a(0.3)} />
      <rect x="44" y="28" width="14" height="3.5" rx="1.75" {...a(0.3)} />
    </>
  ),
  heat: (
    <>
      {Array.from({ length: 4 }, (_, r) =>
        Array.from({ length: 8 }, (_, c) => <rect key={`${r}${c}`} x={5 + c * 7} y={7 + r * 8} width="5.5" height="6" rx="1.5" {...a([0.12, 0.3, 0.55, 0.9][(r * 3 + c * 5 + (c > 2 && c < 6 ? 2 : 0)) % 4])} />),
      )}
    </>
  ),
  tracker: (
    <>
      <rect x="6" y="9" width="22" height="4" rx="2" {...a(0.3)} />
      {Array.from({ length: 14 }, (_, i) => (
        <rect key={i} x={6 + i * 3.8} y="20" width="2.6" height="14" rx="1.2" {...a(i === 5 || i === 10 ? 0.2 : 0.75)} />
      ))}
    </>
  ),
  funnel: (
    <>
      {[52, 44, 34, 26].map((w, i) => (
        <rect key={i} x="6" y={6 + i * 9} width={w} height="6" rx="3" {...a(0.9 - i * 0.2)} />
      ))}
    </>
  ),
  list: (
    <>
      {rows(3, (y, i) => (
        <g key={i}>
          <circle cx="10" cy={y + 3} r="4" {...a(0.3)} />
          <rect x="18" y={y} width="26" height="3.5" rx="1.75" {...a(0.8)} />
          <rect x="18" y={y + 5} width="16" height="2.5" rx="1.25" {...a(0.25)} />
          <rect x="50" y={y + 1} width="8" height="4" rx="2" {...a(0.2)} />
        </g>
      ))}
    </>
  ),
  feed: (
    <>
      <path d="M10 6v32" {...line(0.18, 1.2)} />
      {rows(3, (y, i) => (
        <g key={i}>
          <circle cx="10" cy={y + 3} r="3.5" {...a(0.75)} />
          <rect x="18" y={y} width="30" height="3.5" rx="1.75" {...a(0.8)} />
          <rect x="18" y={y + 5} width="18" height="2.5" rx="1.25" {...a(0.25)} />
        </g>
      ))}
    </>
  ),
  table: (
    <>
      <rect x="5" y="6" width="54" height="7" rx="2" {...a(0.14)} />
      {rows(3, (y, i) => (
        <g key={i}>
          <rect x="8" y={y + 9} width="14" height="3" rx="1.5" {...a(0.75)} />
          <rect x="27" y={y + 9} width="12" height="3" rx="1.5" {...a(0.3)} />
          <rect x="46" y={y + 9} width="10" height="3" rx="1.5" {...a(0.3)} />
        </g>
      ))}
    </>
  ),
  checklist: (
    <>
      {rows(3, (y, i) => (
        <g key={i}>
          <circle cx="10" cy={y + 3} r="4" {...(i < 2 ? a(0.85) : line(0.4, 1.4))} />
          <rect x="18" y={y + 1} width={[30, 24, 34][i]} height="3.5" rx="1.75" {...a(i < 2 ? 0.35 : 0.8)} />
        </g>
      ))}
    </>
  ),
  meters: (
    <>
      {rows(3, (y, i) => (
        <g key={i}>
          <rect x="6" y={y + 2} width="52" height="4" rx="2" {...a(0.15)} />
          <rect x="6" y={y + 2} width={[42, 26, 14][i]} height="4" rx="2" {...a(0.85)} />
        </g>
      ))}
    </>
  ),
  grid: (
    <>
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <rect x={6 + (i % 2) * 28} y={6 + Math.floor(i / 2) * 17} width="24" height="14" rx="3" {...a(0.12)} />
          <rect x={10 + (i % 2) * 28} y={10 + Math.floor(i / 2) * 17} width="9" height="6" rx="1.5" {...a(0.85)} />
        </g>
      ))}
    </>
  ),
  actions: (
    <>
      <rect x="6" y="6" width="52" height="9" rx="3" {...a(0.9)} />
      {rows(2, (y, i) => (
        <g key={i}>
          <rect x="6" y={y + 13} width="5" height="5" rx="1.5" {...a(0.4)} />
          <rect x="15" y={y + 14} width="26" height="3" rx="1.5" {...a(0.6)} />
          <path d={`M54 ${y + 13}l2.5 2.5-2.5 2.5`} {...line(0.4, 1.3)} />
        </g>
      ))}
    </>
  ),
  form: (
    <>
      <rect x="6.6" y="6.6" width="50.8" height="8.8" rx="2.4" {...line(0.35, 1.2)} />
      <rect x="6.6" y="18.6" width="50.8" height="8.8" rx="2.4" {...line(0.35, 1.2)} />
      <rect x="6" y="31" width="18" height="8" rx="2.5" {...a(0.85)} />
      <rect x="29" y="33.5" width="16" height="3" rx="1.5" {...a(0.3)} />
    </>
  ),
  strip: (
    <>
      <rect x="6" y="16" width="9" height="9" rx="2.5" {...a(0.3)} />
      <rect x="19" y="15" width="16" height="3.5" rx="1.75" {...a(0.8)} />
      <rect x="19" y="22" width="12" height="2.5" rx="1.25" {...a(0.25)} />
      <rect x="39" y="18" width="19" height="5" rx="2.5" {...a(0.7)} />
    </>
  ),
  note: (
    <>
      <rect x="6" y="8" width="22" height="4" rx="2" {...a(0.85)} />
      <rect x="6" y="18" width="50" height="3" rx="1.5" {...a(0.3)} />
      <rect x="6" y="25" width="44" height="3" rx="1.5" {...a(0.3)} />
      <rect x="6" y="32" width="30" height="3" rx="1.5" {...a(0.3)} />
    </>
  ),
}

/** The picture for one kind of widget. It fills the box it is given and keeps its shape. */
export function Thumb({ kind }: { kind: Kind }) {
  return (
    <svg className="bdash-thumb" viewBox="0 0 64 44" preserveAspectRatio="xMidYMid meet" aria-hidden>
      {ART[kind]}
    </svg>
  )
}
