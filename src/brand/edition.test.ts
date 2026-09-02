/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest'

import policiesSrc from './screens/Policies.tsx?raw'
import createSrc from './create/CreatePolicy.tsx?raw'
import mainSrc from './screens/PolicyBuilderMain.tsx?raw'
import { GAPS, featuresOf, gapsFor, type Features } from './edition'

/* There is one shell now. This used to run over two — a flag gating a
   capability in one builder and not the other is a lite edition that leaks
   depending on which design you happen to be looking at, which is worse than
   one that leaks everywhere because it is a leak nobody can reproduce — and the
   loop is kept for the day there is a second surface again.

   The lite edition is a promise about what is *absent*, and absence is the one
   thing nobody notices regressing. A feature that quietly comes back makes the
   comparison this whole exercise is for meaningless, so the gates are asserted
   at their call sites rather than trusted. */
const SHELLS: [string, string][] = [['main', mainSrc]]

const LITE = featuresOf('lite')
const FULL = featuresOf('full')

describe('the two editions', () => {
  it('withholds exactly what was asked for, and nothing else', () => {
    const off = (Object.keys(LITE) as (keyof Features)[]).filter((k) => !LITE[k]).sort()
    expect(off).toEqual(
      [
        'blastRadius',
        'checkStep',
        'commands',
        'coverage',
        'designSwitcher',
        'exposure',
        'gauntlet',
        'guidedSetup',
        'publish',
        'reviewStep',
        'templateHero',
      ].sort(),
    )
  })

  it('grants everything in full', () => {
    expect(Object.values(FULL).every(Boolean)).toBe(true)
  })

  it('gates every withheld capability at its call site', () => {
    // Grep the source rather than render: the point is that no path reaches the
    // feature, and a render test only proves the paths it happens to walk.
    expect(policiesSrc).toContain('store.features.coverage')
    expect(policiesSrc).toContain('store.features.exposure')
    expect(createSrc).toContain('store.features.templateHero')
    expect(createSrc).toContain('store.features.guidedSetup')
    for (const flag of ['gauntlet', 'blastRadius', 'commands', 'guidedSetup', 'publish']) {
      for (const [shell, src] of SHELLS) {
        expect(`${shell} ${flag}: ${src.includes(`features.${flag}`)}`).toBe(`${shell} ${flag}: true`)
      }
    }
  })

  it('binds the command shortcut to the same flag as the menu entry', () => {
    // A palette still reachable by ⌘K in an edition whose menu denies it exists
    // is worse than one that is simply present.
    for (const [shell, src] of SHELLS) {
      expect(`${shell}: ${/features\.commands &&\s*\(e\.metaKey/.test(src)}`).toBe(`${shell}: true`)
    }
  })

  /* Was "builds the trail from the edition instead of filtering at each use".

     The five-step trail is gone. It existed so a rule could be walked one
     question at a time, and `checkStep`/`reviewStep` punched holes in it — which
     is what needed guarding, because half the builder indexed into that array.

     Both flags survive and still gate real capability, so what this asserts now
     is that they gate it rather than that an array is built from them:
     `checkStep` gates the per-rule findings strip, `reviewStep` gates the review
     stage. An array with holes cannot be indexed wrongly if there is no array. */
  it('gates the check strip and the review stage on their own flags', () => {
    for (const [, src] of SHELLS) {
      expect(src).toContain('features.checkStep')
      expect(src).toContain('features.reviewStep')
      expect(src).not.toMatch(/const STEPS/)
    }
  })
})

describe('the gap catalogue', () => {
  it('names a gap for every capability lite withholds', () => {
    /* Two flags are deliberately unargued, and both need a reason on record or
       this assertion becomes a place to hide omissions:

       · `designSwitcher` is prototype furniture. Removing it costs the product
         nothing, because it was never part of the product.
       · `publish` gates the bar button and the launch slide, which is the same
         argument the `reviewStep` gap already makes under the title "The
         publish gate". A second entry saying it again would pad the panel and
         weaken it. */
    const UNARGUED: (keyof Features)[] = ['designSwitcher', 'publish']
    const withheld = (Object.keys(LITE) as (keyof Features)[]).filter((k) => !LITE[k])
    const named = new Set(GAPS.map((g) => g.id))
    const missing = withheld.filter((k) => !UNARGUED.includes(k) && !named.has(k))
    expect(missing).toEqual([])
    // And the fold has to be real: the review gap must actually mention it.
    expect(GAPS.find((g) => g.id === 'reviewStep')?.title).toBe('The publish gate')
  })

  it('shows nothing in the full edition', () => {
    expect(gapsFor(FULL)).toEqual([])
  })

  it('orders worst-first, so the panel opens on the argument that carries weight', () => {
    const rank = { high: 0, medium: 1, low: 2 }
    const got = gapsFor(LITE).map((g) => rank[g.weight])
    expect(got).toEqual([...got].sort((a, b) => a - b))
  })

  it('states every gap as a question with a cost and an answer', () => {
    for (const g of GAPS) {
      expect(`${g.id}: ${g.question.trim().endsWith('?')}`).toBe(`${g.id}: true`)
      expect(g.cost.length).toBeGreaterThan(40)
      expect(g.covered.length).toBeGreaterThan(40)
    }
  })
})
