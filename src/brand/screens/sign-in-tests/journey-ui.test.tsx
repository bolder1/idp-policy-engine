/// <reference types="vite/client" />
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { showcaseTenant } from '../../fixtures'
import { BrandProvider } from '../../store'
import { envOf, resolveSignIn } from '../tenant-resolver'
import { rowsRead } from '../testing/rows-read'
import { screensOf } from '../testing/screens-of'
import { factsOf, formOf, originPatch, type SignInForm } from '../testing/sign-in-form'
import { engineRun, policyFound, policyPhase, type EngineRule } from './engine-run'
import type { ReactNode } from 'react'
import type { FoldAsk } from './journey'
import { Answer, EngineJourney, EngineLine } from './EngineJourney'
import { PolicyCard, RuleLines, RuleRow, WhichCard, type PolicyFlag } from './PolicyStack'
import { emptyDraft } from './sign-in-card'
import css from './journey.css?raw'
import journeySrc from './EngineJourney.tsx?raw'
import journeyTs from './journey.ts?raw'
import clockSrc from './use-engine-run.ts?raw'
import stackSrc from './PolicyStack.tsx?raw'
import chainSrc from './RunChain.tsx?raw'
import kitCss from '../../kit.css?raw'
import identSrc from './IdentityField.tsx?raw'
import nodesSrc from './RunNodes.tsx?raw'
import seeSrc from '../testing/WhatTheySee.tsx?raw'
import playerSrc from '../testing/player/SignInPlayer.tsx?raw'
import tryJourneySrc from './TryJourney.tsx?raw'
import boardCss from '../board/board.css?raw'
import ruleCardSrc from '../board/RuleCard.tsx?raw'

/* The engine run drawn without a browser (TESTING-V4 §8.6, §12.3–12.4): the
   one renderer the Sign-in tests page plays, EngineJourney, handed a plan
   from the showcase tenant the store opens on, at a chosen step — so these
   tests stand on the renderer alone, whatever the page around it does. A
   server render runs no effect and takes no press: nothing is measured, so
   no wires, and a mark pressed on the rail is pinned from its source. The
   plan is pinned in engine-run.test.ts; this is the join between it and the
   markup. The browser pass checks the run itself.

   Rebuilt 1 Oct 2026 (owner: "the experience for the cards is awful — so
   much content … the top node should be treated like the other nodes … I
   need a separate node for the policy selection … for the matched policy
   only show which rule matched, the rest hidden, like 'total 3 rules,
   matched rule 2' … the outcome card is awful"): FOUR stops, one card each
   (RunNodes.tsx) — the sign-in, which policy, the policy that decided (a
   rail of its rules and ONE card), the answer. */

/* The renderer's code: the canvas and the clock that plays it. */
const src = [journeySrc, clockSrc].join('\n')

const TODAY = '2026-09-28'
const t = showcaseTenant()
const env = envOf(t)
const lib = { zones: t.zones, fingerprints: t.fingerprints }
const noop = () => {}

function planOf(f: SignInForm) {
  const { facts } = factsOf(f, t.zones)
  const res = resolveSignIn(t.policies, facts, env)
  const rows = rowsRead(t.policies, null, f.appId, lib)
  const plan = engineRun({ res, policies: t.policies, form: f, facts, env, ctx: { people: t.directory.people, apps: t.apps, zones: t.zones, rows }, intro: 'none' })
  const person = t.directory.people.find((u) => u.id === f.personId) ?? null
  const screens = screensOf(res, { policies: t.policies, methods: t.methods, defaultMethodId: undefined, person })
  return { plan, res, screens }
}

