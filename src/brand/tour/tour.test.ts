/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest'

import builder from '../screens/PolicyBuilderV4.tsx?raw'
import flow from '../screens/flow-rail.tsx?raw'
import tourSource from './Tour.tsx?raw'
import learnSource from './LearnPanel.tsx?raw'
import figureSource from './TutorialFigure.tsx?raw'
import kitCss from '../kit.css?inline'
import { STOPS } from './tour-stops'
import { TUTORIALS, type FigureId } from './tutorials'

const FIGURE_IDS = new Set<FigureId>(['anatomy', 'order', 'checks', 'test', 'ship'])

/* A tour breaks silently. Nobody opens it after the first week, so a stop whose
   anchor was renamed away just stops lighting anything and no test fails and no
   bug is filed. These assertions are the only thing standing between that and a
   walkthrough that quietly points at nothing. */

const markup = builder + flow

describe('the builder tour', () => {
  it('has an anchor in the builder for every stop that names one', () => {
    const missing = STOPS.filter((s) => s.anchor).filter((s) => !markup.includes(`data-tour="${s.anchor}"`))
    expect(missing.map((s) => `${s.id} → ${s.anchor}`)).toEqual([])
  })

  it('opens on a stop with no anchor, so the first card is centred', () => {
    expect(STOPS[0].anchor).toBeUndefined()
  })

  it('keeps every stop to one sentence', () => {
    for (const s of STOPS) {
      // Em-dashes and commas are fine; a second full stop means it is two stops.
      const sentences = s.body.trim().split(/\.\s+/).filter(Boolean)
      expect(`${s.id}: ${sentences.length}`).toBe(`${s.id}: 1`)
      expect(s.heading.length).toBeLessThanOrEqual(42)
    }
  })

  it('only asks the builder for steps and panels the builder actually has', () => {
    const steps = new Set(['who', 'when', 'then', 'check', 'review'])
    const panels = new Set(['preview', 'review', 'launch'])
    for (const s of STOPS) {
      if (s.step) expect(steps.has(s.step)).toBe(true)
      if (s.panel) expect(panels.has(s.panel)).toBe(true)
    }
  })

  /* "Show me that again" used to mean finding the Policy menu. The bar button is
     the fix, and it is asserted here rather than trusted, because a control that
     only matters on somebody's second day is exactly the kind that gets tidied
     away by somebody working on their hundredth. */
  it('is reachable again after it has been taken, from the bar and not only a menu', () => {
    expect(builder).toContain('label="Learn the builder"')
    expect(builder).toContain("id: 'learn'")
    expect(builder).toContain('onStartTour')
    // And the panel offers it as a re-run rather than pretending it is new.
    expect(learnSource).toContain('Take it again')
    expect(learnSource).toContain('tourSeen')
  })

  it('offers a countable set of guides rather than a help centre', () => {
    // A list with a denominator gets finished. Five is the number that fits on
    // one screen with its progress meter; past that it is documentation.
    expect(TUTORIALS.length).toBe(5)
    expect(new Set(TUTORIALS.map((t) => t.id)).size).toBe(TUTORIALS.length)
    for (const t of TUTORIALS) {
      expect(t.steps.length).toBeGreaterThanOrEqual(4)
      expect(FIGURE_IDS.has(t.figure)).toBe(true)
      // The summary is what the list shows; a paragraph there is a wall.
      expect(`${t.id}: ${t.summary.length <= 90}`).toBe(`${t.id}: true`)
    }
  })

  it('draws a figure for every guide, from the product tokens', () => {
    for (const t of TUTORIALS) {
      expect(figureSource).toContain(`${t.figure}: `)
    }
    // No raw colour: a tour with its own palette is a tour about another product.
    expect(figureSource).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(figureSource).not.toMatch(/\brgba?\(/)
  })

  it('points the card at what it lit', () => {
    // A floating card near a lit box is two things near each other until
    // something connects them.
    expect(tourSource).toContain('btr__beak')
    expect(tourSource).toMatch(/side: 'left' \| 'right' \| 'none'/)
  })

  /* The tour is non-modal on purpose: it dims the page but leaves it usable, so
     trapping focus would make it a modal that merely looks permeable. That is a
     real trade and these are the things that pay for it — if any of them is
     removed the trade stops being defensible, so they are pinned here rather
     than left as a paragraph in a comment. */
  it('stays non-modal, and carries what a non-modal dialog owes', () => {
    expect(tourSource).toContain('aria-modal="false"')
    // Announced, because focus can leave and come back.
    expect(tourSource).toMatch(/aria-live="polite"/)
    // The lit element points at the card, for anyone who arrives by Tab.
    expect(tourSource).toContain('aria-describedby')
    // Escape works from the page, not only from inside the card.
    expect(tourSource).toMatch(/window\.addEventListener\('keydown'/)
  })

  it('keeps the screen-reader utility in the kit, where every screen gets it', () => {
    // Both names lived in builder stylesheets that are now lazily loaded; if
    // they drift back out, sr-only text renders as visible text.
    // Line-ending agnostic: this repo is edited on Windows.
    expect(kitCss).toMatch(/\.u-sr,\s+\.u-sr-only\s*\{/)
  })

  it('ends by handing over rather than congratulating', () => {
    const last = STOPS[STOPS.length - 1]
    expect(last.finish).toBeTruthy()
    expect(last.finish).not.toMatch(/done|great|congrat|nice/i)
  })
})
