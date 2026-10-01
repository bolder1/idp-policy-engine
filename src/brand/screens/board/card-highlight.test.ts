import { describe, expect, it } from 'vitest'

import { createCardHighlight } from './card-highlight'

/* The card a hovered row lands on (card-highlight.ts): a store outside
   React's state, so a hover tells the two cards it touches and nobody else. */

describe('the card a hovered row lands on', () => {
  it('holds one card at a time, and nothing to begin with', () => {
    const h = createCardHighlight()
    expect(h.get()).toBeNull()
    h.set('rule-1')
    expect(h.get()).toBe('rule-1')
    h.set('fallback')
    expect(h.get()).toBe('fallback')
    h.set(null)
    expect(h.get()).toBeNull()
  })

  it('tells its readers when the card changes, and only then', () => {
    const h = createCardHighlight()
    let told = 0
    const stop = h.subscribe(() => told++)
    h.set('rule-1')
    h.set('rule-1')
    expect(told).toBe(1)
    h.set(null)
    expect(told).toBe(2)
    stop()
    h.set('rule-2')
    expect(told).toBe(2)
  })

  it('hands out one setter for its whole life, so a row can keep it', () => {
    const h = createCardHighlight()
    const { set } = h
    set('rule-3')
    expect(h.get()).toBe('rule-3')
    expect(h.set).toBe(set)
  })
})
