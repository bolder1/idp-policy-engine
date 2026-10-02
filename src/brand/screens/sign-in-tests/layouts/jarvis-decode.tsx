import { useLayoutEffect, useRef } from 'react'

/* -----------------------------------------------------------------------------
   The HUD's decode (JarvisLayout.tsx): a line of text arrives scrambled and
   resolves, left to right, in a few hundred milliseconds — the assistant
   "reading it out". Pure decoration over words that are already final: the
   words are in the DOM from the first frame (for assistive tech, and as a
   ghost that holds the line's size, so nothing reflows while the glyphs
   change), and the scramble is written straight into one span's text, frame
   by frame — no React render per frame.

   It plays only when asked (`play`): a revisit, Skip and reduced motion show
   the words at once. A hidden pane gets no animation frames, so a timer
   settles the words regardless.
   -------------------------------------------------------------------------- */

const GLYPHS = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789<>/+#'

/* The text at `k` (0–1) of its decode: what is revealed so far is the text
   itself; the rest are glyphs, spaces and punctuation kept, so the shape of
   the line is there from the start. */
function scramble(text: string, k: number, seed = 0): string {
  const n = text.length
  if (k >= 1 || n === 0) return text
  const shown = Math.floor(n * k)
  let out = ''
  for (let i = 0; i < n; i++) {
    const ch = text[i]
    if (i < shown || /[\s·→,.:;—–\-()'"“”]/.test(ch)) out += ch
    else out += GLYPHS[(i * 7 + seed * 13 + ((seed + i) % 5)) % GLYPHS.length]
  }
  return out
}

export function Decode({ text, play, ms = 420, delay = 0, className = '' }: { text: string; play: boolean; ms?: number; delay?: number; className?: string }) {
  const live = useRef<HTMLSpanElement | null>(null)
  useLayoutEffect(() => {
    const el = live.current
    if (!el) return
    if (!play || ms <= 0) {
      el.textContent = text
      return
    }
    let raf = 0
    let frame = 0
    const t0 = performance.now() + delay
    el.textContent = scramble(text, 0)
    const tick = (now: number) => {
      const k = Math.max(0, Math.min(1, (now - t0) / ms))
      frame++
      el.textContent = scramble(text, k, frame)
      if (k < 1) raf = window.requestAnimationFrame(tick)
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
  }, [text, play, ms, delay])
  return (
    <span className={`rl-jarvis__decode${className ? ` ${className}` : ''}`}>
      <span className="rl-jarvis__sr">{text}</span>
      <span className="rl-jarvis__decode-ghost" aria-hidden>
        {text}
      </span>
      <span ref={live} className="rl-jarvis__decode-live" aria-hidden>
        {text}
      </span>
    </span>
  )
}

/* A line typed out, a character at a time — the subtitle of what the
   assistant says. Written into the span's text directly, like the decode. */
export function Typed({ text, play, cps = 38 }: { text: string; play: boolean; cps?: number }) {
  const live = useRef<HTMLSpanElement | null>(null)
  useLayoutEffect(() => {
    const el = live.current
    if (!el) return
    if (!play) {
      el.textContent = text
      return
    }
    const ms = (text.length / cps) * 1000
    const t0 = performance.now()
    let raf = 0
    el.textContent = ''
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / ms)
      el.textContent = text.slice(0, Math.ceil(text.length * k))
      if (k < 1) raf = window.requestAnimationFrame(tick)
    }
    raf = window.requestAnimationFrame(tick)
    const done = window.setTimeout(() => {
      el.textContent = text
    }, ms + 150)
    return () => {
      window.cancelAnimationFrame(raf)
      window.clearTimeout(done)
    }
  }, [text, play, cps])
  return (
    <span className="rl-jarvis__typed">
      <span className="rl-jarvis__sr">{text}</span>
      <span ref={live} aria-hidden>
        {text}
      </span>
    </span>
  )
}
