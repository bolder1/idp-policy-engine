/// <reference types="vite/client" />
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'

import { BrandProvider } from '../../store'
import { TestingSessionProvider } from '../testing/session'
import { PeopleTable } from './PeopleTable'
import { RunsReport } from './RunsReport'
import { SavedTable } from './SavedTable'
import css from './library.css?raw'
import savedSrc from './SavedTable.tsx?raw'
import peopleSrc from './PeopleTable.tsx?raw'
import runsSrc from './RunsReport.tsx?raw'
import libSrc from './library.ts?raw'
import runsModelSrc from './runs.ts?raw'
import fixtureSrc from './runs-fixture.ts?raw'
import { forgetLibraryMemory, libraryMemory } from './library'

/* The Sign-in tests page's library and report tabs, drawn without a browser
   on the showcase tenant. library.test.ts and runs.test.ts pin the rules;
   this is what they print. The browser pass checks the rest — the pager
   fitting the window, the sticky column under a sideways scroll, Run all's
   settle and flash. */

const text = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
const noop = () => {}
const NOW = new Date('2026-09-28T12:00:00Z')

const draw = (node: React.ReactNode) =>
  renderToStaticMarkup(
    <BrandProvider>
      <TestingSessionProvider>{node}</TestingSessionProvider>
    </BrandProvider>,
  )

const headers = (out: string) => [...out.matchAll(/<th scope="col"[^>]*>([\s\S]*?)<\/th>/g)].map((m) => text(m[1]))

beforeEach(() => forgetLibraryMemory())

describe('Saved sign-ins', () => {
  const out = draw(<SavedTable onTry={noop} onNew={noop} />)

  it('has the bar: search and two filters on the left, Run all and one primary New sign-in on the right', () => {
    expect(out).toContain('aria-label="Search saved sign-ins"')
    expect(out).toContain('aria-label="Filter by application"')
    expect(out).toContain('aria-label="Filter by level"')
    expect(text(out)).toContain('Run all')
    expect(out.split('bx-btn--brand').length - 1).toBe(1)
    expect(out.indexOf('Run all')).toBeLessThan(out.indexOf('New sign-in'))
  })

  it('draws the columns the spec names, the actions unlabelled but named for readers', () => {
    expect(headers(out)).toEqual(['Sign-in', 'Expected', 'Now', 'Level', 'Decided by', 'Actions'])
    expect(out).toContain('<caption class="u-sr-only">Saved sign-ins</caption>')
  })

  it('puts the failing rows first, each with its sentence, a Fail badge and the policy that decides', () => {
    const names = [...out.matchAll(/class="sitl-name"[^>]*>([^<]*)<\/button>/g)].map((m) => m[1])
    expect(names.slice(0, 2)).toEqual(['Kavya Menon in the office', 'Neha Kapoor at home'])
    expect(text(out)).toContain('Kavya Menon · HRMS · Office network')
    expect(out).toMatch(/bx-badge--negative[^>]*><span class="bx-badge__label"[^>]*>Fail</)
    expect(text(out)).toContain('Global Default Policy')
    expect(out).toContain('aria-label="Kavya Menon in the office: expected Allow with 2FA, now Allow on 1 factor, Fail. Try this sign-in"')
  })

  it('shows a pass as a quiet check, never a green badge, and the level as a neutral pill', () => {
    expect(out).toContain('class="sitl-pass"')
    expect(out).not.toMatch(/bx-badge--positive[^>]*><span class="bx-badge__label"[^>]*>Pass</)
    expect(out).toMatch(/bx-badge--neutral[^>]*><span class="bx-badge__label"[^>]*>Must pass</)
  })

  it('pages the rows and gives each a row menu with Try and Delete', () => {
    expect(out).toContain('aria-label="Saved sign-in pages"')
    expect(out).toContain('aria-label="Actions for Kavya Menon in the office"')
  })

  it('says nothing flashes on the first draw', () => {
    expect(out).not.toContain('sitl-flash')
  })

  it('holds the rows in a body that grows, the pager after it, and a status region whose words are keyed by the run', () => {
    expect(out.indexOf('class="sitl-body"')).toBeLessThan(out.indexOf('class="btable-wrap sitl-wrap"'))
    expect(out.indexOf('class="sitl-body"')).toBeLessThan(out.indexOf('aria-label="Saved sign-in pages"'))
    expect(out).toMatch(/<span class="u-sr-only" role="status"><span><\/span><\/span>/)
  })

  /* tables-check T5: one style for every link-style button — the kit's. */
  it('names the deciding policy whole, on up to two lines, with the kit’s link button', () => {
    expect(out).toMatch(/class="sitl-by"><button type="button" title="Developer tools — office and device checks" class="bx-btn bx-btn--link /)
    expect(out).not.toContain('sitl-link')
    const body = css.replace(/\/\*[\s\S]*?\*\//g, '')
    const by = /\.sitl-table \.sitl-by > \.bx-btn \{([^}]*)\}/.exec(body)?.[1] ?? ''
    expect(by).toMatch(/-webkit-line-clamp:\s*2/)
    /* Layout only: the colour, weight, hover and focus stay the kit's. */
    expect(by).not.toMatch(/color|font-weight|text-decoration|box-shadow/)
  })

  /* tables-check T4: Pass and Fail start at one edge down the Now column. */
  it('gives the answer and the result a track each, the answer’s as wide as the widest badge', () => {
    const body = css.replace(/\/\*[\s\S]*?\*\//g, '')
    const now = /\.sitl-now \{([^}]*)\}/.exec(body)?.[1] ?? ''
    expect(now).toMatch(/display:\s*grid/)
    expect(now).toMatch(/grid-template-columns:\s*minmax\(112px, max-content\) auto/)
    expect(out).toMatch(/<span class="sitl-now"><span class="bx-badge [^"]*bx-decision-badge"><span class="bx-badge__label">[^<]*<\/span><\/span><span class="(sitl-pass|bx-badge bx-badge--negative)"/)
  })

  /* tables-check T12: the cut-off line reaches a keyboard and a reader. */
  it('describes the name by its line, and opens the whole sign-in’s tip on the name as well as the line', () => {
    const cell = out.slice(out.indexOf('class="sitl-first"'), out.indexOf('</td>', out.indexOf('class="sitl-first"')))
    const described = /aria-describedby="([^"]+)"/.exec(cell)?.[1]
    expect(described).toBeTruthy()
    expect(cell).toContain(`id="${described}" class="sitl-line"`)
    /* The tip holds the button and the line both. */
    expect(cell.indexOf('class="bx-tip"')).toBeLessThan(cell.indexOf('class="sitl-name"'))
    expect(cell.indexOf('class="bx-tip"')).toBeLessThan(cell.indexOf('class="sitl-line"'))
  })

  it('comes back as it was left: the search and the filters are the memory’s', () => {
    forgetLibraryMemory()
    Object.assign(libraryMemory('manager').saved, { query: 'hrms', level: 'protected' })
    const back = draw(<SavedTable onTry={noop} onNew={noop} />)
    expect(back).toContain('value="hrms"')
    const names = [...back.matchAll(/class="sitl-name"[^>]*>([^<]*)<\/button>/g)].map((m) => m[1])
    expect(names).toEqual(['Ravi Menon on HRMS'])
  })
})

