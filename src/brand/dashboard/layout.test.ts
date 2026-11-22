import { describe, expect, it } from 'vitest'
import { WIDGETS, WIDGET_IDS, type WidgetId } from './catalog'
import {
  COLS,
  GAP,
  addWidget,
  allCells,
  arrange,
  colMinSpan,
  colRange,
  evenRow,
  evenSpans,
  findCell,
  fromBoxes,
  fromSpecs,
  moveCell,
  moveRow,
  place,
  removeCell,
  rowMaxH,
  rowMinH,
  rowNaturalH,
  setBoundary,
  setRowHeight,
  setStackSplit,
  stackHeights,
  stackRange,
  tidyRows,
  toSpecs,
  type Cell,
  type Row,
} from './layout'
import { OVERVIEW, XECURIFY_TEMPLATES } from './templates'

const cell = (id: string, widget: WidgetId, weight = 1): Cell => ({ id, widget, weight })
const row = (id: string, height: number, ...cols: [number, ...Cell[]][]): Row => ({ id, height, columns: cols.map(([span, ...cells], i) => ({ id: `${id}c${i}`, span, cells })) })
const shape = (rows: readonly Row[]) => rows.map((r) => r.columns.map((c) => `${c.span}:${c.cells.map((x) => x.id).join('+')}`).join(' '))

/** Every rule a layout keeps: full rows, widths and heights within each widget's limits, stacks that add up. */
function whole(rows: readonly Row[]) {
  for (const r of rows) {
    const label = r.columns.map((c) => c.cells.map((x) => x.widget).join('+')).join(' | ')
    expect(r.columns.reduce((a, c) => a + c.span, 0), label).toBe(COLS)
    expect(r.height, label).toBeGreaterThanOrEqual(rowMinH(r))
    expect(r.height, label).toBeLessThanOrEqual(rowMaxH(r))
    for (const c of r.columns) {
      expect(c.cells.length, label).toBeGreaterThan(0)
      if (r.columns.length > 1) {
        expect(c.span, label).toBeGreaterThanOrEqual(colMinSpan(c))
        expect(c.span, `${label} max`).toBeLessThanOrEqual(Math.max(colMinSpan(c), Math.min(...c.cells.map((x) => WIDGETS[x.widget].maxW))))
      }
      const px = stackHeights(r, c)
      c.cells.forEach((x, k) => expect(px[k] + 0.5, `${label} ${x.widget}`).toBeGreaterThanOrEqual(WIDGETS[x.widget].minH))
    }
  }
}

describe('even widths', () => {
  it('share twelve columns as evenly as the widgets allow', () => {
    const c = (w: WidgetId) => ({ cells: [cell('x', w)] })
    expect(evenSpans([c('mfa'), c('mfa'), c('mfa'), c('mfa')])).toEqual([3, 3, 3, 3])
    expect(evenSpans([c('mfa'), c('mfa'), c('mfa'), c('mfa'), c('mfa')])).toEqual([3, 3, 2, 2, 2])
    expect(evenSpans([c('sign-ins'), c('blocked')])).toEqual([6, 6])
    expect(evenSpans([c('recent-sign-ins')])).toEqual([12])
  })
  it('hold a wide widget at its minimum when its neighbours are many', () => {
    const c = (w: WidgetId) => ({ cells: [cell('x', w)] })
    const spans = evenSpans([c('recent-sign-ins'), c('mfa'), c('mfa'), c('mfa')])
    expect(spans[0]).toBeGreaterThanOrEqual(6)
    expect(spans.reduce((a, b) => a + b, 0)).toBe(12)
  })
})

describe('a bar between two columns', () => {
  const r = row('r', 368, [8, cell('a', 'sign-ins')], [4, cell('b', 'blocked')])
  it('moves width from one side to the other and nowhere else', () => {
    const next = setBoundary(r, 0, 6)
    expect(next.columns.map((c) => c.span)).toEqual([6, 6])
  })
  it('stops at the narrowest and widest each side reads at', () => {
    expect(colRange(r, 0)).toEqual({ lo: 4, hi: 9 })
    expect(setBoundary(r, 0, 1).columns.map((c) => c.span)).toEqual([4, 8])
    expect(setBoundary(r, 0, 12).columns.map((c) => c.span)).toEqual([9, 3])
  })
  it('evens out the whole row', () => {
    const three = row('r', 368, [6, cell('a', 'health')], [3, cell('b', 'changes')], [3, cell('c', 'shortcuts')])
    expect(evenRow(three).columns.map((c) => c.span)).toEqual([4, 4, 4])
  })
})

