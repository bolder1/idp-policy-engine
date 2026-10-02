import { motion } from 'motion/react'
import { createContext, useContext, type CSSProperties, type ReactNode } from 'react'
import { AppWindow, Check, CircleHelp, Clock, Gauge, Globe, Laptop, Lock, MapPin, Users, X, type LucideIcon } from 'lucide-react'

import type { LineStatus } from '../../testing/evidence'
import type { PillCategory } from '../../testing/trace-pills'
import { Spinner } from '../PolicyStack'

/* -----------------------------------------------------------------------------
   The stream's small pieces (StreamLayout.tsx): a channel's number, a mark,
   the sluice gate at a channel's inlet, a rule gate's sensors, and the peek —
   one note open at a time, beside what is hovered, focused or pressed (a
   press pins it; Escape or a press elsewhere lets it go).
   -------------------------------------------------------------------------- */

export const EASE_OUT = [0.2, 0, 0, 1] as const

export function Num({ n }: { n: number | null }) {
  return (
    <span className="rl-stream__num" aria-hidden>
      {n === null ? <Lock size={11} strokeWidth={2.2} /> : n}
    </span>
  )
}

const MARK: Record<LineStatus, { Icon: LucideIcon; label: string }> = {
  pass: { Icon: Check, label: 'Passed' },
  fail: { Icon: X, label: 'Failed' },
  unknown: { Icon: CircleHelp, label: "Can't tell" },
}

export function Mark({ status, working = false, label }: { status: LineStatus; working?: boolean; label?: string }) {
  if (working) return <Spinner small />
  const { Icon, label: said } = MARK[status]
  return (
    <span className={`rl-stream__mark is-${status}`} role="img" aria-label={label ?? said}>
      <Icon size={13} strokeWidth={2.6} aria-hidden />
    </span>
  )
}

/*   shut      the stream glances off it (grey)
     working   the engine tests it (blue)
     open      the stream pours through (the outcome's colour once landed)
     ajar      a trickle: a later policy or rule that also covers the person, or one that can't be told (amber) */
export type GateState = 'idle' | 'shut' | 'working' | 'open' | 'ajar'

export function Gate({ state, tone, animate, style }: { state: GateState; tone: string; animate: boolean; style?: CSSProperties }) {
  const gap = state === 'open' ? 9 : state === 'ajar' ? 4 : 0
  const t = { duration: animate ? 0.42 : 0, ease: EASE_OUT }
  return (
    <span className={`rl-stream__gate is-${state}${state === 'open' ? ` is-${tone}` : ''}`} style={style} aria-hidden>
      <motion.span className="rl-stream__leaf is-top" initial={false} animate={{ y: -gap }} transition={t} />
      <motion.span className="rl-stream__leaf is-bottom" initial={false} animate={{ y: gap }} transition={t} />
    </span>
  )
}

const CATEGORY_ICON: Partial<Record<PillCategory, LucideIcon>> = { who: Users, network: Globe, place: MapPin, device: Laptop, time: Clock, risk: Gauge, app: AppWindow }

export type SensorState = 'idle' | 'working' | LineStatus | 'skipped'

/** One check on a rule's gate: its category, and what it read. */
export function Sensor({ category, word, state }: { category: PillCategory; word: string; state: SensorState }) {
  const Icon = CATEGORY_ICON[category] ?? CircleHelp
  const said = state === 'pass' ? 'passed' : state === 'fail' ? 'failed' : state === 'unknown' ? "can't tell" : state === 'skipped' ? 'not checked' : state === 'working' ? 'reading' : 'not read yet'
  return (
    <span className={`rl-stream__sensor is-${state}`} role="img" aria-label={`${word}: ${said}`} title={`${word} · ${said}`}>
      <Icon size={12} strokeWidth={2} aria-hidden />
      {(state === 'pass' || state === 'fail' || state === 'unknown') && (
        <span className="rl-stream__sensormark" aria-hidden>
          {state === 'pass' ? <Check size={10} strokeWidth={3} /> : state === 'fail' ? <X size={10} strokeWidth={3} /> : <CircleHelp size={10} strokeWidth={2.6} />}
        </span>
      )}
    </span>
  )
}

