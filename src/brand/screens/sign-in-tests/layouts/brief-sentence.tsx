import { motion } from 'motion/react'
import type { KeyboardEvent, ReactNode } from 'react'

import { GlyphMark } from './brief-glyph'
import type { CiteId, Part, Seg, Tone } from './brief-model'

/* -----------------------------------------------------------------------------
   The answer, as one sentence (BriefLayout.tsx). Every part is laid out at
   its final size from the first frame — the words not yet written sit as
   soft blanks of their own width, so the sentence never reflows as it is
   built — and each is written, word by word, the moment the engine reaches
   it (its `at` step), the stream paced by that step's length. A blank the
   engine is working on now is the console blue; the rest wait grey.

   A cited phrase carries its card's number. Hovered or focused it lights its
   card; pressed it pins it (pressed again, lets go).

   The things the admin picked are named in their colours — who blue, the
   application orange, the conditions violet — each with its mark before it
   (brief-glyph.tsx). The mark rides with its thing's first word: written
   with it, blurred and sharpened with it, never left alone at a line's end.
   A blank holds the marks and the tints' room too, unseen, so nothing moves
   when it is written.
   -------------------------------------------------------------------------- */

export interface SentenceProps {
  parts: readonly Part[]
  num: Partial<Record<CiteId, number>>
  s: number
  landed: boolean
  /** Words arrive as they are written (a run playing, motion allowed). */
  animate: boolean
  working: CiteId | null
  lit: CiteId | null
  pinned: CiteId | null
  tone: Tone
  /** How long the step a part is written at lasts (ms). */
  durOf: (at: number) => number
  onHot: (c: CiteId | null) => void
  onPin: (c: CiteId) => void
  className?: string
  /** Everything written at once (a what-if briefed): one sweep through the sentence, word after word. */
  sweep?: boolean
}

const EASE = [0.2, 0, 0, 1] as const

/** The glyph's size, in the sentence it sits in: the answer's, or the conflict line's. */
const glyphSize = (small: boolean): number => (small ? 15 : 22)

const segsOf = (p: Part): readonly Seg[] => p.segs ?? [{ text: p.text }]

/* A run's words: its mark joined to its first word, unbreakable, so the two
   are written — and wrapped — together. */
function wordsOf(seg: Seg, word: (w: string, i: number, lead: boolean) => ReactNode): ReactNode[] {
  let lead = !!seg.glyph
  return seg.text.split(/(\s+)/).map((b, i) => {
    if (b === '') return null
    if (b.trim() === '') return b
    const first = lead
    lead = false
    return word(b, i, first)
  })
}

/* One run, still: plain words, or a picked thing in its tint — written
   whole, or, in a blank, held unseen at its width. */
function Run({ seg, children }: { seg: Seg; children: ReactNode }) {
  if (!seg.entity) return <>{children}</>
  return <span className={`rl-brief__ent is-${seg.entity}`}>{children}</span>
}

function Lead({ seg, small, word }: { seg: Seg; small: boolean; word: string }) {
  return (
    <span className="rl-brief__lead">
      {seg.glyph && <GlyphMark g={seg.glyph} size={glyphSize(small)} />}
      {word}
    </span>
  )
}

/** A part's runs, still: written whole, or blank. */
function Still({ part, small }: { part: Part; small: boolean }) {
  return (
    <>
      {segsOf(part).map((seg, j) => (
        <Run key={j} seg={seg}>
          {wordsOf(seg, (w, i, lead) => (lead ? <Lead key={i} seg={seg} small={small} word={w} /> : w))}
        </Run>
      ))}
    </>
  )
}

function Stream({ part, animate, dur, base = 0, small }: { part: Part; animate: boolean; dur: number; base?: number; small: boolean }) {
  if (!animate) return <Still part={part} small={small} />
  const words = part.text.split(/\s+/).filter(Boolean).length
  const per = Math.min(0.07, Math.max(0.02, (Math.min(dur, 900) / 1000) * 0.7 / Math.max(1, words)))
  let w = 0
  const on = (delay: number) => ({ initial: { opacity: 0, filter: 'blur(6px)' }, animate: { opacity: 1, filter: 'blur(0px)' }, transition: { duration: 0.32, delay, ease: EASE } })
  return (
    <>
      {segsOf(part).map((seg, j) => {
        /* A tint arrives with its first word: faded in as that word is written. */
        const first = base + w * per
        const runWords = wordsOf(seg, (b, i, lead) => (
          <motion.span key={i} className={`rl-brief__w${lead ? ' rl-brief__lead' : ''}`} {...on(base + w++ * per)}>
            {lead && seg.glyph && <GlyphMark g={seg.glyph} size={glyphSize(small)} />}
            {b}
          </motion.span>
        ))
        if (!seg.entity) return <span key={j}>{runWords}</span>
        return (
          <motion.span key={j} className={`rl-brief__ent is-${seg.entity}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.32, delay: first, ease: EASE }}>
            {runWords}
          </motion.span>
        )
      })}
    </>
  )
}

export function Sentence({ parts, num, s, landed, animate, working, lit, pinned, tone, durOf, onHot, onPin, className = '', sweep = false }: SentenceProps) {
  let words = 0
  const small = className.includes('is-after')
  /* The first blank of the cite the engine is on: the one blue blank. */
  const workKey = working ? parts.find((p) => p.cite === working && !(landed || s >= p.at))?.key : undefined
  return (
    <p className={`rl-brief__sentence${landed ? ` is-landed is-${tone}` : ''} ${className}`}>
      {parts.map((p) => {
        const shown = landed || s >= p.at
        if (!shown) {
          return (
            <span key={p.key} className={`rl-brief__blank${p.cite ? ' is-cite' : ''}${p.key === workKey ? ' is-working' : ''}`} aria-hidden>
              <Still part={p} small={small} />
              {p.cite && num[p.cite] !== undefined && <sup className="rl-brief__mk is-hidden">{num[p.cite]}</sup>}
            </span>
          )
        }
        const base = sweep ? words * 0.035 : 0
        words += p.text.split(/\s+/).filter(Boolean).length
        const body = <Stream key={`${p.key}:on`} part={p} animate={animate} dur={sweep ? 300 : durOf(p.at)} base={base} small={small} />
        if (!p.cite || num[p.cite] === undefined) {
          return (
            <span key={p.key} className={`rl-brief__glue${p.notice ? ' is-notice' : ''}`}>
              {body}
            </span>
          )
        }
        const c = p.cite
        const n = num[c]
        const onKey = (e: KeyboardEvent<HTMLSpanElement>) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onPin(c)
          }
        }
        return (
          <span
            key={p.key}
            role="button"
            tabIndex={0}
            data-card
            data-cite={c}
            aria-pressed={pinned === c}
            aria-label={`${p.text}, evidence ${n}`}
            className={`rl-brief__cite is-${c}${lit === c ? ' is-lit' : ''}${p.answer ? ' is-answer' : ''}${p.notice ? ' is-notice' : ''}`}
            onMouseEnter={() => onHot(c)}
            onMouseLeave={() => onHot(null)}
            onFocus={() => onHot(c)}
            onBlur={() => onHot(null)}
            onClick={() => onPin(c)}
            onKeyDown={onKey}
          >
            {body}
            <motion.sup
              className="rl-brief__mk"
              initial={animate ? { opacity: 0 } : false}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2, delay: animate ? 0.18 : 0 }}
            >
              {n}
            </motion.sup>
          </span>
        )
      })}
    </p>
  )
}
