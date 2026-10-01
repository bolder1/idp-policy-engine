/// <reference types="vite/client" />
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { BrandProvider } from '../../store'
import { TestingSessionProvider } from '../testing/session'
import { TryJourney } from './TryJourney'
import css from './journey.css?raw'
import src from './TryJourney.tsx?raw'

/* The journey canvas drawn without a browser, on the showcase tenant the
   store opens on — Kavya Menon on HRMS from the office, where the HRMS
   policy is off and the Global Default decides. The model and the geometry
   are pinned in journey.test.ts; this is the join between them and the
   markup. A server render runs no layout effect, so there is nothing
   measured: no wires, no marker, and — unless `still` — the columns held at
   nothing, waiting for the run. The browser pass checks the travel. */

const html = (still: boolean) =>
  renderToStaticMarkup(
    <BrandProvider>
      <TestingSessionProvider>
        <TryJourney still={still} />
      </TestingSessionProvider>
    </BrandProvider>,
  )
const text = (s: string) =>
  s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()

describe('TryJourney — settled', () => {
  const out = html(true)
  const words = text(out)

  it('states the sign-in as a sentence, with the tenant’s verdict, Replay and Save sign-in, and no Close', () => {
    expect(out).toContain('aria-label="Sign-in"')
    expect(out).toContain('id="sit-try-person"')
    expect(out).toContain('aria-label="Replay"')
    expect(out).toContain('aria-label="Save sign-in"')
    expect(out).not.toContain('Close Try a sign-in')
    expect(words).toContain('Decided by Global Default Policy · Rule 1 · Baseline access')
  })

  it('draws the columns left to right, labelled in sentence case', () => {
    const at = (s: string) => out.indexOf(s)
    const heads = ['>Sign-in</p>', '>Which policy</p>', '>Rules</p>', '>Outcome</p>']
    heads.forEach((h) => expect(at(h)).toBeGreaterThan(-1))
    expect(heads.map(at)).toEqual([...heads.map(at)].sort((a, b) => a - b))
    expect(out).toContain('aria-label="Sign-in journey"')
  })

  it('the sign-in node: the person and their group, the application, the facts the rules read', () => {
    expect(out).toContain('data-node="sign-in"')
    expect(words).toContain('Kavya Menon Human Resources')
    expect(words).toContain('HRMS')
    expect(words).toMatch(/From: Office network/)
  })

  it('every policy on the application, the Global Default last and deciding, the others with their few words', () => {
    const hrms = out.indexOf('data-node="policy:sc-hrms-office"')
    const gd = out.indexOf('data-node="policy:global-default"')
    expect(hrms).toBeGreaterThan(-1)
    expect(gd).toBeGreaterThan(hrms)
    expect(out).toContain('class="tj-whichrow is-decides"')
    expect(out).toContain('class="tj-whichrow is-dim"')
    expect(words).toContain('Decides')
    expect(words).toContain('Switched off')
  })

  it('the deciding policy’s rules as the board’s cards: the lit one, its outcome, and the last row', () => {
    expect(out).toContain('aria-label="Rules in Global Default Policy"')
    expect(out).toMatch(/class="tj-node tj-card is-lit" data-node="rule:[^"]+"/)
    expect(words).toContain('Rule 1: Baseline access')
    expect(out).toContain('data-node="rule:fallback"')
    expect(words).toContain('Nothing else matched')
    expect(out).toContain('class="tj-node tj-card is-dim" data-node="rule:fallback"')
    expect(words).toContain('Not reached')
  })

  it('the outcome: the board’s node with the answer and the rule line, Open policy, and What they see', () => {
    expect(out).toContain('aria-label="Decision: Allow on 1 factor, Global Default Policy · Rule 1 · Baseline access"')
    expect(words).toContain('Open policy')
    expect(out).toContain('data-node="see"')
    expect(words).toContain('What they see')
    expect(words).toContain('Approximation of the sign-in page')
  })

  it('one orange button at most, and none of the words the owner ruled out', () => {
    expect(out).not.toContain('bx-btn--brand')
    expect(words).not.toMatch(/\b(AI|assistant|log ?in|gauntlet|blast radius|rehearse)\b/i)
  })
})

describe('TryJourney — waiting for its run', () => {
  const out = html(false)

  it('holds every column but the sign-in at nothing, in place, until the marker reaches it', () => {
    expect(out).toContain('data-node="sign-in"')
    expect(out).toContain('data-node="policy:global-default"')
    /* Laid out for measuring, but not shown and not announced. */
    expect(out.match(/class="tj-col is-which"[^>]*aria-hidden="true"/)).not.toBeNull()
    expect(out.match(/class="tj-col is-sign-in"[^>]*aria-hidden/)).toBeNull()
    expect(out).toContain('aria-label="Decision"')
    expect(out).not.toContain('class="tj-whichrow is-decides"')
  })
})

describe('journey.css', () => {
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, '')

  it('uses tokens only: no hex, no rgba', () => {
    expect(rules).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(rules).not.toMatch(/rgba?\(/i)
  })

  it('gives nothing motion animates a transform or a transition', () => {
    for (const cls of ['.tj-col', '.tj-wire', '.tj-route', '.tj-marker']) {
      const blocks = [...rules.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, sel]) => sel.split(',').some((s) => s.trim().split(/[\s.:]/).includes(cls.slice(1)) || s.trim().startsWith(cls)))
      for (const [, sel, body] of blocks) {
        if (sel.includes('__')) continue
        expect(body, sel).not.toMatch(/\btransform\s*:|\btransition\s*:|\btranslate\s*:|\bscale\s*:/)
      }
    }
    expect(rules).not.toMatch(/\btransform\s*:/)
  })

  it('stops every animation and transition under reduced motion', () => {
    expect(rules).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none[\s\S]*transition: none/)
  })

  it('no dots on pills, no dashed or dotted edges', () => {
    expect(rules).not.toMatch(/dashed|dotted/)
  })
})

describe('TryJourney.tsx', () => {
  it('re-evaluates nothing itself: one resolution, read by the model', () => {
    expect(src.match(/resolveSignIn\(/g)).toHaveLength(1)
    expect(src).not.toMatch(/tracePolicy\(/)
  })

  it('opens a rule on its policy’s board, with the sign-in loaded there', () => {
    expect(src).toContain("store.go({ name: 'board', policyId, rule: ruleId })")
    expect(src).toContain("store.go({ name: 'board', policyId, open: 'try' })")
    expect(src.match(/session\.loadBoard\(policyId, form\)/g)).toHaveLength(2)
  })
})
