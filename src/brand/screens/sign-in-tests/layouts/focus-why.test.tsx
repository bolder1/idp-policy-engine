import { useRef } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { showcaseTenant } from '../../../fixtures'
import { BrandProvider } from '../../../store'
import { columnView, runColumns, type ColumnSpec } from '../../board/try-sign-in'
import { envOf } from '../../tenant-resolver'
import { rowsRead } from '../../testing/rows-read'
import { screensOf } from '../../testing/screens-of'
import { TestingSessionProvider } from '../../testing/session'
import { factsOf, originPatch, type SignInForm } from '../../testing/sign-in-form'
import { engineRun } from '../engine-run'
import { heroFinding } from '../journey'
import { WHY_IN_FOCUS } from '../phase'
import { emptyDraft, forRun, withDefaults } from '../sign-in-card'
import Focus2Layout from './Focus2Layout'
import { Classic2Chain } from './classic2-chain'
import { useChainRun, type ChainFold } from './classic2-run'
import { WHY_CONFLICT_LINK, WHY_GET_IN_LINK, WHY_LINK, useFocusWhy, whyLinkLabel } from './focus2-why'
import type { RunLayoutProps } from './types'
import layoutRaw from './Focus2Layout.tsx?raw'
import whyRaw from './focus2-why.tsx?raw'
import chainRaw from './classic2-chain.tsx?raw'
import classicRaw from './ClassicV2Layout.tsx?raw'
import barRaw from './focus2-canvasbar.tsx?raw'
import hostRaw from '../TryJourney.tsx?raw'
import journeyRaw from '../EngineJourney.tsx?raw'

/* -----------------------------------------------------------------------------
   THE WHY, FROM FOCUS (6 Oct 2026; focus2-why.tsx, phase.ts `WHY_IN_FOCUS`).

   How to get in, Let in for a while, What changed, Copy summary, the conflicts
   and As each group were built into the why on 5 Oct, and only the column's
   answer opened it: Focus — the one view the owner presents — never read the
   page's `why`. These pin the way in and what it opens:

     · the outcome card's body ends in one quiet link, only where the page
       hands its why, only once the run is done, and only when the why has
       something to say — by the column's own rule (EngineJourney.tsx);
     · its words say what the why holds: a way in for a refusal that has one,
       the conflict for a conflict, else the plain why;
     · open, the why is WhyCard whole, handed what the column hands it, and
       Focus draws it into the page's panel body — never on its own canvas;
     · nowhere else: no button on the canvas's bar, no icon on a card's head,
       nothing on ClassicV2Layout or the builder's Check access.

   A server render runs no effect and has no DOM to portal into, so the link and
   the why are drawn by a small host that does what Focus2Layout does with them
   (the outcome card open, the why beside it rather than in a panel), and how
   Focus2Layout portals the why is pinned from its source — as why-ui.test.tsx
   pins the column's.
   -------------------------------------------------------------------------- */

const TODAY = '2026-10-02'
const t = showcaseTenant()
const env = envOf(t)
const lib = { zones: t.zones, fingerprints: t.fingerprints }
const AS_IT_STANDS: ColumnSpec = { id: 'live', label: 'As the tenant stands', tip: 'Every policy as saved' }
const noop = () => {}

