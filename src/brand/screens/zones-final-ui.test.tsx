/// <reference types="vite/client" />
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { emptyLocation, type Zone } from '../data'
import { showcaseZones } from '../showcase-seed'
import { BrandProvider } from '../store'
import { PlaceSection, SearchRange, ZoneDetail } from './ZonesFinal'
import zonesSrc from './ZonesFinal.tsx?raw'
import { NoteStyleSwitch, ZoneNote } from './zone-notes'
import { NET_EXAMPLES, NOTE_STYLES, PLACE_EXAMPLES, PLACE_FACTS, parseNoteStyle, type NoteStyle } from './zone-notes-model'
import zonesCss from './zones-final.css?raw'

/* The zone page, drawn without a browser, after the owner's asks of 1 Oct 2026:
   no summary line under the name; each IP row says its kind; Locations has a
   "My current location" Quick add; the side note comes in versions behind one
   switch — Classic, the note as it was, and three paper notes that never show
   the zone's own places (the second ask that day: "I only like the sticky
   note, so have the old one as a classic … give me some more good options
   like the sticky note"; and on 2 Oct 2026, "Remove Note pile, Index card");
   and the row being searched on Locations shows its Range, disabled, rather
   than an empty gap. The browser pass checks the arrivals, the paper, the
   layout and that the disabled Range takes no focus.

   `useReducedMotion` is the one thing mocked, so each paper note can be drawn
   both ways. */

const motionPrefs = vi.hoisted(() => ({ reduce: false }))
vi.mock('motion/react', async (importOriginal) => {
  const real = await importOriginal<typeof import('motion/react')>()
  return { ...real, useReducedMotion: () => motionPrefs.reduce }
})

const OFFICES = showcaseZones.find((z) => z.id === 'corp-offices')!
const noop = () => {}
const html = (node: ReactNode) => renderToStaticMarkup(<BrandProvider>{node}</BrandProvider>)
const text = (s: string) =>
  s.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
const page = (zone: Zone = OFFICES, isNew = false) =>
  html(<ZoneDetail zone={zone} isNew={isNew} otherNames={[]} onBack={noop} onSave={noop} onRename={isNew ? undefined : noop} />)

/* The zone's own places, and India's own states: what the old note showed, and
   what made it read as the admin's entries. */
const OWN = ['Bengaluru', 'Mumbai', 'Pune', 'Maharashtra', 'Karnataka', 'India']

describe('the zone page head', () => {
  const out = page()
  const head = /<header class="bz7__pagehead">([\s\S]*?)<\/header>/.exec(out)?.[1] ?? ''

  it('is the name alone — the summary line under it is gone', () => {
    expect(text(head)).toContain('Corporate offices')
    expect(text(head)).not.toMatch(/networks? ·|Bengaluru|Within 25 km of Pune|Any location/)
    expect(head).not.toMatch(/<p>/)
  })

  it('carries the Note style switch with its four versions, in the preview slot', () => {
    expect(head).toContain('class="bpage__preview"')
    expect(text(head)).toContain('Note style Classic Sticky note Clipboard Pointer')
    expect(head.match(/aria-pressed="(true|false)"/g)).toHaveLength(4)
  })
})

