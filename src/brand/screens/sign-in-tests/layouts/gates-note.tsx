import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { Check, CircleHelp, Minus, X, type LucideIcon } from 'lucide-react'

import type { LineStatus } from '../../testing/evidence'
import type { CheckRow, SubCheck } from '../engine-run'
import type { Via } from '../conflicts'
import { noteDomId, useWhoIn, viaOf } from './gates-model'

/* -----------------------------------------------------------------------------
   Press to see why (GatesLayout.tsx): one note open at a time, beside what was
   pressed — why a gate stayed barred or opened, what a turnstile checked, how
   one light was read. It floats out of the flow, so opening one moves nothing.
   -------------------------------------------------------------------------- */


/** The note itself, placed by the caller (its `style`). */
export function GatesNote({ id, children, style, wide = false }: { id: string; children: ReactNode; style?: React.CSSProperties; wide?: boolean }) {
  return (
    <motion.div
      id={noteDomId(id)}
      className={`rl-gates__note${wide ? ' is-wide' : ''}`}
      role="note"
      data-card
      style={style}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.16 }}
    >
      {children}
    </motion.div>
  )
}

/* A note's lines: the first said firmly, the rest quiet; a fix last. */
export function NoteLines({ lines, fix }: { lines: readonly string[]; fix?: string }) {
  const said = [...new Set(lines.filter((l) => l && l.trim() !== ''))]
  return (
    <>
      {said.map((l, i) => (
        <p key={l} className={`rl-gates__notep${i === 0 ? ' is-lead' : ''}`}>
          {l}
        </p>
      ))}
      {fix && <p className="rl-gates__notefix">{fix}</p>}
    </>
  )
}

const MARK: Record<LineStatus | 'skip', { Icon: LucideIcon; label: string }> = {
  pass: { Icon: Check, label: 'Passed' },
  fail: { Icon: X, label: 'Failed' },
  unknown: { Icon: CircleHelp, label: "Can't tell" },
  skip: { Icon: Minus, label: 'Not checked' },
}

export function GatesMark({ status, size = 13, label }: { status: LineStatus | 'skip'; size?: number; label?: string }) {
  const { Icon, label: said } = MARK[status]
  return (
    <span className={`rl-gates__mark is-${status}`} role="img" aria-label={label ?? said}>
      <Icon size={size} strokeWidth={2.6} aria-hidden />
    </span>
  )
}

/* The rule's requirement, after "needs": "below 40"; a name keeps its capital. */
const lowerFirst = (t: string): string => (/^(Not|Below|Above|Between|Before|After) /.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t)

/* One check read across: what it is; what the sign-in showed (a Who that
   passed says the way in: "Maya Iyer · via Engineering"), and under it what
   the rule needs — the fact and the requirement never run into one claim. */
export function CheckBody({ word, fact, by, need, status }: { word: string; fact: string; by?: string; need: string; status: LineStatus | 'skip' }) {
  return (
    <>
      <span className="rl-gates__cword">{word}</span>
      <span className="rl-gates__ctext">
        <span className="rl-gates__cfact">
          {fact}
          {by && <span className="rl-gates__cvia"> · {by}</span>}
        </span>
        {need && (
          <span className="rl-gates__cneed">
            <span className="rl-gates__cjoin">needs </span>
            {lowerFirst(need)}
          </span>
        )}
      </span>
      <GatesMark status={status} />
    </>
  )
}


/* How one check was read: each part (a device profile's checks, a zone's two halves), or its one sentence. */
export function CheckParts({ c, via }: { c: CheckRow; via?: Via }) {
  const whoIn = useWhoIn()
  const parts: SubCheck[] = c.subs.filter((x) => x.label || x.actual || x.required)
  if (parts.length <= 1) {
    return (
      <ul className="rl-gates__parts">
        <li className={`rl-gates__part is-${c.status}`}>
          <CheckBody word={c.word} fact={c.missing ? 'Not stated' : c.value} by={viaOf(c, via, whoIn)} need={c.requirement} status={c.status} />
        </li>
      </ul>
    )
  }
  return (
    <ul className="rl-gates__parts">
      {parts.map((x) => (
        <li key={x.key} className={`rl-gates__part is-${x.status}`}>
          <CheckBody word={x.label} fact={x.actual || 'Not stated'} need={x.required} status={x.status} />
        </li>
      ))}
    </ul>
  )
}
