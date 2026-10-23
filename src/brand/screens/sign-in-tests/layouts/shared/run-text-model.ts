/* The quiet scramble behind run-text.tsx `Resolve` (phase.ts RUN_MOTION, 20 Oct 2026), kept out of the .tsx so that file
   exports its component only — and so it is pinned without drawing it (run-text.test.tsx). */

/** One scramble frame lasts this long. */
export const RESOLVE_STEP_MS = 40

const LOWER = 'abcdefghjkmnpqrstuvwxyz'
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const DIGIT = '0123456789'

/* The text at `k` (0–1) of its resolve, on scramble frame `seed`: what is revealed so far is the text itself; the rest
   are glyphs of each character's own class, and anything that is not a letter or a digit is kept. */
export function quietScramble(text: string, k: number, seed = 0): string {
  const n = text.length
  if (k >= 1 || n === 0) return text
  const shown = Math.floor(n * Math.max(0, k))
  let out = ''
  for (let i = 0; i < n; i++) {
    const ch = text[i]
    if (i < shown) {
      out += ch
      continue
    }
    const set = /[a-z]/.test(ch) ? LOWER : /[A-Z]/.test(ch) ? UPPER : /[0-9]/.test(ch) ? DIGIT : null
    out += set ? set[(i * 7 + seed * 13 + ((seed + i) % 5)) % set.length] : ch
  }
  return out
}
