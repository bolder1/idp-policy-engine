import { describe, expect, it } from 'vitest'
import { WIDGETS, WIDGET_IDS } from './catalog'
import { checkLayout } from './check'
import { resolveTarget } from './drag'
import { limitTag, tagsOf } from './tags'
import { applySplit, splitChoices } from './splits'
import {
  COLS,
  addToRow,
  addWidget,
  fitsRow,
  allCells,
  arrange,
  barLock,
  colRange,
  findCell,
  fromSpecs,
  moveCell,
  place,
  removeCell,
  rowLock,
  setBoundary,
  setRowHeight,
  tidyRow,
  whyNot,
  type Row,
  type Target,
} from './layout'
import { XECURIFY_TEMPLATES } from './templates'

/* The Dashboard's every interaction, run against every template and every widget, with the position state checked
   after each (owner, 20 Nov 2026: "examine every combination of adding, removing, dragging, dropping and moving"). */

/** Every place a drop can name on a board. */
function targets(rows: readonly Row[]): Target[] {
  const t: Target[] = rows.map((r) => ({ at: 'row', before: r.id }))
  t.push({ at: 'row', before: null })
  for (const r of rows) {
    for (const c of r.columns) t.push({ at: 'column', row: r.id, before: c.id })
    t.push({ at: 'column', row: r.id, before: null })
    for (const c of r.columns) {
      for (const x of c.cells) t.push({ at: 'stack', column: c.id, before: x.id })
      t.push({ at: 'stack', column: c.id, before: null })
    }
  }
  for (const x of allCells(rows)) t.push({ at: 'swap', cell: x.id })
  return t
}

const boards = XECURIFY_TEMPLATES.map((t) => ({ id: t.id, rows: fromSpecs(t.rows) }))
const sound = (rows: readonly Row[]) => checkLayout(rows).map((p) => p.text)

describe('every template', () => {
  it.each(boards.map((b) => [b.id, b.rows] as const))('%s opens in a sound state', (_, rows) => {
    expect(sound(rows)).toEqual([])
  })
})

describe('every widget moved to every place', () => {
  it('leaves the board sound, or is refused', { timeout: 60_000 }, () => {
    let tried = 0
    let landed = 0
    for (const { rows } of boards)
      for (const cell of allCells(rows))
        for (const t of targets(rows)) {
          tried++
          const out = moveCell(rows, cell.id, t)
          if (!out) continue
          landed++
          const wrong = sound(out)
          if (wrong.length) throw new Error(`${WIDGETS[cell.widget].name} to ${JSON.stringify(t)}: ${wrong.join('; ')}`)
          expect(allCells(out)).toHaveLength(allCells(rows).length)
        }
    expect(tried).toBeGreaterThan(3000)
    expect(landed).toBeGreaterThan(2000)
  })
  it('keeps every widget, its view and its filter', () => {
    const rows = boards[0].rows
    for (const cell of allCells(rows))
      for (const t of targets(rows)) {
        const out = moveCell(rows, cell.id, t)
        if (!out) continue
        const key = (r: readonly Row[]) => allCells(r).map((c) => `${c.id}:${c.widget}:${c.view ?? ''}:${c.pick ?? ''}`).sort()
        expect(key(out)).toEqual(key(rows))
      }
  })
})

describe('every widget added at every place', () => {
  it('leaves the board sound, or is refused with a reason', { timeout: 60_000 }, () => {
    for (const { rows } of boards)
      for (const w of WIDGET_IDS) {
        expect(sound(addWidget(rows, w).rows)).toEqual([])
        for (const t of targets(rows)) {
          if (t.at === 'swap') continue
          const out = place(rows, { id: 'new', widget: w, weight: 1 }, t)
          if (out) expect(sound(out)).toEqual([])
          else if (t.at !== 'row') expect(whyNot(rows, { id: 'new', widget: w }, t)).toBeTruthy()
        }
      }
  })
})

describe('removing, arranging and resizing', () => {
  it('leaves the board sound whatever is removed', () => {
    for (const { rows } of boards) for (const c of allCells(rows)) expect(sound(removeCell(rows, c.id))).toEqual([])
  })
  it('leaves the board sound under every arrangement', () => {
    for (const { rows } of boards) for (const m of ['tidy', 'type', 'need'] as const) expect(sound(arrange(rows, m))).toEqual([])
  })
  it('keeps every column bar inside its limits at any span asked for', () => {
    for (const { rows } of boards)
      for (const r of rows)
        for (let i = 0; i < r.columns.length - 1; i++) {
          const { lo, hi } = colRange(r, i)
          expect(lo).toBeLessThanOrEqual(hi)
          for (let s = -2; s <= COLS + 2; s++) expect(sound(rows.map((x) => (x.id === r.id ? setBoundary(x, i, s) : x)))).toEqual([])
        }
  })
  it('keeps every row inside its heights at any height asked for', () => {
    for (const { rows } of boards) for (const r of rows) for (const h of [0, 40, 200, 999, 5000]) expect(sound(rows.map((x) => (x.id === r.id ? setRowHeight(x, h) : x)))).toEqual([])
  })
})