/* A settled run of the showcase tenant, as the page hands it to a layout (focus2-layout.test.tsx's own). */
function propsOf(personName: string, appName: string, opts: { origin?: 'home' | 'tor'; patch?: Partial<SignInForm> } = {}): RunLayoutProps {
  const person = t.directory.people.find((p) => p.name === personName) ?? null
  const app = t.apps.find((a) => a.name === appName) ?? null
  if (!person || !app) throw new Error(`no ${personName} or ${appName} in the showcase`)
  const rows = rowsRead(t.policies, null, app.id, lib)
  const base: SignInForm = { ...emptyDraft(TODAY, '09:30'), ...(opts.origin ? originPatch(opts.origin) : {}), personId: person.id, appId: app.id }
  const form = { ...forRun(withDefaults(base, rows, [], TODAY, '09:30'), rows), ...(opts.patch ?? {}) } as SignInForm
  const { facts } = factsOf(form, t.zones)
  const cols = runColumns([AS_IT_STANDS], t.policies, facts, env)
  const res = cols[0].resolution
  const ctx = { people: t.directory.people, apps: t.apps, zones: t.zones, rows }
  const plan = engineRun({ res, policies: t.policies, form, facts, env, ctx, intro: 'none' })
  return {
    plan,
    s: plan.steps.length - 1,
    running: false,
    animate: false,
    reduced: true,
    jumped: true,
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

/* The page's why, and what it hands under a refusal (SignInTests.tsx: `why`, `playForm`, `grantAccess`). */
const pageWhy = (open: boolean): Pick<RunLayoutProps, 'why' | 'onTryForm' | 'onGrant'> => ({
  why: { open, slot: null, onOpen: noop },
  onTryForm: noop,
  onGrant: noop,
})

const DENY = propsOf('Devon Rao', 'AWS Console', { patch: { device: { kind: 'preset', id: 'win10' } } as Partial<SignInForm> })
const ALLOW = propsOf('Maya Iyer', 'AWS Console')
const DEPENDS = propsOf('Arun Patel', 'GitHub Enterprise', { patch: { device: { kind: 'none' } } as Partial<SignInForm> })
const DEFAULTED = propsOf('Kavya Menon', 'HRMS')

/** Every card folded but the outcome. */
const OUTCOME_OPEN: ChainFold = { open: { 'sign-in': false, policy: false, rule: false, outcome: true }, anyOpen: true, fold: noop, set: noop, foldAll: noop }
/** Every card folded, as Focus leaves them once a run lands. */
const ALL_FOLDED: ChainFold = { open: { 'sign-in': false, policy: false, rule: false, outcome: false }, anyOpen: false, fold: noop, set: noop, foldAll: noop }

/* What Focus2Layout does with the two: the link on its chain's outcome, and the why — here beside the chain, there in the
   page's panel body. `done` is Focus's `whyDone`. */
function Host({ run, done = true, folded = false }: { run: RunLayoutProps; done?: boolean; folded?: boolean }) {
  const root = useRef<HTMLDivElement | null>(null)
  const fw = useFocusWhy(run, done, root)
  const data = useChainRun(run)
  return (
    <div ref={root}>
      <div className="rl-c2">
        <Classic2Chain run={run} data={data} fold={folded ? ALL_FOLDED : OUTCOME_OPEN} animate={false} snap start={<span className="test-start" />} signInCard={false} why={fw.link} />
      </div>
      <aside className="test-panel">{fw.card}</aside>
    </div>
  )
}
const host = (run: RunLayoutProps, done = true, folded = false) =>
  renderToStaticMarkup(
    <BrandProvider>
      <TestingSessionProvider>
        <Host run={run} done={done} folded={folded} />
      </TestingSessionProvider>
    </BrandProvider>,
  )
const focus = (run: RunLayoutProps) =>
  renderToStaticMarkup(
    <BrandProvider>
      <TestingSessionProvider>
        <Focus2Layout {...run} />
      </TestingSessionProvider>
    </BrandProvider>,
  )

/** The link's button, whole, or '' when there is none. */
const linkOf = (html: string) => html.match(/<button type="button" class="rl-c2__why"[^>]*>[\s\S]*?<\/button>/)?.[0] ?? ''
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ').trim()
/** The why's section, in the host's stand-in for the page's panel. */
const panelOf = (html: string) => html.slice(html.indexOf('class="test-panel"'))

/* The source, its line ends made plain (the checkout may hand it CRLF). */
const plain = (s: string) => s.replace(/\r\n/g, '\n')
const layoutSrc = plain(layoutRaw)
const whySrc = plain(whyRaw)
const chainSrc = plain(chainRaw)
const classicSrc = plain(classicRaw)
const barSrc = plain(barRaw)
const hostSrc = plain(hostRaw)
const journeySrc = plain(journeyRaw)

describe('the way in: one quiet link at the foot of the outcome card', () => {
  it('is on, as a named flag', () => {
    expect(WHY_IN_FOCUS).toBe(true)
  })

  it('is drawn only where the page hands its why', () => {
    expect(linkOf(host(DENY))).toBe('')
    expect(host(DENY)).not.toContain('rl-c2__why')
    const link = linkOf(host({ ...DENY, ...pageWhy(false) }))
    expect(link).not.toBe('')
    expect(link).toContain('aria-expanded="false"')
    expect(link).not.toContain('aria-controls')
  })

  it('never before the presented run has landed: nothing playing, or no link', () => {
    expect(linkOf(host({ ...DENY, ...pageWhy(false) }, false))).toBe('')
    expect(panelOf(host({ ...DENY, ...pageWhy(true) }, false))).not.toContain('tj-why')
  })

  it('sits under the outcome’s head, folded or not — never in the head’s own buttons, never only in the body (owner, 6 Oct 2026)', () => {
    for (const folded of [true, false]) {
      const out = host({ ...DENY, ...pageWhy(false) }, true, folded)
      const card = out.slice(out.indexOf('data-card="outcome"'))
      const head = card.slice(0, card.indexOf('rl-c2__whyunder'))
      expect(card, `folded ${folded}`).toContain('rl-c2__whyunder')
      /* Not a head action: the head's own row ends before it. */
      expect(head, `folded ${folded}`).not.toContain('rl-c2__why"')
      /* In line with the title: an unseen tile holds the column. */
      expect(card).toMatch(/class="rl-c2__under rl-c2__whyunder"><span class="bb__idx rl-c2__idx rl-c2__whyspace" aria-hidden="true"><\/span><button type="button" class="rl-c2__why"/)
      if (!folded) {
        const body = card.slice(card.indexOf('class="bb__tbody"'))
        expect(body).not.toContain('rl-c2__why')
      }
    }
  })

  it('says what the why holds: a way in for a refusal that has one, the conflict for a conflict, else the plain why', () => {
    /* Devon, refused on a Windows 10 laptop: Let in for a while is a way in. */
    expect(text(linkOf(host({ ...DENY, ...pageWhy(false) })))).toBe(WHY_GET_IN_LINK)
    /* Without the page's ways in, a refusal is only its why. */
    expect(text(linkOf(host({ ...DENY, why: pageWhy(false).why })))).toBe(WHY_LINK)
    /* Maya is in Engineering and Finance: a conflict, said as the column's strip says it. */
    expect(heroFinding(ALLOW.plan)?.tone).toBe('conflict')
    expect(text(linkOf(host({ ...ALLOW, ...pageWhy(false) })))).toBe(WHY_CONFLICT_LINK)
    expect(whyLinkLabel({ refused: true, waysIn: true, conflict: true })).toBe(WHY_GET_IN_LINK)
    expect(whyLinkLabel({ refused: true, waysIn: false, conflict: false })).toBe(WHY_LINK)
    expect(whyLinkLabel({ refused: false, waysIn: true, conflict: false })).toBe(WHY_LINK)
    expect(whyLinkLabel({ refused: false, waysIn: false, conflict: true })).toBe(WHY_CONFLICT_LINK)
  })

  it('is offered by the column’s own rule: a title, and a finding or a reason under it', () => {
    for (const run of [DENY, ALLOW, DEPENDS, DEFAULTED]) {
      const c = run.plan.conflicts
      const said = (c?.findings.length ?? 0) > 0 && !!c?.headline
      const refused = run.plan.outcome.status === 'decided' && run.plan.outcome.decision === 'deny'
      expect(linkOf(host({ ...run, ...pageWhy(false) })) !== '', run.plan.appName).toBe(said || refused)
    }
    /* The very expressions the column decides it by. */
    for (const line of ['const hasWhy = whyHead !== null && (items.length > 0 || reason !== null)', "(whyTitleOf(plan) ?? (reason ? { text: DENY_REASON_WORD[reason], tone: 'info' as const } : null) ?? (attempts ? attemptsTitle(attempts) : null))"]) {
      expect(journeySrc, line).toContain(line)
      expect(whySrc, line).toContain(line)
    }
  })

  it('keeps to the house words', () => {
    for (const w of [WHY_LINK, WHY_CONFLICT_LINK, WHY_GET_IN_LINK]) {
      expect(w).toMatch(/^[A-Z][a-z ,]*$/)
      expect(w).not.toMatch(/\b(AI|assistant|log ?ins?|logs? in|gauntlet|blast radius|rehearse)\b/i)
    }
  })
})

describe('what it opens: the why, whole, in the page’s panel', () => {
  it('open, the why is the column’s own — its id the link’s aria-controls, How to get in and Let in for a while under a refusal', () => {
    const out = host({ ...DENY, ...pageWhy(true) })
    const link = linkOf(out)
    expect(link).toContain('aria-expanded="true"')
    const id = link.match(/aria-controls="([^"]+)"/)?.[1]
    expect(id).toBeTruthy()
    const panel = panelOf(out)
    expect(panel).toContain(`<section id="${id}" class="tj-why" data-node="why"`)
    expect(panel).toContain('Let in for a while')
    expect(panel).toContain('aria-label="Copy summary"')
    /* The reason is the title of a refusal with nothing louder to say: admin words, in the admin's panel. */
    expect(text(panel).length).toBeGreaterThan(40)
  })

  it('shut, there is no why — and without the page’s why, none at all', () => {
    expect(panelOf(host({ ...DENY, ...pageWhy(false) }))).not.toContain('tj-why')
    expect(panelOf(host(DENY))).not.toContain('tj-why')
  })

  it('a conflict’s why says each group and the rule that also applies', () => {
    const panel = panelOf(host({ ...ALLOW, ...pageWhy(true) }))
    expect(panel).toContain('class="tj-why"')
    expect(panel).toContain('As each group')
    expect(panel).not.toContain('Let in for a while')
  })

  it('Focus never draws the why on its own canvas: it goes into the page’s panel body, or nowhere', () => {
    for (const run of [DENY, ALLOW]) {
      for (const why of [undefined, pageWhy(true), pageWhy(false)]) {
        let out = ''
        expect(() => {
          out = focus({ ...run, ...(why ?? {}) })
        }).not.toThrow()
        expect(out).not.toContain('class="tj-why"')
      }
    }
    expect(layoutSrc).toContain('const whyDone = landed && !running && !presenting')
    expect(layoutSrc).toContain('const focusWhy = useFocusWhy(props, whyDone, rootRef)')
    expect(layoutSrc).toContain('why={focusWhy.link}')
    /* Portalled beside the stage, not inside it: after RunStage closes, before the root does. */
    const portal = '{focusWhy.card && props.why?.slot && createPortal(focusWhy.card, props.why.slot)}'
    expect(layoutSrc).toContain(portal)
    expect(layoutSrc.indexOf(portal)).toBeGreaterThan(layoutSrc.lastIndexOf('</RunStage>'))
  })

  it('shut by a press that runs, the focus is the page’s: the way back answers only the why’s own X', () => {
    /* How to get in's what-if and As each group shut the panel for a run, and the page hands the focus to that run's
       canvas once the panel has slid out (SignInTests.tsx `toCanvas`): the hook stands back for every shut but the X. */
    expect(whySrc).toMatch(/const close = useCallback\(\(\) => \{\s*shutOwn\.current = true\s*latest\.current\.why\?\.onOpen\(false\)/)
    expect(whySrc).toMatch(/if \(!was \|\| whyOpen\) return\s*const own = shutOwn\.current\s*shutOwn\.current = false\s*if \(!own\) return/)
    /* The X is the hook's own close; the runs are the page's, handed through untouched. */
    expect(whySrc).toContain('onClose={close}')
    expect(whySrc).toContain('onGetIn={onTryForm}')
    expect(whySrc).toContain('onAsGroup={onAsGroup}')
  })

  it('the page hands Focus what it hands the column: How to get in, the grant, and whose policy it may go to', () => {
    for (const prop of ['onTryForm={onTryForm}', 'onGrant={onGrant}', 'grantFor={grantFor}', 'why={why}']) expect(hostSrc.split(prop).length - 1, prop).toBe(2)
  })
})

describe('nowhere else', () => {
  it('no button on the canvas’s bar, no icon on a card’s head', () => {
    /* Code, not prose: a comment in the bar may say the word "why"; a way into it may not be there. */
    expect(barSrc).not.toMatch(/WhyCard|useFocusWhy|\bwhy=\{|\b(?:props|run)\.why\b|\bonWhy\b|Review conflict|how to get in/i)
    const barCall = layoutSrc.slice(layoutSrc.indexOf('<Focus2CanvasBar'), layoutSrc.indexOf('/>', layoutSrc.indexOf('<Focus2CanvasBar')))
    expect(barCall).not.toMatch(/why/i)
    /* The chain hands the link to the outcome alone, and the outcome draws it in its body. */
    expect(chainSrc).toContain("why={k === 'outcome' ? why : null}")
    expect(chainSrc).toContain('why={deciding ? null : why}')
  })

  it('ClassicV2Layout hands its chain no why: the link is Focus’s alone', () => {
    expect(classicSrc).not.toMatch(/why=\{/)
  })
})
