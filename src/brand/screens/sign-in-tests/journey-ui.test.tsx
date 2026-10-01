/// <reference types="vite/client" />
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { BrandProvider } from '../../store'
import { TestingSessionContext, initialSession, type TestingSession } from '../testing/session-state'
import { originPatch, type SignInForm } from '../testing/sign-in-form'
import { TryJourney } from './TryJourney'
import { emptyDraft, initialTryPage, type TryPage } from './sign-in-card'
import css from './journey.css?raw'
import src from './TryJourney.tsx?raw'
import cardSrc from './SignInCard.tsx?raw'

/* The Try tab drawn without a browser, on the showcase tenant the store opens
   on. A server render runs no effect: a run that is waiting shows its first
   frame, a settled one the whole journey, and nothing is measured — no wires.
   The engine's plan is pinned in engine-run.test.ts; this is the join between
   it and the markup. The browser pass checks the run itself. */

const TODAY = '2026-09-28'

function session(form: SignInForm, runId: number): TestingSession {
  const noop = () => {}
  return {
    ...initialSession(form),
    runId,
    patch: noop,
    patchBoard: noop,
    loadBoard: noop,
    load: noop,
    replay: noop,
    setView: noop,
    openBreakIn: noop,
    closeBreakIn: noop,
  }
}

function html(page: TryPage, form: SignInForm, runId: number) {
  return renderToStaticMarkup(
    <BrandProvider>
      <TestingSessionContext.Provider value={session(form, runId)}>
        <TryJourney page={page} onPage={() => {}} />
      </TestingSessionContext.Provider>
    </BrandProvider>,
  )
}

const text = (s: string) =>
  s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()

const arun: SignInForm = { ...emptyDraft(TODAY, '09:30'), personId: 'arun', appId: 'github' }
const settled = (form: SignInForm): TryPage => ({ ...initialTryPage(2, TODAY, '09:30'), mode: 'journey', played: 2, draft: form })

