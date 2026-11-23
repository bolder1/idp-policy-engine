import { describe, expect, it } from 'vitest'
import { WIDGETS, WIDGET_IDS, kindOf, viewOf } from './catalog'
import { curve, pct, short } from './format'
import { allCells, fromSpecs, toSpecs } from './layout'
import { CATEGORIES, ROLES, activeBoard, addBoard, applyTemplate, defaultPrefs, duplicateBoard, freshName, parseDash, removeBoard, renameBoard, saveAsTemplate, roleOf, withRows, withTheme } from './model'
import { CHANNELS, METHODS, PLACES, REASON_SHARES, busiest, change, delivery, funnel, previousSeries, registrations, signInSeries, split, totals, typicalWeek } from './seed'
import { BLANK_ID, OVERVIEW, XECURIFY_TEMPLATES } from './templates'
import { BRAND_SWATCHES, THEMES, THEME_IDS, isBrandColour, isTheme } from './themes'

describe('the widget catalog', () => {
  it('holds each widget once, with sizes that make sense together', () => {
    expect(WIDGET_IDS.length).toBeGreaterThanOrEqual(36)
    for (const id of WIDGET_IDS) {
      const m = WIDGETS[id]
      expect(m.minW, id).toBeLessThanOrEqual(m.w)
      expect(m.w, id).toBeLessThanOrEqual(m.maxW)
      expect(m.maxW, id).toBeLessThanOrEqual(12)
      expect(m.minH, id).toBeLessThanOrEqual(m.h)
      expect(m.h, id).toBeLessThanOrEqual(m.maxH)
      expect(m.blurb.length, id).toBeGreaterThan(10)
    }
  })
  it('names every widget and every view once', () => {
    const names = WIDGET_IDS.map((id) => WIDGETS[id].name)
    expect(new Set(names).size).toBe(names.length)
    for (const id of WIDGET_IDS) {
      const ids = (WIDGETS[id].views ?? []).map((v) => v.id)
      expect(new Set(ids).size, id).toBe(ids.length)
    }
  })
  it('shows a widget in the view picked on it, or its first', () => {
    expect(viewOf({ widget: 'sign-ins' })?.id).toBe('area')
    expect(viewOf({ widget: 'sign-ins', view: 'bars' })?.id).toBe('bars')
    expect(viewOf({ widget: 'sign-ins', view: 'gone' })?.id).toBe('area')
    expect(viewOf({ widget: 'health' })).toBeNull()
    expect(kindOf({ widget: 'blocked', view: 'donut' })).toBe('donut')
  })
})

describe('themes', () => {
  it('name seven themes, the modern palettes first', () => {
    expect(THEME_IDS).toEqual(['colourful', 'ocean', 'aurora', 'mono', 'console', 'accent', 'brand'])
    for (const id of THEME_IDS) expect(THEMES[id].name.length).toBeGreaterThan(3)
  })
  it('take only a swatch’s token or a six-digit hex as a brand colour', () => {
    for (const s of BRAND_SWATCHES) expect(isBrandColour(s.value)).toBe(true)
    expect(isBrandColour('#12abEF')).toBe(true)
    for (const bad of ['red', '#12ab', 'var(--anything)', 'url(x)', 'expression(alert(1))', 7]) expect(isBrandColour(bad)).toBe(false)
    expect(isTheme('colourful')).toBe(true)
    expect(isTheme('neon')).toBe(false)
  })
})

describe('dashboards', () => {
  const tpl = XECURIFY_TEMPLATES[1]
  it('are added from a template under a name of their own, and opened', () => {
    const p = addBoard(addBoard(defaultPrefs(), tpl.name, tpl), tpl.name, tpl)
    expect(p.boards.map((b) => b.name)).toEqual(['Overview', tpl.name, `${tpl.name} 2`])
    expect(p.active).toBe(p.boards[2].id)
    expect(activeBoard(p).rows.length).toBe(tpl.rows.length)
    expect(activeBoard(p)).toMatchObject({ from: tpl.id, theme: 'colourful' })
  })
  it('take a template’s layout and keep their own name and theme', () => {
    const p = applyTemplate(withTheme(defaultPrefs(), 'colourful'), tpl)
    expect(p.boards).toHaveLength(1)
    expect(activeBoard(p)).toMatchObject({ name: 'Overview', theme: 'colourful', from: tpl.id })
    expect(allCells(activeBoard(p).rows).map((c) => c.widget)).toEqual(allCells(fromSpecs(tpl.rows)).map((c) => c.widget))
  })
  it('are duplicated beside themselves with widgets of their own', () => {
    const d = defaultPrefs()
    const p = duplicateBoard(d, d.boards[0].id)
    expect(p.boards.map((b) => b.name)).toEqual(['Overview', 'Overview copy'])
    expect(allCells(p.boards[1].rows).map((c) => c.id)).not.toEqual(allCells(d.boards[0].rows).map((c) => c.id))
    expect(toSpecs(p.boards[1].rows)).toEqual(toSpecs(d.boards[0].rows))
  })
  it('are renamed and removed, but never the last one', () => {
    const d = defaultPrefs()
    expect(removeBoard(d, d.boards[0].id)).toBe(d)
    expect(renameBoard(d, d.boards[0].id, '  Monday review ').boards[0].name).toBe('Monday review')
    expect(renameBoard(d, d.boards[0].id, '  ').boards[0].name).toBe('Overview')
    const two = addBoard(d, tpl.name, tpl)
    const back = removeBoard(two, two.active)
    expect(back.boards).toHaveLength(1)
    expect(back.active).toBe(back.boards[0].id)
  })
  it('are saved as the admin’s own template, with their theme', () => {
    const p = saveAsTemplate(saveAsTemplate(withTheme(defaultPrefs(), 'brand'), 'Monday review'), 'Monday review')
    expect(p.own.map((x) => x.name)).toEqual(['Monday review 2', 'Monday review'])
    expect(p.own[0]).toMatchObject({ own: true, theme: 'brand' })
    expect(p.own[0].rows).toEqual(toSpecs(fromSpecs(OVERVIEW.rows)))
    expect(freshName([{ name: 'Incident' }], 'incident')).toBe('incident 2')
  })
})

