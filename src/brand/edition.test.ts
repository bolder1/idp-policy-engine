/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest'

import policiesSrc from './screens/Policies.tsx?raw'
import mainSrc from './screens/PolicyBuilderMain.tsx?raw'
import boardBuilderSrc from './screens/board/BoardBuilder.tsx?raw'
import boardEmptySrc from './screens/board/BoardEmpty.tsx?raw'
import storeSrc from './store.tsx?raw'
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
        'breakInTest',
        'checkStep',
        'commands',
        'coverage',
        'designSwitcher',
        'exposure',
        'gauntlet',
        'policyTesting',
        'publish',
        'reviewStep',
      ].sort(),
    )
  })

  it('keeps the testing capabilities the manager asked for in lite', () => {
    /* Try a sign-in is v0's Test policy, Monitor is scenario #6, and the checks
       before turning on guard the saved sign-ins. Withholding any of them would
       make lite less than what was asked for, not the scope as asked. */
    expect([LITE.trySignIn, LITE.monitorMode, LITE.beforeTurningOn]).toEqual([true, true, true])
  })

  it('keeps Describe it and its checks in lite: scenario #16, plain-English setup', () => {
    expect([LITE.describePolicy, LITE.draftChecks]).toEqual([true, true])
    expect([FULL.describePolicy, FULL.draftChecks]).toEqual([true, true])
  })

  it('pins the showcase testing capabilities once, where the store reads the edition', () => {
    /* The showcase is lite plus the two testing surfaces the owner is
       comparing. One pin, at the call site, as the SHOWCASE convention asks
       (showcase.ts) — not a helper that hides which flags it moves. Describe
       it is pinned OFF for now (owner, 30 Sep 2026: "hide this, not needed as
       of now"); its checks stay on. Both are named, so the pin says
       everything the showcase shows. */
    expect(storeSrc.replace(/\s+/g, ' ')).toContain(
      'features: SHOWCASE ? { ...featuresOf(edition), policyTesting: true, breakInTest: true, describePolicy: false, draftChecks: true } : featuresOf(edition),',
    )
    expect(storeSrc.match(/featuresOf\(/g)?.length).toBe(2)
  })

  /* Everything but the Exposure column, which printed the deck's letter grade
     on every row. The grade is retired in both editions (owner, 25 Sep 2026:
     counts, not a grade; final spec, M4), so neither shows it. */
  it('grants everything in full but the retired Exposure column', () => {
    const off = (Object.keys(FULL) as (keyof Features)[]).filter((k) => !FULL[k])
    expect(off).toEqual(['exposure'])
  })

  it('gates every withheld capability at its call site', () => {
    // Grep the source rather than render: the point is that no path reaches the
    // feature, and a render test only proves the paths it happens to walk.
    expect(policiesSrc).toContain('store.features.coverage')
    expect(policiesSrc).toContain('store.features.exposure')
    /* Describe it is offered from the empty draft's chooser: the board reads
       the flag, and the chooser draws the card only when it is handed the way
       in. The five-question guided build it replaced, and its flag, are gone
       (describe spec, §6.2).

       `templateHero` was asserted here once and has gone with its flag: the
       template card's rule-stack face is a drawing of the template's own rules,
       not a capability, and gating it only meant lite could not see what it was
       choosing. */
    expect(boardBuilderSrc).toContain('features.describePolicy')
    expect(boardEmptySrc).toMatch(/\{onDescribe && \(/)
    for (const src of [policiesSrc, mainSrc, boardBuilderSrc]) expect(src).not.toContain('guidedSetup')
    for (const flag of ['gauntlet', 'blastRadius', 'commands', 'publish']) {
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
    /* Five flags are deliberately unargued, and each needs a reason on record or
       this assertion becomes a place to hide omissions:

       · `designSwitcher` is prototype furniture. Removing it costs the product
         nothing, because it was never part of the product.
       · `publish` gates the bar button and the launch slide, which is the same
         argument the `reviewStep` gap already makes under the title "The
         publish gate". A second entry saying it again would pad the panel and
         weaken it.
       · `policyTesting` asks the question Try a sign-in already answers in
         lite, which policy decides this sign-in, from a page instead of the
         board. Lite can still answer it; it answers it in fewer places.
       · `breakInTest` is the gauntlet's deck counted without its grade, and
         the `gauntlet` gap already argues "What gets through this policy?".
       · `exposure` is withheld from full too, since the grade it printed was
         retired (final spec, M4). A gap is what lite lacks that full has, and
         neither has this. */
    const UNARGUED: (keyof Features)[] = ['designSwitcher', 'publish', 'policyTesting', 'breakInTest', 'exposure']
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
