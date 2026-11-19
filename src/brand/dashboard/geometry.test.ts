import { describe, expect, it } from 'vitest'
import { geometry, type Box } from './geometry'
import { GAP, allCells, fromSpecs, type Row } from './layout'
import { XECURIFY_TEMPLATES } from './templates'

/* The board places every widget from these numbers (Board.tsx), so they must tile each row exactly: no widget over
   another, columns meeting at the gap, a stack filling its row, and the bars in the gaps between. */

const overlap = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

const rowOf = (id: string, height: number, columns: { id: string; span: number; cells: { id: string; widget: Row['columns'][number]['cells'][number]['widget']; weight: number }[] }[]): Row => ({ id, height, columns })

describe('geometry', () => {
  it('fills a row edge to edge, a gap between columns, on whole pixels', () => {
    const row = rowOf('r', 176, [
      { id: 'a', span: 3, cells: [{ id: 'x', widget: 'sign-ins-total', weight: 1 }] },
      { id: 'b', span: 9, cells: [{ id: 'y', widget: 'sign-ins', weight: 1 }] },
    ])
    const g = geometry([row], 1170, false)
    const x = g.cells.x
    const y = g.cells.y
    expect(x.x).toBe(0)
    expect(y.x + y.w).toBe(1170)
    expect(y.x - (x.x + x.w)).toBe(GAP)
    for (const b of [x, y]) for (const v of [b.x, b.y, b.w, b.h]) expect(Number.isInteger(v)).toBe(true)
    expect(g.colBars).toEqual([{ row: 'r', index: 0, x: x.x + x.w, y: 0, h: 176 }])
  })

  it('shares a column between stacked widgets by weight, the last ending on the row', () => {
    const row = rowOf('r', 400, [
      {
        id: 'a',
        span: 12,
        cells: [
          { id: 'top', widget: 'mfa', weight: 1 },
          { id: 'bottom', widget: 'active-policies', weight: 3 },
        ],
      },
    ])
    const g = geometry([row], 1000, false)
    const top = g.cells.top
    const bottom = g.cells.bottom
    expect(bottom.y - (top.y + top.h)).toBe(GAP)
    expect(bottom.y + bottom.h).toBe(400)
    expect(bottom.h).toBeGreaterThan(top.h * 2)
    expect(g.stackBars).toEqual([{ row: 'r', col: 0, index: 0, x: 0, y: top.y + top.h, w: 1000 }])
  })

  it('puts each row under the one before, a gap apart, and says how tall the board is', () => {
    const rows = fromSpecs(XECURIFY_TEMPLATES[0].rows)
    const g = geometry(rows, 1200, false)
    g.rows.forEach((r, i) => {
      if (i > 0) expect(r.y).toBe(g.rows[i - 1].y + g.rows[i - 1].h + GAP)
    })
    const last = g.rows[g.rows.length - 1]
    expect(g.height).toBe(last.y + last.h)
  })

  it('never puts one widget over another, in any layout, wide or narrow', () => {
    for (const t of XECURIFY_TEMPLATES) {
      const rows = fromSpecs(t.rows)
      for (const [width, narrow] of [
        [1240, false],
        [980, false],
        [680, true],
      ] as const) {
        const g = geometry(rows, width, narrow)
        const boxes = allCells(rows).map((c) => g.cells[c.id])
        expect(boxes.every(Boolean), `${t.name} at ${width}`).toBe(true)
        for (let i = 0; i < boxes.length; i++) {
          expect(boxes[i].x + boxes[i].w, `${t.name} at ${width}`).toBeLessThanOrEqual(width)
          for (let k = i + 1; k < boxes.length; k++) expect(overlap(boxes[i], boxes[k]), `${t.name} at ${width}`).toBe(false)
        }
      }
    }
  })

  it('on a narrow board, sets numbers two to a line and everything else full width', () => {
    const rows: Row[] = [
      rowOf('stats', 176, [
        { id: 'a', span: 4, cells: [{ id: 's1', widget: 'sign-ins-total', weight: 1 }] },
        { id: 'b', span: 4, cells: [{ id: 's2', widget: 'blocked-total', weight: 1 }] },
        { id: 'c', span: 4, cells: [{ id: 's3', widget: 'mfa', weight: 1 }] },
      ]),
      rowOf('chart', 368, [{ id: 'd', span: 12, cells: [{ id: 'w', widget: 'sign-ins', weight: 1 }] }]),
    ]
    const g = geometry(rows, 600, true)
    expect(g.cells.s1.y).toBe(g.cells.s2.y)
    expect(g.cells.s1.w + GAP + g.cells.s2.w).toBeLessThanOrEqual(600)
    expect(g.cells.s3.y).toBe(g.cells.s1.y + 176 + GAP)
    expect(g.cells.w).toMatchObject({ x: 0, w: 600 })
    expect(g.colBars).toEqual([])
  })

  it('has nothing to place on a board with no width yet', () => {
    expect(geometry(fromSpecs(XECURIFY_TEMPLATES[0].rows), 0, false).cells).toEqual({})
  })
})
