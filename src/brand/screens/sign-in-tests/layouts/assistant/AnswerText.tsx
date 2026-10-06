import { Check, CircleHelp, X } from 'lucide-react'
import { motion } from 'motion/react'
import { Fragment, type ReactNode } from 'react'

import { citeNumbers, type Answer, type Mark, type Part, type Target } from './intents'

/* -----------------------------------------------------------------------------
   An answer, drawn as words (the dock's default `renderAnswer`; Brief and
   Focus may use it whole or draw their own from the same Answer).

   The sentence arrives the way Brief's does — each word out of focus,
   sharpening into place (blur 6px → 0), one after another — and its cited
   phrases carry small numbered markers, one number per thing on the canvas.
   Hovered or focused, a citation names its target (`onCite`), so the view can
   light it; left, null. Then the further lines, each with its mark.
   -------------------------------------------------------------------------- */

export interface AnswerTextProps {
  answer: Answer
  /** Words arrive out of focus and sharpen (the newest answer, motion allowed). */
  animate: boolean
  onCite?: (t: Target | null) => void
  /** The cite on show elsewhere (the view's lit thing): its phrase is drawn lit. */
  lit?: Target | null
  /** Number the cited phrases (default). Off where the canvas has no numbers to match (Brief). */
  numbers?: boolean
}

const EASE = [0.2, 0, 0, 1] as const

const NO_NUMS = new Map<Target, number>()

function MarkIcon({ mark }: { mark: Mark }) {
  if (mark === 'pass') return <Check className="ad-ans__mk is-pass" size={12} strokeWidth={2.6} aria-label="passed" />
  if (mark === 'fail') return <X className="ad-ans__mk is-fail" size={12} strokeWidth={2.6} aria-label="failed" />
  return <CircleHelp className="ad-ans__mk is-unknown" size={12} strokeWidth={2.2} aria-label="can't tell" />
}

/* Words, each a span, blurred in one after another from `base` (s). */
function Words({ text, animate, base, per }: { text: string; animate: boolean; base: number; per: number }): { node: ReactNode; count: number } {
  if (!animate) return { node: text, count: 0 }
  const bits = text.split(/(\s+)/)
  let w = 0
  const node = bits.map((b, i) => {
    if (b.trim() === '') return <Fragment key={i}>{b}</Fragment>
    const d = base + w++ * per
    return (
      <motion.span key={i} className="ad-ans__w" initial={{ opacity: 0, filter: 'blur(6px)' }} animate={{ opacity: 1, filter: 'blur(0px)' }} transition={{ duration: 0.34, delay: d, ease: EASE }}>
        {b}
      </motion.span>
    )
  })
  return { node, count: w }
}

export function PartsLine({ parts, nums, animate, start = 0, onCite, lit, className = '' }: { parts: readonly Part[]; nums: Map<Target, number>; animate: boolean; start?: number; onCite?: (t: Target | null) => void; lit?: Target | null; className?: string }) {
  const per = 0.035
  let words = 0
  return (
    <span className={className}>
      {parts.map((p, i) => {
        const w = Words({ text: p.text, animate, base: start + words * per, per })
        words += w.count
        if (!p.cite) return <Fragment key={i}>{w.node}</Fragment>
        const n = nums.get(p.cite)
        return (
          <span
            key={i}
            className={`ad-ans__cite is-${p.tone ?? 'neutral'}${lit === p.cite ? ' is-lit' : ''}`}
            tabIndex={onCite ? 0 : undefined}
            data-cite={p.cite}
            onMouseEnter={onCite ? () => onCite(p.cite ?? null) : undefined}
            onMouseLeave={onCite ? () => onCite(null) : undefined}
            onFocus={onCite ? () => onCite(p.cite ?? null) : undefined}
            onBlur={onCite ? () => onCite(null) : undefined}
          >
            {p.mark && <MarkIcon mark={p.mark} />}
            {w.node}
            {n !== undefined && <sup className="ad-ans__num">{n}</sup>}
          </span>
        )
      })}
    </span>
  )
}

export function AnswerText({ answer, animate, onCite, lit = null, numbers = true }: AnswerTextProps) {
  const nums = numbers ? citeNumbers(answer) : NO_NUMS
  const sentenceWords = answer.sentence.reduce((n, p) => n + p.text.split(/\s+/).filter(Boolean).length, 0)
  return (
    <div className={`ad-ans is-${answer.tone}${answer.known ? '' : ' is-unknown'}`}>
      <p className="ad-ans__sentence">
        <PartsLine parts={answer.sentence} nums={nums} animate={animate} onCite={onCite} lit={lit} />
      </p>
      {answer.more && answer.more.length > 0 && (
        <ul className="ad-ans__more">
          {answer.more.map((line, i) => (
            <motion.li key={i} initial={animate ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ duration: 0.3, delay: animate ? Math.min(1.2, sentenceWords * 0.035) + i * 0.08 : 0 }}>
              <PartsLine parts={line} nums={NO_NUMS} animate={false} onCite={onCite} lit={lit} />
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  )
}