describe('storage', () => {
  it('starts on Classic with Overview, for nothing stored or anything malformed', () => {
    for (const raw of [null, 'nope', '[]', '{"v":3,"boards":"x"}']) {
      const p = parseDash(raw)
      expect(p.version).toBe('classic')
      expect(p.boards).toHaveLength(1)
      expect(p.boards[0].rows).toHaveLength(OVERVIEW.rows.length)
    }
  })
  it('reads the first rebuild’s grid boards as rows', () => {
    const p = parseDash(
      JSON.stringify({
        v: 2,
        version: 'new',
        active: 'b',
        boards: [{ id: 'b', name: 'Mine', tiles: [{ id: '1', widget: 'mfa', x: 0, y: 0, w: 3, h: 3 }, { id: '2', widget: 'blocked-total', x: 3, y: 0, w: 3, h: 3 }, { id: '3', widget: 'sign-ins', x: 0, y: 3, w: 12, h: 6, view: 'bars' }] }],
      }),
    )
    expect(p.boards[0].name).toBe('Mine')
    expect(p.boards[0].rows.map((r) => r.columns.length)).toEqual([2, 1])
    expect(p.boards[0].rows[1].columns[0].cells[0].view).toBe('bars')
  })
  it('does not carry over round 1, but keeps the chosen dashboard and range', () => {
    const p = parseDash(JSON.stringify({ version: 'new', range: '30d', seen: true, boards: [{ id: 'mine', tiles: [] }] }))
    expect(p).toMatchObject({ v: 3, version: 'new', range: '30d', seen: false })
    expect(p.boards[0].name).toBe('Overview')
  })
  it('drops widgets it no longer knows, a view a widget lost, and a theme or colour that is not one', () => {
    const p = parseDash(
      JSON.stringify({
        v: 3,
        version: 'new',
        brand: 'url(x)',
        boards: [
          {
            id: 'b',
            name: 'B',
            theme: 'neon',
            rows: [
              { id: 'r', height: 9, columns: [{ id: 'c', span: 1, cells: [{ id: 'w', widget: 'gone' }, { id: 'w', widget: 'blocked', view: 'nope', color: 'neon' }] }, { id: 'c', span: 1, cells: [{ id: 'w', widget: 'mfa', color: 'brand' }] }] },
            ],
          },
        ],
      }),
    )
    const b = p.boards[0]
    expect(b.theme).toBe('mono')
    expect(p.brand).toBe(BRAND_SWATCHES[0].value)
    const cells = allCells(b.rows)
    /* A number beside a list would be stretched to the list's height, so the row splits: the number stays, the list goes below. */
    expect(cells.map((c) => c.widget)).toEqual(['mfa', 'blocked'])
    const [mfa, blocked] = cells
    expect(blocked.view).toBeUndefined()
    expect(blocked.color).toBeUndefined()
    expect(mfa.color).toBe('brand')
    expect(new Set(cells.map((c) => c.id)).size).toBe(2)
    expect(b.rows[0].columns.reduce((a, c) => a + c.span, 0)).toBe(12)
    expect(b.rows[1].height).toBeGreaterThanOrEqual(WIDGETS.blocked.minH)
    expect(b.rows[0].height).toBeLessThanOrEqual(WIDGETS.mfa.maxH)
  })
  it('round-trips what it stores', () => {
    const base = saveAsTemplate(withTheme(addBoard(defaultPrefs(), 'Security watch', XECURIFY_TEMPLATES[1]), 'colourful'), 'Mine')
    const p = { ...withRows(base, activeBoard(base).rows), version: 'new' as const, range: '30d' as const, seen: true, hinted: true, brand: '#3f5f8f' }
    expect(parseDash(JSON.stringify(p))).toEqual(p)
  })
  it('lists Start blank last and Overview first', () => {
    expect(XECURIFY_TEMPLATES[0]).toBe(OVERVIEW)
    expect(XECURIFY_TEMPLATES[XECURIFY_TEMPLATES.length - 1].id).toBe(BLANK_ID)
  })
})

