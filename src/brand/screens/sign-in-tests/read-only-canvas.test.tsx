import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'

import { DecisionBadge } from '../../decision-badge'
import { showcaseTenant } from '../../fixtures'
import { BrandProvider } from '../../store'
import { ReadOnlyCanvas } from './InspectPanel'

/* -----------------------------------------------------------------------------
   The builder's canvas, read only (InspectPanel.tsx `ReadOnlyCanvas`), drawn
   once as static markup. It has three callers: the Policies list's details
   slider and the Add existing / Replace preview, which pass a policy and its
   trace and nothing else, and an application's Policies tab at a glance (20 Oct
   2026), which frames it. Everything the tab added is opt-in, so the first two
   must come out exactly as before — nothing else pins that.
   -------------------------------------------------------------------------- */

const t = showcaseTenant()
const aws = t.policies.find((p) => p.id === 'sc-aws-engineering')!
const render = (node: ReactNode) => renderToStaticMarkup(<BrandProvider>{node}</BrandProvider>)
const buttons = (html: string, cls: string) => [...html.matchAll(new RegExp(`<button[^>]*class="${cls}[^"]*"[^>]*>`, 'g'))].map((m) => m[0])

describe('ReadOnlyCanvas, as the details slider and the Add existing preview draw it', () => {
  const out = render(<ReadOnlyCanvas policy={aws} traced={[]} />)

  it('keeps its own frame, the start pill and every card’s state pill', () => {
    expect(out).toContain('class="bb is-left-open insp__canvas"')
    expect(out).toContain('id="bb-start"')
    expect(out).toContain('>Complete<')
    expect(out).toContain('>Always on<')
    expect(out).not.toContain('is-framed')
    expect(out).not.toContain('bx-decision-badge')
  })

  it('leaves the titles and the reorder number as they were', () => {
    for (const b of buttons(out, 'bb__titlebtn')) expect(b).not.toContain('aria-controls')
    /* Every rule's number is still its grip: a button named for reordering, in the tab order. */
    expect(buttons(out, 'bb__idx')).toHaveLength(aws.rules.length)
    for (const b of buttons(out, 'bb__idx')) expect(b).not.toContain('tabindex')
    for (const b of buttons(out, 'bb__idx')) expect(b).toContain('aria-label="Reorder rule')
    for (const b of buttons(out, 'bb__act bb__fold__btn')) expect(b).not.toContain('tabindex')
  })
})

describe('ReadOnlyCanvas framed, as an application’s Policies tab draws it', () => {
  const head = (id: string) => (id === 'fallback' ? <DecisionBadge decision="deny" /> : <DecisionBadge decision={aws.rules.find((r) => r.id === id)!.decision} />)
  const out = render(<ReadOnlyCanvas policy={aws} traced={[aws.rules[1].id]} framed open={aws.rules[1].id} onOpen={() => {}} cardHead={head} />)

  it('frames the chain and says each card’s outcome in place of its pill', () => {
    expect(out).toContain('class="bb is-left-open insp__canvas is-framed"')
    expect(out.split('bx-decision-badge').length - 1).toBe(aws.rules.length + 1)
    expect(out).not.toContain('>Complete<')
    expect(out).not.toContain('>Always on<')
  })

  it('makes the title each card’s one stop, naming what it folds, and takes the rest out of the order', () => {
    const titles = buttons(out, 'bb__titlebtn')
    expect(titles).toHaveLength(aws.rules.length + 1)
    for (const b of titles) expect(b).toMatch(/aria-controls="bb-(rule-[^"]+|terminal)-body"/)
    for (const b of buttons(out, 'bb__act bb__fold__btn')) expect(b).toContain('tabindex="-1"')
  })

  it('draws each rule’s number as the number alone: nothing moves here, so there is no grip to drag or announce', () => {
    /* Browser review, 20 Oct 2026: a "Reorder rule" button with a grab cursor that dragged nothing, and a swipe that
       started on it could not scroll. */
    expect(buttons(out, 'bb__idx')).toHaveLength(0)
    expect(out).not.toContain('Reorder rule')
    expect(out).not.toContain('bb__idx__grip')
    expect(out.split('<span class="bb__idx is-still" aria-hidden="true">').length - 1).toBe(aws.rules.length)
  })

  it('opens the one card the host holds open, and traces the card it names', () => {
    expect(out).toMatch(new RegExp(`<button[^>]*id="bb-rule-${aws.rules[1].id}-title"[^>]*aria-expanded="true"`))
    expect(out).toMatch(new RegExp(`<button[^>]*id="bb-rule-${aws.rules[0].id}-title"[^>]*aria-expanded="false"`))
    expect(out.split('is-traced').length - 1).toBe(1)
  })
})