describe('People', () => {
  const out = draw(<PeopleTable onTry={noop} />)

  it('has every application as a column after a sticky Person column', () => {
    const cols = headers(out)
    expect(cols[0]).toBe('Person')
    expect(cols).toContain('HRMS')
    expect(cols).toContain('GitHub Enterprise')
    expect(cols).toContain('Google Workspace')
    expect(cols.length).toBe(1 + 13)
    expect(out).toMatch(/<th scope="col" class="sitl-sticky">/)
    expect(out).toContain('class="sitl-scroll sitl-xscroll"')
  })

  it('draws the search, the Group filter and the pager, and no counts on anything', () => {
    expect(out).toContain('aria-label="Search people"')
    expect(out).toContain('aria-label="Filter by group"')
    expect(out).toContain('aria-label="People pages"')
  })

  it('names each row for a reader with every application’s answer', () => {
    expect(out).toMatch(/aria-label="[^"]+, [^"]+\. HRMS [^"]+, Microsoft Outlook [^"]+\. Try this person"/)
    expect(out).toContain('bx-decision-badge')
  })

  /* tables-check T2: a cell tries its own application, and a keyboard reaches it. */
  it('makes every cell a button of its own, named for the person, the application and the answer, inside its tip', () => {
    const cells = [...out.matchAll(/<td class="sitl-pcell">([\s\S]*?)<\/td>/g)].map((m) => m[1])
    expect(cells.length).toBeGreaterThan(0)
    for (const c of cells) {
      expect(c).toMatch(/^<span class="bx-tip"><button type="button" class="sitl-cellbtn" aria-label="Try [^"]+ on [^"]+: [^"]+">/)
    }
    expect(out).toMatch(/aria-label="Try [^"]+ on Microsoft Outlook: [^"]+"/)
    expect(out).toMatch(/aria-label="Try [^"]+ on GitHub Enterprise: [^"]+"/)
    expect(peopleSrc).toContain('onTry(r.person.id, c.appId)')
    expect(peopleSrc).toMatch(/e\.stopPropagation\(\)\s*onTry\(r\.person\.id, c\.appId\)/)
    /* Pressed anywhere in the cell: the button's ::after fills the cell, past its tip's wrapper. */
    const body = css.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(body).toMatch(/\.sitl-people tbody td\.sitl-pcell \{ position: relative; \}/)
    expect(body).toMatch(/\.sitl-pcell > \.bx-tip \{ position: static; \}/)
    expect(body).toMatch(/\.sitl-cellbtn::after \{ content: ''; position: absolute; inset: 0; \}/)
  })

  /* V4 §7 F2: the grid's own sentence, not Try's form and not a grey line. */
  it('says what every cell assumes as its own sentence of tokens: from, device, and the rest some rule reads — never who or where to', () => {
    const sentence = out.slice(out.indexOf('aria-label="Sign-in every cell assumes"'), out.indexOf('class="sitl-body"'))
    expect(sentence).toContain('class="tsent is-line"')
    /* No rule on the showcase reads the time, so no "at" token; the
       corporate-devices policy reads a risk score, so "with risk". */
    expect(text(sentence.slice(sentence.indexOf('>') + 1))).toMatch(/^Everyone signs in from Office network on Windows 11 laptop · registered with risk 12 </)
    expect(sentence).toContain('id="sit-people-address"')
    expect(sentence).toContain('id="sit-people-device"')
    expect(sentence).not.toContain('is-person')
    expect(sentence).not.toContain('is-app')
    expect(sentence).toContain('aria-label="About these answers"')
    expect(out).not.toContain('sitl-rest')
  })

  it('answers on a stated device instead of a wall of Can’t tell', () => {
    const cells = [...out.matchAll(/<td class="sitl-pcell"><span class="bx-tip">([\s\S]*?)<\/span><\/td>/g)].map((m) => m[1])
    expect(cells.length).toBeGreaterThan(0)
    const unknown = cells.filter((c) => c.includes('bx-canttell')).length
    expect(unknown / cells.length).toBeLessThan(0.1)
  })
})