// --- The peek -------------------------------------------------------------------------

export interface PeekState {
  open: { id: string; pinned: boolean } | null
  show: (id: string) => void
  hide: (id: string) => void
  toggle: (id: string, from: HTMLElement) => void
}

export const PeekCtx = createContext<PeekState>({ open: null, show: () => {}, hide: () => {}, toggle: () => {} })

const noteId = (id: string) => `rl-stream-note-${id.replace(/[^a-zA-Z0-9_-]/g, '-')}`

/* Something with a reason behind it: a real button (focus ring, Enter and
   Space) whose note shows on hover and focus, and stays once pressed. */
export function Peek({
  id,
  className,
  label,
  note,
  children,
  side = 'below',
  node,
  hover = true,
  noteClass = '',
}: {
  id: string
  className: string
  label: string
  note: ReactNode
  children: ReactNode
  side?: 'below' | 'below-end' | 'right' | 'left'
  node?: string
  /** Hover and focus show the note; off, only a press does (a big note, What they see). */
  hover?: boolean
  noteClass?: string
}) {
  const { open, show, hide, toggle } = useContext(PeekCtx)
  const isOpen = open?.id === id
  return (
    <>
      <button
        type="button"
        className={`${className} rl-stream__peek${isOpen ? ' is-peeked' : ''}${isOpen && open?.pinned ? ' is-pinned' : ''}`}
        data-card
        data-node={node}
        aria-expanded={isOpen}
        aria-controls={isOpen ? noteId(id) : undefined}
        aria-label={label}
        onPointerEnter={(e) => hover && e.pointerType === 'mouse' && show(id)}
        onPointerLeave={(e) => hover && e.pointerType === 'mouse' && hide(id)}
        onFocus={() => hover && show(id)}
        onBlur={() => hover && hide(id)}
        onClick={(e) => toggle(id, e.currentTarget)}
      >
        {children}
      </button>
      {isOpen && note && (
        <motion.div
          id={noteId(id)}
          className={`rl-stream__note is-${side}${noteClass ? ` ${noteClass}` : ''}`}
          role="note"
          data-card
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.14, ease: EASE_OUT }}
        >
          {note}
        </motion.div>
      )}
    </>
  )
}

/* A note's lines: the first said firmly, the rest quiet, once each; a fix last. */
export function NoteLines({ lines, fix }: { lines: readonly string[]; fix?: string }) {
  const said = [...new Set(lines.filter((l) => l && l.trim() !== ''))]
  return (
    <>
      {said.map((l, i) => (
        <p key={l} className={`rl-stream__notep${i === 0 ? ' is-lead' : ''}`}>
          {l}
        </p>
      ))}
      {fix && <p className="rl-stream__notefix">{fix}</p>}
    </>
  )
}

/** The rule's requirement after "needs": "below 40", a name keeps its capital. */
export const lowerFirst = (t: string): string => (/^(Not|Below|Above|Between|Before|After) /.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t)

/** One check read across: what the sign-in showed, then what the rule needs — never run together. */
export function FactNeed({ word, fact, via, need, status }: { word: string; fact: string; via?: string; need: string; status?: LineStatus }) {
  return (
    <span className="rl-stream__fn">
      <span className="rl-stream__fnword">{word}</span>
      <span className="rl-stream__fntext">
        <span className="rl-stream__fnfact">
          {fact}
          {via && <span className="rl-stream__fnvia"> · {via}</span>}
        </span>
        {need && (
          <span className="rl-stream__fnneed">
            <span className="rl-stream__fnjoin">needs </span>
            {lowerFirst(need)}
          </span>
        )}
      </span>
      {status && <Mark status={status} />}
    </span>
  )
}
