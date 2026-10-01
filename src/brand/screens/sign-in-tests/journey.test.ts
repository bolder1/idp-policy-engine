import { describe, expect, it } from 'vitest'

import { engineWires, outcomePad, roundedPath, type Boxes, type WireModel } from './journey'

/* The engine run's canvas geometry (journey.ts): the wires between measured
   boxes, and where the answer hangs. The component measures; this decides. */

const model: WireModel = {
  policies: [
    { policyId: 'dev', node: 'policy:dev', decides: true },
    { policyId: 'global-default', node: 'policy:global-default', decides: false },
  ],
  rules: [
    { id: 'r1', node: 'rule:r1' },
    { id: 'r2', node: 'rule:r2' },
    { id: 'fallback', node: 'rule:fallback' },
  ],
  landing: 'rule:r2',
}

const boxes: Boxes = {
  'sign-in': { x: 24, y: 100, w: 200, h: 150, port: 30 },
  'policy:dev': { x: 264, y: 100, w: 220, h: 64 },
  'policy:global-default': { x: 264, y: 176, w: 220, h: 64 },
  'rule:r1': { x: 524, y: 100, w: 300, h: 90, port: 22 },
  'rule:r2': { x: 524, y: 202, w: 300, h: 160, port: 22 },
  'rule:fallback': { x: 524, y: 374, w: 300, h: 44, port: 22 },
  outcome: { x: 864, y: 202, w: 240, h: 180, port: 40 },
}

describe('roundedPath', () => {
  it('draws an orthogonal line with rounded corners, and says how long it is', () => {
    const p = roundedPath([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ])
    expect(p.d.startsWith('M0 0 L90 0 Q100 0 100 10')).toBe(true)
    expect(p.length).toBeGreaterThan(190)
    expect(p.length).toBeLessThan(200)
  })

  it('never rounds a corner past half of either leg', () => {
    const p = roundedPath([
      { x: 0, y: 0 },
      { x: 8, y: 0 },
      { x: 8, y: 100 },
    ])
    expect(p.d).toContain('L4 0 Q8 0 8 4')
  })

  it('drops repeated points and draws nothing for none', () => {
    expect(roundedPath([]).d).toBe('')
    expect(roundedPath([{ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 5, y: 1 }]).d).toBe('M1 1 L5 1')
  })
})

describe('engineWires', () => {
  const w = engineWires(boxes, model)

  it('fans from the sign-in to every policy, and lights the one that decides', () => {
    expect(w.fan.map((f) => f.policyId)).toEqual(['dev', 'global-default'])
    expect(w.toDecider?.d.startsWith('M224 130')).toBe(true)
    expect(w.toDecider?.d.endsWith('264 132')).toBe(true)
  })

  it('runs a spine from the deciding policy down the rules, a stub into each card at its head', () => {
    expect(w.stubs.map((s) => s.ruleId)).toEqual(['r1', 'r2', 'fallback'])
    expect(w.stubs[1].d).toBe('M504 224 L524 224')
    expect(w.trunk).toContain('504')
    expect(Object.keys(w.toRule)).toEqual(['r1', 'r2', 'fallback'])
    /* The way into a card further down is the longer one: the lit line grows down the spine. */
    expect(w.toRule.r2.length).toBeGreaterThan(w.toRule.r1.length)
    expect(w.toRule.fallback.length).toBeGreaterThan(w.toRule.r2.length)
  })

  it('leaves the card it stopped at for the outcome, meeting it at its answer', () => {
    expect(w.out?.d.startsWith('M824 224')).toBe(true)
    expect(w.out?.d.endsWith('864 242')).toBe(true)
  })

  it('draws only what it has boxes for', () => {
    expect(engineWires({}, model).fan).toEqual([])
    const early = engineWires({ 'sign-in': boxes['sign-in'], 'policy:dev': boxes['policy:dev'] }, model)
    expect(early.fan).toHaveLength(1)
    expect(early.trunk).toBeNull()
    expect(early.out).toBeNull()
  })
})

describe('outcomePad', () => {
  it('hangs the answer level with the card the walk stopped at', () => {
    expect(outcomePad(boxes, 'rule:r2', 100, 418)).toBe(102)
  })

  it('never lower than the rules reach', () => {
    expect(outcomePad(boxes, 'rule:fallback', 100, 418)).toBe(418 - 100 - 180)
  })

  it('at the top when nothing has landed', () => {
    expect(outcomePad(boxes, null, 100, 418)).toBe(0)
  })
})
