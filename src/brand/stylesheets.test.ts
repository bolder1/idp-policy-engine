/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest'

/* Every stylesheet closes every block it opens.

   This exists because the one time it was false, nothing caught it — not the
   type checker, not the build, not the browser in dev, and not a careful read
   of the diff.

   `zones-final.css` ended with a bare `@media (max-width: 900px) {` after a
   delete took the rules inside it. In DEV that is harmless: Vite serves each
   CSS file as its own `<style>` tag, and the HTML parser closes an open block
   at the end of the tag, so the damage stops at the file boundary. In the
   BUILD every sheet is concatenated into one file — so the unclosed block
   swallowed everything after it, which was `console-theme.css`, the sheet
   loaded last precisely because it corrects earlier ones at equal specificity.

   The visible symptom was a table header rendering 11px uppercase in
   production and 14px sentence-case on localhost, from identical bundles. The
   real cost is bigger than that one rule: the whole of the last stylesheet was
   quarantined behind a media query it never asked to be in.

   Balanced braces is a weak property — it would not catch a `}` in the wrong
   place — but it is exactly the property that failed, and it is the one a
   deletion script is most likely to break. */

const SHEETS = import.meta.glob('./**/*.css', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>

/** Depth after the whole file, ignoring anything inside a comment. */
function braceDepth(css: string): number {
  let depth = 0
  let inComment = false
  for (let i = 0; i < css.length; i++) {
    if (inComment) {
      if (css.startsWith('*/', i)) {
        inComment = false
        i++
      }
      continue
    }
    if (css.startsWith('/*', i)) {
      inComment = true
      i++
      continue
    }
    if (css[i] === '{') depth++
    else if (css[i] === '}') depth--
  }
  return depth
}

describe('the stylesheets', () => {
  it('finds some to check', () => {
    // A glob that silently matches nothing would make every assertion below
    // vacuously true, which is the failure mode of this kind of test.
    expect(Object.keys(SHEETS).length).toBeGreaterThan(10)
  })

  it('closes every block it opens', () => {
    const unbalanced = Object.entries(SHEETS)
      .map(([path, css]) => ({ path, depth: braceDepth(css) }))
      .filter((x) => x.depth !== 0)
      .map((x) => `${x.path}: ${x.depth > 0 ? `${x.depth} unclosed` : `${-x.depth} extra`}`)

    expect(unbalanced).toEqual([])
  })

  /* A rule that has stopped applying because a comment swallowed it.

     The counter above cannot see this, and that is not a gap in it — it is the
     mechanism. It SKIPS comment bodies, so a comment whose terminator was typed
     with a full stop where the slash belonged reads all the way to the file's
     NEXT terminator, and every rule in between stops counting. The braces
     balance perfectly. Nothing else catches it either: the rules still parse as
     comment text so the build is clean, and the classes are still emitted so
     React is happy. The only symptom is a stylesheet that has quietly stopped
     applying somewhere nobody has looked at recently.

     Four of these were live when this test was written — three in
     `device-fingerprint-v2.css` and one in `hooks.css` — and between them they
     had swallowed a dozen rules, two section banners, and the layout of a
     search bar that had been visibly broken ever since.

     Counting openers against terminators was the first version and it is wrong:
     CSS ignores an opener inside a comment, so prose that mentions one is not a
     defect, and `kit.css` has a legitimate `interactive` + opener in a sentence
     about semantic roles. So this asserts the thing that actually matters —
     that no declaration block is sitting inside a comment — which names the
     damage rather than a proxy for it. */
  it('never swallows a rule inside a comment', () => {
    const swallowed = Object.entries(SHEETS).flatMap(([path, css]) => {
      const bodies = [...css.matchAll(/\/\*([\s\S]*?)\*\//g)].map((m) => m[1])
      return bodies
        /* A block with a declaration in it: braces around at least one
           `property: value;`. Prose can hold a brace or a semicolon; it does
           not hold both in that shape. */
        .filter((b) => /\{[^{}]*:[^{}]*;[^{}]*\}/.test(b))
        .map((b) => `${path}: ${b.replace(/\s+/g, ' ').trim().slice(-70)}`)
    })

    expect(swallowed).toEqual([])
  })

  /* A stylesheet still has the rules its screen is built out of.

     The two checks above are about a sheet that has been CORRUPTED. This one is
     about a sheet that has been silently EMPTIED, which is a different failure
     and the one that actually happened: an edit script sliced from one marker to
     another, the second marker resolved two thousand lines further down the file
     than intended, and `board.css` went from 3,146 rules to 823 in one commit.

     Nothing caught it. Braces stayed balanced, because a truncation removes
     matched pairs. No rule was swallowed by a comment. `tsc` does not read CSS.
     `npm run build` succeeded. The tests passed. The board rendered as unstyled
     text for five commits, and the only reason it was noticed at all is that
     somebody looked at it.

     So: the load-bearing selector of each region the board draws, asserted to
     exist. Not every class — a list that tracks every rule would be rewritten
     with every change and would teach people to update it without reading it.
     One anchor per region is enough, because the failure this guards against
     removes regions wholesale.

     `bb__idx__n` and `bb__ifpick` are deliberately absent from this list: both
     are rendered by the board and neither has ever had a rule, which is a real
     if minor oversight and not the thing being tested here. */
  const ANCHORS: [string, string[]][] = [
    [
      './screens/board/board.css',
      [
        '.bb ', // the region itself
        '.bbtop', // the flat top row
        '.bb__stage',
        '.bb__world',
        '.bb__empty', // the chooser, when there are no rules
        '.bb__chain', // the chain, when there are
        '.bb__start',
        '.bb__link',
        '.bb__card',
        '.bb__idx',
        '.bb__dock',
        '.bb__float',
        '.bb__insp',
        '.bb__insphead',
        '.bb__sheet',
        '.bb__grip',
        '.bb__if', // a condition row
        '.bb__rule',
      ],
    ],
    [
      './create/create.css',
      ['.bmarket', '.bmarket__hero', '.bmarket__rail', '.bmarket__body', '.bgcard', '.bgcard__cat'],
    ],
  ]

  it('keeps a rule for every region its screen draws', () => {
    for (const [path, anchors] of ANCHORS) {
      const css = SHEETS[path]
      expect(`${path} found`, `${path} is not in the glob`).toBe(css ? `${path} found` : `${path} MISSING`)
      /* Comments are stripped first. This file is heavily commented and several
         of these selectors are discussed in prose — a check that counted a
         mention as a rule would pass on a file that had been emptied and
         annotated, which is very nearly what happened. */
      const rules = css.replace(/\/\*[\s\S]*?\*\//g, '')
      const missing = anchors.filter((a) => !rules.includes(a))
      expect(missing, `${path} has no rule for`).toEqual([])
    }
  })

  it('never leaves an at-rule with a wholly empty body', () => {
    /* The other half of the same delete. An `@media` whose rules have all been
       removed is dead weight, and the edit that empties it is one keystroke
       from the edit that unbalances it.

       Comments count as a body. `create.css` holds a deliberately ruleless
       `@media` whose whole content is a note saying why nothing needs
       overriding at that width — that is a decision somebody recorded, not a
       leftover, and a test that cannot tell them apart would teach people to
       delete the explanation. */
    const empties = Object.entries(SHEETS).flatMap(([path, css]) => {
      const found = [...css.matchAll(/@[a-z-]+[^{}]*\{\s*\}/g)]
      return found.map((m) => `${path}: ${m[0].replace(/\s+/g, ' ').slice(0, 60)}`)
    })

    expect(empties).toEqual([])
  })
})
