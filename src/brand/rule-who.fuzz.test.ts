import { describe, expect, it } from 'vitest'

import type { RuleWho } from './data'
import { intersectWho, whoContains, whoCoversNobody, whoPasses, type WhoPerson } from './rule-who'

let seed = 12345
const rnd = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff
  return seed / 0x7fffffff
}
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]
const some = <T,>(xs: readonly T[], p = 0.35): T[] => xs.filter(() => rnd() < p)

const G = ['g1', 'g2', 'g3']
const U = ['u1', 'u2', 'u3', 'u4']
const randWho = (): RuleWho | undefined =>
  rnd() < 0.15
    ? undefined
    : { groupIds: some(G), userIds: some(U, 0.25), exceptGroupIds: some(G, 0.2), exceptUserIds: some(U, 0.2) }

/* Without a directory, a person's group is unknown: every (id, group) pair. */
const everyPerson: WhoPerson[] = [...U, 'ux'].flatMap((id) => [...G, 'gx'].map((groupId) => ({ id, groupId })))
const randDirectory = (): WhoPerson[] => [...U, 'ux'].map((id) => ({ id, groupId: pick([...G, 'gx']) }))

describe('fuzz: whoContains is sound', () => {
  it('without a directory', () => {
    for (let n = 0; n < 4000; n++) {
      const o = randWho()
      const i = randWho()
      if (!whoContains(o, i)) continue
      for (const p of everyPerson) {
        if (whoPasses(i, p)) expect(whoPasses(o, p), JSON.stringify({ o, i, p })).toBe(true)
      }
    }
  })
  it('with a directory', () => {
    for (let n = 0; n < 4000; n++) {
      const dir = randDirectory()
      const o = randWho()
      const i = randWho()
      if (!whoContains(o, i, dir)) continue
      for (const p of dir) {
        if (whoPasses(i, p)) expect(whoPasses(o, p), JSON.stringify({ o, i, p, dir })).toBe(true)
      }
    }
  })
})

describe('fuzz: whoCoversNobody is sound', () => {
  it('with and without a directory', () => {
    for (let n = 0; n < 4000; n++) {
      const dir = randDirectory()
      const w = randWho()
      if (whoCoversNobody(w)) for (const p of everyPerson) expect(whoPasses(w, p), JSON.stringify({ w, p })).toBe(false)
      if (whoCoversNobody(w, dir)) for (const p of dir) expect(whoPasses(w, p), JSON.stringify({ w, p, dir })).toBe(false)
    }
  })
})

describe('fuzz: intersectWho is never wider, and exact with a directory', () => {
  const passes = (w: RuleWho | undefined | null, p: WhoPerson) => (w === null ? false : whoPasses(w, p))
  it('never wider without a directory', () => {
    for (let n = 0; n < 4000; n++) {
      const a = randWho()
      const b = randWho()
      const x = intersectWho(a, b)
      for (const p of everyPerson) {
        if (passes(x, p)) expect(whoPasses(a, p) && whoPasses(b, p), JSON.stringify({ a, b, x, p })).toBe(true)
      }
    }
  })
  it('never wider with a directory', () => {
    for (let n = 0; n < 4000; n++) {
      const dir = randDirectory()
      const a = randWho()
      const b = randWho()
      const x = intersectWho(a, b, dir)
      for (const p of dir) {
        if (passes(x, p)) expect(whoPasses(a, p) && whoPasses(b, p), JSON.stringify({ a, b, x, p })).toBe(true)
      }
    }
  })
  it('exact with a directory', () => {
    let misses = 0
    let sample = ''
    for (let n = 0; n < 4000; n++) {
      const dir = randDirectory()
      const a = randWho()
      const b = randWho()
      const x = intersectWho(a, b, dir)
      for (const p of dir) {
        if (passes(x, p) !== (whoPasses(a, p) && whoPasses(b, p))) {
          misses++
          sample ||= JSON.stringify({ a, b, x, p, dir })
        }
      }
    }
    expect({ misses, sample }).toEqual({ misses: 0, sample: '' })
  })
})
