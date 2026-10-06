import { motion } from 'motion/react'
import { useMemo } from 'react'
import { Square } from 'lucide-react'

import { fixPossessive } from './focus-voice'

import { PartsLine } from './assistant/AnswerText'
import type { Answer, Target } from './assistant/intents'

/* An answer in the assistant's thread, Focus's way (FocusLayout.tsx): a
   CAPTION to the card it brings into focus — the sentence, its words
   sharpening in, the phrases about something on the canvas underlined in
   their meaning colour, no numbers (the carousel shows one thing at a time,
   so the caption points by bringing it into focus). Hovered, focused or
   pressed, a phrase brings its moment into focus and lights it; the further
   lines follow, quieter. While the voice says it, the caption itself wears
   the live waveform and a Stop (as the subtitle does), so the dock's row
   stays the field for the next question instead of repeating the words. */

const NO_NUMS = new Map<Target, number>()

export function FocusCaption({ answer: raw, animate, onCite, lit, speaking = false, onStop }: { answer: Answer; animate: boolean; onCite: (t: Target | null) => void; lit: Target | null; speaking?: boolean; onStop?: () => void }) {
  /* A policy's name never takes 's: "None of the 3 rules in AWS for engineering teams match". */
  const answer = useMemo(() => ({ ...raw, sentence: raw.sentence.map((p) => (p.text.includes("'s ") ? { ...p, text: fixPossessive(p.text) } : p)) }), [raw])
  const words = answer.sentence.reduce((n, p) => n + p.text.split(/\s+/).filter(Boolean).length, 0)
  return (
    <div className={`ad-ans rl-focus__caption is-${answer.tone}${answer.known ? '' : ' is-unknown'}`}>
      <p className="ad-ans__sentence">
        {speaking && (
          <span className="rl-focus__wave rl-focus__capwave" aria-hidden>
            <i />
            <i />
            <i />
            <i />
          </span>
        )}
        <PartsLine parts={answer.sentence} nums={NO_NUMS} animate={animate} onCite={onCite} lit={lit} />
        {speaking && onStop && (
          <button type="button" className="rl-focus__substop rl-focus__capstop" aria-label="Stop the voice" title="Stop the voice" onClick={onStop}>
            <Square size={10} strokeWidth={2.4} fill="currentColor" aria-hidden />
          </button>
        )}
      </p>
      {answer.more && answer.more.length > 0 && (
        <ul className="ad-ans__more">
          {answer.more.map((line, i) => (
            <motion.li key={i} initial={animate ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ duration: 0.3, delay: animate ? Math.min(1.2, words * 0.035) + i * 0.08 : 0 }}>
              <PartsLine parts={line} nums={NO_NUMS} animate={false} onCite={onCite} lit={lit} />
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  )
}
