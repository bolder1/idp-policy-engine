import { describe, expect, it } from 'vitest'

import { readLine } from '../layouts/jarvis1-ask-model'
import { placeEntry, type Box } from './aruna-entry-place'

const stage: Box = { left: 0, top: 0, width: 657, height: 700 }
const self = { width: 110, height: 34 }
const bar: Box = { left: 8, top: 640, width: 640, height: 44 }

describe('placeEntry and the walkthrough bar', () => {
  it('stays in its corner when there is no bar', () => {
    const p = placeEntry(stage, null, self)
    expect(p.place).toBe('corner')
    expect(p.y).toBe(700 - 28 - 34)
  })
  it('steps above a bar it would overlap, 12 px clear, right-aligned', () => {
    const p = placeEntry(stage, null, self, bar)
    expect(p.y).toBe(640 - 12 - 34)
    expect(p.x).toBe(657 - 24 - 110)
  })
  it('leaves a clear entry alone', () => {
    const far: Box = { ...bar, top: 5000 }
    expect(placeEntry(stage, null, self, far)).toEqual(placeEntry(stage, null, self))
  })
  it('drops the dock hairline when it moves', () => {
    const dock: Box = { left: 100, top: 600, width: 300, height: 60 }
    const p = placeEntry(stage, dock, self, bar)
    expect(p.link).toBeNull()
    expect(p.y + self.height + 12).toBe(bar.top)
  })
})

describe('readLine', () => {
  it('says the engine count line as what she read', () => {
    expect(readLine('Checked 1 policy · 2 rules · 3 checks')).toBe('Read 1 policy · 2 rules · 3 checks')
  })
})
