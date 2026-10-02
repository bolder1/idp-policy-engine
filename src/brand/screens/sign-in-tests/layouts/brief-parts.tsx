import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { Check, CircleHelp, Lock, Minus, X, type LucideIcon } from 'lucide-react'

import type { LineStatus } from '../../testing/evidence'
import { Spinner } from '../PolicyStack'
import { CITE_LABEL, type CiteId } from './brief-model'

/* -----------------------------------------------------------------------------
   The brief's small pieces (BriefLayout.tsx): the marks, a row's number, a
   skeleton, and the evidence card's frame — its number (the sentence's
   citation), its label, its body and the one line under it that says why.
   -------------------------------------------------------------------------- */

export type MarkStatus = LineStatus | 'none'

const MARK: Record<MarkStatus, { Icon: LucideIcon; label: string }> = {
  pass: { Icon: Check, label: 'Passed' },
  fail: { Icon: X, label: 'Failed' },
  unknown: { Icon: CircleHelp, label: 'Can’t tell' },
  none: { Icon: Minus, label: 'Not read' },
}

/** ✓ ✕ ? or –; a spinner while it is being read. `pop` lands it with a small spring. */
export function Mark({ status, working = false, label, pop = false }: { status: MarkStatus; working?: boolean; label?: string; pop?: boolean }) {
  if (working) return <Spinner small />
  const { Icon, label: said } = MARK[status]
  return (
    <motion.span
      className={`rl-brief__mark is-${status}`}
      role="img"
      aria-label={label ?? said}
      initial={pop ? { scale: 0.4, opacity: 0 } : false}
      animate={{ scale: 1, opacity: 1 }}
      transition={pop ? { type: 'spring', stiffness: 520, damping: 26 } : { duration: 0 }}
    >
      <Icon size={12} strokeWidth={2.8} aria-hidden />
    </motion.span>
  )
}

/** A row's place in the engine's order; the last row is locked. */
export function Num({ n }: { n: number | null }) {
  return <span className="rl-brief__num">{n === null ? <Lock size={10} strokeWidth={2.4} aria-hidden /> : n}</span>
}

export function Skel({ w = '70%' }: { w?: string }) {
  return <span className="rl-brief__skel" style={{ width: w }} aria-hidden />
}

export type CardState = 'waiting' | 'working' | 'settled'

/* An evidence card: a region, not a button — what is in it can be pressed.
   Hovering it lights its phrases in the sentence (and it, theirs). */
export function Card({
  cite,
  n,
  state,
  lit,
  tone,
  animate,
  node,
  title,
  mark,
  foot,
  onHot,
  children,
  className = '',
}: {
  cite: CiteId
  n: number | undefined
  state: CardState
  lit: boolean
  /** The landed tone, on the card that carries it (the outcome, the rule that matched…). */
  tone?: string
  animate: boolean
  node?: string
  title?: string
  mark?: ReactNode
  foot?: ReactNode
  onHot: (c: CiteId | null) => void
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={`rl-brief__card is-${cite} is-${state}${lit ? ' is-lit' : ''}${tone ? ` is-${tone}` : ''} ${className}`}
      data-card
      data-node={node}
      data-ev={cite}
      aria-label={`Evidence ${n ?? ''}: ${title ?? CITE_LABEL[cite]}`}
      onMouseEnter={() => onHot(cite)}
      onMouseLeave={() => onHot(null)}
    >
      <header className="rl-brief__cardhead">
        <span className="rl-brief__cardno" aria-hidden>
          {n}
        </span>
        <span className="rl-brief__cardlabel">{title ?? CITE_LABEL[cite]}</span>
        {mark}
      </header>
      <motion.div
        className="rl-brief__cardbody"
        initial={false}
        animate={{ opacity: state === 'waiting' ? 0.5 : 1 }}
        transition={{ duration: animate ? 0.3 : 0 }}
      >
        {children}
      </motion.div>
      {/* Always there, so a card never grows as its line arrives. */}
      <footer className={`rl-brief__cardfoot${foot ? '' : ' is-empty'}`}>{foot || String.fromCharCode(160)}</footer>
    </section>
  )
}