describe('the IP rows say their kind', () => {
  it('tags each stored entry with its kind, inside the field', () => {
    const out = page()
    expect(out.match(/class="bz7__placekind bz7__netkind"[^>]*>IPv4 network</g)).toHaveLength(2)
    /* The field points at its tag. */
    expect(out).toMatch(/class="bz7__rowin"[^>]*aria-describedby="bz7-net-kind-\d+"/)
  })

  it('names every kind the field accepts, and nothing for an empty zone', () => {
    const z: Zone = { ...OFFICES, ip: ['10.0.0.1', '10.0.0.0/8', '10.0.0.1-10.0.0.9', '2001:db8::1', '2001:db8::/32'], asn: ['AS64500'], location: emptyLocation() }
    const kinds = [...page(z).matchAll(/bz7__netkind"[^>]*>([^<]+)</g)].map((m) => m[1])
    expect(kinds).toEqual(['IPv4', 'IPv4 network', 'IPv4 range', 'IPv6', 'IPv6 network', 'ASN'])
    expect(page({ ...OFFICES, ip: [], asn: [] })).not.toContain('bz7__netkind')
  })

  it('pads the field by more than the widest kind, so a tag never covers what is typed', () => {
    expect(zonesCss).toMatch(/\.bz7__netkind \{[^}]*pointer-events: none;/)
    /* Whenever it holds anything, by a selector the browser resolves as it
       inserts — not a class the render adds after, which left a pasted value's
       end and its caret scrolled out of view. Only the empty row's examples
       get the full width. */
    expect(zonesCss).toMatch(/\.bz7__inwrap > \.bz7__rowin:not\(:placeholder-shown\) \{ padding-right: 96px; \}/)
    expect(zonesCss).not.toMatch(/has-kind \{/)
    expect(page()).not.toContain('has-kind')
  })
})

describe('Locations: My current location', () => {
  const section = (location: Zone['location']) => html(<PlaceSection draft={{ ...OFFICES, location }} onChange={noop} />)
  const chip = (out: string) => /<button[^>]*class="bz7__quickbtn[^"]*"[^>]*>[\s\S]*?<\/button>/.exec(out)?.[0] ?? ''

  it('offers the city this session is in, on an empty zone too', () => {
    const c = chip(section(emptyLocation()))
    expect(text(c)).toBe('My current location Pune')
    expect(c).not.toContain('disabled')
    expect(c).not.toContain('is-in')
  })

  it('says it is in already — Pune with a distance is still Pune', () => {
    const c = chip(section(OFFICES.location))
    expect(c).toContain('is-in')
    expect(c).toContain('disabled=""')
    expect(c).toContain('title="Already in this zone"')
  })

  it('says what covers it when a wider place is in the zone', () => {
    const c = chip(section({ ...emptyLocation(), countries: ['India'] }))
    expect(text(c)).toBe('My current location Pune, in India')
    expect(c).toContain('disabled=""')
    expect(c).toContain('title="Covered by India"')
  })
})

/* The stylesheet without its comments, which name what went. */
const cssRules = zonesCss.replace(/\/\*[\s\S]*?\*\//g, '')
const PAPER: NoteStyle[] = ['sticky', 'clip', 'pointer']
const NEW = ['Japan', 'California', 'Toronto', 'Within 50 km of Berlin']
const note = (half: 'net' | 'place', style: NoteStyle, rollOut = false) =>
  html(<ZoneNote half={half} style={style} rollOut={rollOut} />)

describe('the Note style switch', () => {
  it('offers Classic, the sticky note, the clipboard and the pointer, in that order, Classic first', () => {
    expect(NOTE_STYLES.map((s) => s.label)).toEqual(['Classic', 'Sticky note', 'Clipboard', 'Pointer'])
    expect(NOTE_STYLES.map((s) => s.value)).toEqual(['classic', ...PAPER])
  })

  it('keeps a stored sticky note, and puts the withdrawn versions, and anything else, on Classic', () => {
    expect(parseNoteStyle('sticky')).toBe('sticky')
    expect(parseNoteStyle('clip')).toBe('clip')
    expect(parseNoteStyle('pointer')).toBe('pointer')
    /* Withdrawn on 1 Oct 2026, then 2 Oct 2026, then never a version at all. */
    for (const gone of ['colours', 'rows', 'tip', 'pile', 'card', 'nonsense', '', null, undefined])
      expect(parseNoteStyle(gone)).toBe('classic')
  })

  it('draws one pressed segment among four, and it is Classic', () => {
    const out = html(<NoteStyleSwitch />)
    expect(out.match(/aria-pressed="(true|false)"/g)).toHaveLength(4)
    expect(out.match(/aria-pressed="true"/g)).toHaveLength(1)
    expect(out).toMatch(/aria-pressed="true"[^>]*>Classic</)
    expect(out).toContain('aria-label="Note style"')
  })
})

describe('Classic: the note as it was', () => {
  it('is the page’s note until another is picked', () => {
    expect(page()).toContain('<div class="bz7__side"><h3 class="bz7__sidehead">')
    expect(text(page())).toContain('What you can add')
  })

  it('keeps the original card, heading and Locations examples in monospace, with both facts', () => {
    const out = note('place', 'classic')
    expect(out).toMatch(/^<div class="bz7__side"><h3 class="bz7__sidehead"><svg[^>]*aria-hidden="true"/)
    expect(text(out)).toMatch(/^What you can add India A country Maharashtra A state or region Pune A city Within 25 km of Pune A city with a range/)
    expect(out).toContain('<li><code>Within 25 km of Pune</code><em>A city with a range</em></li>')
    expect(out.match(/<p class="bz7__sidep">/g)).toHaveLength(2)
    expect(text(out)).toContain('A country covers its states and cities, and a state covers its cities. The narrower ones stay in the list, marked as covered.')
    expect(text(out)).toContain("Matched on the sign-in's IP address. A VPN shows where it exits.")
  })

  it('keeps the IP tab’s original note, with no facts under it', () => {
    const out = note('net', 'classic')
    expect([...out.matchAll(/<code>([^<]+)<\/code><em>([^<]+)<\/em>/g)].map((m) => `${m[1]} / ${m[2]}`)).toEqual([
      '10.0.0.1 / An IPv4 or IPv6 address',
      '192.168.0.0/24 / A CIDR block',
      '192.168.0.1-192.168.0.254 / An IPv4 range',
      'AS15169 / An ASN',
    ])
    expect(out).not.toContain('bz7__sidep')
  })

  it('keeps the card and its monospace in the stylesheet', () => {
    expect(zonesCss).toMatch(
      /\.bz7__side \{[^}]*background: var\(--surface-raised\);[^}]*border: var\(--bw-thin\) solid var\(--border-subtle\);[^}]*border-radius: var\(--radius-lg\);/,
    )
    expect(zonesCss).toMatch(/\.bz7__sidelist code \{\s*font-family: var\(--font-mono\); font-size: var\(--fs-xs\);/)
  })
})

describe('the paper notes', () => {
  it('each heads its note "Examples", as a heading', () => {
    for (const s of PAPER)
      for (const half of ['net', 'place'] as const) expect(note(half, s)).toMatch(/<h3 class="bz7n-[a-z]+__(head|label)">Examples<\/h3>/)
  })

  it('show the same new places in every version, and never the zone’s own, nor in monospace', () => {
    expect(PLACE_EXAMPLES.map((e) => e.text)).toEqual(NEW)
    for (const s of PAPER) {
      const out = note('place', s)
      for (const p of NEW) expect(text(out)).toContain(p)
      for (const own of OWN) expect(text(out)).not.toContain(own)
      expect(out).not.toMatch(/<code>/)
      expect(out.match(/<li\b/g)).toHaveLength(4)
    }
  })

  it('carry the two facts on Locations, and none on IP networks', () => {
    for (const s of PAPER) {
      for (const f of PLACE_FACTS) expect(text(note('place', s))).toContain(f)
      for (const f of PLACE_FACTS) expect(text(note('net', s))).not.toContain(f)
    }
  })

  it('give the IP tab its own four, each with its kind in the row tags’ words', () => {
    for (const s of PAPER) {
      /* Less the screen reader's comma: the example, then its kind. */
      const out = text(note('net', s)).replace(/ , /g, ' ')
      for (const e of NET_EXAMPLES) expect(out).toContain(`${e.text} ${e.gloss}`)
      expect(out).not.toMatch(/CIDR|\bAddress\b|\bRange\b/)
    }
  })

  it('read "Japan, a country" to a screen reader, the sticky note too', () => {
    for (const s of PAPER.filter((v) => v !== 'sticky'))
      expect(note('place', s)).toMatch(/<strong>Japan<\/strong><span class="u-sr-only">, <\/span><span class="bz7n-[a-z]+__gloss">a country<\/span>/)
    /* It read "Japana country" (browser pass, 2 Oct 2026). */
    expect(note('place', 'sticky')).toContain('<strong>Japan</strong><span class="u-sr-only">, </span><span>a country</span>')
  })

  it('hang the clipboard’s clip as drawing, hidden from assistive tech, over a sheet', () => {
    const out = note('place', 'clip')
    expect(out).toMatch(
      /^<div class="bz7n-clip"[^>]*><span class="bz7n-clip__clip" aria-hidden="true"[^>]*><\/span><div class="bz7n-clip__sheet"><h3 class="bz7n-clip__head">Examples<\/h3><ul class="bz7n-clip__list">/,
    )
    /* The rule and the two facts on Locations; on IP networks, neither. */
    expect(out).toMatch(/<\/ul><div class="bz7n-clip__facts"><p>/)
    expect(/<div class="bz7n-clip__facts">([\s\S]*?)<\/div>/.exec(out)?.[1].match(/<p>/g)).toHaveLength(2)
    expect(note('net', 'clip')).not.toContain('bz7n-clip__facts')
    expect(cssRules).toMatch(/\.bz7n-clip__facts \{[^}]*border-top: var\(--bw-thin\) solid var\(--border-subtle\);/)
  })

  it('point the pointer’s notch from its own paper, and rule off the facts', () => {
    const out = note('place', 'pointer')
    expect(out).toMatch(/^<div class="bz7n-point"[^>]*><h3 class="bz7n-point__head">Examples<\/h3><ul class="bz7n-point__list">/)
    expect(out).toMatch(/<\/ul><div class="bz7n-point__facts"><p>/)
    expect(note('net', 'pointer')).not.toContain('bz7n-point__facts')
    expect(cssRules).toMatch(/\.bz7n-point::before \{[^}]*background: inherit;[^}]*clip-path: polygon\(100% 0, 0 50%, 100% 100%\);/)
    /* Where the aside drops below the list, the notch is on the top edge. */
    expect(cssRules).toMatch(/@media \(max-width: 1120px\) \{[^@]*\.bz7n-point::before \{[^}]*clip-path: polygon\(0 100%, 50% 0, 100% 100%\);/)
    expect(cssRules).toMatch(
      /\.bz7n-point__facts \{[^}]*border-top: var\(--bw-thin\) solid color-mix\(in srgb, var\(--tint-teal-fg\) 22%, transparent\);/,
    )
  })

  it('never tilt the clipboard or the pointer', () => {
    for (const s of ['clip', 'pointer'] as const) expect(note('place', s)).not.toMatch(/rotate/)
  })

  it('keep the sticky note as it was built, its label a heading now', () => {
    const out = note('place', 'sticky')
    expect(out).toContain('<span class="bz7n-sticky__tape" aria-hidden="true"></span><h3 class="bz7n-sticky__label">Examples</h3>')
    /* The same two visible parts; the comma between them is for a screen reader only. */
    expect(out.replace(/<span class="u-sr-only">, <\/span>/g, '')).toContain('<li><strong>Japan</strong><span>a country</span></li>')
    expect(out.match(/<p class="bz7n-sticky__fact">/g)).toHaveLength(2)
  })
})

describe('the paper notes and motion', () => {
  /* What a first showing draws before motion runs, per version. */
  const FIRST: Record<string, RegExp> = {
    sticky: /clip-path:inset\(-12% -6% 100% -6%\)/,
    clip: /class="bz7n-clip" style="opacity:0;transform:translateY\(-10px\)"/,
    pointer: /class="bz7n-point" style="opacity:0;transform:translateX\(-6px\) scale\(0\.92\)"/,
  }

  it('arrive with motion on a first showing', () => {
    motionPrefs.reduce = false
    for (const s of PAPER) expect(note('place', s, true)).toMatch(FIRST[s])
  })

  it('are drawn in their final state, still, under reduced motion and on a second showing', () => {
    for (const reduce of [true, false]) {
      motionPrefs.reduce = reduce
      for (const s of PAPER) {
        /* Reduced motion on a first showing; full motion on a second one. */
        const out = note('place', s, reduce)
        expect(out).not.toMatch(FIRST[s])
        expect(out).not.toContain('opacity:0')
      }
    }
    motionPrefs.reduce = false
    const still = (s: NoteStyle) => note('place', s)
    expect(still('sticky')).toMatch(/clip-path:inset\(-12% -6% -12% -6%\)/)
    expect(still('sticky')).toMatch(/transform:rotate\(-1deg\)/)
    expect(still('clip')).toMatch(/class="bz7n-clip" style="opacity:1;transform:none"/)
    expect(still('pointer')).toMatch(/class="bz7n-point" style="opacity:1;transform:none"/)
  })

  it('arrive once per tab and version on the page, not on every switch back', () => {
    expect(zonesSrc).toContain('const noteKey = `${tab}-${noteStyle}`')
    expect(zonesSrc).toContain('rollOut={!rolled.current.has(noteKey)}')
    expect(zonesSrc).toContain('onRolled={() => rolled.current.add(noteKey)}')
  })

  it('leave every motion element to motion: no stylesheet transform, transition or rotate on any of them', () => {
    /* Every rule whose subject is the element itself, in or out of a media
       query — not its children, and not its ::before. `transform-origin` is
       allowed: motion reads it and never writes it. */
    const MOVED = ['bz7n-sticky', 'bz7n-clip', 'bz7n-clip__clip', 'bz7n-point']
    const rules = [...cssRules.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }))
    for (const cls of MOVED) {
      const own = rules.filter((r) =>
        r.sel.split(',').some((one) => {
          const last = one.trim().split(/\s+|>|\+|~/).pop() ?? ''
          return new RegExp(`^\\.${cls}(?![\\w-])`).test(last) && !last.includes('::')
        }),
      )
      expect(own.length, cls).toBeGreaterThan(0)
      for (const r of own) expect(r.body, `${cls}: ${r.sel}`).not.toMatch(/\btransform\s*:|transition|rotate|\b(scale|translate)\s*:/)
    }
    /* Centred decoration is centred by auto margins, never a translate. */
    expect(zonesCss).toMatch(/\.bz7n-clip__clip \{[^}]*left: 0; right: 0; margin-inline: auto;/)
    expect(zonesCss).not.toMatch(/translateX\(-50%\)/)
  })
})

