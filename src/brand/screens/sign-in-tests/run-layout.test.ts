import { describe, expect, it } from 'vitest'

import { CANVAS_OPTIONS } from './phase'
import { ARUNA_ENTRY, CANVAS_PICKER, DARK_ONLY, DEDICATED, DEFAULT_FAVOURITES, FIRST_LAYOUT, JARVIS, MAIN_VIEW, OWN_EDIT, OWN_TOP, RUN_LAYOUTS, RUN_LAYOUT_KEY, STAGED_LAYOUTS, isJarvis, layoutsOn, parseRunLayout, shelfOf, shownLayout } from './run-layout'
import layoutSrc from './run-layout.ts?raw'
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
    expect(RUN_LAYOUTS.map((l) => l.value)).toEqual(['column', 'classic2', 'line', 'tree', 'gates', 'marble', 'chat', 'deck', 'depth', 'jarvis', 'jarvis2', 'mission', 'synapse', 'pulse', 'focus', 'focus2', 'brief', 'circuit', 'stream', 'bento', 'directions', 'explainer', 'pass'])
    expect(RUN_LAYOUTS[0].label).toBe('Classic')
    /* Focus v2 is Focus, v1 archived (owner, 4 Oct 2026: "Move the v1 to archive"). */
    expect(FIRST_LAYOUT).toBe('focus2')
    expect(RUN_LAYOUTS.find((l) => l.value === 'focus2')?.label).toBe('Focus')
    expect(RUN_LAYOUTS.find((l) => l.value === 'focus')?.label).toBe('Focus v1')
    expect(RUN_LAYOUT_KEY).toBe('idp.check-canvas')
  })

  /* Classic v2 (owner, 5 Oct 2026: "double down on the classic mode … give me a fresh approach for classic mode v2 …
     the old should be there"): beside Classic, in Original; it draws its own top (the sign-in card), and Focus stays
     the main view. */
  it('has Classic v2 right after Classic, in Original, drawing its own top — not the default', () => {
    expect(RUN_LAYOUTS.slice(0, 2)).toEqual([
      { value: 'column', label: 'Classic', group: 'Original' },
      { value: 'classic2', label: 'Classic v2', group: 'Original' },
    ])
    expect(OWN_TOP).toContain('classic2')
    expect(OWN_TOP).not.toContain('column')
    expect(FIRST_LAYOUT).not.toBe('classic2')
    expect(DEDICATED).not.toContain('classic2')
    expect(parseRunLayout('classic2')).toBe('classic2')
    expect(hostSrc).toContain("classic2: lazy(() => import('./layouts/ClassicV2Layout')),")
  })

  it('read back only what the switch holds; a layout that went is the first', () => {
    for (const l of RUN_LAYOUTS) expect(parseRunLayout(l.value)).toBe(l.value)
    for (const junk of [null, '', 'Line', 'grid', 'pipeline', 'sheet', 'lanes', 'board', 'story', 'xray', 'multiverse', 'glass', 'tour', 'blend']) expect(parseRunLayout(junk)).toBe('focus2')
  })

  /* "Give me 2 filters, one with my favourites and one with an archive"; "Brief and Focus can be two dedicated views"; Jarvis "one personal favourite". */
  it('sit on two shelves — his favourites and the archive — with Focus, Brief and Jarvis on neither', () => {
    expect(DEDICATED).toEqual(['focus2', 'jarvis'])
    expect(DEFAULT_FAVOURITES).toEqual(['tree', 'depth', 'directions'])
    expect(layoutsOn('favourites', DEFAULT_FAVOURITES).map((l) => l.value)).toEqual(['focus2', 'tree', 'depth', 'directions'])
    expect(layoutsOn('archive', DEFAULT_FAVOURITES).map((l) => l.value)).toEqual(['focus2', 'column', 'classic2', 'line', 'gates', 'marble', 'chat', 'deck', 'jarvis2', 'mission', 'synapse', 'pulse', 'focus', 'brief', 'circuit', 'stream', 'bento', 'explainer', 'pass'])
    for (const id of DEDICATED) expect(shelfOf(id, DEFAULT_FAVOURITES)).toBeNull()
    expect(shelfOf('line', DEFAULT_FAVOURITES)).toBe('archive')
  })

  it('Jarvis is only ever dark, and the Configure panel follows a layout’s dark stage', () => {
    expect(JARVIS).toBe('jarvis')
    expect(DARK_ONLY).toEqual(['jarvis2'])
    expect(STAGED_LAYOUTS).toContain('jarvis')
    /* Two Jarvis (2 Oct): the first kept, the Reactor as v2 — one button, a version switch beside it while on. */
    /* One Aruna on the bar; the Reactor (v2) on the Archive shelf (3 Oct). */
    expect(isJarvis('jarvis')).toBe(true)
    expect(isJarvis('jarvis2')).toBe(false)
    expect(shelfOf('jarvis2', DEFAULT_FAVOURITES)).toBe('archive')
    expect(pageSrc).not.toContain('JarvisVersion')
    expect(pageSrc).toContain("const next = entering ? JARVIS : beforeJarvis.current")
    expect(hostSrc).toContain("jarvis2: lazy(() => import('./layouts/Jarvis2Layout')),")
    expect(pageSrc).toContain("DARK_ONLY.includes(layout) || (STAGED_LAYOUTS.includes(layout) && checkStage === 'dark') ? 'dark' : 'light'")
    expect(pageSrc).toContain('data-stage={panelStage}')
  })

  it('puts the run line’s pencil only where a layout has no pencil of its own (2 Oct)', () => {
    expect(OWN_EDIT).toEqual(['column', 'brief', 'directions', 'explainer'])
    expect(hostSrc).toContain('edit={onEdit ? { onPress: OWN_EDIT.includes(layout) ? undefined : onEdit, open: editing, unrun } : undefined}')
  })

  /* Kept behind CANVAS_PICKER (owner, 5 Oct 2026: one view on the page): the two dropdowns are still the switch's, drawn
     only with the flag on. */
  it('is two dropdowns, the console’s filter dropdowns — Show and Canvas — and a review control with its own flag', () => {
    expect(CANVAS_OPTIONS).toBe(true)
    expect(switchSrc).toContain('prefix="Show"')
    expect(switchSrc).toContain('prefix="Canvas"')
    expect(pageSrc).toContain('const [layout, setLayout] = useRunLayout()')
    expect(pageSrc).toContain('CANVAS_OPTIONS && CANVAS_PICKER ? (')
    expect(pageSrc).toContain('<CanvasSwitch value={layout} onChange={setLayout} favourites={favourites} />')
    /* Focus is the main view (4 Oct): no button of its own and no v1 / v2 (v1 archived); Aruna's way in is on the canvas. */
    expect(pageSrc).not.toContain('<FocusVersion ')
    expect(pageSrc).not.toContain('<DedicatedViews ')
    expect(pageSrc).toMatch(/\{ARUNA_ENTRY && \(\s*<div className="sit-aruna-entry">\s*<JarvisButton on=\{onJarvis\} onPress=\{toggleJarvis\} busy=\{jarvisPhase !== null\} \/>/)
    expect(pageSrc).toContain("setCheckStage(entering ? 'dark' : theme)")
    /* Reasoning and Guided tour are hidden from the bar for now (4 Oct). */
    expect(pageSrc).not.toContain('<GuidedTourSoon />')
    expect(pageSrc).not.toContain('<CanvasReasoning ')
  })

  /* One view on the page (owner, 5 Oct 2026: "we showcase one view — hide the rest: the archive, favourites and the
     canvas type"): both pickers and Aruna's way in are off, and whatever this browser stored, the page draws Focus. */
  it('shows one view: no pickers, no way into Aruna, and Focus whatever was stored — the stored pick kept, never rewritten', () => {
    expect(CANVAS_PICKER).toBe(false)
    expect(ARUNA_ENTRY).toBe(false)
    expect(MAIN_VIEW).toBe('focus2')
    for (const l of RUN_LAYOUTS) expect(shownLayout(l.value), l.value).toBe('focus2')
    for (const junk of [null, '', 'tree', 'jarvis', 'jarvis2', 'classic2', 'column', 'nonsense']) expect(shownLayout(parseRunLayout(junk)), String(junk)).toBe('focus2')
    /* The hook draws what `shownLayout` says and only the setter writes the key: arriving never rewrites the stored pick. */
    expect(layoutSrc).toContain('return [shownLayout(layout), set]')
    expect(layoutSrc.match(/localStorage\.setItem\(RUN_LAYOUT_KEY/g)?.length).toBe(1)
    expect(pageSrc).not.toMatch(/setLayout\((?!next\))/)
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
    for (const id of ['ClassicV2', 'Line', 'Tree', 'Gates', 'Marble', 'Chat', 'Deck', 'Depth', 'Jarvis', 'Mission', 'Synapse', 'Pulse', 'Focus', 'Brief', 'Circuit', 'Stream', 'Bento', 'Directions', 'Explainer', 'Pass'])
      expect(hostSrc).toContain(`lazy(() => import('./layouts/${id}Layout'))`)
    expect(hostSrc).toContain('<Suspense fallback={null}>')
    for (const gone of ['Xray', 'Multiverse', 'Glass', 'Tour']) expect(hostSrc).not.toContain(`./layouts/${gone}Layout`)
    expect(hostSrc).toContain('if (!el || !journey || !asColumn) return')
  })
})
