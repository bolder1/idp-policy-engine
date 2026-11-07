import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import {
  RAIL_DEFAULT,
  addRow,
  isDefault,
  moveSection,
  orderSections,
  parseRail,
  place,
  removeRow,
  reorderSection,
  resolve,
  step,
  type RailSection,
} from './rail-custom'
import { BrandProvider } from './store'
import { Shell } from './Shell'

const D: RailSection[] = [
  { key: 'top', items: ['Dashboard', 'Getting Started'] },
  { key: 'Configure', items: ['Apps', 'Policies'] },
  { key: 'Manage', items: ['Users', 'Groups'] },
]
const keysOf = (p = RAIL_DEFAULT) => resolve(D, p.layout).map((s) => s.key)
const itemsOf = (p: typeof RAIL_DEFAULT, key: string) => resolve(D, p.layout).find((s) => s.key === key)!.items

describe('Customize sidebar: the arrangement', () => {
  it('draws the console’s own layout when nothing is stored', () => {
    expect(resolve(D, null)).toBe(D)
  })

  it('steps a row within its section, then across into the next', () => {
    const one = step(RAIL_DEFAULT, D, 'Apps', 1)
    expect(itemsOf(one, 'Configure')).toEqual(['Policies', 'Apps'])
    const two = step(one, D, 'Apps', 1)
    expect(itemsOf(two, 'Configure')).toEqual(['Policies'])
    expect(itemsOf(two, 'Manage')).toEqual(['Apps', 'Users', 'Groups'])
    expect(step(RAIL_DEFAULT, D, 'Dashboard', -1)).toBe(RAIL_DEFAULT)
    expect(step(RAIL_DEFAULT, D, 'Groups', 1)).toBe(RAIL_DEFAULT)
  })

  it('steps over a row taken out, as if it were not there', () => {
    const p = step(removeRow(RAIL_DEFAULT, 'Policies'), D, 'Apps', 1)
    expect(itemsOf(p, 'Manage')[0]).toBe('Apps')
  })

  it('places a dropped row in another section, and forgets a layout back at the default', () => {
    const moved = place(RAIL_DEFAULT, D, 'Users', 'top', 1)
    expect(itemsOf(moved, 'top')).toEqual(['Dashboard', 'Users', 'Getting Started'])
    const back = place(moved, D, 'Users', 'Manage', 0)
    expect(back.layout).toBeNull()
    expect(isDefault(back)).toBe(true)
  })

  it('reorders a section’s shown rows and leaves a removed row in its slot', () => {
    const p = removeRow(RAIL_DEFAULT, 'Dashboard')
    expect(itemsOf(reorderSection(p, D, 'top', ['Getting Started']), 'top')).toEqual(['Dashboard', 'Getting Started'])
    expect(itemsOf(reorderSection(RAIL_DEFAULT, D, 'Manage', ['Groups', 'Users']), 'Manage')).toEqual(['Groups', 'Users'])
  })

  it('moves the named sections, never the head', () => {
    expect(keysOf(moveSection(RAIL_DEFAULT, D, 'Manage', -1))).toEqual(['top', 'Manage', 'Configure'])
    expect(moveSection(RAIL_DEFAULT, D, 'Configure', -1)).toBe(RAIL_DEFAULT)
    expect(moveSection(RAIL_DEFAULT, D, 'top', 1)).toBe(RAIL_DEFAULT)
    expect(keysOf(orderSections(RAIL_DEFAULT, D, ['Manage', 'top', 'Configure']))).toEqual(['top', 'Manage', 'Configure'])
  })

  it('takes a row out and puts it back', () => {
    const out = removeRow(RAIL_DEFAULT, 'Apps')
    expect(out.removed).toEqual(['Apps'])
    expect(isDefault(addRow(out, 'Apps'))).toBe(true)
  })

  it('fits a stored layout to today’s rail: new pages keep their place, gone ones drop, the head stays first', () => {
    const stored: RailSection[] = [
      { key: 'Manage', items: ['Groups', 'Gone'] },
      { key: 'top', items: ['Dashboard', 'Getting Started'] },
      { key: 'Configure', items: ['Policies', 'Apps'] },
    ]
    const r = resolve(D, stored)
    expect(r.map((s) => s.key)).toEqual(['top', 'Manage', 'Configure'])
    expect(r.find((s) => s.key === 'Manage')!.items).toEqual(['Users', 'Groups'])
  })

  it('reads anything malformed as the default', () => {
    expect(parseRail(null)).toEqual(RAIL_DEFAULT)
    expect(parseRail('not json')).toEqual(RAIL_DEFAULT)
    expect(parseRail('{"layout":[{"key":1}],"removed":"Apps"}')).toEqual(RAIL_DEFAULT)
    expect(parseRail('{"layout":[{"key":"top","items":["Apps"]}],"removed":["Reports"]}')).toEqual({
      layout: [{ key: 'top', items: ['Apps'] }],
      removed: ['Reports'],
    })
  })
})

describe('Customize sidebar: the rail', { timeout: 30_000 }, () => {
  const out = renderToStaticMarkup(
    <BrandProvider>
      <Shell>
        <div />
      </Shell>
    </BrandProvider>,
  )

  it('offers the way in at the rail’s foot, and is not in the mode on arrival', () => {
    expect(out).toContain('Customize sidebar')
    expect(out).not.toContain('data-rail-grip')
    expect(out).not.toContain('>Done<')
  })
})
