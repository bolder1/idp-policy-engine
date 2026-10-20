/// <reference types="vite/client" />
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { Button, Note } from './kit'
import kitCss from './kit.css?raw'
import kitSrc from './kit.tsx?raw'

/* The one note (owner, 16 Oct 2026, of the What's new card on Authentication
   methods: "use this as a common note component, so change every note like
   this: one heading with an accent colour like blue, and Read more and a
   button based on need … whatever content we have on the right can be static,
   no accordion"). Drawn without a browser: the heading, the mark, the fold
   only when there is something to fold, the aria that ties them, the action's
   slot, and that no note anywhere holds the orange button. The browser pass
   checks Read more opening, the motion and the row holding still. */

const html = (node: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(node)
const lf = (s: string) => s.replace(/\r\n/g, '\n')
const text = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

const SOURCES = import.meta.glob<string>(['./**/*.tsx', '!./**/*.test.tsx'], { query: '?raw', import: 'default', eager: true })

describe('a static note', () => {
  const out = html(<Note title="Serial numbers">The serial number must be unique across all tokens.</Note>)

  it('is its own white card with the info mark, not a callout', () => {
    expect(out).toMatch(/^<div class="bx-note" role="note" aria-labelledby="[^"]+">/)
    expect(out).not.toContain('bx-callout')
    expect(out).toMatch(/<svg[^>]*class="lucide[^"]*bx-note__mark"[^>]*aria-hidden="true"/)
  })

  it('has one heading, an h3 by default, that names the note', () => {
    const id = /aria-labelledby="([^"]+)"/.exec(out)?.[1]
    expect(id).toBeTruthy()
    expect(out).toContain(`<h3 id="${id}" class="bx-note__title">Serial numbers</h3>`)
    expect(out.match(/<h[1-6]\b/g)).toHaveLength(1)
    expect(html(<Note as="h2" title="What’s new">A line</Note>)).toMatch(/<h2 id="[^"]+" class="bx-note__title">What’s new<\/h2>/)
  })

  it('puts the body under the heading, and nothing to open or press', () => {
    expect(out).toContain('<div class="bx-note__body">The serial number must be unique across all tokens.</div>')
    expect(out).not.toMatch(/<button|aria-expanded|aria-controls|bx-note__more|bx-note__action/)
  })

  it('gives each note its own ids', () => {
    const two = html(
      <>
        <Note title="One">a</Note>
        <Note title="Two">b</Note>
      </>,
    )
    const ids = [...two.matchAll(/aria-labelledby="([^"]+)"/g)].map((m) => m[1])
    expect(new Set(ids).size).toBe(2)
  })
})

describe('a note with more', () => {
  const out = html(
    <Note title="Prerequisites" more={<ul><li>Second point</li></ul>}>
      First point.
    </Note>,
  )

  it('ends the body with Read more, shut, wired to what it opens', () => {
    /* A space in the line, not a margin, between the body and Read more: wrapped, it starts flush. */
    expect(out).toMatch(/<div class="bx-note__body">First point\.(<!-- -->)? <button type="button" class="bx-note__toggle" aria-expanded="false">Read more<svg[^>]*lucide-chevron-down/)
    /* Shut by default: the rest is not drawn until the press, and nothing names it (no dangling IDREF). */
    expect(out).not.toContain('Second point')
    expect(out).not.toContain('aria-controls')
    const note = lf(kitSrc).slice(lf(kitSrc).indexOf('export function Note('))
    expect(note).toContain('aria-controls={open ? moreId : undefined}')
    expect(note).toContain('id={moreId}')
  })

  it('takes its own closed label', () => {
    expect(text(html(<Note title="T" more="x" moreLabel="Show steps">y</Note>))).toBe('T y Show steps')
  })

  it('opens with Motion, and still under reduced motion', () => {
    const note = lf(kitSrc).slice(lf(kitSrc).indexOf('export function Note('))
    expect(note).toContain('const reduce = useReducedMotion()')
    expect(note).toContain('initial={reduce ? false : { height: 0, opacity: 0 }}')
    expect(note).toContain("animate={{ height: 'auto', opacity: 1 }}")
    expect(note).toContain('transition={reduce ? { duration: 0 } : { duration: 0.22, ease: NOTE_EASE }}')
  })
})

describe('a note with an action', () => {
  const out = html(
    <Note
      title="What’s new"
      more="points"
      action={
        <Button variant="secondary" size="sm">
          Take the tour
        </Button>
      }
    >
      Authentication methods has a new layout
    </Note>,
  )

  it('puts it at the head row’s end, after the heading and body, outside the fold', () => {
    expect(out).toMatch(/<div class="bx-note__head"><div class="bx-note__text">[\s\S]*<\/div><div class="bx-note__action"><button[^>]*class="bx-btn bx-btn--neutral bx-btn--sm[^"]*"[^>]*>Take the tour<\/button><\/div><\/div>/)
    expect(out).not.toContain('bx-btn--brand')
  })

  it('never holds the orange button, wherever a note is used', () => {
    const uses = Object.entries(SOURCES).flatMap(([path, src]) =>
      [...lf(src).matchAll(/<Note\b[\s\S]*?<\/Note>|<Note\b[^>]*\/>/g)].map((m) => ({ path, use: m[0] })),
    )
    expect(uses.length).toBeGreaterThan(8)
    for (const { path, use } of uses) expect(use, path).not.toMatch(/variant="(brand|primary)"|variant=\{/)
  })
})

describe('every info note is the one note', () => {
  it('leaves no info or neutral callout in the console', () => {
    for (const [path, src] of Object.entries(SOURCES)) {
      if (path === './kit.tsx') continue
      expect(src, path).not.toMatch(/<Callout\b[^>]*tone="(info|neutral)"|<Callout\b[^>]*tone=\{/)
    }
  })
})

describe('the note’s stylesheet', () => {
  const css = lf(kitCss)
  const block = css.slice(css.indexOf('/* --- Note (kit.tsx `Note`)'), css.indexOf('/* --- Card ---'))
  const rules = block.replace(/\/\*[\s\S]*?\*\//g, '')

  it('is the What’s new card: white, the hairline, the blue heading, the grey body', () => {
    expect(rules).toMatch(/\.bx-note \{[^}]*background: var\(--surface-raised\);[^}]*border: var\(--bw-thin\) solid var\(--border-default\);[^}]*border-radius: var\(--radius-lg\);[^}]*color: var\(--text-secondary\);[^}]*font-size: var\(--fs-md\); line-height: 1\.55;/)
    expect(rules).toMatch(/\.bx-note__mark \{[^}]*color: var\(--fb-info-fg\);/)
    expect(rules).toMatch(/\.bx-note \.bx-note__head \.bx-note__title \{[^}]*font-weight: var\(--fw-semibold\); color: var\(--fb-info-fg\);/)
    expect(rules).toMatch(/\.bx-note__toggle \{[^}]*color: var\(--text-link\);/)
  })

  it('keeps the action at the top of the head row and wraps it under 720px', () => {
    expect(rules).toMatch(/\.bx-note__head \{ display: flex; align-items: flex-start;/)
    expect(rules).toMatch(/@media \(max-width: 720px\) \{\s*\.bx-note__head \{ flex-wrap: wrap; \}/)
  })

  it('uses tokens only, and leaves the fold’s motion to Motion', () => {
    expect(rules).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i)
    for (const r of rules.matchAll(/([^{}]*bx-note__more[^{}]*)\{([^{}]*)\}/g)) expect(r[2], r[1]).not.toMatch(/transform|transition/)
  })
})
