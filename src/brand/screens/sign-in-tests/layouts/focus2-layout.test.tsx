import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { showcaseTenant } from '../../../fixtures'
import { BrandProvider } from '../../../store'
import { columnView, runColumns, type ColumnSpec } from '../../board/try-sign-in'
import { envOf } from '../../tenant-resolver'
import { rowsRead } from '../../testing/rows-read'
import { screensOf } from '../../testing/screens-of'
import { TestingSessionProvider } from '../../testing/session'
import { factsOf, originPatch, type SignInForm } from '../../testing/sign-in-form'
import { engineRun } from '../engine-run'
import { emptyDraft, forRun, withDefaults } from '../sign-in-card'
import Focus2Layout from './Focus2Layout'
import layoutRaw from './Focus2Layout.tsx?raw'
import chainRaw from './classic2-chain.tsx?raw'
import glideRaw from './classic2-glide.ts?raw'
import { conditionsWord, factRows } from './classic2-model'
import { rowFacts } from './shared/sign-in-row'
import { citeOfLit, citeTargets, footerBeside, readViews, saidOf, viewsOf } from './focus2-brief-model'
import { FIRST_FOCUS_VIEW, FOCUS_VIEW_KEY, readFocusView, type FocusView } from './focus2-view'
import { briefOf } from './brief-model'
import { storyOf } from './focus2-pace'
import { beatOfCard, cardName, cardsOf, pickLabel } from './focus2-story'
import type { RunLayoutProps } from './types'

/* -----------------------------------------------------------------------------
   Focus v2, over REAL runs of the showcase tenant: the beats mapped onto the
   cards the path actually draws, and the view's FIRST PAINT, which is all a
   static render can see.

   Why the first paint is worth a test of its own: the suite this repo runs
   (layouts-render.test.tsx, not ours to edit) renders every layout with
   `renderToStaticMarkup` for 80-odd sign-ins, so no effect of ours ever runs
   there. Anything the view only gets right in an effect — the room it reads
   off the canvas, the presenter's frame loop, a session key — is a defect
   that shows up as somebody else's failing suite. These tests pin the parts
   of that we can assert directly: the answer is in the markup when the run is
   settled, the chain starts with the sign-in node from the first frame, and
   both views are the same chain — down the canvas, or across it.
   -------------------------------------------------------------------------- */

const TODAY = '2026-10-02'
const t = showcaseTenant()
const env = envOf(t)
const lib = { zones: t.zones, fingerprints: t.fingerprints }
const AS_IT_STANDS: ColumnSpec = { id: 'live', label: 'As the tenant stands', tip: 'Every policy as saved' }
const noop = () => {}

function propsOf(personName: string | null, appName: string | null, opts: { at?: 'first' | 'settled'; origin?: 'home' | 'tor'; patch?: Partial<SignInForm> } = {}): RunLayoutProps {
  const person = personName === null ? null : (t.directory.people.find((p) => p.name === personName) ?? null)
  const app = appName === null ? null : (t.apps.find((a) => a.name === appName) ?? null)
  if ((personName !== null && !person) || (appName !== null && !app)) throw new Error(`no ${personName} or ${appName} in the showcase`)
  const rows = rowsRead(t.policies, null, app?.id ?? null, lib)
  const base: SignInForm = { ...emptyDraft(TODAY, '09:30'), ...(opts.origin ? originPatch(opts.origin) : {}), personId: person?.id ?? null, appId: app?.id ?? null }
  const form = { ...forRun(withDefaults(base, rows, [], TODAY, '09:30'), rows), ...(opts.patch ?? {}) } as SignInForm
  const { facts } = factsOf(form, t.zones)
  const cols = runColumns([AS_IT_STANDS], t.policies, facts, env)
  const res = cols[0].resolution
  const ctx = { people: t.directory.people, apps: t.apps, zones: t.zones, rows }
  const plan = engineRun({ res, policies: t.policies, form, facts, env, ctx, intro: 'none' })
  const settled = opts.at !== 'first'
  return {
    plan,
    s: settled ? plan.steps.length - 1 : 0,
    running: !settled,
    animate: false,
    /* As layouts-render.test.tsx renders every layout: reduced, so the presenter follows the engine and the first
       painted frame is the whole answer. */
    reduced: true,
    jumped: settled,
    runKey: 2,
    form,
    rows,
    asGroup: null,
    start: <div className="test-start" />,
    answer: <div className="test-answer" />,
    screens: screensOf(res, { policies: t.policies, methods: t.methods, defaultMethodId: undefined, person }),
    columns: cols.map((c) => columnView(c, '', t.policies, (id) => t.apps.find((a) => a.id === id)?.name ?? id)),
    changed: null,
    expected: null,
    weaker: null,
    onPressPerson: noop,
    onAdd: noop,
    onOpenPolicy: noop,
    onOpenRule: noop,
    onAsGroup: noop,
  }
}

