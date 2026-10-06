import { Check, ChevronLeft, ChevronRight, CircleHelp, Minus, X } from 'lucide-react'
import { motion } from 'motion/react'
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

import { Tip } from '../../../kit'
import { elideTrail, type TrailMark, type TrailStep } from './focus2-trail-model'
import './focus2-trail.css'

/* -----------------------------------------------------------------------------
   THE BAR UNDER THE OPEN CARD (Focus2Layout.tsx): one surface, one height,

     [‹ ›]  Maya Iyer › AWS for engineering teams › Rule 1 ✕ › Rule 2 ✓ › Allow   voice

   It replaces the bottom player (owner, 5 Oct 2026). There is no rail, no fill
   and no timer here: the story is told in Auto and nothing else, and this is
   only where the admin goes back through it. The step buttons walk one beat at a
   time; every step of the trail goes to its own beat; the voice — its line, Stop
   and mute — stands at the end of the same bar so the three read as one control.

   Steps appear as the story reaches them. Those still to come are drawn faint
   and cannot be pressed: they carry only their short name, so nothing here
   gives away a result the story has not got to. A step's result is an icon
   (✕ / ✓), never a coloured dot, and the step on screen takes a calm grey
   selected state — blue is the engine's, orange the one primary button's.

   Narrow: the steps that do not fit are given up from the middle, nearest the
   one on screen kept, and each run is a single "…". A step's own words are
   truncated before the bar is allowed to scroll.
   -------------------------------------------------------------------------- */

const MARKS: Record<TrailMark, typeof Check> = { pass: Check, fail: X, unknown: CircleHelp, off: Minus }
/* What one step costs in the bar, with its separator: the width a step is given before the trail gives one up. */
const STEP_W = 80

export interface Focus2BarProps {
  steps: readonly TrailStep[]
  /** The beat on screen, for the step buttons' ends. */
  at: number
  /** The first and last beat the buttons may go to. */
  last: number
  reached: number
  landed: boolean
  /** The story is being told (not browsed): the step it has just reached sharpens in. */
  presenting?: boolean
  reduced: boolean
  /** The card a step stands for, or -1: the link between a step and its card on the path. */
  cardOf?: (beat: number) => number
  /** The card under the pointer (or the one whose step is), and its setter. */
  hover?: number | null
  onHover?: (card: number | null) => void
  onGo: (beat: number) => void
  onStep: (d: -1 | 1) => void
  /** The voice, drawn at the end of the bar. */
  children?: ReactNode
}

export function Focus2Bar({ steps, at, last, reached, landed, presenting = false, reduced, cardOf, hover = null, onHover, onGo, onStep, children }: Focus2BarProps) {
  const trail = useRef<HTMLElement | null>(null)
  const [room, setRoom] = useState(0)
  useLayoutEffect(() => {
    const el = trail.current
    if (!el) return
    const read = () => setRoom(el.clientWidth)
    read()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const far = landed ? last : Math.min(last, reached)
  /* Unmeasured (first paint, a static render): every step. */
  const items = elideTrail(steps, room > 0 ? Math.max(3, Math.floor(room / STEP_W)) : steps.length)
  return (
    <div className="rl-f2bar" role="group" aria-label="Walkthrough">
      <div className="rl-f2bar__nav">
        <Tip text="Previous step" placement="top">
          <button type="button" className="rl-f2bar__btn" aria-label="Previous step" disabled={at <= 0} onClick={() => onStep(-1)}>
            <ChevronLeft size={16} strokeWidth={2.2} aria-hidden />
          </button>
        </Tip>
        <Tip text="Next step" placement="top">
          <button type="button" className="rl-f2bar__btn" aria-label="Next step" disabled={at >= far} onClick={() => onStep(1)}>
            <ChevronRight size={16} strokeWidth={2.2} aria-hidden />
          </button>
        </Tip>
      </div>
      <nav ref={trail} className="rl-f2bar__trail" aria-label="Decision trail">
        <ol>
          {items.map((it, i) => (
            <li key={it.gap ? it.key : it.step.key} className={it.gap ? 'is-gap' : it.step.kind === 'outcome' || it.step.kind === 'sign' ? 'is-end' : undefined}>
              {i > 0 && <ChevronRight className="rl-f2bar__sep" size={12} strokeWidth={2.2} aria-hidden />}
              {it.gap ? (
                <span className="rl-f2bar__gap" aria-label={`${it.count} more steps`}>
                  …
                </span>
              ) : (
                <TrailButton step={it.step} reduced={reduced} presenting={presenting} card={cardOf ? cardOf(it.step.beat) : -1} hover={hover} onHover={onHover} onGo={onGo} />
              )}
            </li>
          ))}
        </ol>
      </nav>
      {children}
    </div>
  )
}

function TrailButton({ step, reduced, presenting, card, hover, onHover, onGo }: { step: TrailStep; reduced: boolean; presenting: boolean; card: number; hover: number | null; onHover?: (card: number | null) => void; onGo: (beat: number) => void }) {
  const Mark = step.mark ? MARKS[step.mark] : null
  /* A card's pick button on the path and its step here are one hover: the path lifts the card, this marks the step. */
  const linked = card >= 0 && hover === card && !step.current
  const sharpen = presenting && step.current && !reduced
  const over = onHover && card >= 0 && step.reachable ? () => onHover(card) : undefined
  const off = onHover && card >= 0 ? () => onHover(null) : undefined
  return (
    <motion.span className="rl-f2bar__cell" initial={false} animate={{ opacity: step.reachable ? 1 : 0.4 }} transition={{ duration: reduced ? 0 : 0.2, ease: [0.2, 0, 0, 1] }}>
      <button
        type="button"
        className={`rl-f2bar__step${step.current ? ' is-on' : ''}${linked ? ' is-link' : ''}${step.tone ? ` is-${step.tone}` : ''}`}
        aria-current={step.current ? 'step' : undefined}
        aria-label={step.say}
        disabled={!step.reachable}
        title={step.detail ? `${step.label}: missed on ${step.detail}` : step.label}
        onClick={() => onGo(step.beat)}
        onPointerEnter={over}
        onPointerLeave={off}
        onFocus={(e) => {
          if (over && e.currentTarget.matches(':focus-visible')) over()
        }}
        onBlur={off}
      >
        {/* Keyed on being the one told, so reaching a step replays the sharpening and leaving it does not. */}
        <motion.span
          key={sharpen ? 'told' : 'still'}
          className="rl-f2bar__word"
          initial={sharpen ? { opacity: 0.2, filter: 'blur(4px)' } : false}
          animate={{ opacity: 1, filter: 'blur(0px)' }}
          transition={{ duration: 0.4, ease: [0.2, 0, 0, 1] }}
        >
          {step.label}
        </motion.span>
        {Mark && <Mark className={`rl-f2bar__mark is-${step.mark}`} size={12} strokeWidth={2.6} aria-hidden />}
        {step.detail && <span className="rl-f2bar__detail">{step.detail}</span>}
      </button>
    </motion.span>
  )
}
