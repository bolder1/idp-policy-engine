import { motion } from 'motion/react'
import type { KeyboardEvent, ReactNode } from 'react'

import { GlyphMark } from './brief-glyph'
import type { CiteId, Part, Seg } from './brief-model'
import { LAND, QUIET, revealOf, shownAt, useLandingBeat, type TextProps } from './brief-text'

/* -----------------------------------------------------------------------------
   The pieces every version of the brief's text draws with (brief-text.ts,
   brief-text-1.tsx … brief-text-5.tsx):

     PartWords     a part's words, each picked thing with its mark before it
                   (brief-glyph.tsx) — the mark rides with its thing's first
                   word, never left alone at a line's end. Ink words; the
                   colour is on the mark.
     Phrase        one part, as the run reaches it: held unseen at its width
                   until its step (nothing reflows), then revealed (~200 ms,
                   blur 4px → 0). A cited part is a press: hovered or focused
                   it lights its evidence; Enter, Space or a click pins it —
                   once landed, opens the right-hand panel on its step.
     PlainSentence the plainer sentence (`text.parts`), plainly: each part
                   revealed as proven, the first blank of the part the engine
                   works on blue, the answer in its tone with the landing beat,
                   the quiet underlines. Versions 1–5 start from it.
     TextAnnounce  the final text, announced once (aria-live polite).
   -------------------------------------------------------------------------- */

const segsOf = (p: Part): readonly Seg[] => p.segs ?? [{ text: p.text }]

/** A part's words with their marks; `size` is the marks' size (the text's). */
export function PartWords({ part, size }: { part: Part; size: number }) {
  return (
    <>
      {segsOf(part).map((seg, j) => {
        let lead = !!seg.glyph
        const words = seg.text.split(/(\s+)/).map((b, i) => {
          if (b === '' || b.trim() === '') return b
          if (!lead) return b
          lead = false
          return (
            <span key={i} className="rl-brief__lead">
              {seg.glyph && <GlyphMark g={seg.glyph} size={size} />}
              {b}
            </span>
          )
        })
        return seg.entity ? (
          <span key={j} className={`rl-brief__ent is-${seg.entity}`}>
            {words}
          </span>
        ) : (
          <span key={j}>{words}</span>
        )
      })}
    </>
  )
}

export interface PhraseProps {
  part: Part
  s: number
  landed: boolean
  animate: boolean
  lit: CiteId | null
  pinned: CiteId | null
  onHot: (c: CiteId | null) => void
  onPin: (c: CiteId) => void
  /** The marks' size (the text's). */
  size: number
  /** Seconds after the part is reached that it is revealed. */
  delay?: number
  /** Before its step: hold the part's room unseen (default), or draw nothing. */
  hold?: boolean
  /** Before its step: blue, the engine working on it now. */
  working?: boolean
  className?: string
  children?: ReactNode
}

/** One part of the text, revealed as the run reaches it; a cited part is a press. */
export function Phrase({ part, s, landed, animate, lit, pinned, onHot, onPin, size, delay = 0, hold = true, working = false, className = '', children }: PhraseProps) {
  const body = children ?? <PartWords part={part} size={size} />
  if (!shownAt(part, s, landed)) {
    if (!hold) return null
    return (
      <span className={`rl-bt-hold${working ? ' is-working' : ''} ${className}`} aria-hidden>
        {body}
      </span>
    )
  }
  const shown = (
    <motion.span key={`${part.key}:on`} className="rl-bt-on" {...revealOf(animate, delay)}>
      {body}
    </motion.span>
  )
  const c = part.cite
  if (!c) return <span className={`rl-brief__glue${part.notice ? ' is-notice' : ''} ${className}`}>{shown}</span>
  const onKey = (e: KeyboardEvent<HTMLSpanElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onPin(c)
    }
  }
  return (
    <span
      role="button"
      tabIndex={0}
      data-card
      data-cite={c}
      aria-pressed={pinned === c}
      aria-label={`${part.text}: show how it was decided`}
      className={`rl-brief__cite is-${c}${lit === c ? ' is-lit' : ''}${part.answer ? ' is-answer' : ''}${part.notice ? ' is-notice' : ''} ${className}`}
      onMouseEnter={() => onHot(c)}
      onMouseLeave={() => onHot(null)}
      onFocus={() => onHot(c)}
      onBlur={() => onHot(null)}
      onClick={() => onPin(c)}
      onKeyDown={onKey}
    >
      {shown}
    </span>
  )
}

/** The plainer sentence, plainly (the placeholder every version 1–5 starts from); `className` names the version. */
export function PlainSentence({ text, s, landed, animate, working, lit, pinned, tone, onHot, onPin, runKey, narrow, className = '' }: TextProps & { className?: string }) {
  const beat = useLandingBeat(landed, animate, runKey)
  const size = narrow ? 20 : 22
  const workKey = working ? text.parts.find((p) => p.cite === working && !shownAt(p, s, landed))?.key : undefined
  return (
    <p className={`rl-bt ${QUIET}${landed ? ` is-landed is-${tone}` : ''}${narrow ? ' is-narrow' : ''} ${className}`}>
      {text.parts.map((part) => (
        <Phrase
          key={part.key}
          part={part}
          s={s}
          landed={landed}
          animate={animate}
          lit={lit}
          pinned={pinned}
          onHot={onHot}
          onPin={onPin}
          size={size}
          working={part.key === workKey}
          className={part.key === text.outcome.key && beat ? `${LAND} is-beat` : ''}
        />
      ))}
    </p>
  )
}

/** The final text, said once to assistive tech as it lands (polite). */
export function TextAnnounce({ text, landed }: { text: string; landed: boolean }) {
  return (
    <p className="rl-bt-sr" aria-live="polite" aria-atomic="true">
      {landed ? text : ''}
    </p>
  )
}