describe('the note styles use tokens only', () => {
  const at = zonesCss.indexOf('/* --- The side note, four ways')
  /* The rules, not the comments that say what went and what they were. */
  const notes = zonesCss.slice(at).replace(/\/\*[\s\S]*?\*\//g, '')

  it('has no colour literal in the note versions', () => {
    expect(at).toBeGreaterThan(0)
    expect(notes).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i)
  })

  it('has no dashed or dotted edge, the sticky note’s rule under its list included', () => {
    expect(notes).not.toMatch(/\b(dashed|dotted)\b/)
    expect(notes).toMatch(/\.bz7n-sticky__fact \{[^}]*border-top: var\(--bw-thin\) solid /)
  })

  it('cuts the sticky note from the one paper, declared once', () => {
    expect(notes.match(/--bz7n-paper:/g)).toHaveLength(1)
    expect(notes).toMatch(/--bz7n-paper: color-mix\(in srgb, var\(--fb-notice-bg\) 60%, var\(--tint-amber-bg\)\);/)
    expect(notes).toMatch(/\.bz7n-sticky \{[^}]*background: var\(--bz7n-paper\);/)
  })

  it('never sets the faintest ink on tinted paper', () => {
    expect(notes).not.toContain('--text-tertiary')
  })

  it('has dropped the withdrawn versions’ styles', () => {
    expect(cssRules).not.toMatch(/\.bz7n-(kind|legend|eg|ghost|tip|pile|card)\b/)
  })
})

