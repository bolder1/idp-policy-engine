import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { Check, CircleHelp, Lock, Minus, X, type LucideIcon } from 'lucide-react'

import { Spinner } from '../PolicyStack'
import type { MarkState } from './explainer-model'
import { EASE_OUT, MORPH } from './explainer-motion'

/* The small pieces the Explainer is made of (ExplainerLayout.tsx): the mark a
   check, a rule or a moment lands with, a number in the engine's order, and
   the PLATE — the card's surface, alone, that glides from one state of the
   visual to the next (a shared layout id) while the words on it fade, so a
   policy row lifts into a card and a rule card settles into the answer
   without a letter stretched on the way. */


const ICON: Partial<Record<MarkState, { Icon: LucideIcon; label: string }>> = {
  pass: { Icon: Check, label: 'Passed' },
  positive: { Icon: Check, label: 'Allowed' },
  fail: { Icon: X, label: 'Failed' },
  negative: { Icon: X, label: 'Denied' },
  unknown: { Icon: CircleHelp, label: "Can't tell" },
  notice: { Icon: CircleHelp, label: 'Depends' },
}

/** A mark; it lands with a small spring when `pop` is set (the first time it is drawn while playing). */
export function Mark({ state, label, pop = false, big = false }: { state: MarkState; label?: string; pop?: boolean; big?: boolean }) {
  if (state === 'working') return <Spinner small={!big} />
  const hit = ICON[state]
  const size = big ? 15 : 12
  if (!hit) {
    return (
      <span className={`rl-explainer__mark is-${state}${big ? ' is-big' : ''}`} role="img" aria-label={label ?? (state === 'off' ? 'Switched off' : 'Not reached')}>
        <Minus size={size} strokeWidth={2.4} aria-hidden />
      </span>
    )
  }
  const { Icon, label: said } = hit
  return (
    <motion.span
      className={`rl-explainer__mark is-${state}${big ? ' is-big' : ''}`}
      role="img"
      aria-label={label ?? said}
      initial={pop ? { scale: 0.3, opacity: 0 } : false}
      animate={{ scale: 1, opacity: 1 }}
      transition={pop ? { type: 'spring', stiffness: 520, damping: 22, mass: 0.6 } : { duration: 0 }}
    >
      <Icon size={size} strokeWidth={2.6} aria-hidden />
    </motion.span>
  )
}

/** A number in the engine's order; the last row is locked. */
export function Num({ n, tone }: { n: number | null; tone?: string }) {
  return (
    <span className={`rl-explainer__num${tone ? ` is-${tone}` : ''}`} aria-hidden>
      {n === null ? <Lock size={11} strokeWidth={2.2} /> : n}
    </span>
  )
}

/** A card's surface: its own layer under the words, gliding between states by its id (none: it just sits there). */
export function Plate({ id, tone, morph }: { id?: string; tone?: string; morph: boolean }) {
  return (
    <motion.span
      className={`rl-explainer__plate${tone ? ` is-${tone}` : ''}`}
      aria-hidden
      layoutId={morph ? id : undefined}
      transition={MORPH}
      style={{ borderRadius: 10 }}
    />
  )
}

/** The words on a plate: they arrive a beat after it, so the glide reads first. */
export function OnPlate({ children, className = '', animate, delay = 0.14 }: { children: ReactNode; className?: string; animate: boolean; delay?: number }) {
  return (
    <motion.div className={`rl-explainer__onplate ${className}`} initial={animate ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ duration: animate ? 0.24 : 0, delay: animate ? delay : 0, ease: EASE_OUT }}>
      {children}
    </motion.div>
  )
}
