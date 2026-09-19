import { describe, expect, it } from 'vitest'

import { applyReviewView, parseReviewView, readReviewView } from './review-view'

describe('review view', () => {
  it('turns before-and-after on only for the exact stored value', () => {
    expect(parseReviewView('compare')).toBe('compare')
    for (const value of [null, undefined, '', 'Compare', 'list', 'table', 'true', 1]) {
      expect(parseReviewView(value), String(value)).toBe('list')
    }
  })

  it('falls back to the list where there is no storage to read', () => {
    expect(readReviewView()).toBe('list')
  })

  it('does nothing, rather than throwing, where there is no storage to write', () => {
    expect(() => applyReviewView('compare')).not.toThrow()
    applyReviewView('list')
  })
})
