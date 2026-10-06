import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { showcaseTenant } from '../../../fixtures'
import { BrandProvider } from '../../../store'
import { columnView, runColumns, type ColumnSpec } from '../../board/try-sign-in'
import { envOf } from '../../tenant-resolver'
import type { Via } from '../conflicts'
import { rowsRead } from '../../testing/rows-read'
import { screensOf } from '../../testing/screens-of'
import { TestingSessionProvider } from '../../testing/session'
import { factsOf, formOf, originPatch, type SignInForm } from '../../testing/sign-in-form'
import { engineRun } from '../engine-run'
import { emptyDraft, forRun, withDefaults } from '../sign-in-card'
import ClassicV2Layout from './ClassicV2Layout'
import {
  ALSO_WORDS,
  CARDS,
  arrivals,
  cardsAt,
  conditionsWord,
  factRows,
  foldAllWord,
  foldOpen,
  metaWords,
  outcomeHead,
  outcomeView,
  passedLine,
  passedOver,
  policyHead,
  policyRows,
  ruleHead,
  ruleShown,
  signInHead,
  workingOn,
} from './classic2-model'
import { rowFacts } from './shared/sign-in-row'
import type { RunLayoutProps } from './types'
import pageSrc from './ClassicV2Layout.tsx?raw'
import chainSrc from './classic2-chain.tsx?raw'
import ruleCardSrc from '../../board/RuleCard.tsx?raw'
import css from './classic2.css?raw'

/* -----------------------------------------------------------------------------
   Classic v2 (owner, 5 Oct 2026: "4 basic cards … as basic as you can"; then
   "they want the same cards … focus on the cards and the vertical flow only"):
   the builder's start pill, its connector, and four of its cards — the
   sign-in, the policies, the rule that passed, the outcome — each headed as
   the Overview heads its nodes, folded once the run lands. Over the showcase
   tenant's sign-ins, as layouts-render.test.tsx draws every layout: static
   markup only — the motion and the presses are checked in the browser.
   -------------------------------------------------------------------------- */

const TODAY = '2026-10-05'
const t = showcaseTenant()
const env = envOf(t)
const lib = { zones: t.zones, fingerprints: t.fingerprints }
const AS_IT_STANDS: ColumnSpec = { id: 'live', label: 'As the tenant stands', tip: 'Every policy as saved' }
const noop = () => {}

function asRun(f: SignInForm): SignInForm {
  const rows = rowsRead(t.policies, null, f.appId, lib)
  return forRun(withDefaults(f, rows, [], TODAY, '09:30'), rows)
}
const signIn = (personId: string, appId: string, extra: Partial<SignInForm> = {}): SignInForm => asRun({ ...emptyDraft(TODAY, '09:30'), ...extra, personId, appId })

function planOf(form: SignInForm) {
  const rows = rowsRead(t.policies, null, form.appId, lib)
  const { facts } = factsOf(form, t.zones)
  const cols = runColumns([AS_IT_STANDS], t.policies, facts, env)
  const res = cols[0].resolution
  const ctx = { people: t.directory.people, apps: t.apps, zones: t.zones, rows }
  return { rows, cols, res, plan: engineRun({ res, policies: t.policies, form, facts, env, ctx, intro: 'collapse' }) }
}

/** The run at a step: the first, mid-run, settled (landed), or any step `n` while it plays. */
function propsFor(form: SignInForm, at: 'first' | 'mid' | 'settled' | number): RunLayoutProps {
  const { rows, cols, res, plan } = planOf(form)
  const last = plan.steps.length - 1
  const s = at === 'first' ? 0 : at === 'mid' ? Math.floor(last / 2) : at === 'settled' ? last : at
  return {
    plan,
    s,
    running: at !== 'settled',
    animate: false,
    reduced: true,
    jumped: at === 'settled',
    runKey: 2,
    form,
    rows,
    asGroup: null,
    start: <div className="test-start" />,
    answer: <div className="test-answer" />,
    screens: screensOf(res, { policies: t.policies, methods: t.methods, defaultMethodId: undefined, person: t.directory.people.find((p) => p.id === form.personId) ?? null }),
    columns: cols.map((c) => columnView(c, '', t.policies, (id) => t.apps.find((a) => a.id === id)?.name ?? id)),
    changed: null,
    expected: null,
    weaker: null,
    onPressPerson: noop,
    onAdd: noop,
    onOpenPolicy: noop,
    onOpenRule: noop,
    onReplay: noop,
  }
}

