import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { showcaseTenant } from '../../../fixtures'
import { BrandProvider } from '../../../store'
import canvasViewRaw from '../../canvas-view.ts?raw'
import boardRaw from '../../board/Board.tsx?raw'
import css from '../../board/board-run.css?raw'
import { columnView, runColumns, type ColumnSpec } from '../../board/try-sign-in'
import { envOf } from '../../tenant-resolver'
import { rowsRead } from '../../testing/rows-read'
import { screensOf } from '../../testing/screens-of'
import { TestingSessionProvider } from '../../testing/session'
import { factsOf, typedAddressPatch, type SignInForm } from '../../testing/sign-in-form'
import { CheckVersionOverride, type CheckVersion } from '../check-version'
import { engineRun } from '../engine-run'
import { emptyDraft, forRun, withDefaults } from '../sign-in-card'
import Focus2Layout from './Focus2Layout'
import layoutRaw from './Focus2Layout.tsx?raw'
import type { RunLayoutProps } from './types'

/* -----------------------------------------------------------------------------
   CHECK ACCESS V3 DRAWN (20 Oct 2026; phase.ts BUILDER_CANVAS_CHECK): the run
   on the builder's own canvas, as Focus draws it settled — the sign-in, the
   policy's head, the policy's own RuleCards and Nothing else matched, the
   outcome at the chain's end. Static markup only (no effect runs): what is
   drawn, its ids and its names; the motion is checked in the browser. And the
   pins the canvas keeps: its sheet's tokens, Board's camera switched off.
   -------------------------------------------------------------------------- */

const TODAY = '2026-10-02'
const t = showcaseTenant()
const env = envOf(t)
const lib = { zones: t.zones, fingerprints: t.fingerprints }
const AS_IT_STANDS: ColumnSpec = { id: 'live', label: 'As the tenant stands', tip: 'Every policy as saved' }
const noop = () => {}

