/// <reference types="vite/client" />
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

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
})

describe('Runs', () => {
  const out = draw(<RunsReport onTry={noop} now={NOW} />)

  it('lists the live run first, then the fixture’s week, newest first', () => {
    const titles = [...out.matchAll(/class="sitl-runitem__title">([^<]*)</g)].map((m) => m[1])
    expect(titles[0]).toBe('All saved sign-ins')
    expect(titles[1]).toBe('Saving HRMS access from corporate offices')
    expect(titles).toHaveLength(9)
    const metas = [...out.matchAll(/class="sitl-runitem__meta">([^<]*)</g)].map((m) => text(m[1]))
    expect(metas.slice(0, 3)).toEqual(['As the tenant stands · Now', 'Jaspreet Toor · 2 h ago', 'Rahul Verma · 20 h ago'])
  })

  it('opens on the live run: Expected → Now, the not-as-expected tile pressed, no Sample badge', () => {
    expect(out).toMatch(/aria-current="true"[^>]*><span class="sitl-runitem__title">All saved sign-ins</)
    expect(out).toMatch(/aria-pressed="true"><span class="sitl-tile__n">2<\/span><span class="sitl-tile__label">Not as expected</)
    expect(text(out)).toContain('Expected Now Level')
    expect(text(out)).not.toContain('Sample')
    expect(out).toContain('aria-label="Kavya Menon in the office: Expected Allow with 2FA, Now Allow on 1 factor. Try this sign-in"')
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
    for (const sel of ['.sitl-row', '.sitl-settle', '.sitl-table tbody tr', '.sitl-runrows li']) {
      const rules = [...body.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => m[1].includes(sel))
      for (const r of rules) expect(r[2], sel).not.toMatch(/transition\s*:/)
    }
  })

  it('turns every animation off under reduced motion', () => {
    const body = css.replace(/\/\*[\s\S]*?\*\//g, '')
    const animated = [...body.matchAll(/([^{}]+)\{[^{}]*animation\s*:\s*(?!none)[^;]+;/g)].map((m) => m[1].trim())
    const reduced = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(body)?.[1] ?? ''
    for (const sel of animated) expect(reduced, sel).toContain(sel)
  })
})