describe('Runs', () => {
  const out = draw(<RunsReport onTry={noop} now={NOW} />)

  it('lists the live run first, then the fixture’s week, newest first', () => {
    const titles = [...out.matchAll(/class="sitl-runitem__title">([^<]*)</g)].map((m) => m[1])
    expect(titles[0]).toBe('All saved sign-ins')
    /* The fixture's newest is the Global Default's baseline edit (30 Sep 2026),
       an hour before the HRMS save. */
    expect(titles[1]).toBe('Editing Global Default Policy')
    expect(titles[2]).toBe('Saving HRMS access from corporate offices')
    expect(titles).toHaveLength(9)
    const metas = [...out.matchAll(/class="sitl-runitem__meta">([^<]*)</g)].map((m) => text(m[1]))
    expect(metas.slice(0, 3)).toEqual(['As the tenant stands · Now', 'Jaspreet Toor · 1 h ago', 'Jaspreet Toor · 2 h ago'])
  })

  it('opens on the live run: Expected → Now, the not-as-expected tile pressed, no Sample badge', () => {
    expect(out).toMatch(/aria-current="true"[^>]*><span class="sitl-runitem__title">All saved sign-ins</)
    expect(out).toMatch(/aria-pressed="true"><span class="sitl-tile__n">2<\/span><span class="sitl-tile__label">Not as expected</)
    expect(text(out)).toContain('Expected Now Level')
    expect(text(out)).not.toContain('Sample')
    expect(out).toContain('aria-label="Kavya Menon in the office: Expected Allow with 2FA, Now Allow on 1 factor. Try this sign-in"')
  })

  /* tables-check T6: colour means verdict — a sample run's change is not one. */
  it('draws the changed share in the notice tone on the live run only', () => {
    const bars = [...out.matchAll(/<span class="(sitl-runbar[^"]*)" aria-hidden="true">/g)].map((m) => m[1])
    expect(bars[0]).toBe('sitl-runbar is-live')
    expect(bars.slice(1).every((b) => b === 'sitl-runbar')).toBe(true)
    const body = css.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(body).toMatch(/\.sitl-runbar__seg\.is-changed \{ background: var\(--text-tertiary\); \}/)
    expect(body).toMatch(/\.sitl-runbar\.is-live \.sitl-runbar__seg\.is-changed \{ background: var\(--fb-notice-dot\); \}/)
  })

  it('describes each run row by its sentence, the whole sign-in in the line’s tip', () => {
    const row = out.match(/<button type="button" class="sitl-rungrid sitl-runrow"[\s\S]*?<\/button>/)![0]
    const described = /aria-describedby="([^"]+)"/.exec(row)?.[1]
    expect(described).toBeTruthy()
    expect(row).toContain(`<span class="bx-tip"><span id="${described}" class="sitl-line">`)
  })

  it('says each number once: on its tile, never on the list items or tabs', () => {
    const items = [...out.matchAll(/<button type="button" class="sitl-runitem"[\s\S]*?<\/button>/g)].map((m) => text(m[0]))
    for (const i of items) expect(i.replace(/\d+ (h|min|days) ago/, '')).not.toMatch(/\d/)
  })
})