function propsOf(personName: string, appName: string, patch: Partial<SignInForm> = {}): RunLayoutProps {
  const person = t.directory.people.find((p) => p.name === personName)
  const app = t.apps.find((a) => a.name === appName)
  if (!person || !app) throw new Error(`no ${personName} or ${appName} in the showcase`)
  const rows = rowsRead(t.policies, null, app.id, lib)
  const base: SignInForm = { ...emptyDraft(TODAY, '09:30'), personId: person.id, appId: app.id }
  const form = { ...forRun(withDefaults(base, rows, [], TODAY, '09:30'), rows), ...patch } as SignInForm
  const { facts } = factsOf(form, t.zones)
  const cols = runColumns([AS_IT_STANDS], t.policies, facts, env)
  const res = cols[0].resolution
  const plan = engineRun({ res, policies: t.policies, form, facts, env, ctx: { people: t.directory.people, apps: t.apps, zones: t.zones, rows }, intro: 'none' })
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

/* Drawn once per run and version (20 Oct 2026, evening): a static paint of the whole canvas is the slow part, and the
   file paints the same seven runs over and over — under a loaded suite the per-test cap was the thing that failed. */
const drawn = new Map<RunLayoutProps, Map<CheckVersion, string>>()
const draw = (p: RunLayoutProps, version: CheckVersion = 'v3'): string => {
  const mine = drawn.get(p) ?? new Map<CheckVersion, string>()
  drawn.set(p, mine)
  const hit = mine.get(version)
  if (hit !== undefined) return hit
  const out = renderToStaticMarkup(
    <CheckVersionOverride.Provider value={version}>
      <BrandProvider>
        <TestingSessionProvider>
          <Focus2Layout {...p} />
        </TestingSessionProvider>
      </BrandProvider>
    </CheckVersionOverride.Provider>,
  )
  mine.set(version, out)
  return out
}

/** The run's own region, `.bbr`, from its opening tag to the end of the chain's wrapper. */
function regionOf(html: string): string {
  const at = html.indexOf('class="bbr ')
  if (at < 0) return ''
  return html.slice(html.lastIndexOf('<', at))
}
/** One card of the head or the outcome (`data-card`), from its tag to the next one's. */
function cardOf(html: string, key: 'policy' | 'outcome'): string {
  const at = html.indexOf(`data-card="${key}"`)
  if (at < 0) return ''
  const from = html.lastIndexOf('<', at)
  const next = key === 'policy' ? html.indexOf('class="bb__stage', at) : html.indexOf('class="f2cb"', at)
  return html.slice(from, next > 0 ? next : undefined)
}
const count = (html: string, needle: string) => html.split(needle).length - 1
/** Board's own stage in the region: the policy's cards and their groups, up to the outcome. */
function stageOf(bbr: string): string {
  const at = bbr.indexOf('class="bb__stage')
  const out = bbr.indexOf('data-card="outcome"')
  return at < 0 ? '' : bbr.slice(at, out > at ? out : undefined)
}
/** One element's opening tag by its id. */
const tagOf = (html: string, id: string): string => {
  const at = html.indexOf(` id="${id}"`)
  if (at < 0) return ''
  return html.slice(html.lastIndexOf('<', at), html.indexOf('>', at) + 1)
}

const AISHA = propsOf('Aisha Khan', 'Google Workspace')
const KAVYA = propsOf('Kavya Menon', 'HRMS')
const MAYA = propsOf('Maya Iyer', 'AWS Console')
const DENY = propsOf('Devon Rao', 'AWS Console', { device: { kind: 'preset', id: 'win10' } } as Partial<SignInForm>)
const DEPENDS = propsOf('Aisha Khan', 'Google Workspace', { device: { kind: 'none' } } as Partial<SignInForm>)
const RUNS = [
  { name: 'Aisha on Google Workspace (Allow)', props: AISHA },
  { name: 'Kavya on HRMS (the Global Default)', props: KAVYA },
  { name: 'Maya on AWS (a conflict)', props: MAYA },
  { name: 'Devon on a Windows 10 laptop (Deny)', props: DENY },
  { name: 'Aisha with no device (Depends)', props: DEPENDS },
]

describe('the run on the builder\'s canvas, drawn settled', { timeout: 60_000 }, () => {
  it('is one region named by the sentence, the sign-in first, the policy\'s head, its own cards, the outcome last', () => {
    const out = draw(AISHA)
    expect(count(out, 'class="bbr ')).toBe(1)
    const bbr = regionOf(out)
    expect(bbr).toMatch(/^<div class="bbr is-out-allow" role="group" aria-label="Aisha Khan signs in to Google Workspace"/)
    expect(bbr.indexOf('data-node="sign-in"')).toBeGreaterThan(0)
    expect(bbr.indexOf('data-node="sign-in"')).toBeLessThan(bbr.indexOf('data-card="policy"'))
    expect(bbr.indexOf('data-card="policy"')).toBeLessThan(bbr.indexOf('class="bb__stage is-centre is-run"'))
    const cards = [...bbr.matchAll(/data-card="(policy|outcome)"/g)].map((m) => m[1])
    expect(cards).toEqual(['policy', 'outcome'])
    /* The policy's four cards, the builder's own: three rules, then Nothing else matched. */
    expect(count(bbr, 'class="bb__card is-')).toBe(4)
    expect(bbr.lastIndexOf('class="bb__card is-terminal')).toBeLessThan(bbr.indexOf('data-card="outcome"'))
  })

  it('draws the policy\'s head alone: its name, its group, and no meta or rows, with its own fold (20 Oct 2026)', () => {
    const head = cardOf(draw(AISHA), 'policy')
    expect(head).toContain('aria-label="Policy: Access the app through corporate devices only"')
    expect(head).not.toContain('rl-c2__meta')
    expect(head).not.toContain('rl-c2__rules')
    expect(head).toContain('aria-label="Hide the policy"')
  })

  it('reads the cards, never edits them: no add, switch, menu, padlock, dock, start node, lock or decode once settled', () => {
    for (const { name, props } of RUNS) {
      const bbr = regionOf(draw(props))
      expect(bbr, name).not.toBe('')
      for (const gone of ['bb__link__add', 'bb__link__hint', 'bx-toggle', 'bx-rowmenu', 'bb__lockmark', 'bb__dock', 'id="bb-start"', 'is-r-lock', 'rl-dec', 'Always on', 'aria-label="Reorder rule']) expect(bbr, `${name} ${gone}`).not.toContain(gone)
    }
  })

  it('never repeats the edit board\'s ids, finds each card by its rule, and names every description it points at', () => {
    for (const { name, props } of RUNS) {
      const out = draw(props)
      const bbr = regionOf(out)
      const ids = [...bbr.matchAll(/ id="([^"]*bb-(?:rule|terminal)-[^"]*)"/g)].map((m) => m[1])
      expect(ids.length, name).toBeGreaterThan(0)
      for (const id of ids) expect(id, name).toMatch(/^run-/)
      const cards = [...bbr.matchAll(/<div class="bb__card is-[^"]*is-run[^"]*"[^>]*>/g)].map((m) => m[0])
      expect(cards.length, name).toBe(props.plan.rules.length)
      for (const c of cards) expect(c, name).toMatch(/data-rule-row="[^"]+"/)
      for (const m of bbr.matchAll(/aria-describedby="([^"]+)"/g)) expect(out, `${name} ${m[1]}`).toContain(`id="${m[1]}"`)
      /* Ids are unique on the page. */
      const all = [...out.matchAll(/ id="([^"]+)"/g)].map((m) => m[1])
      expect(new Set(all).size, name).toBe(all.length)
    }
  })

  /* 20 Oct 2026, evening: no rule card carries its outcome any more — the decision's colour is the deciding card's
     edge, tile and line, and the outcome under it. */
  it('tones one card of the policy\'s, the one that decided, and draws no badge on any of them', () => {
    const bbr = regionOf(draw(AISHA))
    expect(count(bbr, 'is-r-decided')).toBe(1)
    expect(stageOf(bbr)).not.toContain('bx-decision-badge')
    expect(bbr).not.toContain('bbr__badge')
  })

  it('draws an Allow outcome as its head alone: no fold, no then, no "decided by"', () => {
    const outcome = cardOf(draw(AISHA), 'outcome')
    expect(outcome).toContain('Allow on 1 factor')
    expect(outcome).not.toContain('bb__fold__btn')
    expect(outcome.toLowerCase()).not.toContain('decided by')
  })

  /* 20 Oct 2026, evening: where a rule decided before the end, the rules never reached fold under it and its 40 px
     connector is the route, so no lane is drawn until the tail is opened by hand; a Depends keeps its dashed lane. */
  it('draws no lane where a rule decided and the rest are folded; a Depends\'s possible lane from the card that cannot be told', () => {
    for (const { name, props } of RUNS.filter((r) => r.props !== DEPENDS)) expect(regionOf(draw(props)), name).not.toContain('is-lane-')
    const slots = [...regionOf(draw(DEPENDS)).matchAll(/<div class="bb__runslot([^"]*)"/g)].map((m) => m[1].trim())
    expect(slots[0]).toContain('is-lane-from')
    expect(slots[0]).toContain('is-lane-possible')
    expect(slots.some((c) => c.includes('is-lane-to'))).toBe(true)
    /* Drawn settled, the lane is at rest. */
    expect(slots.filter((c) => c.includes('is-lane-')).every((c) => c.includes('is-lane-rest'))).toBe(true)
  })

  it('puts no transform on Board\'s world and no view on its stage', () => {
    for (const { name, props } of RUNS) {
      const bbr = regionOf(draw(props))
      expect(bbr, name).toMatch(/<div class="bb__world">/)
      expect(bbr, name).not.toMatch(/class="bb__world"[^>]*style=/)
      expect(bbr, name).not.toMatch(/class="bb__stage[^"]*"[^>]*(tabindex|aria-label)=/i)
      /* Motion's own settled style says `transform:none`; nothing here translates or scales. */
      expect(bbr, name).not.toMatch(/translate|scale\(/)
    }
  })

  it('draws no canvas in Classic: the chain, as it was', () => {
    for (const { name, props } of RUNS) {
      const out = draw(props, 'classic')
      expect(out, name).not.toContain('class="bbr ')
      expect(out, name).not.toContain('bb__runslot')
      expect(out, name).toContain('class="rl-c2__chain"')
    }
  })
})

/* -----------------------------------------------------------------------------
   THE ROWS READ AT A GLANCE (20 Oct 2026, evening; the owner on Maya Iyer → AWS
   Console: "be specific … Whatever is not reached can be collapsed, and the
   outcome can be shown … put it under it"; scan/spec.md §9): each card's words
   on a line of their own under its name, the rules never reached folded onto
   the connector under the deciding card as one disclosure, walked misses that
   say the same stacked into one card, the conflict one note on the deciding
   card, the outcome the tail's next sibling.
   -------------------------------------------------------------------------- */

const THOMAS = propsOf('Thomas Byrne', 'AWS Console')
/* Kavya Menon from the address the Recently blocked row shows (192.0.2.82): every HRMS rule of the Global Default misses on it. */
const KAVYA_BLOCKED = propsOf('Kavya Menon', 'HRMS', typedAddressPatch('192.0.2.82') as Partial<SignInForm>)
/** Visible words of some markup: tags, React's text separators and screen-reader-only spans gone. */
const words = (html: string) =>
  html
    .replace(/<span class="u-sr-only">[^<]*<\/span>/g, '')
    .replace(/<!-- -->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/* Their own cap, as focus2-layout.test.tsx's paint-heavy tests have (20 Oct 2026, evening): each paints whole canvases. */
describe('the rows read at a glance', { timeout: 60_000 }, () => {
  it('puts every card\'s words on a line under its name, never beside it', () => {
    for (const { name, props } of [...RUNS, { name: 'Thomas on AWS', props: THOMAS }]) {
      const bbr = regionOf(draw(props))
      expect(bbr, name).not.toContain('bbr__said')
      /* Each line follows the closed title row (a rule card's span, the last row's div), never inside it. */
      const lines = count(bbr, 'class="bbr__statewrap')
      const after = [...bbr.matchAll(/<\/button>(?:<span class="[^"]*bx-badge[^"]*">[^<]*<\/span>)?<\/(?:span|div)><span class="bbr__statewrap/g)].length
      expect(lines, name).toBeGreaterThan(0)
      expect(after, name).toBe(lines)
    }
  })

  it('Maya Iyer on AWS: rule 1 says what failed, rule 2 decides with the conflict as its note, the rest fold under it', () => {
    const out = draw(MAYA)
    const bbr = regionOf(out)
    expect(words(bbr)).toContain('Not matched · Maya Iyer is not in Contractors')
    expect(words(bbr)).toContain('Matches · via Engineering')
    expect(bbr).toMatch(/class="bbr__also" aria-hidden="true">Rule 4 also matches · via Finance · not used</)
    expect(count(bbr, 'class="bbr__also"')).toBe(1)
    /* One disclosure, folded, with its words; it controls the body that holds rules 3–6 and Nothing else matched. */
    expect(count(bbr, 'class="bbr__groupbtn"')).toBe(1)
    const btn = tagOf(bbr, 'run-bbr-tail-btn')
    expect(btn).toContain('aria-expanded="false"')
    expect(btn).toContain('aria-controls="run-bbr-tail-body"')
    expect(words(bbr.slice(bbr.indexOf(' id="run-bbr-tail-btn"'), bbr.indexOf(' id="run-bbr-tail-body"')))).toContain('Not reached · rules 3–6 and Nothing else matched')
    const body = tagOf(bbr, 'run-bbr-tail-body')
    expect(body).toContain('role="group"')
    expect(body).toContain('aria-label="Not reached"')
    expect(body).toMatch(/ inert=""/)
    /* The tail sits after the card that decided and holds the five cards below it; the outcome is its next sibling, its
       own connector standing down (the tail's is the route). */
    const tail = bbr.indexOf('class="bbr__group is-tail')
    const outSlot = bbr.indexOf('class="bb__runslot is-out"')
    expect(bbr.indexOf('is-r-decided')).toBeLessThan(tail)
    expect(tail).toBeLessThan(outSlot)
    expect(count(bbr.slice(tail, outSlot), 'data-rule-row=')).toBe(5)
    expect(bbr.slice(outSlot, outSlot + 120)).toMatch(/^class="bb__runslot is-out"><div class="bb__link is-bare is-hidden"/)
    expect(bbr).not.toContain('is-lane-')
  })

  it('Kavya Menon blocked on HRMS: the two misses that say the same are one stack card, and nothing folds below the last row', () => {
    const bbr = regionOf(draw(KAVYA_BLOCKED))
    expect(count(bbr, 'class="bb__card bbr__stackcard')).toBe(1)
    expect(bbr).toContain('<span class="bb__idx__n">1–2</span>')
    expect(bbr).not.toContain('bbr__group is-tail')
    const title = tagOf(bbr, 'run-bbr-stack-0-title')
    expect(title).toContain('aria-expanded="false"')
    expect(title).toContain('aria-controls="run-bbr-stack-0-body"')
    const body = tagOf(bbr, 'run-bbr-stack-0-body')
    expect(body).toContain('aria-label="Rules 1–2"')
    expect(body).toMatch(/ inert=""/)
    expect(words(bbr)).toContain('Not matched · 192.0.2.82 is not in Operating countries')
  })

  it('Thomas Byrne on AWS: rules 1–3 stack with the groups they name; rules 5–6 and Nothing else matched fold under rule 4', () => {
    const bbr = regionOf(draw(THOMAS))
    expect(bbr).toContain('<span class="bb__idx__n">1–3</span>')
    expect(words(bbr)).toContain('Thomas Byrne is not in Contractors, Engineering or DevOps')
    expect(words(bbr)).toContain('Not reached · rules 5–6 and Nothing else matched')
    expect(bbr).toMatch(/class="bbr__also" aria-hidden="true">Rule 5 also matches · by name · not used</)
  })

  it('says the stack and the deciding card once for a screen reader, and names every id it points at', () => {
    for (const { name, props } of [...RUNS, { name: 'Thomas on AWS', props: THOMAS }, { name: 'Kavya blocked', props: KAVYA_BLOCKED }]) {
      const out = draw(props)
      const bbr = regionOf(out)
      for (const m of bbr.matchAll(/ id="([^"]*bbr-[^"]*)"/g)) expect(m[1], name).toMatch(/^run-bbr-/)
      for (const m of bbr.matchAll(/aria-(?:controls|describedby)="([^"]+)"/g)) expect(out, `${name} ${m[1]}`).toContain(`id="${m[1]}"`)
      /* The line, its note and its tokens are hidden: the title's description says them. */
      for (const m of bbr.matchAll(/<span class="bbr__state is-[a-z]+"([^>]*)>/g)) expect(m[1], name).toContain('aria-hidden="true"')
    }
    expect(regionOf(draw(MAYA))).toContain('Matches · via Engineering, then Allow on 1 factor. Rule 4 also matches · via Finance · not used')
    expect(regionOf(draw(THOMAS))).toContain('Rules 1–3: Contractors away from the office; Engineers on a compliant device; Contractors in the office. Not matched · Thomas Byrne is not in Contractors, Engineering or DevOps')
  })

  /* The keys' stops as the browser would find them (board-run-fold.ts RUN_STOPS less RUN_STOP_AWAY), walked off the
     static markup: the folded tail's label is a stop, the cards folded into it are not; a stack is its title. */
  it('walks the titles and the labels with the keys, never into a folded group', () => {
    const stops = (html: string) => {
      const out: string[] = []
      const stack: { tag: string; away: boolean; card: boolean }[] = []
      const VOID = new Set(['input', 'img', 'br', 'hr', 'meta', 'link', 'source', 'col', 'area', 'wbr'])
      for (const m of html.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*?)(\/?)>/g)) {
        const [, close, tag, attrs, self] = m
        if (close) {
          while (stack.length && stack.pop()!.tag !== tag);
          continue
        }
        const cls = /class="([^"]*)"/.exec(attrs)?.[1] ?? ''
        const away = / (inert|hidden)=""/.test(attrs) || stack.some((s) => s.away)
        const card = /\bbb__card\b/.test(cls) || stack.some((s) => s.card)
        if (tag === 'button' && !away && ((card && /\bbb__titlebtn\b/.test(cls)) || /\bbbr__groupbtn\b/.test(cls))) out.push(/id="([^"]*)"/.exec(attrs)?.[1] ?? cls)
        if (!self && !VOID.has(tag)) stack.push({ tag, away, card })
      }
      return out
    }
    const maya = stops(stageOf(regionOf(draw(MAYA))))
    expect(maya.map((id) => id.replace(/^run-bb-rule-.+-title$/, 'rule'))).toEqual(['rule', 'rule', 'run-bbr-tail-btn'])
    const kavya = stops(stageOf(regionOf(draw(KAVYA_BLOCKED))))
    expect(kavya).toEqual(['run-bbr-stack-0-title', 'run-bb-terminal-title'])
  })

  it('a Depends folds nothing: every card stands, the first that cannot be told says so', () => {
    const bbr = regionOf(draw(DEPENDS))
    expect(bbr).not.toContain('bbr__group is-tail')
    expect(bbr).not.toContain('bbr__stackcard')
    expect(words(bbr)).toContain('Can’t tell · Device not stated')
    expect(words(bbr)).toContain('If not')
  })
})

