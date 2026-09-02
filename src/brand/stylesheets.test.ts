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