/* The page is two files since Focus's Vertical draws the same chain (5 Oct 2026): ClassicV2Layout's canvas and dock,
   and the chain and its cards in classic2-chain.tsx. What the source has to say, or never say, holds for both. */
const layoutSrc = `${pageSrc}\n${chainSrc}`

const render = (p: RunLayoutProps) =>
  renderToStaticMarkup(
    <BrandProvider>
      <TestingSessionProvider>
        <ClassicV2Layout {...p} />
      </TestingSessionProvider>
    </BrandProvider>,
  )

/** The cards in the markup, in order. */
const cardsIn = (html: string) => [...html.matchAll(/data-card="([a-z-]+)"/g)].map((m) => m[1])
const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&')
/** Each head's three lines, in order: the kicker, the title (its tooltip), the meta line as read. */
const headsIn = (html: string) => ({
  kickers: [...html.matchAll(/class="rl-c2__kicker">([^<]*)</g)].map((m) => m[1]),
  titles: [...html.matchAll(/<strong class="rl-c2__name" title="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, '&')),
  metas: [...html.matchAll(/<em class="rl-c2__meta[^"]*">(.*?)<\/em>/g)].map((m) => text(m[1])),
})
/** One card's own markup: from its opening tag (its class first) to the next card's. */
const cardHtml = (html: string, key: string) => {
  const from = html.lastIndexOf('<div', html.indexOf(`data-card="${key}"`))
  const next = html.indexOf('data-card="', html.indexOf(`data-card="${key}"`) + 10)
  return html.slice(from, next < 0 ? undefined : html.lastIndexOf('<div', next))
}

const people = t.directory.people.slice(0, 6).map((p) => p.id)
const forms: { name: string; form: SignInForm }[] = [
  ...t.savedSignIns.map((sv) => ({ name: `saved ${sv.name}`, form: formOf(sv.facts, t.zones) })),
  ...t.apps.flatMap((a) => people.map((pid) => ({ name: `${pid} on ${a.name}`, form: signIn(pid, a.id) }))),
  ...t.apps.slice(0, 6).flatMap((a) => (['home', 'tor'] as const).map((o) => ({ name: `${people[1]} on ${a.name} from ${o}`, form: signIn(people[1], a.id, originPatch(o)) }))),
  ...t.apps.slice(0, 6).map((a) => ({ name: `${people[2]} on ${a.name}, device not stated`, form: { ...signIn(people[2], a.id), device: { kind: 'none' } } as SignInForm })),
]

const maya = signIn('u-maya', 'aws')
const leoFromHome = signIn('u-leo', 'aws', originPatch('home'))
const mayaNoDevice = { ...maya, device: { kind: 'none' } } as SignInForm
const ENGINEERING: Via = { matches: true, kind: 'groups', groups: [], named: false, label: 'Engineering', say: 'via Engineering' }

describe('Classic v2: four of the builder’s cards (classic2-model.ts)', () => {
  it('arrive as the engine reaches them: the sign-in at once, then the policies, the rule, the outcome', () => {
    const { plan } = planOf(maya)
    const at = arrivals(plan)
    expect(CARDS).toEqual(['sign-in', 'policy', 'rule', 'outcome'])
    expect(at['sign-in']).toBe(0)
    expect(at.policy).toBe(plan.at.which)
    expect(at.rule).toBe(plan.at.expand)
    expect(at.outcome).toBe(plan.at.outcome)
    expect(cardsAt(plan, 0)).toEqual(['sign-in'])
    expect(cardsAt(plan, plan.at.which)).toEqual(['sign-in', 'policy'])
    expect(cardsAt(plan, plan.at.expand)).toEqual(['sign-in', 'policy', 'rule'])
    expect(cardsAt(plan, plan.steps.length - 1)).toEqual(CARDS)
  })

  it('turn the spinner on the card the engine is still on, and on none once the answer is coming', () => {
    const { plan } = planOf(maya)
    expect(workingOn(plan, 0)).toBeNull()
    expect(workingOn(plan, plan.at.which)).toBe('policy')
    expect(workingOn(plan, plan.at.expand)).toBe('rule')
    expect(workingOn(plan, plan.at.outcome)).toBeNull()
  })

  it('an empty plan draws the sign-in alone', () => {
    const { plan } = planOf({ ...emptyDraft(TODAY, '09:30'), personId: 'u-maya', appId: null })
    expect(plan.empty).toBe(true)
    expect(cardsAt(plan, plan.steps.length - 1)).toEqual(['sign-in'])
    expect(workingOn(plan, 0)).toBeNull()
  })

  it('fold as the policy builder does: open as reached while it plays, all folded once it lands, a press standing until the next run', () => {
    expect(foldOpen(['sign-in', 'policy'], false)).toEqual({ 'sign-in': true, policy: true, rule: false, outcome: false })
    expect(foldOpen(CARDS, true)).toEqual({ 'sign-in': false, policy: false, rule: false, outcome: false })
    expect(foldOpen(CARDS, true, { rule: true })).toEqual({ 'sign-in': false, policy: false, rule: true, outcome: false })
    expect(foldOpen(['sign-in'], false, { 'sign-in': false })['sign-in']).toBe(false)
    expect(foldAllWord(true)).toBe('Collapse all')
    expect(foldAllWord(false)).toBe('Expand all')
  })

  it('says the policies one line each: Applies via the group, Also covers · not used in amber, the rest their reason', () => {
    const { plan } = planOf(maya)
    const rows = policyRows(plan, plan.steps.length - 1, ENGINEERING)
    expect(rows.map((r) => [r.name, r.standing, r.words])).toEqual([
      ['AWS for engineering teams', 'applies', 'Applies · via Engineering'],
      ['AWS billing for Finance', 'also', ALSO_WORDS],
      ['AWS production for DevOps', 'other', 'Not reached'],
      ['Global Default Policy', 'other', 'Not reached'],
    ])
    expect(rows[1].conflict).toBe(true)
    /* Mid-scan: one being asked, the rest not yet. */
    const first = policyRows(plan, plan.policies[0].scanAt ?? 0)
    expect(first[0].standing).toBe('working')
    expect(first.slice(1).every((r) => r.standing === 'waiting')).toBe(true)
    /* A policy the person is not in says so without the name: the sign-in card names them once. */
    const { plan: kavya } = planOf(signIn('u-hr-1', 'aws'))
    const words = policyRows(kavya, kavya.steps.length - 1).map((r) => r.words)
    expect(words).toContain('Not in this policy')
    expect(words.join(' ')).not.toContain('Kavya Menon')
  })

  it('says the outcome and nothing more: the decision, Decided by the policy and the rule, the factors or the Deny’s message', () => {
    const allow = propsFor(maya, 'settled')
    expect(outcomeView(allow.plan, allow.screens)).toMatchObject({
      tone: 'allow',
      title: 'Allow on 1 factor',
      by: 'Decided by AWS for engineering teams · Rule 2',
      factors: ['Password'],
      message: null,
    })
    expect(outcomeView(allow.plan, allow.screens).open?.ruleId).toBe(allow.plan.rules[allow.plan.landing ?? 0].id)

    const deny = propsFor(leoFromHome, 'settled')
    const d = outcomeView(deny.plan, deny.screens)
    expect([d.tone, d.title, d.by, d.factors]).toEqual(['deny', 'Deny', 'Decided by AWS for engineering teams · Rule 1', []])
    expect(d.message).toBeTruthy()

    const depends = propsFor(mayaNoDevice, 'settled')
    const p = outcomeView(depends.plan, depends.screens)
    expect([p.tone, p.title, p.open?.ruleId]).toEqual(['depends', 'Depends', null])
    expect(p.outcomes.map((o) => o.label)).toEqual(['If rule 2 matches', 'If not'])
    expect(p.needs).toEqual(['Device'])
  })

  it('reads the sign-in’s stated facts in form order, each as a builder condition row: [attribute] is [value]', () => {
    const rows = rowsRead(t.policies, null, 'aws', lib)
    expect(factRows(rowFacts(maya, rows, { zones: t.zones })).map((f) => [f.attr, f.op, f.value, f.cond])).toEqual([
      ['Network zone', 'is', 'Office network', 'zone'],
      ['Device profile', 'is', 'Windows 11 laptop · registered', 'fingerprint'],
    ])
    expect(factRows(rowFacts(mayaNoDevice, rows, { zones: t.zones })).map((f) => f.field)).toEqual(['address'])
  })

  it('heads each card with what was selected, as the Overview’s nodes: Maya Iyer on AWS Console', () => {
    const { plan } = planOf(maya)
    const last = plan.steps.length - 1
    const view = outcomeView(plan, propsFor(maya, 'settled').screens)
    const heads = [
      signInHead('Maya Iyer', 'AWS Console', 2),
      policyHead(plan, last, 'Maya Iyer', ENGINEERING),
      ruleHead(plan, ruleShown(plan, last, true), last),
      outcomeHead(plan, view),
    ]
    expect(heads.map((h) => h.kicker)).toEqual(['Sign-in', 'Policies', 'Rule 2 of 3', 'Outcome'])
    expect(heads.map((h) => h.title)).toEqual(['Maya Iyer', 'AWS for engineering teams', 'Engineers on a compliant device', 'Allow on 1 factor'])
    expect(heads.map((h) => metaWords(h.meta))).toEqual(['2 sign-in conditions', 'Policy 1 of 4 applies · via Engineering', 'Matches · Then Allow on 1 factor', 'Decided by Rule 2'])
    expect(heads.map((h) => h.meta?.mark ?? null)).toEqual([null, 'check', 'check', null])
    /* The rule's answer is in its decision's colour; the policy's ✓ in the positive one. */
    expect([heads[1].meta?.tone, heads[2].meta?.tone, heads[2].meta?.then]).toEqual(['ok', 'decision', '1fa'])
    expect(signInHead('Maya Iyer', 'AWS Console', 2).to).toBe('AWS Console')
    expect([0, 1, 3].map(conditionsWord)).toEqual(['No sign-in conditions', '1 sign-in condition', '3 sign-in conditions'])
  })

  it('says the work while the engine is at it, and what a rule read and failed came to', () => {
    const { plan } = planOf(maya)
    const finding = policyHead(plan, plan.at.which, 'Maya Iyer')
    expect([finding.kind, finding.title, finding.meta?.mark, finding.meta?.text]).toEqual(['finding', 'On AWS Console', 'spin', 'Reading in order'])
    /* Rule 1 as it is read, and once it has failed on its who. */
    const r1 = plan.rules[0]
    expect(metaWords(ruleHead(plan, 0, r1.startAt).meta)).toBe('Reading')
    expect(metaWords(ruleHead(plan, 0, r1.endAt).meta)).toBe('Not matched · Who')
    /* Moved past it, card 3 shows rule 2; rule 1 is one quiet line in its body. */
    const r2 = plan.rules[1]
    expect(ruleShown(plan, r2.startAt, false)).toBe(1)
    expect(passedLine(passedOver(plan, 1, r2.startAt)).map((p) => p.said)).toEqual(['Rule 1 not matched · Who'])
    /* Rule 3 and the last row were never read: not news. */
    expect(passedLine(passedOver(plan, 1, plan.steps.length - 1)).map((p) => p.said)).toEqual(['Rule 1 not matched · Who'])
  })

  it('heads a Deny, a Depends and the tenant’s default plainly', () => {
    const deny = propsFor(leoFromHome, 'settled')
    const dl = deny.plan.steps.length - 1
    const rd = ruleHead(deny.plan, ruleShown(deny.plan, dl, true), dl)
    expect([rd.kicker, metaWords(rd.meta)]).toEqual(['Rule 1 of 3', 'Matches · Then Deny'])
    expect(metaWords(outcomeHead(deny.plan, outcomeView(deny.plan, deny.screens)).meta)).toBe('Decided by Rule 1')

    const depends = propsFor(mayaNoDevice, 'settled')
    const od = outcomeHead(depends.plan, outcomeView(depends.plan, depends.screens))
    expect([od.title, metaWords(od.meta)]).toEqual(['Depends', 'Device not stated'])

    /* Kavya on AWS: none of its own policies covers her, the tenant's default does. */
    const { plan: kavya } = planOf(signIn('u-hr-1', 'aws'))
    const pk = policyHead(kavya, kavya.steps.length - 1, 'Kavya Menon')
    expect([pk.kind, pk.title, metaWords(pk.meta), pk.meta?.mark]).toEqual(['default', 'No policy covers Kavya Menon', 'Global Default Policy applies', null])
  })
})

describe('Classic v2 draws every showcase sign-in (ClassicV2Layout.tsx)', () => {
  it('never throws — at the first step, mid-run and settled — and settles on exactly the four cards, in order', () => {
    expect(forms.length).toBeGreaterThan(80)
    for (const { name, form } of forms) {
      for (const at of ['first', 'mid', 'settled'] as const) {
        const p = propsFor(form, at)
        let out = ''
        expect(() => {
          out = render(p)
        }, `${name} · ${at}`).not.toThrow()
        const cards = cardsIn(out)
        if (at === 'first') expect(cards, name).toEqual(['sign-in'])
        if (at === 'settled') expect(cards, name).toEqual(p.plan.empty ? ['sign-in'] : CARDS)
        expect(cards.length, `${name} · ${at}`).toBeLessThanOrEqual(4)
        /* Never a card inside a card: one `.bb__card` a card on the chain. */
        expect((out.match(/class="bb__card /g) ?? []).length, `${name} · ${at}`).toBe(cards.length)
      }
    }
  }, 120_000)

  it('is only the basics: no What they see, no why, no break-in, no voice, no questions', () => {
    for (const form of [maya, leoFromHome, mayaNoDevice]) {
      const out = render(propsFor(form, 'settled'))
      for (const gone of ['What they see', 'Why?', 'Review conflict', 'attempts', 'Questions', 'Mute', 'Read aloud', 'voice']) expect(out, gone).not.toContain(gone)
    }
    for (const gone of ['WhatTheySee', 'WhyCard', 'BreakIn', 'focus2-', 'SignInRow', 'speak', 'Brief', 'RuleTraceCard']) expect(layoutSrc, gone).not.toContain(gone)
  })

  it('is the builder’s chain: its start pill, read and never a button; its dashed connector with nothing to insert; four of its cards', () => {
    const out = render(propsFor(maya, 'settled'))
    expect(out).toContain('<div class="bb__start rl-c2__start">')
    expect(out).not.toMatch(/<button[^>]*class="bb__start/)
    expect(text(out)).toContain('A sign-in arrives at AWS Console')
    expect(out).not.toContain('bb__start__go')
    /* A connector above each card — the one under the start pill and one between each two — and no `+` or hint. */
    expect((out.match(/class="bb__link rl-c2__link"/g) ?? []).length).toBe(4)
    for (const gone of ['bb__link__add', 'bb__link__hint', 'is-bare', 'Insert here']) expect(out, gone).not.toContain(gone)
    expect((out.match(/class="bb__card /g) ?? []).length).toBe(4)
    expect(cardsIn(out)).toEqual(CARDS)
    /* No status pill in a head: the meta line carries the state. */
    expect(out).not.toContain('bb__state')
    expect(out).not.toContain('is-trace')
  })

  it('heads the four cards for Maya Iyer on AWS Console: the step, what was selected, one meta line', () => {
    const out = render(propsFor(maya, 'settled'))
    const { kickers, titles, metas } = headsIn(out)
    expect(kickers).toEqual(['Sign-in', 'Policies', 'Rule 2 of 3', 'Outcome'])
    expect(titles).toEqual(['Maya Iyer → AWS Console', 'AWS for engineering teams', 'Engineers on a compliant device', 'Allow on 1 factor'])
    expect(metas).toEqual(['2 sign-in conditions', 'Policy 1 of 4 applies · via Engineering', 'Matches · Then Allow on 1 factor', 'Decided by Rule 2'])
    /* The sign-in's tile is her face, its title the application with its logo; the policy's tile the layers mark. */
    const sign = cardHtml(out, 'sign-in')
    expect(sign).toMatch(/class="bb__idx rl-c2__idx is-face"[^>]*><span class="bx-face is-user/)
    expect(sign).toContain('applogo')
    expect(cardHtml(out, 'policy')).toContain('lucide-layers')
  })

  it('card 3 is the rule that passed: its number in the builder’s tile, ringed and said in its decision’s colour', () => {
    const out = render(propsFor(maya, 'settled'))
    const rule = cardHtml(out, 'rule')
    expect(rule).toMatch(/class="bb__card rl-c2__card is-allow is-matched"/)
    expect(rule).toContain('<span class="bb__idx__n">2</span>')
    expect(rule).toMatch(/class="rl-c2__meta is-decision"/)
    expect(rule).toContain('<b class="rl-c2__then">Allow on 1 factor</b>')
    /* A Deny's rule is red, not green. */
    const deny = cardHtml(render(propsFor(leoFromHome, 'settled')), 'rule')
    expect(deny).toMatch(/class="bb__card rl-c2__card is-deny is-matched"/)
    /* The outcome is the builder's end card, its decision down the edge and in its tile. */
    expect(cardHtml(out, 'outcome')).toMatch(/class="bb__card rl-c2__card is-terminal rl-c2__out is-allow"/)
  })

  it('says why a Deny refused, in plain words with a reference, and says nothing on an allow', () => {
    const lands = planOf(leoFromHome).plan.at.outcome
    expect(text(render(propsFor(leoFromHome, lands)))).toContain('Network or place is not allowed · Ref: zone')
    const allowAt = planOf(maya).plan.at.outcome
    expect(text(render(propsFor(maya, allowAt)))).not.toContain('Ref:')
  })

  it('lands folded: every card its head alone, and the dock’s one button reads Expand all', () => {
    const out = render(propsFor(maya, 'settled'))
    expect(out).not.toMatch(/rl-c2__card[^"]* is-open/)
    expect(out).not.toContain('bb__cardbody')
    expect(text(out)).toContain('Expand all')
    expect(text(out)).not.toContain('Collapse all')
    expect(out).toContain('role="toolbar" aria-label="View"')
    expect((out.match(/class="bb__densitybtn"/g) ?? []).length).toBe(1)
    /* Each head carries the builder's fold, with its aria. */
    expect((out.match(/class="bb__act bb__fold__btn"/g) ?? []).length).toBe(4)
    for (const label of ['Show what the sign-in states', 'Show the policies on AWS Console', 'Show what rule 2 checks', 'Show what they get']) expect(out, label).toContain(`aria-expanded="false" aria-label="${label}"`)
    expect(out).toContain('title="Show what it checks"')
  })

  it('mid-run, the cards the engine has reached are open — and card 3’s body opens on the rule it passed over', () => {
    const { plan } = planOf(maya)
    const r2 = plan.rules[1]
    const out = render(propsFor(maya, r2.startAt))
    expect(cardsIn(out)).toEqual(['sign-in', 'policy', 'rule'])
    expect((out.match(/class="bb__card rl-c2__card is-open/g) ?? []).length).toBe(3)
    expect((out.match(/aria-expanded="true"/g) ?? []).length).toBe(4)
    expect((out.match(/class="bb__cardbody"/g) ?? []).length).toBe(3)
    expect(text(out)).toContain('Collapse all')
    /* The bodies are the builder's: keyword rows with their marks, and what answers them on the guide. */
    expect(out).toContain('<span class="bb__ifkw ">who</span>')
    expect(out).toContain('<span class="bb__ifkw ">if</span>')
    expect(out).toContain('<span class="bb__ifkw ">applies</span>')
    expect(out).toContain('class="bb__ifbody')
    expect(out).not.toContain('bb__if is-trace')
    /* The sign-in's stated facts as condition rows joined by "and"; the network wears the zone's chip. */
    expect(out).toContain('<span class="bb__ifkw is-and">and</span>')
    expect(out).toMatch(/class="bb__ifchip is-tone-info is-attr[^"]*"[^>]*><i aria-hidden="true">.*?<\/i>Network zone<\/span>/)
    /* Card 3 shows rule 2 being read; one list of the policy’s rules, the one in play open, a press opens another —
       never cards of their own (owner, 5 Oct 2026). */
    const rule = cardHtml(out, 'rule')
    expect(rule).toContain('Rule 2 of 3')
    expect(rule).not.toContain('rl-c2__passed')
    /* While the engine reads, only the rule it is on is listed, open; the rest would give the answer away. */
    expect(rule).toContain('class="rl-c2__rules"')
    expect(rule).not.toContain('rl-c2__others')
    expect((rule.match(/<li class="rl-c2__rule /g) ?? []).length).toBe(1)
    expect(rule).toContain('rl-c2__rule is-match is-open')
  })

  it('the pencil and Replay sit beside the sign-in card’s fold; Decided by opens the rule', () => {
    const p = propsFor(maya, 'settled')
    const out = render(p)
    const sign = cardHtml(out, 'sign-in')
    expect(sign.indexOf('aria-label="Edit sign-in"')).toBeLessThan(sign.indexOf('aria-label="Replay"'))
    expect(sign.indexOf('aria-label="Replay"')).toBeLessThan(sign.indexOf('bb__fold__btn'))
    expect(outcomeView(p.plan, p.screens).link).toBe('AWS for engineering teams · Rule 2')
  })

  it('with the page’s panel, no head icons — the bar’s Details is the one way in — and the rules list a Details each (owner, 6 Oct 2026)', () => {
    const p = propsFor(maya, 'settled')
    const away = render(p)
    expect(away).toContain('aria-label="Open rule 2 in its policy"')
    expect(away).not.toContain('Details of')
    expect(away).not.toContain('rl-c2__ruledetails')
    const here = render({ ...p, onInspect: noop })
    expect(here).not.toContain('bb__topen')
    expect(here).not.toContain('aria-label="Open rule 2 in its policy"')
    const listed = (here.match(/<li class="rl-c2__rule /g) ?? []).length
    expect((here.match(/rl-c2__ruledetails/g) ?? []).length).toBe(listed)
    if (listed > 0) expect(here).toContain('aria-label="Details of the last row"')
  })

  it('a Run of several identities: a chip each under the sign-in card’s head, the one on the canvas pressed, folded or not', () => {
    const p = propsFor(maya, 'settled')
    const other = propsFor(signIn('u-hr-1', 'aws'), 'settled')
    const out = render({
      ...p,
      identities: [
        { key: 'u-maya', kind: 'user', name: 'Maya Iyer', active: true, plan: p.plan },
        { key: 'u-hr-1', kind: 'user', name: 'Kavya Menon', active: false, plan: other.plan },
      ],
      onPickIdentity: noop,
    })
    expect(out).toContain('aria-label="Identities"')
    expect((out.match(/<button[^>]*class="sir__id[ "]/g) ?? []).length).toBe(2)
    expect(out).toMatch(/aria-pressed="true"[^>]*aria-label="Maya Iyer, Allow on 1 factor"/)
  })

  it('a group pick: "Anyone in Finance → AWS Console", its square in the tile', () => {
    const out = render({ ...propsFor(maya, 'settled'), asGroup: 'Finance' })
    expect(headsIn(out).titles[0]).toBe('Anyone in Finance → AWS Console')
    expect(cardHtml(out, 'sign-in')).toMatch(/class="bb__idx rl-c2__idx is-face"[^>]*><span class="bx-face is-group/)
  })

  it('the fold is the builder’s own control: the same button, glyph and aria as its rule card', () => {
    for (const piece of ['className={`bb__act bb__fold__btn', 'aria-expanded=', 'aria-controls=', '<ChevronsDownUp size={13} strokeWidth={2.2} />', '<ChevronsUpDown size={13} strokeWidth={2.2} />', "'Fold this rule'", "'Show what it checks'"]) {
      expect(ruleCardSrc, piece).toContain(piece)
      expect(layoutSrc, piece).toContain(piece)
    }
    /* The dock's one button is the builder's: its class, its glyphs, its two words. */
    expect(layoutSrc).toContain('className="bb__densitybtn"')
  })

  it('keeps to the tokens and lets Motion own what moves', () => {
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i)
    expect(css).not.toMatch(/\btransform\s*:|\btransition\s*:/)
    expect(css).not.toContain('--brand')
    /* No restated pixel but the builder's card width, which board.css sets on a `.bb` this page does not have. */
    const code = css.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(code.match(/\d+(\.\d+)?px/g)).toEqual(['520px'])
    expect(code).toContain('--bb-card: 520px')
    expect(code).toContain('width: min(var(--bb-card)')
  })
})
