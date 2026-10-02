import { motion } from 'motion/react'
import { useContext, type CSSProperties, type ReactNode } from 'react'
import { Check, CircleHelp, Minus, X, type LucideIcon } from 'lucide-react'

import type { LineStatus } from '../../testing/evidence'
import type { CheckRow, SubCheck } from '../engine-run'
import { NoteCtx, lowerFirst } from './circuit-note-ctx'

/* -----------------------------------------------------------------------------
   Press (or hover) a piece of the board to see why (CircuitLayout.tsx): one
   note open at a time, floating under what opened it, out of the flow, so
   the board never moves. A hover peeks; a press pins it; Escape or a press
   elsewhere shuts it.
   -------------------------------------------------------------------------- */

const domId = (id: string) => `rl-circuit-note-${id.replace(/[^a-zA-Z0-9_-]/g, '-')}`

export function Poke({
  id,
  className,
  style,
  node,
  label,
  note,
  hover = false,
  side = 'below',
  children,
}: {
  id: string
  className: string
  style?: CSSProperties
  node?: string
  label: string
  note: ReactNode
  /** A hover peeks at the note (a switch): never the only way, a press pins it. */
  hover?: boolean
  side?: 'below' | 'above'
  children: ReactNode
}) {
  const { open, peek, pin } = useContext(NoteCtx)
  const isOpen = open?.id === id
  return (
    <div
      className={`rl-circuit__poke${isOpen ? ' is-open' : ''}`}
      style={style}
      data-card
      onMouseEnter={hover ? () => peek(id) : undefined}
      onMouseLeave={hover ? () => peek(null) : undefined}
    >
      <button
        type="button"
        className={`${className} is-poke${isOpen && open?.pin ? ' is-pressed' : ''}`}
        data-card
        data-node={node}
        aria-expanded={isOpen}
        aria-controls={isOpen ? domId(id) : undefined}
        aria-label={label}
        onClick={(e) => pin(id, e.currentTarget)}
        onFocus={hover ? () => peek(id) : undefined}
        onBlur={hover ? () => peek(null) : undefined}
      >
        {children}
      </button>
      {isOpen && (
        <motion.div
          id={domId(id)}
          className={`rl-circuit__note is-${side}`}
          role="note"
          data-card
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.14 }}
        >
          {note}
        </motion.div>
      )}
    </div>
  )
}

/** A note's lines: the first said firmly, the rest quiet; a fix last. */
export function NoteLines({ lines, fix }: { lines: readonly (string | undefined | null)[]; fix?: string }) {
  const said = [...new Set(lines.filter((l): l is string => !!l && l.trim() !== ''))]
  return (
    <>
      {said.map((l, i) => (
        <p key={l} className={`rl-circuit__notep${i === 0 ? ' is-lead' : ''}`}>
          {l}
        </p>
      ))}
      {fix && <p className="rl-circuit__notefix">{fix}</p>}
    </>
  )
}

const MARK: Record<LineStatus | 'skip', { Icon: LucideIcon; label: string }> = {
  pass: { Icon: Check, label: 'Closes' },
  fail: { Icon: X, label: 'Stays open' },
  unknown: { Icon: CircleHelp, label: "Can't tell" },
  skip: { Icon: Minus, label: 'Not checked' },
}

export function Mark({ status, label }: { status: LineStatus | 'skip'; label?: string }) {
  const { Icon, label: said } = MARK[status]
  return (
    <span className={`rl-circuit__mark is-${status}`} role="img" aria-label={label ?? said}>
      <Icon size={12} strokeWidth={2.8} aria-hidden />
    </span>
  )
}

/** A check's parts (a device profile's checks, a zone's two halves), fact against requirement. */
export function CheckParts({ c, via }: { c: CheckRow; via: string }) {
  const parts: SubCheck[] = c.subs.filter((x) => x.label || x.actual || x.required)
  return (
    <>
      <p className="rl-circuit__notehead">
        <Mark status={c.status} />
        <span>{c.word}</span>
      </p>
      <dl className="rl-circuit__facts">
        <dt>Sign-in</dt>
        <dd>
          {c.missing ? 'Not stated' : c.value}
          {via && <span className="rl-circuit__via"> · {via}</span>}
        </dd>
        <dt>Needs</dt>
        <dd>{c.requirement || '—'}</dd>
      </dl>
      {parts.length > 1 && (
        <ul className="rl-circuit__parts">
          {parts.map((x) => (
            <li key={x.key} className={`is-${x.status}`}>
              <Mark status={x.status} />
              <span className="rl-circuit__partword">{x.label}</span>
              <span className="rl-circuit__partfact">{x.actual || 'Not stated'}</span>
              {x.required && <span className="rl-circuit__partneed">needs {lowerFirst(x.required)}</span>}
            </li>
          ))}
        </ul>
      )}
      {parts.length <= 1 && c.line && <p className="rl-circuit__notep">{c.line}</p>}
    </>
  )
}
