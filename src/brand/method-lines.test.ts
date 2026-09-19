import { describe, expect, it } from 'vitest'

import { AUTH_METHODS } from './methods'

/* -----------------------------------------------------------------------------
   The line under a method's name on the Authentication methods list (owner,
   18 Sep 2026: "add a one-liner for each card").

   The page's rows keep one height, so the line is clipped rather than wrapped,
   and a row carrying a balance chip ("No transactions left") has the least room
   of all. A line past this length is one that disappears into an ellipsis on
   some rows and not others — which is how a list stops being scannable. The
   description then keeps the whole story, on the tip beside the name.
   -------------------------------------------------------------------------- */

const LINE_MAX = 72

describe('the line on a method row', () => {
  it('fits one line on every method', () => {
    for (const m of AUTH_METHODS) {
      const line = m.summary ?? m.description
      expect(line.length, `${m.name}: "${line}"`).toBeLessThanOrEqual(LINE_MAX)
    }
  })

  it('only carries a summary where the description says more than the line', () => {
    for (const m of AUTH_METHODS) {
      if (!m.summary) continue
      /* The tip renders on exactly these rows, so a summary that repeats its
         description would put the same sentence in two places. */
      expect(m.description.length, m.name).toBeGreaterThan(m.summary.length)
      expect(m.description, m.name).not.toBe(m.summary)
    }
  })

  it('says something on every card', () => {
    for (const m of AUTH_METHODS) {
      expect(m.description.trim().length, m.name).toBeGreaterThan(0)
      /* Sentence case, and a full stop: these are sentences, not labels. */
      expect(m.description, m.name).toMatch(/[.!?]$/)
      if (m.summary) expect(m.summary, m.name).toMatch(/[.!?]$/)
    }
  })
})