describe('a bar under a row', () => {
  const r = row('r', 368, [8, cell('a', 'sign-ins')], [4, cell('b', 'blocked')])
  it('sets the row’s height in steps of 8, between what its widgets allow', () => {
    expect(setRowHeight(r, 451).height).toBe(448)
    expect(setRowHeight(r, 10).height).toBe(240)
    expect(setRowHeight(r, 5000).height).toBe(720)
  })
  it('puts it back to the height its widgets arrive at', () => {
    expect(rowNaturalH(r)).toBe(368)
    expect(rowNaturalH(row('s', 0, [3, cell('a', 'mfa')], [9, cell('b', 'mfa')]))).toBe(176)
  })
})

describe('a bar between two stacked widgets', () => {
  const r = tidyRows([row('r', 400, [4, cell('a', 'mfa', 1), cell('b', 'active-policies', 1)], [8, cell('c', 'sign-ins')])])[0]
  it('shares the column’s height between them', () => {
    const px = stackHeights(r, r.columns[0])
    expect(px[0] + px[1] + GAP).toBeCloseTo(400)
    const next = setStackSplit(r, 0, 0, 190)
    const after = stackHeights(next, next.columns[0])
    expect(Math.round(after[0])).toBe(190)
    expect(Math.round(after[0] + after[1])).toBe(Math.round(px[0] + px[1]))
  })
  it('keeps both between the shortest and tallest they read at', () => {
    const pair = stackHeights(r, r.columns[0]).reduce((a, b) => a + b, 0)
    expect(stackRange(r, 0, 0).lo).toBe(Math.max(WIDGETS.mfa.minH, pair - WIDGETS['active-policies'].maxH))
    expect(stackRange(r, 0, 0).hi).toBeLessThanOrEqual(WIDGETS.mfa.maxH)
    const next = setStackSplit(r, 0, 0, 10)
    expect(stackHeights(next, next.columns[0])[0]).toBeGreaterThanOrEqual(WIDGETS.mfa.minH - 0.5)
  })
})

describe('placing and moving widgets', () => {
  const board = (): Row[] =>
    tidyRows([
      row('r1', 176, [3, cell('s1', 'sign-ins-total')], [3, cell('s2', 'blocked-total')], [3, cell('s3', 'mfa')], [3, cell('s4', 'active-policies')]),
      row('r2', 368, [8, cell('ch', 'sign-ins')], [4, cell('bl', 'blocked')]),
      row('r3', 432, [12, cell('tb', 'recent-sign-ins')]),
    ])
  it('puts a widget in a row as a new column, and the row evens out', () => {
    const next = place(board(), cell('n', 'health'), { at: 'column', row: 'r2', before: null })!
    expect(shape(next)[1]).toBe('4:ch 4:bl 4:n')
    whole(next)
  })
  it('refuses a column where there is no room for it, or where it would be stretched', () => {
    const full = place(board(), cell('n', 'health'), { at: 'column', row: 'r3', before: null })
    expect(full).not.toBeNull()
    /* A number beside a 432 px table would be stretched past its tallest. */
    expect(place(board(), cell('n', 'mfa'), { at: 'column', row: 'r3', before: null })).toBeNull()
    const five = place(board(), cell('n', 'recent-sign-ins'), { at: 'column', row: 'r1', before: null })
    expect(five).toBeNull()
  })
  it('stacks a widget in a column, and the row grows only if the stack needs it', () => {
    const next = place(board(), cell('n', 'mfa'), { at: 'stack', column: 'r2c1', before: null })!
    expect(shape(next)[1]).toBe('8:ch 4:bl+n')
    expect(next[1].height).toBeGreaterThanOrEqual(WIDGETS.blocked.minH + WIDGETS.mfa.minH + GAP)
    whole(next)
  })
  it('starts a row of its own between two rows', () => {
    const next = place(board(), cell('n', 'heatmap'), { at: 'row', before: 'r3' })!
    expect(shape(next).map((s) => s.split(' ').length)).toEqual([4, 2, 1, 1])
    expect(shape(next)[2]).toBe('12:n')
  })
  it('swaps two widgets, each taking the other’s place', () => {
    const next = moveCell(board(), 'ch', { at: 'swap', cell: 'tb' })!
    expect(shape(next)[2]).toBe('12:ch')
    expect(shape(next)[1]).toContain('tb')
    whole(next)
    /* A number swapped into a row of charts would be stretched: refused. */
    expect(moveCell(board(), 's1', { at: 'swap', cell: 'bl' })).toBeNull()
  })
  it('moves a widget out of its row, which closes up and evens out', () => {
    const next = moveCell(board(), 'bl', { at: 'column', row: 'r3', before: null })!
    expect(shape(next)[2]).toBe('6:tb 6:bl')
    expect(shape(next)[1]).toBe('12:ch')
    whole(next)
  })
  it('does nothing when a widget is dropped where it already is', () => {
    expect(moveCell(board(), 'ch', { at: 'column', row: 'r2', before: 'r2c0' })).toBeNull()
    expect(moveCell(board(), 'ch', { at: 'swap', cell: 'ch' })).toBeNull()
  })
  it('removes a widget, and its row closes up', () => {
    const next = removeCell(board(), 'bl')
    expect(shape(next)[1]).toBe('12:ch')
    expect(removeCell(next, 'tb')).toHaveLength(2)
  })
  it('moves whole rows', () => {
    expect(moveRow(board(), 2, 0).map((r) => r.id)).toEqual(['r3', 'r1', 'r2'])
  })
  it('adds a number to a row of numbers with room, and anything else on a row of its own', () => {
    const three = removeCell(board(), 's4')
    const a = addWidget(three, 'success-rate')
    expect(findCell(a.rows, a.id)?.r).toBe(0)
    const b = addWidget(board(), 'heatmap')
    expect(findCell(b.rows, b.id)?.r).toBe(3)
  })
})