describe('Locations: the row being searched keeps a Range', () => {
  it('is the place rows’ control, disabled at 0 km, never an empty gap', () => {
    const out = html(<SearchRange />)
    expect(out).toMatch(/^<fieldset class="bz7__rangecol" disabled="" title="Choose a place first">/)
    expect(out).toMatch(/<input class="bz7__rangenum"[^>]*aria-label="Range"[^>]*value="0"/)
    expect(out).toMatch(/aria-label="Range unit"[^>]*class="bx-picker__trigger[^>]*><span class="bx-picker__value">km</)
    expect(zonesCss).toMatch(/\.bz7__rangecol:disabled \{ opacity: var\(--disabled-opacity\); background: var\(--surface-sunken\); \}/)
  })

  it('lets a click through to the box, which holds it, so the search stays open', () => {
    /* A disabled control gets no mousedown at all in Chrome, and focus leaves
       the search for the page; the fieldset only can hold the mousedown if
       the pointer lands on it (browser pass, 2 Oct 2026). */
    expect(cssRules).toMatch(/\.bz7__rangecol:disabled > \* \{ pointer-events: none; \}/)
    expect(zonesSrc).toMatch(/disabled\s+title="Choose a place first"\s+onMouseDown=\{\(e\) => e\.preventDefault\(\)\}/)
  })

  it('is what the searching row draws, with nothing left of the gap', () => {
    expect(zonesSrc).toMatch(/<\/ul>\s*\)\}\s*<\/div>\s*<SearchRange \{\.\.\.searchRangeOf\(c\)\} \/>/)
    expect(zonesSrc).not.toContain('bz7__rangecol is-empty')
    expect(zonesCss).not.toMatch(/rangecol\.is-empty/)
  })

  /* Changing Pune, at 25 km, read "0 km" while the 25 km went on to the city
     picked in its place (browser pass, 2 Oct 2026). */
  it('shows the range a city being changed keeps, still disabled', () => {
    const out = html(<SearchRange km={25} unit="km" />)
    expect(out).toMatch(/^<fieldset class="bz7__rangecol" disabled="" title="Choose a place first">/)
    expect(out).toMatch(/aria-label="Range"[^>]*value="25"/)
    expect(html(<SearchRange km={10} unit="mi" />)).toMatch(/aria-label="Range unit"[^>]*><span class="bx-picker__value">miles</)
    /* What the row is given: a range row's own; 0 km for a new row, a country, a state or a plain city. */
    expect(zonesSrc).toContain(
      "c?.kind === 'range' ? { km: c.range.km, unit: unitOf(c.range) } : { km: 0, unit: 'km' }",
    )
    expect(OFFICES.location.ranges.map((r) => r.km)).toEqual([25])
  })
})
