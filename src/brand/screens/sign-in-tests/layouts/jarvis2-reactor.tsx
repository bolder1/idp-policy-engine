import { motion } from 'motion/react'
import { memo, type CSSProperties, type ReactNode } from 'react'

import { Decode } from './jarvis2-decode'
import { arc, polar, rails, readoutXs, wedgePath, wedgeSpan, type Geo, type WedgeId } from './jarvis2-geometry'
import type { Core, Readout } from './jarvis2-model'

/* -----------------------------------------------------------------------------
   The reactor's chrome (JarvisLayout.tsx): the ground layer — the four wedges'
   glass on their docking rails with clamps, leader spokes and bezel brackets,
   the compass arc on top with the pointer, the readouts' leader lines — the
   idle rings that turn slowly on their own layers, and the CORE, the verdict.

   Decoration is shapes only (rings, ticks, arcs, brackets, bezels): every
   word and number on it is the run's (jarvis-model.ts).
   -------------------------------------------------------------------------- */

const f = (n: number) => n.toFixed(1)
const WEDGES: WedgeId[] = ['who', 'policies', 'decision', 'rules']

/** The ground: wedges, rails, clamps, spokes, brackets, the compass. Static: drawn again only when the canvas or a readout's tone changes. */
export const Ground = memo(function Ground({ g, boot, tones }: { g: Geo; boot: boolean; tones: string }) {
  const readouts = tones.split(',').map((tone, i) => ({ key: String(i), tone }))
  const R = g.R
  const rl = rails(g)
  const P = (r: number, a: number) => polar(g, r, a)
  const xs = readoutXs(g)
  return (
    <svg className={`jv2-ground${boot ? ' is-boot' : ''}`} width={g.W} height={g.H} viewBox={`0 0 ${g.W} ${g.H}`} aria-hidden>
      <defs>
        <linearGradient id="jv2-wedge-fill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0a1d36" stopOpacity="0.9" />
          <stop offset="1" stopColor="#061427" stopOpacity="0.72" />
        </linearGradient>
        <radialGradient id="jv2-bed" cx="50%" cy="50%" r="50%">
          <stop offset="0.35" stopColor="#0a2340" stopOpacity="0" />
          <stop offset="0.8" stopColor="#0b2846" stopOpacity="0.4" />
          <stop offset="1" stopColor="#0b2846" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={g.CX} cy={g.CY} r={g.RW + 34} fill="url(#jv2-bed)" />
      {WEDGES.map((id, i) => (
        <path key={id} className="jv2-wedge" d={wedgePath(g, id)} pathLength={1} style={{ '--jv2-i': i } as CSSProperties} />
      ))}
      {WEDGES.map((id) => {
        const [a0, a1] = rl[id]
        const m = (a0 + a1) / 2
        const h = (a1 - a0) * 0.3
        const [sx0, sy0] = P(R.tick + 12, m)
        const [sx1, sy1] = P(g.RW - 9, m)
        return (
          <g key={id} className="jv2-dock">
            <path className="jv2-dock__rail" d={arc(g, g.RW - 7, a0, a1)} />
            <path className="jv2-dock__clamp" d={arc(g, g.RW - 2, m - h, m + h)} />
            {[m - h - 2.5, m + h + 2.5].map((a) => {
              const [x0, y0] = P(g.RW - 8, a)
              const [x1, y1] = P(g.RW + 2, a)
              return <line key={a} className="jv2-dock__tick" x1={f(x0)} y1={f(y0)} x2={f(x1)} y2={f(y1)} />
            })}
            <line className="jv2-dock__spoke" x1={f(sx0)} y1={f(sy0)} x2={f(sx1)} y2={f(sy1)} />
            <circle className="jv2-dock__dot" cx={f(sx0)} cy={f(sy0)} r={2.4} />
          </g>
        )
      })}
      {WEDGES.map((id) => {
        const w = g.wedges[id]
        const { top, bottom } = wedgeSpan(g, id)
        const xo = w.sx > 0 ? 16 : g.W - 16
        const d = w.sx > 0 ? 1 : -1
        const L = 26
        const ym = (top + bottom) / 2
        return (
          <g key={id} className="jv2-bezel">
            <path d={`M${xo + d * L} ${top - 5}H${xo + d * 13}L${xo - d * 5} ${top + 13}V${top + L}`} />
            <path d={`M${xo + d * L} ${bottom + 5}H${xo + d * 13}L${xo - d * 5} ${bottom - 13}V${bottom - L}`} />
            <rect className="jv2-bezel__tab" x={w.sx > 0 ? xo - 7 : xo + 3} y={ym - 22} width={4} height={44} />
          </g>
        )
      })}
      {/* The bezel brackets on the 45° lines, ref 4's ring clamps. */}
      {[45, 135, 225, 315].map((a) => (
        <path key={a} className="jv2-bracket" d={arc(g, R.tick + 13, a - 6, a + 6)} />
      ))}
      <circle className="jv2-ring-ghost" cx={g.CX} cy={g.CY} r={R.tick + 7} />
      <circle className="jv2-ring-ghost" cx={g.CX} cy={g.CY} r={R.rule - 12} />
      {/* The compass on top: an arc, its ticks, its end bars, the pointer the rings lock under. */}
      <path className="jv2-compass" d={arc(g, g.RC, -48, 48)} />
      <path className="jv2-compass__end" d={arc(g, g.RC + 6, -48, -40)} />
      <path className="jv2-compass__end" d={arc(g, g.RC + 6, 40, 48)} />
      {Array.from({ length: 47 }, (_, i) => -46 + i * 2).map((a) => {
        const big = a % 10 === 0
        const [x0, y0] = P(g.RC, a)
        const [x1, y1] = P(g.RC - (big ? 8 : 4), a)
        return <line key={a} className={`jv2-compass__tick${big ? ' is-big' : ''}`} x1={f(x0)} y1={f(y0)} x2={f(x1)} y2={f(y1)} />
      })}
      <Pointer g={g} />
      {/* Each readout drops a leader to the compass. */}
      {readouts.map((r, i) => {
        const x = xs[i] - 46 + 4
        const yArc = g.CY - Math.sqrt(Math.max(0, g.RC * g.RC - (x - g.CX) ** 2))
        return (
          <g key={r.key} className={`jv2-lead t-${r.tone}`}>
            <line x1={f(x)} y1={g.readTop + g.readH + 2} x2={f(x)} y2={f(yArc - 1)} />
            <circle cx={f(x)} cy={f(yArc)} r={3} />
          </g>
        )
      })}
      {/* The axis: 3 and 9 o'clock spokes from the wedge gaps to the reactor. */}
      {(
        [
          [-1, (g.CY - g.wedges.who.Y1 + g.CY + g.wedges.policies.Y1) / 2 - g.CY],
          [1, (g.CY - g.wedges.decision.Y1 + g.CY + g.wedges.rules.Y1) / 2 - g.CY],
        ] as const
      ).map(([s, dy]) => {
        const y = g.CY + dy
        const xa = g.CX + s * Math.sqrt(Math.max(0, (R.tick + 10) ** 2 - dy * dy))
        const xb = g.CX + s * (g.RW + 70)
        return (
          <g key={s} className="jv2-axis">
            <line x1={f(xa)} y1={f(y)} x2={f(xb)} y2={f(y)} />
            <circle cx={f(xa)} cy={f(y)} r={3} />
            <circle className="is-far" cx={f(xb)} cy={f(y)} r={2} />
          </g>
        )
      })}
    </svg>
  )
})