describe('Stage 0 — the card is the empty state', () => {
  const out = html(initialTryPage(1, TODAY, '09:30'), arun, 1)
  const words = text(out)

  it('holds only the card, labelled, with Person and Application and nothing else asked', () => {
    expect(out).toContain('class="tj-start"')
    expect(out).toContain('tj-start__label')
    expect(out).toContain('id="tj-field-person"')
    expect(out).toContain('id="tj-field-app"')
    expect(out).not.toContain('id="tj-field-from"')
    expect(out).not.toContain('tj-engine')
    expect(out).not.toContain('aria-label="Sign-in journey"')
  })

  it('Run is the one orange button, never disabled, with its shortcut; and Use a saved sign-in', () => {
    expect(out.match(/bx-btn--brand/g) ?? []).toHaveLength(1)
    const run = out.match(/<button[^>]*bx-btn--brand[^>]*>/)![0]
    expect(run).not.toContain('disabled')
    expect(run).toContain('aria-keyshortcuts="Control+Enter Meta+Enter"')
    expect(words).toContain('Run')
    expect(words).toContain('Use a saved sign-in')
  })

  it('three suggestions from real saved sign-ins, and no sentence explaining anything', () => {
    const chips = [...out.matchAll(/class="tj-suggest__chip"[\s\S]*?<span>([^<]*)<\/span><\/button>/g)].map((m) => m[1])
    expect(chips).toEqual(['Vikram Nair on a corporate laptop', 'Sofia Marchetti in London on an iPhone', 'Devon Rao on Android 12'])
  })

  it('once an application is chosen, asks what its rules read — each field filled, each saying what reads it', () => {
    const page = { ...initialTryPage(1, TODAY, '09:30'), draft: arun }
    const o = html(page, arun, 1)
    for (const f of ['from', 'place', 'device']) expect(o).toContain(`id="tj-field-${f}"`)
    expect(o).not.toContain('id="tj-field-risk"')
    expect(o).not.toContain('id="tj-field-when"')
    expect(o).toContain('aria-label="What reads device"')
    expect(o).toContain('aria-label="From: Office network"')
    expect(o).toContain('aria-label="Device: Windows 11 laptop · registered"')
    expect(o).toMatch(/aria-haspopup="dialog" aria-expanded="false" aria-label="Device: /)
  })
})

describe('A run waiting to play — its first frame', () => {
  it('a saved sign-in shows the card filled, for a beat, before it collapses', () => {
    const page = { ...settled(arun), played: 1, intro: 'fill' as const }
    const out = html(page, arun, 2)
    expect(out).toContain('tj-card0 is-fill')
    expect(out).toContain('inert')
  })

  it('Run shows the node, the engine line finding the policy, and Skip', () => {
    const page = { ...settled(arun), played: 1, intro: 'collapse' as const }
    const out = html(page, arun, 2)
    expect(out).toContain('data-node="sign-in"')
    expect(out).toContain('tj-engine is-running')
    expect(text(out)).toContain('Finding the policy for GitHub Enterprise')
    expect(text(out)).toContain('Skip')
    expect(text(out)).not.toContain('Replay')
  })
})

describe('Settled — the engine has run', () => {
  const out = html(settled(arun), arun, 2)
  const words = text(out)

  it('the engine line is the quiet summary with Replay', () => {
    expect(out).toContain('tj-engine is-done')
    expect(words).toContain('Checked 1 policy · 1 rule · 3 checks')
    expect(text(out)).toMatch(/Checked 1 policy · 1 rule · 3 checks Replay/)
    expect(out).not.toContain('>Skip<')
  })

  it('draws the columns left to right, labelled in sentence case', () => {
    const at = (s: string) => out.indexOf(s)
    const heads = ['>Sign-in</p>', '>Which policy</p>', '>Rules</p>', '>Outcome</p>']
    heads.forEach((h) => expect(at(h)).toBeGreaterThan(-1))
    expect(heads.map(at)).toEqual([...heads.map(at)].sort((a, b) => a - b))
  })

  it('the node: the person, the application, the facts asked; Edit sign-in, and Save sign-in as a popup trigger', () => {
    expect(words).toContain('Arun Patel Engineering')
    expect(words).toMatch(/From: Office network/)
    expect(out).toContain('aria-label="Edit sign-in"')
    const save = out.match(/<button[^>]*aria-label="Save sign-in"[^>]*>/)![0]
    expect(save).toContain('aria-haspopup="dialog"')
    expect(save).toContain('aria-expanded="false"')
    expect(save).not.toContain('aria-pressed')
  })

  it('which policy: the one that decides lit, the Global Default after it with its reason', () => {
    expect(out).toMatch(/class="tj-prow is-settled is-decides" data-node="policy:sc-dev-tools"/)
    expect(out).toMatch(/class="tj-prow is-settled is-dim" data-node="policy:global-default"/)
    expect(words).toContain('Decides')
    expect(words).toContain('Not reached')
  })

  it('rules: the match lit with a row per category, the rest ghosted titles', () => {
    expect(out).toMatch(/class="tj-rcard is-lit" data-node="rule:r115"/)
    expect(words).toContain('Who Engineering, DevOps Arun Patel')
    expect(words).toContain('Network Corporate offices Office network')
    expect(words).toContain('Device Compliant devices Windows 11 laptop · registered')
    expect(out).toMatch(/class="tj-rcard is-ghost" data-node="rule:r116"/)
    expect(out).toMatch(/class="tj-rcard is-ghost" data-node="rule:fallback"/)
    expect(words).toContain('Not reached')
    expect(out).toContain('aria-label="Show device checks"')
  })

  it('a no-match card keeps only the row that ended it, and says how many were not checked', () => {
    const home = { ...arun, ...originPatch('home') }
    const o = html(settled(home), home, 2)
    const card = o.slice(o.indexOf('data-node="rule:r115"'), o.indexOf('data-node="rule:r116"'))
    expect(card).toContain('tj-rcard__word is-no-match')
    expect(text(card)).toContain('No match')
    expect(text(card)).toContain('Network Corporate offices Home broadband')
    expect(text(card)).not.toContain('Arun Patel')
    expect(text(card)).toContain('1 not checked')
    expect(card).toContain('tj-crow is-fail')
  })

  it('Not stated is grey words and Add, never a badge or a "?"', () => {
    const none = { ...arun, device: { kind: 'none' as const } }
    const o = html(settled(none), none, 2)
    expect(o).toContain('tj-crow__val is-unset')
    expect(o).toContain('aria-label="Add device"')
    expect(text(o)).toContain('Depends')
    expect(o).not.toMatch(/tj-mark[^"]*">\?</)
  })

  it('the outcome: the answer, the rule, What they see behind a button, and Open policy', () => {
    expect(out).toContain('data-node="outcome"')
    expect(words).toContain('Allow on 1 factor')
    expect(words).toContain('Developer tools — office and device checks · Rule 1 · In the office on a compliant device')
    expect(words).toContain('What they see')
    expect(words).toContain('Open policy')
    expect(out).not.toContain('bx-btn--brand')
  })
})

describe('the sheets and the source', () => {
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, '')

  it('tokens only: no hex, no rgba, no dashed or dotted anything', () => {
    expect(rules).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(rules).not.toMatch(/rgba?\(/)
    expect(rules).not.toMatch(/dashed|dotted/)
  })

  it('no transform and no transition on anything motion animates', () => {
    const blocks = [...rules.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }))
    const owned = ['.tj-card0', '.tj-card0__in', '.tj-sin', '.tj-sin__in', '.tj-col', '.tj-crowwrap', '.tj-mark', '.tj-out', '.tj-route', '.tj-engine__text', '.tj-fieldwrap']
    /* A rule targets a class when the class is in the last compound of one of its selectors. */
    const targets = (sel: string, cls: string) =>
      sel.split(',').some((part) => new RegExp(`\\${cls}(?![\\w-])`).test(part.trim().split(/[\s>+~]+/).filter(Boolean).pop() ?? ''))
    const moving = /(^|;)\s*(transform|transition|translate|scale|rotate)\s*:/
    const bad = blocks.filter((b) => owned.some((o) => targets(b.sel, o)) && moving.test(b.body))
    expect(bad.map((b) => b.sel)).toEqual([])
    expect(owned.every((o) => blocks.some((b) => targets(b.sel, o)) || o === '.tj-route' || o === '.tj-card0__in')).toBe(true)
  })

  it('12 px is the floor', () => {
    const sizes = [...rules.matchAll(/font-size:\s*([^;]+);/g)].map((m) => m[1].trim())
    sizes.forEach((s) => expect(['var(--fs-xs)', 'var(--fs-sm)', 'var(--fs-md)', 'var(--pill-fs)']).toContain(s))
  })

  it('house words, and no Sparkles or Wand', () => {
    for (const s of [src, cardSrc]) {
      expect(s).not.toMatch(/Sparkles|Wand/)
      const strings = [...s.matchAll(/>([^<>{}]+)</g)].map((m) => m[1]).join(' ')
      expect(strings).not.toMatch(/\b(AI|assistant|log ?in|gauntlet|blast radius|rehearse)\b/i)
    }
  })
})
