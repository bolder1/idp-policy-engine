import { describe, expect, it } from 'vitest'

import { scenarios } from '../data'

/* -----------------------------------------------------------------------------
   Card stress tests.

   The gallery's whole premise is that a card is a fixed box — turning it must
   never resize it, or the grid reflows every time someone compares two
   templates. The layout guarantees that with a fixed height and an internally
   scrolling rule list; these tests guard the *content* side of the bargain, so
   a new template can't quietly break it.

   Budgets are derived from the rendered box: a 296px-wide card gives roughly
   38 characters per line at 13px, the front face allows three lines of
   description, and the back face fits five rules before it scrolls.
   -------------------------------------------------------------------------- */

const NAME_BUDGET = 42
const DESC_BUDGET = 132
const IF_BUDGET = 64
const MAX_RULES_BEFORE_SCROLL = 5

describe('template card content budgets', () => {
  it('every template has a name, a description and at least one rule', () => {
    for (const s of scenarios) {
      expect(s.name.trim().length, `${s.id} name`).toBeGreaterThan(0)
      expect(s.description.trim().length, `${s.id} description`).toBeGreaterThan(0)
      expect(s.rules.length, `${s.id} rules`).toBeGreaterThan(0)
    }
  })

  it('names fit the card head without wrapping past two lines', () => {
    for (const s of scenarios) {
      expect(s.name.length, `${s.id}: "${s.name}"`).toBeLessThanOrEqual(NAME_BUDGET)
    }
  })

  it('descriptions fit the three lines the front face allows', () => {
    for (const s of scenarios) {
      expect(s.description.length, `${s.id}: "${s.description}"`).toBeLessThanOrEqual(DESC_BUDGET)
    }
  })

  it('rule names and IF text stay on one line each — they ellipsize, so overlong text is unreadable rather than wrapped', () => {
    for (const s of scenarios) {
      for (const r of s.rules) {
        expect(r.name.length, `${s.id} / "${r.name}"`).toBeLessThanOrEqual(NAME_BUDGET)
        expect(r.ifText.length, `${s.id} / "${r.ifText}"`).toBeLessThanOrEqual(IF_BUDGET)
      }
    }
  })

  it('carries multi-rule templates, so the scrolling back face is actually exercised', () => {
    const deep = scenarios.filter((s) => s.rules.length >= 4)
    expect(deep.length, 'templates with 4+ rules').toBeGreaterThanOrEqual(3)
    expect(Math.max(...scenarios.map((s) => s.rules.length))).toBeGreaterThanOrEqual(5)
  })

  it('no template exceeds what a human will read on a card back', () => {
    // Past this the back is a wall of text and the template should be split.
    for (const s of scenarios) {
      expect(s.rules.length, `${s.id}`).toBeLessThanOrEqual(8)
    }
  })

  it('rules over the scroll threshold still resolve to a real decision', () => {
    // A rule that scrolls out of view must still be sound — this catches
    // placeholder rows added just to pad a template out.
    for (const s of scenarios) {
      for (const r of s.rules.slice(MAX_RULES_BEFORE_SCROLL)) {
        expect(['deny', '1fa', '2fa']).toContain(r.decision)
      }
    }
  })

  it('every template builds rules that match what the card advertised', () => {
    // The card promises N rules; the builder must receive exactly N.
    for (const s of scenarios) {
      const built = s.rules.map((r) => r.build())
      expect(built.length, `${s.id}`).toBe(s.rules.length)
      for (const b of built) {
        expect(b.id, `${s.id} rule id`).toBeTruthy()
        expect(b.name.trim().length).toBeGreaterThan(0)
      }
    }
  })

  it('template ids are unique', () => {
    const ids = scenarios.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('ownership segregation', () => {
  // The gallery splits on `provided`. If every template ended up on one side the
  // headings would still render, but one of the two groups would vanish with no
  // error — so both sides are asserted rather than just the flag existing.
  const mine = scenarios.filter((s) => !s.provided)
  const provided = scenarios.filter((s) => s.provided)

  it('has templates on both sides of the split', () => {
    expect(mine.length, 'tenant-authored').toBeGreaterThan(0)
    expect(provided.length, 'provided by Xecurify').toBeGreaterThan(0)
    expect(mine.length + provided.length).toBe(scenarios.length)
  })

  it("the tenant's own templates say who wrote them and when", () => {
    // Their card meta reads `author · when`, so a missing one renders
    // "undefined · undefined" rather than failing.
    for (const s of mine) {
      expect(s.author?.trim(), `${s.id} author`).toBeTruthy()
      expect(s.when?.trim(), `${s.id} when`).toBeTruthy()
    }
  })

  it('provided templates carry no author, so nothing claims a name it lacks', () => {
    for (const s of provided) expect(s.author, `${s.id}`).toBeUndefined()
  })
})
