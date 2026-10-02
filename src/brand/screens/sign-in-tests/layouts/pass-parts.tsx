import { motion } from 'motion/react'
import { Check, CircleHelp, Minus, X, type LucideIcon } from 'lucide-react'

import { Spinner } from '../PolicyStack'
import { barsOf } from './pass-model'

/* -----------------------------------------------------------------------------
   The pass's small pieces (PassLayout.tsx): a check's mark, a skeleton, the
   STAMP the engine presses onto a field as it settles it, and the code line
   drawn as bars. Stamps are motion's alone: no CSS transform or transition
   on them (the house transform trap) — the tilt is part of the animation.
   -------------------------------------------------------------------------- */

export type MarkStatus = 'pass' | 'fail' | 'unknown' | 'none'

const MARK: Record<MarkStatus, { Icon: LucideIcon; label: string }> = {
  pass: { Icon: Check, label: 'Passed' },
  fail: { Icon: X, label: 'Failed' },
  unknown: { Icon: CircleHelp, label: 'Can’t tell' },
  none: { Icon: Minus, label: 'Not read' },
}

/** ✓ ✕ ? or –; a spinner while the engine reads it. `pop` lands it with a small spring. */
export function Mark({ status, working = false, pop = false, label }: { status: MarkStatus; working?: boolean; pop?: boolean; label?: string }) {
  if (working) return <Spinner small />
  const { Icon, label: said } = MARK[status]
  return (
    <motion.span
      className={`rl-pass__mark is-${status}`}
      role="img"
      aria-label={label ?? said}
      initial={pop ? { scale: 0.3, opacity: 0 } : false}
      animate={{ scale: 1, opacity: 1 }}
      transition={pop ? { type: 'spring', stiffness: 560, damping: 24 } : { duration: 0 }}
    >
      <Icon size={11} strokeWidth={3} aria-hidden />
    </motion.span>
  )
}

export function Skel({ w = '70%', h = 10 }: { w?: string; h?: number }) {
  return <span className="rl-pass__skel" style={{ width: w, height: h }} aria-hidden />
}

export type StampTone = 'positive' | 'negative' | 'notice' | 'neutral'

/* A stamp: pressed down from above (big, faint) onto the field, a little
   tilted, a short overshoot as the ink takes — `ms` the step it lands in, so
   the press keeps time with the engine line. `big` is the VOID / provisional
   stamp across the route. */
export function Stamp({
  text,
  tone,
  pop,
  ms = 320,
  tilt = -7,
  big = false,
  className = '',
}: {
  text: string
  tone: StampTone
  pop: boolean
  ms?: number
  tilt?: number
  big?: boolean
  className?: string
}) {
  const d = Math.max(0.22, Math.min(0.6, ms / 1000))
  return (
    <motion.span
      className={`rl-pass__stamp is-${tone}${big ? ' is-big' : ''} ${className}`}
      initial={pop ? { scale: big ? 2.4 : 1.9, opacity: 0, rotate: tilt - 8 } : false}
      animate={{ scale: 1, opacity: 1, rotate: tilt }}
      transition={pop ? { duration: d, ease: [0.3, 1.5, 0.5, 1] } : { duration: 0 }}
      aria-hidden
    >
      {text}
    </motion.span>
  )
}

/** The code line as bars, true to the code it reads (pass-model.ts `barsOf`). */
export function Barcode({ code, on }: { code: string; on: boolean }) {
  const bars = barsOf(code)
  const w = bars.length > 0 ? bars[bars.length - 1].x + bars[bars.length - 1].w : 1
  return (
    <svg className={`rl-pass__bars${on ? ' is-on' : ''}`} viewBox={`0 0 ${w} 30`} preserveAspectRatio="none" aria-hidden>
      {bars.map((b, i) => (
        <rect key={i} x={b.x} y={0} width={b.w} height={30} />
      ))}
    </svg>
  )
}