/* The view's source, its line ends made plain (the checkout may hand it CRLF). */
const layoutSrc = layoutRaw.replace(/\r\n/g, '\n')
const chainSrc = chainRaw.replace(/\r\n/g, '\n')
const glideSrc = glideRaw.replace(/\r\n/g, '\n')

/* The first paint with a view, the brief and the carousel over Horizontal handed in. Nothing: the first paint a viewer
   who never chose gets. */
interface Paint {
  view?: FocusView
  brief?: boolean
  carousel?: boolean
}
const wrap = (p: RunLayoutProps, paint: Paint = {}) =>
  renderToStaticMarkup(
    <BrandProvider>
      <TestingSessionProvider>
        <Focus2Layout {...p} initialView={paint.view} initialBrief={paint.brief} initialCarousel={paint.carousel} />
      </TestingSessionProvider>
    </BrandProvider>,
  )
/** The cards one at a time over the Horizontal view: the route's (ROUTE_MAP), so asked for with the route off it is
    simply Horizontal. */
const CAROUSEL: Paint = { view: 'horizontal', carousel: true }
/** Every paint the bar has to hold up in: both views, the brief over each, and the carousel asked for with and without it. */
const PAINTS: { name: string; paint: Paint }[] = [
  { name: 'first paint', paint: {} },
  { name: 'vertical', paint: { view: 'vertical' } },
  { name: 'horizontal', paint: { view: 'horizontal' } },
  { name: 'vertical + brief', paint: { view: 'vertical', brief: true } },
  { name: 'horizontal + brief', paint: { view: 'horizontal', brief: true } },
  { name: 'carousel', paint: CAROUSEL },
  { name: 'carousel + brief', paint: { ...CAROUSEL, brief: true } },
]
/** The chain's first node, the sign-in: its opening tag to the first connector after it (or the canvas's bar). */
const nodeOf = (html: string) => {
  const mark = html.indexOf('data-node="sign-in"')
  if (mark < 0) return ''
  const at = html.lastIndexOf('<div', mark)
  const ends = [html.indexOf('class="bb__link', at), html.indexOf('class="f2cb-dock"', at)].filter((i) => i > at).map((i) => html.lastIndexOf('<', i))
  return html.slice(at, Math.min(...ends, html.length))
}
/** The cards on the chain, in order (the brief's phrases carry a `data-card` of their own). */
const cardsIn = (html: string) => [...html.matchAll(/data-card="(sign-in|policy|rule|outcome)"/g)].map((m) => m[1])
/** The canvas's bar at the foot: its toolbar, up to the panel or the world after it. */
const barOf = (html: string) => {
  const at = html.indexOf('class="f2cb"')
  if (at < 0) return ''
  const ends = [html.indexOf('class="rl-f2a"', at), html.indexOf('class="rstage__', at), html.indexOf('class="rl-focus__world', at)].filter((i) => i > at)
  return html.slice(at, Math.min(...ends, html.length))
}
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
const count = (html: string, needle: string) => html.split(needle).length - 1

const ALLOW = propsOf('Maya Iyer', 'AWS Console')
const DENY = propsOf('Devon Rao', 'AWS Console', { patch: { device: { kind: 'preset', id: 'win10' } } as Partial<SignInForm> })
const DEPENDS = propsOf('Arun Patel', 'GitHub Enterprise', { patch: { device: { kind: 'none' } } as Partial<SignInForm> })
const DEFAULTED = propsOf('Kavya Menon', 'HRMS')
const EMPTY = propsOf(null, null)
const RUNS: { name: string; props: RunLayoutProps }[] = [
  { name: 'Maya on AWS (Allow)', props: ALLOW },
  { name: 'Devon on a Windows 10 laptop (Deny)', props: DENY },
  { name: 'Arun with no device (Depends)', props: DEPENDS },
  { name: 'Kavya on HRMS (the Global Default covers)', props: DEFAULTED },
]

