import { motion, type MotionValue } from 'motion/react'
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'

import type { EngineRun } from '../engine-run'
import type { Placed } from './pulse-geometry'
import type { Stop, Track } from './pulse-model'
import { RAIL_H } from './pulse-size'

/* -----------------------------------------------------------------------------
   Pulse's rail (PulseLayout.tsx): under everything, the run in three
   sections — Policies · Rules · Outcome — with a tick for every stop in its
   meaning's colour, and the playhead. While the engine works, a blue cursor
   rides the rail with the tip; once it lands, the playhead stands on the
   answer and the admin drags it (or steps it with the arrow keys): the card
   it stands on opens, the line after it fades.
   -------------------------------------------------------------------------- */

export interface StopView {
  stop: Stop
  x: number
  tone: string
  label: string
  /** The step that draws its beat: its tick shows from then. */
  at: number
}

export function Rail({
  plan,
  track,
  placed,
  top,
  base,
  s,
  landed,
  tip,
  stops,
  focusIndex,
  onFocus,
  toWorldX,
  reduced,
}: {
  plan: EngineRun
  track: Track
  placed: Placed
  /** The rail's top (world px). */
  top: number
  base: number
  s: number
  landed: boolean
  tip: MotionValue<number>
  stops: readonly StopView[]
  focusIndex: number
  onFocus: (i: number) => void
  /** A pointer's x on the world, at zoom 1. */
  toWorldX: (clientX: number) => number | null
  reduced: boolean
}) {
  const [drag, setDrag] = useState<number | null>(null)
  const dragId = useRef<number | null>(null)
  const range = (sec: string): [number, number] | null => {
    let a = Infinity
    let b = -Infinity
    track.segs.forEach((g, i) => {
      if (g.section !== sec) return
      a = Math.min(a, placed.x0[i])
      b = Math.max(b, placed.x1[i])
    })
    return a < b ? [a, b] : null
  }
  const pol = range('pol')
  const rule = range('rule')
  const outSeg = track.segs.findIndex((g) => g.section === 'out')
  const out: [number, number] = [outSeg >= 0 ? placed.x0[outSeg] : placed.outLeft - 60, placed.outLeft]
  const ruleCount = plan.rules.filter((r) => r.index !== null).length
  const rulesOpen = plan.at.expand >= 0 && s >= plan.at.expand
  const sections: { key: string; at: [number, number] | null; label: string; count?: number; shown: boolean }[] = [
    { key: 'pol', at: pol, label: `Policies on ${plan.appName}`, count: plan.policies.length, shown: s >= Math.max(0, plan.at.which) },
    { key: 'rule', at: rule, label: rulesOpen && plan.decider ? `Rules in ${plan.decider.name}` : 'Rules', count: rulesOpen && plan.decider ? ruleCount : undefined, shown: rulesOpen || landed },
    { key: 'out', at: out, label: 'Outcome', shown: landed },
  ]

  const nearest = (x: number): number => {
    let best = 0
    let d = Infinity
    stops.forEach((st, i) => {
      const k = Math.abs(st.x - x)
      if (k < d) {
        d = k
        best = i
      }
    })
    return best
  }
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!landed || stops.length === 0) return
    const x = toWorldX(e.clientX)
    if (x === null) return
    e.preventDefault()
    dragId.current = e.pointerId
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag(x)
    onFocus(nearest(x))
  }
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragId.current !== e.pointerId) return
    const x = toWorldX(e.clientX)
    if (x === null) return
    setDrag(x)
    const i = nearest(x)
    if (i !== focusIndex) onFocus(i)
  }
  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    if (dragId.current !== e.pointerId) return
    dragId.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    setDrag(null)
  }
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const n = stops.length
    if (n === 0) return
    const go = (i: number) => {
      e.preventDefault()
      onFocus(Math.max(0, Math.min(n - 1, i)))
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') go(focusIndex - 1)
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') go(focusIndex + 1)
    else if (e.key === 'Home') go(0)
    else if (e.key === 'End') go(n - 1)
  }
  const current = stops[focusIndex]
  const playX = drag ?? current?.x ?? null
  const lineTop = base - 104

  return (
    <>
      {/* The playhead: a hairline up through the trace. */}
      {landed && playX !== null && (
        <motion.span
          className={`rl-pulse__play${drag !== null ? ' is-drag' : ''}`}
          style={{ top: lineTop, height: top - lineTop + 10 }}
          initial={false}
          animate={{ left: playX }}
          transition={drag !== null || reduced ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 42 }}
          aria-hidden
        />
      )}
      <div className="rl-pulse__rail" data-card style={{ top, width: placed.width, height: RAIL_H }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <span className="rl-pulse__railline" style={{ left: pol ? pol[0] : 0, width: Math.max(0, placed.outLeft - (pol ? pol[0] : 0)) }} aria-hidden />
        {sections.map((sec) =>
          sec.at ? (
            <motion.span key={sec.key} className={`rl-pulse__sec is-${sec.key}`} style={{ left: sec.at[0], width: sec.at[1] - sec.at[0] }} initial={false} animate={{ opacity: sec.shown ? 1 : 0 }} transition={{ duration: reduced ? 0 : 0.3 }}>
              <span className="rl-pulse__secedge" aria-hidden />
              <span className="rl-pulse__seclabel" title={sec.label}>
                <span className="rl-pulse__sectext">{sec.label}</span>
                {sec.count !== undefined && <span className="rl-pulse__seccount">{sec.count}</span>}
              </span>
            </motion.span>
          ) : null,
        )}
        {stops.map((st, i) =>
          !landed && s < st.at ? null : (
          <span key={st.stop.id} className={`rl-pulse__tick is-${st.tone}${i === focusIndex && landed ? ' is-focus' : ''}`} style={{ left: st.x - 1 }} aria-hidden />
          ),
        )}
        {!landed && <motion.span className="rl-pulse__railtip" style={{ left: tip }} aria-hidden />}
        {landed && playX !== null && (
          <motion.div
            className="rl-pulse__knob"
            role="slider"
            tabIndex={0}
            aria-label="Playhead"
            aria-valuemin={1}
            aria-valuemax={Math.max(1, stops.length)}
            aria-valuenow={focusIndex + 1}
            aria-valuetext={current?.label ?? ''}
            onKeyDown={onKey}
            initial={false}
            animate={{ left: playX - 8 }}
            transition={drag !== null || reduced ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 42 }}
          />
        )}
      </div>
    </>
  )
}