function journey(
  f: SignInForm,
  opts: {
    s?: number
    running?: boolean
    showAll?: boolean
    orientation?: 'vertical' | 'horizontal'
    ruleNotice?: (r: EngineRule) => ReactNode
    fold?: FoldAsk
    asGroup?: string | null
    /** False: no glance. Since 1 Oct it folds nothing — every stop is open by itself — so the chain is the same either way. */
    glance?: boolean
    /** The sign-in pressed: its pencil, or the card, opens the form. */
    onPressPerson?: () => void
  } = {},
) {
  const { plan, screens } = planOf(f)
  return renderToStaticMarkup(
    <BrandProvider>
      <EngineJourney
        form={f}
        ruleNotice={opts.ruleNotice}
        fold={opts.fold}
        asGroup={opts.asGroup}
        glance={opts.glance}
        onPressPerson={opts.onPressPerson}
        plan={plan}
        s={opts.s ?? plan.at.done}
        animate={false}
        reduced
        running={opts.running ?? false}
        editing={false}
        toggled={{}}
        onToggle={noop}
        showAll={opts.showAll ?? false}
        onShowAll={noop}
        jumped={false}
        orientation={opts.orientation ?? 'vertical'}
        start={
          <div className="tj-node tj-sin" data-node="sign-in">
            Sign-in
          </div>
        }
        editCard={null}
        outcome={<Answer view={plan.outcome.view} changed={null} reduced screens={screens} appId={f.appId} />}
        onOpenPolicy={noop}
        onOpenRule={noop}
        onAdd={noop}
      />
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

/* From `a` to the first `b` after it (to the end without one). */
const between = (o: string, a: string, b?: string) => {
  const i = o.indexOf(a)
  const j = b ? o.indexOf(b, i) : -1
  return o.slice(i, j < 0 ? undefined : j)
}
const count = (o: string, s: string) => o.split(s).length - 1

/* The four stops, in their order down the chain. A stop, whole tags: from
   its opening tag to the next stop's. */
const STOPS = ['sign-in', 'which', 'decider', 'outcome'] as const
type Stop = (typeof STOPS)[number]
function stopOf(o: string, n: Stop): string {
  const i = o.indexOf(`data-node="${n}"`)
  if (i < 0) return ''
  const next = STOPS.slice(STOPS.indexOf(n) + 1)
    .map((x) => o.indexOf(`data-node="${x}"`, i))
    .filter((j) => j > 0)
  return o.slice(o.lastIndexOf('<', i), next.length > 0 ? o.lastIndexOf('<', Math.min(...next)) : undefined)
}
/* The sign-in's card. */
const sentOf = (o: string) => stopOf(o, 'sign-in')
/* The policy that decided's rail: each mark's tone, number, words and whether its card is the one on show. */
const railOf = (o: string) =>
  [...o.matchAll(/<button type="button" class="tj-rail__chip ([^"]*)" aria-pressed="(true|false)" aria-label="([^"]*)"[^>]*>[\s\S]*?<span class="tj-rail__num">([^<]*)<\/span>/g)].map((m) => ({
    tone: m[1],
    pressed: m[2] === 'true',
    label: m[3],
    num: m[4],
  }))
/* The rule cards drawn, by node, in order. */
const cardsOf = (o: string) => [...o.matchAll(/<div class="tj-rcard" data-node="([^"]+)"/g)].map((m) => m[1])
/* One rule's card: from its wrapper to the next card's, or the end of the stop. */
const cardOf = (o: string, node: string) => {
  const d = stopOf(o, 'decider')
  const i = d.indexOf(`<div class="tj-rcard" data-node="${node}"`)
  if (i < 0) return ''
  const j = d.indexOf('<div class="tj-rcard"', i + 1)
  return d.slice(i, j < 0 ? undefined : j)
}

const arun: SignInForm = { ...emptyDraft(TODAY, '09:30'), personId: 'arun', appId: 'github' }
const home: SignInForm = { ...arun, ...originPatch('home') }
const kavya: SignInForm = { ...emptyDraft(TODAY, '09:30'), personId: 'u-hr-1', appId: 'hrms' }
const devon: SignInForm = formOf(t.savedSignIns.find((s) => s.name === 'Devon Rao on Android 12')!.facts, t.zones)
const unstated: SignInForm = { ...arun, device: { kind: 'none' } }
const maya: SignInForm = formOf(t.savedSignIns.find((s) => s.id === 'ssi-maya-github')!.facts, t.zones)
const saved = (id: string): SignInForm => formOf(t.savedSignIns.find((s) => s.id === id)!.facts, t.zones)

const EXPAND: FoldAsk = { mode: 'expand', seq: 1 }
const COLLAPSE: FoldAsk = { mode: 'collapse', seq: 1 }

describe('settled — one column, four stops in the policy builder’s look: the sign-in, which policy, the policy that decided, the outcome', () => {
  const out = journey(arun)
  const words = text(out)
  /* The rule cards' nodes, by position: rule ids are minted as the tenant loads. */
  const [R1, R2, R3] = planOf(arun).plan.rules.map((r) => r.node)

  /* The arrival pill, then a sentence on the builder's start pill; now a
     card like the others (owner, 1 Oct: "the top node should be treated
     like the other nodes"). */
  it('the sign-in is a stop like the others — the builder’s trace card, the person its head, the rest of the sentence under it; the builder’s bare connectors join the four stops', () => {
    expect(out).toMatch(/<div class="bb__card is-trace tj-pnode is-signin" data-node="sign-in" role="group" aria-label="Arun Patel \(Engineering\) signs in to GitHub Enterprise from Office network on Windows 11 laptop · registered">/)
    expect(text(sentOf(out))).toBe('AP Arun Patel Engineering signs in to GitHub Enterprise · from Office network · on Windows 11 laptop · registered')
    for (const gone of ['bb__start', 'tj-sent', 'data-node="start"', 'A sign-in arrives at', 'tj-pnode is-person', 'Who is signing in']) expect(out).not.toContain(gone)
    expect(words).not.toContain('@')
    /* Three connectors between four stops. */
    expect(count(out, 'bb__link is-bare tj-link')).toBe(3)
    /* The stops, in order. No lane labels, no wires to measure. */
    const at = STOPS.map((n) => out.indexOf(`data-node="${n}"`))
    at.forEach((i) => expect(i).toBeGreaterThan(-1))
    expect(at).toEqual([...at].sort((a, b) => a - b))
    for (const h of ['>Sign-in</p>', '>Which policy</p>', '>Outcome</p>']) expect(out).not.toContain(h)
    expect(out).not.toContain('tj-wirebox')
  })

  it('every stop is open by itself, each saying little enough to (1 Oct): the glance folds nothing, so the chain is the same with it or without', () => {
    for (const n of ['which', 'decider'] as const) expect(stopOf(out, n)).toMatch(/^<div class="bb__card is-trace tj-pnode [^"]* is-open is-foldable"/)
    expect(out).toMatch(/class="tj-hero is-positive is-open is-foldable has-see"/)
    for (const f of [arun, devon, maya]) expect(journey(f)).toBe(journey(f, { glance: false }))
  })

  it('its head is the person — face, name, every group a pill; under it each value with its mark, the words between them grammar; its pencil, or a press anywhere on it, opens the form', () => {
    const sent = sentOf(out)
    expect(sent).toContain('<span class="tj-pnode__face" aria-hidden="true"><span class="bx-face is-user is-sm"')
    expect(sent).toContain('<strong>Arun Patel</strong><span class="tj-sin2__group">Engineering</span>')
    expect(sent).toContain('class="applogo')
    expect(sent).toContain('<b class="tj-sin2__app">GitHub Enterprise</b>')
    expect(count(sent, 'class="tj-sin2__icon"')).toBe(2)
    expect([...sent.matchAll(/<span class="tj-sin2__word">([^<]+)<\/span>/g)].map((m) => m[1])).toEqual(['signs in to', 'from', 'on'])
    /* Each connector travels with its value: a long line wraps between values, never after "from". */
    expect(sent).toContain('<span class="tj-sin2__tok"><span class="tj-sin2__dot" aria-hidden="true">·</span><span class="tj-sin2__word">from</span>')
    /* With a way to the form: the card is pressable and its pencil is the builder's act, named for what it does. */
    const pressed = sentOf(journey(arun, { onPressPerson: noop }))
    expect(pressed).toMatch(/^<div class="bb__card is-trace tj-pnode is-signin is-pressable" data-node="sign-in"/)
    expect(pressed).toContain('<button type="button" class="bb__act tj-sin2__edit" aria-label="Edit the sign-in" title="Edit the sign-in">')
    expect(sent).not.toMatch(/is-pressable|tj-sin2__edit/)
    /* A press on the card, not on a button in it. */
    expect(nodesSrc).toContain("const press = onPress ? (e: MouseEvent) => (e.target as Element).closest?.('button, a') === null && onPress() : undefined")
  })

  /* Which policy was a line in the policy's own card; it is a stop of its
     own (owner, 1 Oct: "I need a separate node for the policy selection"). */
  it('which policy is a stop of its own: the application’s policies in the order they are read, one line each, and ONE line of how they are read', () => {
    const pol = stopOf(out, 'which')
    expect(pol).toMatch(/^<div class="bb__card is-trace tj-pnode is-policies is-decided is-open is-foldable" data-node="which" role="group" aria-label="Which policy decides">/)
    expect(pol).toContain('<ol class="tj-pstack tj-pnode__scan" aria-label="Policies on GitHub Enterprise">')
    expect(text(pol)).toBe(
      '3 policies on GitHub Enterprise Read in order — the first that covers Arun Patel decides 1 Developer tools — office and device checks Decides 2 Code review for Finance Not turned on yet 3 Global Default Policy Not reached',
    )
    /* The one that decides is not a press here (the next stop is it); the others open to their rules' titles. */
    expect(pol).toMatch(/<li class="tj-pol is-decides" data-node="policy:sc-dev-tools"[\s\S]*?tabindex="-1"/)
    expect(count(pol, 'aria-expanded="false" tabindex="0"')).toBe(2)
    for (const gone of ['tj-pnode__meta', 'tj-others', 'tj-rules']) expect(pol).not.toContain(gone)
    expect(text(stopOf(journey(kavya), 'which'))).toBe('2 policies on HRMS Read in order — the first that covers Kavya Menon decides 1 HRMS access from corporate offices Switched off 2 Global Default Policy Decides')
    expect(text(stopOf(journey(saved('ssi-james-austin')), 'which'))).toMatch(/^1 policy on Workday /)
  })

  /* "For the matched policy only show which rule matched; the rest can be a
     hidden part, like 'total 3 rules, matched rule 2'" (owner, 1 Oct). */
  it('the policy that decided is a stop of its own: its name, Decides, Open policy and its fold; where it stopped in words — “Rule 2 of 3 matched”; its rules a rail of numbered marks, and ONE card', () => {
    const o = journey(home)
    const dec = stopOf(o, 'decider')
    expect(dec).toMatch(/^<div class="bb__card is-trace tj-pnode is-policy is-decided is-open is-foldable" data-node="decider" role="group" aria-label="The policy that decides: Developer tools — office and device checks">/)
    expect(text(dec)).toMatch(/^Developer tools — office and device checks Decides Rule 2 of 3 matched 1 2 3 ✱ 2 Rule 2: Compliant device, working remotely Matched/)
    /* Where it stopped is the builder's description line, under the title row — not squeezed into it. */
    expect(dec).toContain('</span><em class="tj-pnode__why1" title="Rule 2 of 3 matched">Rule 2 of 3 matched</em></div>')
    expect(dec).toContain('<button type="button" class="bb__act tj-decider__open" aria-label="Open Developer tools — office and device checks" title="Open policy">')
    expect(dec).toMatch(/aria-label="Fold the policy" title="Fold this policy"/)
    /* The rail: every rule a numbered mark — the last row ✱ — the card on show pressed. */
    expect(dec).toContain('<ol class="tj-rail" aria-label="Rules in Developer tools — office and device checks">')
    expect(railOf(dec)).toEqual([
      { tone: 'is-miss', pressed: false, label: 'Rule 1: In the office on a compliant device — Did not match', num: '1' },
      { tone: 'is-match is-on', pressed: true, label: 'Rule 2: Compliant device, working remotely — Matched', num: '2' },
      { tone: 'is-skip', pressed: false, label: 'Rule 3: Finance, on a compliant device — Not reached', num: '3' },
      { tone: 'is-skip', pressed: false, label: 'Nothing else matched — Not reached', num: '✱' },
    ])
    /* ONE card, the rule that decided; the rest are their marks. */
    expect(cardsOf(o)).toEqual([planOf(home).plan.rules[1].node])
    expect(dec).toContain('<div class="tj-decider__one">')
    expect(dec).not.toContain('tj-decider__all')
    for (const gone of ['tj-rules', 'tj-rlist', 'tj-others']) expect(dec).not.toContain(gone)
  })

  it('the card is the builder’s rule card, read-only: number, title, who / if / then, one row each — no grip, no switch, no menu, no fold of its own (the rail chooses it); its title opens it in its policy', () => {
    const card = cardOf(out, R1)
    expect(card).toMatch(/class="bb__card is-trace is-allow is-t-matched is-open"/)
    const dec = stopOf(out, 'decider')
    const body = dec.slice(dec.indexOf('class="tj-decider"'))
    for (const edit of ['bb__idx__grip', 'bx-toggle', 'bx-rowmenu', 'bb__fold__btn']) expect(body).not.toContain(edit)
    expect(card).toMatch(/<button type="button" id="[^"]+" class="bb__titlebtn"><span class="u-sr-only">Rule 1: <\/span><strong>In the office on a compliant device<\/strong><\/button>/)
    /* One row a part: the keyword, what answers it, the mark. */
    expect(card.match(/class="bb__trow is-who"/g)!.length).toBeGreaterThan(0)
    expect(card).toContain('class="bb__trow is-then"')
    /* Who says which of the person's groups let them in. */
    expect(text(card)).toContain('who EN DE via Engineering')
    /* The builder's own grammar inside: faces, the zone chip, the then-flow. */
    expect(card).toContain('bx-faces')
    expect(text(card)).toContain('Network zone in zone Corporate offices')
    expect(card).toContain('bb__ifjourney')
  })

  it('the rule that decided: the ring, “Matched”, ✓ on every row that held; a rule not reached is its faint mark on the rail, not a card', () => {
    const r1 = cardOf(out, R1)
    expect(r1).toContain('is-t-matched')
    expect(text(r1)).toContain('In the office on a compliant device Matched')
    expect(r1.match(/bb__tmark is-pass/g)).toHaveLength(3)
    for (const n of [R2, R3, 'rule:fallback']) expect(out).not.toContain(`data-node="${n}"`)
    expect(railOf(out).slice(1).map((c) => c.tone)).toEqual(['is-skip', 'is-skip', 'is-skip'])
  })

  it('a rule that did not match is its ✕ on the rail, naming it; Expand all draws every card — the one that missed with its failing row ✕, the rows after it Not checked', () => {
    const o = journey(home)
    expect(railOf(o)[0]).toEqual({ tone: 'is-miss', pressed: false, label: 'Rule 1: In the office on a compliant device — Did not match', num: '1' })
    expect(o).not.toContain(`data-node="${R1}"`)
    /* Show all checks (the dock's) does not change which card is on show. */
    expect(cardsOf(journey(home, { showAll: true }))).toEqual(cardsOf(o))
    const all = journey(home, { fold: EXPAND })
    expect(stopOf(all, 'decider')).toContain('<div class="tj-decider__all">')
    expect(cardsOf(all)).toEqual(planOf(home).plan.rules.map((r) => r.node))
    const r1 = cardOf(all, R1)
    expect(r1).toContain('is-t-missed')
    expect(r1).toContain('bb__tmark is-pass')
    expect(r1).toContain('bb__tmark is-fail')
    expect(text(r1)).toContain('No match')
    expect(text(r1)).toContain('Not checked')
    expect(cardOf(all, R2)).toContain('is-t-matched')
    /* Every card drawn, none of the marks is the one on show. */
    expect(railOf(all).map((c) => c.pressed)).toEqual([false, false, false, false])
    expect(railOf(all).some((c) => c.tone.includes('is-on'))).toBe(false)
  })

  it('when it Depends, the card on show is the last row, “If not” — never ringed as a match; the marks it could not tell are amber, never a “?”', () => {
    const o = journey(unstated)
    expect(cardsOf(o)).toEqual(['rule:fallback'])
    const last = cardOf(o, 'rule:fallback')
    expect(last).toContain('is-t-possible')
    expect(text(last)).toContain('If not')
    expect(o).not.toContain('is-t-matched')
    expect(text(stopOf(o, 'decider'))).toContain('Can’t tell: Device')
    expect(railOf(o).map((c) => c.tone)).toEqual(['is-unknown', 'is-unknown', 'is-miss', 'is-unknown is-on'])
    expect(railOf(o)[0].label).toBe('Rule 1: In the office on a compliant device — Can’t tell')
    /* Expanded, an untold row is marked, never "?". */
    const all = journey(unstated, { fold: EXPAND })
    expect(all).toContain('bb__tmark is-unknown')
    expect(all).not.toMatch(/bb__tmark[^"]*">\?</)
    expect(all).not.toMatch(/tj-rail__mark[^"]*">\?</)
  })

  it('a notice the caller gives is in the foot of the card on show — the slot a conflict fills — and of every card under Expand all', () => {
    const { plan } = planOf(arun)
    const probe = (id: string) => (r: EngineRule) => (r.id === id ? <span className="probe">Also applies</span> : null)
    const o = journey(arun, { ruleNotice: probe(plan.rules[0].id) })
    expect(cardOf(o, R1)).toContain('bb__tbody')
    expect(cardOf(o, R1)).toMatch(/<div class="bb__tnotice"><span class="probe">Also applies<\/span><\/div>/)
    /* On a rule not on show: not drawn — until every card is. */
    expect(journey(arun, { ruleNotice: probe(plan.rules[1].id) })).not.toContain('probe')
    const all = journey(arun, { ruleNotice: probe(plan.rules[1].id), fold: EXPAND })
    expect(cardOf(all, R2)).toMatch(/<div class="bb__tnotice"><span class="probe">Also applies<\/span><\/div>/)
    expect(cardOf(all, R1)).not.toContain('bb__tnotice')
  })

  it('side by side (the builder, later) keeps the lanes, in order, and the card of policies', () => {
    const wide = journey(arun, { orientation: 'horizontal' })
    const heads = ['>Sign-in</p>', '>Which policy</p>', '>Rules</span>', '>Outcome</p>'].map((h) => wide.indexOf(h))
    heads.forEach((i) => expect(i).toBeGreaterThan(-1))
    expect(heads).toEqual([...heads].sort((a, b) => a - b))
    expect(wide).toContain('class="tj-which" data-node="which"')
    expect(wide).toMatch(/class="tj-pol is-decides is-open" data-node="policy:sc-dev-tools"/)
  })
})

/* At a glance (owner, 30 Sep: "at the first glance the user should see the
   OUTCOME — WHICH POLICY it passes, and the outcome; the rest is
   secondary"): since 1 Oct every stop says only what the others do not, so
   nothing needs folding to be read at a glance. */
describe('at a glance — the settled chain', () => {
  const out = journey(devon)

  it('the sign-in stays whole, and marks the fact that failed a check: a ✕ in its mark’s place, red', () => {
    const sent = sentOf(out)
    expect(text(sent)).toBe('DR Devon Rao Contractors signs in to Microsoft Outlook · on Android 12 phone')
    expect(sent).toMatch(
      /<span class="tj-sin2__tok is-fail"><span class="tj-sin2__dot" aria-hidden="true">·<\/span><span class="tj-sin2__word">on<\/span><svg[^>]*class="lucide lucide-x tj-sin2__mark"[^>]*>[\s\S]*?<span class="tj-sin2__val">Android 12 phone<\/span>/,
    )
    expect(css).toContain('.tj-sin2__tok.is-fail > .tj-sin2__mark { color: var(--fb-negative-fg); }')
    /* Everything held: no mark. */
    for (const o of [journey(maya), journey(arun)]) expect(o).not.toContain('tj-sin2__tok is-')
  })

  it('the policy that decided says where it stopped, its own line under its name: the rule that matched of how many, or none of them and the last row', () => {
    expect(text(stopOf(journey(home), 'decider'))).toMatch(/^Developer tools — office and device checks Decides Rule 2 of 3 matched /)
    const james = stopOf(journey(saved('ssi-james-austin')), 'decider')
    expect(james).toContain('<em class="tj-pnode__why1" title="None of its 2 rules matched · Nothing else matched decides">')
    /* The last row decided: its mark ✱ is the one on show, its card says what it decides. */
    expect(railOf(out).at(-1)).toEqual({ tone: 'is-match is-on', pressed: true, label: 'Nothing else matched — Matched', num: '✱' })
    expect(cardsOf(out)).toEqual(['rule:fallback'])
    expect(text(cardOf(out, 'rule:fallback'))).toMatch(/^Nothing else matched Matched Every sign-in that no rule above caught .*Deny/)
  })

  /* The conflict was hard to find (owner, 1 Oct: "make the conflict easy to
     find, animated"): counted once on the policy that decided, its rule ⚠ on
     the rail, and the answer's ONE strip — the way to the why. */
  it('troubleshooting at a glance: the policy that decided counts the findings once, yellow; its rule ⚠ on the rail; the answer says them as ONE strip, the model’s headline, “Review conflict ›” — the number never again', () => {
    const o = journey(maya)
    const dec = stopOf(o, 'decider')
    expect(dec).toMatch(/<button type="button" class="bb__state bb__tstate is-conflict tj-pnode__count" aria-expanded="false" title="Why"><svg[^>]*lucide-triangle-alert[\s\S]*?1 conflict<\/button>/)
    expect(railOf(dec)[2]).toEqual({ tone: 'is-conflict', pressed: false, label: 'Rule 3: Finance, on a compliant device — Also applies', num: '3' })
    const hero = stopOf(o, 'outcome')
    expect(hero).toMatch(
      /<button type="button" class="tj-hero__strip is-conflict" aria-expanded="false"><svg[^>]*class="lucide lucide-triangle-alert tj-hero__smark"[\s\S]*?<span class="tj-hero__stext">Maya Iyer is in Engineering and Finance — Engineering(&#x27;|')s rule applies first<\/span><span class="tj-hero__sgo">Review conflict<svg[^>]*lucide-chevron-right/,
    )
    expect(hero).not.toMatch(/\d+ (conflicts?|findings?)/)
    /* With a strip, no Why? of its own: the strip is the press. */
    expect(hero).not.toContain('tj-hero__whybtn')
    /* Nothing to say: no count, no strip, no Why?. */
    for (const x of [journey(arun), journey(home), out]) expect(x).not.toMatch(/tj-pnode__count|tj-hero__strip|tj-hero__whybtn/)
  })

  /* "The outcome card is awful" (owner, 1 Oct): fewer things, each said once. */
  it('the answer is the hero: the decision, and who decided as ONE line that is the way to that policy — no Open policy button; a Deny’s message is What they see’s, beside it, compact', () => {
    const hero = stopOf(out, 'outcome')
    expect(hero).toMatch(/class="tj-hero is-negative is-open is-foldable has-see"/)
    const main = between(hero, '<div class="tj-hero__main"', '<div class="tj-hero__side"')
    expect(text(main)).toBe('Deny Decided by Device compliance for Outlook and Dropbox · Nothing else matched')
    expect(main).toMatch(
      /<p class="tj-hero__by"[^>]*><span class="tj-hero__bylabel">Decided by<\/span><button type="button" class="tj-hero__bylink" title="Open Device compliance for Outlook and Dropbox"><span>Device compliance for Outlook and Dropbox · Nothing else matched<\/span><svg[^>]*lucide-arrow-up-right/,
    )
    expect(main).not.toContain('Blocked with')
    for (const gone of ['tj-hero__acts', 'tj-hero__ask', 'tj-hero__groups', 'tj-hero__finding']) expect(hero).not.toContain(gone)
    expect(text(hero)).not.toContain('Open policy')
    /* The caveat's dot, beside the decision. */
    expect(main).toMatch(/class="tj-hero__word">Deny<\/span><span class="bx-tip"[^>]*><button type="button" class="bx-tipdot" aria-label="About the result"/)
    const see = hero.slice(hero.indexOf('class="tj-hero__see"'))
    expect(see).toContain('class="tsee is-compact is-split"')
    expect(see).toContain('class="tplay is-compact"')
    /* "Decided by" said once in the chain: the answer's, as a way to the policy. */
    expect(count(out, 'Decided by')).toBe(1)
  })

  it('source: every stop open by itself — the glance only fits the chain again once the run has settled; the stops fold by their height (the drawer)', () => {
    expect(journeySrc).toContain("const nodeOpen = (k: 'policies' | 'policy' | 'outcome') => foldOpen(k, nodes, mode, true, running)")
    expect(journeyTs).toContain("export type FoldKey = 'policies' | 'policy' | 'outcome' | 'why' | `rule:${string}`")
    expect(journeySrc).toContain('const t = window.setTimeout(() => setGlanced(true), GLANCE_AFTER_MS)')
    expect(journeySrc).toContain('motionOk ? GLANCE_FOLD_MS : 0')
    /* Which policy's body is the scan, shown while it searches; the policy's, its rail and card. */
    expect(nodesSrc).toContain('<Drawer open={open || !decided} animate={animate} id={bodyId}>')
    expect(nodesSrc).toContain('<Drawer open={open} animate={animate} id={bodyId}>')
  })

  it('the sheet: the chain the answer’s width, its stops the run’s 640 — the sign-in too, a stop like the others; the stage under the words on a narrow canvas, its steps under it', () => {
    expect(css).toContain('.tj-chain { display: flex; flex-direction: column; align-items: stretch; width: min(880px, 100%); min-width: 0; }')
    expect(css).toContain('.tj-chain > .tj-seg { align-self: center; width: min(640px, 100%); }')
    /* The sign-in's segment is a plain one now: no start pill sized to its words. */
    expect(journey(arun)).not.toContain('tj-seg is-start')
    /* Beside the stage the words stand at the card's top and the player's
       label, steps and caption at their foot, level with the stage's foot:
       the card as tall as the stage, neither half empty (owner, 1 Oct: "it
       takes a lot of space … so much white space"). */
    expect(css).toMatch(/\.tj-hero\.has-see \.tj-hero__in \{[^}]*grid-template-columns: minmax\(0, 1fr\) minmax\(320px, 400px\);[^}]*grid-template-areas: "main see" "side see";/)
    expect(css).toMatch(/\.tj-hero__side \{ grid-area: side; align-self: end;/)
    expect(css).toMatch(/@container tj \(max-width: 900px\) \{\s*\.tj-hero\.has-see \.tj-hero__in \{ grid-template-columns: minmax\(0, 1fr\); grid-template-rows: none; grid-template-areas: "main" "see" "side"; \}/)
    /* The fold is the words' top row's, never over the stage. */
    expect(css).not.toContain('.tj-hero__corner')
  })
})

describe('the outcome, the hero of the flow (§12.4)', () => {
  const hero = (o: string) => stopOf(o, 'outcome')

  /* The answer was the decision, an "Asked for …" line, Open policy and the
     steps again as chips; rebuilt 1 Oct (owner: "the outcome card is
     awful"): the decision, who decided, and What they see — what the person
     is asked for said once, by its numbered steps. */
  it('the decision large in its tone; who decided, ONE line; What they see beside it, its label a TipDot and its steps a numbered list — no “Asked for …” line, no Open policy', () => {
    const o = hero(journey(arun))
    expect(o).toMatch(/class="tj-hero is-positive is-open[ "]/)
    expect(o).toMatch(/class="tj-hero__word">Allow on 1 factor</)
    expect(text(o)).toContain('Decided by Developer tools — office and device checks · Rule 1')
    expect(text(o)).not.toContain('Asked for')
    expect(o).not.toContain('tj-hero__ask')
    expect(o).not.toContain('tj-hero__acts')
    expect(text(o)).not.toContain('Open policy')
    const see = o.slice(o.indexOf('class="tj-hero__see"'))
    expect(see).toContain('class="tsee is-compact is-split')
    /* Split: the stage alone beside the words; its label (a label, not a
       switch, its caption the label's ⓘ) and the steps go to the slot under
       the words, the player's chips by a portal once the slot is mounted
       (WhatTheySee.tsx, SignInPlayer.tsx). Read before the stage. */
    expect(o.indexOf('class="tj-hero__side"')).toBeGreaterThan(o.indexOf('class="tj-hero__main"'))
    expect(o.indexOf('class="tj-hero__side"')).toBeLessThan(o.indexOf('class="tj-hero__see"'))
    expect(seeSrc).toMatch(/<h3 className="tsee__title">\s*\{title\}\s*<TipDot text="An approximation of the sign-in page" label="About what they see" \/>\s*<\/h3>/)
    const split = seeSrc.slice(seeSrc.indexOf('if (side !== undefined) {'), seeSrc.indexOf('return (', seeSrc.indexOf('if (side !== undefined) {') + 40))
    expect(split).toMatch(/<div ref=\{setSteps\} className="tsee__steps" \/>/)
    expect(split).not.toContain('{caption}')
    expect(playerSrc).toContain('{barIn === undefined ? bar : barIn && createPortal(bar, barIn)}')
    expect(o).not.toContain('class="tsee__head"')
    /* The steps, in the answer: one under another, each numbered. */
    expect(css).toMatch(/\.tj-hero \.tsee__steps \.tplay__chips \{ flex-direction: column;/)
    expect(css).toMatch(/\.tj-hero \.tsee__steps \.tplay__chip::before \{[^}]*counter-increment: tj-step;[^}]*content: counter\(tj-step\);/)
    /* The fold at the end of the words' top row, never over the stage. */
    expect(o).toMatch(/<span class="tj-hero__open"><div class="bb__cardmeta">[\s\S]*?aria-label="Fold the outcome"/)
    expect(o).not.toContain('tj-hero__corner')
    /* The page's one orange is Run, in the bar: none here. */
    expect(o).not.toContain('bx-btn--brand')
    expect(o).toContain('aria-label="Decision: Allow on 1 factor, by Developer tools — office and device checks"')
  })

  /* Inside a policy (Check access in the builder): today's version and the
     draft, side by side, once, when they answer differently — not a
     "Changed by your edits" pill that only says there is a difference. */
  it('inside a policy, the two versions side by side when they answer differently — and nothing when they agree', () => {
    const { plan, screens } = planOf(home)
    const col = (id: 'today' | 'stored', label: string, decision: '1fa' | '2fa') => ({ id, label, tip: '', status: 'decided' as const, policyName: null, line: '', decision, possible: [] })
    const draw = (columns: ReturnType<typeof col>[]) =>
      renderToStaticMarkup(
        <BrandProvider>
          <Answer view={plan.outcome.view} columns={columns} changed={null} reduced screens={screens} appId={home.appId} />
        </BrandProvider>,
      )
    const o = draw([col('today', 'Today', '1fa'), col('stored', 'Stored version', '2fa')])
    const vs = o.slice(o.indexOf('<p class="tj-hero__vs"'), o.indexOf('</p>', o.indexOf('<p class="tj-hero__vs"')))
    expect(text(vs)).toBe('Today Allow on 1 factor , then Stored version Allow with 2FA')
    expect(vs).toContain('lucide-arrow-right tj-hero__vsarrow')
    expect(o).not.toContain('tj-hero__changed')
    expect(draw([col('today', 'Today', '2fa'), col('stored', 'Stored version', '2fa')])).not.toContain('tj-hero__vs')
    expect(draw([col('today', 'Today', '2fa')])).not.toContain('tj-hero__vs')
    expect(tryJourneySrc).toContain('changed={running ? null : changed}')
  })

  it('stepped up: amber; the second factor it asks for is the rule’s then-flow and, folded, the answer’s one line', () => {
    const o = journey(home)
    expect(hero(o)).toMatch(/class="tj-hero is-notice is-open[ "]/)
    expect(hero(o)).toMatch(/class="tj-hero__word">Allow with 2FA</)
    expect(text(cardOf(o, planOf(home).plan.rules[1].node))).toContain('then Second factor Password miniOrange Push Signed in')
    expect(hero(journey(home, { fold: COLLAPSE }))).toMatch(/<span class="tj-hero__inline" title="Asked for miniOrange Push">Asked for miniOrange Push<\/span>/)
  })

  it('denied: red; the message the person is shown is What they see’s, beside it — folded, the one line says it, whole on hover', () => {
    const o = hero(journey(devon))
    expect(o).toMatch(/class="tj-hero is-negative is-open[ "]/)
    expect(o).toMatch(/class="tj-hero__word">Deny</)
    expect(o).not.toContain('tj-hero__ask')
    expect(o).toContain('class="tsee is-compact is-split"')
    const folded = hero(journey(devon, { fold: COLLAPSE }))
    expect(folded).toMatch(/<span class="tj-hero__inline" title="Blocked with “[^”]+”">Blocked with “/)
  })

  it('Depends: yellow — what can’t be told is the notice tone (owner, 1 Oct) — what each way gives, and what would settle it', () => {
    const o = hero(journey(unstated))
    expect(o).toMatch(/class="tj-hero is-notice is-open[ "]/)
    expect(o).toMatch(/class="tj-hero__word">Depends</)
    expect(text(o)).toContain('If not')
    expect(text(o)).toContain('Needs: Device')
    expect(o).not.toContain('tj-hero__ask')
  })

  /* The finding was a line with a Why? at its end, under the answer;
     rebuilt 1 Oct (owner: "for the conflict open the right side panel
     instead of under the outcome … make the conflict easy to find,
     animated"): ONE strip, the whole of it the press. */
  it('the finding is ONE strip in its tone, the whole of it the way to the why — “Review conflict ›” for a conflict, “Why ›” otherwise; a conflict’s pulses as it lands', () => {
    const strip = (o: string) => between(hero(o), '<button type="button" class="tj-hero__strip', '</button>')
    expect(strip(journey(maya))).toMatch(/^<button type="button" class="tj-hero__strip is-conflict" aria-expanded="false">/)
    expect(text(strip(journey(maya)))).toMatch(/Review conflict$/)
    const kavyaStrip = strip(journey(kavya))
    expect(kavyaStrip).toMatch(/^<button type="button" class="tj-hero__strip is-info" aria-expanded="false"><svg[^>]*lucide-info tj-hero__smark/)
    expect(text(kavyaStrip)).toBe('HRMS access from corporate offices is off — on, it would allow with 2FA Why')
    const depends = strip(journey(unstated))
    expect(depends).toMatch(/^<button type="button" class="tj-hero__strip is-depends" aria-expanded="false"><svg[^>]*lucide-circle-question-mark tj-hero__smark/)
    expect(text(depends)).toBe('Depends on the device — state it to see which rule decides Why')
    /* The pulse is motion's, a conflict's only, and only as it lands with motion allowed: none here, under reduced motion. */
    expect(journeySrc).toMatch(/\{finding\.tone === 'conflict' && animate && \(\s*<motion\.span\s+className="tj-hero__spulse"\s+aria-hidden\s+initial=\{\{ opacity: 0 \}\}\s+animate=\{\{ opacity: \[0, 1, 0\.15, 1, 0\] \}\}/)
    expect(journey(maya)).not.toContain('tj-hero__spulse')
    /* Without a way to the why (while the engine works), the strip is words, not a press. */
    expect(journeySrc).toContain('<p className={`tj-hero__strip is-${finding.tone}`}>{strip}</p>')
  })

  it('there, unseen, while the spine draws out to it; then it lands with a spring, its ring pulsing once, its lines 60 ms apart', () => {
    expect(src).toMatch(/\{show\.deciding && \(\s+<motion\.div\s+className=\{`tj-out\$\{show\.outcome \? '' : ' is-waiting'\}`\}/)
    expect(src).toContain('animate={show.outcome ? OUT_HERE : OUT_AWAY}')
    expect(src).toContain("const OUT_SPRING = { type: 'spring'")
    expect(src).toMatch(/\{show\.deciding && wires\.out && \(/)
    expect(src).toContain('<Hero.Provider value={hero}>{outcome}</Hero.Provider>')
    expect(src).toContain('const LINE_GAP_S = 0.06')
    expect(src).toContain('staggerChildren: LINE_GAP_S')
    expect(src).toMatch(/className="tj-hero__pulse"[\s\S]*?animate=\{\{ opacity: \[0, 1, 0\]/)
    /* Once: the pulse unmounts as it ends, and a landed answer never pulses again. */
    expect(src).toContain('onAnimationComplete={() => setPulse(false)}')
  })
})

describe('while the engine works', () => {
  const { plan } = planOf(home)
  const [r1, r2] = plan.rules

  it('the first frame: the sign-in, and which policy finding — the policies on the application its rows, as numbered skeletons; nothing after it yet', () => {
    const o = journey(home, { s: plan.at.which, running: true })
    expect(o).toContain('data-node="sign-in"')
    const pol = stopOf(o, 'which')
    expect(pol).toMatch(/^<div class="bb__card is-trace tj-pnode is-policies is-finding is-open" data-node="which"/)
    /* Nothing folds while the engine works: no fold control on any card. */
    expect(o).not.toContain('bb__fold__btn')
    expect(text(pol)).toMatch(/^Finding the policy for GitHub Enterprise/)
    expect(pol).toContain('<span class="bb__idx tj-pnode__mark is-list is-finding" aria-hidden="true"><span class="tj-spin" aria-hidden="true"></span></span>')
    expect(pol.match(/class="tj-pol is-waiting"/g)).toHaveLength(plan.policies.length)
    expect(pol).toContain('tj-skel is-line')
    /* How they are read is said once it has decided, not while it searches. */
    expect(pol).not.toContain('tj-pnode__why1')
    for (const n of ['decider', 'outcome']) expect(o).not.toContain(`data-node="${n}"`)
  })

  it('the policy that decided arrives as the engine opens it: its rail, every mark waiting, no card yet — and no press on the rail while it works', () => {
    const deciding = plan.policies.find((p) => p.decides)!
    expect(journey(home, { s: deciding.expandAt! - 1, running: true })).not.toContain('data-node="decider"')
    const o = journey(home, { s: deciding.expandAt!, running: true })
    const dec = stopOf(o, 'decider')
    expect(text(dec)).toMatch(/^Developer tools — office and device checks Decides Reading its rules/)
    expect(railOf(dec).map((c) => c.tone)).toEqual(['is-waiting', 'is-waiting', 'is-waiting', 'is-waiting'])
    expect(railOf(dec)[0].label).toBe('Rule 1: In the office on a compliant device — Not read yet')
    expect(count(dec, 'class="tj-rail__chip')).toBe(count(dec, 'tabindex="-1"'))
    expect(cardsOf(o)).toEqual([])
    /* Nor Open policy until the run is done. */
    expect(dec).not.toContain('tj-decider__open')
  })

  it('the card is the rule being read, swapping as the engine moves on — “Reading rule k of N”, its mark blue on the rail, a spinner on the row being read, the marks as they land', () => {
    const at = (s: number) => journey(home, { s, running: true })
    const reading = at(r1.checkAt[0])
    expect(text(stopOf(reading, 'decider'))).toContain('Reading rule 1 of 3')
    expect(railOf(reading)[0]).toMatchObject({ tone: 'is-reading is-on', pressed: true })
    expect(between(reading, 'class="tj-rail__chip is-reading', '</button>')).toContain('tj-spin is-small')
    expect(cardsOf(reading)).toEqual([r1.node])
    expect(reading).toContain(`<div class="tj-rcard" data-node="${r1.node}" data-active="">`)
    expect(cardOf(reading, r1.node)).toMatch(/class="bb__card is-trace [^"]*is-t-reading is-active/)
    expect(cardOf(reading, r1.node)).toContain('bb__tmark is-working')
    expect(cardOf(at(r1.markAt[0]), r1.node)).toContain('bb__tmark is-pass')
    const missed = at(r1.endAt)
    expect(cardOf(missed, r1.node)).toContain('is-t-missed')
    expect(railOf(missed)[0].tone).toBe('is-miss is-on')
    /* On to rule 2: its card in place of rule 1's, rule 1 its ✕ on the rail. */
    const next = at(r2.checkAt[0])
    expect(text(stopOf(next, 'decider'))).toContain('Reading rule 2 of 3')
    expect(cardsOf(next)).toEqual([r2.node])
    expect(railOf(next).map((c) => c.tone)).toEqual(['is-miss', 'is-reading is-on', 'is-waiting', 'is-waiting'])
    /* Swapping is motion's: one card at a time, waiting for the last to go. */
    expect(nodesSrc).toMatch(/<AnimatePresence initial=\{false\} mode="wait">\s*\{shown && \(\s*<motion\.div\s+key=\{shown\.id\}/)
  })

  it('once the engine is deciding the card is the rule that decided and the line says so — never a row it settles as Not reached', () => {
    const decidingAt = plan.steps.findIndex((k) => k.kind === 'deciding')
    for (const s of [decidingAt, plan.at.outcome]) {
      const o = journey(home, { s, running: true })
      expect(cardsOf(o), `step ${s}`).toEqual([r2.node])
      expect(text(stopOf(o, 'decider')), `step ${s}`).toContain('Rule 2 of 3 matched')
    }
  })

  it('a conflict is flagged as the engine decides, a beat before the answer: the rule’s ⚠ on the rail, a policy’s flag on its row — not before', () => {
    const m = planOf(maya).plan
    const mAt = m.steps.findIndex((k) => k.kind === 'deciding')
    expect(railOf(journey(maya, { s: mAt - 1, running: true }))[2].tone).toBe('is-skip')
    expect(railOf(journey(maya, { s: mAt, running: true }))[2].tone).toBe('is-conflict')
    const aws = saved('ssi-maya-aws')
    const a = planOf(aws).plan
    const aAt = a.steps.findIndex((k) => k.kind === 'deciding')
    const row = (s: number) => between(stopOf(journey(aws, { s, running: true }), 'which'), 'data-node="policy:sc-aws-finance"', '</li>')
    expect(row(aAt - 1)).not.toContain('tj-pol__flag')
    expect(row(aAt)).toContain('<span class="tj-appear tj-pol__flag is-conflict"')
  })

  it('side by side, Show all checks is already there, unseen, so nothing moves as the run lands', () => {
    const o = journey(home, { s: plan.at.expand, running: true, orientation: 'horizontal' })
    expect(o).toMatch(/class="tj-toggle is-waiting"[^>]*aria-hidden="true"/)
    expect(src).toMatch(/className=\{`tj-toggle\$\{running \? ' is-waiting' : ''\}`\}/)
    expect(css).toMatch(/\.tj-toggle\.is-waiting \{ visibility: hidden; opacity: 0; \}/)
  })

  it('the engine line: words and Skip while it works; the quiet summary and Replay once it is done', () => {
    const line = (running: boolean, words: string) =>
      renderToStaticMarkup(
        <EngineLine text={words} running={running} arrive={false} smooth={false} progress={null} inert={false} onSkip={noop} onReplay={noop} skipRef={{ current: null }} replayRef={{ current: null }} />,
      )
    const working = line(true, 'Finding the policy for GitHub Enterprise')
    expect(working).toContain('tj-engine is-running')
    expect(text(working)).toContain('Finding the policy for GitHub Enterprise')
    expect(text(working)).toContain('Skip')
    expect(text(working)).not.toContain('Replay')
    const done = line(false, plan.summary)
    expect(done).toContain('tj-engine is-done')
    expect(text(done)).toMatch(/Checked 1 policy · 2 rules · 4 checks Replay/)
    expect(done).not.toContain('>Skip<')
  })
})

/* The pieces, drawn at a chosen step: what the canvas shows as the engine
   reaches each level, and what Show all checks and a losing policy pressed
   open show. */
describe('The hierarchy, piece by piece', () => {
  const { plan } = planOf(home)
  const [r1, r2] = plan.rules
  const rule = (r: typeof r1, s: number, showAll = false) =>
    renderToStaticMarkup(
      <ol>
        <RuleRow rule={r} s={s} showAll={showAll} walked onward={false} interactive hot={false} active={false} animate={false} reduced onHover={noop} onOpen={noop} onAdd={noop} />
      </ol>,
    )
  const card = (p: (typeof plan.policies)[number], s: number, animate = false, flag?: PolicyFlag) =>
    renderToStaticMarkup(
      <ol>
        <PolicyCard
          p={p}
          phase={policyPhase(p, s)}
          found={policyFound(p, s)}
          sweepMs={600}
          lightMs={620}
          open={false}
          interactive={false}
          onToggle={noop}
          hot={false}
          active={false}
          animate={animate}
          onHover={noop}
          onOpenRule={noop}
          flag={flag}
        />
      </ol>,
    )

  it('the card: its title and its rows', () => {
    const o = renderToStaticMarkup(
      <WhichCard appName="HRMS">
        <li>row</li>
      </WhichCard>,
    )
    expect(o).toContain('<p class="tj-which__head">Policies on HRMS</p>')
    expect(o).toContain('<ol class="tj-pstack" aria-label="Policies on HRMS"><li>row</li></ol>')
  })

  it('a policy is a numbered skeleton until the scan reaches it; asked, its scan line fills; found, its ring is drawn; then Decides', () => {
    const p = plan.policies[0]
    expect(card(p, p.scanAt! - 1)).toContain('class="tj-pol is-waiting"')
    const asked = card(p, p.scanAt!)
    expect(asked).toContain('class="tj-pol is-working"')
    /* The scan line is as long as its step (the sheet reads it). */
    expect(asked).toContain('style="--tj-sweep:600ms"')
    expect(asked).toContain('tj-spin is-small')
    const found = card(p, p.foundAt!, true)
    expect(found).toContain('class="tj-pol is-found"')
    /* The ring drawn once round it: an SVG rect, motion's pathLength. */
    expect(found).toMatch(/<svg class="tj-light" aria-hidden="true" focusable="false"><rect class="tj-light__ring"/)
    expect(found).not.toContain('tj-spin')
    /* Still, and under reduced motion, no drawing: the ring is simply there once it settles. */
    expect(card(p, p.foundAt!)).not.toContain('class="tj-light"')
    const decides = card(p, plan.at.decides)
    expect(decides).toContain('class="tj-pol is-decides"')
    expect(text(decides)).toContain('Decides')
  })

  /* "Make the conflict easy to find, animated" (owner, 1 Oct): a later
     policy that also covers the person says so in place of its reason. */
  it('a policy that also covers the person, flagged: in place of its reason, the notice tone and ⚠ where it would answer otherwise, a pulse round it as it lands; quiet where it would not; never on the one that decides, nor before it has settled', () => {
    const p = plan.policies[1]
    const settled = plan.at.done
    const conflict: PolicyFlag = { tone: 'conflict', text: 'Also covers Maya · not used' }
    const c = card(p, settled, false, conflict)
    expect(c).toContain('<li class="tj-pol has-flag is-conflict"')
    expect(c).toMatch(/<span class="tj-appear tj-pol__flag is-conflict"[^>]*><svg[^>]*lucide-triangle-alert[\s\S]*?Also covers Maya · not used<\/span>/)
    expect(c).not.toContain('tj-pol__reason')
    /* The pulse is motion's, and only where motion is allowed. */
    expect(c).not.toContain('tj-pol__pulse')
    expect(card(p, settled, true, conflict)).toContain('<span class="tj-pol__pulse" aria-hidden="true"')
    expect(stackSrc).toMatch(/className="tj-pol__pulse"\s+aria-hidden\s+initial=\{\{ opacity: 0 \}\}\s+animate=\{\{ opacity: \[0, 1, 0\.2, 1, 0\] \}\}/)
    const info = card(p, settled, true, { tone: 'info', text: 'Also covers Maya · not used' })
    expect(info).toContain('<li class="tj-pol has-flag is-info"')
    expect(info).toMatch(/<span class="tj-appear tj-pol__flag is-info"[^>]*>Also covers Maya · not used<\/span>/)
    expect(info).not.toContain('tj-pol__pulse')
    /* The one that decides is Decides, flag or none; a row still being asked says nothing yet. */
    const top = plan.policies[0]
    expect(card(top, settled, false, conflict)).not.toContain('tj-pol__flag')
    expect(card(top, top.scanAt!, false, conflict)).not.toContain('tj-pol__flag')
  })

  it('a row arrives turning, and its mark lands on the next beat', () => {
    expect(rule(r1, r1.checkAt[0])).toContain('tj-crow is-working')
    expect(rule(r1, r1.markAt[0])).toContain('tj-crow is-pass')
    expect(rule(r1, r1.markAt[0])).not.toContain('tj-crow is-working')
  })

  it('a rule reads one row at a time: its rows so far, the one being read with a spinner', () => {
    const o = rule(r1, r1.checkAt[1])
    expect(o).toContain('class="tj-r is-working"')
    expect(o).toContain('tj-crow is-pass')
    expect(o).toContain('tj-crow is-working')
    expect(o).toContain('tj-spin is-small')
    expect(rule(r1, r1.startAt - 1)).toContain('class="tj-r is-waiting"')
  })

  it('settled, a no-match shows for a beat the rows it read, the failing one ✕, before it folds', () => {
    const o = rule(r1, r1.endAt)
    expect(o).toContain('class="tj-r is-missed"')
    expect(o).toContain('tj-crow is-fail')
    expect(o).not.toContain('Not checked')
    expect(rule(r1, r1.compactAt!)).toContain('class="tj-r is-folded"')
  })

  it('Show all checks opens a folded rule again: the failing row ✕, the rows after it Not checked', () => {
    const o = rule(r1, plan.at.done, true)
    expect(o).toContain('class="tj-r is-missed"')
    expect(o).toContain('tj-crow is-pass')
    expect(o).toContain('tj-crow is-fail')
    expect(o).toContain('tj-crow is-skipped')
    expect(text(o)).toContain('Not checked')
    expect(o).not.toContain('is-line')
  })

  it('the rule that matched stays open, every row ✓, its answer in full tone', () => {
    const o = rule(r2, plan.at.done)
    expect(o).toContain('class="tj-r is-lit"')
    expect(o.match(/tj-crow is-pass/g)).toHaveLength(r2.checks.length)
    expect(o).toContain('bb-ruleout is-lit')
  })

  it('a losing policy pressed open lists its rules as titles, read-only: no checks, nothing about this sign-in', () => {
    const p = plan.policies[1]
    const o = renderToStaticMarkup(
      <ol>
        <PolicyCard p={p} phase={policyPhase(p, plan.at.done)} open interactive onToggle={noop} hot={false} active={false} animate={false} onHover={noop} onOpenRule={noop} />
      </ol>,
    )
    expect(renderToStaticMarkup(<RuleLines lines={p.lines} policyId={p.policyId} onOpen={noop} />)).toContain('tj-rlist is-lines')
    expect(o).toContain('class="tj-pol is-dim is-open"')
    expect(o).toContain('tj-rlist is-lines')
    expect(o.match(/class="tj-r is-line"/g)).toHaveLength(p.lines.length)
    expect(text(o)).toContain('Nothing else matched')
    expect(o).not.toContain('tj-crow')
  })
})

describe('the sheets and the source', () => {
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const blocks = [...rules.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }))
  /* A rule targets a class when the class is in the last compound of one of its selectors. */
  const targets = (sel: string, cls: string) =>
    sel.split(',').some((part) => new RegExp(`\\${cls}(?![\\w-])`).test(part.trim().split(/[\s>+~]+/).filter(Boolean).pop() ?? ''))
  const reducedBlock = rules.slice(rules.indexOf('@media (prefers-reduced-motion: reduce)'))
  const moving = /(^|;)\s*(transform|transition|translate|scale|rotate)\s*:/

  it('tokens only: no hex, no rgba, no dashed or dotted anything', () => {
    expect(rules).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(rules).not.toMatch(/rgba?\(/)
    expect(rules).not.toMatch(/dashed|dotted/)
  })

  it('no transform and no transition on anything motion animates — the four stops’ pulses, the answer’s new lines and the card swapping among them', () => {
    /* Every class a motion element carries (EngineJourney.tsx, PolicyStack.tsx,
       RunChain.tsx, RunNodes.tsx), and each has its rule in the sheet. Gone
       with the 1 Oct rebuild, as nothing draws them now: the answer's "Asked
       for …" line, its finding line and its Open policy row; the start slot
       and the old sign-in node, never motion's. New: the policy row's pulse,
       the rail's, the strip's and its wrapper, who decided. */
    const owned = [
      '.tj-lane',
      '.tj-lane__fade',
      '.tj-lane__pad',
      '.tj-pol__open',
      '.tj-pol__body',
      '.tj-pol__pulse',
      '.tj-appear',
      '.tj-crowwrap',
      '.tj-crow__say',
      '.tj-mark',
      '.tj-out',
      '.tj-wire',
      '.tj-route',
      '.tj-engine__pill',
      '.tj-engine__words',
      '.tj-engine__text',
      '.tj-engine__done',
      '.tj-engine__track',
      '.tj-engine__bar',
      '.tj-hero__pulse',
      '.tj-hero__in',
      '.tj-hero__top',
      '.tj-hero__by',
      '.tj-hero__vs',
      '.tj-hero__ifs',
      '.tj-hero__needs',
      '.tj-hero__stripwrap',
      '.tj-hero__spulse',
      '.tj-hero__watch',
      '.tj-hero__side',
      '.tj-hero__see',
      /* Break-in attempts' quiet link on the answer, fading in as the run settles (1 Oct 2026). */
      '.tj-hero__attempts',
      '.tj-light__ring',
      /* The chain (RunChain.tsx). */
      '.tj-seg',
      '.tj-link__draw',
      '.tj-drawer',
      /* The stops (RunNodes.tsx). */
      '.tj-pnode__say',
      '.tj-rail__pulse',
      /* The why under the answer (WhyCard.tsx): its drawer. */
      '.tj-whywrap',
    ]
    /* Each is still drawn: a className in one of the four sources. */
    const drawn = (cls: string) => [journeySrc, stackSrc, chainSrc, nodesSrc].some((s) => new RegExp(`className=["{\`]+[^"\`]*\\b${cls.slice(1)}(?![\\w-])`).test(s))
    expect(owned.filter((o) => !drawn(o))).toEqual([])
    const bad = blocks.filter((b) => owned.some((o) => targets(b.sel, o)) && moving.test(b.body))
    expect(bad.map((b) => b.sel)).toEqual([])
    expect(owned.filter((o) => !blocks.some((b) => targets(b.sel, o)))).toEqual([])
    /* The card swapping on the rail is a classless motion element inside the one-card slot: nothing there moves in CSS either. */
    expect(blocks.filter((b) => /\.tj-decider__(one|all)\b/.test(b.sel) && moving.test(b.body)).map((b) => b.sel)).toEqual([])
  })

  it('the search, in the sheet, flat and one hue: skeletons breathe, a solid line fills under a row as long as its scan, a solid ring is drawn round the one that decides', () => {
    /* No gradient but the canvas's dot pattern and the scroller's fade; never the brand's orange in the search. */
    expect([...rules.matchAll(/[a-z-]*gradient\(/g)].map((m) => m[0])).toEqual(['radial-gradient(', 'linear-gradient('])
    expect(rules).toMatch(/\.tj-canvas::before \{[^}]*radial-gradient\(circle, var\(--border-default\)/)
    expect(rules).not.toMatch(/conic-gradient|@property|--brand\b|--brand-text|background-clip: text/)
    expect(rules).toMatch(/\.tj-pol\.is-working::after \{[^}]*background: var\(--accent\);[^}]*clip-path: inset\(0 100% 0 0\);[^}]*animation: tj-sweep var\(--tj-sweep, 480ms\)/)
    expect(rules).toMatch(/@keyframes tj-sweep \{[\s\S]*?to \{ clip-path: inset\(0 0 0 0\); \}/)
    expect(rules).toMatch(/\.tj-light__ring \{[^}]*fill: none;[^}]*stroke: var\(--tj-path-dot\);/)
    expect(stackSrc).toMatch(/<motion\.rect\s+className="tj-light__ring"\s+initial=\{\{ pathLength: 0 \}\}\s+animate=\{\{ pathLength: 1 \}\}/)
    expect(rules).toMatch(/@keyframes tj-shimmer \{[\s\S]*?color-mix\(in srgb, var\(--accent\) 12%, var\(--surface-inset\)\)/)
    /* The engine line's words are solid ink while it works. */
    expect(rules).toContain('.tj-engine.is-running .tj-engine__text { color: var(--text-primary); }')
    /* The answer: no tinted wash, one solid ring pulse in its tone. */
    expect(rules).toMatch(/\.tj-hero__pulse \{[^}]*border: var\(--bw-thick\) solid var\(--tj-tone-dot\);/)
    expect(rules).not.toMatch(/\.tj-hero \{[^}]*background-image/)
    /* The rows' sweep and light last as long as their steps, at the pace the run plays at — on the canvas and in which policy. */
    for (const s of [src, nodesSrc]) {
      expect(s).toContain('sweepMs={p.scanAt !== null ? stepMs(plan, p.scanAt) : undefined}')
      expect(s).toContain('lightMs={p.foundAt !== null ? stepMs(plan, p.foundAt) : undefined}')
    }
    expect(clockSrc).toContain('PLAYED.set(pending, tl)')
  })

  it('reduced motion: no breathing, no scan line, no ring drawing', () => {
    for (const sel of ['.tj-skel', '.tj-light', '.tj-pol.is-working::after']) expect(reducedBlock).toContain(sel)
    expect(reducedBlock).toMatch(/animation: none;/)
  })

  it('no boxes inside boxes: a rule is a tint on the policy that decides, never a bordered card of its own', () => {
    const card = blocks.filter((b) => targets(b.sel, '.tj-r__card'))
    expect(card.length).toBeGreaterThan(0)
    card.forEach((b) => expect(b.body, b.sel).not.toMatch(/(^|;)\s*border(-color)?\s*:/))
  })

  it('the engine line hugs its words: a ruler measures each sentence, the width eases to it, the sentences cross-fade', () => {
    expect(src).toContain("const width = useMotionValue<number | 'auto'>('auto')")
    expect(src).toContain('tween(width, w, { duration: 0.28, ease: EASE_IN_OUT })')
    /* A longer sentence waits for its room; a shorter one's width waits for the last words to fade: never cut off. */
    expect(src).toContain('const run = tween(width, w, { duration: GROW_S, ease: EASE_OUT })')
    expect(src).toContain('const t = window.setTimeout(() => setSaid(text), GROW_S * 1000)')
    expect(src).toMatch(/<AnimatePresence initial=\{false\} onExitComplete=\{onTextGone\}>\s+<motion\.span\s+key=\{said\}\s+className="tj-engine__text"/)
    expect(rules).toMatch(/\.tj-engine__ruler,\s*\.tj-engine__text \{[^}]*text-overflow: ellipsis;/)
    expect(rules).toMatch(/\.tj-engine__act \{[^}]*min-width: 86px;/)
  })

  it('hover is a pointer that moved, once the run is done: no mouseenter, no tooltip while the engine works', () => {
    expect(stackSrc).not.toMatch(/onMouseEnter|onMouseLeave/)
    expect(nodesSrc).not.toMatch(/onMouseEnter|onMouseLeave/)
    expect(stackSrc).toContain('const moved = (e: PointerEvent) => e.movementX !== 0 || e.movementY !== 0')
    expect(stackSrc).toContain('<MaybeTip on={hoverable} text={p.tip} placement="top">')
    expect(src).toContain('const hoverable = interactive && moved')
    expect(src).toMatch(/if \(running\) \{\s+setHot\(null\)\s+setMoved\(false\)/)
  })

  it('the clock is absolute: each step due at the run’s start plus its planned start', () => {
    expect(src).toContain('let due = playing.t0 + late.current + playing.tl.at[step + 1] - performance.now()')
    /* A conflict's beat, come late, still holds its whole length. */
    expect(src).toMatch(/if \(at\?\.notice && due < hold\) \{\s+late\.current \+= hold - due\s+due = hold/)
    expect(src).not.toMatch(/setTimeout\(\(\) => setStep\(step \+ 1\), playing\.tl\.dur\[step\]\)/)
  })

  it('12 px is the floor', () => {
    const sizes = [...rules.matchAll(/font-size:\s*([^;]+);/g)].map((m) => m[1].trim())
    sizes.forEach((s) => expect(['var(--fs-xs)', 'var(--fs-sm)', 'var(--fs-md)', 'var(--fs-2xl)', 'var(--fs-3xl)', 'var(--pill-fs)']).toContain(s))
  })

  it('one link style: no underline on any link in the canvas, at rest or on hover', () => {
    const links = blocks.filter((b) => /tj-toggle|tj-crow__add|tj-hero__bylink/.test(b.sel))
    expect(links.length).toBeGreaterThan(0)
    links.forEach((b) => expect(b.body, b.sel).not.toMatch(/text-decoration:\s*underline/))
    expect(blocks.some((b) => /\.tj-toggle:hover/.test(b.sel) && /text-decoration:\s*none/.test(b.body))).toBe(true)
  })

  it('the builder’s trace card, in board.css: tokens only, scoped to the trace, nothing motion moves given a transform or a transition', () => {
    const at = boardCss.indexOf('--- The trace: a card read by a sign-in test')
    expect(at).toBeGreaterThan(-1)
    const trace = boardCss.slice(at).replace(/\/\*[\s\S]*?\*\//g, '')
    expect(trace).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(trace).not.toMatch(/rgba?\(/)
    const tblocks = [...trace.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }))
    expect(tblocks.filter((b) => (targets(b.sel, '.bb__tbody') || targets(b.sel, '.bb__tmark')) && moving.test(b.body)).map((b) => b.sel)).toEqual([])
    /* Every card rule is the trace's own: nothing here reaches a card on the board. */
    tblocks.filter((b) => /\.bb__card/.test(b.sel)).forEach((b) => expect(b.sel).toMatch(/is-trace/))
    /* The card: no grip, no switch, no menu, no fold; motion owns its body's height and a mark's pop. */
    const card = ruleCardSrc.slice(ruleCardSrc.indexOf('export function RuleTraceCard'))
    for (const edit of ['onGrip', 'Toggle', 'RowMenu', 'onToggleExpand', 'bb__idx__grip']) expect(card).not.toContain(edit)
    expect(ruleCardSrc).toMatch(/className="bb__tbody"\s+initial=/)
    expect(ruleCardSrc).toContain('className={`bb__tmark is-${mark.status}`}')
  })

  it('house words, and no Sparkles or Wand', () => {
    for (const s of [src, stackSrc, chainSrc, nodesSrc]) {
      expect(s).not.toMatch(/Sparkles|Wand/)
      const strings = [...s.matchAll(/>([^<>{}]+)</g)].map((m) => m[1]).join(' ')
      expect(strings).not.toMatch(/\b(AI|assistant|log ?in|gauntlet|blast radius|rehearse)\b/i)
    }
  })
})

/* A person in two groups (TESTING-V4 §13.2): Maya Iyer, in Engineering and
   Finance, on GitHub — rule 1 lets her in via Engineering on a password; rule
   3 would ask Finance for 2FA. The conflict is drawn, not hidden — and since
   1 Oct found without opening anything (owner: "make the conflict easy to
   find, animated"). */
describe('conflicts: a person in two groups', () => {
  const out = journey(maya)
  const { plan } = planOf(maya)
  const [R1, R2, R3] = plan.rules.map((r) => r.node)

  it('the sign-in says every group she is in', () => {
    const sent = sentOf(out)
    expect(text(sent)).toContain('Maya Iyer Engineering Finance signs in to GitHub Enterprise')
    expect([...sent.matchAll(/<span class="tj-sin2__group">([^<]+)<\/span>/g)].map((m) => m[1])).toEqual(['Engineering', 'Finance'])
    expect(sent).toContain('aria-label="Maya Iyer (Engineering, Finance) signs in to GitHub Enterprise')
  })

  /* The rule that would also apply was drawn whole among the rules, under
     the outcome's fold of the chain; now it is a mark on the rail that says
     it at once, and its card a press away (or under Expand all). */
  it('the rule that would also apply is ⚠ on the rail — “Also applies”, amber, pulsing as it lands — and its card, under Expand all or pressed, whole: who, through which group, why not used, the fix and Open rule', () => {
    const chip = between(stopOf(out, 'decider'), 'class="tj-rail__chip is-conflict"', '</button>')
    expect(chip).toContain('aria-label="Rule 3: Finance, on a compliant device — Also applies"')
    expect(chip).toContain('lucide-triangle-alert')
    /* On show is the rule that decided; the conflict's card is a press on its mark away. */
    expect(cardsOf(out)).toEqual([R1])
    expect(nodesSrc).toContain('if (interactive) setPick({ plan, id: r.id })')
    /* Its pulse is motion's, as it lands with motion allowed: none under reduced motion. */
    expect(nodesSrc).toMatch(/\{conflict && animate && \(\s*<motion\.span\s+className="tj-rail__pulse"\s+aria-hidden\s+initial=\{\{ opacity: 0, scale: 1 \}\}\s+animate=\{\{ opacity: \[0, 1, 0, 1, 0\]/)
    expect(out).not.toContain('tj-rail__pulse')
    const r3 = cardOf(journey(maya, { fold: EXPAND }), R3)
    expect(r3).toMatch(/class="bb__card is-trace [^"]*is-open[^"]*is-conflict"/)
    expect(r3).toContain('bb__tbody')
    expect(r3).toMatch(/class="bb__state bb__tstate is-conflict">Also applies</)
    const notice = text(r3.slice(r3.indexOf('class="tj-conflict"')))
    expect(notice).toContain('Also applies to Maya Iyer · via Finance')
    expect(notice).toContain('Not used — rule 1 matched first')
    expect(notice).toContain('Move it above rule 1 to ask Finance for 2FA')
    expect(notice).toContain('Open rule')
    /* Its who row says the group she reaches it by; its then-flow is its own. */
    expect(text(r3)).toContain('via Finance')
    expect(text(r3)).toContain('Password Google Authenticator Signed in')
  })

  it('a rule that also matches through the same group is quiet: its mark Not reached, and its card one grey line in its foot; the rule that matched says its group', () => {
    expect(railOf(out)[1]).toMatchObject({ tone: 'is-skip', label: 'Rule 2: Compliant device, working remotely — Not reached' })
    const r2 = cardOf(journey(maya, { fold: EXPAND }), R2)
    expect(r2).toContain('class="tj-also"')
    expect(text(r2)).toContain('Also matches · via Engineering · Not used — rule 1 matched first')
    expect(r2).not.toContain('tj-conflict')
    expect(text(cardOf(out, R1))).toContain('via Engineering')
  })

  it('the outcome says so as ONE strip, the model’s headline, “Review conflict ›”; the strip is the way to the why', () => {
    const hero = stopOf(out, 'outcome')
    expect(hero).toMatch(
      /<button type="button" class="tj-hero__strip is-conflict" aria-expanded="false"><svg[^>]*lucide-triangle-alert tj-hero__smark[\s\S]*?<span class="tj-hero__stext">Maya Iyer is in Engineering and Finance — Engineering(&#x27;|')s rule applies first<\/span><span class="tj-hero__sgo">Review conflict/,
    )
    /* Pressed, the why opens: in the page's right-hand panel where the page has one (why-ui.test.tsx), else under the answer. */
    expect(journeySrc).toContain('onClick={onWhy}')
  })

  it('folded, the answer is its decision and ask alone; the count stays the policy’s, said once, beside Decides', () => {
    const folded = journey(maya, { fold: COLLAPSE })
    expect(text(stopOf(folded, 'decider'))).toBe('Developer tools — office and device checks Decides 1 conflict Rule 1 of 3 matched')
    const hero = stopOf(folded, 'outcome')
    expect(hero).not.toMatch(/tj-hero__strip|tj-hero__finding|1 conflict/)
    expect(text(hero)).toBe('Allow on 1 factor Asked for their password')
  })

  it('a policy conflict — no rule of its own — is flagged on the row of the policy that also covers her, and is the answer’s strip too; one that comes first by design is said quietly in the answer, never as a conflict', () => {
    const aws = journey(saved('ssi-maya-aws'))
    const row = between(stopOf(aws, 'which'), 'data-node="policy:sc-aws-finance"', '</li>')
    expect(row).toMatch(/<span class="tj-appear tj-pol__flag is-conflict"[^>]*><svg[^>]*lucide-triangle-alert[\s\S]*?Also covers Maya · not used<\/span>/)
    expect(aws).toContain('<li class="tj-pol has-flag is-conflict" data-node="policy:sc-aws-finance"')
    expect(text(stopOf(aws, 'outcome'))).toContain('Maya Iyer is in Engineering and Finance — AWS for engineering teams applies first Review conflict')
    /* Folded, which policy says the one that decides — and nothing more: how
       many would answer otherwise is the policy's count below, said once. */
    const folded = stopOf(journey(saved('ssi-maya-aws'), { fold: COLLAPSE }), 'which')
    expect(folded).toMatch(/<em class="tj-pnode__why1" title="AWS for engineering teams decides">AWS for engineering teams decides<\/em>/)
    expect(folded).not.toContain('tj-pnode__count')
    expect(text(stopOf(journey(saved('ssi-maya-aws'), { fold: COLLAPSE }), 'decider'))).toContain('1 conflict')
    const slack = journey(saved('ssi-devon-slack'))
    /* A group's policy before Everyone's is by design: its row is quiet, never a conflict's amber. */
    expect(slack).toContain('<li class="tj-pol has-flag is-info" data-node="policy:sc-slack-everyone"')
    expect(slack).not.toContain('tj-pol__pulse')
    expect(stopOf(slack, 'outcome')).toMatch(/<button type="button" class="tj-hero__strip is-info"/)
    expect(text(stopOf(slack, 'outcome'))).toContain('Slack for everyone does not apply — a policy for Contractors comes first Why')
    expect(text(stopOf(slack, 'decider'))).toContain('Decides 1 finding')
    expect(stopOf(slack, 'decider')).toContain('class="bb__state bb__tstate is-folded tj-pnode__count"')
    expect(slack).not.toMatch(/tj-hero__strip is-conflict|\d conflict/)
  })

  it('a single-group sign-in has no conflict, and says nothing of one', () => {
    for (const o of [journey(arun), journey(home), journey(devon), journey(arun, { fold: EXPAND }), journey(devon, { fold: EXPAND })]) {
      expect(o).not.toContain('tj-conflict')
      expect(o).not.toContain('is-conflict')
      expect(o).not.toContain('tj-pol__flag')
      expect(o).not.toContain('tj-hero__strip')
    }
  })

  it('"Anyone in Finance": the sign-in says "A member of Finance", and who was tested', () => {
    const o = journey({ ...maya, personId: 'priya' }, { asGroup: 'finance' })
    const sent = sentOf(o)
    expect(text(sent)).toMatch(/^A member of Finance tested as \S[^·]* signs in to GitHub Enterprise/)
    expect(sent).toContain('<span class="tj-sin2__as">tested as Priya Sharma</span>')
    expect(sent).not.toContain('tj-sin2__group')
    expect(sent).toContain('aria-label="A member of Finance (tested as Priya Sharma) signs in to GitHub Enterprise')
    expect(sent).toContain('class="bx-face is-group is-sm"')
  })
})

/* The cards fold (owner, 30 Sep: "make the cards collapsible like we have
   in the policy builder"): since 1 Oct every stop is open by itself; the
   dock's Collapse all folds each to its head, Expand all opens each and
   draws every rule's card. */
describe('the fold, drawn', () => {
  it('Collapse all: every stop is its head — which policy with the one that decides, the policy with where it stopped, the answer with its ask; the sign-in has no fold, it is short already', () => {
    const o = journey(home, { fold: COLLAPSE })
    expect(text(sentOf(o))).toBe('AP Arun Patel Engineering signs in to GitHub Enterprise · from Home broadband · on Windows 11 laptop · registered')
    expect(sentOf(o)).toContain('<span class="tj-sin2__tok is-fail"><span class="tj-sin2__dot" aria-hidden="true">·</span><span class="tj-sin2__word">from</span>')
    expect(stopOf(o, 'which')).toMatch(/^<div class="bb__card is-trace tj-pnode is-policies is-decided is-folded is-foldable"/)
    expect(text(stopOf(o, 'which'))).toBe('3 policies on GitHub Enterprise Developer tools — office and device checks decides')
    expect(stopOf(o, 'decider')).toMatch(/^<div class="bb__card is-trace tj-pnode is-policy is-decided is-folded is-foldable"/)
    expect(text(stopOf(o, 'decider'))).toBe('Developer tools — office and device checks Decides Rule 2 of 3 matched')
    for (const gone of ['tj-pstack', 'tj-rail', 'tj-rcard']) expect(o).not.toContain(gone)
    expect(o).toMatch(/class="tj-hero is-notice is-folded is-foldable"/)
    expect(o).toContain('class="tj-hero__inline"')
    expect(o).not.toContain('tj-hero__body')
  })

  it('Expand all: every stop open, and the policy that decided draws every rule’s card, each open to the rows it read — none of them “the one on show”', () => {
    const o = journey(home, { fold: EXPAND })
    const { plan } = planOf(home)
    expect(cardsOf(o)).toEqual(plan.rules.map((r) => r.node))
    for (const r of plan.rules.filter((x) => x.index !== null)) expect(cardOf(o, r.node), r.node).toContain('bb__tbody')
    expect(railOf(o).every((c) => !c.pressed)).toBe(true)
    for (const n of ['which', 'decider'] as const) expect(stopOf(o, n)).toMatch(/^<div class="bb__card is-trace tj-pnode [^"]* is-open is-foldable"/)
    expect(journeySrc).toContain("every={!running && mode === 'expand'}")
  })

  it('each stop carries the builder’s fold control — the sign-in none, its pencil instead — and a folded stop opens on a press anywhere on it', () => {
    const open = journey(home)
    for (const what of ['the policies', 'the policy', 'the outcome']) expect(open).toContain(`aria-label="Fold ${what}"`)
    const folded = journey(home, { fold: COLLAPSE })
    for (const what of ['the policies', 'the policy', 'the outcome']) expect(folded).toContain(`aria-label="Show ${what}"`)
    for (const x of [open, folded]) expect(sentOf(x)).not.toContain('bb__fold__btn')
    expect(nodesSrc).toContain("const pressOpen = (open: boolean, onFold?: () => void) => (onFold && !open ? (e: MouseEvent) => (e.target as Element).closest?.('button, a') === null && onFold() : undefined)")
    expect(count(nodesSrc, 'onClick={pressOpen(open, onFold)}')).toBe(2)
  })

  it('the source: fold state from the dock and the presses, the canvas following the engine with one glide', () => {
    expect(journeySrc).toContain("const mode: FoldMode = running ? 'auto' : fold.mode")
    expect(journeySrc).toContain('setFolds({ plan: f.plan, seq: f.seq, nodes: { ...f.nodes, [k]: !f.nodeOpen(k) } })')
    expect(journeySrc).toContain('const run = tween(sc.scrollTop, to, {')
    expect(journeySrc).toContain('onWheel={stopGlide} onPointerDown={stopGlide}')
    expect(journeySrc).toContain('onFitRef.current(chain.offsetHeight)')
  })
})

/* Colour says what happened (owner, 30 Sep: "green or red or yellow"; 1 Oct:
   "here it's a match but Deny, so for the deny I think we should use red
   only"): the decided path wears the OUTCOME's colour end to end, blue only
   for the engine at work, a rule that did not match quiet but for its ✕. */
describe('colour: the decided path in the outcome’s colour, blue while working, a miss quiet, yellow can’t tell or conflict', () => {
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const trace = boardCss.slice(boardCss.indexOf('--- The trace: a card read by a sign-in test')).replace(/\/\*[\s\S]*?\*\//g, '')
  const body = (sheet: string, sel: string) => {
    const at = sheet.indexOf(`${sel} {`)
    return at < 0 ? '' : sheet.slice(at, sheet.indexOf('}', at))
  }
  const stageOf = (o: string) => o.match(/class="tj-stage [^"]*"/)?.[0] ?? ''

  it('one hue for the way the sign-in took, set on the stage: green by default, yellow, red, grey', () => {
    expect(rules).toMatch(/\.tj-stage \{[^}]*--tj-path-bg: var\(--fb-positive-bg\);\s*--tj-path-fg: var\(--fb-positive-fg\);\s*--tj-path-border: var\(--fb-positive-border\);\s*--tj-path-dot: var\(--fb-positive-dot\);/)
    expect(rules).toContain('.tj-stage.is-path-notice { --tj-path-bg: var(--fb-notice-bg); --tj-path-fg: var(--fb-notice-fg); --tj-path-border: var(--fb-notice-border); --tj-path-dot: var(--fb-notice-dot); }')
    expect(rules).toContain('.tj-stage.is-path-negative { --tj-path-bg: var(--fb-negative-bg); --tj-path-fg: var(--fb-negative-fg); --tj-path-border: var(--fb-negative-border); --tj-path-dot: var(--fb-negative-dot); }')
    expect(rules).toMatch(/\.tj-stage\.is-path-neutral \{[^}]*--tj-path-dot: var\(--border-strong\);/)
    /* The stage says which: the outcome's (journey.ts `pathTone`). */
    expect(stageOf(journey(arun))).toContain('is-path-positive')
    expect(stageOf(journey(home))).toContain('is-path-notice')
    expect(stageOf(journey(devon))).toContain('is-path-negative')
    expect(stageOf(journey(unstated))).toContain('is-path-notice')
  })

  it('the path wears it: Decides, the policy’s mark, the spine, the found ring, the scan’s Decides, the rail’s mark that matched; the rule that matched in its own decision’s tone — ring, Matched, the ✓ of its rows', () => {
    for (const sel of ['.tj-link__draw', '.tj-pol.is-decides', '.tj-pol.is-found', '.tj-light__ring', '.tj-route', '.bb__card .tj-pnode__mark', '.tj-rail__chip.is-match']) {
      const b = body(rules, sel)
      expect(b, sel).toContain('var(--tj-path-')
      expect(b, sel).not.toMatch(/--fb-(positive|negative|notice)/)
    }
    expect(rules).toMatch(/\.tj-pol__word \{[^}]*color: var\(--tj-path-fg\)/)
    expect(trace).toContain('.bb__tstate.is-decides { background: var(--tj-path-bg, var(--fb-positive-bg)); color: var(--tj-path-fg, var(--fb-positive-fg)); }')
    expect(trace).toMatch(/\.bb__card\.is-trace\.is-t-matched \{[^}]*border-color: var\(--tone-dot, var\(--fb-positive-dot\)\);[^}]*box-shadow: 0 0 0 var\(--bw-thin\) var\(--tone-dot, var\(--fb-positive-dot\)\)/)
    expect(trace).toContain('.bb__tstate.is-matched { background: var(--tone-bg, var(--fb-positive-bg)); color: var(--tone-fg, var(--fb-positive-fg)); }')
    expect(body(trace, '.bb__card.is-trace.is-t-matched .bb__tmark.is-pass')).toContain('var(--tone-fg, var(--fb-positive-fg))')
  })

  it('a Deny is red end to end — the rule that matched, Decides, the spine, the answer — and never green', () => {
    const o = journey(devon)
    expect(stageOf(o)).toContain('is-path-negative')
    /* The rule that matched is the last row, a Deny: its card is the deny tone. */
    expect(o).toMatch(/class="bb__card is-trace is-deny is-t-matched is-terminal[^"]*"/)
    expect(o).toMatch(/class="tj-hero is-negative /)
    expect(o).not.toMatch(/is-allow is-t-matched|is-mfa is-t-matched|tj-hero is-positive|is-path-positive/)
  })

  it('a rule that did not match is quiet: No match and its ✓ grey, its failing check’s ✕ the one red — on the card, its mark on the rail and the sign-in', () => {
    expect(trace).toMatch(/\.bb__tstate\.is-missed,\s*\.bb__tstate\.is-folded \{ background: var\(--fb-neutral-bg\); color: var\(--text-secondary\); \}/)
    expect(body(trace, '.bb__tmark.is-pass')).toContain('var(--text-secondary)')
    expect(body(trace, '.bb__tmark.is-fail')).toContain('var(--fb-negative-fg)')
    expect(trace).toMatch(/\.bb__card\.is-trace \.bb__tmiss \{[^}]*color: var\(--text-secondary\)/)
    expect(trace).toMatch(/\.bb__card\.is-trace \.bb__tmiss > svg \{[^}]*color: var\(--fb-negative-fg\)/)
    /* On the rail: the chip quiet, its ✕ the red. */
    expect(body(rules, '.tj-rail__chip')).toContain('color: var(--text-secondary)')
    expect(rules).toContain('.tj-rail__chip.is-miss .tj-rail__mark { color: var(--fb-negative-fg); }')
    expect(body(rules, '.tj-rail__chip.is-miss')).toBe('')
    expect(rules).toContain('.tj-sin2__tok.is-fail > .tj-sin2__mark { color: var(--fb-negative-fg); }')
    expect(body(rules, '.tj-sin2__tok.is-fail')).toBe('')
    /* The engine's done tick is not the path: grey. */
    expect(body(rules, '.tj-engine__done')).toContain('var(--text-secondary)')
  })

  it('amber: can’t tell, if not, and what would also apply — the rule’s card and mark, a policy’s flag, the answer’s strip', () => {
    expect(trace).toMatch(/\.bb__tstate\.is-unknown,\s*\.bb__tstate\.is-possible,\s*\.bb__tstate\.is-conflict \{ background: var\(--fb-notice-bg\); color: var\(--fb-notice-fg\); \}/)
    expect(body(rules, '.tj-conflict')).toContain('var(--fb-notice-bg)')
    expect(rules).toMatch(/\.tj-rail__chip\.is-unknown,\s*\.tj-rail__chip\.is-conflict \{ border-color: var\(--fb-notice-border\); background: var\(--fb-notice-bg\); color: var\(--fb-notice-fg\); \}/)
    expect(body(rules, '.tj-pol__flag.is-conflict')).toContain('var(--fb-notice-fg)')
    expect(body(rules, '.tj-pnode__scan > .tj-pol.has-flag.is-conflict')).toContain('var(--fb-notice-bg)')
    /* The strip is the notice tone; only worth knowing, it is the neutral one. */
    expect(body(rules, '.tj-hero__strip')).toMatch(/border: var\(--bw-thin\) solid var\(--fb-notice-border\);[\s\S]*background: var\(--fb-notice-bg\);/)
    expect(body(rules, '.tj-hero__strip.is-info')).toContain('var(--fb-neutral-bg)')
    /* The pulses are the notice's dot. */
    for (const sel of ['.tj-pol__pulse', '.tj-rail__pulse', '.tj-hero__spulse']) expect(body(rules, sel), sel).toContain('solid var(--fb-notice-dot)')
  })

  it('blue only for the engine at work: the row being read, Checking, the spinner, the scan, the rail’s mark being read — nothing that has settled', () => {
    expect(trace).toMatch(/\.bb__tstate\.is-reading \{ background: var\(--accent-soft\); color: var\(--accent-strong\); \}/)
    expect(body(trace, '.bb__card.is-trace.is-active')).toContain('var(--accent-soft-border)')
    expect(body(rules, '.tj-rail__chip.is-reading')).toContain('var(--accent-soft)')
    /* Nothing settled — matched, decides, a mark, the lit way, the found ring — wears the accent. */
    for (const sel of ['.bb__card.is-trace.is-t-matched', '.bb__tmark.is-pass', '.tj-link__draw', '.tj-pol.is-decides', '.tj-pol.is-found', '.tj-light__ring', '.tj-route', '.tj-r__rail.is-lit', '.tj-rail__chip.is-match']) {
      const b = body(sel.startsWith('.bb__') ? trace : rules, sel)
      expect(b, sel).not.toBe('')
      expect(b, sel).not.toMatch(/var\(--accent/)
    }
    /* The builder's fold wears no blue tint on the trace. */
    expect(trace).toMatch(/\.bb__card\.is-trace \.bb__fold__btn,\s*\.bb__card\.is-trace \.bb__fold__btn\.is-open \{ background: none; color: var\(--text-tertiary\); \}/)
  })

  it('the scrollbar: thin, a muted thumb on no track, its room kept so the column never moves', () => {
    expect(rules).toMatch(/\.tj-scroll \{\s*scrollbar-width: thin;\s*scrollbar-color: color-mix\(in srgb, var\(--text-tertiary\) 40%, transparent\) transparent;\s*scrollbar-gutter: stable;\s*\}/)
  })
})

/* Nothing on the run drawn over anything else (owner, 1 Oct 2026: "some
   icons are overlapping"): measured in the browser, these were the three. */
describe('nothing overlaps', () => {
  it('the policy that decided: Open policy and the fold in ONE trail, side by side — never two trails in one cell', () => {
    const head = stopOf(journey(saved('ssi-maya-aws')), 'decider')
    const cardhead = head.slice(0, head.indexOf('class="tj-decider"'))
    expect([...cardhead.matchAll(/class="bb__cardmeta"/g)]).toHaveLength(1)
    const meta = cardhead.slice(cardhead.indexOf('class="bb__cardmeta"'))
    expect(meta.indexOf('tj-decider__open')).toBeGreaterThan(-1)
    expect(meta.indexOf('tj-decider__open')).toBeLessThan(meta.indexOf('bb__fold__btn'))
  })

  it('a rule’s groups sit side by side — a square mark’s ring no longer cuts the letters of the one before it', () => {
    expect(kitCss).toMatch(/\.bx-faces > \.bx-tip:has\(\.bx-face\.is-group\) \+ \.bx-tip,\s*\.bx-faces > \.bx-tip \+ \.bx-tip:has\(\.bx-face\.is-group\) \{ margin-left: var\(--space-1\); \}/)
  })

  it('the Identity row: the face alone once chosen, not the kind’s mark beside it', () => {
    expect(identSrc).toContain('{!chosen && (')
  })
})