describe('a stack never stretches the widgets beside it', () => {
  it('refuses a list stacked into a row of numbers, and says why', () => {
    const rows = boards[0].rows
    const stats = rows.find((r) => r.columns.length === 4)!
    const list = allCells(rows).find((c) => c.widget === 'health')!
    const t: Target = { at: 'stack', column: stats.columns[0].id, before: null }
    expect(moveCell(rows, list.id, t)).toBeNull()
    expect(whyNot(rows, list, t)).toMatch(/stretched/)
  })
  it('stacks two numbers beside a chart when arranging, where side by side they would be stretched', () => {
    const rows = fromSpecs([
      { height: 176, columns: [{ span: 6, cells: [{ widget: 'mfa' }] }, { span: 6, cells: [{ widget: 'sign-ins-total' }] }] },
      { height: 368, columns: [{ span: 12, cells: [{ widget: 'sign-ins' }] }] },
    ])
    const out = arrange(rows, 'tidy')
    expect(sound(out)).toEqual([])
    expect(out).toHaveLength(1)
    expect(out[0].columns[0].cells.map((c) => c.widget)).toEqual(['mfa', 'sign-ins-total'])
    expect(out[0].columns[1].cells[0].widget).toBe('sign-ins')
  })

})

describe('a bar that cannot move', () => {
  const pair = (a: (typeof WIDGET_IDS)[number], b: (typeof WIDGET_IDS)[number]): Row =>
    tidyRow({ id: 'r', height: 0, columns: [a, b].map((w, i) => ({ id: `c${i}`, span: 6, cells: [{ id: `w${i}`, widget: w, weight: 1 }] })) })
  it('says why when both sides are at their widest', () => {
    expect(barLock(pair('mfa', 'sign-ins-total'), 0)).toMatch(/both at their widest/)
  })
  it('moves, and says nothing, where there is room', () => {
    expect(barLock(pair('sign-ins', 'blocked'), 0)).toBeNull()
  })
  it('names the rows that cannot change height', () => {
    expect(rowLock(pair('sign-ins', 'blocked'))).toBeNull()
  })
})

describe('the live preview', () => {
  const rows = boards[0].rows
  const cell = allCells(rows).find((c) => c.widget === 'shortcuts')!
  it('holds over the widget’s own slot in the preview', () => {
    const view = moveCell(rows, cell.id, { at: 'row', before: null })!
    const own = view[view.length - 1]
    expect(resolveTarget({ at: 'column', row: own.id, before: null }, view, rows, cell.id)).toBe('keep')
    expect(resolveTarget({ at: 'swap', cell: cell.id }, view, rows, cell.id)).toBe('keep')
  })
  it('says a place next to the preview’s own row against the board as it was', () => {
    const first = rows[2]
    const view = moveCell(rows, cell.id, { at: 'row', before: first.id })!
    const own = view[2]
    expect(rows.some((r) => r.id === own.id)).toBe(false)
    expect(resolveTarget({ at: 'row', before: own.id }, view, rows, cell.id)).toEqual({ at: 'row', before: first.id })
  })
  it('lands where the preview showed, whatever path the drag took', () => {
    /* Carried through every row on the way: the place it is let go decides, not the rows it passed. */
    const end: Target = { at: 'row', before: null }
    const direct = moveCell(rows, cell.id, end)!
    let view: Row[] = rows
    for (const r of rows) {
      const t = resolveTarget({ at: 'column', row: r.id, before: null }, view, rows, cell.id)
      if (t === 'keep') continue
      view = moveCell(rows, cell.id, t) ?? view
    }
    const last = moveCell(rows, cell.id, end)!
    const shape = (r: readonly Row[]) => r.map((x) => x.columns.map((c) => [c.span, c.cells.map((k) => k.id)]))
    expect(shape(last)).toEqual(shape(direct))
    expect(findCell(last, cell.id)?.r).toBe(last.length - 1)
  })
})

describe('adding a widget', () => {
  const lone = (): Row[] => fromSpecs([{ height: 368, columns: [{ span: 12, cells: [{ widget: 'sign-ins' }] }] }])
  it('joins a row with room at its own width, taken from a widget with width to spare', () => {
    const out = addWidget(lone(), 'health')
    expect(out.how).toBe('joined')
    expect(out.rows).toHaveLength(1)
    expect(out.rows[0].columns.map((c) => c.span)).toEqual([8, 4])
    expect(sound(out.rows)).toEqual([])
  })
  it('keeps a row made uneven on purpose, rather than evening it out', () => {
    const rows = fromSpecs([{ height: 368, columns: [{ span: 9, cells: [{ widget: 'sign-ins' }] }, { span: 3, cells: [{ widget: 'shortcuts' }] }] }])
    const out = addWidget(rows, 'changes')
    expect(out.rows[0].columns.map((c) => c.span)).toEqual([5, 3, 4])
  })
  it('starts a row of its own where no row takes it well', () => {
    const out = addWidget(boards[0].rows, 'recent-sign-ins')
    expect(out.how).toBe('row')
    expect(findCell(out.rows, out.id)?.r).toBe(out.rows.length - 1)
  })
  it('never stacks a narrow widget into a full-width column, and says why', () => {
    const rows = lone()
    const t: Target = { at: 'stack', column: rows[0].columns[0].id, before: null }
    expect(place(rows, { id: 'n', widget: 'success-rate', weight: 1 }, t)).toBeNull()
    expect(whyNot(rows, { id: 'n', widget: 'success-rate' }, t)).toMatch(/Too wide/)
  })
})