function Pointer({ g }: { g: Geo }) {
  const [x, y] = polar(g, g.RC + 2, 0)
  return <path className="jv2-pointer" d={`M${f(x - 7)} ${f(y - 9)}L${f(x + 7)} ${f(y - 9)}L${f(x)} ${f(y + 2)}Z`} />
}

/* The idle rings: each on its own layer, turned slowly by CSS (off under reduced motion). */
export const Decor = memo(function Decor({ g }: { g: Geo }) {
  const R = g.R
  const c = R.tick + 16
  const L = { CX: c, CY: c }
  const box = (cls: string, body: ReactNode) => (
    <div className={`jv2-decor ${cls}`} style={{ left: g.CX - c, top: g.CY - c, width: c * 2, height: c * 2 }} aria-hidden>
      <svg width={c * 2} height={c * 2} viewBox={`0 0 ${c * 2} ${c * 2}`}>
        {body}
      </svg>
    </div>
  )
  const ticks = []
  for (let a = 0; a < 360; a += 2) {
    const major = a % 30 === 0
    const mid = a % 10 === 0
    const [x0, y0] = polar(L, R.tick - (major ? 9 : mid ? 6 : 3), a)
    const [x1, y1] = polar(L, R.tick + (major ? 3 : 0), a)
    ticks.push(<line key={a} className={major ? 'is-major' : undefined} x1={f(x0)} y1={f(y0)} x2={f(x1)} y2={f(y1)} />)
  }
  return (
    <>
      {box('is-ticks', <g className="jv2-ticks">{ticks}</g>)}
      {box('is-rev', <circle className="jv2-dotring" cx={c} cy={c} r={R.pol - 14} />)}
      {box('is-mid', <circle className="jv2-dashring" cx={c} cy={c} r={R.chk - 11} />)}
    </>
  )
})

/* The CORE: the verdict. Cyan while the engine works; then it floods from
   its centre in the answer's colour, the shield draws, the word decodes, and
   one ring-wave runs out to the tick ring. */
