import { describe, expect, it } from 'vitest'

import { card, cond, when } from './data'
import { valuesTakenElsewhere } from './predicate'

/* -----------------------------------------------------------------------------
   A value one condition names is not offered to another condition on the same
   attribute in the same branch (owner, 22 Sep 2026: "if I picked one zone in
   any condition I can't pick that in the other condition — this may cause
   conflict"). What counts as the same branch is the part these pin down.
   -------------------------------------------------------------------------- */

const grouped = (...cs: ReturnType<typeof cond>[]) => ({ ...card(...cs), grouped: true })

describe('values taken by another condition', () => {
  it('takes a zone another condition in the same run already names — the in/not-in conflict', () => {
    const a = cond('zone', 'in zone', ['office'])
    const b = cond('zone', 'not in zone', [])
    const p = when(card(a, b))
    expect(valuesTakenElsewhere(p, b.id)).toEqual(['office'])
    expect(valuesTakenElsewhere(p, a.id)).toEqual([])
  })

  it('only looks at conditions on the same attribute', () => {
    const zone = cond('zone', 'in zone', ['office'])
    const profile = cond('fingerprint', 'matches', ['office'])
    expect(valuesTakenElsewhere(when(card(zone, profile)), profile.id)).toEqual([])
  })

  it('never counts the condition itself, so its own values stay pickable', () => {
    const a = cond('zone', 'in zone', ['office', 'hq'])
    expect(valuesTakenElsewhere(when(card(a)), a.id)).toEqual([])
  })

  it('takes values inside one group', () => {
    const a = cond('zone', 'in zone', ['office'])
    const b = cond('zone', 'in zone', [])
    expect(valuesTakenElsewhere(when(grouped(a, b)), b.id)).toEqual(['office'])
  })

  it('leaves two different groups free to name the same zone — they are alternatives', () => {
    const a = cond('zone', 'in zone', ['office'])
    const b = cond('zone', 'in zone', [])
    const p = when(grouped(a, cond('fingerprint', 'matches', ['laptops'])), grouped(b, cond('time', 'between', ['09:00', '17:00'])))
    expect(valuesTakenElsewhere(p, b.id)).toEqual([])
  })

  it('takes a value between a loose condition and a group, in both directions', () => {
    const loose = cond('zone', 'in zone', ['office'])
    const inGroup = cond('zone', 'in zone', ['hq'])
    const p = when(card(loose), grouped(inGroup, cond('fingerprint', 'matches', ['laptops'])))
    expect(valuesTakenElsewhere(p, inGroup.id)).toEqual(['office'])
    expect(valuesTakenElsewhere(p, loose.id)).toEqual(['hq'])
  })

  it('knows nothing of a condition that is not in the rule', () => {
    expect(valuesTakenElsewhere(when(card(cond('zone', 'in zone', ['office']))), 'missing')).toEqual([])
  })
})
