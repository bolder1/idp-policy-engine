import { animate as animateValue, motion, useMotionValue } from 'motion/react'
import { useLayoutEffect, useRef, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react'
import { Check, CircleHelp, CornerDownLeft, X, type LucideIcon } from 'lucide-react'

import type { LineStatus } from '../../testing/evidence'
import type { Answer, Chip } from './mission-intents'
import type { PeekLine } from './mission-peek'
import { Decode, Typed } from './mission-type'

/* -----------------------------------------------------------------------------
   The room's floor (MissionLayout.tsx): the mission log, a ticker that types
   each call with its mission-elapsed time as the poll goes on (so the run
   reads muted), and the "Ask flight" bar — suggestions for THIS run and a line
   to type into, each answered from the plan (mission-intents.ts).
   -------------------------------------------------------------------------- */

const EASE = [0.2, 0, 0, 1] as const

export interface TickerLine {
  key: string
  t: string
  text: string
  tone: string
  recall?: boolean
}

/* The ticker: the lines in a row, the newest at the right end, typed; the row
   glides left as it outgrows the strip (a motion value on the inner row, which
   has no CSS transform of its own). */
export function MissionLog({ lines, play, onPick }: { lines: readonly TickerLine[]; play: boolean; onPick: (key: string) => void }) {
  const outer = useRef<HTMLDivElement | null>(null)
  const inner = useRef<HTMLDivElement | null>(null)
  const x = useMotionValue(0)
  const sig = lines.map((l) => l.key).join('|')
  useLayoutEffect(() => {
    const o = outer.current
    const i = inner.current
    if (!o || !i) return
    /* Cut at a line's start, never through one: the first line from which the rest fit. */
    const room = o.clientWidth
    const total = i.scrollWidth
    let to = 0
    if (total > room) {
      const kids = Array.from(i.children) as HTMLElement[]
      const k = kids.findIndex((c) => total - c.offsetLeft <= room)
      to = k >= 0 ? -kids[k].offsetLeft : room - total
    }
    if (!play) {
      x.set(to)
      return
    }
    const c = animateValue(x, to, { duration: 0.45, ease: EASE })
    return () => c.stop()
  }, [sig, play, x])
  const newest = lines[lines.length - 1]?.key
  return (
    <div className="rl-mission__log" role="log" aria-label="Mission log" aria-live="off">
      <span className="rl-mission__logtag">Mission log</span>
      <div ref={outer} className="rl-mission__logstrip">
        <motion.div ref={inner} className="rl-mission__logrow" style={{ x }}>
          {lines.map((l, i) => {
            const age = lines.length - 1 - i
            return (
              <button
                key={l.key}
                type="button"
                className={`rl-mission__logline is-${l.tone}${l.recall ? ' is-recall' : ''}${age === 0 ? ' is-new' : ''}`}
                style={{ opacity: age === 0 ? 1 : age === 1 ? 0.78 : age === 2 ? 0.6 : 0.45 }}
                onClick={() => onPick(l.key)}
                tabIndex={age < 4 ? 0 : -1}
              >
                <span className="rl-mission__met">{l.t}</span>
                <span className="rl-mission__logtext">{l.key === newest ? <Typed text={l.text} play={play} cps={60} /> : l.text}</span>
              </button>
            )
          })}
        </motion.div>
      </div>
    </div>
  )
}

const MARK: Record<LineStatus, { Icon: LucideIcon; label: string }> = {
  pass: { Icon: Check, label: 'GO' },
  fail: { Icon: X, label: 'NO-GO' },
  unknown: { Icon: CircleHelp, label: 'Hold' },
}

export function Mark({ status, size = 12 }: { status: LineStatus; size?: number }) {
  const { Icon, label } = MARK[status]
  return (
    <span className={`rl-mission__mark is-${status}`} role="img" aria-label={label}>
      <Icon size={size} strokeWidth={2.6} aria-hidden />
    </span>
  )
}

export function AnswerCard({ a, play, onClose }: { a: Answer; play: boolean; onClose: () => void }) {
  return (
    <motion.section
      className={`rl-mission__answer is-${a.tone}`}
      role="status"
      aria-label={a.title}
      initial={play ? { opacity: 0, y: 8 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: play ? 0.24 : 0, ease: EASE }}
    >
      <header className="rl-mission__answerhead">
        <span className="rl-mission__answerkicker">Flight</span>
        <span className="rl-mission__answertitle">
          <Decode text={a.title} play={play} ms={320} />
        </span>
        <button type="button" className="rl-mission__x" aria-label="Close the answer" onClick={onClose}>
          <X size={13} strokeWidth={2.2} aria-hidden />
        </button>
      </header>
      {a.lines.length > 0 && (
        <ul className="rl-mission__answerlines">
          {a.lines.map((l, i) => (
            <motion.li
              key={`${i}:${l.text}`}
              className={l.tone ? `is-${l.tone}` : undefined}
              initial={play ? { opacity: 0 } : false}
              animate={{ opacity: 1 }}
              transition={{ duration: play ? 0.2 : 0, delay: play ? 0.1 + i * 0.05 : 0 }}
            >
              <span className="rl-mission__peektext">
                {l.text}
                {l.sub && <span className="rl-mission__peeksub">{l.sub}</span>}
              </span>
              {l.mark && <Mark status={l.mark} />}
            </motion.li>
          ))}
        </ul>
      )}
    </motion.section>
  )
}

export interface AskBarProps {
  chips: readonly Chip[]
  onChip: (c: Chip) => void
  activeKey: string | null
  chipKey: (c: Chip) => string
  text: string
  setText: (t: string) => void
  onSubmit: (t: string) => void
  onEscape: () => void
  waiting: string | null
  disabled: boolean
  play: boolean
  inputRef: RefObject<HTMLInputElement | null>
}

export function AskBar({ chips, onChip, activeKey, chipKey, text, setText, onSubmit, onEscape, waiting, disabled, play, inputRef }: AskBarProps) {
  const submit = (e: FormEvent) => {
    e.preventDefault()
    onSubmit(text)
  }
  const onKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      e.stopPropagation()
      onSubmit(text)
    } else if (e.key === 'Escape') {
      e.stopPropagation()
      if (text) setText('')
      else onEscape()
    }
  }
  return (
    <div className="rl-mission__askrow">
      <form className="rl-mission__ask" onSubmit={submit} role="search">
        <span className="rl-mission__asktag" aria-hidden>
          Ask flight
        </span>
        <input
          ref={inputRef}
          className="rl-mission__input"
          type="text"
          value={text}
          placeholder={waiting ? `“${waiting}” · once the poll lands` : 'Why this call?'}
          aria-label="Ask flight about this sign-in"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          disabled={disabled}
        />
        <button type="submit" className="rl-mission__send" aria-label="Ask" disabled={!text.trim()}>
          <CornerDownLeft size={14} strokeWidth={2} aria-hidden />
        </button>
      </form>
      {chips.length > 0 && (
        <div className="rl-mission__chips" role="group" aria-label="Ask flight">
          {chips.map((c, i) => (
            <motion.button
              key={c.key}
              type="button"
              className={`rl-mission__chip${activeKey === chipKey(c) ? ' is-on' : ''}`}
              initial={play ? { opacity: 0 } : false}
              animate={{ opacity: 1 }}
              transition={{ duration: play ? 0.24 : 0, delay: play ? 0.4 + i * 0.05 : 0, ease: EASE }}
              onClick={() => onChip(c)}
            >
              {c.label}
            </motion.button>
          ))}
        </div>
      )}
    </div>
  )
}

/* The inspector's lines (mission-peek.ts composes them). */
export function PeekLines({ lines }: { lines: readonly PeekLine[] }) {
  return (
    <ul className="rl-mission__peeklines">
      {lines.map((l, i) => (
        <li key={`${i}:${l.text}`} className={`${i === 0 ? 'is-lead' : ''}${l.quiet ? ' is-quiet' : ''}${l.tone ? ` is-${l.tone}` : ''}${l.indent ? ' is-indent' : ''}`}>
          <span className="rl-mission__peektext">
            {l.text}
            {l.sub && <span className="rl-mission__peeksub">{l.sub}</span>}
          </span>
          {l.call && <span className={`rl-mission__peekcall is-${l.mark ?? l.tone ?? 'neutral'}`}>{l.call}</span>}
          {!l.call && l.mark && <Mark status={l.mark} size={11} />}
        </li>
      ))}
    </ul>
  )
}