describe('tags', () => {
  it('say New on the widget just added, then its limit', () => {
    const out = addWidget(fromSpecs([{ height: 368, columns: [{ span: 12, cells: [{ widget: 'sign-ins' }] }] }]), 'health')
    const at = findCell(out.rows, out.id)!
    const tags = tagsOf(out.rows[at.r], at.c, at.k, false, { id: out.id, kind: 'new' })
    expect(tags[0].label).toBe('New')
  })
  it('say Full row on a narrow widget alone in its row, Pinned on a pinned one', () => {
    const rows = fromSpecs([{ height: 176, columns: [{ span: 12, cells: [{ widget: 'mfa' }] }] }])
    expect(limitTag(rows[0], 0, 0, false)?.label).toBe('Full row')
    expect(limitTag(rows[0], 0, 0, true)?.label).toBe('Pinned')
  })
  it('say Widest or Narrowest at a limit beside a neighbour', () => {
    const two = fromSpecs([{ height: 176, columns: [{ span: 6, cells: [{ widget: 'mfa' }] }, { span: 6, cells: [{ widget: 'blocked-total' }] }] }])
    expect(limitTag(two[0], 0, 0, false)?.label).toBe('Widest')
    const r = fromSpecs([{ height: 368, columns: [{ span: 4, cells: [{ widget: 'sign-ins' }] }, { span: 8, cells: [{ widget: 'blocked' }] }] }])
    expect(limitTag(r[0], 0, 0, false)?.label).toBe('Narrowest')
  })
})

describe('a row’s Add here', () => {
  it('offers only what fits that row, and puts it there', () => {
    const rows = fromSpecs([
      { height: 176, columns: [{ span: 4, cells: [{ widget: 'mfa' }] }, { span: 4, cells: [{ widget: 'sign-ins-total' }] }, { span: 4, cells: [{ widget: 'blocked-total' }] }] },
      { height: 368, columns: [{ span: 12, cells: [{ widget: 'sign-ins' }] }] },
    ])
    const numbers = fitsRow(rows, rows[0].id, WIDGET_IDS)
    expect(numbers.every((w) => WIDGETS[w].kind === 'stat')).toBe(true)
    const charts = fitsRow(rows, rows[1].id, WIDGET_IDS)
    expect(charts).toContain('blocked')
    expect(charts).not.toContain('recent-sign-ins')
    const out = addToRow(rows, rows[1].id, 'blocked')!
    expect(findCell(out.rows, out.id)?.r).toBe(1)
    expect(sound(out.rows)).toEqual([])
  })
  it('leaves the board sound for every widget into every row, on every template', { timeout: 60_000 }, () => {
    for (const { rows } of boards)
      for (const r of rows)
        for (const w of WIDGET_IDS) {
          const out = addToRow(rows, r.id, w)
          if (out) expect(sound(out.rows)).toEqual([])
        }
  })
})

describe('row splits', () => {
  it('offer a row its layouts, the one it has now ticked, and name what holds the rest back', () => {
    const rows = fromSpecs([{ height: 368, columns: [{ span: 8, cells: [{ widget: 'sign-ins' }] }, { span: 4, cells: [{ widget: 'blocked' }] }] }])
    const cs = splitChoices(rows[0])
    expect(cs.find((c) => c.on)?.spans).toEqual([8, 4])
    const quarter = cs.find((c) => c.spans[0] === 3)!
    expect(quarter.why).toMatch(/Sign-ins over time cannot be that narrow/)
    expect(applySplit(rows[0], quarter.spans)).toBeNull()
    expect(applySplit(rows[0], [6, 6])!.columns.map((c) => c.span)).toEqual([6, 6])
  })
  it('leave the board sound for every split every template row can take', () => {
    let taken = 0
    for (const { rows } of boards)
      for (const r of rows)
        for (const c of splitChoices(r)) {
          const next = applySplit(r, c.spans)
          if (c.why) expect(next).toBeNull()
          if (!next) continue
          taken++
          expect(sound(rows.map((x) => (x.id === r.id ? next : x)))).toEqual([])
        }
    expect(taken).toBeGreaterThan(10)
  })
})
