import { describe, expect, it } from 'vitest'

import { cardsThatFit, pageForRow, pageSlice, resetSignature, rowsThatFit } from './paged-list'

describe('rowsThatFit', () => {
  it('fits whole rows only', () => {
    expect(rowsThatFit(700, 84)).toBe(8)
    expect(rowsThatFit(671, 84)).toBe(7)
  })

  it('never pages fewer than three rows', () => {
    expect(rowsThatFit(100, 84)).toBe(3)
    expect(rowsThatFit(-20, 84)).toBe(3)
    expect(rowsThatFit(Number.NaN, 84)).toBe(3)
  })
})

describe('pageSlice', () => {
  const items = Array.from({ length: 19 }, (_, i) => i + 1)

  it('reads 1–8 of 19 on the first page', () => {
    const s = pageSlice(items, 1, 8)
    expect([s.start, s.end, s.total, s.pageCount]).toEqual([1, 8, 19, 3])
    expect(s.rows).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('shows the short last page', () => {
    const s = pageSlice(items, 3, 8)
    expect([s.start, s.end]).toEqual([17, 19])
  })

  it('clamps a page that no longer exists', () => {
    expect(pageSlice(items.slice(0, 5), 3, 8).page).toBe(1)
    expect(pageSlice(items, 0, 8).page).toBe(1)
  })

  it('reads 0 of 0 when empty', () => {
    const s = pageSlice([], 1, 8)
    expect([s.start, s.end, s.total, s.pageCount]).toEqual([0, 0, 0, 1])
  })

  it('never divides by a zero or broken page size', () => {
    const s = pageSlice(items, 1, 0)
    expect(s.rows.length).toBeGreaterThan(0)
    expect(Number.isFinite(s.pageCount)).toBe(true)
    expect(pageSlice(items, Number.NaN, 8).page).toBe(1)
  })
})

describe('resetSignature', () => {
  it('is equal for an inline array with the same values', () => {
    expect(resetSignature(['vpn', 'all'])).toBe(resetSignature(['vpn', 'all']))
  })

  it('changes when a search or filter value changes', () => {
    expect(resetSignature(['vpn', 'all'])).not.toBe(resetSignature(['vp', 'all']))
    expect(resetSignature('a')).not.toBe(resetSignature('b'))
  })

  it('reads sets by their members', () => {
    expect(resetSignature(new Set(['a']))).not.toBe(resetSignature(new Set(['b'])))
  })

  it('treats no key as a constant', () => {
    expect(resetSignature(undefined)).toBe(resetSignature(undefined))
  })
})

describe('pageForRow', () => {
  it('keeps the first row on screen when the page size changes', () => {
    // Row 17 (index 16) was first on page 3 of 8; at 4 a page it is on page 5.
    expect(pageForRow(16, 4)).toBe(5)
    expect(pageForRow(16, 12)).toBe(2)
    expect(pageForRow(0, 8)).toBe(1)
  })

  it('falls back to the first page on bad input', () => {
    expect(pageForRow(-1, 8)).toBe(1)
    expect(pageForRow(10, 0)).toBe(1)
  })
})

describe('cards that fit', () => {
  it('pages whole lines of the grid, times the cards on a line', () => {
    expect(cardsThatFit(450, 150, 3)).toBe(9)
    expect(cardsThatFit(449, 150, 3)).toBe(6)
  })

  it('never asks for more lines than fit just to reach three', () => {
    /* Two lines fit; the list floor of three rows would have asked for three. */
    expect(cardsThatFit(434, 150, 3)).toBe(6)
    expect(cardsThatFit(160, 150, 4)).toBe(4)
  })

  it('still shows at least three items and at least one line', () => {
    expect(cardsThatFit(100, 150, 2)).toBe(3)
    expect(cardsThatFit(0, 150, 5)).toBe(5)
    expect(cardsThatFit(NaN, 150, 0)).toBe(3)
  })
})