describe('the source and the stylesheet', () => {
  const sources = { savedSrc, peopleSrc, runsSrc, libSrc, runsModelSrc, fixtureSrc }

  it('uses the house words: no AI, assistant, login, gauntlet, blast radius or rehearse', () => {
    for (const [name, src] of Object.entries(sources)) {
      const strings = [...src.matchAll(/'([^'\n]*)'|`([^`]*)`|>([^<>{}\n]+)</g)].map((m) => m[1] ?? m[2] ?? m[3])
      expect(strings.filter((x) => /\bAI\b|assistant|\blog ?in\b|gauntlet|blast radius|rehearse/i.test(x)), name).toEqual([])
    }
  })

  it('imports no Sparkles or Wand', () => {
    for (const src of Object.values(sources)) expect(src).not.toMatch(/\b(Sparkles|Wand2?)\b/)
  })

  it('reads the clock only in the component, never in the pure code', () => {
    for (const src of [libSrc, runsModelSrc, fixtureSrc]) {
      expect(src).not.toMatch(/Date\.now\(|new Date\(\)/)
    }
  })

  it('colours only through tokens', () => {
    const body = css.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(body).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(body).not.toMatch(/rgba?\(|hsla?\(/)
  })

  it('never puts a transform or a transition on anything motion animates', () => {
    const body = css.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(body).not.toMatch(/transform\s*:/)
    for (const sel of ['.sitl-row', '.sitl-settle', '.sitl-cell', '.sitl-table tbody tr', '.sitl-runrows li']) {
      const rules = [...body.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => m[1].includes(sel))
      for (const r of rules) expect(r[2], sel).not.toMatch(/transition\s*:/)
    }
  })

  /* V4 review P1: an auto margin after the rows is read by the paged-list
     hook as space the pager takes, so the page size only ever shrank. */
  it('never pushes the pager down with an auto margin: the body grows instead', () => {
    const body = css.replace(/\/\*[\s\S]*?\*\//g, '')
    const pager = [...body.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => m[1].includes('.blist__pager'))
    for (const r of pager) expect(r[2]).not.toMatch(/margin(-top)?\s*:\s*auto/)
    expect(body).toMatch(/\.sitl-body\s*\{[^}]*flex:\s*1 1 auto/)
  })

  /* tables-check T9, T10: one bottom edge with Try, and never a page scroll. */
  it('ends the page where Try ends it, and never lets the tabs push the page into a scroll', () => {
    const body = css.replace(/\/\*[\s\S]*?\*\//g, '')
    const page = /\.bpage:has\(> \.sitl\),\s*\.bpage:has\(> \[role='tabpanel'\] > \.sitl\) \{([^}]*)\}/.exec(body)?.[1] ?? ''
    expect(page).toMatch(/padding-bottom:\s*var\(--space-8\)/)
    expect(body).toMatch(/\.bshell__main > \.bpage:has\(\.sitl\) \{ flex: 1 1 0; min-height: 0; \}/)
    const runs = /\.sitl\.sitl-runs \{([^}]*)\}/.exec(body)?.[1] ?? ''
    expect(runs).toMatch(/min-height:\s*0/)
    expect(runs).not.toMatch(/min-height:\s*[1-9]/)
    for (const src of [savedSrc, peopleSrc]) expect(src).toContain('minRows: LIBRARY_MIN_ROWS')
  })

  it('turns every animation off under reduced motion', () => {
    const body = css.replace(/\/\*[\s\S]*?\*\//g, '')
    const animated = [...body.matchAll(/([^{}]+)\{[^{}]*animation\s*:\s*(?!none)[^;]+;/g)].map((m) => m[1].trim())
    const reduced = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(body)?.[1] ?? ''
    for (const sel of animated) expect(reduced, sel).toContain(sel)
  })
})
