import { motion } from 'motion/react'
import { useContext, type ReactNode } from 'react'
import { Check, CircleHelp, Lock, Minus, X, type LucideIcon } from 'lucide-react'

import type { LineStatus } from '../../testing/evidence'
import type { CheckRow } from '../engine-run'
import { Spinner } from '../PolicyStack'
import { lowerFirst } from './focus-model'
import { EASE_OUT, NoteCtx } from './focus-shared'

/* The small pieces every Focus card is made of (FocusLayout.tsx): the mark a
   check or a moment lands with, a card's number, the note a press opens,
   and a check read across — the fact, then what the rule needs. */

const MARK: Record<LineStatus, { Icon: LucideIcon; label: string }> = {
  pass: { Icon: Check, label: 'Passed' },
  fail: { Icon: X, label: 'Failed' },
  unknown: { Icon: CircleHelp, label: "Can't tell" },
}

/** A check's or a moment's mark; it lands with a small spring the first time it is drawn while playing. */
export function Mark({ status, working = false, label, pop = false, big = false }: { status: LineStatus | 'quiet'; working?: boolean; label?: string; pop?: boolean; big?: boolean }) {
  if (working) return <Spinner small={!big} />
  if (status === 'quiet') {
    return (
      <span className={`rl-focus__mark is-quiet${big ? ' is-big' : ''}`} role="img" aria-label={label ?? 'Not checked'}>
        <Minus size={big ? 15 : 13} strokeWidth={2.4} aria-hidden />
      </span>
    )
  }
  const { Icon, label: said } = MARK[status]
  return (
    <motion.span
      className={`rl-focus__mark is-${status}${big ? ' is-big' : ''}`}
      role="img"
      aria-label={label ?? said}
      initial={pop ? { scale: 0.3, opacity: 0 } : false}
      animate={{ scale: 1, opacity: 1 }}
      transition={pop ? { type: 'spring', stiffness: 520, damping: 22, mass: 0.6 } : { duration: 0 }}
    >
      <Icon size={big ? 15 : 13} strokeWidth={2.6} aria-hidden />
    </motion.span>
  )
}

/** A card's number: its place in the engine's order; the last row is locked. */
export function Num({ n, tone }: { n: number | null; tone?: string }) {
  return (
    <span className={`rl-focus__num${tone ? ` is-${tone}` : ''}`} aria-hidden>
      {n === null ? <Lock size={12} strokeWidth={2.2} /> : n}
    </span>
  )
}

// --- Press to see why --------------------------------------------------------------------


const noteDomId = (id: string) => `rl-focus-note-${id.replace(/[^a-zA-Z0-9_-]/g, '-')}`

/* A row that can be pressed for its why: a real button (focus ring, Enter,
   Space), its note opening under it, inside the card. */
export function Poke({ id, className, node, label, note, children }: { id: string; className: string; node?: string; label: string; note: ReactNode; children: ReactNode }) {
  const { open, toggle, inert } = useContext(NoteCtx)
  const isOpen = open === id && !inert
  return (
    <div className={`rl-focus__poke${isOpen ? ' is-open' : ''}`}>
      <button
        type="button"
        className={`${className} is-poke${isOpen ? ' is-pressed' : ''}`}
        data-node={node}
        aria-expanded={isOpen}
        aria-controls={isOpen ? noteDomId(id) : undefined}
        aria-label={label}
        tabIndex={inert ? -1 : undefined}
        onClick={() => toggle(id)}
      >
        {children}
      </button>
      {isOpen && (
        <motion.div id={noteDomId(id)} className="rl-focus__note" role="note" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.16, ease: EASE_OUT }}>
          {note}
        </motion.div>
      )}
    </div>
  )
}

/* A note's lines: the first said firmly, the rest quiet; a fix last. */
export function NoteLines({ lines, fix }: { lines: readonly string[]; fix?: string }) {
  const said = [...new Set(lines.filter((l) => l && l.trim() !== ''))]
  return (
    <>
      {said.map((l, i) => (
        <p key={l} className={`rl-focus__notep${i === 0 ? ' is-lead' : ''}`}>
          {l}
        </p>
      ))}
      {fix && <p className="rl-focus__notefix">{fix}</p>}
    </>
  )
}

// --- A check, read across ------------------------------------------------------------------

/* What it is; what the sign-in showed (a Who that passed: the way in, "via
   Engineering"); under it what the rule needs — the fact and the requirement
   never run together into one claim; then the mark. */
export function CheckBody({ word, fact, by, need, status, working, label, pop }: { word: string; fact: string; by?: string; need: string; status: LineStatus | 'quiet'; working: boolean; label?: string; pop?: boolean }) {
  return (
    <>
      <span className="rl-focus__cword">{word}</span>
      <span className="rl-focus__ctext">
        <span className="rl-focus__cfact">
          <span className="rl-focus__cval">{fact}</span>
          {by && <span className="rl-focus__cvia"> · {by}</span>}
        </span>
        {need && (
          <span className="rl-focus__cneed">
            <span className="rl-focus__cjoin">needs </span>
            {lowerFirst(need)}
          </span>
        )}
      </span>
      <Mark status={status} working={working} label={working ? undefined : label} pop={pop} />
    </>
  )
}


/* What a check was read on, part by part; a check of one part says its sentence. */
export function CheckNote({ c }: { c: CheckRow }) {
  const parts = c.subs.filter((x) => x.label || x.actual || x.required)
  if (parts.length <= 1) return <p className="rl-focus__notep is-lead">{c.line || c.say || c.tip}</p>
  return (
    <ul className="rl-focus__parts">
      {parts.map((x) => (
        <li key={x.key} className={`rl-focus__part is-${x.status}`}>
          <CheckBody word={x.label} fact={x.actual || 'Not stated'} need={x.required} status={x.status} working={false} />
        </li>
      ))}
    </ul>
  )
}