describe('the pins the canvas keeps', () => {
  const code = css.replace(/\/\*[\s\S]*?\*\//g, '')

  it('keeps its sheet to the tokens: no colour literal, transform, transition, brand or pixel but the column', () => {
    expect(code).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i)
    expect(code).not.toMatch(/\btransform\s*:|\btransition\s*:/)
    expect(code).not.toContain('--brand')
    expect(code.match(/\d+(\.\d+)?px/g)).toEqual(['520px'])
    expect(code).toContain('@media (prefers-reduced-motion: reduce)')
  })

  /* 20 Oct 2026, evening: everything new moves by a keyframe that plays only under `.is-play`, and reduced motion takes
     each of them off by name. */
  it('takes every new move off under reduced motion: the line, its tokens, the groups\' folds', () => {
    const reduced = code.slice(code.indexOf('@media (prefers-reduced-motion: reduce)'))
    const block = reduced.slice(0, reduced.indexOf('@media (forced-colors'))
    for (const name of ['.bbr__statewrap', '.bbr__tok', '.bbr__groupbody', '.bbr__stackhead', '.bbr__edge', '.bbr__groupbtn', '.bbr__also', '.bbr__stackcard']) expect(block, name).toContain(name)
    for (const kf of ['bbr-line-in', 'bbr-tok-in', 'bbr-tok-hit', 'bbr-fold-shut', 'bbr-fold-open', 'bbr-edge-grow']) {
      expect(code, kf).toContain(`@keyframes ${kf}`)
      /* Each plays under `.is-play` only, so a run drawn settled draws its last frame. */
      for (const m of code.matchAll(new RegExp(`([^{}]+)\\{[^{}]*animation(?:-name)?:[^;]*\\b${kf}\\b`, 'g'))) expect(m[1], kf).toContain('.is-play')
    }
    /* No badge and no inline word are left in the sheet. */
    expect(code).not.toMatch(/bbr__badge|bbr__said|bbr__word|bbr__check\b/)
  })

  it('scopes every rule to the run\'s region', () => {
    /* Keyframes' own steps are not selectors. */
    const rules = code.replace(/@keyframes[^{]*\{(?:[^{}]*\{[^}]*\})*[^}]*\}/g, '')
    /* A selector list split on its own commas, never one inside :is(…). */
    const split = (list: string) => list.split(/,(?![^(]*\))/).map((x) => x.trim())
    const selectors = [...rules.matchAll(/([^{}@]+)\{[^{}]*\}/g)].flatMap((m) => split(m[1])).filter(Boolean)
    expect(selectors.length).toBeGreaterThan(20)
    for (const sel of selectors) expect(sel).toMatch(/\.bbr\b/)
  })

  it('switches Board\'s camera off rather than overriding it: no listener, no fit, no transform while still', () => {
    const src = canvasViewRaw.replace(/\r\n/g, '\n')
    expect(src).toContain('still?: boolean')
    for (const guard of ['if (!w || !s || o.current.still) return', 'if (o.current.still) return', "typeof ResizeObserver === 'undefined' || o.current.still", 'if (!s || o.current.still) return', 'if (e.button !== 0 || o.current.still) return']) expect(src, guard).toContain(guard)
    /* The wheel and the focus-in glide both stand down. */
    expect(src.split('if (!s || o.current.still) return').length - 1).toBeGreaterThanOrEqual(2)
    /* Board passes it only under a run, and draws no transform on its world then. */
    const board = boardRaw.replace(/\r\n/g, '\n')
    expect(board).toContain('still: !!run,')
    expect(board).toContain('<div ref={world} className="bb__world">')
  })

  it('draws v3 in the chain\'s place, under the same wrapper', () => {
    const src = layoutRaw.replace(/\r\n/g, '\n')
    expect(src).toContain('{runFlags.canvas ? (')
    expect(src).toContain('<BoardRunChain')
    expect(src.match(/<Classic2Chain\b/g)?.length).toBe(1)
    expect(src.match(/key="chain"/g)?.length).toBe(1)
  })
})