describe('the beats, and the cards they open', () => {
  it('six kinds of beat become four kinds of card: two beats go deeper into one already open', () => {
    const beats = storyOf(ALLOW.plan)
    const story = cardsOf(beats, ALLOW.plan)
    expect(beats.map((b) => b.kind)).toContain('covers')
    expect(beats.map((b) => b.kind)).toContain('then')
    expect(new Set(story.cards.map((c) => c.kind))).toEqual(new Set(['sign', 'policies', 'rule', 'outcome']))
    /* The covering policy is the policy list a beat later. */
    const policies = beats.findIndex((b) => b.kind === 'policies')
    const covers = beats.findIndex((b) => b.kind === 'covers')
    expect(story.ofBeat[covers]).toBe(story.ofBeat[policies])
    /* The Then is the deciding rule's own card. */
    const then = beats.findIndex((b) => b.kind === 'then')
    const landing = beats.findIndex((b) => b.kind === 'rule' && b.rule === ALLOW.plan.landing)
    expect(landing).toBeGreaterThanOrEqual(0)
    expect(story.ofBeat[then]).toBe(story.ofBeat[landing])
    /* And so the path is shorter than the rail, never longer. */
    expect(story.cards.length).toBeLessThan(beats.length)
  })

  it('every beat opens a card that exists, on every run', () => {
    for (const { name, props } of [...RUNS, { name: 'nothing chosen', props: EMPTY }]) {
      const beats = storyOf(props.plan)
      const story = cardsOf(beats, props.plan)
      expect(story.ofBeat.length, name).toBe(beats.length)
      for (const i of story.ofBeat) {
        expect(i, name).toBeGreaterThanOrEqual(0)
        expect(i, name).toBeLessThan(story.cards.length)
      }
      expect(story.cards.length, name).toBeGreaterThan(0)
    }
  })

  it("the cards come in the story's order, which is what lets the view draw the ones reached as a prefix", () => {
    for (const { name, props } of RUNS) {
      const story = cardsOf(storyOf(props.plan), props.plan)
      const ats = story.cards.map((c) => c.at)
      expect([...ats].sort((a, z) => a - z), name).toEqual(ats)
      /* The one the view leans on hardest: the answer is the last card, so the geometry's `keep` is `n - 1`. */
      expect(story.cards[story.cards.length - 1].kind, name).toBe('outcome')
    }
  })

  it('a press on a card goes to the furthest of its beats the story has reached, and no further', () => {
    const beats = storyOf(DENY.plan)
    const story = cardsOf(beats, DENY.plan)
    const policies = story.cards.findIndex((c) => c.kind === 'policies')
    const [first, second] = story.ofBeat.map((c, i) => ({ c, i })).filter(({ c }) => c === policies).map(({ i }) => i)
    expect(second).toBeGreaterThan(first)
    /* Before the lock, the first of them; after it, the one that locks. */
    expect(beatOfCard(story, policies, first)).toBe(first)
    expect(beatOfCard(story, policies, beats.length - 1)).toBe(second)
    /* Never ahead of the story, even for a card whose later beat has not been told. */
    expect(beatOfCard(story, policies, 0)).toBeLessThanOrEqual(first)
  })

  it('names a card for the path and for its one button', () => {
    const story = cardsOf(storyOf(DENY.plan), DENY.plan)
    const rule = story.cards.find((c) => c.kind === 'rule')
    expect(rule).toBeDefined()
    if (rule) {
      expect(pickLabel(rule, DENY.plan)).toMatch(/^Show (rule \d+|the last rule)$/)
      expect(cardName(rule, DENY.plan, 'Devon Rao', true)).toMatch(/^(Rule \d+|Last rule), /)
    }
    expect(cardName(story.cards[0], DENY.plan, 'Devon Rao', true)).toBe('Sign-in, Devon Rao')
    expect(cardName(undefined, DENY.plan, 'Devon Rao', true)).toBe('')
  })
})

