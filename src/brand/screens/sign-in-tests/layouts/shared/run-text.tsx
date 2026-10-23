import { useLayoutEffect, useRef } from 'react'

import { RESOLVE_STEP_MS, quietScramble } from './run-text-model'

/* -----------------------------------------------------------------------------
   THE RUN'S MACHINE WORDS, RESOLVING (phase.ts RUN_MOTION; owner, 5 Oct 2026,
   queued for the run: "the semi-glitchy type effect" of Aruna's, and 20 Oct
   2026: "always animated"). Aruna's decode (jarvis-decode.tsx `Decode`, which is
   hers and stays as it is), ported for the console's light card and made
   quiet:

     · a glyph keeps its character's class — a lowercase letter scrambles to a
       lowercase one, a capital to a capital, a digit to a digit — and spaces
       and punctuation are kept, so the line holds its shape and reads as
       resolving, not as code; no < > / + #
     · it steps every 40 ms, revealed left to right over `ms`
     · only for what the engine says: "Reading rules", "Reading", "Matches",
       "Not matched · Network", "Rule 1 · ", "No rule matched", "Can't tell · …"
       — never a person, an application, a group, a policy or a rule's name
       (a garbled identity reads as corruption in a security console), never
       the answer, never anything once landed

   Not playing (a static render, a run drawn settled, a Skip, reduced motion),
   it is the plain words in one span — the text appears once in the markup, so
   every reading of the card's words is the same as without it. Playing, the
   words are in the DOM from the first frame for assistive tech (sr-only), an
   unseen ghost holds the line's size so nothing reflows, and the scramble is
   written straight into one span's text — no React render per frame. A hidden
   pane gets no animation frames, so a timer settles the words regardless.
   -------------------------------------------------------------------------- */

export interface ResolveProps {
  text: string
  /** Resolve in; off, the plain words. */
  play: boolean
  ms?: number
  delay?: number
  className?: string
}

export function Resolve({ text, play, ms = 300, delay = 0, className }: ResolveProps) {
  if (!play) return <span className={className}>{text}</span>
  /* Keyed by its words: new words resolve in afresh. */
  return <Resolving key={text} text={text} ms={ms} delay={delay} className={className} />
}

function Resolving({ text, ms, delay, className }: { text: string; ms: number; delay: number; className?: string }) {
  const live = useRef<HTMLSpanElement | null>(null)
  useLayoutEffect(() => {
    const el = live.current
    if (!el) return
    let raf = 0
    let frame = -1
    const t0 = performance.now() + delay
    el.textContent = quietScramble(text, 0)
    const tick = (now: number) => {
      const k = Math.max(0, Math.min(1, (now - t0) / Math.max(1, ms)))
      const step = Math.floor(Math.max(0, now - t0) / RESOLVE_STEP_MS)
      if (k >= 1) {
        el.textContent = text
        return
      }
      if (step !== frame) {
        frame = step
        el.textContent = quietScramble(text, k, step)
      }
      raf = window.requestAnimationFrame(tick)
    }
    raf = window.requestAnimationFrame(tick)
    /* No frames in a hidden pane: the words land anyway. */
    const done = window.setTimeout(() => {
      el.textContent = text
    }, delay + ms + 120)
    return () => {
      window.cancelAnimationFrame(raf)
      window.clearTimeout(done)
      el.textContent = text
    }
  }, [text, ms, delay])
  return (
    <span className={`rl-dec${className ? ` ${className}` : ''}`}>
      <span className="u-sr-only">{text}</span>
      <span className="rl-dec__ghost" aria-hidden>
        {text}
      </span>
      <span ref={live} className="rl-dec__live" aria-hidden>
        {text}
      </span>
    </span>
  )
}
