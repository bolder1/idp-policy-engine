import { motion } from 'motion/react'
import type { CSSProperties, ReactNode } from 'react'
import { Check, CircleHelp, X, type LucideIcon } from 'lucide-react'

import type { LineStatus } from '../../testing/evidence'
import type { Box } from './synapse-geometry'
import type { Tone } from './synapse-model'
import { EASE } from './synapse-parts-utils'

/* The network's small pieces (SynapseLayout.tsx): a mark, the spinner, a
   neuron's shell, a synapse and the light that travels it, a firing ripple.
   Nothing motion moves carries a CSS transform or transition of its own. */

const MARK: Record<LineStatus, { Icon: LucideIcon; label: string }> = {
  pass: { Icon: Check, label: 'Passed' },
  fail: { Icon: X, label: 'Failed' },
  unknown: { Icon: CircleHelp, label: "Can't tell" },
}

export function Mark({ status, label, size = 13 }: { status: LineStatus; label?: string; size?: number }) {
  const { Icon, label: said } = MARK[status]
  return (
    <span className={`rl-synapse__mark is-${status}`} role="img" aria-label={label ?? said}>
      <Icon size={size} strokeWidth={2.6} aria-hidden />
    </span>
  )
}

/** A turning arc (a CSS spin on an element motion never touches). */
export function Busy({ label = 'Working' }: { label?: string }) {
  return (
    <span className="rl-synapse__busy" role="img" aria-label={label}>
      <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden>
        <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.6" />
        <path d="M 7 1.5 A 5.5 5.5 0 0 1 12.5 7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </span>
  )
}

// --- A neuron ----------------------------------------------------------------------------------

export interface NeuronProps {
  box: Box
  tone: Tone
  kind: 'input' | 'policy' | 'check' | 'rule' | 'output'
  play: boolean
  /** Its fade-in delay, as the layer wakes (s). */
  delay?: number
  node?: string
  sy: string
  label: string
  lit?: boolean
  /** On a re-fire: when its colours change (s), as the wave reaches it. */
  settle?: number
  pressable?: boolean
  onPeek: (id: string, pin: boolean) => void
  onUnpeek: (id: string) => void
  onPress?: () => void
  children: ReactNode
  /** Its axon terminal on the right (every layer but the last). */
  axon?: boolean
  className?: string
}

/* A neuron: a glass card whose nucleus sits on its left edge (where its
   synapses arrive) and lights in its tone; its axon terminal on the right. */
export function Neuron({ box, tone, kind, play, delay = 0, node, sy, label, lit, settle, pressable = true, onPeek, onUnpeek, onPress, children, axon = true, className = '' }: NeuronProps) {
  if (tone === 'hidden') return null
  const style: CSSProperties = { left: box.x, top: box.y, width: box.w, height: box.h }
  return (
    <motion.div
      className={`rl-synapse__cell is-${kind}`}
      style={style}
      data-card
      initial={play ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      transition={{ duration: play ? 0.32 : 0, delay: play ? delay : 0, ease: 'easeOut' }}
    >
      <button
        type="button"
        className={`rl-synapse__n is-${tone}${lit ? ' is-route' : ''}${pressable ? '' : ' is-still'} ${className}`}
        data-node={node}
        data-sy={sy}
        style={settle !== undefined ? { transitionDelay: `${settle}s` } : undefined}
        aria-label={label}
        onPointerEnter={() => onPeek(sy, false)}
        onPointerLeave={() => onUnpeek(sy)}
        onFocus={() => onPeek(sy, false)}
        onBlur={() => onUnpeek(sy)}
        onClick={() => (onPress ? onPress() : onPeek(sy, true))}
      >
        <span className="rl-synapse__nucleus" aria-hidden />
        {axon && <span className="rl-synapse__axon" aria-hidden />}
        <span className="rl-synapse__nbody">{children}</span>
      </button>
    </motion.div>
  )
}

// --- A synapse ------------------------------------------------------------------------------------

export interface Pulse {
  tone: Tone
  /** Its trip along the synapse (ms). */
  ms: number
  delay?: number
  /** A new key, a new trip. */
  key: string | number
}

/* A synapse: its fibre in its tone, drawn in as its layer wakes; and, when
   the engine works it (or a result travels it), a light running its length —
   a dash of the same path, its offset animated (no transform). */
export function Synapse({ d, tone, route = false, traced = false, play, fire = play, pulse, draw = 0, settle }: { d: string; tone: Tone; route?: boolean; traced?: boolean; play: boolean; fire?: boolean; pulse: Pulse | null; draw?: number; settle?: number }) {
  if (tone === 'hidden') return null
  return (
    <g className={`rl-synapse__syn is-${tone}${route ? ' is-route' : ''}${traced ? ' is-traced' : ''}`}>
      <motion.path
        className="rl-synapse__fibre"
        d={d}
        style={settle !== undefined ? { transitionDelay: `${settle}s` } : undefined}
        initial={play ? { pathLength: 0, opacity: 0 } : false}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: play ? 0.42 : 0, delay: play ? draw : 0, ease: EASE }}
      />
      {pulse && fire && (
        <motion.path
          key={pulse.key}
          className={`rl-synapse__pulse is-${pulse.tone}`}
          d={d}
          initial={{ pathLength: 0.16, pathSpacing: 2, pathOffset: -0.16, opacity: 0 }}
          animate={{ pathOffset: 1, opacity: [0, 1, 1, 0] }}
          transition={{ duration: Math.max(0.22, pulse.ms / 1000), delay: pulse.delay ?? 0, ease: [0.45, 0, 0.55, 1], opacity: { duration: Math.max(0.22, pulse.ms / 1000), delay: pulse.delay ?? 0, times: [0, 0.12, 0.85, 1] } }}
        />
      )}
    </g>
  )
}

/** A neuron firing: one ring out from its nucleus, in its tone. */
export function Ripple({ x, y, tone, k, delay = 0 }: { x: number; y: number; tone: Tone; k: string | number; delay?: number }) {
  return (
    <motion.circle
      key={k}
      className={`rl-synapse__ripple is-${tone}`}
      cx={x}
      cy={y}
      initial={{ r: 6, opacity: 0 }}
      animate={{ r: [6, 34], opacity: [0.9, 0] }}
      transition={{ duration: 0.75, delay, ease: [0.2, 0, 0.4, 1] }}
    />
  )
}