describe('the sample data', () => {
  const now = new Date(2026, 10, 18, 14, 30)
  it('is the same on every call, and differs from the range before', () => {
    expect(signInSeries('7d', now)).toEqual(signInSeries('7d', now))
    expect(signInSeries('24h', now)).toHaveLength(24)
    expect(signInSeries('30d', now)).toHaveLength(30)
    const a = totals(signInSeries('7d', now))
    const b = totals(previousSeries('7d', now))
    expect(a.all).toBe(a.allowed + a.mfa + a.blocked)
    expect(a.all).not.toBe(b.all)
    expect(Math.abs(change(a.all, b.all))).toBeLessThan(0.3)
    expect(a.blocked / a.all).toBeGreaterThan(0.015)
    expect(a.blocked / a.all).toBeLessThan(0.07)
    expect(change(5, 0)).toBe(0)
  })
  it('names the busiest part of a range the way the range reads', () => {
    expect(busiest(signInSeries('7d', now), '7d')).toMatch(/day$/)
    expect(busiest(signInSeries('24h', now), '24h')).toMatch(/^\d\d:\d\d$/)
    expect(busiest([], '7d')).toBe('')
  })
  it('splits a total into whole parts that add up to it', () => {
    for (const shares of [REASON_SHARES.map((r) => r.share), METHODS.map((m) => m.share), PLACES.map((p) => p.share), [1, 1, 1]]) {
      for (const total of [0, 1, 7, 1456, 34962]) {
        const parts = split(total, shares)
        expect(parts.reduce((s, v) => s + v, 0)).toBe(total)
        expect(parts.every((v) => Number.isInteger(v) && v >= 0)).toBe(true)
      }
    }
  })
  it('narrows a funnel at every step', () => {
    const steps = funnel(totals(signInSeries('7d', now)))
    for (let i = 1; i < steps.length; i++) expect(steps[i].value).toBeLessThanOrEqual(steps[i - 1].value)
  })
  it('draws delivery, new users and the typical week at sizes a widget can show', () => {
    for (const range of ['24h', '7d', '30d'] as const) {
      const all = delivery(range, 'all', now)
      expect(all.length).toBeLessThanOrEqual(14)
      const each = CHANNELS.map((c) => delivery(range, c.id, now))
      expect(Math.abs(all.reduce((s, p) => s + p.delivered + p.failed, 0) - each.flat().reduce((s, p) => s + p.delivered + p.failed, 0))).toBeLessThanOrEqual(all.length * 2)
      expect(registrations(range, now)).toHaveLength(range === '24h' ? 24 : range === '7d' ? 7 : 30)
    }
    const week = typicalWeek()
    expect(week).toHaveLength(7)
    expect(week.every((d) => d.length === 24)).toBe(true)
    expect(Math.max(...week[1])).toBeGreaterThan(Math.max(...week[6]))
  })
})

describe('words and curves', () => {
  it('keeps numbers short on an axis and whole in a share', () => {
    expect([short(950), short(1200), short(2000), short(24301)]).toEqual(['950', '1.2k', '2k', '24k'])
    expect([pct(0.78), pct(0.043, 1)]).toEqual(['78%', '4.3%'])
  })
  it('draws a smooth line that never leaves the range of its points', () => {
    const pts = [[0, 100], [10, 100], [20, 20], [30, 20], [40, 90], [50, 0]] as const
    const d = curve(pts)
    expect(d.startsWith('M0.0,100.0')).toBe(true)
    expect(d).not.toMatch(/NaN/)
    const ys = [...d.matchAll(/,(-?\d+\.\d)/g)].map((m) => Number(m[1]))
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...ys)).toBeLessThanOrEqual(100)
    expect(curve([[0, 5], [10, 9]])).toBe('M0.0,5.0L10.0,9.0')
    expect(curve([])).toBe('')
  })
})

describe('layouts by who they are for (model.ts ROLES)', () => {
  it('gives every built-in layout a role, and every role at least one layout', () => {
    const roles = new Set(XECURIFY_TEMPLATES.map((t) => roleOf(t)))
    for (const t of XECURIFY_TEMPLATES) expect(ROLES.map((r) => r.value), t.id).toContain(roleOf(t))
    for (const r of ROLES) expect(roles.has(r.value), r.label).toBe(true)
  })

  it('splits Operations: the help desk keeps Daily operations, IT gets Service health', () => {
    expect(roleOf({ id: 'operations', need: 'operations' })).toBe('helpdesk')
    expect(roleOf({ id: 'service', need: 'operations' })).toBe('it')
  })

  it('shares no section name between the widget library and the layout gallery', () => {
    const widgetWords = new Set(CATEGORIES.map((c) => c.label))
    expect(ROLES.filter((r) => widgetWords.has(r.label))).toEqual([])
  })
})
