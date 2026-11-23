import { describe, expect, it } from 'vitest'

import { pageKeeping, pageMarks } from './pager-state'
import { ROLLOUT } from './rollout'

describe('the page numbers', () => {
  it('draws every page when there are few', () => {
    expect(pageMarks(1, 1)).toEqual([1])
    expect(pageMarks(2, 3)).toEqual([1, 2, 3])
    expect(pageMarks(1, 5)).toEqual([1, 2, 3, 4, 5])
  })

  it('keeps first, last and the neighbours, with a gap mark between', () => {
    expect(pageMarks(1, 10)).toEqual([1, 2, 'gap', 10])
    expect(pageMarks(5, 10)).toEqual([1, 'gap', 4, 5, 6, 'gap', 10])
    expect(pageMarks(10, 10)).toEqual([1, 'gap', 9, 10])
  })

  it('draws a single missing page as its number, not a gap', () => {
    expect(pageMarks(4, 10)).toEqual([1, 2, 3, 4, 5, 'gap', 10])
  })
})

describe('a new page size', () => {
  it('keeps the first row on screen in view', () => {
    /* Rows 21-30 at 10 a page: row 21 is on page 1 at 25 a page, page 1 at 50. */
    expect(pageKeeping(20, 25)).toBe(1)
    expect(pageKeeping(30, 25)).toBe(2)
    expect(pageKeeping(0, 100)).toBe(1)
  })
})

describe('the rollout', () => {
  it('ships paging to Design only until the owner has checked it', () => {
    expect(ROLLOUT.pagination).toEqual(['design'])
  })
})