describe('the first paint', () => {
  it('says the answer, and names the application, on every settled run', () => {
    for (const { name, props } of RUNS) {
      const out = wrap(props)
      const said = text(out)
      expect(out.length, name).toBeGreaterThan(200)
      expect(said, name).toContain(props.plan.appName)
      expect(said, name).toMatch(/Allow|Deny|Depends/)
    }
  })

  /* The bar under the card is gone (owner, 5 Oct 2026; it is behind TRAIL_BAR): the path is the trail, the keys and the
     receded cards walk it, and the canvas's own bar at the foot is drawn in every state — the voice gone from it too. */
  it("draws no bar under the card, and the canvas's bar from the first frame", () => {
    for (const { name, props } of RUNS) {
      for (const { name: at, paint } of PAINTS) {
        const out = wrap(props, paint)
        expect(out, name).not.toContain('rl-f2-player')
        expect(out, name).not.toContain('rl-f2bar')
        expect(out, name).not.toContain('rl-f2__player')
        expect(out, name).not.toContain('rl-f2a-voice')
        expect(out, `${name} ${at}`).toContain('class="f2cb"')
        /* The answer, once the run is settled: a view is always on, so it is always there. */
        expect(text(out), `${name} ${at}`).toMatch(/Allow|Deny|Depends|No policy/)
      }
    }
    /* At the first step the chain is its node and the cards the engine has reached — never the answer — in either view. */
    for (const { name, paint } of PAINTS) {
      const out = wrap(propsOf('Maya Iyer', 'AWS Console', { at: 'first' }), paint)
      expect(['policy', 'rule', 'outcome'].slice(0, cardsIn(out).length), name).toEqual(cardsIn(out))
      expect(cardsIn(out), name).not.toContain('outcome')
      expect(nodeOf(out), name).toContain('Maya Iyer')
      /* One view (HORIZONTAL_VIEW off, 5 Oct 2026): the bar holds no side of a pair, in any paint. */
      expect(barOf(out), name).not.toContain('data-view=')
    }
  }, 60_000)

  /* ONE NODE FOR THE SIGN-IN (owner, 5 Oct 2026: "remove the first node, the sign-in node … the first pill-shaped node
     should be the node as we have in the top … make the main pill node editable. Also move the Expand all button to
     the bottom bar"): no row on top and no sign-in card; the chain's first node says who signs in to what and how many
     conditions it states, and holds the pencil and Replay. The canvas's bar at its foot is the two functions and the
     fold-all (owner, the same day: "2 views and 2 functions … remove the audio part completely"; the pair of views
     is hidden, "we will go with one, only the vertical"). */
  it('draws no sign-in row and no sign-in card: the chain starts with the sign-in node, and the bar ends with Expand all', () => {
    for (const { name, props } of [...RUNS, { name: 'nothing chosen', props: EMPTY }]) {
      for (const { name: at, paint } of PAINTS) {
        const out = wrap(props, paint)
        expect(out, `${name} ${at}`).not.toMatch(/class="sir[ "]/)
        expect(out, `${name} ${at}`).not.toContain('data-card="sign-in"')
        const node = nodeOf(out)
        expect(node, `${name} ${at}`).toMatch(/^<div class="bb__start rl-c2__start rl-c2__node/)
        /* The pencil, then Replay, at its end. */
        expect(node.indexOf('aria-label="Edit sign-in"'), `${name} ${at}`).toBeGreaterThan(0)
        expect(node.indexOf('aria-label="Replay"'), `${name} ${at}`).toBeGreaterThan(node.indexOf('aria-label="Edit sign-in"'))
        const bar = barOf(out)
        expect(bar, name).toContain('role="toolbar" aria-label="Canvas"')
        /* Left to right: Brief, then Questions, then the fold-all — and no pair before them. */
        const order = ['data-fn="brief"', 'data-fn="questions"', 'data-fn="fold"'].map((x) => bar.indexOf(x))
        for (const i of order) expect(i, `${name} ${at}`).toBeGreaterThanOrEqual(0)
        expect([...order].sort((a, z) => a - z), `${name} ${at}`).toEqual(order)
        expect(bar, name).toContain('>Brief</button>')
        expect(bar, name).toContain('>Questions</button>')
        /* A settled run lands folded: the button opens every card; with nothing chosen there is no card for it. */
        expect(bar, name).toMatch(/data-fn="fold"[\s\S]*<span>Expand all<\/span>/)
        expect(/data-fn="fold"[^>]*aria-disabled="true"/.test(bar), `${name} ${at}`).toBe(props === EMPTY)
        /* Three buttons, and never a Back while the route is off. */
        expect(count(bar, '<button'), `${name} ${at}`).toBe(3)
        for (const gone of ['role="group" aria-label="View"', 'f2cb__pair', 'data-view=', '>Vertical<', '>Horizontal<', 'data-view="overview"', 'data-view="cards"', '>Overview<', '>Cards<', 'aria-label="Voice"', 'Stop the voice', 'f2cb__said', 'Back to the horizontal view']) expect(bar, `${name} ${at} ${gone}`).not.toContain(gone)
        expect(out, name).not.toContain('rl-f2a-rail')
      }
    }
  }, 60_000)

  it('says the sign-in in its node: who signs in to what, how many conditions, the run\'s state, and opens the form', () => {
    const node = nodeOf(wrap(ALLOW))
    expect(text(node)).toMatch(/^MI Maya Iyer signs in to AWS Console 2 sign-in conditions$/)
    /* The count's word is the card's, and its tip says the conditions in the form's order. */
    const facts = factRows(rowFacts(ALLOW.form, ALLOW.rows, { zones: t.zones }))
    expect(node).toContain(`>${conditionsWord(facts.length)}</span>`)
    expect(node).toContain('class="rl-c2__ncount"')
    /* One press says what it edits, with the count; the pencil is pressed while the panel is open. */
    expect(node).toMatch(/<button type="button" class="rl-c2__nmain" aria-label="Edit sign-in: Maya Iyer on AWS Console, 2 sign-in conditions" title="Edit the sign-in">/)
    expect(nodeOf(wrap({ ...ALLOW, editing: true }))).toMatch(/class="bb__start rl-c2__start rl-c2__node is-on"/)
    expect(nodeOf(wrap({ ...ALLOW, editing: true }))).toMatch(/aria-label="Edit sign-in" aria-pressed="true"/)
    /* Changes not run yet: "Not run" after the count. */
    expect(text(nodeOf(wrap({ ...ALLOW, unrun: true })))).toMatch(/2 sign-in conditions Not run$/)
    /* A group pick says the group. */
    expect(text(nodeOf(wrap({ ...ALLOW, asGroup: 'Finance' })))).toContain('Anyone in Finance signs in to AWS Console')
    /* Replay waits while the run plays. */
    expect(nodeOf(wrap(propsOf('Maya Iyer', 'AWS Console', { at: 'first' })))).toMatch(/aria-label="Replay" aria-disabled="true"/)
  })

  it('draws nothing of the route or the cards one at a time while ROUTE_MAP is off', () => {
    expect(layoutSrc).toMatch(/\nconst ROUTE_MAP = false\n/)
    for (const { name, props } of RUNS) {
      for (const { name: at, paint } of PAINTS) {
        const out = wrap(props, paint)
        for (const gone of ['rl-focus__slot', 'rl-f2__band', 'is-route', 'f2o__', 'rl-focus__edge', 'rl-f2__face', 'Back to the horizontal view']) expect(out, `${name} ${at} ${gone}`).not.toContain(gone)
      }
      /* The carousel asked for is simply Horizontal. */
      expect(wrap(props, CAROUSEL), name).toBe(wrap(props, { view: 'horizontal' }))
    }
  }, 60_000)

  it('is sharp and in place when there is nothing to present', () => {
    /* Settled: the host hands it `jumped`, so there is no story to tell and nothing is left blurred. */
    expect(wrap(ALLOW)).toContain('rl-focus-root rl-f2 is-sharp')
    /* And the stage is the console Mode button's, carried on the view's own root. */
    expect(wrap(ALLOW)).toMatch(/data-stage="(light|dark)"/)
  })

  it('carries the verdict on the outcome card, and the matched rule rings in its colour, in both views', () => {
    for (const [name, props, tone] of [
      ['Deny', DENY, 'is-deny'],
      ['Allow', ALLOW, 'is-allow'],
      ['Depends', DEPENDS, 'is-depends'],
    ] as const) {
      for (const view of ['vertical', 'horizontal'] as const) {
        const out = wrap(props, { view })
        expect(out, `${name} ${view}`).toMatch(new RegExp(`class="bb__card rl-c2__card is-terminal rl-c2__out ${tone}"`))
        expect(out, `${name} ${view}`).not.toContain('rl-f2__qs')
      }
    }
    expect(wrap(DENY, { view: 'horizontal' })).toMatch(/class="bb__card rl-c2__card is-deny[^"]* is-matched"/)
  })

  it('draws a run with nothing chosen without throwing, and says so', () => {
    expect(() => wrap(EMPTY)).not.toThrow()
    expect(text(wrap(EMPTY))).toMatch(/Choose a person|Choose an application/)
  })
})