export function CoreView({ g, core, play, landedNow, speaking }: { g: Geo; core: Core; play: boolean; landedNow: boolean; speaking: boolean }) {
  const r = g.R.core
  const c = r + 18
  const L = { CX: c, CY: c }
  const cells = []
  for (let a = 0; a < 360; a += 5) {
    const [x0, y0] = polar(L, r + 9, a)
    const [x1, y1] = polar(L, r + 15, a)
    /* One lit 45° cell per factor: shape, not a number. */
    const lit = core.cells > 0 && a % 45 === 0 && a / 45 < core.cells
    cells.push(<line key={a} className={`${a % 45 === 0 ? 'is-major' : ''}${lit ? ' is-lit' : ''}`} x1={f(x0)} y1={f(y0)} x2={f(x1)} y2={f(y1)} />)
  }
  const inner = []
  for (let a = 0; a < 360; a += 6) {
    const [x0, y0] = polar(L, r - 7, a)
    const [x1, y1] = polar(L, r - (a % 30 ? 3 : 1), a)
    inner.push(<line key={a} className={a % 30 ? undefined : 'is-major'} x1={f(x0)} y1={f(y0)} x2={f(x1)} y2={f(y1)} />)
  }
  const style = { left: g.CX - c, top: g.CY - c, width: c * 2, height: c * 2 }
  return (
    <div className={`jv2-core t-${core.tone}${speaking ? ' is-speaking' : ''}`} style={style}>
      <span className="jv2-core__halo" aria-hidden />
      {landedNow && play && <span className="jv2-core__flood" aria-hidden />}
      {landedNow && play && <span className="jv2-core__wave" style={{ '--jv2-wave': (g.R.tick + 8) / r } as CSSProperties} aria-hidden />}
      <svg className="jv2-core__svg" width={c * 2} height={c * 2} viewBox={`0 0 ${c * 2} ${c * 2}`} aria-hidden>
        <defs>
          <radialGradient id="jv2-core-fill" cx="50%" cy="46%" r="55%">
            <stop offset="0" className="jv2-core__s0" />
            <stop offset="0.55" className="jv2-core__s1" />
            <stop offset="1" stopColor="#03101c" stopOpacity="0.92" />
          </radialGradient>
        </defs>
        <g className="jv2-core__cells">{cells}</g>
        <circle className="jv2-core__disc" cx={c} cy={c} r={r} fill="url(#jv2-core-fill)" />
        <g className="jv2-core__inner">{inner}</g>
        {core.tone === 'work' && <path className="jv2-core__spin" d={arc(L, r + 9, 0, 70)} />}
      </svg>
      <div className="jv2-core__text">
        <CoreIcon icon={core.icon} play={play && landedNow} />
        {core.kicker && <span className="jv2-core__kicker">{core.kicker}</span>}
        <b className="jv2-core__word">
          <Decode text={core.word} play={play && landedNow} ms={420} delay={260} />
        </b>
        {core.sub && <span className="jv2-core__sub">{core.sub}</span>}
      </div>
    </div>
  )
}

function CoreIcon({ icon, play }: { icon: Core['icon']; play: boolean }) {
  if (icon === 'work' || icon === 'none') return null
  const mark = icon === 'allow' ? 'm9 12 2 2 4-4' : icon === 'deny' ? 'm9.5 9.5 5 5m0-5-5 5' : 'M12 8v4.5M12 15.6v.1'
  return (
    <svg className="jv2-core__icon" width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <motion.path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" initial={play ? { pathLength: 0 } : false} animate={{ pathLength: 1 }} transition={{ duration: play ? 0.42 : 0, delay: play ? 0.12 : 0 }} />
      <motion.path d={mark} initial={play ? { pathLength: 0 } : false} animate={{ pathLength: 1 }} transition={{ duration: play ? 0.24 : 0, delay: play ? 0.5 : 0 }} />
    </svg>
  )
}

/** The readouts under the engine pill: the run's four stages. */
export function Readouts({ g, readouts, play }: { g: Geo; readouts: Readout[]; play: boolean }) {
  const xs = readoutXs(g)
  return (
    <div className="jv2-reads" role="group" aria-label="The run">
      {readouts.map((r, i) => (
        <div key={r.key} className={`jv2-read t-${r.tone}`} style={{ left: xs[i] - 46, top: g.readTop, width: 92, height: g.readH }}>
          <span className="jv2-read__k">
            <i aria-hidden />
            {r.label}
          </span>
          <b className="jv2-read__v">
            <Decode text={r.value} play={play && r.value !== '—'} ms={240} />
          </b>
          {r.sub && <span className="jv2-read__s">{r.sub}</span>}
        </div>
      ))}
    </div>
  )
}