describe('templates read as rows', () => {
  it('are whole layouts that use each widget once', () => {
    for (const t of XECURIFY_TEMPLATES) {
      const rows = fromSpecs(t.rows)
      whole(rows)
      const ws = allCells(rows).map((c) => c.widget)
      expect(new Set(ws).size, t.name).toBe(ws.length)
    }
  })
  it('keep the rows they were written with', () => {
    expect(OVERVIEW.rows.map((r) => r.columns.length)).toEqual([1, 4, 2, 3, 2, 1])
    expect(OVERVIEW.rows.map((r) => r.height)).toEqual([112, 176, 368, 368, 304, 432])
  })
  it('read a box under another in the same columns as a stack', () => {
    const steps = XECURIFY_TEMPLATES.find((t) => t.id === 'first-steps')!
    expect(steps.rows[0].columns.map((c) => c.cells.map((x) => x.widget).join('+'))).toEqual(['setup', 'shortcuts', 'whats-new+directory'])
  })
  it('between them show every widget in the catalog', () => {
    const used = new Set(XECURIFY_TEMPLATES.flatMap((t) => allCells(fromSpecs(t.rows)).map((c) => c.widget)))
    expect(WIDGET_IDS.filter((id) => !used.has(id))).toEqual([])
  })
  it('come back the same from what a saved layout holds', () => {
    const rows = fromSpecs(OVERVIEW.rows)
    expect(toSpecs(fromSpecs(toSpecs(rows)))).toEqual(toSpecs(rows))
  })
  it('turn grid boxes with holes into full rows, splitting a number from a taller chart', () => {
    const rows = fromSpecs(fromBoxes([{ widget: 'mfa', x: 0, y: 0, w: 3, h: 3 }, { widget: 'sign-ins', x: 5, y: 0, w: 5, h: 6 }]))
    whole(rows)
    expect(shape(rows).map((r) => r.split(' ').length)).toEqual([1, 1])
  })
})

describe('arranging', () => {
  const messy = () => fromSpecs(XECURIFY_TEMPLATES.find((t) => t.id === 'security')!.rows).reverse()
  for (const mode of ['tidy', 'type', 'need'] as const) {
    it(`by ${mode} keeps every widget, with its view and colour, in whole rows`, () => {
      const before = messy()
      before[0].columns[0].cells[0] = { ...before[0].columns[0].cells[0], view: 'x', color: 'colourful' }
      const after = arrange(before, mode)
      whole(after)
      expect(allCells(after).map((c) => c.id).sort()).toEqual(allCells(before).map((c) => c.id).sort())
      expect(allCells(after).find((c) => c.id === before[0].columns[0].cells[0].id)).toMatchObject({ view: 'x', color: 'colourful' })
    })
  }
  it('by type puts numbers first and tables last', () => {
    const after = arrange(messy(), 'type')
    expect(after[0].columns.every((c) => WIDGETS[c.cells[0].widget].kind === 'stat')).toBe(true)
    expect(WIDGETS[after[after.length - 1].columns[0].cells[0].widget].kind).toBe('table')
  })
  it('by need groups widgets by what they are about', () => {
    const order = arrange(fromSpecs(OVERVIEW.rows), 'need').flatMap((r) => r.columns.flatMap((c) => c.cells.map((x) => WIDGETS[x.widget].category)))
    const firstOf = (cat: string) => order.indexOf(cat as never)
    expect(firstOf('posture')).toBeLessThan(firstOf('activity'))
    expect(firstOf('activity')).toBeLessThan(firstOf('admin'))
  })
  it('keeps a pinned widget first', () => {
    const rows = fromSpecs(OVERVIEW.rows).reverse()
    expect(arrange(rows, 'type', 'migration')[0].columns[0].cells[0].widget).toBe('migration')
  })
  it('leaves nothing alone across a row that can sit beside something', () => {
    for (const mode of ['tidy', 'type', 'need'] as const) {
      const after = arrange(fromSpecs(OVERVIEW.rows), mode, 'migration')
      const lone = after.filter((r) => r.columns.length === 1 && !['strip', 'table'].includes(WIDGETS[r.columns[0].cells[0].widget].kind))
      expect(lone.map((r) => r.columns[0].cells[0].widget), mode).toEqual([])
    }
  })
})