/* Two views and two functions (owner, 5 Oct 2026: "2 views and 2 functions … Vertical by default, with an option for the
   horizontal"): Vertical | Horizontal, one always pressed, and Brief and Questions over either — both views the same
   chain, down the canvas or across it (owner, the same day: "change the horizontal mode the same as the vertical
   mode"). A static paint is all that can be seen here; the presses and the glide are checked in the browser. */
describe('one view and two functions: vertical, brief, questions (the horizontal row kept)', () => {
  /** A button in the bar, its opening tag: a side of the pair by its view, a function by its name. */
  const side = (html: string, view: FocusView) => tagOf(barOf(html), `data-view="${view}"`)
  const fn = (html: string, name: 'brief' | 'questions') => tagOf(barOf(html), `data-fn="${name}"`)
  const back = (html: string) => tagOf(barOf(html), 'aria-label="Back to the horizontal view"')
  function tagOf(bar: string, needle: string): string | null {
    const at = bar.indexOf(needle)
    if (at < 0) return null
    const open = bar.lastIndexOf('<button', at)
    return bar.slice(open, bar.indexOf('>', at))
  }

  it('is Vertical by default, under a key of its own: no pair, the brief ON once a run has landed, no Back and no route', () => {
    /* Node has no window, so nothing is stored: the view reads Vertical. The brief's old remembered flag is no longer
       read (owner, 6 Oct 2026: the brief is on by default for every run, over the folded cards). */
    expect(FOCUS_VIEW_KEY).toBe('idp.focus-view')
    expect(FIRST_FOCUS_VIEW).toBe('vertical')
    expect(readFocusView()).toBe('vertical')
    expect(readViews()).toBe('cards')
    for (const { name, props } of [...RUNS, { name: 'nothing chosen', props: EMPTY }]) {
      const out = wrap(props)
      expect(side(out, 'vertical'), name).toBeNull()
      expect(side(out, 'horizontal'), name).toBeNull()
      const ran = props !== EMPTY
      expect(fn(out, 'brief'), name).toContain(ran ? 'aria-pressed="true"' : 'aria-pressed="false"')
      expect(back(out), name).toBeNull()
      expect(out, name).not.toContain('is-route')
      expect(out, name).not.toContain('f2o__svg')
      if (ran) expect(out, name).toContain('rl-brief rl-f2b is-head')
      else expect(out, name).not.toContain('rl-f2b')
      /* The chain down the canvas: its node, then its three cards, a connector before each. */
      expect(out, name).toMatch(/class="rl-c2__chain"/)
      expect(out, name).not.toContain('is-across')
      if (props !== EMPTY) {
        expect(cardsIn(out), name).toEqual(['policy', 'rule', 'outcome'])
        expect(count(out, 'class="bb__link rl-c2__link"'), name).toBe(3)
      }
      /* The same as asking for Vertical. */
      expect(out, name).toBe(wrap(props, { view: 'vertical' }))
    }
  })

  /* HORIZONTAL_VIEW IS OFF (owner, 5 Oct 2026: "Hide the horizontal part from the main focus view — we will go with one,
     only the vertical; will think about it later"). The flag is a constant of the layout, so it is pinned in its source;
     what it does is checked here: no pair in the bar, Vertical drawn — and a 'horizontal' left in storage by an earlier
     visit changes nothing. */
  it('keeps HORIZONTAL_VIEW off: no pair in the bar, Vertical drawn, and a stored horizontal ignored', () => {
    expect(layoutSrc).toMatch(/const HORIZONTAL_VIEW = false\n/)
    expect(layoutSrc).toContain('pair={HORIZONTAL_VIEW}')
    expect(layoutSrc).toContain("HORIZONTAL_VIEW ? readFocusView() : 'vertical'")
    const stored = { getItem: (k: string) => (k === FOCUS_VIEW_KEY ? 'horizontal' : null), setItem: () => {}, removeItem: () => {} }
    vi.stubGlobal('window', { localStorage: stored, addEventListener: () => {}, removeEventListener: () => {} })
    try {
      /* The store does hold Horizontal: only the flag keeps the view from reading it. */
      expect(readFocusView()).toBe('horizontal')
      for (const { name, props } of [...RUNS, { name: 'nothing chosen', props: EMPTY }]) {
        const out = wrap(props)
        expect(out, name).toBe(wrap(props, { view: 'vertical' }))
        expect(out, name).not.toContain('is-across')
        expect(out, name).toMatch(/class="rl-c2__chain"/)
        expect(barOf(out), name).not.toContain('f2cb__pair')
        expect(barOf(out), name).not.toContain('data-view=')
      }
    } finally {
      vi.unstubAllGlobals()
    }
    expect(readFocusView()).toBe('vertical')
  })

  /* ONE CHAIN, TWO SHAPES (owner, 5 Oct 2026: "the cards themselves should convert … just 4 simple cards will be
     enough"): Horizontal is the same chain laid across — the node, then exactly three cards, a connector before each —
     and nothing else on the canvas. */
  it('lays the same chain across on Horizontal: the node and exactly three cards, a connector before each, nothing else', () => {
    for (const { name, props } of RUNS) {
      const out = wrap(props, { view: 'horizontal' })
      expect(out, name).toMatch(/class="rl-c2__chain is-across"/)
      expect(out, name).toMatch(/--rl-c2-tracks:3/)
      expect(nodeOf(out), name).toContain(props.plan.appName)
      expect(cardsIn(out), name).toEqual(['policy', 'rule', 'outcome'])
      expect(count(out, 'class="bb__link rl-c2__link"'), name).toBe(3)
      for (const gone of ['f2o__', 'rl-focus__slot', 'rl-focus__edge', 'rl-f2__band']) expect(out, `${name} ${gone}`).not.toContain(gone)
      /* The row is drawn by `initialView` alone: the bar still has no pair to press. */
      expect(side(out, 'horizontal'), name).toBeNull()
      expect(side(out, 'vertical'), name).toBeNull()
      expect(back(out), name).toBeNull()
      /* The same heads as down the canvas: the same step, what was selected and meta line on each card. */
      const heads = (html: string) => [...html.matchAll(/class="rl-c2__kicker">([^<]*)</g)].map((m) => m[1])
      expect(heads(out), name).toEqual(heads(wrap(props, { view: 'vertical' })))
    }
    /* An empty plan keeps no place for a card. */
    expect(wrap(EMPTY, { view: 'horizontal' })).toMatch(/--rl-c2-tracks:0/)
  })

  it('can only glide between the two: the same chain element, the same cards under the same ids, in either shape', () => {
    /* One chain, drawn under one key whichever the view, its shape a prop — so a switch re-lays the very same elements. */
    expect(layoutSrc.match(/<Classic2Chain\b/g)?.length).toBe(1)
    expect(layoutSrc).toContain("orientation={across ? 'horizontal' : 'vertical'}")
    expect(layoutSrc.match(/key="chain"/g)?.length).toBe(1)
    /* Each card and the node are a box of Motion's layout animation, under a stable id in one group per run. */
    expect(chainSrc).toContain('useGlide(order, card)')
    expect(chainSrc).toContain('<LayoutGroup id={`rl-c2-${run.runKey}`}>')
    expect(glideSrc).toMatch(/box: \{ layout: true, layoutId: id, layoutDependency: g\.key/)
    expect(glideSrc).toMatch(/piece: \{ layout: 'position'/)
    /* The cards keep their keys and their order in both shapes. */
    for (const { name, props } of RUNS) expect(cardsIn(wrap(props, { view: 'horizontal' })), name).toEqual(cardsIn(wrap(props, { view: 'vertical' })))
    /* Nothing written as a CSS transform on what Motion moves. */
    expect(glideSrc).toContain('transformTemplate')
  })

  it('puts the brief over either view as its headline — never alone, never a "How it was decided"', () => {
    for (const { name, props } of RUNS) {
      for (const paint of [{ view: 'vertical' }, { view: 'horizontal' }, CAROUSEL] as Paint[]) {
        const out = wrap(props, { ...paint, brief: true })
        expect(out, name).toContain('rl-brief rl-f2b is-head')
        expect(out, name).toContain('rl-c2__chain')
        expect(out, name).not.toContain('is-alone')
        expect(out, name).not.toContain('How it was decided')
        expect(out, name).not.toContain('rl-brief__how')
        /* Its words are the Brief view's own, from the same plan. */
        expect(text(out), name).toContain(props.plan.appName)
        expect(out, name).toContain('rl-brief__sentence')
        /* The brief pressed, alone in the bar — and Questions shut, as every run lands (5 Oct 2026). */
        expect(fn(out, 'brief'), name).toContain('aria-pressed="true"')
        expect(fn(out, 'questions'), name).toContain('aria-pressed="false"')
        expect(count(barOf(out), 'aria-pressed="true"'), name).toBe(1)
      }
    }
    /* The chain stands under the headline, in either shape: the headline's room over it. */
    const room = (html: string) => Number(/class="rl-f2v__room" aria-hidden="true" style="height:(\d+)(px)?"/.exec(html)?.[1] ?? NaN)
    for (const view of ['vertical', 'horizontal'] as const) {
      expect(room(wrap(ALLOW, { view, brief: false })), view).toBe(0)
      expect(room(wrap(ALLOW, { view, brief: true })), view).toBeGreaterThan(0)
    }
    /* The headline stands at the world's top. */
    expect(wrap(ALLOW, { brief: true })).toMatch(/class="rl-brief rl-f2b is-head"[^>]*top:0%/)
  })

  it('never presses an orange button, selects in greyscale or blue, and says the presses in plain words', () => {
    const bar = barOf(wrap(ALLOW, { brief: false }))
    expect(bar).not.toMatch(/--brand|--accent|is-primary|bx-btn--brand/)
    for (const words of ['title="Show the brief"', 'title="Show the questions"']) expect(bar).toContain(words)
    for (const gone of ['title="Vertical view"', 'title="Show the horizontal view"']) expect(bar).not.toContain(gone)
    const on = barOf(wrap(ALLOW, { view: 'horizontal', brief: true }))
    for (const words of ['title="Hide the brief"']) expect(on).toContain(words)
    for (const gone of ['title="Show the vertical view"', 'title="Horizontal view"']) expect(on).not.toContain(gone)
  })

  it('says the answer the same way the Brief view does, and draws a run with nothing chosen', () => {
    for (const { paint } of PAINTS) {
      expect(() => wrap(EMPTY, { ...paint, brief: true })).not.toThrow()
    }
    /* The deny is said as the Brief view says it. */
    expect(text(wrap(DENY, { brief: true }))).toMatch(/is denied/)
  })

  /* Three showcase sign-ins (Tom Whelan on Windows 10, Aisha Khan on a personal laptop, James Whitfield in Austin)
     say "none of its 3 rules match" while the footer says "Checked 1 policy · 3 rules · 6 checks". */
  it('keeps numbers once: with the brief on, the footer drops a count the sentence already says', () => {
    const said = 'Tom Whelan is denied GitHub Enterprise: Developer tools applies, but none of its 3 rules match, so Nothing else matched decides.'
    expect(footerBeside('Checked 1 policy · 3 rules · 6 checks', said)).toBe('Checked 1 policy · 6 checks')
    /* "rule 3" is a name, not a count: nothing goes. */
    expect(footerBeside('Checked 1 policy · 2 rules · 3 checks', 'and rule 3 matches.')).toBe('Checked 1 policy · 2 rules · 3 checks')
    /* The first clause carries "Checked" and always stays. */
    expect(footerBeside('Checked 1 policy · 2 rules', 'only 1 policy')).toBe('Checked 1 policy · 2 rules')
    expect(saidOf(briefOf(ALLOW.plan, { person: 'Maya Iyer', first: 'Maya', app: ALLOW.plan.appName, via: null, second: '' }))).toContain('Maya Iyer gets into')
  })

  it('reads the two toggles as one pick, and never as nothing', () => {
    expect(viewsOf(true, false)).toBe('cards')
    expect(viewsOf(false, true)).toBe('brief')
    expect(viewsOf(true, true)).toBe('both')
    expect(viewsOf(false, false)).toBe('cards')
  })

  it("points each cited phrase at Focus's own card, and lights the phrase back from it", () => {
    const plan = ALLOW.plan
    const model = briefOf(plan, { person: 'Maya Iyer', first: 'Maya', app: plan.appName, via: null, second: '' })
    const t = citeTargets(plan, model)
    expect(t.who).toBe('person')
    expect(t.outcome).toBe('outcome')
    expect(t.policy).toBe(`policy:${plan.decider?.id}`)
    expect(t.rule).toBe(`rule:${plan.rules[plan.landing ?? -1]?.id}`)
    expect(t.check).toMatch(new RegExp(`^check:${plan.rules[plan.landing ?? -1]?.id}:`))
    expect(citeOfLit(t.rule ?? null, t)).toBe('rule')
    expect(citeOfLit('screens', t)).toBe('outcome')
    expect(citeOfLit('rule:nowhere', t)).toBeNull()
    expect(citeOfLit(null, t)).toBeNull()
    /* A Depends points its rule at the first rule that can't tell. */
    const dm = briefOf(DEPENDS.plan, { person: 'Arun Patel', first: 'Arun', app: DEPENDS.plan.appName, via: null, second: '' })
    const dt = citeTargets(DEPENDS.plan, dm)
    if (dm.decisive) expect(dt.rule).toBe(`rule:${DEPENDS.plan.rules[dm.decisive.rule].id}`)
  })
})
