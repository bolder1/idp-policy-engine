import { describe, expect, it } from 'vitest'

import { CANVAS_OPTIONS } from './phase'
import { DARK_ONLY, DEDICATED, DEFAULT_FAVOURITES, FIRST_LAYOUT, JARVIS, JARVIS_VERSIONS, OWN_EDIT, RUN_LAYOUTS, RUN_LAYOUT_KEY, STAGED_LAYOUTS, isJarvis, layoutsOn, parseRunLayout, shelfOf } from './run-layout'
import { REASONING } from './canvas-reasoning'
import hostSrc from './TryJourney.tsx?raw'
import pageSrc from '../SignInTests.tsx?raw'
import switchSrc from './CanvasSwitch.tsx?raw'

/* The run's layouts, compared side by side (owner, 1–2 Oct 2026): one plan,
   many ways to draw it, chosen on the page's bar and remembered in this
   browser. As it stands on 2 Oct: two shelves — his Favourites and the
   Archive — as two dropdowns; Focus, Brief and Jarvis dedicated views, each
   its own button; Jarvis only ever dark; Tour a Guided tour to come. */
describe('the run’s layouts (run-layout.ts)', () => {
  it('are Classic first, then every layout still on the switch; Pipeline, Sheet, Board, Lanes, Story, X-ray, Multiverse, Glass and Tour are gone', () => {
    expect(RUN_LAYOUTS.map((l) => l.value)).toEqual(['column', 'line', 'tree', 'gates', 'marble', 'chat', 'deck', 'depth', 'jarvis', 'jarvis2', 'mission', 'synapse', 'pulse', 'focus', 'brief', 'circuit', 'stream', 'bento', 'directions', 'explainer', 'pass'])
    expect(RUN_LAYOUTS[0].label).toBe('Classic')
    expect(FIRST_LAYOUT).toBe('tree')
    expect(RUN_LAYOUT_KEY).toBe('idp.check-canvas')
  })

  it('read back only what the switch holds; a layout that went is the first', () => {
    for (const l of RUN_LAYOUTS) expect(parseRunLayout(l.value)).toBe(l.value)
    for (const junk of [null, '', 'Line', 'grid', 'pipeline', 'sheet', 'lanes', 'board', 'story', 'xray', 'multiverse', 'glass', 'tour']) expect(parseRunLayout(junk)).toBe('tree')
  })

  /* "Give me 2 filters, one with my favourites and one with an archive"; "Brief and Focus can be two dedicated views"; Jarvis "one personal favourite". */
  it('sit on two shelves — his favourites and the archive — with Focus, Brief and Jarvis on neither', () => {
    expect(DEDICATED).toEqual(['focus', 'brief', 'jarvis', 'jarvis2'])
    expect(DEFAULT_FAVOURITES).toEqual(['tree', 'depth', 'directions'])
    expect(layoutsOn('favourites', DEFAULT_FAVOURITES).map((l) => l.value)).toEqual(['tree', 'depth', 'directions'])
    expect(layoutsOn('archive', DEFAULT_FAVOURITES).map((l) => l.value)).toEqual(['column', 'line', 'gates', 'marble', 'chat', 'deck', 'mission', 'synapse', 'pulse', 'circuit', 'stream', 'bento', 'explainer', 'pass'])
    for (const id of DEDICATED) expect(shelfOf(id, DEFAULT_FAVOURITES)).toBeNull()
    expect(shelfOf('line', DEFAULT_FAVOURITES)).toBe('archive')
  })

  it('Jarvis is only ever dark, and the Configure panel follows a layout’s dark stage', () => {
    expect(JARVIS).toBe('jarvis')
    expect(DARK_ONLY).toEqual(['jarvis', 'jarvis2'])
    expect(STAGED_LAYOUTS).toContain('jarvis')
    /* Two Jarvis (2 Oct): the first kept, the Reactor as v2 — one button, a version switch beside it while on. */
    expect(JARVIS_VERSIONS).toEqual(['jarvis', 'jarvis2'])
    expect(isJarvis('jarvis2')).toBe(true)
    expect(isJarvis('tree')).toBe(false)
    expect(pageSrc).toContain('{onJarvis && !jarvisPhase && <JarvisVersion value={layout === JARVIS2 ? JARVIS2 : JARVIS} onChange={pickJarvisVersion} />}')
    expect(hostSrc).toContain("jarvis2: lazy(() => import('./layouts/Jarvis2Layout')),")
    expect(pageSrc).toContain("DARK_ONLY.includes(layout) || (STAGED_LAYOUTS.includes(layout) && checkStage === 'dark') ? 'dark' : 'light'")
    expect(pageSrc).toContain('data-stage={panelStage}')
  })

  it('puts the run line’s pencil only where a layout has no pencil of its own (2 Oct)', () => {
    expect(OWN_EDIT).toEqual(['column', 'brief', 'directions', 'explainer'])
    expect(hostSrc).toContain('edit={onEdit ? { onPress: OWN_EDIT.includes(layout) ? undefined : onEdit, open: editing, unrun } : undefined}')
  })

  it('is two dropdowns, the console’s filter dropdowns — Show and Canvas — and a review control with its own flag', () => {
    expect(CANVAS_OPTIONS).toBe(true)
    expect(switchSrc).toContain('prefix="Show"')
    expect(switchSrc).toContain('prefix="Canvas"')
    expect(pageSrc).toContain('const [layout, setLayout] = useRunLayout()')
    expect(pageSrc).toContain('<CanvasSwitch value={layout} onChange={setLayout} favourites={favourites} />')
    expect(pageSrc).toContain('<DedicatedViews value={layout} onChange={setLayout} />')
    expect(pageSrc).toContain('<JarvisButton on={onJarvis} onPress={toggleJarvis} busy={jarvisPhase !== null} />')
    expect(pageSrc).toContain('<GuidedTourSoon />')
  })

  it('every layout has its reasoning, the good and the bad', () => {
    for (const l of RUN_LAYOUTS) {
      const r = REASONING[l.value]
      expect(r, l.value).toBeTruthy()
      expect(r!.good.length, l.value).toBeGreaterThan(0)
      expect(r!.bad.length, l.value).toBeGreaterThan(0)
    }
  })

  it('load only once chosen: each layout is its own lazy module, the column the host’s own', () => {
    for (const id of ['Line', 'Tree', 'Gates', 'Marble', 'Chat', 'Deck', 'Depth', 'Jarvis', 'Mission', 'Synapse', 'Pulse', 'Focus', 'Brief', 'Circuit', 'Stream', 'Bento', 'Directions', 'Explainer', 'Pass'])
      expect(hostSrc).toContain(`lazy(() => import('./layouts/${id}Layout'))`)
    expect(hostSrc).toContain('<Suspense fallback={null}>')
    for (const gone of ['Xray', 'Multiverse', 'Glass', 'Tour']) expect(hostSrc).not.toContain(`./layouts/${gone}Layout`)
    expect(hostSrc).toContain('if (!el || !journey || !asColumn) return')
  })
})
